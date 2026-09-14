/* Orion.sse — EventSource wrapper with typed handlers, JSON parsing and exponential backoff.
 *   const feed = Orion.sse('/api/stream', { events: ['order', 'notice'], withCredentials: true });
 *   feed.on('order', (data, ev) => …)   // any named event (subscribed lazily); 'message' = unnamed events
 *   feed.on('status', s => …)  ·  feed.lastEventId  ·  feed.close()  ·  feed.open()
 * Reconnects with backoff on errors (the id of the last event is sent as ?lastEventId=… since EventSource cannot set headers
 * on manual reconnects; set lastEventIdParam: null to disable). Options: json = true, reconnect, EventSource (injectable), id.
 */
class SSEClient extends Emitter {
  constructor(url, opts = {}) {
    super();
    this.url = url;
    this.id = opts.id || uid('sse');
    this.opts = { json: true, withCredentials: false, lastEventIdParam: 'lastEventId', autoConnect: true, offlineAware: true, ...opts };
    this.opts.reconnect = rtNormReconnect(opts.reconnect);
    this._types = new Set(opts.events || []);
    this.status = 'idle';
    this.retries = 0;
    this.lastEventId = '';
    this._offs = [];
    if (isBrowser && this.opts.offlineAware) {
      this._offs.push(on(win, 'online', () => { if (!this._manual && !this._es) this.open(); }));
      if (O.offline) this._offs.push(O.offline.onChange(off => (off ? this._drop() : !this._manual && !this._es && this.open())));
    }
    rtRegister(this);
    if (this.opts.autoConnect) this.open();
  }
  get readyState() { return this._es ? this._es.readyState : 2; }
  _setStatus(s, info) { if (this.status === s) return; const prev = this.status; this.status = s; this.emit('status', s, prev, info); rtNotify(this); }
  /** on(type, fn): also subscribes the EventSource to custom event types */
  on(type, fn) {
    if (!RT_RESERVED.has(type) && !this._types.has(type)) { this._types.add(type); if (this._es) this._listen(this._es, type); }
    return super.on(type, fn);
  }
  open() {
    this._manual = false;
    clearTimeout(this._retryT);
    if (this._es) return this;
    if (this.opts.offlineAware && rtOffline()) { this._setStatus('reconnecting', { offline: true }); return this; }
    this._setStatus(this.retries ? 'reconnecting' : 'connecting');
    let url = isFn(this.url) ? this.url() : this.url;
    if (this.lastEventId && this.opts.lastEventIdParam) { const u = new URL(url, isBrowser ? doc.baseURI : 'http://localhost/'); u.searchParams.set(this.opts.lastEventIdParam, this.lastEventId); url = u.href; }
    let es;
    try {
      const C = this.opts.EventSource || rtFindMock('sse', url)?.Ctor || (typeof EventSource !== 'undefined' ? EventSource : null);
      if (!C) throw new Error('EventSource is not available in this environment');
      es = new C(url, { withCredentials: !!this.opts.withCredentials });
    } catch (e) { this.emit('error', e); this._retry(); return this; }
    this._es = es;
    es.onopen = e => { if (es !== this._es) return; const was = this.retries; this.retries = 0; this._setStatus('open'); this.emit('open', e); if (was) this.emit('reconnected', e); };
    es.onmessage = e => { if (es === this._es) this._dispatch('message', e); };
    es.onerror = e => {
      if (es !== this._es) return;
      this.emit('error', e);
      this._drop();
    };
    for (const t of this._types) this._listen(es, t);
    return this;
  }
  _listen(es, type) { if (type !== 'message') es.addEventListener(type, e => { if (es === this._es) this._dispatch(type, e); }); }
  _dispatch(type, e) {
    if (e.lastEventId) this.lastEventId = e.lastEventId;
    const data = this.opts.json && isStr(e.data) ? parseJSON(e.data, e.data) : e.data;
    this.emit(type, data, e);
  }
  _drop() {
    const es = this._es;
    if (!es) return;
    this._es = null;
    try { es.close(); } catch {}
    if (!this._manual) this._retry();
  }
  _retry() {
    const r = this.opts.reconnect;
    if (!r || this.retries >= r.maxRetries) { this._setStatus('closed', { gaveUp: !!r }); if (r) this.emit('giveup'); return; }
    if (this.opts.offlineAware && rtOffline()) { this._setStatus('reconnecting', { offline: true }); return; }
    this.retries++;
    const delay = rtBackoff(this.retries, r);
    this._setStatus('reconnecting', { attempt: this.retries, delay });
    this.emit('reconnecting', { attempt: this.retries, delay });
    this._retryT = setTimeout(() => this.open(), delay);
  }
  close() {
    this._manual = true;
    clearTimeout(this._retryT);
    const es = this._es;
    this._es = null;
    if (es) { try { es.close(); } catch {} }
    this._setStatus('closed', { manual: true });
    this.emit('close');
    return this;
  }
  destroy() { this.close(); this._offs.forEach(f => f()); this._offs = []; rtUnregister(this); this.off(); }
}
O.sse = (url, opts) => new SSEClient(url, opts);
O.SSEClient = SSEClient;
