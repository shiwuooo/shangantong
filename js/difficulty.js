/* 上岸通 · 难度反推引擎（P1）
 * ------------------------------------------------------------
 * 数据来源：window.SAT.state.attempts
 *   刷题(practice) / 模考(exam) / 智能训练(training) 三处作答
 *   经 app.js 统一并入同一个 State.attempts 数组，此处一次读取。
 *
 * 为什么"反推"：我们没有粉笔那种全站用户正确率，无法直接给题打难度。
 *   但「你越常错 → 对你越难」是更贴近个人提分的有效信号。
 *   聚合分三档：题级 → 考点级(keypoints) → 模块级，越上层越稳。
 *
 * 全局 API：
 *   window.Difficulty.refresh()                 重新统计（作答后调用）
 *   window.Difficulty.questionDifficulty(q)     -> {bucket,acc,tested,basis}
 *   window.Difficulty.moduleAccuracy(mod)       -> ratio|null
 *   window.Difficulty.moduleFreq(mod)           -> number
 *   window.Difficulty.kpAccuracy(name)          -> ratio|null
 *   window.Difficulty.kpFreq(name)              -> number
 *   window.Difficulty.bucketLabel(b)
 * 纯本地计算，无任何外部请求 / 数据外传。
 */
(function () {
  'use strict';

  var BUCKETS = ['easy', 'mid', 'hard', 'extreme', 'untested'];
  var LABELS = { easy: '简单', mid: '中等', hard: '困难', extreme: '极难', untested: '未测' };

  var byQ = {};   // qid            -> { tot, cor }
  var byMod = {}; // module         -> { tot, cor }
  var byKp = {};  // keypoint name  -> { tot, cor }
  var qMod = {};  // qid -> module
  var qKp = {};   // qid -> [kpName]
  var built = false;

  function getAttempts() {
    try {
      var st = window.SAT && window.SAT.state;
      if (st && Array.isArray(st.attempts)) return st.attempts;
    } catch (e) {}
    try {
      if (window.State && Array.isArray(window.State.attempts)) return window.State.attempts;
    } catch (e) {}
    return [];
  }

  // 建立 qid -> 模块 / qid -> 考点 映射（来自 QB）
  function indexQB() {
    qMod = {};
    qKp = {};
    if (!window.QB) return;
    Object.keys(window.QB).forEach(function (mod) {
      (window.QB[mod] || []).forEach(function (q) {
        if (!q || !q.id) return;
        qMod[q.id] = mod;
        var kps = q.keypoints;
        if (kps && kps.length) qKp[q.id] = kps;
      });
    });
  }

  function refresh() {
    byQ = {}; byMod = {}; byKp = {};
    indexQB();
    getAttempts().forEach(function (a) {
      if (!a || a.id == null) return;
      var cor = a.correct === true;
      if (!byQ[a.id]) byQ[a.id] = { tot: 0, cor: 0 };
      byQ[a.id].tot++; if (cor) byQ[a.id].cor++;

      var mod = a.module || qMod[a.id];
      if (mod) {
        if (!byMod[mod]) byMod[mod] = { tot: 0, cor: 0 };
        byMod[mod].tot++; if (cor) byMod[mod].cor++;
      }
      var kps = qKp[a.id];
      if (kps) kps.forEach(function (k) {
        if (!byKp[k]) byKp[k] = { tot: 0, cor: 0 };
        byKp[k].tot++; if (cor) byKp[k].cor++;
      });
    });
    built = true;
  }

  function ensure() { if (!built) refresh(); }

  function accOf(map, key) {
    var m = map[key];
    if (!m || m.tot === 0) return null;
    return m.cor / m.tot;
  }

  // 正确率 -> 难度桶
  function bucketOf(acc) {
    if (acc == null) return 'untested';
    if (acc >= 0.8) return 'easy';
    if (acc >= 0.6) return 'mid';
    if (acc >= 0.4) return 'hard';
    return 'extreme';
  }

  // 单题难度：考点级(样本多时最稳) > 模块级 > 题级 > 未测
  function questionDifficulty(q) {
    ensure();
    if (!q || !q.id) return { bucket: 'untested', acc: null, tested: false, basis: 'none' };

    var kps = (q.keypoints && q.keypoints.length) ? q.keypoints : (qKp[q.id] || null);
    if (kps && kps.length) {
      var best = null, bestN = 0;
      kps.forEach(function (k) {
        var m = byKp[k];
        if (m && m.tot > bestN) { best = k; bestN = m.tot; }
      });
      if (best) {
        var a = accOf(byKp, best);
        if (a != null) return { bucket: bucketOf(a), acc: a, tested: true, basis: 'keypoint:' + best };
      }
    }

    var mod = q.module || qMod[q.id];
    if (mod) {
      var ma = accOf(byMod, mod);
      if (ma != null) return { bucket: bucketOf(ma), acc: ma, tested: true, basis: 'module:' + mod };
    }

    var qa = accOf(byQ, q.id);
    if (qa != null) return { bucket: bucketOf(qa), acc: qa, tested: true, basis: 'question' };

    return { bucket: 'untested', acc: null, tested: false, basis: 'none' };
  }

  function moduleAccuracy(mod) { ensure(); return accOf(byMod, mod); }
  function moduleFreq(mod) {
    if (!window.QB || !window.QB[mod]) return 0;
    return (window.QB[mod] || []).length;
  }
  function kpAccuracy(name) { ensure(); return accOf(byKp, name); }
  function kpFreq(name) {
    var n = 0;
    if (!window.QB) return 0;
    Object.keys(window.QB).forEach(function (m) {
      (window.QB[m] || []).forEach(function (q) {
        var kps = q.keypoints || qKp[q.id];
        if (kps && kps.indexOf(name) >= 0) n++;
      });
    });
    return n;
  }

  window.Difficulty = {
    refresh: refresh,
    questionDifficulty: questionDifficulty,
    moduleAccuracy: moduleAccuracy,
    moduleFreq: moduleFreq,
    kpAccuracy: kpAccuracy,
    kpFreq: kpFreq,
    bucketLabel: function (b) { return LABELS[b] || b; },
    BUCKETS: BUCKETS,
    LABELS: LABELS
  };
})();
