/* 上岸通 · 战术复盘 (war-layer)
 * 全局 API：window.Tactics.mount(rootEl)
 * 依赖（运行时按需取用，缺失则降级）：
 *   window.SAT.state        { history, attempts, mistakes, favorites, days, streak, examScore }
 *   window.SAT.qById(id)    -> question | null
 *   window.SAT.moduleOf(id) -> module | null
 *   window.KnowledgeTree.infer(q, module) -> {topicId,topicName,module} | null
 *   window.QB               全部题目
 *
 * attempts[] = { id, module, selected, correct, ms, guess, code, ts, paper }
 *   code ∈ {R1 真会, R2 对但超时, R3 蒙对, R4 错快, R5 错慢, R6 蒙错}
 *   paper: null=练习; 字符串=模考(submitExam 写入)
 */
(function () {
  'use strict';

  var MODULE_LABELS = {
    zhengzhi: '政治理论', changshi: '常识判断', yanyu: '言语理解', shuliang: '数量关系',
    panduan: '判断推理', ziliao: '资料分析', shenlun: '申论'
  };
  var MODULE_SHORT = {
    zhengzhi: '政治', changshi: '常识', yanyu: '言语', shuliang: '数量',
    panduan: '判断', ziliao: '资料', shenlun: '申论'
  };
  var ALL_MODULES = ['zhengzhi', 'changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun'];
  var XINGCE = ['zhengzhi', 'changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao']; // 行测六模块（申论不计入 120min；2025 起政治理论独立）
  // 2025 国考标准配比（副省级 135题）：政治20 常识15 言语30 数量15 判断35 资料20，合计 120 分钟
  var DEFAULT_BUDGET = { zhengzhi: 8, changshi: 7, yanyu: 30, shuliang: 20, panduan: 33, ziliao: 22 }; // 分钟，合计 120
  var DEFAULT_COUNT = { zhengzhi: 20, changshi: 15, yanyu: 30, shuliang: 15, panduan: 35, ziliao: 20 };   // 2025 行测典型题量
  var TOTAL_MIN = 120;
  var SESSION_GAP = 30 * 60 * 1000; // 同 paper 内间隔 >30min 视为不同场次

  var timers = []; // 若后续引入 setTimeout/Interval，统一登记，mount 时清空防泄漏

  // ---------------- 基础工具 ----------------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      if (attrs[k] == null) continue;
      if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function pctInt(x) { return (isFinite(x) ? Math.round(x * 100) : 0) + '%'; }
  function fmtSec(ms) { return (isFinite(ms) && ms > 0) ? (ms / 1000).toFixed(1) + 's' : '—'; }
  function fmtDate(ts) { if (!ts) return ''; var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); }

  function safeState() {
    try { return (window.SAT && window.SAT.state) ? window.SAT.state : null; } catch (e) { return null; }
  }
  function getAttempts() {
    var s = safeState();
    var a = s && s.attempts;
    return Array.isArray(a) ? a.filter(function (x) { return x && x.module; }) : [];
  }
  function getMistakes() {
    var s = safeState();
    return (s && Array.isArray(s.mistakes)) ? s.mistakes : [];
  }
  function hasTree() {
    return !!(window.KnowledgeTree && typeof window.KnowledgeTree.infer === 'function');
  }
  function qById(id) {
    try { return (window.SAT && window.SAT.qById) ? window.SAT.qById(id) : null; } catch (e) { return null; }
  }

  // 按模块聚合
  function aggByModule(list) {
    var m = {};
    ALL_MODULES.forEach(function (k) { m[k] = { n: 0, correct: 0, sumMs: 0, msN: 0, r2: 0, r3: 0, r5: 0, r6: 0 }; });
    (list || []).forEach(function (a) {
      var k = a.module;
      if (!m[k]) m[k] = { n: 0, correct: 0, sumMs: 0, msN: 0, r2: 0, r3: 0, r5: 0, r6: 0 };
      m[k].n++;
      if (a.correct) m[k].correct++;
      if (typeof a.ms === 'number' && a.ms > 0) { m[k].sumMs += a.ms; m[k].msN++; }
      if (a.code === 'R2') m[k].r2++;
      if (a.code === 'R3') m[k].r3++;
      if (a.code === 'R5') m[k].r5++;
      if (a.code === 'R6') m[k].r6++;
    });
    ALL_MODULES.forEach(function (k) {
      var x = m[k];
      x.acc = x.n ? x.correct / x.n : 0;
      x.avgMs = x.msN ? x.sumMs / x.msN : 0;
    });
    return m;
  }

  // ---------------- UI 组装件 ----------------
  function card(titleText, extraText) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', { class: 'card-title', text: titleText }),
        extraText ? el('div', { class: 'card-extra', text: extraText }) : null
      ])
    ]);
  }
  function sub(text) { return el('div', { class: 'tac-sub', text: text }); }
  function note(text) { return el('div', { class: 'tac-note', text: text }); }
  function hint(text) { return el('div', { class: 'tac-hint', text: text }); }

  function statGrid(items, cols) {
    cols = cols || items.length || 3;
    var g = el('div', {
      class: 'tac-stats' + (cols >= 4 ? ' compact' : ''),
      style: 'grid-template-columns:repeat(' + cols + ',1fr);'
    });
    items.forEach(function (it) {
      g.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'sc-num', text: it.num }),
        el('div', { class: 'sc-cap', text: it.cap })
      ]));
    });
    return g;
  }
  function bars(rows) { // rows: [{label, value(0..1), right}]
    var wrap = el('div', { class: 'module-acc' });
    rows.forEach(function (r) {
      wrap.appendChild(el('div', { class: 'ma-row' }, [
        el('div', { class: 'ma-name' }, [el('span', { text: r.label }), el('span', { text: r.right })]),
        el('div', { class: 'ma-track' }, [
          el('div', { class: 'ma-fill', style: 'width:' + Math.round((r.value || 0) * 100) + '%' })
        ])
      ]));
    });
    return wrap;
  }
  function chips(items) { // [{label}]
    var w = el('div', { class: 'tac-chips' });
    items.forEach(function (it) { w.appendChild(el('div', { class: 'tac-chip', html: it })); });
    return w;
  }

  // ===================================================================
  // 卡片 1 · 模考复盘
  // ===================================================================
  function groupSessions(exam) {
    var sorted = exam.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var sessions = [], cur = null;
    sorted.forEach(function (a) {
      if (!cur || a.paper !== cur.paper || ((a.ts || 0) - cur.lastTs) > SESSION_GAP) {
        cur = { paper: a.paper, items: [], startTs: a.ts || 0, lastTs: a.ts || 0 };
        sessions.push(cur);
      }
      cur.items.push(a);
      cur.lastTs = a.ts || cur.lastTs;
    });
    return sessions;
  }
  function sessionVerdict(items) {
    var m = aggByModule(items);
    var withData = ALL_MODULES.filter(function (k) { return m[k].n > 0; });
    if (!withData.length) return '暂无模块数据';
    if (withData.length === 1) return MODULE_SHORT[withData[0]] + ' 正确率 ' + pctInt(m[withData[0]].acc);
    var sorted = withData.slice().sort(function (a, b) { return m[b].acc - m[a].acc; });
    var best = sorted[0], worst = sorted[sorted.length - 1];
    if (m[best].acc === m[worst].acc) return '各模块发挥均衡';
    return '强模块 ' + MODULE_SHORT[best] + ' ' + pctInt(m[best].acc) +
      ' · 弱模块 ' + MODULE_SHORT[worst] + ' ' + pctInt(m[worst].acc);
  }

  function cardExamReview(attempts) {
    var c = card('模考复盘', '真题套卷');
    var exam = attempts.filter(function (a) { return a.paper != null; });

    if (!exam.length) {
      c.appendChild(hint('去真题模考交卷后这里会出复盘'));
      return c;
    }

    var agg = aggByModule(exam);
    var total = exam.length;
    var correct = exam.reduce(function (s, a) { return s + (a.correct ? 1 : 0); }, 0);
    var r3 = exam.reduce(function (s, a) { return s + (a.code === 'R3' ? 1 : 0); }, 0);
    var sessions = groupSessions(exam);

    c.appendChild(statGrid([
      { num: String(sessions.length), cap: '套卷数' },
      { num: pctInt(total ? correct / total : 0), cap: '总正确率' },
      { num: pctInt(total ? r3 / total : 0), cap: '蒙对占比' }
    ], 3));

    // 各模块正确率
    var accRows = ALL_MODULES.filter(function (k) { return agg[k].n > 0; }).map(function (k) {
      return { label: MODULE_LABELS[k], value: agg[k].acc, right: pctInt(agg[k].acc) + ' (' + agg[k].n + '题)' };
    });
    if (accRows.length) { c.appendChild(sub('各模块正确率')); c.appendChild(bars(accRows)); }

    // 平均用时分布
    var timeChips = ALL_MODULES.filter(function (k) { return agg[k].n > 0; }).map(function (k) {
      return MODULE_SHORT[k] + ' <b>' + fmtSec(agg[k].avgMs) + '</b>/题';
    });
    if (timeChips.length) { c.appendChild(sub('各模块平均用时')); c.appendChild(chips(timeChips)); }

    // 各场次
    c.appendChild(sub('各场次复盘'));
    var list = el('div', { class: 'tac-sess' });
    sessions.forEach(function (s, i) {
      var n = s.items.length;
      var cr = s.items.reduce(function (t, a) { return t + (a.correct ? 1 : 0); }, 0);
      var title = '模考 #' + (i + 1) + (s.startTs ? ' · ' + fmtDate(s.startTs) : '') + ' · ' + n + '题';
      list.appendChild(el('div', { class: 'tac-sess-row' }, [
        el('div', { class: 'tac-sess-acc', text: pctInt(n ? cr / n : 0) }),
        el('div', { class: 'tac-sess-info' }, [
          el('div', { class: 'tac-sess-title', text: title }),
          el('div', { class: 'tac-sess-verdict', text: sessionVerdict(s.items) })
        ])
      ]));
    });
    c.appendChild(list);
    return c;
  }

  // ===================================================================
  // 卡片 2 · 时间分配器
  // ===================================================================
  function computeBudget(agg) {
    var raw = {}, sum = 0;
    XINGCE.forEach(function (k) {
      var baseAvg = DEFAULT_BUDGET[k] * 60000 / DEFAULT_COUNT[k]; // 无数据时的基准均速(ms/题)
      var avg = (agg[k] && agg[k].avgMs > 0) ? agg[k].avgMs : baseAvg;
      var rt = avg * DEFAULT_COUNT[k];
      raw[k] = rt; sum += rt;
    });
    var out = {};
    XINGCE.forEach(function (k) { out[k] = sum ? (raw[k] / sum) * TOTAL_MIN : DEFAULT_BUDGET[k]; });
    return out;
  }
  function cardTimeBudget(attempts) {
    var c = card('时间分配器', '行测 120 分钟 / 约130题');
    var agg = aggByModule(attempts);
    var hasData = XINGCE.some(function (k) { return agg[k].n > 0; });
    var budget = computeBudget(agg);

    var table = el('table', { class: 'tac-table' });
    table.appendChild(el('tr', {}, [
      el('th', { text: '模块' }), el('th', { text: '建议时长(分)' }), el('th', { text: '你的均速(秒/题)' })
    ]));
    XINGCE.forEach(function (k) {
      table.appendChild(el('tr', {}, [
        el('td', { text: MODULE_LABELS[k] }),
        el('td', { class: 'num', text: String(Math.round(budget[k])) }),
        el('td', { class: 'sec', text: (agg[k].avgMs > 0 ? (agg[k].avgMs / 1000).toFixed(1) : '—') })
      ]));
    });
    c.appendChild(table);
    c.appendChild(note('考场上严格按此止损，超时即跳。' + (hasData ? '' : '（暂无个人数据，先按标准配比）')));
    return c;
  }

  // ===================================================================
  // 卡片 3 · 答题顺序建议
  // ===================================================================
  function cardAnswerOrder(attempts) {
    var c = card('答题顺序建议', '强项优先');
    var agg = aggByModule(attempts);
    var withData = ALL_MODULES.filter(function (k) { return agg[k].n > 0; })
      .sort(function (a, b) { return agg[b].acc - agg[a].acc; });
    var noData = ALL_MODULES.filter(function (k) { return agg[k].n === 0; });
    var ordered = withData.concat(noData);

    var ol = el('ol', { class: 'tac-order' });
    ordered.forEach(function (k, i) {
      var reason;
      if (agg[k].n > 0) {
        var tip = i < withData.length && i < 2 ? '（先做，稳拿分）'
          : (agg[k].acc < 0.5 ? '（靠后，控时为主）' : '');
        reason = '正确率 ' + pctInt(agg[k].acc) + '（' + agg[k].n + '题）' + tip;
      } else {
        reason = '暂无数据，建议靠后安排';
      }
      ol.appendChild(el('li', {}, [
        el('div', { class: 'tac-rank', text: String(i + 1) }),
        el('div', { class: 'oi' }, [
          el('div', { class: 'tac-oname', text: MODULE_LABELS[k] }),
          el('div', { class: 'tac-oreason', text: reason })
        ])
      ]));
    });
    c.appendChild(ol);
    return c;
  }

  // ===================================================================
  // 卡片 4 · 蒙题 / 跳过策略
  // ===================================================================
  function cardGuessStrategy(attempts) {
    var c = card('蒙题 / 跳过策略', '时间不足时');
    var agg = aggByModule(attempts);
    var withData = ALL_MODULES.filter(function (k) { return agg[k].n > 0; });

    if (!withData.length) { c.appendChild(hint('刷题后这里会给出保分/博弈/放弃分层')); return c; }

    var tiers = { keep: [], bet: [], drop: [] };
    withData.forEach(function (k) {
      var x = agg[k];
      var guessTotal = x.r3 + x.r6;
      var guessHit = guessTotal ? x.r3 / guessTotal : 0; // 蒙对历史
      var score = x.acc * (0.6 + 0.4 * guessHit);        // accuracy × 蒙对历史 加权
      var slow = x.avgMs > 0 && x.avgMs > 70000;
      var tier = x.acc >= 0.7 ? 'keep' : (x.acc >= 0.5 ? 'bet' : 'drop');
      tiers[tier].push({ k: k, acc: x.acc, guessHit: guessHit, guessTotal: guessTotal, slow: slow, score: score });
    });
    ['keep', 'bet', 'drop'].forEach(function (t) {
      tiers[t].sort(function (a, b) { return b.score - a.score; });
    });

    var meta = {
      keep: { badge: 'keep', name: '保分', tip: '高正确率 · 务必做完，别失误' },
      bet: { badge: 'bet', name: '博弈', tip: '中等 · 先易后难，卡时就蒙' },
      drop: { badge: 'drop', name: '可放弃', tip: '低正确率 + 高耗时 · 时间紧果断蒙+跳' }
    };
    ['keep', 'bet', 'drop'].forEach(function (t) {
      var m = meta[t];
      var block = el('div', { class: 'tac-tier' }, [
        el('div', { class: 'tac-tier-head' }, [
          el('span', { class: 'tac-badge ' + m.badge, text: m.name }),
          el('span', { class: 'tac-tier-tip', text: m.tip })
        ])
      ]);
      if (!tiers[t].length) {
        block.appendChild(el('div', { class: 'tac-tier-tip', text: '—' }));
      } else {
        var cw = el('div', { class: 'tac-chips' });
        tiers[t].forEach(function (it) {
          var txt = MODULE_SHORT[it.k] + ' <b>' + pctInt(it.acc) + '</b>' +
            (it.guessTotal ? ' · 蒙对' + pctInt(it.guessHit) : '') +
            (it.slow && t === 'drop' ? ' · 耗时高' : '');
          cw.appendChild(el('div', { class: 'tac-chip', html: txt }));
        });
        block.appendChild(cw);
      }
      c.appendChild(block);
    });
    return c;
  }

  // ===================================================================
  // 卡片 5 · 战略放弃清单（低性价比题型）
  // ===================================================================
  function cardStrategicGiveup(attempts) {
    var c = card('战略放弃清单', '低性价比题型');
    if (!hasTree()) { c.appendChild(hint('题型推断不可用（KnowledgeTree 缺失）')); return c; }

    var map = {};
    attempts.forEach(function (a) {
      var q = qById(a.id);
      if (!q) return;
      var info = null;
      try { info = window.KnowledgeTree.infer(q, a.module); } catch (e) { info = null; }
      if (!info || !info.topicId) return;
      var key = a.module + '|' + info.topicId;
      var t = map[key] || (map[key] = {
        module: a.module, topicName: info.topicName || info.topicId,
        n: 0, wrong: 0, sumMs: 0, msN: 0
      });
      t.n++;
      if (!a.correct) t.wrong++;
      if (typeof a.ms === 'number' && a.ms > 0) { t.sumMs += a.ms; t.msN++; }
    });

    var rows = Object.keys(map).map(function (key) {
      var t = map[key];
      t.wrongRate = t.n ? t.wrong / t.n : 0;
      t.avgMs = t.msN ? t.sumMs / t.msN : 0;
      t.roi = t.wrongRate * t.avgMs; // 错误率高 且 耗时高 => ROI 越差
      return t;
    }).filter(function (t) {
      return t.n >= 3 && t.wrongRate >= 0.4 && t.avgMs > 0; // 样本足 + 高错误率 + 有耗时
    }).sort(function (a, b) { return b.roi - a.roi; }).slice(0, 5);

    if (!rows.length) {
      c.appendChild(hint('当前无明显低性价比题型，继续保持'));
      return c;
    }

    var wrap = el('div', { class: 'tac-roi' });
    rows.forEach(function (t) {
      wrap.appendChild(el('div', { class: 'tac-roi-row' }, [
        el('div', { class: 'tac-roi-name', text: MODULE_SHORT[t.module] + ' · ' + t.topicName }),
        el('div', {
          class: 'tac-roi-reason',
          text: '错误率 ' + pctInt(t.wrongRate) + ' · 均耗时 ' + fmtSec(t.avgMs) + '/题（共 ' + t.n + ' 题）'
        })
      ]));
    });
    c.appendChild(wrap);
    c.appendChild(note('分数性价比低，考场遇到优先跳过，把时间留给保分题。'));
    return c;
  }

  // ===================================================================
  // 卡片 6 · 粗心管理
  // ===================================================================
  function cardCarelessness(attempts) {
    var c = card('粗心管理', '超时与反复错');
    var r2 = 0, r5 = 0;
    var wrongByQid = {};
    attempts.forEach(function (a) {
      if (a.code === 'R2') r2++;
      if (a.code === 'R5') r5++;
      if (!a.correct) wrongByQid[a.id] = (wrongByQid[a.id] || 0) + 1;
    });
    var overtime = r2 + r5;
    // 反复错：同一题在 attempts 中出现 >1 次错误（且在错题本内）
    var mistakes = getMistakes();
    var inMistakes = function (id) { return mistakes.indexOf(id) >= 0 || mistakes.indexOf(+id) >= 0; };
    var repeated = Object.keys(wrongByQid).filter(function (id) {
      return wrongByQid[id] > 1 && inMistakes(id);
    }).length;

    c.appendChild(statGrid([
      { num: String(overtime), cap: '超时作答' },
      { num: String(r2), cap: '对但超时' },
      { num: String(r5), cap: '耗时尚错' },
      { num: String(repeated), cap: '反复错题' }
    ], 4));

    var advice = [];
    if (overtime > 0) advice.push('超时作答 ' + overtime + ' 题，建议限时训练：每题设硬上限，到点即跳。');
    if (r2 > 0) advice.push('其中「对但超时」' + r2 + ' 题：方法对但不够熟，需专项提速。');
    if (r5 > 0) advice.push('「耗时尚错」' + r5 + ' 题：钻进死胡同，先跳过保分，回头再啃。');
    if (repeated > 0) advice.push('有 ' + repeated + ' 道题反复做错，务必加入错题本重点攻克。');
    if (!advice.length) advice.push('粗心与超时控制良好，继续保持节奏。');

    var ul = el('ul', { class: 'tac-advice' });
    advice.forEach(function (t) { ul.appendChild(el('li', { text: t })); });
    c.appendChild(ul);
    return c;
  }

  // ---------------- 样式自注入 ----------------
  function injectStyle() {
    if (document.getElementById('tactics-style')) return;
    var css = [
      '.tac-stats{display:grid;gap:10px;margin-bottom:12px;}',
      '.tac-stats .stat-card{padding:12px 6px;}',
      '.tac-stats.compact .stat-card{padding:12px 2px;}',
      '.tac-stats.compact .sc-num{font-size:17px;}',
      '.tac-sub{font-size:12px;font-weight:700;color:var(--text-2,#6b7280);margin:14px 0 8px;}',
      '.tac-note{margin-top:10px;font-size:12px;color:#b26a12;background:#fff7ec;padding:9px 12px;border-radius:10px;line-height:1.6;}',
      '.tac-hint{font-size:13px;color:var(--text-3,#9ca3af);text-align:center;padding:18px 8px;line-height:1.7;}',
      '.tac-table{width:100%;border-collapse:collapse;font-size:13px;}',
      '.tac-table th{font-size:12px;color:var(--text-3,#9ca3af);font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid var(--border,#eef0f5);}',
      '.tac-table td{padding:9px 8px;border-bottom:1px solid var(--border,#eef0f5);color:var(--text,#1f2330);}',
      '.tac-table tr:last-child td{border-bottom:0;}',
      '.tac-table td.num{font-weight:700;color:var(--primary,#5b6cff);text-align:right;font-variant-numeric:tabular-nums;}',
      '.tac-table td.sec{text-align:right;color:var(--text-2,#6b7280);font-variant-numeric:tabular-nums;}',
      '.tac-chips{display:flex;flex-wrap:wrap;gap:6px;}',
      '.tac-chip{font-size:12px;padding:5px 10px;border-radius:10px;background:var(--bg,#f5f7fb);color:var(--text-2,#6b7280);}',
      '.tac-chip b{color:var(--text,#1f2330);}',
      '.tac-order{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}',
      '.tac-order li{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg,#f8f9fd);border-radius:10px;}',
      '.tac-rank{width:22px;height:22px;flex-shrink:0;border-radius:50%;background:var(--primary,#5b6cff);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}',
      '.tac-order .oi{flex:1;min-width:0;}',
      '.tac-oname{font-size:14px;font-weight:600;color:var(--text,#1f2330);}',
      '.tac-oreason{font-size:12px;color:var(--text-3,#9ca3af);margin-top:2px;}',
      '.tac-tier{margin-bottom:12px;}',
      '.tac-tier:last-child{margin-bottom:0;}',
      '.tac-tier-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap;}',
      '.tac-badge{padding:2px 11px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;}',
      '.tac-badge.keep{background:var(--success,#22c55e);}',
      '.tac-badge.bet{background:var(--warn,#ff9f43);}',
      '.tac-badge.drop{background:var(--danger,#ef4444);}',
      '.tac-tier-tip{font-size:12px;color:var(--text-3,#9ca3af);}',
      '.tac-roi{display:flex;flex-direction:column;gap:8px;}',
      '.tac-roi-row{padding:10px 12px;background:#fff5f5;border-left:3px solid var(--danger,#ef4444);border-radius:8px;}',
      '.tac-roi-name{font-size:13px;font-weight:700;color:var(--text,#1f2330);}',
      '.tac-roi-reason{font-size:12px;color:var(--text-2,#6b7280);margin-top:3px;}',
      '.tac-sess{display:flex;flex-direction:column;gap:8px;}',
      '.tac-sess-row{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg,#f8f9fd);border-radius:10px;}',
      '.tac-sess-acc{font-size:18px;font-weight:800;color:var(--primary,#5b6cff);min-width:54px;text-align:center;font-variant-numeric:tabular-nums;}',
      '.tac-sess-info{flex:1;min-width:0;}',
      '.tac-sess-title{font-size:13px;font-weight:600;color:var(--text,#1f2330);}',
      '.tac-sess-verdict{font-size:12px;color:var(--text-3,#9ca3af);margin-top:2px;}',
      '.tac-advice{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;}',
      '.tac-advice li{font-size:13px;color:var(--text-2,#6b7280);line-height:1.6;padding-left:18px;position:relative;}',
      '.tac-advice li::before{content:"\\2022";position:absolute;left:4px;color:var(--primary,#5b6cff);font-weight:700;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'tactics-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------- 挂载 ----------------
  function mount(rootEl) {
    if (!rootEl) return;
    // 清理旧定时器，防止重复挂载泄漏
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
    rootEl.innerHTML = '';
    injectStyle();

    var attempts = getAttempts();
    if (!attempts.length) {
      rootEl.appendChild(el('div', { class: 'empty', text: '先刷题/模考，战术复盘才有数据' }));
      return;
    }

    try { rootEl.appendChild(cardExamReview(attempts)); } catch (e) { /* 防御：单卡异常不影响整页 */ }
    try { rootEl.appendChild(cardTimeBudget(attempts)); } catch (e) {}
    try { rootEl.appendChild(cardAnswerOrder(attempts)); } catch (e) {}
    try { rootEl.appendChild(cardGuessStrategy(attempts)); } catch (e) {}
    try { rootEl.appendChild(cardStrategicGiveup(attempts)); } catch (e) {}
    try { rootEl.appendChild(cardCarelessness(attempts)); } catch (e) {}
  }

  window.Tactics = { mount: function (rootEl) { mount(rootEl); } };
})();
