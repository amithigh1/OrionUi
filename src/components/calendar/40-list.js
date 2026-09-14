/* ============================================================================
 * calendar: list / agenda view — events grouped by day (sticky day headers),
 * used automatically on narrow screens. Arrow keys move between events.
 * ========================================================================== */

class CalList extends CalView {
  constructor(cal) {
    super(cal, 'list');
    this.nav = new ListNav(this.el, { items: '.o-calendar-ev', orientation: 'vertical', loop: false, typeahead: false });
    this.el.addEventListener('keydown', e => { if (e.target.closest?.('.o-calendar-ev') && !e.altKey && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { this.nav.setItem(e.target.closest('.o-calendar-ev'), { focus: false }); this.nav.handle(e); } });
  }
  range(d) {
    const u = this.unit || this.cal.listRange || 'month', s = calD.sod(d);
    if (u === 'day') return { start: s, end: calD.add(s, 1), unit: 'day' };
    if (u === 'week') { const ws = calD.weekStart(s, this.cal._ws); return { start: ws, end: calD.add(ws, 7), unit: 'week' }; }
    if (isNum(+u) && +u > 0) return { start: s, end: calD.add(s, +u), unit: 'days', n: +u };
    const m = calD.monthStart(s);
    return { start: m, end: new Date(m.getFullYear(), m.getMonth() + 1, 1), unit: 'month' };
  }
  title(r) {
    const loc = this.cal._loc;
    if (r.unit === 'month') return calF(r.start, { month: 'long', year: 'numeric' }, loc);
    if (r.unit === 'day') return calF(r.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, loc);
    return calFmtRange(r.start, calD.add(r.end, -1), { day: 'numeric', month: 'short', year: 'numeric' }, loc);
  }
  render(occs, r) {
    const cal = this.cal, loc = cal._loc, today = calD.sod(new Date());
    const box = h('div', { class: 'o-calendar-list' });
    let any = false;
    for (let d = r.start; d < r.end; d = calD.add(d, 1)) {
      const d1 = calD.add(d, 1), list = occs.filter(o => o.start < d1 && o.end > d);
      if (!list.length) continue;
      any = true;
      const hid = uid('cal-lh'), isToday = +d === +today;
      const items = list.map(o => {
        let tt;
        if (o.ev.allDay) tt = cal.t('calendar.allDay');
        else if (o.start >= d && o.end <= d1) tt = calTimeText(cal, o, false);
        else if (o.start >= d) tt = calTime(o.start, cal._h12, loc) + ' –';
        else if (o.end <= d1) tt = '– ' + calTime(o.end, cal._h12, loc);
        else tt = cal.t('calendar.allDay');
        return h('li', null, calEvEl(cal, o, { cls: 'is-list', dot: true, timeText: tt, location: true }));
      });
      box.append(h('section', { class: ['o-calendar-lday', isToday && 'is-today'], 'aria-labelledby': hid, 'data-date': calD.key(d) },
        h('h3', { class: 'o-calendar-lday-h', id: hid },
          h('span', { class: 'o-calendar-lday-dn' }, String(d.getDate())),
          h('span', { class: 'o-calendar-lday-txt' }, h('span', { class: 'o-calendar-lday-wd' }, calF(d, { weekday: 'long' }, loc)), h('span', { class: 'o-calendar-lday-md' }, calF(d, { month: 'long', year: 'numeric' }, loc))),
          isToday ? h('span', { class: 'o-badge o-badge-soft-primary' }, cal.t('calendar.today')) : null),
        h('ul', { class: 'o-calendar-lday-items', role: 'list' }, items)));
    }
    if (!any) box.append(h('div', { class: 'o-empty o-empty-sm o-calendar-empty' }, h('div', { class: 'o-empty-icon' }, calIcon('calendar-days')), h('p', { class: 'o-empty-text' }, cal.t('calendar.noEvents'))));
    this.el.replaceChildren(box);
    this.nav.reset();
  }
  focusDate(d) { const sec = this.el.querySelector(`.o-calendar-lday[data-date="${calD.key(d)}"] .o-calendar-ev`); if (sec) sec.focus(); }
}
