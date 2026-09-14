/* Password helpers — behaviors on a native <input type="password"> (it stays the form field).
 *   <div class="o-input-wrap"><input class="o-input" type="password" data-o-password-toggle data-o-password-generate="16"></div>
 *   <input type="password" data-o-strength data-o-strength-rules="length:12,upper,lower,number,symbol,common,repeat" data-o-strength-min="2">
 *     data-o-strength-checklist="false" hides the rules list · data-o-strength-target="#el" renders the meter elsewhere
 *   Caps Lock warning is shown automatically for toggle/strength fields (data-o-capslock="false" to disable).
 *   Orion.password.strength(pw, { rules, userInputs }) -> { score 0-4, label, entropy, crackSeconds, checks, suggestions }
 *   Orion.password.generate({ length: 16, symbols, numbers, upper, lower, excludeSimilar }) -> string (crypto.getRandomValues)
 *   Orion.password.toggle(el, show?) · Orion.password.refresh(el)
 * The input is wrapped in .o-input-wrap when it has none (render the wrapper yourself in frameworks).
 */
i18n.add('en', {
  password: {
    show: 'Show password', hide: 'Hide password', generate: 'Generate password', generated: 'Strong password generated',
    capsLock: 'Caps Lock is on', strength: 'Password strength', empty: 'Enter a password',
    l0: 'Very weak', l1: 'Weak', l2: 'Fair', l3: 'Strong', l4: 'Very strong', met: 'met', notMet: 'not met',
    rules: { length: 'At least {n} characters', upper: 'An uppercase letter', lower: 'A lowercase letter', number: 'A number', symbol: 'A symbol', common: 'Not a common password', repeat: 'No repeated characters' },
    tips: {
      length: 'Use at least {n} characters', upper: 'Add an uppercase letter', lower: 'Add a lowercase letter', number: 'Add a number',
      symbol: 'Add a symbol', common: 'Avoid common passwords', repeat: 'Avoid repeated characters like "aaa"', sequence: 'Avoid sequences like "abc" or "123"',
      keyboard: 'Avoid keyboard patterns like "qwerty"', date: 'Avoid dates and years', word: 'Avoid common words and names', personal: 'Avoid your name or email',
      longer: 'Add another word or two', tooWeak: 'Choose a stronger password',
    },
  },
});

/* ── strength estimator ───────────────────────────────────────────────── */
const COMMON = ('123456 password 123456789 12345678 12345 qwerty 1234567 111111 123123 abc123 1234567890 password1 iloveyou 1q2w3e4r 000000 ' +
  'qwerty123 zaq12wsx dragon sunshine princess letmein 654321 monkey 1qaz2wsx 123321 qwertyuiop superman asdfghjkl trustno1 welcome admin ' +
  'login master hello freedom whatever qazwsx football baseball shadow michael jennifer charlie starwars passw0rd ninja mustang access flower ' +
  'lovely loveme batman 696969 121212 7777777 555555 666666 888888 987654321 michelle jordan harley ranger buster soccer hunter thomas tigger ' +
  'robert daniel andrew killer pepper computer secret summer winter spring autumn cheese purple orange banana apple chocolate internet samsung ' +
  'google facebook linkedin twitter yankees liverpool arsenal chelsea pokemon naruto cookie maggie ginger joshua hannah ashley jessica amanda ' +
  'nicole biteme matrix merlin george anthony qwe123 asd123 zxcvbnm 11111111 00000000 aa123456 password123 admin123 root toor test test123 ' +
  'guest changeme default abcd1234 1q2w3e 123qwe qwer1234 love money magic dolphin family blessed jesus angel monday friday london paris ' +
  'america canada india malaysia singapore london123 flower123 hello123 welcome1 sunshine1 princess1 football1 iloveyou1 dragon1 monkey1 ' +
  'letmein1 abcdef abcabc qwertz azerty 159753 147258369 zxcv1234 password12 secret123 superman1 batman1 starwars1 master1 shadow1').split(' ');
const COMMON_RANK = new Map(COMMON.map((w, i) => [w, i]));
const WORDS = COMMON.filter(w => /^[a-z]{4,}$/.test(w));
const KEYROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', '!@#$%^&*()', 'qwertzuiop', 'azertyuiop', '1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik,9ol.0p;/', 'zaq1xsw2cde3vfr4bgt5nhy6mju7'];
const LEET = { '@': 'a', 4: 'a', 8: 'b', '(': 'c', 3: 'e', 6: 'g', 1: 'i', '!': 'i', '|': 'l', 0: 'o', $: 's', 5: 's', 7: 't', '+': 't', 2: 'z' };
const log2 = Math.log2;
const DEFAULT_RULES = 'length:8,upper,lower,number,symbol,common,repeat';

function parseRules(r) {
  const out = {};
  String(r || DEFAULT_RULES).split(',').map(s => s.trim()).filter(Boolean).forEach(s => { const [k, v] = s.split(':'); out[k] = k === 'length' ? +v || 8 : true; });
  return out;
}
function poolOf(pw) {
  let p = 0;
  if (/[a-z]/.test(pw)) p += 26;
  if (/[A-Z]/.test(pw)) p += 26;
  if (/\d/.test(pw)) p += 10;
  if (/[^\w\s]|_/.test(pw)) p += 33;
  if (/\s/.test(pw)) p += 1;
  if (/[^\x00-\x7f]/.test(pw)) p += 100;
  return Math.max(p, 10);
}
/**
 * strength(pw, { rules, userInputs: ['ada', 'ada@example.com'] })
 * Pattern-aware entropy estimate: every character costs log2(pool) bits unless it belongs to a
 * cheaper pattern (common password/word, sequence, keyboard walk, repeat, date), which then costs its pattern bits.
 */
function strength(pw = '', opts = {}) {
  pw = String(pw ?? '');
  const rules = isObj(opts.rules) ? opts.rules : parseRules(opts.rules);
  const len = [...pw].length, lower = pw.toLowerCase(), pool = poolOf(pw), base = log2(pool);
  const cost = Array.from({ length: pw.length }, () => base);
  const found = new Set();
  const mark = (i, j, bits, kind) => { const per = bits / (j - i); for (let k = i; k < j; k++) if (per < cost[k]) cost[k] = per; found.add(kind); };
  const leet = s => s.replace(/[@48(361!|0$57+2]/g, c => LEET[c] || c);
  const norm = leet(lower);
  // common password (whole, or with a short digit/symbol suffix like "monkey123!")
  const stem = lower.replace(/[\d\W_]{1,4}$/, '');
  const whole = COMMON_RANK.get(lower) ?? COMMON_RANK.get(norm);
  const rank = whole ?? (stem.length >= 4 ? COMMON_RANK.get(stem) ?? COMMON_RANK.get(leet(stem)) : undefined);
  const isCommon = rank !== undefined;
  if (isCommon) mark(0, whole !== undefined ? pw.length : stem.length, log2(rank + 2), 'common');
  // dictionary words and personal info inside the password
  const personal = toArr(opts.userInputs).flatMap(s => String(s).toLowerCase().split(/[\s@._-]+/)).filter(s => s.length >= 3);
  for (const w of [...WORDS, ...personal]) {
    let at = norm.indexOf(w);
    while (at >= 0) { mark(at, at + w.length, log2(WORDS.length) + 1, personal.includes(w) ? 'personal' : 'word'); at = norm.indexOf(w, at + 1); }
  }
  // sequences (abc, 987) and keyboard walks (qwer, 1qaz)
  for (let i = 0; i < pw.length - 2;) {
    const d = lower.charCodeAt(i + 1) - lower.charCodeAt(i);
    let j = i + 1;
    if (Math.abs(d) === 1) while (j + 1 < pw.length && lower.charCodeAt(j + 1) - lower.charCodeAt(j) === d) j++;
    if (j - i >= 2) { mark(i, j + 1, log2(26) + log2(j - i + 1) + 1, 'sequence'); i = j + 1; } else i++;
  }
  for (const row of KEYROWS) {
    for (const r of [row, [...row].reverse().join('')]) {
      for (let i = 0; i + 4 <= lower.length; i++) {
        let L = 0;
        while (i + L < lower.length && r.includes(lower.slice(i, i + L + 1))) L++;
        if (L >= 4) { mark(i, i + L, log2(47) + log2(L) + 1, 'keyboard'); i += L - 1; }
      }
    }
  }
  // repeats: aaa and abcabc
  pw.replace(/(.)\1{2,}/g, (m, c, i) => { mark(i, i + m.length, base + log2(m.length), 'repeat'); return m; });
  pw.replace(/(.{2,}?)\1+/g, (m, c, i) => { if (m.length >= 4) mark(i + c.length, i + m.length, log2(m.length / c.length) + 1, 'repeat'); return m; });
  // dates and years
  pw.replace(/(?:0?[1-9]|[12]\d|3[01])[/.-]?(?:0?[1-9]|1[0-2])[/.-]?(?:19|20)?\d{2}|(?:19|20)\d{2}[/.-]?(?:0?[1-9]|1[0-2])[/.-]?(?:0?[1-9]|[12]\d|3[01])/g, (m, i) => { if (m.length >= 6) mark(i, i + m.length, 15, 'date'); return m; });
  pw.replace(/(?:19|20)\d{2}/g, (m, i) => { mark(i, i + 4, 7, 'date'); return m; });

  let entropy = cost.reduce((a, b) => a + b, 0);
  if (!len) entropy = 0;
  const checks = {
    length: len >= (rules.length || 8), upper: /\p{Lu}/u.test(pw), lower: /\p{Ll}/u.test(pw), number: /\d/.test(pw),
    symbol: /[^\p{L}\p{N}\s]/u.test(pw), common: !!len && !isCommon, repeat: !!len && !/(.)\1{2,}/.test(pw),
  };
  let score = entropy < 25 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  if (isCommon) score = 0;
  else if (len < 8) score = Math.min(score, 1);
  else if (len < (rules.length || 8)) score = Math.min(score, 2);
  const suggestions = [];
  for (const k of Object.keys(rules)) if (checks[k] === false && t('password.tips.' + k) !== 'password.tips.' + k) suggestions.push(t('password.tips.' + k, { n: rules.length || 8 }));
  for (const k of ['sequence', 'keyboard', 'date', 'word', 'personal']) if (found.has(k) && score < 4) suggestions.push(t('password.tips.' + k));
  if (len && score < 3 && !suggestions.length) suggestions.push(t('password.tips.longer'));
  return {
    score, label: len ? t('password.l' + score) : '', entropy: round(entropy, 1), crackSeconds: len ? 2 ** entropy / 2 / 1e10 : 0,
    checks, rules, suggestions: [...new Set(suggestions)], patterns: [...found],
  };
}

/* ── generator ────────────────────────────────────────────────────────── */
const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', numbers: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~' };
const SIMILAR = /[il1Lo0O|`'"]/g;
/** Unbiased random int in [0, n) from crypto.getRandomValues. */
function rnd(n) {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error('crypto.getRandomValues is not available');
  const lim = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do c.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}
function generate(o = {}) {
  if (isNum(o)) o = { length: o };
  const opts = { length: 16, lower: true, upper: true, numbers: true, symbols: true, excludeSimilar: false, ...o };
  const sets = Object.keys(SETS).filter(k => opts[k]).map(k => (opts.excludeSimilar ? SETS[k].replace(SIMILAR, '') : SETS[k]));
  if (!sets.length) sets.push(SETS.lower);
  const all = sets.join(''), n = clamp(opts.length | 0, sets.length, 1024);
  const out = sets.map(s => s[rnd(s.length)]);               // at least one of each enabled set
  while (out.length < n) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

/* ── shared DOM helpers ───────────────────────────────────────────────── */
const inSetter = isBrowser ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set : null;
function wrapOf(el) {
  if (el.parentElement?.classList.contains('o-input-wrap')) return el.parentElement;
  const w = h('div', { class: 'o-input-wrap' });
  el.before(w); w.append(el); w.__oCreated = true;
  return w;
}
function actionsOf(el) {
  const w = wrapOf(el);
  let box = w.querySelector(':scope > .o-password-actions');
  if (!box) { box = h('span', { class: 'o-password-actions' }); w.append(box); }
  return box;
}
const padFor = el => { const box = el.parentElement?.querySelector(':scope > .o-password-actions'); el.style.paddingInlineEnd = box ? `calc(${box.children.length} * 1.875rem + .5rem)` : ''; };
/** After removing a button: drop the empty action box and unwrap a wrapper we created. */
function cleanupActions(el) {
  const w = el.parentElement, box = w?.querySelector(':scope > .o-password-actions');
  if (box && !box.children.length) box.remove();
  padFor(el);
  if (w?.__oCreated && w.children.length === 1 && el.isConnected) w.replaceWith(el);
}

/** Caps Lock hint shared by toggle/strength behaviors (one per input). */
function capsWatch(el) {
  if (el.__oCaps) { el.__oCaps.n++; return el.__oCaps.release; }
  if (el.dataset.oCapslock === 'false') return noop;
  let hint = null;
  const show = on => {
    if (on && !hint) { hint = h('div', { class: 'o-password-caps', role: 'status' }, raw(String(icon('alert-triangle', { size: 14 }))), h('span', { text: t('password.capsLock') })); (el.parentElement?.classList.contains('o-input-wrap') ? el.parentElement : el).after(hint); }
    else if (!on && hint) { hint.remove(); hint = null; }
  };
  const key = e => { if (e.getModifierState) show(e.getModifierState('CapsLock')); };
  const offs = [on(el, 'keydown keyup', key), on(el, 'blur', () => show(false))];
  const st = el.__oCaps = { n: 1, release: () => { if (--st.n > 0) return; offs.forEach(f => f()); show(false); delete el.__oCaps; } };
  return st.release;
}

/* ── show / hide toggle ───────────────────────────────────────────────── */
function toggle(target, force) {
  const el = $(target);
  if (!el) return;
  const btn = el.__oPwToggle, show = force ?? el.type === 'password';
  const s = el.selectionStart, e = el.selectionEnd, dir = el.selectionDirection;
  el.type = show ? 'text' : 'password';
  const keep = () => { if (s != null && doc.activeElement === el) try { el.setSelectionRange(s, e, dir); } catch {} };
  keep(); requestAnimationFrame(keep); // Chrome may reset the caret after a pointer-driven type switch
  if (btn) {
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', t(show ? 'password.hide' : 'password.show'));
    btn.innerHTML = String(icon(show ? 'eye-off' : 'eye'));
  }
  emit(el, 'o-password-toggle', { visible: show });
}
behavior('data-o-password-toggle', el => {
  if (!el.id) el.id = uid('pw');
  const btn = h('button', { type: 'button', class: 'o-input-action o-password-toggle', 'aria-controls': el.id, 'aria-pressed': 'false', 'aria-label': t('password.show'), title: t('password.show') }, raw(String(icon('eye'))));
  btn.addEventListener('pointerdown', e => { if (doc.activeElement === el) e.preventDefault(); }); // keep focus + caret in the field
  btn.addEventListener('click', () => { toggle(el); btn.title = btn.getAttribute('aria-label'); });
  el.__oPwToggle = btn;
  actionsOf(el).append(btn); padFor(el);
  const offLoc = bus.on('locale', () => { const v = el.type !== 'password'; btn.setAttribute('aria-label', t(v ? 'password.hide' : 'password.show')); btn.title = btn.getAttribute('aria-label'); });
  const offCaps = capsWatch(el);
  return () => { offLoc(); offCaps(); if (el.type === 'text') el.type = 'password'; btn.remove(); delete el.__oPwToggle; cleanupActions(el); };
});

/* ── generate button ──────────────────────────────────────────────────── */
behavior('data-o-password-generate', el => {
  const v = el.getAttribute('data-o-password-generate');
  const opts = /^\s*\{/.test(v) ? parseJSON(v, {}) : v ? { length: +v || 16 } : {};
  const btn = h('button', { type: 'button', class: 'o-input-action o-password-generate', 'aria-label': t('password.generate'), title: t('password.generate') }, raw(String(icon('sparkles'))));
  btn.addEventListener('click', () => {
    const pw = generate(opts);
    inSetter.call(el, pw);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.__oPwToggle) toggle(el, true);
    el.focus(); el.setSelectionRange?.(pw.length, pw.length);
    announce(t('password.generated'));
    emit(el, 'o-password-generate', { value: pw });
  });
  const box = actionsOf(el);
  box.prepend(btn); padFor(el);
  return () => { btn.remove(); cleanupActions(el); };
});

/* ── strength meter ───────────────────────────────────────────────────── */
const METERS = new WeakMap();
behavior('data-o-strength', el => {
  const d = el.dataset, rules = parseRules(d.oStrengthRules);
  const bar = h('div', { class: 'o-strength-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '4', 'aria-valuenow': '0' }, [0, 1, 2, 3, 4].map(() => h('i')));
  const label = h('span', { class: 'o-strength-label' });
  const list = d.oStrengthChecklist === 'false' ? null : h('ul', { class: 'o-strength-rules' });
  const box = h('div', { class: 'o-strength', id: uid('strength'), 'data-score': '' }, h('div', { class: 'o-strength-head' }, bar, label), list);
  const target = d.oStrengthTarget ? $(d.oStrengthTarget) : null;
  if (target) target.append(box); else (el.parentElement?.classList.contains('o-input-wrap') ? el.parentElement : el).after(box);
  const prevDesc = el.getAttribute('aria-describedby');
  el.setAttribute('aria-describedby', cls(prevDesc, box.id));
  let ownErr = false, last = -1;
  const paint = (li, k, r, has) => {
    const ok = has && r.checks[k];
    li.classList.toggle('is-met', ok);
    li.children[1].textContent = t('password.rules.' + k, { n: rules.length || 8 });
    li.children[2].textContent = ' (' + t(ok ? 'password.met' : 'password.notMet') + ')';
  };
  const upd = () => {
    const userInputs = (d.oStrengthUser || '').split(',').map(s => { try { return $(s.trim())?.value; } catch { return null; } }).filter(Boolean);
    const r = strength(el.value, { rules, userInputs });
    const has = !!el.value;
    box.dataset.score = has ? r.score : '';
    bar.setAttribute('aria-valuenow', has ? r.score : 0);
    bar.setAttribute('aria-valuetext', has ? r.label : t('password.empty'));
    bar.setAttribute('aria-label', t('password.strength'));
    label.textContent = has ? r.label : '';
    label.title = r.suggestions.join('\n');
    if (list) {
      const mk = k => { const li = h('li', { 'data-rule': k }, raw(String(icon('check', { size: 14 }))), h('span'), h('span', { class: 'o-sr-only' })); paint(li, k, r, has); return li; };
      patchList(list, Object.keys(rules).filter(k => k in r.checks), k => k, mk, (li, k) => paint(li, k, r, has));
    }
    const min = d.oStrengthMin;
    const err = has && min != null && r.score < +min ? t('password.tips.tooWeak') : '';
    if (err || ownErr) { el.setCustomValidity(err); ownErr = !!err; }
    if (has && r.score !== last) emit(el, 'o-strength', r);
    last = has ? r.score : -1;
  };
  const offs = [on(el, 'input', upd), on(el, 'change', upd), capsWatch(el), bus.on('locale', upd)];
  if (el.form) offs.push(on(el.form, 'reset', () => setTimeout(upd)));
  METERS.set(el, upd);
  upd();
  return () => {
    offs.forEach(f => f()); box.remove(); METERS.delete(el);
    if (prevDesc) el.setAttribute('aria-describedby', prevDesc); else el.removeAttribute('aria-describedby');
    if (ownErr) el.setCustomValidity('');
  };
});

O.password = { strength, generate, toggle, refresh: el => METERS.get($(el))?.(), common: COMMON };
