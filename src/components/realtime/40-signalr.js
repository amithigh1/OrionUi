/* Orion.signalr — ASP.NET Core SignalR client (JSON hub protocol v1 over WebSockets), no @microsoft/signalr needed.
 *   const hub = Orion.signalr('/hubs/chat', { accessTokenFactory: () => token, reconnect: [0, 2000, 10000, 30000] });
 *   hub.on('ReceiveMessage', (user, text) => …);           // server -> client (method names are case-insensitive)
 *   await hub.start();
 *   const n = await hub.invoke('SendMessage', 'ada', 'hi'); // waits for the completion message (result or HubError)
 *   await hub.send('Typing', 'ada');                         // fire and forget
 *   hub.stream('Counter', 10, 500).subscribe({ next, error, complete })  (or: for await (const x of hub.stream(...)))
 *   hub.onreconnecting(err => …) · hub.onreconnected(id => …) · hub.onclose(err => …) · hub.state · hub.connectionId · await hub.stop()
 * Protocol: POST {hub}/negotiate?negotiateVersion=1 (redirects + accessToken honoured) -> ws(s)://{hub}?id={connectionToken}&access_token=…
 *   handshake {"protocol":"json","version":1}\x1e, record-separator framing, messages 1 invocation, 2 stream item, 3 completion,
 *   4 stream invocation, 5 cancel, 6 ping (keep-alive every 15 s), 7 close; server timeout 30 s; automatic reconnect.
 * Options: headers, skipNegotiation, keepAliveInterval, serverTimeout, handshakeTimeout, withCredentials, WebSocket, fetch (injectable).
 */
const SR_RS = '\x1e';
const SR = { Invocation: 1, StreamItem: 2, Completion: 3, StreamInvocation: 4, CancelInvocation: 5, Ping: 6, Close: 7 };
const signalrProtocol = {
  RS: SR_RS, types: SR,
  write: msg => JSON.stringify(msg) + SR_RS,
  /** parse(text) -> messages (throws when the last record is incomplete) */
  parse(text) { if (!text) return []; if (text[text.length - 1] !== SR_RS) throw new Error('Message is incomplete.'); return text.split(SR_RS).slice(0, -1).map(s => JSON.parse(s)); },
  /** split(buffer) -> { messages, rest } (streaming-safe) */
  split(buf) { const parts = buf.split(SR_RS); const rest = parts.pop(); return { messages: parts.filter(Boolean).map(s => JSON.parse(s)), rest }; },
  handshake: () => JSON.stringify({ protocol: 'json', version: 1 }) + SR_RS,
};
class HubError extends Error { constructor(msg) { super(msg); this.name = 'HubError'; } }
const srAddQuery = (url, k, v) => url + (url.includes('?') ? '&' : '?') + encodeURIComponent(k) + '=' + encodeURIComponent(v);
function srNegotiateURL(url) {
  const i = url.indexOf('?');
  let n = i < 0 ? url : url.slice(0, i);
  if (!n.endsWith('/')) n += '/';
  n += 'negotiate' + (i < 0 ? '' : url.slice(i));
  return n.includes('negotiateVersion') ? n : srAddQuery(n, 'negotiateVersion', '1');
}
const SR_STATUS = { Connected: 'open', Connecting: 'connecting', Reconnecting: 'reconnecting', Disconnecting: 'closed', Disconnected: 'closed' };

class HubConnection {
  constructor(url, opts = {}) {
    this.baseUrl = url;
    this.id = opts.id || uid('hub');
    this.opts = { headers: {}, skipNegotiation: false, reconnect: [0, 2000, 10000, 30000], keepAliveInterval: 15000, serverTimeout: 30000, handshakeTimeout: 15000, withCredentials: true, offlineAware: true, ...opts };
    if (this.opts.reconnect === true) this.opts.reconnect = [0, 2000, 10000, 30000];
    this.state = 'Disconnected';
    this.connectionId = null;
    this._handlers = new Map();
    this._pending = new Map();
    this._invId = 0;
    this._cbs = { reconnecting: new Set(), reconnected: new Set(), close: new Set() };
    this._em = new Emitter();
    this._started = false;
    rtRegister(this);
  }
  get status() { return this._started || this.state !== 'Disconnected' ? SR_STATUS[this.state] : 'idle'; }
  _setState(s) { if (this.state === s) return; const prev = this.state; this.state = s; this._em.emit('state', s, prev); rtNotify(this); }

  /* ── public API ── */
  async start() {
    if (this.state !== 'Disconnected') throw new Error("Cannot start a HubConnection that is not in the 'Disconnected' state.");
    this._stopRequested = false;
    this._started = true;
    this._setState('Connecting');
    try {
      await this._connect();
      if (this._stopRequested) { this._dropSocket(); throw new Error('The connection was stopped during negotiation.'); }
      if (!this._ws) throw new Error('The connection was closed before it was established.');
      this._setState('Connected');
      this._em.emit('open', this.connectionId);
    } catch (e) {
      this._dropSocket();
      this._stopTimers();
      this._setState('Disconnected');
      throw e;
    }
  }
  async stop() {
    if (this.state === 'Disconnected') return;
    this._stopRequested = true;
    const wasReconnecting = this.state === 'Reconnecting';
    this._setState('Disconnecting');
    clearTimeout(this._sleepT);
    this._sleepWake?.();
    if (wasReconnecting || !this._ws) { this._finish(undefined); return; }
    this._dropSocket(1000);
    this._closed(undefined, false);
  }
  /** on(method, handler) — register a client method called by the server (returns off()) */
  on(method, fn) {
    if (!method || !isFn(fn)) return noop;
    const k = String(method).toLowerCase();
    if (!this._handlers.has(k)) this._handlers.set(k, new Set());
    this._handlers.get(k).add(fn);
    return () => this.off(method, fn);
  }
  off(method, fn) { const k = String(method).toLowerCase(); if (!fn) this._handlers.delete(k); else this._handlers.get(k)?.delete(fn); }
  onreconnecting(fn) { this._cbs.reconnecting.add(fn); return () => this._cbs.reconnecting.delete(fn); }
  onreconnected(fn) { this._cbs.reconnected.add(fn); return () => this._cbs.reconnected.delete(fn); }
  onclose(fn) { this._cbs.close.add(fn); return () => this._cbs.close.delete(fn); }
  /** onstate(fn(state, prev)) -> off */
  onstate(fn) { return this._em.on('state', fn); }
  /** invoke(method, ...args) -> Promise(result) */
  invoke(method, ...args) {
    if (this.state !== 'Connected') return Promise.reject(new Error("Cannot send data if the connection is not in the 'Connected' State."));
    const invocationId = String(this._invId++);
    return new Promise((resolve, reject) => {
      this._pending.set(invocationId, { resolve, reject });
      try { this._send({ type: SR.Invocation, invocationId, target: method, arguments: args }); }
      catch (e) { this._pending.delete(invocationId); reject(e); }
    });
  }
  /** send(method, ...args) -> Promise resolved once the message is written */
  send(method, ...args) {
    if (this.state !== 'Connected') return Promise.reject(new Error("Cannot send data if the connection is not in the 'Connected' State."));
    try { this._send({ type: SR.Invocation, target: method, arguments: args }); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
  }
  /** stream(method, ...args) -> { subscribe({ next, error, complete }) -> { dispose() }, [Symbol.asyncIterator] } */
  stream(method, ...args) {
    const hub = this;
    const subscribe = (obs = {}) => {
      const invocationId = String(hub._invId++);
      if (hub.state !== 'Connected') { queueMicrotask(() => obs.error?.(new Error("Cannot send data if the connection is not in the 'Connected' State."))); return { dispose: noop }; }
      hub._pending.set(invocationId, { stream: { next: v => obs.next?.(v), error: e => obs.error?.(e), complete: () => obs.complete?.() } });
      try { hub._send({ type: SR.StreamInvocation, invocationId, target: method, arguments: args }); }
      catch (e) { hub._pending.delete(invocationId); queueMicrotask(() => obs.error?.(e)); }
      return { dispose() { if (hub._pending.delete(invocationId) && hub.state === 'Connected') { try { hub._send({ type: SR.CancelInvocation, invocationId }); } catch {} } } };
    };
    return {
      subscribe,
      [Symbol.asyncIterator]() {
        const buf = [], waiters = [];
        let done = false, err = null;
        const wake = () => { while (waiters.length) waiters.shift()(); };
        const sub = subscribe({ next: v => { buf.push(v); wake(); }, error: e => { err = e; done = true; wake(); }, complete: () => { done = true; wake(); } });
        return {
          async next() {
            while (!buf.length && !done) await new Promise(r => waiters.push(r));
            if (buf.length) return { value: buf.shift(), done: false };
            if (err) throw err;
            return { value: undefined, done: true };
          },
          async return() { sub.dispose(); done = true; return { value: undefined, done: true }; },
        };
      },
    };
  }
  destroy() { this.stop(); rtUnregister(this); this._handlers.clear(); }

  /* ── connection ── */
  async _connect() {
    let url = this.baseUrl;
    let token = isFn(this.opts.accessTokenFactory) ? await this.opts.accessTokenFactory() : null;
    this._buf = '';
    if (!this.opts.skipNegotiation) {
      let neg, redirects = 0;
      for (;;) {
        neg = await this._negotiate(url, token);
        if (neg.ProtocolVersion) throw new Error('Detected a connection attempt to an ASP.NET SignalR Server. This client only supports ASP.NET Core SignalR.');
        if (neg.error) throw new Error(neg.error);
        if (!neg.url) break;
        url = neg.url;
        if (neg.accessToken) token = neg.accessToken;
        if (++redirects >= 100) throw new Error('Negotiate redirection limit exceeded.');
      }
      const ws = (neg.availableTransports || []).find(x => x.transport === 'WebSockets');
      if (!ws) throw new Error('The server does not support WebSockets, the only transport implemented by Orion.signalr.');
      this.connectionId = neg.connectionId ?? null;
      url = srAddQuery(url, 'id', neg.negotiateVersion >= 1 ? neg.connectionToken : neg.connectionId);
    }
    if (token) url = srAddQuery(url, 'access_token', token);
    await this._openSocket(rtToWs(url));
    await this._handshake();
    this._startTimers();
  }
  async _negotiate(url, token) {
    const headers = { 'X-Requested-With': 'XMLHttpRequest', ...this.opts.headers };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await rtFetch(srNegotiateURL(url), { method: 'POST', headers, credentials: this.opts.withCredentials ? 'include' : 'same-origin' }, this.opts); }
    catch (e) { throw new Error('Failed to complete negotiation with the server: ' + (e?.message || e)); }
    if (!res.ok) throw new Error(`Failed to complete negotiation with the server: status code ${res.status}`);
    return res.json();
  }
  _openSocket(url) {
    return new Promise((resolve, reject) => {
      let ws, opened = false;
      try { const C = rtWSCtor(url, this.opts); ws = new C(url); } catch (e) { reject(e); return; }
      try { ws.binaryType = 'arraybuffer'; } catch {}
      this._ws = ws;
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('WebSocket failed to connect.')); };
      ws.onclose = e => {
        if (!opened) { reject(new Error(`WebSocket closed with status code: ${e.code} (${e.reason || 'no reason given'}).`)); return; }
        if (ws !== this._ws) return;
        this._ws = null;
        const err = e.code === 1000 && !this._hsPending ? undefined : new Error(`WebSocket closed with status code: ${e.code} (${e.reason || 'no reason given'}).`);
        this._closed(err, true);
      };
      ws.onmessage = e => { if (ws === this._ws) this._onData(e.data); };
    });
  }
  _handshake() {
    return new Promise((resolve, reject) => {
      this._hsPending = { resolve, reject };
      const tm = setTimeout(() => { if (this._hsPending) { this._hsPending = null; reject(new Error('Server timeout elapsed without receiving a handshake response.')); } }, this.opts.handshakeTimeout);
      this._hsPending.resolve = v => { clearTimeout(tm); resolve(v); };
      this._hsPending.reject = e => { clearTimeout(tm); reject(e); };
      try { this._sendRaw(signalrProtocol.handshake()); } catch (e) { this._hsPending = null; clearTimeout(tm); reject(e); }
    });
  }
  _onData(data) {
    if (!isStr(data)) { try { data = new TextDecoder().decode(data); } catch { return; } }
    this._resetServerTimeout();
    this._buf += data;
    if (this._hsPending) {
      const i = this._buf.indexOf(SR_RS);
      if (i < 0) return;
      const resp = parseJSON(this._buf.slice(0, i), null);
      this._buf = this._buf.slice(i + 1);
      const hs = this._hsPending;
      this._hsPending = null;
      if (!resp || resp.error || resp.type) { hs.reject(new Error('Server returned handshake error: ' + (resp?.error || 'Expected a handshake response from the server.'))); return; }
      hs.resolve();
    }
    let parsed;
    try { parsed = signalrProtocol.split(this._buf); } catch (e) { this._fail(new Error('Invalid message from server: ' + e.message)); return; }
    this._buf = parsed.rest;
    for (const m of parsed.messages) this._dispatch(m);
  }
  _dispatch(m) {
    switch (m.type) {
      case SR.Invocation: this._invokeClient(m); break;
      case SR.StreamItem: this._pending.get(m.invocationId)?.stream?.next(m.item); break;
      case SR.Completion: {
        const p = this._pending.get(m.invocationId);
        if (!p) break;
        this._pending.delete(m.invocationId);
        if (p.stream) m.error ? p.stream.error(new HubError(m.error)) : p.stream.complete();
        else m.error ? p.reject(new HubError(m.error)) : p.resolve(m.result);
        break;
      }
      case SR.Ping: break;
      case SR.Close: {
        const err = m.error ? new Error('Server returned an error on close: ' + m.error) : undefined;
        this._dropSocket(1000);
        this._closed(err, !!m.allowReconnect);
        break;
      }
      default: break; // 8 Ack / 9 Sequence (stateful reconnect) are not used
    }
  }
  _invokeClient(m) {
    const set = this._handlers.get(String(m.target).toLowerCase());
    if (!set || !set.size) {
      this._em.emit('unhandled', m);
      if (m.invocationId) this._safeSend({ type: SR.Completion, invocationId: m.invocationId, error: "Client didn't provide a result." });
      return;
    }
    let result, error = null;
    for (const fn of [...set]) {
      try { const r = fn.apply(this, m.arguments || []); if (r !== undefined) result = r; }
      catch (e) { error = e; console.error(`[Orion] SignalR handler "${m.target}" failed:`, e); }
    }
    if (!m.invocationId) return;
    if (error) { this._safeSend({ type: SR.Completion, invocationId: m.invocationId, error: `Client threw an error: ${error.message}` }); return; }
    Promise.resolve(result).then(
      r => this._safeSend(r === undefined ? { type: SR.Completion, invocationId: m.invocationId } : { type: SR.Completion, invocationId: m.invocationId, result: r }),
      e => this._safeSend({ type: SR.Completion, invocationId: m.invocationId, error: `Client threw an error: ${e?.message || e}` }));
  }
  _send(msg) { this._sendRaw(signalrProtocol.write(msg)); }
  _safeSend(msg) { try { this._send(msg); } catch {} }
  _sendRaw(text) {
    const ws = this._ws;
    if (!ws || ws.readyState !== 1) throw new Error('WebSocket is not in the OPEN state');
    ws.send(text);
    this._lastSent = Date.now();
  }
  _startTimers() {
    this._stopTimers();
    this._lastSent = Date.now();
    const ka = this.opts.keepAliveInterval;
    if (ka > 0) this._kaT = setInterval(() => { if (Date.now() - this._lastSent >= ka - 20) this._safeSend({ type: SR.Ping }); }, ka);
    this._resetServerTimeout();
  }
  _resetServerTimeout() {
    clearTimeout(this._stT);
    if (this.opts.serverTimeout > 0 && !this._hsPending && this._ws) this._stT = setTimeout(() => this._fail(new Error('Server timeout elapsed without receiving a message from the server.')), this.opts.serverTimeout);
  }
  _stopTimers() { clearInterval(this._kaT); clearTimeout(this._stT); this._kaT = this._stT = null; }
  _dropSocket(code = 4000) {
    const ws = this._ws;
    this._ws = null;
    this._stopTimers();
    if (ws) { try { ws.close(code === 1000 ? 1000 : 4000); } catch {} }
  }
  _fail(err) { if (!this._ws) return; this._dropSocket(); this._closed(err, true); }
  _rejectPending(err) {
    const e = err || new Error('Invocation canceled due to the underlying connection being closed.');
    for (const p of this._pending.values()) { if (p.stream) p.stream.error(e); else p.reject(e); }
    this._pending.clear();
  }
  _closed(error, allowReconnect) {
    this._stopTimers();
    if (this._hsPending) { const hs = this._hsPending; this._hsPending = null; hs.reject(error || new Error('The connection was closed during the handshake.')); return; }
    this._rejectPending(error ? new Error('Invocation canceled due to the underlying connection being closed. ' + error.message) : null);
    if (this._stopRequested || this.state === 'Disconnecting') { this._finish(error); return; }
    if (this.state === 'Reconnecting' || this.state === 'Connecting') return;
    if (this.state === 'Connected' && allowReconnect && this.opts.reconnect) { this._reconnect(error); return; }
    this._finish(error);
  }
  _finish(error) {
    this._setState('Disconnected');
    this.connectionId = null;
    for (const fn of [...this._cbs.close]) { try { fn(error); } catch (e) { console.error(e); } }
    this._em.emit('close', error);
  }
  _nextDelay(count, elapsed, reason) {
    const p = this.opts.reconnect;
    if (Array.isArray(p)) return count < p.length ? p[count] : null;
    if (p && isFn(p.nextRetryDelayInMilliseconds)) return p.nextRetryDelayInMilliseconds({ previousRetryCount: count, elapsedMilliseconds: elapsed, retryReason: reason });
    return null;
  }
  _sleep(ms) { return new Promise(r => { this._sleepWake = r; this._sleepT = setTimeout(r, ms); }); }
  async _reconnect(error) {
    const t0 = Date.now();
    let count = 0, delay = this._nextDelay(0, 0, error);
    if (delay == null) { this._finish(error); return; }
    this._setState('Reconnecting');
    for (const fn of [...this._cbs.reconnecting]) { try { fn(error); } catch (e) { console.error(e); } }
    while (delay != null) {
      await this._sleep(delay);
      if (this.state !== 'Reconnecting') return;
      if (this.opts.offlineAware && rtOffline() && O.offline?.waitForOnline) { await O.offline.waitForOnline(); if (this.state !== 'Reconnecting') return; }
      try {
        await this._connect();
        if (this.state !== 'Reconnecting') { this._dropSocket(1000); return; }
        if (!this._ws) throw new Error('The connection was closed before it was established.');
        this._setState('Connected');
        for (const fn of [...this._cbs.reconnected]) { try { fn(this.connectionId); } catch (e) { console.error(e); } }
        this._em.emit('reconnected', this.connectionId);
        return;
      } catch (e) {
        this._dropSocket();
        error = e;
        if (this.state !== 'Reconnecting') return;
        delay = this._nextDelay(++count, Date.now() - t0, e);
      }
    }
    this._finish(error);
  }
}
O.signalr = (url, opts) => new HubConnection(url, opts);
Object.assign(O.signalr, { HubConnection, HubError, protocol: signalrProtocol, State: { Disconnected: 'Disconnected', Connecting: 'Connecting', Connected: 'Connected', Disconnecting: 'Disconnecting', Reconnecting: 'Reconnecting' } });
