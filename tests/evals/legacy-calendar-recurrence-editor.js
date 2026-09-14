/* legacy-calendar-recurrence-editor.js — salvaged from .tmp/editor-test.js (docs/components/calendar.html).
 * Regression check: opening the recurrence editor for a "5th occurrence of the month" edge case (day 29,
 * which has no 5th-week wrap in most months) must not render a stray "null" in the monthly-recurrence UI.
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cal = document.getElementById('cal-team');
  cal.openEditor({ start: new Date(2026, 8, 29, 10, 0), end: new Date(2026, 8, 29, 11, 0) }); // day 29 -> nth=5, isLastWeek path
  await sleep(150);
  const rr = document.querySelector('o-recurrence-editor');
  rr.value = 'FREQ=MONTHLY';
  await sleep(50);
  const modeSel = rr.modeSel;
  modeSel.value = 'custom'; modeSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(50);
  const freqSel = rr.freqSel;
  freqSel.value = 'MONTHLY'; freqSel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(50);
  const monthWrapHTML = rr.monthWrap.innerHTML;
  const hasStrayNull = /(^|>)\s*null\s*(<|$)/.test(monthWrapHTML) || rr.monthWrap.textContent.includes('null');
  const dialogText = document.querySelector('.o-calendar-dialog, .o-modal')?.textContent || '';
  const dialogHasNull = /\bnull\b/.test(dialogText);
  const cancelBtn = [...document.querySelectorAll('.o-calendar-dialog button, .o-modal button')].find(b => /cancel/i.test(b.textContent));
  cancelBtn?.click();
  await sleep(50);
  const ok = !hasStrayNull && !dialogHasNull && monthWrapHTML.length > 0;
  return { ok, monthWrapHTML, hasStrayNull, dialogHasNull };
})()
