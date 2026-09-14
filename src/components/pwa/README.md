# pwa

Progressive Web App support: service-worker registration and update lifecycle (`Orion.pwa`, where the very same
`orion.js` bundle doubles as the service-worker script — see [Service worker mode](#service-worker-mode) below),
browser notifications with an in-app toast fallback (`Orion.notify`), a Web App Manifest builder, and an
`<o-install-prompt>` element that surfaces the native install prompt (or iOS "Add to Home Screen" instructions).

## `Orion.pwa`

```js
await Orion.pwa.register({ scope: './', precache: ['./', './app.css'], offlinePage: './offline.html',
  routes: [{ match: '/api/', strategy: 'network-first', timeout: 4000 }, { match: '*.png', strategy: 'cache-first', maxEntries: 60 },
           { match: '/api/', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], queue: true }] });
Orion.pwa.onUpdate(({ registration }) => …);
```

Requires HTTPS or localhost. To register at a scope above the script's own folder, serve `orion.js` with header
`Service-Worker-Allowed: /`, or register a tiny `/sw.js` containing `importScripts('/path/orion.js')` and pass it as
`swUrl`.

| Member | Signature | Description |
|---|---|---|
| `.supported` (getter) | `Boolean` | `'serviceWorker' in navigator` in a secure context. |
| `.registration` (getter) | `ServiceWorkerRegistration \| null` | |
| `.controller` (getter) | `ServiceWorker \| null` | `navigator.serviceWorker.controller`. |
| `.register(swUrl?, opts?)` | `(swUrl?, RegisterOptions) => Promise<ServiceWorkerRegistration \| null>` | `null` (and emits `'unsupported'`) when `!supported`. `swUrl` may be omitted from a `<script>` tag matching `orion(.esm)?(.min)?.js`. |
| `.update()` | `() => Promise<ServiceWorkerRegistration \| null>` | Asks the browser to check the server for a new version. |
| `.applyUpdate()` | `() => boolean` | Sends `SKIP_WAITING` to the waiting worker and reloads once it takes control; `false` if nothing is waiting. |
| `.updateAvailable` (getter) | `Boolean` | `true` once a new worker is waiting and a controller already exists. |
| `.unregister()` | `() => Promise<boolean>` | |
| `.message(data, opts?)` | `(data, { timeout=5000 }) => Promise<reply>` | Round-trip via `MessageChannel` to the active/waiting/installing worker; rejects `PWAError('ETIMEOUT')` past `timeout`. |
| `.sync()` | `() => Promise<{ sent, dropped, remaining }>` | Sends `{ type: 'REPLAY' }` — replays the SW's queued mutations now. |
| `.queueSize()` | `() => Promise<number>` | `{ type: 'QUEUE_SIZE' }`. |
| `.clearCaches()` | `() => Promise<{ cleared: number }>` | `{ type: 'CLEAR_CACHES' }` — deletes every `orion-sw-*` cache. |
| `.on(event, fn)` / `.off(event, fn)` / `.onUpdate(fn)` | | See [Events](#events) below; `onUpdate` is `on('update', fn)`. |
| `.canInstall` (getter) | `Boolean` | A captured `beforeinstallprompt` event is available. |
| `.installMode` (getter) | `'prompt' \| 'ios' \| 'installed' \| 'unavailable'` | |
| `.isStandalone` (getter) | `Boolean` | Any standalone/fullscreen/minimal-ui/WCO display-mode media query, or `navigator.standalone`. |
| `.isIOS` (getter) | `Boolean` | |
| `.install()` | `() => Promise<{ outcome: 'accepted'\|'dismissed'\|'ios'\|'unavailable', platform?, error? }>` | Shows the captured native prompt, or reports `'ios'` on iOS Safari. |
| `.manifest(opts?)` | `(ManifestOptions) => { link, manifest, url } \| null` | Builds a blob-URL `<link rel="manifest">` (+ `<meta name="theme-color">`); auto-generates a lettermark icon when `icons` is omitted. `ManifestOptions`: `{ name?, short_name?/shortName?, icons?, theme_color?/themeColor?, background_color?/backgroundColor?, display?, start_url?/startUrl?, scope?, ...rest }`. |
| `.toast(msg, opts?)` | `(msg, { type?, action?: {label, onClick}, duration?, title? }) => { close(), el? }` | Internal fallback snackbar used when `Orion.toast` isn't available. |
| `.PWAError` | class | |

`RegisterOptions`: `{ scope?, precache?: string[], routes?: RouteConfig[], offlinePage?, version? (defaults to the library version), navigation? ('network-first'\|'cache-first'\|'stale-while-revalidate'\|'network-only'\|'cache-only'), networkTimeout? (ms), toast=true, checkInterval? (ms — periodic `reg.update()` while visible+online), debug?, updateViaCache?, swUrl? }`.

`RouteConfig`: `{ match: string | RegExp, strategy?, cache?, timeout?, maxEntries?, maxAge?, methods?, queue? }` — forwarded (JSON-encoded, functions rejected) to the service worker; see [`../../sw/10-sw.js`](../../sw/10-sw.js) for the strategies and queue behavior.

### Events

Emitted via `.on()`/`.onUpdate()` and (for the starred ones) as `document` custom events:

| Event | Detail | Notes |
|---|---|---|
| `registered` / `o-sw-registered`* | `{ registration }` | After a successful `.register()`. |
| `update` / `o-sw-update`* | `{ registration, waiting }` | A new worker is installed and waiting; default UI shows a "Reload" toast unless `toast: false`. |
| `installing` | `{ registration, worker }` | |
| `ready` / `o-sw-ready`* | `{ registration }` | First install, no previous controller (offline-ready). |
| `redundant` | `{ registration, worker }` | |
| `controllerchange` / `o-sw-controlling`* | `{ controller }` | |
| `message` / `o-sw-message`* | raw `ORION_*` message data | Every message from the worker also re-emits under a camelCased short name, e.g. `ORION_SW_QUEUE` → `queue({ size })`, `ORION_SW_REPLAYED` → `replayed({ url, method, status, ok })`, `ORION_PUSH` → `push({ payload })`, `ORION_NOTIFICATION_CLICK` → `notificationClick({ action, tag, data })`, `ORION_NOTIFICATION_CLOSE` → `notificationClose({ tag, data })`. |
| `unsupported` | — | `.register()` called without SW support. |
| `installable` / `o-pwa-installable`* | `true` / `{}` | `beforeinstallprompt` captured. |
| `installed` / `o-pwa-installed`* | — / `{}` | `appinstalled` fired. |
| `choice` | `{ outcome, platform }` | After the user responds to the native prompt. |
| `permission` | `'default'\|'granted'\|'denied'` | From `Orion.notify.request()`. |

## `Orion.notify`

```js
await Orion.notify('Order #1024 shipped', { body: 'Arrives Friday', icon: '/icon.png', tag: 'order-1024', onClick: () => open(…) });
```

| Member | Signature | Description |
|---|---|---|
| `Orion.notify(title, opts?)` | `(title, NotifyOptions) => Promise<{ via: 'native'\|'sw'\|'toast'\|'none', notification?, toast?, close() }>` | Native `Notification` when possible, else the active service worker's `showNotification` (required on Android Chrome), else an in-app toast, else nothing. |
| `.permission` (getter) | `'default'\|'granted'\|'denied'\|'unsupported'` | |
| `.request()` | `() => Promise<permission>` | Call from a click handler — browsers require a user gesture. |
| `.supported` (getter) | `Boolean` | `'Notification' in window`. |

`NotifyOptions`: `{ body?, icon?, badge?, image?, tag?, data?, requireInteraction?, silent?, renotify?, actions?, vibrate?, timestamp?, dir?, lang?, url?, onClick?(event, data), onClose?(), request=true (ask when permission is 'default'), fallback='toast'|false, serviceWorker='auto'|true|false, type? (toast type), duration?, actionLabel? }`.
Clicks on service-worker-shown notifications route back through `postMessage`, so `onClick` fires for those too.

## `<o-install-prompt>`

```html
<o-install-prompt app-name="Acme Admin" variant="banner" position="inline" dismiss-days="30"></o-install-prompt>
```

Shown when the browser offers installation (`beforeinstallprompt`) or on iOS Safari (Add to Home Screen
instructions). Hidden when installed/standalone, or dismissed (remembered per `dismiss-days` — see storage keys).

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `appName` | `app-name` | `String` | — | Falls back to `<meta name="application-name">`, then `document.title`, then `"App"`. |
| `description` | `description` | `String` | — | Overrides the default install description. |
| `icon` | `icon` | `String` | — | Image URL; falls back to a lettermark. |
| `variant` | `variant` | `String` | `'banner'` | `'banner' \| 'card' \| 'button'` (reflected). |
| `position` | `position` | `String` | `'inline'` | `'inline' \| 'top' \| 'bottom'` (reflected); non-inline positions animate in/out and close on <kbd>Escape</kbd>. |
| `dismissDays` | `dismiss-days` | `Number` | `30` | How long a dismissal is remembered. |
| `force` | `force` | `Boolean` | `false` | Always show, ignoring install mode/dismissal (docs/testing). |
| `mode` | `mode` | `String` | `'auto'` | Overrides `installMode` for demos: `'auto' \| 'prompt' \| 'ios' \| 'installed' \| 'unavailable'`. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Read-only: `.name` (getter), `.installMode` (getter, `mode` attribute overrides `Orion.pwa.installMode`), `.dismissed` (getter).

| Method | Description |
|---|---|
| `install()` | `() => Promise<{ outcome, ... }>` — triggers the native prompt (or shows iOS steps). |
| `dismiss()` | `() => void` — hides and remembers the choice for `dismissDays`. |
| `reset()` | `() => void` — forgets a previous dismissal. |

| Event | Detail | Notes |
|---|---|---|
| `o-show` | `{ mode }` | Fired when the prompt becomes visible. |
| `o-install` | `{ outcome, platform?, error? }` | After `install()` resolves. |
| `o-dismiss` | — | After `dismiss()`. |

## `PWAError`

`extends Error`. Fields: `name='PWAError'`, `message`, `code`, `cause?`.

Codes: `ESCRIPT` (couldn't detect the Orion script URL), `ESCOPE` (registration blocked by scope/security), `EREGISTER` (registration failed), `EUNSUPPORTED`, `ENOWORKER` (no active worker to message), `ETIMEOUT` (no reply), `ESW` (worker replied with an error).

## Storage keys

* `localStorage` key `orion:pwa:install-dismissed` — timestamp written by `<o-install-prompt>.dismiss()`, read by `.dismissed`.

## Service worker mode

`Orion.pwa.register()` doesn't register a separate script — it registers `orion.js` itself (or a thin `sw.js` that
`importScripts()`s it), passing all configuration as query params on the registration URL
(`orion-sw=<version>`, `precache=`, `offline=`, `nav=`, `timeout=`, `routes=<JSON>`, `debug=`). When loaded in a
service-worker context, [`../../sw/10-sw.js`](../../sw/10-sw.js) takes over and implements:

* Precaching (`install`) and versioned cache cleanup (`activate`, caches named `orion-sw-*-<version>`).
* Per-route strategies: `cache-first` · `network-first` (with `timeout`, falling back to cache) · `stale-while-revalidate` · `network-only` · `cache-only`, plus an offline fallback page for navigations.
* A mutation queue: requests on routes with `queue: true` are stored in IndexedDB (database `orion-sw`, store `queue`) when the network fails, and replayed in order on Background Sync (tag `orion-replay`), the `REPLAY` message, activation, or the next successful request — driving `Orion.pwa.sync()` / `.queueSize()`.
* Runtime messages (via `MessageChannel`, matching `Orion.pwa.message()`): `SKIP_WAITING`, `GET_VERSION`, `CLEAR_CACHES`, `QUEUE_SIZE`, `CLEAR_QUEUE`, `REPLAY`, `CACHE_URLS`/`ORION_SW_CONFIG`, `PING`.
* `push` → `showNotification()` and `notificationclick` → focus/open a window, both bridged back to page code as the `push`/`notificationClick`/`notificationClose` events on `Orion.pwa` above.

That file is out of scope for this package's API (it runs in the SW global scope, not as `Orion.*`); see its own
top-of-file comment for the exact config format.
