# workspace

Browser/IDE-style document workspace: a single `<o-workspace>` renders a dynamic tab strip over "panes" that are
opened programmatically (there's no declarative per-tab markup). Panes are **keep-alive** — once open, a pane's
DOM is never re-created or moved while the tab exists (only shown/hidden via `inert`), so scroll position, form
input and embedded iframes survive switching tabs. Adds pinning, dirty-state, duplication, drag/keyboard reorder,
an overflow "all tabs" menu, a per-tab context menu, `max`-tab LRU eviction, and `localStorage` persistence with
a `resolver` to rebuild restored tabs. Declares `// @deps tabs` and reuses that package's shared kit
(`O.Tabs.kit` — see [tabs/README.md](../tabs/README.md#shared-kit-oriontabskit)) for its menus and drag-reorder.

## Elements

### `<o-workspace>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `persist` | `persist` | `String` | — | `localStorage` key suffix: state is stored at `orion:workspace:<persist>`. When set, `restore()` runs automatically once, shortly (`setTimeout(0)`) after connect. |
| `max` | `max` | `Number` | `0` | `0` = unlimited. Above `max` open tabs, the least-recently-used tab that is not active, pinned or dirty is closed (fires cancelable `o-close` with `reason: 'max'`). |
| `label` | `label` | `String` | — | `aria-label` for the tablist; falls back to the localized "Open documents". |
| `texts` | — | `Object` | — | Per-instance text overrides. |
| `resolver` | — | `Function` | — | `(tab: PublicTab) -> { content? \| html? \| render? \| url? } \| Node \| string`. Called once, the first time a **restored** tab is rendered, to reconstruct content that persistence couldn't store (plain `content`/`render`/`html` sources aren't persisted — only `id`, `title`, `icon`, `pinned`, `url`, `data`). |
| `confirm` | — | `Function` | — | `(tab: PublicTab) -> boolean \| Promise<boolean>`. Custom guard shown before closing a dirty tab. Falls back to `Orion.confirm` when available, else `window.confirm`. |

Children: an optional `<div slot="empty">` shown when nothing is open (replaces the built-in empty state).

Tab **open descriptor** (passed to `open()`):

```ts
open({
  id?: string,                      // reopening an existing id just activates it
  title?: string, icon?: string,
  content?: Node | string,
  html?: string,                    // trusted HTML
  render?: (tab: PublicTab, pane: HTMLElement) => Node | string | void,
  url?: string,                     // rendered as a lazy-loaded <iframe>
  pinned?: boolean, dirty?: boolean,
  closable?: boolean,               // default true
  data?: any,                       // opaque payload round-tripped through PublicTab
  focus?: boolean,                  // focus the tab once activated
}, { activate = true, silent = false }?) -> id: string
```

The **public tab shape** (`PublicTab`) returned by `getTabs()`/`getTab()` and passed in every event detail:
`{ id, title, icon, pinned, dirty, closable, url, data, index, active }`.

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `activeId` | `string \| null` | Id of the active tab. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `open(descriptor, opts?)` | `string` (id) | See descriptor shape above. Content is rendered lazily on first activation. |
| `activate(id, { focus = false }?)` | `boolean` | Makes `id` the active tab. `false` if not found. |
| `close(id, { force = false, reason = 'api' }?)` | `Promise<boolean>` | Dirty tabs prompt via `confirm`/`O.confirm`/`window.confirm` unless `force`. `false` if not found, declined, or `o-close` is vetoed. |
| `closeOthers(id)` | `Promise<void>` | Closes every non-pinned tab except `id` (`reason: 'others'`). |
| `closeRight(id)` | `Promise<void>` | Closes every non-pinned tab after `id` (`reason: 'right'`). |
| `closeAll({ pinned = false }?)` | `Promise<void>` | Closes every tab (`reason: 'all'`); pinned tabs are skipped unless `pinned: true`. |
| `pin(id, on = true)` | `boolean` | Moves the tab into/out of the pinned group (pinned tabs sort first). `false` if not found or already in that state. |
| `setDirty(id, on = true)` | `boolean` | Shorthand for `patch(id, { dirty: on })`. |
| `setTitle(id, title)` | `boolean` | Shorthand for `patch(id, { title })`. |
| `patch(id, { title?, icon?, dirty?, pinned?, data? })` | `boolean` | Updates one or more fields and repaints the tab. `false` if not found. |
| `duplicate(id)` | `string \| null` | Opens a copy with a new id (`"<id>~2"`, `"~3"`, …) and title `"<title> (copy)"`. If the original has no `url`/`render`/`html` source, clones its **currently rendered DOM** into the copy's `content`; otherwise re-runs the original source. |
| `move(id, index)` | `boolean` | Reorders the tab (clamped to stay within/outside the pinned group as appropriate). Fires `o-reorder` if the position changed. |
| `getTabs()` | `PublicTab[]` | In current display order. |
| `getTab(id)` | `PublicTab \| null` | |
| `getPane(id)` | `HTMLElement \| null` | The pane element hosting the tab's content. |
| `restore()` | `number` | Reopens tabs saved under `persist` (idempotent — a no-op returning `0` after the first call, or if `persist` isn't set). Restored tabs are opened with `activate: false, silent: true`. |
| `openMenu(id, point?)` | menu handle | Opens the per-tab actions menu (Close / Close others / Close to the right / Close all / Pin·Unpin / Duplicate). `point: {x, y}` opens it as a context menu at that position; omitted, it anchors on the tab. Returns whatever `Orion.Tabs.kit.menu()`/`.contextMenu()` returns. |

#### Events

All bubble, are composed, and (where noted) cancelable.

| Event | Detail | Notes |
|---|---|---|
| `o-open` | `{ tab }` | Fired after `open()` creates a new tab (not fired when reopening an existing id, nor for tabs restored via `restore()`). |
| `o-close` | `{ tab, reason }` | **Cancelable.** Fired before a tab is removed. `reason`: `'user' \| 'others' \| 'right' \| 'all' \| 'max' \| 'api'`. |
| `o-activate` | `{ tab, previous }` | Fired when the active tab changes (`previous` is the prior tab's id or `null`). |
| `o-render` | `{ tab, pane }` | Fired the first time a tab's content is rendered into its pane. |
| `o-change` | `{ tabs }` | Fired after any structural change (open, close, pin, patch, reorder) — `tabs` is the full `getTabs()` snapshot. |
| `o-reorder` | `{ id, from, to }` | Fired after `move()` or a drag actually changes a tab's position. |

## Notes

* Storage key: `orion:workspace:<persist>` — stores `{ active, tabs: [{ id, title, icon, pinned?, url?, data? }] }`. `content`/`html`/`render` sources are **not** persisted; use `resolver` to rebuild them after a reload.
* `// @deps tabs` — building with `--only=workspace` alone still pulls in `tabs` for `OTabs.kit` (menus and drag-reorder). See [tabs/README.md](../tabs/README.md).
