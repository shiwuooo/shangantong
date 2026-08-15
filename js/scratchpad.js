/* 上岸通 · 共享手写草稿引擎 (Scratchpad)
 * 设计目标：在平板(iPad / 安卓)上用「电容笔 / 手指」在题目上自由写画，对标粉笔 App 的草稿板。
 *
 * 关键技术点：
 *  1. Pointer Events 统一鼠标 / 触摸 / 电容笔 —— 一套代码覆盖所有输入。
 *  2. 电容笔压感：pointerType==='pen' 时读取 e.pressure，线宽随力度变化（0.4x ~ 1.4x）。
 *  3. 手掌防误触：当一支笔(pointerType==='pen')正在书写时，忽略所有 touch 指针
 *     （手掌搭在屏幕上不会画出乱线）；纯手指环境(无笔)仍可正常书写。
 *  4. 中点平滑：相邻点取中点连线 + round 线帽，消除锯齿、手感顺滑。
 *  5. 画笔 / 橡皮 / 多色 / 撤销 / 清空；DPR 高清适配；ResizeObserver 自适应尺寸。
 *  6. 按题持久化：调用方提供 key() 返回存储键，笔画自动存 localStorage，切题不丢。
 *
 * 用法（各刷题板块统一）：
 *   const pad = new Scratchpad(canvasEl, {
 *     key: () => 'draft_xxx_' + qid,   // 必填：按题区分
 *     color: '#1a1a2e', penWidth: 3, eraserWidth: 26
 *   });
 *   penBtn.onclick   = () => pad.setTool('pen');
 *   eraserBtn.onclick= () => pad.setTool('eraser');
 *   colorBtn.onclick = () => pad.setColor('#e23b3b');
 *   undoBtn.onclick  = () => pad.undo();
 *   clearBtn.onclick = () => pad.clear();
 *   // 打开面板后调用：pad.resize();   // 重新取尺寸并重绘
 */
(function (window) {
  'use strict';

  function isDark() {
    if (document.body.classList.contains('dark')) return true;
    if (document.body.classList.contains('light')) return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function Scratchpad(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.tool = 'pen';
    this.color = opts.color || (isDark() ? '#f1f5f9' : '#1a1a2e');
    this.penWidth = opts.penWidth || 3;
    this.eraserWidth = opts.eraserWidth || 26;
    this.strokes = [];        // [{tool, color, pts:[{x,y,w}]}]
    this.cur = null;          // 当前笔画
    this.prev = null;         // 上一个实际点（平滑用）
    this.prevW = 0;
    this.activeId = null;     // 当前捕获的指针 id
    this.penDown = false;     // 是否有笔正在书写（手掌防误触）
    this.keyFn = opts.key || null;
    this._bind();
    this.resize();
    this.load();
  }

  Scratchpad.prototype._bind = function () {
    var self = this, c = this.canvas;
    c.style.touchAction = 'none';   // 关键：禁止滚动/缩放手势，保证书写连贯
    c.style.userSelect = 'none';
    c.style.webkitUserSelect = 'none';
    c.style.cursor = 'crosshair';
    c.addEventListener('pointerdown', function (e) { self._down(e); });
    c.addEventListener('pointermove', function (e) { self._move(e); });
    c.addEventListener('pointerup', function (e) { self._up(e); });
    c.addEventListener('pointercancel', function (e) { self._up(e); });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(c);
    }
  };

  // 重新取尺寸（画布由 hidden 变显示后必须调用）
  Scratchpad.prototype.resize = function () {
    var c = this.canvas;
    var r = c.getBoundingClientRect();
    if (!r.width || !r.height) return; // 不可见时跳过，避免清空
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * this.dpr));
    c.height = Math.max(1, Math.round(r.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.redraw();
  };

  Scratchpad.prototype.setTool = function (t) {
    this.tool = t;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  };

  Scratchpad.prototype.setColor = function (col) {
    this.color = col;
    if (this.tool === 'eraser') this.setTool('pen');
  };

  Scratchpad.prototype._pos = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 线宽：笔压感 0.4x~1.4x；触摸/鼠标用固定 0.5 档
  Scratchpad.prototype._width = function (e) {
    var p = (e.pointerType === 'pen' && e.pressure > 0) ? e.pressure : 0.5;
    var mult = 0.4 + p; // 0.4 ~ 1.4
    return (this.tool === 'eraser' ? this.eraserWidth : this.penWidth) * mult;
  };

  Scratchpad.prototype._down = function (e) {
    // 手掌防误触：笔正在写时，忽略手指触摸
    if (e.pointerType === 'touch' && this.penDown) return;
    if (e.pointerType === 'pen') this.penDown = true;
    this.activeId = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    var p = this._pos(e);
    var w = this._width(e);
    this.cur = { tool: this.tool, color: this.tool === 'eraser' ? null : this.color, pts: [{ x: p.x, y: p.y, w: w }] };
    this.prev = { x: p.x, y: p.y };
    this.prevW = w;
    // 点一下也要留个墨点
    this.ctx.save();
    if (this.tool === 'eraser') { this.ctx.globalCompositeOperation = 'destination-out'; }
    else { this.ctx.fillStyle = this.color; }
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    e.preventDefault();
  };

  Scratchpad.prototype._move = function (e) {
    if (this.activeId !== e.pointerId || !this.cur) return;
    if (e.pointerType === 'touch' && this.penDown) return;
    e.preventDefault();
    var p = this._pos(e);
    var w = this._width(e);
    var mid = { x: (this.prev.x + p.x) / 2, y: (this.prev.y + p.y) / 2 };
    var midW = (this.prevW + w) / 2;
    this._seg(this.cur.tool, this.prev.x, this.prev.y, this.prevW, mid.x, mid.y, midW);
    this.prev = { x: p.x, y: p.y };
    this.prevW = w;
    this.cur.pts.push({ x: p.x, y: p.y, w: w });
  };

  Scratchpad.prototype._up = function (e) {
    if (this.activeId !== e.pointerId) return;
    if (this.cur && this.cur.pts.length) {
      // 收尾：把最后一段补到实际点
      var last = this.cur.pts[this.cur.pts.length - 1];
      this._seg(this.cur.tool, this.prev.x, this.prev.y, this.prevW, last.x, last.y, last.w);
      this.strokes.push(this.cur);
      this.save();
    }
    this.cur = null;
    this.prev = null;
    this.activeId = null;
    if (e.pointerType === 'pen') this.penDown = false;
  };

  // 画一段（midpoint 平滑）
  Scratchpad.prototype._seg = function (tool, x1, y1, w1, x2, y2, w2) {
    var ctx = this.ctx, w = (w1 + w2) / 2;
    ctx.save();
    if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    else { ctx.strokeStyle = this.color; ctx.fillStyle = this.color; }
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  // 重绘全部笔画（切题/撤销/resize 时）
  Scratchpad.prototype.redraw = function () {
    var ctx = this.ctx, c = this.canvas;
    ctx.save();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var s = 0; s < this.strokes.length; s++) this._renderStroke(this.strokes[s]);
    ctx.restore();
  };

  Scratchpad.prototype._renderStroke = function (stroke) {
    var pts = stroke.pts, n = pts.length, ctx = this.ctx;
    if (!n) return;
    ctx.save();
    if (stroke.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    else { ctx.strokeStyle = stroke.color || this.color; ctx.fillStyle = stroke.color || this.color; }
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    for (var i = 1; i < n; i++) {
      var a = pts[i - 1], b = pts[i];
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var w = (a.w + b.w) / 2;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
    }
    // 收尾段
    var last = pts[n - 1], prevMid = { x: (pts[n - 2].x + last.x) / 2, y: (pts[n - 2].y + last.y) / 2 };
    ctx.lineWidth = last.w;
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  };

  Scratchpad.prototype.undo = function () {
    if (!this.strokes.length) { if (window.toast) window.toast('没有可撤销的笔画'); return; }
    this.strokes.pop();
    this.redraw();
    this.save();
  };

  Scratchpad.prototype.clear = function () {
    this.strokes = [];
    this.redraw();
    this.save();
    if (window.toast) window.toast('草稿已清空');
  };

  // 持久化
  Scratchpad.prototype.save = function () {
    if (!this.keyFn) return;
    var k = this.keyFn();
    if (!k) return;
    try {
      var slim = this.strokes.map(function (s) {
        return { t: s.tool === 'eraser' ? 1 : 0, c: s.color, p: s.pts.map(function (pt) { return [Math.round(pt.x), Math.round(pt.y), +pt.w.toFixed(2)]; }) };
      });
      localStorage.setItem(k, JSON.stringify(slim));
    } catch (_) {}
  };

  Scratchpad.prototype.load = function () {
    if (!this.keyFn) return;
    var k = this.keyFn();
    if (!k) return;
    try {
      var raw = localStorage.getItem(k);
      if (!raw) { this.strokes = []; return; }
      var arr = JSON.parse(raw);
      this.strokes = (arr || []).map(function (s) {
        return {
          tool: s.t ? 'eraser' : 'pen',
          color: s.c || '#1a1a2e',
          pts: (s.p || []).map(function (pt) { return { x: pt[0], y: pt[1], w: pt[2] }; })
        };
      });
    } catch (_) { this.strokes = []; }
  };

  Scratchpad.prototype.destroy = function () {
    if (this._ro) this._ro.disconnect();
  };

  // 暴露全局
  window.Scratchpad = Scratchpad;
  window.Scratchpad.isDark = isDark;
})(window);
