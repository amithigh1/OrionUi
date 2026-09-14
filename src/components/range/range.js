/* Range slider — single or dual (min/max) thumbs, form-associated.
 *   <o-range name="volume" min="0" max="100" value="40"></o-range>
 *   <o-range dual name="price" value-start="200" value-end="800" min="0" max="1000" step="10" min-distance="50"></o-range>
 *   <o-range marks='[{"value":0,"label":"Free"},{"value":50,"label":"Mid"},{"value":100,"label":"Max"}]'></o-range>
 *   <o-range orientation="vertical"></o-range>   <o-range ticks></o-range>   <o-range tooltip="always|never|auto"></o-range>
 *   Props: value (Number, single mode) value-start value-end (Number, dual mode) dual min(=0) max(=100) step(=1)
 *          min-distance(=0) marks (Array<number|{value,label}> | {value:label}) ticks format (fn(v,el) | "currency:USD"|"percent"|"number:2")
 *          orientation(=horizontal) tooltip(=auto) inputs (Array of selectors|elements to two-way sync, 1 for single / 2 for dual)
 *          name name-end(=name+"End") size(sm|lg) required disabled readonly texts
 *   Methods: setValue(v) setRange(start,end) focus()
 *   Events: input, change, o-change { value, valueStart, valueEnd }
 *   Keyboard (per thumb, WAI-ARIA slider): ArrowRight/ArrowUp +step, ArrowLeft/ArrowDown -step (RTL flips Left/Right),
 *            PageUp/PageDown +-10 steps, Home/End to min/max (respecting min-distance from the other thumb in dual mode).
 * Form value: single -> one field named `name`; dual -> two fields (`name`, `name-end` or `name`+"End").
 */
i18n.add('en', { range: { min: 'Minimum value', max: 'Maximum value', value: 'Value' } });

const decimalsOf = n => { const s = String(n ?? ''), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

class ORange extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Number, default: null },
    valueStart: { type: Number, default: null },
    valueEnd: { type: Number, default: null },
    dual: { type: Boolean, reflect: true },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    step: { type: Number, default: 1 },
    minDistance: { type: Number, default: 0 },
    marks: { type: Any, default: () => [] },
    ticks: { type: Boolean },
    format: { type: Any, attr: 'format' },
    orientation: { type: String, default: 'horizontal', reflect: true },
    tooltip: { type: String, default: 'auto', reflect: true },
    inputs: { type: Array, default: () => [] },
    nameEnd: String,
    size: { type: String, reflect: true },
    texts: Object,
  };
  setup() {
    this.classList.add('o-rangeslider');
    this.track = h('div', { class: 'o-rangeslider-track' });
    this.fill = h('div', { class: 'o-rangeslider-fill' });
    this.ticksEl = h('div', { class: 'o-rangeslider-ticks', 'aria-hidden': 'true' });
    this.marksEl = h('div', { class: 'o-rangeslider-marks', 'aria-hidden': 'true' });
    this.thumbs = { start: this.makeThumb('start'), end: this.makeThumb('end') };
    this.track.append(this.fill, this.ticksEl, this.marksEl, this.thumbs.start, this.thumbs.end);
    this.append(this.track);
    this.focusTarget = this.thumbs.end;
    on(this.track, 'pointerdown', e => this.onTrackDown(e));
    this._inputEls = [];
  }
  makeThumb(kind) {
    const tip = h('span', { class: 'o-rangeslider-tooltip' });
    const t = h('div', { class: 'o-rangeslider-thumb', role: 'slider', tabindex: '0', 'data-kind': kind }, tip);
    on(t, 'keydown', e => this.onThumbKey(e, kind));
    on(t, 'pointerdown', e => { e.stopPropagation(); this.beginDrag(e, kind); });
    on(t, 'focus', () => this.classList.add('is-focused'));
    on(t, 'blur', () => this.classList.remove('is-focused'));
    return t;
  }
  connected() { this.wireInputs(); }
  disconnected() { this.endDrag?.(); }
  connectedCallback() {
    super.connectedCallback();
    if (this._setupDone && this.__defaultStart === undefined) { this.__defaultStart = this.valueStart; this.__defaultEnd = this.valueEnd; }
  }
  /* ── state helpers ── */
  get(kind) { return kind === 'start' ? this.valueStart : (this.dual ? this.valueEnd : this.value); }
  decimals() { return Math.max(decimalsOf(this.step), decimalsOf(this.min)); }
  snap(v) {
    const step = this.step > 0 ? this.step : 1;
    const n = this.min + Math.round((v - this.min) / step) * step;
    return clamp(round(n, this.decimals()), this.min, this.max);
  }
  clampThumb(kind, v) {
    v = this.snap(v);
    if (this.dual) {
      if (kind === 'start') v = Math.min(v, (this.valueEnd ?? this.max) - this.minDistance);
      else v = Math.max(v, (this.valueStart ?? this.min) + this.minDistance);
    }
    return clamp(v, this.min, this.max);
  }
  pct(v) { return this.max === this.min ? 0 : clamp((v - this.min) / (this.max - this.min), 0, 1) * 100; }
  fmtValue(v) {
    if (v == null) return '';
    const f = this.format;
    if (isFn(f)) return String(f(v, this));
    if (isStr(f) && f) {
      const [kind, arg] = f.split(':');
      if (kind === 'currency') return fmt.currency(v, arg);
      if (kind === 'percent') return fmt.percent(v / 100, arg ? +arg : 0);
      if (kind === 'number') return fmt.number(v, arg ? +arg : undefined);
    }
    return fmt.number(v);
  }
  isEmpty() { return this.dual ? this.valueStart == null && this.valueEnd == null : this.value == null; }
  getValidity() {
    if (this.dual) return null;
    if (this.value == null) return null;
    if (this.value < this.min) return { flags: { rangeUnderflow: true }, message: t('validation.min', { min: this.min }) };
    if (this.value > this.max) return { flags: { rangeOverflow: true }, message: t('validation.max', { max: this.max }) };
    return null;
  }
  formValue() {
    if (!this.dual) return this.value == null ? null : String(this.value);
    if (this.valueStart == null && this.valueEnd == null) return null;
    const fd = new FormData();
    const n1 = this.name, n2 = this.nameEnd || (this.name ? this.name + 'End' : null);
    if (n1 && this.valueStart != null) fd.append(n1, String(this.valueStart));
    if (n2 && this.valueEnd != null) fd.append(n2, String(this.valueEnd));
    return fd;
  }
  formResetCallback() {
    if (this.dual) { this.valueStart = this.__defaultStart ?? null; this.valueEnd = this.__defaultEnd ?? null; }
    else this.value = clone(this.__defaultValue ?? null);
    this._syncForm();
    this.requestUpdate('value');
  }
  /* ── rendering ── */
  update(changed) {
    if (changed.has('marks') || changed.has('ticks') || changed.has('min') || changed.has('max') || changed.has('step') || changed.has('init') || changed.has('locale')) this.buildMarks();
    if (changed.has('dual') || changed.has('init')) { this.thumbs.start.hidden = !this.dual; }
    if (changed.has('inputs')) this.wireInputs();
    this.thumbs.start.setAttribute('aria-orientation', this.orientation);
    this.thumbs.end.setAttribute('aria-orientation', this.orientation);
    const ro = this.isDisabled || this.readonly;
    for (const kind of ['start', 'end']) {
      const th = this.thumbs[kind];
      th.tabIndex = this.isDisabled || (kind === 'start' && !this.dual) ? -1 : 0;
      th.setAttribute('aria-disabled', String(this.isDisabled));
      th.setAttribute('aria-readonly', String(!!this.readonly));
      th.setAttribute('aria-valuemin', kind === 'start' ? this.min : (this.dual ? (this.valueStart ?? this.min) : this.min));
      th.setAttribute('aria-valuemax', kind === 'end' ? this.max : (this.valueEnd ?? this.max));
    }
    this.thumbs.start.setAttribute('aria-label', this.t('range.min'));
    if (this.dual) this.thumbs.end.setAttribute('aria-label', this.t('range.max'));
    else if (!this.thumbs.end.hasAttribute('aria-labelledby')) this.thumbs.end.setAttribute('aria-label', this.getAttribute('aria-label') || this.t('range.value'));
    this.classList.toggle('is-disabled', this.isDisabled);
    this.classList.toggle('is-readonly', !!this.readonly);
    this.paint();
  }
  paint() {
    const sv = this.dual ? (this.valueStart ?? this.min) : this.min;
    const ev = this.dual ? (this.valueEnd ?? this.max) : (this.value ?? this.min);
    const sp = this.dual ? this.pct(sv) : 0, ep = this.pct(ev);
    css(this, { '--o-rs-start': sp + '%', '--o-rs-end': ep + '%' });
    if (this.dual) css(this.thumbs.start, { insetInlineStart: sp + '%', bottom: sp + '%' });
    css(this.thumbs.end, { insetInlineStart: ep + '%', bottom: ep + '%' });
    if (this.dual) {
      this.thumbs.start.setAttribute('aria-valuenow', sv);
      this.thumbs.start.setAttribute('aria-valuetext', this.fmtValue(sv));
      this.thumbs.start.querySelector('.o-rangeslider-tooltip').textContent = this.fmtValue(sv);
    }
    const evOrEmpty = this.dual ? ev : this.value;
    this.thumbs.end.setAttribute('aria-valuenow', evOrEmpty ?? this.min);
    this.thumbs.end.setAttribute('aria-valuetext', evOrEmpty == null ? '' : this.fmtValue(evOrEmpty));
    this.thumbs.end.querySelector('.o-rangeslider-tooltip').textContent = evOrEmpty == null ? '' : this.fmtValue(evOrEmpty);
    this.syncLinkedInputs();
  }
  buildMarks() {
    let m = this.marks;
    if (isObj(m) && !Array.isArray(m)) m = Object.entries(m).map(([v, label]) => ({ value: +v, label }));
    else m = toArr(m).map(x => (isObj(x) ? x : { value: +x, label: null }));
    this.marksEl.replaceChildren(...m.map(mk => h('span', { class: 'o-rangeslider-mark', style: { insetInlineStart: this.pct(mk.value) + '%', bottom: this.pct(mk.value) + '%' } },
      mk.label != null ? h('span', { class: 'o-rangeslider-mark-label' }, String(mk.label)) : null)));
    if (this.ticks) {
      const step = this.step > 0 ? this.step : 1, n = Math.round((this.max - this.min) / step);
      const list = n > 0 && n <= 200 ? Array.from({ length: n + 1 }, (_, i) => this.min + i * step) : [];
      this.ticksEl.replaceChildren(...list.map(v => h('span', { class: 'o-rangeslider-tick', style: { insetInlineStart: this.pct(v) + '%', bottom: this.pct(v) + '%' } })));
    } else this.ticksEl.replaceChildren();
  }
  /* ── committing changes ── */
  setThumb(kind, v, user, { final = true } = {}) {
    v = this.clampThumb(kind, v);
    const cur = this.get(kind);
    if (v === cur) return;
    if (kind === 'start') this.valueStart = v; else if (this.dual) this.valueEnd = v; else this.value = v;
    this._syncForm();
    this.paint();
    if (!user) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (!final) return;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.dual ? [this.valueStart, this.valueEnd] : this.value, valueStart: this.valueStart, valueEnd: this.valueEnd });
  }
  setValue(v) {
    if (this.dual) { if (Array.isArray(v)) this.setRange(v[0], v[1]); return; }
    this.setThumb('end', v, true);
  }
  /** setRange(start, end) — dual mode convenience, fires a single change. */
  setRange(start, end, user = true) {
    if (!this.dual) return;
    const a = this.clampThumb('start', start), b = this.clampThumb('end', end);
    if (a === this.valueStart && b === this.valueEnd) return;
    this.valueStart = a; this.valueEnd = b;
    this._syncForm(); this.paint();
    if (!user) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: [a, b], valueStart: a, valueEnd: b });
  }
  onThumbKey(e, kind) {
    if (this.isDisabled || this.readonly) return;
    const rtl = isRTL(this);
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const step = this.step > 0 ? this.step : 1;
    const big = Math.max(step * 10, round((this.max - this.min) / 10, this.decimals()));
    const v = this.get(kind) ?? (kind === 'start' ? this.min : this.max);
    let nv;
    if (k === 'ArrowRight' || k === 'ArrowUp') nv = v + step;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') nv = v - step;
    else if (k === 'PageUp') nv = v + big;
    else if (k === 'PageDown') nv = v - big;
    else if (k === 'Home') nv = this.min;
    else if (k === 'End') nv = this.max;
    else return;
    e.preventDefault();
    this.setThumb(kind, nv, true, { final: true });
  }
  valueFromPoint(clientX, clientY) {
    const r = this.track.getBoundingClientRect(), vert = this.orientation === 'vertical';
    let ratio;
    if (vert) ratio = r.height ? (r.bottom - clientY) / r.height : 0;
    else { ratio = r.width ? (clientX - r.left) / r.width : 0; if (isRTL(this)) ratio = 1 - ratio; }
    return this.min + clamp(ratio, 0, 1) * (this.max - this.min);
  }
  beginDrag(e, kind) {
    if (this.isDisabled || this.readonly) return;
    const th = this.thumbs[kind];
    th.focus();
    try { th.setPointerCapture(e.pointerId); } catch {}
    th.classList.add('is-dragging');
    const move = ev => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); this.setThumb(kind, this.valueFromPoint(ev.clientX, ev.clientY), true, { final: false }); };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      offs.forEach(f => f()); th.classList.remove('is-dragging'); this.endDrag = null;
      this.setThumb(kind, this.get(kind), true, { final: true });
    };
    const offs = [on(doc, 'pointermove', move, { passive: false }), on(doc, 'pointerup pointercancel', up)];
    this.endDrag = () => { offs.forEach(f => f()); th.classList.remove('is-dragging'); };
  }
  onTrackDown(e) {
    if (this.isDisabled || this.readonly || e.button !== 0 || e.target.closest('.o-rangeslider-thumb')) return;
    const v = this.valueFromPoint(e.clientX, e.clientY);
    let kind = 'end';
    if (this.dual) { const ds = Math.abs(v - (this.valueStart ?? this.min)), de = Math.abs(v - (this.valueEnd ?? this.max)); kind = ds <= de ? 'start' : 'end'; }
    this.setThumb(kind, v, true, { final: false });
    this.beginDrag(e, kind);
  }
  /* ── linked plain-number inputs ── */
  wireInputs() {
    (this._inputEls || []).forEach(o => o.off());
    const specs = toArr(this.inputs);
    this._inputEls = specs.map((sel, i) => {
      const el = isStr(sel) ? $(sel) : sel;
      if (!el) return null;
      const kind = this.dual ? (i === 0 ? 'start' : 'end') : 'end';
      const upd = () => { const n = parseFloat(el.value); if (!Number.isNaN(n)) this.setThumb(kind, n, true); };
      return { el, kind, off: on(el, 'change', upd) };
    }).filter(Boolean);
    this.syncLinkedInputs();
  }
  syncLinkedInputs() {
    (this._inputEls || []).forEach(({ el, kind }) => {
      if (doc.activeElement === el) return;
      const v = this.get(kind);
      if (String(el.value ?? '') !== (v == null ? '' : String(v))) el.value = v == null ? '' : v;
    });
  }
  focus(opts) { this.thumbs.end.focus(opts); }
}
define('o-range', ORange);
O.Range = ORange;
