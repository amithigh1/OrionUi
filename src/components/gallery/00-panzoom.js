/* Gallery package — shared, folder-local helpers.
 * PanZoom: pan / zoom / rotate state + gestures for one content element centred in a viewport
 * (used by Orion.lightbox and <o-zoom>).
 *   const pz = new PanZoom(viewport, content, { min, max, wheel: 'zoom'|'ctrl'|'none', dbl: 2.5, size: () => ({ w, h }),
 *                                               onChange(pz), onDrag(phase, dx, dy, event, [vx, vy]), onTap(e), onWheelHint(), ignore: 'selector' })
 *   pz.zoomAt(z, px, py, animate) · zoomBy(f) · set(z, x, y, animate, r) · reset() · rotate(deg) · toggle(px, py) · key(e) · destroy()
 *   State: z (scale), x / y (content centre offset from the viewport centre, px), r (degrees). min/max may be functions.
 */
const GAL_ICONS = {
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
  'image-off': '<path d="M2 2l20 20M10.4 5H19a2 2 0 0 1 2 2v8.6M21 21H5a2 2 0 0 1-2-2V5M13.5 13.5 11 11l-6 6M17 17l-2-2"/>',
};
O.icons.add(Object.fromEntries(Object.entries(GAL_ICONS).filter(([k]) => !O.icons.has(k))));

const pzEase = t => 1 - (1 - t) ** 3;

class PanZoom {
  constructor(vp, el, o = {}) {
    this.vp = vp; this.el = el;
    this.o = { min: 1, max: 4, wheel: 'zoom', dbl: 2.5, ...o };
    this.z = 1; this.x = 0; this.y = 0; this.r = 0;
    this.p = new Map(); this.g = null;
    this.offs = [
      on(vp, 'pointerdown', e => this._down(e)),
      on(vp, 'pointermove', e => this._move(e)),
      on(vp, 'pointerup pointercancel lostpointercapture', e => this._up(e)),
      on(vp, 'wheel', e => this._wheel(e), { passive: false }),
    ];
  }
  /** [min, max] zoom for a rotation (min / max options may be functions of the rotation). */
  lim(r = this.r) { const mn = isFn(this.o.min) ? this.o.min(r) : this.o.min; return [mn, Math.max(mn, isFn(this.o.max) ? this.o.max(r) : this.o.max)]; }
  get min() { return this.lim()[0]; }
  get max() { return this.lim()[1]; }
  get zoomed() { return this.z > this.min * 1.01; }
  get pannable() { const b = this.bounds(); return b.x > 0.5 || b.y > 0.5; }
  size() { return this.o.size ? this.o.size() : { w: this.el.offsetWidth, h: this.el.offsetHeight }; }
  bounds(z = this.z, r = this.r) {
    const s = this.size(), q = Math.abs(r) % 180 === 90;
    return { x: Math.max(0, ((q ? s.h : s.w) * z - this.vp.clientWidth) / 2), y: Math.max(0, ((q ? s.w : s.h) * z - this.vp.clientHeight) / 2) };
  }
  local(e) { const b = this.vp.getBoundingClientRect(); return [e.clientX - b.left - b.width / 2, e.clientY - b.top - b.height / 2]; }
  apply() {
    this.el.style.transform = `translate(-50%, -50%) translate(${round(this.x, 2)}px, ${round(this.y, 2)}px) rotate(${round(this.r, 2)}deg) scale(${round(this.z, 5)})`;
    this.vp.classList.toggle('is-zoomed', this.zoomed);
    this.vp.classList.toggle('is-pannable', this.pannable);
    this.o.onChange?.(this);
  }
  set(z, x, y, animate, r = this.r) {
    const [mn, mx] = this.lim(r);
    z = clamp(z, mn, mx);
    const b = this.bounds(z, r);
    x = clamp(x, -b.x, b.x); y = clamp(y, -b.y, b.y);
    cancelAnimationFrame(this._raf);
    if (!animate || reducedMotion()) { this.z = z; this.x = x; this.y = y; this.r = r; this.apply(); return; }
    const f = [this.z, this.x, this.y, this.r], t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / 240), e = pzEase(k);
      this.z = f[0] + (z - f[0]) * e; this.x = f[1] + (x - f[1]) * e; this.y = f[2] + (y - f[2]) * e; this.r = f[3] + (r - f[3]) * e;
      this.apply();
      if (k < 1) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  zoomAt(z, px = 0, py = 0, animate = false) { z = clamp(z, this.min, this.max); const f = z / this.z; this.set(z, px - (px - this.x) * f, py - (py - this.y) * f, animate); }
  zoomBy(f, px = 0, py = 0, animate = true) { this.zoomAt(this.z * f, px, py, animate); }
  reset(animate = true) { this.set(this.min, 0, 0, animate); }
  rotate(deg, animate = true) { const r = this.r + deg; this.set(this.lim(r)[0], 0, 0, animate, r); }
  toggle(px = 0, py = 0) { if (this.zoomed) this.reset(); else this.zoomAt(Math.min(this.max, this.min * this.o.dbl), px, py, true); }
  /** Keyboard: + / - / 0 and arrow panning while zoomed. Returns true when handled. */
  key(e) {
    const k = e.key;
    if (k === '+' || k === '=') this.zoomBy(1.4);
    else if (k === '-' || k === '_') this.zoomBy(1 / 1.4);
    else if (k === '0') this.reset();
    else if (this.pannable && /^Arrow/.test(k)) {
      const d = e.shiftKey ? 200 : 60;
      this.set(this.z, this.x + (k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0), this.y + (k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0), true);
    } else return false;
    e.preventDefault();
    return true;
  }
  destroy() { this.offs.forEach(f => f()); cancelAnimationFrame(this._raf); clearTimeout(this._tapT); }

  /* ── gestures ── */
  _down(e) {
    if (e.button > 0 || (this.o.ignore && e.target.closest(this.o.ignore))) return;
    this.p.set(e.pointerId, [e.clientX, e.clientY]);
    try { this.vp.setPointerCapture(e.pointerId); } catch {}
    cancelAnimationFrame(this._raf);
    if (e.pointerType === 'mouse') e.preventDefault();
    if (this.p.size === 2) {
      if (this.g?.mode === 'free') this.o.onDrag?.('cancel', 0, 0, e);
      const [a, b] = [...this.p.values()];
      this.g = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, c0: this._mid(a, b), z0: this.z, x0: this.x, y0: this.y };
    } else if (this.p.size === 1) this.g = { mode: null, sx: e.clientX, sy: e.clientY, x0: this.x, y0: this.y, v: [] };
  }
  _mid(a, b) { const r = this.vp.getBoundingClientRect(); return [(a[0] + b[0]) / 2 - r.left - r.width / 2, (a[1] + b[1]) / 2 - r.top - r.height / 2]; }
  _move(e) {
    if (!this.p.has(e.pointerId)) return;
    this.p.set(e.pointerId, [e.clientX, e.clientY]);
    const g = this.g;
    if (!g) return;
    if (g.mode === 'pinch') {
      if (this.p.size < 2) return;
      const [a, b] = [...this.p.values()], c = this._mid(a, b);
      const z = clamp(g.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / g.d0, this.min * 0.75, this.max * 1.25), f = z / g.z0;
      this.z = z; this.x = c[0] - (g.c0[0] - g.x0) * f; this.y = c[1] - (g.c0[1] - g.y0) * f;
      this.apply();
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 6) return;
      g.mode = this.pannable || !this.o.onDrag ? 'pan' : 'free';
      if (g.mode === 'free') this.o.onDrag('start', 0, 0, e);
      this.vp.classList.add('is-grabbing');
    }
    g.v.push([e.clientX, e.clientY, e.timeStamp]); if (g.v.length > 5) g.v.shift();
    if (g.mode === 'free') { this.o.onDrag('move', dx, dy, e); return; }
    const b = this.bounds(), rb = (v, m) => (v > m ? m + (v - m) * 0.3 : v < -m ? -m + (v + m) * 0.3 : v);
    this.x = rb(g.x0 + dx, b.x); this.y = rb(g.y0 + dy, b.y);
    this.apply();
  }
  _up(e) {
    if (!this.p.has(e.pointerId)) return;
    this.p.delete(e.pointerId);
    const g = this.g;
    if (!g) return;
    if (g.mode === 'pinch') {
      if (this.p.size === 1) { const [q] = [...this.p.values()]; this.g = { mode: 'pan', sx: q[0], sy: q[1], x0: this.x, y0: this.y, v: [] }; }
      else { this.g = null; this.set(this.z, this.x, this.y, true); }
      return;
    }
    if (this.p.size) return;
    this.g = null;
    this.vp.classList.remove('is-grabbing');
    const a = g.v[0], b = g.v[g.v.length - 1], dt = a && b ? b[2] - a[2] : 0;
    const v = dt > 0 ? [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt] : [0, 0];
    if (g.mode === 'free') { this.o.onDrag('end', e.clientX - g.sx, e.clientY - g.sy, e, v); return; }
    if (g.mode === 'pan') { this.set(this.z, this.x + v[0] * 160, this.y + v[1] * 160, true); return; }
    if (e.type !== 'pointerup') return;
    const now = performance.now(), pt = this.local(e), last = this._tap;
    if (last && now - last.t < 320 && Math.hypot(pt[0] - last.p[0], pt[1] - last.p[1]) < 30) {
      clearTimeout(this._tapT); this._tap = null;
      if (this.o.dbl) this.toggle(pt[0], pt[1]);
    } else {
      this._tap = { t: now, p: pt };
      if (this.o.onTap) { clearTimeout(this._tapT); this._tapT = setTimeout(() => this.o.onTap(e), this.o.dbl ? 280 : 0); }
    }
  }
  _wheel(e) {
    const mode = this.o.wheel;
    if (!mode || mode === 'none') return;
    if (mode === 'ctrl' && !e.ctrlKey && !e.metaKey) { this.o.onWheelHint?.(); return; }
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const [px, py] = this.local(e);
    this.zoomAt(this.z * Math.exp(-clamp(dy, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022)), px, py);
  }
}
