/* ============================================================================
 * core: overlay stack (modals, drawers, dropdowns, popovers, pickers, menus)
 *
 *   const ov = overlays.open({
 *     el,                 // the overlay element (already in the DOM)
 *     owner,              // trigger element (clicks on it are not "outside")
 *     onClose(reason),    // REQUIRED: hide the element. reason: 'escape'|'outside'|'parent'|'api'
 *     escape: true,       // Escape closes it (only the top-most overlay reacts)
 *     outside: true,      // pointerdown outside closes it
 *     modal: false,       // blocks outside-click from reaching overlays below
 *     trap: false,        // trap Tab focus inside el
 *     lockScroll: false,  // lock page scroll
 *     returnFocus: true,  // restore focus to the previously focused element
 *   });
 *   ov.close('api');      // always close through the handle -> onClose runs exactly once
 *
 * Overlays opened from inside another overlay are its children and close with it.
 * ========================================================================== */

const __stack = [];
const Z = { base: 1050, toast: 1200, tooltip: 1300 };
let __ovListening = false;

function __isChild(child, parent) { for (let p = child.parent; p; p = p.parent) if (p === parent) return true; return false; }
function __contains(entry, target) {
  if (!target) return false;
  if (entry.el.contains(target) || (entry.owner && entry.owner.contains?.(target))) return true;
  return __stack.some(c => c !== entry && __isChild(c, entry) && (c.el.contains(target) || c.owner?.contains?.(target)));
}
function __ovListen() {
  if (__ovListening || !isBrowser) return;
  __ovListening = true;
  doc.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    const top = __stack[__stack.length - 1];
    if (!top) return;
    if (top.escape) { e.preventDefault(); overlays.close(top, 'escape'); }
  });
  doc.addEventListener('pointerdown', e => {
    const target = e.composedPath ? e.composedPath()[0] : e.target;
    for (let i = __stack.length - 1; i >= 0; i--) {
      const entry = __stack[i];
      if (!entry) continue;
      if (__contains(entry, target)) break;
      if (entry.outside) overlays.close(entry, 'outside');
      if (entry.modal) break;
    }
  }, true);
}

const overlays = {
  stack: __stack,
  Z,
  open(o) {
    if (!o || !o.el) throw new Error('overlays.open: el required');
    const existing = __stack.find(e => e.el === o.el);
    if (existing) return existing.handle;
    const entry = { escape: true, outside: true, modal: false, trap: false, lockScroll: false, returnFocus: true, ...o };
    entry.prevFocus = isBrowser ? doc.activeElement : null;
    entry.parent = null;
    for (let i = __stack.length - 1; i >= 0; i--) {
      const p = __stack[i];
      if ((entry.owner && p.el.contains(entry.owner)) || p.el.contains(entry.el)) { entry.parent = p; break; }
    }
    __stack.push(entry);
    entry.z = Z.base + __stack.length * 2;
    entry.el.style.zIndex = String(entry.z + (o.zOffset || 0));
    if (entry.lockScroll) entry.unlock = lockScroll();
    if (entry.trap) entry.untrap = trapFocus(entry.el, { isActive: () => overlays.top(x => x.trap) === entry });
    __ovListen();
    entry.handle = { close: (reason = 'api') => overlays.close(entry, reason), entry, get open() { return __stack.includes(entry); } };
    bus.emit('overlay:open', entry);
    return entry.handle;
  },
  close(entry, reason = 'api') {
    if (!entry || entry.closed) return;
    const i = __stack.indexOf(entry);
    if (i < 0) return;
    for (const child of __stack.slice(i + 1).filter(c => __isChild(c, entry)).reverse()) overlays.close(child, 'parent');
    entry.closed = true;
    __stack.splice(__stack.indexOf(entry), 1);
    entry.unlock?.();
    entry.untrap?.();
    const active = doc.activeElement;
    const focusWasInside = !active || active === doc.body || entry.el.contains(active);
    try { entry.onClose?.(reason); } catch (e) { console.error('[Orion] overlay onClose failed:', e); }
    if (entry.returnFocus && focusWasInside && entry.prevFocus && entry.prevFocus.isConnected && reason !== 'outside') {
      try { entry.prevFocus.focus({ preventScroll: true }); } catch {}
    }
    bus.emit('overlay:close', entry, reason);
  },
  /** top([filter]) -> top-most entry (optionally matching filter) */
  top(filter) { for (let i = __stack.length - 1; i >= 0; i--) if (!filter || filter(__stack[i])) return __stack[i]; return null; },
  isOpen: el => __stack.some(e => e.el === el),
  closeAll(reason = 'api') { [...__stack].reverse().forEach(e => overlays.close(e, reason)); },
};
O.overlays = overlays;

/** The shared portal container (<div id="o-portal"> in <body>). */
function portalRoot() {
  let r = doc.getElementById('o-portal');
  if (!r) { r = h('div', { id: 'o-portal', class: 'o-portal' }); doc.body.appendChild(r); }
  return r;
}
/**
 * portal(el, from) — move a floating element to the portal root (or into an open native <dialog>
 * containing `from`, so it stays in the top layer). Copies text direction and theme scope from `from`.
 */
function portal(el, from) {
  const dlg = from && from.closest ? from.closest('dialog[open]') : null;
  (dlg || portalRoot()).appendChild(el);
  if (from && from.nodeType === 1) inheritContext(el, from);
  return el;
}
/** Copy dir + theme scope (data-theme / .o-theme-dark / .o-theme-light) from an element. */
function inheritContext(el, from) {
  const d = dirOf(from);
  if (d !== dirOf(doc.documentElement)) el.setAttribute('dir', d); else el.removeAttribute('dir');
  el.classList.remove('o-theme-dark', 'o-theme-light');
  const scope = from.closest('.o-theme-dark, .o-theme-light, [data-theme-scope]');
  if (scope) el.classList.add(scope.classList.contains('o-theme-dark') || scope.getAttribute('data-theme-scope') === 'dark' ? 'o-theme-dark' : 'o-theme-light');
}
O.portal = portal;
