/* 上岸通 · 真题库(bank/)加载器 v2
 * 改进：
 *   1. 字节级进度（不再"一个大文件下载中却显示卡住"）
 *   2. 并发受限(MAX_PARALLEL)，避免平板一次性发几十请求被限流挂起
 *   3. 用 fetch + eval 执行，配合 sw.js 首次加载即缓存 → 之后秒开
 * 职责：提供 window.registerBankPaper，按 manifest 加载所有分卷文件
 */
(function () {
  'use strict';

  window.BANK_PAPERS = window.BANK_PAPERS || [];
  var _seen = Object.create(null);

  function qNum(id) {
    var m = String(id || '').match(/-(\d+)$/);
    return m ? +m[1] : null;
  }

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
      noAnswer: !!(paper.noAnswer || _fq.noAnswer),
      isMock: isMock
    });

    var ST = (window.PAPER_STRUCTURE || {})[paper.id] || null;
    var needMat = {};
    if (ST && ST.needMaterial) ST.needMaterial.forEach(function (n) { needMat[n] = 1; });

    // 模考卷题目做标记，防止混入专项练习
    var isMock = !!window._LOADING_MOCK_BANK;

    paper.questions.forEach(function (q, i) {
      if (!q || !q.q || !Array.isArray(q.options)) return;
      if (typeof q.answer !== 'number' && !q.noAnswer) return;
      var id = q.id || (paper.id + '-' + (i + 1));
      var no = qNum(id);

      var mod = (ST && no != null && ST.modOf && ST.modOf[no]) || q.module;
      if (!mod || !window.QB[mod]) return;
      var topic = q.topic || (ST && no != null && ST.topicOf ? ST.topicOf[no] : '') || '';

      if (_seen[id]) return;
      window.QB[mod].push({
        id: id,
        module: mod,
        paperId: paper.id,
        no: no,
        type: q.type || '单选',
        q: q.q,
        material: q.material || '',
        lackMaterial: !q.material && !!needMat[no],
        options: q.options,
        answer: q.answer,
        noAnswer: !!q.noAnswer,
        explain: q.explain || '',
        year: q.year ? Number(q.year) : '',
        exam_type: q.exam_type || '',
        exam_volume: q.exam_volume || '行测',
        topic: topic,
        keypoints: (q.keypoints && q.keypoints.length) ? q.keypoints : (typeof q.keypoints === 'string' ? [q.keypoints] : null),
        src: isMock ? '粉笔模考' : (q.src || '真题·回忆版'),
        url: q.url || '',
        isMock: isMock,
        qHtml: q.qHtml || null,
        materialHtml: q.materialHtml || null,
        optionsHtml: q.optionsHtml || null,
        explainHtml: q.explainHtml || null
      });
      _seen[id] = 1;
    });
  };

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
  function _fmtMB(b) { return (b / 1048576).toFixed(0) + 'MB'; }

  function _fireReady() {
    window.BANK_READY = true;
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

  // 首屏只加载真题库；模考卷由模考栏目按需加载，避免污染专项练习且减少首屏体积
  var files = (Array.isArray(window.BANK_FILES) ? window.BANK_FILES : [])
    .filter(function (f) { return /^[\w.\-]+\.js$/.test(f); });

  var MAX_PARALLEL = 6;          // 并发受限，避免被限流挂起
  var totalBytes = 0, gotBytes = 0;
  var _mockCbs = [];
  window.MOCK_BANK_READY = false;

  function loadOne(f) {
    return fetch('bank/' + f, { cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + f);
        var len = +res.headers.get('content-length') || 0;
        totalBytes += len;
        if (res.body && res.body.getReader) {
          var reader = res.body.getReader();
          var parts = [];
          return new Promise(function (resolve, reject) {
            function pump() {
              reader.read().then(function (r) {
                if (r.done) { resolve(parts); return; }
                parts.push(r.value);
                gotBytes += r.value.byteLength;
                _setProgress(totalBytes ? gotBytes / totalBytes : 0);
                pump();
              }).catch(reject);
            }
            pump();
          }).then(function (parts) {
            var buf = new Uint8Array(gotBytes);
            var off = 0;
            parts.forEach(function (p) { buf.set(p, off); off += p.byteLength; });
            return new TextDecoder('utf-8').decode(buf);
          });
        }
        return res.text().then(function (t) {
          gotBytes += len; _setProgress(totalBytes ? gotBytes / totalBytes : 0); return t;
        });
      })
      .then(function (code) {
        try { (0, eval)(code); } catch (e) { console.error('eval bank file failed:', f, e); }
      });
  }

  function run() {
    if (!files.length) { _fireReady(); return; }
    _setProgress(0);
    _setSub('正在载入题库 ' + files.length + ' 个分卷（请稍候，进度按大小显示）');
    var idx = 0, done = 0;
    function next() {
      if (idx >= files.length) return;
      var f = files[idx++];
      loadOne(f)
        .then(function () {
          done++;
          _setSub('已载入 ' + done + ' / ' + files.length + ' 分卷  ·  ' + _fmtMB(gotBytes) + ' / ' + _fmtMB(totalBytes));
          if (done >= files.length) _fireReady();
          else next();
        })
        .catch(function (err) {
          console.error(err);
          done++;
          _setSub('分卷 ' + f + ' 加载失败，已跳过(' + done + '/' + files.length + ')');
          if (done >= files.length) _fireReady();
          else next();
        });
    }
    for (var i = 0; i < Math.min(MAX_PARALLEL, files.length); i++) next();
  }

  // 按需加载模考卷；只在「模考」栏目进入时执行，避免污染专项练习的 QB
  window.loadMockBank = function (callback) {
    if (window.MOCK_BANK_READY) { if (callback) callback(); return; }
    if (callback) _mockCbs.push(callback);
    if (window._LOADING_MOCK_BANK) return;
    window._LOADING_MOCK_BANK = true;

    var mockFiles = (Array.isArray(window.MOCK_BANK_FILES) ? window.MOCK_BANK_FILES : [])
      .filter(function (f) { return /^[\w.\-]+\.js$/.test(f); });
    if (!mockFiles.length) {
      window.MOCK_BANK_READY = true;
      window._LOADING_MOCK_BANK = false;
      _mockCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
      _mockCbs = [];
      return;
    }

    var loaded = 0;
    function mockNext() {
      if (loaded >= mockFiles.length) return;
      var f = mockFiles[loaded++];
      fetch('bank/' + f, { cache: 'force-cache' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
        .then(function (code) {
          window._LOADING_MOCK_BANK = true;
          try { (0, eval)(code); } catch (e) { console.error('eval mock file failed:', f, e); }
          if (loaded >= mockFiles.length) {
            window.MOCK_BANK_READY = true;
            window._LOADING_MOCK_BANK = false;
            _mockCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
            _mockCbs = [];
          } else {
            mockNext();
          }
        })
        .catch(function (err) {
          console.error(err);
          if (loaded >= mockFiles.length) {
            window.MOCK_BANK_READY = true;
            window._LOADING_MOCK_BANK = false;
            _mockCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
            _mockCbs = [];
          } else {
            mockNext();
          }
        });
    }
    // 模考卷也做有限并发（3 个），避免移动网络/平板被压垮
    for (var k = 0; k < Math.min(3, mockFiles.length); k++) mockNext();
  };

  run();
})();
