/* ============================================================================
 * calendar: year overview — twelve mini months with heat dots (event density).
 * One roving focus across the year; arrows / PageUp / PageDown; Enter opens the day.
 * ========================================================================== */

class CalYear extends CalView {
  constructor(cal) {
    super(cal, 'year');
    this.el.addEventListener('keydown', e => this._key(e));
    this.el.addEventListener('click', e => {
      const m = e.target.closest('.o-calendar-ym-title');
      if (m) { this.cal.changeView(this.cal._hasView('month') ? 'month' : 'list', date.parse(m.dataset.date)); return; }
      const c = e.target.closest('.o-calendar-yd');
      if (c) this._open(date.parse(c.dataset.date), c);
    });
  }
  range(d) { const y = d.getFullYear(); return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }; }
  title(r) { return calF(r.start, { year: 'numeric' }, this.cal._loc); }
  render(occs, r) {
    const cal = this.cal, loc = cal._loc, ws = cal._ws, todayKey = calD.key(new Date());
    const counts = new Map();
    for (const o of occs) {
      let d = o.start < r.start ? r.start : calD.sod(o.start);
      const end = o.end > r.end ? r.end : o.end;
      for (let g = 0; d < end && g < 400; g++, d = calD.add(d, 1)) counts.set(calD.key(d), (counts.get(calD.key(d)) || 0) + 1);
    }
    this.counts = counts;
    if (!this._focus || this._focus < r.start || this._focus >= r.end) this._focus = calD.sod(cal._date >= r.start && cal._date < r.end ? cal._date : r.start);
    const wrap = h('div', { class: 'o-calendar-year' });
    const wd = Array.from({ length: 7 }, (_, i) => calD.add(calD.weekStart(r.start, ws), i));
    for (let m = 0; m < 12; m++) {
      const first = new Date(r.start.getFullYear(), m, 1), start = calD.weekStart(first, ws);
      const id = uid('cal-ym');
      const grid = h('div', { class: 'o-calendar-ym-grid', role: 'grid', 'aria-labelledby': id },
        h('div', { class: 'o-calendar-ym-row is-head', role: 'row' }, wd.map(d => h('span', { class: 'o-calendar-ym-wd', role: 'columnheader', 'aria-label': calF(d, { weekday: 'long' }, loc) }, calF(d, { weekday: 'narrow' }, loc)))));
      for (let w = 0; w < 6; w++) {
        const row = h('div', { class: 'o-calendar-ym-row', role: 'row' });
        for (let i = 0; i < 7; i++) {
          const d = calD.add(start, w * 7 + i);
          if (d.getMonth() !== m) { row.append(h('span', { class: 'o-calendar-yd is-out', role: 'gridcell', 'aria-hidden': 'true' })); continue; }
          const key = calD.key(d), n = counts.get(key) || 0, lv = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
          row.append(h('span', {
            class: ['o-calendar-yd', lv && 'lv-' + lv, key === todayKey && 'is-today', (d.getDay() === 0 || d.getDay() === 6) && 'is-weekend'],
            role: 'gridcell', 'data-date': key, tabindex: +d === +this._focus ? '0' : '-1', 'aria-current': key === todayKey ? 'date' : null,
            'aria-label': calF(d, { dateStyle: 'full' }, loc) + (n ? ', ' + cal.t('calendar.events', { count: n }) : ''),
            title: calF(d, { weekday: 'short', day: 'numeric', month: 'short' }, loc) + (n ? ' · ' + cal.t('calendar.events', { count: n }) : ''),
          }, String(d.getDate())));
        }
        grid.append(row);
      }
      wrap.append(h('div', { class: 'o-calendar-ym' }, h('button', { type: 'button', class: 'o-calendar-ym-title', id, 'data-date': calD.key(first) }, calF(first, { month: 'long' }, loc)), grid));
    }
    this.el.replaceChildren(wrap);
  }
  _open(d, cell) {
    const cal = this.cal;
    if ((this.counts?.get(calD.key(d)) || 0) > 0) calMorePopover(cal, cell, d);
    else if (cal.selectable) cal._select({ start: d, end: calD.add(d, 1), allDay: true, anchor: cell, source: 'click' });
    else if (cal._hasView('day')) cal.changeView('day', d);
  }
  focusDate(d) {
    const day = calD.sod(d), c = this.el.querySelector(`.o-calendar-yd[data-date="${calD.key(day)}"]`);
    if (c) { this.el.querySelectorAll('.o-calendar-yd[tabindex="0"]').forEach(x => x.setAttribute('tabindex', '-1')); c.setAttribute('tabindex', '0'); c.focus(); this._focus = day; return; }
    this._focus = day;
    this.cal._goto(day, true).then(() => this.focusDate(day));
  }
  _key(e) {
    const c = e.target.closest?.('.o-calendar-yd');
    if (!c || !c.dataset.date) return;
    const d = date.parse(c.dataset.date), nd = calGridKey(e, d, this.cal._ws, isRTL(this.cal));
    if (nd) { e.preventDefault(); this.focusDate(nd); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._open(d, c); }
  }
}
