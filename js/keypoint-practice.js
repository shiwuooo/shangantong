/* 上岸通 · 粉笔专项练习 · 考点映射 / 本地题量 / 掌握度（融合核心）
 *
 * 职责：
 *  1. build()：bank-ready 时扫描 QB，把每题的 q.keypoints（粉笔官方名）精确映射到
 *     FENBI_TREE 节点（按名称，覆盖率 91%），计算每个节点的「本地可用题量」与题集。
 *  2. mastery()：从 State.attempts 聚合每个考点（含祖先）的正确率 → 掌握度红黄绿。
 *  3. weakLeaves()：挑出薄弱/未测末级考点 → 智能推题。
 *  4. goPractice() / goWeakPractice()：去练习 / 薄弱优先，灌入刷题引擎。
 *
 * 计数口径：节点 N 的本地题量 = 其 descendantNames 中任一名出现在某题 q.keypoints 的题数
 *           （去重；题目同时命中多个后代只计一次，并向上累加到所有祖先）。
 */
(function () {
  'use strict';

  const M = {
    ready: false,
    registry: {},     // pathKey -> {name, module, depth, parentKey, ancestorKeys[], descendantNames[], childKeys[]}
    nameToNodes: {},  // name -> [pathKey,...]
    nodeQIds: {},     // pathKey -> Set(q)
    qById: {},        // id -> q (带 _module)
    _mastery: null    // pathKey -> {correct,total}
  };

  function pathKeyOf(name, parentKey) {
    return parentKey ? parentKey + ' / ' + name : name;
  }

  // 遍历 FENBI_TREE 建立 registry（pathKey 唯一，重名节点因父链不同而区分）
  function buildRegistry() {
    const tree = (window.FENBI_TREE || []);
    function walk(nodes, parentKey, ancestorKeys) {
      let ret = null;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const name = n.name;
        const pk = pathKeyOf(name, parentKey);
        const node = {
          name: name,
          id: n.id,
          fbCount: n.count || 0,
          module: (window.FENBI_INDEX && window.FENBI_INDEX.moduleOf[name]) || null,
          depth: (window.FENBI_INDEX && window.FENBI_INDEX.flat[name] && window.FENBI_INDEX.flat[name][0].depth) || 0,
          parentKey: parentKey,
          ancestorKeys: ancestorKeys.slice(),
          descendantNames: [],
          childKeys: []
        };
        M.registry[pk] = node;
        (M.nameToNodes[name] = M.nameToNodes[name] || []).push(pk);
        if (parentKey && M.registry[parentKey]) M.registry[parentKey].childKeys.push(pk);

        const childAks = ancestorKeys.concat([pk]);
        const childDesc = [name];
        if (n.children) {
          for (let j = 0; j < n.children.length; j++) {
            const cpk = walk([n.children[j]], pk, childAks);
            childDesc.push.apply(childDesc, M.registry[cpk].descendantNames);
          }
        }
        node.descendantNames = childDesc;
        ret = pk;
      }
      return ret;
    }
    tree.forEach(function (n) { walk([n], null, []); });
  }

  // 扫描 QB 建立 qById + 每节点题集
  function buildQuestions() {
    // qById
    Object.keys(window.QB || {}).forEach(function (mod) {
      (window.QB[mod] || []).forEach(function (q) {
        if (q && q.id) { q._module = mod; M.qById[q.id] = q; }
      });
    });
    // 每节点题集（Set<q>）
    Object.keys(window.QB || {}).forEach(function (mod) {
      (window.QB[mod] || []).forEach(function (q) {
        const kps = Array.isArray(q.keypoints) ? q.keypoints : null;
        if (!kps || !kps.length) return;
        const touched = {};
        kps.forEach(function (kp) {
          const pks = M.nameToNodes[kp];
          if (!pks) return;
          pks.forEach(function (pk) {
            const chain = [pk].concat(M.registry[pk].ancestorKeys);
            chain.forEach(function (ck) { touched[ck] = 1; });
          });
        });
        Object.keys(touched).forEach(function (ck) {
          (M.nodeQIds[ck] = M.nodeQIds[ck] || new Set()).add(q);
        });
      });
    });
  }

  function build() {
    if (M.ready) return;
    if (!window.FENBI_TREE) { console.warn('[FenbiKP] FENBI_TREE 未加载'); return; }
    buildRegistry();
    buildQuestions();
    M.ready = true;
    console.log('[FenbiKP] 构建完成：节点', Object.keys(M.registry).length, ' 题索引', Object.keys(M.qById).length);
  }

  // 本地题量
  function localCount(pathKey) {
    const s = M.nodeQIds[pathKey];
    return s ? s.size : 0;
  }
  // 该节点下所有题（去练习用）
  function questions(pathKey) {
    const s = M.nodeQIds[pathKey];
    if (!s) return [];
    return Array.from(s);
  }
  function nodeByKey(pathKey) { return M.registry[pathKey] || null; }

  // 掌握度：从 State.attempts 聚合（每次渲染时重算，保证最新）
  function computeMastery() {
    const map = {};
    const attempts = (window.State && window.State.attempts) || [];
    attempts.forEach(function (a) {
      const q = M.qById[a.id];
      if (!q) return;
      const kps = Array.isArray(q.keypoints) ? q.keypoints : null;
      if (!kps || !kps.length) return;
      const touched = {};
      kps.forEach(function (kp) {
        const pks = M.nameToNodes[kp];
        if (!pks) return;
        pks.forEach(function (pk) {
          [pk].concat(M.registry[pk].ancestorKeys).forEach(function (ck) { touched[ck] = 1; });
        });
      });
      Object.keys(touched).forEach(function (ck) {
        const m = map[ck] || (map[ck] = { correct: 0, total: 0 });
        m.total++;
        if (a.correct) m.correct++;
      });
    });
    return map;
  }

  // 返回 {correct,total,acc} 或 null（未测）
  function mastery(pathKey) {
    if (!M._mastery) M._mastery = computeMastery();
    const m = M._mastery[pathKey];
    if (!m || !m.total) return null;
    return { correct: m.correct, total: m.total, acc: m.correct / m.total };
  }
  function invalidateMastery() { M._mastery = null; }

  // 末级薄弱/未测考点（智能推题候选）
  function weakLeaves(opts) {
    opts = opts || {};
    const maxLeaves = opts.maxLeaves || 200;
    const minCount = opts.minCount || 1;
    const keys = Object.keys(M.registry).filter(function (k) {
      const node = M.registry[k];
      return node.childKeys.length === 0 && localCount(k) >= minCount;
    });
    const mv = M._mastery || computeMastery();
    const list = keys.map(function (k) {
      const node = M.registry[k];
      const m = mv[k];
      const tested = !!(m && m.total);
      const acc = tested ? m.correct / m.total : null;
      return { pathKey: k, name: node.name, module: node.module, count: localCount(k), tested: tested, acc: acc };
    });
    // 排序：未测优先（题量大的先），其次正确率低
    list.sort(function (a, b) {
      if (a.tested !== b.tested) return a.tested ? 1 : -1;
      if (!a.tested) return b.count - a.count;
      if (a.acc !== b.acc) return a.acc - b.acc;
      return b.count - a.count;
    });
    return list.slice(0, maxLeaves);
  }

  // 去练习：单节点
  function goPractice(pathKey) {
    const qs = questions(pathKey);
    if (!qs.length) { alert('该考点本地暂无题目（粉笔官方标签题不足）'); return; }
    window.pendingList = qs.slice();
    invalidateMastery();
    location.hash = '#practice';
  }

  // 薄弱优先·智能推题：取末级薄弱/未测，题量去重混合
  function goWeakPractice(opts) {
    opts = opts || {};
    const perLeaf = opts.perLeaf || 3;
    const cap = opts.cap || 40;
    const leaves = weakLeaves({ maxLeaves: opts.maxLeaves || 60, minCount: 1 });
    const seen = new Set();
    const out = [];
    for (let i = 0; i < leaves.length && out.length < cap; i++) {
      const qs = questions(leaves[i].pathKey);
      // 洗牌取前 perLeaf
      for (let j = qs.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); const t = qs[j]; qs[j] = qs[r]; qs[r] = t; }
      for (let j = 0; j < qs.length && out.length < cap; j++) {
        const q = qs[j];
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        out.push(q);
        if (out.length >= cap) break;
      }
    }
    if (!out.length) { alert('暂无可推的薄弱考点题目'); return; }
    window.pendingList = out;
    invalidateMastery();
    location.hash = '#practice';
  }

  // 暴露
  window.FenbiKP = {
    build: build,
    localCount: localCount,
    questions: questions,
    nodeByKey: nodeByKey,
    mastery: mastery,
    invalidateMastery: invalidateMastery,
    weakLeaves: weakLeaves,
    goPractice: goPractice,
    goWeakPractice: goWeakPractice,
    get ready() { return M.ready; },
    registry: function () { return M.registry; }
  };
})();
