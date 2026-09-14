/* <o-presence status="online" label="Aisha Rahman"> — a single status dot + label.
 *   Statuses match <o-avatar status>: online | away | busy | dnd | offline.
 *   Set `user-id` to track a user live from Orion.presence instead of driving `status` by hand.
 * Uses the core `.o-status` / `.o-status-{status}` classes (see src/css/60-content.css) so the dot
 * matches <o-avatar status> exactly; this package only adds the missing `.o-status-dnd`.
 */
class OPresence extends OElement {
  static props = {
    status: { type: String, default: 'offline', reflect: true },
    userId: { type: String, attr: 'user-id' },
    label: String,                                    // explicit label; falls back to the store's name, then the status word
    showLabel: { type: Boolean, attr: 'show-label', default: true },
    pulse: { type: Boolean },                          // animated ring while online
    texts: Object,
  };

  setup() {
    this.classList.add('o-presence');
    this.setAttribute('role', 'status');
    this._dot = h('span', { class: 'o-status' });
    this._labelEl = h('span', { class: 'o-presence-label' });
    this.append(this._dot, this._labelEl);
  }
  disconnected() { this._unsub?.(); this._unsub = null; }
  update(changed) {
    if (changed.has('userId') || changed.has('init')) this._syncStore();
    if (changed.has('status') || changed.has('label') || changed.has('showLabel') || changed.has('pulse') || changed.has('init') || changed.has('locale')) this._paint();
  }

  _syncStore() {
    this._unsub?.(); this._unsub = null;
    this._storeLabel = null;
    if (this.userId == null || !O.presence) return;
    const apply = () => {
      const e = O.presence.entry(this.userId);
      this._storeLabel = e && e.name || null;
      this.status = e ? e.status : 'offline';
      this._paint();
    };
    apply();
    this._unsub = O.presence.subscribe(ev => { if (String(ev.userId) === String(this.userId)) apply(); });
  }
  _paint() {
    const st = PRESENCE_SET.has(this.status) ? this.status : 'offline';
    this._dot.className = cls('o-status', 'o-status-' + st, this.pulse && st === 'online' && 'o-status-pulse');
    const word = this.t('presence.' + st);
    const text = this.label || this._storeLabel ? `${this.label || this._storeLabel} · ${word}` : word;
    this._labelEl.textContent = this.showLabel ? text : '';
    this._labelEl.hidden = !this.showLabel;
    if (this.showLabel) this.removeAttribute('aria-label'); else this.setAttribute('aria-label', text);
    this.setAttribute('data-status', st);
    this.title = text;
  }
}
define('o-presence', OPresence);
O.Presence = OPresence;
