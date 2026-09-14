/* Tooltip — delegated data-o-tooltip="text" | "auto" (only when truncated), data-o-tooltip-html (sanitized),
 * data-o-placement, data-o-tooltip-delay. One shared tooltip element (hover / keyboard focus / touch long-press).
 *   Orion.tooltip(el, text | { content, html, placement, trigger: 'hover'|'focus'|'click'|'manual', delay }) → { show, hide, update, destroy }
 */
const TIP_API = new WeakMap();
let __tip = null, __showT = 0, __hideT = 0, __lastHide = 0, __lpT = 0, __lpAt = 0;

const tipPlacement = p => (/^(top|bottom|left|right|start|end)(-(start|end))?$/.test(p || '') ? p : 'top');
const isTruncated = el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;

class Tip {
  constructor() {
    this.inner = h('div', { class: 'o-tooltip-inner' });
    this.arrow = h('span', { class: 'o-tooltip-arrow', 'aria-hidden': 'true' });
    this.el = h('div', { class: 'o-tooltip', role: 'tooltip', id: uid('tip'), hidden: true }, this.inner, this.arrow);
    this.el.style.zIndex = String(Z.tooltip);
    this.ref = null;
  }
  set(c) {
    if (c.node) this.inner.replaceChildren(c.node);
    else if (c.html != null) this.inner.innerHTML = c.html instanceof SafeHTML ? c.html.s : sanitize(c.html);
    else this.inner.textContent = c.text ?? '';
  }
  show(ref, c) {
    const same = this.ref === ref && !this.el.hidden;
    if (this.ref && this.ref !== ref) this.unlink();
    this.set(c);
    portal(this.el, ref);
    this.el.hidden = false;
    this.ref = ref;
    const label = ref.getAttribute('aria-label');
    if (!label || label !== (c.text ?? '')) {
      const ids = (ref.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(this.el.id)) ref.setAttribute('aria-describedby', [...ids, this.el.id].join(' '));
    }
    this._unplace?.();
    this._unplace = autoPlace(this.el, ref, { placement: tipPlacement(c.placement), offset: 8, padding: 6, arrow: this.arrow });
    if (!same) animate(this.el, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 120 });
    clearInterval(this._iv);
    this._iv = setInterval(() => { if (!ref.isConnected || !isVisible(ref)) this.hide(); }, 300);
  }
  unlink() {
    const r = this.ref;
    this.ref = null;
    if (!r) return;
    const ids = (r.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== this.el.id);
    if (ids.length) r.setAttribute('aria-describedby', ids.join(' ')); else r.removeAttribute('aria-describedby');
  }
  hide() {
    if (!this.ref && this.el.hidden) return;
    this.unlink();
    this.el.hidden = true;
    this._unplace?.(); this._unplace = null;
    clearInterval(this._iv);
    __lastHide = Date.now();
  }
}
const shared = () => __tip || (__tip = new Tip());

/** Content of a trigger: { text | html | node, placement, delay } or null. */
function tipContent(el) {
  const c = TIP_API.get(el);
  if (c) {
    const v = isFn(c.content) ? c.content(el) : c.content;
    if (v == null || v === '') return null;
    return { placement: c.placement, delay: c.delay, ...(v instanceof Node ? { node: v } : v instanceof SafeHTML || c.html ? { html: v } : { text: String(v) }) };
  }
  const html = el.getAttribute('data-o-tooltip-html');
  let text = el.getAttribute('data-o-tooltip');
  if (html == null && text === 'auto') { if (!isTruncated(el)) return null; text = el.textContent.trim(); }
  if (html == null && !text) return null;
  const delay = parseFloat(el.getAttribute('data-o-tooltip-delay'));
  return { text, html: html ?? undefined, placement: el.getAttribute('data-o-placement'), delay: Number.isNaN(delay) ? undefined : delay };
}
/** Nearest delegated trigger for an event target (mode: 'hover' | 'focus'). */
function tipTrigger(node, mode) {
  for (let n = node && node.nodeType === 3 ? node.parentElement : node; n && n.nodeType === 1; n = n.parentElement) {
    const c = TIP_API.get(n);
    if (c) return c.trigger === 'hover' || c.trigger === mode ? n : null;
    if (n.hasAttribute('data-o-tooltip') || n.hasAttribute('data-o-tooltip-html')) return n;
  }
  return null;
}
function schedShow(el, delay) {
  clearTimeout(__hideT); clearTimeout(__showT);
  const c0 = TIP_API.get(el);
  const base = delay ?? c0?.delay ?? parseFloat(el.getAttribute('data-o-tooltip-delay'));
  const d = Date.now() - __lastHide < 400 || (__tip && __tip.ref) ? 0 : Number.isNaN(base) || base == null ? 300 : base;
  __showT = setTimeout(() => { const c = el.isConnected && tipContent(el); if (c) shared().show(el, c); }, d);
}
function schedHide(ms = 100) { clearTimeout(__showT); clearTimeout(__hideT); if (__tip && __tip.ref) __hideT = setTimeout(() => __tip.hide(), ms); }
const hideNow = () => { clearTimeout(__showT); clearTimeout(__hideT); __tip?.hide(); };

if (isBrowser) ready(() => {
  on(doc, 'pointerover', e => {
    if (e.pointerType === 'touch') return;
    if (__tip && __tip.el.contains(e.target)) { clearTimeout(__hideT); return; }
    const el = tipTrigger(e.target, 'hover');
    if (el) { if (__tip && __tip.ref === el) clearTimeout(__hideT); else schedShow(el); return; }
    clearTimeout(__showT);
    schedHide();
  });
  on(doc, 'pointerout', e => { if (!e.relatedTarget && e.pointerType !== 'touch') schedHide(); });
  on(doc, 'focusin', e => {
    const el = tipTrigger(e.target, 'focus');
    if (!el) return;
    const c = TIP_API.get(el);
    let fv = true; try { fv = e.target.matches(':focus-visible'); } catch {}
    if (fv || (c && c.trigger === 'focus')) schedShow(el, 0);
  });
  on(doc, 'focusout', e => { if (__tip && __tip.ref && (__tip.ref === e.target || __tip.ref.contains(e.target)) && !__tip.ref.contains(e.relatedTarget)) schedHide(0); });
  on(doc, 'pointerdown', e => {
    if (__tip && __tip.ref && !__tip.el.contains(e.target)) hideNow();
    if (e.pointerType !== 'touch') return;
    const el = tipTrigger(e.target, 'hover');
    clearTimeout(__lpT);
    if (!el) return;
    const sx = e.clientX, sy = e.clientY;
    __lpT = setTimeout(() => { const c = tipContent(el); if (c) { shared().show(el, c); __lpAt = Date.now(); } }, 500);
    const offs = [
      on(doc, 'pointermove', ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) done(); }),
      on(doc, 'pointerup pointercancel', () => { done(); if (__lpAt && Date.now() - __lpAt < 5000) schedHide(1500); }),
    ];
    const done = () => { clearTimeout(__lpT); offs.splice(0).forEach(f => f()); };
  }, { capture: true, passive: true });
  // a long-press that showed a tooltip must not open the native context menu / activate the element
  on(doc, 'contextmenu', e => { if (Date.now() - __lpAt < 800 && tipTrigger(e.target, 'hover')) e.preventDefault(); }, { capture: true });
  on(doc, 'click', e => { if (Date.now() - __lpAt < 800 && __tip && __tip.ref && __tip.ref.contains(e.target)) { e.preventDefault(); e.stopPropagation(); __lpAt = 0; } }, { capture: true });
  on(doc, 'keydown', e => { if (e.key === 'Escape') hideNow(); });
  on(win, 'scroll', e => { if (__tip && __tip.ref && !__tip.el.contains(e.target)) hideNow(); }, { capture: true, passive: true });
  on(win, 'blur', hideNow);
});

/* Icon-only triggers without an accessible name: use the tooltip text as aria-label. */
behavior('data-o-tooltip', (el, value) => {
  if (!value || value === 'auto' || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.textContent.trim()) return;
  el.setAttribute('aria-label', value);
  return () => { if (el.getAttribute('aria-label') === value) el.removeAttribute('aria-label'); };
});

/** Orion.tooltip(el, text | options) → { show, hide, update(content), destroy } */
O.tooltip = function (target, opts) {
  const el = $(target);
  if (!el) return null;
  const c = isObj(opts) && !(opts instanceof Node) && !(opts instanceof SafeHTML) ? { ...opts } : { content: opts };
  c.trigger = ['hover', 'focus', 'click', 'manual'].includes(c.trigger) ? c.trigger : 'hover';
  TIP_API.set(el, c);
  const own = c.trigger === 'click' || c.trigger === 'manual' ? new Tip() : null;
  const tipOf = () => own || shared();
  const offs = [];
  const show = () => { const content = tipContent(el); if (content) tipOf().show(el, content); };
  const hide = () => { const tp = own || __tip; if (tp && tp.ref === el) tp.hide(); };
  if (c.trigger === 'click') {
    offs.push(on(el, 'click', () => (own.ref ? hide() : show())));
    offs.push(on(doc, 'pointerdown', e => { if (own.ref && !el.contains(e.target) && !own.el.contains(e.target)) hide(); }, true));
    offs.push(on(doc, 'keydown', e => { if (e.key === 'Escape' && own.ref) hide(); }));
  }
  return {
    get el() { return tipOf().el; },
    show, hide,
    update(content) { c.content = content; const tp = own || __tip; if (tp && tp.ref === el) show(); },
    destroy() { hide(); TIP_API.delete(el); offs.forEach(f => f()); own?.el.remove(); },
  };
};
