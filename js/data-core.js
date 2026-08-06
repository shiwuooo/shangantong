/* 上岸通 · 题库核心初始化（仅真题）
 *
 * 本文件只做一件事：初始化 window.QB 空骨架，并保留「用户自定义导入」功能。
 * 所有真实题目均来自 _pdfdev 流水线从真题 PDF 抽取后生成的 bank/*.js，
 * 以及 bank/ 下带出处的精选真题汇编（registerBankPaper）。
 * 任何 AI 生成 / 模拟 / 高仿题均不在此加载。
 */
(function () {
  'use strict';

  // 七大模块空容器（bank-loader 会把真题 push 进来）
  // 注：政治理论(zhengzhi) 自 2025 国考起独立成模块（原并入常识），
  //     2025 国考行测 题1-20 由 bank-loader 按位置重定位进来。
  window.QB = {
    zhengzhi: [],
    changshi: [],
    yanyu: [],
    shuliang: [],
    panduan: [],
    ziliao: [],
    shenlun: []
  };

  // 支持用户经 import.html 自行导入已核对的真题
  function loadCustomQuestions() {
    try {
      const customKey = 'shangAnTong_custom_questions';
      const customIds = JSON.parse(localStorage.getItem(customKey) || '{}');
      const storedKey = 'shangAnTong_custom_data';
      const storedData = JSON.parse(localStorage.getItem(storedKey) || '{}');
      Object.keys(customIds).forEach(function (mod) {
        if (!window.QB[mod]) window.QB[mod] = [];
        customIds[mod].forEach(function (id) {
          if (!window.QB[mod].some(function (q) { return q.id === id; }) && storedData[id]) {
            window.QB[mod].push(storedData[id]);
          }
        });
      });
    } catch (e) { /* 忽略本地存储异常 */ }
  }

  loadCustomQuestions();

  // 题库统计（bank 加载后由 app.js 重算，这里给初始值）
  window.QB_STATS = { total: 0 };
})();
