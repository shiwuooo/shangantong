/* 上岸通 · 主交互 */
(function () {
  'use strict';

  // 纯本地模式，不含 Supabase

  // ===========================
  // 全局状态
  // ===========================
  const STORAGE_KEY = 'shangAnTong_v1';
  const SESSION_KEY = 'sat_practice_session_v1';

  // 错因三维之「结果类型 R」：区分"真会 / 蒙对 / 真错"，是诊断的地基
  // R1 对 / R2 对但超时 / R3 蒙对 / R4 错(快,知识缺口) / R5 错(慢,耗时仍错) / R6 蒙错
  const SLOW_MS = { changshi: 20000, yanyu: 60000, shuliang: 90000, panduan: 70000, ziliao: 90000, shenlun: 120000 };

  const State = {
    history: [],         // [{id, module, correct, ts}]  兼容旧统计
    attempts: [],        // [{id, module, selected, correct, ms, guess, code, ts, paper}]  诊断用
    mistakes: [],        // [id]
    favorites: [],       // [id]
    days: {},            // { 'YYYY-MM-DD': count }
    streak: 0,
    lastVisit: null,
    examScore: null,
  };

  // 作答过程数据（逐题计时 / 蒙题标记）
  let practiceQStart = 0;
  let practiceGuess = false;
  let qTimerId = null;
  var practiceQElapsed = {};   // qid → 累计秒数（切题时不丢失，对齐粉笔）
  const examStartMap = {};   // qid -> 开始时间戳
  let examGuess = false;

  function classify(correct, guess, ms, module) {
    const slow = ms > (SLOW_MS[module] || 60000);
    if (correct && !guess && !slow) return 'R1';
    if (correct && !guess && slow) return 'R2';
    if (correct && guess) return 'R3';           // 蒙对
    if (!correct && !guess && !slow) return 'R4';
    if (!correct && !guess && slow) return 'R5';
    return 'R6';                                 // 蒙错
  }

  function loadState() {
    try {
      const raw = window.Store ? window.Store.get(STORAGE_KEY) : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw) Object.assign(State, raw);
    } catch (e) {}
    if (!State.attempts) State.attempts = [];
    if (!State.history) State.history = [];
    // 连续打卡计算
    State.streak = computeStreak();
  }
  function saveState() {
    try {
      if (window.Store) window.Store.set(STORAGE_KEY, State);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(State));
    } catch (e) {}
  }

  // ===========================
  // 练习会话持久化（断点续做）
  // ===========================
  function savePracticeSession() {
    try {
      if (!practiceList || !practiceList.length) { localStorage.removeItem(SESSION_KEY); return; }
      const q = practiceList[practiceIdx];
      const payload = {
        listIds: practiceList.map(x => x.id),
        idx: practiceIdx,
        answers: practiceAnswers,
        checked: practiceChecked,
        marked: practiceMarked,
        revealed: window.practiceRevealed || {},
        qElapsed: practiceQElapsed,          // 累积计时（切题不丢）
        config: {
          timed: window._spTimed,
          showAnswer: window._spShowAnswer,
          module: currentModule,
          filterState: JSON.parse(JSON.stringify(window.FilterState || {})),
          source: location.hash
        },
        startTs: (window._practiceStartTs || Date.now()),
        qStart: practiceQStart,
        ts: Date.now()
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) { console.error('[session] save fail', e); }
  }
  function loadPracticeSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearPracticeSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function restorePracticeSession(sess) {
    if (!sess || !sess.listIds || !sess.listIds.length) return false;
    const idMap = {};
    Object.keys(window.QB || {}).forEach(function (m) {
      (window.QB[m] || []).forEach(function (q) { if (q && q.id) idMap[q.id] = q; });
    });
    const restored = sess.listIds.map(function (id) {
      const q = idMap[id];
      if (!q) return null;
      const copy = Object.assign({}, q);
      // 恢复模块标记（专项练习灌入的 _module 可能丢失，重新推断）
      copy._module = q._module || (function () {
        for (const mk of Object.keys(window.QB || {})) { if ((window.QB[mk] || []).includes(q)) return mk; }
        return sess.config && sess.config.module;
      })();
      return copy;
    }).filter(Boolean);
    if (!restored.length) return false;
    practiceList = restored;
    practiceIdx = Math.min(Math.max(0, sess.idx || 0), restored.length - 1);
    practiceAnswers = sess.answers || {};
    practiceChecked = sess.checked || {};
    practiceMarked = sess.marked || {};
    window.practiceRevealed = sess.revealed || {};
    practiceQElapsed = sess.qElapsed || {};   // 恢复累积计时
    window._spTimed = sess.config && sess.config.timed !== false;
    window._spShowAnswer = !!(sess.config && sess.config.showAnswer);
    if (sess.config && sess.config.module) currentModule = sess.config.module;
    if (sess.config && sess.config.filterState) window.FilterState = sess.config.filterState;
    window._practiceStartTs = sess.startTs || Date.now();
    practiceQStart = sess.qStart || Date.now();
    return true;
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function computeStreak() {
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      if ((State.days[k] || 0) > 0) streak++;
      else break;
    }
    return streak;
  }

  // ===========================
  // 工具函数
  // ===========================
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function getModuleList(mod) {
    if (mod === 'all' || !mod) {
      return [].concat(...Object.keys(window.QB).map(k => window.QB[k]));
    }
    return window.QB[mod] || [];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  window.shuffle = shuffle;  // 供 applyFilter 等内部模块调用

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
  }

  function toast(msg, ms = 1500) {
    let t = $('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // 逐题实时计时（练习模式 · 累积式：切题不重置，对齐粉笔）
  function saveCurrentQElapsed() {
    // 把当前题已花时间存入累积 map
    if (practiceQStart && practiceList.length > 0) {
      const q = practiceList[practiceIdx];
      if (q) {
        const added = Math.floor((Date.now() - practiceQStart) / 1000);
        if (added > 0) {
          practiceQElapsed[q.id] = (practiceQElapsed[q.id] || 0) + added;
        }
      }
    }
  }
  function getQElapsed(qid) {
    // 返回某题累积秒数 + 本次停留增量
    var base = practiceQElapsed[qid] || 0;
    if (practiceQStart) base += Math.floor((Date.now() - practiceQStart) / 1000);
    return base;
  }
  function startQTimer() {
    if (qTimerId) clearInterval(qTimerId);
    const el = $('#qTimer');
    const q = practiceList[practiceIdx];
    // 从累积 map 取底数，显示总用时
    if (el && q) el.textContent = fmtTime(practiceQElapsed[q.id] || 0);
    else if (el) el.textContent = '00:00';
    qTimerId = setInterval(function () {
      if (!practiceQStart) return;
      const q2 = practiceList[practiceIdx];
      if (!q2) return;
      const s = getQElapsed(q2.id);
      if (el) el.textContent = fmtTime(s);
    }, 500);
  }
  function stopQTimer() { if (qTimerId) { clearInterval(qTimerId); qTimerId = null; } }

  // ===========================
  // 页面路由
  // ===========================
  // 解析 #page&k=v&k2=v2 形式的哈希参数
  function parseHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    var parts = raw.split(/[?&]/);
    var name = parts[0] || 'home';
    var params = {};
    for (var i = 1; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      var k = eq === -1 ? parts[i] : parts[i].slice(0, eq);
      var v = eq === -1 ? '' : parts[i].slice(eq + 1);
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return { name: name || 'home', params: params };
  }

  // 合并后的规范页切换内部子视图（Tab / 模式）
  function switchSegInPage(pageEl, tab) {
    if (!pageEl) return;
    pageEl.querySelectorAll('.seg-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab || b.getAttribute('data-mode') === tab);
    });
    pageEl.querySelectorAll('.seg-panel').forEach(function (p) {
      p.classList.toggle('hidden', p.getAttribute('data-panel') !== tab);
    });
  }

  function showPage(name, params) {
    if (!name) { var ph = parseHash(); name = ph.name; params = ph.params; }
    params = params || {};
    // 旧深链别名 → 合并后的规范页 + 子视图参数（保证历史链接/书签不失效）
    if (name === 'exam') { name = 'papers'; params.mode = params.mode || 'exam'; }
    else if (name === 'modules') { name = 'special'; }
    else if (name === 'speed') { name = 'method'; params.tab = params.tab || 'speed'; }
    else if (name === 'tips') { name = 'method'; params.tab = params.tab || 'tips'; }
    else if (name === 'dashboard') { name = 'stats'; params.tab = params.tab || 'dashboard'; }
    else if (name === 'diagnosis') { name = 'stats'; params.tab = params.tab || 'diagnosis'; }
    else if (name === 'coach') { name = 'stats'; params.tab = params.tab || 'coach'; }
    else if (name === 'training') { name = 'mistakes'; params.tab = params.tab || 'training'; }

    name = String(name || 'home').split(/[?&#]/)[0];
    if (!/^[a-zA-Z-]+$/.test(name) || !document.getElementById('page-' + name)) name = 'home';

    $$('.page').forEach(function (p) { p.classList.add('hidden'); });
    var target = $('#page-' + name);
    if (target) target.classList.remove('hidden');
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.go === name); });

    if (name === 'home') renderHome();
    if (name === 'practice') renderPractice();
    if (name === 'papers') renderPapers(params);
    if (name === 'mock') renderMock();
    if (name === 'mistakes') renderMistakes(params);
    if (name === 'favorites') renderFavorites();
    if (name === 'stats') renderStats(params);
    if (name === 'method') renderMethod(params);
    if (name === 'freq') renderFreq();
    if (name === 'special') { if (window.renderSpecial) window.renderSpecial(); }
    if (name === 'tactics') renderTactics();
    if (name === 'experience') renderExperience();
    if (name === 'search') renderSearch();
    if (name === 'paper-structure') renderPaperStructure();

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ===========================
  // 首页
  // ===========================
  function renderHome() {
    // 倒计时（设定为下一个国考公共科目笔试 11/30）
    const target = nextExamDate();
    const now = new Date();
    const diff = Math.floor((target - now) / 1000);
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const sec = diff % 60;
    $('#countdown').textContent = `${d}天 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;

    // 今日刷题
    const tk = todayKey();
    const todayCount = State.days[tk] || 0;
    $('#todayCount').textContent = todayCount;
    const goal = 30;
    const pct = Math.min(100, Math.round(todayCount / goal * 100));
    const dashLen = 213.6;
    $('#ringFg').style.strokeDashoffset = dashLen * (1 - pct / 100);

    // 连续打卡
    State.streak = computeStreak();
    $('#streakDays').textContent = State.streak;

    // 教练横幅一句话（随每次作答更新）
    if (window.Coach) {
      const sub = $('#coachBannerSub');
      if (sub) {
        const g = window.Coach.greet();
        sub.textContent = g.length > 42 ? g.slice(0, 40) + '…' : g;
      }
    }

    // 真题套卷库 banner 数字动态化（不写死）
    const papers = window.BANK_PAPERS || [];
    const gk = papers.filter(p => p.volume === '行测' && p.id.startsWith('gk-')).length;
    const prov = papers.filter(p => p.volume === '行测' && !p.id.startsWith('gk-')).length;
    const pbSub = $('#papersBannerSub');
    if (pbSub) pbSub.textContent = `国考 ${gk} 套 · 省考 ${prov} 套 · 一套一套刷`;

    // 模块统计
    const totals = { zhengzhi: 0, changshi: 0, yanyu: 0, shuliang: 0, panduan: 0, ziliao: 0, shenlun: 0 };
    State.history.forEach(h => {
      if (h.module && totals[h.module] !== undefined) totals[h.module]++;
    });
    Object.keys(totals).forEach(k => {
      const el = $('#s-' + k);
      if (el) el.textContent = totals[k];
    });

    // 错题、收藏数
    $('#mistakeCount').textContent = State.mistakes.length + ' 道';
    $('#favCount').textContent = State.favorites.length + ' 道';

    // 题库总数
    $('#totalQuestions').textContent = window.QB_STATS.total;

    // 7 天柱图
    renderWeekChart();
  }

  function nextExamDate() {
    const now = new Date();
    const year = now.getFullYear();
    // 设定为 11 月 28 日
    let target = new Date(year, 10, 28, 9, 0, 0);
    if (target < now) target = new Date(year + 1, 10, 28, 9, 0, 0);
    return target;
  }

  function renderWeekChart() {
    const chart = $('#weekChart');
    chart.innerHTML = '';
    const days = [];
    const labels = ['日','一','二','三','四','五','六'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      days.push({ k, count: State.days[k] || 0, isToday: i === 0 });
    }
    const max = Math.max(...days.map(d => d.count), 10);
    days.forEach(d => {
      const wrap = document.createElement('div');
      wrap.className = 'bar' + (d.isToday ? ' today' : '');
      const bar = document.createElement('div');
      bar.className = 'b';
      bar.style.height = (Math.max(2, (d.count / max) * 70)) + 'px';
      const num = document.createElement('div');
      num.className = 'n';
      num.textContent = d.count;
      const lab = document.createElement('div');
      lab.className = 'l';
      lab.textContent = '今';
      if (!d.isToday) {
        const dd = new Date();
        dd.setDate(dd.getDate() - days.indexOf(d));
        lab.textContent = labels[dd.getDay()];
      }
      wrap.appendChild(bar);
      wrap.appendChild(num);
      wrap.appendChild(lab);
      chart.appendChild(wrap);
    });
  }

  // ===========================
  // 刷题模式（v2 · 带筛选）
  // ===========================
  let practiceList = [];
  let practiceIdx = 0;
  let practiceAnswers = {}; // {id: idx}
  let practiceChecked = {}; // {id: true}
  window.practiceRevealed = {}; // {id: true} — 用户主动查看过正解/解析的题（返回时不自动展答案）
  let practiceMarked = {};    // {id: true} — 标记的题（答题卡高亮）
  let practiceSubmitted = false; // 是否已交卷（交卷后回顾模式：逐题自动展示正解）
  let currentModule = 'panduan';
  let pendingSingle = null; // 指定单题进入刷题页（搜题/错题重做/收藏再练），避免被筛选覆盖

  function renderPractice() {
    // 练习配置默认值（专项练习会通过 pendingPracticeConfig 覆盖）
    window._spTimed = true;
    window._spShowAnswer = false;
    // 进入刷题页时整体重置筛选状态，避免上一次导航遗留的 topics/keypoints 串味导致「0题」
    window.FilterState = { years: [], yearRange: null, examTypes: [], topics: [], modules: [], examVolume: [], fullPaper: null, source: null, rangeN: null, _preset: null, difficulty: [], keypoints: [], kw: null, limit: null };

    // 断点续做：非特定任务进入时询问是否继续上次练习
    const hasSpecificTask = pendingSingle || (window.pendingList && window.pendingList.length);
    if (!hasSpecificTask) {
      const sess = loadPracticeSession();
      if (sess && sess.listIds && sess.listIds.length) {
        const done = Object.keys(sess.checked || {}).length;
        const total = sess.listIds.length;
        if (done < total) {
          if (confirm('你有未完成的练习（' + done + '/' + total + '题），是否继续？\n点"取消"将开始新练习。')) {
            if (restorePracticeSession(sess)) {
              renderFilterPanel();
              showQuestion();
              return;
            }
          } else {
            clearPracticeSession();
          }
        } else {
          clearPracticeSession();
        }
      }
    }

    // 指定单题优先，跳过筛选重建
    if (pendingSingle) {
      const one = pendingSingle;
      pendingSingle = null;
      practiceList = [one];
      practiceIdx = 0;
      practiceAnswers = {}; practiceChecked = {}; window.practiceRevealed = {}; practiceMarked = {};
      window._practiceStartTs = Date.now();
      renderFilterPanel();
      showQuestion();
      return;
    }
    // 指定题列（薄弱智能推题 / 专项去练习 通过 window.pendingList 灌入）
    if (window.pendingList && window.pendingList.length) {
      const arr = window.pendingList;
      window.pendingList = null;
      const spc = window.pendingPracticeConfig || {};
      window.pendingPracticeConfig = null;
      // 清空筛选，避免上一次刷题的筛选条件残留到专项练习会话
      const FS = window.FilterState;
      FS.years = []; FS.yearRange = null; FS.examTypes = []; FS.topics = [];
      FS.modules = []; FS.examVolume = []; FS.fullPaper = null; FS.source = null;
      FS.rangeN = null; FS._preset = null; FS.difficulty = []; FS.keypoints = [];
      FS.kw = null; FS.limit = null;
      if (arr.length && arr[0]._module) currentModule = arr[0]._module;
      else if (arr.length) { const f = (typeof findModuleOf === 'function') ? findModuleOf(arr[0]) : null; if (f) currentModule = f; }
      // 顺序练习 / 随机练习
      practiceList = (spc.shuffle === false) ? arr.slice() : window.shuffle(arr);
      // 题量上限
      if (spc.limit && spc.limit > 0) practiceList = practiceList.slice(0, Math.min(spc.limit, practiceList.length));
      // 练习配置：显示答案 / 计时（供 selectPractice / showQuestion 读取）
      window._spShowAnswer = !!spc.showAnswer;
      window._spTimed = spc.timed !== false;
      practiceIdx = 0; practiceAnswers = {}; practiceChecked = {}; window.practiceRevealed = {}; practiceMarked = {};
      practiceSubmitted = false;
      renderFilterPanel();
      showQuestion();
      return;
    }
    const hash = (location.hash || '').replace('#', '');
    // 兼容 practice&module=xxx / practice?module=xxx
    const params = new URLSearchParams(hash.split(/[?&]/).slice(1).join('&'));
    const mod = params.get('module');
    // 支持 #practice&module=changshi&topic=cs-zz-mzt,cs-zz-ds 直达专项
    const topicParam = params.get('topic');
    if (topicParam) window.FilterState.topics = topicParam.split(',').filter(Boolean);
    // 支持 #practice&module=panduan&topic=pd-ljpd&exam=gk-fsheng 按卷型开刷（卷型结构页点击进入）
    const examParam = params.get('exam');
    if (examParam) window.FilterState.examTypes = examParam.split(',').filter(Boolean);
    // 支持 #practice&module=panduan&keypoint=逻辑关系-对应关系,削弱论点 直接进分板块
    const kpParam = params.get('keypoint');
    if (kpParam) {
      window.FilterState.keypoints = kpParam.split(',').filter(Boolean);
      window.FilterState.difficulty = []; // keypoint 直接锁窄：清空难度避免空白
      window.FilterState.source = null;
    }
    // 支持 #practice&kw=尾数法 关键词搜索（技巧库反向跳刷题传入）
    const kwParam = params.get('kw');
    window.FilterState.kw = kwParam ? kwParam : null;
    // 支持 #practice&module=xxx&count=12 由教练「一键开练」传入的题量上限
    const countParam = params.get('count');
    window.FilterState.limit = (countParam != null && /^\d+$/.test(countParam))
      ? Math.max(1, parseInt(countParam, 10)) : null;
    if (mod && window.QB[mod]) {
      currentModule = mod;
      window.FilterState.modules = [mod];
    } else if (window.FilterState.modules.length === 0) {
      // 从"刷题"tab 进入且未限定模块时，默认当前模块（预设会显式置空以跨模块）
      window.FilterState.modules = [currentModule];
    }

    try {
      renderFilterPanel();
      applyFilter();
    } catch (e) {
      console.error('[刷题] 渲染失败:', e);
      renderEmptyPractice('筛选渲染出错：' + (e && e.message ? e.message : e) + '（请清除筛选或返回首页）');
    }
  }

  function renderEmptyPractice(msg) {
    var st = $('#qStem');
    if (st) st.textContent = msg || '暂无题目';
    var wrap = $('#qOptions'); if (wrap) wrap.innerHTML = '';
    var ans = $('#qAnswer'); if (ans) ans.classList.add('hidden');
    var mat = $('#qMaterial'); if (mat) mat.style.display = 'none';
    var idx = $('#pIndex'); if (idx) idx.textContent = '0';
    var tot = $('#pTotal'); if (tot) tot.textContent = '0';
    var bar = $('#pBar'); if (bar) bar.style.width = '0%';
  }

  // ===========================
  // 筛选面板
  // ===========================
  function renderFilterPanel() {
    // 模块（空 = 全部，支持跨模块预设）
    const modNames = { changshi:'常识', yanyu:'言语', shuliang:'数量', panduan:'判断', ziliao:'资料', shenlun:'申论' };
    renderTags('fpModules', Object.keys(modNames), window.FilterState.modules, id => modNames[id], ids => {
      window.FilterState.modules = ids;
      currentModule = ids[0] || currentModule;
      renderFilterPanel();
    });

    // 考点：始终用粉笔完整考点树（行测全模块 4 级嵌套）。
    // 树结构来自 FENBI_TREE（脚本同步加载，立即可用），不依赖 FenbiKP.ready；
    // 本地题量(localCount)需要 FenbiKP 构建，best-effort，失败也不影响树渲染。
    if (window.FENBI_TREE) {
      try { if (window.FenbiKP && !window.FenbiKP.ready) window.FenbiKP.build(); } catch (e) { /* 本地题量暂不可用 */ }
      renderFenbiKeypointTree();
    } else {
      // 旧兜底：扁平二级列表（仅当考点树数据缺失时）
      let topics = [];
      (window.FilterState.modules.length === 1 ? window.FilterState.modules : Object.keys(window.QB)).forEach(m => {
        (window.TOPICS[m] || []).forEach(t => topics.push(t));
      });
      topics = topics.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
      renderTags('fpTopics', topics, window.FilterState.topics, t => t.name, ids => {
        window.FilterState.topics = ids;
      }, topics.length);
      renderTopicGroups(topics);
    }

    // 年份
    const years = window.getAvailableYears();
    renderTags('fpYears', years, window.FilterState.years, y => y + '', ids => {
      window.FilterState.years = ids;
      window.FilterState.yearRange = null; // 手动选年份则取消"近N年"区间
      window.FilterState.rangeN = null;
    });

    // 考试类型
    renderTags('fpExams', window.EXAM_TYPES, window.FilterState.examTypes, e => e.name, ids => {
      window.FilterState.examTypes = ids;
    });

    // 卷型
    renderTags('fpVolume', ['行测','申论'], window.FilterState.examVolume, v => v, ids => {
      window.FilterState.examVolume = ids;
    });

    // 套卷列表
    const sel = $('#fpPaper');
    sel.innerHTML = '<option value="">— 不限定套卷 —</option>';
    window.FULL_PAPERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label + ' (' + p.count + '题)';
      if (window.FilterState.fullPaper === p.id) opt.selected = true;
      sel.appendChild(opt);
    });

    // 难度（个人正确率反推）：5 档
    if (window.Difficulty) {
      const dLabels = window.Difficulty.LABELS;
      const dItems = window.Difficulty.BUCKETS.map(function (b) { return { id: b, name: dLabels[b] }; });
      renderTags('fpDifficulty', dItems, window.FilterState.difficulty, function (t) { return t.name; }, function (ids) {
        window.FilterState.difficulty = ids;
      });
    }

    // 关键词搜索框
    const fpKw = $('#fpKw');
    if (fpKw) {
      fpKw.value = window.FilterState.kw || '';
      fpKw.oninput = function () {
        window.FilterState.kw = fpKw.value.trim();
        updateFilterCount();
        applyFilter();
      };
    }

    // 结果预览
    renderFilterExtras();
    // 难度（个人正确率反推）筛选：刷新统计，保证计数/筛选反映最新作答
    if (window.Difficulty) window.Difficulty.refresh();
    updateFilterCount();
  }

  // 场景预设 / 时间快捷 / 来源 的高亮同步
  function renderFilterExtras() {
    $$('#fpPresets .fp-tag').forEach(t => t.classList.toggle('active', window.FilterState._preset === t.dataset.preset));
    $$('#fpYearRange .fp-tag').forEach(t => t.classList.toggle('active', String(window.FilterState.rangeN) === t.dataset.range));
    $$('#fpSource .fp-tag').forEach(t => t.classList.toggle('active', (window.FilterState.source || 'all') === t.dataset.src));
  }

  // 一键场景预设（对应用户提出的 5 个典型刷题需求）
  function applyPreset(name) {
    const gk3 = ['gk-fsheng', 'gk-dishi', 'gk-xzf'];
    const reset = () => {
      window.FilterState.years = [];
      window.FilterState.yearRange = null;
      window.FilterState.examTypes = [];
      window.FilterState.topics = [];
      window.FilterState.modules = [];
      window.FilterState.examVolume = [];
      window.FilterState.fullPaper = null;
      window.FilterState.source = null;
      window.FilterState.rangeN = null;
      window.FilterState.limit = null; // 清除教练「一键开练」的题量上限
    };
    reset();
    window.FilterState._preset = name;

    if (name === 'gk-jqxr-5') {
      window.FilterState.examTypes = gk3.slice();
      window.FilterState.topics = ['pd-jqxr'];
      window.FilterState.yearRange = window.nearYears(5);
      window.FilterState.rangeN = 5;
    } else if (name === 'gk-dishi-2016') {
      window.FilterState.examTypes = ['gk-dishi'];
      window.FilterState.years = [2016];
    } else if (name === 'gk-txtl-5') {
      window.FilterState.examTypes = gk3.slice();
      window.FilterState.topics = ['pd-txtl'];
      window.FilterState.yearRange = window.nearYears(5);
      window.FilterState.rangeN = 5;
    } else if (name === 'hlj-plzh-5') {
      window.FilterState.examTypes = ['hlj'];
      window.FilterState.modules = ['shuliang'];
      window.FilterState.topics = ['sl-plzh'];
      window.FilterState.yearRange = window.nearYears(5);
      window.FilterState.rangeN = 5;
    } else if (name === 'gk-yjpx-10') {
      window.FilterState.examTypes = gk3.slice();
      window.FilterState.topics = ['yy-yjpx'];
      window.FilterState.yearRange = window.nearYears(10);
      window.FilterState.rangeN = 10;
    }
    renderFilterPanel();
    applyFilter();
  }

  /**
   * 考点分组快捷键：TOPICS 里带 group 的考点（如政治理论 4 个子类）
   * 渲染成一个「全选/取消」的分组按钮，方便一键刷整块。
   */
  function renderTopicGroups(topics) {
    const wrap = $('#fpTopics');
    if (!wrap) return;
    const groups = {};
    topics.forEach(t => { if (t.group) (groups[t.group] = groups[t.group] || []).push(t.id); });
    const names = Object.keys(groups);
    if (!names.length) return;

    const bar = document.createElement('div');
    bar.className = 'fp-groupbar';
    names.forEach(name => {
      const ids = groups[name];
      const allOn = ids.every(id => window.FilterState.topics.includes(id));
      const btn = document.createElement('span');
      btn.className = 'fp-group' + (allOn ? ' active' : '');
      btn.textContent = (allOn ? '✓ ' : '') + name + ' (' + ids.length + '类)';
      btn.onclick = () => {
        window.FilterState.topics = allOn
          ? window.FilterState.topics.filter(id => !ids.includes(id))
          : Array.from(new Set(window.FilterState.topics.concat(ids)));
        renderFilterPanel();
      };
      bar.appendChild(btn);
    });
    wrap.parentNode.insertBefore(bar, wrap);
  }

  // ── 粉笔式层级考点树（刷题筛选面板用）──
  // 按 FENBI_TREE 渲染可折叠嵌套节点，点击选中/取消写入 FilterState.keypoints
  function renderFenbiKeypointTree() {
    const wrap = $('#fpTopics');
    if (!wrap) return;
    wrap.innerHTML = '';
    // 清掉旧的分组条
    const prevBar = wrap.parentNode && wrap.parentNode.querySelector('.fp-groupbar');
    if (prevBar) prevBar.remove();

    // 确定要展示的模块子树
    const mods = window.FilterState.modules.length ? window.FilterState.modules : Object.keys(window.QB);
    const modKeyMap = { changshi:'常识判断', yanyu:'言语理解与表达', shuliang:'数量关系', panduan:'判断推理', ziliao:'资料分析', shenlun:'申论', zhengzhi:'政治理论' };
    const tree = window.FENBI_TREE || [];
    // 按模块名找到顶层节点
    const selected = window.FilterState.keypoints || [];

    function toggleKp(name, isOn) {
      var next;
      if (isOn) {
        next = selected.filter(function (s) { return s !== name; });
      } else {
        next = selected.concat([name]);
      }
      window.FilterState.keypoints = next;
      renderFilterPanel();
    }

    function nodeHtml(node, depth) {
      var pk = (node._pathKey || '');
      var name = node.name;
      var fbCount = node.count || 0;
      var localCount = pk && window.FenbiKP ? window.FenbiKP.localCount(pk) : 0;
      var hasKids = !!(node.children && node.children.length);
      var isOn = selected.some(function (s) { return name === s || name.indexOf(s) >= 0 || s.indexOf(name) >= 0; });

      var div = document.createElement('div');
      div.className = 'fkt-node' + (hasKids ? ' has-kids' : '') + (depth === 0 ? ' fkt-root' : '');

      // 行：折叠柄 + 名 + 题量 + 选中态
      var row = document.createElement('div');
      row.className = 'fkt-row' + (isOn ? ' active' : '');

      if (hasKids) {
        var caret = document.createElement('span');
        caret.className = 'fkt-caret'; // ▶ 默认展开
        caret.textContent = '▾';
        caret.onclick = function (e) { e.stopPropagation(); div.classList.toggle('collapsed'); caret.textContent = div.classList.contains('collapsed') ? '▸' : '▾'; };
        row.appendChild(caret);
      } else {
        var dot = document.createElement('span');
        dot.className = 'fkt-dot';
        row.appendChild(dot);
      }

      var label = document.createElement('span');
      label.className = 'fkt-label';
      label.textContent = name;
      label.onclick = function () { toggleKp(name, isOn); };
      row.appendChild(label);

      var badge = document.createElement('span');
      badge.className = 'fkt-badge' + (localCount > 0 ? '' : ' empty');
      badge.textContent = localCount > 0 ? localCount : (fbCount || '-');
      badge.title = localCount > 0 ? ('本地 ' + localCount + ' 题') : ('粉笔官方 ' + fbCount + ' 题（本地暂无）');
      row.appendChild(badge);

      div.appendChild(row);

      // 子节点容器
      if (hasKids) {
        var kids = document.createElement('div');
        kids.className = 'fkt-children';
        node.children.forEach(function (c) { kids.appendChild(nodeHtml(c, depth + 1)); });
        div.appendChild(kids);
      }
      return div;
    }

    // 多模块时按模块分组渲染
    mods.forEach(function (mod) {
      var modName = modKeyMap[mod];
      var topNode = tree.find(function (n) { return n.name === modName; });
      if (!topNode) return;

      // 给每个节点挂 _pathKey（复用 FenbiKP 的 pathKey 格式）
      function attachPath(n, parentPk) {
        n._pathKey = parentPk ? (parentPk + ' / ' + n.name) : n.name;
        if (n.children) n.children.forEach(function (c) { attachPath(c, n._pathKey); });
      }
      attachPath(topNode, null);

      var group = document.createElement('div');
      group.className = 'fkt-module-group';
      group.appendChild(nodeHtml(topNode, 0));
      wrap.appendChild(group);
    });
  }

  function renderTags(containerId, items, selected, labelFn, onChange, maxOverride) {
    const wrap = $('#' + containerId);
    wrap.innerHTML = '';
    // 同容器重渲染时清掉上一次插入的分组条，避免重复堆叠
    const prevBar = wrap.parentNode && wrap.parentNode.querySelector('.fp-groupbar');
    if (prevBar) prevBar.remove();
    const maxShow = maxOverride || 12;

    items.slice(0, maxShow).forEach(item => {
      const id = typeof item === 'string' || typeof item === 'number' ? item : item.id;
      const label = typeof labelFn === 'function' ? labelFn(item) : item;
      const active = selected.includes(id);
      const tag = document.createElement('span');
      tag.className = 'fp-tag' + (active ? ' active' : '');
      tag.textContent = label;
      tag.onclick = () => {
        const next = active ? selected.filter(s => s !== id) : [...selected, id];
        onChange(next);
        renderFilterPanel();
      };
      wrap.appendChild(tag);
    });
  }

  function updateFilterCount() {
    const list = window.filterQuestions();
    $('#fpResult').textContent = '共 ' + list.length + ' 题';
  }

  function applyFilter() {
    try {
      window.FilterState.fullPaper = $('#fpPaper').value || null;
      practiceList = window.shuffle(window.filterQuestions());
      // 教练「一键开练」传入的题量上限（清除/手动筛选时由 clearFilters 复位）
      if (window.FilterState.limit && window.FilterState.limit > 0) {
        practiceList = practiceList.slice(0, window.FilterState.limit);
      }
      practiceIdx = 0;
      practiceAnswers = {}; practiceChecked = {}; window.practiceRevealed = {}; practiceMarked = {};
      practiceSubmitted = false; // 新筛选/新练习重置交卷状态
      window._practiceStartTs = Date.now();
      savePracticeSession();
      if (!practiceList.length) {
        renderEmptyPractice('筛选结果为空，请点击「清除」调整条件');
        return;
      }
      showQuestion();
      closeFilterPanel(); // 应用后自动关闭弹窗
    } catch (e) {
      console.error('[刷题] 应用筛选失败:', e);
      renderEmptyPractice('筛选出错：' + (e && e.message ? e.message : e));
    }
  }

  function showQuestion() {
    const q = practiceList[practiceIdx];
    if (!q) {
      renderEmptyPractice('没有可刷的题目，请调整筛选条件或点击「清除」');
      return;
    }
    const total = practiceList.length;
    $('#pIndex').textContent = (practiceIdx + 1);
    $('#pTotal').textContent = total;
    $('#pBar').style.width = ((practiceIdx + 1) / total * 100) + '%';

    // 逐题计时 / 蒙题标记（累积式：不重置，对齐粉笔）
    saveCurrentQElapsed();          // 离开上一题时存入累积
    practiceQStart = Date.now();    // 新题从现在开始计增量
    practiceGuess = false;
    if (window._spTimed === false) { stopQTimer(); } else { startQTimer(); }
    const gb = $('#guessBtn');
    if (gb) { gb.textContent = '🎲 蒙一下'; gb.classList.remove('active'); }

    const moduleName = ({ changshi:'常识判断', yanyu:'言语理解', shuliang:'数量关系', panduan:'判断推理', ziliao:'资料分析', shenlun:'申论' })[q._module || findModuleOf(q)];
    const examName = window.EXAM_TYPES.find(e => e.id === q.exam_type)?.name || q.exam_type || '';
    const topicName = topicLabel(q);
    const tagParts = [q.type || '单选', moduleName || '', topicName, examName, q.year + '年'].filter(Boolean);
    $('#qType').textContent = tagParts.join(' · ');

    // 来源徽标（真题回忆版 / 高仿真练习）
    const srcLabel = q.src || q.source || '';
    const qSrcEl = $('#qSrc');
    if (qSrcEl) {
      if (srcLabel.includes('真题')) {
        qSrcEl.textContent = '真题回忆版'; qSrcEl.className = 'q-src real';
      } else if (srcLabel.includes('高仿真')) {
        qSrcEl.textContent = '高仿真练习'; qSrcEl.className = 'q-src sim';
      } else if (srcLabel) {
        qSrcEl.textContent = srcLabel; qSrcEl.className = 'q-src';
      } else {
        qSrcEl.textContent = ''; qSrcEl.className = 'q-src';
      }
    }

    $('#qStem').innerHTML = richText(q.qHtml, q.q);
    const matEl = $('#qMaterial');
    const mh = richText(q.materialHtml, q.material);
    if (mh) { matEl.innerHTML = mh; matEl.style.display = 'block'; }
    else { matEl.style.display = 'none'; }

    // 图片加载防御：检测渲染后的 <img>，确保可见 + 延迟检测失败图
    revealImages('#qStem, #qMaterial');

    // 渲染选项（支持图片选项，如图形推理）
    const wrap = $('#qOptions');
    wrap.innerHTML = '';
    q.options.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'opt';
      const letter = String.fromCharCode(65 + i);
      div.innerHTML = `<span class="opt-letter">${letter}</span><span class="opt-text">${optInner(q, i)}</span>`;
      div.onclick = () => selectPractice(i);
      wrap.appendChild(div);
    });
    // 重置答案
    const ans = practiceAnswers[q.id];
    if (ans !== undefined) {
      $$('#qOptions .opt').forEach((el, i) => {
        el.classList.toggle('selected', i === ans);
      });
    }
    // 答案区：默认隐藏
    const answerCard = $('#qAnswer');
    answerCard.classList.add('hidden');
    // 背题模式：自动展示答案（无需点击"查看答案"）
    const isReview = window.CustomPractice && window.CustomPractice.isReviewMode();
    if (isReview) {
      practiceChecked[q.id] = true;
      var revAns = practiceAnswers[q.id];
      var noOptRev = !q.options || q.options.length === 0;
      answerCard.classList.remove('hidden');
      if (noOptRev) {
        $('#ansValue').textContent = '参考答案';
        $('#ansTag').textContent = '要点参考';
        $('#ansTag').className = 'ans-tag correct';
      } else {
        var cIdx = q.answer;
        $('#ansValue').textContent = String.fromCharCode(65 + cIdx);
        $('#ansTag').textContent = '背题模式';
        $('#ansTag').className = 'ans-tag correct';
        $$('#qOptions .opt').forEach(function (el, i) {
          el.classList.remove('selected', 'correct', 'wrong');
          if (i === cIdx) el.classList.add('correct');
        });
      }
      $('#ansExplain').innerHTML = richText(q.explainHtml, q.explain || '（暂无解析）');
    }
    // 粉笔式行为：做题期间不暴露正解（即使之前查看过）
    // 背题模式：自动展示答案（无需点击"查看答案"）
    // 注意：交卷后 practiceSubmitted 不再自动展答——用户翻题（含上一题）时默认隐藏，
    //       需主动点「查看答案」才展示，避免回翻时被动看到正解
    const noOpt = !q.options || q.options.length === 0;
    if (!isReview && practiceSubmitted) {
      // 交卷后：保留作答状态高亮（选了哪项），但不自动展示答案卡和解析
      // 用户可点「查看答案」逐题查看
      if (ans !== undefined && !noOpt) {
        const correctIdx = q.answer;
        // 仅标记对错色（不给答案文字），让用户有选择地查看
        // 注：这里也不自动标色，完全由用户主动触发
      }
      // answerCard 保持 hidden（上面已设）
    } else if (!isReview && practiceChecked[q.id] && window.practiceRevealed && window.practiceRevealed[q.id] && !practiceSubmitted) {
      // 做题期间：即使用户之前点过"查看答案"，切题走回来也不自动展答案
      // （保留用户选择态即可，正解需再次主动点"查看答案"或等交卷）
      answerCard.classList.add('hidden');
    }
    // 已答但未查看解析：保持选中态，不展正解（上面的选项重置已处理了选中态）

    // 收藏按钮（底部操作栏）
    const favBtn = $('#favBtn');
    favBtn.textContent = State.favorites.includes(q.id) ? '⭐ 已收藏' : '⭐ 收藏';
    // 刷新顶部工具栏（标记/草稿/收藏图标状态）
    refreshToolbar();
  }

  function findModuleOf(q) {
    for (const k of Object.keys(window.QB)) {
      if (window.QB[k].includes(q)) return k;
    }
    return currentModule;
  }

  // 显示题型名：优先用题目标注的 topic，否则用知识点树推断（解决 bank topic 全空）
  function topicLabel(q) {
    if (!q) return '';
    let obj = q.topic ? window.ALL_TOPICS.find(t => t.id === q.topic) : null;
    if (!obj && window.KnowledgeTree) {
      const inf = window.KnowledgeTree.infer(q, q._module || findModuleOf(q));
      if (inf) obj = { id: inf.topicId, name: inf.topicName };
    }
    return obj ? obj.name : '';
  }

  function toggleGuess() {
    practiceGuess = !practiceGuess;
    const gb = $('#guessBtn');
    if (gb) { gb.textContent = practiceGuess ? '🎲 已标蒙' : '🎲 蒙一下'; gb.classList.toggle('active', practiceGuess); }
  }
  function toggleExamGuess() {
    examGuess = !examGuess;
    const eg = $('#examGuessBtn');
    if (eg) { eg.textContent = examGuess ? '🎲 已标蒙' : '🎲 蒙一下'; eg.classList.toggle('active', examGuess); }
  }

  // 粉笔式交互：选择答案后静默记录 + 自动跳下一题（不揭示正解）
  // 只有主动点"查看答案"才展示正解
  let _autoAdvanceTimer = null;
  function selectPractice(i) {
    const q = practiceList[practiceIdx];
    if (!q) return;
    if (practiceChecked[q.id]) return; // 已查看过解析，禁止重选
    practiceAnswers[q.id] = i;
    savePracticeSession();
    $$('#qOptions .opt').forEach((el, idx) => {
      el.classList.toggle('selected', idx === i);
    });
    // 背题模式：只选中不自动跳（用户手动翻页看解析）
    if (window.CustomPractice && window.CustomPractice.isReviewMode()) return;
    // 显示答案模式（专项练习配置项）：选中即揭示正解
    if (window._spShowAnswer) {
      if (_autoAdvanceTimer) clearTimeout(_autoAdvanceTimer);
      _autoAdvanceTimer = setTimeout(() => { _autoAdvanceTimer = null; checkAnswer(); }, 200);
      return;
    }
    // 如果还没记录过这道题（防止重复记录），先静默提交
    if (!practiceChecked[q.id]) {
      if (_autoAdvanceTimer) clearTimeout(_autoAdvanceTimer);
      _autoAdvanceTimer = setTimeout(() => {
        _autoAdvanceTimer = null;
        silentSubmit();
      }, 350);
    }
  }

  // 静默提交：记录作答数据（统计/掌握度/错题本）但不揭示正解，然后跳下一题
  function silentSubmit() {
    const q = practiceList[practiceIdx];
    if (!q || practiceChecked[q.id]) { nextQuestion(); return; }
    const noOpt = !q.options || q.options.length === 0;
    stopQTimer();
    practiceChecked[q.id] = true; // 标记"已答"，但 NOT revealed
    const ans = practiceAnswers[q.id];
    const correct = q.answer;
    const isCorrect = ans === correct;
    const module = q._module || findModuleOf(q);
    const ms = (getQElapsed(q.id)) * 1000;   // 累积式计时（含历史停留）
    const code = classify(isCorrect, practiceGuess, ms, module);
    State.history.push({ id: q.id, module, correct: isCorrect, ts: Date.now() });
    State.attempts.push({ id: q.id, module, selected: ans, correct: isCorrect, ms, guess: practiceGuess, code, ts: Date.now(), paper: null });
    if (window.Difficulty) window.Difficulty.refresh();
    if (window.FenbiKP) window.FenbiKP.invalidateMastery();
    const tk = todayKey(); State.days[tk] = (State.days[tk] || 0) + 1;
    if ((!isCorrect || practiceGuess) && !State.mistakes.includes(q.id)) {
      State.mistakes.push(q.id);
    } else if (isCorrect && !practiceGuess && State.mistakes.includes(q.id)) {
      State.mistakes = State.mistakes.filter(x => x !== q.id);
    }
    saveState();
    savePracticeSession();
    nextQuestion();
    toast(isCorrect ? (practiceGuess ? '🎲 蒙对了' : '✅ 答对了') : '❌ 答错了', 1200);
  }

  function checkAnswer() {
    const q = practiceList[practiceIdx];
    if (!q) return;
    const noOpt = !q.options || q.options.length === 0;
    if (!noOpt && practiceAnswers[q.id] === undefined) {
      toast('请先选择一个答案');
      return;
    }
    if (noOpt) {
      stopQTimer();
      practiceChecked[q.id] = true;
      window.practiceRevealed[q.id] = true;
      State.history.push({ id: q.id, module: q._module || findModuleOf(q), correct: true, ts: Date.now() });
      const tk = todayKey(); State.days[tk] = (State.days[tk] || 0) + 1;
      saveState();
      // 展示答案（无选项题直接显示参考答案）
      const answerCard = $('#qAnswer');
      answerCard.classList.remove('hidden');
      $('#ansValue').textContent = '参考答案';
      $('#ansTag').textContent = '要点参考';
      $('#ansTag').className = 'ans-tag correct';
      $('#ansExplain').innerHTML = richText(q.explainHtml, q.explain || '（暂无解析）');
      return;
    }
    stopQTimer();
    practiceChecked[q.id] = true;
    window.practiceRevealed[q.id] = true; // 标记：已查看正解
    const ans = practiceAnswers[q.id];
    const correct = q.answer;
    const isCorrect = ans === correct;
    const module = q._module || findModuleOf(q);
    const ms = (getQElapsed(q.id)) * 1000;   // 累积式计时（含历史停留）

    // 如果还没记录过（用户手动点"查看答案"但还没自动提交过），则记录
    const alreadyRecorded = State.attempts.some(a => a.id === q.id);
    if (!alreadyRecorded) {
      const code = classify(isCorrect, practiceGuess, ms, module);
      State.history.push({ id: q.id, module, correct: isCorrect, ts: Date.now() });
      State.attempts.push({ id: q.id, module, selected: ans, correct: isCorrect, ms, guess: practiceGuess, code, ts: Date.now(), paper: null });
      if (window.Difficulty) window.Difficulty.refresh();
      if (window.FenbiKP) window.FenbiKP.invalidateMastery();
      const tk = todayKey(); State.days[tk] = (State.days[tk] || 0) + 1;
      if ((!isCorrect || practiceGuess) && !State.mistakes.includes(q.id)) {
        State.mistakes.push(q.id);
      } else if (isCorrect && !practiceGuess && State.mistakes.includes(q.id)) {
        State.mistakes = State.mistakes.filter(x => x !== q.id);
      }
      saveState();
      savePracticeSession();
    }

    // 展示正解（复用 showQuestion 的 revealed 逻辑）
    const answerCard = $('#qAnswer');
    answerCard.classList.remove('hidden');
    $('#ansValue').textContent = String.fromCharCode(65 + correct);
    $('#ansTag').textContent = isCorrect ? '答对了 🎉' : '答错了';
    $('#ansTag').className = 'ans-tag ' + (isCorrect ? 'correct' : 'wrong');
    $$('#qOptions .opt').forEach((el, i) => {
      el.classList.remove('selected', 'correct', 'wrong');
      if (i === correct) el.classList.add('correct');
      if (i === ans && ans !== correct) el.classList.add('wrong');
    });
    $('#ansExplain').innerHTML = richText(q.explainHtml, q.explain || '（暂无解析）');
    toast(isCorrect ? (practiceGuess ? '🎲 蒙对了（已留错题本）' : '✅ 答对了') : '❌ 答错了，已加入错题本');
  }

  function nextQuestion() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    saveCurrentQElapsed();
    if (practiceIdx < practiceList.length - 1) {
      practiceIdx++;
      savePracticeSession();
      showQuestion();
    } else {
      toast('🎉 已是最后一题');
    }
  }

  function prevQuestion() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    saveCurrentQElapsed();
    if (practiceIdx > 0) {
      practiceIdx--;
      savePracticeSession();
      showQuestion();
    }
  }

  function toggleFav() {
    const q = practiceList[practiceIdx];
    if (!q) return;
    const i = State.favorites.indexOf(q.id);
    const added = i < 0;
    if (added) {
      State.favorites.push(q.id);
      toast('⭐ 已收藏');
    } else {
      State.favorites.splice(i, 1);
      toast('已取消收藏');
    }
    saveState();
    savePracticeSession();
    showQuestion();
  }

  // ===========================
  // 每题工具栏：标记 / 草稿 / 收藏
  // ===========================
  function refreshToolbar() {
    const q = practiceList[practiceIdx];
    if (!q) return;
    const markBtn = $('#qtMark');
    const favBtn = $('#qtFav');
    if (markBtn) markBtn.classList.toggle('active', !!(practiceMarked && practiceMarked[q.id]));
    if (favBtn) favBtn.classList.toggle('active', State.favorites.includes(q.id));
  }

  function toggleMark() {
    const q = practiceList[practiceIdx];
    if (!q) return;
    practiceMarked[q.id] = !practiceMarked[q.id];
    savePracticeSession();
    refreshToolbar();
    toast(practiceMarked[q.id] ? '🚩 已标记' : '已取消标记');
  }

  // ====== 草稿板（共享 Scratchpad：电容笔压感 + 手掌防误触 + 平滑） ======
  let practicePad = null;
  function getDraftKey() {
    const q = practiceList[practiceIdx];
    return q ? 'draft_practice_' + q.id : null;
  }
  function ensurePracticePad() {
    if (practicePad) return practicePad;
    const canvas = $('#draftCanvas');
    if (!canvas) return null;
    practicePad = new Scratchpad(canvas, { key: getDraftKey, penWidth: 3, eraserWidth: 28 });
    const pen = $('#draftPen');
    const er = $('#draftEraser');
    if (pen) { pen.classList.add('active'); pen.onclick = () => { practicePad.setTool('pen'); pen.classList.add('active'); if (er) er.classList.remove('active'); }; }
    if (er) er.onclick = () => { practicePad.setTool('eraser'); er.classList.add('active'); if (pen) pen.classList.remove('active'); };
    const undo = $('#draftUndo'); if (undo) undo.onclick = () => practicePad.undo();
    const clr = $('#draftClear'); if (clr) clr.onclick = () => practicePad.clear();
    const close = $('#draftClose'); if (close) close.onclick = closeDraft;
    return practicePad;
  }
  function openDraft() {
    const overlay = $('#draftOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const btn = $('#qtDraft'); if (btn) btn.classList.add('active');
    requestAnimationFrame(() => {
      const pad = ensurePracticePad();
      if (pad) pad.resize(); // 重新取尺寸 + 载入本题草稿
    });
  }
  function closeDraft() {
    const overlay = $('#draftOverlay');
    if (overlay) overlay.classList.add('hidden');
    const btn = $('#qtDraft'); if (btn) btn.classList.remove('active');
  }
  function toggleDraft() {
    const overlay = $('#draftOverlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) openDraft();
    else closeDraft();
  }

  // ===========================
  // 答题卡（粉笔式：首次交卷→预览卡，二次确认→真交）
  // ===========================
  function showAnswerCard() {
    const overlay = $('#acOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    renderAnswerCardContent();
  }

  function hideAnswerCard() {
    const overlay = $('#acOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function renderAnswerCardContent() {
    const grid = $('#acGrid');
    const stats = $('#acStats');
    if (!grid || !stats) return;
    grid.innerHTML = '';
    let answered = 0, unanswered = 0, marked = 0, correctCnt = 0;
    const isPostSubmit = practiceSubmitted;

    // 按模块分组（对齐粉笔答题卡）
    const groups = {};
    const order = ['panduan','yanyu','shuliang','ziliao','changshi'];
    practiceList.forEach(function(q, idx) {
      var mod = q._module || findModuleOf(q) || 'other';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push({ q: q, idx: idx });
    });

    // 模块显示名
    const modNames = { panduan:'判断推理', yanyu:'言语理解', shuliang:'数量关系', ziliao:'资料分析', changshi:'常识判断', other:'其他', shenlun:'申论' };

    // 按固定顺序输出分组
    order.forEach(function(mod) {
      if (!groups[mod] || !groups[mod].length) return;
      renderAcGroup(grid, mod, modNames[mod] || mod, groups[mod], isPostSubmit);
    });
    // 剩余模块
    Object.keys(groups).forEach(function(mod) {
      if (order.indexOf(mod) >= 0) return;
      renderAcGroup(grid, mod, modNames[mod] || mod, groups[mod], isPostSubmit);
    });

    // 统计
    practiceList.forEach(function(q) {
      if (practiceChecked[q.id]) { answered++; if (practiceAnswers[q.id] === q.answer) correctCnt++; }
      else unanswered++;
      if (practiceMarked && practiceMarked[q.id]) marked++;
    });
    stats.innerHTML =
      '<span class="ac-stat">已答 <span class="num">' + answered + '</span></span>' +
      '<span class="ac-stat">未答 <span class="num">' + unanswered + '</span></span>' +
      (marked > 0 ? '<span class="ac-stat">标记 <span class="num">' + marked + '</span></span>' : '') +
      (isPostSubmit && answered > 0 ? '<span class="ac-stat">正确 <span class="num correct-num">' + correctCnt + '</span></span>' : '') +
      '<span class="ac-stat">共 <span class="num">' + practiceList.length + '</span> 题</span>';
  }

  // 渲染答题卡的一个模块分组
  function renderAcGroup(container, modKey, modName, items, isPostSubmit) {
    // 分组标题
    var header = document.createElement('div');
    header.className = 'ac-group-head';
    header.textContent = modName;
    container.appendChild(header);

    // 该分组的格子
    items.forEach(function(item) {
      var q = item.q, idx = item.idx;
      var cell = document.createElement('div');
      cell.className = 'ac-cell';
      cell.textContent = idx + 1;
      var isAnswered = practiceChecked[q.id];
      var isMarked = practiceMarked && practiceMarked[q.id];

      if (isPostSubmit && isAnswered) {
        // 交卷后：正确绿色 / 错误红色
        var ans = practiceAnswers[q.id];
        if (ans !== undefined && ans === q.answer) { cell.classList.add('correct'); }
        else { cell.classList.add('wrong'); }
      } else if (isAnswered) {
        cell.classList.add('answered');
      } else {
        cell.classList.add('unanswered');
      }
      if (isMarked) cell.classList.add('marked');
      if (idx === practiceIdx) cell.classList.add('current');

      cell.onclick = function () {
        hideAnswerCard();
        practiceIdx = idx;
        showQuestion();
      };
      container.appendChild(cell);
    });
  }

  function confirmSubmit() {
    hideAnswerCard();
    clearPracticeSession();
    practiceSubmitted = true; // 标记已交卷（进入回顾模式，逐题自动展示正解）
    // 标记所有题为"已揭示"（交卷后回顾模式可看正解）
    practiceList.forEach(q => { window.practiceRevealed[q.id] = true; });
    // 统计成绩
    let correct = 0, total = 0, msTotal = 0;
    practiceList.forEach(q => {
      if (practiceChecked[q.id]) {
        total++;
        const ans = practiceAnswers[q.id];
        if (ans !== undefined && ans === q.answer) correct++;
        const attempt = State.attempts.find(a => a.id === q.id);
        if (attempt) msTotal += attempt.ms || 0;
      }
    });
    const score = total > 0 ? Math.round(correct / total * 100) : 0;
    const avgMs = total > 0 ? Math.round(msTotal / total) : 0;
    // 显示成绩报告
    showPracticeReport({ correct, total, score, avgMs });
  }

  function showPracticeReport(result) {
    const pct = result.score;
    const total = result.total, correct = result.correct;
    const avg = (result.avgMs / 1000).toFixed(1);
    // 收集错题（已答且答错）
    const wrong = practiceList.filter(q => practiceChecked[q.id] && practiceAnswers[q.id] !== q.answer);
    // 同类题推荐：基于错题考点（名称）反查 pathKey，取同考点其他题
    const seen = new Set(wrong.map(q => q.id));
    let rec = wrong.slice();
    const R = (window.FenbiKP && window.FenbiKP.registry()) || {};
    wrong.slice(0, 12).forEach(function (q) {
      (q.keypoints || []).forEach(function (name) {
        Object.keys(R).forEach(function (pk) {
          if (R[pk].name === name) {
            (window.FenbiKP.questions(pk) || []).forEach(function (o) {
              if (!seen.has(o.id)) { seen.add(o.id); rec.push(o); }
            });
          }
        });
      });
    });
    rec = rec.slice(0, 50);

    const ov = document.getElementById('spReportOverlay');
    if (!ov) { // 兜底（理论上不会走到）
      let msg = '📊 刷题完成！\n\n正确率：' + correct + '/' + total + ' (' + pct + '%)\n平均用时：' + avg + 's/题';
      if (window.alert) alert(msg);
      practiceIdx = 0; showQuestion(); return;
    }
    ov.querySelector('#rptScore').textContent = pct + '%';
    ov.querySelector('#rptSub').textContent = pct >= 80 ? '🎉 太棒了！继续保持！' : pct >= 60 ? '👍 还不错，再接再厉！' : pct >= 40 ? '💪 加油！多练薄弱考点' : '🔥 别灰心，找出薄弱点逐个突破！';
    ov.querySelector('#rptStats').innerHTML = '正确 <b>' + correct + '</b> / ' + total + ' · 平均 <b>' + avg + 's</b>/题 · 错题 <b>' + wrong.length + '</b>';
    ov.querySelector('#rptWrongCount').textContent = wrong.length;
    const wHtml = wrong.map(function (q) {
      const idx = practiceList.indexOf(q) + 1;
      return '<div class="rpt-wrong-item" data-idx="' + idx + '">第' + idx + '题 · ' + (q.type || '单选') + ' <span class="rpt-wrong-tag">答错</span></div>';
    }).join('') || '<div class="rpt-empty">无错题，全部正确！🎉</div>';
    ov.querySelector('#rptWrong').innerHTML = wHtml;
    ov.querySelector('#rptRecCount').textContent = rec.length;
    window._reportRecList = rec;
    ov.classList.remove('hidden');

    if (!ov._bound) {
      ov.querySelector('#rptClose').onclick = function () { ov.classList.add('hidden'); practiceIdx = 0; showQuestion(); };
      ov.querySelector('#rptRedo').onclick = function () {
        if (!window._reportRecList || !window._reportRecList.length) { if (window.toast) window.toast('暂无可推荐题'); return; }
        window.pendingList = window._reportRecList;
        window.pendingPracticeConfig = { shuffle: true, limit: 0, showAnswer: false, timed: true };
        ov.classList.add('hidden');
        location.hash = '#practice';
      };
      ov.querySelector('#rptWrong').onclick = function (e) {
        const it = e.target.closest('.rpt-wrong-item'); if (!it) return;
        const idx = parseInt(it.getAttribute('data-idx'), 10) - 1;
        if (idx >= 0 && idx < practiceList.length) { ov.classList.add('hidden'); practiceIdx = idx; showQuestion(); }
      };
      ov.querySelector('#rptAICopy').onclick = function () {
        const prompt = buildPracticeAIPrompt(result);
        copyText(prompt);
        toast('复盘 Prompt 已复制，去 OpenCode 粘贴提问');
      };
      ov.querySelector('#rptAIPaste').onclick = function () {
        const box = ov.querySelector('#rptAIPasteBox');
        const text = (box && box.value || '').trim();
        if (!text) { toast('请先粘贴 AI 的回答'); return; }
        saveAIReport(result, text);
        box.value = '';
        toast('AI 复盘已保存到学情档案');
      };
      ov._bound = true;
    }
  }

  function buildPracticeAIPrompt(result) {
    const wrong = practiceList.filter(q => practiceChecked[q.id] && practiceAnswers[q.id] !== q.answer);
    const modStats = {};
    practiceList.forEach(function (q) {
      const m = q._module || findModuleOf(q);
      const name = ({ changshi:'常识判断', yanyu:'言语理解', shuliang:'数量关系', panduan:'判断推理', ziliao:'资料分析', shenlun:'申论', zhengzhi:'政治理论' })[m] || m;
      if (!modStats[name]) modStats[name] = { total:0, correct:0, ms:0 };
      modStats[name].total++;
      if (practiceChecked[q.id] && practiceAnswers[q.id] === q.answer) modStats[name].correct++;
      const a = State.attempts.find(x => x.id === q.id);
      if (a) modStats[name].ms += a.ms || 0;
    });
    const modLines = Object.keys(modStats).map(function (n) {
      const s = modStats[n];
      const acc = s.total ? Math.round(s.correct / s.total * 100) : 0;
      const avg = s.correct ? Math.round(s.ms / s.correct / 1000 * 10) / 10 : 0;
      return n + '：' + s.correct + '/' + s.total + '（' + acc + '%）· 平均 ' + avg + 's/题';
    }).join('\n');

    const wrongLines = wrong.slice(0, 20).map(function (q, i) {
      const idx = practiceList.indexOf(q) + 1;
      const userAns = practiceAnswers[q.id];
      const uLetter = userAns !== undefined ? String.fromCharCode(65 + userAns) : '未答';
      const cLetter = String.fromCharCode(65 + q.answer);
      const a = State.attempts.find(x => x.id === q.id);
      const sec = a ? Math.round(a.ms / 1000) : 0;
      const stem = (q.q || '').replace(/<[^>]+>/g, '').slice(0, 80);
      const kps = (q.keypoints || []).join('、') || '无考点标签';
      return '第' + idx + '题 · ' + kps + '\n题干：' + stem + '\n我选：' + uLetter + ' · 正确：' + cLetter + ' · 用时：' + sec + 's';
    }).join('\n\n');

    const P = window.Coach ? window.Coach.profile() : null;
    let profileText = '';
    if (P && P.total) {
      profileText = '累计练习 ' + P.total + ' 题，估分 ' + (P.predicted != null ? P.predicted : '—') + '，距85分 ' + (P.gapTo85 != null ? P.gapTo85 : '—') + '。';
      const weak = [];
      Object.keys(P.weakKpByMod || {}).forEach(function (m) {
        (P.weakKpByMod[m] || []).forEach(function (k) { weak.push(k.name + '（错率' + k.wrongRate + '%）'); });
      });
      if (weak.length) profileText += '长期薄弱考点：' + weak.slice(0, 5).join('、') + '。';
    }

    return '你是我的公务员考试行测一对一私教。我刚完成一组练习，请根据数据给我一份针对性复盘报告。\n\n'
      + '【练习概况】\n总题数：' + result.total + '\n正确：' + result.correct + '\n正确率：' + result.score + '%\n平均用时：' + (result.avgMs / 1000).toFixed(1) + 's/题\n\n'
      + '【分模块表现】\n' + modLines + '\n\n'
      + '【错题详情】（共' + wrong.length + '道）\n' + (wrongLines || '无') + '\n\n'
      + '【我的历史画像】\n' + (profileText || '暂无足够历史数据') + '\n\n'
      + '【请输出】\n1. 本次最大问题是什么（错因归类：知识盲区/审题失误/计算错误/套路不熟/时间不够）\n2. 每道错题对应的具体原因和一句话改正动作\n3. 接下来7天应该优先练哪个模块、哪个考点、每天几题\n4. 针对我的用时分布，给一条提速建议\n5. 如果我要再刷一组，推荐从哪类题开始';
  }

  function saveAIReport(result, text) {
    try {
      const key = 'sat_ai_reports_v1';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.unshift({
        ts: Date.now(),
        score: result.score,
        correct: result.correct,
        total: result.total,
        avgMs: result.avgMs,
        report: text
      });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 30)));
    } catch (e) { console.error('[ai report] save fail', e); }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ===========================
  // 模考
  // ===========================
  const EXAM_LEN = 7200; // 7200 秒 = 120 分钟
  let examList = [];
  let examIdx = 0;
  let examAnswers = {};
  let examMarks = {};
  let examTimer = null;
  let examRemain = EXAM_LEN;

  let selectedPaperId = null;

  function paperCat(p) {
    if (!p) return 'sheng';
    var et = (p.examType || '') + ' ' + (p.name || '');
    if (/国考|gk-/i.test(et)) return 'gk';
    return 'sheng';
  }

  function getPaperQuestions(paperId) {
    var list = [];
    Object.keys(window.QB).forEach(function (k) {
      (window.QB[k] || []).forEach(function (q) {
        if (q.paperId === paperId) list.push(q);
      });
    });
    list.sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
    return list;
  }

  function renderExamIntro() {
    $('#examIntro').classList.remove('hidden');
    $('#examBody').classList.add('hidden');
    $('#examResult').classList.add('hidden');
    buildExamPicker();
    if (window._pendingExamPaper) {
      var pid = window._pendingExamPaper;
      window._pendingExamPaper = null;
      selectPaper(pid);
    }
  }

  // ===== 真题套卷库（浏览，不限时） =====
  var paperViewList = [];
  var paperViewIdx = 0;
  var paperViewChecked = {};

  // 套卷页：真题套卷库（不限时）与限时模考共用一套 DOM，靠模式切换
  function setPapersMode(mode) {
    var papersList = $('#papersList');
    var paperView = $('#paperView');
    var examIntro = $('#examIntro');
    var examBody = $('#examBody');
    var examResult = $('#examResult');
    var tabs = $('#papersModeTabs');
    if (tabs) tabs.querySelectorAll('.seg-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    if (mode === 'exam') {
      if (papersList) papersList.classList.add('hidden');
      if (paperView) paperView.classList.add('hidden');
      if (examResult) examResult.classList.add('hidden');
      if (examBody) examBody.classList.add('hidden');
      if (examIntro) examIntro.classList.remove('hidden');
      renderExamIntro();
    } else {
      if (examIntro) examIntro.classList.add('hidden');
      if (examBody) examBody.classList.add('hidden');
      if (examResult) examResult.classList.add('hidden');
      if (paperView) paperView.classList.add('hidden');
      if (papersList) papersList.classList.remove('hidden');
      buildPaperFilters();
      renderPaperList();
    }
  }

  function renderPapers(params) {
    params = params || {};
    setPapersMode(params.mode === 'exam' ? 'exam' : 'papers');
    // 套卷页允许真题+模考混合展示；后台静默加载模考卷，加载完自动刷新列表
    if (params.mode !== 'exam' && window.loadMockBank && !window.MOCK_BANK_READY) {
      window.loadMockBank(function () {
        buildPaperFilters();
        renderPaperList();
      });
    }
  }

  function buildPaperFilters() {
    var years = Array.from(new Set((window.BANK_PAPERS || []).map(function (p) { return p.year; }).filter(Boolean))).sort(function (a, b) { return b - a; });
    var ysel = $('#ppYear');
    if (ysel && ysel.options.length <= 1) {
      years.forEach(function (y) {
        var o = document.createElement('option'); o.value = y; o.textContent = y + ' 年'; ysel.appendChild(o);
      });
    }
    var provs = Array.from(new Set((window.BANK_PAPERS || []).map(paperProvOf).filter(Boolean))).sort();
    var psel = $('#ppProv');
    if (psel && psel.options.length <= 1) {
      provs.forEach(function (pr) {
        var o = document.createElement('option'); o.value = pr; o.textContent = pr; psel.appendChild(o);
      });
    }
  }

  function paperProvOf(p) {
    var n = p.name || '';
    if (/国考/.test(n)) return '';
    var m = n.match(/^(20\d\d年?)?([\u4e00-\u9fa5]{2,6}?)(省|区|市)?[公務]?员?/);
    return m ? m[2] : '';
  }

  function renderPaperList() {
    var ac = document.querySelector('#ppCat .active');
    var cat = ac ? ac.getAttribute('data-cat') : 'gk';
    cat = (cat === 'gk' || cat === 'sheng') ? cat : 'all';
    var yr = $('#ppYear') ? $('#ppYear').value : '';
    var prov = $('#ppProv') ? $('#ppProv').value : '';
    var papers = (window.BANK_PAPERS || []).filter(function (p) {
      if (p.volume !== '行测') return false;
      if (cat === 'gk' && paperCat(p) !== 'gk') return false;
      if (cat === 'sheng' && paperCat(p) !== 'sheng') return false;
      if (yr && String(p.year) !== yr) return false;
      if (prov) {
        var pn = paperProvOf(p);
        if (pn.indexOf(prov) < 0 && prov.indexOf(pn) < 0) return false;
      }
      return true;
    });
    papers.sort(function (a, b) { return (b.year || 0) - (a.year || 0) || (a.name || '').localeCompare(b.name || ''); });
    var el = $('#ppList');
    if (!el) return;
    el.innerHTML = '';
    $('#ppCount').textContent = '共 ' + papers.length + ' 套';
    if (!papers.length) { el.innerHTML = '<div class="ep-empty">该筛选下暂无行测真题卷</div>'; return; }
    papers.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'pp-card';
      var tag = (p.examType === '国考模考') ? '模考' : (paperCat(p) === 'gk' ? '国考' : '省考');
      card.innerHTML = '<div class="pp-card-top"><span class="pp-tag">' + tag + '</span><span class="pp-year">' + (p.year || '?') + '</span></div>' +
        '<div class="pp-name">' + p.name + '</div>' +
        '<div class="pp-meta">' + p.count + ' 题 · 行测</div>';
      card.onclick = function () { openPaper(p.id); };
      el.appendChild(card);
    });
  }

  // ===== 真题套卷库（粉笔式套卷练习） =====
  var paperViewList = [], paperViewIdx = 0, paperViewChecked = {};
  var pvTotalStart = 0;        // 总开始（顶部正计时）
  var pvPausedAt = 0;          // 暂停时刻
  var pvPausedElapsed = 0;     // 已暂停累计时间(ms)
  var pvTimerId = null;
  var pvIsPaused = false;
  var pvStartMap = {};         // qid -> 本题开始时间（单题/模块用时）
  var paperViewMarked = {};    // qid -> true（星标/疑问）
  var pvDraftMap = {};         // qid -> string（草稿内容，localStorage 持久化）
  var pvCorrectMap = {};       // qid -> bool（已答对错，答题卡着色）
  var pvModTime = {};          // 各模块累计用时(ms)
  var pvSubmitted = false;     // 是否已交卷（控制答案展示时机）
  var paperViewSelMap = {};    // qid -> number（每题选择的选项索引，回显用）
  var pvResult = null;         // 交卷结果
  var pvNoAnswer = false;    // 当前卷是否无标准答案（粉笔模考）
  var PV_MOD_ORDER = ['changshi', 'zhengzhi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun'];
  function pvModName(mod) {
    return ({ changshi: '常识判断', zhengzhi: '政治理论', yanyu: '言语理解', shuliang: '数量关系', panduan: '判断推理', ziliao: '资料分析', shenlun: '申论' })[mod] || mod;
  }

  function openPaper(paperId) {
    paperViewList = getPaperQuestions(paperId);
    if (!paperViewList.length) { toast('该卷暂无题目'); return; }
    paperViewIdx = 0;
    pvNoAnswer = !!(paperViewList[0] && paperViewList[0].noAnswer);
    paperViewChecked = {};
    paperViewMarked = {};
    pvCorrectMap = {};
    pvModTime = {};
    pvStartMap = {};
    pvDraftMap = {};
    pvSubmitted = false;
    paperViewSelMap = {};
    pvResult = null;
    pvTotalStart = Date.now();
    pvPausedElapsed = 0;
    pvIsPaused = false;
    var meta = (window.BANK_PAPERS || []).find(function (x) { return x.id === paperId; });
    $('#pvPaperName').textContent = (meta && meta.name) || '真题卷';
    $('#papersList').classList.add('hidden');
    $('#paperView').classList.remove('hidden');
    $('#pvResult').classList.add('hidden');
    // 加载本卷已有草稿
    loadPvDrafts(paperId);
    startPvTimer();
    renderPvAsSheet();   // 底部答题卡
    renderPaperQuestion();
  }

  // ---- 计时器（支持暂停/继续，对齐粉笔 || 按钮） ----
  function startPvTimer() {
    if (pvTimerId) clearInterval(pvTimerId);
    pvIsPaused = false;
    updatePvPauseBtn();
    var el = $('#pvTimer');
    if (el) el.textContent = '00:00';
    pvTimerId = setInterval(function () {
      if (pvIsPaused) return;
      var s = Math.floor((Date.now() - pvTotalStart - pvPausedElapsed) / 1000);
      if (el) el.textContent = fmtTime(s);
    }, 1000);
  }
  function stopPvTimer() { if (pvTimerId) { clearInterval(pvTimerId); pvTimerId = null; } }
  function togglePvPause() {
    pvIsPaused = !pvIsPaused;
    if (pvIsPaused) {
      pvPausedAt = Date.now();
    } else {
      pvPausedElapsed += Date.now() - pvPausedAt;
    }
    updatePvPauseBtn();
  }
  function updatePvPauseBtn() {
    var btn = $('#pvPauseBtn');
    if (!btn) return;
    btn.textContent = pvIsPaused ? '▶' : '❚❚';
    btn.title = pvIsPaused ? '继续' : '暂停';
  }

  // ---- 草稿持久化（localStorage，按 paperId+qid 键值） ----
  function pvDraftKey(paperId, qid) { return 'pv_draft_' + paperId + '_' + qid; }
  function loadPvDrafts(paperId) {
    try {
      paperViewList.forEach(function (q) {
        var k = pvDraftKey(paperId, q.id);
        var v = localStorage.getItem(k);
        if (v) pvDraftMap[q.id] = v;
      });
    } catch(e) { /* localStorage 不可用时静默 */ }
  }
  function savePvDraft(qid, text) {
    var pid = paperViewList[0] && paperViewList[0].paperId;
    if (!pid) return;
    pvDraftMap[qid] = text;
    try { localStorage.setItem(pvDraftKey(pid, qid), text); } catch(e) {}
  }

  function renderPaperQuestion() {
    var list = paperViewList;
    if (!list.length) return;
    var q = list[paperViewIdx];
    if (!q) return;
    pvStartMap[q.id] = Date.now();

    // 题号 & 进度
    $('#pvIndex').textContent = paperViewIdx + 1;
    $('#pvAsDone').textContent = Object.keys(paperViewChecked).length || (paperViewIdx + 1);
    $('#pvAsTotal').textContent = list.length;
    // 导航条题号同步
    var navIdxEl = document.getElementById('pvNavIdx');
    var navTotalEl = document.getElementById('pvNavTotal');
    if(navIdxEl) navIdxEl.textContent = paperViewIdx + 1;
    if(navTotalEl) navTotalEl.textContent = list.length;

    // 类型标签行
    var moduleName = pvModName(q._module || findModuleOf(q));
    var examName = window.EXAM_TYPES.find(function(e){return e.id===q.exam_type}) ? window.EXAM_TYPES.find(function(e){return e.id===q.exam_type}).name : (q.exam_type||'');
    var topicName = topicLabel(q);
    var tagParts = [q.type||'单选', moduleName||'', topicName, examName, q.year+'年'].filter(Boolean);
    $('#pvType').textContent = tagParts.join(' · ');

    // 来源标签
    var srcLabel = q.src || q.source || '';
    var qSrcEl = $('#pvSrc');
    if (qSrcEl) {
      if (srcLabel.indexOf('真题')>=0){qSrcEl.textContent='真题回忆版';qSrcEl.className='q-src real';}
      else if(srcLabel.indexOf('高仿真')>=0){qSrcEl.textContent='高仿真练习';qSrcEl.className='q-src sim';}
      else if(srcLabel){qSrcEl.textContent=srcLabel;qSrcEl.className='q-src';}
      else{qSrcEl.textContent='';qSrcEl.className='q-src';}
      if (q.noAnswer && qSrcEl) { qSrcEl.textContent = (srcLabel || '模考') + ' · 无答案'; qSrcEl.className = 'q-src noans'; }
    }

    // 题干
    $('#pvStem').innerHTML = richText(q.qHtml, q.q);
    var matEl = $('#pvMaterial');
    var mh = richText(q.materialHtml, q.material);
    if (mh){matEl.innerHTML=mh;matEl.style.display='block';}else{matEl.style.display='none';}
    revealImages('#pvStem, #pvMaterial');

    // 选项
    var wrap = $('#pvOptions');
    wrap.innerHTML = '';
    q.options.forEach(function(opt, i){
      var div = document.createElement('div');
      div.className='opt';
      var letter=String.fromCharCode(65+i);
      div.innerHTML='<span class="opt-letter">'+letter+'</span><span class="opt-text">'+optInner(q,i)+'</span>';
      div.onclick=function(){markPaperOpt(i);};
      wrap.appendChild(div);
    });

    // 答案卡：默认隐藏，交卷后也不自动展答（避免翻题时被动看到正解）
    // 用户需主动点击「查看答案」才展示
    var answerCard=$('#pvAnswer');
    answerCard.classList.add('hidden');
    if(pvSubmitted && paperViewChecked[q.id]){
      // 交卷后：仅回显已选状态（不含对错色和答案文字），不自动展答
      // 用户可点顶部/底部「查看答案」按钮逐题查看
    }
    // 做题期间 / 交卷后统一：回显已选状态（不含对错）
    if(paperViewChecked[q.id] && paperViewSelMap[q.id]!=null){
      $$('#pvOptions .opt').forEach(function(el,i){
        el.classList.remove('correct','wrong','selected');
        if(i===paperViewSelMap[q.id])el.classList.add('selected');
      });
    }

    // 每题右上角图标状态：收藏 / 草稿 / 标记
    var favBtn=$('#pvFav');
    if(favBtn) favBtn.textContent=State.favorites.indexOf(q.id)>=0?'★':'☆';
    var markBtn=$('#pvQMark');
    if(markBtn){markBtn.textContent=paperViewMarked[q.id]?'★':'☆';markBtn.title=paperViewMarked[q.id]?'取消标记':'标记';}
    // 标签显示
    var mkTag=$('#pvMarkTag');
    if(mkTag){if(paperViewMarked[q.id])mkTag.classList.remove('hidden');else mkTag.classList.add('hidden');}

    // 草稿区：加载本题草稿（文字 + 画布）
    var dp=$('#pvDraftPanel');
    var di=$('#pvDraftInput');
    if(dp&&di){
      di.value=pvDraftMap[q.id]||'';
    }
    // 切题时重载画布笔画
    if (dp && !dp.classList.contains('hidden')) {
      var p = ensurePvPad();
      if (p) p.resize();
    }

    // 同步答题卡当前题高亮
    renderPvAsSheet();
  }

  function markPaperOpt(i) {
    var q=paperViewList[paperViewIdx];
    if(!q)return;
    // 模考无答案：只记录作答，不判分、不写训练数据（避免污染教练/难度/FSRS）
    if(q.noAnswer){
      var ms=Math.max(0,Date.now()-(pvStartMap[q.id]||pvTotalStart));
      var mod=q._module||findModuleOf(q);
      pvModTime[mod]=(pvModTime[mod]||0)+ms; // 仍累计模块用时（最有价值）
      paperViewChecked[q.id]=true;
      paperViewSelMap[q.id]=i;
      pvCorrectMap[q.id]=2; // 2=已答但无标准答案
      renderPvAsSheet();
      $('#pvAsDone').textContent=Object.keys(paperViewChecked).length;
      toast('已记录作答（本卷无标准答案）');
      return;
    }
    if(paperViewChecked[q.id])return;

    // 套卷模式：只记录选择，不暴露答案（交卷后才展示）
    $$('#pvOptions .opt').forEach(function(el,idx){el.classList.toggle('selected',idx===i);});

    var correctIdx=-1;
    if(typeof q.answer==='number')correctIdx=q.answer;
    else if(typeof q.answer==='string'){
      var ch=q.answer.trim().charAt(0);
      if(ch>='A'&&ch<='Z')correctIdx=ch.charCodeAt(0)-65;
    }
    var isC=(i===correctIdx);
    var ms=Math.max(0,Date.now()-(pvStartMap[q.id]||pvTotalStart));
    var mod=q._module||findModuleOf(q);
    var code=classify(isC,false,ms,mod);

    State.attempts.push({id:q.id,module:mod,selected:i,correct:isC,ms:ms,guess:false,code:code,
      paper:(paperViewList[0]&&paperViewList[0].paperId)||null,ts:Date.now()});
    if (window.FenbiKP) window.FenbiKP.invalidateMastery(); // 专项掌握度：套卷作答即时刷新
    pvModTime[mod]=(pvModTime[mod]||0)+ms;
    pvCorrectMap[q.id]=isC;
    State.today=State.today||{correct:0,total:0};
    if(isC)State.today.correct++;
    State.today.total++;
    var tk=todayKey();
    State.days[tk]=(State.days[tk]||0)+1;
    if(window.Difficulty)window.Difficulty.refresh();
    saveState();

    paperViewChecked[q.id]=true;
    paperViewSelMap[q.id]=i;
    renderPvAsSheet();
    $('#pvAsDone').textContent=Object.keys(paperViewChecked).length;
  }

  function pvCheck(){
    if(!pvSubmitted){ toast('交卷后才能查看答案'); return; }
    var q=paperViewList[paperViewIdx];if(!q)return;
    if(q.noAnswer){
      var ac=$('#pvAnswer'); if(ac) ac.classList.remove('hidden');
      $('#pvAnsValue').textContent='—';
      $('#pvAnsTag').textContent='无参考答案';
      $('#pvAnsTag').className='ans-tag none';
      $('#pvExplain').innerHTML='本题来自粉笔<b>模考</b>，官方答案需交卷后由粉笔给出，上岸通未采集到标准答案。可对照粉笔 App 核对。';
      renderPvAsSheet();
      $('#pvAsDone').textContent=Object.keys(paperViewChecked).length;
      return;
    }
    if(!paperViewChecked[q.id]){
      paperViewChecked[q.id]=true;
      var correctIdx=-1;
      if(typeof q.answer==='number')correctIdx=q.answer;
      else if(typeof q.answer==='string'){var ch=q.answer.trim().charAt(0);if(ch>='A'&&ch<='Z')correctIdx=ch.charCodeAt(0)-65;}
      $$('#pvOptions .opt').forEach(function(el,i){el.classList.toggle('correct',i===correctIdx);});
      $('#pvAnswer').classList.remove('hidden');
      $('#pvAnsValue').textContent=String.fromCharCode(65+correctIdx);
      $('#pvAnsTag').textContent='参考答案';
      $('#pvAnsTag').className='ans-tag correct';
      $('#pvExplain').innerHTML=richText(q.explainHtml,q.explain||'（暂无解析）');
      renderPvAsSheet();
      $('#pvAsDone').textContent=Object.keys(paperViewChecked).length;
    }
  }
  function pvNext(){
    if(paperViewIdx<paperViewList.length-1){paperViewIdx++;renderPaperQuestion();}
    else toast('已是最后一题');
  }
  function pvPrev(){
    if(paperViewIdx>0){paperViewIdx--;renderPaperQuestion();}
  }

  // ---- 标记（每题右上角 ☆ 图标 + 题内"标记"标签） ----
  function pvToggleMark(){
    var q=paperViewList[paperViewIdx];if(!q)return;
    paperViewMarked[q.id]=!paperViewMarked[q.id];
    var btn=$('#pvQMark');if(btn){btn.textContent=paperViewMarked[q.id]?'★':'☆';btn.title=paperViewMarked[q.id]?'取消标记':'标记';}
    var tag=$('#pvMarkTag');if(tag){if(paperViewMarked[q.id])tag.classList.remove('hidden');else tag.classList.add('hidden');}
    renderPvAsSheet();
    toast(paperViewMarked[q.id] ? '已标记此题 🚩' : '已取消标记');
  }

  // ---- 收藏（每题右上角 ☆ 图标） ----
  function pvToggleFav(){
    var q=paperViewList[paperViewIdx];if(!q)return;
    if(State.favorites.indexOf(q.id)>=0){State.favorites=State.favorites.filter(function(x){return x!==q.id;}); toast('已取消收藏');}
    else {State.favorites.push(q.id); toast('已收藏 ★');}
    saveState();
    var btn=$('#pvFav');if(btn)btn.textContent=State.favorites.indexOf(q.id)>=0?'★':'☆';
  }

  // ---- 草稿（✏️ 按钮 toggle 草稿面板 + 初始化画布） ----
  function pvToggleDraft(){
    var dp=$('#pvDraftPanel');if(!dp)return;
    var wasHidden = dp.classList.contains('hidden');
    dp.classList.toggle('hidden');
    // 打开时初始化画布
    if (wasHidden && !dp.classList.contains('hidden')) {
      // 延迟一帧确保 DOM 可见后取尺寸
      requestAnimationFrame(function(){ var p=ensurePvPad(); if(p) p.resize(); });
    }
  }
  function pvSaveDraft(){
    var q=paperViewList[paperViewIdx];if(!q)return;
    var di=$('#pvDraftInput');if(di)savePvDraft(q.id,di.value);
  }
  function pvClearDraft(){
    var q=paperViewList[paperViewIdx];if(!q)return;
    var di=$('#pvDraftInput');if(di)di.value='';
    savePvDraft(q.id,'');
    if (pvPad) pvPad.clear();
    else toast('草稿已清空');
  }

  // ====== 画布草稿系统（共享 Scratchpad：电容笔压感 + 手掌防误触 + 平滑） ======
  var pvPad = null;
  function getPvCanvasKey() {
    var q = paperViewList[paperViewIdx];
    var pid = paperViewList[0] && paperViewList[0].paperId;
    return (pid && q) ? ('pv_canvas_' + pid + '_' + q.id) : null;
  }
  function ensurePvPad() {
    if (pvPad) return pvPad;
    var canvas = document.getElementById('pvDraftCanvas');
    if (!canvas) return null;
    var dark = window.Scratchpad && window.Scratchpad.isDark ? window.Scratchpad.isDark() : false;
    var actColor = document.querySelector('#pvDraftPanel .pv-draft-color.active');
    var initColor = dark ? '#ffffff' : (actColor ? actColor.getAttribute('data-color') : '#1a1a2e');
    pvPad = new Scratchpad(canvas, { key: getPvCanvasKey, color: initColor, penWidth: 3, eraserWidth: 28 });
    var pen = document.getElementById('pvDraftPen');
    var er = document.getElementById('pvDraftEraser');
    function setPen() { pvPad.setTool('pen'); if (pen) pen.classList.add('active'); if (er) er.classList.remove('active'); }
    function setEr() { pvPad.setTool('eraser'); if (er) er.classList.add('active'); if (pen) pen.classList.remove('active'); }
    if (pen) pen.onclick = setPen;
    if (er) er.onclick = setEr;
    if (dark) {
      document.querySelectorAll('#pvDraftPanel .pv-draft-color').forEach(function (x) { x.classList.remove('active'); });
      var w = document.querySelector('#pvDraftPanel .pv-draft-color[data-color="#ffffff"]');
      if (w) w.classList.add('active');
    }
    document.querySelectorAll('#pvDraftPanel .pv-draft-color').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#pvDraftPanel .pv-draft-color').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        pvPad.setColor(b.getAttribute('data-color'));
        setPen();
      };
    });
    var undo = document.getElementById('pvDraftUndo'); if (undo) undo.onclick = function () { pvPad.undo(); };
    var clr = document.getElementById('pvDraftClear'); if (clr) clr.onclick = function () { pvPad.clear(); };
    return pvPad;
  }

  // ---- 底部答题卡面板（粉笔式：常驻栏 + 可展开，按模块分组） ----
  function pvToggleAsSheet(){
    var body=$('#pvAsBody');var btn=$('#pvAsToggle');
    if(!body||!btn)return;
    if(body.classList.contains('hidden')){renderPvAsSheet();body.classList.remove('hidden');btn.textContent='▲';}
    else{body.classList.add('hidden');btn.textContent='▼';}
  }
  function renderPvAsSheet(){
    var scroll=$('#pvAsScroll');if(!scroll)return;
    var done=0;
    paperViewList.forEach(function(q){if(paperViewChecked[q.id])done++;});
    $('#pvAsDone').textContent=done||paperViewIdx+1;
    $('#pvAsTotal').textContent=paperViewList.length;

    // 按模块分组
    var groups={};
    paperViewList.forEach(function(q,i){
      var m=q._module||findModuleOf(q);
      if(!groups[m])groups[m]=[];
      groups[m].push({q:q,i:i});
    });
    var html='';
    PV_MOD_ORDER.forEach(function(m){
      if(!groups[m])return;
      var items=groups[m];
      html+='<div class="pv-as-group"><div class="pv-as-gtitle">'+pvModName(m)+'</div><div class="pv-as-grid">';
      items.forEach(function(it){
        var cls='pv-as-cell';
        if(it.i===paperViewIdx)cls+=' cur';
        else if(paperViewMarked[it.q.id])cls+=' mark';
        else if(pvSubmitted && pvCorrectMap[it.q.id]===false)cls+=' wrong';
        else if(paperViewChecked[it.q.id])cls+=' done';
        else cls+=' undone';
        html+='<button class="'+cls+'" data-i="'+it.i+'">'+(it.i+1)+'</button>';
      });
      html+='</div></div>';
    });
    scroll.innerHTML=html;
    // 绑定点击跳转
    $$('#pvAsScroll .pv-as-cell').forEach(function(btn){
      btn.onclick=function(){
        var i=parseInt(btn.getAttribute('data-i'),10);
        if(!isNaN(i)){paperViewIdx=i;renderPaperQuestion();}
      };
    });
  }

  function submitPaperView(){
    if(!paperViewList.length)return;
    // 先保存当前草稿
    pvSaveDraft();
    var modTotals={};
    paperViewList.forEach(function(q){var m=q._module||findModuleOf(q);modTotals[m]=(modTotals[m]||0)+1;});
    var byMod={};
    Object.keys(modTotals).forEach(function(m){byMod[m]={total:modTotals[m],done:0,right:0,time:pvModTime[m]||0};});
    var right=0,wrong=0,answered=0;
    paperViewList.forEach(function(q){
      var m=q._module||findModuleOf(q);
      var c=pvCorrectMap[q.id];
      if(c===true){right++;answered++;byMod[m].right++;byMod[m].done++;}
      else if(c===false){wrong++;answered++;byMod[m].done++;}
      else if(c===2){answered++;byMod[m].done++;} // 模考无答案：已答计数
    });
    var total=paperViewList.length;
    var skip=total-answered;
    var acc=answered?Math.round(right/answered*100):0;
    var score=total?Math.round(right/total*100):0;
    var used=Math.floor((Date.now()-pvTotalStart-pvPausedElapsed)/1000);
    if (pvNoAnswer) {
      // 模考无答案：不估分、不写历史趋势（避免污染"比上次±X分"），仅记录已作答与模块用时
      pvResult={noAnswer:true, answered:answered, right:0, wrong:0, skip:skip, total:total, acc:0, score:0, used:used, byMod:byMod};
    } else {
      pvResult={right:right,wrong:wrong,skip:skip,total:total,acc:acc,score:score,used:used,byMod:byMod};
      // 写入该卷历史交卷记录（用于历史对比）
      var hpid=paperViewList[0]&&paperViewList[0].paperId;
      if(hpid){
        try{
          var hk='pv_history_'+hpid;
          var hist=JSON.parse(localStorage.getItem(hk)||'[]');
          if(!Array.isArray(hist))hist=[];
          hist.push({date:Date.now(),score:score,acc:acc,used:used});
          localStorage.setItem(hk,JSON.stringify(hist));
        }catch(e){}
      }
    }
    pvSubmitted = true;
    // 交卷后回到第一题，便于逐题回顾答案与解析
    if (paperViewList.length) paperViewIdx = 0;
    renderPvResult();
    renderPaperQuestion();  // 交卷后重新渲染当前题，展示答案/解析
  }

  function pvHistoryChart(hist){
    var n=hist.length;
    if(n<2){
      return '<div class="card-head"><div class="card-title">历史对比</div></div>'+
        '<div class="pv-hist-empty">再做一次即可看到趋势 📈</div>';
    }
    var W=340,H=180,padL=30,padR=12,padT=14,padB=28;
    var plotW=W-padL-padR, plotH=H-padT-padB;
    function y(s){ return padT+(1-s/100)*plotH; }
    function x(i){ return padL+(n<=1?plotW/2:i*plotW/(n-1)); }
    var svg='<svg viewBox="0 0 '+W+' '+H+'" class="db-chart" preserveAspectRatio="none">';
    [0,50,85,100].forEach(function(v){
      var yy=y(v), isT=(v===85);
      svg+='<line x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'" stroke="'+(isT?'#ef4444':'#e2e8f0')+'" stroke-width="'+(isT?1.4:0.8)+'" stroke-dasharray="'+(isT?'5 3':'0')+'"/>';
      svg+='<text x="'+(padL-4)+'" y="'+(yy+3)+'" text-anchor="end" font-size="9" fill="'+(isT?'#ef4444':'#94a3b8')+'">'+v+'</text>';
    });
    var path=hist.map(function(h,i){ return (i?'L':'M')+x(i).toFixed(1)+' '+y(h.score).toFixed(1); }).join(' ');
    svg+='<path d="'+path+'" fill="none" stroke="#5b6cff" stroke-width="2" stroke-linejoin="round"/>';
    hist.forEach(function(h,i){
      var cx=x(i), cy=y(h.score);
      svg+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="2.8" fill="#5b6cff"/>';
      if(i>0){
        var d=h.score-hist[i-1].score;
        var col=d>0?'#16a34a':(d<0?'#ef4444':'#94a3b8');
        svg+='<text x="'+cx.toFixed(1)+'" y="'+(cy-7).toFixed(1)+'" text-anchor="middle" font-size="9" fill="'+col+'">'+(d>0?'+':'')+d+'</text>';
      }
    });
    [0,Math.floor((n-1)/2),n-1].forEach(function(i){
      svg+='<text x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9" fill="#94a3b8">第'+(i+1)+'次</text>';
    });
    svg+='</svg>';
    return '<div class="card-head"><div class="card-title">历史对比 · 多次得分趋势</div><div class="card-extra">红线=85目标</div></div>'+svg;
  }

  function renderPvResult(){
    stopPvTimer();
    var r=pvResult;if(!r)return;
    $('#pvResult').classList.remove('hidden');
    if (r.noAnswer) {
      $('#pvScoreNum').textContent='—';
      $('#pvScoreCorrect').textContent=r.answered;
      $('#pvScoreTotal').textContent=r.total;
      $('#pvTotalTime').textContent=fmtTime(r.used);
      $('#pvRight').textContent=r.answered;
      $('#pvWrong').textContent='—';
      $('#pvSkip').textContent=r.skip;
      $('#pvAcc').textContent='无答案';
      var names={changshi:'常识',zhengzhi:'政治',yanyu:'言语',shuliang:'数量',panduan:'判断',ziliao:'资料',shenlun:'申论'};
      $('#pvModBreak').innerHTML='<div class="emb-title">本卷无标准答案</div><div style="font-size:13px;color:#64748b;line-height:1.6;padding:6px 2px">粉笔模考官方答案需交卷后由粉笔给出。上岸通已采集题面，可用于<b>盲练计时</b>；交卷后查看各模块用时，便于查漏提速。</div>';
      var tArr=PV_MOD_ORDER.filter(function(m){return r.byMod[m]&&r.byMod[m].time>0;})
        .map(function(m){return{m:m,t:r.byMod[m].time};}).sort(function(a,b){return b.t-a.t;});
      var maxT=tArr.length?tArr[0].t:1;
      var tb='<div class="emb-title">各模块用时（总 '+fmtTime(r.used)+'）</div>';
      tArr.forEach(function(o){
        var d=r.byMod[o.m];
        var sec=Math.round(o.t/1000);
        var avg=d.done?Math.round(sec/d.done):0;
        var pct=Math.round(o.t/maxT*100);
        tb+='<div class="emb-row"><span class="emb-mod">'+(names[o.m]||o.m)+'</span>'+
          '<span class="emb-bar"><span class="emb-fill time" style="width:'+pct+'%"></span></span>'+
          '<span class="emb-num">'+fmtTime(sec)+' · 均'+avg+'s</span></div>';
      });
      $('#pvTimeBreak').innerHTML=tb;
      $('#pvResult').scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    $('#pvScoreNum').textContent=r.score;
    $('#pvScoreCorrect').textContent=r.right;
    $('#pvScoreTotal').textContent=r.total;
    $('#pvTotalTime').textContent=fmtTime(r.used);
    $('#pvRight').textContent=r.right;
    $('#pvWrong').textContent=r.wrong;
    $('#pvSkip').textContent=r.skip;
    $('#pvAcc').textContent=r.acc+'%';
    var names={changshi:'常识',zhengzhi:'政治',yanyu:'言语',shuliang:'数量',panduan:'判断',ziliao:'资料',shenlun:'申论'};
    var mb='<div class="emb-title">分模块正确率</div>';
    PV_MOD_ORDER.forEach(function(m){
      if(!r.byMod[m]||!r.byMod[m].done)return;
      var d=r.byMod[m];
      var pct=Math.round(d.right/d.done*100);
      var cls=pct>=85?'ok':(pct>=60?'mid':'low');
      mb+='<div class="emb-row"><span class="emb-mod">'+(names[m]||m)+'</span>'+
        '<span class="emb-bar"><span class="emb-fill '+cls+'" style="width:'+pct+'%"></span></span>'+
        '<span class="emb-num">'+d.right+'/'+d.done+' ('+pct+'%)</span></div>';
    });
    $('#pvModBreak').innerHTML=mb;
    var tArr=PV_MOD_ORDER.filter(function(m){return r.byMod[m]&&r.byMod[m].time>0;})
      .map(function(m){return{m:m,t:r.byMod[m].time};}).sort(function(a,b){return b.t-a.t;});
    var maxT=tArr.length?tArr[0].t:1;
    var tb='<div class="emb-title">各模块用时（总 '+fmtTime(r.used)+'）</div>';
    tArr.forEach(function(o){
      var d=r.byMod[o.m];
      var sec=Math.round(o.t/1000);
      var avg=d.done?Math.round(sec/d.done):0;
      var pct=Math.round(o.t/maxT*100);
      tb+='<div class="emb-row"><span class="emb-mod">'+(names[o.m]||o.m)+'</span>'+
        '<span class="emb-bar"><span class="emb-fill time" style="width:'+pct+'%"></span></span>'+
        '<span class="emb-num">'+fmtTime(sec)+' · 均'+avg+'s</span></div>';
    });
    $('#pvTimeBreak').innerHTML=tb;
    $('#pvResult').scrollIntoView({behavior:'smooth',block:'start'});
    // 历史对比
    var hc=$('#pvHistoryChart');
    if(hc){
      var hpid=paperViewList[0]&&paperViewList[0].paperId;
      var hist=[];
      if(hpid){
        try{ hist=JSON.parse(localStorage.getItem('pv_history_'+hpid)||'[]'); }catch(e){ hist=[]; }
        if(!Array.isArray(hist))hist=[];
      }
      hc.innerHTML=pvHistoryChart(hist);
    }
    toast('已交卷');
  }
  function pvReview(){
    paperViewList.forEach(function(q){paperViewChecked[q.id]=true;});
    $('#pvResult').classList.add('hidden');
    paperViewIdx=0;
    renderPaperQuestion();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function pvAgain(){
    var pid=paperViewList[0]&&(paperViewList[0].paperId);
    if(pid)openPaper(pid);
  }
  function pvBackList(){
    pvSaveDraft(); // 返回前保存草稿
    stopPvTimer();
    $('#paperView').classList.add('hidden');
    $('#papersList').classList.remove('hidden');
  }

  function buildExamPicker() {
    var cat = ($('#epCat') && $('#epCat').value) || 'gk';
    var yr = ($('#epYear') && $('#epYear').value) || '';
    var papers = (window.BANK_PAPERS || []).filter(function (p) {
      if (p.noAnswer) return false; // 模考无答案：不进入限时估分模考
      if (p.volume !== '行测') return false;
      if (cat !== 'all' && paperCat(p) !== cat) return false;
      if (yr && String(p.year) !== yr) return false;
      return true;
    });
    papers.sort(function (a, b) { return (b.year || 0) - (a.year || 0) || (a.name || '').localeCompare(b.name || ''); });

    var ysel = $('#epYear');
    if (ysel && ysel.options.length <= 1) {
      var years = Array.from(new Set((window.BANK_PAPERS || []).map(function (p) { return p.year; }).filter(Boolean))).sort(function (a, b) { return b - a; });
      years.forEach(function (y) {
        var o = document.createElement('option'); o.value = y; o.textContent = y + ' 年'; ysel.appendChild(o);
      });
    }

    var list = $('#epList');
    if (!list) return;
    list.innerHTML = '';
    if (!papers.length) { list.innerHTML = '<div class="ep-empty">该筛选下暂无行测真题卷</div>'; return; }
    papers.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'ep-item' + (p.id === selectedPaperId ? ' active' : '');
      var tag = paperCat(p) === 'gk' ? '国考' : '省考';
      row.innerHTML = '<span class="ep-name">' + p.name + '</span><span class="ep-meta">' + tag + ' · ' + (p.year || '?') + ' · ' + p.count + '题</span>';
      row.onclick = function () { selectPaper(p.id); };
      list.appendChild(row);
    });
  }

  function selectPaper(id) {
    selectedPaperId = id;
    var p = (window.BANK_PAPERS || []).find(function (x) { return x.id === id; });
    if (!p) return;
    $('#examTitle').textContent = p.name;
    $('#examSub').textContent = '共 ' + p.count + ' 题 · 限时 120 分钟';
    var btn = $('#startExam');
    btn.disabled = false;
    btn.textContent = '开始模考（' + p.count + ' 题）';
    buildExamPicker();
  }

  function startExam(paperId) {
    paperId = paperId || selectedPaperId;
    if (!paperId) { toast('请先选择一套真题卷'); return; }
    var meta = (window.BANK_PAPERS || []).find(function (p) { return p.id === paperId; });
    examList = getPaperQuestions(paperId);
    if (!examList.length) { toast('该卷暂无题目'); return; }
    examIdx = 0;
    examAnswers = {};
    examMarks = {};
    examRemain = 120 * 60; // 行测限时 120 分钟
    $('#examIntro').classList.add('hidden');
    $('#examBody').classList.remove('hidden');
    $('#examResult').classList.add('hidden');
    $('#examTimer').style.color = '';
    renderExamQ();
    renderExamGrid();
    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(function () {
      examRemain--;
      $('#examTimer').textContent = fmtTime(examRemain);
      if (examRemain <= 300) $('#examTimer').style.color = '#ef4444';
      if (examRemain <= 0) { clearInterval(examTimer); submitExam(); }
    }, 1000);
  }

  function renderExamQ() {
    const q = examList[examIdx];
    if (!q) return;
    examStartMap[q.id] = Date.now();
    examGuess = false;
    const eg = $('#examGuessBtn'); if (eg) { eg.textContent = '🎲 蒙一下'; eg.classList.remove('active'); }
    $('#eIndex').textContent = (examIdx + 1);
    $('#eTotal').textContent = examList.length;
    $('#eBar').style.width = ((examIdx + 1) / examList.length * 100) + '%';
    const moduleName = ({ changshi:'常识', yanyu:'言语', shuliang:'数量', panduan:'判断', ziliao:'资料', shenlun:'申论' })[findModuleOf(q)];
    $('#eType').textContent = (q.type || '单选') + ' · ' + (moduleName || '');
    $('#eStem').innerHTML = richText(q.qHtml, q.q);
    revealImages('#eStem');

    const wrap = $('#eOptions');
    wrap.innerHTML = '';
    q.options.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'opt';
      const letter = String.fromCharCode(65 + i);
      div.innerHTML = `<span class="opt-letter">${letter}</span><span class="opt-text">${optInner(q, i)}</span>`;
      div.onclick = () => selectExam(i);
      wrap.appendChild(div);
    });
    const ans = examAnswers[q.id];
    if (ans !== undefined) {
      $$('#eOptions .opt').forEach((el, i) => {
        el.classList.toggle('selected', i === ans);
      });
    }
    renderExamGrid();
  }

  function selectExam(i) {
    const q = examList[examIdx];
    if (!q) return;
    examAnswers[q.id] = i;
    $$('#eOptions .opt').forEach((el, idx) => {
      el.classList.toggle('selected', idx === i);
    });
    renderExamGrid();
  }

  function renderExamGrid() {
    const wrap = $('#eGrid');
    wrap.innerHTML = '';
    examList.forEach((q, i) => {
      const g = document.createElement('div');
      g.className = 'g';
      if (examAnswers[q.id] !== undefined) g.classList.add('answered');
      if (examMarks[q.id]) g.classList.add('marked');
      if (i === examIdx) g.classList.add('current');
      g.textContent = i + 1;
      g.onclick = () => { examIdx = i; renderExamQ(); };
      wrap.appendChild(g);
    });
  }

  function examNext() {
    if (examIdx < examList.length - 1) { examIdx++; renderExamQ(); }
  }
  function examPrev() {
    if (examIdx > 0) { examIdx--; renderExamQ(); }
  }
  function examMark() {
    const q = examList[examIdx];
    if (!q) return;
    examMarks[q.id] = !examMarks[q.id];
    renderExamGrid();
  }

  // ====== 模考草稿板（共享 Scratchpad：电容笔压感 + 手掌防误触） ======
  let examPad = null;
  function getExamDraftKey() {
    const q = examList[examIdx];
    return q ? 'draft_exam_' + q.id : null;
  }
  function ensureExamPad() {
    if (examPad) return examPad;
    const canvas = $('#eDraftCanvas');
    if (!canvas) return null;
    examPad = new Scratchpad(canvas, { key: getExamDraftKey, penWidth: 3, eraserWidth: 28 });
    const pen = $('#eDraftPen');
    const er = $('#eDraftEraser');
    if (pen) { pen.classList.add('active'); pen.onclick = () => { examPad.setTool('pen'); pen.classList.add('active'); if (er) er.classList.remove('active'); }; }
    if (er) er.onclick = () => { examPad.setTool('eraser'); er.classList.add('active'); if (pen) pen.classList.remove('active'); };
    const undo = $('#eDraftUndo'); if (undo) undo.onclick = () => examPad.undo();
    const clr = $('#eDraftClear'); if (clr) clr.onclick = () => examPad.clear();
    const close = $('#eDraftClose'); if (close) close.onclick = closeExamDraft;
    return examPad;
  }
  function openExamDraft() {
    const ov = $('#eDraftOverlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    const btn = $('#eDraft'); if (btn) btn.classList.add('active');
    requestAnimationFrame(() => { const p = ensureExamPad(); if (p) p.resize(); });
  }
  function closeExamDraft() {
    const ov = $('#eDraftOverlay');
    if (ov) ov.classList.add('hidden');
    const btn = $('#eDraft'); if (btn) btn.classList.remove('active');
  }
  function toggleExamDraft() {
    const ov = $('#eDraftOverlay');
    if (!ov) return;
    if (ov.classList.contains('hidden')) openExamDraft();
    else closeExamDraft();
  }

  function submitExam() {
    if (examTimer) clearInterval(examTimer);
    let correct = 0, wrong = 0, skip = 0;
    examList.forEach(q => {
      if (examAnswers[q.id] === undefined) { skip++; return; }
      const isC = examAnswers[q.id] === q.answer;
      const module = findModuleOf(q);
      if (isC) correct++; else wrong++;
      if (!isC && !State.mistakes.includes(q.id)) State.mistakes.push(q.id);
      State.history.push({ id: q.id, module, correct: isC, ts: Date.now() });
      const ms = examStartMap[q.id] ? (Date.now() - examStartMap[q.id]) : 0;
      State.attempts.push({ id: q.id, module, selected: examAnswers[q.id], correct: isC, ms, guess: false, code: classify(isC, false, ms, module), ts: Date.now(), paper: 'exam' });
      if (window.Difficulty) window.Difficulty.refresh(); // 难度反推：模考作答即时反映
      if (window.FenbiKP) window.FenbiKP.invalidateMastery(); // 专项掌握度：模考作答即时刷新
      const tk = todayKey();
      State.days[tk] = (State.days[tk] || 0) + 1;
    });
    const total = examList.length;
    const acc = total ? Math.round(correct / total * 100) : 0;
    State.examScore = { correct, total, wrong, skip, acc, ts: Date.now() };
    saveState();

    $('#examBody').classList.add('hidden');
    $('#examResult').classList.remove('hidden');
    $('#scoreNum').textContent = correct * (100 / total); // 行测每题分
    $('#scoreCorrect').textContent = correct;
    $('#scoreTotal').textContent = total;
    $('#sgRight').textContent = correct;
    $('#sgWrong').textContent = wrong;
    $('#sgSkip').textContent = skip;
    $('#sgAcc').textContent = acc + '%';
    renderExamModBreak();
    toast('已交卷');
  }

  function renderExamModBreak() {
    var byMod = {};
    examList.forEach(function (q) {
      var m = findModuleOf(q);
      if (!byMod[m]) byMod[m] = { total: 0, right: 0 };
      byMod[m].total++;
      if (examAnswers[q.id] === q.answer) byMod[m].right++;
    });
    var names = { changshi: '常识', yanyu: '言语', shuliang: '数量', panduan: '判断', ziliao: '资料', zhengzhi: '政治', shenlun: '申论' };
    var html = '<div class="emb-title">分模块正确率（目标 ≥85%）</div>';
    Object.keys(byMod).forEach(function (m) {
      var d = byMod[m];
      var pct = d.total ? Math.round(d.right / d.total * 100) : 0;
      var cls = pct >= 85 ? 'ok' : (pct >= 60 ? 'mid' : 'low');
      html += '<div class="emb-row"><span class="emb-mod">' + (names[m] || m) + '</span>' +
        '<span class="emb-bar"><span class="emb-fill ' + cls + '" style="width:' + pct + '%"></span></span>' +
        '<span class="emb-num">' + d.right + '/' + d.total + ' (' + pct + '%)</span></div>';
    });
    var box = $('#examModBreak');
    if (box) box.innerHTML = html;
  }

  // ===========================
  // 错题本 / 收藏
  // ===========================
  function findQuestion(id) {
    for (const k of Object.keys(window.QB)) {
      const found = window.QB[k].find(q => q.id === id);
      if (found) return { ...found, _module: k };
    }
    return null;
  }

  function renderMistakes(params) {
    params = params || {};
    const list = $('#mistakeList');
    const empty = $('#emptyMistakes');
    if (list) list.innerHTML = '';
    if (!State.mistakes.length) {
      if (empty) empty.classList.remove('hidden');
    } else {
      if (empty) empty.classList.add('hidden');
      State.mistakes.forEach(id => {
        const q = findQuestion(id);
        if (!q) return;
        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
          <div class="lc-stem">${richText(q.qHtml, q.q)}</div>
          <div class="lc-meta">
            <span>${({changshi:'常识',yanyu:'言语',shuliang:'数量',panduan:'判断',ziliao:'资料',shenlun:'申论'})[q._module] || ''}</span>
            <span>${(q.options[q.answer] || '').slice(0, 20)}</span>
          </div>
          <div class="lc-actions">
            <button class="btn-ghost small" data-act="redo">重做</button>
            <button class="btn-ghost small" data-act="remove">移出</button>
          </div>
        `;
        card.querySelector('[data-act=redo]').onclick = () => {
          pendingSingle = q;
          showPage('practice');
        };
        card.querySelector('[data-act=remove]').onclick = () => {
          State.mistakes = State.mistakes.filter(x => x !== id);
          saveState();
          renderMistakes();
          renderHome();
        };
        list.appendChild(card);
      });
    }
    // 错题 · 复习：同时挂载智能复习，并按参数切换子视图
    mountTraining();
    switchSegInPage($('#page-mistakes'), params.tab || 'mistakes');
  }

  function renderFavorites() {
    const list = $('#favList');
    const empty = $('#emptyFav');
    list.innerHTML = '';
    if (!State.favorites.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    State.favorites.forEach(id => {
      const q = findQuestion(id);
      if (!q) return;
      const card = document.createElement('div');
      card.className = 'list-card';
      card.innerHTML = `
        <div class="lc-stem">${richText(q.qHtml, q.q)}</div>
        <div class="lc-meta">
          <span>${({changshi:'常识',yanyu:'言语',shuliang:'数量',panduan:'判断',ziliao:'资料',shenlun:'申论'})[q._module] || ''}</span>
          <span>答案：${String.fromCharCode(65 + q.answer)}</span>
        </div>
        <div class="lc-actions">
          <button class="btn-ghost small" data-act="re">再练一次</button>
          <button class="btn-ghost small" data-act="rm">取消收藏</button>
        </div>
      `;
      card.querySelector('[data-act=re]').onclick = () => {
        pendingSingle = q;
        showPage('practice');
      };
      card.querySelector('[data-act=rm]').onclick = () => {
        State.favorites = State.favorites.filter(x => x !== id);
        saveState();
        renderFavorites();
        renderHome();
      };
      list.appendChild(card);
    });
  }

  // ===========================
  // 统计
  // ===========================
  function renderStats(params) {
    params = params || {};
    const total = State.history.length;
    const correct = State.history.filter(h => h.correct).length;
    const acc = total ? Math.round(correct / total * 100) : 0;
    const tk = todayKey();
    const todayCount = State.days[tk] || 0;
    // 本周
    let week = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      week += State.days[k] || 0;
    }
    $('#stTotal').textContent = total;
    $('#stCorrect').textContent = correct;
    $('#stAcc').textContent = acc + '%';
    $('#stToday').textContent = todayCount;
    $('#stWeek').textContent = week;
    $('#stDays').textContent = State.streak;

    // 模块正确率
    const mods = { changshi: '常识', yanyu: '言语', shuliang: '数量', panduan: '判断', ziliao: '资料', shenlun: '申论' };
    const wrap = $('#moduleAcc');
    wrap.innerHTML = '';
    Object.keys(mods).forEach(k => {
      const arr = State.history.filter(h => h.module === k);
      const tot = arr.length;
      const cor = arr.filter(h => h.correct).length;
      const pct = tot ? Math.round(cor / tot * 100) : 0;
      const row = document.createElement('div');
      row.className = 'ma-row';
      row.innerHTML = `
        <div class="ma-name"><span>${mods[k]}</span><span>${cor}/${tot} · ${pct}%</span></div>
        <div class="ma-track"><div class="ma-fill" style="width:${pct}%"></div></div>
      `;
      wrap.appendChild(row);
    });

    // 每日刷题
    const chart = $('#dayChart');
    chart.innerHTML = '';
    const days = [];
    let max = 10;
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      days.push({ k, count: State.days[k] || 0 });
    }
    max = Math.max(...days.map(d => d.count), 10);
    days.forEach(d => {
      const wrap2 = document.createElement('div');
      wrap2.className = 'bar';
      const bar = document.createElement('div');
      bar.className = 'b';
      bar.style.height = (Math.max(2, (d.count / max) * 70)) + 'px';
      const num = document.createElement('div');
      num.className = 'n';
      num.textContent = d.count;
      const lab = document.createElement('div');
      lab.className = 'l';
      const dd = new Date(d.k.replace(/-/g,'/'));
      lab.textContent = (dd.getMonth()+1) + '/' + dd.getDate();
      wrap2.appendChild(bar);
      wrap2.appendChild(num);
      wrap2.appendChild(lab);
      chart.appendChild(wrap2);
    });

    renderCoverage();
    // 数据中心：同时挂载看板 / 诊断 / 教练，并按参数切换子视图
    mountDashboard(); mountDiagnosis(); mountCoach();
    switchSegInPage($('#page-stats'), params.tab || 'stats');
  }

  // 题库覆盖：按考试类型统计年份跨度与真题/高仿真数量
  function renderCoverage() {
    // 统计
    let real = 0, sim = 0;
    const byExam = {}; // exam_type -> { min, max, real, sim }
    Object.keys(window.QB).forEach(mod => {
      window.QB[mod].forEach(q => {
        const s = (q.src || q.source || '');
        if (s.includes('真题')) real++;
        else if (s.includes('高仿真')) sim++;
        const et = q.exam_type;
        if (!et) return;
        if (!byExam[et]) byExam[et] = { min: 9999, max: 0, real: 0, sim: 0 };
        const b = byExam[et];
        const y = Number(q.year) || 0;
        if (y) { b.min = Math.min(b.min, y); b.max = Math.max(b.max, y); }
        if (s.includes('真题')) b.real++; else if (s.includes('高仿真')) b.sim++;
      });
    });

    const total = real + sim;
    const paperCount = (window.FULL_PAPERS || []).length;
    const covSummary = $('#covSummary');
    if (covSummary) covSummary.textContent = `真题 ${real} · 高仿 ${sim} · ${paperCount} 套卷`;

    const body = $('#covBody');
    if (!body) return;
    body.innerHTML = '';

    // 已入库真题卷（来自 bank/）
    if (window.BANK_PAPERS && window.BANK_PAPERS.length) {
      const hp = document.createElement('div');
      hp.className = 'cov-sub';
      hp.textContent = '已入库真题卷（回忆版）';
      body.appendChild(hp);
      const chips = document.createElement('div');
      chips.className = 'cov-chips';
      window.BANK_PAPERS.forEach(p => {
        const c = document.createElement('span');
        c.className = 'cov-chip real';
        c.textContent = p.name + ' · ' + p.count + '题';
        chips.appendChild(c);
      });
      body.appendChild(chips);
    }

    // 各考试类型覆盖
    const sub = document.createElement('div');
    sub.className = 'cov-sub';
    sub.textContent = '练习题库覆盖（真题 + 高仿真）';
    body.appendChild(sub);

    const order = ['gk-fsheng','gk-dishi','gk-xzf']; // 国考优先
    const keys = Object.keys(byExam).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    const grid = document.createElement('div');
    grid.className = 'cov-grid';
    keys.forEach(et => {
      const b = byExam[et];
      const etName = (window.EXAM_TYPES.find(e => e.id === et) || { name: et }).name;
      const span = (b.min && b.max && b.min !== b.max) ? `${b.min}–${b.max}` : (b.max || '—');
      const row = document.createElement('div');
      row.className = 'cov-row';
      row.innerHTML = `
        <div class="cov-name">${etName}</div>
        <div class="cov-years">${span}</div>
        <div class="cov-cnt">${b.real ? `<span class="cov-real">真${b.real}</span>` : ''}${b.sim ? `<span class="cov-sim">仿${b.sim}</span>` : ''}</div>
      `;
      grid.appendChild(row);
    });
    body.appendChild(grid);
  }

  // ===========================
  // 新增模块页面（方法库 / 速算 / 考频）
  // ===========================
  function mountMethodLib() {
    const el = $('#methodRoot');
    if (el && window.MethodLib) window.MethodLib.mount(el);
  }
  function mountSpeedLib() {
    const el = $('#speedRoot');
    if (el && window.SpeedDrill) window.SpeedDrill.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">速算模块加载中…</div>';
  }
  function renderFreq() {
    const el = $('#freqRoot');
    if (window.Difficulty) window.Difficulty.refresh(); // 复习优先级依赖最新作答
    if (el && window.FreqHeatmap) window.FreqHeatmap.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">考频模块加载中…</div>';
  }
  function mountTipsLib() {
    const el = $('#tipsRoot');
    if (el && window.TipsLib) window.TipsLib.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">技巧库加载中…</div>';
  }
  function mountDashboard() {
    const el = $('#dashboardRoot');
    if (el && window.Dashboard) window.Dashboard.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">看板加载中…</div>';
  }
  function mountDiagnosis() {
    const el = $('#diagnosisRoot');
    if (el && window.Diagnosis) window.Diagnosis.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">诊断模块加载中…</div>';
  }
  function mountTraining() {
    const el = $('#trainingRoot');
    if (el && window.Training) window.Training.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">训练模块加载中…</div>';
  }
  function mountCoach() {
    const el = $('#coachRoot');
    if (el && window.CoachUI) window.CoachUI.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">教练模块加载中…</div>';
  }
  // 方法技巧库（通法 / 速算 / 技巧 合并为一页，内部 Tab 切换）
  function renderMethod(params) {
    params = params || {};
    mountMethodLib(); mountSpeedLib(); mountTipsLib();
    switchSegInPage($('#page-method'), params.tab || 'method');
  }
  function renderTactics() {
    const el = $('#tacticsRoot');
    if (el && window.Tactics) window.Tactics.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">战术模块加载中…</div>';
  }
  function renderExperience() {
    const el = $('#experienceRoot');
    if (el && window.Experience) window.Experience.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">体验模块加载中…</div>';
    injectDisplaySettings(el);
  }
  function renderSearch() {
    const el = $('#searchRoot');
    if (el && window.QSearch) window.QSearch.mount(el);
    else if (el) el.innerHTML = '<div class="empty card">搜题模块加载中…</div>';
  }

  // ===========================
  // 卷型结构（国考行测三类卷 · 题型配比硬标准）
  // 标准配比已与粉笔真题逐卷校验；灰色数字为题库实收（按卷型+年份档聚合自 PAPER_STRUCTURE）。
  // ===========================
  // 副省级：数量 15（多 5）；言语含篇章阅读 10 题（2 篇×5）。地市级/行政执法：数量 10，无篇章。
  const PAPER_STD = {
    'gk-fsheng': {
      name: '国考（副省级）', total: 135,
      note: '副省级比地市/执法多 5 题（数量 15 vs 10），且言语含篇章阅读 10 题。',
      regimes: {
        '2015-2024': {
          modules: [
            { m: 'changshi', c: 20, label: '常识判断' },
            { m: 'yanyu', c: 40, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达'],['yy-pwyd','篇章阅读',10]] },
            { m: 'shuliang', c: 15, label: '数量关系' },
            { m: 'panduan', c: 40, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',10]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
        '2025+': {
          modules: [
            { m: 'zhengzhi', c: 20, label: '政治理论' },
            { m: 'changshi', c: 15, label: '常识判断' },
            { m: 'yanyu', c: 30, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达'],['yy-pwyd','篇章阅读',10]] },
            { m: 'shuliang', c: 15, label: '数量关系' },
            { m: 'panduan', c: 35, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',5]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
      },
    },
    'gk-dishi': {
      name: '国考（地市级）', total: 130,
      note: '地市级与行政执法卷结构一致：数量 10 题，言语无篇章阅读。',
      regimes: {
        '2015-2024': {
          modules: [
            { m: 'changshi', c: 20, label: '常识判断' },
            { m: 'yanyu', c: 40, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达']] },
            { m: 'shuliang', c: 10, label: '数量关系' },
            { m: 'panduan', c: 40, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',10]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
        '2025+': {
          modules: [
            { m: 'zhengzhi', c: 20, label: '政治理论' },
            { m: 'changshi', c: 15, label: '常识判断' },
            { m: 'yanyu', c: 30, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达']] },
            { m: 'shuliang', c: 10, label: '数量关系' },
            { m: 'panduan', c: 35, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',5]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
      },
    },
    'gk-xzf': {
      name: '国考（行政执法）', total: 130,
      note: '行政执法卷（2022 年起增设）结构与地市级一致：数量 10 题，言语无篇章阅读。',
      regimes: {
        '2015-2024': {
          modules: [
            { m: 'changshi', c: 20, label: '常识判断' },
            { m: 'yanyu', c: 40, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达']] },
            { m: 'shuliang', c: 10, label: '数量关系' },
            { m: 'panduan', c: 40, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',10]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
        '2025+': {
          modules: [
            { m: 'zhengzhi', c: 20, label: '政治理论' },
            { m: 'changshi', c: 15, label: '常识判断' },
            { m: 'yanyu', c: 30, label: '言语理解', subs: [['yy-ljtk','逻辑填空'],['yy-pdyd','片段阅读'],['yy-yjbd','语句表达']] },
            { m: 'shuliang', c: 10, label: '数量关系' },
            { m: 'panduan', c: 35, label: '判断推理', subs: [['pd-txtl','图形推理',10],['pd-dypd','定义判断',10],['pd-lbtl','类比推理',10],['pd-ljpd','逻辑判断',5]] },
            { m: 'ziliao', c: 20, label: '资料分析' },
          ],
        },
      },
    },
  };

  let psSelectedExam = 'gk-fsheng';

  function renderPaperStructure() {
    const root = $('#paperStructureRoot');
    if (!root) return;
    const ST = window.PAPER_STRUCTURE || {};

    // 按 (examType, 年份档) 聚合实收：同一年可能存在多份来源（真题+高仿/练习），
    // 先按年去重，保留题量更完整的那份，再汇总模块/题型计数，避免重复计入拉低"每卷实收"。
    function agg(examType, regime) {
      const byYear = {};
      Object.values(ST).forEach(p => {
        const y = Number(p.year) || 0;
        const ok = regime === '2025+'
          ? y >= 2025
          : (y >= 2015 && y <= 2024);
        if (!ok || p.examType !== examType) return;
        if (!byYear[y] || (p.total || 0) > (byYear[y].total || 0)) byYear[y] = p;
      });
      const b = { mod: {}, topic: {}, n: 0 };
      Object.values(byYear).forEach(p => {
        b.n++;
        Object.entries(p.modCount || {}).forEach(([k, v]) => { b.mod[k] = (b.mod[k] || 0) + v; });
        Object.entries(p.topicCount || {}).forEach(([k, v]) => { b.topic[k] = (b.topic[k] || 0) + v; });
      });
      return b;
    }
    const fmt = n => (n || 0).toLocaleString('zh-CN');
    const escapeAttr = s => String(s).replace(/"/g, '&quot;');

    const std = PAPER_STD[psSelectedExam];
    let html = '<div class="ps-seg">';
    Object.keys(PAPER_STD).forEach(et => {
      const short = PAPER_STD[et].name.replace('国考（', '').replace('）', '');
      html += `<button data-et="${et}" class="${et === psSelectedExam ? 'active' : ''}">${short}</button>`;
    });
    html += '</div>';
    html += `<div class="ps-note">${escapeHTML(std.note)}下表为官方硬标准配比，灰色数字为题库实收（按卷型+年份档聚合，已与粉笔真题逐卷校验）。点击任意题型可直接开刷。</div>`;

    ['2015-2024', '2025+'].forEach(regime => {
      const b = agg(psSelectedExam, regime);
      const reg = std.regimes[regime];
      const total = reg.modules.reduce((s, m) => s + m.c, 0);
      html += `<div class="ps-regime"><div class="ps-regime-h"><span class="dot"></span>${regime === '2025+' ? '2025 起 · 政治理论独立成模块' : '2015–2024 · 政治理论并入常识'} · 共 ${total} 题${b.n ? ` · ${b.n} 套卷` : ''}</div>`;
      html += '<table class="ps-table"><tbody>';

      reg.modules.forEach(m => {
        const haveMod = b.mod[m.m] || 0;
        const avgMod = b.n ? Math.round(haveMod / b.n) : 0;
        const pctMod = m.c ? Math.round(avgMod / m.c * 100) : 0;
        const modLink = '#practice&module=' + m.m + '&exam=' + psSelectedExam;
        const modRight = haveMod > 0
          ? `<span class="n">≈${avgMod}/卷</span><span class="ps-have">已收 ${fmt(haveMod)} 题（${b.n} 套卷）</span><span class="ps-bar${pctMod < 100 ? ' low' : ''}"><i style="width:${Math.min(100, pctMod)}%"></i></span>`
          : '<span class="ps-empty">待补</span>';
        html += `<tr class="ps-link" data-go="${escapeAttr(modLink)}"><td class="ps-mod">${m.label}<span class="badge">${m.c}</span></td><td class="ps-count">${modRight}</td></tr>`;

        if (m.subs) {
          m.subs.forEach(s => {
            const tid = s[0], tname = s[1], stdc = s[2];
            const haveT = b.topic[tid] || 0;
            const link = '#practice&module=' + m.m + '&topic=' + tid + '&exam=' + psSelectedExam;
            if (stdc) {
              const avgT = b.n ? Math.round(haveT / b.n) : 0;
              const pctT = stdc ? Math.round(avgT / stdc * 100) : 0;
              const right = haveT > 0
                ? `${stdc} 题 · <span class="n">≈${avgT}/卷</span><span class="ps-have">已收 ${fmt(haveT)} 题</span><span class="ps-bar${pctT < 100 ? ' low' : ''}"><i style="width:${Math.min(100, pctT)}%"></i></span>`
                : `标准 ${stdc} 题 · <span class="ps-empty">待补</span>`;
              html += `<tr class="ps-sub ps-link" data-go="${escapeAttr(link)}"><td><span class="ps-tname">${tname}</span></td><td class="ps-count">${right}</td></tr>`;
            } else {
              const avgT = b.n ? Math.round(haveT / b.n) : 0;
              const right = haveT > 0
                ? `<span class="n">≈${avgT}/卷</span><span class="ps-have">已收 ${fmt(haveT)} 题（${b.n} 套卷）</span>`
                : '<span class="ps-empty">待补</span>';
              html += `<tr class="ps-sub ps-link" data-go="${escapeAttr(link)}"><td><span class="ps-tname">${tname}</span></td><td class="ps-count">${right}</td></tr>`;
            }
          });
        }
      });
      html += '</tbody></table></div>';
    });

    html += '<div class="ps-tip">说明：图形推理因题干含图、PDF 提取丢失较多，实收偏低；资料分析/篇章阅读的图表与长文材料缺失者暂无法完整作答。</div>';
    root.innerHTML = html;

    $$('#paperStructureRoot [data-go]').forEach(el => {
      el.onclick = () => { location.hash = el.dataset.go; };
    });
    $$('#paperStructureRoot .ps-seg button').forEach(btn => {
      btn.onclick = () => { psSelectedExam = btn.dataset.et; renderPaperStructure(); };
    });
  }

  // ===========================
  // 工具
  // ===========================
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // 优先渲染带图 HTML（qHtml/materialHtml/optionsHtml/explainHtml），否则转义文本
  // 图片加载失败时显示占位符，避免空白
  function richText(html, text) {
    if (html && /<img|<p|<div|<span|<br|<table|<ol|<ul/i.test(html)) {
      // 加固 <img> 渲染：标准化属性 + onload确认 + onerror兜底(显示路径便于排查)
      return html.replace(/<img([^>]*)>/gi, function(match, attrs) {
        if (attrs.indexOf('onerror') !== -1) return match; // 已有 onerror 不重复处理

        // 移除 width/height 中的 px 单位（浏览器容错但规范化更好）
        var cleanAttrs = attrs
          .replace(/\s*width="\d+px"/gi, function(m) { return m.replace('px', ''); })
          .replace(/\s*height="\d+px"/gi, function(m) { return m.replace('px', ''); });

        // 注意：onerror 属性用双引号界定，内部 JS 必须用单引号，否则属性会被提前截断
        return '<img' + cleanAttrs +
          ' onload="this.dataset.loaded=1"' +
          " onerror=\"this.style.display='none';var e=document.createElement('div');e.style.cssText='color:#e23b3b;font-size:12px;padding:8px;border:1px dashed #e23b3b;border-radius:6px;margin:4px 0;background:#fef2f2';e.innerHTML='<b>⚠ 图片加载失败</b><br><small style=color:#666>路径: '+this.src+'</small>';this.parentNode.insertBefore(e,this.nextSibling);this.dataset.loaded=0\">" +
          '>';
      });
    }
    return escapeHTML(text == null ? '' : text);
  }

  // 图片渲染后强制可见（只在真正加载失败时由 richText 的 onerror 报错，不提前隐藏）
  // 注意：平板慢网下图片可能 >100ms 才加载完，绝不能因 naturalWidth===0 就隐藏，
  // 否则会被永久 display:none 导致“一个图都不显示”。
  function revealImages(scopeSel) {
    setTimeout(function () {
      $$(scopeSel + ' img').forEach(function (img) {
        img.style.cssText += ';display:inline-block!important;visibility:visible!important;opacity:1!important;max-width:100%!important;height:auto!important;';
      });
    }, 50);
  }
  // 单个选项：优先图片版 optionsHtml[i]，否则转义文本
  function optInner(q, i) {
    const oh = (q.optionsHtml && q.optionsHtml[i]) || '';
    if (oh && /<img|<p|<div|<span|<br/i.test(oh)) return oh;
    return escapeHTML(q.options[i] == null ? '' : q.options[i]);
  }

  function bind() {
    // tab 切换
    $$('.tab').forEach(t => {
      t.onclick = e => {
        e.preventDefault();
        const name = t.dataset.go;
        if (name) location.hash = '#' + name;
      };
    });
    // 合并页分段 Tab（方法 / 数据中心 / 错题复习）与套卷模式切换（委托）
    document.addEventListener('click', function (e) {
      const tabBtn = e.target.closest && e.target.closest('.seg-tab');
      if (!tabBtn) return;
      const page = tabBtn.closest('.page');
      if (!page) return;
      const mode = tabBtn.getAttribute('data-mode');
      if (page.id === 'page-papers' && mode) {
        setPapersMode(mode);
      } else {
        switchSegInPage(page, tabBtn.getAttribute('data-tab'));
      }
    });
    $$('[data-back]').forEach(b => {
      b.onclick = () => { location.hash = '#' + b.dataset.back; };
    });
    // a 标签跳转（hash）
    $$('a[href^="#"]').forEach(a => {
      a.onclick = e => {
        if (a.getAttribute('href').length > 1) {
          // 让默认跳转发生
        }
      };
    });

    // 刷题筛选（浮动弹窗）
    function openFilterPanel() {
      var p = $('#filterPanel');
      var b = $('#fpBackdrop');
      p.classList.remove('hidden');
      // trigger reflow then animate in
      void p.offsetWidth;
      p.classList.add('show');
      b.classList.add('show');
      document.body.style.overflow = 'hidden'; // prevent background scroll
    }
    function closeFilterPanel() {
      var p = $('#filterPanel');
      var b = $('#fpBackdrop');
      p.classList.remove('show');
      b.classList.remove('show');
      document.body.style.overflow = '';
      // after animation, add hidden back
      setTimeout(function() { if (!p.classList.contains('show')) p.classList.add('hidden'); }, 320);
    }
    function toggleFilterPanel() {
      var p = $('#filterPanel');
      if (p.classList.contains('show') || !p.classList.contains('hidden')) {
        closeFilterPanel();
      } else {
        openFilterPanel();
      }
    }

    $('#toggleFilter').onclick = toggleFilterPanel;
    $('#toggleCustom').onclick = toggleFilterPanel;  // 自定义按钮也打开同一面板
    $('#fpClose').onclick = closeFilterPanel;
    $('#fpBackdrop').onclick = closeFilterPanel;
    // 场景预设
    $$('#fpPresets .fp-tag').forEach(t => {
      t.onclick = () => applyPreset(t.dataset.preset);
    });
    // 时间快捷（近5/10/20年）
    $$('#fpYearRange .fp-tag').forEach(t => {
      t.onclick = () => {
        const n = parseInt(t.dataset.range, 10);
        window.FilterState.yearRange = window.nearYears(n);
        window.FilterState.years = [];
        window.FilterState.rangeN = n;
        renderFilterPanel();
      };
    });
    // 来源（真题 / 高仿真）
    $$('#fpSource .fp-tag').forEach(t => {
      t.onclick = () => {
        window.FilterState.source = (t.dataset.src === 'all') ? null : t.dataset.src;
        renderFilterPanel();
      };
    });
    $('#fpApply').onclick = applyFilter;
    $('#fpClear').onclick = () => {
      window.FilterState = { years: [], yearRange: null, examTypes: [], topics: [], modules: [currentModule], examVolume: [], fullPaper: null, source: null, rangeN: null, _preset: null, difficulty: [], keypoints: [], kw: null, limit: null };
      renderFilterPanel();
      applyFilter();
    };
    $('#fpYearCustom').onclick = () => {
      const from = prompt('起始年份（如 2016）：');
      const to = prompt('截止年份（如 2021）：');
      if (from && to) {
        window.FilterState.yearRange = { from: parseInt(from), to: parseInt(to) };
        window.FilterState.years = [];
        window.FilterState.rangeN = null;
        renderFilterPanel();
      }
    };
    $('#fpPaper').onchange = () => {
      if ($('#fpPaper').value && !confirm('选择整套卷将忽略其他筛选条件，确定？')) {
        $('#fpPaper').value = '';
      }
      renderFilterPanel();
    };
    $('#checkBtn').onclick = checkAnswer;
    $('#nextBtn').onclick = nextQuestion;
    $('#prevBtn').onclick = prevQuestion;
    $('#favBtn').onclick = toggleFav;
    const gb = $('#guessBtn'); if (gb) gb.onclick = toggleGuess;

    // 每题工具栏
    const qm = $('#qtMark'); if (qm) qm.onclick = toggleMark;
    const qd = $('#qtDraft'); if (qd) qd.onclick = toggleDraft;
    const qf = $('#qtFav'); if (qf) qf.onclick = function () { toggleFav(); };

    // 答题卡
    $('#pSubmit').onclick = showAnswerCard;
    const acClose = $('#acClose'); if (acClose) acClose.onclick = hideAnswerCard;
    const acBack = $('#acBack'); if (acBack) acBack.onclick = hideAnswerCard;
    const acConfirm = $('#acConfirm'); if (acConfirm) acConfirm.onclick = confirmSubmit;

    // 模考
    $('#startExam').onclick = function () { startExam(selectedPaperId); };
    $('#epCat').onchange = buildExamPicker;
    $('#epYear').onchange = buildExamPicker;
    $('#eNext').onclick = examNext;
    $('#ePrev').onclick = examPrev;
    $('#eMark').onclick = examMark;
    $('#eDraft').onclick = toggleExamDraft;
    const egb = $('#examGuessBtn'); if (egb) egb.onclick = toggleExamGuess;
    $('#eSubmit').onclick = () => {
      if (confirm('确认交卷吗？')) submitExam();
    };
    $('#reviewBtn').onclick = () => {
      // 用错题本回顾看解析
      showPage('mistakes');
    };
    $('#againBtn').onclick = () => {
      renderExamIntro();
      $('#examTimer').textContent = fmtTime(EXAM_LEN);
      $('#examTimer').style.color = '';
    };

    // 真题套卷库
    $$('#ppCat .fp-tag').forEach(function (t) {
      t.onclick = function () {
        $$('#ppCat .fp-tag').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        renderPaperList();
      };
    });
    $('#ppYear').onchange = renderPaperList;
    $('#ppProv').onchange = renderPaperList;
    $('#pvPrev').onclick = pvPrev;
    $('#pvNext').onclick = pvNext;
    $('#pvPrevTop').onclick = pvPrev;
    $('#pvNextTop').onclick = pvNext;
    $('#pvCheck').onclick = pvCheck;
    // 每题右上角图标：收藏 / 草稿 / 标记
    $('#pvFav').onclick = pvToggleFav;
    $('#pvQDraft').onclick = pvToggleDraft;
    $('#pvQMark').onclick = pvToggleMark;
    // 顶部栏按钮
    $('#pvPauseBtn').onclick = togglePvPause;
    $('#pvDraftBtn').onclick = pvToggleDraft;
    $('#pvSubmitTop').onclick = function () {
      if (!paperViewList.length) return;
      var done = Object.keys(paperViewChecked).length;
      var left = paperViewList.length - done;
      var msg = '确认交卷？\n已做 ' + done + ' / ' + paperViewList.length + ' 题';
      if (left > 0) msg += '\n有 ' + left + ' 题未做（将按未答计）';
      if (confirm(msg)) submitPaperView();
    };
    // 底部答题卡
    $('#pvAsToggle').onclick = pvToggleAsSheet;
    // 草稿区操作（画笔/橡皮/颜色/撤销/清空按钮在 ensurePvPad 中惰性绑定）
    $('#pvDraftClear').onclick = pvClearDraft;
    var _pvDraftInput = $('#pvDraftInput');
    if (_pvDraftInput) _pvDraftInput.addEventListener('input', function () { pvSaveDraft(); });
    // 成绩单
    $('#pvReviewBtn').onclick = pvReview;
    $('#pvAgainBtn').onclick = pvAgain;
    $('#pvBackList').onclick = pvBackList;
    $('#pvBackList2').onclick = pvBackList;

    // 真题库首页 banner 动态统计
    (function () {
      var allp = window.BANK_PAPERS || [];
      var gk = allp.filter(function (p) { return p.volume === '行测' && paperCat(p) === 'gk'; }).length;
      var sh = allp.filter(function (p) { return p.volume === '行测' && paperCat(p) === 'sheng'; }).length;
      var sub = document.querySelector('#papersBannerSub');
      if (sub) sub.textContent = '国考 ' + gk + ' 套 · 省考 ' + sh + ' 套 · 一套一套刷';
    })();

    // 清空
    $('#clearMistakes').onclick = () => {
      if (confirm('清空错题本？')) {
        State.mistakes = [];
        saveState();
        renderMistakes();
      }
    };
    $('#clearFav').onclick = () => {
      if (confirm('清空收藏夹？')) {
        State.favorites = [];
        saveState();
        renderFavorites();
      }
    };

    // 备份 / 导入（一键存 D 盘）
    const bb = $('#backupBtn'); if (bb) bb.onclick = () => {
      if (window.Store) { window.Store.exportBackup(); toast('已导出备份 JSON，请存到 D 盘'); }
    };
    const ib = $('#importBtn'); if (ib) ib.onclick = () => { const f = $('#importFile'); if (f) f.click(); };
    const imp = $('#importFile'); if (imp) imp.onchange = () => {
      const file = imp.files[0];
      if (file && window.Store) window.Store.importBackup(file, ok => toast(ok ? '导入成功，刷新后生效' : '导入失败'));
    };

    // hash 路由
    window.addEventListener('hashchange', () => {
      // 兼容 #practice&module=xxx 与 #practice?module=xxx 两种写法
      showPage();
    });
  }

  // ===========================
  // Pad / 触屏模式（自动适配 + 手动开关）
  // 说明：pad.css 里 @media (pointer:coarse),(max-width:1100px) 已能在真实平板
  // 自动套用大屏排版（无需 JS）。此处再加：① 自动时给 <body> 加 .pad 便于 JS 判定；
  // ② 手动「平板 / 手机」开关 + ?pad=1 / ?pad=0 URL 覆盖，方便在电脑预览或强制视图。
  // ===========================
  var PAD_MODE_KEY = 'sat_pad_mode'; // 'auto' | 'pad' | 'phone'
  function applyPadMode() {
    var mode = localStorage.getItem(PAD_MODE_KEY) || 'auto';
    var pm = new URLSearchParams(location.search).get('pad');
    if (pm === '1') mode = 'pad';
    else if (pm === '0') mode = 'phone';
    var on = false, off = false;
    if (mode === 'pad') { on = true; }
    else if (mode === 'phone') { off = true; }
    else { // auto：粗指针(触屏/电容笔) 或 视口较窄 → 大屏排版
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      on = !!(coarse || window.innerWidth <= 1100);
    }
    document.body.classList.toggle('pad', on);
    document.body.classList.toggle('pad-off', off);
    return mode;
  }
  // 脚本加载即判定一次（早于 boot，避免平板首屏闪烁），并随尺寸变化（仅 auto 模式）刷新
  applyPadMode();
  var _padTimer;
  function _onResize() {
    if ((localStorage.getItem(PAD_MODE_KEY) || 'auto') !== 'auto') return; // 手动模式不随尺寸跳变
    clearTimeout(_padTimer);
    _padTimer = setTimeout(applyPadMode, 200);
  }
  window.addEventListener('resize', _onResize);
  window.addEventListener('orientationchange', function () { setTimeout(applyPadMode, 300); });

  // 在学习体验页注入「显示与模式」设置卡（平板/手机切换）
  function injectDisplaySettings(el) {
    if (!el) return;
    var mode = localStorage.getItem(PAD_MODE_KEY) || 'auto';
    var labels = { auto: '自动', pad: '平板', phone: '手机' };
    var wrap = document.createElement('section');
    wrap.className = 'card ds-card';
    wrap.innerHTML =
      '<div class="card-head"><div class="card-title">📱 显示与模式</div></div>' +
      '<div class="ds-row">' +
        '<div class="ds-label">平板 / 触屏大屏排版</div>' +
        '<div class="ds-seg" id="dsSeg">' +
          '<button data-m="auto" class="' + (mode === 'auto' ? 'active' : '') + '">自动</button>' +
          '<button data-m="pad" class="' + (mode === 'pad' ? 'active' : '') + '">平板</button>' +
          '<button data-m="phone" class="' + (mode === 'phone' ? 'active' : '') + '">手机</button>' +
        '</div>' +
      '</div>' +
      '<div class="ds-hint">「自动」会在 Pad / 触屏上自动用大屏排版（推荐）；「平板」强制大屏，方便在电脑预览；「手机」强制单列手机视图。</div>';
    el.appendChild(wrap);
    var seg = wrap.querySelector('#dsSeg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var m = b.getAttribute('data-m');
      localStorage.setItem(PAD_MODE_KEY, m);
      seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
      applyPadMode();
      toast('已切换为：' + (labels[m] || m));
    });
  }

  // ===========================
  // 启动
  // ===========================
  loadState();
  function boot() {
    if (window.Store) window.Store.init();
    bind();
    // 重建整套卷索引
    if (typeof window.rebuildPapers === 'function') window.rebuildPapers();
    // 首次访问写入 days 今天
    const tk = todayKey();
    State.lastVisit = tk;
    if (State.days[tk] === undefined) State.days[tk] = 0;
    saveState();
    showPage();
    // 倒计时走钟（每秒刷新，不仅首页——任何页面都保持倒计时准确）
    (function tick() {
      const target = nextExamDate();
      const now = new Date();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      const d = Math.floor(diff / 86400);
      const hh = Math.floor((diff % 86400) / 3600);
      const mm = Math.floor((diff % 3600) / 60);
      const ss = diff % 60;
      const el = $('#countdown');
      if (el) el.textContent = d + '天 ' + String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
      setTimeout(tick, 1000);
    })();
    // 每日一思
    const quotes = [
      '今日一思：把每一道错题当作必考点。',
      '今日一思：慢就是快，把会的稳拿。',
      '今日一思：考场上少丢分就是多得分。',
      '今日一思：先易后难，永远对得起会的题。',
      '今日一思：行测靠题感，申论靠积累。',
      '今日一思：别和难题死磕，跳过去回头更值。',
      '今日一思：今天的 5 分钟，就是上岸的基石。',
    ];
    const d = new Date().getDate();
    $('#todayQuote').textContent = quotes[d % quotes.length];
    // 全部就绪信号：供真实浏览器测试与外层判定使用
    window.__APP_READY__ = true;
  }
  // 启动需同时满足：① DOM 解析完成 ② 真题库(bank)异步加载完成
  var _domReady = (document.readyState !== 'loading');
  var _bankReady = !!window.BANK_READY;
  function _maybeBoot() {
    if (_domReady && _bankReady) boot();
  }
  if (!_domReady) document.addEventListener('DOMContentLoaded', function () { _domReady = true; _maybeBoot(); });
  if (window.onBankReady) window.onBankReady(function () { _bankReady = true; _maybeBoot(); });
  else _bankReady = true; // 兜底：loader 未注入时直接启动
  _maybeBoot();

  // 暴露给 P1+ 模块（诊断 / 训练闭环 / 战术复盘）读取逐题作答数据；纯本地，无外传
  window.SAT = {
    get state() { return State; },
    classify: classify,
    SLOW_MS: SLOW_MS,
    qById(id) {
      for (const k of Object.keys(window.QB || {})) {
        const f = (window.QB[k] || []).find(q => q.id === id);
        if (f) return f;
      }
      return null;
    },
    moduleOf(id) {
      for (const k of Object.keys(window.QB || {})) {
        if ((window.QB[k] || []).some(q => q.id === id)) return k;
      }
      return null;
    },
    toast: toast,
    // 从搜题/其他模块直接跳到刷题页做这一题
    practiceOne(q) {
      if (!q) return;
      pendingSingle = q;
      showPage('practice');
    },
    // 按 id 收藏/取消，返回 true=已收藏
    toggleFavById(id) {
      const i = State.favorites.indexOf(id);
      let added;
      if (i > -1) { State.favorites.splice(i, 1); added = false; }
      else { State.favorites.push(id); added = true; }
      saveState();
      toast(added ? '已收藏 ⭐' : '已取消收藏');
      return added;
    }
  };
})();
