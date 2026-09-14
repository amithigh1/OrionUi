/* Stepper, multi-step progress and progress tracking.
 *   <o-stepper steps='[{"title":"Account","description":"Login details","icon":"user"},{"title":"Profile","optional":true},"Review"]'
 *              current="1" orientation="horizontal|vertical" variant="default|dots|progress|compact" clickable></o-stepper>
 *   current: 0-based index. Status per step: complete | current | upcoming | error | disabled (an explicit step.status wins).
 *   Methods: next(), prev(), goTo(i), setStatus(i, status). Events: o-select { index } (cancelable; default moves current),
 *   o-change { index, previous }. Narrow containers collapse to "Step 2 of 4" + progress bar (responsive="false" disables).
 *   Static markup: <ol class="o-steps"><li class="o-step is-complete"><span class="o-step-marker">1</span>
 *                  <span class="o-step-text"><span class="o-step-title">Account</span></span></li>…</ol>
 *   <o-progress-tracker steps='[{"title":"Ordered","time":"2026-09-01T10:00","description":"…","icon":"package"}]'
 *                       current="2" orientation="horizontal|vertical" status="error|cancelled"></o-progress-tracker>
 *   (no steps -> Ordered, Packed, Shipped, Out for delivery, Delivered)
 */
i18n.add('en', {
  stepper: {
    label: 'Progress', stepOf: 'Step {n} of {total}', next: 'Next: {title}', complete: 'Completed', current: 'Current step',
    upcoming: 'Not started', error: 'Has errors', disabled: 'Unavailable', optional: 'Optional',
  },
  tracker: {
    label: 'Order progress', ordered: 'Ordered', packed: 'Packed', shipped: 'Shipped', outForDelivery: 'Out for delivery',
    delivered: 'Delivered', pending: 'Pending', cancelled: 'Cancelled', failed: 'Delivery issue', expected: 'Expected {date}',
  },
});
if (!O.icons.has('package')) {
  O.icons.add({
    package: '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="M3.3 7 12 12l8.7-5M12 22V12M7.5 4.3l9 5.2"/>',
  });
}
if (!O.icons.has('truck')) O.icons.add({ truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4A1 1 0 0 0 17.5 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>' });
if (!O.icons.has('map-pin')) O.icons.add({ 'map-pin': '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>' });
if (!O.icons.has('clipboard-check')) O.icons.add({ 'clipboard-check': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>' });

const normSteps = list => toArr(list).map(s => (isStr(s) ? { title: s } : isObj(s) ? s : { title: String(s) }));
const STATUS_ICON = { complete: 'check', error: 'x' };

class OStepper extends OElement {
  static props = {
    steps: { type: Array, default: () => [] }, current: { type: Number, default: 0 },
    orientation: { type: String, default: 'horizontal', reflect: true }, variant: { type: String, default: 'default', reflect: true },
    clickable: { type: Boolean, reflect: true }, responsive: { type: Boolean, default: true }, label: String, texts: Object,
  };
  setup() {
    this.classList.add('o-stepper');
    if (!this.steps.length) {
      const kids = [...this.children].filter(c => c.hasAttribute('data-title') || c.localName === 'li');
      if (kids.length) { this.steps = kids.map(c => ({ title: c.dataset.title || c.textContent.trim(), description: c.dataset.description, icon: c.dataset.icon, status: c.dataset.status })); kids.forEach(c => c.remove()); }
    }
    this._ol = h('ol', { class: 'o-steps' });
    this._compact = h('div', { class: 'o-stepper-compact', 'aria-hidden': 'true' });
    this.append(this._ol, this._compact);
    this._nav = new ListNav(this._ol, { items: '.o-step-btn:not([disabled])', orientation: 'horizontal', typeahead: false });
    on(this._ol, 'click', '.o-step-btn', (e, b) => { if (!b.disabled) this._select(+b.dataset.index); });
    on(this._ol, 'keydown', e => { if (/^(Arrow|Home|End)/.test(e.key)) this._nav.handle(e); });
  }
  connected() { const fit = rafThrottle(() => this._fit()); this.addCleanup(observeResize(this, fit)); this.addCleanup(fit.cancel); }
  update(changed) {
    if (['steps', 'variant', 'orientation', 'clickable', 'locale', 'init', 'texts', 'label'].some(k => changed.has(k))) this._build();
    else this._paint();
    this._fit();
  }
  get total() { return this.steps.length; }
  statusOf(i) {
    const s = normSteps(this.steps)[i] || {};
    if (s.status && s.status !== 'current') return s.status;
    return i < this.current ? 'complete' : i === this.current ? 'current' : 'upcoming';
  }
  _build() {
    const steps = normSteps(this.steps), click = this.clickable, dots = this.variant === 'dots';
    this._nav.o.orientation = this.orientation === 'vertical' ? 'vertical' : 'horizontal';
    this._ol.className = cls('o-steps', 'is-' + (this.orientation === 'vertical' ? 'vertical' : 'horizontal'), this.variant !== 'default' && 'o-steps-' + this.variant);
    this._ol.setAttribute('aria-label', this.label || this.t('stepper.label'));
    this._ol.replaceChildren(...steps.map((s, i) => {
      const inner = [
        h('span', { class: 'o-step-marker', 'aria-hidden': 'true' }),
        h('span', { class: 'o-step-text' },
          h('span', { class: 'o-step-title' }, s.title || ''),
          s.optional ? h('span', { class: 'o-step-optional' }, this.t('stepper.optional')) : null,
          s.description && !dots ? h('span', { class: 'o-step-desc' }, s.description) : null),
        h('span', { class: 'o-sr-only o-step-status' }),
      ];
      const btn = click ? h('button', { type: 'button', class: 'o-step-btn', 'data-index': i }, inner) : h('span', { class: 'o-step-btn', 'data-index': i }, inner);
      return h('li', { class: 'o-step', 'data-index': i }, btn);
    }));
    this._paint();
  }
  _paint() {
    const steps = normSteps(this.steps), n = steps.length, cur = clamp(this.current, 0, Math.max(0, n - 1));
    [...this._ol.children].forEach((li, i) => {
      const st = this.statusOf(i), s = steps[i] || {}, btn = li.firstElementChild;
      li.className = cls('o-step', 'is-' + st, s.optional && 'is-optional');
      const mk = li.querySelector('.o-step-marker');
      const ic = STATUS_ICON[st] || (this.variant === 'dots' ? '' : s.icon);
      const key = st + '|' + (ic || i);
      if (mk.dataset.k !== key) { mk.dataset.k = key; mk.innerHTML = ic ? String(icon(ic)) : this.variant === 'dots' ? '' : String(i + 1); }
      li.querySelector('.o-step-status').textContent = ', ' + this.t('stepper.' + st);
      if (i === cur && st !== 'disabled') btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      if (btn.localName === 'button') { btn.disabled = st === 'disabled'; btn.tabIndex = i === cur ? 0 : -1; }
    });
    this.style.setProperty('--o-steps-pct', (n > 1 ? (cur / (n - 1)) * 100 : 100) + '%');
    this.style.setProperty('--o-steps-fill', (n ? ((cur + 0.5) / n) * 100 : 0) + '%');
    const s = steps[cur] || {}, nx = steps[cur + 1];
    this._compact.innerHTML = String(html`<div class="o-stepper-compact-head"><span class="o-stepper-count">${this.t('stepper.stepOf', { n: cur + 1, total: n })}</span><strong class="o-stepper-compact-title">${s.title || ''}</strong>${nx ? html`<span class="o-stepper-compact-next">${this.t('stepper.next', { title: nx.title })}</span>` : ''}</div><div class="o-progress o-progress-sm" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${cur + 1}" aria-label="${this.t('stepper.stepOf', { n: cur + 1, total: n })}"><div class="o-progress-bar" style="--o-value:${n ? ((cur + 1) / n) * 100 : 0}%"></div></div>`);
  }
  _fit() {
    if (!this._ol) return;
    const compactOnly = this.variant === 'compact';
    let collapse = compactOnly;
    if (!compactOnly && this.responsive && this.orientation !== 'vertical' && this.isConnected) {
      const per = this.variant === 'dots' ? 72 : this.variant === 'progress' ? 88 : 116;
      collapse = this.clientWidth > 0 && this.clientWidth < this.total * per;
    }
    this.classList.toggle('is-collapsed', collapse);
    this._compact.setAttribute('aria-hidden', String(!collapse));
    this._ol.toggleAttribute('hidden', collapse);
  }
  _select(i) {
    if (this.statusOf(i) === 'disabled' || i === this.current) return;
    if (!this.emit('select', { index: i, step: normSteps(this.steps)[i] })) return;
    this.goTo(i);
  }
  goTo(i) {
    const prev = this.current, n = this.total;
    i = clamp(+i || 0, 0, Math.max(0, n - 1));
    if (i === prev) return;
    const hadFocus = this._ol.contains(doc.activeElement);
    this.current = i;
    this.flush();
    if (hadFocus) this._ol.querySelector(`.o-step-btn[data-index="${i}"]`)?.focus();
    this.emit('change', { index: i, previous: prev });
  }
  next() { this.goTo(this.current + 1); }
  prev() { this.goTo(this.current - 1); }
  setStatus(i, status) {
    const steps = normSteps(this.steps).map(s => ({ ...s }));
    if (!steps[i]) return;
    if (status) steps[i].status = status; else delete steps[i].status;
    this.steps = steps;
  }
}
define('o-stepper', OStepper);
O.Stepper = OStepper;

/* ── <o-progress-tracker> ─────────────────────────────────────────── */
class OProgressTracker extends OElement {
  static props = {
    steps: { type: Array, default: () => [] }, current: { type: Number, default: 0 }, orientation: { type: String, default: 'horizontal', reflect: true },
    status: { type: String, reflect: true }, label: String, responsive: { type: Boolean, default: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-tracker');
    this._ol = h('ol', { class: 'o-tracker-list' });
    this.append(this._ol);
  }
  connected() { const fit = rafThrottle(() => this._fit()); this.addCleanup(observeResize(this, fit)); this.addCleanup(fit.cancel); }
  _steps() {
    const s = normSteps(this.steps);
    if (s.length) return s;
    return [['ordered', 'clipboard-check'], ['packed', 'package'], ['shipped', 'truck'], ['outForDelivery', 'map-pin'], ['delivered', 'home']].map(([k, ic]) => ({ title: this.t('tracker.' + k), icon: ic }));
  }
  render() {
    const steps = this._steps(), n = steps.length, cur = clamp(this.current, 0, n - 1), bad = this.status === 'error' || this.status === 'cancelled';
    this._ol.setAttribute('aria-label', this.label || this.t('tracker.label'));
    this.style.setProperty('--o-tracker-pct', (n > 1 ? (cur / (n - 1)) * 100 : 100) + '%');
    this._ol.replaceChildren(...steps.map((s, i) => {
      const st = i < cur ? 'complete' : i === cur ? (bad ? 'error' : cur === n - 1 ? 'complete' : 'current') : 'upcoming';
      const when = s.time || s.date;
      const timeTxt = when ? (isStr(when) && !date.parse(when) ? when : fmt.datetime(when)) : st === 'upcoming' ? (s.expected ? this.t('tracker.expected', { date: fmt.date(s.expected) }) : this.t('tracker.pending')) : '';
      const title = i === cur && bad ? (s.errorTitle || this.t(this.status === 'cancelled' ? 'tracker.cancelled' : 'tracker.failed')) : s.title;
      return h('li', { class: cls('o-tracker-step', 'is-' + st), 'aria-current': i === cur ? 'step' : null },
        h('span', { class: 'o-tracker-marker', 'aria-hidden': 'true' }, icon(st === 'error' ? 'x' : s.icon || (st === 'complete' ? 'check' : 'clock'))),
        h('span', { class: 'o-tracker-text' },
          h('span', { class: 'o-tracker-title' }, title || ''),
          timeTxt ? h(when ? 'time' : 'span', { class: 'o-tracker-time', datetime: when && date.parse(when) ? date.parse(when).toISOString() : null }, timeTxt) : null,
          s.description ? h('span', { class: 'o-tracker-desc' }, s.description) : null,
          h('span', { class: 'o-sr-only' }, ', ' + this.t('stepper.' + (st === 'error' ? 'error' : st)))));
    }));
    this._fit();
  }
  _fit() {
    const auto = this.orientation !== 'vertical' && this.responsive && this.clientWidth > 0 && this.clientWidth < this._steps().length * 110;
    this.classList.toggle('is-vertical', this.orientation === 'vertical' || auto);
  }
}
define('o-progress-tracker', OProgressTracker);
O.ProgressTracker = OProgressTracker;
