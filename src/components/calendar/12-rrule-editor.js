/* ============================================================================
 * calendar: picker adapters + <o-recurrence-editor>
 *   <o-recurrence-editor value="FREQ=WEEKLY;BYDAY=MO,WE" start="2026-09-14"></o-recurrence-editor>
 *   value: RRULE string ('' = does not repeat). Fires input/change/o-change like any form control.
 * ========================================================================== */

/** date field: <o-datepicker> when registered, else <input type=date>. -> { el, get(): 'YYYY-MM-DD', set(v) } */
function calDateField(val, attrs = {}) {
  if (isBrowser && customElements.get('o-datepicker')) {
    const el = h('o-datepicker', attrs);
    el.value = val || '';
    return { el, get: () => { const d = date.parse(el.value); return d ? calD.key(d) : ''; }, set: v => { el.value = v || ''; } };
  }
  const el = h('input', { type: 'date', class: 'o-input o-input-sm', ...attrs });
  el.value = val || '';
  return { el, get: () => el.value, set: v => { el.value = v || ''; } };
}
/** time field: <o-timepicker> when registered, else <input type=time>. -> { el, get(): 'HH:mm', set(v) } */
function calTimeField(val, attrs = {}, step = 15) {
  if (isBrowser && customElements.get('o-timepicker')) {
    const el = h('o-timepicker', { step, ...attrs });
    el.value = val || '';
    return { el, get: () => { const tm = date.parseTime(el.value); return tm ? pad2(tm.h) + ':' + pad2(tm.m) : ''; }, set: v => { el.value = v || ''; } };
  }
  const el = h('input', { type: 'time', class: 'o-input o-input-sm', step: step * 60, ...attrs });
  el.value = val || '';
  return { el, get: () => el.value, set: v => { el.value = v || ''; } };
}
const calNthOf = d => Math.ceil(d.getDate() / 7);
const calIsLastWeek = d => d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

class ORecurrenceEditor extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    start: Any,
    weekStart: Number,
    locale: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-rrule');
    const id = uid('rr');
    this._id = id;
    const sel = (k, opts) => h('select', { class: 'o-select o-input-sm', 'data-k': k, id: id + '-' + k }, opts);
    this.modeSel = sel('mode');
    this.freqSel = sel('freq');
    this.ivInput = h('input', { type: 'number', min: 1, max: 999, class: 'o-input o-input-sm o-rrule-iv', 'data-k': 'interval', id: id + '-iv' });
    this.daysWrap = h('div', { class: 'o-rrule-days', role: 'group' });
    this.monthWrap = h('div', { class: 'o-rrule-radios', role: 'radiogroup' });
    this.untilField = calDateField('', { 'data-k': 'until', id: id + '-until' });
    this.countInput = h('input', { type: 'number', min: 1, max: 999, class: 'o-input o-input-sm o-rrule-count', 'data-k': 'count', id: id + '-count' });
    this.endsWrap = h('div', { class: 'o-rrule-radios o-rrule-ends', role: 'radiogroup' });
    this.summary = h('p', { class: 'o-rrule-summary', 'aria-live': 'polite' });
    this.rowMode = h('div', { class: 'o-rrule-row' }, h('label', { class: 'o-label', for: id + '-mode' }), this.modeSel);
    this.rowIv = h('div', { class: 'o-rrule-row', 'data-show': 'custom' }, h('label', { class: 'o-label', for: id + '-iv' }), h('div', { class: 'o-rrule-inline' }, this.ivInput, this.freqSel));
    this.rowDays = h('div', { class: 'o-rrule-row', 'data-show': 'weekly' }, h('span', { class: 'o-label', id: id + '-dl' }), this.daysWrap);
    this.rowMonth = h('div', { class: 'o-rrule-row', 'data-show': 'monthly' }, this.monthWrap);
    this.rowEnds = h('div', { class: 'o-rrule-row', 'data-show': 'repeat' }, h('span', { class: 'o-label', id: id + '-el' }), this.endsWrap);
    this.daysWrap.setAttribute('aria-labelledby', id + '-dl');
    this.endsWrap.setAttribute('aria-labelledby', id + '-el');
    this.append(this.rowMode, this.rowIv, this.rowDays, this.rowMonth, this.rowEnds, this.summary);
    this._st = { mode: 'none', freq: 'WEEKLY', interval: 1, days: new Set(), monthly: 'day', ends: 'never', until: '', count: 10 };
    on(this, 'change input', '[data-k], input[type=radio]', (e, el) => this._fromUI(e, el));
    on(this, 'click', '.o-rrule-day', (e, b) => {
      if (this.isDisabled || this.readonly) return;
      const d = +b.dataset.day, s = this._st.days;
      if (s.has(d) && s.size > 1) s.delete(d); else s.add(d);
      this._commit();
    });
    on(this.daysWrap, 'keydown', e => {
      const rtl = isRTL(this);
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const btns = $$('.o-rrule-day', this.daysWrap), i = btns.indexOf(doc.activeElement);
      if (i < 0) return;
      e.preventDefault();
      btns[(i + ((e.key === 'ArrowRight') !== rtl ? 1 : -1) + 7) % 7].focus();
    });
    this.focusTarget = this.modeSel;
  }
  get _start() { return calD.sod(date.parse(this.start) || new Date()); }
  get _ws() { return this.weekStart ?? date.weekStart(this.locale); }

  update(changed) {
    if (changed.has('init') || changed.has('locale') || changed.has('start') || changed.has('weekStart') || changed.has('texts')) this._build();
    if (changed.has('value') || changed.has('init') || changed.has('start')) { if (this.value !== this._emitted) this._toState(); this._paint(); }
    if (changed.has('disabled') || changed.has('readonly')) $$('select,input,button', this).forEach(el => { el.disabled = this.isDisabled || this.readonly; });
  }
  /** static option lists (depend on start date + locale) */
  _build() {
    const T = k => this.t('rrule.' + k), loc = this.locale, s = this._start;
    const wdLong = calF(s, { weekday: 'long' }, loc), n = calNthOf(s);
    this.rowMode.firstChild.textContent = this.t('calendar.repeat');
    this.rowIv.firstChild.textContent = T('every');
    this.rowDays.firstChild.textContent = T('repeatOn');
    this.rowEnds.firstChild.textContent = T('ends');
    const modes = [['none', T('none')], ['daily', T('daily')], ['weekly', T('weekly') + ' · ' + wdLong], ['monthly', T('monthly')], ['yearly', T('yearly') + ' · ' + calF(s, { month: 'long', day: 'numeric' }, loc)], ['custom', T('custom') + '…']];
    this.modeSel.replaceChildren(...modes.map(([v, l]) => h('option', { value: v }, l)));
    this.freqSel.replaceChildren(...['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map(f => h('option', { value: f }, this.t('rrule.unit.' + { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[f], { count: this._st.interval }))));
    this.daysWrap.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const d = (i + this._ws) % 7, dd = new Date(2021, 7, 1 + d);
      return h('button', { type: 'button', class: 'o-rrule-day', 'data-day': d, 'aria-pressed': 'false', 'aria-label': calF(dd, { weekday: 'long' }, loc), tabindex: i ? '-1' : '0' }, calF(dd, { weekday: 'narrow' }, loc));
    }));
    const name = this._id + '-m';
    const radio = (group, v, label, extra) => h('label', { class: 'o-check' }, h('input', { type: 'radio', name: group, value: v }), h('span', null, label), extra);
    const nthTxt = k => this.t('rrule.monthlyNth', { nth: this.t('rrule.nth.' + k), weekday: wdLong });
    this.monthWrap.replaceChildren(...[radio(name, 'day', this.t('rrule.monthlyDay', { day: s.getDate() })), n <= 4 ? radio(name, 'nth', nthTxt(n)) : null, calIsLastWeek(s) ? radio(name, 'last', nthTxt(-1)) : null].filter(Boolean));
    const en = this._id + '-e';
    this.endsWrap.replaceChildren(
      radio(en, 'never', T('never')),
      radio(en, 'until', T('on'), this.untilField.el),
      radio(en, 'count', T('after'), h('span', { class: 'o-rrule-inline' }, this.countInput, h('span', { class: 'o-rrule-unit' }, T('occurrences')))),
    );
  }
  /** RRULE -> UI state */
  _toState() {
    const st = this._st, s = this._start;
    let r = null;
    try { r = this.value ? rrParse(this.value) : null; } catch { r = null; }
    st.extra = false;
    if (!r) { Object.assign(st, { mode: 'none', freq: 'WEEKLY', interval: 1, days: new Set([s.getDay()]), monthly: 'day', ends: 'never', until: '', count: 10 }); return; }
    st.freq = r.freq === 'HOURLY' ? 'DAILY' : r.freq;
    st.interval = r.interval;
    st.days = new Set(r.byday.filter(b => !b.n).map(b => b.day));
    if (!st.days.size) st.days.add(s.getDay());
    const ord = r.byday.find(b => b.n);
    st.monthly = ord ? (ord.n < 0 ? 'last' : 'nth') : 'day';
    st.ends = r.count ? 'count' : r.until ? 'until' : 'never';
    st.count = r.count || 10;
    st.until = r.until ? calD.key(r.until) : '';
    const simpleWeekly = st.freq === 'WEEKLY' && r.byday.length === 1 && !ord && r.byday[0].day === s.getDay();
    const simpleMonthly = st.freq === 'MONTHLY' && ((!r.byday.length && (!r.bymonthday.length || (r.bymonthday.length === 1 && r.bymonthday[0] === s.getDate()))) || (ord && r.byday.length === 1));
    const simpleYearly = st.freq === 'YEARLY' && !r.byday.length && r.bymonth.length <= 1 && r.bymonthday.length <= 1;
    st.extra = !!(r.bysetpos.length || r.byyearday.length || r.byhour.length || r.byminute.length || (st.freq !== 'YEARLY' && r.bymonth.length));
    st.mode = r.interval > 1 || st.extra ? 'custom'
      : st.freq === 'DAILY' && !r.byday.length ? 'daily' : simpleWeekly || (st.freq === 'WEEKLY' && !r.byday.length) ? 'weekly'
        : simpleMonthly ? 'monthly' : simpleYearly ? 'yearly' : 'custom';
  }
  /** UI state -> RRULE */
  _toRule() {
    const st = this._st, s = this._start;
    if (st.mode === 'none') return '';
    const freq = st.mode === 'custom' ? st.freq : st.mode.toUpperCase();
    const r = { freq, interval: st.mode === 'custom' ? Math.max(1, st.interval | 0) : 1 };
    if (freq === 'WEEKLY') r.byday = st.mode === 'weekly' ? [s.getDay()] : [...st.days].sort((a, b) => ((a - this._ws + 7) % 7) - ((b - this._ws + 7) % 7));
    if (freq === 'MONTHLY') {
      if (st.monthly === 'nth') r.byday = [{ day: s.getDay(), n: calNthOf(s) }];
      else if (st.monthly === 'last') r.byday = [{ day: s.getDay(), n: -1 }];
      else r.bymonthday = [s.getDate()];
    }
    if (freq === 'YEARLY') { r.bymonth = [s.getMonth() + 1]; r.bymonthday = [s.getDate()]; }
    if (st.ends === 'count') r.count = Math.max(1, st.count | 0);
    else if (st.ends === 'until' && st.until) { r.until = date.parse(st.until); r.untilDateOnly = true; }
    return rrToString(r);
  }
  _fromUI(e, el) {
    e.stopPropagation();
    if (e.type === 'input' && el.type !== 'number') return;
    const st = this._st, k = el.dataset.k;
    if (k === 'mode') {
      st.mode = el.value;
      if (st.mode === 'custom' && !st.extra) st.freq = st.freq || 'WEEKLY';
      if (st.mode === 'weekly' || st.mode === 'custom') { if (!st.days.size) st.days.add(this._start.getDay()); }
    } else if (k === 'freq') st.freq = el.value;
    else if (k === 'interval') st.interval = clamp(parseInt(el.value, 10) || 1, 1, 999);
    else if (k === 'count') { st.count = clamp(parseInt(el.value, 10) || 1, 1, 999); st.ends = 'count'; }
    else if (k === 'until') { st.until = this.untilField.get(); st.ends = 'until'; }
    else if (el.type === 'radio') { if (el.name.endsWith('-m')) st.monthly = el.value; else st.ends = el.value; }
    st.extra = false;
    this._commit();
  }
  _commit() {
    const v = this._toRule();
    this._emitted = v;
    this.setValue(v);
    this._paint();
  }
  _paint() {
    const st = this._st, custom = st.mode === 'custom', freq = custom ? st.freq : st.mode.toUpperCase();
    this.modeSel.value = st.mode;
    this.freqSel.value = st.freq;
    [...this.freqSel.options].forEach(o => { o.textContent = this.t('rrule.unit.' + { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[o.value], { count: st.interval }); });
    this.ivInput.value = st.interval;
    this.rowIv.hidden = !custom;
    this.rowDays.hidden = !(custom && freq === 'WEEKLY');
    this.rowMonth.hidden = !(freq === 'MONTHLY' && (custom || st.mode === 'monthly'));
    this.rowEnds.hidden = st.mode === 'none';
    $$('.o-rrule-day', this.daysWrap).forEach(b => b.setAttribute('aria-pressed', String(st.days.has(+b.dataset.day))));
    $$('input[type=radio]', this.monthWrap).forEach(r => { r.checked = r.value === st.monthly; });
    if (!$('input:checked', this.monthWrap)) { const f = $('input', this.monthWrap); if (f) f.checked = true; }
    $$('input[type=radio]', this.endsWrap).forEach(r => { r.checked = r.value === st.ends; });
    this.countInput.value = st.count;
    if (st.until) this.untilField.set(st.until);
    else if (st.ends !== 'until') this.untilField.set(calD.key(calD.add(this._start, 90)));
    this.summary.textContent = this.value ? rrDescribe(this.value, { dtstart: this._start, locale: this.locale }) : '';
    this.summary.hidden = !this.value;
  }
  /** Next occurrences for previews */
  preview(n = 5) { return this.value ? rrExpand(this.value, { dtstart: this._start, limit: n }) : []; }
}
define('o-recurrence-editor', ORecurrenceEditor);
O.RecurrenceEditor = ORecurrenceEditor;
