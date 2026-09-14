// @deps modal
/* Drawer (offcanvas) — <o-drawer> + Orion.drawer({ title, content, placement, size, buttons }) → handle (same as Orion.modal)
 *   <button data-o-toggle="drawer" data-o-target="#filters">Filters</button>
 *   <o-drawer id="filters" placement="end" size="md" heading="Filters">
 *     body… <div slot="footer"><button class="o-btn" data-o-dismiss="drawer">Close</button></div>
 *   </o-drawer>
 *   placement: start | end | top | bottom (logical, RTL aware)   size: sm | md | lg | full | any CSS length
 *   backdrop="false" or push[="#main"] → modeless (page stays usable; push shifts the target's margin)
 *   Same methods/events as <o-modal>: open() close(value) toggle(), o-open o-opened o-before-close o-close o-closed.
 *   Touch: swipe towards the edge to close (start/end anywhere on the panel, top/bottom on the header).
 */
const SIDES = ['start', 'end', 'top', 'bottom'];
const KEY_SIZES = ['sm', 'md', 'lg', 'xl', 'full'];

class ODrawer extends O.Modal {
  static prefix = 'o-drawer';
  static props = {
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
    heading: String,
    label: String,
    placement: { type: String, default: 'end' },
    size: { type: String, default: 'md' },
    static: Boolean,
    closable: { type: Boolean, default: true },
    backdrop: { type: Boolean, default: true },
    push: String,
    swipe: { type: Boolean, default: true },
    loading: Boolean,
    texts: Object,
  };

  setup() {
    super.setup();
    on(this.panel, 'pointerdown', e => this._swipeStart(e));
  }
  _frame() { this.wrap = null; return this.panel; }
  _isBackdrop(t) { return t === this.backdropEl; }
  _isModal() { return this.backdrop !== false && this.push == null; }
  _side() { return SIDES.includes(this.placement) ? this.placement : 'end'; }
  _paint() {
    super._paint();
    const d = this.dialog, side = this._side();
    SIDES.forEach(s => d.classList.toggle('o-drawer-' + s, s === side));
    d.classList.toggle('is-modeless', !this._isModal());
    const custom = this.size && !KEY_SIZES.includes(this.size) ? this.size : '';
    this.panel.style.setProperty('--o-drawer-size', custom);
    this.panel.style.setProperty('--o-drawer-vsize', custom);
  }
  _animIn() {
    const s = cap(this._side());
    if (this._isModal()) animate(this.backdropEl, 'fadeIn', { duration: 220 });
    return animate(this.panel, 'slideIn' + s, { duration: 260 });
  }
  _animOut() {
    const s = cap(this._side());
    if (this._isModal()) animate(this.backdropEl, 'fadeOut', { duration: 200, fill: 'forwards' });
    return animate(this.panel, 'slideOut' + s, { duration: 200, fill: 'forwards', easing: 'cubic-bezier(.4,0,1,1)' });
  }
  /* push mode: shift the target (default <body>) by the drawer width */
  _opened() {
    const side = this._side();
    if (this.push == null || (side !== 'start' && side !== 'end')) return;
    const target = (this.push && $(this.push)) || doc.body;
    const prop = side === 'start' ? 'marginInlineStart' : 'marginInlineEnd';
    this._pushed = { target, prop, prev: target.style[prop], tr: target.style.transition };
    target.style.transition = 'margin .26s cubic-bezier(.2,.8,.2,1)';
    target.style[prop] = this.panel.offsetWidth + 'px';
  }
  _closing() {
    const p = this._pushed; this._pushed = null;
    if (!p) return;
    p.target.style[p.prop] = p.prev;
    setTimeout(() => { if (!this._pushed) p.target.style.transition = p.tr; }, 300);
  }
  _finishClose(interrupted, detail) {
    super._finishClose(interrupted, detail);
    this.backdropEl.style.opacity = '';
    this.panel.classList.remove('is-swiping');
  }

  /* ── swipe to close (touch / pen) ── */
  _swipeStart(e) {
    if (!this.swipe || !this.closable || e.pointerType === 'mouse' || !e.isPrimary || this._state === 'closing' || this._state === 'closed') return;
    const side = this._side(), horiz = side === 'start' || side === 'end', panel = this.panel;
    if (!horiz && !e.target.closest('.o-drawer-header,.o-drawer-handle')) return;
    if (e.target.closest('input,textarea,select,[contenteditable],[data-no-swipe],.o-range')) return;
    if (horiz) for (let n = e.target; n && n !== panel; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return;
    const rtl = isRTL(panel);
    const sign = side === 'start' ? (rtl ? 1 : -1) : side === 'end' ? (rtl ? -1 : 1) : side === 'top' ? -1 : 1;
    const sx = e.clientX, sy = e.clientY, size = horiz ? panel.offsetWidth : panel.offsetHeight;
    let active = false, d = 0, lastD = 0, lastT = performance.now(), vel = 0;
    const snapBack = () => {
      const from = panel.style.translate || '0 0';
      panel.style.translate = ''; this.backdropEl.style.opacity = '';
      panel.animate([{ translate: from }, { translate: '0 0' }], { duration: reducedMotion() ? 0 : 180, easing: 'ease-out' });
    };
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, along = horiz ? dx : dy, cross = horiz ? dy : dx;
      if (!active) {
        if (Math.abs(along) < 8 && Math.abs(cross) < 8) return;
        if (Math.abs(cross) > Math.abs(along) || along * sign < 0) { stop(); return; }
        active = true; panel.classList.add('is-swiping');
        try { panel.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      d = Math.max(0, along * sign);
      const now = performance.now(); vel = (d - lastD) / Math.max(1, now - lastT); lastD = d; lastT = now;
      panel.style.translate = horiz ? `${d * sign}px 0` : `0 ${d * sign}px`;
      if (this._isModal()) this.backdropEl.style.opacity = String(Math.max(0.15, 1 - d / size));
    };
    const up = () => {
      stop();
      if (!active) return;
      panel.classList.remove('is-swiping');
      if ((d > size * 0.3 || vel > 0.45) && this._request('swipe')) return;
      snapBack();
    };
    const offs = [on(panel, 'pointermove', move), on(panel, 'pointerup pointercancel', up)];
    const stop = () => offs.splice(0).forEach(f => f());
  }
}
define('o-drawer', ODrawer);
O.Drawer = ODrawer;

action('drawer', (trigger, e, target) => { if (target instanceof ODrawer) target.toggle(trigger); });
action('dismiss:drawer', trigger => { const d = trigger.closest('o-drawer'); if (d && d._request) d._request('dismiss', trigger.getAttribute('data-o-value') ?? undefined); });

O.drawer = opts => O.modal._mount('o-drawer', opts, (el, o) => {
  if (o.placement) el.placement = o.placement;
  if (o.size) el.size = o.size;
  if (o.push != null && o.push !== false) el.push = o.push === true ? '' : o.push;
  if (o.swipe === false) el.swipe = false;
});
