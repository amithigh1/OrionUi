/* Realtime shared pieces: backoff, client registry (for <o-live-indicator>), transport resolution, mock registry.
 *   Orion.realtime.clients (Map id -> client) · Orion.realtime.get(id) · Orion.realtime.status() (aggregate)
 *   Orion.realtime.onStatus(fn({ id, status, client })) -> off · Orion.realtime.backoff(attempt, opts)
 */
i18n.add('en', {
  realtime: {
    connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', disconnected: 'Disconnected', offline: 'Offline',
    idle: 'Not connected', live: 'Live', lastUpdate: 'Updated {time}', status: 'Connection status: {status}',
  },
});

const isInst = (v, C) => typeof C !== 'undefined' && v instanceof C;
const RT_RESERVED =new Set(['open', 'close', 'error', 'status', 'message', 'reconnecting', 'reconnected', 'queued', 'pong', 'timeout', 'giveup', '*']);
const RT_RECONNECT = { min: 500, max: 30000, factor: 2, jitter: 0.5, maxRetries: Infinity };
const rtClients = new Map();
const rtEm = new Emitter();
const rtMocks = { ws: [], http: [], sse: [] };

/** attempt 1.. -> delay in ms (exponential, +/- jitter fraction, capped) */
function rtBackoff(attempt, o = {}) {
  const r = { ...RT_RECONNECT, ...o };
  const base = Math.min(r.max, r.min * r.factor ** Math.max(0, attempt - 1));
  return Math.max(0, Math.round(Math.min(r.max, base * (1 + (Math.random() * 2 - 1) * (r.jitter || 0)))));
}
const rtNormReconnect = r => (r === false || r === 0 ? null : r === true || r == null ? { ...RT_RECONNECT } : isNum(r) ? { ...RT_RECONNECT, maxRetries: r } : { ...RT_RECONNECT, ...r });
const rtOffline = () => (O.offline ? O.offline.isOffline : isBrowser && navigator.onLine === false);

function rtRegister(client) { rtClients.set(client.id, client); rtNotify(client); }
function rtUnregister(client) { if (rtClients.get(client.id) === client) rtClients.delete(client.id); rtNotify(client, true); }
function rtNotify(client, removed = false) {
  const detail = { id: client.id, status: removed ? 'removed' : client.status, client };
  rtEm.emit('status', detail);
  bus.emit('realtime:status', detail);
  if (isBrowser) emit(doc, 'o-realtime-status', detail);
}
/** Aggregate status across clients: offline > reconnecting > connecting > open > closed > idle */
function rtAggregate(list = [...rtClients.values()]) {
  if (rtOffline()) return 'offline';
  const s = new Set(list.map(c => c.status));
  for (const k of ['reconnecting', 'connecting', 'open', 'closed']) if (s.has(k)) return k;
  return 'idle';
}
/** Match a URL against registered mock endpoints (prefix or RegExp). */
const rtAbs = u => { try { return new URL(u, isBrowser ? doc.baseURI : 'http://localhost/').href; } catch { return String(u); } };
function rtFindMock(kind, url) {
  if (!rtMocks[kind].length) return null;
  const u = rtAbs(url);
  for (let i = rtMocks[kind].length - 1; i >= 0; i--) { const m = rtMocks[kind][i]; if (m.match instanceof RegExp ? m.match.test(u) : u.startsWith(rtAbs(m.match))) return m; }
  return null;
}
/** WebSocket constructor for a URL: explicit option > in-browser mock server > global WebSocket */
function rtWSCtor(url, opts = {}) {
  if (opts.WebSocket) return opts.WebSocket;
  const m = rtFindMock('ws', url);
  if (m) return m.Ctor;
  if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available in this environment');
  return WebSocket;
}
/** fetch used by SignalR negotiate: explicit option > mock handler > global fetch */
function rtFetch(url, init, opts = {}) {
  if (isFn(opts.fetch)) return opts.fetch(url, init);
  const m = rtFindMock('http', url);
  if (m) return Promise.resolve().then(() => m.handler(url, init));
  return fetch(url, init);
}
const rtToWs = u => { const x = new URL(u, isBrowser ? doc.baseURI : 'http://localhost/'); if (x.protocol === 'http:') x.protocol = 'ws:'; else if (x.protocol === 'https:') x.protocol = 'wss:'; return x.href; };

O.realtime = {
  clients: rtClients,
  get: id => rtClients.get(id) || null,
  status: rtAggregate,
  onStatus: fn => rtEm.on('status', fn),
  backoff: rtBackoff,
  mocks: rtMocks,
};
