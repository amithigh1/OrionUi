/* ============================================================================
 * calendar: mini-month navigator (sidebar). Highlights the visible range,
 * today, the focused date and days that have events. Keyboard: arrows,
 * PageUp/PageDown (month), Home/End, Enter jumps the main view.
 * ========================================================================== */

class CalMini {
  constructor(cal) {
    this.cal = cal;
    this.el = h('div', { class: 'o-calendar-mini' });
    this.el.addEventListener('click', e => {
      const b = e.target.closest('[data-nav]');
      if (b) { this.month = date.add(this.month, +b.dataset.nav, 'M'); this.render(); return; }
      const d = e.target.closest('.o-calendar-mini-day');
      if (d) { this.focus = date.parse(d.dataset.date); this.cal.gotoDate(this.focus); }
    });
    this.el.addEventListener('keydown', e => {
      const c = e.target.closest?.('.o-calendar-mini-day');
      if (!c) return;
      const d = date.parse(c.dataset.date), nd = calGridKey(e, d, this.cal._ws, isRTL(this.cal));
      if (nd) {
        e.preventDefault();
        this.focus = nd;
        if (nd.getMonth() !== this.month.getMonth() || nd.getFullYear() !== this.month.getFullYear()) this.month = calD.monthStart(nd);
        this.render();
        this.el.querySelector(`.o-calendar-mini-day[data-date="${calD.key(nd)}"]`)?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.cal.gotoDate(d); }
    });
  }
  render() {
    const cal = this.cal, loc = cal._loc, ws = cal._ws;
    if (!this.month || !this._follow || +calD.monthStart(cal._date) !== +this._follow) { this.month = calD.monthStart(cal._date); this._follow = +this.month; }
    const m = this.month, start = calD.weekStart(m, ws), end = calD.add(start, 42), r = cal._range || {};
    if (!this.focus || this.focus < start || this.focus >= end) this.focus = calD.sod(cal._date >= start && cal._date < end ? cal._date : m);
    const has = new Set();
    for (const o of cal._store.occurrences(start, end)) {
      let d = o.start < start ? start : calD.sod(o.start);
      for (let g = 0; d < o.end && d < end && g < 42; g++, d = calD.add(d, 1)) has.add(calD.key(d));
    }
    const focusHere = this.el.contains(doc.activeElement);
    const title = calF(m, { month: 'long', year: 'numeric' }, loc), id = uid('cal-mini');
    const grid = h('div', { class: 'o-calendar-mini-grid', role: 'grid', 'aria-labelledby': id },
      h('div', { class: 'o-calendar-mini-row', role: 'row' }, Array.from({ length: 7 }, (_, i) => { const d = calD.add(start, i); return h('span', { class: 'o-calendar-mini-wd', role: 'columnheader', 'aria-label': calF(d, { weekday: 'long' }, loc) }, calF(d, { weekday: 'narrow' }, loc)); })));
    for (let w = 0; w < 6; w++) {
      const row = h('div', { class: 'o-calendar-mini-row', role: 'row' });
      for (let i = 0; i < 7; i++) {
        const d = calD.add(start, w * 7 + i), key = calD.key(d);
        row.append(h('span', {
          class: ['o-calendar-mini-day', d.getMonth() !== m.getMonth() && 'is-other', calD.same(d, new Date()) && 'is-today', r.start && d >= r.start && d < r.end && 'is-range', calD.same(d, cal._date) && 'is-current', has.has(key) && 'has-events'],
          role: 'gridcell', 'data-date': key, tabindex: calD.same(d, this.focus) ? '0' : '-1', 'aria-selected': String(calD.same(d, cal._date)),
          'aria-label': calF(d, { dateStyle: 'full' }, loc),
        }, String(d.getDate())));
      }
      grid.append(row);
    }
    this.el.replaceChildren(
      h('div', { class: 'o-calendar-mini-head' },
        h('span', { class: 'o-calendar-mini-title', id }, title),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs', 'data-nav': '-1', 'aria-label': cal.t('calendar.prev') }, icon('chevron-left')),
        h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs', 'data-nav': '1', 'aria-label': cal.t('calendar.next') }, icon('chevron-right'))),
      grid);
    if (focusHere) this.el.querySelector('.o-calendar-mini-day[tabindex="0"]')?.focus();
  }
}
