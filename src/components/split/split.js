/* Split panes — resizable panels (WAI-ARIA window splitter pattern).
 *   <o-split direction="horizontal|vertical" sizes="30,70" min="15%" max="80%" collapsible collapsed-size="0"
 *            gutter-size="8" snap="0.5" persist="key" step="2">
 *     <nav data-min="180px" data-collapsible>…</nav>
 *     <main data-size="70" data-max="85%">…</main>
 *   </o-split>
 *   Any number of children; nest <o-split> for grids. Per pane: data-size (%), data-min / data-max (px or %),
 *   data-collapsible ("false" opts out), data-collapsed-size (px, e.g. an icon rail).
 *   Events: o-resize { sizes, dragging } · o-resize-end { sizes } · o-collapse { index } · o-expand { index }
 *   Methods: setSizes([30, 70]) · getSizes() · collapse(i) · expand(i) · toggle(i) · reset()
 */

i18n.add('en', { split: { resize: 'Resize panels', collapse: 'Collapse panel', expand: 'Expand panel', hint: 'Arrow keys resize, Enter collapses' } });

const SKIP_TAGS = new Set(['template', 'script', 'style']);
/** '200px' -> { px: 200 } ; '15%' | '15' -> { pct: 15 } */
function splitUnit(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim(), n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return /px$/i.test(s) ? { px: n } : { pct: n };
}
const unitPx = (u, total, dflt) => (u ? (u.px != null ? u.px : (u.pct / 100) * total) : dflt);
const unitCSS = u => (u ? (u.px != null ? u.px + 'px' : u.pct + '%') : '');

class OSplit extends OElement {
  static props = {
    direction: { type: String, default: 'horizontal', reflect: true },
    sizes: Array, min: String, max: String, collapsible: Boolean, collapsedSize: { type: Number, default: 0 },
    gutterSize: Number, snap: { type: Number, default: 0.5 }, step: { type: Number, default: 2 }, persist: String, texts: Object,
  };
  setup() {
    this.classList.add('o-split');
    this._g = []; this._c = new Set(); this._r = {}; this._gutters = [];
    on(this, 'pointerdown', '.o-split-gutter', (e, g) => { if (g.parentElement === this) this._down(e, g); });
    on(this, 'keydown', '.o-split-gutter', (e, g) => { if (g.parentElement === this) this._key(e, g); });
    on(this, 'dblclick', '.o-split-gutter', (e, g) => { if (g.parentElement === this) this._toggleNear(g.__i); });
  }
  connected() {
    const mo = new MutationObserver(muts => {
      if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !n.classList.contains('o-split-gutter')))) this._sync();
    });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._aria())));
    this._sync();
  }
  update(changed) {
    const vert = this.direction === 'vertical';
    this.classList.toggle('is-vertical', vert);
    this.classList.toggle('is-horizontal', !vert);
    if (this.gutterSize != null) this.style.setProperty('--o-split-gutter', this.gutterSize + 'px');
    if (changed.has('init')) { this._restoreState(); this._sync(); return; }
    if (changed.has('sizes') && this.sizes?.length) this.setSizes(this.sizes.map(Number), { silent: true });
    this._gutters.forEach(g => this._paintGutter(g));
    this._apply();
  }

  /* ── API ── */
  _ready() { if (!this._setupDone && this.isConnected && doc.readyState !== 'loading') this.connectedCallback(); return this._setupDone; }
  get panes() { return [...this.children].filter(c => !c.classList.contains('o-split-gutter') && !SKIP_TAGS.has(c.localName)); }
  /** Current sizes in % of the free space (collapsed panes = 0). */
  getSizes() {
    const sum = this._g.reduce((s, w, i) => s + (this._c.has(i) ? 0 : w), 0) || 1;
    return this._g.map((w, i) => (this._c.has(i) ? 0 : round((w / sum) * 100, 2)));
  }
  setSizes(list, { silent = false } = {}) {
    if (!this._ready()) { this.sizes = list; return; }
    const n = this.panes.length;
    this._g = Array.from({ length: n }, (_, i) => Math.max(0, +list[i] || 0) || (100 / n));
    this._c = new Set();
    this._apply();
    if (!silent) this._emitResize(false, true);
  }
  collapse(i, { silent = false } = {}) {
    if (!this._ready() || this._c.has(i) || i < 0 || i >= this._g.length) return false;
    const nb = this._neighbor(i);
    if (nb < 0) return false;
    this._r[i] = this._g[i] / (this._sumW() || 1);
    this._g[nb] += this._g[i];
    this._c.add(i);
    this._apply(true);
    if (!silent) { this.emit('collapse', { index: i }); this._emitResize(false, true); }
    return true;
  }
  expand(i, { silent = false } = {}) {
    if (!this._ready() || !this._c.has(i)) return false;
    this._c.delete(i);
    this._g[i] = 0;
    const nb = this._neighbor(i), f = clamp(this._r[i] ?? 1 / this._g.length, 0.05, 0.9);
    const want = f * (this._sumW() || 100);
    const take = nb >= 0 ? Math.min(want, this._g[nb] * 0.8) : want;
    if (nb >= 0) this._g[nb] -= take;
    this._g[i] = Math.max(1, take);
    this._apply(true);
    if (!silent) { this.emit('expand', { index: i }); this._emitResize(false, true); }
    return true;
  }
  toggle(i) { return this._c.has(i) ? this.expand(i) : this.collapse(i); }
  isCollapsed(i) { return this._c.has(i); }
  reset() { if (this.persist) ls.del('orion:split:' + this.persist); this._r = {}; this._initWeights(true); this._apply(true); this._emitResize(false, true); }

  /* ── internals ── */
  _vert() { return this.direction === 'vertical'; }
  _sumW() { return this._g.reduce((s, w, k) => s + (this._c.has(k) ? 0 : w), 0); }
  _opt(p, key, host) { const v = p.getAttribute('data-' + key); return v != null ? v : host; }
  _canCollapse(i) { const p = this.panes[i]; if (!p) return false; const v = p.getAttribute('data-collapsible'); return v != null ? v !== 'false' : !!this.collapsible; }
  _collapsedPx(i) { const v = this.panes[i]?.getAttribute('data-collapsed-size'); return v != null ? +v || 0 : this.collapsedSize || 0; }
  _neighbor(i) {
    for (let d = 1; d < this._g.length; d++) {
      if (i + d < this._g.length && !this._c.has(i + d)) return i + d;
      if (i - d >= 0 && !this._c.has(i - d)) return i - d;
    }
    return -1;
  }
  _initWeights(fromAttr) {
    const panes = this.panes, n = panes.length;
    const attr = (this.sizes || []).map(Number);
    this._g = panes.map((p, i) => +p.getAttribute('data-size') || (fromAttr || this._g[i] == null ? attr[i] : this._g[i]) || 0);
    const known = this._g.filter(Boolean), rest = Math.max(0, 100 - known.reduce((a, b) => a + b, 0));
    const missing = this._g.filter(w => !w).length;
    this._g = this._g.map(w => w || (missing ? (rest > 0 ? rest / missing : 100 / n) : w));
    this._c = new Set([...this._c].filter(i => i < n));
  }
  _restoreState() {
    const s = this.persist && ls.get('orion:split:' + this.persist);
    if (s && Array.isArray(s.g)) { this._g = s.g; this._c = new Set(s.c || []); this._r = s.r || {}; this._persisted = true; }
  }
  _save() { if (this.persist) ls.set('orion:split:' + this.persist, { g: this._g.map(w => round(w, 3)), c: [...this._c], r: this._r }); }
  _mkGutter() {
    const g = h('div', { class: 'o-split-gutter', role: 'separator', tabindex: '0' }, h('span', { class: 'o-split-handle', 'aria-hidden': 'true' }));
    this._paintGutter(g);
    return g;
  }
  _paintGutter(g) {
    g.setAttribute('aria-orientation', this._vert() ? 'horizontal' : 'vertical');
    g.setAttribute('aria-label', this.t('split.resize'));
    g.title = this.t('split.hint');
  }
  /** Keep one gutter between consecutive panes (children may be added / removed by frameworks). */
  _sync() {
    if (!this._setupDone) return;
    const panes = this.panes;
    if (!this._inited) {
      if (!(this._persisted && this._g.length === panes.length)) this._initWeights(true);
      this._inited = panes.length > 0;
    } else if (this._g.length !== panes.length) {
      const avg = this._g.reduce((a, b) => a + b, 0) / (this._g.length || 1) || 100 / panes.length;
      this._g = panes.map((p, i) => this._g[i] ?? (+p.getAttribute('data-size') || avg));
      this._c = new Set([...this._c].filter(i => i < panes.length));
    }
    while (this._gutters.length < panes.length - 1) this._gutters.push(this._mkGutter());
    while (this._gutters.length > Math.max(0, panes.length - 1)) this._gutters.pop().remove();
    panes.forEach((p, i) => {
      if (!p.id) p.id = uid('pane');
      const g = this._gutters[i];
      if (!g) return;
      g.__i = i;
      if (p.nextElementSibling !== g) p.after(g);
    });
    this._apply();
  }
  _apply(animate) {
    const panes = this.panes, vert = this._vert();
    if (animate && !reducedMotion()) { this.classList.add('is-animating'); clearTimeout(this._at); this._at = setTimeout(() => this.classList.remove('is-animating'), 260); }
    // border-box bases: (free space) × fraction, so pane padding never skews the ratios
    const gpx = parseFloat(getComputedStyle(this).getPropertyValue('--o-split-gutter')) || 8;
    const fixed = gpx * this._gutters.length + panes.reduce((s, p, i) => s + (this._c.has(i) ? this._collapsedPx(i) : 0), 0);
    const sumW = this._sumW() || 1;
    panes.forEach((p, i) => {
      const col = this._c.has(i), cpx = this._collapsedPx(i);
      const min = splitUnit(this._opt(p, 'min', this.min)), max = splitUnit(this._opt(p, 'max', this.max));
      p.style.flex = col ? `0 0 ${cpx}px` : `1 1 calc((100% - ${round(fixed, 2)}px) * ${round((this._g[i] || 0) / sumW, 5)})`;
      p.style[vert ? 'minHeight' : 'minWidth'] = col ? '0px' : unitCSS(min) || '0px';
      p.style[vert ? 'maxHeight' : 'maxWidth'] = col ? '' : unitCSS(max);
      p.style[vert ? 'minWidth' : 'minHeight'] = ''; p.style[vert ? 'maxWidth' : 'maxHeight'] = '';
      p.toggleAttribute('data-collapsed', col);
      if (col && !cpx) { if (!p.hasAttribute('inert')) { p.setAttribute('inert', ''); p.__splitInert = true; } }
      else if (p.__splitInert) { p.removeAttribute('inert'); p.__splitInert = false; }
    });
    this._aria();
  }
  _aria() {
    const sizes = this.getSizes(), panes = this.panes;
    this._gutters.forEach((g, i) => {
      const p = panes[i]; if (!p) return;
      g.setAttribute('aria-controls', p.id);
      g.setAttribute('aria-valuenow', String(Math.round(sizes[i] || 0)));
      const total = this._total(), min = splitUnit(this._opt(p, 'min', this.min)), max = splitUnit(this._opt(p, 'max', this.max));
      g.setAttribute('aria-valuemin', String(total ? Math.round((unitPx(min, total, 0) / total) * 100) : 0));
      g.setAttribute('aria-valuemax', String(total ? Math.round(Math.min(100, (unitPx(max, total, total) / total) * 100)) : 100));
      const near = this._c.has(i) || this._c.has(i + 1);
      g.classList.toggle('is-collapsed', near);
      g.setAttribute('aria-valuetext', this._c.has(i) ? this.t('split.collapse') : Math.round(sizes[i] || 0) + '%');
    });
  }
  _total() { const r = this.getBoundingClientRect(), gut = this._gutters.reduce((s, g) => s + (this._vert() ? g.offsetHeight : g.offsetWidth), 0); return Math.max(0, (this._vert() ? r.height : r.width) - gut); }
  _measure() { const vert = this._vert(); return this.panes.map(p => { const r = p.getBoundingClientRect(); return vert ? r.height : r.width; }); }
  _limits(i, total) {
    const p = this.panes[i];
    return { min: unitPx(splitUnit(this._opt(p, 'min', this.min)), total, 0), max: unitPx(splitUnit(this._opt(p, 'max', this.max)), total, total), col: this._canCollapse(i), cpx: this._collapsedPx(i) };
  }
  /** Resize panes a / b so that pane a = want px (clamped, with snap-to-collapse). */
  _resizePair(a, b, startA, startB, want) {
    const total = this._total(), pair = startA + startB, la = this._limits(a, total), lb = this._limits(b, total);
    const snap = clamp(this.snap ?? 0.5, 0, 1);
    let A = want, colA = false, colB = false;
    if (la.col && A < Math.max(la.min, 24) * snap + la.cpx) colA = true;
    else if (lb.col && pair - A < Math.max(lb.min, 24) * snap + lb.cpx) colB = true;
    if (colA) A = la.cpx;
    else if (colB) A = pair - lb.cpx;
    else {
      A = clamp(A, la.min, la.max);
      A = pair - clamp(pair - A, lb.min, lb.max);
      A = clamp(A, Math.min(la.min, pair), Math.max(la.min, pair));
    }
    const was = [this._c.has(a), this._c.has(b)], sumW = this._sumW() || 1;
    if (colA) { if (!was[0]) this._r[a] = startA / sumW; this._c.add(a); } else this._c.delete(a);
    if (colB) { if (!was[1]) this._r[b] = startB / sumW; this._c.add(b); } else this._c.delete(b);
    this._g[a] = colA ? 0 : Math.max(1, A);
    this._g[b] = colB ? 0 : Math.max(1, pair - A);
    if (colA !== was[0]) this.emit(colA ? 'collapse' : 'expand', { index: a });
    if (colB !== was[1]) this.emit(colB ? 'collapse' : 'expand', { index: b });
    this._apply();
  }
  _normalize() {
    const px = this._measure();
    this._g = px.map((w, i) => (this._c.has(i) ? 0 : Math.max(1, w)));
    return px;
  }
  _down(e, g) {
    if (e.button !== 0) return;
    e.preventDefault();
    const i = g.__i, vert = this._vert(), rtl = !vert && isRTL(this);
    const px = this._normalize();
    const st = { a: i, b: i + 1, x: vert ? e.clientY : e.clientX, sa: px[i], sb: px[i + 1] };
    try { g.setPointerCapture(e.pointerId); } catch {}
    g.focus({ preventScroll: true });
    this.classList.add('is-dragging'); g.classList.add('is-active');
    const move = rafThrottle(ev => {
      const d = ((vert ? ev.clientY : ev.clientX) - st.x) * (rtl ? -1 : 1);
      this._resizePair(st.a, st.b, st.sa, st.sb, st.sa + d);
      this._emitResize(true);
    });
    const offs = [
      on(g, 'pointermove', ev => { if (ev.pointerId === e.pointerId) move(ev); }),
      on(g, 'pointerup pointercancel lostpointercapture', ev => {
        if (ev.pointerId !== e.pointerId) return;
        offs.forEach(f => f()); move.cancel();
        this.classList.remove('is-dragging'); g.classList.remove('is-active');
        this._emitResize(false, true);
      }),
    ];
  }
  _key(e, g) {
    const i = g.__i, vert = this._vert(), rtl = !vert && isRTL(this);
    const total = this._total() || 1, stepPx = ((e.shiftKey ? 10 : this.step || 2) / 100) * total;
    const inc = vert ? 'ArrowDown' : 'ArrowRight', dec = vert ? 'ArrowUp' : 'ArrowLeft';
    let delta = null;
    if (e.key === inc) delta = rtl ? -stepPx : stepPx;
    else if (e.key === dec) delta = rtl ? stepPx : -stepPx;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggleNear(i); return; }
    const px = delta != null || e.key === 'Home' || e.key === 'End' ? this._normalize() : null;
    if (!px) return;
    e.preventDefault();
    const lim = this._limits(i, total), limB = this._limits(i + 1, total), pair = px[i] + px[i + 1];
    const want = e.key === 'Home' ? Math.max(lim.min, lim.cpx + 1) : e.key === 'End' ? Math.min(lim.max, pair - Math.max(limB.min, limB.cpx + 1))
      : (this._c.has(i) ? lim.cpx : px[i]) + delta;
    this._resizePair(i, i + 1, px[i], px[i + 1], want);
    this._emitResize(false, true);
  }
  /** Enter / double-click: collapse the collapsible pane next to gutter i (the preceding one first), or restore it. */
  _toggleNear(i) {
    const target = this._c.has(i) ? i : this._c.has(i + 1) ? i + 1 : this._canCollapse(i) ? i : this._canCollapse(i + 1) ? i + 1 : -1;
    if (target >= 0) { this.toggle(target); announce(this.t(this._c.has(target) ? 'split.collapse' : 'split.expand')); }
  }
  _emitResize(dragging, end) {
    const sizes = this.getSizes();
    this.emit('resize', { sizes, dragging: !!dragging });
    if (end) { this._save(); this.emit('resize-end', { sizes }); }
  }
}

define('o-split', OSplit);
O.Split = OSplit;
