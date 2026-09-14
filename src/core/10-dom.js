/* ============================================================================
 * core: DOM helpers
 * ========================================================================== */

/** $(selector, ctx) -> first Element (passes Elements through) */
const $ = (sel, ctx) => (!sel ? null : isStr(sel) ? (ctx || doc).querySelector(sel) : sel);
/** $$(selector, ctx) -> Element[] */
const $$ = (sel, ctx) => (isStr(sel) ? Array.from((ctx || doc).querySelectorAll(sel)) : toArr(sel));

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROP_KEYS = new Set(['value', 'checked', 'selected', 'indeterminate', 'muted', 'volume', 'currentTime', 'scrollTop', 'scrollLeft', 'srcObject', 'defaultValue']);
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'fontWeight', 'lineHeight', 'zoom', 'scale', 'gridRowStart', 'gridRowEnd', 'gridColumnStart', 'gridColumnEnd']);

/** cls('a', cond && 'b', { c: true }) -> "a b c" */
function cls(...args) {
  const out = [];
  for (const a of args.flat(Infinity)) {
    if (!a) continue;
    if (isStr(a) || isNum(a)) out.push(a);
    else if (isObj(a)) for (const k in a) if (a[k]) out.push(k);
  }
  return out.join(' ');
}
/** css(el, { width: 10, '--o-x': 'red' }) — numbers get px except unitless props */
function css(el, styles) {
  if (!el) return el;
  for (const k in styles) {
    const v = styles[k];
    if (k.startsWith('--')) el.style.setProperty(k, v == null ? '' : v);
    else el.style[k] = v == null ? '' : typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
  }
  return el;
}

/**
 * h(tag, props?, ...children) -> Element
 *   h('button', { class: ['o-btn', active && 'is-active'], onClick: fn, 'aria-label': 'Close' }, 'Text', childEl)
 *   props: class | style (string|object) | dataset | text | html | ref(fn) | on {evt: fn} | onXxx: fn | props {el props}
 *   'svg:rect' creates SVG elements. Boolean true => empty attribute; false/null => skipped.
 */
function h(tag, props, ...children) {
  const el = tag instanceof Element ? tag : tag.startsWith('svg:') ? doc.createElementNS(SVG_NS, tag.slice(4)) : doc.createElement(tag);
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props) || props instanceof SafeHTML)) { children.unshift(props); props = null; }
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (k === 'class' || k === 'className') { const c = cls(v); if (c) el.setAttribute('class', c); }
      else if (k === 'style') { if (isStr(v)) el.style.cssText = v; else if (v) css(el, v); }
      else if (k === 'dataset' || k === 'data') { for (const d in v) if (v[d] != null) el.dataset[d] = v[d]; }
      else if (k === 'text') el.textContent = v ?? '';
      else if (k === 'html') el.innerHTML = v ?? '';
      else if (k === 'ref') { if (isFn(v)) v(el); }
      else if (k === 'on') { for (const e in v) el.addEventListener(e, v[e]); }
      else if (k === 'props') Object.assign(el, v);
      else if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && isFn(v)) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROP_KEYS.has(k)) el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v === false || v == null) continue;
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
/** svg(tag, props, ...children) — shorthand for h('svg:'+tag) */
const svg = (tag, props, ...children) => h('svg:' + tag, props, ...children);
/** append(el, children) — accepts nodes, strings, arrays, SafeHTML (inserted as HTML) */
function append(el, children) {
  for (const c of toArr(children).flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    if (c instanceof SafeHTML) el.insertAdjacentHTML('beforeend', c.s);
    else el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
/** frag(html) -> DocumentFragment (trusted HTML only) */
function frag(markup) { const t = doc.createElement('template'); t.innerHTML = String(markup).trim(); return t.content; }
/** fromHTML(html) -> first Element */
const fromHTML = markup => frag(markup).firstElementChild;

/**
 * on(target, 'click keydown', [selector], handler, [options]) -> off()
 * With a selector the handler is delegated: handler(event, matchedElement), `this` = matched element.
 * target may be an Element, window, document, a selector string or an array.
 */
function on(target, types, selector, handler, options) {
  if (isFn(selector)) { options = handler; handler = selector; selector = null; }
  const targets = isStr(target) ? $$(target) : (target instanceof EventTarget ? [target] : toArr(target));
  const listener = selector
    ? function (e) {
      const t = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
      const m = t && t.closest ? t.closest(selector) : null;
      if (m && (this === doc || this === win || this === m || this.contains(m))) handler.call(m, e, m);
    }
    : handler;
  const list = types.split(/\s+/).filter(Boolean);
  for (const t of targets) for (const ty of list) t.addEventListener(ty, listener, options);
  return () => { for (const t of targets) for (const ty of list) t.removeEventListener(ty, listener, options); };
}
/** emit(el, 'o-change', detail) -> CustomEvent (bubbles, composed, cancelable) */
function emit(el, type, detail, opts = {}) {
  const ev = new CustomEvent(type, { detail, bubbles: true, cancelable: true, composed: true, ...opts });
  el.dispatchEvent(ev);
  return ev;
}
/** ready(fn) — run when the DOM is parsed */
function ready(fn) {
  if (!isBrowser) return;
  if (doc.readyState !== 'loading') queueMicrotask(fn);
  else doc.addEventListener('DOMContentLoaded', () => fn(), { once: true });
}
const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
/** Computed text direction of an element ('ltr' | 'rtl') */
const dirOf = el => (isBrowser ? ((el && el.nodeType === 1 ? getComputedStyle(el).direction : doc.documentElement.dir) || 'ltr') : 'ltr');
const isRTL = el => dirOf(el) === 'rtl';

const FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),iframe,audio[controls],video[controls],summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"])';
/** Tabbable elements inside root, in DOM order. */
function focusables(root) {
  return $$(FOCUSABLE, root).filter(el => el.tabIndex >= 0 && !el.closest('[inert],[hidden]') && isVisible(el));
}
/** Focus the first tabbable element (or the root itself). */
function focusFirst(root, { preferAutofocus = true } = {}) {
  const auto = preferAutofocus && root.querySelector('[autofocus],[data-autofocus]');
  const el = auto || focusables(root)[0] || root;
  if (el === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return el;
}
/**
 * trapFocus(root, { isActive }) -> release()
 * Keeps Tab / Shift+Tab cycling inside root while isActive() returns true.
 */
function trapFocus(root, { isActive = () => true } = {}) {
  const onKey = e => {
    if (e.key !== 'Tab' || !isActive()) return;
    const items = focusables(root);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], a = doc.activeElement;
    if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  };
  doc.addEventListener('keydown', onKey, true);
  return () => doc.removeEventListener('keydown', onKey, true);
}

let __scrollLocks = 0, __scrollSaved = null;
/** lockScroll() -> unlock()  (ref-counted, compensates the scrollbar width) */
function lockScroll() {
  if (!isBrowser) return noop;
  if (__scrollLocks++ === 0) {
    const b = doc.body, sbw = win.innerWidth - doc.documentElement.clientWidth;
    __scrollSaved = { overflow: b.style.overflow, pad: b.style.paddingInlineEnd };
    if (sbw > 0) b.style.paddingInlineEnd = `calc(${getComputedStyle(b).paddingInlineEnd || '0px'} + ${sbw}px)`;
    b.style.overflow = 'hidden';
    doc.documentElement.classList.add('o-scroll-locked');
  }
  let done = false;
  return () => {
    if (done) return; done = true;
    if (--__scrollLocks === 0 && __scrollSaved) {
      doc.body.style.overflow = __scrollSaved.overflow;
      doc.body.style.paddingInlineEnd = __scrollSaved.pad;
      doc.documentElement.classList.remove('o-scroll-locked');
    }
  };
}
/** onClickOutside(elements, handler) -> off()  (pointerdown outside every element) */
function onClickOutside(els, handler) {
  const list = toArr(els);
  const fn = e => { const t = e.composedPath ? e.composedPath()[0] : e.target; if (!list.some(el => el && (el === t || el.contains(t)))) handler(e); };
  doc.addEventListener('pointerdown', fn, true);
  return () => doc.removeEventListener('pointerdown', fn, true);
}

let __ro = null;
const __roMap = new WeakMap();
/** observeResize(el, cb(rect, entry)) -> off()  (one shared ResizeObserver) */
function observeResize(el, cb) {
  if (!isBrowser || !el) return noop;
  if (!win.ResizeObserver) { const f = () => cb(el.getBoundingClientRect()); win.addEventListener('resize', f); return () => win.removeEventListener('resize', f); }
  if (!__ro) __ro = new ResizeObserver(entries => { for (const en of entries) __roMap.get(en.target)?.forEach(fn => { try { fn(en.contentRect, en); } catch (e) { console.error(e); } }); });
  let set = __roMap.get(el);
  if (!set) { set = new Set(); __roMap.set(el, set); __ro.observe(el); }
  set.add(cb);
  return () => { set.delete(cb); if (!set.size) { __ro.unobserve(el); __roMap.delete(el); } };
}
/** observeVisible(el, cb(isVisible, entry), options) -> off()  (IntersectionObserver) */
function observeVisible(el, cb, opts = {}) {
  if (!isBrowser || !win.IntersectionObserver) { cb(true); return noop; }
  const io = new IntersectionObserver(entries => entries.forEach(en => cb(en.isIntersecting, en)), opts);
  io.observe(el);
  return () => io.disconnect();
}
/** Nearest scrollable ancestors (for repositioning popups). */
function scrollParents(el) {
  const out = [];
  for (let p = el && el.parentElement; p && p !== doc.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll|overlay)/.test(s.overflow + s.overflowX + s.overflowY)) out.push(p);
  }
  return out;
}
/** Render a keyed list with node reuse: patchList(container, items, key, create(item,i), update?(el,item,i)) */
function patchList(container, items, keyFn, create, update) {
  const old = new Map();
  for (const el of [...container.children]) if (el.__okey !== undefined) old.set(el.__okey, el);
  let prev = null;
  items.forEach((item, i) => {
    const k = isFn(keyFn) ? keyFn(item, i) : item[keyFn];
    let el = old.get(k);
    if (el) { old.delete(k); update && update(el, item, i); }
    else { el = create(item, i); el.__okey = k; }
    const next = prev ? prev.nextSibling : container.firstChild;
    if (el !== next) container.insertBefore(el, next);
    prev = el;
  });
  old.forEach(el => el.remove());
}

/* ── Chainable DOM wrapper: Orion.$('.card').addClass('x').on('click', fn) ── */
const __qHandlers = new WeakMap();
class OQuery extends Array {
  static get [Symbol.species]() { return Array; }
  static of(list) { const q = new OQuery(); list.forEach(x => x && q.push(x)); return q; }
  each(fn) { this.forEach((el, i) => fn.call(el, el, i)); return this; }
  get el() { return this[0] || null; }
  find(sel) { return OQuery.of([...new Set(this.flatMap(el => $$(sel, el)))]); }
  closest(sel) { return OQuery.of([...new Set(this.map(el => el.closest(sel)).filter(Boolean))]); }
  parent() { return OQuery.of([...new Set(this.map(el => el.parentElement).filter(Boolean))]); }
  children(sel) { return OQuery.of(this.flatMap(el => [...el.children].filter(c => !sel || c.matches(sel)))); }
  siblings(sel) { return OQuery.of(this.flatMap(el => [...(el.parentElement?.children || [])].filter(c => c !== el && (!sel || c.matches(sel))))); }
  next() { return OQuery.of(this.map(el => el.nextElementSibling)); }
  prev() { return OQuery.of(this.map(el => el.previousElementSibling)); }
  is(sel) { return this.some(el => el.matches(sel)); }
  where(sel) { return OQuery.of(this.filter(el => (isFn(sel) ? sel(el) : el.matches(sel)))); }
  eq(i) { return OQuery.of([this.at(i)]); }
  first() { return this.eq(0); }
  last() { return this.eq(-1); }
  addClass(...c) { const l = c.flatMap(x => String(x).split(/\s+/)).filter(Boolean); return this.each(el => el.classList.add(...l)); }
  removeClass(...c) { const l = c.flatMap(x => String(x).split(/\s+/)).filter(Boolean); return this.each(el => el.classList.remove(...l)); }
  toggleClass(c, force) { return this.each(el => String(c).split(/\s+/).forEach(x => x && el.classList.toggle(x, force))); }
  hasClass(c) { return this.some(el => el.classList.contains(c)); }
  attr(n, v) {
    if (isObj(n)) { for (const k in n) this.attr(k, n[k]); return this; }
    if (v === undefined) return this[0]?.getAttribute(n) ?? null;
    return this.each(el => (v === null || v === false ? el.removeAttribute(n) : el.setAttribute(n, v === true ? '' : v)));
  }
  removeAttr(n) { return this.each(el => el.removeAttribute(n)); }
  prop(n, v) { if (v === undefined) return this[0]?.[n]; return this.each(el => { el[n] = v; }); }
  data(k, v) { if (v === undefined) return this[0]?.dataset[camel(k)]; return this.each(el => { el.dataset[camel(k)] = v; }); }
  css(k, v) {
    if (isObj(k)) return this.each(el => css(el, k));
    if (v === undefined) return this[0] ? getComputedStyle(this[0]).getPropertyValue(kebab(k)) : '';
    return this.each(el => css(el, { [k]: v }));
  }
  text(v) { if (v === undefined) return this.map(el => el.textContent).join(''); return this.each(el => { el.textContent = v; }); }
  html(v) { if (v === undefined) return this[0]?.innerHTML ?? ''; return this.each(el => { el.innerHTML = v; }); }
  val(v) { if (v === undefined) return this[0]?.value; return this.each(el => { el.value = v; }); }
  append(c) { return this.each((el, i) => el.append(...__qNodes(c, i > 0))); }
  prepend(c) { return this.each((el, i) => el.prepend(...__qNodes(c, i > 0))); }
  before(c) { return this.each((el, i) => el.before(...__qNodes(c, i > 0))); }
  after(c) { return this.each((el, i) => el.after(...__qNodes(c, i > 0))); }
  remove() { return this.each(el => el.remove()); }
  empty() { return this.each(el => el.replaceChildren()); }
  clone(deep = true) { return OQuery.of(this.map(el => el.cloneNode(deep))); }
  on(types, sel, fn, opts) {
    return this.each(el => {
      const off = on(el, types, sel, fn, opts);
      const list = __qHandlers.get(el) || []; list.push({ types, fn: isFn(sel) ? sel : fn, off }); __qHandlers.set(el, list);
    });
  }
  off(types, fn) {
    return this.each(el => {
      const list = __qHandlers.get(el) || [];
      __qHandlers.set(el, list.filter(x => { const hit = (!types || x.types === types) && (!fn || x.fn === fn); if (hit) x.off(); return !hit; }));
    });
  }
  trigger(type, detail) { return this.each(el => (type in el && isFn(el[type]) && /^(click|focus|blur|submit|reset)$/.test(type) ? el[type]() : emit(el, type, detail))); }
  show() { return this.each(el => { el.hidden = false; if (el.style.display === 'none') el.style.display = ''; }); }
  hide() { return this.each(el => { el.hidden = true; }); }
  toggle(force) { return this.each(el => { el.hidden = force === undefined ? !el.hidden : !force; }); }
  fadeIn(ms = 200) { return this.each(el => { el.hidden = false; O.animate?.(el, 'fadeIn', { duration: ms }); }); }
  fadeOut(ms = 200) { return this.each(el => { O.animate ? O.animate(el, 'fadeOut', { duration: ms }).then(() => { el.hidden = true; }) : (el.hidden = true); }); }
  slideDown(ms) { return this.each(el => O.collapse?.(el, true, { duration: ms })); }
  slideUp(ms) { return this.each(el => O.collapse?.(el, false, { duration: ms })); }
  slideToggle(ms) { return this.each(el => O.collapse?.(el, undefined, { duration: ms })); }
  rect() { return this[0]?.getBoundingClientRect(); }
  focus() { this[0]?.focus(); return this; }
  index() { const el = this[0]; return el ? [...el.parentElement.children].indexOf(el) : -1; }
}
function __qNodes(c, cloneIt) {
  if (isStr(c)) return [...frag(c).childNodes];
  if (c instanceof SafeHTML) return [...frag(c.s).childNodes];
  const nodes = c instanceof OQuery ? [...c] : toArr(c);
  return cloneIt ? nodes.map(n => n.cloneNode(true)) : nodes;
}
/** Orion.$(selector | element | elements | '<html>') -> chainable OQuery */
function query(sel, ctx) {
  if (!isBrowser) return new OQuery();
  if (isStr(sel) && sel.trim().startsWith('<')) return OQuery.of([...frag(sel).children]);
  if (isFn(sel)) { ready(sel); return new OQuery(); }
  return OQuery.of(isStr(sel) ? $$(sel, isStr(ctx) ? $(ctx) : ctx) : sel instanceof OQuery ? [...sel] : toArr(sel));
}

O.$ = query;
O.dom = {
  $, $$, h, svg, cls, css, append, frag, fromHTML, on, emit, ready, isVisible, dirOf, isRTL, focusables, focusFirst, trapFocus,
  lockScroll, onClickOutside, observeResize, observeVisible, scrollParents, patchList, html, raw, esc,
};
O.h = h;
O.ready = ready;
