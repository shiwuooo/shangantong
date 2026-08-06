/* 上岸通 · 考点分类体系 + 筛选引擎 */

// ============================================
// 考点标签全集
// ============================================
window.TOPICS = {
  // ── 政治理论（2025 国考起独立成模块，原并入常识）──
  zhengzhi: [
    { id: 'cs-zz-mzt', name: '毛中特·习思想', group: '政治理论' },
    { id: 'cs-zz-mky', name: '马原·哲学',     group: '政治理论' },
    { id: 'cs-zz-ds',  name: '党史党建',       group: '政治理论' },
    { id: 'cs-zz-sz',  name: '时政方针',       group: '政治理论' },
  ],
  changshi: [
    // ── 政治理论（4 个子类，公考常识第一大板块）──
    { id: 'cs-zz-mzt', name: '毛中特·习思想', group: '政治理论' },
    { id: 'cs-zz-mky', name: '马原·哲学',     group: '政治理论' },
    { id: 'cs-zz-ds',  name: '党史党建',       group: '政治理论' },
    { id: 'cs-zz-sz',  name: '时政方针',       group: '政治理论' },
    // ── 其余板块 ──
    { id: 'cs-fl', name: '法律法规' },
    { id: 'cs-jj', name: '经济常识' },
    { id: 'cs-rw', name: '人文历史' },
    { id: 'cs-kj', name: '科技常识' },
    { id: 'cs-dl', name: '地理国情' },
    { id: 'cs-sh', name: '生活百科' },
  ],
  yanyu: [
    { id: 'yy-ljtk', name: '逻辑填空' },
    { id: 'yy-pdyd', name: '片段阅读' },
    { id: 'yy-pwyd', name: '篇章阅读' },
    { id: 'yy-yjbd', name: '语句表达' },
    { id: 'yy-yjpx', name: '语句排序' },
    { id: 'yy-hztj', name: '主旨概括' },
    { id: 'yy-ytjt', name: '意图推断' },
    { id: 'yy-xxmctj', name: '细节理解' },
  ],
  shuliang: [
    { id: 'sl-sxys', name: '数学运算' },
    { id: 'sl-sztl', name: '数字推理' },
    { id: 'sl-plzh', name: '排列组合' },
    { id: 'sl-gailv', name: '概率问题' },
    { id: 'sl-xcwt', name: '行程问题' },
    { id: 'sl-gcwt', name: '工程问题' },
    { id: 'sl-jjwt', name: '经济利润' },
    { id: 'sl-jhwt', name: '几何问题' },
    { id: 'sl-rongchi', name: '容斥问题' },
    { id: 'sl-jtzc', name: '浓度问题' },
  ],
  panduan: [
    { id: 'pd-txtl', name: '图形推理' },
    { id: 'pd-dypd', name: '定义判断' },
    { id: 'pd-lbtl', name: '类比推理' },
    { id: 'pd-ljpd', name: '逻辑判断' },
    { id: 'pd-jqxr', name: '加强削弱' },
    { id: 'pd-fytl', name: '翻译推理' },
    { id: 'pd-znpd', name: '真假判断' },
    { id: 'pd-sjpx', name: '事件排序' },
  ],
  ziliao: [
    { id: 'zl-wzzl', name: '文字资料' },
    { id: 'zl-tbzl', name: '图表资料' },
    { id: 'zl-zhzl', name: '综合资料' },
    { id: 'zl-zzl', name: '增长率' },
    { id: 'zl-bz', name: '比重计算' },
    { id: 'zl-bs', name: '倍数分析' },
    { id: 'zl-pjs', name: '平均数' },
    { id: 'zl-bjfx', name: '比较分析' },
  ],
  shenlun: [
    { id: 'sn-gkt', name: '概括归纳' },
    { id: 'sn-dct', name: '提出对策' },
    { id: 'sn-fxt', name: '综合分析' },
    { id: 'sn-yywt', name: '应用文写作' },
    { id: 'sn-dzw', name: '大作文' },
  ],
};

// 所有考点平铺
window.ALL_TOPICS = (function() {
  const arr = [];
  Object.keys(window.TOPICS).forEach(mod => {
    window.TOPICS[mod].forEach(t => {
      arr.push({ ...t, module: mod });
    });
  });
  return arr;
})();

// ============================================
// 考试类型列表
// ============================================
window.EXAM_TYPES = [
  { id: 'gk-fsheng', name: '国考（副省级）', group: '国考' },
  { id: 'gk-dishi', name: '国考（地市级）', group: '国考' },
  { id: 'gk-xzf', name: '国考（行政执法）', group: '国考' },
  { id: 'bj', name: '北京市考', group: '省考' },
  { id: 'sh', name: '上海市考', group: '省考' },
  { id: 'tj', name: '天津市考', group: '省考' },
  { id: 'cq', name: '重庆市考', group: '省考' },
  { id: 'gd', name: '广东省考', group: '省考' },
  { id: 'js', name: '江苏省考', group: '省考' },
  { id: 'zj', name: '浙江省考', group: '省考' },
  { id: 'sd', name: '山东省考', group: '省考' },
  { id: 'hn', name: '河南省考', group: '省考' },
  { id: 'sc', name: '四川省考', group: '省考' },
  { id: 'hb', name: '湖北省考', group: '省考' },
  { id: 'hn2', name: '湖南省考', group: '省考' },
  { id: 'fj', name: '福建省考', group: '省考' },
  { id: 'ah', name: '安徽省考', group: '省考' },
  { id: 'heb', name: '河北省考', group: '省考' },
  { id: 'ln', name: '辽宁省考', group: '省考' },
  { id: 'hlj', name: '黑龙江省考', group: '省考' },
  { id: 'jl', name: '吉林省考', group: '省考' },
  { id: 'sx', name: '陕西省考', group: '省考' },
  { id: 'sxi', name: '山西省考', group: '省考' },
  { id: 'jx', name: '江西省考', group: '省考' },
  { id: 'gx', name: '广西区考', group: '省考' },
  { id: 'yn', name: '云南省考', group: '省考' },
  { id: 'gz', name: '贵州省考', group: '省考' },
  { id: 'hainan', name: '海南省考', group: '省考' },
  { id: 'gs', name: '甘肃省考', group: '省考' },
  { id: 'qh', name: '青海省考', group: '省考' },
  { id: 'nx', name: '宁夏区考', group: '省考' },
  { id: 'xj', name: '新疆区考', group: '省考' },
  { id: 'xz', name: '西藏区考', group: '省考' },
  { id: 'nmg', name: '内蒙古区考', group: '省考' },
  { id: 'liankao', name: '公务员联考', group: '联考' },
];

// ============================================
// 筛选状态
// ============================================
window.FilterState = {
  years: [],          // 选中的年份，如 [2020, 2021, 2022]；空 = 不限
  yearRange: null,    // { from: 2016, to: 2021 }，未设置时为 null
  examTypes: [],      // 选中的考试类型 id
  topics: [],         // 选中的考点 id；空 = 不限
  modules: [],        // 选中的模块；空 = 不限（默认当前模块）
  examVolume: [],     // 行测/申论
  fullPaper: null,    // 整套卷 id，如 'gk-dishi-2016'；设置后忽略其他筛选
  source: null,       // null=全部, 'real'=真题回忆版, 'sim'=高仿真练习
  rangeN: null,       // 当前激活的"近N年"快捷（5/10/20），用于高亮
  _preset: null,      // 当前激活的场景预设名，用于高亮
  difficulty: [],     // 难度桶筛选：'easy'/'mid'/'hard'/'extreme'/'untested'；空=不限
  keypoints: [],      // 中文考点精准/模糊匹配（q.keypoints 中包含任一即命中）；空=不限
  kw: null,           // 关键词搜索（匹配题干/选项/考点/题型等文本）；null=不限
  limit: null,        // 题量上限（教练「一键开练」传入）；null=不限
};

// ============================================
// 整套卷注册表
// ============================================
window.FULL_PAPERS = [];

// ============================================
// 筛选函数
// ============================================
window.filterQuestions = function(opts) {
  const o = opts || window.FilterState;

  // 整套卷模式
  if (o.fullPaper) {
    const paper = window.FULL_PAPERS.find(p => p.id === o.fullPaper);
    if (paper && paper.questionIds) {
      return paper.questionIds.map(id => window.findQuestionById(id)).filter(Boolean);
    }
    return [];
  }

  let result = [];

  // 收集模块
  const modules = o.modules.length ? o.modules : Object.keys(window.QB);

  modules.forEach(mod => {
    const list = window.QB[mod] || [];
    list.forEach(q => {
      // 年份筛选
      if (o.years.length && q.year && !o.years.includes(q.year)) return;

      // 年份区间筛选
      if (o.yearRange) {
        const y = q.year || 0;
        if (o.yearRange.from && y < o.yearRange.from) return;
        if (o.yearRange.to && y > o.yearRange.to) return;
      }

      // 考试类型筛选
      if (o.examTypes.length) {
        const qt = q.exam_type || '';
        if (!o.examTypes.some(et => qt === et || qt.startsWith(et + '-') || et.startsWith(qt + '-'))) {
          // 宽松匹配：qt 在 examTypes 中，或 examTypes 中的某个是 qt 的前缀
          const match = o.examTypes.some(et => {
            return qt === et || qt.indexOf(et) === 0 || et.indexOf(qt) === 0;
          });
          if (!match) return;
        }
      }

      // 考点筛选（bank 的 topic 多为空，用知识点树推断兜底）
      if (o.topics.length) {
        const KT = window.KnowledgeTree;
        const LM = (KT && KT.LEGACY_MAP) || {};
        let qt = q.topic || '';
        if (qt && LM[qt]) qt = LM[qt];              // 旧考点 id 归一化到新体系
        if (!qt && KT) {
          const inf = KT.infer(q, mod);
          if (inf) qt = inf.topicId;
        }
        // 归一：KnowledgeTree 对"带官方考点"的题会把原始 keypoint 串作为 topicId 返回
        // （如 "文字资料"），需归并回规范 topic（zl-wzzl），否则这部分题会被 topic 过滤漏掉 → 0 题。
        const canonIds = (window.TOPICS && window.TOPICS[mod]) ? window.TOPICS[mod].map(t => t.id) : [];
        let qtCanon = qt;
        if (qt && canonIds.indexOf(qt) < 0 && window.ClassifyTree && window.ClassifyTree.leafToTopic) {
          const c = window.ClassifyTree.leafToTopic(mod, qt);
          if (c) qtCanon = c;
        }
        const want = o.topics.map(t => LM[t] || t);
        if (!want.some(t => qtCanon === t || (qtCanon && qtCanon.split(',').includes(t)))) return;
      }

      // 卷型筛选
      if (o.examVolume.length) {
        const qv = q.exam_volume || '行测';
        if (!o.examVolume.includes(qv)) return;
      }

      // 来源筛选（真题回忆版 / 高仿真练习）
      if (o.source) {
        const s = (q.src || q.source || '');
        if (o.source === 'real' && !s.includes('真题')) return;
        if (o.source === 'sim' && !s.includes('高仿真')) return;
      }

      // 难度筛选（个人正确率反推）：按题 aggregate 出的难度桶
      if (o.difficulty && o.difficulty.length) {
        const d = (window.Difficulty && window.Difficulty.questionDifficulty)
          ? window.Difficulty.questionDifficulty(q).bucket
          : 'untested';
        if (!o.difficulty.includes(d)) return;
      }

      // 考点中文过滤（keypoints 子串匹配，用于「按 sub-chip 直达」）
      if (o.keypoints && o.keypoints.length) {
        const qkps = Array.isArray(q.keypoints) ? q.keypoints : [];
        if (!qkps.length) return;
        const want = o.keypoints;
        const hit = qkps.some(kp => want.some(w => kp && (kp === w || kp.indexOf(w) >= 0)));
        if (!hit) return;
      }

      // 关键词搜索（题干/选项/考点/题型/模块等文本）
      if (o.kw) {
        const kw = String(o.kw).toLowerCase();
        const hay = [
          q.q || '', q.qHtml || '', q.material || '', q.materialHtml || '',
          q.type || '', q.topic || '',
          (q.keypoints && q.keypoints.join ? q.keypoints.join(' ') : ''),
          (q.options && q.options.join ? q.options.join(' ') : '')
        ].join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return;
      }

      result.push(q);
    });
  });

  return result;
};

// ============================================
// 按 ID 查题
// ============================================
window.findQuestionById = function(id) {
  for (const mod of Object.keys(window.QB)) {
    const found = window.QB[mod].find(q => q.id === id);
    if (found) return { ...found, _module: mod };
  }
  return null;
};

// ============================================
// 自动注册整套卷
// ============================================
window.rebuildPapers = function() {
  const papers = {};
  Object.keys(window.QB).forEach(mod => {
    window.QB[mod].forEach(q => {
      if (q.exam_type && q.year) {
        const key = q.exam_type + '|' + q.year + '|' + (q.exam_volume || '行测');
        if (!papers[key]) papers[key] = { key, exam_type: q.exam_type, year: q.year, exam_volume: q.exam_volume || '行测', questionIds: [] };
        papers[key].questionIds.push(q.id);
      }
    });
  });
  window.FULL_PAPERS = Object.values(papers).map(p => ({
    id: p.exam_type + '-' + p.year + '-' + (p.exam_volume || '行测'),
    examType: p.exam_type,
    year: p.year,
    volume: p.exam_volume || '行测',
    questionIds: p.questionIds,
    count: p.questionIds.length,
    label: (() => {
      const et = window.EXAM_TYPES.find(e => e.id === p.exam_type);
      return (et ? et.name : p.exam_type) + ' · ' + p.year + ' · ' + (p.exam_volume || '行测');
    })()
  })).sort((a, b) => b.year - a.year || a.label.localeCompare(b.label));
};

// ============================================
// 获取可用年份列表
// ============================================
window.getAvailableYears = function() {
  const years = new Set();
  Object.keys(window.QB).forEach(mod => {
    window.QB[mod].forEach(q => {
      if (q.year) years.add(q.year);
    });
  });
  return Array.from(years).sort((a, b) => b - a);
};

// ============================================
// 获取筛选后可用考点列表
// ============================================
window.getAvailableTopics = function(module) {
  if (module) return window.TOPICS[module] || [];
  return window.ALL_TOPICS;
};

// 计算"近 N 年"区间：以题库中可获取到的最新年份为锚点（确保有数据可刷）
window.nearYears = function(n) {
  const yrs = window.getAvailableYears();
  const maxY = yrs.length ? yrs[0] : new Date().getFullYear();
  return { from: maxY - n + 1, to: maxY };
};
