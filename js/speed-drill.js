/**
 * 速算练习器 (资料分析 速算 drill)
 * 纯 vanilla JS IIFE。挂载到 window.SpeedDrill。
 * 使用：SpeedDrill.mount(rootEl)  // rootEl 为要渲染的容器 div
 */
(function () {
  'use strict';

  // ---------- 工具函数 ----------
  function rndInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function rndFloat(min, max, dp) {
    var v = Math.random() * (max - min) + min;
    var f = Math.pow(10, dp || 0);
    return Math.round(v * f) / f;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'style') e.setAttribute('style', attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (text != null) e.textContent = text;
    return e;
  }

  // 生成 4 个互不相同的选项（含正确答案），打乱顺序
  function makeChoices(correct, genDistractor) {
    var opts = [correct];
    var guard = 0;
    while (opts.length < 4 && guard < 200) {
      guard++;
      var d = genDistractor();
      if (opts.indexOf(d) === -1) opts.push(d);
    }
    // 若不足 4 个（极少数），用简单偏移补齐
    while (opts.length < 4) {
      var last = opts[opts.length - 1] + (correct >= 1 ? 1 : 0.1);
      if (opts.indexOf(last) === -1) opts.push(last);
    }
    return shuffle(opts);
  }

  // ---------- 题目生成 ----------
  // 类型 1：截位直除
  function genDivision(diff) {
    var aMax = diff === 'advance' ? 99999 : 9999;
    var bMax = diff === 'advance' ? 9999 : 999;
    var a = rndInt(100, aMax);
    var b = rndInt(10, bMax);
    var exact = a / b;
    var correct = Math.round(exact * 10) / 10;
    var choices = makeChoices(correct, function () {
      var delta = rndFloat(-2.5, 2.5, 1);
      var v = Math.round((correct + delta) * 10) / 10;
      return v <= 0 ? correct + 1 : v;
    });
    return {
      type: 'division',
      title: '截位直除',
      stem: a + ' ÷ ' + b + ' ≈ ？',
      choices: choices,
      correct: correct,
      tip: '选项差距大截两位、差距小截三位；尾数/首数法辅助。',
      explain: a + ' ÷ ' + b + ' = ' + (Math.round(exact * 1000) / 1000) + '，保留 1 位小数 ≈ ' + correct + '。'
    };
  }

  // 类型 2：分数比较
  function genFraction(diff) {
    var maxN = diff === 'advance' ? 199 : 99;
    var a1 = rndInt(10, maxN), b1 = rndInt(10, maxN);
    var a2, b2, tries = 0;
    do {
      a2 = rndInt(10, maxN); b2 = rndInt(10, maxN);
      tries++;
    } while (Math.abs(a1 / b1 - a2 / b2) < 0.02 && tries < 50);

    var v1 = a1 / b1, v2 = a2 / b2;
    var correctIndex = v1 >= v2 ? 0 : 1;
    return {
      type: 'fraction',
      title: '分数比较',
      stem: '比较大小，哪个更大？',
      fracA: a1 + '/' + b1,
      fracB: a2 + '/' + b2,
      valA: v1,
      valB: v2,
      correctIndex: correctIndex,
      tip: '通分比分子 / 分子化同比分母 / 反着看（倒数大者原值小）。',
      explain: a1 + '/' + b1 + ' ≈ ' + (Math.round(v1 * 1000) / 1000) +
               '，' + a2 + '/' + b2 + ' ≈ ' + (Math.round(v2 * 1000) / 1000) +
               '，故' + (correctIndex === 0 ? ('「' + a1 + '/' + b1 + '」更大') : ('「' + a2 + '/' + b2 + '」更大')) + '。'
    };
  }

  // 类型 3：百分数互化 / 估算
  var COMMON_PCT = [12.5, 25, 33.3, 37.5, 50, 20, 75, 66.7, 10, 62.5, 87.5, 16.7];
  function genPercent(diff) {
    if (Math.random() < 0.5) {
      // 将 X% 写成小数
      var pct = COMMON_PCT[rndInt(0, COMMON_PCT.length - 1)];
      var correct = Math.round(pct / 100 * 1000) / 1000;
      var choices = makeChoices(correct, function () {
        var d = Math.round((pct + rndFloat(-15, 15, 1)) / 100 * 1000) / 1000;
        return d <= 0 ? correct + 0.1 : d;
      });
      return {
        type: 'percent',
        title: '百分数互化',
        stem: '将 ' + pct + '% 写成小数 ≈ ？',
        choices: choices,
        correct: correct,
        tip: '常用对照：1/2=50%, 1/3≈33.3%, 1/4=25%, 1/5=20%, 1/8=12.5%, 3/8=37.5%。',
        explain: pct + '% = ' + correct + '。'
      };
    } else {
      // X 占 Y 的比重约为？
      var x = rndInt(50, diff === 'advance' ? 9999 : 1999);
      var y = rndInt(x + 10, diff === 'advance' ? 49999 : 9999);
      var exact = x / y * 100;
      var correctP = Math.round(exact * 10) / 10;
      var choices = makeChoices(correctP, function () {
        var d = Math.round((correctP + rndFloat(-8, 8, 1)) * 10) / 10;
        return d <= 0 ? correctP + 1 : d;
      });
      return {
        type: 'percent',
        title: '比重估算',
        stem: x + ' 占 ' + y + ' 的比重约为？',
        choices: choices,
        correct: correctP,
        tip: '常用对照：1/2=50%, 1/3≈33.3%, 1/4=25%, 1/5=20%, 1/8=12.5%, 3/8=37.5%。',
        explain: x + ' ÷ ' + y + ' × 100% ≈ ' + correctP + '%。'
      };
    }
  }

  function genQuestion(diff) {
    var r = Math.random();
    if (r < 0.4) return genDivision(diff);
    if (r < 0.7) return genFraction(diff);
    return genPercent(diff);
  }

  // ---------- 主模块 ----------
  function mount(rootEl) {
    if (!rootEl) return; // 防御：容器不存在则不做任何事
    rootEl.innerHTML = ''; // 清空上次挂载，避免重复进入叠加多个练习器 + 残留定时器

    var state = {
      diff: 'basic',
      q: null,
      qStart: 0,
      timerId: null,
      answered: false,
      total: 0,
      right: 0,
      timeSum: 0
    };

    var wrap = el('div', { class: 'sd-wrap', style:
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'max-width:560px;margin:0 auto;padding:12px;color:#222;' });
    rootEl.appendChild(wrap);

    function clearTimer() {
      if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    }

    function renderDifficultyBar() {
      var bar = el('div', { class: 'sd-diff', style:
        'display:flex;gap:8px;margin-bottom:12px;' });
      var b1 = el('button', { class: 'btn-ghost sd-diffbtn' + (state.diff === 'basic' ? ' active' : ''),
        style: diffBtnStyle(state.diff === 'basic') }, '基础');
      var b2 = el('button', { class: 'btn-ghost sd-diffbtn' + (state.diff === 'advance' ? ' active' : ''),
        style: diffBtnStyle(state.diff === 'advance') }, '进阶');
      b1.onclick = function () { state.diff = 'basic'; newQuestion(); };
      b2.onclick = function () { state.diff = 'advance'; newQuestion(); };
      bar.appendChild(b1); bar.appendChild(b2);
      return bar;
    }

    function diffBtnStyle(active) {
      return 'flex:1;padding:10px;border-radius:10px;border:1px solid ' +
        (active ? '#2f6fed' : '#ccc') + ';background:' + (active ? '#2f6fed' : '#fff') +
        ';color:' + (active ? '#fff' : '#333') + ';font-size:15px;font-weight:600;cursor:pointer;';
    }

    function renderStats() {
      var acc = state.total ? Math.round(state.right / state.total * 100) : 0;
      var avg = state.total ? Math.round(state.timeSum / state.total) : 0;
      var box = el('div', { class: 'card sd-stats', style:
        'display:flex;justify-content:space-around;text-align:center;padding:12px;margin-bottom:12px;' +
        'background:#f7f9ff;border:1px solid #e3e9ff;border-radius:12px;' });
      box.appendChild(statItem('答对/总题', state.right + '/' + state.total));
      box.appendChild(statItem('正确率', acc + '%'));
      box.appendChild(statItem('平均用时', state.total ? fmtTime(avg) : '--:--'));
      return box;
    }
    function statItem(label, val) {
      var d = el('div', {}, null);
      d.appendChild(el('div', { style: 'font-size:18px;font-weight:700;color:#2f6fed;' }, val));
      d.appendChild(el('div', { style: 'font-size:12px;color:#888;margin-top:2px;' }, label));
      return d;
    }

    function renderTimer() {
      return el('div', { class: 'sd-timer', style:
        'text-align:right;font-size:14px;color:#e0552b;font-weight:600;margin-bottom:6px;' },
        '⏱ ' + fmtTime(0));
    }

    function newQuestion() {
      clearTimer();
      state.q = genQuestion(state.diff);
      state.qStart = Date.now();
      state.answered = false;
      render();
      var timerEl = wrap.querySelector('.sd-timer');
      state.timerId = setInterval(function () {
        var sec = Math.floor((Date.now() - state.qStart) / 1000);
        if (timerEl) timerEl.textContent = '⏱ ' + fmtTime(sec);
      }, 250);
    }

    function render() {
      wrap.innerHTML = '';
      wrap.appendChild(renderDifficultyBar());
      wrap.appendChild(renderStats());
      wrap.appendChild(renderTimer());

      var q = state.q;
      var card = el('div', { class: 'card sd-q', style:
        'padding:16px;border-radius:12px;background:#fff;border:1px solid #e6e6e6;margin-bottom:12px;' });

      // 标题 + 类型标签
      var head = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px;' });
      head.appendChild(el('span', { style:
        'background:#fff0e6;color:#e0552b;font-size:12px;padding:3px 8px;border-radius:6px;font-weight:600;' },
        q.title));
      card.appendChild(head);

      // 题干
      card.appendChild(el('div', { style: 'font-size:20px;font-weight:700;margin-bottom:14px;line-height:1.4;' },
        q.stem));

      // 选项
      var opts = el('div', { class: 'q-options sd-opts', style: 'display:flex;flex-direction:column;gap:10px;' });
      if (q.type === 'fraction') {
        var fab = el('div', { style:
          'display:flex;gap:10px;' });
        var fa = mkFracBtn('A', q.fracA);
        var fb = mkFracBtn('B', q.fracB);
        fab.appendChild(fa.btn); fab.appendChild(fb.btn);
        opts.appendChild(fab);
        card.appendChild(opts);
        // 绑定
        fa.btn.onclick = function () { answer(0, fa.btn, fb.btn); };
        fb.btn.onclick = function () { answer(1, fb.btn, fa.btn); };
      } else {
        q.choices.forEach(function (c, i) {
          var ob = el('button', { class: 'opt sd-opt', style: optStyle(false),
            'data-i': i },
            String.fromCharCode(65 + i) + '. ' + c);
          ob.onclick = function () { answerChoice(c, ob, opts); };
          opts.appendChild(ob);
        });
        card.appendChild(opts);
      }

      wrap.appendChild(card);

      // 反馈区（初始隐藏）
      var fb = el('div', { class: 'sd-feedback', style:
        'margin:4px 0 12px;padding:12px;border-radius:10px;display:none;font-size:14px;line-height:1.6;' });
      fb.id = 'sd-feedback';
      wrap.appendChild(fb);

      // 下一题按钮
      var next = el('button', { class: 'btn-primary sd-next', style:
        'width:100%;padding:13px;border:none;border-radius:10px;background:#2f6fed;color:#fff;' +
        'font-size:16px;font-weight:600;cursor:pointer;display:none;' }, '下一题 →');
      next.onclick = newQuestion;
      next.id = 'sd-next';
      wrap.appendChild(next);

      // 再来一组
      var reset = el('button', { class: 'btn-ghost sd-reset', style:
        'width:100%;padding:11px;margin-top:10px;border:1px solid #ccc;border-radius:10px;' +
        'background:#fff;color:#555;font-size:14px;cursor:pointer;' }, '🔄 再来一组');
      reset.onclick = function () {
        state.total = 0; state.right = 0; state.timeSum = 0;
        newQuestion();
      };
      wrap.appendChild(reset);
    }

    function mkFracBtn(label, frac) {
      var btn = el('button', { class: 'opt sd-frac', style:
        'flex:1;padding:18px;border:1px solid #d8d8d8;border-radius:12px;background:#fff;' +
        'font-size:22px;font-weight:700;cursor:pointer;' },
        label + '. ' + frac);
      return { btn: btn };
    }

    function optStyle(disable) {
      return 'text-align:left;padding:13px 14px;border:1px solid #d8d8d8;border-radius:10px;' +
        'background:#fff;font-size:16px;cursor:pointer;color:#222;' +
        (disable ? 'pointer-events:none;' : '');
    }

    function lockOptions(container) {
      var btns = container.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].style.pointerEvents = 'none';
      }
    }

    function answerChoice(value, btnEl, optsContainer) {
      if (state.answered) return;
      var q = state.q;
      var correct = value === q.correct;
      finishQuestion(correct, optsContainer, btnEl, null, q);
    }

    function answer(choiceIndex, chosenBtn, otherBtn) {
      if (state.answered) return;
      var q = state.q;
      var correct = choiceIndex === q.correctIndex;
      // 标记所选 / 正确
      chosenBtn.style.borderColor = correct ? '#1a9e4b' : '#e03b3b';
      chosenBtn.style.background = correct ? '#e8f8ee' : '#fdeaea';
      var rightBtn = choiceIndex === 0 ? (q.correctIndex === 0 ? chosenBtn : otherBtn)
                                       : (q.correctIndex === 1 ? chosenBtn : otherBtn);
      if (!correct && rightBtn) {
        rightBtn.style.borderColor = '#1a9e4b';
        rightBtn.style.background = '#e8f8ee';
      }
      finishQuestion(correct, null, null, chosenBtn, q);
    }

    function finishQuestion(correct, optsContainer, chosenBtn, fracChosen, q) {
      state.answered = true;
      clearTimer();
      var sec = Math.floor((Date.now() - state.qStart) / 1000);
      state.total++;
      state.timeSum += sec;
      if (correct) state.right++;

      if (optsContainer) lockOptions(optsContainer);
      if (optsContainer && chosenBtn) {
        chosenBtn.style.borderColor = correct ? '#1a9e4b' : '#e03b3b';
        chosenBtn.style.background = correct ? '#e8f8ee' : '#fdeaea';
        // 高亮正确
        var ob = optsContainer.querySelectorAll('.sd-opt');
        for (var i = 0; i < ob.length; i++) {
          var val = q.choices[i];
          if (val === q.correct) {
            ob[i].style.borderColor = '#1a9e4b';
            ob[i].style.background = '#e8f8ee';
          }
        }
      }

      // 反馈
      var fb = wrap.querySelector('#sd-feedback');
      fb.style.display = 'block';
      fb.style.background = correct ? '#e8f8ee' : '#fdeaea';
      fb.style.border = '1px solid ' + (correct ? '#9adfb4' : '#f3b6b6');
      fb.innerHTML = '';
      fb.appendChild(el('div', { style: 'font-weight:700;color:' + (correct ? '#1a9e4b' : '#e03b3b') + ';margin-bottom:4px;' },
        (correct ? '✅ 回答正确！' : '❌ 回答错误') + '　用时 ' + fmtTime(sec)));
      fb.appendChild(el('div', { style: 'color:#333;' }, '正确答案：' + q.explain));
      fb.appendChild(el('div', { style: 'color:#555;margin-top:6px;' },
        '💡 速算技巧：' + q.tip));

      wrap.querySelector('#sd-next').style.display = 'block';
      // 刷新统计
      var stats = wrap.querySelector('.sd-stats');
      if (stats) stats.replaceWith(renderStats());
    }

    // 启动
    newQuestion();
  }

  window.SpeedDrill = {
    mount: function (rootEl) { mount(rootEl); }
  };
})();
