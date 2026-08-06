/* ===========================================================
 * 上岸通 · 目标差距看板（P2）
 * 用法: window.Dashboard.mount(rootEl)
 * 数据: window.SAT.state.attempts (统一作答) + window.Difficulty (模块正确率/题量)
 * 目标: 行测 85 分。看板回答三件事——
 *   ① 我现在离 85 还差多少（模块均衡度）
 *   ② 我的正确率在怎么变（近30天趋势）
 *   ③ 先补哪块最划算（差距×题量 排序）
 * =========================================================== */
(function () {
  'use strict';

  var TARGET = 0.85;
  var MODULES = [
    { key: 'zhengzhi', name: '政治理论' },
    { key: 'changshi', name: '常识判断' },
    { key: 'yanyu', name: '言语理解' },
    { key: 'shuliang', name: '数量关系' },
    { key: 'panduan', name: '判断推理' },
    { key: 'ziliao', name: '资料分析' }
  ];
  var ESC = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  function getAttempts() {
    try {
      var st = window.SAT && window.SAT.state;
      if (st && Array.isArray(st.attempts)) return st.attempts;
    } catch (e) {}
    try { if (window.State && Array.isArray(window.State.attempts)) return window.State.attempts; } catch (e) {}
    return [];
  }
  function dayKey(ts) {
    var d = new Date(ts);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function accColor(acc) {
    if (acc == null) return '#94a3b8';
    if (acc >= 0.85) return '#22c55e';
    if (acc >= 0.70) return '#f59e0b';
    return '#ef4444';
  }

  // 近 N 天逐日正确率（可选 modKey 限定模块；null=总体）
  function buildTrend(attempts, n, modKey) {
    var byDay = {};
    attempts.forEach(function (a) {
      if (a.correct == null || !a.ts) return;
      if (modKey && a.module !== modKey) return;
      var k = dayKey(a.ts);
      if (!byDay[k]) byDay[k] = { tot: 0, cor: 0 };
      byDay[k].tot++; if (a.correct === true) byDay[k].cor++;
    });
    var days = [];
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(today); d.setDate(today.getDate() - i);
      var k = dayKey(d.getTime());
      var rec = byDay[k];
      days.push({
        key: k,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        acc: rec && rec.tot ? rec.cor / rec.tot : null,
        tot: rec ? rec.tot : 0
      });
    }
    return days;
  }

  function lineChart(days) {
    var W = 340, H = 170, padL = 30, padR = 10, padT = 12, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    function y(acc) { return padT + (1 - acc) * plotH; }     // acc 0..1 -> top..bottom
    function x(i) { return padL + (days.length <= 1 ? plotW / 2 : i * plotW / (days.length - 1)); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="db-chart" preserveAspectRatio="none">';
    // 网格 + Y 轴刻度 0/50/85/100
    [0, 0.5, 0.85, 1].forEach(function (v) {
      var yy = y(v);
      var isT = Math.abs(v - TARGET) < 1e-6;
      svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="' + (isT ? '#ef4444' : '#e2e8f0') + '" stroke-width="' + (isT ? 1.4 : 0.8) + '" stroke-dasharray="' + (isT ? '5 3' : '0') + '"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="' + (isT ? '#ef4444' : '#94a3b8') + '">' + Math.round(v * 100) + '</text>';
    });
    // 折线（跳过无数据日，断点）
    var pts = [];
    days.forEach(function (d, i) { if (d.acc != null) pts.push([x(i), y(d.acc), d]); });
    if (pts.length > 1) {
      var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      svg += '<path d="' + path + '" fill="none" stroke="#5b6cff" stroke-width="2" stroke-linejoin="round"/>';
    }
    pts.forEach(function (p) {
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="#5b6cff"/>';
    });
    // X 轴标签（首/中/尾）
    [0, Math.floor((days.length - 1) / 2), days.length - 1].forEach(function (i) {
      if (days[i]) svg += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#94a3b8">' + days[i].label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  // 线性外推：用最近 7 个有数据点的斜率，向后预测 futureN 天
  function predictLine(pastDays, futureN) {
    var pts = [];
    pastDays.forEach(function (d, i) { if (d.acc != null) pts.push([i, d.acc]); });
    if (pts.length < 2) return { enough: false, future: [] };
    var last7 = pts.slice(-7);
    var n = last7.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    last7.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
    var denom = n * sxx - sx * sx;
    var slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
    var b0 = (sy - slope * sx) / n;
    var future = [];
    for (var f = 0; f < futureN; f++) {
      var idx = pastDays.length + f;
      var v = b0 + slope * idx;
      v = Math.max(0, Math.min(1, v));
      future.push(v);
    }
    return { enough: true, slope: slope, b0: b0, future: future, lastVal: pts[pts.length - 1][1] };
  }

  // 预测分曲线：前30天实际(蓝实线) + 后30天预测(蓝虚线) + 85红线贯穿
  function predChart(pastDays, futureVals, onEtaF) {
    var W = 340, H = 170, padL = 30, padR = 10, padT = 12, padB = 24;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var total = pastDays.length + futureVals.length;
    function y(acc) { return padT + (1 - acc) * plotH; }
    function x(i) { return padL + (total <= 1 ? plotW / 2 : i * plotW / (total - 1)); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="db-chart" preserveAspectRatio="none">';
    // 网格 + Y 轴
    [0, 0.5, 0.85, 1].forEach(function (v) {
      var yy = y(v);
      var isT = Math.abs(v - TARGET) < 1e-6;
      svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="' + (isT ? '#ef4444' : '#e2e8f0') + '" stroke-width="' + (isT ? 1.4 : 0.8) + '" stroke-dasharray="' + (isT ? '5 3' : '0') + '"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="9" fill="' + (isT ? '#ef4444' : '#94a3b8') + '">' + Math.round(v * 100) + '</text>';
    });
    // 今天分隔线
    var xToday = x(pastDays.length - 1);
    svg += '<line x1="' + xToday.toFixed(1) + '" y1="' + padT + '" x2="' + xToday.toFixed(1) + '" y2="' + (H - padB) + '" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="2 2"/>';
    // 实际（蓝实线）
    var pts = [];
    pastDays.forEach(function (d, i) { if (d.acc != null) pts.push([x(i), y(d.acc), i]); });
    if (pts.length > 1) {
      var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      svg += '<path d="' + path + '" fill="none" stroke="#5b6cff" stroke-width="2"/>';
      pts.forEach(function (p) { svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.2" fill="#5b6cff"/>'; });
    }
    // 预测（蓝虚线）：从最后一个实际点连出
    if (pts.length) {
      var lastIdx = pastDays.length - 1;
      while (lastIdx >= 0 && pastDays[lastIdx].acc == null) lastIdx--;
      var lx = x(lastIdx), ly = y(pastDays[lastIdx].acc);
      var dpath = 'M' + lx.toFixed(1) + ' ' + ly.toFixed(1);
      futureVals.forEach(function (v, f) { dpath += ' L' + x(pastDays.length + f).toFixed(1) + ' ' + y(v).toFixed(1); });
      svg += '<path d="' + dpath + '" fill="none" stroke="#5b6cff" stroke-width="2" stroke-dasharray="5 4"/>';
      futureVals.forEach(function (v, f) {
        svg += '<circle cx="' + x(pastDays.length + f).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="1.8" fill="#5b6cff" opacity="0.6"/>';
      });
      // 85 达标标记
      if (onEtaF != null && onEtaF >= 0 && onEtaF < futureVals.length) {
        var ex = x(pastDays.length + onEtaF), ey = y(0.85);
        svg += '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4" fill="#ef4444" stroke="#fff" stroke-width="1"/>';
        svg += '<text x="' + ex.toFixed(1) + '" y="' + (ey - 6).toFixed(1) + '" text-anchor="middle" font-size="8" fill="#ef4444">85</text>';
      }
    }
    // X 轴标签
    svg += '<text x="' + x(0).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#94a3b8">30天前</text>';
    svg += '<text x="' + xToday.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#64748b">今天</text>';
    svg += '<text x="' + x(total - 1).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#94a3b8">+30天</text>';
    svg += '</svg>';
    return svg;
  }

  // 预计达到 85 分的文字说明
  function etaText(pred, pastDays) {
    if (!pred.enough) return '近 7 天数据不足，无法外推预测（至少需 2 天有作答）。';
    if (pred.lastVal >= 0.85) return '当前正确率已达 85% ✓ 保持手感即可。';
    if (pred.slope <= 1e-6) return '近 7 天斜率持平或下滑，按当前节奏难以达到 85%，建议优先补强。';
    var etaIdx = (TARGET - pred.b0) / pred.slope;
    var offset = Math.round(etaIdx - (pastDays.length - 1));
    if (offset <= 0) return '当前正确率已达 85% ✓';
    if (offset > 730) return '按当前斜率约需 ' + offset + ' 天达到 85%，难度较大，建议加大练习量。';
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset);
    var md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    var inWin = offset <= 30;
    return '按近 7 天斜率外推，预计约 ' + offset + ' 天后（' + md + '）达到 85%' + (inWin ? '' : '（超出 30 天预测窗）') + '。';
  }

  // 预测曲线选中的模块（模块 key 或 'overall'）；未初始化时自动选差距最大的模块
  var predSel;

  function render(root) {
    if (window.Difficulty && window.Difficulty.refresh) window.Difficulty.refresh();
    var attempts = getAttempts();
    var total = attempts.length;
    var correct = attempts.filter(function (a) { return a.correct === true; }).length;
    var overall = total ? correct / total : null;

    // 模块数据
    var mods = MODULES.map(function (m) {
      var acc = window.Difficulty ? window.Difficulty.moduleAccuracy(m.key) : null;
      var freq = window.Difficulty ? window.Difficulty.moduleFreq(m.key) : 0;
      var gap = (acc == null) ? null : Math.max(0, TARGET - acc);
      return { m: m, acc: acc, freq: freq, gap: gap };
    });
    // 差距排序（已测且低于85，按 差距×题量）
    var priorities = mods.filter(function (x) { return x.acc != null && x.gap > 0; })
      .map(function (x) { return { key: x.m.key, name: x.m.name, gap: x.gap, freq: x.freq, score: x.gap * Math.max(1, x.freq) }; })
      .sort(function (a, b) { return b.score - a.score; });

    var trend = buildTrend(attempts, 30);
    var testedMods = mods.filter(function (x) { return x.acc != null; }).length;

    // 预测曲线默认选中差距最大的模块；未初始化或该模块无数据则回落总体
    if (typeof predSel === 'undefined') {
      predSel = (priorities.length ? priorities[0].key : 'overall');
    }
    if (predSel && predSel !== 'overall') {
      var selMod = mods.filter(function (x) { return x.m.key === predSel; })[0];
      if (!selMod || selMod.acc == null) predSel = 'overall';
    }

    var html = '';
    // —— 总览 ——
    html += '<section class="card db-overview">';
    html += '<div class="db-ov-grid">';
    html += '<div class="db-ov"><div class="db-ov-num">' + total + '</div><div class="db-ov-cap">累计作答</div></div>';
    html += '<div class="db-ov"><div class="db-ov-num" style="color:' + accColor(overall) + '">' + (overall == null ? '—' : Math.round(overall * 100) + '%') + '</div><div class="db-ov-cap">总体正确率</div></div>';
    html += '<div class="db-ov"><div class="db-ov-num">85%</div><div class="db-ov-cap">行测目标</div></div>';
    html += '<div class="db-ov"><div class="db-ov-num">' + testedMods + '/6</div><div class="db-ov-cap">已测模块</div></div>';
    html += '</div></section>';

    if (total === 0) {
      html += '<div class="empty card">还没有作答记录。先去 <a href="#practice">刷题</a> 或 <a href="#exam">模考</a>，这里会实时显示你离 85 分的差距。</div>';
      root.innerHTML = html;
      return;
    }

    // —— 模块均衡度 vs 85 ——
    html += '<section class="card"><div class="card-head"><div class="card-title">模块均衡度 · 距 85 分差距</div><div class="card-extra">绿=达标 橙=接近 红=偏低</div></div>';
    html += '<div class="db-mods">';
    mods.forEach(function (x) {
      var pct = x.acc == null ? 0 : Math.round(x.acc * 100);
      var col = accColor(x.acc);
      var barW = x.acc == null ? 0 : Math.round(x.acc * 100);
      var gapTxt = x.acc == null ? '未测' : (x.gap > 0 ? '差 ' + Math.round(x.gap * 100) + ' 分' : '已达标 ✓');
      html += '<div class="db-mod-row">';
      html += '<div class="db-mod-name">' + x.m.name + '</div>';
      html += '<div class="db-bar-track"><div class="db-bar-fill" style="width:' + barW + '%;background:' + col + '"></div>';
      html += '<div class="db-target-mark" style="left:85%"></div></div>';
      html += '<div class="db-mod-val" style="color:' + col + '">' + (x.acc == null ? '—' : pct + '%') + '</div>';
      html += '<div class="db-mod-gap ' + (x.acc == null ? '' : (x.gap > 0 ? 'low' : 'ok')) + '">' + gapTxt + '</div>';
      html += '</div>';
    });
    html += '</div></section>';

    // —— 趋势曲线 ——
    html += '<section class="card"><div class="card-head"><div class="card-title">近 30 天正确率趋势</div><div class="card-extra">红线=85目标</div></div>';
    html += lineChart(trend);
    html += '</section>';

    // —— 预测分曲线 ——
    var predModKey = (predSel && predSel !== 'overall') ? predSel : null;
    var note = '';
    var pastDays = buildTrend(attempts, 30, predModKey);
    if (predModKey && !attempts.some(function (a) { return a.module === predModKey; })) {
      pastDays = buildTrend(attempts, 30, null);
      note = '（该模块暂无作答，已用整体趋势代替）';
      predModKey = null;
    }
    var pred = predictLine(pastDays, 30);
    var onEtaF = -1;
    if (pred.enough) {
      for (var fi = 0; fi < pred.future.length; fi++) {
        if (pred.future[fi] >= 0.8499) { onEtaF = fi; break; }
      }
    }
    var chips = [{ k: 'overall', n: '总体' }].concat(
      MODULES.map(function (m) { return { k: m.key, n: m.name }; })
    );
    html += '<section class="card"><div class="card-head"><div class="card-title">预测分曲线</div><div class="card-extra">蓝实=实际 蓝虚=预测' + note + '</div></div>';
    html += '<div class="db-pred-chips" id="dbPredChips">';
    chips.forEach(function (c) {
      html += '<span class="db-pred-chip ' + (predSel === c.k ? 'active' : '') + '" data-mod="' + c.k + '">' + c.n + '</span>';
    });
    html += '</div>';
    if (!pred.enough) {
      html += '<div class="db-pred-note">' + etaText(pred, pastDays) + '</div>';
    } else {
      html += predChart(pastDays, pred.future, onEtaF);
      html += '<div class="db-pred-eta">' + etaText(pred, pastDays) + '</div>';
    }
    html += '</section>';

    // —— 优先补哪块 ——
    html += '<section class="card"><div class="card-head"><div class="card-title">优先补强排序</div><div class="card-extra">差距 × 题量</div></div>';
    if (priorities.length === 0) {
      html += '<div class="db-allok">🎉 六大模块已全部达到 85%，保持手感即可。</div>';
    } else {
      html += '<div class="db-prio">';
      priorities.forEach(function (p, i) {
        html += '<div class="db-prio-row"><span class="db-prio-rank">' + (i + 1) + '</span><span class="db-prio-name">' + p.name + '</span>';
        html += '<span class="db-prio-gap">差 ' + Math.round(p.gap * 100) + ' 分</span>';
        html += '<span class="db-prio-freq">· ' + p.freq + ' 题量</span></div>';
      });
      html += '</div>';
    }
    html += '</section>';

    root.innerHTML = html;

    // 预测模块切换
    var chipBox = root.querySelector('#dbPredChips');
    if (chipBox) {
      chipBox.onclick = function (e) {
        var el = e.target.closest('.db-pred-chip');
        if (!el) return;
        predSel = el.dataset.mod;
        render(root);
      };
    }
  }

  function mount(root) { if (root) render(root); }
  window.Dashboard = { mount: mount };
})();
