/* 上岸通 · 学习体验增强模块（打卡徽章 / 番茄钟 / 考点笔记 · 背诵自测）
 * 纯本地、无外传。暴露 window.Experience = { mount(rootEl) }。
 * mount 时先清空容器并清理模块级定时器，重复挂载不泄漏。
 */
(function () {
  'use strict';

  // ---- 模块级定时器（挂载时统一清理，避免泄漏）----
  var pomoTimer = null;   // 番茄钟 setInterval
  var notesTimer = null;  // 笔记防抖保存 setTimeout

  var FOCUS_SEC = 25 * 60;
  var LETTERS = 'ABCDEFGH';

  // ---- 存储：优先 window.Store，兜底 localStorage ----
  function readStore(key) {
    try {
      if (window.Store && typeof window.Store.get === 'function') {
        var v = window.Store.get(key);
        if (v != null) return v;
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (e) { return null; }
  }
  function writeStore(key, val) {
    try {
      if (window.Store && typeof window.Store.set === 'function') { window.Store.set(key, val); return; }
    } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // ---- 工具 ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function clip(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function todayKey() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function mmss(sec) {
    sec = Math.max(0, sec | 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
  }
  function toast(msg) {
    if (typeof window.toast === 'function') { try { window.toast(msg); return; } catch (e) {} }
  }

  // ---- 番茄钟存储 ----
  function getPomo() {
    var p = readStore('shangAnTong_pomodoro') || {};
    var tk = todayKey();
    if (p.date !== tk) return { date: tk, count: 0 };
    return { date: tk, count: Number(p.count) || 0 };
  }
  function incPomo() {
    var p = getPomo();
    p.count += 1;
    writeStore('shangAnTong_pomodoro', p);
    return p.count;
  }

  // ---- 注入浅色主题样式（只注入一次）----
  function injectStyle() {
    if (document.getElementById('experience-style')) return;
    var css = [
      '#experienceRoot .exp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
      '#experienceRoot .exp-stat{background:var(--bg);border-radius:12px;padding:12px 6px;text-align:center}',
      '#experienceRoot .exp-stat .n{font-size:22px;font-weight:800;color:var(--primary);line-height:1}',
      '#experienceRoot .exp-stat .c{font-size:11px;color:var(--text-3);margin-top:5px}',
      '#experienceRoot .exp-badges{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}',
      '#experienceRoot .exp-badge{background:var(--bg);border-radius:12px;padding:10px 4px 8px;text-align:center;border:1px solid transparent;transition:transform .15s}',
      '#experienceRoot .exp-badge:active{transform:scale(.96)}',
      '#experienceRoot .exp-badge .be{font-size:26px;line-height:1;display:block}',
      '#experienceRoot .exp-badge .bn{font-size:11px;font-weight:700;margin-top:5px;color:var(--text)}',
      '#experienceRoot .exp-badge .bc{font-size:9px;color:var(--text-3);margin-top:3px;line-height:1.35}',
      '#experienceRoot .exp-badge .bok{font-size:9px;color:var(--success);font-weight:700;margin-top:3px}',
      '#experienceRoot .exp-badge.on{background:#eef1ff;border-color:#d6dbff}',
      '#experienceRoot .exp-badge.on .bn{color:var(--primary)}',
      '#experienceRoot .exp-badge.off .be{filter:grayscale(1);opacity:.4}',
      '#experienceRoot .exp-badge.off .bn{color:var(--text-3)}',
      '#experienceRoot .exp-pomo{text-align:center}',
      '#experienceRoot .exp-pomo .pt{font-size:52px;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums;letter-spacing:1px;line-height:1.1;margin:6px 0}',
      '#experienceRoot .exp-pomo.done .pt{color:var(--success)}',
      '#experienceRoot .exp-pomo .ps{font-size:12px;color:var(--text-3);min-height:18px}',
      '#experienceRoot .exp-pomo .pcnt{font-size:12px;color:var(--text-2);margin-top:8px}',
      '#experienceRoot .exp-pomo .pcnt b{color:var(--warn)}',
      '#experienceRoot .exp-pomo-btns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px}',
      '#experienceRoot .exp-notes textarea{width:100%;min-height:118px;padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--bg);font-family:inherit;font-size:14px;color:var(--text);resize:vertical;line-height:1.6}',
      '#experienceRoot .exp-notes textarea:focus{outline:none;border-color:var(--primary);background:#fff}',
      '#experienceRoot .exp-notes .nsave{font-size:11px;color:var(--text-3);margin-top:6px;text-align:right;min-height:16px}',
      '#experienceRoot .exp-sub{font-size:13px;font-weight:700;color:var(--text-2);margin:16px 0 8px;display:flex;align-items:center;justify-content:space-between}',
      '#experienceRoot .exp-recite{display:flex;flex-direction:column;gap:8px}',
      '#experienceRoot .rc-card{background:var(--bg);border-radius:12px;padding:12px;cursor:pointer;border:1px solid var(--border);transition:transform .12s}',
      '#experienceRoot .rc-card:active{transform:scale(.99)}',
      '#experienceRoot .rc-q{font-size:13.5px;line-height:1.6;color:var(--text);font-weight:500}',
      '#experienceRoot .rc-a{margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:12.5px;color:var(--text-2);line-height:1.6}',
      '#experienceRoot .rc-a .ansv{font-weight:700;color:var(--success)}',
      '#experienceRoot .rc-hint{display:none;margin-top:8px;font-size:12px;color:var(--primary);font-weight:600}',
      '#experienceRoot .exp-recite.mask-on .rc-card:not(.revealed) .rc-a{display:none}',
      '#experienceRoot .exp-recite.mask-on .rc-card:not(.revealed) .rc-hint{display:block}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'experience-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- 数据聚合（全部防空）----
  function collect() {
    var S = (window.SAT && window.SAT.state) || {};
    var history = Array.isArray(S.history) ? S.history : [];
    var attempts = Array.isArray(S.attempts) ? S.attempts : [];
    var mistakes = Array.isArray(S.mistakes) ? S.mistakes : [];
    var streak = Number(S.streak) || 0;
    var totalDone = history.length || attempts.length;

    // 模考次数：attempts 中 paper != null 的去重套卷数
    var papers = {};
    var paperAttempts = 0;
    attempts.forEach(function (a) {
      if (a && a.paper != null) { papers[a.paper] = 1; paperAttempts++; }
    });
    var examCount = Object.keys(papers).length || paperAttempts;

    // 正确率
    var ansTotal = 0, ansRight = 0;
    if (attempts.length) {
      attempts.forEach(function (a) { ansTotal++; if (a && a.correct) ansRight++; });
    } else {
      history.forEach(function (h) { ansTotal++; if (h && h.correct) ansRight++; });
    }
    var acc = ansTotal ? Math.round(ansRight / ansTotal * 100) : 0;

    return {
      streak: streak, totalDone: totalDone, examCount: examCount,
      mistakes: mistakes.length, ansTotal: ansTotal, acc: acc,
      pomoToday: getPomo().count
    };
  }

  // ---- 1. 打卡 + 徽章 ----
  function buildStreakCard(d) {
    var badges = [
      { e: '🔥', n: '连续打卡', on: d.streak >= 7, c: '连续打卡满 7 天' },
      { e: '💯', n: '刷题百题', on: d.totalDone >= 100, c: '累计刷题满 100 题' },
      { e: '📝', n: '模考先锋', on: d.examCount >= 5, c: '完成 5 次模考' },
      { e: '🧠', n: '错题清零', on: d.totalDone > 0 && d.mistakes === 0, c: '刷题后清空所有错题' },
      { e: '🏆', n: '正确率王', on: d.ansTotal >= 10 && d.acc > 80, c: '正确率超过 80%' },
      { e: '📅', n: '月度坚持', on: d.streak >= 30, c: '连续打卡满 30 天' },
      { e: '📚', n: '刷题大师', on: d.totalDone >= 500, c: '累计刷题满 500 题' },
      { e: '🍅', n: '专注番茄', on: d.pomoToday >= 4, c: '单日完成 4 个番茄钟' }
    ];
    var badgeHtml = badges.map(function (b) {
      var foot = b.on
        ? '<div class="bok">已解锁</div>'
        : '<div class="bc">' + esc(b.c) + '</div>';
      return '<div class="exp-badge ' + (b.on ? 'on' : 'off') + '">' +
        '<span class="be">' + b.e + '</span>' +
        '<div class="bn">' + esc(b.n) + '</div>' + foot + '</div>';
    }).join('');

    var card = document.createElement('section');
    card.className = 'card';
    card.innerHTML =
      '<div class="card-head"><div class="card-title">🔥 连续打卡 · 成就徽章</div>' +
      '<div class="card-extra">正确率 ' + d.acc + '%</div></div>' +
      '<div class="exp-stats">' +
        '<div class="exp-stat"><div class="n">' + d.streak + '</div><div class="c">连续打卡(天)</div></div>' +
        '<div class="exp-stat"><div class="n">' + d.totalDone + '</div><div class="c">累计刷题</div></div>' +
        '<div class="exp-stat"><div class="n">' + d.examCount + '</div><div class="c">模考次数</div></div>' +
      '</div>' +
      '<div class="exp-badges">' + badgeHtml + '</div>';
    return card;
  }

  // ---- 2. 番茄钟 ----
  function buildPomoCard() {
    var card = document.createElement('section');
    card.className = 'card';
    card.innerHTML =
      '<div class="card-head"><div class="card-title">🍅 番茄钟 · 专注 25 分钟</div></div>' +
      '<div class="exp-pomo" id="expPomo">' +
        '<div class="pt" id="pomoTime">' + mmss(FOCUS_SEC) + '</div>' +
        '<div class="ps" id="pomoStatus">准备好了就开始一段专注吧</div>' +
        '<div class="pcnt">今日已完成 <b id="pomoCount">' + getPomo().count + '</b> 个番茄钟</div>' +
        '<div class="exp-pomo-btns">' +
          '<button class="btn-primary" id="pomoStart">开始</button>' +
          '<button class="btn-ghost" id="pomoPause">暂停</button>' +
          '<button class="btn-ghost" id="pomoReset">重置</button>' +
        '</div>' +
      '</div>';

    var remaining = FOCUS_SEC;
    var running = false;
    var wrap = card.querySelector('#expPomo');
    var timeEl = card.querySelector('#pomoTime');
    var statusEl = card.querySelector('#pomoStatus');
    var countEl = card.querySelector('#pomoCount');

    function render() { timeEl.textContent = mmss(remaining); }
    function tick() {
      remaining--;
      if (remaining <= 0) {
        remaining = 0;
        render();
        stopTimer();
        wrap.classList.add('done');
        statusEl.textContent = '✅ 专注完成，休息一下吧！';
        countEl.textContent = incPomo();
        toast('✅ 专注完成');
        remaining = FOCUS_SEC; // 下一段重新计时
        return;
      }
      render();
    }
    function startTimer() {
      if (running) return;
      running = true;
      wrap.classList.remove('done');
      statusEl.textContent = '专注中… 请勿切换页面';
      if (pomoTimer) clearInterval(pomoTimer);
      pomoTimer = setInterval(tick, 1000);
    }
    function stopTimer() {
      running = false;
      if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
    }

    card.querySelector('#pomoStart').addEventListener('click', startTimer);
    card.querySelector('#pomoPause').addEventListener('click', function () {
      if (!running) return;
      stopTimer();
      statusEl.textContent = '已暂停 · 点“开始”继续';
    });
    card.querySelector('#pomoReset').addEventListener('click', function () {
      stopTimer();
      remaining = FOCUS_SEC;
      wrap.classList.remove('done');
      statusEl.textContent = '已重置 · 25:00';
      render();
    });

    render();
    return card;
  }

  // ---- 3. 考点笔记 + 背诵自测 ----
  function buildNotesCard() {
    var card = document.createElement('section');
    card.className = 'card exp-notes';

    // 常识翻牌数据（up to 6，需有选项与合法答案）
    var qs = [];
    var hasQB = window.QB && Array.isArray(window.QB.changshi);
    if (hasQB) {
      window.QB.changshi.forEach(function (q) {
        if (qs.length >= 6) return;
        if (q && Array.isArray(q.options) && q.options.length >= 2 &&
            typeof q.answer === 'number' && q.answer >= 0 && q.answer < q.options.length) {
          qs.push(q);
        }
      });
    }

    var reciteInner;
    if (!hasQB || qs.length === 0) {
      reciteInner = '<div class="empty">暂无题库</div>';
    } else {
      reciteInner = qs.map(function (q) {
        var letter = LETTERS[q.answer] || '?';
        var optText = clip(q.options[q.answer], 60);
        var explain = q.explain ? '<br>' + esc(clip(q.explain, 90)) : '';
        return '<div class="rc-card">' +
          '<div class="rc-q">' + esc(clip(q.q, 96)) + '</div>' +
          '<div class="rc-a"><span class="ansv">答案：' + letter + '. ' + esc(optText) + '</span>' + explain + '</div>' +
          '<div class="rc-hint">👆 点击显示答案</div>' +
        '</div>';
      }).join('');
    }

    card.innerHTML =
      '<div class="card-head"><div class="card-title">📓 考点笔记 · 背诵自测</div></div>' +
      '<textarea id="expNotes" placeholder="随手记下易错考点、口诀、公式…（自动保存到本地）"></textarea>' +
      '<div class="nsave" id="notesSave"></div>' +
      '<div class="exp-sub"><span>🃏 常识背诵自测</span>' +
        '<button class="btn-ghost small" id="maskToggle">🙈 遮答自测：开</button></div>' +
      '<div class="exp-recite mask-on" id="expRecite">' + reciteInner + '</div>';

    // 笔记加载
    var ta = card.querySelector('#expNotes');
    var saved = readStore('shangAnTong_notes');
    if (saved && typeof saved === 'object' && typeof saved.text === 'string') ta.value = saved.text;
    else if (typeof saved === 'string') ta.value = saved;

    var saveEl = card.querySelector('#notesSave');
    ta.addEventListener('input', function () {
      if (notesTimer) clearTimeout(notesTimer);
      saveEl.textContent = '输入中…';
      notesTimer = setTimeout(function () {
        writeStore('shangAnTong_notes', { text: ta.value, ts: Date.now() });
        saveEl.textContent = '已保存 ✓';
      }, 500);
    });

    // 翻牌：单卡点击揭示
    var recite = card.querySelector('#expRecite');
    recite.addEventListener('click', function (ev) {
      var c = ev.target.closest ? ev.target.closest('.rc-card') : null;
      if (c && recite.contains(c)) c.classList.toggle('revealed');
    });

    // 遮答自测开关
    var toggleBtn = card.querySelector('#maskToggle');
    toggleBtn.addEventListener('click', function () {
      var on = recite.classList.toggle('mask-on');
      toggleBtn.textContent = on ? '🙈 遮答自测：开' : '👁 遮答自测：关';
      if (!on) {
        // 关闭遮挡：全部揭示无需逐一点击
        var cards = recite.querySelectorAll('.rc-card');
        for (var i = 0; i < cards.length; i++) cards[i].classList.remove('revealed');
      }
    });

    return card;
  }

  // ---- 挂载 ----
  function mount(rootEl) {
    if (!rootEl) return;
    // 清理模块级定时器，防泄漏
    if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
    if (notesTimer) { clearTimeout(notesTimer); notesTimer = null; }
    rootEl.innerHTML = '';
    injectStyle();

    var d = collect();
    rootEl.appendChild(buildStreakCard(d));
    rootEl.appendChild(buildPomoCard());
    rootEl.appendChild(buildNotesCard());
  }

  window.Experience = { mount: mount };
})();
