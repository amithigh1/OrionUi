/* In-browser mock servers (testing & docs; no network). Clients pick them up automatically for matching URLs.
 *   const srv = Orion.realtime.mockServer('wss://demo.local/ws', (socket, { url, query }) => {
 *     socket.send(JSON.stringify({ type: 'hello' }));
 *     socket.on('message', data => socket.send(data));           // echo
 *   }, { latency: 20 });
 *   srv.broadcast(data) · srv.drop() (abnormal close, tests reconnect) · srv.refuse(true) (server down) · srv.close() (unregister)
 *   Orion.realtime.MockWebSocket — WebSocket-compatible class (pass as { WebSocket } to any client)
 *   const feed = Orion.sse.mock('/api/stream', conn => conn.send({ n: 1 }, { event: 'tick', id: '1' }))
 *   const hub = Orion.signalr.mockHub('/hubs/chat', { methods: { SendMessage(user, text) { this.clients.all.send('ReceiveMessage', user, text); return 'ok'; } } })
 *     hub.clients.all.send(method, ...args) · hub.drop() · hub.close() · stream methods may return arrays, iterables or async iterables
 */
class MockServerSocket extends Emitter {
  constructor(client, server) { super(); this.client = client; this.server = server; this.url = client.url; this.readyState = 1; this.id = uid('peer'); this.query = {}; try { this.query = Object.fromEntries(new URL(client.url).searchParams); } catch {} }
  /** server -> client */
  send(data) {
    if (this.readyState !== 1) return false;
    const c = this.client;
    setTimeout(() => { if (c.readyState === 1) c._fire('message', { data: isObj(data) && !isInst(data, Blob) && !isInst(data, ArrayBuffer) ? JSON.stringify(data) : data }); }, this.server.latency);
    return true;
  }
  close(code = 1000, reason = '') { if (this.readyState !== 1) return; this.readyState = 3; this.server._gone(this); this.emit('close', { code, reason }); const c = this.client; setTimeout(() => c._closeFromServer(code, reason, code === 1000), this.server.latency); }
}
class MockWebSocket extends (typeof EventTarget !== 'undefined' ? EventTarget : class {}) {
  constructor(url, protocols) {
    super();
    this.url = String(url);
    this.protocol = Array.isArray(protocols) ? protocols[0] || '' : protocols || '';
    this.readyState = 0;
    this.binaryType = 'blob';
    this.bufferedAmount = 0;
    this.extensions = '';
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    const server = this.constructor.__server || rtFindMock('ws', this.url);
    setTimeout(() => { if (this.readyState !== 0) return; if (!server || server._refused) this._failConnect(); else server._accept(this); }, server ? server.latency : 5);
  }
  _fire(type, init = {}) {
    let ev;
    if (type === 'message') ev = new MessageEvent('message', { data: init.data });
    else if (type === 'close') ev = new CloseEvent('close', { code: init.code, reason: init.reason, wasClean: init.wasClean });
    else ev = new Event(type);
    try { this.dispatchEvent(ev); } catch {}
    const fn = this['on' + type];
    if (isFn(fn)) { try { fn.call(this, ev); } catch (e) { console.error(e); } }
  }
  _failConnect() { this.readyState = 3; this._fire('error'); this._fire('close', { code: 1006, reason: '', wasClean: false }); }
  _closeFromServer(code, reason, clean) { if (this.readyState === 3) return; this.readyState = 3; if (!clean && code === 1006) this._fire('error'); this._fire('close', { code, reason, wasClean: clean }); }
  send(data) {
    if (this.readyState === 0) throw new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError');
    if (this.readyState !== 1 || !this._peer) return;
    const peer = this._peer;
    setTimeout(() => { if (peer.readyState === 1) peer.emit('message', data); }, peer.server.latency);
  }
  close(code = 1000, reason = '') {
    if (this.readyState >= 2) return;
    const wasConnecting = this.readyState === 0;
    this.readyState = 2;
    const peer = this._peer;
    setTimeout(() => {
      if (peer && peer.readyState === 1) { peer.readyState = 3; peer.server._gone(peer); peer.emit('close', { code, reason }); }
      this.readyState = 3;
      this._fire('close', { code: wasConnecting ? 1006 : code, reason, wasClean: !wasConnecting });
    }, 0);
  }
}
Object.assign(MockWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

function mockServer(match, onConnection, opts = {}) {
  const server = new Emitter();
  Object.assign(server, { match, latency: opts.latency ?? 10, clients: new Set(), _refused: false });
  server.Ctor = class extends MockWebSocket {};
  server.Ctor.__server = server;
  server._accept = client => {
    const peer = new MockServerSocket(client, server);
    client._peer = peer;
    server.clients.add(peer);
    client.readyState = 1;
    client._fire('open');
    server.emit('connection', peer);
    if (isFn(onConnection)) { try { onConnection(peer, { url: client.url, query: peer.query }); } catch (e) { console.error('[Orion] mock server handler failed', e); } }
  };
  server._gone = peer => { server.clients.delete(peer); server.emit('disconnect', peer); };
  server.broadcast = data => { for (const c of [...server.clients]) c.send(data); return server; };
  /** simulate a network drop: every client gets an abnormal close (1006) */
  server.drop = () => { for (const c of [...server.clients]) { c.readyState = 3; server._gone(c); c.emit('close', { code: 1006 }); const cl = c.client; setTimeout(() => cl._closeFromServer(1006, '', false), server.latency); } return server; };
  /** refuse(true) = server down (new connections fail), refuse(false) = back up */
  server.refuse = (v = true) => { server._refused = !!v; return server; };
  server.close = () => { for (const c of [...server.clients]) c.close(1001, 'Server shutdown'); const i = rtMocks.ws.indexOf(server); if (i >= 0) rtMocks.ws.splice(i, 1); return server; };
  rtMocks.ws.push(server);
  return server;
}

/* ── SSE mock ─────────────────────────────────────────────────────────── */
class MockEventSource extends (typeof EventTarget !== 'undefined' ? EventTarget : class {}) {
  constructor(url, init = {}) {
    super();
    this.url = String(url); this.withCredentials = !!init.withCredentials; this.readyState = 0;
    this.onopen = this.onmessage = this.onerror = null;
    const server = this.constructor.__server || rtFindMock('sse', this.url);
    setTimeout(() => { if (this.readyState !== 0) return; if (!server || server._refused) { this.readyState = 2; this._fire('error'); } else server._accept(this); }, server ? server.latency : 5);
  }
  _fire(type, init) {
    const ev = type === 'error' || type === 'open' ? new Event(type) : new MessageEvent(type, init);
    try { this.dispatchEvent(ev); } catch {}
    const fn = type === 'message' || type === 'open' || type === 'error' ? this['on' + type] : null;
    if (isFn(fn)) { try { fn.call(this, ev); } catch (e) { console.error(e); } }
  }
  close() { this.readyState = 2; this._conn?._end(); }
}
Object.assign(MockEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });
function mockSSE(match, onConnection, opts = {}) {
  const server = { match, latency: opts.latency ?? 10, clients: new Set(), _refused: false };
  server.Ctor = class extends MockEventSource {};
  server.Ctor.__server = server;
  server._accept = es => {
    es.readyState = 1;
    const conn = new Emitter();
    Object.assign(conn, {
      url: es.url, query: Object.fromEntries(new URL(es.url, isBrowser ? doc.baseURI : 'http://localhost/').searchParams),
      /** send(data, { event, id }) */
      send(data, { event = 'message', id = '' } = {}) { if (es.readyState !== 1) return false; setTimeout(() => es.readyState === 1 && es._fire(event, { data: isStr(data) ? data : JSON.stringify(data), lastEventId: String(id) }), server.latency); return true; },
      /** error(): drop the stream (client reconnects with backoff) */
      error() { if (es.readyState === 2) return; es.readyState = 0; server.clients.delete(conn); conn.emit('close'); es._fire('error'); },
      _end() { server.clients.delete(conn); conn.emit('close'); },
    });
    es._conn = conn;
    server.clients.add(conn);
    es._fire('open');
    if (isFn(onConnection)) { try { onConnection(conn, { url: es.url, query: conn.query }); } catch (e) { console.error(e); } }
  };
  server.broadcast = (data, o) => { for (const c of [...server.clients]) c.send(data, o); return server; };
  server.drop = () => { for (const c of [...server.clients]) c.error(); return server; };
  server.refuse = (v = true) => { server._refused = !!v; return server; };
  server.close = () => { server.drop(); const i = rtMocks.sse.indexOf(server); if (i >= 0) rtMocks.sse.splice(i, 1); return server; };
  rtMocks.sse.push(server);
  return server;
}

/* ── SignalR hub mock (negotiate + JSON hub protocol) ─────────────────── */
function mockHub(hubUrl, o = {}) {
  const opts = { methods: {}, latency: 10, keepAlive: 15000, ...o };
  const abs = new URL(hubUrl, isBrowser ? doc.baseURI : 'http://localhost/').href.replace(/\/+$/, '');
  const methods = new Map(Object.entries(opts.methods).map(([k, v]) => [k.toLowerCase(), v]));
  const conns = new Map();
  const hub = { url: abs, connections: conns, negotiations: 0, invocations: [] };
  const write = m => JSON.stringify(m) + SR_RS;
  const sendTo = (c, m) => c.peer.send(write(m));
  const target = list => ({ send: (method, ...args) => { for (const c of list()) sendTo(c, { type: SR.Invocation, target: method, arguments: args }); } });
  hub.clients = {
    all: target(() => conns.values()),
    client: id => target(() => [conns.get(id)].filter(Boolean)),
    except: id => target(() => [...conns.values()].filter(c => c.id !== id)),
  };
  const httpMock = {
    match: abs + '/negotiate',
    handler: () => {
      hub.negotiations++;
      if (hub._refused) return new Response('Service unavailable', { status: 503 });
      const id = uid('conn');
      return new Response(JSON.stringify({ negotiateVersion: 1, connectionId: id, connectionToken: id + '-token', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
  rtMocks.http.push(httpMock);
  const ws = mockServer(rtToWs(abs), (peer, { query }) => {
    const c = { id: query.id ? query.id.replace(/-token$/, '') : uid('conn'), peer, buf: '', handshaken: false, streams: new Map(), token: query.access_token || null };
    const ctx = { connectionId: c.id, accessToken: c.token, clients: { ...hub.clients, caller: target(() => [c]), others: hub.clients.except(c.id) } };
    const ka = setInterval(() => { if (c.handshaken) sendTo(c, { type: SR.Ping }); }, opts.keepAlive);
    peer.on('close', () => { clearInterval(ka); conns.delete(c.id); c.streams.forEach(s => { s.cancelled = true; }); });
    peer.on('message', async data => {
      c.buf += isStr(data) ? data : new TextDecoder().decode(data);
      if (!c.handshaken) {
        const i = c.buf.indexOf(SR_RS);
        if (i < 0) return;
        const hs = parseJSON(c.buf.slice(0, i), {});
        c.buf = c.buf.slice(i + 1);
        if (hs.protocol !== 'json') { peer.send(write({ error: `Requested protocol '${hs.protocol}' is not available.` })); peer.close(1000); return; }
        c.handshaken = true;
        conns.set(c.id, c);
        peer.send('{}' + SR_RS);
        opts.onConnected?.call(ctx, c.id);
      }
      const { messages, rest } = signalrProtocol.split(c.buf);
      c.buf = rest;
      for (const m of messages) await handle(c, ctx, m);
    });
  }, { latency: opts.latency });
  async function handle(c, ctx, m) {
    if (m.type === SR.Ping) return;
    if (m.type === SR.Close) { c.peer.close(1000); return; }
    if (m.type === SR.CancelInvocation) { const s = c.streams.get(m.invocationId); if (s) s.cancelled = true; return; }
    if (m.type !== SR.Invocation && m.type !== SR.StreamInvocation) return;
    hub.invocations.push({ connectionId: c.id, target: m.target, arguments: m.arguments, invocationId: m.invocationId, stream: m.type === SR.StreamInvocation });
    const fn = methods.get(String(m.target).toLowerCase());
    if (!fn) { if (m.invocationId) sendTo(c, { type: SR.Completion, invocationId: m.invocationId, error: `Failed to invoke '${m.target}' due to an error on the server. HubException: Method does not exist.` }); return; }
    try {
      const r = await fn.apply(ctx, m.arguments || []);
      if (m.type === SR.StreamInvocation) {
        const s = { cancelled: false };
        c.streams.set(m.invocationId, s);
        const it = r && (r[Symbol.asyncIterator] ? r[Symbol.asyncIterator]() : r[Symbol.iterator] ? r[Symbol.iterator]() : null);
        if (!it) throw new Error('Stream method must return an iterable');
        for (;;) {
          const { value, done } = await it.next();
          if (done || s.cancelled) break;
          sendTo(c, { type: SR.StreamItem, invocationId: m.invocationId, item: value });
        }
        c.streams.delete(m.invocationId);
        if (!s.cancelled) sendTo(c, { type: SR.Completion, invocationId: m.invocationId });
      } else if (m.invocationId) sendTo(c, r === undefined ? { type: SR.Completion, invocationId: m.invocationId } : { type: SR.Completion, invocationId: m.invocationId, result: r });
    } catch (e) {
      if (m.invocationId) sendTo(c, { type: SR.Completion, invocationId: m.invocationId, error: `An unexpected error occurred invoking '${m.target}' on the server. HubException: ${e?.message || e}` });
    }
  }
  /** abnormal close of every connection (clients auto-reconnect) */
  hub.drop = () => { ws.drop(); return hub; };
  /** send a Close message ({ error, allowReconnect }) to every client */
  hub.sendClose = (error, allowReconnect = false) => { for (const c of conns.values()) sendTo(c, error ? { type: SR.Close, error, allowReconnect } : { type: SR.Close, allowReconnect }); return hub; };
  hub.refuse = (v = true) => { hub._refused = !!v; ws.refuse(v); return hub; };
  hub.method = (name, fn) => { methods.set(name.toLowerCase(), fn); return hub; };
  hub.close = () => { ws.close(); const i = rtMocks.http.indexOf(httpMock); if (i >= 0) rtMocks.http.splice(i, 1); return hub; };
  return hub;
}

Object.assign(O.realtime, { mockServer, MockWebSocket, MockEventSource });
O.sse.mock = mockSSE;
O.signalr.mockHub = mockHub;
