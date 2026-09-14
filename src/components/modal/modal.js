/* Modal — <o-modal> + Orion.modal({ title, content, buttons }) → handle { el, close, result, setTitle, setContent, setLoading }
 *   <button data-o-toggle="modal" data-o-target="#m">Open</button>
 *   <o-modal id="m" heading="Edit" size="lg" centered scrollable fullscreen="sm" draggable static>
 *     body… <div slot="footer"><button class="o-btn" data-o-dismiss="modal">Close</button></div>
 *   </o-modal>
 *   el.open(trigger) / el.close(value) / el.toggle()   events: o-open o-opened o-before-close o-close o-closed
 * Native <dialog>.showModal() (top layer) + core overlays (Escape, nesting, focus trap, scroll lock).
 * OModal is also the base class of <o-drawer> (O.Modal).
 */
i18n.add('en', { modal: { close: 'Close', loading: 'Loading…' } });

const __openHosts = new Set();
let __escBound = false;
/* Runs after core's Escape handler (bound after our first overlays.open). Closes the top-most modal/drawer
 * and always blocks the native <dialog> close request so every close goes through overlays + o-before-close. */
function __onEsc(e) {
  if (e.key !== 'Escape' || e.isComposing || !__openHosts.size) return;
  const top = overlays.top();
  const host = top && top.oHost;
  const handled = e.defaultPrevented;
  e.preventDefault();
  if (!handled && host && host._ov && host._ov.entry === top) host._escape();
}
const __nodes = c => {
  if (c == null || c === false) return [];
  if (isFn(c)) return __nodes(c());
  if (c instanceof SafeHTML || isStr(c)) return [...frag(String(c)).childNodes];
  if (c instanceof Node) return [c];
  return toArr(c).flatMap(__nodes);
};
/** FormData -> plain object (repeated names become arrays). */
function __formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = k in out ? [].concat(out[k], v) : v;
  return out;
}

class OModal extends OElement {
  static prefix = 'o-modal';
  static props = {
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
    heading: String,
    label: String,
    size: { type: String, default: 'md' },
    static: Boolean,
    centered: Boolean,
    scrollable: Boolean,
    fullscreen: String,
    closable: { type: Boolean, default: true },
    draggable: Boolean,
    backdrop: { type: Boolean, default: true },
    loading: Boolean,
    texts: Object,
  };

  /* `open` is both the attribute and a method: calling el.open() opens, assigning el.open = bool (frameworks) sets the state. */
  get open() { return this.__openFn || (this.__openFn = trigger => this._show(trigger)); }
  set open(v) { this.isOpen = !!v; }

  connectedCallback() {
    if (Object.prototype.hasOwnProperty.call(this, 'open')) { const v = this.open; delete this.open; if (!isFn(v)) this.isOpen = !!v; }
    super.connectedCallback();
  }

  setup() {
    const P = this.constructor.prefix, id = uid(P.slice(2));
    this._state = 'closed';
    this._dx = 0; this._dy = 0;
    this.titleEl = h('h2', { class: P + '-title', id: id + '-title' });
    this.closeBtn = h('button', { type: 'button', class: 'o-btn-close ' + P + '-close', onClick: () => this._request('close-button') });
    this.header = h('div', { class: P + '-header' }, this.titleEl, this.closeBtn);
    this.body = h('div', { class: P + '-body', id: id + '-body' });
    this.footer = h('div', { class: P + '-footer' });
    this.panel = h('div', { class: P + '-panel', tabindex: '-1' }, this.header, this.body, this.footer);
    this.backdropEl = h('div', { class: 'o-backdrop ' + P + '-backdrop' });
    this.dialog = h('dialog', { class: P, 'data-o-overlay': '' }, this.backdropEl, this._frame());
    this._distribute([...this.childNodes]);
    this.append(this.dialog);
    // backdrop click = pointerdown AND click on the backdrop area (a text selection dragged outside does not close)
    on(this.dialog, 'pointerdown', e => { this._downOut = this._isBackdrop(e.target); });
    on(this.dialog, 'click', e => { if (this._downOut && this._isBackdrop(e.target)) this._backdropClick(); this._downOut = false; });
    on(this.dialog, 'cancel', e => { e.preventDefault(); if (this._ov && overlays.top() === this._ov.entry) this._escape(); });
    on(this.dialog, 'close', () => { if (this._ov && (this._state === 'open' || this._state === 'opening')) { this._closeValue = this.dialog.returnValue || undefined; this._ov.close('native'); } });
    on(this.header, 'pointerdown', e => this._dragStart(e));
    this._paintFooter();
  }
  /** Element holding the panel inside the <dialog> (drawer overrides). */
  _frame() { return (this.wrap = h('div', { class: this.constructor.prefix + '-wrap' }, this.panel)); }
  _isBackdrop(t) { return t === this.backdropEl || t === this.wrap; }
  _isModal() { return true; }

  /* ── children → header / body / footer ── */
  _distribute(nodes) {
    const P = this.constructor.prefix;
    for (const n of nodes) {
      if (n === this.dialog) continue;
      const slot = n.nodeType === 1 ? n.getAttribute('slot') : null;
      if (slot === 'footer' || (n.nodeType === 1 && n.classList.contains(P + '-footer'))) this.footer.append(n);
      else if (slot === 'header') { this._headerSlot = n; if (!n.id) n.id = uid('hd'); this.header.insertBefore(n, this.closeBtn); }
      else if (n.nodeType === 1 || n.nodeType === 3) this.body.append(n);
    }
  }
  _paintFooter() { this.footer.hidden = ![...this.footer.childNodes].some(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())); }

  connected() {
    this._mo = new MutationObserver(muts => {
      const added = muts.flatMap(m => [...m.addedNodes]).filter(n => n.parentNode === this && n !== this.dialog);
      if (added.length) { this._distribute(added); this._paintHeader(); }
      this._paintFooter();
    });
    this._mo.observe(this, { childList: true });
    this._mo2 = new MutationObserver(() => this._paintFooter());
    this._mo2.observe(this.footer, { childList: true });
    // moved while open: the dialog left the top layer -> show it again
    if ((this._state === 'open' || this._state === 'opening') && this._isModal()) {
      let modal = true; try { modal = this.dialog.matches(':modal'); } catch {}
      if (!modal) { try { if (this.dialog.open) this.dialog.close(); this.dialog.showModal(); } catch {} }
    }
  }
  disconnected() {
    this._mo?.disconnect(); this._mo2?.disconnect();
    if (this._ov) queueMicrotask(() => { if (!this.isConnected && this._ov) { this._closeValue = undefined; this._ov.close('disconnect'); } });
  }

  update(changed) {
    const init = changed.has('init');
    if (init || changed.has('heading') || changed.has('label')) this._paintHeader();
    if (init || changed.has('locale') || changed.has('texts')) this.closeBtn.setAttribute('aria-label', this.t('modal.close'));
    this._paint();
    if (init || changed.has('loading')) this._paintLoading();
    if (changed.has('isOpen')) {
      if (this.isOpen && (this._state === 'closed' || this._state === 'closing')) this._show(this.__pendingTrigger);
      else if (!this.isOpen && (this._state === 'open' || this._state === 'opening') && !this._request('api')) this.isOpen = true;
    }
  }
  _paintHeader() {
    const hs = this._headerSlot && this._headerSlot.parentNode === this.header ? this._headerSlot : null;
    this.titleEl.textContent = this.heading || '';
    this.titleEl.hidden = !this.heading || !!hs;
    const labelled = hs ? hs.id : this.heading ? this.titleEl.id : null;
    if (labelled) { this.dialog.setAttribute('aria-labelledby', labelled); this.dialog.removeAttribute('aria-label'); }
    else { this.dialog.removeAttribute('aria-labelledby'); if (this.label) this.dialog.setAttribute('aria-label', this.label); else this.dialog.removeAttribute('aria-label'); }
    this.panel.classList.toggle('has-title', !!(this.heading || hs));
    this.header.hidden = !this.closable && !this.heading && !hs;
  }
  /** Sync state classes on the <dialog> (never overwrites className: is-closing / user classes survive). */
  _paint() {
    const d = this.dialog, P = this.constructor.prefix, fs = this.fullscreen;
    for (const s of ['sm', 'md', 'lg', 'xl', 'full']) d.classList.toggle(P + '-' + s, this.size === s);
    for (const s of ['sm', 'md', 'lg']) d.classList.toggle(P + '-fs-' + s, fs === s);
    d.classList.toggle('is-fullscreen', fs === 'always' || fs === '' || fs === 'true');
    d.classList.toggle('is-centered', !!this.centered);
    d.classList.toggle('is-scrollable', !!this.scrollable);
    d.classList.toggle('is-draggable', !!this.draggable);
    d.classList.toggle('no-backdrop', !this.backdrop);
    this.closeBtn.hidden = !this.closable;
    this.header.hidden = !this.closable && !this.heading && !this._headerSlot;
    d.setAttribute('aria-modal', String(this._isModal()));
  }
  _paintLoading() {
    let ov = this.panel.querySelector(':scope > .o-loading-overlay');
    if (this.loading && !ov) {
      this.panel.append(h('div', { class: 'o-loading-overlay', role: 'status' }, h('span', { class: 'o-spinner' }), h('span', { class: 'o-sr-only' }, this.t('modal.loading'))));
      this.panel.setAttribute('aria-busy', 'true');
    } else if (!this.loading && ov) { ov.remove(); this.panel.removeAttribute('aria-busy'); }
  }

  /* ── open / close ── */
  close(value) {
    if (!this._ov) { if (!this._setupDone) this.isOpen = false; return false; }
    return this._request('api', value);
  }
  toggle(trigger) { return this.isOpen ? this.close() : this._show(trigger); }

  _show(trigger) {
    if (!this._setupDone || !this.isConnected) { this.__pendingTrigger = trigger; this.isOpen = true; return; }
    this.__pendingTrigger = null;
    if (this._state === 'open' || this._state === 'opening') return;
    if (this._state === 'closing') this._finishClose(true);
    const t = trigger && trigger.nodeType === 1 ? trigger : doc.activeElement !== doc.body ? doc.activeElement : null;
    if (!this.emit('open', { trigger: t })) { this.isOpen = false; return; }
    this._state = 'opening';
    this._returnTo = doc.activeElement;
    this._setDrag(0, 0);
    this._paint();
    const d = this.dialog, modal = this._isModal();
    try { if (d.open) d.close(); modal ? d.showModal() : d.show(); } catch (err) { console.error('[Orion] modal:', err); }
    this._ov = overlays.open({
      el: d, owner: t, escape: false, outside: false, modal, trap: modal, lockScroll: modal && this._lockScroll(), returnFocus: false,
      onClose: reason => this._hide(reason),
    });
    this._ov.entry.oHost = this;
    if (!__escBound) { __escBound = true; doc.addEventListener('keydown', __onEsc); }
    __openHosts.add(this);
    this.isOpen = true;
    this._opened();
    this._focusInitial();
    this._animIn().then(() => { if (this._state === 'opening') { this._state = 'open'; this.emit('opened', {}); } });
  }
  _lockScroll() { return true; }
  _opened() {}
  _focusInitial() {
    const el = this.panel.querySelector('[autofocus],[data-autofocus]') || focusables(this.body)[0] || this.panel;
    try { el.focus({ preventScroll: true }); } catch {}
  }
  /** Request a close: fires the cancelable o-before-close, then closes through the overlay handle. */
  _request(reason, value) {
    if (!this._ov || this._state === 'closing' || this._state === 'closed') return false;
    if (!this.emit('before-close', { reason, value })) return false;
    this._closeValue = value;
    this._ov.close(reason);
    return true;
  }
  _escape() { if (this.closable) this._request('escape'); else this._shake(); }
  _backdropClick() { if (this.closable && !this.static && this.backdrop !== false) this._request('backdrop'); else this._shake(); }
  _shake() { animate(this.panel, 'shake', { duration: 320 }); }
  /** overlays onClose — the only place that starts hiding. */
  _hide(reason) {
    this._ov = null;
    __openHosts.delete(this);
    if (this._state !== 'open' && this._state !== 'opening') return;
    this._state = 'closing';
    const detail = { reason, value: this._closeValue };
    this._closeValue = undefined;
    this.returnValue = detail.value;
    this.isOpen = false;
    this.dialog.classList.add('is-closing');
    this._closing(detail);
    this.emit('close', detail);
    (reason === 'disconnect' || reason === 'native' ? Promise.resolve() : this._animOut()).then(() => this._finishClose(false, detail));
  }
  _closing() {}
  _finishClose(interrupted, detail) {
    if (this._state !== 'closing') return;
    this._state = 'closed';
    const d = this.dialog, a = doc.activeElement;
    const inside = !a || a === doc.body || d.contains(a);
    d.classList.remove('is-closing');
    if (d.open) { try { d.close(); } catch {} }
    [this.panel, this.backdropEl].forEach(el => el.getAnimations?.().forEach(x => x.cancel()));
    this._setDrag(0, 0);
    const back = this._returnTo; this._returnTo = null;
    if (!interrupted) {
      if (inside && back && back.isConnected && back !== doc.body) { try { back.focus({ preventScroll: true }); } catch {} }
      this.emit('closed', detail);
    }
  }
  _animIn() {
    animate(this.backdropEl, 'fadeIn', { duration: 200 });
    return animate(this.panel, [{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
  }
  _animOut() {
    animate(this.backdropEl, 'fadeOut', { duration: 160, fill: 'forwards' });
    return animate(this.panel, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 160, fill: 'forwards' });
  }

  /* ── dragging by the header ── */
  _setDrag(dx, dy) { this._dx = dx; this._dy = dy; if (this.panel) this.panel.style.translate = dx || dy ? `${dx}px ${dy}px` : ''; }
  _dragStart(e) {
    if (!this.draggable || e.button !== 0 || e.target.closest('button,a,input,select,textarea,[contenteditable],[data-no-drag]')) return;
    if (getComputedStyle(this.panel).maxWidth === 'none' && this.panel.offsetWidth >= doc.documentElement.clientWidth) return; // fullscreen
    e.preventDefault();
    const r = this.panel.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const left = r.left - this._dx, top = r.top - this._dy, sx = e.clientX - this._dx, sy = e.clientY - this._dy;
    try { this.header.setPointerCapture(e.pointerId); } catch {}
    this.panel.classList.add('is-dragging');
    const move = ev => this._setDrag(clamp(ev.clientX - sx, 64 - left - r.width, vw - left - 64), clamp(ev.clientY - sy, -top, vh - top - 48));
    const off = on(this.header, 'pointermove', move);
    const end = on(this.header, 'pointerup pointercancel lostpointercapture', () => { off(); end(); this.panel.classList.remove('is-dragging'); });
  }
}
define('o-modal', OModal);
O.Modal = OModal;

/* ── actions ── */
action('modal', (trigger, e, target) => { if (target && isFn(target.toggle) && target instanceof OModal) target.toggle(trigger); });
action('dismiss:modal', trigger => { const m = trigger.closest('o-modal'); if (m && m._request) m._request('dismiss', trigger.getAttribute('data-o-value') ?? undefined); });

/* ── programmatic factory (also used by Orion.drawer / dialogs) ── */
function __mountHandle(tag, opts, apply) {
  if (isStr(opts) || opts instanceof Node) opts = { content: opts };
  opts = opts || {};
  const el = doc.createElement(tag);
  el.heading = opts.title || '';
  if (opts.label) el.label = opts.label;
  if (opts.closable === false) el.closable = false;
  if (opts.backdrop === 'static' || opts.static) el.static = true;
  if (opts.backdrop === false) el.backdrop = false;
  if (opts.texts) el.texts = opts.texts;
  apply(el, opts);
  let resolve, submitBtn = null;
  const result = new Promise(r => (resolve = r));
  const handle = {
    el, result,
    get body() { return el.body; }, get footer() { return el.footer; },
    close: value => el.close(value),
    setTitle: s => { el.heading = s || ''; },
    setLoading: b => { el.loading = !!b; },
    setContent: c => { const nodes = __nodes(c); if (el.body) el.body.replaceChildren(...nodes); else { [...el.childNodes].filter(n => !(n.nodeType === 1 && n.getAttribute('slot'))).forEach(n => n.remove()); el.prepend(...nodes); } },
    setButtons: list => {
      submitBtn = null;
      const bar = h('div', { slot: 'footer', class: 'o-modal-actions' }, toArr(list).map(b => mkBtn(b)));
      const old = el.footer ? el.footer.querySelector(':scope > .o-modal-actions') : el.querySelector(':scope > .o-modal-actions');
      if (old) old.replaceWith(bar); else if (el.footer) el.footer.append(bar); else el.append(bar);
    },
  };
  const mkBtn = b => {
    if (b instanceof Node) return b;
    const btn = h('button', { type: 'button', class: cls('o-btn', b.variant && 'o-btn-' + b.variant, b.className), disabled: !!b.disabled, 'data-autofocus': b.autofocus ? true : null },
      b.icon ? icon(b.icon) : null, b.text != null ? h('span', null, b.text) : null);
    if (b.submit) submitBtn = btn;
    on(btn, 'click', async ev => {
      if (btn.classList.contains('is-loading')) return;
      let data;
      if (b.submit) { const f = el.body && el.body.querySelector('form'); if (f) { if (!f.reportValidity()) return; data = __formData(f); } }
      let r = isFn(b.onClick) ? b.onClick(handle, ev, data) : undefined;
      if (r && isFn(r.then)) {
        btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
        try { r = await r; } catch (err) { console.error('[Orion] modal button:', err); r = false; }
        btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
      }
      if (r === false || b.close === false) return;
      el._request('button', 'value' in b ? b.value : data !== undefined ? data : r);
    });
    return btn;
  };
  handle.setContent(opts.content);
  if (opts.buttons && opts.buttons.length) handle.setButtons(opts.buttons);
  if (opts.footer) el.append(...__nodes(opts.footer).map(n => { if (n.nodeType === 1) n.setAttribute('slot', 'footer'); return n; }));
  // Enter in a form inside the body triggers the submit button instead of a page submit
  el.addEventListener('submit', e => { if (submitBtn && el.body && el.body.contains(e.target)) { e.preventDefault(); submitBtn.click(); } });
  el.addEventListener('o-open', e => { if (e.target === el && opts.onOpen) queueMicrotask(() => opts.onOpen(handle)); });
  el.addEventListener('o-closed', e => {
    if (e.target !== el) return;
    try { opts.onClose?.(e.detail.value, e.detail.reason); } catch (err) { console.error(err); }
    resolve(e.detail.value);
    el.remove();
  });
  if (opts.className) el.addEventListener('o-open', e => { if (e.target === el) opts.className.split(/\s+/).filter(Boolean).forEach(c => el.dialog.classList.add(c)); }, { once: true });
  (opts.container || portalRoot()).append(el);
  el.open(opts.trigger);
  return handle;
}
O.modal = opts => __mountHandle('o-modal', opts, (el, o) => {
  if (o.size) el.size = o.size;
  if (o.centered) el.centered = true;
  if (o.scrollable) el.scrollable = true;
  if (o.fullscreen) el.fullscreen = o.fullscreen === true ? 'always' : o.fullscreen;
  if (o.draggable) el.draggable = true;
});
O.modal._mount = __mountHandle;
O.modal._nodes = __nodes;
O.modal.formData = __formData;
