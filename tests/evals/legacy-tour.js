/* legacy-tour.js — salvaged from .tmp/eval-tour.js (docs/components/tour.html).
 * Orion.tour(): popover highlight-hole rect matches the step's target, ArrowRight/ArrowLeft step
 * navigation, and Escape ends the tour.
 */
(async () => {
  const dispatchKey = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  document.getElementById('tour-start').click();
  await new Promise(r => setTimeout(r, 250));
  const popover = document.querySelector('.o-tour-popover');
  const hole = document.querySelector('.o-tour-hole');
  const results = [];
  const check = (label) => {
    const targetSel = ['#tour-target-kpi', '#tour-target-reports', '#tour-target-new', '#tour-target-help'];
    const activeIdx = [...document.querySelectorAll('.o-tour-dot')].findIndex(d => d.classList.contains('is-active'));
    const sel = targetSel[activeIdx - 1];
    let rectMatch = null;
    if (sel) {
      const t = document.querySelector(sel).getBoundingClientRect();
      const hx = +hole.getAttribute('x'), hy = +hole.getAttribute('y'), hw = +hole.getAttribute('width'), hh = +hole.getAttribute('height');
      rectMatch = Math.abs((hx + 8) - t.left) < 1 && Math.abs((hy + 8) - t.top) < 1 && Math.abs((hw - 16) - t.width) < 1 && Math.abs((hh - 16) - t.height) < 1;
    }
    results.push({ label, activeIdx, sel, rectMatch, popoverVisible: !!popover && !popover.hidden });
  };
  check('after start (welcome, no target)');
  dispatchKey(popover, 'ArrowRight'); await new Promise(r => setTimeout(r, 200));
  check('step 2 (kpi)');
  dispatchKey(popover, 'ArrowRight'); await new Promise(r => setTimeout(r, 200));
  check('step 3 (reports)');
  dispatchKey(popover, 'ArrowLeft'); await new Promise(r => setTimeout(r, 200));
  check('back to step 2 (kpi)');
  const isActiveDuringTour = Orion.tour.get('docs-dashboard-tour').isActive;
  dispatchKey(popover, 'Escape'); await new Promise(r => setTimeout(r, 300));
  const isActiveAfterEscape = Orion.tour.get('docs-dashboard-tour').isActive;

  const withTargets = results.filter(r => r.sel);
  const ok = isActiveDuringTour === true && isActiveAfterEscape === false
    && results.every(r => r.popoverVisible)
    && withTargets.length === 3 && withTargets.every(r => r.rectMatch === true);
  return { ok, results, isActiveDuringTour, isActiveAfterEscape };
})()
