# accordion

WAI-ARIA accordion pattern. `<o-accordion>` groups `<o-accordion-item>` panels in single-open (default) or
multi-open (`multiple`) mode, in a few visual variants. `<o-faq>` extends `<o-accordion>` with a search box,
category chips, match highlighting and optional `FAQPage` JSON-LD, either from declarative `<o-accordion-item>`
children or a `questions` data array. `collapse.js` is a separate, independent behavior implementing generic
`data-o-toggle="collapse"` markup (native `<details>`-like triggers, un-related to the custom elements) via
`Orion.collapseToggle()`.

## Elements

### `<o-accordion>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `multiple` | `multiple` | `Boolean` | `false` | Allow more than one item open at once. `false` = exclusive mode: opening an item closes any other open item. |
| `flushed` | `flush` | `Boolean` | `false` | Removes the outer border/rounding (edge-to-edge look). Property is named `flushed` (not `flush`) because `flush()` is a reserved `OElement` method name. |
| `variant` | `variant` | `String` | `'default'` (reflects) | `'default' \| 'separated' \| 'plain'`. Any other value falls back to `'default'`. |
| `iconPosition` | `icon-position` | `String` | `'end'` | `'start' \| 'end'` — side the item's icon/chevron area is on. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `items` | `OAccordionItem[]` | Direct `<o-accordion-item>` children only (items of a nested `<o-accordion>`/`<o-faq>` are excluded). |
| `openIds` | `string[]` | `id` (or panel id) of every currently expanded item. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `toggle(ref, force?)` | `Promise<boolean>` | `ref` is an item id or index. `force` omitted toggles; `true`/`false` forces. Resolves `false` if `ref` doesn't resolve. |
| `expandAll()` | `Promise<boolean[]>` | Multi-open mode only — opens every non-disabled item. In single-open mode resolves `[]` immediately (opening all would violate exclusivity). |
| `collapseAll()` | `Promise<boolean[]>` | Closes every non-disabled item (regardless of mode). |

#### Events

| Event | Detail | Notes |
|---|---|---|
| `o-change` | `{ id, expanded, open }` | Fired whenever a child item's expanded state actually changes. `open` is the current `openIds` array. |

### `<o-accordion-item>`

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `heading` | `heading` | `String` | — | Trigger button label. |
| `subtitle` | `subtitle` | `String` | — | Secondary line under the heading. |
| `icon` | `icon` | `String` | — | Leading icon name. |
| `category` | `category` | `String` | — | Free-form grouping value; used by `<o-faq>` for its category chips. |
| `open` | `open` | `Boolean` (reflects) | `false` | Initial/current expanded state. |
| `disabled` | `disabled` | `Boolean` (reflects) | `false` | Disables the trigger button and excludes the item from arrow-key navigation. **Not** enforced by the `show()`/`hide()`/`toggle()` API — only the built-in click handler checks it. |
| `headingLevel` | `heading-level` | `Number` | `3` | Sets `aria-level` (clamped 1–6) on the header's `role="heading"` wrapper. |

Content: a child matching `[data-o-panel]` or `.o-accordion-panel` is used verbatim as the panel region (never
moved/re-wrapped — framework-safe); otherwise all children are moved into a generated `.o-accordion-panel` div
once, in `setup()`.

#### Properties (read-only)

| Property | Type | Description |
|---|---|---|
| `expanded` | `boolean` | Current expanded state. |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `show()` | `Promise<boolean>` | Equivalent to `toggle(true)`. |
| `hide()` | `Promise<boolean>` | Equivalent to `toggle(false)`. |
| `toggle(force?)` | `Promise<boolean>` | Emits cancelable `o-show`/`o-hide`, animates via `collapse()` (ARCHITECTURE.md §4), then resolves with the final state and fires `o-shown`/`o-hidden`. Resolves with the unchanged state if vetoed. |

#### Events

| Event | Detail | Notes |
|---|---|---|
| `o-show` | `{ id, item }` | **Cancelable.** Fired before expanding. |
| `o-hide` | `{ id, item }` | **Cancelable.** Fired before collapsing. |
| `o-shown` | `{ id, item }` | Fired after the expand animation completes. |
| `o-hidden` | `{ id, item }` | Fired after the collapse animation completes. |

### `<o-faq>` (extends `<o-accordion>`)

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `multiple` | `multiple` | `Boolean` | **`true`** | Overrides the `<o-accordion>` default — FAQs default to allowing multiple open answers. |
| `flushed` | `flush` | `Boolean` | `false` | Inherited, unchanged. |
| `variant` | `variant` | `String` | **`'separated'`** | Overrides the `<o-accordion>` default. |
| `iconPosition` | `icon-position` | `String` | `'end'` | Inherited, unchanged. |
| `searchable` | `searchable` | `Boolean` | `false` | Shows/hides the search input. |
| `jsonLd` | `json-ld` | `Boolean` | `false` | Keeps a `<script type="application/ld+json">` `FAQPage` block in sync with the current headings/answers. |
| `placeholder` | `placeholder` | `String` | — | Search input placeholder; falls back to the localized "Search questions…". |
| `query` | `query` | `String` | — | Current search text. Assigning it updates the input and re-filters; typing in the box does not write this prop back. |
| `category` | `category` | `String` | — | Active category filter (`''`/unset = all). Two-way: `setCategory()` and clicking a chip both update this. |
| `questions` | `questions` | `Array` | — | Data-driven mode (see shape below) — generates `<o-accordion-item>` children, replacing any previously generated ones. |
| `texts` | — | `Object` | — | Per-instance text overrides. |

`questions` item shape: `{ id?, q | question | heading, a | answer, html?, category?, open? }` — `html` (sanitized
via `sanitize()`) takes priority over `a`/`answer` when present.

#### Methods

| Method | Returns | Description |
|---|---|---|
| `search(query)` | `void` | Sets the search box value and re-filters. |
| `setCategory(category)` | `void` | `''`/falsy shows all categories. |
| `expandAll()` | `Promise<boolean[]>` | **Override:** opens every currently *visible* (not search/category-filtered, not disabled) item — unlike the base class, this ignores `multiple`. |
| `collapseAll()` | `Promise<boolean[]>` | Inherited from `<o-accordion>` — closes every non-disabled item, including ones currently hidden by the filter. |

Category chips (`role=group` toolbar) are generated automatically from the distinct `category` values present and
only shown once there are 2 or more. Matches are underlined via the CSS Custom Highlight API where supported
(no DOM changes to the text).

#### Events

In addition to every `<o-accordion>` / `<o-accordion-item>` event above:

| Event | Detail | Notes |
|---|---|---|
| `o-search` | `{ query, category, count }` | Fired when the effective search text + category actually changes (not on first render). `count` is the number of matching, currently-visible items. |

## Plain-markup collapse (`collapse.js`)

Generic show/hide behavior for any element, independent of the accordion custom elements:

```html
<button data-o-toggle="collapse" data-o-target="#more">Details</button>
<div id="more" hidden>…</div>
```

* `data-o-target` (or `href="#id"`) selects the target(s) — may match several elements.
* `data-o-parent="#group"`, on the trigger or the target: showing this target auto-hides every other
  `data-o-toggle="collapse"` target inside `#group` that shares the same `data-o-parent` selector value
  (accordion-group behavior without a custom element).
* Triggers are auto-initialized (scan on `ready()` + `MutationObserver`): `aria-expanded`, `aria-controls`,
  `.is-collapsed`, and `role="button"` if the trigger isn't a `<button>`.

| Function | Signature | Description |
|---|---|---|
| `Orion.collapseToggle` | `collapseToggle(el \| selector, show?: boolean, { trigger? }?) -> Promise<boolean>` | `show` omitted toggles. Resolves with the resulting (or unchanged, if vetoed) shown state. Animated via `collapse()` (ARCHITECTURE.md §4). |

| Event (on the target) | Detail | Notes |
|---|---|---|
| `o-show` | `{ trigger }` | **Cancelable.** |
| `o-shown` | `{ trigger }` | Fired after the expand animation completes. |
| `o-hide` | `{ trigger }` | **Cancelable.** |
| `o-hidden` | `{ trigger }` | Fired after the collapse animation completes. |

Action: `data-o-toggle="collapse"` is registered as `action('collapse', ...)`, which resolves and toggles every
matching target on click.
