/* ===========================================================
 * 速算 / 实战技巧库 · 渲染层（P1）
 * 用法: window.TipsLib.mount(rootEl)
 * 依赖: window.TIPS_LIB (见 tips-data.js)
 * 功能: 关键词搜索 + 模块筛选 + 标签筛选 + 可展开卡片
 * =========================================================== */
(function () {
  'use strict';

  var MODULES = [
    { key: 'ziliao', name: '资料' },
    { key: 'shuliang', name: '数量' },
    { key: 'panduan', name: '判断' },
    { key: 'yanyu', name: '言语' },
    { key: 'changshi', name: '常识' },
    { key: 'zhengzhi', name: '政治' }
  ];
  var MOD_NAME = {};
  MODULES.forEach(function (m) { MOD_NAME[m.key] = m.name; });

  // 缓存：某关键词是否出现在题库某题的 keypoints 中（按技巧所属模块匹配，更精准）
  var _kpCache = null;
  function moduleKeypointStrings(modKey) {
    if (!_kpCache) _kpCache = {};
    if (_kpCache[modKey]) return _kpCache[modKey];
    var arr = [];
    var QB = window.QB || {};
    (QB[modKey] || []).forEach(function (q) {
      (q.keypoints || []).forEach(function (kp) { if (kp) arr.push(String(kp).toLowerCase()); });
    });
    _kpCache[modKey] = arr;
    return arr;
  }
  // 在技巧所属模块的题库里，找到第一个能匹配到题目的 tag，作为 keypoint 跳转参数
  function matchKeypoint(tip) {
    var ks = moduleKeypointStrings(tip.module);
    if (!ks.length) return null;
    var tags = tip.tags || [];
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i]).toLowerCase();
      for (var j = 0; j < ks.length; j++) {
        if (ks[j].indexOf(t) >= 0) return tags[i];
      }
    }
    return null;
  }

  // 收集所有标签并统计次数，按热度排序
  var ALL_TAGS = (function () {
    var map = {};
    (window.TIPS_LIB || []).forEach(function (t) {
      (t.tags || []).forEach(function (tg) { map[tg] = (map[tg] || 0) + 1; });
    });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  })();

  var state = { module: 'all', tag: 'all', kw: '' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getData() {
    var lib = window.TIPS_LIB || [];
    return lib.filter(function (t) {
      if (state.module !== 'all' && t.module !== state.module) return false;
      if (state.tag !== 'all' && (t.tags || []).indexOf(state.tag) < 0) return false;
      if (state.kw) {
        var hay = (t.title + ' ' + (t.tags || []).join(' ') + ' ' + t.content + ' ' + (t.apply || '')).toLowerCase();
        if (hay.indexOf(state.kw.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  function render(root) {
    var list = getData();
    var html = '';
    html += '<div class="tips-search"><input id="tipsKw" class="input" placeholder="搜索技巧：尾数法 / 赋值 / 图推 / 比重…" value="' + esc(state.kw) + '" /></div>';
    html += '<div class="tips-filters">';
    html += '<div class="tf-row"><span class="tf-label">模块</span><div class="tf-tags" id="tipsMods">';
    html += '<span class="tf-tag ' + (state.module === 'all' ? 'active' : '') + '" data-mod="all">全部</span>';
    MODULES.forEach(function (m) {
      html += '<span class="tf-tag ' + (state.module === m.key ? 'active' : '') + '" data-mod="' + m.key + '">' + m.name + '</span>';
    });
    html += '</div></div>';
    html += '<div class="tf-row"><span class="tf-label">标签</span><div class="tf-tags" id="tipsTags">';
    html += '<span class="tf-tag ' + (state.tag === 'all' ? 'active' : '') + '" data-tag="all">全部</span>';
    ALL_TAGS.slice(0, 14).forEach(function (tg) {
      html += '<span class="tf-tag ' + (state.tag === tg ? 'active' : '') + '" data-tag="' + esc(tg) + '">' + esc(tg) + '</span>';
    });
    html += '</div></div></div>';
    html += '<div class="tips-count">共 ' + list.length + ' 条技巧</div>';
    html += '<div class="tips-list" id="tipsList">';
    if (list.length === 0) {
      html += '<div class="empty card">没有匹配的技巧，换个关键词试试</div>';
    } else {
      list.forEach(function (t, i) {
        html += '<div class="tip-card" data-i="' + i + '">';
        html += '<div class="tip-head"><div class="tip-title">' + esc(t.title) + '</div>';
        html += '<span class="tip-mod mod-' + t.module + '">' + (MOD_NAME[t.module] || t.module) + '</span></div>';
        html += '<div class="tip-tags">' + (t.tags || []).map(function (x) { return '<span class="tip-tag">#' + esc(x) + '</span>'; }).join('') + '</div>';
        html += '<div class="tip-body hidden">';
        html += '<div class="tip-content">' + esc(t.content).replace(/\n/g, '<br>') + '</div>';
        html += '<div class="tip-apply"><b>适用：</b>' + esc(t.apply || '') + '</div>';
        if (t.drill) html += '<a class="tip-drill" href="#speed">⚡ 去速算练习 →</a>';
        html += '</div>';
        // 反向跳刷题按钮：底部右对齐
        var kp = matchKeypoint(t);
        var href = '#practice&module=' + encodeURIComponent(t.module);
        if (kp) href += '&keypoint=' + encodeURIComponent(kp);
        if (state.kw) href += '&kw=' + encodeURIComponent(state.kw);
        html += '<div class="tip-foot"><a class="tip-drill-btn" href="' + href + '">去刷相关题 · ' + (MOD_NAME[t.module] || t.module) + '</a></div>';
        html += '</div>';
      });
    }
    html += '</div>';
    root.innerHTML = html;

    // 事件
    var kw = root.querySelector('#tipsKw');
    if (kw) kw.oninput = function () { state.kw = kw.value.trim(); render(root); };
    root.querySelector('#tipsMods').onclick = function (e) {
      var el = e.target.closest('.tf-tag'); if (!el) return;
      state.module = el.dataset.mod; render(root);
    };
    root.querySelector('#tipsTags').onclick = function (e) {
      var el = e.target.closest('.tf-tag'); if (!el) return;
      state.tag = el.dataset.tag; render(root);
    };
    Array.prototype.forEach.call(root.querySelectorAll('.tip-card'), function (c) {
      c.querySelector('.tip-head').onclick = function () {
        c.querySelector('.tip-body').classList.toggle('hidden');
      };
    });
  }

  function mount(root) {
    if (!root) return;
    render(root);
  }

  window.TipsLib = { mount: mount };
})();
