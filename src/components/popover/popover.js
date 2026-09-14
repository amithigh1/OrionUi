/* Popover — delegated data-o-popover="text | #templateOrElementId" (+ data-o-popover-title, data-o-trigger, data-o-placement, data-o-popover-close),
 *   <o-popover for="triggerId" placement trigger heading close-button width> interactive children </o-popover>,
 *   Orion.popover(trigger, { content, title, placement, trigger, closeButton, width, onOpen, onClose }) → { open, close, toggle, update, destroy, el }
 * Uses core overlays (outside press, Escape + focus return, nesting), portal() and autoPlace() with an arrow.
 */
i18n.add('en', { popover: { close: 'Close' } });

const POP_OF = new WeakMap();
const popPlacement = p => (/^(top|bottom|left|right|start|end)(-(start|end))?$/.test(p || '') ? p : 'bottom');
const popNodes = c => {
  if (c == null || c === false) return [];
  if (isFn(c)) return popNodes(c());
  if (c instanceof SafeHTML || isStr(c)) return [...frag(String(c)).childNodes];
  if (c instanceof Node) return [c];
  return toArr(c).flatMap(popNodes);
};

class Pop {
  constructor(trigger, o = {}) {
    this.trigger = trigger;
    this.o = { placement: 'bottom', trigger: 'click', ...o };
    const id = uid('pop');
    this.titleEl = h('div', { class: 'o-popover-title', id: id + '-t' });
    this.closeBtn = h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-popover-close', onClick: () => this.close('close-button') });
    this.header = h('div', { class: 'o-popover-header' }, this.titleEl, this.closeBtn);
    this.body = h('div', { class: 'o-popover-body' });
    this.arrow = h('span', { class: 'o-popover-arrow', 'aria-hidden': 'true' });
    this.el = h('div', { class: 'o-floating o-popover', role: 'dialog', id, tabindex: '-1', hidden: true }, this.arrow, this.header, this.body);
    this.el.__oPop = this;
    on(this.el, 'pointerenter', e => { if (this.o.trigger === 'hover' && e.pointerType !== 'touch') clearTimeout(this._t); });
    on(this.el, 'pointerleave', e => { if (this.o.trigger === 'hover' && e.pointerType !== 'touch') this.leave(); });
    on(this.el, 'focusout', e => this.focusOut(e));
    on(this.el, 'keydown', e => this.keydown(e));
    this.build();
  }
  get target() { return this.o.host || this.trigger; }
  aria() {
    const t = this.trigger;
    if (!t) return;
    t.setAttribute('aria-haspopup', 'dialog');
    t.setAttribute('aria-expanded', String(!!this._ov));
    t.setAttribute('aria-controls', this.el.id);
  }
  build() {
    const o = this.o;
    this.titleEl.textContent = o.title || '';
    this.titleEl.hidden = !o.title;
    this.closeBtn.hidden = !o.closeButton;
    this.closeBtn.setAttribute('aria-label', t('popover.close'));
    this.header.hidden = !o.title && !o.closeButton;
    this.el.classList.toggle('has-title', !!o.title);
    if (o.title) this.el.setAttribute('aria-labelledby', this.titleEl.id); else this.el.removeAttribute('aria-labelledby');
    if (!o.title && o.label) this.el.setAttribute('aria-label', o.label);
    if ('content' in o) this.body.replaceChildren(...popNodes(o.content));
    if ('source' in o && o.source !== this._src) this.fromSource(o.source);
    this.el.style.width = o.width == null || o.width === '' ? '' : isNum(o.width) ? o.width + 'px' : String(o.width);
    if (o.className !== this._cls) { if (this._cls) this.el.classList.remove(...this._cls.split(/\s+/).filter(Boolean)); if (o.className) this.el.classList.add(...o.className.split(/\s+/).filter(Boolean)); this._cls = o.className; }
    this.aria();
  }
  /** data-o-popover value: "#id" (template → clone, element → move) or plain text. */
  fromSource(src) {
    this._src = src;
    let ref = null;
    if (/^#[\w-]/.test(src || '')) { try { ref = doc.querySelector(src); } catch {} }
    if (ref && ref.localName === 'template') this.body.replaceChildren(ref.content.cloneNode(true));
    else if (ref) { ref.hidden = false; ref.removeAttribute('aria-hidden'); this.body.replaceChildren(ref); }
    else this.body.textContent = src || '';
  }
  update(o) {
    if (o == null || isStr(o) || isFn(o) || o instanceof Node || o instanceof SafeHTML) o = { content: o };
    Object.assign(this.o, o);
    this.build();
    this.reposition();
  }
  reposition() { if (this._ov) place(this.el, this.trigger, this._placeOpts()); }
  _placeOpts() { return { placement: popPlacement(this.o.placement), offset: 10, padding: 8, arrow: this.arrow }; }
  open() {
    if (this._ov || !this.trigger || !this.trigger.isConnected) return;
    if (emit(this.target, 'o-open', { trigger: this.trigger, panel: this.el }).defaultPrevented) return;
    portal(this.el, this.trigger);
    this.el.hidden = false;
    const interactive = this.o.trigger === 'click' || this.o.trigger === 'manual';
    this._unplace = autoPlace(this.el, this.trigger, { ...this._placeOpts(), onHidden: () => this.close('hidden') });
    this._ov = overlays.open({ el: this.el, owner: this.trigger, returnFocus: interactive, onClose: r => this._hide(r) });
    this.aria();
    animate(this.el, 'zoomIn', { duration: 140 });
    if (interactive && this.o.focus !== false) {
      const f = this.el.querySelector('[autofocus],[data-autofocus]') || focusables(this.body)[0] || this.el;
      try { f.focus({ preventScroll: true }); } catch {}
    }
    try { this.o.onOpen?.(this.handle); } catch (err) { console.error(err); }
  }
  close(reason = 'api') { clearTimeout(this._t); this._ov?.close(reason); }
  toggle() { this._ov ? this.close('toggle') : this.open(); }
  _hide(reason) {
    this._ov = null;
    this._unplace?.(); this._unplace = null;
    this.el.hidden = true;
    this.aria();
    emit(this.target, 'o-close', { reason, trigger: this.trigger });
    try { this.o.onClose?.(reason); } catch (err) { console.error(err); }
  }
  /* hover / focus triggers */
  enter() { clearTimeout(this._t); if (!this._ov) this._t = setTimeout(() => this.open(), this.o.delay ?? 120); }
  leave() { clearTimeout(this._t); if (this._ov) this._t = setTimeout(() => this.close('leave'), 180); }
  focusIn() { clearTimeout(this._t); if (!this._ov) this.open(); }
  focusOut(e) {
    if (this.o.trigger !== 'hover' && this.o.trigger !== 'focus') return;
    const to = e.relatedTarget;
    if (to && (this.el.contains(to) || this.trigger.contains(to))) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => { const a = doc.activeElement; if (this._ov && !this.el.contains(a) && !this.trigger.contains(a)) this.close('blur'); }, 30);
  }
  /* Tab past the ends leaves the popover as if it were placed right after its trigger */
  keydown(e) {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const items = focusables(this.el), a = doc.activeElement;
    const atEnd = !items.length || (!e.shiftKey && a === items[items.length - 1]) || (e.shiftKey && (a === items[0] || a === this.el));
    if (!atEnd) return;
    e.preventDefault();
    const trig = this.trigger;
    this.close('tab');
    if (e.shiftKey) { trig.focus(); return; }
    const all = focusables(doc.body).filter(x => !this.el.contains(x));
    const i = all.indexOf(trig);
    (all[i + 1] || trig).focus();
  }
  bind() {
    const t = this.trigger;
    return [
      on(t, 'click', e => {
        const mode = this.o.trigger;
        if (mode === 'click' || (mode === 'hover' && e.pointerType === 'touch')) { if (t.tagName === 'A') e.preventDefault(); this.toggle(); }
      }),
      on(t, 'pointerenter', e => { if (this.o.trigger === 'hover' && e.pointerType !== 'touch') this.enter(); }),
      on(t, 'pointerleave', e => { if (this.o.trigger === 'hover' && e.pointerType !== 'touch') this.leave(); }),
      on(t, 'focusin', () => { if (this.o.trigger === 'hover' || this.o.trigger === 'focus') this.focusIn(); }),
      on(t, 'focusout', e => this.focusOut(e)),
    ];
  }
  destroy() {
    this.close('destroy');
    this.el.remove();
    const t = this.trigger;
    if (t) ['aria-haspopup', 'aria-expanded', 'aria-controls'].forEach(a => t.removeAttribute(a));
  }
}

/* ── delegated data-o-popover ── */
function popAttrs(el) {
  return {
    placement: el.getAttribute('data-o-placement') || 'bottom', trigger: el.getAttribute('data-o-trigger') || 'click',
    title: el.getAttribute('data-o-popover-title') || '', closeButton: el.hasAttribute('data-o-popover-close'), source: el.getAttribute('data-o-popover'),
  };
}
function popFor(el) {
  let p = POP_OF.get(el);
  const o = popAttrs(el);
  if (!p) { p = new Pop(el, o); POP_OF.set(el, p); }
  else if (!p._ov) { Object.assign(p.o, o); p.build(); }
  return p;
}
const popMode = el => el.getAttribute('data-o-trigger') || 'click';
if (isBrowser) ready(() => {
  on(doc, 'click', '[data-o-popover]', (e, el) => {
    const mode = popMode(el);
    if (mode !== 'click' && !(mode === 'hover' && e.pointerType === 'touch')) return;
    if (el.tagName === 'A') e.preventDefault();
    popFor(el).toggle();
  });
  on(doc, 'pointerover', '[data-o-popover]', (e, el) => { if (popMode(el) === 'hover' && e.pointerType !== 'touch' && !el.contains(e.relatedTarget)) popFor(el).enter(); });
  on(doc, 'pointerout', '[data-o-popover]', (e, el) => { if (popMode(el) === 'hover' && e.pointerType !== 'touch' && !el.contains(e.relatedTarget)) POP_OF.get(el)?.leave(); });
  on(doc, 'focusin', '[data-o-popover]', (e, el) => { const m = popMode(el); if (m === 'hover' || m === 'focus') popFor(el).focusIn(); });
  on(doc, 'focusout', '[data-o-popover]', (e, el) => POP_OF.get(el)?.focusOut(e));
});
action('dismiss:popover', trigger => { const panel = trigger.closest('.o-popover'); if (panel && panel.__oPop) panel.__oPop.close('dismiss'); });

/* ── <o-popover for="id"> ── */
class OPopover extends OElement {
  static props = {
    for: String,
    placement: { type: String, default: 'bottom' },
    trigger: { type: String, default: 'click' },
    heading: String,
    closeButton: Boolean,
    width: String,
    label: String,
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
  };
  get open() { return this.__openFn || (this.__openFn = () => { this.isOpen = true; }); }
  set open(v) { this.isOpen = !!v; }
  connectedCallback() {
    if (Object.prototype.hasOwnProperty.call(this, 'open')) { const v = this.open; delete this.open; if (!isFn(v)) this.isOpen = !!v; }
    super.connectedCallback();
  }
  setup() {
    this.pop = new Pop(null, { host: this, onOpen: () => { this.isOpen = true; }, onClose: () => { this.isOpen = false; } });
    this.panel = this.pop.el;
    this.pop.body.append(...this.childNodes);
  }
  connected() {
    this._mo = new MutationObserver(() => { const n = [...this.childNodes]; if (n.length) this.pop.body.append(...n); });
    this._mo.observe(this, { childList: true });
    this._rebind();
    if (!this.pop.trigger) ready(() => this._rebind());
  }
  disconnected() {
    this._mo?.disconnect();
    this._offs?.forEach(f => f()); this._offs = null;
    this.pop.close('disconnect');
  }
  _rebind() {
    const tr = this.for ? doc.getElementById(this.for) : null;
    if (tr === this.pop.trigger && this._offs) return;
    this._offs?.forEach(f => f()); this._offs = null;
    this.pop.close('rebind');
    this.pop.trigger = tr;
    if (tr) { this._offs = this.pop.bind(); this.pop.aria(); }
  }
  update(changed) {
    if (changed.has('for') && !changed.has('init') && this.isConnected) this._rebind();
    Object.assign(this.pop.o, { placement: this.placement, trigger: this.trigger, title: this.heading || '', closeButton: this.closeButton, width: this.width || null, label: this.label });
    this.pop.build();
    this.pop.reposition();
    if (changed.has('isOpen')) {
      if (this.isOpen && !this.pop._ov) { if (!this.pop.trigger) this._rebind(); this.pop.open(); if (!this.pop._ov) this.isOpen = false; }
      else if (!this.isOpen && this.pop._ov) this.pop.close('api');
    }
  }
  close() { this.isOpen = false; this.pop?.close('api'); }
  toggle() { this.isOpen = !this.isOpen; }
  reposition() { this.pop?.reposition(); }
}
define('o-popover', OPopover);
O.Popover = OPopover;

/** Orion.popover(trigger, options | content) → { open, close, toggle, update, destroy, el } */
O.popover = function (target, opts = {}) {
  const trigger = $(target);
  if (!trigger) return null;
  if (opts == null || isStr(opts) || opts instanceof Node || opts instanceof SafeHTML || isFn(opts)) opts = { content: opts };
  const p = new Pop(trigger, { content: undefined, ...opts });
  const offs = p.bind();
  p.handle = {
    get el() { return p.el; },
    open: () => p.open(), close: () => p.close('api'), toggle: () => p.toggle(),
    update: o => p.update(o),
    destroy: () => { offs.forEach(f => f()); p.destroy(); },
  };
  return p.handle;
};
