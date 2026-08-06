/* 国考·数量关系 排列组合 真题汇编（回忆版）
 * 来源：哈尔滨华图(haerbin.huatu.com) 公开每日一练页（逐字转录，标注真题来源）。
 */
window.registerBankPaper({
  id: 'bk-gk-sl',
  name: '国考·排列组合真题汇编（回忆版）',
  questions: [
    {
      q: '扶贫干部某日需要走访村内6个贫困户甲、乙、丙、丁、戊和己。已知甲和乙的走访次序要相邻，丙要在丁之前走访，戊要在丙之前走访，己只能在第一个或最后一个走访。问走访顺序有多少种不同的安排方式？',
      options: ['32', '48', '16', '24'],
      answer: 2,
      explain: '戊、丙、丁前后顺序已固定（戊→丙→丁）；己有2种选择（首位或末位）；甲、乙先捆绑后插空，有4种选择，内部顺序有2种；共2×4×2=16种。故选C。来源：2020国考副省级/地市级第62题。',
      year: '2020', exam_type: 'gk-fsheng', exam_volume: '行测', module: 'shuliang', topic: 'sl-plzh',
      src: '真题·考生回忆版', url: 'https://haerbin.huatu.com/2020/0507/1746221.html'
    }
  ]
});
