# presence

Online/away/busy/dnd/offline indicators: a tiny shared store (`Orion.presence`), a single status
dot + label (`<o-presence>`), and a grouped "who's online" list (`<o-presence-list>`). Statuses match
`<o-avatar status>` exactly (`online | away | busy | dnd | offline`) and reuse the same core `.o-status`
CSS class (`src/css/60-content.css`) so a presence dot and an avatar's status dot always agree.

## Files

| File | Contents |
|---|---|
| `10-service.js` | `Orion.presence` — the store (`set`, `get`, `entry`, `all`, `entries`, `remove`, `onlineCount`, `subscribe`, `autoAway`). |
| `20-presence.js` | `<o-presence>` — one dot + label. |
| `30-presence-list.js` | `<o-presence-list>` — grouped roster fed by `items` and (optionally) live status from the store. |
| `presence.css` | `.o-presence*` layout, plus the one core class this package extends: `.o-status-dnd` (core ships `online/away/busy/offline`, see below). |

## `Orion.presence`

A plain event-emitting store. Nothing on the page needs to exist for it to work — wire your
websocket/poll handler straight to `set()`, then any number of `<o-presence>` / `<o-presence-list>`
elements (or your own code, via `subscribe`) stay in sync.

| Member | Signature | Description |
|---|---|---|
| `set(userId, status, meta?)` | `(id, 'online'\|'away'\|'busy'\|'dnd'\|'offline', object?) => this` | Unknown status values are stored as `'offline'`. `meta` (e.g. `{ name, avatar }`) is merged onto the entry, so later calls can omit it. |
| `get(userId)` | `(id) => status` | `'offline'` for an unknown user. |
| `entry(userId)` | `(id) => { status, updatedAt, ...meta } \| null` | |
| `has(userId)` | `(id) => boolean` | |
| `remove(userId)` | `(id) => this` | Drops the entry (e.g. on logout/disconnect); notifies subscribers with `status: 'offline', removed: true`. |
| `all()` | `() => { [userId]: status }` | |
| `entries()` | `() => [{ id, status, updatedAt, ... }]` | |
| `onlineCount()` | `() => number` | Counts every non-`'offline'` entry. |
| `subscribe(fn)` | `(fn({ userId, status, prev, entry, removed? })) => off()` | Alias for `.on('change', fn)`. |
| `autoAway(userId, opts?)` | `(id, { timeout=300000, crossTab=false, key }) => stop()` | Requires [`Orion.idle`](../idle/idle.js) (a **no-op returning a no-op `stop()`** without it — check `Orion.idle` yourself first if you need to know whether it's active). Sets the user `'away'` after `timeout` ms of inactivity and restores their previous status on activity; skips users already `'dnd'` or `'offline'` (a deliberate Do Not Disturb, or an already-signed-out user, should not flip to "away"). |
| `STATUSES` | `string[]` | `['online', 'busy', 'dnd', 'away', 'offline']` — presence-priority order, used for sorting/grouping. |

```js
// Feed it from your realtime layer (see src/components/realtime/README.md)
Orion.presence.set('me', 'online', { name: 'Aisha Rahman' });
Orion.presence.autoAway('me', { timeout: 5 * 60 * 1000 });   // -> 'away' after 5 idle minutes

hub.on('PresenceChanged', (userId, status) => Orion.presence.set(userId, status));
Orion.presence.subscribe(({ userId, status }) => console.log(userId, 'is now', status));
```

## `<o-presence>`

```html
<o-presence status="online" label="Aisha Rahman"></o-presence>          <!-- driven by hand -->
<o-presence user-id="u42" show-label="false"></o-presence>              <!-- driven by Orion.presence -->
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `status` | `status` | `String` | `'offline'` | `online \| away \| busy \| dnd \| offline`; ignored while `userId` is set (the store wins). Reflected. |
| `userId` | `user-id` | `String` | — | When set, the element subscribes to `Orion.presence` and tracks that user's status live (and its `name`, if the store has one, as a label fallback). |
| `label` | `label` | `String` | — | Explicit label text; falls back to the store's `name`, then to the localized status word alone. |
| `showLabel` | `show-label` | `Boolean` | `true` | `false` hides the text (dot only) and moves it to `aria-label` instead. |
| `pulse` | `pulse` | `Boolean` | `false` | Adds a soft expanding ring (`.o-status-pulse`, disabled under reduced motion) while `online`. |
| `texts` | — | `Object` | — | Per-instance string overrides (`online`, `away`, `busy`, `dnd`, `offline`). |

No events — it's a passive indicator. `role="status"` so a live status change is announced by assistive tech.

## `<o-presence-list>`

```html
<o-presence-list id="roster" group-by="status" hide-offline></o-presence-list>
<script>
  roster.items = [
    { id: 'u1', name: 'Aisha Rahman', status: 'online', role: 'Admin' },
    { id: 'u2', name: 'Ben Tan', status: 'busy', group: 'Engineering' },
  ];
  roster.addEventListener('o-select', e => openProfile(e.detail.item));
</script>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | `Array` | `[]` | `[{ id, name, avatar?, status?, role?, group? }]`. `status` is the fallback used only when `live` has no store entry for that `id`. |
| `groupBy` | `group-by` | `String` | `'status'` | `status` (5 sections, presence-priority order) \| `group` (by each item's `group` field, alphabetical, unlabeled falls under "Other") \| `none` (flat, presence-priority sorted). |
| `hideOffline` | `hide-offline` | `Boolean` | `false` | Drops offline rows entirely (after resolving live status). |
| `live` | `live` | `Boolean` | `true` | Subscribes to `Orion.presence` and re-renders on every change; a row's live status (by `id`) overrides its own `status` field once the store has an entry. |
| `empty` | `empty` | `String` | — | Custom empty-state text (default: localized "No one here"). |
| `texts` | — | `Object` | — | Per-instance string overrides. |

| Event | Detail | Notes |
|---|---|---|
| `o-select` | `{ item }` | A row was clicked or activated with <kbd>Enter</kbd>/<kbd>Space</kbd>. |

Each row uses `<o-avatar name>` (falls back to a plain initials `<span class="o-avatar">` if the `basics`
package isn't in the build) with a `.o-status` dot overlaid bottom-end, matching `<o-avatar status>`'s own
badge position.

## Keyboard & a11y

* `<o-presence>`: `role="status"`, so screen readers announce a status change without moving focus.
* `<o-presence-list>` rows: `tabindex="0"`, activate with <kbd>Enter</kbd> or <kbd>Space</kbd>, visible focus
  ring. Status is never color-only — every row and every `<o-presence>` carries a text label or `aria-label`.

## Limitations

* `Orion.presence` is in-memory only (no persistence, no cross-tab broadcast) — feed it from your own
  realtime layer, same as `Orion.chat.connect()` and `Orion.notifications.connect()` do for their packages.
* `autoAway()` tracks activity on `document` (via `Orion.idle`), i.e. one "local user" idle clock per page;
  it does not attempt to detect idleness of *other* users.
* `<o-presence-list>` does not virtualize; for rosters beyond a few hundred people, page/filter `items`
  yourself before assigning them (see [`virtuallist`](../virtuallist/README.md) if you need a virtualized row list).
