/* docs-gaps-booking.js — docs/components/booking.html "Programmatic factory — Orion.booking()" demo.
 * Proves the factory-built <o-booking> is a real, working instance: pick a weekday, pick a time slot, fill
 * contact details, submit, and confirm the booking completes (o-booked fires, getBooking() returns it).
 *   node build/check.mjs docs/components/booking.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-booking.js"
 */
(async () => {
  const frame = () => new Promise(r => setTimeout(r, 250));
  const bk = document.querySelector('#bk-factory-host o-booking');
  if (!bk) return { ok: false, error: 'Orion.booking() did not create an <o-booking> inside the host' };
  const servicesOk = Array.isArray(bk.services) && bk.services.length === 1 && bk.services[0].id === 'consult';

  const dayBtn = [...bk.querySelectorAll('.o-booking-day:not(.is-disabled)')].find(b => { const d = new Date(b.dataset.date); const wd = d.getDay(); return wd >= 1 && wd <= 5; });
  if (!dayBtn) return { ok: false, error: 'no enabled weekday to click', servicesOk };
  dayBtn.click();
  await frame();

  const slotBtn = bk.querySelector('.o-booking-slot:not(:disabled)');
  if (!slotBtn) return { ok: false, error: 'no time slot rendered for the picked weekday', servicesOk };
  slotBtn.click();
  await frame();

  const nameInput = bk.querySelector('.o-booking-form input[name="name"]');
  const emailInput = bk.querySelector('.o-booking-form input[name="email"]');
  if (!nameInput || !emailInput) return { ok: false, error: 'contact form fields not found', servicesOk };
  nameInput.value = 'Priya Sharma'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  emailInput.value = 'priya@example.com'; emailInput.dispatchEvent(new Event('input', { bubbles: true }));

  let bookedDetail = null;
  bk.addEventListener('o-booked', e => { bookedDetail = e.detail; }, { once: true });
  bk.querySelector('.o-booking-form-actions button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 500)); // onBook has a 300ms simulated delay

  const eventOk = !!bookedDetail && bookedDetail.booking.details.name === 'Priya Sharma' && bookedDetail.booking.service.id === 'consult';
  const apiOk = !!bk.getBooking() && bk.getBooking().details.email === 'priya@example.com';

  const ok = servicesOk && eventOk && apiOk;
  return { ok, servicesOk, eventOk, apiOk, booking: bk.getBooking() };
})()
