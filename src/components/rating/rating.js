/* Star (or heart/thumb/custom) rating — form-associated, fractional precision, hover preview.
 *   <o-rating name="score" value="3.5" max="5" precision="0.5"></o-rating>
 *   <o-rating icon="heart" color="danger" readonly value="4"></o-rating>
 *   <o-rating icon="custom" icon-on="<path d='...'/>" icon-off="<path d='...'/>"></o-rating>
 *   <o-rating item-labels='["Terrible","Bad","Okay","Good","Great"]' clearable></o-rating>
 *   Props: value (Number) max(=5) precision(=1, e.g. 0.5) icon(star|heart|thumb|custom, default star) icon-on icon-off
 *          (raw SVG markup, icon="custom") color (semantic name or CSS color) size(sm|md|lg) clearable readonly
 *          item-labels (Array<string>, one per whole level) format (fn(value,el) -> string) name required disabled texts
 *   Methods: setValue(v) clear() focus()
 *   Events: input, change, o-change { value }, o-hover { value } (while previewing, value: null on leave)
 *   Keyboard: role="radiogroup" / role="radio" per item, roving tabindex. ArrowRight/Up +precision, ArrowLeft/Down -precision
 *             (RTL flips Left/Right), Home to 0 (clearable) or the smallest step, End to max, Space/Enter selects the focused level.
 */
i18n.add('en', { rating: { label: 'Rating', value: '{value} out of {max}', clear: 'Clear rating', none: 'No rating' } });

const SEMANTIC_R = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
const SHAPES = {
  star: {
    on: '<path fill="currentColor" d="m12 2.5 2.9 6.3 6.9.9-5 4.9 1.2 6.9L12 18l-6 3.5 1.2-6.9-5-4.9 6.9-.9z"/>',
    off: '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="m12 2.5 2.9 6.3 6.9.9-5 4.9 1.2 6.9L12 18l-6 3.5 1.2-6.9-5-4.9 6.9-.9z"/>',
  },
  heart: {
    on: '<path fill="currentColor" d="M12 21s-7.5-4.6-10-9.3C.6 8.3 2.4 5 5.8 5c2 0 3.5 1.1 4.4 2.6C11.1 6.1 12.6 5 14.6 5c3.4 0 5.2 3.3 3.8 6.7C19.5 16.4 12 21 12 21z"/>',
    off: '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M12 21s-7.5-4.6-10-9.3C.6 8.3 2.4 5 5.8 5c2 0 3.5 1.1 4.4 2.6C11.1 6.1 12.6 5 14.6 5c3.4 0 5.2 3.3 3.8 6.7C19.5 16.4 12 21 12 21z"/>',
  },
  thumb: {
    on: '<path fill="currentColor" d="M2 21h3V10H2zm19-9.6c0-1-.8-1.8-1.8-1.8H14l.9-4.3c.1-.7-.1-1.4-.6-1.9L13.6 3 8 9v12h10.2c.8 0 1.5-.5 1.7-1.3l1.9-6.6c.1-.2.1-.5.1-.7z"/>',
    off: '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" d="M2 21h3V10H2zm19-9.6c0-1-.8-1.8-1.8-1.8H14l.9-4.3c.1-.7-.1-1.4-.6-1.9L13.6 3 8 9v12h10.2c.8 0 1.5-.5 1.7-1.3l1.9-6.6c.1-.2.1-.5.1-.7z"/>',
  },
};

class ORating extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Number, default: 0 },
    max: { type: Number, default: 5 },
    precision: { type: Number, default: 1 },
    icon: { type: String, default: 'star', reflect: true },
    iconOn: String, iconOff: String,
    color: { type: String, reflect: true },
    size: { type: String, default: 'md', reflect: true },
    clearable: Boolean,
    itemLabels: { type: Array, default: () => [] },
    format: { type: Any, attr: false },
    texts: Object,
  };
  setup() {
    this.classList.add('o-rating');
    this.setAttribute('role', 'radiogroup');
    this.row = h('div', { class: 'o-rating-row' });
    this.caption = h('span', { class: 'o-rating-caption', 'aria-hidden': 'true' });
    this.srValue = h('span', { class: 'o-sr-only', role: 'status' });
    this.append(this.row, this.caption, this.srValue);
    this.items = [];
    on(this.row, 'pointermove', '.o-rating-item', (e, el) => this.onHover(e, el));
    on(this.row, 'pointerleave', () => this.onHoverEnd());
    on(this.row, 'click', '.o-rating-item', (e, el) => this.onClick(e, el));
    on(this.row, 'keydown', '.o-rating-item', (e, el) => this.onKey(e, el));
    on(this.row, 'focusout', () => setTimeout(() => { if (!this.row.contains(doc.activeElement)) this.onHoverEnd(); }));
    this.focusTarget = null;
  }
  connected() { queueMicrotask(() => { if (!this.hasAttribute('aria-label') && this.labels?.length) this.setAttribute('aria-labelledby', [...this.labels].map(l => l.id || (l.id = uid('lbl'))).join(' ')); }); }
  precisionStep() { const p = +this.precision; return p > 0 && p <= 1 ? p : 1; }
  shapeFor() {
    const name = this.icon;
    if (name === 'custom') return { on: this.iconOn || '', off: this.iconOff || this.iconOn || '' };
    if (SHAPES[name]) return SHAPES[name];
    const body = O.icons?.get(name);
    return body ? { on: body, off: body } : SHAPES.star;
  }
  buildItems() {
    const n = clamp(this.max | 0 || 5, 1, 20), shape = this.shapeFor();
    const svgSpan = (cls, inner) => h('span', { class: cls, html: `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">${inner}</svg>` });
    this.row.replaceChildren();
    this.items = Array.from({ length: n }, (_, i) => {
      const on = svgSpan('o-rating-icon is-on', shape.on);
      const off = svgSpan('o-rating-icon is-off', shape.off);
      const fillWrap = h('span', { class: 'o-rating-fill' }, on);
      const item = h('span', { class: 'o-rating-item', role: 'radio', tabindex: '-1', 'data-i': String(i + 1) }, off, fillWrap);
      this.row.append(item);
      return item;
    });
    this.focusTarget = this.items[0];
  }
  update(changed) {
    if (changed.has('max') || changed.has('icon') || changed.has('iconOn') || changed.has('iconOff') || changed.has('init')) this.buildItems();
    if (changed.has('color') || changed.has('init')) this.paintColor();
    const ro = this.isDisabled || this.readonly;
    this.items.forEach(it => { it.setAttribute('aria-disabled', String(this.isDisabled)); if (ro) it.tabIndex = -1; });
    this.classList.toggle('is-disabled', this.isDisabled);
    this.classList.toggle('is-readonly', !!this.readonly);
    this.setAttribute('aria-label', this.getAttribute('aria-label') || this.t('rating.label'));
    this.paintFill(this.value || 0);
    this.updateAria();
  }
  paintColor() {
    const c = this.color, semantic = c && SEMANTIC_R.includes(c);
    SEMANTIC_R.forEach(s => this.classList.toggle('o-c-' + s, semantic && c === s));
    this.style.setProperty('--o-rating-color', c && !semantic ? c : '');
  }
  paintFill(v) {
    this.items.forEach((it, idx) => {
      const frac = clamp(v - idx, 0, 1);
      it.style.setProperty('--f', frac);
      it.classList.toggle('is-full', frac >= 1);
      it.classList.toggle('is-empty', frac <= 0);
      it.classList.toggle('is-partial', frac > 0 && frac < 1);
    });
    this.caption.textContent = v > 0 ? this.levelLabel(v) : '';
  }
  updateAria() {
    const v = this.value || 0;
    const cur = clamp(Math.ceil(v) || 1, 1, this.items.length || 1);
    let hasTab = false;
    this.items.forEach((it, idx) => {
      const checked = v > 0 && idx + 1 === cur;
      it.setAttribute('aria-checked', String(checked));
      it.tabIndex = (this.isDisabled || this.readonly) ? -1 : (idx + 1 === cur ? 0 : -1);
      it.setAttribute('aria-label', this.levelLabel(idx + 1) || this.t('rating.value', { value: idx + 1, max: this.items.length }));
      if (it.tabIndex === 0) hasTab = true;
    });
    if (!hasTab && this.items[0] && !this.isDisabled && !this.readonly) this.items[0].tabIndex = 0;
    this.srValue.textContent = v > 0 ? this.fmtValue(v) : this.t('rating.none');
  }
  levelLabel(v) { const arr = toArr(this.itemLabels); return arr[clamp(Math.ceil(v), 1, arr.length || 1) - 1] || ''; }
  fmtValue(v) {
    if (isFn(this.format)) return String(this.format(v, this));
    return this.levelLabel(v) || this.t('rating.value', { value: fmt.number(v), max: this.max });
  }
  localFrac(e, rect) {
    const rtl = isRTL(this);
    let f = rtl ? (rect.right - e.clientX) / rect.width : (e.clientX - rect.left) / rect.width;
    f = clamp(f, 0, 1);
    const p = this.precisionStep();
    return clamp(Math.ceil((f || 0.001) / p) * p, p, 1);
  }
  onHover(e, el) {
    if (this.isDisabled || this.readonly) return;
    const i = +el.dataset.i, rect = el.getBoundingClientRect();
    const v = round((i - 1) + this.localFrac(e, rect), 2);
    if (v === this._hover) return;
    this._hover = v;
    this.paintFill(v);
    this.classList.add('is-hovering');
    this.emit('hover', { value: v });
  }
  onHoverEnd() {
    if (this._hover == null) return;
    this._hover = null;
    this.paintFill(this.value || 0);
    this.classList.remove('is-hovering');
    this.emit('hover', { value: null });
  }
  commit(v) {
    v = clamp(round(v, 2), 0, this.max);
    if (v === this.value) { this.paintFill(v); this.updateAria(); return; }
    this.setValue(v);
    this.paintFill(this._hover ?? v);
    this.updateAria();
  }
  onClick(e, el) {
    if (this.isDisabled || this.readonly) return;
    const i = +el.dataset.i, rect = el.getBoundingClientRect();
    let v = round((i - 1) + this.localFrac(e, rect), 2);
    if (this.clearable && v === this.value) v = 0;
    this.commit(v);
    el.focus();
  }
  onKey(e, el) {
    if (this.isDisabled || this.readonly) return;
    const rtl = isRTL(this);
    let k = e.key;
    if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const p = this.precisionStep(), min = this.clearable ? 0 : p;
    let v = this.value || 0, handled = true;
    if (k === 'ArrowRight' || k === 'ArrowUp') v = clamp(round(v + p, 2), min, this.max);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') v = clamp(round(v - p, 2), min, this.max);
    else if (k === 'Home') v = min;
    else if (k === 'End') v = this.max;
    else if (k === ' ' || k === 'Enter') v = +el.dataset.i;
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    this.commit(v);
    this.focusItemFor(v);
  }
  focusItemFor(v) { const i = clamp(Math.ceil(v) || 1, 1, this.items.length || 1); this.items[i - 1]?.focus(); }
  isEmpty() { return !this.value; }
  formValue() { return this.value ? String(this.value) : null; }
  clear() { this.commit(0); }
  focus(opts) { (this.items.find(it => it.tabIndex === 0) || this.items[0])?.focus(opts); }
}
define('o-rating', ORating);
O.Rating = ORating;
