/* Dynamic forms from a JSON schema.
 *   <o-form schema='{ "fields": [ … ], "layout": { "columns": 2 } }'></o-form>      or      Orion.form(el, schema, { onSubmit })
 *   schema = {
 *     fields: [{ name, type, label, placeholder, help, options (array | async (values) => array), dependsOn: ['country'], default,
 *                rules, required, col (1-12), showIf / hideIf / enableIf / requiredIf ({ field, op, value } | 'expr' | fn(values)),
 *                computed: fn(values), attrs, props, native, fields (group / repeater), min, max, addText, itemLabel }],
 *     layout: { columns: 2, sections: [{ title, description, fields: ['name', …], columns }] },
 *     submitText, resetText, actions: false, live: 'blur', summary: false, messages: { field: { rule: 'msg' } }
 *   }
 *   Props: schema, onSubmit(data, el) (return { errors } to map server errors). Methods: getData(), setData(obj), validate(),
 *   reset(), setSchema(schema), getField(name). Events: o-submit { data } (cancelable), o-change { name, value, values }, o-ready.
 *   (function conditions / computed values are not supported inside repeater rows — use string or object conditions there.)
 */
const OPSTR = { '=': '=', '==': '=', eq: '=', '!=': '!=', ne: '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
function condToExpr(c) {
  if (c == null || isFn(c)) return null;
  if (isStr(c)) return c;
  if (c === true) return null;
  if (Array.isArray(c) || c.all) { const p = toArr(c.all || c).map(condToExpr); return p.every(Boolean) ? p.map(x => '(' + x + ')').join(' && ') : null; }
  if (c.any) { const p = toArr(c.any).map(condToExpr); return p.every(Boolean) ? p.map(x => '(' + x + ')').join(' || ') : null; }
  const op = c.op || '=', v = Array.isArray(c.value) ? c.value.join(',') : c.value ?? '';
  if (op === 'in' || op === 'notIn' || op === 'not in') return `${c.field} ${op === 'in' ? 'in' : 'not in'}:${v}`;
  if (['empty', 'notEmpty', 'checked', 'unchecked'].includes(op)) return `${c.field} ${op}`;
  return `${c.field}${OPSTR[op] || '='}${v}`;
}
const COND_ATTR = { showIf: 'data-o-show-if', hideIf: 'data-o-hide-if', enableIf: 'data-o-enable-if', requiredIf: 'data-o-require-if', requireIf: 'data-o-require-if' };
const selQ = s => (win.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

class OForm extends OElement {
  static props = { schema: { type: Object, default: () => ({}) }, onSubmit: { type: Function, attr: false }, texts: Object };
  setup() {
    this.classList.add('o-dform');
    this._opts = new Map();
    this._offConds = [];
    if (!Object.keys(this.schema || {}).length) {
      const s = this.querySelector(':scope > script[type="application/json"]');
      if (s) this._p.schema = parseJSON(s.textContent, {});
    }
    this._outer = !!(this.parentElement && this.parentElement.closest('form'));
    this._form = h(this._outer ? 'div' : 'form', { class: 'o-dform-form', novalidate: !this._outer });
    this.append(this._form);
    on(this, 'o-change', e => { if (e.target !== this) e.stopPropagation(); });
    on(this._form, 'input change', e => this._onInput(e));
    on(this._form, 'reset', () => setTimeout(() => this._compute(), 0));
  }
  disconnected() { this._offConds.forEach(f => f()); this._offConds = []; this._condsDirty = true; }
  connected() { if (this._condsDirty && this._fnConds) { this._condsDirty = false; this._watchFns(); } }
  update(changed) { if (changed.has('schema') || changed.has('init') || changed.has('locale')) this._render(); }
  setSchema(schema) { this.schema = schema; }
  get validator() { return this._v || null; }
  get form() { return this._form; }

  _all(fields = this.schema.fields, out = []) { for (const f of toArr(fields)) { out.push(f); if (f.fields) this._all(f.fields, out); } return out; }
  _defaults() { const d = {}; for (const f of this._all()) if (f.name && f.default !== undefined) d[f.name] = f.default; return d; }
  async _render() {
    const seq = (this._seq = (this._seq || 0) + 1), s = this.schema || {};
    const keep = this._rendered ? this.getData() : null;
    const async = this._all().filter(f => isFn(f.options) && !this._opts.has(f));
    if (async.length) {
      if (!this._rendered) this._form.replaceChildren(h('div', { class: 'o-dform-loading', 'aria-busy': 'true', 'aria-label': t('form.loading') }, ...[1, 2, 3].map(() => h('div', null, h('div', { class: 'o-skeleton o-skeleton-text', style: 'width:30%' }), h('div', { class: 'o-skeleton', style: 'height:var(--o-control-h)' })))));
      const vals = { ...this._defaults(), ...(keep || {}) };
      await Promise.all(async.map(async f => { try { this._opts.set(f, normOptions(await f.options(vals))); } catch (e) { console.error('[Orion] o-form options failed:', f.name, e); this._opts.set(f, []); } }));
      if (seq !== this._seq) return;
    }
    this._offConds.forEach(f => f());
    this._offConds = [];
    this._fnConds = [];
    const cols = (s.layout && s.layout.columns) || s.columns || 1, content = [];
    const secs = s.layout && s.layout.sections;
    if (secs && secs.length) {
      const used = new Set();
      for (const sec of secs) {
        const fs = toArr(sec.fields).map(n => (isStr(n) ? toArr(s.fields).find(f => f.name === n) : n)).filter(Boolean);
        fs.forEach(f => used.add(f));
        content.push(h('section', { class: 'o-dform-section' }, sec.title ? h('h3', { class: 'o-dform-section-title' }, sec.title) : null,
          sec.description ? h('p', { class: 'o-dform-section-desc' }, sec.description) : null, this._grid(fs, { cols: sec.columns || cols })));
      }
      const rest = toArr(s.fields).filter(f => !used.has(f));
      if (rest.length) content.push(this._grid(rest, { cols }));
    } else content.push(this._grid(s.fields, { cols }));
    if (s.actions !== false && !this._outer) {
      content.push(h('div', { class: 'o-form-actions' }, s.resetText ? h('button', { type: 'reset', class: 'o-btn' }, s.resetText) : null,
        h('button', { type: 'submit', class: 'o-btn o-btn-primary' }, s.submitText || this.t('form.submit'))));
    }
    this._form.replaceChildren(...content);
    if (O.validate) {
      const rules = {}, messages = {};
      for (const f of this._topFields()) { if (f.rules && !isStr(f.rules)) rules[f._name] = f.rules; if (f.messages) messages[f._name] = f.messages; }
      if (this._v) { this._v.clear(); Object.assign(this._v.opts, { rules, messages }); }
      else this._v = O.validate(this._form, { live: s.live || 'blur', summary: s.summary || false, rules, messages, onSubmit: () => this._submit() });
    }
    this._form.__oValues = () => this.getData();
    this._watchFns();
    this._rendered = true;
    if (keep) this.setData(keep, { silent: true });
    this._compute();
    this.emit('ready', {});
  }
  _watchFns() { if (O.conditional) for (const [cell, fns] of this._fnConds || []) this._offConds.push(O.conditional.watch(cell, fns, this._form)); }
  /** Top-level + group fields (not repeater rows) with their DOM names in f._name. */
  _topFields(fields = this.schema.fields, prefix = '', out = []) {
    for (const f of toArr(fields)) {
      const name = f.name ? (prefix ? `${prefix}[${f.name}]` : f.name) : '';
      if (f.type === 'group') { this._topFields(f.fields, f.name ? name : prefix, out); continue; }
      if (f.type === 'repeater' || !name) continue;
      Object.defineProperty(f, '_name', { value: name, configurable: true, enumerable: false, writable: true });
      out.push(f);
    }
    return out;
  }
  _grid(fields, ctx) {
    const grid = h('div', { class: 'o-dform-grid' });
    for (const f of toArr(fields)) { const c = this._cell(f, ctx); if (c) grid.append(c); }
    return grid;
  }
  _cell(f, { prefix = '', inRep = false, cols = 1 } = {}) {
    const type = f.type || 'text', name = f.name ? (prefix ? `${prefix}[${f.name}]` : f.name) : '', id = uid('o-df');
    const span = clamp(Math.round(+f.col || 12 / cols), 1, 12);
    let cell;
    if (type === 'group') {
      cell = h('fieldset', { class: 'o-fieldset o-dform-cell o-dform-group', style: `--o-span:${span}` }, f.label ? h('legend', null, f.label) : null, f.description ? h('p', { class: 'o-help o-dform-group-desc' }, f.description) : null);
      cell.append(this._grid(f.fields, { prefix: f.name ? name : prefix, inRep, cols: f.columns || cols }));
    } else if (type === 'repeater') {
      const rep = h('o-repeater', { name, min: f.min, max: f.max, 'add-text': f.addText, 'item-label': f.itemLabel, sortable: !!f.sortable, initial: f.initial });
      const tpl = h('template');
      tpl.content.append(this._grid(f.fields, { inRep: true, cols: f.columns || cols }));
      rep.append(tpl);
      if (Array.isArray(f.default)) rep.setAttribute('value', JSON.stringify(f.default));
      cell = h('div', { class: 'o-field o-dform-cell o-dform-repeater', style: `--o-span:${span}` }, f.label ? h('div', { class: 'o-label' }, f.label) : null, f.help ? h('div', { class: 'o-help' }, f.help) : null, rep);
    } else {
      const def = __fieldTypes.get(type) || __fieldTypes.get('text');
      const ctx = { id, name, form: this, field: f, value: f.default, options: this._opts.get(f) || (isFn(f.options) ? [] : normOptions(f.options)) };
      let ctl;
      try { ctl = def.render(f, ctx); } catch (e) { console.error('[Orion] o-form: field "' + name + '" failed to render:', e); return null; }
      if (def.wrap === false) return ctl;
      const group = !!def.group, req = f.required || (isStr(f.rules) && /(^|\|)required(\||:|$)/.test(f.rules));
      cell = h(group ? 'fieldset' : 'div', { class: cls('o-field o-dform-cell', 'o-dform-' + type, f.computed && 'is-computed'), style: `--o-span:${span}`, 'data-o-dfield': name });
      if (def.label !== false && f.label) cell.append(h(group ? 'legend' : 'label', { class: cls('o-label', req && 'is-required'), for: group ? null : id }, f.label));
      cell.append(ctl);
      if (f.help) cell.append(h('div', { class: 'o-help', id: id + '-help' }, f.help));
    }
    const fns = {};
    for (const [k, attr] of Object.entries(COND_ATTR)) {
      if (f[k] == null) continue;
      const expr = condToExpr(f[k]);
      if (expr) cell.setAttribute(attr, expr);
      else if (isFn(f[k]) && !inRep) fns[k === 'requiredIf' ? 'requireIf' : k] = f[k];
    }
    if (Object.keys(fns).length) this._fnConds.push([cell, fns]);
    return cell;
  }

  /* ── values ── */
  _transform(obj, fields, dir) {
    if (!obj || typeof obj !== 'object') return;
    for (const f of toArr(fields)) {
      if (f.type === 'group') { this._transform(f.name ? obj[f.name] : obj, f.fields, dir); continue; }
      if (!f.name || !(f.name in obj)) continue;
      if (f.type === 'repeater') { toArr(obj[f.name]).forEach(r => this._transform(r, f.fields, dir)); continue; }
      const def = __fieldTypes.get(f.type || 'text');
      if (def && def[dir]) obj[f.name] = def[dir](obj[f.name], f);
    }
  }
  getData() {
    const fu = O.formUtil, data = fu.serialize(this._form);
    this._transform(data, this.schema.fields, 'out');
    for (const f of this._topFields()) {
      const def = __fieldTypes.get(f.type || 'text');
      if (def && isFn(def.getValue)) { const cell = this.getField(f._name); if (cell) fu.setByName(data, f._name, def.getValue(cell, f)); }
    }
    return data;
  }
  setData(obj = {}, { silent = false } = {}) {
    const fu = O.formUtil, data = clone(obj);
    this._transform(data, this.schema.fields, 'in');
    fu.fill(this._form, data, { events: !silent });
    for (const f of this._topFields()) {
      const def = __fieldTypes.get(f.type || 'text'), v = fu.getByName(data, f._name);
      if (def && isFn(def.setValue) && v !== undefined) { const cell = this.getField(f._name); if (cell) def.setValue(cell, v, f); }
    }
    if (O.conditional) O.conditional.refresh(this._form);
    this._compute();
  }
  getField(name) { return this._form.querySelector(`[data-o-dfield="${selQ(name)}"]`) || this._form.querySelector(`[name="${selQ(name)}"]`); }
  validate() { return this._v ? this._v.validate() : Promise.resolve(this._form.checkValidity ? this._form.checkValidity() : true); }
  reset() {
    if (this._form.tagName === 'FORM') this._form.reset();
    else for (const el of O.formUtil.formFields(this._form)) {
      if (el.formResetCallback) el.formResetCallback();
      else if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked;
      else if (el.tagName === 'SELECT') [...el.options].forEach(o => { o.selected = o.defaultSelected; });
      else el.value = el.defaultValue;
    }
    if (this._v) this._v.clear();
    if (O.conditional) O.conditional.refresh(this._form);
    this._compute();
  }
  async _submit() {
    const data = this.getData();
    if (!this.emit('submit', { data })) return;
    if (isFn(this.onSubmit)) return this.onSubmit(data, this);
  }
  _compute() {
    const comp = this._topFields().filter(f => isFn(f.computed));
    if (!comp.length) return;
    const values = this.getData();
    for (const f of comp) {
      let v;
      try { v = f.computed(values); } catch (e) { console.error('[Orion] computed field failed:', f.name, e); continue; }
      const el = this._form.querySelector(`[name="${selQ(f._name)}"]`);
      const s = v == null || (isNum(v) && !Number.isFinite(v)) ? '' : String(v);
      if (el && el.value !== s) el.value = s;
    }
  }
  _onInput(e) {
    let host = e.target;
    for (let n = host.parentElement; n && n !== this._form; n = n.parentElement) if (n.localName.includes('-') && 'value' in n && (n.getAttribute('name') || n.name)) host = n;
    const name = (host.getAttribute && host.getAttribute('name')) || (isStr(host.name) ? host.name : '');
    this._compute();
    if (name) this._deps(name);
    if (this._chQ) return;
    this._chQ = true;
    queueMicrotask(() => {
      this._chQ = false;
      const values = this.getData();
      this.emit('change', { name, value: name ? O.formUtil.getByName(values, name.replace(/\[\]$/, '')) : undefined, values });
    });
  }
  _deps(name) {
    const key = O.formUtil.nameKey(name);
    for (const f of this._topFields()) {
      if (!isFn(f.options) || !toArr(f.dependsOn).some(d => O.formUtil.nameKey(d) === key)) continue;
      const seqs = this._depSeq || (this._depSeq = new Map()), seq = (seqs.get(f) || 0) + 1;
      seqs.set(f, seq);
      Promise.resolve(f.options(this.getData())).then(list => {
        if (seq !== seqs.get(f)) return;
        const opts = normOptions(list), cell = this.getField(f._name), def = __fieldTypes.get(f.type);
        this._opts.set(f, opts);
        if (cell && def && def.setOptions) def.setOptions(cell.closest('.o-dform-cell') || cell, f, opts);
      }).catch(err => console.error('[Orion] o-form options failed:', f.name, err));
    }
  }
}
define('o-form', OForm);
O.FormBuilder = OForm;

/** Orion.form(elementOrSelector, schema, { onSubmit }) -> <o-form> (created inside the target unless it is one) */
O.form = function (target, schema, opts = {}) {
  let el = $(target);
  if (!el) throw new Error('Orion.form: target not found');
  if (el.localName !== 'o-form') { const f = h('o-form'); el.append(f); el = f; }
  if (opts.onSubmit) el.onSubmit = opts.onSubmit;
  if (schema) el.schema = schema;
  return el;
};
O.form.registerField = (type, def) => { __fieldTypes.set(type, def); return O.form; };
O.form.types = () => [...__fieldTypes.keys()];
