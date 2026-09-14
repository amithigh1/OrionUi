/* legacy-calendar-dnd.js — salvaged from .tmp/dnd-test.js (docs/components/calendar.html).
 * Pointer drag-and-drop across the three calendar views that support it: month-view drag-select,
 * week-view drag-move of a timed event, and week-view drag-resize (end handle).
 */
(async () => {
  const out = {};
  const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 1) Month view drag-select
  {
    const cal = document.getElementById('cal-team');
    cal.changeView('month');
    await sleep(80);
    const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const c1 = cal.querySelector(`.o-calendar-day[data-date="${key(new Date(2026, 8, 15))}"]`);
    const c2 = cal.querySelector(`.o-calendar-day[data-date="${key(new Date(2026, 8, 17))}"]`);
    const r1 = c1.getBoundingClientRect(), r2 = c2.getBoundingClientRect();
    let captured = null;
    cal.addEventListener('o-select-range', e => { captured = { start: e.detail.start.toISOString(), end: e.detail.end.toISOString(), allDay: e.detail.allDay }; e.preventDefault(); }, { once: true });
    const x1 = r1.left + r1.width / 2, y1 = r1.top + r1.height / 2, x2 = r2.left + r2.width / 2, y2 = r2.top + r2.height / 2;
    fire('pointerdown', x1, y1, c1);
    fire('pointermove', x1 + 2, y1, document);
    fire('pointermove', x2, y2, document);
    fire('pointerup', x2, y2, document);
    await sleep(80);
    out.monthDragSelect = captured;
  }

  // 2) Week view: drag-move a timed event
  {
    const cal = document.getElementById('cal-dnd');
    cal.changeView('week');
    await sleep(80);
    const chip = cal.querySelector('.o-calendar-ev.is-timed');
    const r = chip.getBoundingClientRect();
    let captured = null;
    cal.addEventListener('o-event-change', e => { captured = { source: e.detail.source, oldStart: e.detail.oldEvent.start.toISOString(), newStart: e.detail.event.start.toISOString(), sameDuration: (+e.detail.event.end - +e.detail.event.start) === (+e.detail.oldEvent.end - +e.detail.oldEvent.start) }; }, { once: true });
    const x = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const dy = Math.max(60, r.height * 2);
    fire('pointerdown', x, y0, chip);
    fire('pointermove', x, y0 + 2, document);
    fire('pointermove', x, y0 + dy, document);
    fire('pointerup', x, y0 + dy, document);
    await sleep(80);
    out.weekDragMove = captured;
  }

  // 3) Week view: drag-resize (end handle)
  {
    const cal = document.getElementById('cal-dnd');
    await sleep(50);
    const chip = cal.querySelector('.o-calendar-ev.is-timed');
    const handle = chip.querySelector('.o-calendar-resize.is-end');
    let captured = null;
    cal.addEventListener('o-event-change', e => { captured = { source: e.detail.source, oldStart: e.detail.oldEvent.start.toISOString(), oldEnd: e.detail.oldEvent.end.toISOString(), newStart: e.detail.event.start.toISOString(), newEnd: e.detail.event.end.toISOString() }; }, { once: true });
    const hr = handle.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    const x = hr.left + hr.width / 2, y0 = hr.top + hr.height / 2;
    const dy = Math.max(40, cr.height);
    fire('pointerdown', x, y0, handle);
    fire('pointermove', x, y0 + 2, document);
    fire('pointermove', x, y0 + dy, document);
    fire('pointerup', x, y0 + dy, document);
    await sleep(80);
    out.weekDragResize = captured;
  }

  const ok = !!(out.monthDragSelect && out.monthDragSelect.start && out.monthDragSelect.end)
    && !!(out.weekDragMove && out.weekDragMove.sameDuration && out.weekDragMove.newStart !== out.weekDragMove.oldStart)
    && !!(out.weekDragResize && out.weekDragResize.newEnd !== out.weekDragResize.oldEnd && out.weekDragResize.newStart === out.weekDragResize.oldStart);
  return { ok, ...out };
})()
