# compare — `<o-compare-tray>`, `<o-compare-table>`, `Orion.compare`

Collect a handful of items and compare their attributes side by side: a sticky bottom tray for
picking items, and a table that lines their attributes up in columns. No third-party code.

## Files

| File | Contents |
|---|---|
| `00-service.js` | i18n, `Orion.compare` (persisted, cross-tab synced list) + `data-o-action="compare"` |
| `10-tray.js` | `<o-compare-tray>` |
| `20-table.js` | `<o-compare-table>` |
| `compare.css` | tokens-only styles (reuses core `.o-sticky-bar`, `.o-table`/`.o-table-wrap`, `.o-chip`, `.o-switch`) |

## `Orion.compare`

A single, page-wide list of items to compare, persisted to `localStorage` under
`orion:compare:items` and synced across tabs (`BroadcastChannel`, falling back to a `storage`
event ping — same technique as `userdata`'s favorites store).

| Member | Description |
|---|---|
| `add(item)` | `item` needs `.id` (typically also `.title`/`.image`/whatever attributes you want to compare). Returns `false` if invalid, already present, or the list is already at `max`. |
| `remove(id)` | → `Boolean` (found?). |
| `toggle(item)` | → `Boolean`, the new "in the list" state. |
| `has(id)` / `get(id)` | → `Boolean` / item or `null`. |
| `list()` | → item array (a copy). |
| `clear()` | Empties the list. |
| `max` / `setMax(n)` | Getter / setter (default `4`); shrinking `max` below the current count trims the oldest overflow from the end. |
| `subscribe(fn({ items, source }))` | Fires immediately with the current list, then on every change (`source`: `'local'` this tab, `'remote'` another tab). Returns `unsubscribe()`. |

Bus event: `compare:change` with the same `{ items, source }` detail.

### `data-o-action="compare"`

```html
<button type="button" data-o-action="compare" data-o-item='{"id":7,"title":"Aurora Chair","price":120,"rating":4.5}'>
  Add to compare
</button>
```

Toggles the item in `Orion.compare` on click. The button's `aria-pressed`/`.is-active` state (and every
other `data-o-action="compare"` button on the page referencing the same or a different item) is kept in
sync whenever the list changes anywhere (including another tab), plus once on `DOMContentLoaded` so
buttons rendered before the list loaded still start in the right state. A button rendered by your own
code **after** the last list change (e.g. an infinite-scroll grid appending cards with nothing else
changing the list at that moment) won't have its initial pressed state set until the next add/remove —
call `Orion.compare.subscribe(() => {})` yourself (or trigger any add/remove) to force a resync if that
matters for your page.

If the list is already at `max`, the click is a no-op and an announcement + (if the `toast` package is
present) a warning toast are shown instead of throwing.

## `<o-compare-tray>`

A sticky bottom bar (reuses the core `.o-sticky-bar` chrome) listing the current `Orion.compare`
selection as removable chips, with a count and a "Compare" button. Hides itself entirely when the list
is empty.

```html
<o-compare-tray max="4" target="#compare-table"></o-compare-tray>
<o-compare-table id="compare-table" live hidden></o-compare-table>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `max` | `max` | `Number` | `4` | Forwarded to `Orion.compare.setMax()` on connect/change. |
| `target` | `target` | `String` | – | CSS selector of the element to reveal when "Compare" is pressed. If it has an `items` property, it is set to `Orion.compare.list()`; if it has an `.open()` method, that is called; either way it is scrolled into view. |
| `texts` | — | `Object` | – | `compareTray.*` overrides (`count`, `compare`, `clearAll`, `regionLabel`). |

The "Compare" button is disabled below 2 items. Removing the last chip (or `Orion.compare.clear()`)
hides the tray again.

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-compare` | `{ items }` | Yes — `preventDefault()` stops the `target` reveal (e.g. to show your own modal instead). |

## `<o-compare-table>`

```html
<o-compare-table
  items='[{"id":1,"title":"Aurora Chair","image":"chair.jpg","price":120,"rating":4.5,"wireless":false},
          {"id":2,"title":"Nimbus Shelf","image":"shelf.jpg","price":210,"rating":4.6,"wireless":true}]'
  attributes='[{"key":"price","label":"Price","numeric":true,"best":"low","unit":"USD"},
               {"key":"rating","label":"Rating","numeric":true,"best":"high"},
               {"key":"wireless","label":"Wireless"}]'>
</o-compare-table>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `items` | `items` | `object[]` | `[]` | Needs `.id` per item; `live` overrides this from `Orion.compare`. |
| `attributes` | `attributes` | `AttrDef[]` | `[]` | See below. Empty → auto-inferred from the union of item keys (excluding `id`/`titleKey`/`imageKey`/`addedAt`). |
| `titleKey` / `imageKey` | `title-key` / `image-key` | `String` | `'title'` / `'image'` | Dot-paths for the column header. |
| `highlightDiff` | `highlight-diff` | `Boolean`, reflect | `false` | Tints rows whose values differ across items. Also a toolbar toggle. |
| `onlyDiff` | `only-diff` | `Boolean`, reflect | `false` | Hides rows where every item has the same value. Also a toolbar toggle. |
| `bestValue` | `best-value` | `Boolean` | `true` | Marks the best numeric value per row (see **AttrDef.best**). |
| `removable` | `removable` | `Boolean` | `true` | Shows a remove button in each item's column header. |
| `live` | `live` | `Boolean` | `false` | Mirrors `Orion.compare` into `items` automatically; removing a column calls `Orion.compare.remove()`. |
| `toolbar` | `toolbar` | `Boolean` | `true` | Hides the highlight/only-diff toggles. |
| `texts` | — | `Object` | – | `compareTable.*` overrides. |

```ts
interface AttrDef {
  key: string; label?: string;                       // default: humanized key
  format?: (value, item) => string;                   // full override of the cell's formatted text
  numeric?: boolean;                                   // default: auto-detected (every present value parses as a number)
  best?: 'high' | 'low';                               // which direction wins for the best-value mark (default 'high')
  unit?: string;                                       // appended to a plain formatted number, e.g. "120 USD"
}
```

Sticky first column (the attribute name), horizontal scroll for many items (`.o-table-wrap`), boolean
values render as a check icon or an em dash (never color alone). Equality for "differences" compares
raw values (`Orion.util`-style deep `equal()`), not the formatted text.

#### Methods

| Method | Description |
|---|---|
| `open()` | Sets `hidden = false` — used by `<o-compare-tray target="…">` to reveal a table that starts hidden. |

#### Events

| Event | Detail | Notes |
|---|---|---|
| `o-remove` | `{ id, item }` | A column's remove button was clicked (fires whether or not `live`). |

## Keyboard / a11y

Tray and table controls are native `<button>`/`<input type=checkbox>` elements — no custom key
handling needed. The tray is `role="region"` with a live-updated `aria-label`; each remove button
carries a descriptive `aria-label`. The best-value icon has its own accessible label (`compareTable.best`)
so the distinction isn't color-only; boolean "yes" cells carry `aria-hidden`-free `sr-only` text.

## Limitations

* `<o-compare-table>` fully re-renders its `<table>` on every relevant prop change rather than patching
  cells — fine for the small item counts (2–6) compare UIs realistically have; not meant for large grids.
* Best-value marking only applies to attributes that are numeric for every item that has a value; mixed
  numeric/non-numeric data for one attribute across items disables the mark for that row.
* `<o-compare-tray>` and `<o-compare-table live>` both assume a single, page-wide `Orion.compare` list —
  there is no multi-tray/multi-list support.
