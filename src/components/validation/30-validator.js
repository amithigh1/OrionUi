/* Form validation engine.
 *   const v = Orion.validate(form, {
 *     rules: { email: 'required|email|remote:/api/check-email', age: ['required', 'integer', 'between:18,99'] },
 *     messages: { email: { required: 'We need your email' } },
 *     live: 'blur' | 'input' | 'submit' | 'dirty',    summary: true | '#selector',   success: false,
 *     scrollToError: true, focusInvalid: true, remote: async (url, { value, name, field, form, signal }) => bool|string,
 *     onSubmit: async (data, form) => void | { errors: { field: 'message' } },   onInvalid: (errors, form) => {}
 *   });
 *   await v.validate([scopeElement | names]) -> boolean ; await v.validateField(name) ; v.errors ; v.setErrors({...})
 *   v.clear() ; v.reset() ; v.destroy() ; v.focusField(name)
 *   <form data-o-validate data-o-live="input" data-o-summary> + <input data-o-rules="required|min:3" data-o-messages='{"required":"…"}'>
 * Events on the form: o-invalid { errors }, o-valid, o-submit { data } (cancelable, when no onSubmit), o-submitted { data, result }.
 */
const __validators = new WeakMap();
const STALE = Symbol('stale');
const TEXTISH = /^(text|email|url|tel|search|password|number|date|datetime-local|month|week|time|color)$/;
const addToken = (el, attr, id) => { const l = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean); if (!l.includes(id)) { l.push(id); el.setAttribute(attr, l.join(' ')); } };
const removeToken = (el, attr, id) => { const l = (el.getAttribute(attr) || '').split(/\s+/).filter(x => x && x !== id); if (l.length) el.setAttribute(attr, l.join(' ')); else el.removeAttribute(attr); };
const setBusy = (btn, on) => { if (!btn) return; btn.classList.toggle('is-loading', on); if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); };
const cssEsc = s => (win && win.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

class Validator {
  constructor(root, opts = {}) {
    this.root = root;
    this.form = root.tagName === 'FORM' ? root : null;
    this.opts = { live: 'blur', summary: false, scrollToError: true, focusInvalid: true, success: false, remoteDelay: 450, inputDelay: 160, ...opts };
    this._state = new Map();
    this._cache = new Map();
    this._offs = [];
    this._general = [];
    this.submitted = false;
    this.busy = false;
    if (this.form) { this._noval = this.form.noValidate; this.form.noValidate = true; }
    this._bind();
    this._linkHelp();
  }

  /* ── fields ── */
  fields(scope, { all = false } = {}) {
    let els = formFields(this.root).filter(el => !el.closest('[data-o-novalidate]'));
    if (!all) els = els.filter(el => !isDisabledEl(el) && !(el.type === 'hidden' && !el.hasAttribute('data-o-rules')));
    if (scope instanceof Element) els = els.filter(el => scope.contains(el));
    else if (scope != null) { const keys = toArr(scope).map(String), nk = keys.map(nameKey); els = els.filter(el => keys.includes(nameOf(el)) || nk.includes(nameKey(nameOf(el)))); }
    const map = new Map(), counts = {};
    for (const el of els) {
      const name = nameOf(el), grp = el.type === 'radio' || el.type === 'checkbox';
      let key = grp ? name + '\u0000' + el.type : name;
      if (!grp && map.has(key)) { counts[name] = (counts[name] || 1) + 1; key = name + '#' + counts[name]; }
      let f = map.get(key);
      if (!f) map.set(key, (f = { key: grp ? name : key, name, els: [], el, group: grp }));
      f.els.push(el);
    }
    return [...map.values()];
  }
  _st(f) {
    let s = this._state.get(f.key);
    if (!s) this._state.set(f.key, (s = { touched: false, dirty: false, error: null, seq: 0, initial: JSON.stringify(controlValue(f.el, f.els) ?? null) }));
    return s;
  }
  _find(n, from) {
    const all = this.fields(null, { all: true });
    const row = from && from.closest && from.closest('.o-repeater-row');
    if (row) { const r = all.find(x => row.contains(x.el) && (x.name === n || x.name.endsWith('[' + n + ']'))); if (r) return r; }
    const k = nameKey(n);
    return all.find(x => x.name === n) || all.find(x => nameKey(x.name) === k) || null;
  }
  _field(name) {
    if (name && isObj(name) && name.els) return name;
    return this.fields(null, { all: true }).find(f => f.key === name) || this._find(String(name));
  }
  labelFor(f) { const s = this._st(f); return s.label || (s.label = labelOf(f.el, this.root)); }
  _opt(key, f) { const o = this.opts[key]; if (!o) return undefined; return o[f.name] ?? o[nameKey(f.name)] ?? o[f.name.replace(/\[\]$/, '')]; }

  /* ── rules ── */
  _rules(f) {
    const out = [], el = f.el;
    if (f.els.some(e => e.required === true || e.hasAttribute('required'))) out.push(['required', []]);
    if (!isCustomField(el)) {
      const type = (el.type || '').toLowerCase(), a = n => el.getAttribute(n);
      if (type === 'email') out.push(['email', []]);
      else if (type === 'url') out.push(['url', []]);
      else if (type === 'number' || type === 'range') out.push(['number', []]);
      if (a('minlength')) out.push(['minlength', [a('minlength')]]);
      if (a('maxlength')) out.push(['maxlength', [a('maxlength')]]);
      if (a('pattern')) out.push(['pattern', [a('pattern')], { anchored: true }]);
      if (type === 'number' || type === 'range') { if (a('min')) out.push(['min', [a('min')]]); if (a('max')) out.push(['max', [a('max')]]); }
      else if (/^(date|datetime-local|month|week|time)$/.test(type)) { if (a('min')) out.push(['after_or_equal', [a('min')]]); if (a('max')) out.push(['before_or_equal', [a('max')]]); }
      if (type === 'file' && a('accept')) out.push(['filetype', a('accept').split(',')]);
    }
    for (const e of f.els) { const r = e.getAttribute('data-o-rules'); if (r) out.push(...parseRules(r)); }
    const js = this._opt('rules', f);
    if (js != null) out.push(...parseRules(js));
    const last = new Map();
    out.forEach((r, i) => isStr(r[0]) && last.set(r[0], i));
    return out.filter((r, i) => !isStr(r[0]) || last.get(r[0]) === i);
  }
  _kind(f, rules, value) {
    const el = f.el, type = (el.type || '').toLowerCase(), names = rules.map(r => r[0]);
    if (isNum(value) || /^(number|range)$/.test(type) || names.some(n => n === 'number' || n === 'numeric' || n === 'integer')) return 'number';
    if (value instanceof Date || /^(date|datetime-local|month|week)$/.test(type) || /date/.test(el.localName) || names.some(n => ['date', 'before', 'after', 'before_or_equal', 'after_or_equal'].includes(n))) return 'date';
    return 'string';
  }
  _customMsg(f, rule) {
    const m = this._opt('messages', f);
    if (isStr(m)) return m;
    if (isObj(m) && m[rule] != null) return m[rule];
    for (const e of f.els) {
      const dm = e.getAttribute('data-o-messages');
      const o = dm ? parseJSON(dm, null) : null;
      if (o && o[rule] != null) return o[rule];
      if (e.getAttribute('data-o-message')) return e.getAttribute('data-o-message');
    }
    return null;
  }
  _ctx(f, value, rules, immediate) {
    const self = this;
    return {
      validator: this, root: this.root, form: this.form, name: f.name, field: f, el: f.el, value, immediate, params: {},
      kind: this._kind(f, rules, value), label: this.labelFor(f),
      hasField: n => !!self._find(n, f.el),
      other: n => { const o = self._find(n, f.el); return o ? controlValue(o.el, o.els) : undefined; },
      otherLabel: n => { const o = self._find(n, f.el); return o ? self.labelFor(o) : n; },
      remote: (url, v) => self._remote(f, url, v, immediate),
      values: () => serialize(self.root),
    };
  }
  async _check(f, { immediate = true } = {}) {
    const st = this._st(f), seq = ++st.seq, el = f.el;
    if (st.cvEl) { try { st.cvEl.setCustomValidity(''); } catch {} st.cvEl = null; }
    if (st.server) return { rule: 'server', message: st.server };
    const value = controlValue(el, f.els);
    const rules = this._rules(f), ctx = this._ctx(f, value, rules, immediate), empty = isEmptyVal(value);
    for (const [r, params, extra] of rules) {
      const def = isFn(r) ? { fn: r } : __rules.get(r);
      if (!def || !def.fn) { console.warn('[Orion] unknown validation rule:', r); continue; }
      if (empty && !def.always) continue;
      const rname = isStr(r) ? r : isStr(extra) ? extra : 'custom';
      ctx.anchored = !!(extra && extra.anchored); ctx.params = {}; ctx.rule = rname;
      let res;
      try { res = def.fn.call(ctx, value, params, el, this.root, ctx); } catch (e) { console.error('[Orion] rule "' + rname + '" failed:', e); res = true; }
      if (res && isFn(res.then)) {
        this._pending(f, true);
        try { res = await res; } catch { res = vt('remoteError'); }
        if (seq !== st.seq) return STALE;
      }
      if (res === SKIP) return STALE;
      if (isObj(res)) res = res.valid === true ? true : res.message || false;
      if (res === true || res == null) continue;
      const cm = this._customMsg(f, rname);
      return { rule: rname, message: cm != null ? interpolate(cm, params, ctx) : isStr(res) && res ? res : ruleMessage(def, rname, params, ctx) };
    }
    if (isCustomField(el)) {
      if (isFn(el.checkValidity) && !el.checkValidity()) return { rule: 'native', message: this._customMsg(f, 'native') || el.validationMessage || vt('invalid') };
    } else if (el.validity && !f.group) {
      if (el.validity.badInput) return { rule: 'number', message: this._customMsg(f, 'number') || vt(el.type === 'number' ? 'number' : 'invalid') };
      if (el.validity.stepMismatch) return { rule: 'step', message: this._customMsg(f, 'step') || el.validationMessage || vt('invalid') };
    }
    return null;
  }
  async _remote(f, url, value, immediate) {
    const key = url + '\u0001' + JSON.stringify(value);
    if (this._cache.has(key)) return this._cache.get(key);
    const st = this._st(f);
    if (!immediate) { const tok = (st.rtok = {}); await sleep(this.opts.remoteDelay); if (st.rtok !== tok) return SKIP; }
    if (st.abort) st.abort.abort();
    const ac = (st.abort = typeof AbortController !== 'undefined' ? new AbortController() : null);
    const gfn = !/[/:?]/.test(url) ? getPath(win, url) : null;
    let res = isFn(gfn)
      ? await gfn(value, f.el, this.root, { signal: ac && ac.signal })
      : await (this.opts.remote || validate.remote)(url, { value, name: f.name, field: f.el, form: this.root, signal: ac && ac.signal });
    st.abort = null;
    if (res === true || res === 'true') res = true;
    else if (res === false || res === 'false') res = false;
    else if (isObj(res)) res = res.valid === true ? true : res.message || false;
    this._cache.set(key, res);
    return res;
  }
  async _run(f, immediate) {
    const err = await this._check(f, { immediate });
    if (err !== STALE) this._render(f, err);
    return err;
  }
  _debounced(f) {
    const st = this._st(f);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => this._run(f, false), this.opts.inputDelay);
  }

  /* ── rendering ── */
  _box(f) {
    const box = f.el.closest('.o-field, [data-o-field]');
    if (box && this.root.contains(box) && box !== this.root) return box;
    if (f.group) { const fs = f.el.closest('fieldset'); if (fs && this.root.contains(fs) && fs !== this.root) return fs; }
    return null;
  }
  _controls(f) { return f.els.map(e => (isCustomField(e) && e.focusTarget && e.contains(e.focusTarget) ? e.focusTarget : e)); }
  _errEl(f, box, create) {
    const st = this._st(f);
    if (st.errEl && st.errEl.isConnected) return st.errEl;
    let e = this.root.querySelector(`[data-o-error-for="${cssEsc(f.name)}"]`);
    if (!e && box) e = [...box.querySelectorAll('.o-error')].find(x => (!x.dataset.oErrorFor || x.dataset.oErrorFor === f.name) && (x.closest('.o-field, [data-o-field], fieldset') === box || !box.querySelector('.o-field')));
    if (!e && !create) return null;
    if (!e) {
      e = h('div', { class: 'o-error', 'data-o-error-for': f.name, 'data-o-generated': '' });
      if (box) box.append(e);
      else { const last = f.els[f.els.length - 1]; (last.closest('.o-check, .o-switch, .o-input-group, .o-input-wrap') || last).after(e); }
    }
    e.dataset.oErrorFor = f.name;
    if (!e.id) e.id = uid('o-err');
    return (st.errEl = e);
  }
  _pending(f, on) {
    const box = this._box(f), e = this._errEl(f, box, on);
    (box || f.el).classList.toggle('is-validating', on);
    this._controls(f).forEach(c => (on ? c.setAttribute('aria-busy', 'true') : c.removeAttribute('aria-busy')));
    if (e && on) { e.classList.add('is-pending', 'is-visible'); e.textContent = vt('checking'); }
  }
  _render(f, err) {
    const st = this._st(f), box = this._box(f), ctls = this._controls(f), inv = !!err;
    st.error = inv ? err.message : null;
    st.rule = inv ? err.rule : null;
    (box || f.el).classList.remove('is-validating');
    if (box) box.classList.toggle('is-invalid', inv);
    else f.els.forEach(e => e.classList.toggle('is-invalid', inv));
    ctls.forEach(c => { c.removeAttribute('aria-busy'); if (inv) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); });
    const e = this._errEl(f, box, inv);
    if (e) {
      e.classList.remove('is-pending');
      e.classList.toggle('is-visible', inv);
      e.textContent = inv ? err.message : '';
      ctls.forEach(c => (inv ? addToken : removeToken)(c, 'aria-describedby', e.id));
    }
    if (this.opts.success) {
      const ok = !inv && st.touched && !isEmptyVal(controlValue(f.el, f.els));
      if (box) box.classList.toggle('is-valid', ok); else f.els.forEach(x => x.classList.toggle('is-valid', ok));
    }
    if (inv) { try { f.els[0].setCustomValidity(err.message); st.cvEl = f.els[0]; } catch {} }
    else if (st.cvEl) { try { st.cvEl.setCustomValidity(''); } catch {} st.cvEl = null; }
    this._syncSummary();
  }
  _linkHelp() {
    for (const box of $$('.o-field', this.root)) {
      const help = box.querySelector(':scope > .o-help');
      if (!help) continue;
      if (!help.id) help.id = uid('o-help');
      const ctl = box.querySelector('input:not([type=hidden]),select,textarea');
      const host = [...box.children].find(isCustomField);
      const c = host ? (host.focusTarget || null) : ctl;
      if (c && !(c.getAttribute('aria-describedby') || '').includes(help.id)) addToken(c, 'aria-describedby', help.id);
    }
  }

  /* ── summary ── */
  errorList() {
    return this.fields(null, { all: true }).map(f => ({ f, st: this._st(f) })).filter(x => x.st.error)
      .map(({ f, st }) => ({ key: f.key, name: f.name, label: this.labelFor(f), message: st.error, el: f.el, field: f }));
  }
  _syncSummary(force) {
    const want = this.opts.summary;
    if (!this._general.length && (!want || (!this.submitted && !force))) { if (this._sum) this._sum.hidden = true; return; }
    const items = want ? this.errorList() : [];
    if (!items.length && !this._general.length) { if (this._sum) this._sum.hidden = true; return; }
    const box = this._summaryEl(), count = items.length + this._general.length;
    const tid = box.getAttribute('aria-labelledby');
    const idOf = f => { const c = this._controls(f)[0]; if (!c.id) c.id = uid('o-fld'); return c.id; };
    box.innerHTML = String(html`${icon('alert-circle')}<div class="o-alert-content"><p class="o-alert-title" id="${tid}">${t('validation.summary', { count })}</p><ul class="o-validation-list">${this._general.map(m => html`<li>${m}</li>`)}${items.map(it => html`<li><a href="#${idOf(it.field)}" data-o-key="${it.key}">${t('validation.errorIn', { label: it.label, message: it.message })}</a></li>`)}</ul></div>`);
    box.hidden = false;
  }
  _summaryEl() {
    if (this._sum && this._sum.isConnected) return this._sum;
    const sel = this.opts.summary;
    const host = (isStr(sel) ? $(sel) : sel instanceof Element ? sel : null) || this.root.querySelector('[data-o-summary]');
    const box = h('div', { class: 'o-alert o-alert-danger o-validation-summary', role: 'alert', tabindex: '-1', hidden: true, 'aria-labelledby': uid('o-sum') });
    if (host) host.append(box); else this.root.prepend(box);
    this._offs.push(on(box, 'click', 'a[data-o-key]', (e, a) => { e.preventDefault(); this.focusField(a.dataset.oKey); }));
    return (this._sum = box);
  }

  /* ── focus ── */
  focusField(name) {
    const f = this._field(name);
    if (!f) return;
    const target = f.group ? f.els.find(e => e.checked) || f.els[0] : f.el;
    for (let p = target.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS' && !p.open) p.open = true;
    emit(target, 'o-reveal', { name: f.name });
    requestAnimationFrame(() => {
      try { target.focus({ preventScroll: true }); } catch {}
      if (this.opts.scrollToError !== false) (this._box(f) || target).scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  /* ── public API ── */
  get errors() { const o = {}; for (const it of this.errorList()) o[it.name] = it.message; return o; }
  get valid() { return !this.errorList().length; }
  async validate(scope, { submit = false, focus = submit } = {}) {
    this._linkHelp();
    const list = this.fields(scope);
    await Promise.all(list.map(f => { this._st(f).touched = true; return this._run(f, true); }));
    if (submit) this.submitted = true;
    const bad = list.filter(f => this._st(f).error);
    this._syncSummary(submit);
    if (!bad.length) { emit(this.root, 'o-valid', {}); return true; }
    const errors = {};
    bad.forEach(f => { errors[f.name] = this._st(f).error; });
    if (isFn(this.opts.onInvalid)) this.opts.onInvalid(errors, this.root);
    emit(this.root, 'o-invalid', { errors, fields: bad.map(f => f.el) });
    if (submit && !this.opts.summary) announce(t('validation.summary', { count: bad.length }), 'assertive');
    if (focus && this.opts.focusInvalid !== false) this.focusField(bad[0]);
    return false;
  }
  async validateField(name) {
    const f = this._field(name);
    if (!f) return true;
    this._st(f).touched = true;
    const err = await this._run(f, true);
    return !err || (err === STALE && !this._st(f).error);
  }
  setErrors(errs = {}, { focus = true } = {}) {
    const all = this.fields(null, { all: true }), general = [];
    let first = null;
    for (const [k, v] of Object.entries(errs || {})) {
      const msg = Array.isArray(v) ? v[0] : v;
      if (!msg) continue;
      const f = all.find(x => x.name === k || x.key === k) || all.find(x => nameKey(x.name) === nameKey(k));
      if (!f) { general.push(String(msg)); continue; }
      const st = this._st(f);
      st.server = String(msg); st.touched = true;
      this._render(f, { rule: 'server', message: String(msg) });
      if (!first) first = f;
    }
    this._general = general;
    this.submitted = true;
    this._syncSummary(true);
    emit(this.root, 'o-invalid', { errors: this.errors, server: true });
    if (!this.opts.summary && general.length) announce(general.join('. '), 'assertive');
    if (focus && first) this.focusField(first);
    else if (focus && general.length && this._sum) this._sum.focus();
  }
  clear() {
    for (const f of this.fields(null, { all: true })) {
      const st = this._st(f);
      st.server = null; st.touched = false; st.dirty = false; clearTimeout(st.timer); st.seq++;
      if (st.error || st.cvEl) this._render(f, null);
      (this._box(f) || f.el).classList.remove('is-valid', 'is-validating');
    }
    this._general = [];
    this.submitted = false;
    if (this._sum) this._sum.hidden = true;
  }
  reset() { if (this.form) this.form.reset(); this.clear(); this._state.clear(); }
  destroy() {
    this.clear();
    this._offs.forEach(f => f());
    this._offs = [];
    if (this._sum) this._sum.remove();
    if (this.form) this.form.noValidate = !!this._noval;
    __validators.delete(this.root);
  }

  /* ── events ── */
  _bind() {
    const r = this.root;
    this._offs.push(on(r, 'input', e => this._onInput(e)), on(r, 'change', e => this._onChange(e)), on(r, 'focusout', e => this._onBlur(e)),
      on(r, 'o-condition', e => this._onCondition(e)));
    if (this.form) {
      const s = e => this._onSubmit(e);
      this.form.addEventListener('submit', s, true);
      this._offs.push(() => this.form.removeEventListener('submit', s, true), on(this.form, 'reset', () => setTimeout(() => { this.clear(); this._state.clear(); }, 0)));
    }
  }
  _fieldFor(target) {
    let host = null;
    for (let n = target; n && n !== this.root && n.nodeType === 1; n = n.parentElement) if (isCustomField(n)) host = n;
    const el = host || target;
    if (!el || el.nodeType !== 1 || (!CONTROL_TAGS.test(el.localName) && !isCustomField(el)) || !nameOf(el)) return null;
    return this.fields(null).find(f => f.els.includes(el)) || null;
  }
  _onInput(e) {
    const f = this._fieldFor(e.target);
    if (!f) return;
    const st = this._st(f), mode = this.opts.live;
    st.dirty = true;
    if (st.server) st.server = null;
    const changed = () => JSON.stringify(controlValue(f.el, f.els) ?? null) !== st.initial;
    if (st.error || mode === 'input' || (mode === 'dirty' && changed())) this._debounced(f);
    else if (this.opts.success && st.touched) this._debounced(f);
    this._dependents(f);
  }
  _onChange(e) {
    const el = e.target;
    if ((el.localName === 'input' && TEXTISH.test(el.type)) || el.localName === 'textarea') return;
    const f = this._fieldFor(el);
    if (!f) return;
    const st = this._st(f);
    st.dirty = true; st.touched = true;
    if (st.server) st.server = null;
    if (this.opts.live !== 'submit' || st.error) this._run(f, true);
    this._dependents(f);
  }
  _onBlur(e) {
    const f = this._fieldFor(e.target);
    if (!f) return;
    const rel = e.relatedTarget;
    if (rel && ((isCustomField(f.el) && f.el.contains(rel)) || f.els.includes(rel))) return;
    const st = this._st(f);
    if (st.dirty || !isEmptyVal(controlValue(f.el, f.els))) st.touched = true;
    const mode = this.opts.live;
    if (mode === 'submit' || (mode === 'dirty' && !st.dirty)) return;
    if (st.touched || st.error) { clearTimeout(st.timer); this._run(f, true); }
  }
  _dependents(f) {
    for (const o of this.fields(null)) {
      if (o === f) continue;
      const st = this._st(o);
      if (!st.error && !(st.touched && st.dirty)) continue;
      if (this._rules(o).some(([r, p]) => isStr(r) && p.some(x => x === f.name || nameKey(String(x)) === nameKey(f.name) || f.name.endsWith('[' + x + ']')))) this._debounced(o);
    }
  }
  _onCondition(e) {
    if (e.detail && e.detail.shown) return;
    for (const f of this.fields(null, { all: true })) {
      if (!e.target.contains(f.el)) continue;
      const st = this._st(f);
      st.touched = false; st.server = null; st.seq++;
      if (st.error) this._render(f, null);
    }
  }
  async _onSubmit(e) {
    const form = this.form;
    if (e.target !== form) return;
    if (form.__oBypass) { form.__oBypass = false; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.busy) return;
    this.busy = true;
    const btn = e.submitter || form.querySelector('[type=submit], button:not([type])');
    const slow = setTimeout(() => setBusy(btn, true), 150);
    let ok = false;
    try { ok = await this.validate(null, { submit: true }); } finally { clearTimeout(slow); }
    if (!ok) { this.busy = false; setBusy(btn, false); return; }
    this._general = [];
    this._syncSummary();
    const data = serialize(form);
    if (isFn(this.opts.onSubmit)) {
      setBusy(btn, true);
      form.setAttribute('aria-busy', 'true');
      try {
        const res = await this.opts.onSubmit(data, form);
        if (res && res.errors) this.setErrors(res.errors);
        else { emit(form, 'o-submitted', { data, result: res }); if (this.opts.resetOnSuccess) this.reset(); }
      } catch (err) {
        if (err && err.errors) this.setErrors(err.errors);
        else { this._general = [(err && err.message) || vt('submitError')]; this._syncSummary(true); if (this._sum) this._sum.focus(); console.warn('[Orion] onSubmit failed:', err); }
      } finally { this.busy = false; setBusy(btn, false); form.removeAttribute('aria-busy'); }
      return;
    }
    this.busy = false;
    setBusy(btn, false);
    if (!emit(form, 'o-submit', { data, form }).defaultPrevented) {
      emit(form, 'o-submitted', { data, native: true });
      form.__oBypass = true;
      try { form.requestSubmit(btn && btn.form === form && /^(submit|image)$/.test(btn.type) ? btn : undefined); } catch { form.__oBypass = false; form.submit(); }
    }
  }
}

/** Orion.validate(formOrContainer, opts) -> Validator (one per element; calling again merges options). */
function validate(root, opts) {
  root = $(root);
  if (!root) throw new Error('Orion.validate: element not found');
  let v = __validators.get(root);
  if (v) { if (opts) Object.assign(v.opts, opts); return v; }
  v = new Validator(root, opts);
  __validators.set(root, v);
  return v;
}
validate.rule = (name, fn, message, o) => { defineRule(name, fn, message, o); return validate; };
validate.get = el => __validators.get($(el)) || null;
validate.rules = () => [...__rules.keys()];
validate.parse = parseRules;
validate.serialize = serialize;
validate.fill = fill;
/** Default remote check: GET url?field=value -> true | false | "message" | { valid, message } */
validate.remote = async (url, { value, name, signal }) => {
  const u = new URL(url, location.href);
  u.searchParams.set(parseName(name).filter(Boolean).pop() || 'value', isObj(value) ? JSON.stringify(value) : String(value));
  const res = await fetch(u, { signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const txt = (await res.text()).trim();
  const j = parseJSON(txt, undefined);
  return j === undefined ? txt : j;
};
/** Validate a bare value without a form: await Orion.validate.check('abc', 'required|email') -> message | null */
validate.check = async (value, rules, { label = '' } = {}) => {
  const list = parseRules(rules), empty = isEmptyVal(value);
  const ctx = { value, label, params: {}, kind: isNum(value) ? 'number' : value instanceof Date ? 'date' : 'string', hasField: () => false, other: () => undefined, otherLabel: n => n, remote: (u, v) => validate.remote(u, { value: v, name: 'value' }) };
  for (const [r, params] of list) {
    const def = isFn(r) ? { fn: r } : __rules.get(r);
    if (!def || !def.fn || (empty && !def.always)) continue;
    let res = await def.fn.call(ctx, value, params, null, null, ctx);
    if (isObj(res)) res = res.valid === true ? true : res.message || false;
    if (res === true || res == null || res === SKIP) continue;
    return isStr(res) && res ? res : ruleMessage(def, r, params, ctx);
  }
  return null;
};
O.validate = validate;
O.Validator = Validator;

behavior('data-o-validate', form => {
  if (__validators.has(form)) return;
  const ds = form.dataset, opts = parseJSON(form.getAttribute('data-o-validate') || '{}', {}) || {};
  if (ds.oLive) opts.live = ds.oLive;
  if (ds.oSummary != null) opts.summary = ds.oSummary === '' || ds.oSummary === 'true' ? true : ds.oSummary === 'false' ? false : ds.oSummary;
  if (ds.oSuccess != null) opts.success = ds.oSuccess !== 'false';
  if (ds.oScroll === 'false') opts.scrollToError = false;
  if (ds.oOnsubmit) { const fn = getPath(win, ds.oOnsubmit); if (isFn(fn)) opts.onSubmit = fn; }
  const v = validate(form, opts);
  return () => v.destroy();
});
