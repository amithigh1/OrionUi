/* Conditional fields — show / hide / enable / require parts of a form from other fields' values.
 *   <div data-o-show-if="country=MY">…</div>          also: country!=MY · country in:MY,SG · country=in:MY,SG · age>17 · age<=65
 *   <div data-o-hide-if="agree checked">              ops: checked · unchecked · empty · notEmpty · bare name (truthy) · !name
 *   <input data-o-enable-if="plan=pro"> <div data-o-require-if="type=company && vat notEmpty || country in:MY,SG">
 *   && binds tighter than ||, parentheses and ! are allowed. Field names resolve inside the closest <form> / [data-o-scope]
 *   (inside <o-repeater> rows a bare name matches the sibling field "items[0][name]").
 *   Hidden parts are disabled (excluded from submit & validation) and animated with collapse(). Fires o-condition { kind, shown|on }.
 *   Orion.conditional.evaluate(expr, formOrValues) -> bool   Orion.conditional.test(cond, values)   Orion.conditional.refresh(form)
 *   Orion.conditional.watch(el, { showIf, hideIf, enableIf, requireIf }, root) -> off()   (cond = string | {field, op, value} | fn(values) | array)
 */

/* ── expression parser ── */
function tokenize(s) {
  const out = [];
  let buf = '';
  const flush = () => { const x = buf.trim(); if (x) out.push({ t: 'atom', v: x }); buf = ''; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if ((c === '&' && n === '&') || (c === '|' && n === '|')) { flush(); out.push({ t: c + n }); i++; }
    else if (c === '(' && !buf.trim()) out.push({ t: '(' });
    else if (c === ')') { flush(); out.push({ t: ')' }); }
    else if (c === '!' && n !== '=' && !buf.trim()) out.push({ t: '!' });
    else buf += c;
  }
  flush();
  return out;
}
const OPS = { '=': 'eq', '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le' };
function parseAtom(s) {
  let m = s.match(/^(\S+?)\s+(not\s+in|!in|in)\s*:?\s*(.*)$/i) || s.match(/^(\S+?)\s*(!=|=)\s*(in):(.*)$/i);
  if (m) {
    if (m[3] && /^in$/i.test(m[3]) && m[4] != null) return { field: m[1], op: m[2] === '!=' ? 'notIn' : 'in', value: m[4] };
    return { field: m[1], op: /^(not\s+in|!in)$/i.test(m[2]) ? 'notIn' : 'in', value: m[3] };
  }
  m = s.match(/^(\S+?)\s*[:\s]\s*(checked|unchecked|empty|notempty|filled|blank)$/i);
  if (m) { const o = m[2].toLowerCase(); return { field: m[1], op: o === 'notempty' || o === 'filled' ? 'notEmpty' : o === 'blank' ? 'empty' : o }; }
  m = s.match(/^([^\s=!<>]+)\s*(!=|==|>=|<=|=|>|<)\s*(.*)$/);
  if (m) return { field: m[1], op: OPS[m[2]], value: m[3].trim().replace(/^(['"])(.*)\1$/, '$2') };
  return { field: s.trim(), op: 'truthy' };
}
/** parse(expr) -> AST: { or: [...] } | { and: [...] } | { not } | atom */
function parseExpr(expr) {
  const toks = tokenize(String(expr || ''));
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function primary() {
    const tk = next();
    if (!tk) return { op: 'true' };
    if (tk.t === '!') return { not: primary() };
    if (tk.t === '(') { const e = orExpr(); if (peek() && peek().t === ')') i++; return e; }
    if (tk.t === 'atom') return parseAtom(tk.v);
    return { op: 'true' };
  }
  function andExpr() { const l = [primary()]; while (peek() && peek().t === '&&') { i++; l.push(primary()); } return l.length > 1 ? { and: l } : l[0]; }
  function orExpr() { const l = [andExpr()]; while (peek() && peek().t === '||') { i++; l.push(andExpr()); } return l.length > 1 ? { or: l } : l[0]; }
  return orExpr();
}

/* ── evaluation ── */
const emptyV = v => v == null || v === false || v === '' || (isStr(v) && !v.trim()) || (Array.isArray(v) && !v.length);
function eqV(a, b) {
  b = String(b ?? '');
  if (Array.isArray(a)) return a.map(String).includes(b);
  if (a === true) return /^(true|1|yes|on|checked)$/i.test(b);
  if (a === false || a == null) return /^(false|0|no|off|)$/i.test(b) && (a != null || b === '');
  return String(a) === b;
}
function cmpV(a, b) {
  const x = parseFloat(a), y = parseFloat(b);
  if (Number.isFinite(x) && Number.isFinite(y) && /^\s*-?[\d.]+\s*$/.test(String(b))) return x - y;
  const d1 = date.parse(a), d2 = date.parse(b);
  if (d1 && d2) return +d1 - +d2;
  return String(a ?? '').localeCompare(String(b ?? ''));
}
const listOf = v => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean));
function atomTest(a, get) {
  const v = get(a.field);
  switch (a.op) {
    case 'eq': return eqV(v, a.value);
    case 'ne': return !eqV(v, a.value);
    case 'gt': return !emptyV(v) && cmpV(v, a.value) > 0;
    case 'lt': return !emptyV(v) && cmpV(v, a.value) < 0;
    case 'ge': return !emptyV(v) && cmpV(v, a.value) >= 0;
    case 'le': return !emptyV(v) && cmpV(v, a.value) <= 0;
    case 'in': { const l = listOf(a.value); return toArr(v).some(x => l.includes(String(x))); }
    case 'notIn': { const l = listOf(a.value); return !toArr(v).some(x => l.includes(String(x))); }
    case 'contains': return Array.isArray(v) ? v.map(String).includes(String(a.value)) : String(v ?? '').includes(String(a.value));
    case 'checked': case 'notEmpty': case 'truthy': return !emptyV(v) && v !== 'false' && v !== '0';
    case 'unchecked': case 'empty': return emptyV(v) || v === 'false';
    case 'true': return true;
  }
  return false;
}
function evalAst(n, get) {
  if (n.or) return n.or.some(x => evalAst(x, get));
  if (n.and) return n.and.every(x => evalAst(x, get));
  if (n.not) return !evalAst(n.not, get);
  return atomTest(n, get);
}

/* ── reading values from the DOM ── */
const __cond = new WeakMap(); // control -> { n, mine } (disabled by us)
const __req = new WeakMap();  // control -> { n, mine } (required by us)
const condOff = el => (__cond.get(el)?.n || 0) > 0;
const selEsc = s => (win.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
function readValue(root, name, from) {
  let els = [];
  const row = from && from.closest && from.closest('.o-repeater-row');
  if (row && !name.includes('[')) els = $$(`[name$="[${selEsc(name)}]"],[name$="[${selEsc(name)}][]"]`, row);
  if (!els.length) els = $$(`[name="${selEsc(name)}"]`, root);
  if (!els.length && !name.endsWith('[]')) els = $$(`[name="${selEsc(name)}[]"]`, root);
  els = els.filter(el => !condOff(el));
  if (!els.length) return '';
  const el = els[0], type = el.type;
  if (el.localName.includes('-') && 'value' in el) return el.value;
  if (type === 'radio') return (els.find(x => x.checked) || {}).value ?? '';
  if (type === 'checkbox') {
    if (els.length > 1 || el.name.endsWith('[]')) return els.filter(x => x.checked).map(x => x.value);
    return el.checked ? (el.hasAttribute('value') ? el.value : true) : false;
  }
  if (el.tagName === 'SELECT' && el.multiple) return [...el.selectedOptions].map(o => o.value);
  return el.value;
}
function objGetter(values) {
  return name => {
    if (!values) return undefined;
    if (name in values) return values[name];
    let o = values;
    for (const k of String(name).replace(/\]/g, '').split(/[[.]/)) { if (k === '') continue; if (o == null) return undefined; o = o[k]; }
    return o;
  };
}
/** test(cond, values|getter) -> bool ; cond: string | {field, op, value} | fn(values) | array (all) | {any: [...]} */
function testCond(cond, values, get) {
  get = get || (isFn(values) ? values : objGetter(values));
  if (cond == null || cond === true) return true;
  if (cond === false) return false;
  if (isFn(cond)) return !!cond(isFn(values) ? {} : values);
  if (isStr(cond)) return evalAst(parseExpr(cond), get);
  if (Array.isArray(cond)) return cond.every(c => testCond(c, values, get));
  if (cond.any) return toArr(cond.any).some(c => testCond(c, values, get));
  if (cond.all) return toArr(cond.all).every(c => testCond(c, values, get));
  const op = { '=': 'eq', '==': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le', in: 'in', notIn: 'notIn', 'not in': 'notIn', empty: 'empty', notEmpty: 'notEmpty', checked: 'checked', contains: 'contains' }[cond.op || '='] || cond.op;
  return atomTest({ field: cond.field, op, value: Array.isArray(cond.value) ? cond.value.join(',') : cond.value }, get);
}

/* ── applying states ── */
const isCtl = el => /^(input|select|textarea|button|fieldset)$/.test(el.localName) || (el.localName.includes('-') && 'disabled' in el && 'value' in el);
const ctlsIn = el => [...(isCtl(el) ? [el] : []), ...$$('input,select,textarea,button,fieldset,[name]', el).filter(isCtl)];
function hold(map, ctl, on, prop) {
  let s = map.get(ctl);
  if (!s) map.set(ctl, (s = { n: 0, mine: false }));
  if (on) { if (s.n++ === 0 && !ctl[prop]) { ctl[prop] = true; s.mine = true; } }
  else if (s.n > 0 && --s.n === 0 && s.mine) { ctl[prop] = false; s.mine = false; }
}
const targetOfCond = el => (/^(input|select|textarea)$/.test(el.localName) || (el.localName.includes('-') && 'value' in el) ? el.closest('.o-field') || el : el);

const __items = new Map(); // root -> Set(item)
const __listening = new WeakMap();
function scheduleRoot(root) {
  if (root.__oCondQ) return;
  root.__oCondQ = true;
  queueMicrotask(() => { root.__oCondQ = false; runRoot(root, true); });
}
function runRoot(root, animated) {
  const set = __items.get(root);
  if (!set) return;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const it of set) if (applyItem(it, animated)) changed = true;
    if (!changed) break;
  }
}
function applyItem(it, animated) {
  let res;
  try { res = !!it.test(); } catch (e) { console.error('[Orion] condition failed:', it.expr, e); return false; }
  if (it.state === res) return false;
  const first = it.state === undefined;
  it.state = res;
  const el = it.target;
  if (it.kind === 'show' || it.kind === 'hide') {
    const show = it.kind === 'show' ? res : !res;
    if (first && show) { if (el.hidden) { el.hidden = false; return true; } return false; }
    ctlsIn(el).forEach(c => hold(__cond, c, !show, 'disabled'));
    el.classList.toggle('is-cond-hidden', !show);
    if (animated && !first) collapse(el, show, { duration: 200 }); else el.hidden = !show;
    emit(el, 'o-condition', { kind: 'show', shown: show });
    return true;
  }
  if (it.kind === 'enable') {
    if (first && res) return false;
    ctlsIn(el).forEach(c => hold(__cond, c, !res, 'disabled'));
    el.classList.toggle('is-disabled', !res);
    if (!isCtl(el)) { if (res) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', 'true'); }
    emit(el, 'o-condition', { kind: 'enable', on: res });
    return true;
  }
  if (it.kind === 'require') {
    if (first && !res) return false;
    ctlsIn(el).filter(c => !/^(button|fieldset)$/.test(c.localName) && c.type !== 'hidden').forEach(c => hold(__req, c, res, 'required'));
    const box = el.classList.contains('o-field') ? el : el.closest('.o-field') || el;
    $$('.o-label', box).slice(0, 1).forEach(l => l.classList.toggle('is-required', res));
    emit(el, 'o-condition', { kind: 'require', on: res });
    return false;
  }
  return false;
}
function releaseItem(it) {
  const el = it.target;
  if (it.state === undefined || !el.isConnected) return;
  const off = it.kind === 'show' ? !it.state : it.kind === 'hide' ? it.state : it.kind === 'enable' ? !it.state : false;
  if (it.kind === 'require' && it.state) ctlsIn(el).filter(c => !/^(button|fieldset)$/.test(c.localName) && c.type !== 'hidden').forEach(c => hold(__req, c, false, 'required'));
  if (off) {
    ctlsIn(el).forEach(c => hold(__cond, c, false, 'disabled'));
    if (it.kind !== 'enable') el.hidden = false;
    el.classList.remove('is-cond-hidden', 'is-disabled');
    el.removeAttribute('aria-disabled');
  }
}
function condRoot(el) { return el.closest('form') || el.closest('[data-o-scope]') || doc.body; }
/** register(el, kind, test(get)=>bool | expr, root) -> off() */
function registerCond(el, kind, cond, root) {
  root = root || condRoot(el);
  const get = name => readValue(root, name, el);
  const ast = isStr(cond) ? parseExpr(cond) : null;
  const it = { el, target: targetOfCond(el), kind, expr: cond, root, state: undefined, test: ast ? () => evalAst(ast, get) : () => testCond(cond, isFn(cond) ? (root.__oValues ? root.__oValues() : {}) : null, get) };
  let set = __items.get(root);
  if (!set) __items.set(root, (set = new Set()));
  set.add(it);
  if (!__listening.get(root)) {
    const sch = () => scheduleRoot(root);
    const offs = [on(root, 'input change o-change', sch), on(root, 'reset', () => setTimeout(sch, 0))];
    __listening.set(root, () => offs.forEach(f => f()));
  }
  runRoot(root, false);
  return () => {
    set.delete(it);
    releaseItem(it);
    if (!set.size) { __items.delete(root); const off = __listening.get(root); if (off) { off(); __listening.delete(root); } }
  };
}

for (const [attr, kind] of [['data-o-show-if', 'show'], ['data-o-hide-if', 'hide'], ['data-o-enable-if', 'enable'], ['data-o-require-if', 'require']]) {
  behavior(attr, (el, expr) => registerCond(el, kind, expr));
}

O.conditional = {
  parse: parseExpr,
  /** evaluate('country=MY && age>17', formElement | valuesObject) -> bool */
  evaluate(expr, src, from) {
    const get = src instanceof Element ? name => readValue(src, name, from) : objGetter(src || {});
    return evalAst(parseExpr(expr), get);
  },
  test: (cond, values) => testCond(cond, values),
  /** watch(el, { showIf, hideIf, enableIf, requireIf }, root) -> off() */
  watch(el, conds = {}, root) {
    const offs = [];
    for (const [k, kind] of [['showIf', 'show'], ['hideIf', 'hide'], ['enableIf', 'enable'], ['requireIf', 'require']]) if (conds[k] != null) offs.push(registerCond(el, kind, conds[k], root));
    return () => offs.forEach(f => f());
  },
  /** Re-evaluate every condition in a form (after programmatic value changes). */
  refresh(root) { if (root) runRoot($(root), true); else __items.forEach((_, r) => runRoot(r, true)); },
};
