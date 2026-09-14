/* docs-gaps-calendar.js — docs/components/calendar.html "Programmatic factory — Orion.calendar()" demo.
 * Proves the factory-built <o-calendar> is a real, working instance: the seeded event renders as a real
 * clickable chip (o-event-click fires), and the imperative API (addEvent/getEventById/removeEvent) works
 * against it.
 *   node build/check.mjs docs/components/calendar.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-calendar.js"
 */
(async () => {
  const cal = document.querySelector('#cal-factory-host o-calendar');
  if (!cal) return { ok: false, error: 'Orion.calendar() did not create an <o-calendar> inside the host' };
  await new Promise(r => setTimeout(r, 150));

  const chip = cal.querySelector('.o-calendar-ev');
  if (!chip) return { ok: false, error: 'seeded event did not render as a chip' };
  let clickDetail = null;
  cal.addEventListener('o-event-click', e => { clickDetail = e.detail; }, { once: true });
  chip.click();
  await new Promise(r => setTimeout(r, 80));
  const clickOk = !!clickDetail && clickDetail.event.title === 'Kickoff call';

  // Imperative API round trip on the factory-built instance.
  const added = cal.addEvent({ title: 'Scripted follow-up', start: new Date(Date.now() + 36e5), end: new Date(Date.now() + 72e5) });
  const addOk = !!added && !!cal.getEventById(added.id);
  const removed = cal.removeEvent(added.id);
  const removeOk = !!removed && !cal.getEventById(added.id);

  const ok = clickOk && addOk && removeOk;
  return { ok, clickOk, addOk, removeOk, clickDetailTitle: clickDetail && clickDetail.event.title };
})()
