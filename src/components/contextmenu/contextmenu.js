// @deps dropdown
/* Context menu — Orion.contextMenu(targetElOrSelector, items | (event, targetEl) => items, opts) → off()
 *   Declarative: <tr data-o-context-menu="#rowMenu" tabindex="0"> (#rowMenu = <template> or an .o-dropdown-menu element)
 *   Opens at the pointer (flips inside the viewport), on touch long-press, and from the keyboard
 *   (ContextMenu key / Shift+F10 at the focused element). Uses the dropdown renderer + controller (submenus, keyboard).
 *   Events on the target element: o-open (cancelable), o-select { item, el, value, checked }, o-close { reason }.
 *   Shift + right-click keeps the native browser menu.
 */
const CM_REG = [];
let cmBound = false, cmIgnoreUntil = 0, cmLpT = 0, cmLpAt = 0, cmOpenCtl = null;

/** Innermost registered target (API registration or data-o-context-menu) containing node. */
function cmFind(node) {
  for (let n = node && node.nodeType === 3 ? node.parentElement : node; n && n.nodeType === 1; n = n.parentElement) {
    for (let i = CM_REG.length - 1; i >= 0; i--) {
      const r = CM_REG[i];
      let hit = false;
      try { hit = isStr(r.target) ? n.matches(r.target) : n === r.target; } catch {}
      if (hit) return { reg: r, el: n };
    }
    if (n.hasAttribute('data-o-context-menu')) return { decl: n.getAttribute('data-o-context-menu'), el: n };
  }
  return null;
}
function cmPoint(el) {
  const r = el.getBoundingClientRect(), rtl = isRTL(el);
  return { x: Math.round(rtl ? r.right - 12 : r.left + 12), y: Math.round(r.top + Math.min(r.height / 2, 24)) };
}
function cmMenuFrom(sel) {
  let src = null;
  try { src = doc.querySelector(sel); } catch {}
  if (!src) return null;
  if (src.localName === 'template') {
    const inner = src.content.querySelector('.o-dropdown-menu');
    if (inner) return { menu: inner.cloneNode(true), temp: true };
    const m = h('div', { class: 'o-dropdown-menu' });
    m.append(src.content.cloneNode(true));
    return { menu: m, temp: true };
  }
  return { menu: src.classList.contains('o-dropdown-menu') ? src : src.querySelector('.o-dropdown-menu') || src, temp: false };
}
/** Open the context menu for a hit at a viewport point. Returns true when a menu was opened. */
function cmOpen(hit, event, point, viaKey) {
  clearTimeout(cmLpT);
  const el = hit.el;
  const prev = doc.activeElement;
  const focusBack = el.tabIndex >= 0 || el.hasAttribute('tabindex') ? el : prev && prev !== doc.body ? prev : null;
  const common = { from: el, eventTarget: el, rtl: isRTL(el), focus: viaKey ? 'first' : 'menu', focusBack, matchWidth: false };
  if (hit.reg) {
    const o = hit.reg.opts || {};
    const items = isFn(hit.reg.items) ? hit.reg.items(event, el) : hit.reg.items;
    if (!items || (Array.isArray(items) && !items.length)) return false;
    if (emit(el, 'o-open', { event }).defaultPrevented) return false;
    cmOpenCtl?.close('switch');
    O.menu(point, items, {
      ...common, placement: o.placement || 'bottom-start', className: cls('o-context-menu', o.className), minWidth: o.minWidth,
      onSelect: (item, ev) => o.onSelect?.(item, el, ev), onClose: r => o.onClose?.(r, el),
    });
    const top = overlays.top(); // O.menu opened synchronously
    cmOpenCtl = top ? { close: r => overlays.close(top, r) } : null;
    try { o.onOpen?.(el); } catch (err) { console.error(err); }
    return true;
  }
  const res = cmMenuFrom(hit.decl);
  if (!res) return false;
  if (emit(el, 'o-open', { event, menu: res.menu }).defaultPrevented) return false;
  cmOpenCtl?.close('switch');
  res.menu.classList.add('o-context-menu');
  const ctl = O.menu.open(res.menu, { ...common, anchor: point, placement: 'bottom-start', onClose: () => { if (res.temp) res.menu.remove(); } });
  cmOpenCtl = ctl;
  return true;
}
function cmBind() {
  if (cmBound || !isBrowser) return;
  cmBound = true;
  let keyAt = 0;
  on(doc, 'contextmenu', e => {
    if (Date.now() < cmIgnoreUntil) { e.preventDefault(); return; }
    if (e.target.closest && e.target.closest('.o-dropdown-menu.is-open')) { e.preventDefault(); return; }
    if (e.shiftKey && e.button === 2) return;
    const hit = cmFind(e.target);
    if (!hit) return;
    const viaKey = Date.now() - keyAt < 500 || (e.button !== 2 && e.clientX === 0 && e.clientY === 0);
    const point = viaKey ? cmPoint(doc.activeElement && hit.el.contains(doc.activeElement) ? doc.activeElement : hit.el) : { x: e.clientX, y: e.clientY };
    if (cmOpen(hit, e, point, viaKey)) e.preventDefault();
  });
  on(doc, 'keydown', e => {
    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
    keyAt = Date.now();
    const a = doc.activeElement;
    const hit = a && a !== doc.body ? cmFind(a) : null;
    if (!hit) return;
    e.preventDefault();
    if (cmOpen(hit, e, cmPoint(a), true)) cmIgnoreUntil = Date.now() + 400;
  });
  on(doc, 'pointerdown', e => {
    clearTimeout(cmLpT);
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const hit = cmFind(e.target);
    if (!hit) return;
    const sx = e.clientX, sy = e.clientY;
    cmLpT = setTimeout(() => {
      done();
      if (cmOpen(hit, e, { x: sx, y: sy }, false)) { cmLpAt = Date.now(); cmIgnoreUntil = Date.now() + 800; try { if (navigator.userActivation?.isActive !== false) navigator.vibrate?.(8); } catch {} }
    }, 550);
    const offs = [
      on(doc, 'pointermove', ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { clearTimeout(cmLpT); done(); } }),
      on(doc, 'pointerup pointercancel', () => { clearTimeout(cmLpT); done(); }),
    ];
    const done = () => offs.splice(0).forEach(f => f());
  }, { capture: true, passive: true });
  // the click that ends a long-press must not activate the element under the finger
  on(doc, 'click', e => { if (Date.now() - cmLpAt < 700 && !(e.target.closest && e.target.closest('.o-dropdown-menu'))) { e.preventDefault(); e.stopPropagation(); cmLpAt = 0; } }, { capture: true });
}
if (isBrowser) ready(() => { if ($('[data-o-context-menu]')) cmBind(); });
behavior('data-o-context-menu', () => { cmBind(); });

/** Orion.contextMenu(target, items | (event, targetEl) => items, { placement, onSelect(item, targetEl, event), onOpen(targetEl), onClose, className, minWidth }) → off() */
O.contextMenu = function (target, items, opts = {}) {
  if (!isBrowser || !target) return noop;
  const reg = { target: isStr(target) ? target : $(target), items, opts };
  if (!reg.target) return noop;
  CM_REG.push(reg);
  cmBind();
  return () => { const i = CM_REG.indexOf(reg); if (i >= 0) CM_REG.splice(i, 1); };
};
