# realtime

Live-data clients: a resilient `WebSocket` wrapper, an `EventSource` (SSE) wrapper, an ASP.NET Core SignalR client
(JSON hub protocol over WebSockets, no `@microsoft/signalr` dependency), a generic polling helper, a declarative
`Orion.live()` binder for elements, a connection-status `<o-live-indicator>` element, and in-browser mock servers for
all three transports (testing & docs, no network). All clients share reconnect backoff, offline-awareness (via
[`Orion.offline`](../offline/README.md)) and a registry so `<o-live-indicator>` can aggregate their status.

## `Orion.realtime` (registry)

| Member | Signature | Description |
|---|---|---|
| `clients` | `Map<id, client>` | Every live `WSClient` / `SSEClient` / `HubConnection` (registered on construction, removed on `destroy()`). |
| `get(id)` | `(id) => client \| null` | |
| `status(list?)` | `(list = [...clients.values()]) => 'offline'\|'reconnecting'\|'connecting'\|'open'\|'closed'\|'idle'` | Aggregates: offline > reconnecting > connecting > open > closed > idle. |
| `onStatus(fn)` | `(fn({ id, status, client })) => off()` | Fires on every registration, status change, and removal (`status: 'removed'`). |
| `backoff(attempt, opts?)` | `(attempt, opts?) => number` | Exponential backoff with jitter, in ms (`{ min=500, max=30000, factor=2, jitter=0.5, maxRetries=Infinity }`). |
| `mockServer`, `MockWebSocket`, `MockEventSource` | — | Added by the mock module — see below. |

## `Orion.ws(url, opts?)` → `WSClient`

```js
const ws = Orion.ws('wss://api.example.com/live', { id: 'live', reconnect: { min: 500, max: 30000 }, heartbeat: { interval: 25000, timeout: 10000 } });
```

`WSClient extends Emitter`.

| Option | Type | Default | Notes |
|---|---|---|---|
| `protocols` | `String \| String[]` | — | |
| `json` | `Boolean` | `true` | Non-string/binary `send()` payloads are JSON-encoded; incoming string messages are JSON-parsed. |
| `reconnect` | `false \| true \| { min, max, factor, jitter, maxRetries, shouldReconnect(closeEvent) }` | `true` | `false`/`0` disables reconnect. |
| `heartbeat` | `false \| { interval=25000, timeout=10000, message, isPong(msg) }` | `false` | Sends `message` every `interval` ms; drops the socket if no pong within `timeout`. |
| `queue` | `Boolean` | `true` | Queue `send()` calls made while not open. |
| `queueMax` | `Number` | `1000` | Oldest queued message is dropped past this size. |
| `binaryType` | `String` | `'blob'` | |
| `offlineAware` | `Boolean` | `true` | Pauses reconnects while `Orion.offline.isOffline`, drops the socket on going offline. |
| `autoConnect` | `Boolean` | `true` | |
| `id` | `String` | generated | Registry id. |
| `WebSocket` | constructor | — | Injectable (tests / mocks). |
| `url` | `String \| () => string` | — | A function is called fresh on every (re)connect attempt (e.g. to mint a new token). |

| Member | Signature | Description |
|---|---|---|
| `.url`, `.id`, `.opts` | | |
| `.status` | `'idle'\|'connecting'\|'open'\|'reconnecting'\|'closed'` | |
| `.retries` | `Number` | |
| `.readyState` (getter) | `Number` | Underlying `WebSocket.readyState` (`3` when not connected). |
| `.isOpen` (getter) | `Boolean` | |
| `.queued` (getter) | `Number` | Pending queued messages. |
| `.open()` / `.connect()` | `() => this` | No-op if already connecting/open. |
| `.reconnect()` | `() => this` | Forces a reconnect now, resetting the retry counter. |
| `.send(data)` | `(data) => boolean` | Sends, or queues (`true`) when not open and `queue` is on; `false` if dropped. |
| `.close(code=1000, reason='')` | `() => this` | Closes for good (no reconnect); drops the queue. |
| `.destroy()` | `() => void` | `close()` + unregisters from `Orion.realtime` + removes all listeners. |

Events: `status(status, prev, info)`, `open(event)`, `message(data, event)`, `<type>(data, event)` — any JSON message
with a non-reserved `{ type }` field also emits under that type name, `pong(data)`, `error(error)`, `close(event)`,
`reconnecting({ attempt, delay, event })`, `reconnected(event)`, `queued(data)`, `timeout()` (heartbeat timeout), `giveup(event)` (retries exhausted).

## `Orion.sse(url, opts?)` → `SSEClient`

```js
const feed = Orion.sse('/api/stream', { events: ['order', 'notice'], withCredentials: true });
feed.on('order', (data, ev) => …);
```

`SSEClient extends Emitter`. Options: `{ json=true, withCredentials=false, lastEventIdParam='lastEventId', autoConnect=true, offlineAware=true, events: string[] (event types to subscribe), reconnect, EventSource (injectable), id }`.
Reconnects append `?<lastEventIdParam>=<lastEventId>` since `EventSource` can't set custom headers on reconnect (set `lastEventIdParam: null` to disable).

| Member | Signature | Description |
|---|---|---|
| `.url`, `.id`, `.opts`, `.status`, `.retries`, `.lastEventId` | | |
| `.readyState` (getter) | `Number` | `2` (CLOSED) when not connected. |
| `.on(type, fn)` | `(type, fn) => off()` | Also subscribes the live `EventSource` to that custom event type. |
| `.open()` | `() => this` | |
| `.close()` | `() => this` | Manual close (no reconnect). |
| `.destroy()` | `() => void` | |

Events: `status(status, prev, info)`, `open(event)`, `message(data, event)`, `<namedType>(data, event)`, `error(event)`, `close()`, `reconnecting({ attempt, delay })`, `reconnected(event)`, `giveup()`.

## `Orion.signalr(url, opts?)` → `HubConnection`

```js
const hub = Orion.signalr('/hubs/chat', { accessTokenFactory: () => token, reconnect: [0, 2000, 10000, 30000] });
await hub.start();
hub.on('ReceiveMessage', (user, text) => …);
await hub.invoke('SendMessage', 'ada', 'hi');
hub.stream('Counter', 10, 500).subscribe({ next, error, complete });
```

Options: `{ headers={}, skipNegotiation=false, reconnect=[0,2000,10000,30000] (array of delays | true | { nextRetryDelayInMilliseconds({previousRetryCount, elapsedMilliseconds, retryReason}) }), keepAliveInterval=15000, serverTimeout=30000, handshakeTimeout=15000, withCredentials=true, offlineAware=true, accessTokenFactory()=>token|Promise, WebSocket, fetch (injectable) }`.

| Member | Signature | Description |
|---|---|---|
| `.baseUrl`, `.id` | | |
| `.state` | `'Disconnected'\|'Connecting'\|'Connected'\|'Disconnecting'\|'Reconnecting'` | |
| `.status` (getter) | `'idle'\|'connecting'\|'open'\|'closed'\|'reconnecting'` | `Orion.realtime`-registry-friendly mapping of `.state`. |
| `.connectionId` | `String \| null` | |
| `.start()` | `() => Promise<void>` | Negotiates (unless `skipNegotiation`), opens the WS, performs the JSON-protocol handshake. |
| `.stop()` | `() => Promise<void>` | |
| `.on(method, fn)` | `(method, fn) => off()` | Registers a client method the server can invoke (case-insensitive). |
| `.off(method, fn?)` | `(method, fn?) => void` | Omit `fn` to remove every handler for `method`. |
| `.onreconnecting(fn)` / `.onreconnected(fn)` / `.onclose(fn)` | `(fn) => off()` | |
| `.onstate(fn)` | `(fn(state, prev)) => off()` | |
| `.invoke(method, ...args)` | `(...) => Promise<result>` | Rejects with `HubError` on a server error completion. |
| `.send(method, ...args)` | `(...) => Promise<void>` | Fire-and-forget. |
| `.stream(method, ...args)` | `(...) => { subscribe({next, error, complete}) => {dispose()}, [Symbol.asyncIterator]() }` | Also usable as `for await (const x of hub.stream(...))`. |
| `.destroy()` | `() => void` | `stop()` + unregisters + clears handlers. |

Static: `Orion.signalr.HubConnection` (class), `Orion.signalr.HubError`, `Orion.signalr.protocol` (`{ RS, types, write(msg), parse(text), split(buf) => {messages, rest}, handshake() }`), `Orion.signalr.State` (name map, e.g. `Connected: 'Connected'`).

`HubError extends Error` — `name = 'HubError'`; thrown by `invoke()`/stream `error` when the server sends a completion with `error`.

## `Orion.poll(fn, opts?)`

```js
const p = Orion.poll(async ({ signal }) => (await Orion.http.get('/api/stats', { signal })), { interval: 10000, onData: render });
```

`fn({ signal, count, errors }) => Promise<data>`, no overlapping runs, pauses while the tab is hidden / offline (catches up on visibility/online), exponential backoff on repeated errors.

| Option | Type | Default |
|---|---|---|
| `interval` | `Number` (ms) | `5000` |
| `pauseWhenHidden` | `Boolean` | `true` |
| `pauseWhenOffline` | `Boolean` | `true` |
| `backoffOnError` | `Boolean` | `true` |
| `maxInterval` | `Number` (ms) | `60000` |
| `immediate` | `Boolean` | `true` |
| `autoStart` | `Boolean` | `true` |
| `onData(data)` / `onError(err, errorCount)` | `Function` | — |

| Member | Signature | Description |
|---|---|---|
| `.start()` / `.stop()` | `() => handle` | |
| `.refresh()` | `() => Promise<data>` | Runs now even when paused/stopped. |
| `.running`, `.busy`, `.errors`, `.count` (getters) | | |
| `.interval` (getter/setter) | `Number` | Setting reschedules the pending run. |
| `.lastData`, `.lastRun`, `.lastError` | | |
| `.on(event, fn)` / `.off(event, fn)` | | Events: `data(data)`, `error(err, errorCount)`, `start()`, `stop()`. |

## `Orion.live(target, opts?)`

```js
const live = Orion.live('#kpis', { url: '/fragments/kpis.html', interval: 30000 });          // sanitized HTML
Orion.live(el, { url: '/api/stats', render: (data, el) => html`<b>${data.total}</b>` });      // render output is trusted
Orion.live(el, { source: wsClient, event: 'stats', render });                                 // push source (ws / sse / signalr / Emitter)
```

Two modes: **push** (`source` has `.on`) subscribes to `opts.event` and paints on every message; **pull** (`url` or a
function `source`) polls via `Orion.poll` internally.

Options: `{ interval=30000, trusted=false, announce=false, event='message', url, source, render(data, el) => Node|SafeHTML|string|undefined, http (extra `Orion.http.get` options), onError }`.
`render`'s return value replaces the element's content (`undefined` = render already updated the DOM itself); without `render`, string data is sanitized unless `trusted`.

| Member | Signature | Description |
|---|---|---|
| `.refresh()` | `() => Promise<any>` | |
| `.start()` / `.stop()` | `() => handle` | |
| `.running` (getter) | `Boolean` | |
| `.poller` | poll handle \| `null` | The internal `Orion.poll` instance in pull mode. |
| `.destroy()` | `() => void` | |

Sets `data-o-live-updated` (ISO timestamp) / `data-o-live-error` (status or code) and `aria-busy` on the element;
only one live handle per element (a new call destroys the previous one, stored on `el.__oLive`).

## `<o-live-indicator>`

```html
<o-live-indicator for="auto" compact pill></o-live-indicator>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `for` | `for` | `String` | `'auto'` | `'auto'` aggregates every registered client; otherwise a specific `Orion.realtime` client id. |
| `compact` | `compact` | `Boolean` | `false` | Dot only; label kept for screen readers + tooltip. |
| `pill` | `pill` | `Boolean` | `false` | Bordered chip styling. |
| `client` | — | `Object` (`attr: false`) | — | Binds one client instance directly (`el.client = ws`), overriding `for`. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Read-only: `.status` (getter) → `'open'\|'connecting'\|'reconnecting'\|'closed'\|'idle'\|'offline'`.

Renders `role="status"`, a dot + label (`Connected`/`Connecting…`/`Reconnecting…`/`Disconnected`/`Offline`/`Not connected`), and sets `dataset.status` / `dataset.tone` (`good`\|`warning`\|`critical`\|`idle`) for CSS hooks.

| Event | Detail | Notes |
|---|---|---|
| `o-change` | `{ status }` | Fires when the resolved status changes (not on first paint). Not cancelable. |

## Mock servers

No network; matching URLs are intercepted automatically by any `Orion.ws`/`Orion.sse`/`Orion.signalr` client.

```js
const srv = Orion.realtime.mockServer('wss://demo.local/ws', (socket, { url, query }) => {
  socket.send(JSON.stringify({ type: 'hello' }));
  socket.on('message', data => socket.send(data));           // echo
}, { latency: 20 });
```

| API | Signature | Description |
|---|---|---|
| `Orion.realtime.mockServer(match, onConnection?, opts?)` | `(match: string \| RegExp, (peer, {url, query}) => void, { latency=10 }) => server` | `server.Ctor` is a `WebSocket`-compatible constructor (pass as `{ WebSocket: server.Ctor }` to force a client onto it); registered by URL match otherwise. |
| server member | | `.clients: Set<peer>`, `.broadcast(data)`, `.drop()` (abnormal 1006 close on every client), `.refuse(v=true)` (server down for new connections), `.close()` (unregister); `Emitter` events `'connection'(peer)`, `'disconnect'(peer)`. |
| peer (`MockServerSocket`) member | | `.send(data) => boolean`, `.close(code=1000, reason='')`, `.id`, `.url`, `.query`, `.readyState`. |
| `Orion.realtime.MockWebSocket` | class | `WebSocket`-compatible; usually obtained via a server's `.Ctor`. |
| `Orion.sse.mock(match, onConnection?, opts?)` | `(match, (conn, {url, query}) => void, { latency=10 }) => server` | `server.broadcast(data, {event, id}?)`, `.drop()`, `.refuse(v=true)`, `.close()`. |
| conn member | | `.send(data, { event='message', id='' }) => boolean`, `.error()` (drop the stream; client reconnects), `.url`, `.query`. |
| `Orion.realtime.MockEventSource` | class | `EventSource`-compatible. |
| `Orion.signalr.mockHub(hubUrl, opts?)` | `(hubUrl, { methods={}, latency=10, keepAlive=15000, onConnected(connectionId) }) => hub` | Mocks `/negotiate` + the JSON hub protocol. |
| hub member | | `.clients.all` / `.client(id)` / `.except(id)` → `{ send(method, ...args) }`; inside a method handler, `this` is `{ connectionId, accessToken, clients: {all, client, except, caller, others} }`; stream methods may `return` an array, iterable, or async iterable. `.connections: Map`, `.negotiations`, `.invocations[]`, `.drop()` (abnormal close, clients auto-reconnect), `.sendClose(error?, allowReconnect=false)`, `.refuse(v=true)`, `.method(name, fn)`, `.close()`. |

## Document events

| Event | Detail | Notes |
|---|---|---|
| `o-realtime-status` | `{ id, status, client }` | Dispatched on `document` on every client registration, status change, and removal (`status: 'removed'`). Also mirrored on the internal bus as `realtime:status` and via `Orion.realtime.onStatus`. |
| `o-live-update` | `{ data }` | Dispatched on the `Orion.live()` target element after each paint. |
| `o-live-error` | `{ error, errors }` | Dispatched on the target element when a pull fetch fails. |

## Errors & storage keys

No dedicated error class (network/protocol errors are plain `Error`/`TypeError`, except SignalR's `HubError` above).
No persisted storage — realtime clients and mock servers are purely in-memory.
