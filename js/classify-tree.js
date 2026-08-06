/* 上岸通 · 粉笔式多级分类树（模块 → 题型 → 细分考点）
 *
 * 数据底座：
 *   - window.KT_DATA.modules[mod].keypoints：粉笔官方细分考点（含真实题量），
 *     但只覆盖"带官方标注"的少数题（如 panduan 26.7k 题中仅 ~150 题有官方考点）。
 *   - window.KnowledgeTree.infer(q)：对全库每题做题型推断 → 稳定、可覆盖 100% 题目。
 *
 * 设计：
 *   - Level 1 模块（判断推理 / 资料分析 / 言语理解 / 数量关系 / 常识 / 政治 / 申论）
 *   - Level 2 题型（如 图形推理 / 类比推理 / 逻辑判断）：题量取自 KnowledgeTree 推断分布，
 *     点击 → 按 topicId 刷题（真实大题量，绝不为 0）。
 *   - Level 3 细分考点（如 数量规律-线 / 样式规律-加减同异）：取自 KT_DATA 官方标注，
 *     点击 → 按 keypoint 精确刷题（真实小题量，可作专项精练）。
 *
 * 题量归一：KnowledgeTree.distribution 对"带官方考点"的题会以原始 keypoint 串作为
 * topicId 返回，需用 KPMATCH 把原始串归并回规范 topic，避免漏算/重复算。
 */
(function () {
  'use strict';

  const MODULE_META = {
    panduan:  { name: '判断推理', icon: '🧩' },
    ziliao:   { name: '资料分析', icon: '📊' },
    yanyu:    { name: '言语理解', icon: '📖' },
    shuliang: { name: '数量关系', icon: '🧮' },
    changshi: { name: '常识判断', icon: '🌐' },
    zhengzhi: { name: '政治理论', icon: '🚩' },
    shenlun:  { name: '申论',     icon: '📝' }
  };
  // 用户最关心的行测 5 模块置前，政治/申论置后
  const ORDER = ['panduan', 'ziliao', 'yanyu', 'shuliang', 'changshi', 'zhengzhi', 'shenlun'];

  // 每个模块：规范 topicId → 匹配其下「细分考点名」的正则（用于 level-3 归属 & 题量归一）。
  // 顺序敏感：排在前面的优先匹配；末尾用 /.*/ 作兜底（catch-all）。
  const KPMATCH = {
    panduan: {
      'pd-txtl': /^(数量规律|样式规律|位置规律|属性规律|空间类|特殊规律|图形推理|文字\/字母\/数字类|文字)/,
      'pd-lbtl': /^(逻辑关系|语义关系|语法关系|主客体|对应关系)/,
      'pd-jqxr': /^(削弱|加强|搭桥|拆桥|补充论据|必要条件|常规问法|假设|他因|实验类)/,
      'pd-fytl': /^(常规翻译)/,
      'pd-znpd': /^(只有一真)/,
      'pd-dypd': /^(单定义)/,
      'pd-ljpd': /.*/
    },
    yanyu: {
      'yy-ljtk': /^(实词|成语|混搭|词的辨析|对应关系)/,
      'yy-pdyd': /^(细节判断|标题填入|接语选择|横线在|中心理解|主题词|特殊问法)/,
      'yy-yjpx': /^(确定首句|确定捆绑|确定顺序|分述句特征)/,
      'yy-yjbd': /^(关联关系|关联词)/,
      'yy-pwyd': /^(篇章|文章)/,
      'yy-hztj': /^(中心理解题)/,
      'yy-ytjt': /^(意图)/,
      'yy-xxmctj': /^(细节)/
    },
    shuliang: {
      'sl-gcwt': /^(给完工时间|给效率比例|给具体单位|工程问题)/,
      'sl-xcwt': /^(相遇追及|普通行程|流水行船)/,
      'sl-sxys': /^(和差倍比|非典型最值|数列问题|构造数列|分段计算|相邻问题|最不利构造|平均速度|普通不定方程)/,
      'sl-sztl': /^(数字推理)/,
      'sl-plzh': /^(基础排列组合|统筹规划)/,
      'sl-gailv': /^(给概率求概率|给情况求概率|三集合)/,
      'sl-jjwt': /^(经济利润)/,
      'sl-jhwt': /^(几何公式类|几何结论类)/,
      'sl-rongchi': /^(容斥)/,
      'sl-jtzc': /^(浓度)/
    },
    ziliao: {
      'zl-wzzl': /^(文字资料)/,
      'zl-tbzl': /^(统计表|统计图)/,
      'zl-zhzl': /^(综合资料)/,
      'zl-zzl': /^(一般增长率|增长量|间隔增长率|乘积增长率|年均增长|混合增长率|平均数的增长率|平均数的增长量)/,
      'zl-bz': /^(现期比重|基期比重|两期比重|比重|混合比重)/,
      'zl-bs': /^(现期倍数|倍数|基期倍数)/,
      'zl-pjs': /^(现期平均数|平均数|基期平均数|两期平均数比较)/,
      'zl-bjfx': /.*/
    },
    changshi: {
      'cs-zz-mzt': /^(重要会议讲话|经济建设|政治建设|其他建设|文化建设|重要文件)/,
      'cs-zz-mky': /^(唯物辩证法|认识论)/,
      'cs-zz-sz': /^(宏观经济与调控政策)/,
      'cs-fl': /^(行政法)/,
      'cs-jj': /^(宏观经济)/,
      'cs-rw': /^(中国历史|文学常识)/,
      'cs-kj': /^(科技理论与成就)/,
      'cs-dl': /^(中国地理)/,
      'cs-sh': /^(生活常识)/
    },
    zhengzhi: {
      'cs-zz-mzt': /^(经济建设|重要会议讲话|其他建设|重要文件|社会建设|政治建设|文化建设|生态文明建设|新思想总论|总论|上海时政|时事政治)/,
      'cs-zz-mky': /^(唯物|哲学|科学社会主义|资本主义制度|商品经济)/,
      'cs-zz-ds': /^(党章党纪|党的历史)/,
      'cs-zz-sz': /^(重要事件|中国地理|国际经济及组织|道德|其他法律法规)/
    }
  };

  // 资料分析有「江苏特色-xxx」前缀，匹配前剥离
  function normName(n) { return n && n.indexOf('江苏特色-') === 0 ? n.slice(4) : n; }

  function leafToTopic(mod, name) {
    const map = KPMATCH[mod];
    if (!map) return null;
    const n = normName(name);
    for (const tid in map) {
      const re = map[tid];
      if (re && re.test(n)) return tid;
    }
    return null;
  }

  // 模块总题量（可刷的大盘）
  function moduleLen(m) { return (window.QB && window.QB[m]) ? window.QB[m].length : 0; }

  // 一次扫描同时得到：① 各规范 topic 的真实题量；② 各官方细分考点的真实题量。
  // topic 题量把"带官方考点"的题（推断 topicId 为原始 keypoint 串）归并回规范 topic，
  // 使题量显示与"按 topic 刷题"的过滤结果完全一致。带缓存避免每次重算。
  const _msCache = {};
  function moduleStats(mod) {
    if (_msCache[mod]) return _msCache[mod];
    const canonical = (window.TOPICS && window.TOPICS[mod]) ? window.TOPICS[mod].map(t => t.id) : [];
    const topics = {}; canonical.forEach(id => { topics[id] = 0; });
    const kps = {};
    const arr = (window.QB && window.QB[mod]) || [];
    const KT = window.KnowledgeTree;
    const LM = (KT && KT.LEGACY_MAP) || {};
    arr.forEach(function (q) {
      // topic 题量（raw keypoint 串归并回规范 topic）
      let tid = q.topic || '';
      if (tid && LM[tid]) tid = LM[tid];
      if (!tid && KT) { const inf = KT.infer(q, mod); if (inf) tid = inf.topicId; }
      let ctid = tid;
      if (tid && canonical.indexOf(tid) < 0) { const c = leafToTopic(mod, tid); if (c) ctid = c; }
      if (ctid && topics[ctid] != null) topics[ctid]++;
      // 官方细分考点真实计数（与"按 keypoint 刷题"结果一致）
      const qkps = Array.isArray(q.keypoints) ? q.keypoints : null;
      if (qkps) qkps.forEach(function (kp) { kps[kp] = (kps[kp] || 0) + 1; });
    });
    const res = { topics: topics, kps: kps };
    _msCache[mod] = res;
    return res;
  }

  // 构建完整树
  function build() {
    return ORDER.filter(m => MODULE_META[m]).map(function (m) {
      const meta = MODULE_META[m];
      const topicsDef = (window.TOPICS && window.TOPICS[m]) || [];
      const stats = moduleStats(m);
      const counts = stats.topics;
      // KT_DATA 官方细分考点 → 按 topic 归集为 level-3 叶子
      // 题量用真实扫描值（与"按 keypoint 刷题"一致）；刷题库里实际无此题的叶子不展示，避免"0题"
      const kd = window.KT_DATA && window.KT_DATA.modules && window.KT_DATA.modules[m];
      const leafMap = {};
      if (kd && kd.keypoints) {
        kd.keypoints.forEach(kp => {
          const tid = leafToTopic(m, kp.name);
          if (!tid) return;
          const real = stats.kps[kp.name] || 0;
          if (real <= 0) return;
          (leafMap[tid] = leafMap[tid] || []).push({ name: kp.name, count: real });
        });
      }
      const topics = topicsDef.map(function (t) {
        const leaves = (leafMap[t.id] || []).slice().sort(function (a, b) { return b.count - a.count; });
        return { id: t.id, name: t.name, count: counts[t.id] || 0, leaves: leaves };
      });
      return {
        m: m, name: meta.name, icon: meta.icon,
        total: moduleLen(m), topics: topics
      };
    });
  }

  window.ClassifyTree = { build: build, leafToTopic: leafToTopic, ORDER: ORDER };
})();
