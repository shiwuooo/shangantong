/* ===========================================================
   上岸通 · 私人教练引擎 (Coach Engine)
   window.Coach = { profile(), plan(), insights(), greet(), predict() }
   依赖: window.SAT.state / window.QB / window.Difficulty / window.KnowledgeTree
   设计原则：只读你的本地作答记录，把每一次表现(对/错/快慢/蒙/时段/连对)
            都变成"下一步该练什么"的决策信号。无任何外部请求 / 数据外传。
   =========================================================== */
(function () {
  'use strict';

  var MOD_ORDER = ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'zhengzhi'];
  var MOD_NAMES = {
    zhengzhi: '政治理论', changshi: '常识判断', yanyu: '言语理解',
    shuliang: '数量关系', panduan: '判断推理', ziliao: '资料分析', shenlun: '申论'
  };
  // 国考行测近似题量分布（估算，合计 130），用于模块加权估分
  var WEIGHTS = { yanyu: 40, panduan: 30, ziliao: 20, shuliang: 15, changshi: 10, zhengzhi: 15 };
  var SLOW_MS = { changshi: 20000, yanyu: 60000, shuliang: 90000, panduan: 70000, ziliao: 90000, shenlun: 120000 };
  var DAY = 86400000;
  var R_DEFS = {
    R1: '真会答对', R2: '对但超时', R3: '蒙对', R4: '错·快', R5: '错·慢', R6: '蒙错'
  };

  // qid -> module / qid -> keypoints（来自 QB，构建一次）
  var qMod = {}, qKp = {};
  function indexQB() {
    qMod = {}; qKp = {};
    if (!window.QB) return;
    Object.keys(window.QB).forEach(function (m) {
      (window.QB[m] || []).forEach(function (q) {
        if (!q || !q.id) return;
        qMod[q.id] = m;
        if (q.keypoints && q.keypoints.length) qKp[q.id] = q.keypoints;
      });
    });
  }

  function getAttempts() {
    try {
      var st = window.SAT && window.SAT.state;
      if (st && Array.isArray(st.attempts)) return st.attempts;
    } catch (e) {}
    return [];
  }
  function getState() {
    try { return (window.SAT && window.SAT.state) || null; } catch (e) { return null; }
  }
  function accOf(arr) {
    if (!arr || !arr.length) return null;
    var c = 0; arr.forEach(function (x) { if (x.correct) c++; });
    return c / arr.length;
  }
  function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  function moduleName(m) { return MOD_NAMES[m] || m; }

  // ---------- 聚合 ----------
  function buildAgg() {
    indexQB();
    var A = getAttempts();
    var byMod = {}, byKp = {}, byHour = {}, last = {},
        codes = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 }, codeTot = 0, guessTot = 0;
    A.forEach(function (a) {
      var m = a.module; if (!m) return;
      if (!byMod[m]) byMod[m] = { tot: 0, cor: 0, msSum: 0, msN: 0, guess: 0 };
      var bm = byMod[m];
      bm.tot++; if (a.correct) bm.cor++;
      if (typeof a.ms === 'number' && a.ms > 0) { bm.msSum += a.ms; bm.msN++; }
      if (a.guess) bm.guess++;
      if (a.code && codes.hasOwnProperty(a.code)) { codes[a.code]++; codeTot++; }
      if (a.ts) {
        var h = new Date(a.ts).getHours();
        if (!byHour[h]) byHour[h] = { tot: 0, cor: 0 };
        byHour[h].tot++; if (a.correct) byHour[h].cor++;
      }
      if (!last[m]) last[m] = [];
      last[m].push(!!a.correct);
      var kps = qKp[a.id];
      if (kps) kps.forEach(function (k) {
        if (!byKp[k]) byKp[k] = { tot: 0, cor: 0, mod: m };
        byKp[k].tot++; if (a.correct) byKp[k].cor++;
      });
    });
    Object.keys(last).forEach(function (m) { last[m] = last[m].slice(-8); });
    return { byMod: byMod, byKp: byKp, byHour: byHour, last: last, codes: codes, codeTot: codeTot, guessTot: guessTot, total: A.length };
  }

  // ---------- 趋势 / 退步 ----------
  function modTrend(m, byMod) {
    var A = getAttempts().filter(function (a) { return a.module === m; });
    var now = Date.now(), recent = [], prev = [];
    A.forEach(function (x) {
      var age = now - (x.ts || 0);
      if (age < 14 * DAY) recent.push(x);
      else if (age < 28 * DAY) prev.push(x);
    });
    var ra = accOf(recent), pa = accOf(prev);
    var delta = (ra != null && pa != null) ? Math.round((ra - pa) * 1000) / 10 : null;
    return {
      recent: ra, prev: pa, delta: delta,
      recentN: recent.length, prevN: prev.length,
      regression: (delta != null && delta <= -10 && recent.length >= 5),
      improving: (delta != null && delta >= 10 && recent.length >= 5)
    };
  }

  function trailingStreak(arr) {
    var n = 0;
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i]) n++; else break; }
    return n;
  }

  // ---------- 薄弱考点 / FSRS 到期（按模块）----------
  function weakKpByMod(byKp) {
    var out = {};
    Object.keys(byKp).forEach(function (k) {
      var t = byKp[k];
      if (t.tot >= 3 && (t.tot - t.cor) / t.tot > 0.4) {
        if (!out[t.mod]) out[t.mod] = [];
        out[t.mod].push({ name: k, wrongRate: pct(t.tot - t.cor, t.tot), tot: t.tot });
      }
    });
    Object.keys(out).forEach(function (m) {
      out[m].sort(function (x, y) { return y.wrongRate - x.wrongRate; }).slice(0, 3);
    });
    return out;
  }
  function dueByMod() {
    var st = getState();
    var out = {};
    if (st && st.training && st.training.reviews) {
      var now = Date.now();
      Object.keys(st.training.reviews).forEach(function (qid) {
        var r = st.training.reviews[qid];
        if (!r || r.due > now) return;
        var m = qMod[qid] || (r.module);
        if (!m) return;
        out[m] = (out[m] || 0) + 1;
      });
    }
    return out;
  }

  // ---------- 估分（模块加权，目标 85）----------
  function predict() {
    if (window.Difficulty && window.Difficulty.refresh) window.Difficulty.refresh();
    var total = 0, any = false;
    MOD_ORDER.forEach(function (m) {
      var acc = (window.Difficulty && window.Difficulty.moduleAccuracy) ? window.Difficulty.moduleAccuracy(m) : null;
      if (acc == null) return;
      var w = WEIGHTS[m] || 0;
      total += acc * w * (100 / 130); any = true;
    });
    return any ? Math.round(total) : null;
  }

  // ========================================================
  //  对外 API
  // ========================================================
  function profile() {
    var agg = buildAgg();
    var st = getState();
    var dayStreak = 0, activeDays = 0, lastTs = 0;
    if (st && st.days) {
      var keys = Object.keys(st.days).sort();
      activeDays = keys.length;
      lastTs = keys.length ? new Date(keys[keys.length - 1] + 'T23:59:59').getTime() : 0;
      // 连续打卡（从今天往前数）
      var d = new Date(); d.setHours(0, 0, 0, 0);
      for (var i = 0; i < 365; i++) {
        var k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        if (st.days[k]) dayStreak++; else if (i > 0) break;
        d = new Date(d.getTime() - DAY);
      }
    }

    var modules = {};
    MOD_ORDER.forEach(function (m) {
      var bm = agg.byMod[m];
      var tr = modTrend(m, agg);
      var acc = bm ? pct(bm.cor, bm.tot) / 100 : null;
      modules[m] = {
        name: moduleName(m),
        acc: acc, n: bm ? bm.tot : 0,
        avgSec: bm && bm.msN ? Math.round(bm.msSum / bm.msN / 100) / 10 : null,
        guessRate: bm && bm.tot ? pct(bm.guess, bm.tot) / 100 : 0,
        trend: tr,
        streak: agg.last[m] ? trailingStreak(agg.last[m]) : 0,
        last8: agg.last[m] || []
      };
    });

    // 微信号：速度-正确率分布
    var codes = agg.codes, codeTot = agg.codeTot;
    var speedAcc = {};
    Object.keys(codes).forEach(function (k) {
      speedAcc[k] = { label: R_DEFS[k], n: codes[k], pct: codeTot ? pct(codes[k], codeTot) : 0 };
    });

    // 时段表现
    var best = null, worst = null;
    Object.keys(agg.byHour).forEach(function (h) {
      var t = agg.byHour[h]; if (t.tot < 3) return;
      var a = pct(t.cor, t.tot);
      if (best == null || a > best.acc) best = { hour: +h, acc: a, n: t.tot };
      if (worst == null || a < worst.acc) worst = { hour: +h, acc: a, n: t.tot };
    });

    return {
      total: agg.total, activeDays: activeDays, dayStreak: dayStreak, lastTs: lastTs,
      predicted: predict(), gapTo85: (predict() != null ? 85 - predict() : null),
      modules: modules,
      speedAcc: speedAcc, codeTot: codeTot,
      bestHour: best, worstHour: worst,
      weakKpByMod: weakKpByMod(agg.byKp),
      dueByMod: dueByMod()
    };
  }

  // 今日训练计划（按 差距×退步×薄弱×到期 加权）
  function plan() {
    var P = profile();
    if (P.total < 5) {
      return { empty: true, total: P.total, headline: '教练还在认识你，先刷 5 道题，我会为你定制今日训练。' };
    }
    var items = [];
    MOD_ORDER.forEach(function (m) {
      var mm = P.modules[m];
      if (!mm.n) return;
      var gap = mm.acc != null ? Math.max(0, 85 - mm.acc * 100) : 60;
      var w = (gap / 100) * 1.0;
      if (mm.trend.regression) w += 0.6;
      var wkList = P.weakKpByMod[m] || [];
      var wk = wkList.length; w += Math.min(wk, 4) * 0.07;
      var wkName = wkList[0] ? wkList[0].name : null; // 最薄弱考点名（用于一键开练精准直达）
      var due = P.dueByMod[m] || 0; w += Math.min(due, 6) * 0.05;
      w += Math.min(mm.guessRate, 0.5) * 0.4;
      if (w < 0.15 && due === 0 && wk === 0) return; // 达标且无明显信号则跳过
      // 焦点：先处理退步，再蒙题，再慢错，再薄弱考点，再基础，最后维持
      var focus;
      if (mm.trend.regression) focus = '退步警报·限时重练';
      else if (mm.guessRate > 0.3) focus = '回方法库打底，降蒙题';
      else if (P.speedAcc.R5 && P.speedAcc.R5.pct >= 15) focus = '限时提速训练';
      else if (wk > 0) focus = '薄弱考点专练(' + P.weakKpByMod[m][0].name + ')';
      else if (mm.acc != null && mm.acc < 0.7) focus = '夯实基础';
      else focus = '维持手感·冲高分';
      items.push({ mod: m, name: mm.name, weight: w, focus: focus, weakKp: wk, weakKpName: wkName, due: due });
    });
    if (!items.length) {
      return { empty: false, lowPriority: true, headline: '你目前各模块都达标或信号平稳，今天做一组综合限时模考保持手感即可。', items: [] };
    }
    items.sort(function (a, b) { return b.weight - a.weight; });
    var wsum = 0; items.forEach(function (it) { wsum += it.weight; });
    var BUDGET = 35; // 今日目标题量
    items.forEach(function (it) {
      it.count = Math.max(5, Math.round(BUDGET * it.weight / wsum));
      var slow = (SLOW_MS[it.mod] || 60000) / 60000;
      it.estMin = Math.max(3, Math.round(it.count * slow * 1.3));
    });
    var total = 0, totalMin = 0;
    items.forEach(function (it) { total += it.count; totalMin += it.estMin; });
    var headline = '今日重点：' + items.slice(0, 2).map(function (it) { return it.name; }).join(' + ') +
      '（共约 ' + total + ' 题 / ' + totalMin + ' 分钟）';
    return { empty: false, items: items, total: total, totalMin: totalMin, headline: headline };
  }

  // 教练主动洞察（按紧急度排序）
  function insights() {
    var P = profile();
    if (P.total < 5) {
      return [{ level: 'info', icon: '👋', text: '教练已就位。每做一题，我都会记下来——先随便刷几道，我马上给你第一份诊断。' }];
    }
    var list = [];
    // 退步预警
    MOD_ORDER.forEach(function (m) {
      var mm = P.modules[m];
      if (mm.trend.regression) {
        var wk = (P.weakKpByMod[m] || [])[0];
        list.push({ level: 'warn', icon: '⚠️', text: mm.name + ' 近 14 天正确率从 ' + (mm.trend.prev != null ? Math.round(mm.trend.prev * 100) : '?') + '% 掉到 ' + Math.round(mm.trend.recent * 100) + '%，退步了。今天别盲目加量，先' + (wk ? '专攻「' + wk.name + '」' : '限时重练') + '。' });
      }
    });
    // 蒙题率
    MOD_ORDER.forEach(function (m) {
      var mm = P.modules[m];
      if (mm.n >= 5 && mm.guessRate > 0.3) {
        list.push({ level: 'warn', icon: '🎲', text: mm.name + ' 蒙题率 ' + Math.round(mm.guessRate * 100) + '% 偏高，说明不少题是"猜对"，建议回方法库补通法，把蒙对变真会。' });
      }
    });
    // 错且慢
    if (P.speedAcc.R5 && P.speedAcc.R5.pct >= 15) {
      list.push({ level: 'info', icon: '⏱️', text: '你「错且慢」占比 ' + P.speedAcc.R5.pct + '%，方法不熟或速度不够，加一组限时训练效果最好。' });
    }
    // 连对手感
    MOD_ORDER.forEach(function (m) {
      var mm = P.modules[m];
      if (mm.streak >= 6) {
        list.push({ level: 'good', icon: '🔥', text: mm.name + ' 连对 ' + mm.streak + ' 题，手感正热，趁势多刷巩固成肌肉记忆。' });
      }
    });
    // 平台期
    MOD_ORDER.forEach(function (m) {
      var mm = P.modules[m];
      if (mm.acc != null && mm.acc >= 0.7 && mm.acc < 0.85 && !mm.trend.improving && mm.n >= 10) {
        list.push({ level: 'info', icon: '📌', text: mm.name + ' 卡在 ' + Math.round(mm.acc * 100) + '%，想破 85 需专攻该模块最高频考点（见考频热力）。' });
      }
    });
    // 到期复习
    var dueTot = 0; Object.keys(P.dueByMod).forEach(function (m) { dueTot += P.dueByMod[m]; });
    if (dueTot >= 5) {
      list.push({ level: 'info', icon: '🔁', text: '有 ' + dueTot + ' 道错题/旧题间隔记忆已到期，训练页已为你排好，先做这波复习最划算。' });
    }
    // 时段
    if (P.bestHour && P.worstHour && (P.bestHour.acc - P.worstHour.acc) >= 10) {
      list.push({ level: 'info', icon: '🕐', text: '你 ' + P.bestHour.hour + ' 点时段正确率最高（' + P.bestHour.acc + '%），' + P.worstHour.hour + ' 点最低（' + P.worstHour.acc + '%）；把重要练习安排在状态好的时段。' });
    }
    // 兜底
    if (!list.length) {
      list.push({ level: 'good', icon: '✅', text: '各项指标平稳，保持节奏。真实标记「蒙」会让教练越来越懂你。' });
    }
    var order = { warn: 0, info: 1, good: 2 };
    list.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return list.slice(0, 6);
  }

  // 教练问候（动态）
  function greet() {
    var P = profile();
    var now = new Date();
    var last = P.lastTs ? new Date(P.lastTs) : null;
    var open;
    if (P.total < 5) open = '教练刚上线，正在认识你。';
    else if (!last) open = '教练已就位。';
    else {
      var mins = Math.floor((now - last) / 60000);
      if (mins < 60) open = '你 ' + mins + ' 分钟前刚练过，状态在线。';
      else if (mins < 1440) open = '你约 ' + Math.floor(mins / 60) + ' 小时前练过，今天再续上？';
      else open = '你已 ' + Math.floor(mins / 1440) + ' 天没练了，今天重新激活一下？';
    }
    var mid;
    if (P.predicted != null) mid = '当前行测估分约 ' + P.predicted + ' 分（距 85 还差 ' + P.gapTo85 + ' 分）。';
    else mid = '先做几题，我就能估算你的行测分数。';
    return open + mid;
  }

  window.Coach = {
    profile: profile, plan: plan, insights: insights, greet: greet, predict: predict
  };
})();
