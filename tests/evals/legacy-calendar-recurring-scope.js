/* legacy-calendar-recurring-scope.js — salvaged from .tmp/scope-test2.js (docs/components/recurring-events.html).
 * Dragging one occurrence of a recurring event and choosing "this event" in the scope dialog must change
 * only that occurrence (an exception), not the whole series.
 *
 * FIX vs the original script: it hardcoded the week of 2026-09-08 (matching "today" when it was written).
 * The seeded event is a Mon-Fri weekly recurrence with no fixed end, but <o-calendar> defaults to showing
 * the CURRENT week — so once real time moved past that week, `[data-key^="standup2@2026-09-08"]` matched
 * nothing (confirmed by dumping the live keys: on 2026-09-13 they were standup2@2026-09-14..18) and the
 * whole test silently no-opped (captured stayed null). This version picks whichever two adjacent weekday
 * occurrences are actually rendered, so it stays correct regardless of which week is "current" when it runs.
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
  const cal = document.getElementById('rr-scope');
  await sleep(200);
  const chips = [...cal.querySelectorAll('.o-calendar-ev[data-key^="standup2@"]')]
    .map(el => ({ el, day: el.dataset.key.slice('standup2@'.length, 'standup2@'.length + 10) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (chips.length < 2) return { ok: false, error: 'fewer than 2 standup2 occurrences rendered', keys: [...cal.querySelectorAll('.o-calendar-ev')].map(e => e.dataset.key) };
  const from = chips[0], to = chips[1]; // two adjacent rendered weekdays, whatever the current week is
  const r1 = from.el.getBoundingClientRect(), r2 = to.el.getBoundingClientRect();
  const x1 = r1.left + r1.width / 2, y1 = r1.top + r1.height / 2;
  const x2 = r2.left + r2.width / 2;
  fire('pointerdown', x1, y1, from.el);
  fire('pointermove', x1 + 2, y1, document);
  fire('pointermove', x2, y1, document);
  fire('pointerup', x2, y1, document);
  await sleep(200);
  const scopeDialogOpen = !!document.querySelector('.o-calendar-scope');
  if (!scopeDialogOpen) return { ok: false, error: 'scope dialog did not open after drag', fromDay: from.day, toDay: to.day };
  const thisRadio = document.querySelector('input[value="this"]');
  thisRadio.click();
  let captured = null;
  cal.addEventListener('o-event-change', e => { captured = { scope: e.detail.scope, newStart: e.detail.event.start.toISOString() }; }, { once: true });
  const okBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK');
  okBtn.click();
  await sleep(200);

  const dayRange = (isoDatePrefix) => { const d = new Date(isoDatePrefix); return { start: d, end: new Date(+d + 864e5) }; };
  const fromEvents = cal.getEvents(dayRange(from.day));
  const toEvents = cal.getEvents(dayRange(to.day));
  const ok = !!captured && captured.scope === 'this'
    && !fromEvents.some(e => e.id === 'standup2' || e.recurringEventId === 'standup2')
    && toEvents.some(e => e.id === 'standup2' || e.recurringEventId === 'standup2');
  return { ok, captured, fromDay: from.day, toDay: to.day, fromCount: fromEvents.length, toTitles: toEvents.map(e => ({ title: e.title, start: e.start instanceof Date ? e.start.toISOString() : e.start, rrule: e.rrule })) };
})()
