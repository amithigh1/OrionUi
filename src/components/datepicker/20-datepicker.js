/* <o-datepicker> — date / datetime input with a popup (bottom sheet on phones) or inline calendar.
 *   <o-datepicker name="due" value="2026-09-12" min="2026-01-01" max="2026-12-31"></o-datepicker>
 *   <o-datepicker inline months="2" week-numbers highlighted='[{"date":"2026-09-18","color":"danger","label":"Launch"}]'></o-datepicker>
 *   <o-datepicker time value="2026-09-12T14:30"></o-datepicker>        <o-datepicker mode="multiple" name="days"></o-datepicker>
 *   disabled-dates='["weekends", "2026-09-20", {"from":"2026-10-01","to":"2026-10-07"}]'  or  el.disabledDates = d => …
 * value: 'YYYY-MM-DD' ('YYYY-MM-DDTHH:mm' with `time`, an array with mode="multiple"); Date objects are accepted.
 * Typed input is parsed with `format` (default date.localePattern(), e.g. MM/DD/YYYY; ISO always works).
 * Keyboard: input ↓ / Alt+↓ open + focus the grid; grid ←→↑↓ day/week, Home/End week, PageUp/PageDown month,
 *   Shift+PageUp/PageDown year, Enter/Space select, Esc close; title → month view → year view (Esc goes back).
 * Events: o-change {value, date|dates}, o-open, o-close {reason}, o-view {month}
 * Methods: open(focusCalendar?) close() toggle() clear(emit?) focus() show(date); getters date, dates, calendar
 */
i18n.add('en', {
  datepicker: {
    today: 'Today', now: 'Now', clear: 'Clear', done: 'Done', time: 'Time', dialog: 'Choose date',
    invalid: 'Enter a valid date ({format})', min: 'Date must be on or after {min}', max: 'Date must be on or before {max}',
    unavailable: 'This date is not available',
  },
});

const { openPanel: dpOpen, syncLabel: dpLabel, time: dpTime } = O.pickers;

/** Shared by datepicker & daterange: normalise `disabled-dates` / `highlighted` props. */
function pickerDisabledFn(v) {
  if (v == null || v === '') return null;
  if (isFn(v)) return v;
  if (isStr(v) && isBrowser && isFn(getPath(win, v))) return getPath(win, v);
  const list = toArr(isStr(v) ? (v.trim().startsWith('[') ? parseJSON(v, []) : v.split(',').map(s => s.trim())) : v);
  const days = new Set(), ranges = [], wds = new Set();
  for (const x of list) {
    if (x === 'weekends' || x === 'weekend') { wds.add(0); wds.add(6); }
    else if (x === 'weekdays') [1, 2, 3, 4, 5].forEach(n => wds.add(n));
    else if (isNum(x)) wds.add(x);
    else if (isObj(x) && (x.from || x.to)) ranges.push([x.from ? date.startOf(x.from, 'd') : null, x.to ? date.startOf(x.to, 'd') : null]);
    else { const d = date.parse(x); if (d) days.add(date.toISODate(d)); }
  }
  return d => wds.has(d.getDay()) || days.has(date.toISODate(d)) || ranges.some(([a, b]) => (!a || +d >= +a) && (!b || +d <= +b));
}
function pickerHighlightFn(v) {
  if (v == null || v === '') return null;
  if (isFn(v)) return v;
  if (isStr(v) && isBrowser && isFn(getPath(win, v))) return getPath(win, v);
  const map = new Map();
  for (const x of toArr(isStr(v) ? parseJSON(v, v.split(',')) : v)) {
    if (isObj(x)) { const d = date.parse(x.date); if (d) map.set(date.toISODate(d), x); }
    else { const d = date.parse(x); if (d) map.set(date.toISODate(d), true); }
  }
  return d => map.get(date.toISODate(d)) || null;
}
O.pickers.disabledFn = pickerDisabledFn;
O.pickers.highlightFn = pickerHighlightFn;

class ODatepicker extends FormElement {
  static props = {
    ...FormElement.props,
    mode: { type: String, default: 'single' },
    format: String,
    min: Any,
    max: Any,
    disabledDates: Any,
    highlighted: Any,
    weekNumbers: Boolean,
    weekStart: Number,
    months: { type: Number, default: 1 },
    outsideDays: Any,
    time: Boolean,
    hour12: Any,
    step: { type: Number, default: 5 },
    inline: { type: Boolean, reflect: true },
    placeholder: String,
    todayButton: { type: Boolean, default: true },
    clearable: { type: Boolean, default: true },
    closeOnSelect: { type: Boolean, default: true },
    size: { type: String, reflect: true },
    texts: Object,
  };

  setup() {
    const pid = uid('dp-panel');
    this.control = h('div', { class: 'o-control o-dp-control' });
    this.input = h('input', { class: 'o-dp-input', type: 'text', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': pid });
    this.clearBtn = h('button', { type: 'button', class: 'o-select-clear', tabindex: '-1', hidden: true }, icon('x'));
    this.btn = h('button', { type: 'button', class: 'o-tp-btn o-dp-btn', tabindex: '-1', 'aria-haspopup': 'dialog' }, icon('calendar'));
    this.control.append(this.input, h('span', { class: 'o-select-indicators' }, this.clearBtn, this.btn));
    this.inlineEl = h('div', { class: 'o-dp-inline' });
    this.append(this.control, this.inlineEl);

    this.panel = h('div', { class: 'o-floating o-dp-panel', id: pid, role: 'dialog', hidden: true });
    this.calEl = h('div', { class: 'o-dp-cal' });
    this.colsEl = h('div');
    this.timeHead = h('div', { class: 'o-dp-time-head' });
    this.timeEl = h('div', { class: 'o-dp-time', hidden: true }, this.timeHead, this.colsEl);
    this.todayBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'today' });
    this.clearFoot = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', 'data-act': 'clear' });
    this.doneBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', 'data-act': 'done' });
    this.foot = h('div', { class: 'o-dp-foot' }, this.todayBtn, this.clearFoot, h('span', { class: 'o-dp-spacer' }), this.doneBtn);
    this.inner = h('div', { class: 'o-dp-inner' }, h('div', { class: 'o-dp-body' }, this.calEl, this.timeEl), this.foot);

    this.cal = new O.Calendar(this.calEl, {
      onSelect: d => this._pickDay(d),
      onView: m => this.emit('view', { month: date.toISODate(m) }),
      dayState: d => ({ selected: this._keys().has(date.toISODate(d)) }),
      isDisabled: d => !!this._disFn?.(d),
      highlight: d => this._hlFn?.(d) || null,
    });
    this.cols = new O.TimeColumns(this.colsEl, { onChange: tm => this._pickTime(tm), onEnter: () => { this.close(); this.input.focus(); } });

    on(this.control, 'click', e => {
      if (this.isDisabled || this.readonly || e.target.closest('.o-select-clear')) return;
      if (e.target.closest('.o-dp-btn')) { this.input.focus({ preventScroll: true }); this._ov ? this.close() : this.open(true); return; }
      if (!this._ov) this.open();
    });
    on(this.clearBtn, 'mousedown', e => e.preventDefault());
    on(this.clearBtn, 'click', () => { this.clear(true); this.input.focus(); });
    on(this.input, 'keydown', e => this._key(e));
    on(this.input, 'input', () => {
      this._typing = true;
      const d = this._parse(this.input.value.split(/[;]/).pop());
      if (d && (this._ov || this.inline)) this.cal.show(d);
    });
    on(this.foot, 'click', '[data-act]', (e, b) => this._act(b.dataset.act));
    on(this.panel, 'keydown', e => this._trap(e));
    on(this, 'focusout', e => { const r = e.relatedTarget; if (!r || (!this.contains(r) && !this.panel.contains(r))) { this._commitTyped(); this._touched = true; this._syncInvalid(); } });
    on(this, 'invalid', () => { this._touched = true; this._syncInvalid(); });
    on(this, 'click', e => { if (e.target === this) this.focus(); });
    this.focusTarget = this.input;
  }
  connected() { dpLabel(this, this.input); dpLabel(this, this.panel); }
  disconnected() { this.close(); }

  /* ── values ───────────────────────────────────────────────────────── */
  get _multi() { return this.mode === 'multiple'; }
  _h12() { const v = this.hour12; if (v === true || v === '' || v === 'true') return true; if (v === false || v === 'false') return false; return date.uses12h(); }
  _fmt() { return this.format || date.localePattern() + (this.time ? ' ' + (this._h12() ? 'h:mm A' : 'HH:mm') : ''); }
  _iso(d) { return this.time ? date.format(d, 'YYYY-MM-DDTHH:mm') : date.toISODate(d); }
  _dates() {
    let v = this.value;
    if (v == null || v === '') return [];
    if (isStr(v)) { const s = v.trim(); v = s.startsWith('[') ? parseJSON(s, []) : this._multi ? s.split(/[,;]\s*/) : [s]; }
    return toArr(v).map(x => date.parse(x)).filter(Boolean);
  }
  _keys() {
    if (this.__kc && this.__kc.src === this.value) return this.__kc.keys;
    const keys = new Set(this._dates().map(d => date.toISODate(d)));
    this.__kc = { src: this.value, keys };
    return keys;
  }
  get date() { return this._dates()[0] || null; }
  get dates() { return this._dates(); }
  get calendar() { return this.cal; }
  isEmpty() { return this._dates().length === 0; }
  formValue() { const ds = this._dates(); if (!ds.length) return null; return this._multi ? ds.map(d => this._iso(d)) : this._iso(ds[0]); }
  _minD() { const d = date.parse(this.min); return d ? date.startOf(d, 'd') : null; }
  _maxD() { const d = date.parse(this.max); return d ? date.startOf(d, 'd') : null; }
  _text() { const f = this._fmt(); return this._dates().map(d => date.format(d, f)).join(this._multi ? (f.includes(',') ? '; ' : ', ') : ''); }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('disabledDates')) this._disFn = pickerDisabledFn(this.disabledDates);
    if (init || changed.has('highlighted')) this._hlFn = pickerHighlightFn(this.highlighted);
    if (init || changed.has('inline')) {
      this.control.hidden = !!this.inline; this.inlineEl.hidden = !this.inline;
      if (this.inline) { this.close(); this.inlineEl.append(this.inner); this.focusTarget = this.inlineEl; }
      else { this.panel.append(this.inner); this.focusTarget = this.input; }
    }
    if (init || ['min', 'max', 'weekNumbers', 'weekStart', 'months', 'outsideDays', 'locale', 'disabledDates', 'highlighted', 'mode'].some(k => changed.has(k))) {
      this.cal.set({ min: this._minD(), max: this._maxD(), weekNumbers: this.weekNumbers, weekStart: this.weekStart ?? undefined, months: this.months, outsideDays: this.outsideDays == null || this.outsideDays === '' ? undefined : this.outsideDays !== false && this.outsideDays !== 'false', locale: i18n.locale });
      if (init) this.cal.show(this.date || this._clampToday()); else this.cal.render();
    }
    if (init || ['time', 'hour12', 'step', 'locale'].some(k => changed.has(k))) {
      this.timeEl.hidden = !this.time;
      this.panel.classList.toggle('has-time', !!this.time); this.inlineEl.classList.toggle('has-time', !!this.time);
      this.cols.configure({ hour12: this._h12(), step: this.step || 1, locale: i18n.locale });
    }
    if (init || ['locale', 'texts', 'placeholder', 'format', 'time', 'hour12', 'mode', 'clearable', 'todayButton', 'inline'].some(k => changed.has(k))) {
      this.input.placeholder = this.placeholder ?? this._fmt().replace(/A$/, 'am').toLowerCase().replace(/h:mm/, 'hh:mm');
      this.btn.setAttribute('aria-label', this.t('datepicker.choose'));
      this.clearBtn.setAttribute('aria-label', this.t('datepicker.clear'));
      this.panel.setAttribute('aria-label', this.t('datepicker.dialog'));
      this.todayBtn.textContent = this.t(this.time ? 'datepicker.now' : 'datepicker.today');
      this.clearFoot.textContent = this.t('datepicker.clear');
      this.doneBtn.textContent = this.t('datepicker.done');
      this.timeHead.textContent = this.t('datepicker.time');
      this.todayBtn.hidden = !this.todayButton;
      this.clearFoot.hidden = !this.clearable;
      this.doneBtn.hidden = !!this.inline || !(this.time || this._multi);
      this.foot.hidden = this.todayBtn.hidden && this.clearFoot.hidden && this.doneBtn.hidden;
    }
    if (init || changed.has('size')) { this.control.classList.toggle('o-control-sm', this.size === 'sm'); this.control.classList.toggle('o-control-lg', this.size === 'lg'); }
    if (init || changed.has('disabled') || changed.has('readonly')) {
      this.input.disabled = this.isDisabled; this.input.readOnly = !!this.readonly;
      this.control.classList.toggle('is-disabled', this.isDisabled);
      this.inlineEl.classList.toggle('is-disabled', this.isDisabled);
      this.inlineEl.inert = this.isDisabled || !!this.readonly;
      if (this.isDisabled || this.readonly) this.close();
    }
    if (init || ['value', 'locale', 'format', 'time', 'hour12', 'mode'].some(k => changed.has(k))) {
      if (!this._typing || changed.has('value')) { const txt = this._text(); if (this.input.value !== txt) this.input.value = txt; this._typing = false; this._bad = false; }
      const d = this.date;
      this.cols.set(this.time && d ? { h: d.getHours(), m: d.getMinutes(), s: 0 } : null, !!this._ov);
      this.cal.refresh();
    }
    this.clearBtn.hidden = !(this.clearable && !this.isEmpty() && !this.isDisabled && !this.readonly);
    this._syncInvalid();
  }
  _clampToday() { const t0 = date.today(), mn = this._minD(), mx = this._maxD(); return mn && +t0 < +mn ? mn : mx && +t0 > +mx ? mx : t0; }

  /* ── validation ───────────────────────────────────────────────────── */
  getValidity() {
    if (this._bad) return { flags: { badInput: true }, message: this.t('datepicker.invalid', { format: this._fmt() }) };
    const mn = this._minD(), mx = this._maxD(), f = this.format ? this._fmt() : date.localePattern();
    for (const d of this._dates()) {
      const day = date.startOf(d, 'd');
      if (mn && +day < +mn) return { flags: { rangeUnderflow: true }, message: this.t('datepicker.min', { min: date.format(mn, f) }) };
      if (mx && +day > +mx) return { flags: { rangeOverflow: true }, message: this.t('datepicker.max', { max: date.format(mx, f) }) };
      if (this._disFn?.(day)) return { flags: { badInput: true }, message: this.t('datepicker.unavailable') };
    }
    return null;
  }
  _syncInvalid() {
    const bad = !!(this._touched && this.validity && !this.validity.valid);
    this.control.classList.toggle('is-invalid', bad);
    this.inlineEl.classList.toggle('is-invalid', bad);
    if (bad) this.input.setAttribute('aria-invalid', 'true'); else this.input.removeAttribute('aria-invalid');
  }
  _syncValidity() { super._syncValidity(); if (this._setupDone) this._syncInvalid(); }
  setValue(v, opts = {}) {
    this._bad = false; this._typing = false;
    this.value = v; this._syncForm();
    if (opts.silent) return;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', this._multi ? { value: this.value, dates: this.dates } : { value: this.value, date: this.date });
  }

  /* ── typing ───────────────────────────────────────────────────────── */
  _parse(s) {
    s = String(s || '').trim();
    if (!s) return null;
    const fmt = this._fmt();
    let d = date.parseFormat(s, fmt, i18n.locale);
    if (!d && this.time && !this.format) {
      const dOnly = date.parseFormat(s, date.localePattern(), i18n.locale);
      if (dOnly) { const cur = this.date; d = cur ? date.setTime(dOnly, { h: cur.getHours(), m: cur.getMinutes() }) : dOnly; }
    }
    if (!d && /^\d{4}-\d{1,2}-\d{1,2}/.test(s)) d = date.parse(s.replace(' ', 'T'));
    if (!d) { const sep = (fmt.match(/[^A-Za-z\s]/) || ['/'])[0]; d = date.parseFormat(s.replace(/[.\-/\\]+/g, sep).replace(/\s+/g, ' '), fmt, i18n.locale); }
    return d;
  }
  _commitTyped() {
    if (!this._typing) return true;
    const txt = this.input.value.trim();
    if (!txt) { this._typing = false; this._bad = false; if (!this.isEmpty()) this.setValue(this._multi ? [] : null); else this._syncForm(); return true; }
    const parts = this._multi ? txt.split(this._fmt().includes(',') ? /;\s*/ : /[,;]\s*/).filter(Boolean) : [txt];
    const ds = parts.map(p => this._parse(p));
    if (ds.some(d => !d)) { this._bad = true; this._syncForm(); this._touched = true; this._syncInvalid(); return false; }
    if (this._multi) {
      const uniq = [...new Map(ds.map(d => [date.toISODate(d), d])).values()].sort((a, b) => a - b);
      this.setValue(uniq.map(d => this._iso(d)));
    } else this.setValue(this._iso(ds[0]));
    this.requestUpdate('value');
    this.cal.show(ds[ds.length - 1]);
    return true;
  }

  /* ── selection ────────────────────────────────────────────────────── */
  _defaultTime() { const d = new Date(), st = this.step || 1; return { h: d.getHours(), m: Math.floor(d.getMinutes() / st) * st }; }
  _pickDay(d) {
    if (this.isDisabled || this.readonly) return;
    if (this._multi) {
      const k = date.toISODate(d), cur = this._dates();
      const next = this._keys().has(k) ? cur.filter(x => date.toISODate(x) !== k) : [...cur, d];
      this.setValue(next.sort((a, b) => a - b).map(x => this._iso(x)));
    } else {
      const cur = this.date;
      const nd = this.time ? date.setTime(d, cur ? { h: cur.getHours(), m: cur.getMinutes() } : (this.cols.value || this._defaultTime())) : d;
      this.setValue(this._iso(nd));
      if (!this.time && !this.inline && this.closeOnSelect) { this.close(); this.input.focus({ preventScroll: true }); }
    }
    this.cal.refresh();
  }
  _pickTime(tm) {
    const base = this.date || this.cal.focusDate || date.today();
    this.setValue(this._iso(date.setTime(base, tm)));
    this.cal.refresh();
  }
  _act(a) {
    if (a === 'today') {
      const now = new Date(), day = date.today();
      this.cal.show(day);
      if (this.cal.isDisabled(day)) return;
      if (this._multi) { if (!this._keys().has(date.toISODate(day))) this._pickDay(day); return; }
      this.setValue(this._iso(this.time ? date.setTime(day, { h: now.getHours(), m: now.getMinutes() }) : day));
      this.cal.refresh();
      if (!this.time && !this.inline) { this.close(); this.input.focus({ preventScroll: true }); }
    } else if (a === 'clear') {
      this.setValue(this._multi ? [] : null); this.cal.refresh();
      if (!this.inline) { this.close(); this.input.focus({ preventScroll: true }); }
    } else { this.close(); this.input.focus({ preventScroll: true }); }
  }

  /* ── panel ────────────────────────────────────────────────────────── */
  open(focusCal = false) {
    if (this._ov || this.isDisabled || this.readonly || this.inline || !this.isConnected) return;
    if (!this.emit('before-open')) return;
    this.panel.append(this.inner);
    this.cal.show(this._parse(this.input.value) || this.date || this._clampToday(), { force: true });
    this._ov = dpOpen(this, this.panel, this.control, { sheet: true, matchWidth: false, onClose: r => this._closed(r) });
    if (this.time) this.cols.reveal();
    this.classList.add('is-open'); this.control.classList.add('is-focused');
    this.input.setAttribute('aria-expanded', 'true');
    const coarse = this.panel.classList.contains('is-sheet') && win.matchMedia?.('(pointer: coarse)').matches;
    if (focusCal || coarse) this.cal.focus();
    this.emit('open');
  }
  close(reason = 'api') { this._ov?.close(reason); }
  toggle() { this._ov ? this.close() : this.open(); }
  show(d) { this.cal.show(d); return this; }
  _closed(reason) {
    this._ov = null;
    this.classList.remove('is-open'); this.control.classList.remove('is-focused');
    this.input.setAttribute('aria-expanded', 'false');
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
  _key(e) {
    if (e.isComposing || this.isDisabled) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'F4') { e.preventDefault(); if (this._typing) this._commitTyped(); if (!this._ov) this.open(true); else this.cal.focus(); return; }
    if (k === 'Enter') { if (this._typing) { e.preventDefault(); this._commitTyped(); } else if (this._ov) { e.preventDefault(); this.close(); } return; }
    if (k === 'Escape' && !this._ov && this._typing) { e.preventDefault(); this._typing = false; this._bad = false; this.requestUpdate('value'); this._syncForm(); return; }
    if (k === 'Tab' && this._ov) this.close('tab');
  }
  clear(emitEvents = false) {
    this._typing = false; this._bad = false; this.input.value = '';
    const empty = this._multi ? [] : null;
    if (emitEvents) this.setValue(empty); else { this.value = empty; this._syncForm(); }
    this.cal.refresh();
  }
  focus(o) { if (this.inline) this.cal.focus(); else this.input.focus(o); }
}
define('o-datepicker', ODatepicker);
O.Datepicker = ODatepicker;
