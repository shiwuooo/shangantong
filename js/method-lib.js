/* ===========================================================
   方法库 v2 · 渲染层（教辅级）
   
   每条方法展示：
   1. 标题 + 类型标签(通法/陷阱)
   2. 完整原理讲解（多段落）
   3. 📝 典型例题区（题干+选项+答案+解析，可折叠）
   4. ⚡ 去练习 按钮（跳转刷题页）
   
   用法: window.MethodLib.mount(rootEl)
   依赖: window.METHOD_LIB (method-data.js)
   =========================================================== */
(function () {
  'use strict';

  // 选择器助手（本 IIFE 独立作用域，app.js 的 $ 不可见，需自备）
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var MODULES = [
    { key: 'changshi', name: '常识', icon: '🌐' },
    { key: 'yanyu', name: '言语', icon: '📖' },
    { key: 'shuliang', name: '数量', icon: '🧮' },
    { key: 'panduan', name: '判断', icon: '🧩' },
    { key: 'ziliao', name: '资料', icon: '📊' },
    { key: 'shenlun', name: '申论', icon: '📝' }
  ];

  var FILTERS = [
    { key: 'all', name: '全部' },
    { key: '通法', name: '通法' },
    { key: '陷阱', name: '陷阱' }
  ];

  var state = {
    module: 'ziliao',
    filter: 'all',
    keyword: '',
    expandedExamples: {} // 记录哪些例题展开着
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getData(moduleKey) {
    var lib = window.METHOD_LIB || {};
    return Array.isArray(lib[moduleKey]) ? lib[moduleKey] : [];
  }

  function injectStyle() {
    if (document.getElementById('method-lib-style')) return;
    var css = [
      '.ml-wrap{padding:0 4px 12px;}',
      '.ml-tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 14px 4px;-webkit-overflow-scrolling:touch;}',
      '.ml-tabs::-webkit-scrollbar{display:none;}',
      '.ml-tab{flex:0 0 auto;padding:7px 15px;border-radius:999px;font-size:14px;font-weight:600;color:var(--text-2,#6b7280);background:#fff;box-shadow:var(--shadow,0 2px 14px rgba(31,35,48,.06));border:1px solid var(--border,#eef0f5);cursor:pointer;transition:.2s;}',
      '.ml-tab:hover{border-color:var(--primary,#5b6cff);color:var(--primary,#5b6cff);}',
      '.ml-tab.active{color:#fff;background:linear-gradient(135deg,#6a7bff,#8b9eff);border-color:transparent;}',
      '.ml-toolbar{display:flex;align-items:center;gap:8px;padding:8px 14px 4px;flex-wrap:wrap;}',
      '.ml-filters{display:flex;gap:6px;}',
      '.ml-fbtn{padding:6px 13px;border-radius:999px;font-size:13px;font-weight:600;color:var(--text-2,#6b7280);background:#fff;border:1px solid var(--border,#eef0f5);cursor:pointer;transition:.2s;}',
      '.ml-fbtn:hover,.ml-fbtn.active{color:#fff;background:var(--primary,#5b6cff);border-color:transparent;}',
      '.ml-search{flex:1;min-width:120px;max-width:280px;padding:8px 12px;border-radius:10px;border:1px solid var(--border,#eef0f5);background:#fff;font-size:13px;color:var(--text,#1f2330);outline:none;transition:.2s;}',
      '.ml-search:focus{border-color:var(--primary,#5b6cff);}',
      '.ml-count{padding:2px 14px 6px;font-size:12px;color:var(--text-3,#9ca3af);}',

      /* 方法卡片 */
      '.ml-list{padding:0 2px;display:flex;flex-direction:column;gap:12px;}',
      '.ml-card{background:#fff;border-radius:14px;box-shadow:var(--shadow,0 2px 14px rgba(31,35,48,.05));border:1px solid var(--border,#eef0f5);overflow:hidden;transition:.2s;}',
      '.ml-card:hover{box-shadow:0 4px 20px rgba(91,108,255,.1);}',
      
      /* 卡片头部 */
      '.ml-card-head{padding:14px 16px 8px;display:flex;align-items:flex-start;gap:10px;}',
      '.ml-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.5px;flex-shrink:0;margin-top:2px;}',
      '.ml-badge.tf{color:#3b4cff;background:rgba(91,108,255,.1);border:1px solid rgba(91,108,255,.2);}',
      '.ml-badge.tr{color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);}',
      '.ml-title{font-size:16px;font-weight:700;color:var(--text,#1f2330);line-height:1.4;flex:1;}',
      
      /* 内容区 */
      '.ml-card-body{padding:0 16px 12px;}',
      '.ml-content{font-size:14px;color:var(--text,#1f2330);line-height:1.85;white-space:pre-line;}',
      
      /* 例题区 */
      '.ml-examples{margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid var(--border,#eef0f5);}',
      '.ml-ex-header{background:linear-gradient(135deg,#f0f4ff,#e8eeff);padding:8px 14px;font-size:13px;font-weight:700;color:#4338ca;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;}',
      '.ml-ex-header:active{opacity:.7;}',
      '.ml-ex-count{font-size:11px;font-weight:400;color:#6b7280;background:rgba(67,56,202,.1);padding:1px 8px;border-radius:999px;}',
      '.ml-ex-body{padding:12px 14px;display:none;}',
      '.ml-ex-body.show{display:block;}',
      '.ml-ex-item{padding:10px 0;border-bottom:1px dashed #eef0f5;}',
      '.ml-ex-item:last-child{border-bottom:none;padding-bottom:0;}',
      '.ml-ex-q{font-size:13.5px;color:var(--text,#1f2330);line-height:1.65;margin-bottom:8px;}',
      '.ml-ex-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;}',
      '.ml-ex-opt{padding:6px 10px;border-radius:8px;font-size:13px;border:1px solid #eef0f5;background:#fafbfc;color:var(--text-2,#6b7280);transition:.15s;}',
      '.ml-ex-opt.correct{background:#ecfdf5;border-color:#86efac;color:#166534;font-weight:600;}',
      '.ml-ex-opt.wrong{background:#fef2f2;border-color:#fecaca;color:#991b1b;}',
      '.ml-ex-ans{font-size:13px;line-height:1.65;color:#15803d;background:#f0fdf4;padding:10px 12px;border-radius:8px;border-left:3px solid #22c55e;}',
      '.ml-ex-src{font-size:11px;color:#9ca3af;margin-top:4px;}',
      
      /* 操作栏 */
      '.ml-card-foot{padding:8px 16px 14px;display:flex;align-items:center;gap:8px;}',
      '.ml-practice-btn{flex:1;padding:8px 16px;border-radius:10px;font-size:13.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6a7bff,#8b9eff);border:none;cursor:pointer;text-align:center;transition:.2s;text-decoration:none;display:inline-block;',
      '.ml-practice-btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(91,108,255,.3);}',
      '.ml-practice-btn:active{transform:translateY(0);}',

      '.ml-empty{text-align:center;color:var(--text-3,#9ca3af);font-size:13px;padding:50px 20px;}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'method-lib-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function filterList() {
    var list = getData(state.module);
    var kw = state.keyword.trim().toLowerCase();
    return list.filter(function (it) {
      if (state.filter !== 'all' && it.type !== state.filter) return false;
      if (kw) {
        var haystack = (it.title + ' ' + it.content).toLowerCase();
        // 也搜索例题
        if (it.examples) {
          it.examples.forEach(function (ex) {
            haystack += ' ' + ex.q + ' ' + ex.explain;
          });
        }
        return haystack.indexOf(kw) > -1;
      }
      return true;
    });
  }

  function toggleExample(id) {
    state.expandedExamples[id] = !state.expandedExamples[id];
    renderList();
  }

  function renderCard(it) {
    var hasEx = it.examples && it.examples.length > 0;
    var exId = it.id;
    var isExpanded = !!state.expandedExamples[exId];

    var examplesHtml = '';
    if (hasEx) {
      var itemsHtml = it.examples.map(function (ex, idx) {
        var optsHtml = ex.opts.map(function (opt, oi) {
          var cls = 'ml-ex-opt' + (oi === ex.ans ? ' correct' : '');
          return '<div class="' + cls + '">' + String.fromCharCode(65 + oi) + '. ' + esc(opt) + '</div>';
        }).join('');
        
        return '<div class="ml-ex-item">' +
          '<div class="ml-ex-q">【例' + (idx+1) + '】' + esc(ex.q) + '</div>' +
          '<div class="ml-ex-opts">' + optsHtml + '</div>' +
          '<div class="ml-ex-ans"><b>✓ 答案：' + String.fromCharCode(65 + ex.ans) + '</b><br/>' + esc(ex.explain) + '</div>' +
          (ex.source ? '<div class="ml-ex-src">📎 ' + esc(ex.source) + '</div>' : '') +
        '</div>';
      }).join('');

      examplesHtml = 
        '<div class="ml-examples">' +
          '<div class="ml-ex-header" onclick="__ML.toggleExample(\'' + exId + '\')">' +
            '📝 典型例题 <span class="ml-ex-count">' + it.examples.length + ' 题</span>' +
            '<span style="margin-left:auto;font-size:11px;">' + (isExpanded ? '▼ 收起' : '▶ 展开') + '</span>' +
          '</div>' +
          '<div class="ml-ex-body' + (isExpanded ? ' show' : '') + '">' + itemsHtml + '</div>' +
        '</div>';
    }

    // 练习按钮
    var practiceBtn = '';
    if (it.practiceKey) {
      var href = '#practice&module=' + it.module + '&keypoint=' + encodeURIComponent(it.practiceKey);
      practiceBtn = '<a class="ml-practice-btn" href="' + href + '">⚡ 去刷相关题</a>';
    }

    return '<div class="ml-card">' +
      '<div class="ml-card-head">' +
        '<span class="ml-badge ' + (it.type === '陷阱' ? 'tr' : 'tf') + '">' + (it.type === '陷阱' ? '陷阱' : '通法') + '</span>' +
        '<div class="ml-title">' + esc(it.title) + '</div>' +
      '</div>' +
      '<div class="ml-card-body"><div class="ml-content">' + esc(it.content) + '</div>' + examplesHtml + '</div>' +
      (practiceBtn ? '<div class="ml-card-foot">' + practiceBtn + '</div>' : '') +
    '</div>';
  }

  function renderTabs() {
    return MODULES.map(function (m) {
      return '<button class="ml-tab' + (state.module === m.key ? ' active' : '') + '" data-mod="' + m.key + '">' +
        m.icon + ' ' + m.name + '</button>';
    }).join('');
  }

  function renderFilters() {
    return FILTERS.map(function (f) {
      return '<button class="ml-fbtn' + (state.filter === f.key ? ' active' : '') + '" data-flt="' + f.key + '">' + f.name + '</button>';
    }).join('');
  }

  function renderList() {
    var root = $('#methodRoot') || $('#methodsRoot');
    if (!root) return;
    var list = filterList();
    var countEl = $('#mlCount');
    if (countEl) countEl.textContent = list.length + ' 条';

    var listEl = $('#mlList');
    if (!listEl) {
      listEl = document.createElement('div'); listEl.id = 'mlList'; listEl.className = 'ml-list';
      root.appendChild(listEl);
    }

    if (!list.length) {
      listEl.innerHTML = '<div class="ml-empty">该筛选下暂无方法，试试切换模块或关键词</div>';
      return;
    }
    listEl.innerHTML = list.map(renderCard).join('');
  }

  function mount(rootEl) {
    if (!rootEl) return;
    injectStyle();

    var modNames = {};
    MODULES.forEach(function(m){ modNames[m.key]=m.name; });

    rootEl.innerHTML =
      '<div class="ml-wrap">' +
        '<div class="ml-tabs" id="mlTabs">' + renderTabs() + '</div>' +
        '<div class="ml-toolbar">' +
          '<div class="ml-filters" id="mlFlts">' + renderFilters() + '</div>' +
          '<input class="ml-search" id="mlSearch" placeholder="🔍 搜索方法/例题关键词..." value="' + esc(state.keyword) + '" />' +
          '<span class="ml-count" id="mlCount"></span>' +
        '</div>' +
        '<div class="ml-list" id="mlList"></div>' +
      '</div>';

    // Tab 切换
    $('#mlTabs').addEventListener('click', function(e) {
      var t = e.target.closest('.ml-tab');
      if (!t) return;
      state.module = t.getAttribute('data-mod');
      state.expandedExamples = {}; // 切模块时折叠所有例题
      $('#mlTabs').querySelectorAll('.ml-tab').forEach(function(el){
        el.classList.toggle('active', el === t);
      });
      renderList();
    });

    // Filter 切换
    $('#mlFlts').addEventListener('click', function(e) {
      var t = e.target.closest('.ml-fbtn');
      if (!t) return;
      state.filter = t.getAttribute('data-flt');
      $('#mlFlts').querySelectorAll('.ml-fbtn').forEach(function(el){
        el.classList.toggle('active', el === t);
      });
      renderList();
    });

    // Search
    var searchTimer = null;
    $('#mlSearch').addEventListener('input', function(e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        state.keyword = e.target.value;
        renderList();
      }, 200);
    });

    // 暴露给全局供 onclick 调用
    window.__ML = { toggleExample: toggleExample };

    renderList();
  }

  window.MethodLib = window.MethodLib || {};
  window.MethodLib.mount = mount;
})();
