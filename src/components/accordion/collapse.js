/* Collapse behaviour for any markup:
 *   <button data-o-toggle="collapse" data-o-target="#more">Details</button>   <div id="more" hidden>…</div>
 *   data-o-target may match several elements (".multi"). href="#id" works too.
 *   data-o-parent="#group" (on the target or the trigger): showing one hides the other targets inside #group.
 * Triggers get aria-expanded / aria-controls / .is-collapsed automatically.
 * Events on the target: o-show (cancelable) · o-shown · o-hide (cancelable) · o-hidden   detail: { trigger }
 * API: Orion.collapseToggle(el | selector, show?, { trigger }) -> Promise<boolean>
 */

const COL_SEL = '[data-o-toggle="collapse"]';
const colTargets = trigger => {
  const sel = trigger.getAttribute('data-o-target') || (trigger.getAttribute('href') || '').replace(/^[^#]*(?=#.)/, '');
  if (!sel || sel === '#') return [];
  try { return $$(sel); } catch { return []; }
};
const colShown = el => !el.hidden && !el.__oHiding;

function colSync(el, show) {
  $$(COL_SEL).forEach(t => {
    if (!colTargets(t).includes(el)) return;
    t.setAttribute('aria-expanded', String(show));
    t.classList.toggle('is-collapsed', !show);
  });
}
function colInit(t) {
  const targets = colTargets(t);
  if (!targets.length) return;
  targets.forEach(el => { if (!el.id) el.id = uid('collapse'); });
  t.setAttribute('aria-controls', targets.map(el => el.id).join(' '));
  const show = colShown(targets[0]);
  t.setAttribute('aria-expanded', String(show));
  t.classList.toggle('is-collapsed', !show);
  if (t.localName !== 'button' && !t.hasAttribute('role')) t.setAttribute('role', 'button');
}

/** collapseToggle(el, show?, { trigger }) — animated show/hide of any element (toggles [hidden]). */
function collapseToggle(el, show, { trigger = null } = {}) {
  el = $(el);
  if (!el) return Promise.resolve(false);
  const shown = colShown(el);
  if (show == null) show = !shown;
  if (show === shown) return Promise.resolve(show);
  if (emit(el, show ? 'o-show' : 'o-hide', { trigger }).defaultPrevented) return Promise.resolve(shown);
  if (show) {
    const psel = el.getAttribute('data-o-parent') || trigger?.getAttribute('data-o-parent');
    let parent = null;
    try { parent = psel ? el.closest(psel) || $(psel) : null; } catch {}
    if (parent) {
      const group = new Set($$('[data-o-parent]', parent).filter(x => x.getAttribute('data-o-parent') === psel && !x.matches(COL_SEL)));
      $$(COL_SEL, parent).filter(t => t.getAttribute('data-o-parent') === psel).forEach(t => colTargets(t).forEach(x => group.add(x)));
      group.forEach(x => { if (x !== el && colShown(x)) collapseToggle(x, false); });
    }
  }
  colSync(el, show);
  el.classList.toggle('is-open', show);
  el.__oHiding = !show;
  return collapse(el, show).then(() => {
    el.__oHiding = false;
    emit(el, show ? 'o-shown' : 'o-hidden', { trigger });
    return show;
  });
}

if (isBrowser) {
  action('collapse', trigger => {
    if (trigger.getAttribute('aria-controls') == null) colInit(trigger);
    colTargets(trigger).forEach(el => collapseToggle(el, undefined, { trigger }));
  });
  const scan = rafThrottle(() => $$(COL_SEL + ':not([aria-expanded])').forEach(colInit));
  ready(() => {
    scan();
    new MutationObserver(muts => { if (muts.some(m => m.addedNodes.length)) scan(); }).observe(doc.body, { childList: true, subtree: true });
  });
}
O.collapseToggle = collapseToggle;
