/* legacy-booking-clinic.js — salvaged from .tmp/booking-test.js (docs/components/booking.html).
 * The declarative <o-booking id="bk-clinic"> demo (three services with different durations): picking a
 * longer service re-renders fewer/different slots, selecting a slot advances to the details step, and
 * submitting the contact form completes the booking. Complements the existing docs-gaps-booking.js,
 * which instead exercises the separate factory-built Orion.booking() instance on the same page.
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const bk = document.getElementById('bk-clinic');
  const day = bk.querySelector('.o-booking-day[data-date="2026-09-14"]'); // a Monday, within the working days
  day.click();
  await sleep(50);
  const slotsBefore = [...bk.querySelectorAll('.o-booking-slot')].map(b => b.textContent.trim());
  bk.querySelector('.o-booking-svc[data-id="dental"]').click(); // 45-minute service
  await sleep(50);
  const slotsDental = [...bk.querySelectorAll('.o-booking-slot')].map(b => b.textContent.trim());
  const firstSlot = bk.querySelector('.o-booking-slot');
  firstSlot.click();
  await sleep(50);
  const step2 = bk.classList.contains('is-step-details');
  bk.querySelector('#bk-name').value = 'Aisha Rahman';
  bk.querySelector('#bk-name').dispatchEvent(new Event('input', { bubbles: true }));
  bk.querySelector('#bk-email').value = 'aisha@example.com';
  bk.querySelector('#bk-email').dispatchEvent(new Event('input', { bubbles: true }));
  bk.querySelector('form.o-booking-form').requestSubmit();
  await sleep(700);
  const step3 = bk.classList.contains('is-step-done');
  const booking = bk.getBooking();

  const ok = slotsBefore.length > 0 && slotsDental.length > 0 && step2 === true && step3 === true
    && !!booking && booking.details?.name === 'Aisha Rahman' && booking.service?.id === 'dental';
  return { ok, slotsBefore: slotsBefore.slice(0, 4), slotsDental: slotsDental.slice(0, 4), step2, step3, booking };
})()
