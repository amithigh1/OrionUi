/* legacy-help-panel.js — salvaged from .tmp/eval-help3.js (docs/components/help.html).
 * Orion.help.whatsThis(true) inspect mode: clicking a data-o-help target opens the contextual article,
 * search() filters results, navigate()/back() move through article history, and close() hides the drawer.
 * Kept over .tmp/eval-help.js (fewer assertions — no navTitle/drawerHiddenAfterClose) and .tmp/eval-help2.js
 * (a pure debug dump of internal _history/_hindex state, no comparisons).
 */
(async () => {
  Orion.help.whatsThis(true);
  const inspectingOn = Orion.help.inspecting;
  const billingCard = document.querySelector('[data-o-help="billing"]');
  const hasOutlineClass = billingCard.classList.contains('o-help-target');
  billingCard.click();
  await new Promise(r => setTimeout(r, 400));
  const inspectingOff = Orion.help.inspecting;
  const panel = document.querySelector('o-help-panel');
  const panelOpen = panel.isOpen;
  const articleTitle = document.querySelector('.o-help-article h2')?.textContent || null;

  panel.search('payment');
  await new Promise(r => setTimeout(r, 250));
  const searchResults = [...document.querySelectorAll('.o-help-search-results .o-list-title')].map(x => x.textContent);

  panel.navigate('notifications');
  await new Promise(r => setTimeout(r, 80));
  const navTitle = document.querySelector('.o-help-article h2')?.textContent || null;
  panel.back();
  await new Promise(r => setTimeout(r, 80));
  const afterBackTitle = document.querySelector('.o-help-article h2')?.textContent || null;

  panel.close();
  await new Promise(r => setTimeout(r, 350));
  const closedAfter = panel.isOpen;
  const drawerHiddenAfterClose = document.querySelector('.o-help-drawer').hidden;

  const ok = inspectingOn === true && hasOutlineClass && inspectingOff === false && panelOpen === true && !!articleTitle
    && searchResults.length > 0 && !!navTitle && navTitle !== articleTitle && afterBackTitle === articleTitle
    && closedAfter === false && drawerHiddenAfterClose === true;
  return { ok, inspectingOn, hasOutlineClass, inspectingOff, panelOpen, articleTitle, searchResults, navTitle, afterBackTitle, closedAfter, drawerHiddenAfterClose };
})()
