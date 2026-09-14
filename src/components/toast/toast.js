/* Toast — Orion.toast(text | { title, text, html, type, duration, position, action, closable, progress, icon, id }) → { update, close }
 *   Orion.toast.success('Saved') · .error · .warning · .info · .loading
 *   Orion.toast.promise(promise, { loading, success, error }) · Orion.toast.clear() · Orion.toast.config({ position, max, duration })
 * Stacked cards per position (expand on hover/focus), timers pause on hover/focus/hidden tab, swipe to dismiss,
 * containers follow the top-most modal <dialog> so toasts stay visible and clickable above modals.
 */
i18n.add('en', { toast: { region: 'Notifications (Alt+T)', close: 'Close notification' } });

const TOAST_POS = ['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end'];
const TOAST_TYPES = ['success', 'error', 'warning', 'info', 'loading', 'default'];
const TOAST_ICONS = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
const cfg = { position: 'top-end', max: 5, duration: 4000, expand: false, gap: 10, visible: 3 };
const PEEK = 14;
const boxes = new Map();
const byId = new Map();
let __bound = false;

/** Top-most open modal <dialog> (top layer) — toasts must live inside it to stay interactive. */
function topModal() {
  const isModal = d => { try { return d.open && d.matches(':modal'); } catch { return false; } };
  for (let i = overlays.stack.length - 1; i >= 0; i--) { const el = overlays.stack[i].el; if (el && el.localName === 'dialog' && isModal(el)) return el; }
  const all = $$('dialog[open]').filter(isModal);
  return all[all.length - 1] || null;
}
function rehost() {
  const host = topModal() || doc.body;
  boxes.forEach(b => { if (b.el.parentNode !== host) host.appendChild(b.el); });
}
function bindGlobal() {
  if (__bound) return;
  __bound = true;
  on(doc, 'visibilitychange', () => boxes.forEach(sync));
  doc.addEventListener('close', () => setTimeout(rehost), true); // a <dialog> closed (non-bubbling, so capture)
  bus.on('overlay:open', () => boxes.size && rehost());
  bus.on('overlay:close', () => boxes.size && setTimeout(rehost, 260));
  on(doc, 'keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyT') return;
    const list = [...boxes.values()].flatMap(b => b.list);
    if (!list.length) return;
    e.preventDefault();
    list[0].el.focus();
  });
}
function box(pos) {
  let b = boxes.get(pos);
  if (!b) {
    const el = h('section', { class: 'o-toasts o-toasts-' + pos, 'data-side': pos.split('-')[0], role: 'region', 'aria-label': t('toast.region') });
    el.style.zIndex = String(Z.toast);
    b = { el, pos, list: [], hover: false, focus: false, top: pos.startsWith('top') };
    on(el, 'pointerenter', e => { if (e.pointerType === 'mouse') { b.hover = true; sync(b); } });
    on(el, 'pointerleave', () => { if (b.hover) { b.hover = false; sync(b); } });
    on(el, 'focusin', () => { b.focus = true; sync(b); });
    on(el, 'focusout', e => { if (!el.contains(e.relatedTarget)) { b.focus = false; sync(b); } });
    boxes.set(pos, b);
    bindGlobal();
  }
  if (!b.el.isConnected) (topModal() || doc.body).appendChild(b.el); else rehost();
  return b;
}
function sync(b) {
  const paused = b.hover || b.focus || doc.hidden;
  b.list.forEach(x => (paused ? x.pause() : x.resume()));
  layout(b);
}
/** Position every toast of a container: collapsed stack (peeking cards) or expanded list. */
function layout(b) {
  const list = b.list, exp = cfg.expand || b.hover || b.focus;
  list.forEach(x => { x.el.style.height = ''; });
  const hs = list.map(x => x.el.offsetHeight);
  const front = hs[0] || 0, dir = b.top ? 1 : -1;
  let acc = 0;
  list.forEach((x, i) => {
    const s = x.el.style, behind = !exp && i > 0, hiddenCard = !exp && i >= cfg.visible;
    const y = exp ? acc : i * PEEK;
    acc += hs[i] + cfg.gap;
    if (behind) s.height = front + 'px';
    s.transformOrigin = b.top ? 'center bottom' : 'center top';
    s.transform = `translateY(${dir * y}px) scale(${exp ? 1 : 1 - i * 0.05})`;
    s.zIndex = String(list.length - i);
    x.el.classList.toggle('is-behind', behind);
    x.el.classList.toggle('is-hidden', hiddenCard);
  });
  b.el.style.height = (exp ? Math.max(0, acc - cfg.gap) : front + Math.max(0, Math.min(list.length, cfg.visible) - 1) * PEEK) + 'px';
  b.el.classList.toggle('is-expanded', !!exp);
}
const asOpts = v => (v == null || v === false ? null : isStr(v) || v instanceof Node ? { text: v } : v);

class Toast {
  constructor(opts) {
    this.id = opts.id != null ? String(opts.id) : uid('toast');
    this.o = opts;
    this.el = h('div', { class: 'o-toast', tabindex: '-1', 'aria-atomic': 'true' });
    this.handle = { id: this.id, el: this.el, update: o => (this.update(o), this.handle), close: () => this.close('api') };
    on(this.el, 'click', '.o-toast-close', () => this.close('close'));
    on(this.el, 'click', '.o-toast-action', ev => {
      let r; try { r = this.o.action?.onClick?.(this.handle, ev); } catch (err) { console.error('[Orion] toast action:', err); }
      if (r !== false) this.close('action');
    });
    on(this.el, 'keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); this.close('escape'); } });
    on(this.el, 'pointerdown', e => this.swipe(e));
    byId.set(this.id, this);
    this.render();
    this.mount();
  }
  get pos() { const p = this.o.position || cfg.position; return TOAST_POS.includes(p) ? p : 'top-end'; }
  mount() {
    const b = this.b = box(this.pos);
    b.list.unshift(this);
    b.el.prepend(this.el);
    while (b.list.length > Math.max(1, cfg.max)) b.list[b.list.length - 1].close('overflow');
    this.start();
    layout(b);
    animate(this.el, [{ opacity: 0, translate: b.top ? '0 -100%' : '0 100%' }, { opacity: 1, translate: '0 0' }], { duration: 320 });
  }
  update(opts) {
    if (this.closed) return;
    const prevPos = this.pos;
    this.o = { ...this.o, ...opts };
    if ('duration' in opts && opts.duration === undefined) delete this.o.duration;
    this.render();
    if (this.pos !== prevPos) { const b = this.b; b.list.splice(b.list.indexOf(this), 1); layout(b); this.mount(); return; }
    this.start();
    layout(this.b);
  }
  render() {
    const o = this.o, type = o.type === 'danger' ? 'error' : TOAST_TYPES.includes(o.type) ? o.type : 'default';
    const closable = o.closable ?? type !== 'loading';
    this.el.className = cls('o-toast', 'o-toast-' + type, o.className, { 'has-progress': o.progress, 'has-title': o.title, 'is-closable': closable });
    this.el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    this.el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    const ic = o.icon === false ? null : o.icon ? o.icon : type === 'loading' ? 'spinner' : TOAST_ICONS[type];
    const iconBox = ic ? h('span', { class: 'o-toast-icon' }, ic === 'spinner' ? h('span', { class: 'o-spinner o-spinner-sm o-spinner-inherit' }) : icon(ic)) : null;
    const text = o.html != null ? h('div', { class: 'o-toast-text', html: sanitize(o.html) }) : o.text != null && o.text !== '' ? h('div', { class: 'o-toast-text' }, o.text) : null;
    const content = h('div', { class: 'o-toast-content' }, o.title ? h('div', { class: 'o-toast-title' }, o.title) : null, text);
    const act = o.action ? h('button', { type: 'button', class: 'o-btn o-btn-sm o-toast-action' }, o.action.text ?? o.action.label ?? '') : null;
    const close = closable ? h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-toast-close', 'aria-label': t('toast.close') }) : null;
    this.bar = o.progress ? h('div', { class: 'o-toast-progress', 'aria-hidden': 'true' }) : null;
    this.el.replaceChildren(...[iconBox, content, act, close, this.bar].filter(Boolean));
  }
  duration() {
    const o = this.o;
    if (o.duration != null) return Math.max(0, +o.duration || 0);
    if (o.type === 'loading') return 0;
    return cfg.duration * (o.type === 'error' || o.type === 'danger' ? 1.5 : 1);
  }
  start() {
    clearTimeout(this._timer); this._run = false;
    this._anim?.cancel(); this._anim = null;
    this._total = this._rem = this.duration();
    if (!this._total) return;
    if (this.bar && this.bar.animate) { this._anim = this.bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: this._total, fill: 'forwards' }); this._anim.pause(); }
    this.resume();
  }
  pause() {
    if (!this._run) return;
    this._run = false;
    clearTimeout(this._timer);
    this._rem -= Date.now() - this._t0;
    this._anim?.pause();
  }
  resume() {
    if (this._run || this.closed || !this._total || this._rem <= 0) return;
    const b = this.b;
    if (b && (b.hover || b.focus || doc.hidden)) return;
    this._run = true;
    this._t0 = Date.now();
    this._timer = setTimeout(() => this.close('timeout'), this._rem);
    this._anim?.play();
  }
  close(reason = 'api', dir = 0) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this._timer); this._anim?.cancel();
    if (byId.get(this.id) === this) byId.delete(this.id);
    const b = this.b, i = b.list.indexOf(this);
    if (i >= 0) b.list.splice(i, 1);
    const hadFocus = this.el.contains(doc.activeElement);
    this.el.classList.add('is-leaving');
    const frames = dir ? [{ opacity: 1 }, { opacity: 0, translate: `${dir * 110}% 0` }] : [{ opacity: 1 }, { opacity: 0, translate: b.top ? '0 -40%' : '0 40%' }];
    const gone = () => { this.el.remove(); if (hadFocus && b.list[0]) b.list[0].el.focus(); else if (hadFocus) { b.focus = false; sync(b); } };
    (this.el.classList.contains('is-hidden') ? Promise.resolve() : animate(this.el, frames, { duration: 200, fill: 'forwards' })).then(gone);
    layout(b);
    try { this.o.onClose?.(reason); } catch (err) { console.error(err); }
  }
  /* swipe to dismiss (touch / pen) */
  swipe(e) {
    if (e.pointerType === 'mouse' || !e.isPrimary || e.target.closest('button,a,input,textarea,select')) return;
    const el = this.el, sx = e.clientX, sy = e.clientY, w = el.offsetWidth || 1;
    let dx = 0, active = false, lx = sx, lt = performance.now(), v = 0;
    const move = ev => {
      const ddx = ev.clientX - sx;
      if (!active) {
        if (Math.abs(ddx) < 8 && Math.abs(ev.clientY - sy) < 8) return;
        if (Math.abs(ev.clientY - sy) > Math.abs(ddx)) { stop(); return; }
        active = true; el.classList.add('is-swiping');
        try { el.setPointerCapture(ev.pointerId); } catch {}
        this.pause();
      }
      const now = performance.now(); v = (ev.clientX - lx) / Math.max(1, now - lt); lx = ev.clientX; lt = now;
      dx = ddx;
      el.style.translate = `${dx}px 0`;
      el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / w));
    };
    const up = () => {
      stop();
      if (!active) return;
      el.classList.remove('is-swiping');
      if (Math.abs(dx) > w * 0.35 || Math.abs(v) > 0.5) { el.style.translate = ''; el.style.opacity = ''; this.close('swipe', Math.sign(dx || v)); return; }
      const from = el.style.translate;
      el.style.translate = ''; el.style.opacity = '';
      el.animate([{ translate: from }, { translate: '0 0' }], { duration: reducedMotion() ? 0 : 180, easing: 'ease-out' });
      sync(this.b);
    };
    const offs = [on(el, 'pointermove', move), on(el, 'pointerup pointercancel', up)];
    const stop = () => offs.splice(0).forEach(f => f());
  }
}

/** Orion.toast(text | options, extra?) → handle { id, el, update(opts), close() } */
function toast(input, extra) {
  if (!isBrowser) return { id: '', el: null, update: noop, close: noop };
  const opts = { ...(isStr(input) || input instanceof Node ? { text: input } : input || {}), ...(extra || {}) };
  if (opts.id != null && byId.has(String(opts.id))) { const x = byId.get(String(opts.id)); x.update(opts); return x.handle; }
  return new Toast(opts).handle;
}
['success', 'error', 'warning', 'info', 'loading'].forEach(type => { toast[type] = (text, opts) => toast(text, { ...(opts || {}), type }); });
toast.promise = function (p, msgs = {}, opts = {}) {
  const id = opts.id != null ? opts.id : uid('toast');
  const pick = (m, arg, fallback) => asOpts(isFn(m) ? m(arg) : m === undefined ? fallback : m);
  const handle = toast({ ...opts, ...(pick(msgs.loading, undefined, t('common.loading')) || {}), id, type: 'loading', duration: 0 });
  const promise = Promise.resolve(isFn(p) ? p() : p);
  const settle = (type, m, arg) => {
    const o = pick(m, arg, type === 'error' ? (arg && arg.message) || t('common.error') : t('common.success'));
    if (!o) return handle.close();
    handle.update({ closable: true, duration: undefined, ...opts, ...o, type: o.type || type });
  };
  promise.then(r => settle('success', msgs.success, r), e => settle('error', msgs.error, e));
  return promise;
};
toast.close = id => { const x = byId.get(String(id)); if (x) x.close('api'); };
toast.clear = () => boxes.forEach(b => [...b.list].forEach(x => x.close('clear')));
toast.config = (o = {}) => {
  if (o.position && !TOAST_POS.includes(o.position)) delete o.position;
  Object.assign(cfg, o);
  boxes.forEach(layout);
  return { ...cfg };
};
O.toast = toast;
