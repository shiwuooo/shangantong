/* 上岸通 · 自定义刷题面板（参考粉笔，不含正确率滑块） *
 * 注意：本文件在 app.js 之前加载，不可依赖 $/$$ 助手，全部使用原生 DOM API。 */

(function () {
  'use strict';

  var STORAGE_KEY = 'custom_practice_settings';

  // 默认设置
  var defaults = {
    mode: 'practice',   // 'practice' = 做题模式 | 'review' = 背题模式
    yearN: 0,           // 0=不限 | 3=近3年 | 5=近5年 | 10=近10年
    count: 15           // 每组出题数量
  };

  // 当前状态（从 localStorage 恢复或用默认）
  var state = loadSettings();

  // ===========================
  // 状态持久化
  // ============================
  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        return { mode: s.mode || defaults.mode, yearN: s.yearN !== undefined ? s.yearN : defaults.yearN, count: s.count || defaults.count };
      }
    } catch (e) { /* ignore */ }
    return { mode: defaults.mode, yearN: defaults.yearN, count: defaults.count };
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ===========================
  // 应用到 FilterState
  // ============================
  function applyToFilter() {
    if (state.yearN > 0 && window.nearYears) {
      window.FilterState.yearRange = window.nearYears(state.yearN);
      window.FilterState.rangeN = state.yearN;
    } else {
      window.FilterState.yearRange = null;
      window.FilterState.rangeN = null;
    }
    window.FilterState.limit = state.count > 0 ? state.count : null;
  }

  // ===========================
  // 渲染面板
  // ============================
  function render() {
    var panel = document.getElementById('customPanel');
    if (!panel) return;
    // 模式按钮
    qsa(panel, '.cp-mode').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
    // 年份按钮
    qsa(panel, '.cp-year').forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.years, 10) === state.yearN);
    });
    // 题量按钮
    qsa(panel, '.cp-count').forEach(function (btn) {
      btn.classList.toggle('active', parseInt(btn.dataset.count, 10) === state.count);
    });
  }

  // 原生 querySelectorAll 缩写
  function qsa(ctx, sel) { return ctx.querySelectorAll(sel); }
  function qs(id) { return document.getElementById(id); }

  // ===========================
  // 面板开关
  // ============================
  function open() {
    var panel = qs('customPanel');
    if (panel) { panel.classList.remove('hidden'); render(); }
  }
  function close() {
    var panel = qs('customPanel');
    if (panel) panel.classList.add('hidden');
  }
  function toggle() {
    var panel = qs('customPanel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) open();
    else close();
  }

  // ===========================
  // 事件绑定
  // ============================
  function bindEvents() {
    var tgl = qs('toggleCustom');
    if (tgl) tgl.onclick = toggle;

    var cancelBtn = qs('cpCancel');
    if (cancelBtn) cancelBtn.onclick = close;

    var saveBtn = qs('cpSave');
    if (saveBtn) saveBtn = saveBtn.onclick = function () {
      saveSettings();
      applyToFilter();
      close();
      if (typeof window.applyFilter === 'function') {
        if (typeof window.renderFilterPanel === 'function') window.renderFilterPanel();
        window.applyFilter();
      }
    };

    qsa(document, '#customPanel .cp-mode').forEach(function (btn) {
      btn.onclick = function () { state.mode = btn.dataset.mode; render(); };
    });
    qsa(document, '#customPanel .cp-year').forEach(function (btn) {
      btn.onclick = function () { state.yearN = parseInt(btn.dataset.years, 10); render(); };
    });
    qsa(document, '#customPanel .cp-count').forEach(function (btn) {
      btn.onclick = function () { state.count = parseInt(btn.dataset.count, 10); render(); };
    });
  }

  // ===========================
  // 背题模式查询
  // ============================
  function isReviewMode() { return state.mode === 'review'; }

  // ===========================
  // 初始化（延迟到 DOM 就绪后绑定事件；applyToFilter 在 boot 时也会被 app.js 调用）
  // ============================
  function init() {
    bindEvents();
    applyToFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露公共 API
  window.CustomPractice = {
    open: open,
    close: close,
    toggle: toggle,
    isReviewMode: isReviewMode,
    getState: function () { return { mode: state.mode, yearN: state.yearN, count: state.count }; },
    applyToFilter: applyToFilter
  };

})();
