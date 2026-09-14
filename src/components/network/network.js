/* Orion.network — online/offline + connection quality, and the <o-network-status> indicator.
 *   Orion.network.online | status ('online'|'slow'|'offline') | effectiveType | rtt | downlink | saveData
 *   Orion.network.onChange(({ status, from, online, effectiveType, rtt, downlink }) => …) -> off()
 *   await Orion.network.check(url?)     ping (detects "lie-fi"); Orion.network.simulate('offline'|'slow'|null)
 *   <o-network-status variant="dot|badge|full" toast hide-online></o-network-status>
 */
i18n.add('en', {
  network: {
    online: 'Online', offline: 'Offline', slow: 'Slow connection', status: 'Network status: {status}',
    backOnline: 'You are back online', wentOffline: 'You are offline. Changes will sync when the connection returns.',
    wentSlow: 'Your connection is slow. Some features may take longer.', onlineDesc: 'Connected',
    offlineDesc: 'Check your connection. We will keep trying.', slowDesc: 'Pages and uploads may take longer than usual.',
    retry: 'Retry', checking: 'Checking…',
  },
});
if (!O.icons.has('wifi')) O.icons.add({ wifi: '<path d="M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01"/>' });
if (!O.icons.has('wifi-low')) O.icons.add({ 'wifi-low': '<path d="M8.5 16.4a5 5 0 0 1 7 0M12 20h.01"/><path d="M5 12.9a10 10 0 0 1 14 0M2 8.8a15 15 0 0 1 20 0" opacity=".3"/>' });

const __net = new Emitter();
const SIM = { offline: { online: false }, slow: { online: true, effectiveType: '2g', rtt: 1400, downlink: 0.25 }, online: { online: true, effectiveType: '4g', rtt: 50, downlink: 10 } };
let __sim = null, __unreachable = false, __last = null, __retryT = 0;
const conn = () => (isBrowser && win.navigator.connection) || {};

const network = {
  /** Slow when effectiveType is listed, or rtt/downlink cross these limits. */
  thresholds: { types: ['slow-2g', '2g'], rtt: 900, downlink: 0.4 },
  get online() { return __sim ? SIM[__sim].online : isBrowser ? win.navigator.onLine !== false && !__unreachable : true; },
  get effectiveType() { return __sim ? SIM[__sim].effectiveType ?? null : conn().effectiveType ?? null; },
  get rtt() { return __sim ? SIM[__sim].rtt ?? null : conn().rtt ?? null; },
  get downlink() { return __sim ? SIM[__sim].downlink ?? null : conn().downlink ?? null; },
  get saveData() { return !!conn().saveData; },
  get type() { return conn().type ?? null; },
  get slow() { return network.status === 'slow'; },
  get status() {
    if (!network.online) return 'offline';
    const th = network.thresholds, et = network.effectiveType, rtt = network.rtt, dl = network.downlink;
    return (et && th.types.includes(et)) || (rtt != null && rtt >= th.rtt) || (dl != null && dl > 0 && dl < th.downlink) ? 'slow' : 'online';
  },
  /** Snapshot of the current state. */
  info() { const n = network; return { status: n.status, online: n.online, effectiveType: n.effectiveType, rtt: n.rtt, downlink: n.downlink, saveData: n.saveData, simulated: __sim }; },
  onChange(fn) { return __net.on('change', fn); },
  /** Ping a URL (default: this page, HEAD, no-store). Resolves true when reachable; updates status. */
  async check(url, { timeout = 5000 } = {}) {
    if (!isBrowser || !win.fetch) return network.online;
    const ctl = win.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl?.abort(), timeout);
    let ok = false;
    try { const r = await fetch(url || location.href.split('#')[0], { method: 'HEAD', cache: 'no-store', signal: ctl?.signal }); ok = r.ok || r.type === 'opaque' || r.status < 500; }
    catch { ok = false; }
    clearTimeout(tm);
    __unreachable = !ok && win.navigator.onLine !== false;
    __changed();
    clearTimeout(__retryT);
    if (__unreachable) __retryT = setTimeout(() => network.check(url, { timeout }), 15000);
    return ok;
  },
  /** simulate('offline' | 'slow' | 'online' | null) — preview UI states (docs, tests). */
  simulate(s) { __sim = SIM[s] ? s : null; __changed(); return network; },
};

function __changed() {
  const info = network.info(), key = `${info.status}|${info.effectiveType}|${info.rtt}|${info.downlink}`;
  if (__last && __last.key === key) return;
  const from = __last?.status ?? null;
  __last = { key, status: info.status };
  if (from === null) return;
  const detail = { ...info, from };
  __net.emit('change', detail);
  bus.emit('network:change', detail);
  if (from !== info.status) __notify(info.status, from);
}
function __notify(status, from) {
  const msg = status === 'offline' ? t('network.wentOffline') : status === 'slow' ? t('network.wentSlow') : from === 'offline' ? t('network.backOnline') : null;
  if (!msg) return;
  announce(msg, status === 'offline' ? 'assertive' : 'polite');
  if (isFn(O.toast) && $$('o-network-status[toast]').length) {
    try { O.toast(msg, { type: status === 'offline' ? 'danger' : status === 'slow' ? 'warning' : 'success' }); } catch (e) { console.warn('[Orion] network toast', e); }
  }
}
if (isBrowser) {
  __changed();
  on(win, 'online offline', () => { if (win.navigator.onLine) __unreachable = false; __changed(); });
  conn().addEventListener?.('change', __changed);
}

const NET = { online: ['success', 'wifi', 'online'], slow: ['warning', 'wifi-low', 'away'], offline: ['danger', 'wifi-off', 'busy'] };

class ONetworkStatus extends OElement {
  static props = { variant: { type: String, default: 'badge', reflect: true }, toast: Boolean, hideOnline: { type: Boolean, reflect: true }, texts: Object };
  setup() {
    this.classList.add('o-network-status');
    on(this, 'click', '.o-net-retry', async (e, b) => {
      b.classList.add('is-loading'); b.setAttribute('aria-busy', 'true');
      await network.check();
      b.classList.remove('is-loading'); b.removeAttribute('aria-busy');
      this.requestUpdate('status');
    });
  }
  connected() { this.addCleanup(network.onChange(() => this.requestUpdate('status'))); this.requestUpdate('status'); }
  get status() { return network.status; }
  render() {
    const st = network.status, [color, ic, dot] = NET[st], label = this.t('network.' + st);
    this.dataset.status = st;
    this.hidden = this.hideOnline && st === 'online';
    this.title = this.t('network.status', { status: label });
    const v = this.variant;
    if (v === 'dot') {
      this.setAttribute('role', 'img'); this.setAttribute('aria-label', this.title);
      this.innerHTML = `<span class="o-status o-status-${dot}${st === 'offline' ? ' o-status-pulse' : ''}" aria-hidden="true"></span>`;
    } else if (v === 'full') {
      this.removeAttribute('role'); this.removeAttribute('aria-label');
      const n = network, parts = [];
      if (st !== 'offline') {
        if (n.effectiveType) parts.push(n.effectiveType.toUpperCase());
        if (n.downlink != null) parts.push(fmt.number(n.downlink, { maximumFractionDigits: 1 }) + ' Mbps');
        if (n.rtt != null) parts.push(fmt.number(n.rtt) + ' ms');
      }
      const desc = this.t('network.' + st + 'Desc');
      this.innerHTML = String(html`<div class="o-net-full o-alert o-alert-${color}">${icon(ic)}<div class="o-alert-content"><div class="o-alert-title">${label}</div><div class="o-net-desc">${desc}${parts.length ? ' · ' : ''}<span class="o-net-meta">${parts.join(' · ')}</span></div></div>${st === 'offline' ? html`<button type="button" class="o-btn o-btn-sm o-net-retry">${icon('refresh')}<span>${this.t('network.retry')}</span></button>` : ''}</div>`);
    } else {
      this.removeAttribute('role'); this.removeAttribute('aria-label');
      this.innerHTML = String(html`<span class="o-badge o-badge-soft-${color} o-net-badge">${icon(ic)}${label}</span>`);
    }
    if (this._st && this._st !== st) this.emit('change', { status: st, from: this._st });
    this._st = st;
  }
}
define('o-network-status', ONetworkStatus);
O.NetworkStatus = ONetworkStatus;
O.network = network;
