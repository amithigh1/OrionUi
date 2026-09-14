/* ============================================================================
 * calendar: time grid (week / day) — day headers, all-day lane row, scrolling
 * slot body with overlap column packing, business-hours shading, now line and
 * a keyboard slot cursor (arrows, Shift to extend, Enter to create).
 * ========================================================================== */

class CalTimeGrid extends CalView {
  constructor(cal, type) {
    super(cal, type);
    this.n = type === 'day' ? 1 : 7;
    this.el.addEventListener('keydown', e => this._key(e));
    this.el.addEventListener('click', e => this._click(e));
    this.el.addEventListener('focusin', e => { const s = e.target.closest?.('.o-calendar-slot'); if (s) this._labelSlot(s); });
  }
  range(d) { const s = this.n === 1 ? calD.sod(d) : calD.weekStart(d, this.cal._ws); return { start: s, end: calD.add(s, this.n) }; }
  title(r) {
    const loc = this.cal._loc;
    return this.n === 1 ? calF(r.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, loc) : calFmtRange(r.start, calD.add(r.end, -1), { day: 'numeric', month: 'short', year: 'numeric' }, loc);
  }
  get _span() { return this.cal._hi - this.cal._lo; }
  _pct(m) { return ((m - this.cal._lo) / this._span) * 100; }

  render(occs, r) {
    const cal = this.cal;
    const sig = [+r.start, cal._lo, cal._hi, cal.slotMinutes, cal._loc, cal._h12, JSON.stringify(cal.businessHours ?? null), calD.key(new Date()), cal.weekNumbers, cal.selectable, cal._ws].join('|');
    const rebuild = sig !== this._sig;
    const prevScroll = this.body ? this.body.scrollTop : null, sameRange = this.r && +this.r.start === +r.start;
    this.r = r;
    if (rebuild) { this._sig = sig; this._build(r); }
    this._renderAllDay(occs, r);
    this._renderTimed(occs);
    this._renderNow();
    if (rebuild) {
      requestAnimationFrame(() => this._syncScrollbar());
      if (prevScroll != null && sameRange) this.body.scrollTop = prevScroll;
      else if (prevScroll != null && prevScroll > 0) this.body.scrollTop = prevScroll;
      else this.scrollToTime(calTimeMin(cal.scrollTime, 480));
    }
  }
  _build(r) {
    const cal = this.cal, loc = cal._loc, today = calD.sod(new Date()), lo = cal._lo, hi = cal._hi, sm = cal.slotMinutes;
    this.days = Array.from({ length: this.n }, (_, i) => calD.add(r.start, i));
    const root = h('div', { class: ['o-calendar-tg', this.n === 1 && 'is-day'] });
    root.style.setProperty('--days', String(this.n));
    const head = h('div', { class: 'o-calendar-tg-head' },
      h('div', { class: 'o-calendar-tg-corner' }, cal.weekNumbers ? h('span', { class: 'o-calendar-tg-wk', title: cal.t('calendar.week', { n: date.weekNumber(calD.add(r.start, 3)) }) }, cal.t('calendar.weekShort', { n: date.weekNumber(calD.add(r.start, 3)) })) : null));
    for (const d of this.days) {
      const isToday = +d === +today, we = d.getDay() === 0 || d.getDay() === 6;
      const inner = [h('span', { class: 'o-calendar-tg-wd' }, calF(d, { weekday: 'short' }, loc)), h('span', { class: 'o-calendar-tg-dn' }, String(d.getDate()))];
      head.append(this.n > 1 && cal._hasView('day')
        ? h('button', { type: 'button', class: ['o-calendar-tg-dh', isToday && 'is-today', we && 'is-weekend'], 'data-date': calD.key(d), 'aria-label': cal.t('calendar.goToDay', { date: calF(d, { dateStyle: 'full' }, loc) }), 'aria-current': isToday ? 'date' : null }, inner)
        : h('div', { class: ['o-calendar-tg-dh', isToday && 'is-today', we && 'is-weekend'], 'data-date': calD.key(d), 'aria-current': isToday ? 'date' : null }, inner));
    }
    this.adGrid = h('div', { class: 'o-calendar-tg-adgrid' });
    const allday = h('div', { class: 'o-calendar-tg-allday' }, h('div', { class: 'o-calendar-tg-adlabel' }, cal.t('calendar.allDay')), this.adGrid);
    this.body = h('div', { class: 'o-calendar-tg-body o-scroll' });
    const inner = h('div', { class: 'o-calendar-tg-inner' });
    inner.style.setProperty('--slots', String(Math.ceil((hi - lo) / sm)));
    const times = h('div', { class: 'o-calendar-tg-times', 'aria-hidden': 'true' });
    for (let m = Math.ceil(lo / 60) * 60; m < hi; m += 60) times.append(h('span', { class: 'o-calendar-tg-time', style: `top:${this._pct(m)}%` }, calTime(calD.at(r.start, m), cal._h12, loc, true)));
    this.colsEl = h('div', { class: 'o-calendar-tg-cols' });
    this.cols = [];
    let cursorSet = false;
    const curMin = clamp(Math.floor(calTimeMin(cal.scrollTime, 480) / sm) * sm, lo, hi - sm);
    for (const d of this.days) {
      const isToday = +d === +today;
      const col = h('div', { class: ['o-calendar-col', isToday && 'is-today', (d.getDay() === 0 || d.getDay() === 6) && 'is-weekend'], 'data-date': calD.key(d), role: 'group', 'aria-label': calF(d, { dateStyle: 'full' }, loc) });
      for (const [s, e] of calOffRanges(cal._biz, d, lo, hi)) col.append(h('div', { class: 'o-calendar-off', style: `top:${this._pct(s)}%;height:${this._pct(e) - this._pct(s)}%` }));
      const slots = h('div', { class: 'o-calendar-slots' });
      for (let m = lo; m < hi; m += sm) {
        const cur = cal.selectable && !cursorSet && m === curMin && (isToday || (d === this.days[this.days.length - 1] && !this.days.some(x => +x === +today)));
        if (cur) cursorSet = true;
        slots.append(h('div', { class: ['o-calendar-slot', m % 60 === 0 && 'is-hour'], 'data-min': m, role: cal.selectable ? 'button' : null, tabindex: cal.selectable ? (cur ? '0' : '-1') : null }));
      }
      const evs = h('div', { class: 'o-calendar-col-evs' });
      col.append(slots, evs);
      col.__day = d; col.__evs = evs;
      this.colsEl.append(col);
      this.cols.push(col);
    }
    if (cal.selectable && !cursorSet) this.cols[0].querySelector(`.o-calendar-slot[data-min="${curMin}"]`)?.setAttribute('tabindex', '0');
    inner.append(times, this.colsEl);
    this.body.append(inner);
    root.append(head, allday, this.body);
    this.root = root; this.head = head;
    this.el.replaceChildren(root);
    const slot = this.colsEl.querySelector('.o-calendar-slot');
    this.pxm = (slot ? slot.getBoundingClientRect().height || 24 : 24) / sm;
  }
  _syncScrollbar() { if (this.root && this.body) this.root.style.setProperty('--sbw', (this.body.offsetWidth - this.body.clientWidth) + 'px'); }
  _renderAllDay(occs, r) {
    const cal = this.cal, grid = this.adGrid;
    grid.replaceChildren();
    for (let i = 0; i < this.n; i++) grid.append(h('div', { class: 'o-calendar-adcell', 'data-date': calD.key(this.days[i]), style: `grid-column:${i + 1}` }));
    const limit = this._adOpen ? Infinity : (isNum(+cal.allDayMaxRows) && cal.allDayMaxRows ? +cal.allDayMaxRows : 3);
    const res = calRowSegments(occs, r.start, this.n, { limit, barsOnly: true });
    const lanes = calPlaceSegments(cal, grid, res, r.start, { rowOffset: 1 });
    grid.style.setProperty('--lanes', String(lanes + (res.hidden.some(Boolean) ? 1 : 0)));
  }
  _renderTimed(occs) {
    const cal = this.cal, lo = cal._lo, hi = cal._hi, minVis = Math.ceil(22 / (this.pxm || 0.8));
    for (const col of this.cols) {
      col.__evs.replaceChildren();
      const d0 = col.__day, d1 = calD.add(d0, 1), items = [];
      for (const o of occs) {
        if (o.ev.allDay || o.end <= d0 || o.start >= d1) continue;
        const top = o.start <= d0 ? 0 : calD.mins(o.start), bot = o.end >= d1 ? 1440 : calD.mins(o.end);
        if (bot <= lo || top >= hi) continue;
        const t2 = clamp(top, lo, hi), b2 = clamp(bot, lo, hi);
        items.push({ o, top: t2, bot: Math.min(hi, Math.max(b2, t2 + minVis)), cs: o.start < d0 || top < lo, ce: o.end > d1 || bot > hi, dur: b2 - t2 });
      }
      calColumns(items);
      for (const it of items) {
        const o = it.o, px = it.dur * (this.pxm || 0.8), short = px < 40;
        const el = calEvEl(cal, o, { cls: ['is-timed', short && 'is-short', px < 24 && 'is-tiny', it.cs && 'is-cont-start', it.ce && 'is-cont-end', it.col > 0 && 'is-stacked'], timeText: calTimeText(cal, o, true), location: px > 64, resize: 'y', startHandle: !it.cs, endHandle: !it.ce });
        el.style.top = this._pct(it.top) + '%';
        el.style.height = (this._pct(it.bot) - this._pct(it.top)) + '%';
        el.style.setProperty('--l', String(it.col / it.cols));
        el.style.setProperty('--w', String(it.span / it.cols));
        col.__evs.append(el);
      }
    }
  }
  _renderNow() {
    this.nowEl?.remove(); this.nowEl = null;
    const cal = this.cal;
    if (!cal.nowIndicator || !this.cols) return;
    const now = new Date(), col = this.cols.find(c => calD.same(c.__day, now)), m = calD.mins(now);
    if (!col || m < cal._lo || m > cal._hi) return;
    this.nowEl = h('div', { class: 'o-calendar-now', style: `top:${this._pct(m)}%`, title: cal.t('calendar.now') + ' ' + calTime(now, cal._h12, cal._loc) });
    col.append(this.nowEl);
  }
  tick() { this._renderNow(); }
  scrollToTime(min) { if (this.body) this.body.scrollTop = Math.max(0, (this._pct(clamp(min, this.cal._lo, this.cal._hi)) / 100) * this.colsEl.offsetHeight - 8); }
  hit(x, y) {
    if (!this.cols) return null;
    const cal = this.cal, rtl = isRTL(cal), n = this.n;
    const colOf = (rect) => { let ci = Math.floor(((x - rect.left) / rect.width) * n); if (rtl) ci = n - 1 - ci; return clamp(ci, 0, n - 1); };
    const ar = this.adGrid.getBoundingClientRect();
    if (y >= ar.top && y < ar.bottom) return { date: this.days[colOf(ar)], allDay: true, day: true };
    const br = this.body.getBoundingClientRect(), cr = this.colsEl.getBoundingClientRect();
    if (y < ar.top) return null;
    const yy = clamp(y, br.top, br.bottom - 1), ci = colOf(cr), snap = cal._snap;
    let m = cal._lo + ((yy - cr.top) / cr.height) * this._span;
    m = clamp(cal._lo + Math.floor((m - cal._lo) / snap) * snap, cal._lo, cal._hi - snap);
    return { date: calD.at(this.days[ci], m), allDay: false, day: false, min: m };
  }
  mirror(p) {
    this.clearMirror();
    if (!p || !this.cols) return;
    const cal = this.cal;
    if (p.allDay) {
      const s = calD.sod(p.start), e = calD.add(p.end, -1);
      this.adGrid.querySelectorAll('.o-calendar-adcell').forEach(c => { const d = date.parse(c.dataset.date); if (d >= s && d <= e) c.classList.add(p.kind === 'select' ? 'is-sel' : 'is-drop'); });
      return;
    }
    for (const col of this.cols) {
      const d0 = col.__day, d1 = calD.add(d0, 1);
      if (p.end <= d0 || p.start >= d1) continue;
      const top = clamp(p.start <= d0 ? 0 : calD.mins(p.start), cal._lo, cal._hi), bot = clamp(p.end >= d1 ? 1440 : calD.mins(p.end), cal._lo, cal._hi);
      if (bot <= top) continue;
      const txt = calTime(p.start, cal._h12, cal._loc, true) + ' – ' + calTime(p.end, cal._h12, cal._loc, true);
      const el = p.kind === 'select'
        ? h('div', { class: 'o-calendar-selbox' }, h('span', null, txt))
        : h('div', { class: 'o-calendar-ev is-timed is-mirror' }, h('span', { class: 'o-calendar-ev-main' }, h('span', { class: 'o-calendar-ev-time' }, txt), h('span', { class: 'o-calendar-ev-title' }, p.ev?.title || '')));
      if (p.ev) calPaint(el, p.ev, cal.eventColor);
      el.style.top = this._pct(top) + '%';
      el.style.height = (this._pct(bot) - this._pct(top)) + '%';
      col.append(el);
    }
  }
  clearMirror() {
    this.el.querySelectorAll('.o-calendar-selbox, .o-calendar-ev.is-mirror').forEach(x => x.remove());
    this.el.querySelectorAll('.o-calendar-adcell.is-sel, .o-calendar-adcell.is-drop').forEach(c => c.classList.remove('is-sel', 'is-drop'));
  }
  _labelSlot(s) {
    const cal = this.cal, d = calD.at(s.closest('.o-calendar-col').__day, +s.dataset.min);
    s.setAttribute('aria-label', calFmtRange(d, new Date(+d + cal.slotMinutes * CAL_MIN), { dateStyle: 'full', timeStyle: 'short', hour12: cal._h12 }, cal._loc));
  }
  _slot(ci, m) { return this.cols[ci]?.querySelector(`.o-calendar-slot[data-min="${m}"]`); }
  _key(e) {
    const s = e.target.closest?.('.o-calendar-slot');
    if (!s || e.target !== s || e.altKey || e.ctrlKey || e.metaKey) return;
    const cal = this.cal, sm = cal.slotMinutes, lo = cal._lo, hi = cal._hi;
    const ci = this.cols.indexOf(s.closest('.o-calendar-col')), m = +s.dataset.min;
    let k = e.key;
    if (isRTL(cal) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    let nci = ci, nm = m;
    if (k === 'ArrowUp') nm = m - sm; else if (k === 'ArrowDown') nm = m + sm;
    else if (k === 'ArrowLeft') nci = ci - 1; else if (k === 'ArrowRight') nci = ci + 1;
    else if (k === 'Home') nm = lo; else if (k === 'End') nm = hi - sm;
    else if (k === 'PageUp') nm = m - 60; else if (k === 'PageDown') nm = m + 60;
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      const a = this._anchor && e.shiftKey !== undefined && this._sel ? this._sel : { start: calD.at(this.cols[ci].__day, m), end: calD.at(this.cols[ci].__day, m + sm) };
      this.clearMirror(); this._anchor = null; this._sel = null;
      cal._select({ start: a.start, end: a.end, allDay: false, anchor: s, source: 'keyboard' });
      return;
    } else if (k === 'Escape' && this._sel) { e.preventDefault(); this.clearMirror(); this._anchor = null; this._sel = null; return; } else return;
    e.preventDefault();
    nm = clamp(Math.round((nm - lo) / sm) * sm + lo, lo, hi - sm);
    if (nci < 0 || nci >= this.n) { const dir = nci < 0 ? -1 : 1; cal._goto(calD.add(this.cols[ci].__day, dir), true).then(() => this._focusSlot(dir < 0 ? this.n - 1 : 0, nm)); return; }
    if (e.shiftKey) {
      if (!this._anchor) this._anchor = { ci, m };
      const a = calD.at(this.cols[this._anchor.ci].__day, this._anchor.m), b = calD.at(this.cols[nci].__day, nm);
      this._sel = a <= b ? { start: a, end: new Date(+b + sm * CAL_MIN) } : { start: b, end: new Date(+a + sm * CAL_MIN) };
      this.mirror({ ...this._sel, kind: 'select' });
    } else { this._anchor = null; this._sel = null; this.clearMirror(); }
    this._focusSlot(nci, nm);
  }
  _focusSlot(ci, m) {
    const s = this._slot(ci, m);
    if (!s) return;
    this.el.querySelectorAll('.o-calendar-slot[tabindex="0"]').forEach(x => x.setAttribute('tabindex', '-1'));
    s.setAttribute('tabindex', '0');
    s.focus({ preventScroll: true });
    s.scrollIntoView({ block: 'nearest' });
  }
  focusDate(d) {
    const ci = this.days ? this.days.findIndex(x => calD.same(x, d)) : -1;
    if (ci >= 0 && this.cal.selectable) this._focusSlot(ci, +(this.el.querySelector('.o-calendar-slot[tabindex="0"]')?.dataset.min ?? this.cal._lo));
    else if (ci >= 0) (this.head.querySelectorAll('.o-calendar-tg-dh')[ci])?.focus?.();
  }
  _click(e) {
    const cal = this.cal;
    const more = e.target.closest('.o-calendar-more');
    if (more) { e.stopPropagation(); calMorePopover(cal, more, date.parse(more.dataset.date)); return; }
    const dh = e.target.closest('button.o-calendar-tg-dh');
    if (dh) cal.changeView('day', date.parse(dh.dataset.date));
  }
}
