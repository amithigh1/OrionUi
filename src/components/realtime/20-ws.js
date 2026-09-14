/* Orion.ws — resilient WebSocket client (reconnect with backoff + jitter, heartbeat, offline-aware send queue, JSON).
 *   const ws = Orion.ws('wss://api.example.com/live', { id: 'live', reconnect: { min: 500, max: 30000 }, heartbeat: { interval: 25000, timeout: 10000 } });
 *   ws.on('message', data => …); ws.on('price', msg => …)      // JSON messages with { type: 'price' } also emit 'price'
 *   ws.on('status', s => …)  // 'connecting' | 'open' | 'reconnecting' | 'closed'
 *   ws.send({ type: 'subscribe', channel: 'orders' })       // queued while connecting / offline (queue: true)
 *   ws.close()  ·  ws.open()  ·  ws.reconnect()  ·  ws.destroy()
 * Options: protocols, json = true, reconnect (false | true | { min, max, factor, jitter, maxRetries, shouldReconnect(ev) }),
 *          heartbeat (false | { interval, timeout, message, isPong(msg) }), queue = true, queueMax = 1000, binaryType,
 *          WebSocket (injectable constructor for tests), autoConnect = true, id, url may be a function (fresh token per attempt)
 */
class WSClient extends Emitter {
  constructor(url, opts = {}) {
    super();
    this.url = url;
    this.id = opts.id || uid('ws');
    const json = opts.json !== false;
    this.opts = { json, queue: true, queueMax: 1000, autoConnect: true, binaryType: 'blob', offlineAware: true, ...opts };
    this.opts.reconnect = rtNormReconnect(opts.reconnect);
    const hb = opts.heartbeat;
    this.opts.heartbeat = !hb ? null : { interval: 25000, timeout: 10000, message: json ? { type: 'ping' } : 'ping', ...(isObj(hb) ? hb : {}) };
    this.status = 'idle';
    this.retries = 0;
    this._queue = [];
    this._manual = false;
    this._ws = null;
    this._offs = [];
    if (isBrowser && this.opts.offlineAware) {
      this._offs.push(on(win, 'online', () => this._online()));
      if (O.offline) this._offs.push(O.offline.onChange(off => (off ? this._drop(4001, 'offline', true) : this._online())));
    }
    rtRegister(this);
    if (this.opts.autoConnect) this.open();
  }
  get readyState() { return this._ws ? this._ws.readyState : 3; }
  get isOpen() { return !!this._ws && this._ws.readyState === 1; }
  get queued() { return this._queue.length; }
  _setStatus(s, info = {}) {
    if (this.status === s) return;
    const prev = this.status;
    this.status = s;
    this.emit('status', s, prev, info);
    rtNotify(this);
  }
  /** Connect (no-op when already connecting/open). */
  open() {
    this._manual = false;
    clearTimeout(this._retryT);
    if (this._ws && this._ws.readyState <= 1) return this;
    if (this.opts.offlineAware && rtOffline()) { this._setStatus('reconnecting', { offline: true }); return this; }
    this._setStatus(this.retries ? 'reconnecting' : 'connecting', { attempt: this.retries });
    let ws;
    try {
      const url = isFn(this.url) ? this.url() : this.url;
      const C = rtWSCtor(url, this.opts);
      ws = this.opts.protocols ? new C(url, this.opts.protocols) : new C(url);
    } catch (e) { this.emit('error', e); this._scheduleReconnect({ code: 1006, reason: e.message }); return this; }
    try { ws.binaryType = this.opts.binaryType; } catch {}
    this._ws = ws;
    ws.onopen = e => {
      if (ws !== this._ws) return;
      const wasRetry = this.retries > 0;
      this.retries = 0;
      this._setStatus('open');
      this._startHeartbeat();
      this._flush();
      this.emit('open', e);
      if (wasRetry) this.emit('reconnected', e);
    };
    ws.onmessage = e => { if (ws === this._ws) this._onMessage(e); };
    ws.onerror = e => { if (ws === this._ws) this.emit('error', e); };
    ws.onclose = e => { if (ws === this._ws) this._closed(e); };
    return this;
  }
  connect() { return this.open(); }
  /** Force a reconnect now (resets the retry counter). */
  reconnect() { this.retries = 0; this._drop(4002, 'reconnect', true); this.open(); return this; }
  /** send(data) -> true when sent or queued. Objects are JSON-encoded when json is on. */
  send(data) {
    const binary = isInst(data, Blob) || isInst(data, ArrayBuffer) || ArrayBuffer.isView(data);
    const payload = this.opts.json && !isStr(data) && !binary ? JSON.stringify(data) : data;
    if (this.isOpen) { try { this._ws.send(payload); this._lastSent = Date.now(); return true; } catch (e) { this.emit('error', e); } }
    if (this.opts.queue && !this._manual) {
      if (this._queue.length >= this.opts.queueMax) this._queue.shift();
      this._queue.push(payload);
      this.emit('queued', data);
      return true;
    }
    return false;
  }
  /** Close for good (no reconnect). Queued messages are dropped. */
  close(code = 1000, reason = '') {
    this._manual = true;
    clearTimeout(this._retryT);
    this._stopHeartbeat();
    this._queue.length = 0;
    const ws = this._ws;
    this._ws = null;
    if (ws) { try { ws.close(code, reason); } catch {} }
    if (this.status !== 'closed') { this._setStatus('closed', { code, reason, manual: true }); this.emit('close', { code, reason, wasClean: true, manual: true }); }
    return this;
  }
  /** close + unregister from Orion.realtime + remove every listener */
  destroy() { this.close(); this._offs.forEach(f => f()); this._offs = []; rtUnregister(this); this.off(); }

  _online() { if (!this._manual && !this.isOpen && this.status !== 'connecting') { clearTimeout(this._retryT); this.open(); } }
  _flush() { while (this._queue.length && this.isOpen) { const p = this._queue.shift(); try { this._ws.send(p); } catch (e) { this._queue.unshift(p); this.emit('error', e); break; } } }
  _onMessage(e) {
    this._lastRecv = Date.now();
    clearTimeout(this._hbWait); this._hbWait = null;
    let data = e.data;
    if (this.opts.json && isStr(data)) data = parseJSON(data, data);
    const hb = this.opts.heartbeat;
    if (hb && (isFn(hb.isPong) ? hb.isPong(data) : data === 'pong' || (isObj(data) && data.type === 'pong'))) { this.emit('pong', data); return; }
    this.emit('message', data, e);
    if (isObj(data) && isStr(data.type) && data.type && !RT_RESERVED.has(data.type)) this.emit(data.type, data, e);
  }
  _startHeartbeat() {
    const hb = this.opts.heartbeat;
    this._stopHeartbeat();
    if (!hb || !(hb.interval > 0)) return;
    this._hbT = setInterval(() => {
      if (!this.isOpen) return;
      const msg = isFn(hb.message) ? hb.message() : hb.message;
      try { this._ws.send(this.opts.json && !isStr(msg) ? JSON.stringify(msg) : msg); } catch {}
      if (hb.timeout > 0 && !this._hbWait) this._hbWait = setTimeout(() => { this._hbWait = null; this.emit('timeout'); this._drop(4000, 'Heartbeat timeout'); }, hb.timeout);
    }, hb.interval);
  }
  _stopHeartbeat() { clearInterval(this._hbT); clearTimeout(this._hbWait); this._hbT = this._hbWait = null; }
  /** Drop the current socket immediately (dead connections may never fire 'close'), then run the reconnect logic. */
  _drop(code, reason, quiet = false) {
    const ws = this._ws;
    if (!ws) return;
    this._ws = null;
    try { ws.close(code >= 4000 ? code : 4000, reason); } catch {}
    this._closed({ code, reason, wasClean: false, quiet });
  }
  _closed(e) {
    this._ws = null;
    this._stopHeartbeat();
    this.emit('close', e);
    if (this._manual) this._setStatus('closed', { code: e?.code, reason: e?.reason });
    else this._scheduleReconnect(e);
  }
  _scheduleReconnect(e) {
    const r = this.opts.reconnect;
    clearTimeout(this._retryT);
    if (!r || (isFn(r.shouldReconnect) && !r.shouldReconnect(e)) || this.retries >= r.maxRetries) {
      this._setStatus('closed', { code: e?.code, reason: e?.reason, gaveUp: !!r });
      if (r) this.emit('giveup', e);
      return;
    }
    if (this.opts.offlineAware && rtOffline()) { this._setStatus('reconnecting', { offline: true }); return; }
    this.retries++;
    const delay = rtBackoff(this.retries, r);
    this._setStatus('reconnecting', { attempt: this.retries, delay });
    this.emit('reconnecting', { attempt: this.retries, delay, event: e });
    this._retryT = setTimeout(() => this.open(), delay);
  }
}
O.ws = (url, opts) => new WSClient(url, opts);
O.WSClient = WSClient;
