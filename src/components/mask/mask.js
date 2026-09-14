/* Input masking — behavior + JS API. The native <input> stays the form field.
 *   <input class="o-input" data-o-mask="(999) 999-9999" data-o-mask-placeholder="_">
 *   <input data-o-mask="date" data-o-mask-format="DD/MM/YYYY">
 *     presets: date time datetime phone-us card cvc expiry iban ip mac postcode-us ssn hex-color
 *   <input data-o-mask-regex="^[A-Z]{0,3}\d{0,4}$" data-o-mask-case="upper" data-o-mask-complete="^[A-Z]{3}\d{4}$">
 *   <input data-o-mask="fn:myMaskFn">   (global fn(raw, ctrl) -> pattern string)
 *   Tokens: 9 digit · a letter · * letter/digit · \ escapes the next char · [ ] optional part
 *   Extra attrs: data-o-mask-tokens='{"h":"[0-9a-f]"}' data-o-mask-case="upper|lower" data-o-mask-validate="false"
 *
 *   const m = Orion.mask(el, '99-99' | { mask, regex, placeholder, tokens, case, validate, complete, accept, prepare })
 *     m.value · m.unmasked · m.complete · m.set(v) · m.update(opts) · m.unmask() · m.toDate() · m.destroy()
 *   Orion.mask.get(el) · Orion.mask.unmask(el) · Orion.mask.format(value, pattern) · Orion.mask.presets
 *   Orion.mask.cardType(n) · Orion.mask.luhn(n) · Orion.mask.iban(v)
 *   Event o-mask-complete { value, unmasked, cardType } on the input; el.dataset.unmasked is always current.
 */
i18n.add('en', {
  mask: {
    incomplete: 'Please complete this field', invalid: 'Invalid format', invalidDate: 'Enter a valid date',
    invalidCard: 'Enter a valid card number', invalidIban: 'Enter a valid IBAN', expired: 'This card has expired',
  },
});

const DIGIT = /\d/;
const TOKENS = { '9': { test: DIGIT }, a: { test: /\p{L}/u }, '*': { test: /[\p{L}\p{N}]/u } };
const HEX = { h: { test: /[0-9a-f]/i } };
const tcase = (c, m) => (m === 'upper' ? c.toUpperCase() : m === 'lower' ? c.toLowerCase() : c);
const slotOk = (p, c, prev) => (isFn(p.test) ? !!p.test(c, prev) : p.test.test(c));
const proto = isBrowser ? { i: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set, t: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set } : null;
/** Set a value through the prototype setter so React's value tracker still sees the change. */
function setNative(el, v) { if (el.value !== v) (el.localName === 'textarea' ? proto.t : proto.i).call(el, v); }

/* ── pattern engine ───────────────────────────────────────────────────── */
function compile(src, tokens = TOKENS) {
  if (Array.isArray(src)) return src;
  const parts = []; let opt = false, grp = 0;
  const chars = [...String(src || '')];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '\\') { if (++i < chars.length) parts.push({ lit: chars[i], opt }); continue; }
    if (c === '[') { opt = ++grp; continue; }
    if (c === ']') { opt = false; continue; }
    const tk = tokens[c];
    parts.push(tk ? { slot: true, test: isStr(tk.test) ? new RegExp(tk.test, 'u') : tk.test, case: tk.case, pad: tk.pad, opt } : { lit: c, opt });
  }
  return parts;
}
const slotsOf = parts => parts.filter(p => p.slot);
/** Put one char in the next free slot (auto-pads "4" -> "04" in date/time slots). */
function place(out, slots, ch, cs) {
  const i = out.length, s = slots[i];
  if (!s) return false;
  const c = tcase(ch, s.case || cs), prev = out[i - 1] || '';
  if (slotOk(s, c, prev)) { out.push(c); return true; }
  if (s.pad && DIGIT.test(c) && slots[i + 1] && slotOk(s, '0', prev) && slotOk(slots[i + 1], c, '0')) { out.push('0', c); return true; }
  return false;
}
/** Raw chars -> the chars that fit the slots in order. */
function fit(parts, chars, cs) {
  const slots = slotsOf(parts), out = [];
  for (const ch of chars) { if (out.length >= slots.length) break; place(out, slots, ch, cs); }
  return out;
}
/** Any string (typed, pasted, autofilled, formatted) -> raw chars. Literals in the text are matched and skipped. */
function extract(parts, str, cs) {
  const slots = [], at = [];
  parts.forEach((p, i) => { if (p.slot) { slots.push(p); at.push(i); } });
  const out = []; let pi = 0;
  for (const ch of String(str ?? '')) {
    if (out.length >= slots.length) break;
    let j = pi, hit = -1;
    while (j < parts.length && !parts[j].slot) { if (parts[j].lit === ch) { hit = j; break; } j++; }
    if (hit >= 0) { pi = hit + 1; continue; }
    if (place(out, slots, ch, cs)) pi = at[out.length - 1] + 1;
  }
  return out;
}
/** Raw chars -> { text, kind ('r' raw | 'l' literal | 'g' guide per UTF-16 unit), ends[k] = index after raw char k } */
function render(parts, raw, guide) {
  let text = '', kind = '', ri = 0;
  const ends = [], n = raw.length;
  for (const p of parts) {
    if (p.slot) {
      if (ri < n) { const c = raw[ri++]; text += c; kind += 'r'.repeat(c.length); ends.push(text.length); }
      else if (guide && !p.opt) { text += guide; kind += 'g'.repeat(guide.length); }
      else if (guide) continue; else break;
    } else if (ri < n || (!p.opt && (guide || n))) { text += p.lit; kind += 'l'.repeat(p.lit.length); }
    else if (guide) continue; else break;
  }
  return { text, kind, ends };
}
const rawBefore = (r, i) => { let k = 0; while (k < r.ends.length && r.ends[k] <= i) k++; return k; };
function caretAt(r, k, forward) {
  let i = k ? r.ends[k - 1] : 0, j = i;
  while (j < r.text.length && r.kind[j] === 'l') j++;
  return !k || forward || j === r.text.length ? j : i; // after a delete, stay put unless only trailing literals follow
}

/* ── presets ──────────────────────────────────────────────────────────── */
const two = (a, b) => [{ slot: true, test: a, pad: true }, { slot: true, test: b }];
const DT = {
  YYYY: () => [1, 2, 3, 4].map(() => ({ slot: true, test: DIGIT })),
  YY: () => [1, 2].map(() => ({ slot: true, test: DIGIT })),
  MM: () => two(c => /[01]/.test(c), (c, p) => (p === '1' ? /[0-2]/ : p === '0' ? /[1-9]/ : DIGIT).test(c)),
  DD: () => two(c => /[0-3]/.test(c), (c, p) => (p === '3' ? /[01]/ : p === '0' ? /[1-9]/ : DIGIT).test(c)),
  HH: () => two(c => /[0-2]/.test(c), (c, p) => (p === '2' ? /[0-3]/ : DIGIT).test(c)),
  hh: () => two(c => /[01]/.test(c), (c, p) => (p === '1' ? /[0-2]/ : p === '0' ? /[1-9]/ : DIGIT).test(c)),
  mm: () => two(c => /[0-5]/.test(c), c => DIGIT.test(c)),
  ss: () => two(c => /[0-5]/.test(c), c => DIGIT.test(c)),
};
/** 'DD/MM/YYYY HH:mm' -> parts with smart slot tests */
function dateParts(fmt) {
  const parts = [];
  String(fmt).replace(/YYYY|YY|MM|DD|HH|hh|mm|ss|[\s\S]/g, tok => { parts.push(...(DT[tok] ? DT[tok]() : [{ lit: tok }])); return ''; });
  return parts;
}
function dateMask(fmt) {
  return {
    mask: dateParts(fmt), hint: fmt, inputmode: 'numeric', dateFormat: fmt,
    validate: (raw, v) => (date.parseFormat(v, fmt) ? '' : t('mask.invalidDate')),
  };
}
function cardType(n) {
  n = String(n ?? '').replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^3(0[0-5]|[689])/.test(n)) return 'diners';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
  if (/^4/.test(n)) return 'visa';
  if (/^(6011|65|64[4-9])/.test(n)) return 'discover';
  if (/^35(2[89]|[3-8])/.test(n)) return 'jcb';
  if (/^62/.test(n)) return 'unionpay';
  if (/^(5[06-9]|6\d)/.test(n)) return 'maestro';
  return '';
}
function luhn(n) {
  const d = String(n ?? '').replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; }
  return sum % 10 === 0;
}
const CARD = { amex: '9999 999999 99999', diners: '9999 999999 9999', visa: '9999 9999 9999 9999[ 999]', unionpay: '9999 9999 9999 9999[ 999]', maestro: '9999 9999 9999 9999[ 999]' };
/** IBAN check (ISO 13616 mod-97). */
function iban(v) {
  const s = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
  let r = 0;
  for (let i = 0; i < num.length; i += 7) r = +(r + num.slice(i, i + 7)) % 97;
  return r === 1;
}
const ipOk = v => {
  if (v === '') return true;
  const p = v.split('.');
  return p.length <= 4 && p.every((o, i) => (o === '' ? i > 0 && i === p.length - 1 : /^\d{1,3}$/.test(o) && +o <= 255 && !(o.length > 1 && o[0] === '0')));
};
const PRESETS = {
  'phone-us': () => ({ mask: '(999) 999-9999', inputmode: 'tel' }),
  ssn: () => ({ mask: '999-99-9999', inputmode: 'numeric' }),
  'postcode-us': () => ({ mask: '99999[-9999]', inputmode: 'numeric' }),
  cvc: () => ({ mask: '999[9]', inputmode: 'numeric' }),
  mac: () => ({ mask: 'hh:hh:hh:hh:hh:hh', tokens: HEX, case: 'upper' }),
  'hex-color': () => ({ mask: '#hhh[hhhhh]', tokens: HEX, case: 'lower', complete: raw => [3, 4, 6, 8].includes(raw.length) }),
  iban: () => ({ mask: 'aa99 **** **** ***[* **** **** **** **** **]', case: 'upper', complete: raw => raw.length >= 15, validate: raw => (iban(raw) ? '' : t('mask.invalidIban')) }),
  card: () => ({
    mask: raw => CARD[cardType(raw)] || '9999 9999 9999 9999', inputmode: 'numeric',
    validate: raw => (luhn(raw) ? '' : t('mask.invalidCard')),
  }),
  expiry: () => ({
    mask: dateParts('MM/YY'), hint: 'MM/YY', inputmode: 'numeric',
    validate: raw => { const m = +raw.slice(0, 2), y = 2000 + +raw.slice(2), now = new Date(); return y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1) ? t('mask.expired') : ''; },
  }),
  date: o => dateMask(o.format || date.localePattern()),
  time: o => dateMask(o.format || 'HH:mm'),
  datetime: o => dateMask(o.format || date.localePattern() + ' HH:mm'),
  ip: () => ({
    accept: ipOk, inputmode: 'decimal', complete: v => /^(\d{1,3}\.){3}\d{1,3}$/.test(v),
    prepare: (ch, before, after) => {
      const oct = before.split('.'), cur = oct[oct.length - 1];
      return DIGIT.test(ch) && oct.length < 4 && !after.startsWith('.') && cur && (cur.length === 3 || +(cur + ch) > 255 || cur === '0') ? '.' + ch : ch;
    },
  }),
};

/* ── controller ───────────────────────────────────────────────────────── */
const CTRL = new WeakMap();
const EDIT_TYPES = /^(insertText|insertFromPaste|deleteContentBackward|deleteContentForward|deleteByCut|deleteContent)$/;
const normTokens = tk => ({ ...TOKENS, ...(tk ? Object.fromEntries(Object.entries(tk).map(([k, v]) => [k, v instanceof RegExp || isStr(v) || isFn(v) ? { test: v } : v])) : {}) });

function resolveOpts(o) {
  o = isStr(o) || isFn(o) || Array.isArray(o) || o instanceof RegExp ? { mask: o } : { ...(o || {}) };
  if (o.mask instanceof RegExp) { o.regex = o.mask; delete o.mask; }
  if (isStr(o.mask) && PRESETS[o.mask]) { const p = PRESETS[o.mask](o); o = { ...p, ...o, mask: p.mask, preset: o.mask, tokens: { ...p.tokens, ...o.tokens } }; }
  if (isStr(o.regex)) { const src = o.regex.startsWith('^') ? o.regex : `^(?:${o.regex})$`; o.regex = new RegExp(src, o.flags || 'u'); }
  if (isStr(o.complete)) { const re = new RegExp(o.complete, o.flags || 'u'); o.complete = (raw, v) => re.test(v); }
  return o;
}

class Masker {
  constructor(el, opts) {
    this.el = el; this.raw = []; this.hist = []; this.hi = -1; this.added = {};
    this.update(opts);
    this.offs = [
      on(el, 'beforeinput', e => this.onBefore(e)),
      on(el, 'input', e => this.onInput(e)),
      on(el, 'compositionstart', () => { this.comp = { s: el.selectionStart, e: el.selectionEnd }; }),
      on(el, 'compositionend', e => this.onCompEnd(e)),
      on(el, 'keydown', e => this.onKey(e)),
      on(el, 'focus', () => { this.focused = true; this.v0 = el.value; this.sawChange = false; if (el.value !== this.r.text) this.set(el.value, false); this.guide(); }),
      on(el, 'blur', () => this.onBlur()),
      on(el, 'change', () => { this.sawChange = true; }),
    ];
    if (el.form) this.offs.push(on(el.form, 'reset', () => setTimeout(() => this.set(el.value, false))));
    CTRL.set(el, this);
  }
  /** (Re)configure: string pattern, preset name, function, RegExp or options object. */
  update(opts) {
    const el = this.el, o = this.o = resolveOpts(opts);
    this.tokens = normTokens(o.tokens);
    this.filter = !o.mask && !!(o.regex || o.accept);
    this.cache = new Map();
    const attr = (name, val) => { if (val && !el.hasAttribute(name)) { el.setAttribute(name, val); this.added[name] = true; } };
    attr('inputmode', o.inputmode || (!this.filter && !isFn(o.mask) && slotsOf(this.partsFor([])).every(p => p.test === DIGIT) ? 'numeric' : ''));
    attr('placeholder', o.hint || (o.placeholder && !this.filter ? this.guideText([]) : ''));
    return this.set(el.value, false);
  }
  partsFor(raw) {
    let src = this.o.mask;
    if (isFn(src)) src = src(raw.join(''), this);
    let parts = this.cache.get(src);
    if (!parts) {
      parts = compile(src, this.tokens);
      const max = this.el.maxLength;
      if (max > 0) { let len = 0; parts = parts.filter(p => (len += p.slot ? 1 : p.lit.length) <= max); }
      this.cache.set(src, parts);
    }
    return parts;
  }
  /** Full guide: a multi-char placeholder ("DD/MM/YYYY") is used as-is, a single char fills every slot. */
  guideText(raw) { const ph = this.o.placeholder; return ph.length > 1 ? ph : render(this.partsFor(raw), raw, ph).text; }
  extract(str) {
    const cs = this.o.case;
    let raw = extract(this.partsFor([]), str, cs);
    if (isFn(this.o.mask)) raw = extract(this.partsFor(raw), str, cs);
    return raw;
  }
  refit(chars) { const cs = this.o.case; let raw = fit(this.partsFor(chars), chars, cs); if (isFn(this.o.mask)) raw = fit(this.partsFor(raw), chars, cs); return raw; }
  accept(v) { const o = this.o, max = this.el.maxLength; if (max > 0 && [...v].length > max) return false; return o.accept ? !!o.accept(v, this) : o.regex ? o.regex.test(v) : true; }
  filterStr(str) { let acc = ''; for (const c of String(str ?? '')) { const ch = tcase(c, this.o.case); if (this.accept(acc + ch)) acc += ch; } return acc; }

  /* ── public ── */
  get value() { return this.el.value; }
  get unmasked() { return this.raw.join(''); }
  unmask() { return this.unmasked; }
  get complete() {
    const o = this.o, raw = this.unmasked, v = this.el.value;
    if (!raw) return false;
    if (o.complete) return !!o.complete(raw, v, this);
    if (this.filter) return true;
    const slots = slotsOf(this.partsFor(this.raw)), n = this.raw.length, g = slots[n - 1]?.opt;
    // every required slot filled, and an optional [group] is either empty or complete
    return n >= slots.filter(p => !p.opt).length && (!g || !slots.slice(n).some(p => p.opt === g));
  }
  /** Date value for date/time presets (or null). */
  toDate() { return this.o.dateFormat && this.complete ? date.parseFormat(this.el.value, this.o.dateFormat) : null; }
  /** Set a value programmatically (any formatting accepted). emit=true fires input like a user edit. */
  set(v, fire = false) {
    const raw = this.filter ? [...this.filterStr(v)] : this.extract(v);
    this.apply(raw, raw.length, { forward: true, fire });
    return this;
  }
  destroy() {
    this.offs.forEach(f => f());
    this.guideOff?.(); this.g?.remove();
    for (const a in this.added) this.el.removeAttribute(a);
    if (this.ownValidity) this.el.setCustomValidity('');
    this.el.classList.remove('o-mask-guiding');
    delete this.el.dataset.unmasked; delete this.el.dataset.cardType;
    CTRL.delete(this.el);
  }

  /* ── editing ── */
  onBefore(e) {
    if (this.comp || e.isComposing) return;
    const ty = e.inputType || '', el = this.el;
    if (el.value !== this.r.text) { const s0 = el.selectionStart; this.set(el.value, false); if (s0 != null) el.setSelectionRange(s0, s0); } // changed behind our back
    if (ty === 'historyUndo' || ty === 'historyRedo') { e.preventDefault(); this.step(ty === 'historyUndo' ? -1 : 1); return; }
    const s = el.selectionStart, en = el.selectionEnd;
    if (!EDIT_TYPES.test(ty) || s == null) return; // everything else: native edit, normalised on 'input'
    let data = e.data;
    if (data == null && e.dataTransfer) data = e.dataTransfer.getData('text/plain');
    e.preventDefault();
    if (ty.startsWith('insert')) this.insert(s, en, String(data ?? '').replace(/[\r\n]+/g, ' '), ty);
    else this.remove(s, en, ty === 'deleteContentForward' ? 1 : -1, ty);
  }
  insert(s, en, data, type) {
    const el = this.el;
    if (this.filter) {
      const v = this.r.text, before = v.slice(0, s), after = v.slice(en);
      let acc = '';
      for (const c of data) {
        let ch = tcase(c, this.o.case);
        if (this.o.prepare) ch = this.o.prepare(ch, before + acc, after, this) ?? ch;
        if (ch && this.accept(before + acc + ch + after)) acc += ch;
        else if (ch.length > 1 && this.accept(before + acc + ch.slice(-1) + after)) acc += ch.slice(-1);
      }
      if (!acc && s === en) return;
      return this.apply([...(before + acc + after)], [...(before + acc)].length, { forward: true, type, data });
    }
    const r = this.r, raw = this.raw, rs = rawBefore(r, s), re = rawBefore(r, en), chars = [...data];
    if (type === 'insertText' && s === en && chars.length === 1 && r.kind[s] === 'l' && r.text[s] === data) { el.setSelectionRange(s + 1, s + 1); return; }
    let nr, k;
    if (rs === 0 && re >= raw.length && chars.length > 1) { nr = this.extract(data); k = nr.length; }
    else {
      const head = raw.slice(0, rs).concat(chars);
      nr = this.refit(head.concat(raw.slice(re)));
      k = Math.min(this.refit(head).length, nr.length);
    }
    if (equal(nr, raw) && s === en) return;
    this.apply(nr, k, { forward: true, type, data });
  }
  remove(s, en, dir, type) {
    const r = this.r, raw = this.raw;
    let a, b;
    if (this.filter) {
      const v = this.r.text;
      if (s === en) { if (dir < 0) { if (!s) return; a = s - ([...v.slice(0, s)].pop() || '').length; b = s; } else { if (s >= v.length) return; a = s; b = s + ([...v.slice(s)][0] || '').length; } }
      else { a = s; b = en; }
      const nv = v.slice(0, a) + v.slice(b);
      return this.apply([...nv], [...v.slice(0, a)].length, { forward: false, type });
    }
    if (s !== en) { a = rawBefore(r, s); b = rawBefore(r, en); }
    else if (dir < 0) { b = rawBefore(r, s); a = b - 1; if (a < 0) return; }
    else { a = rawBefore(r, s); b = a + 1; if (a >= raw.length) return; }
    const nr = this.refit(raw.slice(0, a).concat(raw.slice(b)));
    this.apply(nr, Math.min(a, nr.length), { forward: false, type });
  }
  onInput(e) {
    if (this.self || this.comp) return;
    const el = this.el, v = el.value, s = el.selectionStart ?? v.length;
    let raw, k;
    if (this.filter) { raw = [...this.filterStr(v)]; k = [...this.filterStr(v.slice(0, s))].length; }
    else { raw = this.extract(v); k = Math.min(this.extract(v.slice(0, s)).length, raw.length); }
    const text = this.filter ? raw.join('') : render(this.partsFor(raw), raw, '').text;
    if (text !== v) e.stopImmediatePropagation();
    this.apply(raw, k, { forward: true, type: e.inputType, fire: text !== v, user: true });
  }
  onCompEnd(e) {
    const c = this.comp; this.comp = null;
    if (!c) return;
    this.insert(c.s ?? 0, c.e ?? 0, String(e.data ?? ''), 'insertText');
    if (this.el.value !== this.r.text) this.apply(this.raw, this.raw.length, { forward: true, type: 'insertText' });
  }
  onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.step(-1); }
    else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey)) { e.preventDefault(); this.step(1); }
  }
  onBlur() {
    this.focused = false; this.guide();
    const el = this.el;
    if (!this.sawChange && el.value !== this.v0) el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  step(d) {
    const i = this.hi + d, st = this.hist[i];
    if (!st) return;
    this.hi = i;
    this.apply(st.raw, st.k, { forward: true, type: d < 0 ? 'historyUndo' : 'historyRedo', history: false });
  }
  record(raw, k, type) {
    const now = Date.now(), top = this.hist[this.hi];
    if (top && equal(top.raw, raw)) { top.k = k; return; }
    // consecutive typing at the caret is one undo step (like native inputs)
    const merge = top && this.hi > 0 && type === 'insertText' && this.lastType === 'insertText' && now - this.lastT < 1000 && k > top.k && k - top.k <= 2;
    this.hist.length = this.hi + 1;
    if (merge) this.hist[this.hi] = { raw, k };
    else { this.hist.push({ raw, k }); if (this.hist.length > 100) this.hist.shift(); this.hi = this.hist.length - 1; }
    this.lastType = type; this.lastT = now;
  }
  apply(raw, k, { forward, type, data = null, fire = true, user = fire, history = true }) {
    const el = this.el;
    this.raw = raw;
    const r = this.r = this.filter ? { text: raw.join(''), kind: '', ends: raw.reduce((a, c) => (a.push((a[a.length - 1] || 0) + c.length), a), []) } : render(this.partsFor(raw), raw, '');
    const changed = el.value !== r.text || user;
    setNative(el, r.text);
    if (doc.activeElement === el && k != null && el.selectionStart != null) { const c = this.filter ? (k ? r.ends[k - 1] : 0) : caretAt(r, k, forward); el.setSelectionRange(c, c); }
    const un = this.unmasked;
    if (un) el.dataset.unmasked = un; else delete el.dataset.unmasked;
    if (this.o.preset === 'card') { const ct = cardType(un); if (ct) el.dataset.cardType = ct; else delete el.dataset.cardType; }
    if (history) this.record(raw, k, type);
    this.validity();
    this.guide();
    if (fire && changed) {
      this.self = true;
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: type || 'insertText', data })); } finally { this.self = false; }
    }
    const done = this.complete;
    if (done && user && r.text !== this.lastDone) { this.lastDone = r.text; emit(el, 'o-mask-complete', { value: r.text, unmasked: un, cardType: el.dataset.cardType || null }); }
    if (!done) this.lastDone = null;
  }
  validity() {
    const o = this.o, el = this.el;
    if (o.validity === false || !el.setCustomValidity) return;
    let msg = '';
    if (this.raw.length) {
      if (!this.complete) msg = this.filter && !o.complete ? '' : t('mask.incomplete');
      else if (o.validate) msg = o.validate(this.unmasked, el.value, this) || '';
    }
    if (msg || this.ownValidity) { el.setCustomValidity(msg); this.ownValidity = !!msg; }
  }
  /* ── guide overlay (visual only, the value never contains guide chars) ── */
  guide() {
    const o = this.o, el = this.el;
    const rest = this.focused && o.placeholder && !this.filter ? this.guideText(this.raw).slice(this.r.text.length) : '';
    el.classList.toggle('o-mask-guiding', !!rest);
    if (!rest) { if (this.g) this.g.hidden = true; this.guideOff?.(); this.guideOff = null; return; }
    if (!this.g) this.g = h('div', { class: 'o-mask-guide', 'aria-hidden': 'true' }, h('span', { class: 'o-mask-guide-fill' }), h('span', { class: 'o-mask-guide-rest' }));
    const g = this.g;
    if (!g.isConnected || g.parentNode !== (el.closest('dialog[open]') || portalRoot())) portal(g, el);
    g.firstChild.textContent = this.r.text; g.lastChild.textContent = rest; g.hidden = false;
    const pos = () => {
      if (!el.isConnected) return;
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el), rtl = cs.direction === 'rtl';
      const ta = cs.textAlign, jc = ta === 'center' ? 'center' : ta === 'end' || ta === (rtl ? 'left' : 'right') ? 'flex-end' : 'flex-start';
      css(g, { left: b.left, top: b.top, width: b.width, height: b.height, justifyContent: jc, direction: cs.direction, font: cs.font, fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, fontVariantNumeric: cs.fontVariantNumeric, textTransform: cs.textTransform, paddingInlineStart: `calc(${cs.paddingInlineStart} + ${cs.borderInlineStartWidth})`, paddingInlineEnd: `calc(${cs.paddingInlineEnd} + ${cs.borderInlineEndWidth})`, zIndex: '' });
      g.firstChild.style.marginInlineStart = -el.scrollLeft + 'px';
    };
    pos();
    if (!this.guideOff) { const f = rafThrottle(pos); const a = on(win, 'scroll', f, { capture: true, passive: true }), b = on(win, 'resize', f), c = observeResize(el, f); this.guideOff = () => { f.cancel(); a(); b(); c(); }; }
  }
}

/** Orion.mask(el, pattern | options) -> controller (re-configures an existing one). */
function mask(target, opts) {
  const el = $(target);
  if (!el) return null;
  const cur = CTRL.get(el);
  if (cur) return opts === undefined ? cur : cur.update(opts);
  return new Masker(el, opts);
}
function optsFromAttrs(el) {
  const d = el.dataset, v = d.oMask;
  const o = {};
  if (v != null && v !== '') o.mask = v.startsWith('fn:') ? getPath(win, v.slice(3)) : v;
  if (d.oMaskRegex) { o.regex = d.oMaskRegex; o.flags = d.oMaskRegexFlags; }
  if (d.oMaskPlaceholder) o.placeholder = d.oMaskPlaceholder;
  if (d.oMaskFormat) o.format = d.oMaskFormat;
  if (d.oMaskCase) o.case = d.oMaskCase;
  if (d.oMaskComplete) o.complete = d.oMaskComplete;
  if (d.oMaskTokens) o.tokens = parseJSON(d.oMaskTokens, {});
  if (d.oMaskValidate === 'false') o.validity = false;
  return o;
}
const bh = el => {
  if (CTRL.has(el)) return;
  const c = new Masker(el, optsFromAttrs(el));
  return () => c.destroy();
};
behavior('data-o-mask', bh);
behavior('data-o-mask-regex', el => (el.hasAttribute('data-o-mask') ? undefined : bh(el)));

mask.get = el => CTRL.get($(el)) || null;
mask.unmask = el => { const c = CTRL.get($(el)); return c ? c.unmasked : ($(el)?.value ?? ''); };
/** format('5551234567', '(999) 999-9999' | preset | options) -> masked string */
mask.format = (value, opts) => {
  const o = resolveOpts(opts);
  if (!o.mask) return String(value ?? '');
  const tokens = normTokens(o.tokens);
  const pf = raw => compile(isFn(o.mask) ? o.mask(raw.join('')) : o.mask, tokens);
  let raw = extract(pf([]), value, o.case);
  if (isFn(o.mask)) raw = extract(pf(raw), value, o.case);
  return render(pf(raw), raw, '').text;
};
mask.presets = PRESETS;
mask.tokens = TOKENS;
mask.cardType = cardType;
mask.luhn = luhn;
mask.iban = iban;
mask.dateParts = dateParts;
O.mask = mask;
