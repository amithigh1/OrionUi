/* ── DOM skeleton, sizing, scroll sync, render window ─────────────────── */
Object.assign(OGantt.prototype, {
  _build() {
    const id = this._uid;
    this._tb = h('div', { class: 'o-gantt-toolbar', role: 'toolbar' });
    this._ghrow = h('div', { class: 'o-gantt-hrow', role: 'row', 'aria-rowindex': '1' });
    this._ghead = h('div', { class: 'o-gantt-ghead', role: 'rowgroup' }, this._ghrow);
    this._gbody = h('div', { class: 'o-gantt-gbody', role: 'rowgroup' });
    this._gridEl = h('div', { class: 'o-gantt-grid o-scroll', id: id + '-grid', role: 'treegrid', tabindex: '0', 'aria-multiselectable': 'false' }, this._ghead, this._gbody);
    this._split = h('div', { class: 'o-gantt-splitter', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical', 'aria-controls': id + '-grid' });
    this._tierTop = h('div', { class: 'o-gantt-tier is-top' });
    this._tierBot = h('div', { class: 'o-gantt-tier is-bottom' });
    this._scaleToday = h('div', { class: 'o-gantt-scale-today', hidden: true });
    this._scale = h('div', { class: 'o-gantt-scale', 'aria-hidden': 'true' }, this._tierTop, this._tierBot, this._scaleToday);
    this._bg = h('div', { class: 'o-gantt-bg' });
    this._hoverBand = h('div', { class: 'o-gantt-band is-hover', hidden: true });
    this._selBand = h('div', { class: 'o-gantt-band is-selected', hidden: true });
    this._linksG = svg('g');
    this._tempLink = svg('path', { class: 'o-gantt-link-temp', hidden: true });
    this._svg = svg('svg', { class: 'o-gantt-links', 'aria-hidden': 'true' }, this._linksG, this._tempLink);
    this._bars = h('div', { class: 'o-gantt-bars', 'aria-hidden': 'true' });
    this._today = h('div', { class: 'o-gantt-today', hidden: true });
    this._dragTip = h('div', { class: 'o-gantt-dragtip', hidden: true, 'aria-hidden': 'true' });
    this._canvas = h('div', { class: 'o-gantt-canvas' }, this._bg, this._hoverBand, this._selBand, this._today, this._svg, this._bars, this._dragTip);
    this._empty = h('div', { class: 'o-gantt-empty o-empty o-empty-sm', hidden: true });
    this._chartEl = h('div', { class: 'o-gantt-chart o-scroll', tabindex: '0', role: 'region', 'aria-describedby': id + '-kbd' }, this._scale, this._canvas, this._empty);
    this._kbdHint = h('div', { class: 'o-sr-only', id: id + '-kbd' });
    this._bodyEl = h('div', { class: 'o-gantt-body' }, this._gridEl, this._split, this._chartEl);
    this.replaceChildren(this._tb, this._bodyEl, this._kbdHint);
    this._rowEls = new Map(); this._rowFree = [];
    this._barEls = new Map(); this._barFree = [];
    this._queueRender = rafThrottle(() => this._render(false));
  },

  /** Sizes, scrollbar compensation and CSS variables. Cheap; call after any structural change. */
  _layout() {
    if (!this._tree) return;
    const rh = this._rh, n = this._rows.length, headH = G_TIER_H * 2;
    this.style.setProperty('--o-gantt-row-h', rh + 'px');
    this.style.setProperty('--o-gantt-head-h', headH + 'px');
    this.style.setProperty('--o-gantt-grid-w', (this._gridShown ? this._gridW() : 0) + 'px');
    this.classList.toggle('is-grid-hidden', !this._gridShown);
    this._totalW = Math.max(1, Math.round((this._range.d1 - this._range.d0) * this._dw));
    this._totalH = n * rh;
    this._scale.style.width = this._totalW + 'px';
    this._canvas.style.width = this._totalW + 'px';
    this._canvas.style.height = this._totalH + 'px';
    this._gbody.style.height = this._totalH + 'px';
    const ce = this._chartEl, ge = this._gridEl;
    const sbC = ce.offsetHeight - ce.clientHeight, sbG = this._gridShown ? ge.offsetHeight - ge.clientHeight : 0;
    this._canvas.style.height = (this._totalH + Math.max(0, sbG - sbC)) + 'px';
    this._gbody.style.height = (this._totalH + Math.max(0, sbC - sbG)) + 'px';
    this._chartW = ce.clientWidth;
    this._chartH = Math.max(0, ce.clientHeight - headH);
    ge.setAttribute('aria-rowcount', String(n + 1));
    ge.setAttribute('aria-label', this.t('gantt.taskList'));
    ce.setAttribute('aria-label', this.t('gantt.timeline'));
    this._kbdHint.textContent = this.t('gantt.keyboard');
    this._split.setAttribute('aria-label', this.t('gantt.splitter'));
    this._split.setAttribute('aria-valuenow', String(Math.round(this._gridShown ? this._gridW() : 0)));
    this._split.setAttribute('aria-valuemin', '0');
    this._split.setAttribute('aria-valuemax', String(Math.round(this.offsetWidth || 1000)));
    this._empty.hidden = n > 0;
    if (!n) this._empty.innerHTML = `<div class="o-empty-icon">${icon('calendar')}</div><p class="o-empty-title">${esc(this.t('gantt.noTasks'))}</p>`;
    if (this._shiftScroll) { const d = this._shiftScroll; this._shiftScroll = 0; this._setScrollX(this._scrollX() + d); }
    this._layoutV = (this._layoutV || 0) + 1;
    this._layoutDone = true;
    this._win = null;
  },
  _gridW() {
    const full = this.offsetWidth || 1000, max = Math.max(160, full - 140);
    if (this._userGridW != null) return clamp(this._userGridW, 120, max);
    if (this.gridWidth) return clamp(+this.gridWidth, 120, max);
    // widest run of WHOLE columns that fits in ~42% of the component
    const avail = full < 640 ? Math.max(150, full * 0.42) : Math.max(260, full * 0.42);
    let w = 0;
    for (const c of this._cols || []) { if (w && w + c.width > avail) break; w += c.width; }
    return Math.round(Math.min(w || avail, full < 640 ? avail : Infinity) + 1);
  },

  /* ── render window (virtualization) ── */
  _calcWindow() {
    const ce = this._chartEl, rh = this._rh, st = ce.scrollTop, vh = Math.max(rh, this._chartH || ce.clientHeight), n = this._rows.length;
    const sx = this._scrollX(), vw = Math.max(200, this._chartW || ce.clientWidth);
    return {
      r0: Math.max(0, Math.floor(st / rh) - 8), r1: Math.min(n - 1, Math.ceil((st + vh) / rh) + 8),
      x0: Math.max(0, sx - vw * 0.75), x1: Math.min(this._totalW, sx + vw * 1.75), st, vh, sx, vw,
    };
  },
  _inWindow(w) {
    const c = this._win;
    if (!c) return false;
    const rh = this._rh, top = Math.floor(w.st / rh), bot = Math.ceil((w.st + w.vh) / rh);
    const rowsOk = (top >= c.r0 || c.r0 === 0) && (bot <= c.r1 || c.r1 >= this._rows.length - 1);
    const xOk = (w.sx >= c.x0 || c.x0 === 0) && (w.sx + w.vw <= c.x1 || c.x1 >= this._totalW);
    return rowsOk && xOk;
  },
  /** Render the visible window. force=false skips when the viewport is still inside the rendered window. */
  _render(force) {
    if (!this._tree || !this._layoutDone || !this.isConnected) return;
    const w = this._calcWindow();
    if (!force && this._inWindow(w)) { this._renderGrid(this._win); this._renderSel(); return; }
    this._win = w;
    this._renderGrid(w);
    this._renderScale(w);
    this._renderBg(w);
    this._renderBars(w);
    this._renderLinks(w);
    this._renderToday();
    this._renderSel();
  },

  /* ── scrolling ── */
  _scrollX() { const sl = this._chartEl.scrollLeft; return dirOf(this._chartEl) === 'rtl' ? -sl : sl; },
  _setScrollX(x) { const ce = this._chartEl; x = clamp(x, 0, Math.max(0, this._totalW - ce.clientWidth)); ce.scrollLeft = dirOf(ce) === 'rtl' ? -x : x; },
  _scrollToX(x, behavior) {
    const ce = this._chartEl;
    x = clamp(x, 0, Math.max(0, this._totalW - ce.clientWidth));
    ce.scrollTo({ left: dirOf(ce) === 'rtl' ? -x : x, behavior: reducedMotion() ? 'auto' : behavior || 'auto' });
  },
  _scrollRowIntoView(k, center = false) {
    const i = this._rowIndex.get(k);
    if (i == null) return;
    const ce = this._chartEl, rh = this._rh, y = i * rh, st = ce.scrollTop, vh = this._chartH || ce.clientHeight;
    let t = st;
    if (center) t = y - vh / 2 + rh / 2;
    else if (y < st) t = y;
    else if (y + rh > st + vh) t = y + rh - vh;
    if (t !== st) { ce.scrollTop = t; this._gridEl.scrollTop = ce.scrollTop; this._render(false); }
  },
  _onChartScroll() {
    const st = this._chartEl.scrollTop;
    if (Math.abs(this._gridEl.scrollTop - st) >= 1) this._gridEl.scrollTop = st;
    this._hideTip();
    this._queueRender();
  },
  _onGridScroll() {
    const st = this._gridEl.scrollTop;
    if (Math.abs(this._chartEl.scrollTop - st) >= 1) this._chartEl.scrollTop = st;
    this._queueRender();
  },
  _onResize() {
    if (!this._tree) return;
    const w = this.offsetWidth;
    this.classList.toggle('is-narrow', w < 760);
    this.classList.toggle('is-compact', w < 520);
    const cw = this._chartEl.clientWidth, ch = this._chartEl.clientHeight;
    if (cw === this._lastCW && ch === this._lastCH && w === this._lastW) return;
    this._lastCW = cw; this._lastCH = ch; this._lastW = w;
    this._chartW = cw;
    this._computeRange();
    this._layout();
    if (this._firstScroll && this._recs.length && cw) { this._firstScroll = false; this._initialScroll(); }
    this._render(true);
  },
  /** First view: the whole plan when it fits, else today (with today-line) or the start; snapped to a header cell. */
  _initialScroll() {
    const today = gToday(), dw = this._dw, vw = this._chartW || 600;
    let mn = Infinity, mx = -Infinity;
    for (const r of this._recs) { if (r.s < mn) mn = r.s; if (r.e > mx) mx = r.e; }
    const fits = (mx - mn) * dw + 200 <= vw;
    let day = mn - 1;
    if (!fits && this.todayLine && today > mn && today < mx + 30) day = today - vw * 0.25 / dw;
    const unit = gTiers(dw)[1];
    this._setScrollX(this._x(gUnitStart(Math.floor(day), unit, date.weekStart())));
  },
  /** Continuous zoom (pixels per day) keeping the date under `anchor` (viewport x, logical) in place. */
  _setDayWidth(dw, anchor = null, { silent = false } = {}) {
    dw = clamp(+dw || G_VIEW_DW.week, G_ZOOM_MIN, G_ZOOM_MAX);
    if (Math.abs(dw - this._dw) < 1e-6) { this._p.view = gViewFor(dw); this._syncToolbar(); return; }
    const vw = this._chartEl.clientWidth || 800, ax = anchor ?? vw / 2;
    const day = this._dayAt(this._scrollX() + ax);
    this._dw = dw;
    this._p.view = gViewFor(dw);
    this._computeRange();
    this._shiftScroll = 0;
    this._layout();
    this._setScrollX(this._x(day) - ax);
    this._render(true);
    this._syncToolbar();
    this._hideTip();
    if (!silent) this.emit('view-change', { view: this._p.view, dayWidth: dw }, { cancelable: false });
  },
});
