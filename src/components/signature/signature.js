/* Signature pad — <o-signature> smooth ink from pointer events, velocity-based width, typed mode, form-associated.
 *   <o-signature name="agree" required pen-color="#1e293b" min-width="0.6" max-width="2.6" background="#fff"></o-signature>
 *   <o-signature typed></o-signature>                          adds a "Type" tab (keyboard-only alternative)
 *   Props: penColor penWidth minWidth maxWidth velocityFilter background readonly required disabled name typed value
 *          value = PNG data URL (trimmed) or null when empty; form value follows the same contract.
 *   Methods: clear() undo() toDataURL(type,quality) toPNG() toJPEG(quality) toBlob(type,quality) toFile(name,type,quality)
 *            toSVG() toPoints() fromDataURL(url) fromPoints(strokes)
 *   Events: o-begin (stroke started) o-end (stroke finished) o-change { value } (native input/change also fire)
 *   Keyboard: the canvas itself is pointer-only; enable `typed` for a fully keyboard-operable alternative.
 */
i18n.add('en', {
  signature: {
    canvasLabel: 'Signature pad. Draw your signature with a mouse, stylus or finger.', placeholder: 'Sign here',
    draw: 'Draw', type: 'Type', typedPlaceholder: 'Type your name', typedLabel: 'Typed signature', font: 'Signature style',
    color: 'Ink color', width: 'Pen width', undo: 'Undo last stroke', clear: 'Clear signature', cleared: 'Signature cleared',
    empty: 'Signature is required', download: 'Download',
  },
});

const SIG_FONTS = [
  { label: 'Elegant', family: '"Segoe Script","Bradley Hand","Brush Script MT",cursive' },
  { label: 'Casual', family: '"Lucida Handwriting","Comic Sans MS",cursive' },
  { label: 'Classic', family: '"Monotype Corsiva","Apple Chancery",cursive' },
];

function sigToXY(pt, w, h) { return { x: pt.x * w, y: pt.y * h }; }

class OSignature extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: null },
    penColor: { type: String, default: '#1e293b' },
    penWidth: { type: Number, default: 2 },
    minWidth: { type: Number, default: 0.6 },
    maxWidth: { type: Number, default: 2.6 },
    velocityFilter: { type: Boolean, default: true },
    background: { type: String, default: '' },
    typed: { type: Boolean, default: false },
    texts: { type: Object, attr: false },
  };

  setup() {
    this.classList.add('o-signature');
    this._strokes = [];
    this._img = null;
    this._typedText = '';
    this._fontIndex = 0;
    this._mode = 'draw';
    this._active = null;
    this._cssW = 300; this._cssH = 140;
    this._synced = false;

    this._canvas = h('canvas', { class: 'o-signature-canvas', tabindex: '0', role: 'img', 'aria-label': this.t('signature.canvasLabel') });
    this._placeholder = h('div', { class: 'o-signature-placeholder', 'aria-hidden': 'true' }, this.t('signature.placeholder'));
    this._baseline = h('div', { class: 'o-signature-baseline', 'aria-hidden': 'true' });
    const pad = h('div', { class: 'o-signature-pad' }, this._canvas, this._baseline, this._placeholder);

    this._tabDraw = h('button', { type: 'button', class: 'o-signature-tab is-active', role: 'tab', 'aria-selected': 'true' }, this.t('signature.draw'));
    this._tabType = h('button', { type: 'button', class: 'o-signature-tab', role: 'tab', 'aria-selected': 'false' }, this.t('signature.type'));
    this._tabs = h('div', { class: 'o-signature-tabs', role: 'tablist', hidden: !this.typed }, this._tabDraw, this._tabType);
    on(this._tabDraw, 'click', () => this._setMode('draw'));
    on(this._tabType, 'click', () => this._setMode('type'));

    this._colorInput = h('input', { type: 'color', class: 'o-signature-color', 'aria-label': this.t('signature.color'), value: this.penColor });
    on(this._colorInput, 'input', () => { this.penColor = this._colorInput.value; });
    this._widthRange = h('input', { type: 'range', class: 'o-range o-signature-width', min: '0.4', max: '6', step: '0.1', value: String(this.maxWidth), 'aria-label': this.t('signature.width') });
    on(this._widthRange, 'input', () => { const v = +this._widthRange.value; this.maxWidth = v; this.minWidth = Math.min(this.minWidth, v * 0.4); });
    this._undoBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'aria-label': this.t('signature.undo'), title: this.t('signature.undo') }, raw(icon('undo', { size: 16 })));
    on(this._undoBtn, 'click', () => this.undo());
    this._clearBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-signature-clear', 'aria-label': this.t('signature.clear') }, raw(icon('trash', { size: 16 })), h('span', { text: this.t('signature.clear') }));
    on(this._clearBtn, 'click', () => this.clear());
    this._toolbar = h('div', { class: 'o-signature-toolbar' },
      this._tabs,
      h('label', { class: 'o-signature-swatch' }, this._colorInput),
      this._widthRange,
      h('div', { class: 'o-signature-spacer' }),
      this._undoBtn, this._clearBtn);

    this._typedInput = h('input', { class: 'o-input o-signature-typed-input', type: 'text', hidden: true, placeholder: this.t('signature.typedPlaceholder'), 'aria-label': this.t('signature.typedLabel'), maxlength: '60' });
    this._fontSelect = h('select', { class: 'o-select o-signature-font', hidden: true, 'aria-label': this.t('signature.font') },
      SIG_FONTS.map((f, i) => h('option', { value: String(i), style: { fontFamily: f.family } }, f.label)));
    on(this._typedInput, 'input', debounce(() => this._applyTyped(), 120));
    on(this._fontSelect, 'change', () => { this._fontIndex = +this._fontSelect.value; this._applyTyped(); });
    this._typedRow = h('div', { class: 'o-signature-typed-row' }, this._typedInput, this._fontSelect);

    this.append(this._toolbar, pad, this._typedRow);
    this.focusTarget = this._canvas;

    on(this._canvas, 'pointerdown', e => this._start(e));
    on(this._canvas, 'pointermove', e => this._move(e));
    on(this._canvas, 'pointerup pointercancel', e => this._stop(e));
    on(this._canvas, 'keydown', e => { if ((e.key === 'Backspace' || e.key === 'Delete') && this._mode === 'draw') { e.preventDefault(); this.undo(); } });
  }

  connected() {
    this._resize(); this._redraw();
    const onResize = rafThrottle(() => { this._resize(); this._redraw(); });
    this.addCleanup(observeResize(this, onResize));
  }

  update(changed) {
    if (changed.has('value') || changed.has('init')) {
      if (this._synced) this._synced = false;
      else this._loadFromValue(this.value);
    }
    if (changed.has('penColor')) this._colorInput.value = this.penColor;
    if (changed.has('maxWidth')) this._widthRange.value = String(this.maxWidth);
    if (changed.has('background') && !changed.has('value') && !changed.has('init')) this._redraw();
    if (changed.has('disabled') || changed.has('readonly')) this._syncDisabled();
    if (changed.has('typed')) this._tabs.hidden = !this.typed;
    if (changed.has('locale')) this._retranslate();
  }

  _retranslate() {
    this._canvas.setAttribute('aria-label', this.t('signature.canvasLabel'));
    this._placeholder.textContent = this.t('signature.placeholder');
    this._tabDraw.textContent = this.t('signature.draw');
    this._tabType.textContent = this.t('signature.type');
    this._colorInput.setAttribute('aria-label', this.t('signature.color'));
    this._widthRange.setAttribute('aria-label', this.t('signature.width'));
    this._undoBtn.setAttribute('aria-label', this.t('signature.undo'));
    this._typedInput.placeholder = this.t('signature.typedPlaceholder');
  }

  _syncDisabled() {
    const off = this.isDisabled || this.readonly;
    this._canvas.style.pointerEvents = off ? 'none' : '';
    this._canvas.tabIndex = off ? -1 : 0;
    [this._colorInput, this._widthRange, this._undoBtn, this._clearBtn, this._tabDraw, this._tabType, this._typedInput, this._fontSelect].forEach(el => { el.disabled = this.isDisabled; el.hidden = el.hidden || (this.readonly && el !== this._canvas); });
    this._toolbar.hidden = this.readonly;
    this._typedRow.hidden = this.readonly || this._mode !== 'type';
  }

  _setMode(mode) {
    this._mode = mode;
    this._tabDraw.classList.toggle('is-active', mode === 'draw');
    this._tabDraw.setAttribute('aria-selected', String(mode === 'draw'));
    this._tabType.classList.toggle('is-active', mode === 'type');
    this._tabType.setAttribute('aria-selected', String(mode === 'type'));
    this._typedRow.hidden = mode !== 'type';
    this._canvas.style.cursor = mode === 'type' ? 'default' : '';
    if (mode === 'type') { this._strokes = []; this._img = null; this._redraw(); this._typedInput.focus(); }
    else { this._typedText = ''; this._typedInput.value = ''; this._redraw(); }
  }

  _resize() {
    const rect = this.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || 300));
    const pad = this.querySelector('.o-signature-pad');
    const h2 = Math.max(96, Math.round(pad ? pad.getBoundingClientRect().height : w * 0.36));
    const dpr = win.devicePixelRatio || 1;
    this._cssW = w; this._cssH = h2;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h2 * dpr);
    this._ctx = this._canvas.getContext('2d');
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _loadFromValue(v) {
    this._strokes = []; this._img = null; this._typedText = '';
    if (!v) { this._redraw(); return; }
    const img = new Image();
    img.onload = () => { this._img = img; this._redraw(); };
    img.onerror = () => {};
    img.src = v;
  }

  _drawAt(stroke, i) {
    const ctx = this._ctx, w = this._cssW, hh = this._cssH;
    if (i === 0) { if (stroke.length === 1) { const a = sigToXY(stroke[0], w, hh); ctx.beginPath(); ctx.fillStyle = this.penColor; ctx.arc(a.x, a.y, this._widthFor(stroke[0], stroke[0]) / 2, 0, Math.PI * 2); ctx.fill(); } return; }
    ctx.strokeStyle = this.penColor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = this._widthFor(stroke[i - 1], stroke[i]);
    if (i === 1 || stroke.length < 3) {
      const a = sigToXY(stroke[i - 1], w, hh), b = sigToXY(stroke[i], w, hh);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      return;
    }
    const p0 = sigToXY(stroke[i - 2], w, hh), p1 = sigToXY(stroke[i - 1], w, hh), p2 = sigToXY(stroke[i], w, hh);
    const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    ctx.beginPath(); ctx.moveTo(mid1.x, mid1.y); ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y); ctx.stroke();
  }

  _widthFor(a, b) {
    if (!this.velocityFilter) return this.penWidth;
    if (a.p != null && b.p != null && (a.p !== 0.5 || b.p !== 0.5)) return this.minWidth + (this.maxWidth - this.minWidth) * ((a.p + b.p) / 2);
    const dx = (b.x - a.x) * this._cssW, dy = (b.y - a.y) * this._cssH, dist = Math.hypot(dx, dy), dt = Math.max(1, b.t - a.t);
    const norm = clamp((dist / dt) / 1.1, 0, 1);
    return this.maxWidth - (this.maxWidth - this.minWidth) * norm;
  }

  _redraw() {
    const ctx = this._ctx; if (!ctx) return;
    ctx.clearRect(0, 0, this._cssW, this._cssH);
    if (this.background) { ctx.fillStyle = this.background; ctx.fillRect(0, 0, this._cssW, this._cssH); }
    if (this._img) { ctx.drawImage(this._img, 0, 0, this._cssW, this._cssH); }
    else if (this._typedText) {
      ctx.fillStyle = this.penColor; ctx.textBaseline = 'alphabetic';
      let size = Math.min(this._cssH * 0.5, 48);
      const font = SIG_FONTS[this._fontIndex].family;
      ctx.font = size + 'px ' + font;
      while (ctx.measureText(this._typedText).width > this._cssW * 0.92 && size > 10) { size -= 2; ctx.font = size + 'px ' + font; }
      const tw = ctx.measureText(this._typedText).width;
      ctx.fillText(this._typedText, Math.max(4, (this._cssW - tw) / 2), this._cssH * 0.62);
    } else {
      for (const stroke of this._strokes) for (let i = 0; i < stroke.length; i++) this._drawAt(stroke, i);
    }
    this._placeholder.hidden = !this.isEmpty();
    this.toggleAttribute('data-empty', this.isEmpty());
  }

  _pointFromEvent(e) {
    const r = this._canvas.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? e.pressure : (e.pointerType === 'touch' ? 0.5 : (e.pressure && e.pressure !== 0.5 ? e.pressure : 0.5));
    return { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1), t: e.timeStamp, p };
  }

  _start(e) {
    if (this.isDisabled || this.readonly || this._mode !== 'draw') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { this._canvas.setPointerCapture(e.pointerId); } catch {}
    this._placeholder.hidden = true;
    this._active = [this._pointFromEvent(e)];
    this._strokes.push(this._active);
    this._drawAt(this._active, 0);
    this.emit('begin');
  }
  _move(e) {
    if (!this._active) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) { this._active.push(this._pointFromEvent(ev)); this._drawAt(this._active, this._active.length - 1); }
  }
  _stop(e) {
    if (!this._active) return;
    try { this._canvas.releasePointerCapture(e.pointerId); } catch {}
    this._active = null;
    this._commit();
    this.emit('end');
  }
  _commit() {
    this._synced = true;
    this.setValue(this.isEmpty() ? null : this._toPNGInternal());
    this.toggleAttribute('data-empty', this.isEmpty());
  }
  _applyTyped() {
    this._typedText = this._typedInput.value.trim();
    this._strokes = []; this._img = null;
    this._redraw();
    this._synced = true;
    this.setValue(this.isEmpty() ? null : this._toPNGInternal());
  }

  isEmpty() { return !this._strokes.some(s => s.length) && !this._img && !this._typedText; }

  /** Discard the current signature. */
  clear() {
    this._strokes = []; this._img = null; this._typedText = ''; this._typedInput.value = '';
    this._redraw();
    this._synced = true;
    this.setValue(null);
    announce(this.t('signature.cleared'));
  }
  /** Remove the last stroke (draw mode only). */
  undo() {
    if (this._mode !== 'draw' || !this._strokes.length) return;
    this._strokes.pop();
    this._redraw();
    this._synced = true;
    this.setValue(this.isEmpty() ? null : this._toPNGInternal());
  }

  _toPNGInternal() { return this._canvas.toDataURL('image/png'); }
  _trimmedCanvas(whiteBg) {
    const src = this._canvas, w = src.width, h = src.height;
    if (!w || !h) return src;
    const ctx = src.getContext('2d');
    let data; try { data = ctx.getImageData(0, 0, w, h).data; } catch { return src; }
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
    const pad = Math.round(8 * (win.devicePixelRatio || 1));
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const outW = maxX - minX + 1, outH = maxY - minY + 1;
    const out = doc.createElement('canvas'); out.width = outW; out.height = outH;
    const octx = out.getContext('2d');
    if (whiteBg || this.background) { octx.fillStyle = this.background || '#fff'; octx.fillRect(0, 0, outW, outH); }
    octx.drawImage(src, minX, minY, outW, outH, 0, 0, outW, outH);
    return out;
  }
  /** Trimmed PNG/JPEG/WebP data URL. */
  toDataURL(type = 'image/png', quality) { return this._trimmedCanvas(type === 'image/jpeg').toDataURL(type, quality); }
  toPNG() { return this.toDataURL('image/png'); }
  toJPEG(quality = 0.92) { return this.toDataURL('image/jpeg', quality); }
  toBlob(type = 'image/png', quality) { return new Promise(res => this._trimmedCanvas(type === 'image/jpeg').toBlob(res, type, quality)); }
  async toFile(name = 'signature.png', type = 'image/png', quality) { const b = await this.toBlob(type, quality); return new File([b || []], name, { type }); }
  /** Raw stroke points (relative 0..1 coordinates) for later fromPoints(). Empty in typed/image mode. */
  toPoints() { return clone(this._strokes); }
  /** Vector SVG approximation of the current strokes (or typed text). */
  toSVG() {
    const w = this._cssW, hh = this._cssH;
    const bg = this.background ? `<rect width="100%" height="100%" fill="${esc(this.background)}"/>` : '';
    if (this._typedText) {
      const font = SIG_FONTS[this._fontIndex].family.replace(/"/g, "'");
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}">${bg}<text x="50%" y="62%" text-anchor="middle" font-family="${esc(font)}" font-size="${Math.round(hh * 0.4)}" fill="${esc(this.penColor)}">${esc(this._typedText)}</text></svg>`;
    }
    let paths = '';
    for (const stroke of this._strokes) {
      if (!stroke.length) continue;
      if (stroke.length === 1) { const p = sigToXY(stroke[0], w, hh); paths += `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(this.penWidth / 2).toFixed(2)}" fill="${esc(this.penColor)}"/>`; continue; }
      let d = 'M ' + stroke.map(p => { const xy = sigToXY(p, w, hh); return xy.x.toFixed(2) + ' ' + xy.y.toFixed(2); }).join(' L ');
      paths += `<path d="${d}" fill="none" stroke="${esc(this.penColor)}" stroke-width="${this.penWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}">${bg}${paths}</svg>`;
  }
  /** Load an existing signature image (replaces strokes; not scriptable back to points). */
  fromDataURL(url) { this._synced = false; this.value = url || null; }
  /** Restore stroke data previously obtained from toPoints(). */
  fromPoints(strokes) {
    this._strokes = clone(toArr(strokes)).filter(s => Array.isArray(s) && s.length);
    this._img = null; this._typedText = '';
    if (this._setupDone) { this._resize(); this._redraw(); }
    this._synced = true;
    this.value = this.isEmpty() ? null : this._toPNGInternal();
  }

  getValidity() { return null; }
}
define('o-signature', OSignature);
O.Signature = OSignature;
