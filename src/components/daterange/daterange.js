// @deps datepicker
/* <o-daterange> — start/end range picker: two months side by side (one on phones), hover preview, presets,
 * min/max length, apply/cancel footer (or `instant`), optional times and typed start/end inputs.
 *   <o-daterange name="period" min-days="2" max-days="30"></o-daterange>
 *   <o-daterange name-start="from" name-end="to" value='{"start":"2026-09-01","end":"2026-09-07"}' instant></o-daterange>
 *   el.presets = [{ label: 'Next 7 days', value: () => [new Date(), Orion.date.add(new Date(), 6)] }, { label: 'Q3', value: ['2026-07-01', '2026-09-30'] }]
 *   presets="false" hides them; presets='["today","last7","thisMonth"]' picks built-ins
 *   (today yesterday last7 last30 last90 thisWeek thisMonth lastMonth thisYear).
 * value: { start, end } ('YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' with `time`); attributes may also use "start/end".
 * Form: `name` submits "start/end"; `name-start` + `name-end` submit two fields. min-days / max-days count days inclusively.
 * Events: o-change {value, start, end}, o-select {start, end} (draft), o-preset {preset}, o-open, o-close {reason}, o-cancel
 * Methods: open() close() apply() cancel() clear(emit?) focus() setRange(start, end); getters start, end, calendar
 */
i18n.add('en', {
  daterange: {
    start: 'Start date', end: 'End date', dialog: 'Choose date range', presets: 'Quick ranges',
    today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days',
    thisWeek: 'This week', thisMonth: 'This month', lastMonth: 'Last month', thisYear: 'This year',
    apply: 'Apply', cancel: 'Cancel', clear: 'Clear', startTime: 'Start time', endTime: 'End time',
    days: { one: '{count} day', other: '{count} days' }, pickStart: 'Select a start date', pickEnd: 'Select an end date',
    minDays: { one: 'Select at least {count} day', other: 'Select at least {count} days' },
    maxDays: { one: 'Select at most {count} day', other: 'Select at most {count} days' },
    invalid: 'Enter a valid date ({format})', order: 'The end date must be on or after the start date',
    min: 'Dates must be on or after {min}', max: 'Dates must be on or before {max}', unavailable: 'This date is not available',
  },
});

const { openPanel: drOpen, syncLabel: drLabel, isSheet: drSheet, disabledFn: drDisabledFn, highlightFn: drHighlightFn } = O.pickers;
const drDay = d => (d ? date.startOf(d, 'd') : null);
const drCount = (a, b) => Math.abs(date.diff(drDay(b), drDay(a), 'd')) + 1;
const DR_PRESETS = {
  today: () => { const t0 = date.today(); return [t0, t0]; },
  yesterday: () => { const y = date.add(date.today(), -1, 'd'); return [y, y]; },
  last7: () => [date.add(date.today(), -6, 'd'), date.today()],
  last30: () => [date.add(date.today(), -29, 'd'), date.today()],
  last90: () => [date.add(date.today(), -89, 'd'), date.today()],
  thisWeek: () => { const s = date.startOf(date.today(), 'w'); return [s, date.add(s, 6, 'd')]; },
  thisMonth: () => [date.startOf(date.today(), 'M'), drDay(date.endOf(date.today(), 'M'))],
  lastMonth: () => { const m = date.add(date.startOf(date.today(), 'M'), -1, 'M'); return [m, drDay(date.endOf(m, 'M'))]; },
  thisYear: () => [date.startOf(date.today(), 'y'), drDay(date.endOf(date.today(), 'y'))],
};
const DR_DEFAULT = ['today', 'yesterday', 'last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear'];

class ODaterange extends FormElement {
  static props = {
    ...FormElement.props,
    nameStart: String,
    nameEnd: String,
    format: String,
    min: Any,
    max: Any,
    disabledDates: Any,
    highlighted: Any,
    weekStart: Number,
    weekNumbers: Boolean,
    months: { type: Number, default: 2 },
    presets: { type: Any, default: true },
    minDays: Number,
    maxDays: Number,
    instant: Boolean,
    time: Boolean,
    hour12: Any,
    step: { type: Number, default: 15 },
    placeholderStart: String,
    placeholderEnd: String,
    clearable: { type: Boolean, default: true },
    size: { type: String, reflect: true },
    texts: Object,
  };

  setup() {
    const pid = uid('dr-panel');
    this._draft = { start: null, end: null }; this._part = 'start';
    const inp = part => h('input', { class: 'o-dr-input', type: 'text', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': pid, dataset: { part } });
    this.inStart = inp('start'); this.inEnd = inp('end');
    this.clearBtn = h('button', { type: 'button', class: 'o-select-clear', tabindex: '-1', hidden: true }, icon('x'));
    this.control = h('div', { class: 'o-control o-dr-control' },
      h('span', { class: 'o-dr-icon', 'aria-hidden': 'true' }, icon('calendar')), this.inStart,
      h('span', { class: 'o-dr-sep', 'aria-hidden': 'true' }, icon('arrow-right')), this.inEnd,
      h('span', { class: 'o-select-indicators' }, this.clearBtn));
    this.append(this.control);

    this.panel = h('div', { class: 'o-floating o-dr-panel', id: pid, role: 'dialog', hidden: true });
    this.presetsEl = h('div', { class: 'o-dr-presets', role: 'group' });
    this.calEl = h('div', { class: 'o-dr-cal' });
    this.tpStart = h('o-timepicker', { size: 'sm', class: 'o-dr-tp' }); this.tpEnd = h('o-timepicker', { size: 'sm', class: 'o-dr-tp' });
    this.tStartLbl = h('span', { class: 'o-dr-time-label' }); this.tEndLbl = h('span', { class: 'o-dr-time-label' });
    this.timesEl = h('div', { class: 'o-dr-times', hidden: true }, h('label', { class: 'o-dr-time' }, this.tStartLbl, this.tpStart), h('label', { class: 'o-dr-time' }, this.tEndLbl, this.tpEnd));
    this.summary = h('div', { class: 'o-dr-summary', 'aria-live': 'polite' });
    this.clearFoot = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'clear' });
    this.cancelBtn = h('button', { type: 'button', class: 'o-btn o-btn-sm', 'data-act': 'cancel' });
    this.applyBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-act': 'apply' });
    this.foot = h('div', { class: 'o-dr-foot' }, this.summary, h('div', { class: 'o-dr-actions' }, this.clearFoot, this.cancelBtn, this.applyBtn));
    this.panel.append(h('div', { class: 'o-dr-layout' }, this.presetsEl, h('div', { class: 'o-dr-main' }, this.calEl, this.timesEl)), this.foot);

    this.cal = new O.Calendar(this.calEl, {
      onSelect: d => this._pickDay(d),
      onHover: d => { if (this._hover !== d) { this._hover = d; if (this._draft.start && !this._draft.end) { this.cal.refresh(); this._renderSummary(); } } },
      dayState: d => this._state(d),
      isDisabled: d => this._dis(d),
      highlight: d => this._hlFn?.(d) || null,
    });

    on(this.control, 'click', e => {
      if (this.isDisabled || this.readonly || e.target.closest('.o-select-clear')) return;
      const inp = e.target.closest('.o-dr-input');
      if (!inp) this.inStart.focus();
      this._setPart(inp?.dataset.part || 'start');
      if (!this._ov) this.open();
    });
    for (const el of [this.inStart, this.inEnd]) {
      on(el, 'focus', () => this._setPart(el.dataset.part));
      on(el, 'input', () => { this._typing = true; const d = this._parse(el.value); if (d && this._ov) this.cal.show(d); });
      on(el, 'keydown', e => this._key(e, el));
    }
    on(this.clearBtn, 'mousedown', e => e.preventDefault());
    on(this.clearBtn, 'click', () => { this.clear(true); this.inStart.focus(); });
    on(this.presetsEl, 'click', '[data-preset]', (e, b) => this._preset(+b.dataset.preset));
    on(this.foot, 'click', '[data-act]', (e, b) => this['_' + b.dataset.act]());
    on(this.timesEl, 'o-change', () => { this._syncTimes(); if (this.instant && this._draft.start && this._draft.end) this._commit(false); });
    on(this.panel, 'keydown', e => this._trap(e));
    on(this, 'focusout', e => { const r = e.relatedTarget; if (!r || (!this.contains(r) && !this.panel.contains(r) && !r.closest?.('.o-tp-panel'))) { this._commitTyped(); this._touched = true; this._syncInvalid(); } });
    on(this, 'invalid', () => { this._touched = true; this._syncInvalid(); });
    on(this, 'click', e => { if (e.target === this) this.focus(); });
    this.focusTarget = this.inStart;
  }
  connected() { drLabel(this, this.panel); drLabel(this, this.inStart); drLabel(this, this.inEnd); }
  disconnected() { this.close(); }

  /* ── values ───────────────────────────────────────────────────────── */
  _h12() { const v = this.hour12; if (v === true || v === '' || v === 'true') return true; if (v === false || v === 'false') return false; return date.uses12h(); }
  _fmt() { return this.format || date.localePattern() + (this.time ? ' ' + (this._h12() ? 'h:mm A' : 'HH:mm') : ''); }
  _iso(d) { return d ? (this.time ? date.format(d, 'YYYY-MM-DDTHH:mm') : date.toISODate(d)) : ''; }
  _range() {
    let v = this.value;
    if (v == null || v === '') return { start: null, end: null };
    if (isStr(v)) { const s = v.trim(); v = s.startsWith('{') || s.startsWith('[') ? parseJSON(s, {}) : s.split(/\s*\/\s*|\s+[–-]\s+/); }
    if (Array.isArray(v)) v = { start: v[0], end: v[1] };
    return { start: date.parse(v.start ?? v.from) || null, end: date.parse(v.end ?? v.to) || null };
  }
  get start() { return this._range().start; }
  get end() { return this._range().end; }
  get calendar() { return this.cal; }
  isEmpty() { const r = this._range(); return !(r.start && r.end); }
  formValue() {
    const { start, end } = this._range();
    if (this.nameStart || this.nameEnd) {
      const fd = new FormData();
      if (this.nameStart) fd.append(this.nameStart, this._iso(start));
      if (this.nameEnd) fd.append(this.nameEnd, this._iso(end));
      return fd;
    }
    return start && end ? this._iso(start) + '/' + this._iso(end) : null;
  }
  _minD() { return drDay(date.parse(this.min)); }
  _maxD() { return drDay(date.parse(this.max)); }
  _dis(d) {
    if (this._disFn?.(d)) return true;
    const { start, end } = this._draft;
    if (start && !end && +d > +drDay(start)) {
      const n = drCount(start, d);
      if (this.minDays > 1 && n < this.minDays) return true;
      if (this.maxDays > 0 && n > this.maxDays) return true;
    }
    return false;
  }
  _state(d) {
    const { start, end } = this._draft, k = +d;
    const s = drDay(start), e = drDay(end);
    if (s && e) return { rangeStart: k === +s, rangeEnd: k === +e, inRange: k > +s && k < +e };
    if (s) {
      const hv = this._hover && !this._dis(this._hover) ? drDay(this._hover) : null;
      if (!hv || +hv < +s || +hv === +s) return { selected: k === +s };
      return { selected: k === +s, previewStart: k === +s, previewEnd: k === +hv, preview: k > +s && k < +hv };
    }
    return {};
  }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('disabledDates')) this._disFn = drDisabledFn(this.disabledDates);
    if (init || changed.has('highlighted')) this._hlFn = drHighlightFn(this.highlighted);
    if (init || ['min', 'max', 'weekNumbers', 'weekStart', 'months', 'locale', 'disabledDates', 'highlighted'].some(k => changed.has(k))) {
      this.cal.set({ min: this._minD(), max: this._maxD(), weekNumbers: this.weekNumbers, weekStart: this.weekStart ?? undefined, months: this._months(), outsideDays: false, locale: i18n.locale });
      if (init) this.cal.show(this.start || date.today()); else this.cal.render();
    }
    if (init || ['time', 'hour12', 'step', 'locale'].some(k => changed.has(k))) {
      this.timesEl.hidden = !this.time;
      for (const tp of [this.tpStart, this.tpEnd]) { tp.hour12 = this.hour12; tp.step = this.step; }
    }
    if (init || ['locale', 'texts', 'placeholderStart', 'placeholderEnd', 'format', 'time', 'hour12', 'instant', 'clearable', 'presets'].some(k => changed.has(k))) {
      const ph = this._fmt().replace(/A$/, 'am').toLowerCase().replace(/h:mm/, 'hh:mm');
      this.inStart.placeholder = this.placeholderStart ?? this.t('daterange.start');
      this.inEnd.placeholder = this.placeholderEnd ?? this.t('daterange.end');
      this.inStart.title = this.inEnd.title = ph;
      this.inStart.setAttribute('aria-label', this.t('daterange.start') + ' (' + ph + ')');
      this.inEnd.setAttribute('aria-label', this.t('daterange.end') + ' (' + ph + ')');
      this.panel.setAttribute('aria-label', this.t('daterange.dialog'));
      this.presetsEl.setAttribute('aria-label', this.t('daterange.presets'));
      this.clearBtn.setAttribute('aria-label', this.t('daterange.clear'));
      this.clearFoot.textContent = this.t('daterange.clear');
      this.cancelBtn.textContent = this.t('daterange.cancel');
      this.applyBtn.textContent = this.t('daterange.apply');
      this.tStartLbl.textContent = this.t('daterange.startTime');
      this.tEndLbl.textContent = this.t('daterange.endTime');
      this.clearFoot.hidden = !this.clearable;
      this.cancelBtn.hidden = this.applyBtn.hidden = !!this.instant;
      this._renderPresets();
    }
    if (init || changed.has('size')) { this.control.classList.toggle('o-control-sm', this.size === 'sm'); this.control.classList.toggle('o-control-lg', this.size === 'lg'); }
    if (init || changed.has('disabled') || changed.has('readonly')) {
      for (const el of [this.inStart, this.inEnd]) { el.disabled = this.isDisabled; el.readOnly = !!this.readonly; }
      this.control.classList.toggle('is-disabled', this.isDisabled);
      if (this.isDisabled || this.readonly) this.close();
    }
    if (init || ['value', 'locale', 'format', 'time', 'hour12'].some(k => changed.has(k))) {
      if (!this._typing || changed.has('value')) this._renderInputs();
      if (!this._ov) { const r = this._range(); this._draft = { start: r.start, end: r.end }; }
      this.cal.refresh(); this._renderSummary();
    }
    this.clearBtn.hidden = !(this.clearable && (this.start || this.end) && !this.isDisabled && !this.readonly);
    this._syncInvalid();
  }
  _months() { return drSheet() ? 1 : clamp(this.months || 2, 1, 3); }
  _renderInputs() {
    const f = this._fmt(), { start, end } = this._range();
    this.inStart.value = start ? date.format(start, f) : '';
    this.inEnd.value = end ? date.format(end, f) : '';
    this._typing = false; this._bad = null;
  }
  _presetList() {
    const p = this.presets;
    if (p === false || p === 'false' || p == null) return [];
    let arr = p === true || p === '' || p === 'true' ? DR_DEFAULT : isStr(p) ? parseJSON(p, p.split(',').map(s => s.trim())) : toArr(p);
    return arr.map(x => (isStr(x) ? (DR_PRESETS[x] ? { key: x, label: this.t('daterange.' + x), value: DR_PRESETS[x] } : null) : x)).filter(x => x && x.label);
  }
  _presetRange(p) {
    let v = isFn(p.value) ? p.value() : p.value ?? p.range;
    if (isFn(v)) v = v();
    if (isObj(v)) v = [v.start, v.end];
    const a = date.parse(v?.[0]), b = date.parse(v?.[1]);
    return a && b ? [drDay(a), drDay(b)] : null;
  }
  _renderPresets() {
    const list = this._presets = this._presetList();
    this.presetsEl.hidden = !list.length;
    this.panel.classList.toggle('has-presets', list.length > 0);
    this.presetsEl.innerHTML = list.map((p, i) => `<button type="button" class="o-dr-preset" data-preset="${i}" aria-pressed="false">${esc(p.label)}</button>`).join('');
    this._paintPresets();
  }
  _paintPresets() {
    const { start, end } = this._draft;
    (this._presets || []).forEach((p, i) => {
      const r = this._presetRange(p), b = this.presetsEl.children[i];
      if (b) b.setAttribute('aria-pressed', String(!!(r && start && end && +r[0] === +drDay(start) && +r[1] === +drDay(end))));
    });
  }
  _renderSummary() {
    const { start, end } = this._draft;
    let txt = '';
    const loc = i18n.locale;
    if (start && end) {
      const o = this.time ? { dateStyle: 'medium', timeStyle: 'short', hour12: this._h12() } : { dateStyle: 'medium' };
      let f; try { f = new Intl.DateTimeFormat(loc, o); } catch { f = new Intl.DateTimeFormat('en', o); }
      const a = this._withTime(start, 'start'), b = this._withTime(end, 'end');
      txt = (f.formatRange ? f.formatRange(a, b) : f.format(a) + ' – ' + f.format(b)) + ' · ' + this.t('daterange.days', { count: drCount(start, end) });
    } else if (start) {
      const hv = this._hover && +drDay(this._hover) > +drDay(start) && !this._dis(this._hover);
      txt = hv ? this.t('daterange.days', { count: drCount(start, this._hover) }) : this.t('daterange.pickEnd');
      if (!hv && this.minDays > 1) txt += ' · ' + this.t('daterange.minDays', { count: this.minDays });
      if (!hv && this.maxDays > 0) txt += ' · ' + this.t('daterange.maxDays', { count: this.maxDays });
    } else txt = this.t('daterange.pickStart');
    this.summary.textContent = txt;
    this.applyBtn.disabled = !(start && end);
  }
  _withTime(d, which) {
    if (!this.time) return drDay(d);
    const tm = (which === 'start' ? this.tpStart : this.tpEnd).time || (which === 'start' ? { h: 0, m: 0 } : { h: 23, m: 59 });
    return date.setTime(drDay(d), tm);
  }
  _syncTimes() { this._renderSummary(); }
  /** Show the months so that the end month is the last visible one (start month when the range is longer). */
  _reveal(start, end) {
    const n = this._months();
    if (!start) return this.cal.show(date.today(), { force: true });
    let first = date.startOf(start, 'M');
    if (end) { const f2 = date.add(date.startOf(end, 'M'), -(n - 1), 'M'); if (+f2 > +first) first = f2; }
    this.cal.first = first;
    this.cal.focusDate = drDay(this.cal._visible(start) ? start : end);
    this.cal.view = 'days';
    this.cal.render();
  }
  _setPart(part) {
    this._part = part;
    this.inStart.classList.toggle('is-active', part === 'start' && !!this._ov);
    this.inEnd.classList.toggle('is-active', part === 'end' && !!this._ov);
  }

  /* ── validation ───────────────────────────────────────────────────── */
  getValidity() {
    if (this._bad) return { flags: { badInput: true }, message: this.t('daterange.invalid', { format: this._fmt() }) };
    const { start, end } = this._range();
    if (!start && !end) return null;
    if (!start || !end) return this.required ? { flags: { valueMissing: true }, message: t('validation.required') } : { flags: { badInput: true }, message: this.t(start ? 'daterange.pickEnd' : 'daterange.pickStart') };
    if (+drDay(end) < +drDay(start)) return { flags: { badInput: true }, message: this.t('daterange.order') };
    const mn = this._minD(), mx = this._maxD(), f = this.format ? this._fmt() : date.localePattern();
    if (mn && +drDay(start) < +mn) return { flags: { rangeUnderflow: true }, message: this.t('daterange.min', { min: date.format(mn, f) }) };
    if (mx && +drDay(end) > +mx) return { flags: { rangeOverflow: true }, message: this.t('daterange.max', { max: date.format(mx, f) }) };
    const n = drCount(start, end);
    if (this.minDays > 1 && n < this.minDays) return { flags: { rangeUnderflow: true }, message: this.t('daterange.minDays', { count: this.minDays }) };
    if (this.maxDays > 0 && n > this.maxDays) return { flags: { rangeOverflow: true }, message: this.t('daterange.maxDays', { count: this.maxDays }) };
    if (this._disFn?.(drDay(start)) || this._disFn?.(drDay(end))) return { flags: { badInput: true }, message: this.t('daterange.unavailable') };
    return null;
  }
  _syncInvalid() {
    const bad = !!(this._touched && this.validity && !this.validity.valid);
    this.control.classList.toggle('is-invalid', bad);
    for (const el of [this.inStart, this.inEnd]) if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  }
  _syncValidity() { super._syncValidity(); if (this._setupDone) this._syncInvalid(); }
  setValue(v, opts = {}) {
    this._bad = null; this._typing = false;
    this.value = v; this._syncForm();
    if (opts.silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value, start: this.start, end: this.end });
  }

  /* ── typing ───────────────────────────────────────────────────────── */
  _parse(s) {
    s = String(s || '').trim();
    if (!s) return null;
    const fmt = this._fmt();
    let d = date.parseFormat(s, fmt, i18n.locale);
    if (!d && this.time && !this.format) d = date.parseFormat(s, date.localePattern(), i18n.locale);
    if (!d && /^\d{4}-\d{1,2}-\d{1,2}/.test(s)) d = date.parse(s.replace(' ', 'T'));
    if (!d) { const sep = (fmt.match(/[^A-Za-z\s]/) || ['/'])[0]; d = date.parseFormat(s.replace(/[.\-/\\]+/g, sep).replace(/\s+/g, ' '), fmt, i18n.locale); }
    return d;
  }
  _commitTyped() {
    if (!this._typing) return true;
    const a = this.inStart.value.trim(), b = this.inEnd.value.trim();
    const s = a ? this._parse(a) : null, e = b ? this._parse(b) : null;
    if ((a && !s) || (b && !e)) { this._bad = true; this._syncForm(); this._touched = true; this._syncInvalid(); return false; }
    this._typing = false; this._bad = null;
    const cur = this._range();
    if (+s !== +cur.start || +e !== +cur.end) this.setValue(s || e ? { start: this._iso(s), end: this._iso(e) } : null);
    this._renderInputs();
    this._draft = { start: s, end: e };
    if (this._ov) { this.cal.show(e || s || date.today()); this.cal.refresh(); this._renderSummary(); this._paintPresets(); }
    return true;
  }

  /* ── selection ────────────────────────────────────────────────────── */
  _pickDay(d) {
    if (this.isDisabled || this.readonly) return;
    const { start, end } = this._draft, day = drDay(d);
    let next;
    if (start && end) {
      if (this._part === 'end' && +day >= +drDay(start)) next = { start, end: day };
      else if (this._part === 'start' && +day <= +drDay(end)) next = { start: day, end };
      else next = { start: day, end: null };
    } else if (start && +day >= +drDay(start)) next = { start, end: day };
    else next = { start: day, end: null };
    if (next.end) {
      const n = drCount(next.start, next.end);
      if ((this.minDays > 1 && n < this.minDays) || (this.maxDays > 0 && n > this.maxDays)) {
        announce(this.t(this.minDays > 1 && n < this.minDays ? 'daterange.minDays' : 'daterange.maxDays', { count: this.minDays > 1 && n < this.minDays ? this.minDays : this.maxDays }));
        next = { start: day, end: null };
      }
    }
    this._draft = next;
    this._setPart(next.end ? 'start' : 'end');
    this._hover = null;
    this.emit('select', { start: next.start, end: next.end });
    this._afterDraft();
    if (next.end && this.instant) this._commit(true);
  }
  _afterDraft() {
    this.cal.refresh(); this._renderSummary(); this._paintPresets();
    const f = this._fmt(), { start, end } = this._draft;
    if (this._ov) { this.inStart.value = start ? date.format(this._withTime(start, 'start'), f) : ''; this.inEnd.value = end ? date.format(this._withTime(end, 'end'), f) : ''; }
  }
  _preset(i) {
    const p = this._presets?.[i], r = p && this._presetRange(p);
    if (!r) return;
    this._draft = { start: r[0], end: r[1] };
    this._setPart('start');
    this.emit('preset', { preset: p, start: r[0], end: r[1] });
    this._reveal(r[0], r[1]);
    this._afterDraft();
    if (this.instant) this._commit(true);
  }
  _commit(close) {
    const { start, end } = this._draft;
    if (!start || !end) return;
    const next = { start: this._iso(this._withTime(start, 'start')), end: this._iso(this._withTime(end, 'end')) };
    const cur = this._range();
    if (this._iso(cur.start) !== next.start || this._iso(cur.end) !== next.end) this.setValue(next);
    this._renderInputs();
    if (close) { this._committed = true; this.close(); this.inStart.focus({ preventScroll: true }); }
  }
  apply() { this._commit(true); }
  _apply() { this.apply(); }
  cancel() { this.emit('cancel'); this.close('cancel'); this.inStart.focus({ preventScroll: true }); }
  _cancel() { this.cancel(); }
  _clear() { this.clear(true); this._setPart('start'); this._afterDraft(); }
  setRange(start, end) { this.value = start || end ? { start: this._iso(date.parse(start)), end: this._iso(date.parse(end)) } : null; return this; }

  /* ── panel ────────────────────────────────────────────────────────── */
  open() {
    if (this._ov || this.isDisabled || this.readonly || !this.isConnected) return;
    if (!this.emit('before-open')) return;
    const r = this._range();
    this._draft = { start: r.start, end: r.end };
    this._hover = null; this._committed = false;
    this.cal.set({ months: this._months() });
    this._reveal(r.start, r.end);
    if (this.time) {
      this.tpStart.value = r.start ? date.format(r.start, 'HH:mm') : '00:00';
      this.tpEnd.value = r.end ? date.format(r.end, 'HH:mm') : '23:59';
    }
    this._ov = drOpen(this, this.panel, this.control, { sheet: true, matchWidth: false, onClose: reason => this._closed(reason) });
    this.classList.add('is-open'); this.control.classList.add('is-focused');
    [this.inStart, this.inEnd].forEach(el => el.setAttribute('aria-expanded', 'true'));
    this._setPart(this._part);
    this._renderSummary(); this._paintPresets();
    const coarse = this.panel.classList.contains('is-sheet') && win.matchMedia?.('(pointer: coarse)').matches;
    if (coarse) this.cal.focus();
    this.emit('open');
  }
  close(reason = 'api') { this._ov?.close(reason); }
  toggle() { this._ov ? this.close() : this.open(); }
  _closed(reason) {
    this._ov = null;
    this.classList.remove('is-open'); this.control.classList.remove('is-focused');
    [this.inStart, this.inEnd].forEach(el => { el.setAttribute('aria-expanded', 'false'); el.classList.remove('is-active'); });
    const r = this._range();
    this._draft = { start: r.start, end: r.end };
    if (!this._typing) this._renderInputs();
    this.emit('close', { reason });
  }
  _trap(e) {
    if (e.key !== 'Tab') return;
    const f = focusables(this.panel);
    if (!f.length) return;
    const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
  _key(e, el) {
    if (e.isComposing || this.isDisabled) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'F4') { e.preventDefault(); if (this._typing) this._commitTyped(); this._setPart(el.dataset.part); if (!this._ov) this.open(); this.cal.focus(); return; }
    if (k === 'Enter') { if (this._typing) { e.preventDefault(); this._commitTyped(); } else if (this._ov) { e.preventDefault(); this.apply(); } return; }
    if (k === 'Escape' && !this._ov && this._typing) { e.preventDefault(); this._renderInputs(); this._syncForm(); return; }
    if (k === 'Tab' && this._ov && !(el === this.inStart && !e.shiftKey)) this.close('tab');
  }
  clear(emitEvents = false) {
    this._typing = false; this._bad = null; this._draft = { start: null, end: null };
    if (emitEvents) this.setValue(null); else { this.value = null; this._syncForm(); }
    this._renderInputs(); this.cal.refresh(); this._renderSummary();
  }
  focus(o) { this.inStart.focus(o); }
}
define('o-daterange', ODaterange);
O.Daterange = ODaterange;
