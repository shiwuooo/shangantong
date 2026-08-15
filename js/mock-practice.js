/* 上岸通 · 模考库（独立栏目）
 * 一比一复刻粉笔「模考」分类：国考 → 副省级 / 行政执法类 / 地市级
 * 数据来源：已采集的国考行测整卷（BANK_PAPERS，与粉笔模考同卷型、同限时 120 分钟体验）
 * 点「开始模考」→ 复用 #page-exam 的限时模考引擎（_pendingExamPaper 预选卷）
 */
(function () {
  'use strict';

  // 卷型判定：优先用 examType，回退到名称
  function volOf(p) {
    var et = p.examType || '';
    if (et === 'gk-fsheng') return 'fsheng';
    if (et === 'gk-xzf') return 'xzf';
    if (et === 'gk-dishi') return 'dishi';
    var n = p.name || '';
    if (n.indexOf('副省级') >= 0) return 'fsheng';
    if (n.indexOf('行政执法') >= 0) return 'xzf';
    if (n.indexOf('地市') >= 0) return 'dishi';
    return 'fsheng';
  }

  var VOLS = [
    { key: 'fsheng', label: '副省级' },
    { key: 'xzf', label: '行政执法类' },
    { key: 'dishi', label: '地市级' }
  ];

  // 收集国考行测整卷（排除申论 / 真题汇编小题集）
  function collect() {
    return (window.BANK_PAPERS || []).filter(function (p) {
      if (p.volume !== '行测') return false;
      var et = p.examType || '';
      var isGk = /^gk-/.test(et) || (p.name || '').indexOf('国考') >= 0;
      if (!isGk) return false;
      if ((p.name || '').indexOf('真题汇编') >= 0) return false;
      return true;
    });
  }

  // 跳转到限时模考引擎并预选该卷
  window.startMockExam = function (id) {
    window._pendingExamPaper = id;
    if (location.hash !== '#exam') {
      location.hash = '#exam';
    } else if (window.renderExamIntro) {
      window.renderExamIntro();
    }
  };

  function sortYears(keys) {
    var num = [], other = [];
    keys.forEach(function (y) { (/^\d{4}$/.test(y) ? num : other).push(y); });
    num.sort(function (a, b) { return (+b) - (+a); });
    return num.concat(other);
  }

  window.renderMock = function () {
    var root = document.getElementById('mockRoot');
    if (!root) return;
    var papers = collect();

    // 卷型 → 年份 → [paper]
    var groups = {};
    VOLS.forEach(function (v) { groups[v.key] = {}; });
    papers.forEach(function (p) {
      var v = volOf(p);
      if (!groups[v]) groups[v] = {};
      var y = String(p.year || '未知');
      (groups[v][y] = groups[v][y] || []).push(p);
    });

    var active = root.getAttribute('data-vol') || 'fsheng';
    if (!groups[active] || !Object.keys(groups[active]).length) {
      for (var i = 0; i < VOLS.length; i++) {
        if (groups[VOLS[i].key] && Object.keys(groups[VOLS[i].key]).length) { active = VOLS[i].key; break; }
      }
    }

    var html = '';
    html += '<div class="mk-head">';
    html += '  <div class="mk-title">模考库</div>';
    html += '  <div class="mk-sub">粉笔同源 · 国考限时模考（副省级 / 行政执法类 / 地市级）· 全真整卷 · 限时 120 分钟</div>';
    html += '</div>';

    html += '<div class="mk-tabs">';
    VOLS.forEach(function (v) {
      var n = groups[v.key] ? Object.keys(groups[v.key]).length : 0;
      html += '<button class="mk-tab' + (v.key === active ? ' active' : '') + '" data-vol="' + v.key + '">' +
        v.label + '<span class="mk-tab-n">' + n + '</span></button>';
    });
    html += '</div>';

    var g = groups[active] || {};
    var years = sortYears(Object.keys(g).filter(function (y) { return g[y] && g[y].length; }));
    if (!years.length) {
      html += '<div class="mk-empty">该卷型暂无可用行测整卷</div>';
    } else {
      years.forEach(function (y) {
        html += '<div class="mk-year">' + y + ' 年</div>';
        html += '<div class="mk-cards">';
        g[y].forEach(function (p) {
          html += '<div class="mk-card" data-id="' + p.id + '">';
          html += '  <div class="mk-card-top"><span class="mk-tag">国考</span><span class="mk-year-sm">' + y + '</span></div>';
          html += '  <div class="mk-name">' + p.name + '</div>';
          html += '  <div class="mk-meta">' + p.count + ' 题 · 行测 · 限时 120 分钟</div>';
          html += '  <button class="mk-start" data-id="' + p.id + '">开始模考</button>';
          html += '</div>';
        });
        html += '</div>';
      });
    }

    root.innerHTML = html;

    root.querySelectorAll('.mk-tab').forEach(function (b) {
      b.onclick = function () { root.setAttribute('data-vol', b.getAttribute('data-vol')); window.renderMock(); };
    });
    root.querySelectorAll('.mk-start').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); window.startMockExam(b.getAttribute('data-id')); };
    });
    root.querySelectorAll('.mk-card').forEach(function (c) {
      c.onclick = function () { window.startMockExam(c.getAttribute('data-id')); };
    });
  };
})();
