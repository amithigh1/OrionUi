/* <o-zoom> — pan & zoom container for any content (image, inline SVG, canvas, a div…).
 *   <o-zoom min="1" max="8" minimap wheel="ctrl" style="height:420px"><img src="plan.svg" alt="Floor plan"></o-zoom>
 *   <o-zoom src="plan.svg" alt="Floor plan"></o-zoom>
 * The first child (not moved) is the content; it is fitted into the box, then zoomed with the toolbar, Ctrl/⌘ + wheel
 * (wheel="zoom" for plain wheel, "none" to disable), trackpad / touch pinch, double-click / double-tap, and panned by dragging.
 * Props: min (1 = fit), max (8), step (1.5), controls (true), minimap, wheel ('ctrl'), src, alt, label, fullscreen (true), texts
 * Methods: zoomIn(), zoomOut(), zoomTo(level), reset(), panBy(dx, dy)    Getters: zoom (1 = fit), scale (content px scale)
 * Events: o-change { zoom, scale, x, y }
 * Keyboard (when focused): + − 0, arrows pan (Shift = faster).
 */
class OZoom extends OElement {
  static props = {
    min: { type: Number, default: 1 }, max: { type: Number, default: 8 }, step: { type: Number, default: 1.5 },
    controls: { type: Boolean, default: true }, minimap: Boolean, wheel: { type: String, default: 'ctrl' },
    src: String, alt: String, label: String, fullscreen: { type: Boolean, default: true }, texts: Object,
  };
  get content() { return [...this.children].find(c => !c.hasAttribute('data-o-ui') && !/^(template|script|style)$/.test(c.localName)) || null; }
  get zoom() { return this._pz && this._base ? this._pz.z / this._base : 1; }
  get scale() { return this._pz ? this._pz.z : 1; }

  setup() {
    this.classList.add('o-zoom');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
    const ui = el => { el.setAttribute('data-o-ui', ''); return el; };
    const b = (name, fn) => h('button', { type: 'button', class: 'o-zoom-btn', onClick: fn }, icon(name));
    this._bOut = b('zoom-out', () => this.zoomOut());
    this._bIn = b('zoom-in', () => this.zoomIn());
    this._bLevel = h('button', { type: 'button', class: 'o-zoom-btn o-zoom-level', onClick: () => this.reset() });
    this._bFs = b('maximize', () => { const p = doc.fullscreenElement === this ? doc.exitFullscreen?.() : this.requestFullscreen?.(); p?.catch?.(noop); });
    this._bar = ui(h('div', { class: 'o-zoom-bar' }, this._bOut, this._bLevel, this._bIn, this._bFs));
    this._mmView = h('div', { class: 'o-zoom-mm-view' });
    this._mmBox = h('div', { class: 'o-zoom-mm-box' });
    this._mm = ui(h('div', { class: 'o-zoom-minimap', 'aria-hidden': 'true' }, this._mmBox, this._mmView));
    this._hintEl = ui(h('div', { class: 'o-zoom-hint', 'aria-hidden': 'true' }));
    this.append(this._bar, this._mm, this._hintEl);
    on(this, 'keydown', e => { if (e.target === this && this._pz && !e.altKey && !e.ctrlKey && !e.metaKey && this._pz.key(e)) this._announce(); });
    on(this, 'load', e => { if (this._content && (e.target === this._content || this._content.contains(e.target))) this._fit(true); }, true);
    on(this._mm, 'pointerdown', e => this._mmDrag(e));
  }
  connected() {
    const mo = new MutationObserver(() => this._bind());
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.addCleanup(observeResize(this, rafThrottle(() => this._fit(false))));
    this.listen(doc, 'fullscreenchange', () => {
      const fs = doc.fullscreenElement === this;
      this._bFs.innerHTML = String(icon(fs ? 'minimize' : 'maximize'));
      this._bFs.setAttribute('aria-label', this.t(fs ? 'gallery.exitFullscreen' : 'gallery.fullscreen'));
    });
    this._bind();
  }
  disconnected() { this._pz?.destroy(); this._pz = null; this._content = null; }
  update(changed) {
    if (changed.has('src') || changed.has('alt')) {
      const own = this.querySelector(':scope > [data-o-own]');
      if (this.src) { const img = own || h('img', { 'data-o-own': '', draggable: 'false' }); img.alt = this.alt || ''; if (img.getAttribute('src') !== this.src) img.src = this.src; if (!own) this.prepend(img); }
      else own?.remove();
    }
    this.setAttribute('aria-roledescription', this.t('gallery.zoomable'));
    if (this.label) this.setAttribute('aria-label', this.label);
    this._bar.hidden = !this.controls;
    this._mm.hidden = !this.minimap;
    this._bFs.hidden = !this.fullscreen || !doc.fullscreenEnabled;
    this._bOut.setAttribute('aria-label', this.t('gallery.zoomOut')); this._bOut.title = this.t('gallery.zoomOut');
    this._bIn.setAttribute('aria-label', this.t('gallery.zoomIn')); this._bIn.title = this.t('gallery.zoomIn');
    this._bLevel.title = this.t('gallery.fit');
    this._bFs.setAttribute('aria-label', this.t('gallery.fullscreen')); this._bFs.title = this.t('gallery.fullscreen');
    this._hintEl.textContent = this.t(/Mac|iP(hone|ad)/.test(navigator.platform || '') ? 'gallery.zoomHintMac' : 'gallery.zoomHint');
    if (this._pz) { this._pz.o.wheel = this.wheel; this._fit(false); }
  }

  zoomIn() { this._pz?.zoomBy(this.step); this._announce(); }
  zoomOut() { this._pz?.zoomBy(1 / this.step); this._announce(); }
  /** zoomTo(level) — 1 = fit */
  zoomTo(level, animate = true) { if (this._pz) this._pz.zoomAt(level * this._base, 0, 0, animate); }
  reset() { this._pz?.reset(); this._announce(); }
  panBy(dx, dy) { if (this._pz) this._pz.set(this._pz.z, this._pz.x + dx, this._pz.y + dy, true); }

  _bind() {
    const el = this.content;
    if (el === this._content) return;
    this._pz?.destroy(); this._pz = null; this._content = el; this._nat = null;
    if (!el) return;
    this._pz = new PanZoom(this, el, {
      min: () => this._base * this.min, max: () => this._base * this.max, wheel: this.wheel, dbl: 2.5,
      size: () => this._nat || { w: 1, h: 1 }, ignore: '[data-o-ui]',
      onChange: () => this._paint(), onWheelHint: () => this._hint(),
    });
    this._mmBox.replaceChildren();
    if (this.minimap) {
      const c = el.localName === 'img' ? h('img', { src: el.currentSrc || el.src, alt: '' }) : el.cloneNode(true);
      c.removeAttribute('id'); c.setAttribute('inert', ''); c.style.transform = '';
      this._mmBox.append(c);
    }
    this._fit(true);
  }
  _measure() {
    const el = this._content;
    if (!el) return null;
    if (el.localName === 'img' && !el.complete) return null;
    const prev = el.style.transform;
    el.style.transform = 'translate(-50%, -50%)';
    const r = el.getBoundingClientRect();
    el.style.transform = prev;
    return r.width && r.height ? { w: r.width, h: r.height } : null;
  }
  _fit(reset) {
    const pz = this._pz;
    if (!pz || !this.isConnected) return;
    const nat = this._measure();
    if (!nat) return;
    const W = this.clientWidth, H = this.clientHeight, prev = this._base, rel = prev ? pz.z / prev : this.min;
    this._nat = nat;
    this._base = Math.min(W / nat.w, H / nat.h) || 1;
    if (reset || !prev) pz.set(this._base * this.min, 0, 0, false);
    else pz.set(rel * this._base, pz.x, pz.y, false);
    if (this.minimap) {
      const k = Math.min(144 / nat.w, 110 / nat.h);
      css(this._mmBox, { width: nat.w * k, height: nat.h * k });
      const c = this._mmBox.firstElementChild;
      if (c) css(c, { width: nat.w, height: nat.h, transform: `scale(${k})` });
      this._mmK = k;
      this._paint();
    }
  }
  _paint() {
    const pz = this._pz;
    if (!pz || !this._base) return;
    this._bLevel.textContent = Math.round(this.zoom * 100) + '%';
    this._bLevel.setAttribute('aria-label', this.t('gallery.resetZoom') + ' (' + this._bLevel.textContent + ')');
    this._bOut.disabled = !pz.zoomed;
    this._bIn.disabled = pz.z >= pz.max - 1e-6;
    this.style.touchAction = pz.zoomed ? 'none' : 'pan-x pan-y';
    if (this.minimap && this._nat && this._mmK) {
      const k = this._mmK, s = pz.z, { w, h: hh } = this._nat, W = this.clientWidth, H = this.clientHeight;
      const x0 = clamp(w / 2 + (-W / 2 - pz.x) / s, 0, w), x1 = clamp(w / 2 + (W / 2 - pz.x) / s, 0, w);
      const y0 = clamp(hh / 2 + (-H / 2 - pz.y) / s, 0, hh), y1 = clamp(hh / 2 + (H / 2 - pz.y) / s, 0, hh);
      css(this._mmView, { left: x0 * k + 'px', top: y0 * k + 'px', width: (x1 - x0) * k + 'px', height: (y1 - y0) * k + 'px' });
      this._mm.classList.toggle('is-active', pz.zoomed);
    }
    this.emit('change', { zoom: this.zoom, scale: pz.z, x: pz.x, y: pz.y });
  }
  _mmDrag(e) {
    if (!this._pz || !this._nat) return;
    e.preventDefault(); e.stopPropagation();
    const move = ev => {
      const r = this._mmBox.getBoundingClientRect(), k = this._mmK;
      const cx = (ev.clientX - r.left) / k, cy = (ev.clientY - r.top) / k;
      this._pz.set(this._pz.z, -(cx - this._nat.w / 2) * this._pz.z, -(cy - this._nat.h / 2) * this._pz.z, false);
    };
    move(e);
    try { this._mm.setPointerCapture(e.pointerId); } catch {}
    const offs = [on(this._mm, 'pointermove', move), on(this._mm, 'pointerup pointercancel', () => offs.forEach(f => f()))];
  }
  _hint() {
    this._hintEl.classList.add('is-visible');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this._hintEl.classList.remove('is-visible'), 1300);
  }
  _announce() { clearTimeout(this._annT); this._annT = setTimeout(() => announce(Math.round(this.zoom * 100) + '%'), 350); }
}
define('o-zoom', OZoom);
O.Zoom = OZoom;
