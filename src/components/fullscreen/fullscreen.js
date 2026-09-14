/* Orion.fullscreen — Fullscreen API with a CSS "pseudo fullscreen" fallback (iOS, blocked requests, no user gesture).
 *   await Orion.fullscreen.enter(el = document.documentElement, { pseudo: false, navigationUI: 'hide' }) -> true/false
 *   await Orion.fullscreen.exit() · await Orion.fullscreen.toggle(el) -> active?
 *   Orion.fullscreen.isActive · .element · .pseudo · .supported · onChange(({ active, element, pseudo }) => …) -> off()
 *   <button data-o-action="fullscreen" data-o-target="#panel" aria-label="Fullscreen"><o-icon name="maximize"></o-icon></button>
 *     the trigger's maximize/minimize icon, aria-pressed and label follow the state. Escape leaves pseudo fullscreen.
 *   CSS: .o-is-fullscreen (the element, native or pseudo) · html.o-has-fullscreen
 */
const __fsEv = new Emitter();
let __pseudo = null;   // { el, ov, unlock }
const __nativeEl = () => (isBrowser ? doc.fullscreenElement || doc.webkitFullscreenElement || null : null);
const __fsSupported = () => isBrowser && !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
let __lastFs = null;

function __fsNotify() {
  const el = fullscreen.element, active = !!el;
  if (__lastFs === el) return;
  if (__lastFs && __lastFs !== el) __lastFs.classList.remove('o-is-fullscreen');
  __lastFs = el;
  if (isBrowser) {
    el?.classList.add('o-is-fullscreen');
    doc.documentElement.classList.toggle('o-has-fullscreen', active);
    $$('[data-o-action="fullscreen"]').forEach(__fsPaint);
  }
  const d = { active, element: el, pseudo: !!__pseudo };
  __fsEv.emit('change', d);
  bus.emit('fullscreen:change', d);
  if (el) emit(el, 'o-fullscreen', d); else if (isBrowser) emit(doc, 'o-fullscreen', d);
}
function __enterPseudo(el) {
  if (__pseudo?.el === el) return true;
  __exitPseudo();
  const root = el === doc.documentElement || el === doc.body;
  el.classList.add('o-is-fullscreen');
  if (!root) el.classList.add('o-pseudo-fullscreen');
  if (!root && !el.hasAttribute('tabindex') && !focusables(el.parentElement || doc.body).includes(el)) { el.setAttribute('tabindex', '-1'); el.__oFsTab = true; }
  __pseudo = { el, z: el.style.zIndex };
  __pseudo.ov = overlays.open({ el, modal: false, outside: false, escape: true, trap: false, lockScroll: !root, onClose: () => { if (__pseudo?.el === el) __exitPseudo(true); } });
  if (!root && !el.contains(doc.activeElement)) el.focus({ preventScroll: true });
  return true;
}
function __exitPseudo(fromOverlay = false) {
  const p = __pseudo;
  if (!p) return;
  __pseudo = null;
  p.el.classList.remove('o-is-fullscreen', 'o-pseudo-fullscreen');
  p.el.style.zIndex = p.z || '';
  if (p.el.__oFsTab) { p.el.removeAttribute('tabindex'); delete p.el.__oFsTab; }
  if (!fromOverlay) p.ov?.close('api');
  __fsNotify();
}

const fullscreen = {
  get supported() { return __fsSupported(); },
  get element() { return __pseudo?.el || __nativeEl(); },
  get isActive() { return !!fullscreen.element; },
  get pseudo() { return !!__pseudo; },
  /** enter(el, { pseudo, navigationUI }) — falls back to pseudo fullscreen when the API is missing or refused */
  async enter(target, { pseudo = false, navigationUI = 'hide' } = {}) {
    if (!isBrowser) return false;
    const el = $(target) || doc.documentElement;
    if (fullscreen.element === el) return true;
    if (fullscreen.isActive) await fullscreen.exit();
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const gesture = !navigator.userActivation || navigator.userActivation.isActive;
    if (!pseudo && __fsSupported() && req && gesture) {
      try { await req.call(el, { navigationUI }); __fsNotify(); return true; } catch { /* refused -> pseudo */ }
    }
    __enterPseudo(el);
    __fsNotify();
    return true;
  },
  async exit() {
    if (!isBrowser) return;
    if (__pseudo) { __exitPseudo(); return; }
    if (__nativeEl()) { try { await (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); } catch {} }
    __fsNotify();
  },
  async toggle(target, opts) {
    const el = $(target) || (isBrowser ? doc.documentElement : null);
    if (fullscreen.element === el || (fullscreen.isActive && !target)) { await fullscreen.exit(); return false; }
    return fullscreen.enter(el, opts);
  },
  onChange(fn) { return __fsEv.on('change', fn); },
};

function __fsPaint(trigger) {
  const target = targetOf(trigger) || doc.documentElement, active = fullscreen.element === target;
  trigger.setAttribute('aria-pressed', String(active));
  trigger.classList.toggle('is-active', active);
  const ic = trigger.querySelector('o-icon[name="maximize"], o-icon[name="minimize"]');
  if (ic) ic.setAttribute('name', active ? 'minimize' : 'maximize');
  else {
    const svgI = trigger.querySelector('.o-icon-maximize, .o-icon-minimize');
    if (svgI) svgI.replaceWith(iconEl(active ? 'minimize' : 'maximize'));
  }
  const label = active ? t('common.exitFullscreen') : t('common.fullscreen');
  if (!trigger.textContent.trim() || trigger.hasAttribute('aria-label')) trigger.setAttribute('aria-label', label);
  if (trigger.hasAttribute('title') || !trigger.textContent.trim()) trigger.title = label;
  const txt = trigger.querySelector('[data-o-fullscreen-label]');
  if (txt) txt.textContent = label;
}
action('fullscreen', (trigger, e, target) => { fullscreen.toggle(target || doc.documentElement).then(() => __fsPaint(trigger)); });

if (isBrowser) {
  on(doc, 'fullscreenchange webkitfullscreenchange', () => __fsNotify());
  ready(() => $$('[data-o-action="fullscreen"]').forEach(__fsPaint));
}
O.fullscreen = fullscreen;
