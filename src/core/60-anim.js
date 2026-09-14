/* ============================================================================
 * core: animation & transitions (Web Animations API, respects reduced motion)
 *   animate(el, 'fadeIn' | keyframes, { duration, easing, delay }) -> Promise
 *   collapse(el, show?, { duration }) -> Promise<boolean>   (height animation, toggles [hidden])
 * ========================================================================== */

/** True when the OS asks for reduced motion OR the app forced it at runtime (`<html class="o-motion-reduce">`,
 *  set by <o-preferences>), so JS-driven animations respect the in-app preference as well as the media query. */
const reducedMotion = () => isBrowser && (
  (doc.documentElement && doc.documentElement.classList.contains('o-motion-reduce'))
  || (!!win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches));
const __x = (el, v) => (isRTL(el) ? -v : v);
const ANIMS = {
  fadeIn: [{ opacity: 0 }, { opacity: 1 }],
  fadeOut: [{ opacity: 1 }, { opacity: 0 }],
  zoomIn: [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
  zoomOut: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }],
  popIn: [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.02)', offset: 0.7 }, { opacity: 1, transform: 'none' }],
  slideInUp: [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
  slideOutDown: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }],
  slideInDown: [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
  slideOutUp: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }],
  slideInStart: el => [{ transform: `translateX(${__x(el, -100)}%)` }, { transform: 'none' }],
  slideOutStart: el => [{ transform: 'none' }, { transform: `translateX(${__x(el, -100)}%)` }],
  slideInEnd: el => [{ transform: `translateX(${__x(el, 100)}%)` }, { transform: 'none' }],
  slideOutEnd: el => [{ transform: 'none' }, { transform: `translateX(${__x(el, 100)}%)` }],
  slideInBottom: [{ transform: 'translateY(100%)' }, { transform: 'none' }],
  slideOutBottom: [{ transform: 'none' }, { transform: 'translateY(100%)' }],
  slideInTop: [{ transform: 'translateY(-100%)' }, { transform: 'none' }],
  slideOutTop: [{ transform: 'none' }, { transform: 'translateY(-100%)' }],
  shake: el => [0, -8, 8, -6, 6, -3, 3, 0].map(v => ({ transform: `translateX(${__x(el, v)}px)` })),
  pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
  bounce: [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)', offset: 0.4 }, { transform: 'translateY(0)', offset: 0.6 }, { transform: 'translateY(-4px)', offset: 0.8 }, { transform: 'translateY(0)' }],
  flash: [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }],
  highlight: [{ backgroundColor: 'color-mix(in srgb, var(--o-warning) 35%, transparent)' }, { backgroundColor: 'transparent' }],
};
const __running = new WeakMap();

/** animate(el, name | keyframes, opts) -> Promise<Animation|void>. Cancels the previous animation on el. */
function animate(el, name, opts = {}) {
  if (!el || !el.animate) return Promise.resolve();
  let frames = isStr(name) ? ANIMS[name] : name;
  if (isFn(frames)) frames = frames(el, opts);
  const duration = reducedMotion() ? 0 : (opts.duration ?? 200);
  if (!frames || !duration) return Promise.resolve();
  __running.get(el)?.cancel();
  const a = el.animate(frames, { duration, easing: opts.easing || 'cubic-bezier(.2,.8,.2,1)', delay: opts.delay || 0, fill: opts.fill || 'none', iterations: opts.iterations || 1 });
  __running.set(el, a);
  return a.finished.then(() => { if (__running.get(el) === a) __running.delete(el); return a; }, () => a);
}

/** collapse(el, show?, { duration }) — animate height open/closed; toggles the hidden attribute. */
function collapse(el, show, { duration = 220 } = {}) {
  if (!el) return Promise.resolve(false);
  const shown = !el.hidden;
  if (show == null) show = !shown;
  __running.get(el)?.cancel();
  if (reducedMotion() || !el.animate || (show && shown && !__running.has(el))) {
    el.hidden = !show;
    el.style.height = ''; el.style.overflow = '';
    return Promise.resolve(show);
  }
  const from = el.hidden ? 0 : el.getBoundingClientRect().height;
  el.hidden = false;
  el.style.height = '';
  const to = show ? el.scrollHeight : 0;
  el.style.overflow = 'hidden';
  const a = el.animate([{ height: from + 'px', opacity: show && from === 0 ? 0.4 : 1 }, { height: to + 'px', opacity: 1 }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
  __running.set(el, a);
  const done = () => { if (__running.get(el) === a) { __running.delete(el); el.style.overflow = ''; if (!show) el.hidden = true; } return show; };
  return a.finished.then(done, () => show);
}

/** CSS-class based enter/leave: transition(el, 'enter'|'leave', { name: 'o-fade' }) toggles name-enter-from/-active/-to. */
function transition(el, phase, { name = 'o-fade', duration } = {}) {
  return new Promise(resolve => {
    const from = `${name}-${phase}-from`, active = `${name}-${phase}-active`, to = `${name}-${phase}-to`;
    el.classList.add(from, active);
    if (phase === 'enter') el.hidden = false;
    requestAnimationFrame(() => {
      el.classList.remove(from); el.classList.add(to);
      const ms = reducedMotion() ? 0 : duration ?? (parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0);
      setTimeout(() => { el.classList.remove(active, to); if (phase === 'leave') el.hidden = true; resolve(); }, ms);
    });
  });
}

O.animate = animate;
O.collapse = collapse;
O.transition = transition;
O.anim = { presets: ANIMS, reducedMotion, animate, collapse, transition };
