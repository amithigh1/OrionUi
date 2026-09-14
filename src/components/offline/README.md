# offline

Connectivity state and a persisted mutation queue, replayed in order once back online: `Orion.offline` tracks
online/offline status (real + simulated, for testing), and `Orion.offline.queue` durably stores failed mutations
(IndexedDB → `localStorage` → memory) so they survive a reload and multi-tab usage (Web Locks + `BroadcastChannel`).
An `<o-offline-banner>` element surfaces the status and queue automatically.

## `Orion.offline`

```js
Orion.offline.isOffline;
Orion.offline.onChange(isOffline => …);
Orion.offline.simulate(true | false | null);
await Orion.http.post('/api/notes', note, { offline: 'queue' });   // queued while offline -> { queued: true, id }
await Orion.offline.sync();                                        // -> { sent, failed, remaining }
await Orion.offline.check();                                       // active probe (navigator.onLine can lie)
```

| Member | Signature | Description |
|---|---|---|
| `.isOffline` (getter) | `Boolean` | `simulate()` override wins over the real network state. |
| `.isOnline` (getter) | `Boolean` | `!isOffline`. |
| `.status` (getter) | `'offline' \| 'online'` | |
| `.simulated` (getter) | `Boolean` | `true` while a `simulate()` override is active. |
| `.onChange(fn)` | `(fn(isOffline)) => off()` | |
| `.on(event, fn)` / `.off(event, fn)` | | Events: `change(isOffline)`, `sync-start({ total })`, `sync({ sent, failed, remaining })`, `replayed(entry, res)`, `failed(entry, err)`, `queue(list)` (same as `queue.onChange`). |
| `.simulate(v)` | `(true \| false \| null) => Orion.offline` | Testing hook: force offline/online, or `null` to use the real network state. |
| `.waitForOnline()` | `() => Promise<void>` | Resolves immediately if already online. |
| `.check(url?, opts?)` | `(url = location.href, { timeout=5000 }) => Promise<boolean>` | Active probe: `HEAD` request with a `_orion_ping` cache-buster. Updates `.isOffline` as a side effect. |
| `.configure(opts?)` | `({ maxAttempts=5, autoSync=true }) => Orion.offline` | `maxAttempts` = retries before a `5xx`/`429`/`408` failure is handed to `onError`. |
| `.queue` | `OfflineQueue` | See below. |
| `.sync()` | `() => Promise<{ sent, failed, remaining }>` | Replays the queue now, in order; deduplicated across calls/tabs (`navigator.locks`, lock name `orion-offline-sync`). |
| `.serialize(body)` / `.deserialize(serialized)` | | Bidirectional helpers used to persist a request body in a queue entry (`string`/`FormData`/`URLSearchParams`/`Blob`/`ArrayBuffer`/typed array/plain JSON all round-trip). |
| `.banner(opts?)` | `({ position? }) => HTMLElement` | Added by `20-banner.js`: creates (or reuses) a single `body`-level `<o-offline-banner>`. |

## `Orion.offline.queue`

```js
Orion.offline.queue.add({ url, method, headers, body, meta });
Orion.offline.queue.onConflict((entry, err) => 'retry' | 'drop' | 'keep' | { body, headers, url });   // 409 / 412
Orion.offline.queue.onError((entry, err) => 'drop' | 'keep');
Orion.offline.queue.onReplay((entry, res) => …);
```

| Member | Signature | Description |
|---|---|---|
| `.ready` (getter) | `Promise<void>` | Resolves once the persisted queue has loaded. |
| `.size` (getter) | `Number` | |
| `.persistence` (getter) | `'idb' \| 'local' \| 'memory' \| 'pending'` | Which backend is actually in use. |
| `.add(req)` | `({ url, method='POST', headers?, body?, meta? }) => Promise<QueueEntry>` | Persists the entry, notifies listeners, and — if online and `autoSync` — schedules an immediate replay attempt. |
| `.list()` | `() => QueueEntry[]` | Oldest first. |
| `.get(id)` | `(id) => QueueEntry \| null` | |
| `.remove(id)` | `(id) => Promise<void>` | |
| `.clear()` | `() => Promise<void>` | |
| `.onChange(fn)` | `(fn(QueueEntry[])) => off()` | Fires on every add/remove/clear/replay and on remote (other-tab) changes. |
| `.onConflict(fn)` | `(fn(entry, err) => 'retry' \| 'drop' \| 'keep' \| { url?, headers?, body? }) => off()` | Called on HTTP `409`/`412` replay failures. Returning an object patches the entry and retries (up to 3 times per attempt cycle). Default (no handler / `undefined` return): `'drop'`. |
| `.onError(fn)` | `(fn(entry, err) => 'drop' \| 'keep') => off()` | Called for other unrecoverable failures, and for `5xx`/`429`/`408` once `attempts` reaches `maxAttempts`. Default: `'drop'`. |
| `.onReplay(fn)` | `(fn(entry, res)) => off()` | Called after each successful replay. |

`QueueEntry`: `{ id, method, url, headers, body (deserialized), meta, createdAt, attempts, lastError: { status, message, data } | null }`.

Replay behavior (`offRun`, driving `.sync()`): entries are sent oldest-first with `X-Orion-Replay: 1` (CSRF headers
stripped); a network/timeout error stops the whole pass (entries stay queued) and schedules an exponential-backoff
retry; a `409`/`412` goes to `onConflict`; `5xx`/`429`/`408` retries up to `maxAttempts` then goes to `onError`; any
other status goes straight to `onError`. Stops immediately if `isOffline` becomes true mid-pass.

## `<o-offline-banner>`

```js
Orion.offline.banner({ position: 'top' });
```
```html
<o-offline-banner position="top" online-duration="3000"></o-offline-banner>
```

Appears automatically while offline (shows the queued-changes count and a Retry button), then a transient
"Back online" / "Syncing…" message.

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `position` | `position` | `String` | `'top'` | `'top' \| 'bottom' \| 'inline'` (reflected); non-inline positions animate in/out. |
| `onlineDuration` | `online-duration` | `Number` | `3000` | ms the "Back online" message stays visible before auto-hiding. |
| `state` | `state` | `String` | `'auto'` | Force a display state for docs/tests: `'auto' \| 'offline' \| 'online' \| 'syncing'`. |
| `showQueue` | `show-queue` | `Boolean` | `true` | Show the queued-item count while offline. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

| Method | Description |
|---|---|
| `retry()` | `() => Promise<void>` — probes connectivity (`Orion.offline.check()`) then replays the queue (`Orion.offline.sync()`) if reachable; announces "Still offline" otherwise. |

| Event | Detail | Notes |
|---|---|---|
| `o-show` | `{ state }` | Fired when the banner becomes visible. |
| `o-hide` | — | Fired after it hides. |
| `o-retry` | — | **Cancelable** — fired before `retry()` runs; `preventDefault()` to veto. |

## Document / global events

| Event | Detail | Notes |
|---|---|---|
| `o-offline` | `{ simulated: boolean }` | Dispatched on `document` on transition to offline. Also toggles `.o-is-offline` on `<html>`. |
| `o-online` | `{ simulated: boolean }` | Dispatched on transition to online. |
| `o-offline-queue` | `{ size, items }` | Dispatched on every queue change (mirrors `queue.onChange`). |
| `o-offline-sync-start` | `{ total }` | Dispatched when a replay pass with `total > 0` begins. |
| `o-offline-sync` | `{ sent, failed, remaining }` | Dispatched when a replay pass with items ends. |
| `o-offline-failed` | `{ entry, error }` | Dispatched per-entry when `onError`/`onConflict` resolves to `'drop'` after a failure. |

Also mirrored on the internal bus (`Orion.on`/`Orion.emit`, not DOM events): `offline:change`, `offline:sync-start`, `offline:sync`, `offline:queue`.

## Storage keys

* IndexedDB database `orion-offline` (object store `queue`, keyPath `id`) — primary queue persistence.
* `localStorage` key `orion:offline:queue` — fallback when IndexedDB is unavailable (only entries with JSON-serializable bodies persist this way; `FormData`/`Blob`/`ArrayBuffer` bodies survive only in memory under this fallback).
* `BroadcastChannel` name `orion-offline` — notifies other tabs to reload the queue after a local change.
* Web Locks name `orion-offline-sync` — prevents concurrent replay passes across tabs.

`Orion.http`'s `offline: 'queue'` request option and `data-o-ajax`'s `data-o-ajax-offline` attribute
(see [`../http/README.md`](../http/README.md)) both route mutations through `Orion.offline.queue.add()`.
