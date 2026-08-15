/* 上岸通 · 智能训练闭环 (P1)
 * 依赖：window.SAT / window.QB / window.KnowledgeTree / window.Store
 * 暴露：window.Training = { mount(rootEl) }
 *
 * 训练闭环三来源合流：
 *   a) 错题重练      —— State.mistakes 中「尚未排期」的新错题
 *   b) 薄弱题型专练  —— 按 topic 统计错误率>40% 且样本≥3 的薄弱题型，各拉≤3 道 QB 新题
 *   c) 间隔复习(FSRS-lite) —— State.training.reviews[qid]，到期(due<=now)者优先
 * 交叉编排(interleaving)：混合模块、避免同题型扎堆。
 */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var STORAGE_KEY = 'shangAnTong_v1';
  var DAY = 86400000;
  var INTERVALS = [1, 2, 4, 7, 15, 30]; // 复习间隔阶梯（天）
  var MASTER_TARGET = 3;                 // 连对达标门槛
  var SLOW_MS = { changshi: 20000, yanyu: 60000, shuliang: 90000, panduan: 70000, ziliao: 90000, shenlun: 120000 };
  var MOD_NAME = { changshi: '常识判断', yanyu: '言语理解', shuliang: '数量关系', panduan: '判断推理', ziliao: '资料分析', shenlun: '申论' };
  var SRC_META = {
    review:  { label: '间隔复习', cls: 'tr-b-review' },
    mistake: { label: '错题重练', cls: 'tr-b-mistake' },
    weak:    { label: '薄弱专练', cls: 'tr-b-weak' }
  };

  // ---------- 模块级运行态 ----------
  var ROOT = null;   // 挂载容器
  var S = null;      // window.SAT.state 引用
  var session = null;
  var qTimerId = null;
  var trPad = null;        // 共享 Scratchpad 实例
  var trCurQid = null;     // 当前题 qid（草稿按题持久化）
  var trDraftOverlay = null;

  // ---------- 基础工具 ----------
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    return e;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 优先渲染带图 HTML（materialHtml/qHtml/optionsHtml/explainHtml），否则转义纯文本
  // 与练习/模考模式共用同一套规则，保证资料分析/图形推理图题在训练里也能出图
  function richText(html, text) {
    if (html && /<img|<p|<div|<span|<br|<table|<ol|<ul/i.test(html)) {
      return html.replace(/<img([^>]*)>/gi, function (match, attrs) {
        if (attrs.indexOf('onerror') !== -1) return match;
        var cleanAttrs = attrs
          .replace(/\s*width="\d+px"/gi, function (m) { return m.replace('px', ''); })
          .replace(/\s*height="\d+px"/gi, function (m) { return m.replace('px', ''); });
        // onerror 属性用双引号界定，内部 JS 必须用单引号
        return '<img' + cleanAttrs +
          ' onload="this.dataset.loaded=1"' +
          " onerror=\"this.style.display='none';var e=document.createElement('div');e.style.cssText='color:#e23b3b;font-size:12px;padding:8px;border:1px dashed #e23b3b;border-radius:6px;margin:4px 0;background:#fef2f2';e.innerHTML='<b>⚠ 图片加载失败</b><br><small style=color:#666>路径: '+this.src+'</small>';this.parentNode.insertBefore(e,this.nextSibling);this.dataset.loaded=0\">" +
          '>';
      });
    }
    return esc(text == null ? '' : text);
  }
  // 单个选项：优先图片版 optionsHtml[i]（图形推理选项图），否则转义文本
  function optInner(q, i) {
    var oh = (q.optionsHtml && q.optionsHtml[i]) || '';
    if (oh && /<img|<p|<div|<span|<br/i.test(oh)) return oh;
    return esc(q.options[i] == null ? '' : q.options[i]);
  }
  // 图片渲染后强制可见 + 失败兜底（与练习/模考一致）
  function revealImages(root) {
    setTimeout(function () {
      var imgs = root.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        img.style.cssText += ';display:inline-block!important;visibility:visible!important;opacity:1!important;max-width:100%!important;height:auto!important;';
        if (img.naturalWidth === 0 && img.dataset.loaded !== '1' && img.dataset.loaded !== '0') {
          if (!img.dataset.errShown) {
            img.dataset.errShown = '1';
            img.style.display = 'none';
            var e = document.createElement('div');
            e.style.cssText = 'color:#e23b3b;font-size:12px;padding:8px;border:1px dashed #e23b3b;border-radius:6px;margin:4px 0;background:#fef2f2';
            e.innerHTML = '<b>⚠ 图片加载失败</b><br><small style="color:#666">路径: ' + (img.getAttribute('src') || '') + '</small>';
            if (img.parentNode) img.parentNode.insertBefore(e, img.nextSibling);
          }
        }
      }
    }, 100);
  }
  function fmtSec(s) {
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (ss < 10 ? '0' + ss : ss);
  }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function toast(msg, ms) {
    var t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, ms || 1500);
  }
  function persist() {
    try {
      if (window.Store && typeof window.Store.set === 'function') window.Store.set(STORAGE_KEY, S);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    } catch (e) {}
  }
  function clearTimer() { if (qTimerId) { clearInterval(qTimerId); qTimerId = null; } }

  // ---------- 训练草稿板（共享 Scratchpad：电容笔压感 + 手掌防误触） ----------
  function ensureTrDraftOverlay() {
    if (trDraftOverlay) return;
    var ov = el('div', { class: 'draft-overlay hidden', id: 'trDraftOverlay' });
    ov.innerHTML = ''
      + '<div class="draft-bar"><span class="draft-title">✏️ 草稿板</span><div class="draft-tools">'
      + '<button class="draft-tool-btn" id="trDraftPen" title="画笔">✏️ 画笔</button>'
      + '<button class="draft-tool-btn" id="trDraftEraser" title="橡皮">🧹 橡皮</button>'
      + '<button class="draft-tool-btn" id="trDraftUndo" title="撤销">↩ 撤销</button>'
      + '<button class="draft-tool-btn" id="trDraftClear" title="清空">🗑️ 清空</button>'
      + '<button class="draft-tool-btn primary" id="trDraftClose" title="关闭">✕ 关闭</button>'
      + '</div></div><canvas id="trDraftCanvas"></canvas>';
    document.body.appendChild(ov);
    trDraftOverlay = ov;
    trPad = new Scratchpad(document.getElementById('trDraftCanvas'), {
      key: function () { return trCurQid ? 'draft_training_' + trCurQid : null; },
      penWidth: 3, eraserWidth: 28
    });
    var pen = document.getElementById('trDraftPen');
    var er = document.getElementById('trDraftEraser');
    if (pen) { pen.classList.add('active'); pen.onclick = function () { trPad.setTool('pen'); pen.classList.add('active'); if (er) er.classList.remove('active'); }; }
    if (er) er.onclick = function () { trPad.setTool('eraser'); er.classList.add('active'); if (pen) pen.classList.remove('active'); };
    var undo = document.getElementById('trDraftUndo'); if (undo) undo.onclick = function () { trPad.undo(); };
    var clr = document.getElementById('trDraftClear'); if (clr) clr.onclick = function () { trPad.clear(); };
    var close = document.getElementById('trDraftClose'); if (close) close.onclick = closeTrDraft;
  }
  function openTrDraft() {
    ensureTrDraftOverlay();
    if (trDraftOverlay) trDraftOverlay.classList.remove('hidden');
    requestAnimationFrame(function () { if (trPad) trPad.resize(); });
  }
  function closeTrDraft() { if (trDraftOverlay) trDraftOverlay.classList.add('hidden'); }
  function toggleTrDraft() {
    if (trDraftOverlay && !trDraftOverlay.classList.contains('hidden')) closeTrDraft();
    else openTrDraft();
  }
  function trDraftBtn() {
    var b = el('button', { class: 'btn-ghost', id: 'trDraftBtn' }, '✏️ 草稿');
    b.onclick = toggleTrDraft;
    return b;
  }

  // ---------- SAT / 知识点树 安全封装 ----------
  function qById(id) {
    if (window.SAT && typeof window.SAT.qById === 'function') return window.SAT.qById(id);
    return null;
  }
  function moduleOf(id) {
    if (window.SAT && typeof window.SAT.moduleOf === 'function') return window.SAT.moduleOf(id);
    return null;
  }
  function infer(q, mod) {
    if (!q || !window.KnowledgeTree || typeof window.KnowledgeTree.infer !== 'function') return null;
    try { return window.KnowledgeTree.infer(q, mod); } catch (e) { return null; }
  }
  function classifyCode(correct, guess, ms, mod) {
    if (window.SAT && typeof window.SAT.classify === 'function') return window.SAT.classify(correct, guess, ms, mod);
    var slow = ms > (SLOW_MS[mod] || 60000);
    if (correct && !guess && !slow) return 'R1';
    if (correct && !guess && slow) return 'R2';
    if (correct && guess) return 'R3';
    if (!correct && !guess && !slow) return 'R4';
    if (!correct && !guess && slow) return 'R5';
    return 'R6';
  }

  // ---------- 训练数据结构维护 ----------
  function ensureTraining() {
    if (!S.training || typeof S.training !== 'object') S.training = {};
    if (!S.training.reviews || typeof S.training.reviews !== 'object') S.training.reviews = {};
    if (!S.training.mastery || typeof S.training.mastery !== 'object') S.training.mastery = {};
    if (!Array.isArray(S.mistakes)) S.mistakes = [];
    if (!Array.isArray(S.attempts)) S.attempts = [];
    if (!Array.isArray(S.history)) S.history = [];
    if (!S.days || typeof S.days !== 'object') S.days = {};
  }

  // 薄弱题型：按 topicId 聚合 attempts，错误率>40% 且样本≥3
  function computeWeakTopics() {
    var map = {};
    (S.attempts || []).forEach(function (a) {
      if (!a || !a.id) return;
      var q = qById(a.id);
      if (!q) return;
      var mod = a.module || moduleOf(a.id);
      var inf = infer(q, mod);
      if (!inf || !inf.topicId) return;
      var key = inf.topicId;
      if (!map[key]) map[key] = { topicId: inf.topicId, topicName: inf.topicName || key, module: inf.module || mod, total: 0, wrong: 0 };
      map[key].total++;
      if (!a.correct) map[key].wrong++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (t) { return t.total >= 3 && (t.wrong / t.total) > 0.4; })
      .sort(function (a, b) { return (b.wrong / b.total) - (a.wrong / a.total); });
  }

  // 混合模块编排：桶装后轮转出队，避免同模块扎堆
  function interleaveByModule(items) {
    var buckets = {};
    items.forEach(function (it) { (buckets[it.module] = buckets[it.module] || []).push(it); });
    var keys = Object.keys(buckets);
    var out = [], added = true;
    while (added) {
      added = false;
      shuffle(keys);
      for (var i = 0; i < keys.length; i++) {
        var b = buckets[keys[i]];
        if (b.length) { out.push(b.shift()); added = true; }
      }
    }
    return out;
  }

  function buildItem(q, qid, mod, source) {
    var inf = infer(q, mod);
    return {
      qid: qid, q: q, module: mod, source: source,
      topicId: inf ? inf.topicId : null,
      topicName: inf ? inf.topicName : (MOD_NAME[mod] || '')
    };
  }

  // 组建今日训练队列
  function buildQueue() {
    ensureTraining();
    var now = Date.now();
    var reviews = S.training.reviews;
    var seen = {};
    var due = [], fresh = [], weakQ = [];

    // c) 间隔复习：到期者优先
    Object.keys(reviews).forEach(function (qid) {
      var r = reviews[qid];
      if (!r || r.due > now) return;
      var q = qById(qid);
      if (!q) return;
      due.push(buildItem(q, qid, moduleOf(qid), 'review'));
      seen[qid] = 1;
    });
    shuffle(due);

    // a) 错题重练：仅纳入「尚未排期」的新错题（已排期者由复习队列按 due 管理）
    (S.mistakes || []).forEach(function (qid) {
      if (seen[qid] || reviews[qid]) return;
      var q = qById(qid);
      if (!q) return;
      fresh.push(buildItem(q, qid, moduleOf(qid), 'mistake'));
      seen[qid] = 1;
    });

    // b) 薄弱题型专练：每个薄弱 topic 拉 ≤3 道 QB 新题（排除错题本 & 已排期）
    var weak = computeWeakTopics();
    weak.forEach(function (t) {
      var pool = (window.QB && window.QB[t.module]) || [];
      var shuffled = shuffle(pool.slice());
      var picked = 0;
      for (var i = 0; i < shuffled.length && picked < 3; i++) {
        var q = shuffled[i];
        if (!q || !q.id || seen[q.id]) continue;
        if ((S.mistakes || []).indexOf(q.id) >= 0) continue;
        if (reviews[q.id] && reviews[q.id].due > now) continue;
        var inf = infer(q, t.module);
        if (!inf || inf.topicId !== t.topicId) continue;
        weakQ.push(buildItem(q, q.id, t.module, 'weak'));
        seen[q.id] = 1;
        picked++;
      }
    });

    // 交叉编排：复习在前，其余混合模块打散
    var rest = interleaveByModule(shuffle(fresh.concat(weakQ)));
    return { queue: due.concat(rest), weak: weak };
  }

  // ---------- 作答后：状态回写 ----------
  function updateReview(qid, correct) {
    var reviews = S.training.reviews;
    var r = reviews[qid] || { due: 0, interval: 0, streak: 0 };
    if (correct) {
      var nextStreak = (r.streak || 0) + 1;
      var idx = Math.min(nextStreak - 1, INTERVALS.length - 1);
      var interval = INTERVALS[idx];
      reviews[qid] = { due: Date.now() + interval * DAY, interval: interval, streak: nextStreak };
    } else {
      reviews[qid] = { due: Date.now(), interval: 1, streak: 0 };
    }
  }
  function updateMastery(topicId, correct) {
    if (!topicId) return;
    var m = S.training.mastery;
    m[topicId] = correct ? (m[topicId] || 0) + 1 : 0;
  }

  // ========================================================
  //  渲染
  // ========================================================
  function mount(rootEl) {
    ROOT = rootEl;
    clearTimer();
    if (!rootEl) return;
    rootEl.innerHTML = '';
    injectStyle();

    if (!window.SAT || !window.SAT.state) {
      rootEl.appendChild(el('div', { class: 'empty card' }, '训练数据未就绪，请稍后重试。'));
      return;
    }
    S = window.SAT.state;
    ensureTraining();

    var hasAttempts = S.attempts && S.attempts.length;
    var hasMistakes = S.mistakes && S.mistakes.length;
    if (!hasAttempts && !hasMistakes) {
      rootEl.appendChild(renderEmptyState());
      return;
    }
    start();
  }

  function renderEmptyState() {
    var box = el('div', { class: 'card tr-empty' });
    box.appendChild(el('div', { class: 'tr-empty-ico' }, '🎯'));
    box.appendChild(el('div', { class: 'tr-empty-title' }, '还没有训练素材'));
    box.appendChild(el('div', { class: 'tr-empty-sub' }, '先去刷点题，训练会基于你的错因自动生成队列'));
    var btn = el('button', { class: 'btn-primary big' }, '去刷题 →');
    btn.onclick = function () { location.hash = '#practice'; };
    box.appendChild(btn);
    return box;
  }

  // 开始 / 重建一组
  function start() {
    clearTimer();
    var built = buildQueue();
    session = { queue: built.queue, weak: built.weak, idx: 0, answered: false, selected: null, qStart: 0 };
    render();
  }

  function render() {
    clearTimer();
    ROOT.innerHTML = '';

    // 队列耗尽 / 无题
    if (!session.queue.length || session.idx >= session.queue.length) {
      ROOT.appendChild(renderMastery());
      ROOT.appendChild(renderDone());
      return;
    }

    ROOT.appendChild(renderSummary());
    ROOT.appendChild(renderMastery());
    ROOT.appendChild(renderQuestion());
  }

  // 队列概览
  function renderSummary() {
    var counts = { review: 0, mistake: 0, weak: 0 };
    session.queue.forEach(function (it) { counts[it.source] = (counts[it.source] || 0) + 1; });
    var total = session.queue.length;
    var done = session.idx + (session.answered ? 1 : 0);

    var card = el('div', { class: 'card tr-summary' });
    var head = el('div', { class: 'tr-sum-head' });
    head.appendChild(el('div', { class: 'tr-sum-title' }, '今日训练队列'));
    head.appendChild(el('div', { class: 'tr-sum-prog' }, '第 ' + Math.min(session.idx + 1, total) + ' / ' + total + ' 题'));
    card.appendChild(head);

    var bar = el('div', { class: 'tr-progress' });
    var fill = el('div', { class: 'tr-progress-fill' });
    fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    bar.appendChild(fill);
    card.appendChild(bar);

    var chips = el('div', { class: 'tr-chips' });
    chips.appendChild(chip('间隔复习', counts.review, 'tr-b-review'));
    chips.appendChild(chip('错题重练', counts.mistake, 'tr-b-mistake'));
    chips.appendChild(chip('薄弱专练', counts.weak, 'tr-b-weak'));
    card.appendChild(chips);
    return card;
  }
  function chip(label, n, cls) {
    var c = el('span', { class: 'tr-chip ' + cls });
    c.appendChild(el('b', null, String(n)));
    c.appendChild(document.createTextNode(' ' + label));
    return c;
  }

  // 掌握度门禁
  function renderMastery() {
    var weak = (session && session.weak) || [];
    var card = el('div', { class: 'card tr-mastery' });
    var head = el('div', { class: 'tr-m-head' });
    head.appendChild(el('div', { class: 'tr-m-title' }, '掌握度门禁'));
    head.appendChild(el('div', { class: 'tr-m-sub' }, '连对 ' + MASTER_TARGET + ' 次即达标'));
    card.appendChild(head);

    if (!weak.length) {
      card.appendChild(el('div', { class: 'tr-m-none' }, '暂无薄弱题型（错误率均低于 40%），继续保持 👍'));
      return card;
    }
    weak.forEach(function (t) {
      var streak = (S.training.mastery[t.topicId] || 0);
      var cur = Math.min(streak, MASTER_TARGET);
      var mastered = streak >= MASTER_TARGET;
      var row = el('div', { class: 'tr-topic' });
      var top = el('div', { class: 'tr-topic-top' });
      top.appendChild(el('span', { class: 'tr-topic-name' }, (MOD_NAME[t.module] || '') + ' · ' + (t.topicName || t.topicId)));
      var badge = el('span', { class: 'tr-topic-badge' + (mastered ? ' ok' : '') }, mastered ? '已掌握' : (cur + '/' + MASTER_TARGET));
      top.appendChild(badge);
      row.appendChild(top);
      var track = el('div', { class: 'tr-topic-track' });
      var f = el('div', { class: 'tr-topic-fill' + (mastered ? ' ok' : '') });
      f.style.width = Math.round(cur / MASTER_TARGET * 100) + '%';
      track.appendChild(f);
      row.appendChild(track);
      var meta = el('div', { class: 'tr-topic-meta' }, '历史错误率 ' + Math.round(t.wrong / t.total * 100) + '%（' + t.wrong + '/' + t.total + '）');
      row.appendChild(meta);
      card.appendChild(row);
    });
    return card;
  }

  // 当前题目
  function renderQuestion() {
    var item = session.queue[session.idx];
    var q = item.q;
    trCurQid = item.qid;
    var noOpt = !q.options || !q.options.length;
    var meta = SRC_META[item.source] || SRC_META.mistake;

    var card = el('div', { class: 'card question-card tr-q' });

    // 标签行：来源 + 题型 + 逐题计时
    var tagRow = el('div', { class: 'tr-tagrow' });
    tagRow.appendChild(el('span', { class: 'tr-badge ' + meta.cls }, meta.label));
    var typeTxt = [(MOD_NAME[item.module] || ''), item.topicName].filter(Boolean).join(' · ');
    tagRow.appendChild(el('span', { class: 'q-type' }, typeTxt));
    var timer = el('span', { class: 'q-timer tr-timer' }, '00:00');
    tagRow.appendChild(timer);
    card.appendChild(tagRow);

    // 材料（资料分析图表常在此，支持图片）
    if (q.material || q.materialHtml) {
      var matNode = el('div', { class: 'q-material' });
      matNode.innerHTML = richText(q.materialHtml, q.material);
      card.appendChild(matNode);
    }
    // 题干（支持图片）
    var stemNode = el('div', { class: 'q-stem' });
    stemNode.innerHTML = richText(q.qHtml, q.q);
    card.appendChild(stemNode);

    // 选项
    var opts = el('div', { class: 'q-options' });
    if (noOpt) {
      opts.appendChild(el('div', { class: 'tr-noopt' }, '（本题为主观题，提交后查看参考要点）'));
    } else {
      q.options.forEach(function (opt, i) {
        var o = el('div', { class: 'opt', 'data-i': i });
        o.appendChild(el('span', { class: 'opt-letter' }, String.fromCharCode(65 + i)));
        var ot = el('span', { class: 'opt-text' });
        ot.innerHTML = optInner(q, i);
        o.appendChild(ot);
        o.onclick = function () {
          if (session.answered) return;
          session.selected = i;
          Array.prototype.forEach.call(opts.querySelectorAll('.opt'), function (x, xi) {
            x.classList.toggle('selected', xi === i);
          });
        };
        opts.appendChild(o);
      });
    }
    card.appendChild(opts);

    // 答案区（提交后填充）
    var ansBox = el('div', { class: 'q-answer hidden tr-ans' });
    card.appendChild(ansBox);

    // 操作区
    var actions = el('div', { class: 'tr-actions' });
    var submitBtn = el('button', { class: 'btn-primary tr-submit' }, '提交');
    submitBtn.onclick = function () { submitAnswer(card, opts, ansBox, submitBtn, actions); };
    actions.appendChild(submitBtn);
    actions.appendChild(trDraftBtn());
    card.appendChild(actions);

    // 启动逐题计时
    session.answered = false;
    session.selected = null;
    session.qStart = Date.now();
    qTimerId = setInterval(function () {
      if (!session.qStart) return;
      timer.textContent = fmtSec((Date.now() - session.qStart) / 1000);
    }, 500);

    revealImages(card);
    return card;
  }

  function submitAnswer(card, opts, ansBox, submitBtn, actions) {
    if (session.answered) return;
    var item = session.queue[session.idx];
    var q = item.q;
    var noOpt = !q.options || !q.options.length;
    if (!noOpt && session.selected == null) { toast('请先选择一个答案'); return; }

    session.answered = true;
    clearTimer();
    var ms = session.qStart ? (Date.now() - session.qStart) : 0;
    var isCorrect = noOpt ? true : (session.selected === q.answer);

    // 选项高亮
    if (!noOpt) {
      Array.prototype.forEach.call(opts.querySelectorAll('.opt'), function (x, i) {
        x.onclick = null;
        x.classList.remove('selected');
        if (i === q.answer) x.classList.add('correct');
        if (i === session.selected && session.selected !== q.answer) x.classList.add('wrong');
      });
    }

    // 错题本：答错入库；答对不自动移出（由间隔复习/标记掌握管理）
    if (!isCorrect && S.mistakes.indexOf(item.qid) < 0) S.mistakes.push(item.qid);
    // 复习排期 + 掌握度
    updateReview(item.qid, isCorrect);
    updateMastery(item.topicId, isCorrect);
    // 作答记录（paper:'training' 反哺诊断）
    var code = classifyCode(isCorrect, false, ms, item.module);
    S.history.push({ id: item.qid, module: item.module, correct: isCorrect, ts: Date.now() });
    S.attempts.push({ id: item.qid, module: item.module, selected: session.selected == null ? -1 : session.selected, correct: isCorrect, ms: ms, guess: false, code: code, ts: Date.now(), paper: 'training' });
    var tk = todayKey(); S.days[tk] = (S.days[tk] || 0) + 1;
    persist();

    // 反馈区
    ansBox.classList.remove('hidden');
    ansBox.innerHTML = '';
    var row = el('div', { class: 'ans-row' });
    row.appendChild(el('span', { class: 'ans-label' }, '正确答案'));
    row.appendChild(el('span', { class: 'ans-value' }, noOpt ? '参考要点' : String.fromCharCode(65 + q.answer)));
    var tag = el('span', { class: 'ans-tag ' + (isCorrect ? 'correct' : 'wrong') }, noOpt ? '要点参考' : (isCorrect ? '答对了 🎉' : '答错了'));
    row.appendChild(tag);
    ansBox.appendChild(row);
    ansBox.appendChild(el('div', { class: 'ans-explain', html: richText(q.explainHtml, q.explain || '（暂无解析）') }));

    // 刷新概览 + 掌握度（连对数变化）
    var sumEl = ROOT.querySelector('.tr-summary');
    if (sumEl) sumEl.replaceWith(renderSummary());
    var masEl = ROOT.querySelector('.tr-mastery');
    if (masEl) masEl.replaceWith(renderMastery());

    // 操作区切换为：下一题 / 标记掌握 / 退出训练
    actions.innerHTML = '';
    actions.className = 'tr-actions tr-actions-3';
    var last = session.idx >= session.queue.length - 1;
    var nextBtn = el('button', { class: 'btn-primary' }, last ? '完成 →' : '下一题 →');
    nextBtn.onclick = nextQuestion;
    var masterBtn = el('button', { class: 'btn-ghost warn' }, '标记掌握');
    masterBtn.onclick = markMastered;
    var exitBtn = el('button', { class: 'btn-ghost danger' }, '退出训练');
    exitBtn.onclick = exitTraining;
    actions.appendChild(nextBtn);
    actions.appendChild(masterBtn);
    actions.appendChild(exitBtn);
    actions.appendChild(trDraftBtn());

    toast(noOpt ? '已展示参考要点' : (isCorrect ? '✅ 答对了' : '❌ 答错了，已进错题本'));
  }

  function nextQuestion() {
    session.idx++;
    session.answered = false;
    session.selected = null;
    render();
  }

  function markMastered() {
    var item = session.queue[session.idx];
    if (!item) return;
    // 移出错题本 + 排到远期，短期内不再出现
    S.mistakes = (S.mistakes || []).filter(function (x) { return x !== item.qid; });
    S.training.reviews[item.qid] = { due: Date.now() + 30 * DAY, interval: 30, streak: INTERVALS.length };
    updateMastery(item.topicId, true);
    // 从后续队列剔除同 qid，避免同一题再次出现
    session.queue = session.queue.filter(function (it, i) { return i <= session.idx || it.qid !== item.qid; });
    persist();
    toast('👍 已标记掌握');
    nextQuestion();
  }

  function exitTraining() {
    clearTimer();
    location.hash = '#home';
  }

  // 队列完成 / 无题
  function renderDone() {
    var card = el('div', { class: 'card tr-done' });
    var everHad = session && session.queue && session.queue.length;
    card.appendChild(el('div', { class: 'tr-done-ico' }, everHad ? '🎉' : '✨'));
    card.appendChild(el('div', { class: 'tr-done-title' }, everHad ? '今日训练完成' : '暂无待训练题目'));
    card.appendChild(el('div', { class: 'tr-done-sub' }, everHad
      ? '错题、薄弱题型与到期复习都已练完，明天再来巩固吧'
      : '错题已清、无明显薄弱题型、复习尚未到期'));
    var again = el('button', { class: 'btn-primary big' }, '🔄 再来一组');
    again.onclick = start;
    card.appendChild(again);
    var go = el('button', { class: 'btn-ghost tr-done-go' }, '去刷题 →');
    go.onclick = function () { location.hash = '#practice'; };
    card.appendChild(go);
    return card;
  }

  // ========================================================
  //  自注入样式（浅色主题）
  // ========================================================
  function injectStyle() {
    if (document.getElementById('training-style')) return;
    var css = ''
      + '#trainingRoot{--primary:#5b6cff;--warn:#ff9f43;--success:#22c55e;--info:#06b6d6;--text:#1f2330;--text-2:#6b7280;--text-3:#9ca3af;--border:#eef0f5;--shadow:0 2px 14px rgba(31,35,48,.06);--radius:14px;}'
      + '.tr-empty,.tr-done{text-align:center;padding:26px 18px;}'
      + '.tr-empty-ico,.tr-done-ico{font-size:40px;line-height:1;margin-bottom:10px;}'
      + '.tr-empty-title,.tr-done-title{font-weight:800;font-size:17px;color:var(--text);}'
      + '.tr-empty-sub,.tr-done-sub{font-size:13px;color:var(--text-3);margin:8px 0 4px;line-height:1.6;}'
      + '.tr-done-go{width:100%;margin-top:10px;}'
      + '.tr-summary .tr-sum-head{display:flex;align-items:center;justify-content:space-between;}'
      + '.tr-sum-title{font-weight:800;font-size:15px;color:var(--text);}'
      + '.tr-sum-prog{font-size:12px;color:var(--text-3);font-weight:600;}'
      + '.tr-progress{height:7px;background:#eef0f5;border-radius:7px;overflow:hidden;margin:10px 0;}'
      + '.tr-progress-fill{height:100%;width:0;background:linear-gradient(135deg,#6a7bff,#8b9eff);border-radius:7px;transition:width .35s;}'
      + '.tr-chips{display:flex;gap:8px;flex-wrap:wrap;}'
      + '.tr-chip{font-size:12px;padding:4px 10px;border-radius:999px;color:var(--text-2);background:#f4f6fb;}'
      + '.tr-chip b{font-weight:800;margin-right:1px;}'
      + '.tr-chip.tr-b-review{background:#e7e9ff;color:#4451e0;}'
      + '.tr-chip.tr-b-mistake{background:#fff0df;color:#c8741b;}'
      + '.tr-chip.tr-b-weak{background:#dff6fb;color:#0b8ba4;}'
      + '.tr-mastery .tr-m-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}'
      + '.tr-m-title{font-weight:800;font-size:15px;color:var(--text);}'
      + '.tr-m-sub{font-size:11px;color:var(--text-3);}'
      + '.tr-m-none{font-size:12.5px;color:var(--text-3);background:#f4f6fb;border-radius:10px;padding:12px;text-align:center;}'
      + '.tr-topic{padding:9px 0;border-bottom:1px solid var(--border);}'
      + '.tr-topic:last-child{border-bottom:0;}'
      + '.tr-topic-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}'
      + '.tr-topic-name{font-size:13px;font-weight:600;color:var(--text);}'
      + '.tr-topic-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;background:#fff0df;color:#c8741b;}'
      + '.tr-topic-badge.ok{background:#d4f7e3;color:#15803d;}'
      + '.tr-topic-track{height:6px;background:#eef0f5;border-radius:6px;overflow:hidden;}'
      + '.tr-topic-fill{height:100%;width:0;background:linear-gradient(135deg,#ffb14a,#ff9f43);border-radius:6px;transition:width .4s;}'
      + '.tr-topic-fill.ok{background:linear-gradient(135deg,#34d399,#22c55e);}'
      + '.tr-topic-meta{font-size:11px;color:var(--text-3);margin-top:5px;}'
      + '.tr-q .tr-tagrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;}'
      + '.tr-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;color:#fff;}'
      + '.tr-badge.tr-b-review{background:var(--primary);}'
      + '.tr-badge.tr-b-mistake{background:var(--warn);}'
      + '.tr-badge.tr-b-weak{background:var(--info);}'
      + '.tr-timer{margin-left:auto;}'
      + '.tr-noopt{font-size:13px;color:var(--text-3);background:#f8f9fd;border-radius:10px;padding:12px;}'
      + '.tr-actions{margin-top:12px;}'
      + '.tr-actions .btn-primary,.tr-actions .btn-ghost{width:100%;}'
      + '.tr-actions-3{display:grid;grid-template-columns:1fr 1fr;gap:10px;}'
      + '.tr-actions-3 .btn-primary{grid-column:1 / -1;}';
    var style = el('style', { id: 'training-style' });
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- 暴露 ----------
  window.Training = { mount: function (rootEl) { mount(rootEl); } };
})();
