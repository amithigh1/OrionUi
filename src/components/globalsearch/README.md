# globalsearch — `<o-global-search>`

A header search box that expands into a floating, categorized results panel (full-screen below
~640px), fed by one or more async providers. No third-party code.

Docs: `docs/components/global-search.html`. Files: `00-store.js` (i18n + fallback history/recent/
favorites persistence — delegates to `Orion.searchHistory`/`Orion.recent`/`Orion.favorites` when a
compatible API is detected), `10-globalsearch.js` (the element), `globalsearch.css`.

```html
<o-global-search placeholder="Search…" shortcut="/"></o-global-search>
```
```js
el.providers = [{
  id: 'users', title: 'Users', icon: 'user', limit: 5,
  search: async (query, { signal }) => (await fetch(`/api/users?q=${query}`, { signal }).then(r => r.json()))
    .map(u => ({ id: u.id, title: u.name, subtitle: u.email, icon: 'user', url: `/users/${u.id}` })),
}];
```

## Properties

| Prop | Type | Default | Notes |
|---|---|---|---|
| `placeholder` | `string` | – | |
| `shortcut` | `string` | `'/'` | Focuses the box from anywhere (skipped while another field has focus); bound through `Orion.shortcuts` when that package is loaded, otherwise a small built-in listener. Falsy disables it. |
| `providers` | `Provider[]` | `[]` | Usually set as a property (each has a `search` function). |
| `trending` | `(string \| { label: string })[]` | `[]` | Suggested queries shown on an empty search. |
| `minChars` | `number` | `1` | |
| `debounce` | `number` | `200` | Per-provider debounce (ms) before `search()` runs. |
| `scope` | `string` | `'default'` | Key used for history/recent storage, so multiple search boxes can keep separate histories (see [Persistence](#persistence) — favorites are always shared, not per-scope). |

```ts
interface Provider {
  id: string; title: string | (() => string); icon?: string; limit?: number;   // default 5
  search(query: string, ctx: { signal: AbortSignal }): Promise<Result[]>;
  seeAllHref?: string | ((query: string) => string);
  onSeeAll?(query: string): void;
}
interface Result {
  id: string; title: string; subtitle?: string; url?: string; icon?: string; avatar?: string;
  meta?: string; badge?: string | number;
  onSelect?(item: Result): void;    // called instead of navigating to `url`
}
```

## Methods

| Method | Returns | |
|---|---|---|
| `open()` / `close()` / `toggle()` | `void` | |
| `focus(opts?)` | `void` | Focuses the input and opens the panel. |
| `setQuery(query)` | `void` | Sets the input value and (re)runs the search programmatically. |

## Events

| Event | Cancelable | `detail` |
|---|---|---|
| `o-before-open` | ✓ | `{}` |
| `o-open` / `o-close` | | `{}` / `{ reason: 'escape' \| 'outside' \| 'api' }` |
| `o-search` | | `{ query, submitted?: true }` — `submitted` is set when Enter is pressed with no result highlighted. |
| `o-select` | | `{ item, provider }` |
| `o-see-all` | | `{ provider, query }` |

## Persistence

- **Search history** (recent query strings, shown when the box is empty): `Orion.searchHistory` when
  it exposes `add(query, scope)`/`list(scope)` (optionally `remove`/`clear`), else `localStorage`
  under `orion:globalsearch:history:<scope>`. The real `Orion.searchHistory` (`userdata` package)
  returns `list(scope) -> [{ query, time }]`; this component normalizes that (and a plain `string[]`)
  to the query text either way.
- **Recent items** (the last results you selected), scoped per search box: `Orion.recent` when present,
  else `localStorage` under `orion:globalsearch:recent:<scope>`. The real `Orion.recent` (`userdata`
  package) is a single shared, unscoped list (`add(item)`/`list({type,limit})`, no scope parameter) —
  this component tags each item it adds with its own `scope` and filters on read so separate search
  boxes still keep separate recent lists even though the underlying store does not.
- **Favorites**: `Orion.favorites` (`add`/`remove`/`has`/`list`/`toggle`) or, with no such service
  loaded, `localStorage` under `orion:globalsearch:favorites:<scope>`. Unlike history/recent, favorites
  are **not** scoped when the real `Orion.favorites` service is present — a favorite is a per-user fact,
  not a per-search-box one (the real service has no scope concept at all), so every `<o-global-search>`
  on the page intentionally shares one favorites list. Only the localStorage fallback keeps favorites
  separate per `scope`. `<o-global-search>` only *reads* favorites today — pair it with a
  favorite-toggle button in your own result template if you want to write to that store.

## Keyboard

`/` (or your `shortcut`) focuses the box from anywhere. Inside: `↑`/`↓` move across **every**
category's results as one flat list (not just within a category), `Enter` opens the active result
(or activates the "see all" row), and with nothing active it records the query to search history and
fires `o-search` with `submitted: true`. `Esc` clears the query first, then closes the panel on a
second press.

## Notes & limits

- Providers are only queried once the query reaches `minChars`; each keystroke aborts the previous
  in-flight `search()` for that provider via `AbortSignal` and cancels its pending debounce timer.
- A category whose provider returns more than its `limit` gets a trailing "See all N results" row;
  clicking it calls `onSeeAll(query)` and/or navigates `seeAllHref`, and always fires `o-see-all`.
- The panel becomes a fixed, full-screen surface with its own back button below ~640px width — no
  extra markup required.
