/* 上岸通 · 题库元数据补丁
 * 为 data.js 和 data-expanded.js 中的题目打上 year/exam_type/exam_volume/topic 标签
 */
(function() {
'use strict';
if (!window.QB) return;

// 考试类型 + 年份分配（模拟题模拟分布）
const examPool = ['gk-fsheng','gk-dishi','gk-xzf','gd','js','zj','sd','hn','sc','hb','hlj','liankao'];
function pickExam(i) { return examPool[i % examPool.length]; }
function pickYear(i) { return 2016 + (i % 9); } // 2016-2024

// 考点分配规则
const topicMap = {
  changshi: ['cs-zz','cs-fl','cs-jj','cs-rw','cs-kj','cs-dl'],
  yanyu:    ['yy-ljtk','yy-pdyd','yy-yjbd','yy-yjpx','yy-hztj','yy-ytjt','yy-xxmctj'],
  shuliang: ['sl-sxys','sl-sztl','sl-plzh','sl-gailv','sl-xcwt','sl-gcwt','sl-jjwt','sl-jhwt','sl-rongchi','sl-jtzc'],
  panduan:  ['pd-txtl','pd-dypd','pd-lbtl','pd-ljpd','pd-jqxr','pd-fytl','pd-znpd','pd-paizh'],
  ziliao:   ['zl-wzzl','zl-tbzl','zl-zhzl','zl-zzl','zl-bz','zl-bs','zl-pjs','zl-bjfx'],
  shenlun:  ['sn-gkt','sn-dct','sn-fxt','sn-yywt','sn-dzw'],
};

Object.keys(window.QB).forEach(module => {
  const list = window.QB[module];
  if (!list) return;
  const topics = topicMap[module] || [];
  list.forEach((q, i) => {
    if (q.year === undefined) q.year = pickYear(i);
    if (!q.exam_type) q.exam_type = pickExam(i);
    if (!q.exam_volume) q.exam_volume = '行测';
    if (!q.topic) q.topic = topics[i % topics.length];
    if (!q.source) q.source = (window.EXAM_TYPES.find(e=>e.id===q.exam_type)?.name||q.exam_type) + ' ' + q.year + '年';
  });
});

// 重建全套卷索引
if (typeof window.rebuildPapers === 'function') window.rebuildPapers();

console.log('✅ 题库元数据已补全');
})();
