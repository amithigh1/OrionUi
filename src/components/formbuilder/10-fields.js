// @deps validation, conditional, repeater
/* Dynamic form field registry.
 *   Orion.form.registerField('slug', {
 *     render(field, ctx) -> Element        ctx = { id, name, form, value }   (a named control inside is submitted & validated)
 *     getValue?(cell, field) -> any        setValue?(cell, value, field)      wrap?: true (label/help/error wrapper)
 *     group?: false (true -> <fieldset> + <legend>)   label?: true (false: the control renders its own label, e.g. a checkbox)
 *   })
 * Built-ins use Orion custom elements when they are registered (o-select, o-datepicker, o-timepicker, o-daterange, o-upload,
 * o-range, o-colorpicker, o-rating, o-tags, o-phone, o-number) and fall back to native controls. Set field.native = true to force native.
 */
i18n.add('en', { form: { submit: 'Submit', reset: 'Reset', choose: 'Choose…', loading: 'Loading form…', stars: '{n} of {max} stars', from: 'From', to: 'To' } });
const FU = () => O.formUtil;
const hasEl = tag => isBrowser && !!win.customElements && !!customElements.get(tag);
const useEl = (tag, f) => f.native !== true && hasEl(tag);
const jsonAttr = v => (v == null ? null : isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v));
/** [ 'a', { value, label } ] -> [{ value, label, disabled }] */
const normOptions = list => toArr(list).map(o => (isObj(o) ? { value: String(o.value ?? o.id ?? o.label), label: String(o.label ?? o.text ?? o.name ?? o.value), disabled: !!o.disabled, description: o.description } : { value: String(o), label: String(o) }));

function baseAttrs(f, c, extra = {}) {
  const a = { id: c.id, name: c.name, placeholder: f.placeholder, required: !!f.required, readonly: !!f.readonly || !!f.computed, disabled: !!f.disabled, autocomplete: f.autocomplete };
  if (isStr(f.rules)) a['data-o-rules'] = f.rules;
  if (f.messages) a['data-o-messages'] = JSON.stringify(f.messages);
  if (f.help) a['aria-describedby'] = c.id + '-help';
  return { ...a, ...extra, ...(f.attrs || {}) };
}
/** Create a native control and set its default through attributes so form.reset() restores it. */
function nativeInput(type, f, c, extra) {
  const el = h('input', { class: type === 'range' ? 'o-range' : 'o-input', type, ...baseAttrs(f, c, extra) });
  for (const k of ['min', 'max', 'step', 'minlength', 'maxlength', 'pattern', 'multiple', 'accept', 'inputmode']) if (f[k] != null && f[k] !== false) el.setAttribute(k, f[k] === true ? '' : f[k]);
  if (f.default != null && type !== 'file') el.defaultValue = String(f.default);
  return el;
}
function customEl(tag, f, c, props = {}) {
  const el = h(tag, baseAttrs(f, c));
  for (const [k, v] of Object.entries(props)) if (v != null) el.setAttribute(kebab(k), jsonAttr(v));
  if (f.default != null) el.setAttribute('value', jsonAttr(f.default));
  if (f.props) Object.assign(el, f.props);
  return el;
}
function nativeSelect(f, c, multiple) {
  const el = h('select', { class: 'o-select', multiple, ...baseAttrs(f, c), placeholder: null, readonly: null });
  fillSelect(el, f, c.options, multiple);
  if (multiple) el.size = Math.min(6, Math.max(3, c.options.length));
  return el;
}
function fillSelect(el, f, options, multiple) {
  const cur = el.options.length ? toArr(multiple ? [...el.selectedOptions].map(o => o.value) : el.value) : null;
  const defs = toArr(f.default).map(String);
  el.replaceChildren();
  if (!multiple) el.append(h('option', { value: '' }, f.placeholder || t('form.choose')));
  for (const o of options) {
    const opt = h('option', { value: o.value, disabled: o.disabled }, o.label);
    if (defs.includes(o.value)) opt.defaultSelected = true;
    el.append(opt);
  }
  if (cur) for (const o of el.options) if (cur.includes(o.value)) o.selected = true;
}
function choiceGroup(type, f, c) {
  const name = type === 'checkbox' ? c.name + '[]' : c.name, defs = toArr(f.default).map(String);
  const box = h('div', { class: cls('o-dform-options', f.inline && 'is-inline'), role: type === 'radio' ? 'radiogroup' : 'group' });
  c.options.forEach((o, i) => {
    const input = h('input', { type, name, value: o.value, id: `${c.id}-${i}`, disabled: o.disabled || f.disabled });
    if (i === 0 && f.required) input.required = true;
    if (type === 'radio' && f.required) input.required = true;
    if (i === 0 && isStr(f.rules)) input.setAttribute('data-o-rules', f.rules);
    if (defs.includes(o.value)) input.defaultChecked = true;
    box.append(h('label', { class: cls('o-check', f.inline && 'o-check-inline'), for: input.id }, input, h('span', { class: 'o-check-label' }, o.label, o.description ? h('span', { class: 'o-check-desc' }, o.description) : null)));
  });
  return box;
}
function starGroup(f, c) {
  const max = f.max || 5, box = h('div', { class: 'o-dform-stars', role: 'radiogroup' });
  for (let i = max; i >= 1; i--) {
    const input = h('input', { type: 'radio', name: c.name, value: String(i), id: `${c.id}-${i}`, required: !!f.required, class: 'o-sr-only' });
    if (String(f.default) === String(i)) input.defaultChecked = true;
    box.append(input, h('label', { for: input.id, title: t('form.stars', { n: i, max }) }, icon('star'), h('span', { class: 'o-sr-only' }, t('form.stars', { n: i, max }))));
  }
  return box;
}

const __fieldTypes = new Map();
const text = type => ({ render: (f, c) => nativeInput(type, f, c) });
const builtins = {
  text: text('text'), email: text('email'), password: text('password'), url: text('url'), tel: text('tel'), search: text('search'),
  number: { render: (f, c) => (useEl('o-number', f) ? customEl('o-number', f, c, { min: f.min, max: f.max, step: f.step }) : nativeInput('number', f, c)) },
  textarea: { render(f, c) { const el = h('textarea', { class: 'o-textarea', rows: f.rows || 4, ...baseAttrs(f, c) }); for (const k of ['minlength', 'maxlength']) if (f[k]) el.setAttribute(k, f[k]); if (f.default != null) el.defaultValue = String(f.default); return el; } },
  select: { render: (f, c) => (useEl('o-select', f) ? customEl('o-select', f, c, { options: c.options, searchable: f.searchable }) : nativeSelect(f, c, false)), setOptions(cell, f, opts) { const el = cell.querySelector('[name]'); if (!el) return; if (el.localName === 'select') fillSelect(el, f, opts, el.multiple); else el.options = opts; } },
  multiselect: { render: (f, c) => (useEl('o-select', f) ? customEl('o-select', f, c, { options: c.options, multiple: true }) : nativeSelect(f, c, true)), out: v => toArr(v) },
  radio: { group: true, render: (f, c) => choiceGroup('radio', f, c) },
  checkboxes: { group: true, render: (f, c) => choiceGroup('checkbox', f, c), out: v => toArr(v) },
  checkbox: { label: false, render(f, c) { const i = h('input', { type: 'checkbox', ...baseAttrs(f, c) }); if (f.default) i.defaultChecked = true; return h('label', { class: 'o-check', for: c.id }, i, h('span', { class: 'o-check-label' }, f.label || '')); }, out: v => v === true || v === 'on' },
  switch: { label: false, render(f, c) { const i = h('input', { type: 'checkbox', role: 'switch', ...baseAttrs(f, c) }); if (f.default) i.defaultChecked = true; return h('label', { class: 'o-switch', for: c.id }, i, h('span', f.label || '')); }, out: v => v === true || v === 'on' },
  date: { render: (f, c) => (useEl('o-datepicker', f) ? customEl('o-datepicker', f, c, { min: f.min, max: f.max }) : nativeInput('date', f, c)) },
  time: { render: (f, c) => (useEl('o-timepicker', f) ? customEl('o-timepicker', f, c) : nativeInput('time', f, c)) },
  datetime: { render: (f, c) => nativeInput('datetime-local', f, c) },
  daterange: {
    render(f, c) {
      if (useEl('o-daterange', f)) return customEl('o-daterange', f, c);
      const d = f.default || {};
      const a = nativeInput('date', { ...f, default: d.start, attrs: { 'aria-label': (f.label || '') + ' ' + t('form.from') } }, { id: c.id, name: c.name + '[start]' });
      const b = nativeInput('date', { ...f, default: d.end, rules: 'after_or_equal:' + c.name + '[start]', attrs: { 'aria-label': (f.label || '') + ' ' + t('form.to') } }, { id: c.id + '-end', name: c.name + '[end]' });
      return h('div', { class: 'o-dform-range' }, a, h('span', { class: 'o-dform-range-sep', 'aria-hidden': 'true' }, '→'), b);
    },
  },
  file: { render: (f, c) => (useEl('o-upload', f) ? customEl('o-upload', f, c, { accept: f.accept, multiple: f.multiple }) : nativeInput('file', f, c)) },
  range: {
    render(f, c) {
      if (useEl('o-range', f)) return customEl('o-range', f, c, { min: f.min, max: f.max, step: f.step });
      const el = nativeInput('range', { min: 0, max: 100, ...f }, c);
      const out = h('output', { class: 'o-dform-range-value', for: c.id }, el.value);
      el.addEventListener('input', () => { out.textContent = f.format ? f.format(+el.value) : el.value; });
      return h('div', { class: 'o-dform-slider' }, el, out);
    },
  },
  color: { render: (f, c) => (useEl('o-colorpicker', f) ? customEl('o-colorpicker', f, c) : nativeInput('color', f, c)) },
  rating: { group: true, render: (f, c) => (useEl('o-rating', f) ? customEl('o-rating', f, c, { max: f.max }) : starGroup(f, c)), out: v => (v == null || v === '' ? null : +v) },
  tags: {
    render: (f, c) => (useEl('o-tags', f) ? customEl('o-tags', f, c) : nativeInput('text', { ...f, default: toArr(f.default).join(', '), placeholder: f.placeholder || 'tag1, tag2' }, c)),
    out: v => (Array.isArray(v) ? v : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)), in: (v, f) => (useEl('o-tags', f) ? v : toArr(v).join(', ')),
  },
  phone: { render: (f, c) => (useEl('o-phone', f) ? customEl('o-phone', f, c) : nativeInput('tel', { autocomplete: 'tel', ...f }, c)) },
  currency: {
    render(f, c) {
      const cur = f.currency || O.config.currency || 'USD';
      const sym = (() => { try { return new Intl.NumberFormat(i18n.locale, { style: 'currency', currency: cur }).formatToParts(0).find(p => p.type === 'currency').value; } catch { return cur; } })();
      const el = nativeInput('text', { inputmode: 'decimal', ...f, rules: f.rules || 'number' }, c);
      return h('div', { class: 'o-input-group' }, h('span', { class: 'o-input-addon' }, sym), el);
    },
    out: v => (v === '' || v == null ? null : fmt.parseNumber(v)),
  },
  hidden: { wrap: false, render: (f, c) => { const el = h('input', { type: 'hidden', name: c.name, id: c.id }); if (f.default != null) el.defaultValue = String(f.default); return el; } },
  html: { wrap: false, render: f => h('div', { class: 'o-dform-html', html: f.trusted ? String(isFn(f.html) ? f.html() : f.html ?? '') : sanitize(String(isFn(f.html) ? f.html() : f.html ?? '')) }) },
};
for (const [k, v] of Object.entries(builtins)) __fieldTypes.set(k, v);
