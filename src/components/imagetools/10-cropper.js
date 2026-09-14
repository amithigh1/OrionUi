/* <o-cropper> — image cropper: movable / resizable crop box (8 handles), pan, zoom (wheel, pinch, slider), rotate 90° and
 * free angle, flip, circle crop, live preview and export. The image always covers the crop area.
 *   <o-cropper src="photo.jpg" aspect="free|1|4/3|16:9" min-width="200" min-height="200" output-type="image/webp" quality="0.9"
 *              round guides preview="#avatar-preview" toolbar></o-cropper>          (src may also be a File / Blob property)
 * Methods: load(src), reset(), rotate(deg), rotateTo(deg), zoom(factor), zoomTo(scale), flip('h'|'v'), setAspect(a),
 *          getCanvas({ width, height, maxWidth, maxHeight, fill }), toBlob(type, quality, opts), toDataURL(type, quality, opts),
 *          getData() -> { x, y, width, height, rotate, scaleX, scaleY } (image pixels), setData(data)
 * Events: o-ready { width, height }, o-crop (getData()), o-error { error }
 * Keyboard (crop area focused): arrows move (Ctrl = 10px), Shift + arrows resize, + / − zoom, R / Shift+R rotate, 0 reset.
 */
const CROP_ICONS = {
  'flip-horizontal': '<path d="M12 3v18M16 7l4 5-4 5zM8 7l-4 5 4 5z"/>',
  'flip-vertical': '<path d="M3 12h18M7 8l5-4 5 4zM7 16l5 4 5-4z"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>',
};
O.icons.add(Object.fromEntries(Object.entries(CROP_ICONS).filter(([k]) => !O.icons.has(k))));
const cropAspect = v => {
  if (v == null || v === '' || v === 'free' || v === false || v === 0) return 0;
  if (isNum(v)) return v > 0 ? v : 0;
  const m = String(v).match(/^\s*([\d.]+)\s*[/:x]\s*([\d.]+)\s*$/);
  return m ? +m[1] / +m[2] : parseFloat(v) || 0;
};

class OCropper extends OElement {
  static props = {
    src: Any, aspect: { type: Any, default: 'free' }, minWidth: { type: Number, default: 0 }, minHeight: { type: Number, default: 0 },
    outputType: String, quality: { type: Number, default: 0.92 }, round: Boolean, guides: { type: Boolean, default: true },
    toolbar: { type: Boolean, default: true }, preview: Any, maxZoom: { type: Number, default: 8 }, coverage: { type: Number, default: 0.86 },
    label: String, texts: Object,
  };
  get ready() { return !!this._ok; }

  setup() {
    this.classList.add('o-cropper');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    const hid = uid('crop-hint');
    this._stage = h('div', { class: 'o-cropper-stage' });
    this._box = h('div', { class: 'o-cropper-box', tabindex: '0', role: 'application', 'aria-describedby': hid },
      h('span', { class: 'o-cropper-grid', 'aria-hidden': 'true' }),
      ...['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(d => h('span', { class: 'o-cropper-handle', 'data-h': d, 'aria-hidden': 'true' })));
    this._sizeEl = h('div', { class: 'o-cropper-size', 'aria-hidden': 'true' });
    this._status = h('div', { class: 'o-cropper-status' }, h('span', { class: 'o-spinner' }));
    this._stage.append(this._box, this._sizeEl, this._status);
    this._hint = h('span', { id: hid, class: 'o-sr-only' });
    const tb = (name, fn) => h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', onClick: fn }, icon(name));
    this._bZOut = tb('zoom-out', () => this.zoom(1 / 1.25));
    this._bZIn = tb('zoom-in', () => this.zoom(1.25));
    this._zr = h('input', { type: 'range', class: 'o-range', min: 0, max: 100, step: 0.5, value: 0 });
    this._bRL = tb('rotate-ccw', () => this.rotate(-90));
    this._bRR = tb('rotate-cw', () => this.rotate(90));
    this._ar = h('input', { type: 'range', class: 'o-range o-cropper-angle', min: -45, max: 45, step: 1, value: 0 });
    this._arVal = h('output', { class: 'o-cropper-angle-val' }, '0°');
    this._bFH = tb('flip-horizontal', () => this.flip('h'));
    this._bFV = tb('flip-vertical', () => this.flip('v'));
    this._bReset = tb('refresh', () => this.reset());
    this._bar = h('div', { class: 'o-cropper-toolbar' },
      h('div', { class: 'o-cropper-group' }, this._bZOut, this._zr, this._bZIn),
      h('div', { class: 'o-cropper-group' }, this._bRL, this._ar, this._arVal, this._bRR),
      h('div', { class: 'o-cropper-group' }, this._bFH, this._bFV, this._bReset));
    this.append(this._stage, this._bar, this._hint);
    on(this._zr, 'input', () => { const [a, b] = this._zRange(); this._zoomAt(a * (b / a) ** (this._zr.value / 100)); });
    on(this._ar, 'input', () => this.rotateTo(this._q * 90 + +this._ar.value, false));
    on(this._stage, 'pointerdown', e => this._down(e));
    on(this._stage, 'pointermove', e => this._move(e));
    on(this._stage, 'pointerup pointercancel lostpointercapture', e => this._up(e));
    on(this._stage, 'wheel', e => this._wheel(e), { passive: false });
    on(this._stage, 'dragstart', e => e.preventDefault());
    on(this._box, 'keydown', e => this._key(e));
    this._ptr = new Map();
    this._emitCrop = rafThrottle(() => { if (this._ok) { this.emit('crop', this.getData()); this._drawPreviews(); } });
  }
  connected() {
    this.addCleanup(observeResize(this._stage, rafThrottle(() => this._resized())));
  }
  disconnected() { this._emitCrop.cancel(); }
  update(changed) {
    if (changed.has('src')) { if (this.src) this.load(this.src); else this._clear(); }
    if ((changed.has('aspect') || changed.has('minWidth') || changed.has('minHeight')) && this._ok && !changed.has('src')) this._applyAspect();
    this.classList.toggle('is-round', !!this.round);
    this.classList.toggle('has-guides', !!this.guides);
    this._bar.hidden = !this.toolbar;
    if (this.label) this.setAttribute('aria-label', this.label); else this.setAttribute('aria-label', this.t('cropper.label'));
    this._box.setAttribute('aria-roledescription', this.t('cropper.areaType'));
    this._hint.textContent = this.t('cropper.hint');
    const lbl = (el, k) => { el.setAttribute('aria-label', this.t(k)); el.title = this.t(k); };
    lbl(this._bZOut, 'cropper.zoomOut'); lbl(this._bZIn, 'cropper.zoomIn'); lbl(this._zr, 'cropper.zoom');
    lbl(this._bRL, 'cropper.rotateLeft'); lbl(this._bRR, 'cropper.rotateRight'); lbl(this._ar, 'cropper.angle');
    lbl(this._bFH, 'cropper.flipH'); lbl(this._bFV, 'cropper.flipV'); lbl(this._bReset, 'cropper.reset');
    if (this._ok) this._paint();
  }

  /* ── loading ── */
  async load(src) {
    const tok = (this._tok = (this._tok || 0) + 1);
    this._ok = false;
    this.classList.add('is-loading'); this.classList.remove('is-error', 'is-ready');
    this._status.replaceChildren(h('span', { class: 'o-spinner', role: 'status', 'aria-label': this.t('cropper.loading') }));
    try {
      const img = await imgLoad(src);
      if (tok !== this._tok) return;
      this._src?.remove?.();
      this._src = img;
      img.classList.add('o-cropper-img');
      img.setAttribute('alt', ''); img.setAttribute('draggable', 'false');
      const { w, h: hh } = imgSize(img);
      this._iw = w; this._ih = hh;
      css(img, { width: w + 'px', height: hh + 'px' });
      this._stage.prepend(img);
      this._ok = true;
      this.classList.remove('is-loading'); this.classList.add('is-ready');
      this.reset();
      this.emit('ready', { width: w, height: hh });
    } catch (error) {
      if (tok !== this._tok) return;
      this.classList.remove('is-loading'); this.classList.add('is-error');
      this._status.replaceChildren(h('div', { class: 'o-cropper-error' }, icon('alert-circle'), h('span', {}, this.t('cropper.error'))));
      this.emit('error', { error });
    }
  }
  _clear() { this._tok = (this._tok || 0) + 1; this._ok = false; this._src?.remove?.(); this._src = null; this.classList.remove('is-ready', 'is-loading', 'is-error'); }

  /* ── state helpers ── */
  get _A() { return cropAspect(this.aspect); }
  _zRange() {
    const b = this._b, s = this._s, a = (s.r * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    const zmin = Math.max((c * b.w + sn * b.h) / this._iw, (sn * b.w + c * b.h) / this._ih);
    return [zmin, Math.max(zmin, this._zfit * this.maxZoom)];
  }
  _local(px, py, s = this._s) {
    const a = (s.r * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), ex = px - s.cx, ey = py - s.cy;
    return [(ex * c + ey * sn) / s.z, (-ex * sn + ey * c) / s.z];
  }
  _covers(b, s = this._s) {
    const hx = this._iw / 2 + 0.5 / s.z, hy = this._ih / 2 + 0.5 / s.z;
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([x, y]) => { const [lx, ly] = this._local(x, y, s); return Math.abs(lx) <= hx && Math.abs(ly) <= hy; });
  }
  /** Limits of the box centre offset from the image centre, in local image units. */
  _lim(b, s = this._s) {
    const a = (s.r * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    return [Math.max(0, this._iw / 2 - (c * b.w + sn * b.h) / 2 / s.z), Math.max(0, this._ih / 2 - (sn * b.w + c * b.h) / 2 / s.z)];
  }
  _toStage(lx, ly, s = this._s) { const a = (s.r * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return [(lx * c - ly * sn) * s.z, (lx * sn + ly * c) * s.z]; }
  /** Keep the image covering the box (zoom in if needed, then shift the image). */
  _clampImage() {
    const s = this._s, b = this._b, [zmin, zmax] = this._zRange();
    s.z = clamp(s.z, zmin, zmax);
    const [lx, ly] = this._local(b.x + b.w / 2, b.y + b.h / 2), [mx, my] = this._lim(b);
    const [ex, ey] = this._toStage(clamp(lx, -mx, mx), clamp(ly, -my, my));
    s.cx = b.x + b.w / 2 - ex; s.cy = b.y + b.h / 2 - ey;
  }
  /** Keep the box inside the stage and over the image (moving it, not resizing). */
  _clampBox(b) {
    for (let k = 0; k < 3; k++) {
      b.x = clamp(b.x, 0, Math.max(0, this._W - b.w)); b.y = clamp(b.y, 0, Math.max(0, this._H - b.h));
      const [lx, ly] = this._local(b.x + b.w / 2, b.y + b.h / 2), [mx, my] = this._lim(b), [ex, ey] = this._toStage(clamp(lx, -mx, mx), clamp(ly, -my, my));
      b.x = this._s.cx + ex - b.w / 2; b.y = this._s.cy + ey - b.h / 2;
    }
    return b;
  }
  _mins() { const z = this._s.z; return [Math.max(12, this.minWidth * z), Math.max(12, this.minHeight * z)]; }
  _valid(b) {
    const [mw, mh] = this._mins();
    return b.w >= mw - 0.5 && b.h >= mh - 0.5 && b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= this._W + 0.5 && b.y + b.h <= this._H + 0.5 && this._covers(b);
  }

  /* ── public API ── */
  reset() {
    if (!this._ok) return;
    this._W = this._stage.clientWidth; this._H = this._stage.clientHeight;
    const pad = Math.min(24, this._W * 0.05);
    this._zfit = Math.min((this._W - 2 * pad) / this._iw, (this._H - 2 * pad) / this._ih);
    this._s = { cx: this._W / 2, cy: this._H / 2, z: this._zfit, r: 0, fx: 1, fy: 1 };
    this._q = 0; this._ar.value = 0;
    const A = this._A, dw = this._iw * this._zfit, dh = this._ih * this._zfit, k = clamp(this.coverage, 0.1, 1);
    let bw = dw * k, bh = dh * k;
    if (A) { bw = Math.min(dw, dh * A) * k; bh = bw / A; }
    this._b = { x: (this._W - bw) / 2, y: (this._H - bh) / 2, w: bw, h: bh };
    this._clampImage();
    this._paint();
  }
  setAspect(a) { this.aspect = a; }
  zoom(f) { if (this._ok) this._zoomAt(this._s.z * f); }
  /** zoomTo(scale) — scale = screen pixels per image pixel */
  zoomTo(z) { if (this._ok) this._zoomAt(z); }
  rotate(deg) { if (this._ok) { if (Math.abs(deg) % 90 === 0) this._q += deg / 90; this.rotateTo(Math.abs(deg) % 90 === 0 ? this._q * 90 + +this._ar.value : this._s.r + deg); } }
  rotateTo(deg) {
    if (!this._ok) return;
    const s = this._s, b = this._b, bx = b.x + b.w / 2, by = b.y + b.h / 2, d = ((deg - s.r) * Math.PI) / 180, c = Math.cos(d), sn = Math.sin(d);
    const ox = s.cx - bx, oy = s.cy - by;
    s.cx = bx + ox * c - oy * sn; s.cy = by + ox * sn + oy * c; s.r = deg;
    this._q = Math.round((deg - +this._ar.value) / 90);
    this._clampImage(); this._paint();
  }
  flip(axis = 'h') {
    if (!this._ok) return;
    const s = this._s, q = Math.abs(Math.round(s.r / 90)) % 2 === 1;
    if ((axis === 'h') !== q) s.fx *= -1; else s.fy *= -1;
    this._paint();
  }
  getData() {
    if (!this._ok) return null;
    const s = this._s, b = this._b, a = (s.r * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    const rw = c * this._iw + sn * this._ih, rh = sn * this._iw + c * this._ih, ex = (b.x + b.w / 2 - s.cx) / s.z, ey = (b.y + b.h / 2 - s.cy) / s.z;
    return { x: round(rw / 2 + ex - b.w / s.z / 2, 2), y: round(rh / 2 + ey - b.h / s.z / 2, 2), width: round(b.w / s.z, 2), height: round(b.h / s.z, 2), rotate: round(s.r, 2), scaleX: s.fx, scaleY: s.fy };
  }
  setData(d = {}) {
    if (!this._ok) return;
    if (d.rotate != null && d.rotate !== this._s.r) this.rotateTo(d.rotate);
    if (d.scaleX) this._s.fx = Math.sign(d.scaleX); if (d.scaleY) this._s.fy = Math.sign(d.scaleY);
    const s = this._s, a = (s.r * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    const rw = c * this._iw + sn * this._ih, rh = sn * this._iw + c * this._ih, w = d.width ?? this._b.w / s.z, hh = d.height ?? this._b.h / s.z;
    const k = Math.min(1, (this._W * 0.9) / (w * s.z), (this._H * 0.9) / (hh * s.z));
    s.z *= k;
    const b = { w: w * s.z, h: hh * s.z };
    const ex = ((d.x ?? 0) + w / 2 - rw / 2) * s.z, ey = ((d.y ?? 0) + hh / 2 - rh / 2) * s.z;
    b.x = (this._W - b.w) / 2; b.y = (this._H - b.h) / 2;
    s.cx = b.x + b.w / 2 - ex; s.cy = b.y + b.h / 2 - ey;
    this._b = b; this._clampImage(); this._paint();
  }
  /** getCanvas({ width, height, maxWidth, maxHeight, fill, round }) — crop at the image's native resolution by default. */
  getCanvas(o = {}) {
    if (!this._ok) return null;
    const b = this._b, z = this._s.z;
    let w = o.width || (o.height ? (o.height * b.w) / b.h : b.w / z), hh = o.height || (o.width ? (o.width * b.h) / b.w : b.h / z);
    const k = Math.min(1, (o.maxWidth || Infinity) / w, (o.maxHeight || Infinity) / hh);
    w = Math.max(1, Math.round(w * k)); hh = Math.max(1, Math.round(hh * k));
    const c = imgCanvas(w, hh);
    this._drawTo(c.getContext('2d'), w, hh, o.fill, o.round ?? this.round);
    return c;
  }
  toBlob(type, quality, opts = {}) {
    type = type || this.outputType || (this.round ? 'image/png' : 'image/jpeg');
    const c = this.getCanvas({ fill: type === 'image/jpeg' ? '#fff' : null, ...opts });
    return c ? imgToBlob(c, type, quality ?? this.quality) : Promise.resolve(null);
  }
  toDataURL(type, quality, opts = {}) {
    type = type || this.outputType || (this.round ? 'image/png' : 'image/jpeg');
    const c = this.getCanvas({ fill: type === 'image/jpeg' ? '#fff' : null, ...opts });
    return c ? c.toDataURL(type, quality ?? this.quality) : '';
  }

  /* ── rendering ── */
  _drawTo(ctx, w, hh, fill, rnd) {
    const b = this._b, s = this._s, k = w / b.w;
    ctx.save();
    if (rnd) { ctx.beginPath(); ctx.ellipse(w / 2, hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); ctx.clip(); }
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, hh); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.scale(k, hh / b.h); ctx.translate(-b.x, -b.y); ctx.translate(s.cx, s.cy); ctx.rotate((s.r * Math.PI) / 180); ctx.scale(s.z * s.fx, s.z * s.fy);
    ctx.drawImage(this._src, -this._iw / 2, -this._ih / 2, this._iw, this._ih);
    ctx.restore();
  }
  _paint() {
    if (!this._ok) return;
    const s = this._s, b = this._b;
    this._src.style.transform = `translate(${round(s.cx, 2)}px, ${round(s.cy, 2)}px) rotate(${round(s.r, 3)}deg) scale(${round(s.z * s.fx, 5)}, ${round(s.z * s.fy, 5)}) translate(-50%, -50%)`;
    css(this._box, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    const d = this.getData(), txt = this.t('cropper.size', { width: Math.round(d.width), height: Math.round(d.height) });
    this._sizeEl.textContent = txt;
    this._box.setAttribute('aria-label', this.t('cropper.area') + ', ' + txt);
    const [a, bz] = this._zRange();
    this._zr.value = bz > a ? (Math.log(s.z / a) / Math.log(bz / a)) * 100 : 0;
    const fine = round(s.r - this._q * 90, 1);
    this._ar.value = fine; this._arVal.textContent = fine + '°';
    this._bZOut.disabled = s.z <= a * 1.001; this._bZIn.disabled = s.z >= bz * 0.999;
    this._emitCrop();
  }
  _drawPreviews() {
    const p = this.preview;
    if (!p || !this._ok) return;
    const els = isStr(p) ? $$(p) : toArr(p);
    els.forEach(el => {
      let c = el.querySelector(':scope > canvas.o-cropper-preview');
      if (!c) { c = h('canvas', { class: 'o-cropper-preview', 'aria-hidden': 'true' }); el.replaceChildren(c); }
      const dpr = win.devicePixelRatio || 1, W = el.clientWidth || 96, H = el.clientHeight || Math.round(W * this._b.h / this._b.w);
      const k = Math.min(W / this._b.w, H / this._b.h), w = Math.max(1, Math.round(this._b.w * k * dpr)), hh = Math.max(1, Math.round(this._b.h * k * dpr));
      if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, hh);
      this._drawTo(ctx, w, hh, null, this.round);
    });
  }
  _resized() {
    if (!this._ok || !this._W) return;
    const W2 = this._stage.clientWidth, H2 = this._stage.clientHeight;
    if (!W2 || !H2 || (W2 === this._W && H2 === this._H)) return;
    const k = Math.min(W2 / this._W, H2 / this._H), s = this._s, b = this._b, mx = (x, W, W2_) => W2_ / 2 + (x - W / 2) * k;
    s.cx = mx(s.cx, this._W, W2); s.cy = mx(s.cy, this._H, H2); s.z *= k; this._zfit *= k;
    b.x = mx(b.x, this._W, W2); b.y = mx(b.y, this._H, H2); b.w *= k; b.h *= k;
    this._W = W2; this._H = H2;
    this._clampBox(b); this._clampImage(); this._paint();
  }
  _applyAspect() {
    const A = this._A, b = this._b, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let w = b.w, hh = b.h;
    if (A) { const area = b.w * b.h; w = Math.sqrt(area * A); hh = w / A; }
    let nb = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
    for (let i = 0; i < 40 && !this._valid(this._clampBox({ ...nb })); i++) { nb.w *= 0.94; nb.h *= 0.94; nb.x = cx - nb.w / 2; nb.y = cy - nb.h / 2; }
    this._b = this._clampBox(nb);
    this._clampImage(); this._paint();
  }
  _zoomAt(z, px, py) {
    const s = this._s, b = this._b;
    if (px == null) { px = b.x + b.w / 2; py = b.y + b.h / 2; }
    const [a, bz] = this._zRange(), nz = clamp(z, a, bz), f = nz / s.z;
    s.cx = px - (px - s.cx) * f; s.cy = py - (py - s.cy) * f; s.z = nz;
    this._clampImage(); this._paint();
  }
  _resize(dir, dx, dy, sb) {
    const A = this._A;
    const cand = t => {
      let { x, y, w, h: hh } = sb;
      const ex = dx * t, ey = dy * t;
      if (dir.includes('e')) w = sb.w + ex;
      if (dir.includes('w')) { w = sb.w - ex; x = sb.x + ex; }
      if (dir.includes('s')) hh = sb.h + ey;
      if (dir.includes('n')) { hh = sb.h - ey; y = sb.y + ey; }
      if (A) {
        if (dir === 'n' || dir === 's') { w = hh * A; x = sb.x + (sb.w - w) / 2; }
        else if (dir === 'e' || dir === 'w') { hh = w / A; y = sb.y + (sb.h - hh) / 2; }
        else {
          if (Math.abs(w - sb.w) >= Math.abs(hh - sb.h) * A) hh = w / A; else w = hh * A;
          if (dir.includes('w')) x = sb.x + sb.w - w;
          if (dir.includes('n')) y = sb.y + sb.h - hh;
        }
      }
      return { x, y, w, h: hh };
    };
    let b = cand(1);
    if (!this._valid(b)) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (this._valid(cand(m))) lo = m; else hi = m; }
      b = cand(lo);
    }
    this._b = b;
  }

  /* ── pointer / wheel / keyboard ── */
  _down(e) {
    if (!this._ok || e.button > 0) return;
    this._ptr.set(e.pointerId, [e.clientX, e.clientY]);
    try { this._stage.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    if (this._ptr.size === 2) {
      const [a, b] = [...this._ptr.values()], r = this._stage.getBoundingClientRect();
      this._g = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: this._s.z, mx: (a[0] + b[0]) / 2 - r.left, my: (a[1] + b[1]) / 2 - r.top };
      return;
    }
    const hd = e.target.closest('.o-cropper-handle');
    this._g = { mode: hd ? 'r:' + hd.dataset.h : this._box.contains(e.target) ? 'move' : 'pan', x: e.clientX, y: e.clientY, b: { ...this._b }, cx: this._s.cx, cy: this._s.cy };
    this.classList.add('is-dragging');
    if (this._g.mode !== 'pan') this._box.focus({ preventScroll: true });
  }
  _move(e) {
    if (!this._ptr.has(e.pointerId) || !this._g) return;
    this._ptr.set(e.pointerId, [e.clientX, e.clientY]);
    const g = this._g;
    if (g.mode === 'pinch') {
      if (this._ptr.size < 2) return;
      const [a, b] = [...this._ptr.values()];
      this._zoomAt(g.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / g.d0, g.mx, g.my);
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.mode === 'move') this._b = this._clampBox({ ...g.b, x: g.b.x + dx, y: g.b.y + dy });
    else if (g.mode === 'pan') { this._s.cx = g.cx + dx; this._s.cy = g.cy + dy; this._clampImage(); }
    else this._resize(g.mode.slice(2), dx, dy, g.b);
    this._paint();
  }
  _up(e) {
    if (!this._ptr.has(e.pointerId)) return;
    this._ptr.delete(e.pointerId);
    if (this._g?.mode === 'pinch' && this._ptr.size === 1) { const [q] = [...this._ptr.values()]; this._g = { mode: 'pan', x: q[0], y: q[1], cx: this._s.cx, cy: this._s.cy }; return; }
    if (this._ptr.size) return;
    this._g = null;
    this.classList.remove('is-dragging');
  }
  _wheel(e) {
    if (!this._ok) return;
    e.preventDefault();
    const r = this._stage.getBoundingClientRect(), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this._zoomAt(this._s.z * Math.exp(-clamp(dy, -120, 120) * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
  }
  _key(e) {
    if (!this._ok || e.altKey || e.metaKey) return;
    const k = e.key, st = e.ctrlKey ? 10 : 2;
    const dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0;
    if (dx || dy) {
      if (e.shiftKey) this._resize(dx ? 'e' : 's', dx, dy, { ...this._b });
      else this._b = this._clampBox({ ...this._b, x: this._b.x + dx, y: this._b.y + dy });
      this._paint();
      clearTimeout(this._annT); this._annT = setTimeout(() => announce(this._sizeEl.textContent), 400);
    } else if (k === '+' || k === '=') this.zoom(1.15);
    else if (k === '-' || k === '_') this.zoom(1 / 1.15);
    else if (k === 'r' || k === 'R') this.rotate(k === 'R' ? -90 : 90);
    else if (k === '0') this.reset();
    else return;
    e.preventDefault();
  }
}
define('o-cropper', OCropper);
O.Cropper = OCropper;
