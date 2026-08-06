/* 上岸通 · 全库搜题
 * 只要题干 / 选项 / 材料 / 解析 里包含关键词就能搜到（模糊包含，无需输入完整）
 * 依赖：window.QB（题库）、window.SAT（可选：练这题 / 收藏 / toast）、window.KnowledgeTree（可选：题型推断）
 * 暴露：window.QSearch.mount(rootEl)
 */
(function () {
  'use strict';

  var MOD_NAMES = {
    changshi: '常识', yanyu: '言语', shuliang: '数量',
    panduan: '判断', ziliao: '资料', shenlun: '申论'
  };
  var MOD_COLORS = {
    changshi: '#06b6d6', yanyu: '#5b6cff', shuliang: '#f59e0b',
    panduan: '#8b5cf6', ziliao: '#14b8a6', shenlun: '#ef4444'
  };

  var LS_HISTORY = 'shangAnTong_searchHistory';
  var PAGE_SIZE = 30;

  // 模块级状态（跨 mount 保留用户上次搜索）
  var S = {
    kw: '',
    mods: [],          // 空 = 全部模块
    fields: ['q', 'options', 'material', 'explain'],
    shown: PAGE_SIZE,
    results: []
  };
  var debounceId = null;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  // 归一化：小写 + 全角转半角，让"ＡＢ"也能搜到"AB"
  function norm(s) {
    if (s == null) return '';
    return String(s).toLowerCase().replace(/[\uFF01-\uFF5E]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
  }
  function toast(msg) {
    if (window.SAT && typeof window.SAT.toast === 'function') { try { window.SAT.toast(msg); return; } catch (e) {} }
    if (typeof window.toast === 'function') { try { window.toast(msg); return; } catch (e) {} }
  }
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]') || []; } catch (e) { return []; }
  }
  function pushHistory(kw) {
    if (!kw || kw.length < 1) return;
    var h = getHistory().filter(function (x) { return x !== kw; });
    h.unshift(kw);
    h = h.slice(0, 12);
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); } catch (e) {}
  }
  function clearHistory() {
    try { localStorage.removeItem(LS_HISTORY); } catch (e) {}
  }

  // 高亮：把所有关键词在原文中包裹 <mark>（先转义再插标签，避免 XSS）
  function highlight(text, keys) {
    var raw = String(text == null ? '' : text);
    if (!keys.length) return esc(raw);
    var low = norm(raw);
    var marks = [];
    keys.forEach(function (k) {
      if (!k) return;
      var from = 0, i;
      while ((i = low.indexOf(k, from)) !== -1) {
        marks.push([i, i + k.length]);
        from = i + k.length;
        if (marks.length > 400) break;
      }
    });
    if (!marks.length) return esc(raw);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    // 合并重叠区间
    var merged = [marks[0]];
    for (var j = 1; j < marks.length; j++) {
      var last = merged[merged.length - 1];
      if (marks[j][0] <= last[1]) last[1] = Math.max(last[1], marks[j][1]);
      else merged.push(marks[j]);
    }
    var out = '', pos = 0;
    merged.forEach(function (m) {
      out += esc(raw.slice(pos, m[0])) + '<mark class="sr-hit">' + esc(raw.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    out += esc(raw.slice(pos));
    return out;
  }

  // 命中处截取上下文片段，长题干不刷屏
  function snippet(text, keys, radius) {
    var raw = String(text == null ? '' : text);
    if (!raw) return '';
    radius = radius || 40;
    var low = norm(raw), first = -1;
    for (var i = 0; i < keys.length; i++) {
      var p = low.indexOf(keys[i]);
      if (p !== -1 && (first === -1 || p < first)) first = p;
    }
    if (first === -1) return raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
    var s = Math.max(0, first - radius);
    var e = Math.min(raw.length, first + radius * 3);
    return (s > 0 ? '…' : '') + raw.slice(s, e) + (e < raw.length ? '…' : '');
  }

  // ---------- 归一化索引（只建一次，5000+ 题也秒回） ----------
  function idx(q) {
    if (q.__ix) return q.__ix;
    var ix = {
      q: norm(q.q),
      o: norm((q.options || []).join(' \u0001 ')),
      m: norm(q.material),
      e: norm(q.explain)
    };
    try {
      Object.defineProperty(q, '__ix', { value: ix, enumerable: false, writable: true });
    } catch (err) { q.__ix = ix; }
    return ix;
  }

  // ---------- 搜索核心 ----------
  function search(kw, mods, fields) {
    var keys = norm(kw).split(/\s+/).filter(Boolean);   // 空格分词 = AND
    if (!keys.length) return { keys: [], list: [] };

    var qb = window.QB || {};
    var modKeys = (mods && mods.length) ? mods : Object.keys(qb);
    var out = [];

    modKeys.forEach(function (m) {
      var arr = qb[m] || [];
      for (var i = 0; i < arr.length; i++) {
        var q = arr[i];
        if (!q) continue;
        var ix = idx(q);
        var tq = fields.indexOf('q') > -1 ? ix.q : '';
        var to = fields.indexOf('options') > -1 ? ix.o : '';
        var tm = fields.indexOf('material') > -1 ? ix.m : '';
        var te = fields.indexOf('explain') > -1 ? ix.e : '';
        var all = tq + '\u0001' + to + '\u0001' + tm + '\u0001' + te;

        var ok = true;
        for (var k = 0; k < keys.length; k++) {
          if (all.indexOf(keys[k]) === -1) { ok = false; break; }
        }
        if (!ok) continue;

        // 打分：题干命中 > 选项 > 材料 > 解析；越靠前越优先
        var score = 0, where = [];
        keys.forEach(function (key) {
          if (tq.indexOf(key) > -1) { score += 100; if (where.indexOf('题干') < 0) where.push('题干'); }
          if (to.indexOf(key) > -1) { score += 60; if (where.indexOf('选项') < 0) where.push('选项'); }
          if (tm.indexOf(key) > -1) { score += 30; if (where.indexOf('材料') < 0) where.push('材料'); }
          if (te.indexOf(key) > -1) { score += 15; if (where.indexOf('解析') < 0) where.push('解析'); }
        });
        var pos = tq.indexOf(keys[0]);
        if (pos > -1) score += Math.max(0, 30 - pos);      // 关键词越靠题干开头分越高
        if (q.year) score += Math.min(10, (Number(q.year) - 2010) * 0.5); // 新题微幅加权

        out.push({ q: q, module: q._module || m, score: score, where: where });
      }
    });

    out.sort(function (a, b) { return b.score - a.score; });
    return { keys: keys, list: out };
  }

  // ---------- 样式 ----------
  function injectStyle() {
    if (document.getElementById('qsearch-style')) return;
    var css = ''
      + '#qsearch{--p:#5b6cff;--warn:#ff9f43;--ok:#22c55e;--t:#1f2330;--t2:#6b7280;--t3:#9ca3af;--bd:#eef0f5;--sh:0 2px 14px rgba(31,35,48,.06);--r:14px;}'
      + '#qsearch .sr-box{position:sticky;top:0;z-index:5;background:#f5f7fb;padding:10px 0 8px;}'
      + '#qsearch .sr-input-wrap{display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid var(--bd);border-radius:12px;padding:0 10px;box-shadow:var(--sh);transition:border-color .15s;}'
      + '#qsearch .sr-input-wrap:focus-within{border-color:var(--p);}'
      + '#qsearch .sr-ic{font-size:16px;color:var(--t3);}'
      + '#qsearch input.sr-input{flex:1;border:0;outline:0;background:transparent;font-size:15px;padding:12px 0;color:var(--t);min-width:0;}'
      + '#qsearch .sr-clear{border:0;background:#f1f3f8;color:var(--t2);width:22px;height:22px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;flex:none;}'
      + '#qsearch .sr-tip{font-size:12px;color:var(--t3);margin:7px 2px 0;line-height:1.5;}'
      + '#qsearch .sr-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}'
      + '#qsearch .sr-chip{font-size:12px;padding:5px 10px;border-radius:999px;border:1px solid var(--bd);background:#fff;color:var(--t2);cursor:pointer;user-select:none;transition:.15s;}'
      + '#qsearch .sr-chip.on{background:var(--p);border-color:var(--p);color:#fff;}'
      + '#qsearch .sr-chip.f.on{background:#eef0ff;border-color:#c7cdff;color:var(--p);}'
      + '#qsearch .sr-lbl{font-size:12px;color:var(--t3);align-self:center;margin-right:2px;}'
      + '#qsearch .sr-count{font-size:13px;color:var(--t2);margin:12px 2px 8px;display:flex;justify-content:space-between;align-items:center;}'
      + '#qsearch .sr-count b{color:var(--p);font-size:16px;}'
      + '#qsearch .sr-card{background:#fff;border-radius:var(--r);box-shadow:var(--sh);padding:13px 14px;margin-bottom:10px;}'
      + '#qsearch .sr-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--t3);margin-bottom:7px;}'
      + '#qsearch .sr-badge{color:#fff;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;}'
      + '#qsearch .sr-tagx{background:#f4f6fa;color:var(--t2);padding:2px 7px;border-radius:6px;}'
      + '#qsearch .sr-where{background:#fff7ed;color:#c2650b;padding:2px 7px;border-radius:6px;}'
      + '#qsearch .sr-stem{font-size:14.5px;line-height:1.65;color:var(--t);word-break:break-word;}'
      + '#qsearch .sr-mat{font-size:12.5px;line-height:1.6;color:var(--t2);background:#fafbfe;border-left:3px solid var(--bd);padding:7px 9px;border-radius:0 8px 8px 0;margin-top:8px;}'
      + '#qsearch .sr-opts{margin-top:9px;display:flex;flex-direction:column;gap:5px;}'
      + '#qsearch .sr-opt{font-size:13.5px;line-height:1.55;color:var(--t2);padding:6px 9px;border-radius:8px;background:#fafbfe;word-break:break-word;}'
      + '#qsearch .sr-opt.right{background:#ecfdf3;color:#15803d;font-weight:600;}'
      + '#qsearch .sr-exp{margin-top:9px;font-size:13px;line-height:1.7;color:var(--t2);background:#f8f9fd;padding:9px 10px;border-radius:9px;white-space:pre-wrap;word-break:break-word;}'
      + '#qsearch .sr-acts{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap;}'
      + '#qsearch .sr-btn{font-size:12.5px;padding:7px 12px;border-radius:9px;border:1px solid var(--bd);background:#fff;color:var(--t2);cursor:pointer;transition:.15s;}'
      + '#qsearch .sr-btn:active{transform:scale(.97);}'
      + '#qsearch .sr-btn.pri{background:var(--p);border-color:var(--p);color:#fff;font-weight:600;}'
      + '#qsearch .sr-hit{background:#fff3bf;color:#a15c00;border-radius:3px;padding:0 1px;font-weight:700;}'
      + '#qsearch .sr-empty{text-align:center;color:var(--t3);font-size:13.5px;padding:34px 16px;background:#fff;border-radius:var(--r);box-shadow:var(--sh);line-height:1.8;}'
      + '#qsearch .sr-more{width:100%;padding:11px;border-radius:11px;border:1px dashed #ccd2e0;background:#fff;color:var(--p);font-size:13.5px;cursor:pointer;margin-bottom:10px;}'
      + '#qsearch .sr-his{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}'
      + '#qsearch .sr-his-t{font-size:12px;color:var(--t3);width:100%;display:flex;justify-content:space-between;margin-bottom:2px;}'
      + '#qsearch .sr-his-t span{cursor:pointer;color:var(--t3);}';
    var st = document.createElement('style');
    st.id = 'qsearch-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 渲染 ----------
  function render(root) {
    var qb = window.QB || {};
    var total = Object.keys(qb).reduce(function (s, k) { return s + (qb[k] || []).length; }, 0);

    var modChips = '<span class="sr-lbl">模块</span>'
      + '<span class="sr-chip' + (S.mods.length === 0 ? ' on' : '') + '" data-mod="">全部</span>'
      + Object.keys(MOD_NAMES).map(function (m) {
          return '<span class="sr-chip' + (S.mods.indexOf(m) > -1 ? ' on' : '') + '" data-mod="' + m + '">' + MOD_NAMES[m] + '</span>';
        }).join('');

    var FIELD_NAMES = { q: '题干', options: '选项', material: '材料', explain: '解析' };
    var fieldChips = '<span class="sr-lbl">范围</span>'
      + Object.keys(FIELD_NAMES).map(function (f) {
          return '<span class="sr-chip f' + (S.fields.indexOf(f) > -1 ? ' on' : '') + '" data-field="' + f + '">' + FIELD_NAMES[f] + '</span>';
        }).join('');

    root.innerHTML = ''
      + '<div id="qsearch">'
      +   '<div class="sr-box">'
      +     '<div class="sr-input-wrap">'
      +       '<span class="sr-ic">🔎</span>'
      +       '<input class="sr-input" id="srInput" type="search" autocomplete="off" placeholder="输入任意词，如：光合作用 / 加强 / 排列组合" value="' + esc(S.kw) + '" />'
      +       '<button class="sr-clear" id="srClear" title="清空">✕</button>'
      +     '</div>'
      +     '<div class="sr-tip">模糊包含即可命中，无需输完整。空格分隔 = 同时包含（如 <b>国考 排序</b>）。共 ' + total + ' 题可搜。</div>'
      +     '<div class="sr-chips" id="srMods">' + modChips + '</div>'
      +     '<div class="sr-chips" id="srFields">' + fieldChips + '</div>'
      +   '</div>'
      +   '<div id="srBody"></div>'
      + '</div>';

    var input = root.querySelector('#srInput');
    var body = root.querySelector('#srBody');

    function run(resetShown) {
      if (resetShown !== false) S.shown = PAGE_SIZE;
      var r = search(S.kw, S.mods, S.fields);
      S.results = r.list;
      renderBody(body, r.keys);
    }

    input.addEventListener('input', function () {
      S.kw = input.value;
      clearTimeout(debounceId);
      debounceId = setTimeout(function () { run(); }, 160);
    });
    input.addEventListener('change', function () { pushHistory(S.kw.trim()); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { pushHistory(S.kw.trim()); input.blur(); }
    });

    root.querySelector('#srClear').onclick = function () {
      S.kw = ''; input.value = ''; input.focus(); run();
    };

    root.querySelector('#srMods').addEventListener('click', function (e) {
      var el = e.target.closest('[data-mod]'); if (!el) return;
      var m = el.getAttribute('data-mod');
      if (!m) S.mods = [];
      else {
        var i = S.mods.indexOf(m);
        if (i > -1) S.mods.splice(i, 1); else S.mods.push(m);
      }
      render(root);   // 重绘 chips 状态
      var inp = root.querySelector('#srInput');
      if (inp && S.kw) { inp.focus(); }
    });

    root.querySelector('#srFields').addEventListener('click', function (e) {
      var el = e.target.closest('[data-field]'); if (!el) return;
      var f = el.getAttribute('data-field');
      var i = S.fields.indexOf(f);
      if (i > -1) { if (S.fields.length > 1) S.fields.splice(i, 1); }
      else S.fields.push(f);
      render(root);
    });

    run();
    // 首次进入自动聚焦（移动端不弹键盘避免打扰，仅桌面）
    if (!S.kw && window.matchMedia && window.matchMedia('(min-width: 700px)').matches) {
      try { input.focus(); } catch (e) {}
    }
  }

  function renderBody(body, keys) {
    if (!keys.length) {
      var his = getHistory();
      body.innerHTML = '<div class="sr-empty">输入关键词开始搜题<br/><span style="font-size:12px">题干、选项、材料、解析 全都能搜</span></div>'
        + (his.length
            ? '<div class="sr-card"><div class="sr-his-t">最近搜索<span id="srHisClear">清空</span></div><div class="sr-his">'
              + his.map(function (h) { return '<span class="sr-chip" data-his="' + esc(h) + '">' + esc(h) + '</span>'; }).join('')
              + '</div></div>'
            : '');
      var hc = body.querySelector('#srHisClear');
      if (hc) hc.onclick = function () { clearHistory(); renderBody(body, keys); };
      body.querySelectorAll('[data-his]').forEach(function (el) {
        el.onclick = function () {
          var inp = document.querySelector('#srInput');
          if (inp) { inp.value = el.getAttribute('data-his'); S.kw = inp.value; inp.dispatchEvent(new Event('input')); }
        };
      });
      return;
    }

    var list = S.results;
    if (!list.length) {
      body.innerHTML = '<div class="sr-count">共 <b>0</b> 题命中</div>'
        + '<div class="sr-empty">没搜到「' + esc(S.kw) + '」<br/>'
        + '<span style="font-size:12px">试试：① 换更短的词 ② 去掉空格只留一个词 ③ 把「范围」里的 材料/解析 也打开 ④ 模块选「全部」</span></div>';
      return;
    }

    var shown = list.slice(0, S.shown);
    var html = '<div class="sr-count">共 <b>' + list.length + '</b> 题命中'
      + '<span style="color:#9ca3af">显示前 ' + shown.length + ' 条</span></div>';

    shown.forEach(function (item, idx) {
      var q = item.q;
      var m = item.module;
      var topic = q.topic || '';
      if (!topic && window.KnowledgeTree && typeof window.KnowledgeTree.infer === 'function') {
        try { var t = window.KnowledgeTree.infer(q, m); if (t) topic = t.topicName; } catch (e) {}
      }
      var optsHTML = (q.options || []).map(function (o, i) {
        var right = (i === q.answer);
        return '<div class="sr-opt' + (right ? ' right' : '') + '">'
          + String.fromCharCode(65 + i) + '. ' + highlight(o, keys) + (right ? ' ✓' : '') + '</div>';
      }).join('');

      html += '<div class="sr-card" data-i="' + idx + '">'
        + '<div class="sr-meta">'
        +   '<span class="sr-badge" style="background:' + (MOD_COLORS[m] || '#5b6cff') + '">' + (MOD_NAMES[m] || m) + '</span>'
        +   (topic ? '<span class="sr-tagx">' + esc(topic) + '</span>' : '')
        +   (q.year ? '<span class="sr-tagx">' + esc(q.year) + '</span>' : '')
        +   (q.exam_type ? '<span class="sr-tagx">' + esc(q.exam_type) + '</span>' : '')
        +   (item.where.length ? '<span class="sr-where">命中：' + item.where.join('·') + '</span>' : '')
        + '</div>'
        + '<div class="sr-stem">' + highlight(q.q, keys) + '</div>'
        + (q.material ? '<div class="sr-mat">' + highlight(snippet(q.material, keys, 50), keys) + '</div>' : '')
        + '<div class="sr-opts">' + optsHTML + '</div>'
        + '<div class="sr-exp" style="display:none" data-exp>' + (q.explain ? highlight(q.explain, keys) : '（本题暂无解析）') + '</div>'
        + '<div class="sr-acts">'
        +   '<button class="sr-btn pri" data-act="do">✏️ 去做这题</button>'
        +   '<button class="sr-btn" data-act="exp">📖 解析</button>'
        +   '<button class="sr-btn" data-act="fav">⭐ 收藏</button>'
        + '</div>'
        + '</div>';
    });

    if (list.length > S.shown) {
      html += '<button class="sr-more" id="srMore">加载更多（还有 ' + (list.length - S.shown) + ' 题）</button>';
    }

    body.innerHTML = html;

    body.querySelectorAll('.sr-card').forEach(function (card) {
      var i = Number(card.getAttribute('data-i'));
      var item = shown[i];
      if (!item) return;
      var q = item.q;

      var favBtn = card.querySelector('[data-act=fav]');
      if (favBtn && window.SAT && window.SAT.state && (window.SAT.state.favorites || []).indexOf(q.id) > -1) {
        favBtn.textContent = '⭐ 已收藏';
      }

      card.querySelector('[data-act=exp]').onclick = function () {
        var e = card.querySelector('[data-exp]');
        e.style.display = (e.style.display === 'none') ? 'block' : 'none';
      };
      card.querySelector('[data-act=do]').onclick = function () {
        pushHistory(S.kw.trim());
        if (window.SAT && typeof window.SAT.practiceOne === 'function') window.SAT.practiceOne(q);
        else toast('无法跳转，请从刷题页进入');
      };
      if (favBtn) favBtn.onclick = function () {
        if (window.SAT && typeof window.SAT.toggleFavById === 'function') {
          var added = window.SAT.toggleFavById(q.id);
          favBtn.textContent = added ? '⭐ 已收藏' : '⭐ 收藏';
        } else toast('收藏功能未就绪');
      };
    });

    var more = body.querySelector('#srMore');
    if (more) more.onclick = function () { S.shown += PAGE_SIZE; renderBody(body, keys); };
  }

  // ---------- 对外 ----------
  window.QSearch = {
    mount: function (rootEl) {
      if (!rootEl) return;
      injectStyle();
      clearTimeout(debounceId);
      rootEl.innerHTML = '';
      render(rootEl);
    },
    // 供外部带词进入：#search 后调用
    setKeyword: function (kw) { S.kw = kw || ''; S.shown = PAGE_SIZE; }
  };
})();
