/* 考频热力图 (exam-frequency heatmap) module
 * 依赖（运行时按需取用，缺失则降级）：
 *   window.QB            { module: [question,...] }
 *   window.TOPICS        { module: [{id,name},...] }
 *   window.KnowledgeTree { infer(q) -> {topicId,topicName}|null }  (可选)
 * 全局 API：window.FreqHeatmap.mount(rootEl)
 */
(function () {
  'use strict';

  var MODULE_LABELS = {
    changshi: '常识',
    yanyu: '言语',
    shuliang: '数量',
    panduan: '判断',
    ziliao: '资料',
    shenlun: '申论'
  };
  var MODULE_ORDER = ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao', 'shenlun'];

  // ---- 工具 ----
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      if (k === 'style') { n.setAttribute('style', attrs[k]); }
      else if (k === 'text') { n.textContent = attrs[k]; }
      else if (k === 'html') { n.innerHTML = attrs[k]; }
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
        n.addEventListener(k.slice(2), attrs[k]);
      } else { n.setAttribute(k, attrs[k]); }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function getQB() { return (typeof window.QB !== 'undefined' && window.QB) ? window.QB : null; }
  function getTopics() { return (typeof window.TOPICS !== 'undefined' && window.TOPICS) ? window.TOPICS : null; }
  function hasTree() { return (typeof window.KnowledgeTree !== 'undefined' && window.KnowledgeTree && typeof window.KnowledgeTree.infer === 'function'); }

  // 解析每道题的题型名称
  function resolveTopicName(q, topics) {
    if (hasTree()) {
      try {
        var r = window.KnowledgeTree.infer(q);
        if (r && r.topicName) return { name: r.topicName, id: r.topicId != null ? r.topicId : null };
      } catch (e) { /* ignore */ }
    }
    if (q && q.topic && topics && topics[q.module]) {
      for (var i = 0; i < topics[q.module].length; i++) {
        if (String(topics[q.module][i].id) === String(q.topic)) {
          return { name: topics[q.module][i].name, id: topics[q.module][i].id };
        }
      }
    }
    return { name: '未分类', id: null };
  }

  function emptyState(msg) {
    return el('div', {
      style: 'padding:28px 12px;text-align:center;color:#9aa0a6;font-size:14px;',
      text: msg || '暂无数据'
    });
  }

  // ---- 主渲染 ----
  function mount(rootEl) {
    if (!rootEl) return;
    rootEl.innerHTML = '';

    var QB = getQB();
    var topics = getTopics();
    var title = el('div', {
      style: 'font-size:18px;font-weight:700;color:#1f2937;margin:4px 2px 14px;',
      text: '考频热力图'
    });
    rootEl.appendChild(title);

    if (!QB) {
      rootEl.appendChild(emptyState('暂无数据（未加载题库 window.QB）'));
      return;
    }

    // 收集所有年份 & 题目
    var allYears = {};
    var totalCount = 0;
    MODULE_ORDER.forEach(function (m) {
      var arr = QB[m];
      if (!arr || !arr.length) return;
      arr.forEach(function (q) {
        var y = q && q.year ? parseInt(q.year, 10) : null;
        if (y && !isNaN(y)) { allYears[y] = true; }
        totalCount++;
      });
    });

    if (totalCount === 0) {
      rootEl.appendChild(emptyState('暂无数据'));
      return;
    }

    var years = Object.keys(allYears).map(Number).sort(function (a, b) { return a - b; });
    var maxYear = years.length ? years[years.length - 1] : (new Date().getFullYear());
    // 最近 ~15 年
    var startYear = maxYear - 14;
    var cols = [];
    for (var y = maxYear; y >= startYear; y--) { cols.push(y); } // 最新在左

    // 计数 matrix[module][year]
    var matrix = {};
    var maxCell = 1;
    MODULE_ORDER.forEach(function (m) { matrix[m] = {}; cols.forEach(function (c) { matrix[m][c] = 0; }); });
    MODULE_ORDER.forEach(function (m) {
      var arr = QB[m] || [];
      arr.forEach(function (q) {
        var y = q && q.year ? parseInt(q.year, 10) : null;
        if (y && matrix[m].hasOwnProperty(y)) {
          matrix[m][y]++;
          if (matrix[m][y] > maxCell) maxCell = matrix[m][y];
        }
      });
    });

    // ---- 1. 热力图网格 ----
    rootEl.appendChild(sectionTitle('各模块 × 年份 考频热力图（数值=题量，颜色越深越高频）'));
    var grid = buildHeatmap(MODULE_ORDER, cols, matrix, maxCell);
    rootEl.appendChild(grid);

    // ---- 2. 题型分布 ----
    rootEl.appendChild(sectionTitle('题型分布（每模块题量 TOP 高频）'));
    var topicDist = buildTopicDistribution(QB, topics);
    if (topicDist) { rootEl.appendChild(topicDist); }
    else { rootEl.appendChild(emptyState('暂无题型数据')); }

    // ---- 3. 高频考点（依赖 KnowledgeTree）----
    if (hasTree()) {
      rootEl.appendChild(sectionTitle('高频考点排行（基于考点推断）'));
      var rank = buildTopicRanking(QB, topics);
      rootEl.appendChild(rank);
    }

    // ---- 4. 复习优先级（考频 × 你的正确率）----
    if (typeof window.Difficulty !== 'undefined' && window.Difficulty) {
      rootEl.appendChild(sectionTitle('复习优先级（考频权重 × 你的正确率，越靠前越该先补）'));
      var pr = buildReviewPriority();
      rootEl.appendChild(pr || emptyState('暂无作答记录，先去刷题，这里会按「考得多 + 错得多」排序你的薄弱点'));
    }
  }

  // 复习优先级：考频(题量≈分值占比) × (1 - 个人正确率)
  // 已练模块按 priority 降序；未练模块按考频排后、标注「未测」。
  function buildReviewPriority() {
    if (typeof window.Difficulty === 'undefined') return null;
    var D = window.Difficulty;

    // —— 模块级（始终可用）——
    var rows = [];
    MODULE_ORDER.forEach(function (m) {
      var freq = D.moduleFreq(m);
      if (!freq) return;
      var acc = D.moduleAccuracy(m);
      var tested = acc != null;
      // 未测：用考频单独作为代理优先级（高频未练也值得做）
      var priority = tested ? freq * (1 - acc) : freq * 0.5;
      rows.push({
        label: MODULE_LABELS[m] || m,
        freq: freq,
        acc: acc,
        tested: tested,
        priority: priority,
        kind: 'module'
      });
    });
    rows.sort(function (a, b) { return b.priority - a.priority; });
    var maxP = rows.length ? rows[0].priority : 1;

    var box = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });

    // 模块级排行
    rows.forEach(function (r) {
      var w = maxP > 0 ? (r.priority / maxP * 100) : 0;
      var accText = r.tested ? Math.round(r.acc * 100) + '%' : '未测';
      var accColor = r.tested
        ? (r.acc >= 0.8 ? '#16a34a' : r.acc >= 0.6 ? '#f59e0b' : '#ef4444')
        : '#9aa0a6';
      box.appendChild(el('div', {
        style: 'display:flex;align-items:center;gap:8px;'
      }, [
        el('div', {
          style: 'width:48px;flex:0 0 48px;font-size:13px;font-weight:600;color:#374151;',
          text: r.label
        }),
        el('div', {
          style: 'width:54px;flex:0 0 54px;font-size:11px;color:#6b7280;text-align:right;',
          text: '考频' + r.freq
        }),
        el('div', {
          style: 'width:46px;flex:0 0 46px;font-size:12px;font-weight:600;text-align:right;',
          text: accText
        }, []),
        priorityBar(w, accColor)
      ]));
    });

    // —— 考点级（仅当用户在带 keypoints 的题上有足够样本）——
    var kpRows = [];
    if (window.State && Array.isArray(window.State.attempts)) {
      // 收集命中过的考点
      var seen = {};
      window.State.attempts.forEach(function (a) {
        if (a == null || a.id == null) return;
        var q = window.SAT && window.SAT.qById ? window.SAT.qById(a.id) : null;
        if (!q || !q.keypoints || !q.keypoints.length) return;
        q.keypoints.forEach(function (k) {
          if (!seen[k]) {
            seen[k] = true;
            var kf = D.kpFreq(k);
            var ka = D.kpAccuracy(k);
            if (kf > 0 && ka != null && D.kpAccuracy(k) != null) {
              kpRows.push({ label: k, freq: kf, acc: ka, priority: kf * (1 - ka) });
            }
          }
        });
      });
    }
    kpRows.sort(function (a, b) { return b.priority - a.priority; });
    if (kpRows.length) {
      box.appendChild(el('div', {
        style: 'font-size:13px;font-weight:600;color:#374151;margin-top:10px;',
        text: '高频薄弱考点 TOP（仅统计你练过的带官方考点题）'
      }));
      var maxK = kpRows[0].priority || 1;
      kpRows.slice(0, 15).forEach(function (r) {
        var w = maxK > 0 ? (r.priority / maxK * 100) : 0;
        var accColor = r.acc >= 0.8 ? '#16a34a' : r.acc >= 0.6 ? '#f59e0b' : '#ef4444';
        box.appendChild(el('div', {
          style: 'display:flex;align-items:center;gap:8px;'
        }, [
          el('div', {
            style: 'flex:1;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            text: r.label
          }),
          el('div', {
            style: 'width:54px;flex:0 0 54px;font-size:11px;color:#6b7280;text-align:right;',
            text: '考频' + r.freq
          }),
          el('div', {
            style: 'width:44px;flex:0 0 44px;font-size:12px;font-weight:600;text-align:right;color:' + accColor + ';',
            text: Math.round(r.acc * 100) + '%'
          }),
          priorityBar(w, '#ef4444')
        ]));
      });
    }

    return box;
  }

  function priorityBar(w, color) {
    return el('div', {
      style: 'flex:1.4;height:14px;background:#f3f4f6;border-radius:7px;overflow:hidden;'
    }, [
      el('div', {
        style: 'height:100%;width:' + w.toFixed(1) + '%;background:' + (color || '#ef4444') + ';border-radius:7px;'
      })
    ]);
  }

  function sectionTitle(t) {
    return el('div', {
      style: 'font-size:15px;font-weight:600;color:#374151;margin:18px 2px 10px;' +
        'padding-left:8px;border-left:3px solid #ef4444;',
      text: t
    });
  }

  function heatColor(ratio) {
    // 由浅到深（黄→橙→红）
    var r = Math.round(255);
    var g = Math.round(240 - 170 * ratio);
    var b = Math.round(180 - 150 * ratio);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function heatText(ratio) {
    return ratio > 0.55 ? '#fff' : '#7a3b00';
  }

  function buildHeatmap(modules, cols, matrix, maxCell) {
    var wrap = el('div', {
      style: 'overflow-x:auto;-webkit-overflow-scrolling:touch;'
    });
    var grid = el('div', {
      style: 'display:grid;grid-template-columns:54px repeat(' + cols.length + ',1fr);' +
        'gap:3px;min-width:' + (54 + cols.length * 34) + 'px;font-size:12px;'
    });

    // 表头
    grid.appendChild(el('div', { style: 'color:#9aa0a6;text-align:center;padding:4px 0;', text: '模块' }));
    cols.forEach(function (c) {
      grid.appendChild(el('div', {
        style: 'color:#6b7280;text-align:center;padding:4px 0;font-weight:600;',
        text: String(c).slice(2) // 显示后两位，省空间
      }));
    });

    modules.forEach(function (m) {
      grid.appendChild(el('div', {
        style: 'color:#374151;font-weight:600;display:flex;align-items:center;justify-content:center;',
        text: MODULE_LABELS[m] || m
      }));
      cols.forEach(function (c) {
        var v = matrix[m][c] || 0;
        var ratio = maxCell > 0 ? v / maxCell : 0;
        grid.appendChild(el('div', {
          style: 'background:' + (v ? heatColor(ratio) : '#f3f4f6') + ';' +
            'color:' + (v ? heatText(ratio) : '#c4c9d0') + ';' +
            'text-align:center;padding:7px 0;border-radius:4px;font-weight:600;',
          text: v ? String(v) : '·'
        }));
      });
    });

    wrap.appendChild(grid);
    // 图例
    var legend = el('div', {
      style: 'display:flex;align-items:center;gap:6px;margin-top:8px;color:#9aa0a6;font-size:11px;'
    }, [
      el('span', { text: '低频' }),
      el('span', { style: 'width:14px;height:12px;border-radius:3px;background:' + heatColor(0.05) + ';' }),
      el('span', { style: 'width:14px;height:12px;border-radius:3px;background:' + heatColor(0.5) + ';' }),
      el('span', { style: 'width:14px;height:12px;border-radius:3px;background:' + heatColor(1) + ';' }),
      el('span', { text: '高频' })
    ]);
    wrap.appendChild(legend);
    return wrap;
  }

  function buildTopicDistribution(QB, topics) {
    var container = el('div', { style: 'display:flex;flex-direction:column;gap:14px;' });
    var any = false;

    MODULE_ORDER.forEach(function (m) {
      var arr = QB[m] || [];
      if (!arr.length) return;
      any = true;

      // 统计该模块题型计数
      var counts = {};
      var total = 0;
      arr.forEach(function (q) {
        var t = resolveTopicName(q, topics);
        counts[t.name] = (counts[t.name] || 0) + 1;
        total++;
      });
      var entries = Object.keys(counts).map(function (k) { return { name: k, n: counts[k] }; });
      entries.sort(function (a, b) { return b.n - a.n; });
      var topN = entries[0] ? entries[0].n : 1;

      var block = el('div', {});
      block.appendChild(el('div', {
        style: 'font-size:14px;font-weight:600;color:#374151;margin-bottom:6px;',
        text: (MODULE_LABELS[m] || m) + '（共 ' + total + ' 题）'
      }));

      entries.forEach(function (e) {
        var w = topN > 0 ? (e.n / topN * 100) : 0;
        var isTop = e.n === topN && entries.length > 1;
        block.appendChild(el('div', {
          style: 'display:flex;align-items:center;gap:8px;margin:5px 0;'
        }, [
          el('div', {
            style: 'width:80px;flex:0 0 80px;font-size:12px;color:#4b5563;' +
              (isTop ? 'font-weight:700;color:#ef4444;' : '') + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            text: e.name + (isTop ? ' ★' : '')
          }),
          el('div', {
            style: 'flex:1;height:16px;background:#f3f4f6;border-radius:8px;overflow:hidden;'
          }, [
            el('div', {
              style: 'height:100%;width:' + w.toFixed(1) + '%;background:' +
                (isTop ? '#ef4444' : '#f59e0b') + ';border-radius:8px;'
            })
          ]),
          el('div', {
            style: 'width:34px;flex:0 0 34px;text-align:right;font-size:12px;color:#6b7280;',
            text: String(e.n)
          })
        ]));
      });
      container.appendChild(block);
    });

    return any ? container : null;
  }

  function buildTopicRanking(QB, topics) {
    var counts = {};
    var order = [];
    MODULE_ORDER.forEach(function (m) {
      (QB[m] || []).forEach(function (q) {
        var t = resolveTopicName(q, topics);
        if (t.id == null && t.name === '未分类') return; // 仅统计可识别考点
        if (!counts[t.name]) { counts[t.name] = { n: 0, id: t.id }; order.push(t.name); }
        counts[t.name].n++;
      });
    });
    if (!order.length) return emptyState('暂无可用考点推断结果');

    order.sort(function (a, b) { return counts[b].n - counts[a].n; });
    var top = order.slice(0, 20);
    var maxN = counts[top[0]].n;

    var box = el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    top.forEach(function (name, i) {
      var n = counts[name].n;
      var w = maxN > 0 ? (n / maxN * 100) : 0;
      var medal = i < 3 ? ['#f59e0b', '#9ca3af', '#b45309'][i] : '#e5e7eb';
      box.appendChild(el('div', {
        style: 'display:flex;align-items:center;gap:8px;'
      }, [
        el('div', {
          style: 'width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:' + medal +
            ';color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;',
          text: String(i + 1)
        }),
        el('div', {
          style: 'flex:1;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          text: name
        }),
        el('div', { style: 'flex:1.4;height:14px;background:#f3f4f6;border-radius:7px;overflow:hidden;' }, [
          el('div', { style: 'height:100%;width:' + w.toFixed(1) + '%;background:#ef4444;border-radius:7px;' })
        ]),
        el('div', { style: 'width:34px;flex:0 0 34px;text-align:right;font-size:12px;color:#6b7280;', text: String(n) })
      ]));
    });
    return box;
  }

  window.FreqHeatmap = { mount: mount };
})();
