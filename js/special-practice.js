// 专项练习（粉笔同源复刻）— 独立模块，原 #modules 树形页保持不变
// 功能：完整粉笔考点树（最深 4 层，可逐级展开）→ 任意层级「去练习」→ 练习配置弹窗 → 开刷 → 粉笔式答题 → 诊断报告
(function () {
  'use strict';

  function ensureBuild() {
    if (window.FenbiKP && !window.FenbiKP.ready) {
      try { window.FenbiKP.build(); } catch (e) { console.error('[专项练习] build 失败', e); }
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 掌握度着色（与 #modules 一致）
  function mCls(acc, tested) {
    if (!tested) return 'kt-un';
    if (acc >= 0.8) return 'kt-easy';
    if (acc >= 0.6) return 'kt-mid';
    if (acc >= 0.4) return 'kt-hard';
    return 'kt-ext';
  }

  const MOD_ICON = { '政治理论': '🚩', '常识判断': '🌐', '言语理解与表达': '📖', '数量关系': '🧮', '判断推理': '🧩', '资料分析': '📊' };

  // 当前配置弹窗状态
  let cfg = { pk: null, name: null, limit: 0, shuffle: true, showAnswer: false, timed: true };

  // ===================== 渲染专项练习主页（粉笔式全层级树） =====================
  function renderSpecial() {
    ensureBuild();
    const root = document.getElementById('specialRoot');
    if (!root) return;
    if (!window.FENBI_TREE || !window.FenbiKP) {
      root.innerHTML = '<div class="empty card">考点树未加载，请稍候刷新</div>';
      return;
    }
    if (!window.FenbiKP.ready) {
      try { window.FenbiKP.build(); } catch (e) { console.error('[专项练习] build 失败', e); }
    }
    const KP = window.FenbiKP;
    const reg = KP.registry();

    // 递归渲染单个节点（任意层级都可「去练习」，含全部子考点）
    function nodeHtml(pk, node) {
      const cnt = KP.localCount(pk);
      const mv = KP.mastery(pk);
      const tested = !!mv;
      const acc = mv ? mv.acc : null;
      const mcls = mCls(acc, tested);
      const mtxt = tested ? (Math.round(acc * 100) + '%') : '未测';
      const fbc = node.fbCount || 0;
      const hasKids = node.childKeys.length > 0;
      const kidsHtml = hasKids ? node.childKeys.map(function (cpk) {
        return nodeHtml(cpk, reg[cpk]);
      }).join('') : '';
      const goBtn = '<button class="kt-go" data-pk="' + esc(pk) + '" data-name="' + esc(node.name) + '">去练习 →</button>';
      return '<div class="kt-node' + (hasKids ? ' kt-has-kids' : ' kt-leaf') + '" data-open="0">' +
               '<div class="kt-head' + (hasKids ? ' kt-toggle' : '') + '">' +
                 (hasKids
                   ? '<span class="kt-caret">▸</span>'
                   : '<span class="kt-caret kt-caret-leaf">·</span>') +
                 '<span class="kt-name">' + esc(node.name) + '</span>' +
                 (fbc ? '<span class="kt-fb" title="粉笔官方标签题量">粉笔 ' + fbc + '</span>' : '') +
                 '<span class="kt-count">本地 ' + cnt + '</span>' +
                 '<span class="kt-acc ' + mcls + '">' + mtxt + '</span>' +
                 goBtn +
               '</div>' +
               (hasKids ? '<div class="kt-children" hidden>' + kidsHtml + '</div>' : '') +
             '</div>';
    }

    const order = (window.FENBI_INDEX && window.FENBI_INDEX.order) || [];
    const tree = window.FENBI_TREE;
    const topByName = {};
    tree.forEach(function (n) { topByName[n.name] = n; });

    let html = '';
    order.forEach(function (modName) {
      const tn = topByName[modName];
      if (!tn) return;
      const node = reg[modName];
      if (!node) return;
      const cnt = KP.localCount(modName);
      const icon = MOD_ICON[modName] || '📚';
      const kidsHtml = node.childKeys.map(function (cpk) { return nodeHtml(cpk, reg[cpk]); }).join('');
      html += '<section class="card kt-module" data-open="0">' +
                '<div class="kt-head kt-mod-head kt-toggle">' +
                  '<span class="kt-caret">▸</span>' +
                  '<span class="kt-icon">' + icon + '</span>' +
                  '<span class="kt-name">' + esc(modName) + '</span>' +
                  '<span class="kt-count">本地 ' + cnt + ' 题</span>' +
                  '<button class="kt-go" data-pk="' + esc(modName) + '" data-name="' + esc(modName) + '">刷整模块 →</button>' +
                '</div>' +
                '<div class="kt-children" hidden>' + kidsHtml + '</div>' +
              '</section>';
    });

    root.innerHTML =
      '<div class="kt-toolbar">' +
        '<div class="kt-tb-left">' +
          '<button class="kt-btn kt-btn-weak" id="spSmart">🎯 智能练习（薄弱优先）</button>' +
          '<button class="kt-btn" id="spExpandAll">展开全部</button>' +
          '<button class="kt-btn" id="spCollapse">收起</button>' +
        '</div>' +
        '<div class="kt-legend">' +
          '<span class="kt-leg"><i class="kt-acc kt-easy"></i>掌握≥80%</span>' +
          '<span class="kt-leg"><i class="kt-acc kt-mid"></i>60-80%</span>' +
          '<span class="kt-leg"><i class="kt-acc kt-hard"></i>40-60%</span>' +
          '<span class="kt-leg"><i class="kt-acc kt-ext"></i>&lt;40%</span>' +
          '<span class="kt-leg"><i class="kt-acc kt-un"></i>未测</span>' +
        '</div>' +
      '</div>' +
      '<div class="kt-note">完整粉笔考点树（最深 4 层）。点 ▸ 展开子考点，点「去练习 / 刷整模块」按该考点（含全部子考点）精准开刷，并可配置题量 / 顺序 / 是否显示答案。本地题量 = 题库中带粉笔官方标签、可精确练习的题数。</div>' +
      html;

    // 交互（事件委托）
    root.onclick = function (e) {
      const go = e.target.closest('.kt-go');
      if (go) { e.preventDefault(); openConfig(go.getAttribute('data-pk'), go.getAttribute('data-name')); return; }
      if (e.target.closest('#spSmart')) { startSmartPractice(); return; }
      if (e.target.closest('#spExpandAll')) {
        root.querySelectorAll('.kt-children').forEach(function (c) { c.removeAttribute('hidden'); });
        root.querySelectorAll('.kt-node,.kt-module').forEach(function (n) { n.setAttribute('data-open', '1'); });
        return;
      }
      if (e.target.closest('#spCollapse')) {
        root.querySelectorAll('.kt-children').forEach(function (c) { c.setAttribute('hidden', ''); });
        root.querySelectorAll('.kt-node,.kt-module').forEach(function (n) { n.setAttribute('data-open', '0'); });
        return;
      }
      const tgl = e.target.closest('.kt-toggle');
      if (tgl) {
        const node = tgl.closest('.kt-node, .kt-module');
        if (node) {
          const open = node.getAttribute('data-open') === '1';
          node.setAttribute('data-open', open ? '0' : '1');
          const kids = node.querySelector('.kt-children');
          if (kids) { if (open) kids.setAttribute('hidden', ''); else kids.removeAttribute('hidden'); }
        }
      }
    };
  }

  // ===================== 练习配置弹窗 =====================
  function openConfig(pk, name) {
    cfg = { pk: pk, name: name, limit: 0, shuffle: true, showAnswer: false, timed: true };
    const total = window.FenbiKP.localCount(pk);
    let ov = document.getElementById('spConfigOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'spConfigOverlay';
      ov.className = 'sp-config-overlay hidden';
      document.body.appendChild(ov);
    }
    ov.innerHTML = ''
      + '<div class="sp-config">'
      + '<div class="sp-config-head">练习设置 · <b>' + esc(name) + '</b></div>'
      + '<div class="sp-config-sub">该考点共 <b>' + total + '</b> 道本地题（含子考点）</div>'
      + '<div class="sp-field"><label>练习题量</label>'
      +   '<div class="sp-field-row"><input type="number" id="spLimit" min="1" max="' + total + '" placeholder="默认全部(' + total + ')"> <span class="sp-hint">留空 = 全部</span></div></div>'
      + '<div class="sp-field"><label>出题方式</label>'
      +   '<div class="sp-seg" id="spShuffleSeg"><button data-v="1" class="on">随机练习</button><button data-v="0">顺序练习</button></div></div>'
      + '<div class="sp-field"><label>显示答案</label>'
      +   '<div class="sp-seg" id="spShowAnsSeg"><button data-v="0" class="on">做完不显示</button><button data-v="1">每题显示</button></div></div>'
      + '<div class="sp-field"><label>计时</label>'
      +   '<div class="sp-seg" id="spTimedSeg"><button data-v="1" class="on">计时</button><button data-v="0">不计时</button></div></div>'
      + '<div class="sp-config-actions">'
      +   '<button class="sp-btn" id="spCancel">取消</button>'
      +   '<button class="sp-btn sp-btn-primary" id="spStart">开始练习 →</button>'
      + '</div>'
      + '</div>';
    ov.classList.remove('hidden');

    function bindSeg(id, key) {
      const seg = ov.querySelector('#' + id);
      seg.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          cfg[key] = b.getAttribute('data-v') === '1';
        };
      });
    }
    bindSeg('spShuffleSeg', 'shuffle');
    bindSeg('spShowAnsSeg', 'showAnswer');
    bindSeg('spTimedSeg', 'timed');

    ov.querySelector('#spCancel').onclick = hideConfig;
    ov.querySelector('#spStart').onclick = function () {
      const lim = parseInt(ov.querySelector('#spLimit').value, 10);
      cfg.limit = (isNaN(lim) || lim <= 0) ? 0 : Math.min(lim, total);
      startPractice();
    };
    ov.onclick = function (e) { if (e.target === ov) hideConfig(); };
  }

  function hideConfig() {
    const ov = document.getElementById('spConfigOverlay');
    if (ov) ov.classList.add('hidden');
  }

  function startPractice() {
    const pk = cfg.pk;
    const list = window.FenbiKP.questions(pk);
    if (!list || !list.length) { if (window.toast) window.toast('该考点暂无本地题'); return; }
    window.pendingList = list; // 题量 / 顺序在 renderPractice 的 pendingList 块按 config 处理
    window.pendingPracticeConfig = {
      shuffle: cfg.shuffle,
      limit: cfg.limit,
      showAnswer: cfg.showAnswer,
      timed: cfg.timed
    };
    hideConfig();
    if (window.toast) window.toast('正在进入「' + cfg.name + '」练习…');
    location.hash = '#practice';
  }

  // ===================== 智能练习（薄弱优先） =====================
  function startSmartPractice() {
    const weak = window.FenbiKP.weakLeaves({ cap: 60, maxLeaves: 40, perLeaf: 3 });
    if (!weak || !weak.length) { if (window.toast) window.toast('暂无明显薄弱点，先做几题吧'); return; }
    let list = [];
    weak.forEach(function (w) {
      const qs = window.FenbiKP.questions(w.pathKey);
      list = list.concat(qs.slice(0, 3));
    });
    if (!list.length) { if (window.toast) window.toast('薄弱考点暂无本地题'); return; }
    window.pendingList = list;
    window.pendingPracticeConfig = { shuffle: true, limit: 0, showAnswer: false, timed: true };
    if (window.toast) window.toast('智能练习：已按薄弱点组卷 ' + list.length + ' 题');
    location.hash = '#practice';
  }

  window.renderSpecial = renderSpecial;
  window.SpecialPractice = {
    renderSpecial: renderSpecial,
    openConfig: openConfig,
    startPractice: startPractice,
    startSmartPractice: startSmartPractice
  };
})();
