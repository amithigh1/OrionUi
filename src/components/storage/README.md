# storage

Client-side storage services: namespaced `localStorage`/`sessionStorage` wrappers with JSON values, TTL and
cross-tab change events (`Orion.store` / `Orion.session`); a promise-based IndexedDB layer (`Orion.idb`); a Cache
Storage API wrapper with TTL (`Orion.cache`); storage-quota helpers under `Orion.storage`; and a dev widget,
`<o-storage-inspector>`, that browses and clears all of them.

## `Orion.store` / `Orion.session`

```js
Orion.store.set('filters', { status: 'active' }, { ttl: '7d' });   // ttl: ms | '30s' | '10m' | '2h' | '7d' | '1w'
Orion.store.get('filters', {});
const off = Orion.store.onChange('filters', (value, old, info) => …);   // same tab + other tabs (storage event)
```

`Orion.store = createStore('localStorage')` and `Orion.session = createStore('sessionStorage')` — both use the
default namespace `'orion:store'` (call `.namespace(name)` for another). Falls back to an in-memory `Map` when the
backend throws (private mode, sandboxed iframe, quota).

`Orion.storage.createStore(kind='localStorage', ns='orion:store')` returns (or reuses) a store instance for any
`kind`/namespace pair.

| Member | Signature | Description |
|---|---|---|
| `.kind`, `.namespace` | `String` | |
| `.persistent` (getter) | `Boolean` | `false` when the in-memory fallback is in use. |
| `.get(key, def?)` | `(key, def?) => any` | |
| `.set(key, value, opts?)` | `(key, value, { ttl }? \| ttl) => boolean` | `false` when the value could not be stored (not serializable, or quota exceeded even after pruning expired keys). |
| `.has(key)` | `(key) => boolean` | |
| `.remove(key)` / `.del(key)` | `(key) => boolean` | Returns whether the key existed. |
| `.update(key, fn, def?, opts?)` | `(key, fn(oldValue) => newValue, def?, opts?) => newValue` | |
| `.ttl(key)` | `(key) => number` | Remaining ms (`Infinity` = no TTL, `0` = missing/expired). |
| `.keys()` | `() => string[]` | |
| `.entries()` | `() => [key, value][]` | |
| `.clear(prefix='')` | `(prefix?) => number` | Removes keys (in this namespace) starting with `prefix`; returns count. |
| `.size()` | `() => number` | Approximate bytes (UTF-16, 2 bytes/char) used by this namespace. |
| `.prune()` | `() => number` | Removes expired entries now; returns count removed. |
| `.onChange(key \| '*', fn)` | `(fn(value, old, { key, source: 'local'\|'remote', store })) => off()` | `'remote'` = changed by another tab (`storage` event). |
| `.namespace(name)` | `(name) => store` | Another store on the same backend with prefix `name + ':'`. |
| `.backend` (getter) | `Storage \| memory object` | Raw backend. |

## `Orion.idb`

```js
const db = await Orion.idb.open('crm', { stores: { users: { keyPath: 'id', autoIncrement: true, indexes: ['email', { name: 'tags', keyPath: 'tags', multiEntry: true }] }, notes: null } });
await db.put('users', { id: 1, email: 'ada@x.io' });
await db.tx(['users', 'notes'], 'readwrite', async t => { await t.store('users').put(u); await t.store('notes').add(n); });
await Orion.idb.kv.set('draft', {...});
```

| Member | Signature | Description |
|---|---|---|
| `.supported` (getter) | `Boolean` | |
| `.open(name, opts?)` | `(name, { stores, version?, upgrade?(db, oldV, newV, tx), prune?, blockedTimeout=10000 }) => Promise<Database>` | `stores`: `{ [name]: null \| keyPathString \| { keyPath?, autoIncrement?, indexes?: (string \| { name, keyPath, unique?, multiEntry? })[] } }`. Without `version`, a missing store/index triggers an automatic version bump. `prune: true` drops stores not listed. |
| `.kv` | key-value store | See below. |
| `.databases()` | `() => Promise<{ name, version }[]>` | Empty array where `indexedDB.databases()` is unsupported. |
| `.deleteDatabase(name)` | `(name) => Promise<boolean>` | |
| `.range` | `{ only(v), bound(a, b, loOpen=false, hiOpen=false), lower(a, open=false), upper(b, open=false) }` | Returns `IDBKeyRange`. |
| `.Database` | class | `IDBDatabaseWrapper`, returned by `.open()`. |

`Orion.idb.kv` (default key-value store; IndexedDB database `orion-kv` → memory fallback):

| Member | Signature |
|---|---|
| `.get(key, def?)` | `(key, def?) => Promise<any>` |
| `.set(key, value)` | `(key, value) => Promise<key>` |
| `.del(key)` (alias `.delete`, `.remove`) | `(key) => Promise<void>` |
| `.has(key)` | `(key) => Promise<boolean>` |
| `.keys()` | `() => Promise<any[]>` |
| `.entries()` | `() => Promise<[key, value][]>` |
| `.clear()` | `() => Promise<void>` |
| `.persistent()` | `() => Promise<boolean>` | `true` when backed by IndexedDB (`false` = memory fallback). |

`Database` (`IDBDatabaseWrapper extends Emitter`):

| Member | Signature | Description |
|---|---|---|
| `.version` (getter), `.stores` (getter → `string[]`) | | |
| `.get(store, key)` | `=> Promise<any>` | |
| `.put(store, value, key?)` | `=> Promise<key>` | |
| `.add(store, value, key?)` | `=> Promise<key>` | |
| `.delete(store, keyOrRange)` | `=> Promise<void>` | |
| `.clear(store)` | `=> Promise<void>` | |
| `.getAll(store, query?, count?)` | `(store, key \| IDBKeyRange \| fn(v,k)=>boolean, count?) => Promise<any[]>` | A function `query` filters via `.iterate()` instead of a native range query. |
| `.keys(store, query?, count?)` | `=> Promise<any[]>` | |
| `.count(store, query?)` | `=> Promise<number>` | |
| `.bulkPut(store, values[])` | `=> Promise<key>` | One transaction. |
| `.iterate(store, fn, opts?)` | `(store, fn(value, key, cursor) => false\|void, { index?, query?, direction='next' }) => Promise<void>` | Return `false` from `fn` to stop early. |
| `.index(store, name)` | `=> { get(v), getAll(v?, count?), keys(v?, count?), count(v?) }` | |
| `.tx(stores, mode='readonly', fn)` | `(stores, mode, async fn({ store(name), abort(), raw }) => result) => Promise<result>` | Resolves with `fn`'s result after commit; aborts the transaction if `fn` throws. |
| `.close()` | `() => void` | |
| `.destroy()` | `() => Promise<*>` | `close()` then deletes the whole database. |

Events: `'versionchange'`, `'close'`.

## `Orion.cache`

Cache Storage API helpers (secure contexts only: HTTPS or localhost). Default cache name `'orion-data'`.

```js
await Orion.cache.put('/api/me', { name: 'Ada' }, { ttl: '1h' });
await Orion.cache.match('/api/me');                                   // parsed data (json/text/blob by content-type) | undefined
await Orion.cache.match(url, { as: 'response' | 'json' | 'text' | 'blob' | 'arrayBuffer' });
```

| Member | Signature | Description |
|---|---|---|
| `.supported` (getter) | `Boolean` | |
| `.defaultName` | `'orion-data'` | |
| `.put(url, value, opts?)` | `(url, Response \| Blob \| string \| any, { cache?, ttl?, headers? }) => Promise<true>` | Non-`Response` values become a `Response` (JSON by default). Throws `StorageError`. |
| `.match(url, opts?)` | `(url, { cache?, as='auto', ignoreSearch?, ignoreVary?, any? }) => Promise<data \| undefined>` | Returns `undefined` past `ttl` (and deletes the entry). `any: true` also checks every cache when `cache` is omitted. |
| `.has(url, opts?)` | `=> Promise<boolean>` | |
| `.delete(url, opts?)` | `(url, { cache?, ignoreSearch? }) => Promise<boolean>` | |
| `.keys(cacheName?)` | `=> Promise<string[]>` | Absolute URLs in one cache (default `'orion-data'`). |
| `.names()` | `=> Promise<string[]>` | Every cache name for this origin. |
| `.clear(prefix='orion')` | `(prefix?) => Promise<number>` | Deletes matching caches; `clear('')` deletes all caches of this origin (service-worker caches use the `orion-sw-` prefix — see [`../pwa/README.md`](../pwa/README.md)). |
| `.size(cacheName?)` | `=> Promise<number>` | Bytes across stored bodies (opaque responses count as 0); all caches when omitted. |
| `.stats()` | `=> Promise<{ name, entries, bytes }[]>` | |

## `Orion.storage` (misc)

Aggregation object assembled across all four files:

| Member | Signature | Description |
|---|---|---|
| `.local` | `Orion.store` | |
| `.session` | `Orion.session` | |
| `.createStore(kind?, ns?)` | see above | |
| `.parseTTL(ttl)` | `(ttl) => number` (ms) | |
| `.idb` | `Orion.idb` | |
| `.cache` | `Orion.cache` | |
| `.StorageError` | class | |
| `.estimate()` | `() => Promise<{ usage, quota, percent, details } \| null>` | Wraps `navigator.storage.estimate()`. |
| `.persist()` | `() => Promise<boolean>` | Requests persistent storage (no eviction under pressure). |
| `.persisted()` | `() => Promise<boolean>` | |

## `StorageError`

`extends Error`. Fields: `name='StorageError'`, `message`, `code`, `cause?`.

Codes seen in this package: `ESTORAGE` (default), `EQUOTA`, `ECONSTRAINT`, `EVERSION`, `EIDB`, `EUNSUPPORTED`, `ECACHE`, `EBLOCKED`, `ECLOSED`.

## `<o-storage-inspector>`

```html
<o-storage-inspector sections="local,session,idb,cache" prefix="orion:" readonly></o-storage-inspector>
```

Dev widget: storage quota/usage bar, `localStorage`/`sessionStorage` keys (size, expiry, delete), IndexedDB
databases, Cache Storage caches (entry count, bytes) — each with a two-step "Delete → Confirm?" button (no blocking
dialogs).

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `sections` | `sections` | `Array` | `['local','session','idb','cache']` | Which sections to render. |
| `prefix` | `prefix` | `String` | `''` | Only list `local`/`session` keys starting with this prefix. |
| `readonly` | `readonly` | `Boolean` | `false` | Hides delete/clear actions and the "Make persistent" button. |
| `maxRows` | `max-rows` | `Number` | `100` | Row cap per `local`/`session` table (shows "+N more"). |
| `texts` | — | `Object` | — | Per-instance text overrides. |

| Method | Description |
|---|---|
| `refresh()` | `() => Promise<void>` — re-reads every storage area (quota estimate, persisted flag, IDB databases, cache stats, web storage keys) and re-renders. |

| Event | Detail | Notes |
|---|---|---|
| `o-refresh` | `{ est, persisted, dbs, cstats, local, session }` | Fired at the end of every `refresh()`. |
| `o-delete` | `{ kind: 'local'\|'session'\|'idb'\|'cache', name }` | **Cancelable** — fired before deleting one key/database/cache; veto with `preventDefault()`. |
| `o-clear` | `{ kind, name: '*' }` | **Cancelable** — fired before clearing an entire section. |

Auto-refreshes (debounced) on the native `storage` event and on `Orion.store` changes.

## Storage keys

* `localStorage` / `sessionStorage`: `orion:store:<key>` — default namespace for `Orion.store` and `Orion.session` alike.
* IndexedDB database `orion-kv` (object store `kv`) — backs `Orion.idb.kv`.
* Cache Storage: default cache name `orion-data` — backs `Orion.cache`.
