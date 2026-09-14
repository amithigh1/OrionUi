/* Color picker — saturation/value area, hue + alpha sliders, hex/RGB/HSL inputs, swatches, recent colors.
 *   <o-colorpicker name="brand" value="#4f46e5"></o-colorpicker>
 *   <o-colorpicker alpha format="rgb" swatches='["#4f46e5","#dc2626","#15803d"]'></o-colorpicker>
 *   <o-colorpicker inline></o-colorpicker>
 *   Props: value (String, any CSS color; default "#4f46e5") format(hex|rgb|hsl, default hex — controls the serialized value)
 *          alpha(=false, shows the alpha slider + RGBA/HSLA output) swatches (Array<string>) recent(=true, persisted in
 *          localStorage) inline(=false) eyedropper(=true, only rendered when window.EyeDropper exists) contrast-hint(=true)
 *          placement(=bottom-start) size(sm|lg) name required disabled readonly texts
 *   Methods: setValue(v) open() close() toggle() focus()
 *   Events: input, change, o-change { value }, o-open, o-close { reason }
 *   Keyboard: saturation/brightness area (focusable) — arrow keys adjust by 2 (Shift: 10), Home/End to min/max saturation.
 *             Hue and alpha sliders — role="slider", ArrowLeft/Right -+1 (Shift +-10), Home/End to the min/max.
 *   Note: the saturation/hue/alpha canvases are NOT mirrored in RTL (colors have no reading direction — same choice
 *         made by native OS/browser color pickers); the rest of the UI (panel placement, field layout) is fully RTL-aware.
 */
i18n.add('en', {
  colorpicker: {
    label: 'Color', hex: 'Hex', red: 'R', green: 'G', blue: 'B', alpha: 'A', hue: 'H', saturation: 'S', lightness: 'L',
    svLabel: 'Saturation and brightness', hueLabel: 'Hue', alphaLabel: 'Alpha', eyedropper: 'Pick color from screen',
    swatches: 'Swatches', recent: 'Recent', onWhite: 'On white', onBlack: 'On black', invalid: 'Enter a valid color', current: 'Current color: {value}',
  },
});

const EYEDROPPER_SVG = '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="m2 22 1-4 3.5-3.5m0 0L14 7l3 3-7.5 7.5m-3.5-3.5 3.5 3.5M15.5 4.5a3 3 0 0 1 4 4L18 10l-4-4z"/>';

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h: round(h, 1), s: round(max === 0 ? 0 : (d / max) * 100, 1), v: round(max * 100, 1) };
}
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

class OColorPicker extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '#4f46e5' },
    format: { type: String, default: 'hex', reflect: true },
    alpha: Boolean,
    swatches: { type: Array, default: () => [] },
    recent: { type: Boolean, default: true },
    inline: { type: Boolean, reflect: true },
    eyedropper: { type: Boolean, default: true },
    contrastHint: { type: Boolean, default: true },
    placement: { type: String, default: 'bottom-start' },
    size: { type: String, reflect: true },
    texts: Object,
  };
  setup() {
    this.classList.add('o-colorpicker');
    this._h = 243; this._s = 74; this._v = 89; this._a = 1; this._mode = 'hex';
    this.trigger = h('button', { type: 'button', class: 'o-colorpicker-trigger o-control', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
      h('span', { class: 'o-colorpicker-swatch' }), h('span', { class: 'o-colorpicker-triggertext' }));
    on(this.trigger, 'click', () => this.toggle());
    on(this.trigger, 'keydown', e => { if ((e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') && !this._ov) { e.preventDefault(); this.open(); } });
    this.panel = this.buildPanel();
    this.append(this.trigger);
    this.focusTarget = this.trigger;
  }
  connected() {
    queueMicrotask(() => { const own = this.getAttribute('aria-label'); const ids = [...(this.labels || [])].map(l => l.id || (l.id = uid('lbl'))); if (own) this.trigger.setAttribute('aria-label', own); else if (ids.length) this.trigger.setAttribute('aria-labelledby', ids.join(' ')); else this.trigger.setAttribute('aria-label', this.t('colorpicker.label')); });
    if (this.inline && this.panel.parentElement !== this) { this.append(this.panel); this.panel.hidden = false; }
  }
  disconnected() { this.close(); }
  /* ── DOM ── */
  buildPanel() {
    this.svThumb = h('div', { class: 'o-colorpicker-sv-thumb' });
    this.svArea = h('div', { class: 'o-colorpicker-sv', tabindex: '0', role: 'group', 'aria-label': this.t('colorpicker.svLabel') }, this.svThumb);
    on(this.svArea, 'pointerdown', e => this.beginSvDrag(e));
    on(this.svArea, 'keydown', e => this.onSvKey(e));

    const hueThumb = h('div', { class: 'o-colorpicker-hue-thumb', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '360', 'aria-label': this.t('colorpicker.hueLabel') });
    this.hueTrack = h('div', { class: 'o-colorpicker-hue' }, hueThumb);
    on(this.hueTrack, 'pointerdown', e => this.beginTrackDrag(e, 'hue'));
    on(hueThumb, 'keydown', e => this.onTrackKey(e, 'hue'));

    const alphaThumb = h('div', { class: 'o-colorpicker-alpha-thumb', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': this.t('colorpicker.alphaLabel') });
    this.alphaTrack = h('div', { class: 'o-colorpicker-alpha' }, h('div', { class: 'o-colorpicker-alpha-fill' }), alphaThumb);
    on(this.alphaTrack, 'pointerdown', e => this.beginTrackDrag(e, 'alpha'));
    on(alphaThumb, 'keydown', e => this.onTrackKey(e, 'alpha'));

    this.preview = h('span', { class: 'o-colorpicker-preview' });
    if (isBrowser && win.EyeDropper) {
      this.eyeBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm o-colorpicker-eyedrop', 'aria-label': this.t('colorpicker.eyedropper'), title: this.t('colorpicker.eyedropper') }, raw(`<svg class="o-icon" viewBox="0 0 24 24" width="16" height="16">${EYEDROPPER_SVG}</svg>`));
      on(this.eyeBtn, 'click', () => this.pickFromScreen());
    }
    this.hexInput = h('input', { type: 'text', class: 'o-input o-input-sm o-colorpicker-hex', spellcheck: 'false', autocomplete: 'off', maxlength: '9' });
    on(this.hexInput, 'input', () => this.onHexInput(false));
    on(this.hexInput, 'change', () => this.onHexInput(true));
    on(this.hexInput, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.onHexInput(true); } });
    this.hexA = this.miniField(this.t('colorpicker.alpha'), final => { const a = clamp((parseFloat(this.hexA.inp.value) || 0) / 100, 0, 1); this.applyColor({ ...this.rgb(), a }, { final }); });
    this.fieldsHex = h('div', { class: 'o-colorpicker-fields is-hex' }, h('div', { class: 'o-input-group o-colorpicker-hexgroup' }, h('span', { class: 'o-input-addon' }, '#'), this.hexInput), this.hexA.wrap);

    this.rF = this.miniField(this.t('colorpicker.red'), final => this.onNumInput('rgb', final));
    this.gF = this.miniField(this.t('colorpicker.green'), final => this.onNumInput('rgb', final));
    this.bF = this.miniField(this.t('colorpicker.blue'), final => this.onNumInput('rgb', final));
    this.rgbA = this.miniField(this.t('colorpicker.alpha'), final => this.onNumInput('rgb', final));
    this.fieldsRgb = h('div', { class: 'o-colorpicker-fields is-rgb' }, this.rF.wrap, this.gF.wrap, this.bF.wrap, this.rgbA.wrap);

    this.hF = this.miniField(this.t('colorpicker.hue'), final => this.onNumInput('hsl', final));
    this.sF = this.miniField(this.t('colorpicker.saturation'), final => this.onNumInput('hsl', final));
    this.lF = this.miniField(this.t('colorpicker.lightness'), final => this.onNumInput('hsl', final));
    this.hslA = this.miniField(this.t('colorpicker.alpha'), final => this.onNumInput('hsl', final));
    this.fieldsHsl = h('div', { class: 'o-colorpicker-fields is-hsl' }, this.hF.wrap, this.sF.wrap, this.lF.wrap, this.hslA.wrap);

    this.modeSeg = h('div', { class: 'o-colorpicker-modes', role: 'tablist', 'aria-label': 'Format' },
      ...['hex', 'rgb', 'hsl'].map(m => h('button', { type: 'button', class: 'o-colorpicker-modebtn', role: 'tab', 'data-m': m }, m.toUpperCase())));
    on(this.modeSeg, 'click', 'button', (e, btn) => { this._mode = btn.dataset.m; this._modeTouched = true; this.paintMode(); });

    this.swatchesEl = h('div', { class: 'o-colorpicker-swatches' });
    this.recentEl = h('div', { class: 'o-colorpicker-recent' });
    this.contrastEl = h('div', { class: 'o-colorpicker-contrast' });

    const fieldsRow = h('div', { class: 'o-colorpicker-fieldsrow' }, this.preview, h('div', { class: 'o-colorpicker-fieldscol' }, this.modeSeg, this.fieldsHex, this.fieldsRgb, this.fieldsHsl), this.eyeBtn || null);

    return h('div', { class: 'o-floating o-colorpicker-panel', hidden: true },
      this.svArea, this.hueTrack, this.alphaTrack, fieldsRow, this.contrastEl,
      h('div', { class: 'o-colorpicker-section', 'data-label': this.t('colorpicker.swatches') }, this.swatchesEl),
      h('div', { class: 'o-colorpicker-section', 'data-label': this.t('colorpicker.recent') }, this.recentEl));
  }
  miniField(label, onInput) {
    const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'o-input o-input-sm o-colorpicker-num', autocomplete: 'off' });
    on(inp, 'input', () => onInput(false));
    on(inp, 'change', () => onInput(true));
    on(inp, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onInput(true); } });
    const wrap = h('label', { class: 'o-colorpicker-field' }, inp, h('span', { class: 'o-colorpicker-field-label' }, label));
    return { inp, wrap };
  }
  /* ── color state ── */
  rgb() { return hsvToRgb(this._h, this._s, this._v); }
  serialize() {
    const { r, g, b } = this.rgb(), a = this.alpha ? round(this._a, 2) : 1;
    if (this.format === 'rgb') return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
    if (this.format === 'hsl') { const hsl = color.toHsl({ r, g, b, a: 1 }); return a < 1 ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})` : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`; }
    return color.toHex({ r, g, b, a });
  }
  setFromString(str) {
    const c = color.parse(str);
    if (!c) return false;
    const hsv = rgbToHsv(c.r, c.g, c.b);
    this._h = hsv.h; this._s = hsv.s; this._v = hsv.v; this._a = this.alpha ? (c.a ?? 1) : 1;
    return true;
  }
  applyColor(rgba, { final = true } = {}) {
    const hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
    this._h = hsv.h; this._s = hsv.s; this._v = hsv.v;
    if (this.alpha) this._a = rgba.a ?? 1;
    this.commit(final);
  }
  commit(final) {
    const v = this.serialize();
    this.paint();
    if (v === this.value) return;
    this.value = v;
    this._syncForm();
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (!final) return;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: v });
  }
  /* ── render ── */
  update(changed) {
    if (changed.has('value') || changed.has('init')) { if (this.serialize() !== this.value) this.setFromString(this.value || '#000000'); }
    if (changed.has('swatches') || changed.has('init')) this.buildSwatches();
    if (changed.has('recent') || changed.has('init')) this.buildRecent();
    if (changed.has('alpha') || changed.has('init')) { this.alphaTrack.hidden = !this.alpha; this.hexA.wrap.hidden = !this.alpha; this.rgbA.wrap.hidden = !this.alpha; this.hslA.wrap.hidden = !this.alpha; }
    if (changed.has('contrastHint') || changed.has('init')) this.contrastEl.hidden = !this.contrastHint;
    if ((changed.has('format') || changed.has('init')) && !this._modeTouched) this._mode = this.format;
    if (changed.has('inline')) { this.trigger.hidden = !!this.inline; if (this.inline) { this.append(this.panel); this.panel.hidden = false; } else if (this.panel.parentElement === this) { this.panel.hidden = true; this.panel.remove(); } }
    const ro = this.isDisabled || this.readonly;
    this.trigger.disabled = this.isDisabled;
    this.trigger.setAttribute('aria-disabled', String(this.isDisabled));
    [this.svArea, this.hueTrack.firstChild, this.alphaTrack.firstChild].forEach(el => { el.tabIndex = ro ? -1 : 0; });
    this.classList.toggle('is-disabled', this.isDisabled);
    this.paintMode();
    this.paint();
  }
  paint() {
    const { r, g, b } = this.rgb();
    css(this.svArea, { '--o-cp-hue': this._h });
    css(this.svThumb, { left: this._s + '%', top: (100 - this._v) + '%' });
    this.svThumb.style.background = `rgb(${r},${g},${b})`;
    css(this.hueTrack.firstChild, { left: (this._h / 360 * 100) + '%' });
    this.hueTrack.firstChild.setAttribute('aria-valuenow', Math.round(this._h));
    css(this.alphaTrack, { '--o-cp-rgb': `${r},${g},${b}` });
    css(this.alphaTrack.querySelector('.o-colorpicker-alpha-thumb'), { left: (this._a * 100) + '%' });
    this.alphaTrack.firstElementChild.nextElementSibling.setAttribute('aria-valuenow', Math.round(this._a * 100));
    const bg = this.alpha ? `rgba(${r}, ${g}, ${b}, ${round(this._a, 2)})` : `rgb(${r}, ${g}, ${b})`;
    this.trigger.querySelector('.o-colorpicker-swatch').style.backgroundColor = bg;
    this.trigger.querySelector('.o-colorpicker-triggertext').textContent = this.value;
    this.trigger.title = t('colorpicker.current', { value: this.value });
    this.preview.style.backgroundColor = bg;
    this.paintFields({ r, g, b });
    this.paintContrast({ r, g, b });
  }
  paintFields({ r, g, b }) {
    if (doc.activeElement !== this.hexInput) this.hexInput.value = color.toHex({ r, g, b, a: 1 }).slice(1);
    if (doc.activeElement !== this.hexA.inp) this.hexA.inp.value = Math.round(this._a * 100);
    [[this.rF, r], [this.gF, g], [this.bF, b]].forEach(([f, v]) => { if (doc.activeElement !== f.inp) f.inp.value = v; });
    if (doc.activeElement !== this.rgbA.inp) this.rgbA.inp.value = Math.round(this._a * 100);
    const hsl = color.toHsl({ r, g, b, a: 1 }) || { h: 0, s: 0, l: 0 };
    if (doc.activeElement !== this.hF.inp) this.hF.inp.value = Math.round(this._h);
    if (doc.activeElement !== this.sF.inp) this.sF.inp.value = Math.round(hsl.s);
    if (doc.activeElement !== this.lF.inp) this.lF.inp.value = Math.round(hsl.l);
    if (doc.activeElement !== this.hslA.inp) this.hslA.inp.value = Math.round(this._a * 100);
  }
  paintContrast({ r, g, b }) {
    if (!this.contrastHint) return;
    const cw = color.contrast({ r, g, b }, '#ffffff'), cb = color.contrast({ r, g, b }, '#000000');
    this.contrastEl.replaceChildren(
      h('span', { class: cls('o-colorpicker-contrast-chip', cw >= 4.5 ? 'is-pass' : 'is-fail'), style: { background: '#fff', color: '#000' }, title: `${this.t('colorpicker.onWhite')}: ${cw.toFixed(1)}:1` }, `Aa ${cw.toFixed(1)}`),
      h('span', { class: cls('o-colorpicker-contrast-chip', cb >= 4.5 ? 'is-pass' : 'is-fail'), style: { background: '#000', color: '#fff' }, title: `${this.t('colorpicker.onBlack')}: ${cb.toFixed(1)}:1` }, `Aa ${cb.toFixed(1)}`));
  }
  paintMode() {
    ['hex', 'rgb', 'hsl'].forEach(m => {
      this['fields' + cap(m)].hidden = this._mode !== m;
      const btn = this.modeSeg.querySelector(`[data-m="${m}"]`);
      btn.classList.toggle('is-active', this._mode === m);
      btn.setAttribute('aria-selected', String(this._mode === m));
    });
  }
  /* ── field input handling ── */
  onHexInput(final) {
    const raw0 = this.hexInput.value.trim().replace(/^#/, '');
    if (!/^[0-9a-f]{3,8}$/i.test(raw0)) { this.hexInput.classList.toggle('is-invalid', final); if (final) this.paintFields(this.rgb()); return; }
    const c = color.parse('#' + raw0);
    this.hexInput.classList.remove('is-invalid');
    if (!c) return;
    const a = this.alpha ? (parseFloat(this.hexA.inp.value) || 0) / 100 : 1;
    this.applyColor({ r: c.r, g: c.g, b: c.b, a: c.a < 1 ? c.a : a }, { final });
  }
  onNumInput(kind, final = false) {
    if (kind === 'rgb') {
      const r = clamp(parseInt(this.rF.inp.value, 10) || 0, 0, 255), g = clamp(parseInt(this.gF.inp.value, 10) || 0, 0, 255), b = clamp(parseInt(this.bF.inp.value, 10) || 0, 0, 255);
      const a = clamp((parseFloat(this.rgbA.inp.value) || 0) / 100, 0, 1);
      this.applyColor({ r, g, b, a }, { final: !!final });
      return;
    }
    const hh = ((parseFloat(this.hF.inp.value) || 0) % 360 + 360) % 360, ss = clamp(parseFloat(this.sF.inp.value) || 0, 0, 100), ll = clamp(parseFloat(this.lF.inp.value) || 0, 0, 100);
    const a = clamp((parseFloat(this.hslA.inp.value) || 0) / 100, 0, 1);
    const rgb = color.fromHsl(hh, ss, ll);
    this.applyColor({ r: rgb.r, g: rgb.g, b: rgb.b, a }, { final: !!final });
  }
  /* ── pointer / keyboard on canvases ── */
  beginSvDrag(e) {
    if (this.isDisabled || this.readonly) return;
    this.svArea.focus();
    try { this.svArea.setPointerCapture(e.pointerId); } catch {}
    const move = ev => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); this.setSvFromPoint(ev.clientX, ev.clientY, false); };
    const up = ev => { if (ev.pointerId !== e.pointerId) return; offs.forEach(f => f()); this.setSvFromPoint(ev.clientX, ev.clientY, true); };
    const offs = [on(doc, 'pointermove', move, { passive: false }), on(doc, 'pointerup pointercancel', up)];
    this.setSvFromPoint(e.clientX, e.clientY, false);
  }
  setSvFromPoint(x, y, final) {
    const r = this.svArea.getBoundingClientRect();
    this._s = round(clamp(r.width ? (x - r.left) / r.width : 0, 0, 1) * 100, 1);
    this._v = round(clamp(r.height ? 1 - (y - r.top) / r.height : 0, 0, 1) * 100, 1);
    this.commit(final);
  }
  onSvKey(e) {
    if (this.isDisabled || this.readonly) return;
    const step = e.shiftKey ? 10 : 2;
    let handled = true;
    if (e.key === 'ArrowRight') this._s = clamp(this._s + step, 0, 100);
    else if (e.key === 'ArrowLeft') this._s = clamp(this._s - step, 0, 100);
    else if (e.key === 'ArrowUp') this._v = clamp(this._v + step, 0, 100);
    else if (e.key === 'ArrowDown') this._v = clamp(this._v - step, 0, 100);
    else if (e.key === 'Home') this._s = 0;
    else if (e.key === 'End') this._s = 100;
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    this.commit(true);
  }
  beginTrackDrag(e, kind) {
    if (this.isDisabled || this.readonly || (kind === 'alpha' && !this.alpha)) return;
    const track = kind === 'hue' ? this.hueTrack : this.alphaTrack;
    const thumb = track.querySelector(kind === 'hue' ? '.o-colorpicker-hue-thumb' : '.o-colorpicker-alpha-thumb');
    thumb.focus();
    try { track.setPointerCapture(e.pointerId); } catch {}
    const move = ev => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); this.setTrackFromPoint(kind, ev.clientX, false); };
    const up = ev => { if (ev.pointerId !== e.pointerId) return; offs.forEach(f => f()); this.setTrackFromPoint(kind, ev.clientX, true); };
    const offs = [on(doc, 'pointermove', move, { passive: false }), on(doc, 'pointerup pointercancel', up)];
    this.setTrackFromPoint(kind, e.clientX, false);
  }
  setTrackFromPoint(kind, x, final) {
    const track = kind === 'hue' ? this.hueTrack : this.alphaTrack;
    const r = track.getBoundingClientRect(), ratio = clamp(r.width ? (x - r.left) / r.width : 0, 0, 1);
    if (kind === 'hue') this._h = round(ratio * 360, 1); else this._a = round(ratio, 2);
    this.commit(final);
  }
  onTrackKey(e, kind) {
    if (this.isDisabled || this.readonly) return;
    let handled = true;
    if (kind === 'hue') {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') this._h = clamp(this._h + (e.shiftKey ? 10 : 1), 0, 360);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') this._h = clamp(this._h - (e.shiftKey ? 10 : 1), 0, 360);
      else if (e.key === 'Home') this._h = 0;
      else if (e.key === 'End') this._h = 360;
      else handled = false;
    } else {
      const st = e.shiftKey ? 0.1 : 0.01;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') this._a = clamp(round(this._a + st, 2), 0, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') this._a = clamp(round(this._a - st, 2), 0, 1);
      else if (e.key === 'Home') this._a = 0;
      else if (e.key === 'End') this._a = 1;
      else handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    this.commit(true);
  }
  async pickFromScreen() {
    if (!isBrowser || !win.EyeDropper) return;
    try { const res = await new win.EyeDropper().open(); if (res?.sRGBHex) { const p = color.parse(res.sRGBHex); if (p) this.applyColor(p, { final: true }); } } catch {}
  }
  /* ── swatches / recent ── */
  swatchBtn(c) {
    const btn = h('button', { type: 'button', class: 'o-colorpicker-swatchbtn', title: c, style: { backgroundColor: c } });
    on(btn, 'click', () => { const p = color.parse(c); if (p) this.applyColor(p, { final: true }); });
    return btn;
  }
  buildSwatches() {
    const list = toArr(this.swatches);
    this.swatchesEl.replaceChildren(...list.map(c => this.swatchBtn(c)));
    this.swatchesEl.parentElement.hidden = !list.length;
  }
  buildRecent() {
    const list = this.recent ? toArr(ls.get('orion:colorpicker:recent', [])) : [];
    this.recentEl.replaceChildren(...list.map(c => this.swatchBtn(c)));
    this.recentEl.parentElement.hidden = !this.recent || !list.length;
  }
  pushRecent(v) {
    const hex = color.toHex(color.parse(v) || null);
    if (!hex) return;
    const list = [hex, ...toArr(ls.get('orion:colorpicker:recent', [])).filter(c => c !== hex)].slice(0, 12);
    ls.set('orion:colorpicker:recent', list);
    this.buildRecent();
  }
  /* ── popup ── */
  open() {
    if (this.inline || this._ov || this.isDisabled || this.readonly) return;
    if (!this.emit('before-open')) return;
    const panel = this.panel;
    portal(panel, this);
    panel.hidden = false;
    this._unplace = autoPlace(panel, this.trigger, { placement: this.placement || 'bottom-start', offset: 6, flip: true, size: true });
    this._ov = overlays.open({
      el: panel, owner: this,
      onClose: reason => {
        this._ov = null; this._unplace?.(); panel.hidden = true;
        this.classList.remove('is-open'); this.trigger.setAttribute('aria-expanded', 'false');
        if (this.recent) this.pushRecent(this.value);
        this.emit('close', { reason });
      },
    });
    this.classList.add('is-open'); this.trigger.setAttribute('aria-expanded', 'true');
    animate(panel, 'zoomIn', { duration: 120 });
    this.emit('open');
    requestAnimationFrame(() => this.svArea.focus());
  }
  close() { this._ov?.close('api'); }
  toggle() { this._ov ? this.close() : this.open(); }
  focus(opts) { (this.inline ? this.svArea : this.trigger)?.focus(opts); }
}
define('o-colorpicker', OColorPicker);
O.ColorPicker = OColorPicker;
