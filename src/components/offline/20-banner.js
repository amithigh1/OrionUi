/* <o-offline-banner position="top|bottom|inline" online-duration="3000"></o-offline-banner>
 *   Appears automatically while offline (i18n common.offline), shows queued changes and a Retry button,
 *   then a transient "Back online" / "Syncing…" message. state="auto|offline|online|syncing" forces a state (docs/tests).
 *   Orion.offline.banner({ position }) -> element (adds one to <body> if none exists)
 *   Events: o-show, o-hide, o-retry (cancelable)
 */
class OOfflineBanner extends OElement {
  static props = {
    position: { type: String, default: 'top', reflect: true },
    onlineDuration: { type: Number, default: 3000 },
    state: { type: String, default: 'auto' },
    showQueue: { type: Boolean, default: true },
    texts: Object,
  };

  setup() {
    this.classList.add('o-offline-banner');
    this.setAttribute('role', 'status');
    this.setAttribute('aria-live', 'polite');
    this.hidden = true;
    this._icon = h('span', { class: 'o-offline-banner-icon', 'aria-hidden': 'true' });
    this._msg = h('span', { class: 'o-offline-banner-msg' });
    this._sub = h('span', { class: 'o-offline-banner-sub' });
    this._retry = h('button', { type: 'button', class: 'o-btn o-btn-sm o-offline-banner-btn' });
    this._close = h('button', { type: 'button', class: 'o-btn-close o-btn-close-sm o-offline-banner-close' });
    this.replaceChildren(h('div', { class: 'o-offline-banner-inner' }, this._icon, h('span', { class: 'o-offline-banner-text' }, this._msg, this._sub), this._retry, this._close));
    on(this._retry, 'click', () => this.retry());
    on(this._close, 'click', () => { this._dismissed = this._view; this._show(false); });
    this._view = null;
  }
  connected() {
    const off = O.offline;
    if (off) {
      this.addCleanup(off.onChange(() => this._sync('change')));
      this.addCleanup(off.queue.onChange(() => this._sync('queue')));
      this.addCleanup(off.on('sync-start', ({ total }) => { this._syncing = total; this._sync('sync'); }));
      this.addCleanup(off.on('sync', r => { this._syncing = 0; this._lastSync = r; this._sync('synced'); }));
    }
    this._sync('init');
  }
  disconnected() { clearTimeout(this._timer); }
  update(changed) { if (!changed.has('init')) this._sync('props'); }

  /** Retry: probe connectivity, then replay the queue. */
  async retry() {
    if (!this.emit('retry')) return;
    const off = O.offline;
    if (!off) return;
    this._retry.classList.add('is-loading');
    this._retry.setAttribute('aria-busy', 'true');
    try {
      const ok = await off.check();
      if (ok) await off.sync();
      else announce(this.t('offline.stillOffline'));
    } finally { this._retry.classList.remove('is-loading'); this._retry.removeAttribute('aria-busy'); this._sync('retry'); }
  }

  _compute() {
    if (this.state && this.state !== 'auto') return this.state;
    const off = O.offline;
    const offline = off ? off.isOffline : isBrowser && navigator.onLine === false;
    if (offline) return 'offline';
    if (this._syncing) return 'syncing';
    return this._wasOffline ? 'online' : null;
  }
  _sync(reason) {
    if (!this._setupDone) return;
    const view = this._compute();
    const q = O.offline?.queue?.size || 0;
    if (view === 'offline') this._wasOffline = true;
    clearTimeout(this._timer);
    if (!view || (this._dismissed && this._dismissed === view && reason !== 'change')) { this._show(false); return; }
    this._dismissed = null;
    const forced = this.state && this.state !== 'auto';
    this._view = view;
    this.dataset.state = view;
    this._icon.innerHTML = String(icon(view === 'offline' ? 'wifi-off' : view === 'syncing' ? 'refresh' : 'check-circle', { class: view === 'syncing' ? 'o-icon-spin' : '' }));
    this._msg.textContent = view === 'offline' ? this.t('common.offline') : view === 'syncing' ? this.t('offline.syncing', { count: this._syncing || q }) : this.t('common.online');
    let sub = '';
    if (view === 'offline' && this.showQueue && q) sub = this.t('offline.queued', { count: q });
    else if (view === 'online' && this._lastSync?.failed) sub = this.t('offline.failed', { count: this._lastSync.failed });
    else if (view === 'online' && this._lastSync?.sent) sub = this.t('offline.synced');
    this._sub.textContent = sub;
    this._sub.hidden = !sub;
    this._retry.hidden = view !== 'offline';
    this._retry.textContent = this.t('offline.retry');
    this._close.setAttribute('aria-label', this.t('offline.dismiss'));
    this.setAttribute('role', view === 'offline' ? 'alert' : 'status');
    this._show(true);
    if (view === 'online' && !forced) this._timer = setTimeout(() => { this._wasOffline = false; this._lastSync = null; this._show(false); }, this.onlineDuration);
  }
  _show(v) {
    if (!v === this.hidden) return;
    if (v) {
      this.hidden = false;
      if (this.position !== 'inline') animate(this, this.position === 'bottom' ? 'slideInUp' : 'slideInDown', { duration: 200 });
      this.emit('show', { state: this._view });
    } else {
      const done = () => { this.hidden = true; this.emit('hide'); };
      if (this.position !== 'inline' && !reducedMotion()) animate(this, 'fadeOut', { duration: 150 }).then(done); else done();
    }
  }
}
define('o-offline-banner', OOfflineBanner);
O.OfflineBanner = OOfflineBanner;
if (O.offline) {
  /** banner({ position: 'top' | 'bottom' }) -> the (single) body-level banner */
  O.offline.banner = (opts = {}) => {
    if (!isBrowser) return null;
    let el = doc.querySelector('body > o-offline-banner');
    if (!el) { el = doc.createElement('o-offline-banner'); doc.body.appendChild(el); }
    Object.assign(el, opts);
    return el;
  };
}
