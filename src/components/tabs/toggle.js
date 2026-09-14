/* Plain-markup tabs (Bootstrap style), no custom element needed:
 *   <div class="o-nav o-nav-tabs" role="tablist">
 *     <button data-o-toggle="tab" data-o-target="#home" aria-selected="true">Home</button>
 *     <button data-o-toggle="tab" data-o-target="#more">More</button>
 *   </div>
 *   <div id="home">…</div><div id="more" hidden>…</div>
 * Adds tab/tabpanel roles, roving tabindex, arrow/Home/End keys (RTL aware) and hides inactive panes.
 * Events on the trigger: o-show (cancelable) {target, previous} · o-shown {target, previous}
 * API: Orion.tabShow(trigger)
 */

const TAB_SEL = '[data-o-toggle="tab"]';
const plainList = t => t.closest('[role=tablist], .o-nav') || t.parentElement;
const plainTabs = list => $$(TAB_SEL, list).filter(t => plainList(t) === list && !t.closest('o-tabs'));
const plainPane = t => { try { return targetOf(t); } catch { return null; } };

function plainInit(list) {
  const tabs = plainTabs(list);
  if (!tabs.length) return;
  list.setAttribute('role', 'tablist');
  const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true' || t.classList.contains('is-active')) || tabs[0];
  tabs.forEach(t => {
    const p = plainPane(t), on = t === cur;
    if (!t.id) t.id = uid('tab');
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(on));
    t.classList.toggle('is-active', on);
    t.tabIndex = on ? 0 : -1;
    if (!p) return;
    if (!p.id) p.id = uid('tabpanel');
    t.setAttribute('aria-controls', p.id);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', t.id);
    if (!p.hasAttribute('tabindex')) p.tabIndex = 0;
    p.hidden = !on;
  });
}

/** tabShow(trigger, { focus }) -> boolean — activate a plain-markup tab trigger. */
function tabShow(trigger, { focus = false } = {}) {
  trigger = $(trigger);
  if (!trigger || trigger.disabled) return false;
  const host = trigger.closest('o-tabs');
  if (host && isFn(host.select)) return host.select(trigger.getAttribute('aria-controls') || trigger.id, { focus });
  const list = plainList(trigger);
  if (list.getAttribute('role') !== 'tablist' || !trigger.hasAttribute('role')) plainInit(list);
  const tabs = plainTabs(list), prev = tabs.find(t => t.getAttribute('aria-selected') === 'true');
  if (prev === trigger) { if (focus) trigger.focus(); return true; }
  const target = plainPane(trigger);
  if (emit(trigger, 'o-show', { target, previous: prev || null }).defaultPrevented) return false;
  tabs.forEach(t => {
    const on = t === trigger, p = plainPane(t);
    t.setAttribute('aria-selected', String(on));
    t.classList.toggle('is-active', on);
    t.tabIndex = on ? 0 : -1;
    if (p) { p.hidden = !on; p.classList.toggle('is-active', on); }
  });
  if (target && !reducedMotion()) animate(target, 'fadeIn', { duration: 150 });
  if (focus) trigger.focus();
  emit(trigger, 'o-shown', { target, previous: prev || null });
  return true;
}

if (isBrowser) {
  action('tab', trigger => tabShow(trigger, { focus: true }));
  on(doc, 'keydown', TAB_SEL, (e, t) => {
    if (t.closest('o-tabs') || e.altKey || e.ctrlKey || e.metaKey) return;
    const list = plainList(t);
    const vert = list.getAttribute('aria-orientation') === 'vertical' || list.classList.contains('o-nav-vertical');
    const nav = new ListNav(list, { items: TAB_SEL, orientation: vert ? 'vertical' : 'horizontal', typeahead: false, activeClass: 'is-focus', onActivate: el => tabShow(el) });
    nav.index = nav.items.indexOf(t);
    nav.handle(e);
  });
  const scan = rafThrottle(() => { new Set($$(TAB_SEL + ':not([role])').filter(t => !t.closest('o-tabs')).map(plainList)).forEach(plainInit); });
  ready(() => {
    scan();
    new MutationObserver(muts => { if (muts.some(m => m.addedNodes.length)) scan(); }).observe(doc.body, { childList: true, subtree: true });
  });
}
O.tabShow = tabShow;
