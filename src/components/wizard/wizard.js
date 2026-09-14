// @deps validation, stepper
/* Form wizard.
 *   <form data-o-validate><o-wizard persist="job-application">
 *     <section data-step="Account" data-icon="user" data-description="Login details"> …fields… </section>
 *     <section data-step="Experience" data-optional> … </section>
 *     <section data-step="Review" data-review></section>        (summary of every step is rendered here)
 *   </o-wizard></form>
 *   Props: current (0-based), linear (default true), validate (default true), persist (storage key), restore ('auto'|'prompt'),
 *          orientation ('horizontal'|'vertical'), stepperVariant, nextText, backText, finishText, skipText, guard(from, to), texts
 *   Methods: next(), prev(), goTo(i), skip(), finish(), reset(), review() -> [{ index, title, fields: [{ name, label, value }] }], steps
 *   Events: o-step-change { from, to, direction, waitUntil(promise) } (cancelable) · o-step { index, from } · o-finish { data } (cancelable) · o-reset
 *   Keyboard: Enter in a field = Next (Finish on the last step); the step header is arrow-key navigable.
 *   Inside a <form>, Finish calls form.requestSubmit() so Orion.validate's onSubmit / native submit take over.
 */
i18n.add('en', {
  wizard: {
    next: 'Next', back: 'Back', finish: 'Finish', skip: 'Skip', edit: 'Edit', stepOf: 'Step {n} of {total}: {title}',
    empty: 'Not provided', review: 'Review your answers', restored: 'Progress restored', invalid: 'Please fix the errors in {title}',
  },
});
const FU = () => O.formUtil;
const PERSIST = key => 'orion:wizard:' + key;

class OWizard extends OElement {
  static props = {
    current: { type: Number, default: 0 }, linear: { type: Boolean, default: true }, validate: { type: Boolean, default: true },
    persist: String, restore: { type: String, default: 'auto' }, orientation: { type: String, default: 'horizontal', reflect: true },
    stepperVariant: { type: String, default: 'default' }, nextText: String, backText: String, finishText: String, skipText: String,
    guard: Function, texts: Object,
  };
  setup() {
    this.classList.add('o-wizard');
    this._cur = -1; this._reached = 0; this._errors = new Set(); this._visited = new Set();
    this._stepper = h('o-stepper', { class: 'o-wizard-stepper', clickable: true });
    this._header = h('div', { class: 'o-wizard-header' }, this._stepper);
    const btn = (c, ic, end) => h('button', { type: 'button', class: 'o-btn ' + c }, !end && ic ? iconEl(ic) : null, h('span'), end && ic ? iconEl(ic) : null);
    this._back = btn('o-wizard-back', 'chevron-left');
    this._skip = btn('o-btn-ghost o-wizard-skip');
    this._next = btn('o-btn-primary o-wizard-next', 'chevron-right', true);
    this._finish = btn('o-btn-success o-wizard-finish', 'check', true);
    this._status = h('span', { class: 'o-wizard-status' });
    this._footer = h('div', { class: 'o-wizard-footer' }, this._back, this._status, h('div', { class: 'o-wizard-end' }, this._skip, this._next, this._finish));
    this.prepend(this._header);
    this.append(this._footer);
    this._back.onclick = () => this.prev();
    this._next.onclick = () => this.next();
    this._skip.onclick = () => this.skip();
    this._finish.onclick = () => this.finish();
    on(this._stepper, 'o-select', e => { e.preventDefault(); this.goTo(e.detail.index); });
    on(this, 'keydown', e => this._onKey(e));
    on(this, 'o-reveal', e => { const i = this._indexOf(e.target); if (i >= 0 && i !== this._cur) this._show(i); });
    on(this, 'input change', () => this._recheckSoon());
  }
  connected() {
    const mo = new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-step')))) this._read(); });
    mo.observe(this, { childList: true });
    this.addCleanup(() => mo.disconnect());
    this.listen(this.root, 'o-invalid', e => this._onInvalid(e));
    if (this.form) this.listen(this.form, 'o-submitted', () => this._clearPersist());
    if (this.persist && this._restored && !this._auto) this._makeAuto('none');
  }
  disconnected() { if (this._auto) { this._auto.destroy(); this._auto = null; } }
  get form() { return this.closest('form'); }
  get root() { return this.form || this; }
  get sections() { return [...this.children].filter(c => c.hasAttribute('data-step')); }
  get steps() {
    return this.sections.map((s, i) => ({
      index: i, title: s.getAttribute('data-step') || s.getAttribute('data-title') || this.t('wizard.review'), icon: s.getAttribute('data-icon') || undefined,
      description: s.getAttribute('data-description') || undefined, optional: s.hasAttribute('data-optional'), review: s.hasAttribute('data-review'), el: s,
    }));
  }
  update(changed) {
    if (changed.has('init')) { this._read(); this._restore(); if (this._cur < 0) this._show(clamp(this.current, 0, Math.max(0, this.sections.length - 1)), null, false); return; }
    if (changed.has('current') && this.current !== this._cur && this._cur >= 0) this._show(clamp(this.current, 0, this.sections.length - 1), null, false);
    if ([...changed].some(k => /^(orientation|stepperVariant|locale|texts|linear)$|Text$/.test(k))) this._paint();
  }
  _read() {
    this.sections.forEach((s, i) => {
      if (!s.id) s.id = uid('o-wstep');
      s.setAttribute('role', 'group');
      s.setAttribute('aria-label', this.steps[i].title);
      s.tabIndex = -1;
      s.classList.add('o-wizard-step');
      s.hidden = i !== this._cur;
    });
    if (this._cur >= this.sections.length) this._cur = this.sections.length - 1;
    this._paint();
  }
  _indexOf(el) { return this.sections.findIndex(s => s.contains(el)); }
  _validator() {
    if (!this.validate || !O.validate) return null;
    return O.validate.get(this.root) || O.validate(this.root, { live: 'blur' });
  }

  /* ── navigation ── */
  async _stepValid(i) {
    const s = this.sections[i], v = this._validator();
    if (!s || this.steps[i].review) return true;
    let ok = true;
    if (v) ok = await v.validate(s, { focus: i === this._cur });
    else for (const el of FU().formFields(s)) if (!el.disabled && isFn(el.checkValidity) && !el.checkValidity()) { ok = false; if (i === this._cur) el.reportValidity?.(); break; }
    if (ok) this._errors.delete(i); else { this._errors.add(i); announce(this.t('wizard.invalid', { title: this.steps[i].title }), 'assertive'); }
    return ok;
  }
  async goTo(i, { force = false } = {}) {
    const n = this.sections.length, from = this._cur;
    i = clamp(+i || 0, 0, n - 1);
    if (i === from || this._busy) return false;
    const forward = i > from;
    this._busy = true;
    const slow = setTimeout(() => this._next.classList.add('is-loading'), 150);
    try {
      if (!force) {
        if (this.linear && forward) {
          if (i > this._reached + 1 && !this._visited.has(i)) i = Math.min(i, this._reached + 1);
          for (let s = from; s < i; s++) {
            if (this.steps[s].optional && s !== from && !this._visited.has(s)) continue;
            if (!(await this._stepValid(s))) { if (s !== this._cur) this._show(s, 'prev'); this._paint(); return false; }
          }
        }
        const waits = [];
        const ev = emit(this, 'o-step-change', { from, to: i, direction: forward ? 'next' : 'prev', waitUntil: p => waits.push(p) });
        if (ev.defaultPrevented) return false;
        if (waits.length) { const res = await Promise.all(waits.map(p => Promise.resolve(p).catch(() => false))); if (res.some(r => r === false)) return false; }
        if (isFn(this.guard) && (await this.guard(from, i, this)) === false) return false;
      }
      this._show(i, forward ? 'next' : 'prev');
      return true;
    } finally { clearTimeout(slow); this._next.classList.remove('is-loading'); this._busy = false; }
  }
  next() { return this.goTo(this._cur + 1); }
  prev() { return this.goTo(this._cur - 1, { force: true }); }
  async skip() {
    if (!this.steps[this._cur]?.optional) return this.next();
    const v = this._validator();
    if (v) v.clear();
    this._errors.delete(this._cur);
    this._reached = Math.max(this._reached, this._cur + 1);
    return this.goTo(this._cur + 1, { force: true });
  }
  _show(i, dir, userNav = true) {
    const secs = this.sections, from = this._cur, el = secs[i];
    if (!el) return;
    const hadFocus = this.contains(doc.activeElement) && userNav;
    secs.forEach((s, k) => { s.hidden = k !== i; });
    this._cur = i;
    this.current = i;
    this._visited.add(i);
    this._reached = Math.max(this._reached, i);
    if (this.steps[i].review) this.renderReview(el);
    if (dir && !reducedMotion()) { const dx = (dir === 'next' ? 16 : -16) * (isRTL(this) ? -1 : 1); animate(el, [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 220 }); }
    this._paint();
    if (hadFocus) el.focus({ preventScroll: true });
    if (userNav && from >= 0) {
      const top = this.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight) this.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      announce(this.t('wizard.stepOf', { n: i + 1, total: secs.length, title: this.steps[i].title }));
    }
    this._savePersist();
    if (from !== i) this.emit('step', { index: i, from });
  }
  _paint() {
    if (!this._stepper) return;
    const steps = this.steps, n = steps.length, i = Math.max(0, this._cur), last = i === n - 1;
    this.classList.toggle('is-vertical', this.orientation === 'vertical');
    this._stepper.orientation = this.orientation === 'vertical' ? 'vertical' : 'horizontal';
    this._stepper.variant = this.stepperVariant;
    this._stepper.steps = steps.map((s, k) => ({
      title: s.title, icon: s.icon, description: s.description, optional: s.optional,
      status: this._errors.has(k) ? 'error' : k === i ? 'current' : this.linear && k > this._reached ? 'disabled' : this._visited.has(k) && (k < i || k <= this._reached) ? 'complete' : 'upcoming',
    }));
    this._stepper.current = i;
    this._back.querySelector('span').textContent = this.backText || this.t('wizard.back');
    this._next.querySelector('span').textContent = this.nextText || this.t('wizard.next');
    this._finish.querySelector('span').textContent = this.finishText || this.t('wizard.finish');
    this._skip.querySelector('span').textContent = this.skipText || this.t('wizard.skip');
    this._back.hidden = i === 0;
    this._next.hidden = last;
    this._finish.hidden = !last;
    this._skip.hidden = last || !steps[i]?.optional;
    this._status.textContent = n ? this.t('stepper.stepOf', { n: i + 1, total: n }) : '';
  }
  _onKey(e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target;
    if (!(tg.localName === 'input' && !/^(button|submit|reset|checkbox|radio|file|image|color|range)$/.test(tg.type))) return;
    if (this._indexOf(tg) !== this._cur) return;
    e.preventDefault();
    if (this._cur === this.sections.length - 1) this.finish(); else this.next();
  }
  _onInvalid(e) {
    const fields = e.detail && e.detail.fields;
    if (!fields || !fields.length) return;
    const idx = [...new Set(fields.map(f => this._indexOf(f)).filter(x => x >= 0))];
    if (!idx.length) return;
    idx.forEach(x => this._errors.add(x));
    if (!idx.includes(this._cur)) this._show(Math.min(...idx), 'prev');
    else this._paint();
  }
  _recheckSoon() {
    if (!this._errors.size) return;
    clearTimeout(this._rt);
    this._rt = setTimeout(() => {
      const v = this._validator();
      if (!v) return;
      const bad = new Set(v.errorList().map(x => this._indexOf(x.el)));
      let changed = false;
      for (const k of [...this._errors]) if (!bad.has(k)) { this._errors.delete(k); changed = true; }
      if (changed) this._paint();
    }, 350);
  }

  /* ── finish / reset ── */
  async finish() {
    if (this._busy) return false;
    const v = this._validator();
    if (v) {
      this._busy = true;
      let ok;
      try { ok = await v.validate(null, { focus: false }); } finally { this._busy = false; }
      if (!ok) {
        const first = v.errorList()[0];
        if (first) { const k = this._indexOf(first.el); if (k >= 0 && k !== this._cur) this._show(k, 'prev'); v.focusField(first.key); }
        return false;
      }
    }
    const data = FU().serialize(this.root);
    if (!this.emit('finish', { data })) return false;
    this.classList.add('is-finished');
    const f = this.form;
    if (f) { try { f.requestSubmit(); } catch { f.submit(); } }
    else this._clearPersist();
    return true;
  }
  reset() {
    const f = this.form;
    if (f) f.reset();
    const v = this._validator();
    if (v) v.clear();
    this._errors.clear(); this._visited.clear(); this._reached = 0;
    this.classList.remove('is-finished');
    this._clearPersist();
    this._show(0, 'prev', false);
    this.emit('reset', {});
  }

  /* ── review ── */
  review() {
    const fu = FU();
    return this.steps.filter(s => !s.review).map(s => {
      const all = fu.formFields(s.el).filter(el => !el.disabled && el.type !== 'hidden' && el.type !== 'password' && !el.closest('[hidden]:not([data-step])'));
      const seen = new Set(), fields = [];
      for (const el of all) {
        const name = el.getAttribute('name') || el.name;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const row = el.closest('.o-repeater-row');
        const label = (row ? row.getAttribute('aria-label') + ' · ' : '') + fu.labelOf(el, s.el);
        fields.push({ name, label, value: fu.displayValue(el, all), el });
      }
      return { index: s.index, title: s.title, fields };
    });
  }
  renderReview(target) {
    const host = target.querySelector('[data-o-review]') || target.querySelector(':scope > .o-wizard-review') || target.appendChild(h('div', { class: 'o-wizard-review' }));
    host.classList.add('o-wizard-review');
    host.replaceChildren(...this.review().map(st => h('div', { class: 'o-wizard-review-step' },
      h('div', { class: 'o-wizard-review-head' }, h('h4', { class: 'o-wizard-review-title' }, st.title),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'aria-label': this.t('wizard.edit') + ': ' + st.title, onClick: () => this.goTo(st.index, { force: true }) }, iconEl('edit'), h('span', this.t('wizard.edit')))),
      h('dl', { class: 'o-dl o-wizard-review-list' }, st.fields.flatMap(f => [h('dt', f.label), h('dd', { class: f.value === '' ? 'is-empty' : null }, f.value === '' ? this.t('wizard.empty') : f.value)])))));
  }

  /* ── persistence ── */
  _savePersist() { if (this.persist) ls.set(PERSIST(this.persist), { current: this._cur, reached: this._reached, visited: [...this._visited], t: Date.now() }); }
  _clearPersist() { if (this.persist) { ls.del(PERSIST(this.persist)); this._auto?.clear(); } }
  _applyState(s) {
    if (!s) return;
    this._reached = s.reached || 0;
    (s.visited || []).forEach(x => this._visited.add(x));
    this._show(clamp(s.current || 0, 0, this.sections.length - 1), null, false);
  }
  _makeAuto(restore) {
    if (!O.autosave || this.root.hasAttribute('data-o-autosave')) return;
    this._auto = O.autosave(this.root, {
      key: 'wizard:' + this.persist, restore: restore === 'none' ? false : restore,
      meta: () => ({ current: this._cur, reached: this._reached, visited: [...this._visited] }),
      onRestore: (data, meta) => this._applyState(meta || ls.get(PERSIST(this.persist))), onDiscard: () => ls.del(PERSIST(this.persist)),
    });
  }
  _restore() {
    if (!this.persist || this._restored) return;
    this._restored = true;
    const st = ls.get(PERSIST(this.persist));
    this._makeAuto(this.restore === 'prompt' ? 'prompt' : 'auto');
    if (this.restore !== 'prompt' && st && this._cur < 0) this._applyState(st);
  }
}
define('o-wizard', OWizard);
O.Wizard = OWizard;
