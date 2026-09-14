// @deps navbar
/* Mega menu: full-width multi-column panel opened from a navbar item.
 *   <li class="o-navbar-item o-megamenu-item">
 *     <button class="o-navbar-link" data-o-megamenu-toggle aria-haspopup="true">Solutions <o-icon name="chevron-down" class="o-navbar-caret"></o-icon></button>
 *     <div class="o-megamenu">
 *       <div class="o-megamenu-inner">
 *         <div class="o-megamenu-col">
 *           <div class="o-megamenu-heading">Platform</div>
 *           <a class="o-megamenu-link" href="#"><o-icon name="chart-bar"></o-icon><span><strong>Analytics</strong><small>Understand usage</small></span></a>
 *         </div>
 *         <div class="o-megamenu-promo">…</div>
 *       </div>
 *     </div>
 *   </li>
 * Desktop (--o-megamenu-mode: full): floating full-width panel — hover-intent, click, keyboard.
 * Mobile (--o-megamenu-mode: collapsed, <992px): inline accordion (no overlay), for use inside a
 * navbar's collapsed drawer.
 * Events (on the toggle): o-open, o-close { reason }.
 */
const mmItemOf = el => el.closest('.o-megamenu-item');
const mmPanelOf = tg => tg.closest('.o-megamenu-item')?.querySelector(':scope > .o-megamenu') || null;
const mmMode = item => (getComputedStyle(item).getPropertyValue('--o-megamenu-mode').trim() || 'full');

let __open = null;    // { item, tg, panel, ov }
let __hoverT = 0;

function closeMega(reason = 'api', refocus = false) {
  clearTimeout(__hoverT);
  if (!__open) return;
  const { tg, ov } = __open;
  __open = null;
  ov ? ov.close(reason) : finishClose(tg, reason);
  if (refocus) tg.focus();
}
function finishClose(tg, reason) {
  const panel = mmPanelOf(tg); if (!panel) return;
  tg.setAttribute('aria-expanded', 'false');
  mmItemOf(tg)?.classList.remove('is-open');
  panel.hidden = true;
  emit(tg, 'o-close', { reason });
}
function openMega(tg, { focus = false } = {}) {
  const item = mmItemOf(tg), panel = mmPanelOf(tg);
  if (!item || !panel) return;
  if (__open && __open.tg === tg) { if (focus) focusFirst(panel, { preferAutofocus: false }); return; }
  closeMega('replaced');
  if (!panel.id) panel.id = uid('o-mm');
  tg.setAttribute('aria-controls', panel.id);
  tg.setAttribute('aria-expanded', 'true');
  item.classList.add('is-open');
  panel.hidden = false;
  if (!emit(tg, 'o-open')) { finishClose(tg, 'cancel'); return; }
  const offs = [
    on(panel, 'pointerenter', () => clearTimeout(__hoverT)),
    on(panel, 'pointerleave', e => { if (e.pointerType !== 'touch' && mmMode(item) === 'full') __hoverT = setTimeout(() => closeMega('leave'), 250); }),
  ];
  const ov = overlays.open({
    el: panel, owner: item, outside: true, escape: true, trap: false, lockScroll: false,
    onClose: reason => { offs.forEach(f => f()); finishClose(tg, reason); },
  });
  __open = { item, tg, panel, ov };
  animate(panel, 'slideInDown', { duration: 140 });
  if (focus) focusFirst(panel, { preferAutofocus: false });
}
/** Toggle (or force-open) the inline accordion version used inside a collapsed navbar drawer. */
function toggleAccordion(tg) {
  const panel = mmPanelOf(tg); if (!panel) return;
  const open = tg.getAttribute('aria-expanded') !== 'true';
  if (!panel.id) panel.id = uid('o-mm');
  tg.setAttribute('aria-controls', panel.id);
  tg.setAttribute('aria-expanded', String(open));
  mmItemOf(tg)?.classList.toggle('is-open', open);
  collapse(panel, open);
  emit(tg, open ? 'o-open' : 'o-close', open ? undefined : { reason: 'toggle' });
}

function linksOf(panel) { return $$('.o-megamenu-link, a, button', panel).filter(el => isVisible(el) && !el.disabled); }
function onKey(e, tg) {
  const item = mmItemOf(tg); if (!item) return;
  const desktop = mmMode(item) === 'full';
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    desktop ? (tg.getAttribute('aria-expanded') === 'true' ? closeMega('key', true) : openMega(tg, { focus: true })) : toggleAccordion(tg);
  } else if (e.key === 'ArrowDown' && desktop) { e.preventDefault(); openMega(tg, { focus: true }); }
  else if (e.key === 'Escape' && tg.getAttribute('aria-expanded') === 'true') { e.preventDefault(); desktop ? closeMega('escape', true) : toggleAccordion(tg); }
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && desktop) {
    const rtl = isRTL(tg), fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const items = $$('.o-navbar-link', tg.closest('.o-navbar-nav') || tg.parentElement);
    const i = items.indexOf(tg); if (i < 0) return;
    const to = items[(i + (e.key === fwd ? 1 : -1) + items.length) % items.length];
    if (to) { e.preventDefault(); closeMega('nav'); to.focus(); }
  }
}
function onPanelKey(e, el) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const panel = el.closest('.o-megamenu'); if (!panel) return;
  const items = linksOf(panel), i = items.indexOf(el);
  if (i < 0) return;
  e.preventDefault();
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}

if (isBrowser) ready(() => {
  on(doc, 'click', '[data-o-megamenu-toggle]', (e, tg) => {
    e.preventDefault();
    const item = mmItemOf(tg); if (!item) return;
    if (mmMode(item) === 'full') (tg.getAttribute('aria-expanded') === 'true' ? closeMega('toggle') : openMega(tg));
    else toggleAccordion(tg);
  });
  on(doc, 'keydown', '[data-o-megamenu-toggle]', onKey);
  on(doc, 'keydown', '.o-megamenu a, .o-megamenu button', onPanelKey);
  on(doc, 'pointerenter', '.o-megamenu-item', (e, item) => {
    if (e.pointerType === 'touch' || mmMode(item) !== 'full') return;
    const tg = item.querySelector(':scope > [data-o-megamenu-toggle]'); if (!tg) return;
    clearTimeout(__hoverT);
    __hoverT = setTimeout(() => openMega(tg), __open ? 0 : 100);
  }, { capture: true });
  on(doc, 'pointerleave', '.o-megamenu-item', (e, item) => {
    if (e.pointerType === 'touch' || mmMode(item) !== 'full') return;
    if (__open && __open.item === item) __hoverT = setTimeout(() => closeMega('leave'), 250);
    else clearTimeout(__hoverT);
  }, { capture: true });
  // resync mode on resize: force-close a floating panel left open while switching to mobile
  on(win, 'resize', rafThrottle(() => { if (__open && mmMode(__open.item) !== 'full') closeMega('resize'); }));
});

O.megamenu = { close: () => closeMega('api'), isOpen: () => !!__open };
