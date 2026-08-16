/* 上岸通 · 真题库(bank/)加载器
 * 职责：
 *   1. 提供 window.registerBankPaper(paper) 给 bank/*.js 调用
 *   2. 按 bank/manifest.js 里的 BANK_FILES 列表同步加载所有分卷文件
 * bank 文件格式见 bank/_README.md
 */
(function () {
  'use strict';

  window.BANK_PAPERS = window.BANK_PAPERS || [];
  // 去重哈希表：题 id -> 1（O(1) 判重，替代原先逐题扫描 QB 的 O(n²) 灾难）
  var _seen = Object.create(null);

  // 从题目 id 尾部取原卷题号（如 xc-2024-gk-dishi-37 -> 37）
  function qNum(id) {
    var m = String(id || '').match(/-(\d+)$/);
    return m ? +m[1] : null;
  }

  // 供 bank/*.js 调用
  window.registerBankPaper = function (paper) {
    if (!paper || !Array.isArray(paper.questions)) return;
    var _fq = paper.questions[0] || {};
    window.BANK_PAPERS.push({
      id: paper.id,
      name: paper.name,
      count: paper.questions.length,
      year: _fq.year ? Number(_fq.year) : '',
      examType: _fq.exam_type || '',
      volume: _fq.exam_volume || '行测',
      // 模考卷无标准答案（answer=null），标记后由 App 走"盲练/计时"分支，不污染训练数据
      noAnswer: !!(paper.noAnswer || _fq.noAnswer)
    });

    // 卷型结构表：真题的模块/题型由题号位置决定，这是硬标准，优先于源标签与内容推断
    var ST = (window.PAPER_STRUCTURE || {})[paper.id] || null;
    var needMat = {};
    if (ST && ST.needMaterial) ST.needMaterial.forEach(function (n) { needMat[n] = 1; });

    paper.questions.forEach(function (q, i) {
      // 模考无答案：answer 允许为 null（带 noAnswer 标记），进入题库用于盲练/计时，不参与判分
      if (!q || !q.q || !Array.isArray(q.options)) return;
      if (typeof q.answer !== 'number' && !q.noAnswer) return;
      var id = q.id || (paper.id + '-' + (i + 1));
      var no = qNum(id);

      // 模块：结构表按题号定位 > 源标签
      var mod = (ST && no != null && ST.modOf && ST.modOf[no]) || q.module;
      if (!mod || !window.QB[mod]) return;
      // 题型：源标签 > 结构表按题号定位
      var topic = q.topic || (ST && no != null && ST.topicOf ? ST.topicOf[no] : '') || '';

      // 去重：同 id 不重复入库（O(1) 哈希，避免逐题扫描 QB 的 O(n²) 灾难）
      if (_seen[id]) return;
      window.QB[mod].push({
        id: id,
        module: mod,
        paperId: paper.id,
        no: no,
        type: q.type || '单选',
        q: q.q,
        material: q.material || '',
        // 材料缺失（资料分析图表 / 篇章阅读长文），当前无法完整作答
        lackMaterial: !q.material && !!needMat[no],
        options: q.options,
        answer: q.answer,
        noAnswer: !!q.noAnswer,
        explain: q.explain || '',
        year: q.year ? Number(q.year) : '',
        exam_type: q.exam_type || '',
        exam_volume: q.exam_volume || '行测',
        topic: topic,
        // 官方考点（字符串数组，如 ["经济建设"]）；仅部分省考卷带，缺失则留空由推断兜底
        keypoints: (q.keypoints && q.keypoints.length) ? q.keypoints : (typeof q.keypoints === 'string' ? [q.keypoints] : null),
        src: q.src || '真题·回忆版',
        url: q.url || '',
        // 带图 HTML 字段：资料分析图表/图形推理/带图题干与选项图，经本地化后透传
        qHtml: q.qHtml || null,
        materialHtml: q.materialHtml || null,
        optionsHtml: q.optionsHtml || null,
        explainHtml: q.explainHtml || null
      });
      _seen[id] = 1;
    });

  };

  // ---------- 异步加载（消除 document.write 同步冻结） ----------
  // bank 文件改为动态注入，浏览器可在各脚本执行间隙让出主线程，
  // 首屏进度遮罩可见且可响应；window.shuffle 等就绪信号由 boot 在题库就绪后触发。
  window.BANK_READY = false;
  var _bankCbs = [];
  window.onBankReady = function (cb) {
    if (window.BANK_READY) { try { cb(); } catch (e) { console.error(e); } return; }
    _bankCbs.push(cb);
  };

  function _blEl(id) { return document.getElementById(id); }
  function _setProgress(ratio) {
    var pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    var fill = _blEl('blFill');
    if (fill) fill.style.width = pct + '%';
    var p = _blEl('blPct');
    if (p) p.textContent = pct + '%';
  }
  function _setSub(txt) {
    var s = _blEl('blSub');
    if (s) s.textContent = txt;
  }
  function _hideOverlay() {
    var ov = _blEl('bankLoading');
    if (ov) { ov.classList.add('done'); setTimeout(function () { ov.style.display = 'none'; }, 380); }
  }

  function _fireReady() {
    window.BANK_READY = true;
    // 一次性统计总题量（替代原先每卷重复累加，省去百万级无效遍历）
    if (window.QB_STATS) {
      window.QB_STATS.total = Object.keys(window.QB).reduce(function (s, k) {
        return s + (window.QB[k] ? window.QB[k].length : 0);
      }, 0);
    }
    _setProgress(1);
    _setSub('加载完成，正在初始化…');
    _hideOverlay();
    var cbs = _bankCbs; _bankCbs = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
  }

  var files = (Array.isArray(window.BANK_FILES) ? window.BANK_FILES : [])
    .concat(Array.isArray(window.MOCK_BANK_FILES) ? window.MOCK_BANK_FILES : [])
    .filter(function (f) { return /^[\w.\-]+\.js$/.test(f); });

  if (files.length) {
    var total = files.length, done = 0;
    _setProgress(0);
    _setSub('正在载入 ' + total + ' 个真题分卷');
    function _tick() {
      done++;
      _setProgress(done / total);
      _setSub('已载入 ' + done + ' / ' + total + ' 个真题分卷');
      if (done >= total) _fireReady();
    }
    files.forEach(function (f) {
      var s = document.createElement('script');
      s.src = 'bank/' + f;
      s.async = true;
      s.onload = _tick;
      s.onerror = function () { console.error('bank file load failed:', f); _tick(); };
      document.head.appendChild(s);
    });
  } else {
    _fireReady();
  }
})();
