/* Number & currency input.
 *   <o-number name="price" currency="MYR" min="0" max="1000000" step="0.5" value="1234.5"></o-number>
 *   <o-number percent precision="1"></o-number>   <o-number unit="kg" allow-negative controls="split|stepper|none" wheel></o-number>
 *   Props: value (Number|null) min max step precision currency percent unit prefix suffix allow-negative controls
 *          wheel locale grouping(=true) placeholder size(sm|lg) align(start|end) name required disabled readonly texts
 *   Methods: stepUp(n) stepDown(n) clear() focus() · Events: input, change, o-change { value }
 *   Keyboard: ArrowUp/Down ±step (Shift ×10), PageUp/PageDown ±10 steps, Enter commits. Hold a stepper button to repeat.
 * Behavior for plain inputs (formats as you type, submits a plain number through a hidden input):
 *   <input class="o-input" data-o-number data-o-number-name="amount" data-o-currency="EUR" data-o-number-precision="2">
 *   also data-o-number-min / -max / -locale / -negative / -grouping="false"; data-o-number="percent" adds a % suffix
 * Helpers: Orion.number.format(1234.5, { currency: 'EUR', locale: 'de' }) · Orion.number.parse('1.234,56', { locale: 'de' })
 *          Orion.number.value(input) -> Number|null for data-o-number inputs.
 */
i18n.add('en', { number: { increase: 'Increase', decrease: 'Decrease' } });

/* ── locale info ──────────────────────────────────────────────────────── */
const INFO = new Map();
const nf = (loc, o) => { try { return new Intl.NumberFormat(loc, { numberingSystem: 'latn', ...o }); } catch { return new Intl.NumberFormat('en', o); } };
const unitOk = u => { try { new Intl.NumberFormat('en', { style: 'unit', unit: u }); return true; } catch { return false; } };
/** Separators, grouping sizes, affixes (raw = with the locale's spacing) and default precision for a locale + style. */
function info({ locale, currency, percent, unit, prefix, suffix, currencyDisplay } = {}) {
  const loc = locale || O.i18n.locale || 'en';
  const key = [loc, currency, percent, unit, prefix, suffix, currencyDisplay].join('|');
  let r = INFO.get(key);
  if (r) return r;
  const plain = nf(loc, {}).formatToParts(1234567.8);
  const ints = plain.filter(p => p.type === 'integer').map(p => p.value.length);
  r = {
    locale: loc,
    group: plain.find(p => p.type === 'group')?.value || ',',
    decimal: plain.find(p => p.type === 'decimal')?.value || '.',
    primary: ints[ints.length - 1] || 3,
    secondary: ints.length > 2 ? ints[ints.length - 2] : ints[ints.length - 1] || 3,
    minGroup: nf(loc, {}).format(1234).length > 4 ? 1 : 2, // es/pl only group from 10 000
    preRaw: '', sufRaw: '', frac: null, style: null,
  };
  const style = currency ? { style: 'currency', currency, currencyDisplay: currencyDisplay || 'narrowSymbol' } : percent ? { style: 'percent' } : unit && unitOk(unit) ? { style: 'unit', unit } : null;
  let f = null;
  if (style) try { f = nf(loc, style); r.style = style; } catch { f = null; }
  if (f) {
    const parts = f.formatToParts(percent ? 0.01 : 1);
    const types = parts.map(p => p.type), first = types.indexOf('integer'), last = Math.max(types.lastIndexOf('integer'), types.lastIndexOf('fraction'));
    r.preRaw = parts.slice(0, first).filter(p => !/Sign/.test(p.type)).map(p => p.value).join('');
    r.sufRaw = parts.slice(last + 1).map(p => p.value).join('');
    if (currency) r.frac = f.resolvedOptions().maximumFractionDigits;
  } else if (unit) r.sufRaw = ' ' + unit;
  if (prefix != null) r.preRaw = prefix;
  if (suffix != null) r.sufRaw = suffix;
  r.prefix = r.preRaw.trim(); r.suffix = r.sufRaw.trim();
  INFO.set(key, r);
  return r;
}
function groupInt(int, g) {
  if (int.length <= g.primary || (g.minGroup === 2 && int.length < 5)) return int;
  let out = int.slice(-g.primary), rest = int.slice(0, -g.primary);
  while (rest.length) { out = rest.slice(-g.secondary) + g.group + out; rest = rest.slice(0, -g.secondary); }
  return out;
}
const MINUS = /[-−‒–﹣－]/;
/**
 * Scan typed text: keep digits, one decimal separator and a minus; regroup; keep the caret after the same digit.
 * c: { group, decimal, primary, secondary, minGroup, maxFrac, neg, grouping }
 */
function scan(v, caret, c) {
  let neg = false, int = '', frac = null, k = 0, kInt = 0, pos = 0;
  for (const ch of String(v)) {
    const before = pos < caret; pos += ch.length;
    let sig = false;
    if (ch >= '0' && ch <= '9') {
      if (frac === null) { if (int.length < 15) { int += ch; sig = true; if (before) kInt++; } }
      else if (frac.length < c.maxFrac) { frac += ch; sig = true; }
    } else if (ch === c.decimal && c.maxFrac > 0 && frac === null) { frac = ''; sig = true; }
    else if (MINUS.test(ch) && c.neg) neg = !neg;
    if (sig && before) k++;
  }
  const z = int.length - int.replace(/^0+(?=\d)/, '').length;
  if (z) { int = int.slice(z); k -= Math.min(z, kInt); }
  if (frac !== null && !int) { int = '0'; if (k > 0) k++; }
  const text = (neg ? '-' : '') + (c.grouping === false ? int : groupInt(int, c)) + (frac !== null ? c.decimal + frac : '');
  let at = neg ? 1 : 0;
  if (k > 0) { let n = 0; for (let i = 0; i < text.length; i++) { if ((text[i] >= '0' && text[i] <= '9') || text[i] === c.decimal) n++; if (n === k) { at = i + 1; break; } } }
  const value = !int && frac === null ? null : +((neg ? '-' : '') + (int || '0') + '.' + (frac || '0'));
  return { text: int || frac !== null ? text : neg ? '-' : '', value, caret: at };
}
/** Parse user/pasted text; "1.234,56", "1,234.56", "(12)" and "1 234" all work. Returns Number | null. */
function parse(str, o = {}) {
  if (isNum(str)) return str;
  if (str == null) return null;
  const g = info(o);
  let s = String(str).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || MINUS.test(s);
  s = s.replace(/٫/g, '.').replace(/٬/g, ',').replace(/[^\d.,]/g, '');
  const ld = s.lastIndexOf('.'), lc = s.lastIndexOf(',');
  let dec = null;
  if (ld >= 0 && lc >= 0) dec = ld > lc ? '.' : ',';
  else if (ld >= 0 || lc >= 0) {
    const ch = ld >= 0 ? '.' : ',', count = s.split(ch).length - 1, after = s.length - s.lastIndexOf(ch) - 1;
    dec = count > 1 ? null : ch === g.decimal ? ch : ch === g.group && after === 3 ? null : ch;
  }
  let num = s;
  if (dec) { const i = s.lastIndexOf(dec); num = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, ''); }
  else num = s.replace(/[.,]/g, '');
  if (!/\d/.test(num)) return null;
  const n = parseFloat(num);
  return Number.isNaN(n) ? null : neg ? -n : n;
}
/** format(1234.5, { locale, currency, percent, unit, prefix, suffix, precision, minPrecision, grouping }) */
function format(v, o = {}) {
  if (v == null || v === '' || Number.isNaN(+v)) return '';
  const g = info(o), p = o.precision ?? g.frac;
  const num = { useGrouping: o.grouping !== false, minimumFractionDigits: Math.min(o.minPrecision ?? g.frac ?? 0, p ?? 20), maximumFractionDigits: p ?? 10 };
  if (g.style && o.prefix == null && o.suffix == null) return nf(g.locale, { ...g.style, ...num }).format(o.percent ? +v / 100 : +v);
  return (+v < 0 ? '-' : '') + g.preRaw + nf(g.locale, num).format(Math.abs(+v)) + g.sufRaw;
}
const decimalsOf = n => { const s = String(n ?? ''), i = s.indexOf('.'), m = s.match(/e-(\d+)/); return m ? +m[1] : i < 0 ? 0 : s.length - i - 1; };
const inSet = isBrowser ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set : null;
/** Give the inner field the host's accessible name (aria-label or <label for=host>). */
function linkLabels(host, field) {
  const own = host.getAttribute('aria-label');
  if (own) { field.setAttribute('aria-label', own); return; }
  const ids = [...(host.labels || [])].map(l => l.id || (l.id = uid('lbl')));
  if (host.getAttribute('aria-labelledby')) ids.push(host.getAttribute('aria-labelledby'));
  if (ids.length) field.setAttribute('aria-labelledby', ids.join(' '));
}

/* ── <o-number> ───────────────────────────────────────────────────────── */
class ONumber extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: Number, default: null },
    min: Number, max: Number, step: { type: Number, default: 1 }, precision: Number,
    currency: String, percent: Boolean, unit: String, prefix: String, suffix: String,
    allowNegative: Boolean, controls: { type: String, default: 'stepper', reflect: true }, wheel: Boolean,
    locale: String, grouping: { type: Boolean, default: true }, placeholder: String,
    size: { type: String, reflect: true }, align: { type: String, reflect: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-number');
    const btn = dir => {
      const b = h('button', { type: 'button', class: `o-number-btn is-${dir > 0 ? 'inc' : 'dec'}`, tabindex: '-1' });
      b.addEventListener('pointerdown', e => this.hold(dir, e, b));
      b.addEventListener('click', e => { if (e.detail === 0) this.stepBy(dir); }); // keyboard / assistive tech activation
      b.addEventListener('contextmenu', e => e.preventDefault());
      return b;
    };
    const inp = this.input = h('input', { type: 'text', class: 'o-number-input', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', role: 'spinbutton' });
    this.pre = h('span', { class: 'o-number-affix is-prefix', 'aria-hidden': 'true' });
    this.suf = h('span', { class: 'o-number-affix is-suffix', 'aria-hidden': 'true' });
    this.inc = btn(1); this.dec = btn(-1);
    this.spin = h('span', { class: 'o-number-stepper' });
    this.box = h('div', { class: 'o-control o-number-control' });
    this.append(this.box);
    this.focusTarget = inp;
    on(inp, 'beforeinput', e => {
      // "." or "," typed where the locale uses the other one as decimal separator
      const g = this.g;
      if (e.inputType === 'insertText' && (e.data === '.' || e.data === ',') && e.data !== g.decimal && this.cfg().maxFrac > 0 && !inp.value.includes(g.decimal)) {
        e.preventDefault(); inp.setRangeText(g.decimal, inp.selectionStart, inp.selectionEnd, 'end'); this.onType();
      }
    });
    on(inp, 'input', e => { if (!e.isComposing) this.onType(); });
    on(inp, 'compositionend', () => this.onType());
    on(inp, 'paste', e => this.onPaste(e));
    on(inp, 'keydown', e => this.onKey(e));
    on(inp, 'focus', () => { this.v0 = this.value; this.classList.add('is-focused'); });
    on(inp, 'blur', () => { this.classList.remove('is-focused'); this.commit(); });
    on(inp, 'wheel', e => { if (this.wheel && doc.activeElement === inp && !this.isDisabled && !this.readonly) { e.preventDefault(); this.stepBy((e.deltaY || -e.deltaX) < 0 ? 1 : -1, e.shiftKey ? 10 : 1); } }, { passive: false });
    on(this, 'click', e => { if (e.target === this || e.target === this.box || e.target.classList.contains('o-number-affix')) inp.focus(); });
  }
  connected() { queueMicrotask(() => linkLabels(this, this.input)); }
  disconnected() { this.stopHold?.(); }
  get g() { return info({ locale: this.locale, currency: this.currency, percent: this.percent, unit: this.unit, prefix: this.prefix, suffix: this.suffix }); }
  cfg() {
    const g = this.g;
    return { ...g, maxFrac: this.precision ?? g.frac ?? Math.max(decimalsOf(this.step), 10), neg: this.allowNegative || (this.min != null && this.min < 0), grouping: this.grouping };
  }
  fmtOpts() { return { locale: this.locale, currency: this.currency, percent: this.percent, unit: this.unit, prefix: this.prefix, suffix: this.suffix, precision: this.precision }; }
  /** Text shown in the field (affixes are separate adornments); padded to the precision when not editing. */
  text(v, editing) {
    if (v == null) return '';
    const g = this.g, p = this.precision ?? g.frac;
    return (v < 0 ? '-' : '') + nf(g.locale, { useGrouping: this.grouping, minimumFractionDigits: editing ? 0 : (p ?? 0), maximumFractionDigits: p ?? 10 }).format(Math.abs(v));
  }
  update(changed) {
    const inp = this.input;
    if (changed.has('controls') || changed.has('init')) {
      const c = this.controls;
      if (c === 'split') this.box.replaceChildren(this.dec, this.pre, inp, this.suf, this.inc);
      else if (c === 'none') this.box.replaceChildren(this.pre, inp, this.suf);
      else { this.spin.replaceChildren(this.inc, this.dec); this.box.replaceChildren(this.pre, inp, this.suf, this.spin); }
      this.inc.innerHTML = String(icon(c === 'split' ? 'plus' : 'chevron-up'));
      this.dec.innerHTML = String(icon(c === 'split' ? 'minus' : 'chevron-down'));
    }
    const g = this.g;
    this.pre.textContent = g.prefix; this.pre.hidden = !g.prefix;
    this.suf.textContent = g.suffix; this.suf.hidden = !g.suffix;
    inp.placeholder = this.placeholder || '';
    inp.disabled = this.isDisabled; inp.readOnly = !!this.readonly;
    this.box.classList.toggle('is-disabled', this.isDisabled);
    this.inc.setAttribute('aria-label', this.t('number.increase'));
    this.dec.setAttribute('aria-label', this.t('number.decrease'));
    const editing = doc.activeElement === inp;
    if (!editing || parse(inp.value, { locale: g.locale }) !== this.value) this.paint(editing);
    this.syncAria();
  }
  paint(editing) { const txt = this.text(this.value, editing); if (this.input.value !== txt) inSet.call(this.input, txt); }
  syncAria() {
    const inp = this.input, v = this.value, set = (a, n) => (n == null ? inp.removeAttribute(a) : inp.setAttribute(a, n));
    set('aria-valuenow', v); set('aria-valuemin', this.min); set('aria-valuemax', this.max);
    set('aria-valuetext', v == null ? null : format(v, this.fmtOpts()));
    const ro = this.isDisabled || this.readonly;
    this.inc.disabled = ro || (this.max != null && v != null && v >= this.max);
    this.dec.disabled = ro || (this.min != null && v != null && v <= this.min) || (!this.cfg().neg && v != null && v <= 0);
    inp.setAttribute('aria-invalid', String(!!this.getValidity()));
  }
  onType() {
    const inp = this.input, r = scan(inp.value, inp.selectionStart ?? inp.value.length, this.cfg());
    if (inp.value !== r.text) { inSet.call(inp, r.text); if (doc.activeElement === inp) inp.setSelectionRange(r.caret, r.caret); }
    if (r.value !== this.value) this.setValue(r.value, { inputOnly: true });
    this.syncAria();
  }
  onPaste(e) {
    const txt = e.clipboardData?.getData('text/plain');
    if (txt == null) return;
    e.preventDefault();
    const n = parse(txt, { locale: this.locale });
    if (n == null) return;
    const inp = this.input, v = this.cfg().neg ? n : Math.abs(n);
    if ((inp.selectionStart === 0 && inp.selectionEnd === inp.value.length) || !inp.value) { inSet.call(inp, this.text(v, true)); inp.setSelectionRange(inp.value.length, inp.value.length); }
    else inp.setRangeText(String(Math.abs(n)).replace('.', this.g.decimal), inp.selectionStart, inp.selectionEnd, 'end');
    this.onType();
  }
  onKey(e) {
    if (this.isDisabled || this.readonly || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); this.stepBy(k === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1); }
    else if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); this.stepBy(k === 'PageUp' ? 1 : -1, 10); }
    else if (k === 'Enter') this.commit();
  }
  /** Clamp + pad on blur/Enter and fire change once per edit. */
  commit() {
    let v = this.value;
    if (v != null) {
      if (this.min != null && v < this.min) v = this.min;
      if (this.max != null && v > this.max) v = this.max;
      if (!this.cfg().neg && v < 0) v = -v;
    }
    if (v !== this.value) this.setValue(v, { inputOnly: true });
    this.paint(false);
    if (this.v0 !== this.value) {
      this.v0 = this.value;
      this.dispatchEvent(new Event('change', { bubbles: true }));
      this.emit('change', { value: this.value });
    }
    this.syncAria();
  }
  stepBy(dir, mult = 1) {
    if (this.isDisabled || this.readonly) return;
    const step = this.step > 0 ? this.step : 1, origin = this.min ?? 0;
    let v = this.value;
    if (v == null) v = clamp(0, this.min ?? -Infinity, this.max ?? Infinity);
    else v = clamp(origin + Math.round((v - origin) / step) * step + dir * step * mult, this.min ?? -Infinity, this.max ?? Infinity);
    if (!this.cfg().neg && v < 0) v = 0;
    v = +v.toFixed(Math.min(12, Math.max(decimalsOf(step), decimalsOf(origin), this.precision ?? 0)));
    if (v === this.value) return;
    this.setValue(v);
    this.v0 = v;
    this.paint(doc.activeElement === this.input);
    this.syncAria();
  }
  hold(dir, e, b) {
    if (e.button !== 0 || b.disabled) return;
    e.preventDefault(); // keep focus (and the mobile keyboard) where it is
    this.stepBy(dir);
    let n = 0;
    const tick = () => { this.stepBy(dir); n++; this._rep = setTimeout(tick, n > 12 ? 35 : 80); };
    this._rep = setTimeout(tick, 420);
    const offs = [on(doc, 'pointerup pointercancel', () => this.stopHold?.()), on(b, 'pointerleave', () => this.stopHold?.())];
    this.stopHold = () => { clearTimeout(this._rep); offs.forEach(f => f()); this.stopHold = null; };
  }
  getValidity() {
    const v = this.value;
    if (v == null) return null;
    if (this.min != null && v < this.min) return { flags: { rangeUnderflow: true }, message: t('validation.min', { min: format(this.min, this.fmtOpts()) }) };
    if (this.max != null && v > this.max) return { flags: { rangeOverflow: true }, message: t('validation.max', { max: format(this.max, this.fmtOpts()) }) };
    return null;
  }
  formValue() { return this.value == null ? null : String(this.value); }
  stepUp(n = 1) { this.stepBy(1, n); }
  stepDown(n = 1) { this.stepBy(-1, n); }
  clear() { this.setValue(null); this.paint(false); this.syncAria(); }
}
define('o-number', ONumber);

/* ── behavior for plain inputs ────────────────────────────────────────── */
const BH = new WeakMap();
behavior('data-o-number', el => {
  const d = el.dataset;
  const cfg = () => {
    const g = info({ locale: d.oNumberLocale, currency: d.oCurrency, percent: d.oNumber === 'percent' });
    return { ...g, maxFrac: d.oNumberPrecision != null ? +d.oNumberPrecision : g.frac ?? 10, neg: d.oNumberNegative != null || (d.oNumberMin != null && +d.oNumberMin < 0), grouping: d.oNumberGrouping !== 'false' };
  };
  const hidden = d.oNumberName ? h('input', { type: 'hidden', name: d.oNumberName }) : null;
  if (hidden) el.after(hidden);
  if (!el.hasAttribute('inputmode')) { el.setAttribute('inputmode', 'decimal'); el.__oIm = true; }
  let value = null, busy = false;
  const run = (full, e) => {
    if (busy) return;
    const c = cfg(), v = el.value, r = scan(v, el.selectionStart ?? v.length, c);
    let body = r.text, caret = r.caret;
    value = r.value;
    if (full && value != null) {
      let n = value;
      if (d.oNumberMin != null && n < +d.oNumberMin) n = +d.oNumberMin;
      if (d.oNumberMax != null && n > +d.oNumberMax) n = +d.oNumberMax;
      value = n;
      const p = c.maxFrac === 10 && c.frac == null ? null : c.maxFrac;
      body = (n < 0 ? '-' : '') + nf(c.locale, { useGrouping: c.grouping, minimumFractionDigits: p ?? 0, maximumFractionDigits: p ?? 10 }).format(Math.abs(n));
      caret = body.length;
    }
    const text = body ? c.preRaw + body + c.sufRaw : '';
    if (text !== v) {
      inSet.call(el, text);
      const cc = body ? c.preRaw.length + caret : 0;
      if (doc.activeElement === el) el.setSelectionRange(cc, cc);
      if (e) { e.stopImmediatePropagation(); busy = true; try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: e.inputType })); } finally { busy = false; } }
    }
    if (value == null) delete el.dataset.value; else el.dataset.value = String(value);
    if (hidden) hidden.value = value == null ? '' : String(value);
  };
  const offs = [
    on(el, 'input', e => { if (!e.isComposing) run(false, e); }),
    on(el, 'compositionend', () => run(false)),
    on(el, 'blur', () => run(true)),
    on(el, 'paste', e => {
      const n = parse(e.clipboardData?.getData('text/plain'), { locale: d.oNumberLocale });
      if (n == null) return;
      e.preventDefault();
      el.setRangeText(String(n).replace('.', cfg().decimal), el.selectionStart, el.selectionEnd, 'end');
      run(false);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    }),
    on(el, 'beforeinput', e => {
      const c = cfg();
      if (e.inputType === 'insertText' && (e.data === '.' || e.data === ',') && e.data !== c.decimal && c.maxFrac > 0 && !el.value.includes(c.decimal)) {
        e.preventDefault(); el.setRangeText(c.decimal, el.selectionStart, el.selectionEnd, 'end'); run(false);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: c.decimal }));
      }
    }),
  ];
  if (el.form) offs.push(on(el.form, 'reset', () => setTimeout(() => run(true))));
  BH.set(el, () => value);
  run(true);
  return () => { offs.forEach(f => f()); hidden?.remove(); if (el.__oIm) el.removeAttribute('inputmode'); delete el.dataset.value; BH.delete(el); };
});

O.number = { format, parse, info, value: el => BH.get($(el))?.() ?? null };
O.NumberInput = ONumber;
