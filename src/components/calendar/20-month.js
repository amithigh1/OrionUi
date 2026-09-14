/* ============================================================================
 * calendar: month view — ARIA grid of weeks; each week is a CSS grid where
 * day cells span every row and event bars sit on lanes (multi-day bars span
 * columns and continue across weeks). "+N more" opens a day popover.
 * ========================================================================== */

class CalMonth extends CalView {
  constructor(cal) {
    super(cal, 'month');
    this.el.addEventListener('keydown', e => this._key(e));
    this.el.addEventListener('click', e => this._click(e));
    this.el.addEventListener('focusin', e => { const c = e.target.closest?.('.o-calendar-day'); if (c) this._setFocus(date.parse(c.dataset.date), false); });
  }
  range(d) {
    const first = calD.monthStart(d), start = calD.weekStart(first, this.cal._ws);
    const weeks = this.cal.fixedWeeks ? 6 : Math.ceil((calD.days(start, first) + date.daysInMonth(first.getFullYear(), first.getMonth())) / 7);
    return { start, end: calD.add(start, weeks * 7), weeks, month: first };
  }
  title(r) { return calF(r.month, { month: 'long', year: 'numeric' }, this.cal._loc); }

  render(occs, r) {
    const cal = this.cal, loc = cal._loc, today = calD.sod(new Date());
    this.r = r;
    if (!this._focus || this._focus < r.start || this._focus >= r.end) this._focus = calD.same(cal._date, r.month) || (cal._date >= r.start && cal._date < r.end) ? calD.sod(cal._date) : r.month;
    const grid = h('div', { class: ['o-calendar-month', cal.weekNumbers && 'has-weeknums'], role: 'grid', 'aria-label': this.title(r), 'aria-readonly': cal.editable ? null : 'true' });
    const head = h('div', { class: 'o-calendar-mhead', role: 'row' });
    for (let i = 0; i < 7; i++) {
      const d = calD.add(r.start, i);
      head.append(h('div', { class: ['o-calendar-mhead-cell', (d.getDay() === 0 || d.getDay() === 6) && 'is-weekend'], role: 'columnheader', 'aria-label': calF(d, { weekday: 'long' }, loc) },
        h('span', { class: 'o-calendar-wd-short', 'aria-hidden': 'true' }, calF(d, { weekday: 'short' }, loc)), h('span', { class: 'o-calendar-wd-narrow', 'aria-hidden': 'true' }, calF(d, { weekday: 'narrow' }, loc))));
    }
    grid.append(head);
    const body = h('div', { class: 'o-calendar-mbody' });
    grid.append(body);
    this.rows = [];
    for (let w = 0; w < r.weeks; w++) {
      const ws = calD.add(r.start, w * 7);
      const row = h('div', { class: 'o-calendar-mweek', role: 'row' });
      row.__start = ws;
      for (let i = 0; i < 7; i++) {
        const d = calD.add(ws, i), key = calD.key(d), isToday = +d === +today, other = d.getMonth() !== r.month.getMonth();
        const cell = h('div', {
          class: ['o-calendar-day', other && 'is-other', isToday && 'is-today', (d.getDay() === 0 || d.getDay() === 6) && 'is-weekend', cal._isPast(d) && 'is-past'],
          role: 'gridcell', 'data-date': key, tabindex: +d === +this._focus ? '0' : '-1', 'aria-current': isToday ? 'date' : null,
        }, h('span', { class: 'o-calendar-daynum', 'aria-hidden': 'true', title: cal._hasView('day') ? cal.t('calendar.goToDay', { date: calF(d, { dateStyle: 'long' }, loc) }) : null }, d.getDate() === 1 && !isToday ? calF(d, { month: 'short', day: 'numeric' }, loc) : String(d.getDate())));
        cell.style.gridColumn = String(i + 1);
        row.append(cell);
      }
      if (cal.weekNumbers) row.append(h('span', { class: 'o-calendar-weeknum', 'aria-hidden': 'true', title: cal.t('calendar.week', { n: date.weekNumber(calD.add(ws, 3)) }) }, String(date.weekNumber(calD.add(ws, 3)))));
      body.append(row);
      this.rows.push(row);
    }
    this.el.replaceChildren(grid);
    this.grid = grid;
    // measure how many lanes fit (first row, before events are placed)
    const probe = this.rows[0], cs = getComputedStyle(probe), rem = parseFloat(getComputedStyle(doc.documentElement).fontSize) || 16;
    const laneH = (parseFloat(cs.getPropertyValue('--o-calendar-lane')) || 1.375) * rem + 2, headH = (parseFloat(cs.getPropertyValue('--o-calendar-dayhead')) || 1.875) * rem;
    const rowH = probe.getBoundingClientRect().height || 110;
    const max = cal.dayMaxEvents;
    const limit = isNum(+max) && max !== '' && max !== null && max !== true && max !== 'auto' && max !== false ? Math.max(1, +max) : max === false ? Infinity : Math.max(2, Math.floor((rowH - headH - 2) / laneH));
    for (const row of this.rows) {
      const res = calRowSegments(occs, row.__start, 7, { limit });
      const evs = h('div', { class: 'o-calendar-mweek-evs', role: 'presentation' });
      const lanes = calPlaceSegments(cal, evs, res, row.__start);
      row.style.setProperty('--lanes', String(Math.max(lanes + (res.hidden.some(Boolean) ? 1 : 0), 1)));
      row.append(evs);
      res.per.forEach((n, i) => {
        const cell = row.children[i], d = calD.add(row.__start, i);
        cell.setAttribute('aria-label', calF(d, { dateStyle: 'full' }, loc) + (n ? ', ' + cal.t('calendar.events', { count: n }) : ''));
        cell.classList.toggle('has-events', n > 0);
      });
    }
  }
  _cell(d) { return d && this.el.querySelector(`.o-calendar-day[data-date="${calD.key(d)}"]`); }
  _setFocus(d, focus = true) {
    this._focus = calD.sod(d);
    this.el.querySelectorAll('.o-calendar-day[tabindex="0"]').forEach(c => c.setAttribute('tabindex', '-1'));
    const c = this._cell(d);
    if (c) { c.setAttribute('tabindex', '0'); if (focus) c.focus({ preventScroll: false }); }
    return c;
  }
  focusDate(d) {
    const day = calD.sod(d);
    if (this.r && day >= this.r.start && day < this.r.end) { this._setFocus(day); return; }
    this._focus = day;
    this.cal._goto(day, true).then(() => this._setFocus(day));
  }
  _key(e) {
    const cell = e.target.closest('.o-calendar-day');
    if (!cell || e.target !== cell) return;
    const cal = this.cal, d = date.parse(cell.dataset.date);
    const nd = calGridKey(e, d, cal._ws, isRTL(cal));
    if (nd) { e.preventDefault(); this.focusDate(nd); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cal.selectable) cal._select({ start: d, end: calD.add(d, 1), allDay: true, anchor: cell, source: 'keyboard' });
      else if (cal._hasView('day')) cal.changeView('day', d);
    }
  }
  _click(e) {
    const cal = this.cal;
    const more = e.target.closest('.o-calendar-more');
    if (more) { e.stopPropagation(); calMorePopover(cal, more, date.parse(more.dataset.date)); return; }
    const num = e.target.closest('.o-calendar-daynum');
    if (num && cal._hasView('day') && !cal._dragJustEnded()) { e.stopPropagation(); cal.changeView('day', date.parse(num.parentElement.dataset.date)); }
  }
  hit(x, y) {
    if (!this.rows) return null;
    const rtl = isRTL(this.cal);
    for (const row of this.rows) {
      const r = row.getBoundingClientRect();
      if (y < r.top || y >= r.bottom) continue;
      let col = Math.floor(((x - r.left) / r.width) * 7);
      if (rtl) col = 6 - col;
      return { date: calD.add(row.__start, clamp(col, 0, 6)), allDay: true, day: true };
    }
    return null;
  }
  mirror(p) {
    this.clearMirror();
    if (!p) return;
    const s = calD.sod(p.start), e = p.allDay ? calD.add(p.end, -1) : calD.sod(new Date(+p.end - 1));
    this.el.querySelectorAll('.o-calendar-day').forEach(c => { const d = date.parse(c.dataset.date); if (d >= s && d <= e) c.classList.add(p.kind === 'select' ? 'is-sel' : 'is-drop'); });
  }
  clearMirror() { this.el.querySelectorAll('.o-calendar-day.is-sel, .o-calendar-day.is-drop').forEach(c => c.classList.remove('is-sel', 'is-drop')); }
}
