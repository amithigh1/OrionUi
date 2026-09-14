# notifications

A shared notification store (`Orion.notifications`) plus two elements that both read it live: a header
bell (`<o-notification-bell>`) and the list/center itself (`<o-notifications>`), usable standalone (a
dedicated page, a drawer) or inside the bell's popover, which builds one internally.

## Files

| File | Contents |
|---|---|
| `10-service.js` | `Orion.notifications` — the store (`push`, `setItems`, `append`, `markRead`, `remove`, `configure`, `connect`, `unreadCount`, `on('change', …)`). |
| `20-notifications.js` | `<o-notifications>` — the list/center. |
| `30-bell.js` | `<o-notification-bell>` — bell button + badge, opens a panel containing an internal `<o-notifications compact>`. |
| `notifications.css` | `.o-notif-*` (this package's own classes — bell button/panel, header, icon bubble, dismiss button) plus reused core classes, see below. |

## `Orion.notifications`

See the full API in `10-service.js`'s header comment; the essentials:

```js
Orion.notifications.push({ title: 'New order #10231', body: 'RM 1,240.00', type: 'success' });
Orion.notifications.setItems([{ id: 1, title: '…', body: '…', type: 'info', createdAt: Date.now() }]);
Orion.notifications.markRead(id);            // or 'all'
Orion.notifications.unreadCount;              // getter
Orion.notifications.connect(wsClient);        // push source -> store.push() on every 'notification' event
```

`push()`'s `type` (`success | error | warning | info | mention`, anything else falls back to a plain bell
icon) drives both elements' icon + color and, when `configure({ toast: true })`, the bridged
`Orion.toast`. `icon` on an item overrides the type-derived icon. `configure({ persist: true })`
round-trips `items` (including read state) through `localStorage`; `crossTab` (default on) mirrors every
write to other tabs via `BroadcastChannel`.

## `<o-notification-bell>`

```html
<o-notification-bell></o-notification-bell>
```

This is exactly what `templates/assets/shell.js` uses (`<o-notification-bell id="tpl-bell">`, no other
setup) — it needs nothing beyond `Orion.notifications` having items in it.

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `max` | `max` | `Number` | `99` | The badge reads `"{max}+"` past this. |
| `showDot` | `show-dot` | `Boolean` | `false` | Plain dot instead of the count (reuses core `.o-badge-counter:empty`, which already collapses to a dot with no text). |
| `placement` | `placement` | `String` | `'bottom-end'` | Passed to `autoPlace()` for the panel. |
| `label` | `label` | `String` | — | Button `aria-label` (default: localized "Notifications"). |
| `texts` | — | `Object` | — | Forwarded per-instance string overrides. |

| Method | Description |
|---|---|
| `open()` / `close()` / `toggle()` | Panel control; `open()` is vetoable via cancelable `o-before-open`. |

| Event | Detail | Notes |
|---|---|---|
| `o-open` / `o-close` | `{}` / `{ reason }` | Panel opened/closed (`reason`: `'outside' \| 'escape' \| 'api' \| ...`). |
| `o-select` | `{ item }` | Forwarded from the internal `<o-notifications>`; the panel closes right after. |
| `o-dismiss` | `{ item }` | Forwarded when a row's dismiss button is used. |

The panel is a single internal `<o-notifications compact>`, built once and portaled to `<body>` while
open (query it from `document`, not from the bell, if you need to reach in — see the pitfall in
`ARCHITECTURE.md` §5/§6). Because both elements read the same store, the badge count and the panel's
rows are always consistent with each other with zero glue code.

## `<o-notifications>`

```html
<o-notifications id="center"></o-notifications>          <!-- full list/center: header, mark-all-read, clear-all -->
<o-notifications compact show-header="false"></o-notifications>   <!-- bare rows, e.g. embedded in your own panel -->
```

It always renders `Orion.notifications.items` — there is no local `items` property to set; feed the
store instead (`push`/`setItems`/`connect`).

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `compact` | `compact` | `Boolean` | `false` | Denser rows/icons/text — used internally by the bell's panel. |
| `groupByDay` | `group-by-day` | `Boolean` | `true` | Inserts a `.o-divider` ("Today" / "Yesterday" / date) between items. |
| `showHeader` | `show-header` | `Boolean` | `true` | Title + unread count + "Mark all read" / "Clear all". |
| `emptyText` | `empty-text` | `String` | — | Custom empty-state text. |
| `source` | — | `(page, { pageSize }) => items[] \| { items, hasMore }` (`attr: false`) | — | Pulls **older** notifications for `load()`/`auto-load`; results are appended via `Orion.notifications.append()`. |
| `pageSize` | `page-size` | `Number` | `20` | Passed to `source`; fallback for inferring `hasMore`. |
| `autoLoad` | `auto-load` | `Boolean` | `false` | Infinite-scroll the sentinel row instead of showing a "Load more" button. |
| `label` | `label` | `String` | — | `aria-label` (default: localized "Notifications"). |
| `texts` | — | `Object` | — | Per-instance string overrides. |

| Method | Description |
|---|---|
| `markAllRead()` | `Orion.notifications.markRead('all')`. |
| `clearAll()` | `Orion.notifications.remove('all')`. |
| `load(page = next)` | `-> Promise<newItems[]>`. Same contract as `<o-activity-feed>.load()` (see `../activity/README.md`), but appends to the **shared store** rather than a local `items` array. |

| Event | Detail | Notes |
|---|---|---|
| `o-select` | `{ item }` | A row was activated (click / <kbd>Enter</kbd>/<kbd>Space</kbd>, not the dismiss button); the item is marked read first. |
| `o-dismiss` | `{ item }` | The row's dismiss (×) button was used — the item is already removed from the store by the time this fires. |
| `o-load` | `{ page, items, hasMore }` | After a successful `load()`. |
| `o-error` | `{ error }` | `source()` rejected or threw. |

### Real-time source

```js
const ws = Orion.ws('wss://api.example.com/live');
const disconnect = Orion.notifications.connect(ws);         // every 'notification' event -> store.push()
// ...
disconnect();
```

`connect(client, { event })` (in `10-service.js`) is the adapter — see `src/components/realtime/README.md`
for `Orion.ws` / `Orion.sse` / `Orion.signalr` / `Orion.poll` and their in-browser mock servers, which is
how this package's own tests simulate a push source without a network.

### Reused vs. owned CSS

`.o-badge` / `.o-badge-counter`, `.o-feed` / `.o-feed-item` / `.o-feed-content` / `.o-feed-time`,
`.o-divider`, `.o-empty` and `.o-floating` are **core** classes (`src/css/*.css`) — this package does not
redefine them, only scopes small tweaks under `.o-notifications .o-feed-item` etc. Everything under
`.o-notif-*` (bell button/panel, header, icon bubble, dismiss button) is this package's own — kept
deliberately distinct from `<o-activity-feed>`'s `.o-feed-icon`/`.o-feed-avatar` (same idea, different
class) so the two packages never collide on a bare selector.

## Keyboard & a11y

Bell: `aria-haspopup`/`aria-expanded`, focus returns to the button on close (via `overlays`), Escape
closes. Rows: `tabindex="0"`, `role="listitem"`, activate with <kbd>Enter</kbd>/<kbd>Space</kbd>; the
dismiss button is reachable by keyboard even though it's visually hover-revealed (`:focus-visible`).
Type is never color-only — every row shows an icon and text in addition to `color`.

## Limitations

* No built-in filter-by-type for `<o-notifications>` (unlike `<o-activity-feed>`) — its rows are meant to
  stay a single reverse-chronological stream; filter `Orion.notifications.items` yourself and call
  `setItems()` if you need that.
* `groupByDay` uses the viewer's local calendar day, same caveat as `<o-activity-feed>`.
* The store itself has no server-side "unread since" concept — `unreadCount` is just `items.filter(i => !i.read).length`, so very large histories should be trimmed with `configure({ maxItems })` (default 500) rather than kept forever.
