/* <o-stat> KPI / statistics card and <o-stat-group> responsive KPI row. */

class OStat extends OElement {
  static props = {
    label: String, value: Any, format: String, currency: String, decimals: Number, prefix: String, suffix: String, compact: Boolean,
    delta: Number, deltaFormat: { type: String, default: 'percent' }, deltaDecimals: Number, deltaGood: { type: String, default: 'up' },
    period: String, icon: String, color: String, description: String,
    sparkline: Array, sparklineType: { type: String, default: 'line' }, sparklineLabels: Array,
    goal: Number, goalType: { type: String, default: 'bar' },
    loading: { type: Boolean, reflect: true }, variant: { type: String, default: 'default', reflect: true },
    href: String, target: String, countup: Boolean, duration: { type: Number, default: 1200 }, texts: Object,
  };

  setup() {
    this.classList.add('o-stat');
    this.labelEl = h('span', { class: 'o-stat-label' });
    this.iconEl = h('span', { class: 'o-stat-icon', 'aria-hidden': 'true' });
    this.valueEl = h('span', { class: 'o-stat-value' }, this.valueVis = h('bdi', { 'aria-hidden': 'true' }), this.valueSr = h('span', { class: 'o-sr-only' }));
    this.deltaEl = h('span', { class: 'o-stat-delta' });
    this.periodEl = h('span', { class: 'o-stat-period' });
    this.metaEl = h('div', { class: 'o-stat-meta' }, this.deltaEl, this.periodEl);
    this.descEl = h('p', { class: 'o-stat-desc' });
    this.sparkEl = h('div', { class: 'o-stat-spark' });
    this.goalEl = h('div', { class: 'o-stat-goal' });
    this.linkEl = h('a', { class: 'o-stat-link', hidden: true });
    this.prepend(this.labelEl, this.iconEl, this.valueEl, this.metaEl, this.descEl, this.sparkEl, this.goalEl, this.linkEl);
    this._spark = { g: null, values: [], value: v => statFormat(v, this._fmt()), label: i => String((this.sparklineLabels || [])[i] ?? '') };
    this._sparkHide = sparkHover(this.sparkEl, () => this._spark);
    on(this.sparkEl, 'click', () => { if (this.href) this.linkEl.click(); });
  }

  connected() {
    const redraw = rafThrottle(() => this._drawSpark());
    this.addCleanup(observeResize(this.sparkEl, redraw));
    this.addCleanup(() => redraw.cancel());
    if (this.countup && !this._counted) {
      this.addCleanup(observeVisible(this, vis => { if (vis && !this._counted) { this._counted = true; this._paintValue(true); } }, { threshold: 0.3 }));
    }
  }
  disconnected() { this._run?.cancel(); }

  _fmt() { return { format: this.format, currency: this.currency, decimals: this.decimals, prefix: this.prefix, suffix: this.suffix, compact: this.compact }; }
  get _empty() { return this.value == null || this.value === ''; }

  update(changed) {
    const v = this.variant || 'default';
    if (this._own) this.classList.remove(...this._own);
    this._own = ['o-stat-v-' + v];
    if (v !== 'minimal') this._own.push('o-stat-card');
    if (this.color && v === 'gradient') this._own.push('o-c-' + this.color);
    this.classList.add('o-stat', ...this._own);
    this.iconEl.className = cls('o-stat-icon', this.color && 'o-c-' + this.color);
    this.labelEl.textContent = this.label || '';
    this.labelEl.hidden = !this.label;
    this.iconEl.innerHTML = this.icon ? String(icon(this.icon)) : '';
    this.iconEl.hidden = !this.icon || (this.goal > 0 && this.goalType === 'ring');
    this.descEl.textContent = this.description || '';
    this.descEl.hidden = !this.description;
    this.periodEl.textContent = this.period || '';
    this.periodEl.hidden = !this.period;
    const busy = !!this.loading;
    this.setAttribute('aria-busy', String(busy));
    this.classList.toggle('is-refreshing', busy && !this._empty);
    this._paintDelta();
    this._paintValue(false, changed.has('value'));
    this._paintGoal();
    if (changed.has('sparkline') || changed.has('sparklineType') || changed.has('init') || changed.has('locale') || changed.has('format')) this._drawSpark();
    const link = !!this.href;
    this.linkEl.hidden = !link;
    this.classList.toggle('is-link', link);
    if (link) {
      this.linkEl.href = this.href;
      if (this.target) this.linkEl.target = this.target; else this.linkEl.removeAttribute('target');
      if (this.target === '_blank') this.linkEl.rel = 'noopener noreferrer';
      this.linkEl.setAttribute('aria-label', [this.label, this.valueSr.textContent, this.deltaEl.querySelector('.o-sr-only')?.textContent].filter(Boolean).join(', '));
    }
  }

  _paintValue(animateNow, valueChanged) {
    const skel = !!(this.loading && this._empty);
    this.valueEl.classList.toggle('o-skeleton', skel);
    this.metaEl.classList.toggle('o-skeleton', skel);
    this.metaEl.classList.toggle('o-stat-meta-skeleton', skel);
    if (skel) { this.valueVis.textContent = ' '; this.valueSr.textContent = this.t('stat.loading'); return; }
    const o = this._fmt(), to = this.value;
    this.valueSr.textContent = statFormat(to, o);
    const num = !this._empty && !Number.isNaN(+to) && o.format !== 'raw';
    if (this.countup && num && !this._counted) { this.valueVis.textContent = statFormat(0, { ...o, decimals: o.decimals ?? statDecimals(to) }); return; }
    if (this.countup && num && (animateNow || valueChanged) && this._counted) {
      const from = animateNow ? 0 : (this._shown ?? +to);
      const dec = o.decimals ?? statDecimals(to);
      this._run?.cancel();
      this._run = countUpRun(this.valueVis, from, +to, { duration: this.duration, format: n => { this._shown = n; return statFormat(n, o.format === 'duration' ? o : { ...o, decimals: dec }); } });
      return;
    }
    if (!this._run) this.valueVis.textContent = statFormat(to, o);
    else if (!this.countup) { this._run.cancel(); this._run = null; this.valueVis.textContent = statFormat(to, o); }
  }

  _paintDelta() {
    const d = this.delta, el = this.deltaEl;
    if (d == null || Number.isNaN(d) || (this.loading && this._empty)) { el.hidden = true; el.replaceChildren(); this.metaEl.hidden = !this.period || (this.loading && this._empty); return; }
    this.metaEl.hidden = false;
    el.hidden = false;
    const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const tone = this.deltaGood === 'none' || dir === 'flat' ? 'neutral' : (dir === 'up') === (this.deltaGood !== 'down') ? 'good' : 'bad';
    const dd = this.deltaDecimals, sign = { signDisplay: 'exceptZero' }, digits = { maximumFractionDigits: dd ?? 1, minimumFractionDigits: dd ?? 0 };
    const f = this.deltaFormat || 'percent';
    const abs = f === 'percent' ? fmt.number(Math.abs(d) / 100, { style: 'percent', ...digits })
      : f === 'currency' ? fmt.currency(Math.abs(d), this.currency, dd != null ? digits : {})
      : fmt.number(Math.abs(d), f === 'compact' ? { notation: 'compact', ...digits } : digits);
    const shown = f === 'percent' ? fmt.number(d / 100, { style: 'percent', ...sign, ...digits })
      : f === 'currency' ? fmt.currency(d, this.currency, { ...sign, ...(dd != null ? digits : {}) })
      : fmt.number(d, { ...sign, ...(f === 'compact' ? { notation: 'compact' } : {}), ...digits });
    el.className = `o-stat-delta is-${dir} is-${tone}`;
    let sr = dir === 'flat' ? this.t('stat.flat') : this.t(dir === 'up' ? 'stat.up' : 'stat.down', { value: abs });
    if (this.period) sr += ' ' + this.period;
    if (tone !== 'neutral') sr += ', ' + this.t(tone === 'good' ? 'stat.favorable' : 'stat.unfavorable');
    el.replaceChildren(iconEl(dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'minus'), h('bdi', { 'aria-hidden': 'true' }, shown), h('span', { class: 'o-sr-only' }, sr));
    this.periodEl.setAttribute('aria-hidden', 'true');
  }

  _paintGoal() {
    const g = +this.goal, v = +this.value, el = this.goalEl;
    this._ring?.remove(); this._ring = null;
    if (!(g > 0) || this._empty || Number.isNaN(v)) { el.hidden = true; el.replaceChildren(); return; }
    const pct = v / g, pc = clamp(Math.round(pct * 100), 0, 100), reached = pct >= 1;
    const text = reached ? this.t('stat.goalReached') : this.t('stat.goal', { pct: fmt.percent(pct), goal: statFormat(g, { ...this._fmt(), decimals: null }) });
    const aria = { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pc), 'aria-valuetext': text, 'aria-label': this.t('stat.goalLabel') };
    el.classList.toggle('is-reached', reached);
    if (this.goalType === 'ring') {
      el.hidden = true; el.replaceChildren();
      this._ring = h('div', { class: cls('o-progress-ring o-stat-ring', reached && 'is-reached'), style: `--o-value:${pc}`, ...aria }, h('bdi', { 'aria-hidden': 'true' }, fmt.percent(Math.min(pct, 9.99))));
      this.iconEl.after(this._ring);
      return;
    }
    el.hidden = false;
    el.replaceChildren(
      h('div', { class: 'o-stat-goal-row', 'aria-hidden': 'true' }, reached ? iconEl('check-circle') : null, h('bdi', null, text)),
      h('div', { class: 'o-progress o-progress-sm', ...aria }, h('div', { class: 'o-progress-bar', style: `--o-value:${pc}%` })));
  }

  /** True when the richer <o-sparkline> element (charts/sparkline package) is registered. */
  static get _hasOSpark() { return isBrowser && !!win.customElements?.get('o-sparkline'); }

  _drawSpark() {
    const vals = toArr(this.sparkline).map(Number).filter(Number.isFinite), box = this.sparkEl;
    box.hidden = vals.length < 2;
    this._spark.values = vals;
    if (box.hidden) { box.replaceChildren(); this._spark.g = null; return; }
    box.classList.toggle('is-bar', this.sparklineType === 'bar');
    if (OStat._hasOSpark) {
      this._sparkHide?.();
      this._spark.g = null;
      let sp = box.__osp;
      if (!sp) { box.replaceChildren(); sp = box.__osp = doc.createElement('o-sparkline'); box.append(sp); }
      const fFmt = this.format === 'currency' ? 'currency' : this.format === 'percent' ? 'percent' : (this.compact ? 'compact' : 'number');
      Object.assign(sp, { type: this.sparklineType, values: vals, labels: this.sparklineLabels || null, format: fFmt, currency: this.currency, label: this.label || undefined });
      return;
    }
    if (box.__osp) { box.replaceChildren(); box.__osp = null; }
    const o = this._fmt(), f = v => statFormat(v, o);
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', this.t('stat.trend', { count: vals.length, first: f(vals[0]), last: f(vals[vals.length - 1]), min: f(Math.min(...vals)), max: f(Math.max(...vals)) }));
    this._sparkHide?.();
    this._spark.g = sparkDraw(box, vals, { type: this.sparklineType, rtl: isRTL(this) });
  }
}
define('o-stat', OStat);
O.Stat = OStat;

/* <o-stat-group min="12rem" columns plain> — responsive KPI row with dividers. */
class OStatGroup extends OElement {
  static props = { min: String, columns: Number, plain: Boolean, label: String };
  setup() { this.classList.add('o-stat-group'); if (!this.hasAttribute('role')) this.setAttribute('role', 'group'); }
  update() {
    css(this, { '--o-stat-min': this.min || null, '--o-stat-cols': this.columns || null });
    this.classList.toggle('is-plain', !!this.plain);
    this.classList.toggle('has-cols', !!this.columns);
    if (this.label) this.setAttribute('aria-label', this.label);
  }
}
define('o-stat-group', OStatGroup);
O.StatGroup = OStatGroup;
