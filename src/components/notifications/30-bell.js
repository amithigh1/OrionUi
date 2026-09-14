/* <o-notification-bell> — header bell button with an unread badge; opens a floating panel containing
 * an internal <o-notifications compact> (built once, reused). Both elements read the same shared
 * Orion.notifications store, so the badge count and the panel's contents are always in sync with each
 * other and with any other bell/list on the page — no wiring needed beyond feeding the store.
 *   max            — collapse the count to "{max}+" past this (default 99).
 *   show-dot       — a plain dot instead of the number (reuses .o-badge-counter:empty).
 *   placement      — floating placement for the panel (default 'bottom-end').
 * Methods: open() close() toggle(). Events: o-open o-close ({reason}) o-select ({item}) o-dismiss ({item}).
 */
class ONotificationBell extends OElement {
  static props = {
    max: { type: Number, default: 99 },
    showDot: { type: Boolean, attr: 'show-dot' },
    placement: { type: String, default: 'bottom-end' },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-notification-bell');
    this._btn = h('button', { type: 'button', class: 'o-notif-bell-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
      icon('bell'), h('span', { class: 'o-badge o-badge-counter', hidden: true }));
    this._badge = this._btn.querySelector('.o-badge-counter');
    this.append(this._btn);
    on(this._btn, 'click', () => this.toggle());
  }
  connected() {
    if (O.notifications) this._unsub = O.notifications.on('change', () => this._paintBadge());
    this._paintBadge();
  }
  disconnected() { this.close(); this._unsub?.(); this._unsub = null; }
  update(changed) {
    if (changed.has('label') || changed.has('init') || changed.has('locale')) this._btn.setAttribute('aria-label', this.label || this.t('notif.ariaLabel'));
    if (changed.has('max') || changed.has('showDot') || changed.has('init')) this._paintBadge();
  }

  /* ── public API ──────────────────────────────────────────────────────── */
  open() {
    if (this._ov) return;
    if (!this.emit('before-open')) return;
    const panel = this._panel || (this._panel = this._buildPanel());
    portal(panel, this);
    panel.hidden = false;
    this._unplace = autoPlace(panel, this._btn, { placement: this.placement || 'bottom-end', offset: 8, flip: true });
    this._ov = overlays.open({
      el: panel, owner: this,
      onClose: reason => { this._ov = null; this._unplace?.(); panel.hidden = true; this._btn.setAttribute('aria-expanded', 'false'); this.classList.remove('is-open'); this.emit('close', { reason }); },
    });
    this._btn.setAttribute('aria-expanded', 'true');
    this.classList.add('is-open');
    animate(panel, 'zoomIn', { duration: 120 });
    this.emit('open');
  }
  close() { this._ov?.close('api'); }
  toggle() { this._ov ? this.close() : this.open(); }

  /* ── internal ────────────────────────────────────────────────────────── */
  _buildPanel() {
    const panel = h('div', { class: 'o-floating o-notif-bell-panel' });
    const list = h('o-notifications', { compact: true });
    on(list, 'o-select', e => { this.emit('select', e.detail); this.close(); });
    on(list, 'o-dismiss', e => this.emit('dismiss', e.detail));
    panel.append(list);
    return panel;
  }
  _paintBadge() {
    const n = O.notifications ? O.notifications.unreadCount : 0;
    this._btn.classList.toggle('has-unread', !!n);
    this._badge.hidden = !n;
    this._badge.textContent = !n || this.showDot ? '' : (n > this.max ? this.max + '+' : String(n));
  }
}
define('o-notification-bell', ONotificationBell);
O.NotificationBell = ONotificationBell;
