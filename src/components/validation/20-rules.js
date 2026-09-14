/* Validation rules registry + parser.
 *   Orion.validate.rule('even', (value, params, field, form, ctx) => +value % 2 === 0, 'Must be an even number')
 *   message: string ({label}, {0}, {1}… placeholders, or an i18n key) | (params, ctx) => string
 *   A rule returns true / false / a message string / a Promise of those. Empty values skip every rule
 *   except required, accepted and required_if / required_with.
 */
i18n.add('en', {
  validation: {
    integer: 'Enter a whole number', alpha: 'Use letters only', alphanum: 'Use letters and numbers only', alphaDash: 'Use letters, numbers, dashes and underscores only',
    digits: 'Must be exactly {digits} digits', digitsOnly: 'Use digits only', between: 'Must be between {min} and {max}',
    betweenLength: 'Must be between {min} and {max} characters', minItems: 'Select at least {min}', maxItems: 'Select at most {max}',
    betweenItems: 'Select between {min} and {max}', minDate: 'Must be on or after {date}', maxDate: 'Must be on or before {date}',
    same: 'Must match {other}', different: 'Must be different from {other}', date: 'Enter a valid date',
    before: 'Must be before {date}', after: 'Must be after {date}', beforeOrEqual: 'Must be on or before {date}', afterOrEqual: 'Must be on or after {date}',
    in: 'Select a valid option', notIn: 'This value is not allowed', accepted: 'You must accept this to continue',
    filesize: 'Each file must be {size} or smaller', filetype: 'This file type is not allowed ({types})',
    dimensions: 'The image dimensions are not allowed', phone: 'Enter a valid phone number',
    remote: 'This value is not available', checking: 'Checking…', remoteError: 'Could not verify this value, try again',
    summary: { one: 'There is {count} problem with this form', other: 'There are {count} problems with this form' },
    success: 'Looks good', submitError: 'Something went wrong. Please try again.', submitting: 'Submitting…', errorIn: '{label}: {message}',
  },
});

const __rules = new Map();
const SKIP = Symbol('skip');
/** rule(name, fn, message, { always }) — register or override. rule(name, null, message) only changes the message. */
function defineRule(name, fn, message, opts = {}) {
  const prev = __rules.get(name) || {};
  __rules.set(name, { ...prev, ...opts, fn: fn || prev.fn, message: message ?? prev.message });
}
const vt = (key, params) => t('validation.' + key, params);

/* ── rule string parser: "required|min:3|between:1,5|pattern:/^(a|b)$/i|remote:/api/x" ── */
const NO_SPLIT = new Set(['pattern', 'regex', 'remote', 'dimensions', 'before', 'after', 'before_or_equal', 'after_or_equal']);
function parseRuleString(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && s[j] !== ':' && s[j] !== '|') j++;
    const name = s.slice(i, j).trim();
    let param = null;
    if (s[j] === ':') {
      j++;
      if ((name === 'pattern' || name === 'regex') && s[j] === '/') {
        const m = /^\/((?:\\.|[^\\/])*)\/([dgimsuvy]*)(?=\||$)/.exec(s.slice(j));
        if (m) { param = m[0]; j += m[0].length; }
      }
      if (param == null) {
        let buf = '';
        while (j < s.length && s[j] !== '|') { if (s[j] === '\\' && s[j + 1] === '|') { buf += '|'; j += 2; continue; } buf += s[j++]; }
        param = buf;
      }
    }
    if (name) out.push([name, param == null ? [] : NO_SPLIT.has(name) ? [param] : param.split(',').map(x => x.trim())]);
    i = j + 1;
  }
  return out;
}
/** parseRules(string | array | object | fn) -> [[nameOrFn, params]] */
function parseRules(input) {
  if (input == null || input === '' || input === false) return [];
  if (isFn(input)) return [[input, []]];
  if (Array.isArray(input)) return input.flatMap(r => (isStr(r) ? parseRuleString(r) : isFn(r) ? [[r, []]] : parseRules(r)));
  if (isObj(input)) {
    return Object.entries(input).filter(([, v]) => v !== false && v != null).map(([k, v]) => {
      if (isFn(v)) return [v, [], k];
      if (v instanceof RegExp) return [k, [v]];
      return [k, v === true ? [] : Array.isArray(v) ? v : [v]];
    });
  }
  return parseRuleString(String(input));
}

/* ── helpers ── */
const EMAIL_RE = /^[^\s@"<>(),;:\\]+@[^\s@"<>(),;:\\]+\.[^\s@"<>(),;:\\]{2,}$/;
const isEmptyVal = v => v == null || v === false || (isStr(v) && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof FileList !== 'undefined' && v instanceof FileList && !v.length);
function toNum(v) {
  if (isNum(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return +s;
  if (!/^[-+]?[\d\s.,'\u00a0\u202f]+$/.test(s)) return NaN;
  const n = fmt.parseNumber(s);
  return n == null ? NaN : n;
}
function toBytes(s) {
  const m = String(s).trim().match(/^([\d.]+)\s*(b|kb|k|mb|m|gb|g)?$/i);
  if (!m) return Infinity;
  const u = (m[2] || 'kb').toLowerCase()[0];
  return +m[1] * (u === 'g' ? 1024 ** 3 : u === 'm' ? 1024 ** 2 : u === 'k' ? 1024 : 1);
}
function toRegex(p) {
  if (p instanceof RegExp) return p;
  const m = /^\/((?:\\.|[^\\/])*)\/([dgimsuvy]*)$/.exec(String(p));
  try { return m ? new RegExp(m[1], m[2].replace('g', '')) : new RegExp(String(p)); } catch { return null; }
}
function fileMatches(file, types) {
  const name = (file.name || '').toLowerCase(), type = (file.type || '').toLowerCase();
  return types.some(tp => {
    tp = tp.trim().toLowerCase();
    if (!tp) return false;
    if (tp.startsWith('.')) return name.endsWith(tp);
    if (tp.endsWith('/*')) return type.startsWith(tp.slice(0, -1));
    if (!tp.includes('/')) return name.endsWith('.' + tp);
    return type === tp;
  });
}
async function imageSize(file) {
  if (win.createImageBitmap) { try { const b = await createImageBitmap(file); const r = { width: b.width, height: b.height }; b.close && b.close(); return r; } catch {} }
  return new Promise(res => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { res(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
/** Resolve 'today' | 'tomorrow' | 'yesterday' | 'now' | ISO date | other field name -> Date|null */
function refDate(ref, ctx) {
  const r = String(ref ?? '').trim();
  const k = r.toLowerCase();
  if (k === 'today') return date.today();
  if (k === 'now') return new Date();
  if (k === 'tomorrow') return date.add(date.today(), 1, 'd');
  if (k === 'yesterday') return date.add(date.today(), -1, 'd');
  if (ctx && ctx.hasField(r)) return date.parse(ctx.other(r));
  return date.parse(r);
}
const refLabel = (ref, ctx) => (ctx && ctx.hasField(ref) ? ctx.otherLabel(ref) : fmt.date(refDate(ref, ctx)) || ref);
function sizeOf(v, ctx) {
  if (Array.isArray(v)) return { n: v.length, kind: 'items' };
  if (ctx.kind === 'number') return { n: toNum(v), kind: 'number' };
  if (ctx.kind === 'date') { const d = date.parse(v); return { n: d ? +d : NaN, kind: 'date' }; }
  return { n: String(v).length, kind: 'length' };
}
const kindMsg = (base, kind, params) => vt(kind === 'length' ? base + 'Length' : kind === 'items' ? base + 'Items' : kind === 'date' ? base + 'Date' : base, params);

/* ── built-in rules ── */
defineRule('required', v => !isEmptyVal(v), () => vt('required'), { always: true });
defineRule('accepted', v => v === true || /^(on|yes|1|true)$/i.test(String(v ?? '')), () => vt('accepted'), { always: true });
defineRule('required_if', (v, [other, ...vals], el, form, ctx) => {
  const ov = ctx.other(other), list = toArr(ov).map(String);
  const hit = vals.length ? vals.some(x => list.includes(String(x))) : !isEmptyVal(ov);
  return !hit || !isEmptyVal(v);
}, () => vt('required'), { always: true });
defineRule('required_with', (v, others, el, form, ctx) => !others.some(o => !isEmptyVal(ctx.other(o))) || !isEmptyVal(v), () => vt('required'), { always: true });
defineRule('email', (v, p, el) => (Array.isArray(v) ? v : el && el.multiple ? String(v).split(',') : [v]).every(x => EMAIL_RE.test(String(x).trim())), () => vt('email'));
defineRule('url', v => { try { const u = new URL(String(v).trim()); return /^(https?|ftp):$/.test(u.protocol) && !!u.hostname; } catch { return false; } }, () => vt('url'));
defineRule('number', v => Number.isFinite(toNum(v)), () => vt('number'));
defineRule('integer', v => Number.isInteger(toNum(v)), () => vt('integer'));
defineRule('alpha', v => /^[\p{L}\p{M}]+$/u.test(String(v)), () => vt('alpha'));
defineRule('alphanum', v => /^[\p{L}\p{M}\p{N}]+$/u.test(String(v)), () => vt('alphanum'));
defineRule('alpha_dash', v => /^[\p{L}\p{M}\p{N}_-]+$/u.test(String(v)), () => vt('alphaDash'));
defineRule('digits', (v, [n]) => /^\d+$/.test(String(v)) && (!n || String(v).length === +n), ([n]) => (n ? vt('digits', { digits: n }) : vt('digitsOnly')));
defineRule('phone', v => /^\+?[\d\s().\-/]{6,24}$/.test(String(v)) && String(v).replace(/\D/g, '').length >= 6, () => vt('phone'));
defineRule('min', (v, [m], el, f, ctx) => { const s = sizeOf(v, ctx); return s.kind === 'date' ? s.n >= +refDate(m, ctx) : s.n >= toNum(m); },
  ([m], ctx) => { const k = sizeOf(ctx.value, ctx).kind; return kindMsg('min', k, { min: k === 'number' ? fmt.number(toNum(m)) : m, date: k === 'date' ? refLabel(m, ctx) : m }); });
defineRule('max', (v, [m], el, f, ctx) => { const s = sizeOf(v, ctx); return s.kind === 'date' ? s.n <= +refDate(m, ctx) : s.n <= toNum(m); },
  ([m], ctx) => { const k = sizeOf(ctx.value, ctx).kind; return kindMsg('max', k, { max: k === 'number' ? fmt.number(toNum(m)) : m, date: k === 'date' ? refLabel(m, ctx) : m }); });
defineRule('between', (v, [a, b], el, f, ctx) => { const s = sizeOf(v, ctx); return s.n >= toNum(a) && s.n <= toNum(b); },
  ([a, b], ctx) => { const k = sizeOf(ctx.value, ctx).kind; return vt(k === 'length' ? 'betweenLength' : k === 'items' ? 'betweenItems' : 'between', { min: a, max: b }); });
defineRule('minlength', (v, [m]) => (Array.isArray(v) ? v.length : String(v).length) >= +m, ([m], ctx) => vt(Array.isArray(ctx.value) ? 'minItems' : 'minLength', { min: m }));
defineRule('maxlength', (v, [m]) => (Array.isArray(v) ? v.length : String(v).length) <= +m, ([m], ctx) => vt(Array.isArray(ctx.value) ? 'maxItems' : 'maxLength', { max: m }));
defineRule('same', (v, [o], el, f, ctx) => equal(v, ctx.other(o)), ([o], ctx) => vt('same', { other: ctx.otherLabel(o) }));
defineRule('different', (v, [o], el, f, ctx) => !equal(v, ctx.other(o)), ([o], ctx) => vt('different', { other: ctx.otherLabel(o) }));
defineRule('pattern', (v, [p], el, f, ctx) => { const re = ctx.anchored ? (() => { try { return new RegExp('^(?:' + p + ')$', 'v'); } catch { return toRegex('^(?:' + p + ')$'); } })() : toRegex(p); return !re || re.test(String(v)); }, (p, ctx) => (ctx.el && ctx.el.title) || vt('pattern'));
defineRule('date', v => !!date.parse(v), () => vt('date'));
defineRule('before', (v, [r], el, f, ctx) => { const d = date.parse(v), x = refDate(r, ctx); return !d || !x || +d < +x; }, ([r], ctx) => vt('before', { date: refLabel(r, ctx) }));
defineRule('after', (v, [r], el, f, ctx) => { const d = date.parse(v), x = refDate(r, ctx); return !d || !x || +d > +x; }, ([r], ctx) => vt('after', { date: refLabel(r, ctx) }));
defineRule('before_or_equal', (v, [r], el, f, ctx) => { const d = date.parse(v), x = refDate(r, ctx); return !d || !x || +d <= +x; }, ([r], ctx) => vt('beforeOrEqual', { date: refLabel(r, ctx) }));
defineRule('after_or_equal', (v, [r], el, f, ctx) => { const d = date.parse(v), x = refDate(r, ctx); return !d || !x || +d >= +x; }, ([r], ctx) => vt('afterOrEqual', { date: refLabel(r, ctx) }));
defineRule('in', (v, list) => toArr(v).every(x => list.map(String).includes(String(x))), () => vt('in'));
defineRule('not_in', (v, list) => !toArr(v).some(x => list.map(String).includes(String(x))), () => vt('notIn'));
defineRule('filesize', (v, [s]) => toArr(v).every(f => !(f instanceof Blob) || f.size <= toBytes(s)), ([s]) => vt('filesize', { size: formatBytes(toBytes(s)) }));
defineRule('filetype', (v, types) => toArr(v).every(f => !(f instanceof Blob) || fileMatches(f, types)), types => vt('filetype', { types: types.join(', ') }));
defineRule('dimensions', async (v, [spec]) => {
  const c = {};
  String(spec || '').split(',').forEach(kv => { const [k, x] = kv.split('='); if (k && x) c[k.trim()] = x.trim(); });
  for (const f of toArr(v)) {
    if (!(f instanceof Blob) || !/^image\//.test(f.type)) continue;
    const s = await imageSize(f);
    if (!s) return false;
    if ((c.min_width && s.width < +c.min_width) || (c.max_width && s.width > +c.max_width) || (c.min_height && s.height < +c.min_height) || (c.max_height && s.height > +c.max_height)) return false;
    if ((c.width && s.width !== +c.width) || (c.height && s.height !== +c.height)) return false;
    if (c.ratio) { const [a, b = 1] = c.ratio.split('/').map(Number); if (Math.abs(s.width / s.height - a / b) > 0.01) return false; }
  }
  return true;
}, () => vt('dimensions'));
defineRule('remote', (v, [url], el, f, ctx) => ctx.remote(url, v), () => vt('remote'));
/* aliases */
for (const [a, b] of [['numeric', 'number'], ['regex', 'pattern'], ['alpha_num', 'alphanum'], ['notIn', 'not_in'], ['requiredIf', 'required_if'], ['size', 'filesize'], ['mimes', 'filetype']]) __rules.set(a, __rules.get(b));

/** Resolve the message text for a failed rule. */
function ruleMessage(def, name, params, ctx) {
  let m = def && def.message;
  if (isFn(m)) m = m(params, ctx);
  if (m == null || m === '') return vt('invalid');
  m = String(m);
  if (i18n.has(m)) m = t(m, ctx.params);
  return interpolate(m, params, ctx);
}
function interpolate(m, params, ctx) {
  return String(m).replace(/\{(\w+)\}/g, (x, k) => (/^\d+$/.test(k) ? params[+k] ?? x : k === 'label' ? ctx.label : k === 'value' ? String(ctx.value ?? '') : ctx.params && ctx.params[k] != null ? ctx.params[k] : x));
}
