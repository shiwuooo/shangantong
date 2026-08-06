/* ===========================================================
   上岸通 · 私人教练 UI (Coach UI)
   window.CoachUI = { mount(rootEl) }
   依赖: window.Coach / window.Difficulty
   纯静态、无框架；每次进入重新 mount，实时反映最新作答。
   =========================================================== */
(function () {
  'use strict';

  var C = {
    primary: '#5b6cff', warn: '#ff9f43', success: '#22c55e',
    info: '#06b6d6', danger: '#ef4444',
    text: '#1f2330', text2: '#6b7280', text3: '#9ca3af', border: '#eef0f5'
  };
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  function injectStyle() {
    if (document.getElementById('coach-style')) return;
    var css =
      '#co-root{--primary:#5b6cff;--warn:#ff9f43;--success:#22c55e;--info:#06b6d4;--danger:#ef4444;--text:#1f2330;--text-2:#6b7280;--text-3:#9ca3af;--border:#eef0f5;--shadow:0 2px 14px rgba(31,35,48,.06);--radius:14px;}' +
      '.co-card{background:#fff;margin:12px 14px;padding:16px;border-radius:var(--radius);box-shadow:var(--shadow);}' +
      '.co-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
      '.co-h .t{font-weight:800;font-size:15px;color:var(--text);}' +
      '.co-h .x{font-size:11px;color:var(--text-3);}' +
      // 问候卡
      '.co-greet{background:linear-gradient(135deg,#5b6cff,#7c8cff);color:#fff;}' +
      '.co-greet .co-g-t{font-size:17px;font-weight:800;line-height:1.5;}' +
      '.co-greet .co-g-s{font-size:12.5px;color:rgba(255,255,255,.85);margin-top:8px;line-height:1.6;}' +
      '.co-greet .co-g-score{margin-top:14px;display:flex;align-items:center;gap:16px;}' +
      '.co-greet .co-score-big{font-size:38px;font-weight:800;line-height:1;}' +
      '.co-greet .co-score-cap{font-size:11px;color:rgba(255,255,255,.8);}' +
      '.co-greet .co-gap{margin-left:auto;text-align:right;}' +
      '.co-greet .co-gap-n{font-size:26px;font-weight:800;}' +
      '.co-greet .co-gap-c{font-size:11px;color:rgba(255,255,255,.8);}' +
      // 计划卡
      '.co-plan .co-ph{font-size:13px;font-weight:700;color:var(--text);line-height:1.6;background:#f4f6fb;border-radius:10px;padding:10px 12px;margin-bottom:12px;}' +
      // 今日训练概览横幅
      '.co-overview{background:linear-gradient(135deg,#5b6cff,#7c8cff);color:#fff;}' +
      '.co-overview .co-ov-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
      '.co-overview .co-ov-h .t{font-weight:800;font-size:15px;}' +
      '.co-overview .co-ov-h .x{font-size:11px;color:rgba(255,255,255,.85);}' +
      '.co-ov-stats{display:flex;gap:10px;}' +
      '.co-ov-b{flex:1;background:rgba(255,255,255,.16);border-radius:12px;padding:12px 8px;text-align:center;}' +
      '.co-ov-n{font-size:22px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;}' +
      '.co-ov-n small{font-size:12px;font-weight:700;}' +
      '.co-ov-c{font-size:11px;color:rgba(255,255,255,.85);margin-top:4px;}' +
      '.co-ov-key{flex:1.5;}' +
      '.co-ov-keytxt{font-size:13px;font-weight:700;line-height:1.4;}' +
      // 计划项
      '.co-pitem{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);}' +
      '.co-pitem:last-of-type{border-bottom:0;}' +
      '.co-pmain{flex:1;min-width:0;}' +
      '.co-prow1{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}' +
      '.co-pmod{font-size:14px;font-weight:800;color:var(--text);}' +
      '.co-pstat{font-size:12px;color:var(--text-2);}' +
      '.co-pstat b{color:var(--text);font-weight:800;font-variant-numeric:tabular-nums;}' +
      '.co-pgap{font-size:11px;font-weight:700;color:#b91c1c;background:#fee2e2;padding:1px 7px;border-radius:999px;}' +
      '.co-pfocus{font-size:12px;color:var(--text-2);margin-top:4px;line-height:1.5;}' +
      '.co-pmeta{font-size:11px;color:var(--text-3);margin-top:3px;}' +
      // 一键开练（醒目 primary）
      '.co-train-btn{flex-shrink:0;background:linear-gradient(135deg,#5b6cff,#7c8cff);color:#fff;border:none;border-radius:12px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(91,108,255,.3);white-space:nowrap;}' +
      '.co-train-btn:active{transform:scale(.97);}' +
      // 空状态「去刷题」
      '.co-go-btn{margin-top:14px;background:linear-gradient(135deg,#5b6cff,#7c8cff);color:#fff;border:none;border-radius:999px;padding:10px 22px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(91,108,255,.3);}' +
      '.co-go-btn:active{transform:scale(.97);}' +
      // 洞察流
      '.co-ins{display:flex;flex-direction:column;gap:9px;}' +
      '.co-inr{display:flex;gap:10px;padding:11px 12px;border-radius:10px;font-size:12.5px;color:var(--text);line-height:1.55;}' +
      '.co-inr .i{font-size:16px;flex-shrink:0;}' +
      '.co-inr.warn{background:#fff4e6;}' + '.co-inr.warn .i{filter:none;}' +
      '.co-inr.good{background:#e7faf0;}' +
      '.co-inr.info{background:#eaf6fb;}' +
      // 画像快照
      '.co-mods{display:flex;flex-direction:column;gap:11px;}' +
      '.co-mrow .mn{font-size:12px;color:var(--text-2);margin-bottom:5px;display:flex;justify-content:space-between;}' +
      '.co-mrow .mn b{color:var(--text);font-weight:700;}' +
      '.co-mrow .mn .tr{font-size:11px;font-weight:700;}' +
      '.co-mrow .mn .tr.up{color:var(--success);}' + '.co-mrow .mn .tr.down{color:var(--danger);}' + '.co-mrow .mn .tr.flat{color:var(--text-3);}' +
      '.co-mtrack{height:9px;background:#eef0f5;border-radius:9px;overflow:hidden;}' +
      '.co-mfill{height:100%;border-radius:9px;transition:width .5s;}' +
      '.co-tags{margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;}' +
      '.co-tag{font-size:10px;padding:1px 7px;border-radius:999px;background:#f4f6fb;color:var(--text-3);}' +
      '.co-tag.hot{background:#fee2e2;color:#b91c1c;}' + '.co-tag.guess{background:#fff4e6;color:#c8741b;}' +
      // 微信号
      '.co-sig-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}' +
      '.co-sig-row .lab{font-size:11px;color:var(--text-2);width:84px;flex-shrink:0;}' +
      '.co-sig-track{flex:1;height:8px;background:#eef0f5;border-radius:8px;overflow:hidden;}' +
      '.co-sig-track i{display:block;height:100%;}' +
      '.co-sig-num{font-size:10px;color:var(--text-3);width:54px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums;}' +
      '.co-sig-legend{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;}' +
      '.co-sig-leg{font-size:10.5px;color:var(--text-2);display:flex;align-items:center;gap:5px;}' +
      '.co-sig-leg b{color:var(--text);font-weight:700;}' +
      '.co-tod{margin-top:10px;font-size:12px;color:var(--text-2);line-height:1.6;background:#f8f9fd;border-radius:10px;padding:10px;}' +
      '.co-tod b{color:var(--warn);}' +
      '.co-empty{padding:40px 20px;text-align:center;color:var(--text-3);font-size:13px;line-height:1.8;}' +
      '.co-empty .em{font-size:38px;display:block;margin-bottom:8px;}';
    var s = document.createElement('style');
    s.id = 'coach-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function renderGreet(P) {
    var scoreHtml = P.predicted != null
      ? '<div class="co-g-score"><div><div class="co-score-big">' + P.predicted + '</div><div class="co-score-cap">行测估分</div></div>'
        + '<div class="co-gap"><div class="co-gap-n">-' + P.gapTo85 + '</div><div class="co-gap-c">距 85 分</div></div></div>'
      : '<div class="co-g-score"><div><div class="co-score-big">—</div><div class="co-score-cap">先做几题出估分</div></div></div>';
    return el(
      '<div class="co-card co-greet">' +
      '<div class="co-g-t">🤖 ' + esc((window.Coach ? window.Coach.greet() : '').split('。')[0]) + '。</div>' +
      '<div class="co-g-s">' + esc((window.Coach ? window.Coach.greet() : '').split('。').slice(1).join('。')) + '</div>' +
      scoreHtml +
      '</div>'
    );
  }

  function renderOverview(P) {
    var pl = window.Coach.plan();
    if (pl.empty || pl.lowPriority || !pl.items || !pl.items.length) return null;
    var keyMods = pl.items.slice(0, 3).map(function (it) { return it.name; }).join(' · ');
    return el(
      '<div class="co-card co-overview">' +
        '<div class="co-ov-h"><span class="t">📈 今日训练概览</span><span class="x">' + pl.items.length + ' 个模块</span></div>' +
        '<div class="co-ov-stats">' +
          '<div class="co-ov-b"><div class="co-ov-n">' + pl.total + '</div><div class="co-ov-c">总题量</div></div>' +
          '<div class="co-ov-b"><div class="co-ov-n">' + pl.totalMin + '<small>分</small></div><div class="co-ov-c">总预估用时</div></div>' +
          '<div class="co-ov-b co-ov-key"><div class="co-ov-n co-ov-keytxt">' + esc(keyMods) + '</div><div class="co-ov-c">重点模块</div></div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPlan(P) {
    var pl = window.Coach.plan();
    var body;
    if (pl.empty || pl.lowPriority) {
      // 做题不足 / 信号平稳：引导提示 + 去刷题按钮
      var head = pl.empty
        ? '<span class="em">🧭</span>' + esc(pl.headline)
        : '<span class="em">✨</span>' + esc(pl.headline);
      body = '<div class="co-empty">' + head + '<br><button class="co-go-btn" id="coGoPractice">去刷题 ›</button></div>';
    } else {
      var rows = '';
      pl.items.forEach(function (it) {
        var mm = (P && P.modules && P.modules[it.mod]) || {};
        var acc = mm.acc != null ? Math.round(mm.acc * 100) : null;
        var gap = acc != null ? Math.max(0, 85 - acc) : null;
        var accHtml = acc != null ? (acc + '%') : '—';
        var gapHtml = gap != null ? '差距 +' + gap : '';
        var kp = it.weakKpName ? it.weakKpName : '';
        rows +=
          '<div class="co-pitem">' +
            '<div class="co-pmain">' +
              '<div class="co-prow1">' +
                '<span class="co-pmod">' + esc(it.name) + '</span>' +
                '<span class="co-pstat"><b>' + accHtml + '</b> 正确率</span>' +
                (gapHtml ? '<span class="co-pgap">' + gapHtml + '</span>' : '') +
              '</div>' +
              '<div class="co-pfocus">' + esc(it.focus) + (kp ? ' · 薄弱考点：' + esc(kp) : '') + '</div>' +
              '<div class="co-pmeta">建议 ' + it.count + ' 题 · 预估 ' + it.estMin + ' 分钟</div>' +
            '</div>' +
            '<button class="co-train-btn" data-mod="' + esc(it.mod) + '" data-kp="' + esc(kp) + '" data-count="' + it.count + '">⚡ 一键开练</button>' +
          '</div>';
      });
      body =
        '<div class="co-ph">' + esc(pl.headline) + '</div>' +
        '<div class="co-pwrap">' + rows + '</div>';
    }
    var card = el(
      '<div class="co-card co-plan">' +
      '<div class="co-h"><span class="t">📋 今日训练计划</span><span class="x">教练为你定制</span></div>' +
      body + '</div>'
    );
    // 绑定「一键开练」：跳转刷题页并带上筛选条件
    if (!pl.empty && !pl.lowPriority) {
      card.querySelectorAll('.co-train-btn').forEach(function (btn) {
        btn.onclick = function () {
          var mod = btn.getAttribute('data-mod');
          var kp = btn.getAttribute('data-kp');
          var count = btn.getAttribute('data-count');
          var hash = '#practice&module=' + mod;
          if (kp) hash += '&keypoint=' + encodeURIComponent(kp);
          hash += '&count=' + count;
          location.hash = hash;
        };
      });
    }
    var go = card.querySelector('#coGoPractice');
    if (go) go.onclick = function () { location.hash = '#practice'; };
    return card;
  }

  function renderInsights(P) {
    var list = window.Coach.insights();
    var rows = '';
    list.forEach(function (it) {
      rows += '<div class="co-inr ' + it.level + '"><span class="i">' + it.icon + '</span><span>' + esc(it.text) + '</span></div>';
    });
    return el(
      '<div class="co-card">' +
      '<div class="co-h"><span class="t">💡 教练观察</span><span class="x">随你每次表现更新</span></div>' +
      '<div class="co-ins">' + rows + '</div></div>'
    );
  }

  function renderModules(P) {
    var rows = '';
    ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'zhengzhi'].forEach(function (m) {
      var mm = P.modules[m];
      var acc = mm.acc;
      var p = acc != null ? Math.round(acc * 100) : 0;
      var color = p >= 70 ? C.success : (p >= 50 ? C.primary : C.danger);
      var tr = '';
      if (mm.trend.delta != null) {
        var cls = mm.trend.delta > 0 ? 'up' : (mm.trend.delta < 0 ? 'down' : 'flat');
        var arrow = mm.trend.delta > 0 ? '▲' : (mm.trend.delta < 0 ? '▼' : '—');
        tr = '<span class="tr ' + cls + '">' + arrow + Math.abs(mm.trend.delta) + '%</span>';
      } else tr = '<span class="tr flat">—</span>';
      var tags = '';
      if (mm.trend.regression) tags += '<span class="co-tag hot">退步</span>';
      if (mm.guessRate > 0.3) tags += '<span class="co-tag guess">蒙' + Math.round(mm.guessRate * 100) + '%</span>';
      if (mm.streak >= 4) tags += '<span class="co-tag">连对' + mm.streak + '</span>';
      if (!mm.n) tags = '<span class="co-tag">未练</span>';
      rows +=
        '<div class="co-mrow">' +
        '<div class="mn"><b>' + esc(mm.name) + '</b><span>' + (mm.n ? (p + '% · ' + mm.n + '题 ') : '') + tr + '</span></div>' +
        '<div class="co-mtrack"><div class="co-mfill" style="width:' + p + '%;background:' + color + '"></div></div>' +
        (tags ? '<div class="co-tags">' + tags + '</div>' : '') +
        '</div>';
    });
    return el(
      '<div class="co-card">' +
      '<div class="co-h"><span class="t">📊 你的模块画像</span><span class="x">绿≥70 · 蓝≥50</span></div>' +
      '<div class="co-mods">' + rows + '</div></div>'
    );
  }

  function renderSignals(P) {
    // 速度-正确率分布（R1-R6）
    var Rorder = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
    var tone = { R1: C.success, R2: C.success, R3: C.warn, R4: C.danger, R5: C.danger, R6: C.warn };
    var seg = '', legend = '';
    Rorder.forEach(function (k) {
      var s = P.speedAcc[k]; if (!s || !s.n) return;
      var w = s.pct;
      if (w > 0) seg += '<i style="width:' + w + '%;background:' + tone[k] + '" title="' + k + ' ' + s.label + '"></i>';
      legend += '<div class="co-sig-leg"><span style="width:9px;height:9px;border-radius:3px;background:' + tone[k] + ';display:inline-block"></span><b>' + k + '</b> ' + s.label + ' ' + s.pct + '%</div>';
    });
    if (!seg) seg = '<i style="width:100%;background:#f1f3f8"></i>';

    var tod = '';
    if (P.bestHour && P.worstHour) {
      tod = '最佳状态：<b>' + P.bestHour.hour + ':00</b>（' + P.bestHour.acc + '%）｜最低：<b>' + P.worstHour.hour + ':00</b>（' + P.worstHour.acc + '%）';
    } else {
      tod = '继续练习，教练会统计出你一天里状态最好的时段。';
    }
    return el(
      '<div class="co-card">' +
      '<div class="co-h"><span class="t">🧬 微信号</span><span class="x">对/错 × 快/慢 × 蒙</span></div>' +
      '<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin-bottom:6px;background:#f1f3f8">' + seg + '</div>' +
      '<div class="co-sig-legend">' + legend + '</div>' +
      '<div class="co-tod">' + tod + '</div>' +
      '</div>'
    );
  }

  function mount(rootEl) {
    if (!rootEl) return;
    rootEl.innerHTML = '';
    injectStyle();
    if (!window.Coach) { rootEl.innerHTML = '<div class="co-empty">教练模块加载中…</div>'; return; }
    var P = window.Coach.profile();
    if (!P.total) {
      rootEl.appendChild(el('<div class="co-card co-empty"><span class="em">🤖</span>教练已就位，去刷几道题，我马上为你生成专属训练计划。</div>'));
      return;
    }
    rootEl.appendChild(renderGreet(P));
    var ov = renderOverview(P);
    if (ov) rootEl.appendChild(ov);
    rootEl.appendChild(renderPlan(P));
    rootEl.appendChild(renderInsights(P));
    rootEl.appendChild(renderModules(P));
    rootEl.appendChild(renderSignals(P));
  }

  window.CoachUI = { mount: mount };
})();
