# facets — `<o-facets>`, `<o-facet-chips>`

A faceted filter panel: facet groups of type `checkbox` / `radio` / `range` / `date-range` / `search`,
each with live counts. Works two ways:

* **Standalone** — give it `items` (an array) and `groups` (a config); it computes counts and selections
  itself and exposes `.filtered` / `.filter(items)`.
* **Bound to a table** — `for="#my-table"` where the target is an `<o-datatable>`; selections are driven
  through the table's own public `filters` property, `facetCounts(key)` and `o-filter` event instead of
  re-implementing any filtering logic (see `datatable/README.md`).

No third-party code. Depends on nothing outside core; the bound mode duck-types its target (`.filters` +
`.facetCounts()`) so it works with any element shaped like `<o-datatable>`.

## Files

| File | Contents |
|---|---|
| `00-facets.js` | i18n, shared group helpers (`facetsNormGroup`, `facetsTest`, `facetsIsEmpty`, …), `<o-facets>` |
| `10-facet-chips.js` | `<o-facet-chips>` (reuses the helpers from `00-facets.js` — same folder scope) |
| `facets.css` | tokens-only styles for both elements |

## `<o-facets>`

```html
<o-facets id="facets" items='[{"category":"audio","price":79,"rating":4.5}, …]'
  groups='[
    { "key": "category", "label": "Category", "type": "checkbox" },
    { "key": "price", "label": "Price", "type": "radio",
      "options": [{ "value": "0-99", "label": "Under $100", "max": 99 }, { "value": "100-249", "label": "$100 – $249", "min": 100, "max": 249 }] },
    { "key": "rating", "label": "Minimum rating", "type": "radio",
      "options": [{ "value": "4.5", "label": "4.5 and up", "min": 4.5 }] },
    { "key": "name", "label": "Search", "type": "search" }
  ]'></o-facets>
<script>
  const facets = document.getElementById('facets');
  facets.addEventListener('o-change', () => renderGrid(facets.filtered));
</script>
```

### Props / attributes

| Prop | Type | Default | Notes |
|---|---|---|---|
| `items` | `object[]` | `[]` | Standalone data. Ignored (but harmless) once `for` resolves to a table. |
| `groups` | `GroupDef[]` | `[]` | See **Group definition** below. Rebuilding the DOM skeleton only happens when this changes. |
| `value` | `Record<string, any>` | `{}` | Current selections, keyed by group `key`. Shape depends on the group type (see below). Settable programmatically. |
| `for` | `string` | – | CSS selector of an `<o-datatable>` (or any element with `.filters` + `.facetCounts()`) to drive instead of filtering locally. |
| `label` | `string` | `t('facets.title')` | Panel heading. |
| `collapsible` | `boolean` | `true` | `false` renders group headings as static text (always expanded, no toggle button). |
| `urlKey` | `string` | – | Optional: if the `urlstate` package is present, two-way binds `value` (as JSON) to `Orion.url` under this query-string key (`Orion.url.bind()`). Lightly tested — verify with your own filter shapes before relying on it in production. |
| `texts` | `object` | – | Per-instance string overrides (`title`, `clearAll`, `min`, `max`, `searchPlaceholder`, `remove`, `noOptions`). |

### Group definition

```ts
interface GroupDef {
  key: string;             // dot-path into an item (standalone), or a column key on the bound table
  label: string;
  type: 'checkbox' | 'radio' | 'range' | 'date-range' | 'search';
  collapsed?: boolean;      // starts collapsed (collapsible only)
  options?: Array<string | {
    value: string; label?: string;
    min?: number; max?: number;    // radio only: a numeric bucket test on `key` (e.g. a price range)
    test?: (item) => boolean;      // radio only: fully custom predicate, takes priority over min/max
  }>;                        // checkbox: omit to auto-derive distinct values from `items` (standalone only)
  step?: number;             // range: <input type=number step>
  searchKeys?: string[];     // search: dot-paths to match against (default: [key])
}
```

* **checkbox** — multi-select over distinct values of `key`. Standalone: auto-derives the option list from
  `items` (sorted) unless `options` is given; live counts respect every *other* active group (classic
  faceted-search cross-filtering) and options that would return zero results are hidden unless already
  selected. Bound: options and counts come straight from `table.facetCounts(key)`.
* **radio** — single-select. Give each option `min`/`max` for a numeric bucket (products.html's "Price" /
  "Minimum rating" filters), or an exact `value` match. Bound mode translates a bucket into the table's
  `{ min, max }` number-range filter shape automatically.
* **range** — two number inputs, value `{ min, max }`.
* **date-range** — two date inputs (ISO strings), value `{ from, to }`.
* **search** — one text input, value a plain string, substring-matched (case-insensitive) against
  `searchKeys` (or `key`).

**Bound mode limitation**: counts are only shown for `checkbox` groups (via `table.facetCounts()`), since
the table doesn't expose a public "count matching rows for an arbitrary predicate" API — `radio` /
`range` / `date-range` / `search` groups still filter correctly when bound, just without a count badge.
Pick a group's `key` to match a real, filterable column on the target table.

### Methods

| Method | Description |
|---|---|
| `filter(items?, excludeKey?)` | Standalone helper: returns `items` (default: `this.items`) matching every active selection, optionally skipping one group's own filter (used internally for live counts). |
| `filtered` | Getter; `this.filter(this.items)`. `null`-ish (not meaningful) when bound — read the table's own rows/`total` instead. |
| `remove(key, value?)` | Drop one checkbox value, or clear the whole group for other types. Used by `<o-facet-chips>`. |
| `clearGroup(key)` | Clear one group's selection. |
| `clear()` | Clear every selection. |
| `refresh()` | Re-render counts (e.g. after mutating `items` in place). |

### Events

| Event | Detail | Notes |
|---|---|---|
| `o-change` | `{ value, filtered }` | Fires on every selection change (checkbox/radio/clear, and debounced ~200ms for range/date-range/search typing). `filtered` is `null` in bound mode. |

## `<o-facet-chips for="#facets">`

Renders the active selections of an `<o-facets>` as `.o-chip` / `.o-chip-remove` pills plus a "Clear all"
button, and hides itself entirely when there is nothing active.

| Prop | Type | Notes |
|---|---|---|
| `for` | `string` | CSS selector of the `<o-facets>` to mirror. |
| `texts` | `object` | Reuses the `facets.*` i18n keys (`clearAll`, `remove`). |

No public methods/events beyond what it reads from its target; clicking a chip's remove button calls the
target's `remove(key, value)`, and "Clear all" calls `clear()`.

## Keyboard / a11y

Every control is a native `<input>`/`<button>` (checkbox, radio, number, date, search, disclosure
button), so keyboard operability (Tab, Space/Enter, arrow keys inside a native radio group) is native —
no custom key handling needed. Group disclosure buttons use `aria-expanded`/`aria-controls`; radio groups
get `role="radiogroup"` + `aria-label`. Chip remove buttons carry `aria-label="Remove {label}"`.

## Limitations

* `range` has no drag-slider UI (two number inputs) — deliberate, to stay dependency-free; wrap with
  `<o-range>` yourself if you want a slider and set `<o-facets>`'s `value` from its `o-change`.
* Auto-derived checkbox option lists (standalone, no explicit `options`) only work for scalar or
  `{value,label}`-shaped item fields, not arbitrary nested objects.
* `urlKey` round-trips `value` as one JSON blob (not one query param per group) — fine for bookmarking,
  less pretty than per-field query params.
