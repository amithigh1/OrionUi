/* legacy-checklist-hotspot.js — salvaged from .tmp/eval-checklist.js (docs/components/tour.html).
 * <o-checklist>: clicking a task fires o-task, complete() advances progress()/isDone(); a data-o-hotspot
 * beacon disappears once clicked and is remembered in localStorage so it does not reappear.
 *
 * FIX vs the original script: clicking the beacon only OPENS its tip popover (src/components/tour/
 * 30-hotspot.js `show()`); the beacon itself is removed only once that popover CLOSES (`onClosed` ->
 * `remove()`). The dismissal is persisted to localStorage as soon as it opens (that part of the original
 * assertion was already correct), but checking the beacon gone right after the click — with nothing ever
 * closing the popover — was never going to pass. Dismisses the popover (Escape) before checking removal.
 */
(async () => {
  const cl = document.getElementById('tour-checklist');
  const results = { initialProgress: cl.progress(), total: cl.total };
  let taskDetail = null;
  cl.addEventListener('o-task', e => { taskDetail = e.detail.task; }, { once: true });
  cl.querySelector('.o-checklist-item[data-id="report"]').click();
  await new Promise(r => setTimeout(r, 30));
  results.taskClickedId = taskDetail && taskDetail.id;
  cl.complete('report');
  await new Promise(r => setTimeout(r, 30));
  results.progressAfterOne = cl.progress();
  results.isDoneReport = cl.isDone('report');
  const beacon = document.querySelector('#tour-target-help .o-hotspot-beacon') || document.querySelector('.o-hotspot-beacon');
  results.beaconExists = !!beacon;
  beacon.click();
  await new Promise(r => setTimeout(r, 150));
  results.beaconStillPresentWhilePopoverOpen = document.body.contains(beacon);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 150));
  results.beaconGoneAfterClick = !document.body.contains(beacon) || beacon.isConnected === false;
  const dismissedList = JSON.parse(localStorage.getItem('orion:tour:hotspots-dismissed') || '[]');
  results.dismissedPersisted = dismissedList.length > 0;

  const ok = results.taskClickedId === 'report' && results.progressAfterOne > results.initialProgress
    && results.isDoneReport === true && results.beaconExists && results.beaconGoneAfterClick && results.dismissedPersisted;
  return { ok, ...results };
})()
