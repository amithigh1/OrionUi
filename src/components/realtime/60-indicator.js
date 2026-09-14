/* <o-live-indicator for="clientId | auto"></o-live-indicator>
 *   Connection status dot + label: Connected / Connecting… / Reconnecting… / Disconnected / Offline.
 *   for="auto" (default) aggregates every Orion.ws / sse / signalr client; `el.client = ws` binds one client directly.
 *   Attributes: compact (dot only, label for screen readers + tooltip), pill (bordered chip). Event: o-change { status }.
 */
const LIVE_MAP = {
  open: ['connected', 'good'], connecting: ['connecting', 'warning'], reconnecting: ['reconnecting', 'warning'],
  closed: ['disconnected', 'critical'], idle: ['idle', 'idle'], offline: ['offline', 'idle'],
};
class OLiveIndicator extends OElement {
  static props = {
    for: { type: String, default: 'auto' },
    compact: { type: Boolean, reflect: true },
    pill: { type: Boolean, reflect: true },
    client: { type: Object, attr: false },
    texts: Object,
  };
  setup() {
    this.classList.add('o-live-indicator');
    this.setAttribute('role', 'status');
    this._dot = h('span', { class: 'o-live-dot', 'aria-hidden': 'true' });
    this._label = h('span', { class: 'o-live-label' });
    this.replaceChildren(this._dot, this._label);
  }
  connected() {
    this.addCleanup(O.realtime.onStatus(() => this.paint()));
    this.listen(win, 'online offline', () => this.paint());
    if (O.offline) this.addCleanup(O.offline.onChange(() => this.paint()));
  }
  update() { this.paint(); }
  /** Current status: open | connecting | reconnecting | closed | idle | offline */
  get status() {
    if (rtOffline()) return 'offline';
    const c = this.client || (this.for && this.for !== 'auto' ? rtClients.get(this.for) : null);
    if (c) return c.status || 'idle';
    return this.for && this.for !== 'auto' ? 'idle' : rtAggregate();
  }
  paint() {
    if (!this._setupDone) return;
    const s = this.status;
    const [key, tone] = LIVE_MAP[s] || LIVE_MAP.idle;
    const label = this.t('realtime.' + key);
    this._label.textContent = label;
    this.dataset.status = s;
    this.dataset.tone = tone;
    this.title = this.t('realtime.status', { status: label });
    this.setAttribute('aria-label', this.title);
    if (this._last !== s) { const first = this._last === undefined; this._last = s; if (!first) this.emit('change', { status: s }); }
  }
}
define('o-live-indicator', OLiveIndicator);
O.LiveIndicator = OLiveIndicator;
