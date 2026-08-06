/* ===========================================================
   上岸通 · 智能诊断 (Diagnosis)
   window.Diagnosis = { mount(rootEl) }
   依赖: window.SAT.state / SAT.qById / SAT.moduleOf,
        window.KnowledgeTree.infer, window.QB, window.Store
   纯静态、无框架、每次进入页面重新 mount。
   =========================================================== */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var MODULE_NAMES = {
    zhengzhi: '政治理论',
    changshi: '常识判断',
    yanyu: '言语理解',
    shuliang: '数量关系',
    panduan: '判断推理',
    ziliao: '资料分析',
    shenlun: '申论'
  };
  var MODULE_ORDER = ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun'];

  // 错因六维定义：code -> {name, desc, tone}
  // tone: good(真会/对) / guess(蒙对) / bad(真错)
  var R_DEFS = {
    R1: { name: '真会答对', desc: '会做且限时内答对，最理想', tone: 'good' },
    R2: { name: '对但超时', desc: '答对但耗时偏长，需提速', tone: 'good' },
    R3: { name: '蒙对', desc: '靠猜答对，不代表真掌握', tone: 'guess' },
    R4: { name: '错·快', desc: '答错且很快，多为知识缺口', tone: 'bad' },
    R5: { name: '错·慢', desc: '耗时仍答错，方法/熟练不足', tone: 'bad' },
    R6: { name: '蒙错', desc: '靠猜且猜错', tone: 'bad' }
  };
  var R_ORDER = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];

  var C = {
    primary: '#5b6cff', warn: '#ff9f43', success: '#22c55e',
    info: '#06b6d6', danger: '#ef4444',
    text: '#1f2330', text2: '#6b7280', text3: '#9ca3af', border: '#eef0f5'
  };
  // tone -> 颜色
  function toneColor(tone) {
    if (tone === 'good') return C.success;
    if (tone === 'guess') return C.warn;
    return C.danger;
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 1000) / 10; // 一位小数
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  /* ---------- 样式自注入 ---------- */
  function injectStyle() {
    if (document.getElementById('diagnosis-style')) return;
    var css =
      '#dg-root{--primary:#5b6cff;--warn:#ff9f43;--success:#22c55e;--info:#06b6d6;--danger:#ef4444;--text:#1f2330;--text-2:#6b7280;--text-3:#9ca3af;--border:#eef0f5;--shadow:0 2px 14px rgba(31,35,48,.06);--radius:14px;}' +
      '.dg-card{background:#fff;margin:12px 14px;padding:16px;border-radius:var(--radius);box-shadow:var(--shadow);}' +
      '.dg-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
      '.dg-h .t{font-weight:700;font-size:15px;color:var(--text);}' +
      '.dg-h .x{font-size:11px;color:var(--text-3);}' +
      '.dg-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}' +
      '.dg-stat{background:#f8f9fd;border-radius:12px;padding:12px 6px;text-align:center;}' +
      '.dg-stat .n{font-size:20px;font-weight:800;color:var(--primary);line-height:1.1;}' +
      '.dg-stat .c{font-size:11px;color:var(--text-3);margin-top:4px;}' +
      '.dg-seg{display:flex;height:22px;border-radius:8px;overflow:hidden;margin-bottom:12px;background:#f1f3f8;}' +
      '.dg-seg i{display:block;height:100%;}' +
      '.dg-rlist{display:flex;flex-direction:column;gap:8px;}' +
      '.dg-rrow{display:flex;align-items:center;gap:8px;}' +
      '.dg-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}' +
      '.dg-rname{font-size:12px;font-weight:600;color:var(--text);width:96px;flex-shrink:0;}' +
      '.dg-rtrack{flex:1;height:8px;background:#eef0f5;border-radius:8px;overflow:hidden;}' +
      '.dg-rtrack i{display:block;height:100%;border-radius:8px;}' +
      '.dg-rnum{font-size:11px;color:var(--text-2);width:74px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;}' +
      '.dg-legend{margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);display:flex;flex-direction:column;gap:5px;}' +
      '.dg-leg{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-2);}' +
      '.dg-leg b{color:var(--text);font-weight:700;}' +
      '.dg-note{margin-top:10px;font-size:11.5px;color:var(--text-3);line-height:1.6;background:#f8f9fd;border-radius:10px;padding:8px 10px;}' +
      '.dg-note b{color:var(--warn);}' +
      '.dg-macc{display:flex;flex-direction:column;gap:11px;}' +
      '.dg-mrow .mn{font-size:12px;color:var(--text-2);margin-bottom:5px;display:flex;justify-content:space-between;}' +
      '.dg-mrow .mn b{color:var(--text);font-weight:700;}' +
      '.dg-mtrack{height:9px;background:#eef0f5;border-radius:9px;overflow:hidden;}' +
      '.dg-mfill{height:100%;border-radius:9px;transition:width .5s;}' +
      '.dg-weak{display:flex;flex-direction:column;gap:8px;}' +
      '.dg-wrow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8f9fd;border-radius:10px;}' +
      '.dg-wrk{width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--text-2);flex-shrink:0;}' +
      '.dg-wrk.top{background:var(--danger);color:#fff;border-color:var(--danger);}' +
      '.dg-wmain{flex:1;min-width:0;}' +
      '.dg-wname{font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dg-wsub{font-size:11px;color:var(--text-3);margin-top:2px;}' +
      '.dg-wpct{font-size:15px;font-weight:800;color:var(--danger);flex-shrink:0;font-variant-numeric:tabular-nums;}' +
      '.dg-score{text-align:center;padding:6px 0 2px;}' +
      '.dg-score .big{font-size:46px;font-weight:800;color:var(--primary);line-height:1;}' +
      '.dg-score .u{font-size:16px;font-weight:700;color:var(--primary);margin-left:2px;}' +
      '.dg-score .cap{font-size:12px;color:var(--text-2);margin-top:6px;}' +
      '.dg-score .warn{font-size:11px;color:var(--text-3);margin-top:4px;}' +
      '.dg-cal{display:grid;grid-template-columns:1fr 1fr;gap:10px;}' +
      '.dg-calc{background:#f8f9fd;border-radius:12px;padding:12px;text-align:center;}' +
      '.dg-calc .n{font-size:22px;font-weight:800;line-height:1.1;}' +
      '.dg-calc .c{font-size:11px;color:var(--text-3);margin-top:4px;}' +
      '.dg-adv{display:flex;flex-direction:column;gap:9px;}' +
      '.dg-advr{display:flex;gap:10px;padding:10px 12px;background:#eef1ff;border-radius:10px;font-size:13px;color:var(--text);line-height:1.55;}' +
      '.dg-advr .i{flex-shrink:0;font-size:15px;}' +
      '.dg-papers{display:flex;flex-direction:column;gap:8px;}' +
      '.dg-prow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8f9fd;border-radius:10px;}' +
      '.dg-pn{flex:1;min-width:0;}' +
      '.dg-pn .nm{font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.dg-pn .mt{font-size:11px;color:var(--text-3);margin-top:2px;}' +
      '.dg-pv{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;flex-shrink:0;}' +
      '.dg-pv.strong{background:#d4f7e3;color:#15803d;}' +
      '.dg-pv.weak{background:#fee2e2;color:#b91c1c;}' +
      '.dg-pv.mid{background:#fff4e6;color:#c8741b;}' +
      '.dg-empty{text-align:center;color:var(--text-3);padding:48px 24px;font-size:14px;line-height:1.8;}' +
      '.dg-empty .em{font-size:40px;display:block;margin-bottom:8px;}';
    var s = document.createElement('style');
    s.id = 'diagnosis-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- 数据分析 ---------- */
  function analyze(attempts) {
    var total = attempts.length;
    var correct = 0, sumMs = 0, msCount = 0;
    var rCount = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 };
    var guessTotal = 0;
    var byModule = {}; // m -> {correct,total}
    var byPaper = {};  // paper -> {correct,total}

    for (var i = 0; i < total; i++) {
      var a = attempts[i];
      if (a.correct) correct++;
      if (typeof a.ms === 'number' && a.ms > 0) { sumMs += a.ms; msCount++; }
      if (a.code && rCount.hasOwnProperty(a.code)) rCount[a.code]++;
      if (a.guess) guessTotal++;

      var m = a.module;
      if (m) {
        if (!byModule[m]) byModule[m] = { correct: 0, total: 0 };
        byModule[m].total++;
        if (a.correct) byModule[m].correct++;
      }
      if (a.paper) {
        if (!byPaper[a.paper]) byPaper[a.paper] = { correct: 0, total: 0 };
        byPaper[a.paper].total++;
        if (a.correct) byPaper[a.paper].correct++;
      }
    }

    return {
      total: total,
      correct: correct,
      accuracy: pct(correct, total),
      avgSec: msCount ? Math.round((sumMs / msCount) / 100) / 10 : 0,
      rCount: rCount,
      guessTotal: guessTotal,
      byModule: byModule,
      byPaper: byPaper
    };
  }

  function analyzeTopics(attempts) {
    var KT = window.KnowledgeTree;
    var SAT = window.SAT;
    if (!KT || typeof KT.infer !== 'function' || !SAT) return [];
    var map = {}; // topicName -> {total,wrong}
    for (var i = 0; i < attempts.length; i++) {
      var a = attempts[i];
      var q = null;
      try { q = SAT.qById(a.id); } catch (e) { q = null; }
      if (!q) continue;
      var info = null;
      try { info = KT.infer(q, a.module); } catch (e2) { info = null; }
      if (!info || !info.topicName) continue;
      var name = info.topicName;
      if (!map[name]) map[name] = { total: 0, wrong: 0 };
      map[name].total++;
      if (!a.correct) map[name].wrong++;
    }
    var list = [];
    for (var name in map) {
      if (!map.hasOwnProperty(name)) continue;
      var t = map[name];
      if (t.total < 3) continue; // 至少 3 次作答才纳入
      list.push({ name: name, total: t.total, wrong: t.wrong, wrongRate: pct(t.wrong, t.total) });
    }
    list.sort(function (x, y) {
      if (y.wrongRate !== x.wrongRate) return y.wrongRate - x.wrongRate;
      return y.total - x.total;
    });
    return list.slice(0, 8);
  }

  /* ---------- 各卡片渲染 ---------- */

  // 1. 概览
  function cardOverview(d) {
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">📊 诊断概览</span><span class="x">基于全部作答记录</span></div>' +
        '<div class="dg-stats">' +
          '<div class="dg-stat"><div class="n">' + d.total + '</div><div class="c">总作答数</div></div>' +
          '<div class="dg-stat"><div class="n">' + d.accuracy + '%</div><div class="c">整体正确率</div></div>' +
          '<div class="dg-stat"><div class="n" style="color:var(--warn)">' + d.rCount.R3 + '</div><div class="c">蒙对题数</div></div>' +
          '<div class="dg-stat"><div class="n">' + (d.avgSec || 0) + '</div><div class="c">平均用时(秒)</div></div>' +
        '</div>' +
      '</div>';
    return el(html);
  }

  // 2. 错因三维分布
  function cardErrorDist(d) {
    var total = d.total;
    // segmented bar
    var seg = '';
    var rows = '';
    var legend = '';
    for (var i = 0; i < R_ORDER.length; i++) {
      var code = R_ORDER[i];
      var def = R_DEFS[code];
      var cnt = d.rCount[code];
      var p = pct(cnt, total);
      var color = toneColor(def.tone);
      if (cnt > 0) {
        seg += '<i style="width:' + p + '%;background:' + color + '" title="' + code + ' ' + def.name + ' ' + p + '%"></i>';
      }
      rows +=
        '<div class="dg-rrow">' +
          '<span class="dg-dot" style="background:' + color + '"></span>' +
          '<span class="dg-rname">' + code + '·' + esc(def.name) + '</span>' +
          '<span class="dg-rtrack"><i style="width:' + p + '%;background:' + color + '"></i></span>' +
          '<span class="dg-rnum">' + cnt + ' · ' + p + '%</span>' +
        '</div>';
      legend +=
        '<div class="dg-leg"><span class="dg-dot" style="background:' + color + '"></span>' +
        '<span><b>' + code + ' ' + esc(def.name) + '</b> — ' + esc(def.desc) + '</span></div>';
    }
    if (!seg) seg = '<i style="width:100%;background:#f1f3f8"></i>';

    var moatNote =
      '<div class="dg-note">🛡️ <b>护城河：区分"蒙对"与"真会"。</b>' +
      '普通刷题工具只看对错，把 <b>R3 蒙对</b> 也算成"会"。上岸通把它单列出来——' +
      '绿色(R1/R2)才是真掌握，橙色(R3)是运气，红色(R4-R6)是真错。</div>';

    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">🧭 错因三维分布</span><span class="x">R1-R6</span></div>' +
        '<div class="dg-seg">' + seg + '</div>' +
        '<div class="dg-rlist">' + rows + '</div>' +
        '<div class="dg-legend">' + legend + '</div>' +
        moatNote +
      '</div>';
    return el(html);
  }

  // 3. 模块准确率
  function cardModuleAcc(d) {
    var rows = '';
    var any = false;
    for (var i = 0; i < MODULE_ORDER.length; i++) {
      var m = MODULE_ORDER[i];
      var mm = d.byModule[m];
      if (!mm || !mm.total) continue;
      any = true;
      var p = pct(mm.correct, mm.total);
      var color = p >= 70 ? C.success : (p >= 50 ? C.primary : C.danger);
      rows +=
        '<div class="dg-mrow">' +
          '<div class="mn"><b>' + esc(MODULE_NAMES[m] || m) + '</b>' +
            '<span>' + mm.correct + '/' + mm.total + ' · ' + p + '%</span></div>' +
          '<div class="dg-mtrack"><div class="dg-mfill" style="width:' + p + '%;background:' + color + '"></div></div>' +
        '</div>';
    }
    if (!any) rows = '<div class="dg-empty" style="padding:24px">暂无模块作答数据</div>';
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">📚 模块准确率</span><span class="x">正确数/总数</span></div>' +
        '<div class="dg-macc">' + rows + '</div>' +
      '</div>';
    return el(html);
  }

  // 4. 薄弱题型 TOP
  function cardWeakTopics(topics) {
    var body;
    if (!topics.length) {
      body = '<div class="dg-empty" style="padding:24px">题型样本不足（每类需≥3次作答），多刷几道后再看</div>';
    } else {
      var rows = '';
      for (var i = 0; i < topics.length; i++) {
        var t = topics[i];
        rows +=
          '<div class="dg-wrow">' +
            '<span class="dg-wrk' + (i === 0 ? ' top' : '') + '">' + (i + 1) + '</span>' +
            '<div class="dg-wmain">' +
              '<div class="dg-wname">' + esc(t.name) + '</div>' +
              '<div class="dg-wsub">错 ' + t.wrong + ' / 作答 ' + t.total + ' 次</div>' +
            '</div>' +
            '<span class="dg-wpct">' + t.wrongRate + '%</span>' +
          '</div>';
      }
      body = '<div class="dg-weak">' + rows + '</div>';
    }
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">🎯 薄弱题型 TOP</span><span class="x">按错误率排序</span></div>' +
        body +
      '</div>';
    return el(html);
  }

  // 5. 估分参考
  function cardScore(d) {
    var PER = 0.77;
    var est = Math.round(d.correct * PER);
    var papersHtml = '';
    var paperKeys = Object.keys(d.byPaper);
    if (paperKeys.length) {
      var pr = '';
      for (var i = 0; i < paperKeys.length; i++) {
        var k = paperKeys[i];
        var pp = d.byPaper[k];
        var pe = Math.round(pp.correct * PER);
        pr +=
          '<div class="dg-prow">' +
            '<div class="dg-pn"><div class="nm">' + esc(k) + '</div>' +
              '<div class="mt">' + pp.correct + '/' + pp.total + ' 正确</div></div>' +
            '<span class="dg-pv mid">约 ' + pe + ' 分</span>' +
          '</div>';
      }
      papersHtml =
        '<div style="margin-top:14px;font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:8px;">按套卷估算</div>' +
        '<div class="dg-papers">' + pr + '</div>';
    }
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">📈 估分参考</span><span class="x">行测约130题</span></div>' +
        '<div class="dg-score">' +
          '<div><span class="big">' + est + '</span><span class="u">分</span></div>' +
          '<div class="cap">正确 ' + d.correct + ' 题 × 约 ' + PER + ' 分/题</div>' +
          '<div class="warn">※ 仅供参考，非官方算法</div>' +
        '</div>' +
        papersHtml +
      '</div>';
    return el(html);
  }

  // 6. 元认知校准
  function cardMetacog(d) {
    var markRate = pct(d.guessTotal, d.total);          // 标蒙占比
    var hitInGuess = pct(d.rCount.R3, d.guessTotal);    // 蒙对占比(在标蒙里)
    var advice;
    if (d.guessTotal === 0) {
      advice = '你几乎没有标记"蒙"，说明作答自信度高——继续保持真实标记，诊断才更准。';
    } else if (hitInGuess >= 50) {
      advice = '蒙对比例偏高，靠运气拿分的成分较大，建议回归<b>方法库</b>补齐解题套路，把"蒙对"变"真会"。';
    } else if (markRate >= 30) {
      advice = '标蒙比例较高，说明不确定的题不少，建议针对薄弱题型做<b>专项训练</b>后再上量。';
    } else {
      advice = '标蒙与蒙对比例都在可控范围，元认知校准良好，保持真实标记即可。';
    }
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">🧠 元认知校准</span><span class="x">对自我判断的评估</span></div>' +
        '<div class="dg-cal">' +
          '<div class="dg-calc"><div class="n" style="color:var(--warn)">' + markRate + '%</div><div class="c">标蒙占比（' + d.guessTotal + '/' + d.total + '）</div></div>' +
          '<div class="dg-calc"><div class="n" style="color:var(--danger)">' + hitInGuess + '%</div><div class="c">蒙对占比（R3/标蒙）</div></div>' +
        '</div>' +
        '<div class="dg-note">' + advice + '</div>' +
      '</div>';
    return el(html);
  }

  // 7. 自动提升建议
  function cardAdvice(d, topics) {
    var tips = [];
    // 最弱模块
    var worstM = null, worstP = 101;
    for (var i = 0; i < MODULE_ORDER.length; i++) {
      var m = MODULE_ORDER[i];
      var mm = d.byModule[m];
      if (!mm || mm.total < 3) continue;
      var p = pct(mm.correct, mm.total);
      if (p < worstP) { worstP = p; worstM = m; }
    }
    if (worstM) {
      tips.push({ i: '📉', t: '最弱模块是「' + (MODULE_NAMES[worstM] || worstM) + '」（正确率 ' + worstP + '%），建议优先补这一块。' });
    }
    // 薄弱题型
    if (topics.length) {
      tips.push({ i: '🎯', t: '错误率最高的题型是「' + topics[0].name + '」（' + topics[0].wrongRate + '%），可做该题型专项。' });
    }
    // R3 蒙对占比高 -> 方法库
    var r3p = pct(d.rCount.R3, d.total);
    if (r3p >= 12) {
      tips.push({ i: '🛡️', t: '蒙对占比达 ' + r3p + '%，靠运气成分偏高，建议回「方法库」补通法，把蒙对变真会。' });
    }
    // R5 慢错占比高 -> 熟练度/限时
    var r5p = pct(d.rCount.R5, d.total);
    if (r5p >= 12) {
      tips.push({ i: '⏱️', t: '慢错(R5)占比达 ' + r5p + '%，方法不熟或速度不够，建议加练「限时训练」提升熟练度。' });
    }
    // 错题多 -> 错题重练
    var st = window.SAT && window.SAT.state;
    var mkCount = (st && Array.isArray(st.mistakes)) ? st.mistakes.length : 0;
    if (mkCount >= 5) {
      tips.push({ i: '📕', t: '错题本已累积 ' + mkCount + ' 道，建议做一轮「错题重练」巩固，别让它越滚越多。' });
    }
    // 兜底
    if (!tips.length) {
      tips.push({ i: '✅', t: '各项指标表现平稳，继续保持刷题节奏并真实标记「蒙」，诊断会越来越准。' });
    }
    // 控制 2-4 条
    tips = tips.slice(0, 4);

    var rows = '';
    for (var j = 0; j < tips.length; j++) {
      rows += '<div class="dg-advr"><span class="i">' + tips[j].i + '</span><span>' + esc(tips[j].t).replace(/&#39;/g, "'") + '</span></div>';
    }
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">💡 自动提升建议</span><span class="x">来自你的数据</span></div>' +
        '<div class="dg-adv">' + rows + '</div>' +
      '</div>';
    return el(html);
  }

  // 8. 按套卷
  function cardPapers(d) {
    var keys = Object.keys(d.byPaper);
    if (!keys.length) return null;
    var rows = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var pp = d.byPaper[k];
      var p = pct(pp.correct, pp.total);
      var cls, verdict;
      if (p >= 70) { cls = 'strong'; verdict = '强'; }
      else if (p >= 50) { cls = 'mid'; verdict = '中'; }
      else { cls = 'weak'; verdict = '弱'; }
      rows +=
        '<div class="dg-prow">' +
          '<div class="dg-pn"><div class="nm">' + esc(k) + '</div>' +
            '<div class="mt">正确率 ' + p + '% · ' + pp.correct + '/' + pp.total + '</div></div>' +
          '<span class="dg-pv ' + cls + '">' + verdict + '</span>' +
        '</div>';
    }
    var html =
      '<div class="dg-card">' +
        '<div class="dg-h"><span class="t">📄 按套卷表现</span><span class="x">强 / 中 / 弱</span></div>' +
        '<div class="dg-papers">' + rows + '</div>' +
      '</div>';
    return el(html);
  }

  /* ---------- 空状态 ---------- */
  function renderEmpty(root) {
    root.innerHTML =
      '<div id="dg-root">' +
        '<div class="dg-card"><div class="dg-empty">' +
          '<span class="em">🩺</span>暂无数据，先去刷几道题再来诊断吧～' +
        '</div></div>' +
      '</div>';
  }

  /* ---------- 入口 ---------- */
  function mount(rootEl) {
    if (!rootEl) return;
    rootEl.innerHTML = ''; // 清空，防泄漏

    injectStyle();

    var SAT = window.SAT;
    var attempts = (SAT && SAT.state && Array.isArray(SAT.state.attempts)) ? SAT.state.attempts : null;
    if (!SAT || !attempts || attempts.length === 0) {
      renderEmpty(rootEl);
      return;
    }

    var container = document.createElement('div');
    container.id = 'dg-root';

    var d = analyze(attempts);
    var topics = analyzeTopics(attempts);

    var cards = [
      cardOverview(d),
      cardErrorDist(d),
      cardModuleAcc(d),
      cardWeakTopics(topics),
      cardScore(d),
      cardMetacog(d),
      cardAdvice(d, topics),
      cardPapers(d) // 可能为 null
    ];
    for (var i = 0; i < cards.length; i++) {
      if (cards[i]) container.appendChild(cards[i]);
    }

    rootEl.appendChild(container);
  }

  window.Diagnosis = { mount: mount };
})();
