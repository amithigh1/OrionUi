/* ============================================================================
 * Shared kit (also used by orgchart + graph through `// @deps diagram`):
 *   DgViewport      pan / zoom / pinch / wheel / fit with optional animation
 *   dgExportSVG()   standalone SVG with computed styles inlined
 *   dgSvgToPNG()    rasterise an SVG string to a PNG Blob
 *   dgWrap()        canvas based text measurement + word wrap (cached)
 * Published as Orion.diagram.{ Viewport, exportSVG, svgToPNG, wrapText, ... }.
 * ========================================================================== */

class DgViewport {
  /** new DgViewport(hostEl, { apply(x, y, k), onChange(vp), min, max }) — screen = world * k + (x, y) */
  constructor(host, opts = {}) {
    this.host = host;
    this.o = { min: 0.1, max: 4, apply: noop, onChange: noop, ...opts };
    this.x = 0; this.y = 0; this.k = 1;
    this._anim = 0; this._pts = new Map(); this.pinching = false; this._lock = false;
  }
  get size() { return { w: this.host.clientWidth, h: this.host.clientHeight }; }
  /** Visible world rectangle. */
  get world() { const { w, h } = this.size; return { x: -this.x / this.k, y: -this.y / this.k, w: w / this.k, h: h / this.k }; }
  set(x, y, k, { animate = false, duration = 260 } = {}) {
    k = clamp(k, this.o.min, this.o.max);
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
    if (!animate || reducedMotion() || !isBrowser) { this.x = x; this.y = y; this.k = k; this._emit(); return Promise.resolve(); }
    const x0 = this.x, y0 = this.y, k0 = this.k, t0 = performance.now();
    return new Promise(res => {
      const step = now => {
        const p = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - p, 3);
        this.x = x0 + (x - x0) * e; this.y = y0 + (y - y0) * e; this.k = k0 + (k - k0) * e;
        this._emit();
        if (p < 1) this._anim = requestAnimationFrame(step); else { this._anim = 0; res(); }
      };
      this._anim = requestAnimationFrame(step);
    });
  }
  stop() { if (this._anim) cancelAnimationFrame(this._anim); this._anim = 0; }
  _emit() { this.o.apply(this.x, this.y, this.k); this.o.onChange(this); }
  panBy(dx, dy) { return this.set(this.x + dx, this.y + dy, this.k); }
  /** Zoom to k keeping the host-relative point (sx, sy) fixed. */
  zoomAt(k, sx, sy, opts) {
    k = clamp(k, this.o.min, this.o.max);
    const wx = (sx - this.x) / this.k, wy = (sy - this.y) / this.k;
    return this.set(sx - wx * k, sy - wy * k, k, opts);
  }
  zoomBy(f, opts) { const { w, h } = this.size; return this.zoomAt(this.k * f, w / 2, h / 2, opts); }
  zoomTo(k, opts) { const { w, h } = this.size; return this.zoomAt(k, w / 2, h / 2, opts); }
  /** Client (viewport) coordinates -> world. */
  toWorld(cx, cy) { const r = this.host.getBoundingClientRect(); return { x: (cx - r.left - this.x) / this.k, y: (cy - r.top - this.y) / this.k }; }
  /** World -> host-relative screen coordinates. */
  toLocal(wx, wy) { return { x: wx * this.k + this.x, y: wy * this.k + this.y }; }
  /** Fit a world rectangle {x, y, w, h} into the host. */
  fit(b, { padding = 32, max = 1, min, animate = false } = {}) {
    const { w, h } = this.size;
    if (!b || !w || !h) return Promise.resolve();
    let k = Math.min((w - padding * 2) / Math.max(1, b.w), (h - padding * 2) / Math.max(1, b.h), max);
    if (min != null) k = Math.max(k, min);
    k = clamp(k, this.o.min, this.o.max);
    return this.set(w / 2 - (b.x + b.w / 2) * k, h / 2 - (b.y + b.h / 2) * k, k, { animate });
  }
  center(wx, wy, k = this.k, opts) { const { w, h } = this.size; return this.set(w / 2 - wx * k, h / 2 - wy * k, k, opts); }
  /** Pan the minimum amount so the world rect is visible (with padding in px). */
  ensureVisible(b, pad = 32, opts) {
    const { w, h } = this.size, k = this.k;
    const l = b.x * k + this.x, t = b.y * k + this.y, r = l + b.w * k, bt = t + b.h * k;
    let dx = 0, dy = 0;
    if (b.w * k > w - pad * 2) dx = w / 2 - (l + r) / 2; else if (l < pad) dx = pad - l; else if (r > w - pad) dx = w - pad - r;
    if (b.h * k > h - pad * 2) dy = h / 2 - (t + bt) / 2; else if (t < pad) dy = pad - t; else if (bt > h - pad) dy = h - pad - bt;
    if (dx || dy) return this.set(this.x + dx, this.y + dy, k, opts);
    return Promise.resolve();
  }
  /** Wheel handler: mode 'zoom' (wheel zooms) or 'pan' (wheel pans, Ctrl+wheel zooms). Trackpad pinch = ctrl+wheel. */
  wheel(e, mode = 'zoom') {
    e.preventDefault();
    const r = this.host.getBoundingClientRect();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= r.width; dy *= r.height; }
    if (mode === 'pan' && !e.ctrlKey && !e.metaKey) { if (e.shiftKey && !dx) { dx = dy; dy = 0; } this.panBy(-dx, -dy); return; }
    this.zoomAt(this.k * Math.exp(-clamp(dy, -120, 120) * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
  }
  /* Pinch tracking: feed every pointer event; returns true while a two-finger gesture owns the pointers. */
  pointerDown(e) {
    this._pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pts.size === 2) { this._pinchStart(); return true; }
    return this.pinching || this._lock;
  }
  pointerMove(e) {
    const p = this._pts.get(e.pointerId);
    if (!p) return false;
    p.x = e.clientX; p.y = e.clientY;
    if (!this.pinching || this._pts.size < 2) return this.pinching || this._lock;
    const [a, b] = [...this._pts.values()], z = this._pz, r = this.host.getBoundingClientRect();
    const k = clamp(z.k * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / z.d, this.o.min, this.o.max);
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    this.set(mx - z.wx * k, my - z.wy * k, k);
    return true;
  }
  pointerUp(e) {
    this._pts.delete(e.pointerId);
    const was = this.pinching || this._lock;
    if (this.pinching && this._pts.size < 2) { this.pinching = false; this._lock = this._pts.size > 0; }
    if (!this._pts.size) this._lock = false;
    return was;
  }
  _pinchStart() {
    const [a, b] = [...this._pts.values()], r = this.host.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    this.pinching = true; this.stop();
    this._pz = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: this.k, wx: (mx - this.x) / this.k, wy: (my - this.y) / this.k };
  }
  /**
   * attach({ canPan(e) -> bool, wheel: 'zoom'|'pan'|fn }) -> detach()
   * Generic wiring: wheel zoom, pinch, drag-to-pan where canPan() allows. Clicks after a pan are swallowed.
   */
  attach({ canPan = () => true, wheel = 'zoom' } = {}) {
    const host = this.host;
    let pan = null, swallow = false;
    const offs = [
      on(host, 'wheel', e => this.wheel(e, isFn(wheel) ? wheel() : wheel), { passive: false }),
      on(host, 'pointerdown', e => {
        if (this.pointerDown(e)) { pan = null; host.classList.remove('is-panning'); return; }
        if ((e.button !== 0 && e.button !== 1) || !canPan(e)) return;
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        if (e.button === 1) e.preventDefault();
      }),
      on(host, 'pointermove', e => {
        if (this.pointerMove(e)) return;
        if (!pan || pan.id !== e.pointerId) return;
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (!pan.moved) {
          if (Math.hypot(dx, dy) < 4) return;
          pan.moved = true; host.classList.add('is-panning');
          try { host.setPointerCapture(e.pointerId); } catch {}
        }
        pan.x = e.clientX; pan.y = e.clientY;
        this.panBy(dx, dy);
      }),
      on(host, 'pointerup pointercancel lostpointercapture', e => {
        this.pointerUp(e);
        if (pan && pan.id === e.pointerId) { if (pan.moved) swallow = true; pan = null; host.classList.remove('is-panning'); setTimeout(() => { swallow = false; }, 0); }
      }),
      on(host, 'click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, { capture: true }),
    ];
    return () => offs.forEach(f => f());
  }
}

/* ── text measurement & wrapping ─────────────────────────────────────── */
let __dgCtx = null;
const __dgWrapCache = new Map();
/** Width of `text` in px for a CSS font shorthand. */
function dgTextWidth(text, font) {
  if (!isBrowser) return String(text).length * 7;
  if (!__dgCtx) __dgCtx = doc.createElement('canvas').getContext('2d');
  __dgCtx.font = font;
  return __dgCtx.measureText(text).width;
}
/** Word-wrap text into lines that fit maxW (explicit \n kept, long words broken). maxLines > 0 adds an ellipsis. */
function dgWrap(text, maxW, font, maxLines = 0) {
  const key = font + '|' + Math.round(maxW) + '|' + maxLines + '|' + text;
  const hit = __dgWrapCache.get(key);
  if (hit) return hit;
  const lines = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (let w of words) {
      const test = line ? line + ' ' + w : w;
      if (dgTextWidth(test, font) <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      while (dgTextWidth(w, font) > maxW && w.length > 1) { // break very long words
        let i = w.length - 1;
        while (i > 1 && dgTextWidth(w.slice(0, i), font) > maxW) i--;
        lines.push(w.slice(0, i)); w = w.slice(i);
      }
      line = w;
    }
    lines.push(line);
  }
  let out = lines;
  if (maxLines > 0 && lines.length > maxLines) {
    out = lines.slice(0, maxLines);
    let last = out[maxLines - 1] + '…';
    while (last.length > 1 && dgTextWidth(last, font) > maxW) last = last.slice(0, -2) + '…';
    out[maxLines - 1] = last;
  }
  if (__dgWrapCache.size > 4000) __dgWrapCache.clear();
  __dgWrapCache.set(key, out);
  return out;
}

/* ── export ──────────────────────────────────────────────────────────── */
const DG_PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'paint-order'];
const DG_TEXT = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing'];
/** Resolve any CSS color expression (tokens, color-mix) to rgb() using a probe inside `scope`. */
function dgResolveColor(scope, value) {
  if (!isBrowser || !value) return value;
  const p = doc.createElement('span');
  p.style.cssText = 'position:absolute;visibility:hidden;color:' + value;
  (scope || doc.body).appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c || value;
}
/** Copy computed paint / text styles from a live SVG subtree onto its clone. Hidden nodes are dropped. */
function dgInlineStyles(src, dst) {
  const cs = getComputedStyle(src);
  if (cs.display === 'none' || cs.visibility === 'hidden') { dst.remove(); return; }
  const tag = src.localName, text = tag === 'text' || tag === 'tspan';
  let s = '';
  for (const p of DG_PAINT) { const v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; }
  if (text || tag === 'g') for (const p of DG_TEXT) { const v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; }
  if (tag !== 'foreignObject') dst.setAttribute('style', s);
  ['tabindex', 'role', 'aria-selected', 'aria-label', 'focusable'].forEach(a => dst.removeAttribute(a));
  const a = src.children, b = [...dst.children];
  for (let i = 0; i < a.length; i++) if (b[i] && tag !== 'foreignObject') dgInlineStyles(a[i], b[i]);
}
/**
 * dgExportSVG(layers, bounds, { padding, background, foreign: 'keep'|'text', title }) -> SVG markup string.
 * `layers`: live SVG elements (without viewport transform) cloned into a standalone document.
 */
function dgExportSVG(layers, bounds, opts = {}) {
  const pad = opts.padding ?? 24;
  const w = Math.ceil(bounds.w + pad * 2), hh = Math.ceil(bounds.h + pad * 2), x0 = Math.floor(bounds.x - pad), y0 = Math.floor(bounds.y - pad);
  const root = svg('svg', { xmlns: 'http://www.w3.org/2000/svg', width: w, height: hh, viewBox: `${x0} ${y0} ${w} ${hh}` });
  if (opts.title) root.append(svg('title', { text: opts.title }));
  if (opts.background) root.append(svg('rect', { x: x0, y: y0, width: w, height: hh, fill: opts.background }));
  for (const layer of toArr(layers)) {
    if (!layer) continue;
    const c = layer.cloneNode(true);
    dgInlineStyles(layer, c);
    root.append(c);
  }
  if (opts.foreign === 'text') {
    root.querySelectorAll('foreignObject').forEach(fo => {
      const t = svg('text', { x: +fo.getAttribute('x') + 8, y: +fo.getAttribute('y') + 18, style: 'font:13px sans-serif;fill:#475569' }, (fo.textContent || '').trim().slice(0, 60));
      fo.replaceWith(t);
    });
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
}
/** Rasterise SVG markup: dgSvgToPNG(svgString, { scale = 2, maxSide = 8192 }) -> Promise<Blob> */
async function dgSvgToPNG(markup, { scale = 2, maxSide = 8192 } = {}) {
  const m = markup.match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
  const w = m ? +m[1] : 800, hh = m ? +m[2] : 600;
  const s = Math.min(scale, maxSide / Math.max(w, hh));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = doc.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(hh * s));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
/** Bounds of rect-like items [{x, y, width, height}] -> {x, y, w, h} | null */
function dgBounds(items) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of items) {
    const w = n.width ?? n.w ?? 0, hh = n.height ?? n.h ?? 0;
    if (n.x < x1) x1 = n.x; if (n.y < y1) y1 = n.y;
    if (n.x + w > x2) x2 = n.x + w; if (n.y + hh > y2) y2 = n.y + hh;
  }
  return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

O.diagram = Object.assign(O.diagram || {}, {
  Viewport: DgViewport, exportSVG: dgExportSVG, svgToPNG: dgSvgToPNG, wrapText: dgWrap, textWidth: dgTextWidth,
  resolveColor: dgResolveColor, bounds: dgBounds, icon: dgIcon, presets: DG_PRESETS,
});
