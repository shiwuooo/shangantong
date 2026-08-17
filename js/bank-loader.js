/* 上岸通 · 真题库(bank/)加载器 v3
 * 核心修复（v2 教训）：
 *   1. 并发流式读取共用全局 gotBytes/totalBytes，导致 buffer 分配错乱、
 *      进度显示虚假（100% 却只载入 38/100）、大文件 eval 可能失败。
 *   2. 字节级进度依赖 content-length，在 chunked/gzip 下不可靠，出现 5MB/1MB。
 *   3. 失败只跳过不重试，大文件在弱网下极易缺卷。
 * 改进：
 *   - 每文件独立 fetch + res.text()，不再并发流式读。
 *   - 进度按"已完成文件数"计算，真实不造假。
 *   - 失败自动重试 1 次，仍失败才跳过并记录。
 *   - 并发降到 3，减少移动网络/微信 X5 被压垮的概率。
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
    // 模考卷题目做标记，防止混入专项练习
    var isMock = !!window._LOADING_MOCK_BANK;

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

  var MAX_PARALLEL = 3;          // 移动网络/微信 X5 下并发太高容易挂起
  var _mockCbs = [];
  window.MOCK_BANK_READY = false;

  function loadOne(f) {
    return fetch('bank/' + f, { cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + f);
        return res.text();
      })
      .then(function (code) {
        try { (0, eval)(code); }
        catch (e) {
          console.error('eval bank file failed:', f, e);
          throw e; // eval 失败视为该分卷加载失败，进入重试/跳过
        }
      });
  }

  function run() {
    if (!files.length) { _fireReady(); return; }
    _setProgress(0);
    _setSub('正在载入 ' + files.length + ' 个分卷…');

    var idx = 0, done = 0, failed = [];

    function next() {
      if (idx >= files.length) return;
      var f = files[idx++];

      function attempt() {
        return loadOne(f)
          .then(function () {
            done++;
            _setProgress(done / files.length);
            _setSub('已载入 ' + done + ' / ' + files.length + ' 分卷');
            if (done + failed.length >= files.length) finish();
            else next();
          })
          .catch(function (err) {
            console.warn('分卷失败，1次重试:', f, err);
            return loadOne(f)
              .then(function () {
                done++;
                _setProgress(done / files.length);
                _setSub('已载入 ' + done + ' / ' + files.length + ' 分卷');
                if (done + failed.length >= files.length) finish();
                else next();
              })
              .catch(function (err2) {
                console.error('分卷加载失败（已重试）:', f, err2);
                failed.push(f);
                _setProgress((done + failed.length) / files.length);
                _setSub('分卷 ' + f + ' 加载失败，已跳过 (' + (done + failed.length) + '/' + files.length + ')');
                if (done + failed.length >= files.length) finish();
                else next();
              });
          });
      }
      attempt();
    }

    function finish() {
      if (failed.length) {
        console.error('加载失败的分卷:', failed);
      }
      _fireReady();
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

    var pos = 0, done = 0, failed = 0;
    function mockNext() {
      if (pos >= mockFiles.length) return;
      var f = mockFiles[pos++];
      fetch('bank/' + f, { cache: 'force-cache' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
        .then(function (code) {
          try { (0, eval)(code); } catch (e) { console.error('eval mock file failed:', f, e); }
          done++;
          if (done + failed >= mockFiles.length) mockFinish();
          else mockNext();
        })
        .catch(function (err) {
          console.error(err);
          failed++;
          if (done + failed >= mockFiles.length) mockFinish();
          else mockNext();
        });
    }
    function mockFinish() {
      window.MOCK_BANK_READY = true;
      window._LOADING_MOCK_BANK = false;
      _mockCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
      _mockCbs = [];
    }
    // 模考卷也做有限并发（2 个），避免移动网络/平板被压垮
    for (var k = 0; k < Math.min(2, mockFiles.length); k++) mockNext();
  };

  run();
})();
