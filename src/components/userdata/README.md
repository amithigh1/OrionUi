# userdata

Per-user, persisted (`localStorage` by default, or a custom adapter), cross-tab-synced data stores: recently used
items, favorites (with manual ordering), search history, recently viewed (with visibility tracking), saved
views/filters, and arbitrary preferences. Ships ready-made UI: a favorite toggle button, recent/favorites list
widgets, and a saved-views picker. Namespaced per user (`Orion.userdata.user`) and auto-follows `Orion.auth`.

## `Orion.userdata`

| Member | Description |
|---|---|
| `user` | Getter; current namespace `String` (default `'anon'`). |
| `setUser(id, { auto = false } = {})` | Switches namespace; `id == null \| ''` resets to `'anon'` → `userdata`. Called automatically (`auto: true`) whenever bus `auth:change` fires, unless `setUser()` was already called explicitly. |
| `configure({ storage } = {})` | Plug a custom adapter `{ get(key), set(key, value), del(key) }` instead of `localStorage` (e.g. a server-synced cache) → `userdata`. |
| `export()` | → `{ recent, favorites, search, viewed, views, prefs }` snapshot for the current user. |
| `import(data = {})` | Writes any of those six keys → `userdata`. |
| `clear()` | Wipes all six stores for the current user, in every tab → `userdata`. |
| `onChange(fn({ store, user, source }))` | → `off()`. Fires for every store write; `source`: `'local'\|'remote'\|'user'`. |

## `Orion.recent` / `Orion.viewed`

Identical shape, separate storage keys. `recent.max = 20`, `viewed.max = 50`. `viewed.track(item)` is an alias for
`viewed.add(item)` (used by the `data-o-track-view` behavior below).

| Method | Description |
|---|---|
| `add(item)` | `item` needs `.id` or `.url`. De-dupes by id, moves to front, stamps `.time`, increments `.count` → the stored entry, or `null` if invalid. |
| `list({ type, limit } = {})` | `type`: `String` (comma-list) or `Array`, filters by `.type` → entries. |
| `get(id)` | → entry or `null`. |
| `remove(id)` | → `Boolean` (found?). |
| `clear(type?)` | Clears everything, or just entries matching `type`. |
| `onChange(fn)` | → `off()`; store-scoped. |

## `Orion.favorites`

| Method | Description |
|---|---|
| `list()` | → item array. |
| `has(id)` / `get(id)` | → `Boolean` / item or `null`. |
| `add(item)` | `item` needs `.id`; merges into an existing entry with the same id → `Boolean`. |
| `remove(id)` | → `Boolean`. |
| `toggle(item)` | → `Boolean`, the new "is favorite" state. |
| `update(id, patch)` | Merges `patch` into the stored item (`id` itself can't change) → `Boolean`. |
| `reorder(ids)` | Reorders by the given id list; unknown ids ignored, items missing from `ids` keep relative order at the end → the reordered array. |
| `move(id, delta)` | Nudges one item by `±delta`, clamped → new index `Number` (`-1` if not found). |
| `clear()` | — |
| `onChange(fn)` | → `off()`. |

## `Orion.searchHistory`

Per named `scope` (default `'global'`), max 10 entries per scope (`searchHistory.max`).

| Method | Description |
|---|---|
| `add(query, scope = 'global')` | Trims, de-dupes case-insensitively, moves to front. |
| `list(scope = 'global', limit?)` | → `[{ query, time }]`. |
| `remove(query, scope = 'global')` | — |
| `clear(scope?)` | Clears one scope, or all scopes if omitted. |
| `onChange(fn)` | → `off()`. |

## `Orion.views`

Saved views/filters, per named `scope` (default `'default'`). View shape: `{ id, name, state, isDefault, created, updated }`.

| Method | Description |
|---|---|
| `list(scope = 'default')` | → view array. |
| `get(scope, idOrName)` | Matches by id, then case-insensitive name → view or `null`. |
| `save(scope, name, state, { isDefault, id } = {})` | Creates or updates (by `id`, else by matching name). `isDefault: true` clears the flag on every other view in the scope. Throws if `name` is blank → the saved view. |
| `rename(scope, idOrName, name)` | → view or `null`. |
| `remove(scope, idOrName)` | → `Boolean`. |
| `setDefault(scope, idOrName \| null)` | `null` clears the scope's default → view or `null`. |
| `getDefault(scope = 'default')` | → view or `null`. |
| `clear(scope?)` | — |
| `onChange(fn)` | → `off()`. |

## `Orion.prefs`

Arbitrary per-user key/value preferences.

| Method | Description |
|---|---|
| `get(key, def)` | → value or `def`. |
| `set(key, value)` \| `set({ k: v, ... })` | A value of `undefined` deletes the key → `prefs`. |
| `toggle(key)` | → `Boolean`, the new value (missing key treated as `false`). |
| `on(key \| '*', fn(value, old, key))` | → `off()`. Per-key (or `'*'` for any key) listener; fires on local changes, other tabs, and user switches. |
| `all()` | → full prefs `Object`. |
| `reset(key?)` | Clears one key, or the entire prefs object if omitted → `prefs`. |
| `onChange(fn)` | → `off()`. Store-level, fires once per write (not per key — use `on()` for per-key diffing). |

## Bus events

| Event | Detail | Notes |
|---|---|---|
| `userdata:change` | `{ store, user, source }` | One per store write, for any of `recent`, `favorites`, `search`, `viewed`, `views`, `prefs`. `source`: `'local'` (this tab wrote it), `'remote'` (another tab, via `BroadcastChannel`/`localStorage`), or `'user'` (`setUser()` switched namespaces — refires for all six stores). |

## Behaviors

### `data-o-track-view='{"id":…,"title":…}'`

Applies to any element. Value is JSON (or a bare id string, defaulting to `location.pathname + search`).

| Sub-attribute | Notes |
|---|---|
| `data-o-track-view-delay` | Ms dwell time required before recording (default `0`). |

Requires ≥50% visible (by intersection ratio or by covering ≥50% of the viewport height) before recording; records
once per element via `viewed.track({ title: document.title, url: location.href, ...item })` and dispatches a DOM
`CustomEvent` `o-track-view` `{ item }` on the element.

## Elements

### `<o-favorite-button>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `item` | — | `Object` (attr JSON) | `{}` | Needs `.id` (usually also `.title`/`.url`/`.icon`/`.type`/`.meta`). |
| `label` | `label` | `Boolean` | `false` | Show a text label besides the star. |
| `size` | `size` | `String` | — | `'sm'` for a smaller button. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

Read-only property: `pressed` (getter) → `Boolean`. Method: `toggle(force?)` — `force` can pin the state.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-before-change` | `{ favorite, item }` | Yes — return `false`/`preventDefault()` vetoes the toggle. |
| `o-change` | `{ favorite, item }` | No |

### `<o-recent-list>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `type` | `type` | `String` | — | Filter by item type. |
| `limit` | `limit` | `Number` | `8` | |
| `store` | `store` | `String` | `'recent'` | `'recent'\|'viewed'`. |
| `emptyText` | `empty-text` | `String` | — | |
| `clearable` | `clearable` | `Boolean` | `false` | Shows a "Clear all" footer button. |
| `texts` | — | `Object` | — | |

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-select` | `{ item }` | Yes — return `false`/`preventDefault()` cancels navigating the link. |

### `<o-favorites-list>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `limit` | `limit` | `Number` | — | |
| `emptyText` | `empty-text` | `String` | — | |
| `clearable` | `clearable` | `Boolean` | `false` | |
| `texts` | — | `Object` | — | |

Draggable reordering when `Orion.sortable` is available (grip handle `.o-ud-grip`); Alt+ArrowUp/ArrowDown on a
focused row always works regardless of `Orion.sortable`.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-select` | `{ item }` | Yes |
| `o-reorder` | `{ ids }` | No — fired after a drag or Alt+Arrow reorder. |

### `<o-saved-views>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `scope` | `scope` | `String` | `'default'` | |
| `value` | `value` | `String`, reflect | — | Id of the currently-applied view. |
| `state` | — | `Any` (attr:false) | — | The state object to save (alternative to `getState`). |
| `getState` | `getState` | `Function` | — | `() => state`; takes priority over `state`. |
| `applyDefault` | `applyDefault` | `Boolean` | `false` | Auto-apply the scope's default view once on connect if no `value` is set. |
| `placement` | `placement` | `String` | `'bottom-start'` | Popover placement. |
| `texts` | — | `Object` | — | |

#### Methods

| Method | Description |
|---|---|
| `currentState()` | Resolves the state to save: `getState()` → `state` prop → `'before-save'` listener's `detail.state`. |
| `apply(idOrName)` | → view or `null`. |
| `save(name, { isDefault } = {})` | → the saved view. |
| `remove(idOrName)` | → `Boolean`. |
| `open()` / `close()` / `toggle()` | — |

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-before-save` | `{ state }` | No — listener may set `detail.state`. |
| `o-before-apply` | `{ view, state }` | Yes |
| `o-apply` | `{ view, state }` | No |
| `o-save` | `{ view }` | No |
| `o-before-delete` | `{ view }` | Yes |
| `o-delete` | `{ view }` | No |
| `o-open` | — | No |
| `o-close` | — | No |
