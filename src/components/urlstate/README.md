# urlstate

`Orion.url` provides typed, batched, history-aware query-string/hash state with two-way DOM bindings.
`Orion.deeplink` layers named "deep links" (hash fragments or `?open=`) on top of it to open modals, tabs, or
scroll to items from a shareable URL. Ships the `data-o-url` and `data-o-deeplink` behaviors.

## `Orion.url`

### Types

`Orion.url.types` (keyed by name → `{ parse, stringify }`): `string`, `number`, `boolean` (`'1'`/`'0'`), `array`
(comma-separated, `%2C`/`%25`-escaped items; also merges repeated keys), `json` (`JSON.parse`/`stringify`), `date`
(`YYYY-MM-DD` via `Orion.date`). A type may also be passed as a custom `{ parse, stringify }` object or a bare
parse function.

### Methods

| Method | Description |
|---|---|
| `get(key, type = 'string', fallback)` | Reads the query string first, then hash params → value, or `fallback` (`[]` for `type: 'array'`) when absent. |
| `has(key)` | → `Boolean`; checks both query and hash. |
| `all()` | → `{ key: value \| [values] }` for every query + hash param (as strings); query wins over a same-named hash key. |
| `set(key, value, opts)` \| `set({ k: v, ... }, opts)` | `opts: { replace, hash, type }`. `null`/`''`/`[]` removes the key. Multiple calls in the same tick coalesce into one history entry (flushed on a microtask) → `url`. |
| `remove(keys, opts = {})` | `keys`: `String` or `String[]` → `url`. |
| `build(obj = {}, { base, hash = false, clear = false } = {})` | → absolute URL `String` with `obj` merged in (or replacing all params if `clear`); does not navigate. |
| `flush()` | Writes pending `set()` changes to history synchronously (otherwise batched to a microtask) → `url`. |
| `sync()` | Re-reads `location` and fires `onChange` if changed (`source: 'sync'`); use after a router does its own `pushState` → `url`. |
| `onChange(fn({ changed, params, search, hash, source, origin }))` | → `off()`. `source`: `'set'\|'popstate'\|'hashchange'\|'navigate'\|'sync'`. |
| `bind(key, elementOrOptions)` | Two-way binding between a URL param and a DOM element or custom get/set functions → `{ key, update(), push (alias), pull(), unbind(), value (getter) }`. Options: `{ el, get, set, type, default, debounce, replace, hash, event }`. A value equal to `default` is omitted from the URL; pulls immediately if `key` is present. |

Element type auto-detection (when `type` is omitted): checkbox → `boolean`; `number`/`range` input → `number`;
multi-select or array-valued element → `array`; else `string`. Textual inputs debounce 300ms by default.

### Bus events

| Event | Detail | Notes |
|---|---|---|
| `url:change` | Same shape as `onChange` | Fired for `set()`, `popstate`, `hashchange`, `navigate` (History `navigation` API) and `sync()`. |

## `Orion.deeplink`

### Methods

| Method | Description |
|---|---|
| `parse(href?)` | → `[{ name, value, from }]`. `value === true` for bare names; `from`: `'hash'\|'query'`. Reads hash params (`#name=value`) and `?open=name:value,name2` lists. |
| `current` | Getter; alias for `parse()` on the current location. |
| `register(name, handler(value, { name, source, params }))` | → `unregister()`. Handler runs immediately (async, `setTimeout(0)`) if the current URL already targets `name` (`source: 'load'`). |
| `unregister(name, handler?)` | Removes one handler, or all handlers for `name` when `handler` is omitted. |
| `link(name, value?, { query, base, merge })` \| `link({ a: 1, b: true }, opts)` | → `String`. `query: true` targets `?open=name:value` instead of the hash; `merge: true` keeps existing entries. |
| `set(name, value = true, { replace = false } = {})` | Writes the link into the URL (hash) **without** running handlers → `deeplink`. |
| `open(name, value = true, { replace = false } = {})` | `set()` + runs handlers immediately (`source: 'api'`) → `deeplink`. |
| `remove(name, { replace = true } = {})` | Drops `name` from the hash and `?open=` → `deeplink`. |
| `copy(name, value, opts)` | → `Promise<Boolean>`; copies the link via `Orion.clipboard.copy` if present, else `navigator.clipboard`. |
| `handle(source = 'api')` | Re-runs handlers for everything currently in the URL. |

### Bus events

| Event | Detail | Notes |
|---|---|---|
| `deeplink` | `{ name, value, source }` | Emitted whenever a handler runs: on `register()`'s load-check, `open()`, `handle()`, or a detected URL change. `source` mirrors `Orion.url.onChange`'s `source` values (excluding `'set'`, which `Orion.url` uses for changes deeplink itself just wrote — those are not re-diffed). |

## Behaviors

### `data-o-url="key"`

Applies to any bindable form control. Two-way binds the control to the URL param `key` via `Orion.url.bind()`.

| Sub-attribute | Notes |
|---|---|
| `data-o-url-type` | One of `Orion.url.types`; auto-detected from the element if omitted. |
| `data-o-url-debounce` | Ms; default `300` for textual inputs, else `0`. |
| `data-o-url-replace` | Presence → use `history.replaceState` instead of `pushState`. |
| `data-o-url-hash` | Presence → bind into the hash instead of the query string. |
| `data-o-url-default` | Default value (parsed per `type` if the type isn't `'string'`). |

### `data-o-deeplink="name"`

Applies to any element: `<button data-o-toggle>`/`[data-o-action]`/`a[href]`/`button`/`[role=tab]`/`<summary>`/
`[role=button]` (clicked), `<dialog>` (`showModal()`), `<details>` (`open = true`), a custom element with `.open()`
or `.show()`, or any other element (scrolled into view, focused, highlighted).

| Sub-attribute | Notes |
|---|---|
| `data-o-deeplink-value` | Only activates when the link's value matches this string. |
| `data-o-deeplink-sync` | Also writes the link on click (unless a deeplink activation is already in progress) and removes it when the target closes (observes `o-close`, `o-closed`, `o-hide`, `close` DOM events on `document`, capture phase). |

Dispatches a DOM `CustomEvent` `o-deeplink` `{ name, value }` on the target element itself whenever the deeplink
activates it (bubbles/composed, via the `emit()` DOM helper — not cancelable).
