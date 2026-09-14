/* <o-fab-action icon label href disabled>   — one speed-dial action (renders itself; place inside <o-fab>)
 * <o-fab icon label direction="up|down|start|end|radial" backdrop open>
 *   <o-fab-action icon="file-text" label="New document"></o-fab-action>
 *   <o-fab-action icon="image" label="Upload image"></o-fab-action>
 * </o-fab>
 * Plain (non-dial) FAB buttons use CSS only: <button class="o-fab" aria-label="Compose"><o-icon name="plus"></o-icon></button>
 * (add .o-fab-extended + a <span> label, .o-fab-mini, and a position class .o-fab-{position}).
 * `open` attribute / `isOpen` property (reflected; `el.open = true` also works). Methods `open()`, `close(refocus?)`, `toggle()`.
 * Events (o-fab): o-open, o-close. (o-fab-action): o-select (cancelable — preventDefault to keep the dial open).
 */
i18n.add('en', { fab: { toggle: 'Open actions', close: 'Close actions' } });

class OFabAction extends OElement {
  static props = { icon: String, label: String, href: String, disabled: { type: Boolean, reflect: true } };
  setup() {
    this.classList.add('o-fab-action');
    this.tabIndex = -1;
    this.setAttribute('role', 'button');
    this._icon = h('span', { class: 'o-fab-action-icon' });
    this._label = h('span', { class: 'o-fab-action-label' });
    this.replaceChildren(this._label, this._icon);
    on(this, 'click', () => {
      if (this.disabled || this.getAttribute('aria-disabled') === 'true') return;
      if (!this.emit('select')) return;
      const href = this.href, dial = this.closest('o-fab');
      dial?.close(true);
      if (href) setTimeout(() => { location.href = href; }, 0);
    });
    on(this, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); } });
  }
  update(changed) {
    if (changed.has('icon') || changed.has('init')) this._icon.innerHTML = this.icon ? String(icon(this.icon)) : '';
    if (changed.has('label') || changed.has('init') || changed.has('locale')) { this._label.textContent = this.label || ''; this.setAttribute('aria-label', this.label || ''); }
    if (changed.has('disabled')) this.setAttribute('aria-disabled', String(!!this.disabled));
  }
}
define('o-fab-action', OFabAction);
O.FabAction = OFabAction;

const ARROWS = { up: ['ArrowUp', 'ArrowDown'], down: ['ArrowDown', 'ArrowUp'], end: ['ArrowRight', 'ArrowLeft'], start: ['ArrowLeft', 'ArrowRight'], radial: ['ArrowUp', 'ArrowDown'] };

class OFab extends OElement {
  static props = {
    icon: { type: String, default: 'plus' }, label: String,
    direction: { type: String, default: 'up', reflect: true },
    backdrop: { type: Boolean, reflect: true },
    radius: { type: Number, default: 88 },
    isOpen: { type: Boolean, attr: 'open', reflect: true, default: false },
  };
  /** `el.open = true` also works (mirrors the `open` HTML attribute); `el.open()` opens and focuses the first action. */
  get open() { return this.__openFn || (this.__openFn = () => this._open()); }
  set open(v) { this.isOpen = !!v; }
  setup() {
    this.classList.add('o-fab-dial');
    this._triggerIcon = h('span', { class: 'o-fab-trigger-icon' });
    this._trigger = h('button', { type: 'button', class: 'o-fab o-fab-trigger', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, this._triggerIcon);
    this.prepend(this._trigger);
    on(this._trigger, 'click', () => this.toggle());
    on(this._trigger, 'keydown', e => {
      const [fwd] = ARROWS[this.direction] || ARROWS.up;
      if (e.key === fwd && !this.isOpen) { e.preventDefault(); this._open(); }
    });
    on(this, 'keydown', '.o-fab-action', (e, act) => {
      const acts = this.actions, i = acts.indexOf(act);
      const [fwd, back] = ARROWS[this.direction] || ARROWS.up;
      if (e.key === fwd) { e.preventDefault(); acts[(i + 1) % acts.length]?.focus(); }
      else if (e.key === back) { e.preventDefault(); acts[(i - 1 + acts.length) % acts.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); acts[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); acts[acts.length - 1]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
    });
  }
  connected() { this.listen(doc, 'focusin', e => { if (this.isOpen && !this.contains(e.target)) this.close(); }); }
  disconnected() { this._ov?.close('api'); this._backdrop?.remove(); this._backdrop = null; }
  update(changed) {
    if (changed.has('icon') || changed.has('isOpen') || changed.has('init')) this._triggerIcon.innerHTML = String(icon(this.isOpen ? 'x' : (this.icon || 'plus')));
    if (changed.has('label') || changed.has('isOpen') || changed.has('init') || changed.has('locale')) this._trigger.setAttribute('aria-label', this.label || (this.isOpen ? this.t('fab.close') : this.t('fab.toggle')));
    if (changed.has('isOpen') || changed.has('init')) this._paint();
    if ((changed.has('direction') || changed.has('radius') || changed.has('isOpen') || changed.has('init')) && this.direction === 'radial') this._layoutRadial();
  }
  get actions() { return $$(':scope > o-fab-action', this).filter(a => !a.disabled && a.getAttribute('aria-disabled') !== 'true'); }
  _paint() {
    const open = this.isOpen;
    this._trigger.setAttribute('aria-expanded', String(open));
    if (this.backdrop) {
      if (open && !this._backdrop) { this._backdrop = h('div', { class: 'o-fab-backdrop' }); this.before(this._backdrop); on(this._backdrop, 'click', () => this.close(true)); }
      else if (!open && this._backdrop) { this._backdrop.remove(); this._backdrop = null; }
    }
    $$(':scope > o-fab-action', this).forEach((a, i) => { a.tabIndex = open ? 0 : -1; a.style.setProperty('--o-fab-i', String(i)); });
    if (!open) { this._ov?.close('api'); this._ov = null; return; }
    this.emit('open');
    this._ov = overlays.open({
      el: this, owner: this._trigger, escape: true, outside: true, trap: false,
      onClose: reason => { this._ov = null; if (this.isOpen) { this.isOpen = false; this.emit('close', { reason }); if (reason === 'escape') this._trigger.focus(); } },
    });
  }
  _layoutRadial() {
    const acts = $$(':scope > o-fab-action', this), n = acts.length;
    acts.forEach((a, i) => {
      const frac = n > 1 ? i / (n - 1) : 0, deg = 180 - frac * 90; // sweep from 180deg (start) to 90deg (up)
      const rad = deg * Math.PI / 180;
      a.style.setProperty('--o-fab-tx', Math.round(Math.cos(rad) * this.radius) + 'px');
      a.style.setProperty('--o-fab-ty', Math.round(-Math.sin(rad) * this.radius) + 'px');
    });
  }
  /** Open the speed dial and focus the first action. */
  _open() { if (this.isOpen) return; this.isOpen = true; setTimeout(() => this.actions[0]?.focus(), 30); }
  /** Close the speed dial. */
  close(refocus) { if (!this.isOpen) return; this.isOpen = false; if (refocus) this._trigger.focus(); }
  toggle() { this.isOpen ? this.close() : this._open(); }
}
define('o-fab', OFab);
O.Fab = OFab;
