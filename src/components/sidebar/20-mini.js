/* Sidebar mini mode (icons only): hover/focus tooltip labels and fly-out submenus.
 * Both float next to the sidebar edge (core place/autoPlace with a live virtual reference).
 *   Orion.sidebar.flyout(toggle, { focus })   open a fly-out for a group toggle
 *   Orion.sidebar.closeFlyout(refocus)
 */
let __tip = null, __fly = null, __flyT = 0;
const __edgeRef = (link) => {
  const sb = link.closest('.o-sidebar') || link, rtl = isRTL(link);
  return {
    rtl,
    ref: {
      getBoundingClientRect() {
        const s = sb.getBoundingClientRect(), r = link.getBoundingClientRect(), x = rtl ? s.left : s.right;
        return { left: x, right: x, top: r.top, bottom: r.bottom, width: 0, height: r.height, x, y: r.top };
      },
    },
  };
};
const __miniLink = el => {
  const link = el?.closest?.('.o-sidebar .o-menu-link');
  return link && !link.closest('.o-sidebar-flyout') && O.sidebar.isMini(link.closest('.o-sidebar')) ? link : null;
};

function showTip(link) {
  if (!__tip) __tip = h('div', { class: 'o-sidebar-tip', 'aria-hidden': 'true' });
  const badge = link.querySelector('.o-menu-badge')?.textContent.trim();
  __tip.replaceChildren(O.sidebar._labelOf(link), badge ? h('span', { class: 'o-sidebar-tip-badge' }, badge) : '');
  portal(__tip, link);
  __tip.hidden = false;
  const { ref, rtl } = __edgeRef(link);
  place(__tip, ref, { placement: 'end', offset: 8, rtl, flip: false });
}
function hideTip() { if (__tip) __tip.hidden = true; }

function closeFlyout(refocus) {
  clearTimeout(__flyT);
  if (!__fly) return;
  const { tg, ov } = __fly;
  __fly = null; ov.close('api');
  if (refocus) tg.focus();
}
function openFlyout(tg, { focus = false, toggle = false } = {}) {
  clearTimeout(__flyT);
  if (__fly && __fly.tg === tg) { if (toggle) closeFlyout(); else if (focus) focusFirst(__fly.el); return; }
  closeFlyout();
  const sub = O.sidebar._subOf(tg); if (!sub) return;
  hideTip();
  const label = O.sidebar._labelOf(tg);
  const list = sub.cloneNode(true);
  list.hidden = false; list.removeAttribute('id'); list.style.cssText = '';
  $$('[id]', list).forEach(x => x.removeAttribute('id'));
  $$('[aria-controls]', list).forEach(x => x.removeAttribute('aria-controls'));
  const el = h('div', { class: 'o-sidebar-flyout o-floating', role: 'group', 'aria-label': label },
    h('div', { class: 'o-sidebar-flyout-title', 'aria-hidden': 'true' }, label), list);
  portal(el, tg);
  const was = tg.getAttribute('aria-expanded') || 'false';
  tg.setAttribute('aria-expanded', 'true');
  tg.classList.add('is-flyout');
  const { ref, rtl } = __edgeRef(tg);
  const unplace = autoPlace(el, ref, { placement: 'end-start', offset: 6, rtl, size: true });
  const offs = [
    on(el, 'pointerenter', () => clearTimeout(__flyT)),
    on(el, 'pointerleave', e => { if (e.pointerType !== 'touch') __flyT = setTimeout(closeFlyout, 220); }),
    on(el, 'click', 'a[href]', () => setTimeout(() => closeFlyout(), 0)),
    on(el, 'focusout', e => { if (e.relatedTarget && !el.contains(e.relatedTarget) && e.relatedTarget !== tg) closeFlyout(); }),
  ];
  const ov = overlays.open({
    el, owner: tg,
    onClose: () => {
      offs.forEach(f => f()); unplace(); el.remove();
      tg.setAttribute('aria-expanded', was); tg.classList.remove('is-flyout');
      if (__fly && __fly.el === el) __fly = null;
    },
  });
  __fly = { el, tg, ov };
  animate(el, 'zoomIn', { duration: 120 });
  if (focus) focusFirst(el, { preferAutofocus: false });
}

if (isBrowser) ready(() => {
  on(doc, 'pointerover', e => {
    if (e.pointerType === 'touch') return;
    const link = __miniLink(e.target); if (!link) return;
    if (e.relatedTarget && link.contains(e.relatedTarget)) return;
    clearTimeout(__flyT);
    if (link.classList.contains('o-menu-toggle')) __flyT = setTimeout(() => openFlyout(link), __fly ? 0 : 90);
    else { if (__fly) __flyT = setTimeout(closeFlyout, 220); showTip(link); }
  });
  on(doc, 'pointerout', e => {
    const link = __miniLink(e.target); if (!link || (e.relatedTarget && link.contains(e.relatedTarget))) return;
    hideTip();
    if (link.classList.contains('o-menu-toggle') && __fly?.tg === link && !__fly.el.contains(e.relatedTarget)) { clearTimeout(__flyT); __flyT = setTimeout(closeFlyout, 220); }
  });
  on(doc, 'focusin', e => { const link = __miniLink(e.target); if (link && link.matches(':focus-visible')) showTip(link); else hideTip(); });
  on(doc, 'focusout', e => { if (__miniLink(e.target)) hideTip(); });
  on(doc, 'o-sidebar-toggle', () => { hideTip(); closeFlyout(); });
  on(win, 'scroll', e => { if (__tip && !__tip.hidden && e.target?.closest?.('.o-sidebar')) hideTip(); }, { capture: true, passive: true });
});

O.sidebar.flyout = openFlyout;
O.sidebar.closeFlyout = closeFlyout;
