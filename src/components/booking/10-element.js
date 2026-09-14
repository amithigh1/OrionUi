/* ============================================================================
 * <o-booking> — appointment booking: service -> date -> time -> details -> confirm.
 * See README.md for the full API.
 * ========================================================================== */

class OBooking extends OElement {
  static props = {
    services: { type: Array, default: () => [] },
    serviceId: Any,
    workingHours: Any,
    slotMinutes: { type: Number, default: 30 },
    bufferMinutes: { type: Number, default: 0 },
    booked: { type: Array, default: () => [] },
    minNotice: { type: Number, default: 60 },
    maxDaysAhead: { type: Number, default: 60 },
    availability: { type: Function, attr: false },
    timezone: String,
    locale: String,
    weekStart: Number,
    fields: { type: Array, default: () => ['name', 'email', 'phone', 'notes'] },
    organizer: String,
    location: String,
    onBook: { type: Function, attr: false },
    texts: Object,
  };

  setup() {
    this.classList.add('o-booking');
    this._step = 'pick';
    this._month = bkSod(new Date()); this._month.setDate(1);
    this._selDate = bkSod(new Date());
    this._slot = null; this._slotResult = null; this._slotError = null; this._slotLoading = false;
    this._svcId = null; this._details = {}; this._fieldErrors = {}; this._bookError = ''; this._busy = false; this._gen = 0;
    this._cache = new Map();
    this.head = h('div', { class: 'o-booking-head' });
    this.body = h('div', { class: 'o-booking-body' });
    this.append(this.head, this.body);
    on(this, 'click', '[data-act]', (e, b) => this._act(b.dataset.act, b, e));
    on(this, 'click', '.o-booking-slot', (e, b) => !b.disabled && this._selectSlot(JSON.parse(b.dataset.slot)));
    on(this, 'click', '.o-booking-day:not(.is-disabled)', (e, d) => this._selectDate(date.parse(d.dataset.date)));
    on(this, 'click', '.o-booking-svc', (e, b) => this._selectService(b.dataset.id));
    on(this, 'submit', 'form.o-booking-form', (e, f) => { e.preventDefault(); this._confirm(f); });
    on(this, 'input change', '.o-booking-form input, .o-booking-form textarea', (e, el) => { this._details[el.name] = el.value; if (this._fieldErrors[el.name]) { delete this._fieldErrors[el.name]; this._paintErrors(); } });
    this.focusTarget = this;
  }
  update() { this._render(); }

  /* ── helpers ─────────────────────────────────────────────────────── */
  get _loc() { return this.locale || i18n.locale; }
  get _ws() { return this.weekStart ?? date.weekStart(this._loc); }
  get _tz() { try { return this.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return this.timezone || ''; } }
  _serviceList() { return toArr(this.services).filter(isObj); }
  _service() {
    const list = this._serviceList();
    if (!list.length) return { id: null, title: this.t('calendar.newEvent', { default: '' }) || '', duration: this.slotMinutes };
    return list.find(s => String(s.id) === String(this._svcId ?? this.serviceId)) || list[0];
  }
  _cfg(svc) { return { workingHours: this.workingHours, slotMinutes: this.slotMinutes, bufferMinutes: this.bufferMinutes, booked: this.booked, minNotice: this.minNotice, duration: +svc.duration || this.slotMinutes }; }
  _dayInRange(d) { const today = bkSod(new Date()); return d >= today && d < bkAddDays(today, Math.max(1, +this.maxDaysAhead || 60)); }

  _selectService(id) { if (String(this._svcId ?? this.serviceId) === String(id)) return; this._svcId = id; this._cache.clear(); this._loadDay(this._selDate); this._render(); }
  _selectDate(d) { if (!d) return; this._selDate = bkSod(d); this.emit('date-select', { date: new Date(+this._selDate) }); this._loadDay(this._selDate); this._render(); }
  _selectSlot(raw) {
    this._slot = { start: date.parse(raw.start), end: date.parse(raw.end) };
    this.emit('slot-select', { start: new Date(+this._slot.start), end: new Date(+this._slot.end) });
    this._step = 'details'; this._bookError = ''; this._render();
    queueMicrotask(() => this.querySelector('.o-booking-form input')?.focus());
  }
  /** (re)compute / fetch slots for a day, then re-render */
  _loadDay(day) {
    const svc = this._service(), key = bkKey(day) + '|' + (svc.id ?? '');
    const gen = ++this._gen;
    if (this._cache.has(key)) { this._slotResult = this._cache.get(key); this._slotError = null; this._slotLoading = false; return; }
    this._slotResult = null; this._slotError = null;
    if (!isFn(this.availability)) {
      const slots = bkComputeSlots(day, this._cfg(svc));
      this._cache.set(key, slots); this._slotResult = slots; this._slotLoading = false;
      return;
    }
    this._slotLoading = true;
    Promise.resolve().then(() => this.availability(new Date(+day), clone(svc))).then(raw => {
      if (gen !== this._gen) return;
      const slots = bkNormSlots(raw, day, this._cfg(svc));
      this._cache.set(key, slots); this._slotResult = slots; this._slotLoading = false; this._render();
    }).catch(err => {
      if (gen !== this._gen) return;
      this._slotError = (err && err.message) || this.t('booking.loadError'); this._slotLoading = false; this._render();
    });
  }
  async _confirm(form) {
    const svc = this._service(), slot = this._slot;
    if (!slot) return;
    const fields = toArr(this.fields);
    const errs = {};
    if (fields.includes('name') && !String(this._details.name || '').trim()) errs.name = this.t('booking.required');
    if (fields.includes('email')) { const v = String(this._details.email || '').trim(); if (!v) errs.email = this.t('booking.required'); else if (!BK_EMAIL_RE.test(v)) errs.email = this.t('booking.invalidEmail'); }
    this._fieldErrors = errs;
    if (Object.keys(errs).length) { this._paintErrors(true); return; }
    const payload = { service: clone(svc), start: new Date(+slot.start), end: new Date(+slot.end), details: { ...this._details } };
    if (!this.emit('book', payload)) return;
    this._busy = true; this._bookError = ''; this._render();
    try {
      if (isFn(this.onBook)) await this.onBook(payload);
      this._booking = payload; this._step = 'done';
      this.emit('booked', { booking: payload });
      announce(this.t('booking.confirmedTitle'));
    } catch (err) {
      this._bookError = (err && err.message) || this.t('booking.bookError');
    } finally { this._busy = false; this._render(); }
  }
  _paintErrors(focus) {
    const form = this.querySelector('.o-booking-form');
    if (!form) return;
    $$('.o-field', form).forEach(f => {
      const input = $('input,textarea', f), name = input?.name, err = name && this._fieldErrors[name];
      f.classList.toggle('is-invalid', !!err);
      const em = $('.o-error', f); if (em) em.textContent = err || '';
    });
    if (focus) $('.o-field.is-invalid input, .o-field.is-invalid textarea', form)?.focus();
  }

  /* ── public API ──────────────────────────────────────────────────── */
  reset() { this._step = 'pick'; this._slot = null; this._details = {}; this._fieldErrors = {}; this._bookError = ''; this._booking = null; this._render(); }
  gotoStep(step) { if (['pick', 'details', 'done'].includes(step)) { this._step = step; this._render(); } }
  getBooking() { return this._booking ? clone(this._booking) : null; }
  downloadICS() {
    const b = this._booking; if (!b) return;
    bkDownloadIcs({ title: b.service?.title || 'Appointment', start: b.start, end: b.end, location: this.location, description: b.details?.notes, organizer: this.organizer, attendeeEmail: b.details?.email, attendeeName: b.details?.name });
  }

  _act(act, b, e) {
    if (act === 'back') { this._step = this._step === 'done' ? 'pick' : 'pick'; this._render(); }
    else if (act === 'change') { this._step = 'pick'; this._render(); }
    else if (act === 'prev-month' || act === 'next-month') { this._month = date.add(this._month, act === 'prev-month' ? -1 : 1, 'M'); this._render(); }
    else if (act === 'ics') this.downloadICS();
    else if (act === 'again') this.reset();
  }

  /* ── render ──────────────────────────────────────────────────────── */
  _render() {
    if (!this._setupDone) return;
    const svc = this._service();
    this.classList.toggle('is-step-pick', this._step === 'pick');
    this.classList.toggle('is-step-details', this._step === 'details');
    this.classList.toggle('is-step-done', this._step === 'done');
    this.head.replaceChildren(...this._renderHead(svc));
    this.body.replaceChildren(this._step === 'pick' ? this._renderPick(svc) : this._step === 'details' ? this._renderDetails(svc) : this._renderDone(svc));
  }
  _renderHead(svc) {
    const out = [];
    if (this._step === 'pick') {
      const list = this._serviceList();
      if (list.length > 1) {
        out.push(h('div', { class: 'o-booking-svcs', role: 'radiogroup', 'aria-label': this.t('booking.service') }, list.map(s => h('button', {
          type: 'button', class: ['o-booking-svc', String(s.id) === String(svc.id) && 'is-active'], 'data-id': s.id, 'aria-pressed': String(s.id) === String(svc.id)
        }, h('span', { class: 'o-booking-svc-title' }, s.title), h('span', { class: 'o-booking-svc-dur' }, this.t('booking.duration', { count: +s.duration || this.slotMinutes }))))));
      } else if (list.length === 1) {
        out.push(h('div', { class: 'o-booking-svc1' }, h('strong', null, svc.title), h('span', { class: 'o-booking-svc-dur' }, this.t('booking.duration', { count: +svc.duration || this.slotMinutes }))));
      }
      out.push(h('div', { class: 'o-booking-tz' }, icon('clock', { size: 14 }), this.t('booking.timezone', { tz: this._tz })));
    } else if (this._step === 'details') {
      out.push(h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm o-booking-back', 'data-act': 'back' }, icon('chevron-left'), this.t('booking.back')));
      out.push(this._summaryChip(svc));
    }
    return out;
  }
  _summaryChip(svc) {
    const s = this._slot;
    return h('div', { class: 'o-booking-summary' },
      h('div', { class: 'o-booking-summary-main' },
        h('strong', null, svc.title || this.t('booking.selectService')),
        h('span', null, s ? calFmtLike(this._loc, s.start, s.end) : '')),
      h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', 'data-act': 'change' }, this.t('booking.change')));
  }

  _renderPick(svc) {
    const wrap = h('div', { class: 'o-booking-pick' });
    wrap.append(this._renderCalendar(), this._renderSlots(svc));
    return wrap;
  }
  _renderCalendar() {
    const loc = this._loc, ws = this._ws, m = this._month, today = bkSod(new Date());
    const start = bkAddDays(m, -((m.getDay() - ws + 7) % 7));
    const id = uid('bk-cal');
    const wd = Array.from({ length: 7 }, (_, i) => date.format(bkAddDays(start, i), 'ddd', loc));
    const grid = h('div', { class: 'o-booking-calgrid', role: 'grid', 'aria-labelledby': id },
      h('div', { class: 'o-booking-calrow is-head', role: 'row' }, wd.map(w => h('span', { class: 'o-booking-wd', role: 'columnheader' }, w))));
    for (let w = 0; w < 6; w++) {
      const row = h('div', { class: 'o-booking-calrow', role: 'row' });
      for (let i = 0; i < 7; i++) {
        const d = bkAddDays(start, w * 7 + i), other = d.getMonth() !== m.getMonth();
        const disabled = other || !this._dayInRange(d);
        row.append(h('button', {
          type: 'button', class: ['o-booking-day', other && 'is-other', +d === +today && 'is-today', +d === +this._selDate && 'is-selected', disabled && 'is-disabled'],
          role: 'gridcell', 'data-date': bkKey(d), disabled: disabled || null, tabindex: disabled ? '-1' : '0', 'aria-current': +d === +today ? 'date' : null, 'aria-selected': String(+d === +this._selDate),
        }, String(d.getDate())));
      }
      grid.append(row);
    }
    return h('div', { class: 'o-booking-cal' },
      h('div', { class: 'o-booking-cal-head' },
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'prev-month', 'aria-label': this.t('booking.prev') }, icon('chevron-left')),
        h('span', { class: 'o-booking-cal-title', id }, date.format(m, 'MMMM YYYY', loc)),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm', 'data-act': 'next-month', 'aria-label': this.t('booking.next') }, icon('chevron-right'))),
      grid);
  }
  _renderSlots(svc) {
    const loc = this._loc, h12 = date.uses12h(loc);
    const box = h('div', { class: 'o-booking-slots' }, h('h3', { class: 'o-booking-slots-title' }, date.format(this._selDate, 'dddd, MMMM D', loc)));
    if (this._slotLoading) { box.append(h('div', { class: 'o-booking-slot-loading' }, h('span', { class: 'o-spinner o-spinner-sm' }), this.t('booking.loading'))); return box; }
    if (this._slotError) {
      box.append(h('div', { class: 'o-empty o-empty-sm is-error' }, h('div', { class: 'o-empty-icon' }, icon('alert-circle')), h('p', { class: 'o-empty-text' }, this._slotError),
        h('div', { class: 'o-empty-actions' }, h('button', { type: 'button', class: 'o-btn o-btn-sm o-btn-outline-danger', onClick: () => { this._loadDay(this._selDate); this._render(); } }, this.t('booking.retry')))));
      return box;
    }
    const slots = this._slotResult || [];
    if (!slots.length) { box.append(h('div', { class: 'o-empty o-empty-sm' }, h('div', { class: 'o-empty-icon' }, icon('calendar')), h('p', { class: 'o-empty-title' }, this.t('booking.noSlots')), h('p', { class: 'o-empty-text' }, this.t('booking.noSlotsHint')))); return box; }
    const groups = bkGroup(slots);
    for (const key of ['morning', 'afternoon', 'evening']) {
      if (!groups[key].length) continue;
      box.append(h('div', { class: 'o-booking-slot-group' },
        h('h4', { class: 'o-booking-slot-h' }, this.t('booking.' + key)),
        h('div', { class: 'o-booking-slot-list' }, groups[key].map(s => h('button', {
          type: 'button', class: ['o-booking-slot', this._slot && +this._slot.start === +s.start && 'is-selected'],
          'data-slot': JSON.stringify({ start: s.start.toISOString(), end: s.end.toISOString() }),
        }, date.format(s.start, h12 ? 'h:mm A' : 'HH:mm', loc))))));
    }
    return box;
  }

  _renderDetails(svc) {
    const wrap = h('div', { class: 'o-booking-details' });
    const fields = toArr(this.fields);
    const field = (name, label, type, ph, extra) => !fields.includes(name) ? null : h('div', { class: 'o-field', 'data-f': name },
      h('label', { class: ['o-label', (name === 'name' || name === 'email') && 'is-required'], for: 'bk-' + name }, label),
      type === 'textarea' ? h('textarea', { class: 'o-textarea', id: 'bk-' + name, name, placeholder: ph, rows: 3, ...extra }, this._details[name] || '')
        : h('input', { class: 'o-input', id: 'bk-' + name, name, type: type || 'text', placeholder: ph, value: this._details[name] || '', ...extra }),
      h('div', { class: 'o-error' }));
    const form = h('form', { class: 'o-booking-form', novalidate: true },
      field('name', this.t('booking.name'), 'text', this.t('booking.namePh'), { required: true, autocomplete: 'name' }),
      field('email', this.t('booking.email'), 'email', this.t('booking.emailPh'), { required: true, autocomplete: 'email' }),
      field('phone', this.t('booking.phone'), 'tel', this.t('booking.phonePh'), { autocomplete: 'tel' }),
      field('notes', this.t('booking.notes'), 'textarea', this.t('booking.notesPh')),
      this._bookError ? h('div', { class: 'o-alert o-alert-danger o-booking-error', role: 'alert' }, icon('alert-circle'), h('div', { class: 'o-alert-content' }, this._bookError)) : null,
      h('div', { class: 'o-booking-form-actions' },
        h('button', { type: 'submit', class: ['o-btn o-btn-primary', this._busy && 'is-loading'], disabled: this._busy || null }, this._busy ? this.t('booking.confirming') : this.t('booking.confirm'))));
    wrap.append(form);
    queueMicrotask(() => this._paintErrors());
    return wrap;
  }

  _renderDone(svc) {
    const b = this._booking;
    if (!b) return h('div', { class: 'o-booking-done' });
    const loc = this._loc;
    return h('div', { class: 'o-booking-done' },
      h('div', { class: 'o-booking-done-icon' }, icon('check-circle')),
      h('h3', { class: 'o-booking-done-title' }, this.t('booking.confirmedTitle')),
      h('p', { class: 'o-booking-done-text' }, b.details.email ? this.t('booking.confirmedText', { email: b.details.email }) : ''),
      h('div', { class: 'o-booking-done-card' },
        h('strong', null, b.service.title || ''),
        h('span', null, calFmtLike(loc, b.start, b.end)),
        this.location ? h('span', { class: 'o-booking-done-loc' }, icon('map-pin', { size: 14 }), this.location) : null),
      h('div', { class: 'o-booking-done-actions' },
        h('button', { type: 'button', class: 'o-btn o-btn-outline-primary', 'data-act': 'ics' }, icon('download'), this.t('booking.addToCalendar')),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost', 'data-act': 'again' }, this.t('booking.bookAnother'))));
  }
}
/** "Wed, Sep 16 · 10:00 – 10:30 AM" */
function calFmtLike(loc, s, e) {
  const h12 = date.uses12h(loc);
  const day = date.format(s, 'ddd, MMM D', loc);
  const t1 = date.format(s, h12 ? 'h:mm A' : 'HH:mm', loc), t2 = date.format(e, h12 ? 'h:mm A' : 'HH:mm', loc);
  return `${day} · ${t1} – ${t2}`;
}
define('o-booking', OBooking);
O.Booking = OBooking;
O.booking = (el, config = {}) => { const host = $(el); const b = host && host.localName === 'o-booking' ? host : h('o-booking'); Object.assign(b, config); if (host && host !== b) host.append(b); return b; };
