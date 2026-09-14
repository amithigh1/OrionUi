# activity

`<o-activity-feed>` — an "actor did something to a target" timeline: day grouping, type filtering,
paged/infinite loading, and a compact mode for dashboard widgets.

## Files

| File | Contents |
|---|---|
| `10-activity-feed.js` | `<o-activity-feed>`. |
| `activity.css` | `.o-feed-icon` / `.o-feed-avatar` (new) plus this component's own layout. Everything else reuses **core** classes: `.o-feed` / `.o-feed-item` / `.o-feed-content` / `.o-feed-time` (`src/css/60-content.css`), `.o-divider` (day headers), `.o-empty` (empty state) and `.o-segmented` (filter chips) — see below. |

## `<o-activity-feed>`

```html
<o-activity-feed id="activity" compact></o-activity-feed>
<script>
  activity.items = [
    { id: 1, actor: { name: 'Ben Tan' }, verb: 'shipped order', target: { label: '#10236' }, type: 'status', icon: 'truck', color: 'info', createdAt: Date.now() - 6e5 },
    { id: 2, actor: { name: 'Aisha Rahman' }, verb: 'refunded', target: { label: '#10232' }, type: 'status', icon: 'rotate-ccw', color: 'danger', createdAt: Date.now() - 36e5 },
  ];
</script>
```

Each item renders as **actor avatar** (`<o-avatar name>`, or a plain initials span when the `basics`
package isn't in the build) · **"actor verb target"** (bold actor/target, plain verb) · a colored icon
bubble (`icon`/`color`, `color` sets the current-color context via `.o-c-{color}`) · relative time
(`Orion.format.relative(createdAt)` in a `<time datetime>`).

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `items` | — | `Array` | `[]` | `[{ id, actor: { name, avatar? }, verb, target?: { label }, type?, icon?, color?, createdAt }]`. `type` and `color` are free-form strings (`color` should be one of the semantic tokens: `primary\|secondary\|success\|danger\|warning\|info`). |
| `compact` | `compact` | `Boolean` | `false` | Denser rows (smaller icon/avatar, tighter padding, smaller text) for a sidebar/card widget — still renders every field. Reflected. |
| `groupByDay` | `group-by-day` | `Boolean` | `true` | Inserts a `.o-divider` ("Today" / "Yesterday" / date) whenever `createdAt`'s calendar day changes. |
| `filter` | `filter` | `String` | `''` | Only items whose `type` equals this are shown; `''` shows everything. |
| `filters` | — | `Array` | `[]` | Explicit chip list `[{ value, label }]`. Omitted → derived from the distinct `type` values present in `items` (label = capitalized value). |
| `showFilter` | `show-filter` | `Boolean` | `false` | Force the filter chip row even with one type; it also shows automatically once there is more than one type, or `filter` is set. |
| `source` | — | `(page, { pageSize }) => items[] \| { items, hasMore }` (`attr: false`, function/property only) | — | Used by `load()` / `auto-load`. |
| `pageSize` | `page-size` | `Number` | `20` | Passed to `source`; also the fallback for computing `hasMore` when `source` doesn't return one. |
| `autoLoad` | `auto-load` | `Boolean` | `false` | Observes a sentinel row and calls `load()` automatically as it scrolls near the bottom (needs `source`). |
| `empty` | `empty` | `String` | — | Custom empty-state text. |
| `label` | `label` | `String` | — | `aria-label` for the feed (default: localized "Activity feed"). |
| `texts` | — | `Object` | — | Per-instance string overrides (`empty`, `loadMore`, `loading`, `all`, `today`, `yesterday`). |

| Method | Description |
|---|---|
| `setItems(list)` | Replace `items` (shorthand for the property). |
| `load(page = next)` | `-> Promise<newItems[]>`. Calls `source(page, { pageSize })`, appends the result to `items`, updates `hasMore`. A `source` returning `{ items, hasMore }` is honored exactly; a bare array infers `hasMore` from `items.length >= pageSize`. Errors are caught, logged and turned into `o-error` (rejections never escape). |
| `refresh()` | `clear()` then `load(1)` — reload from the start. |
| `clear()` | Empties `items` and resets pagination (no `source` call). |

| Event | Detail | Notes |
|---|---|---|
| `o-select` | `{ item }` | A row was clicked, or activated with <kbd>Enter</kbd>/<kbd>Space</kbd> (not fired for clicks on a link/button inside the row). |
| `o-load` | `{ page, items, hasMore }` | After a successful `load()`. |
| `o-error` | `{ error }` | `source()` rejected or threw. |

### Infinite loading vs. a Load more button

With `source` set and `auto-load` **off** (default), a `.o-btn.o-feed-more` "Load more" button appears
whenever `hasMore` is true and disappears once a page comes back short (or `{hasMore:false}`). Add
`auto-load` to fetch automatically instead, once the trailing sentinel scrolls within 160px of view
(`IntersectionObserver`; environments without one load eagerly instead of silently doing nothing).

```js
let page = 0;
const all = /* 60 pre-generated items */;
activity.source = async (p, { pageSize }) => {
  await new Promise(r => setTimeout(r, 300));
  const start = (p - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), hasMore: start + pageSize < all.length };
};
activity.load(1);           // first page — or set auto-load and let it happen on scroll
```

### Reused core classes

`.o-feed` / `.o-feed-item` / `.o-feed-content` / `.o-feed-time` already exist in `src/css/60-content.css`
(this package does not redefine them — only adds the new `.o-feed-icon` / `.o-feed-avatar` slots and
scopes its own tweaks under `.o-activity-feed .o-feed-item` etc. so nothing collides). Day headers reuse
`.o-divider`, the empty state reuses `.o-empty`/`.o-empty-icon`/`.o-empty-text`, and filter chips reuse
`.o-segmented` — a static, JS-free feed can be hand-built from the same classes:

```html
<div class="o-feed">
  <div class="o-divider">Today</div>
  <div class="o-feed-item">
    <span class="o-feed-icon o-c-success"><o-icon name="check"></o-icon></span>
    <span class="o-feed-avatar"><o-avatar name="Ben Tan" size="xs"></o-avatar></span>
    <div class="o-feed-content"><b>Ben Tan</b> approved <b>PR #482</b></div>
    <time class="o-feed-time">2h ago</time>
  </div>
</div>
```

## Keyboard & a11y

`role="list"` / `role="listitem"`; rows are `tabindex="0"` and activate with <kbd>Enter</kbd> or
<kbd>Space</kbd> (mirroring click). Filter chips are plain buttons with `aria-pressed`. Status is never
color-only: every row carries the actor/verb/target text and an icon in addition to `color`.

## Limitations

* Not virtualized — for very large lists, page through `source`/`load()` rather than assigning thousands
  of `items` at once.
* `groupByDay` groups by the viewer's local calendar day (via `Orion.date`); it does not attempt
  timezone-aware "day" boundaries for a specific server timezone.
* `filter` is a single value (no multi-select); build your own chip row and call `setItems()` with a
  pre-filtered array if you need more complex filtering (search text, multiple types, date range).
