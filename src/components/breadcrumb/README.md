# Breadcrumb — `<o-breadcrumb>`

Data-driven breadcrumb trail. Reuses the static `.o-breadcrumb` CSS already in core; adds a `dot` separator
and an overflow "…" menu once the trail is longer than `max`, plus an `auto` mode that derives the trail from
the active sidebar link (or the URL path) and re-syncs on navigation.

```html
<o-breadcrumb items='[{"label":"Home","href":"/"},{"label":"Users","href":"/users"},{"label":"Aisha"}]'></o-breadcrumb>
<o-breadcrumb auto max="4" separator="chevron"></o-breadcrumb>
```

## Attributes

| Attribute | Type | Description |
|---|---|---|
| `items` | Array | `{ label, href, icon }[]`. The last item (or any without `href`) renders as plain text with `aria-current="page"`. |
| `separator` | `slash｜chevron｜dot` | Default `slash`. |
| `max` | Number | Collapse to this many visible crumbs (0 = no limit). Middle crumbs collapse into a "…" menu. |
| `auto` | Boolean | Derive the trail when `items` is empty: the active `.o-sidebar` link chain, else the URL path segments. |
| `texts` | Object | Per-instance string overrides (`home`, `more`). |

## Events

| Event | Detail | Description |
|---|---|---|
| `o-navigate` | `{ item, href, originalEvent }` | Cancelable — `preventDefault()` to let a router take over. |

## CSS

`.o-breadcrumb` / `.o-breadcrumb-item` / `.o-breadcrumb-chevron` (core) + `.o-breadcrumb-dot`,
`.o-breadcrumb-more`, `.o-breadcrumb-menu`, `.o-breadcrumb-menu-item` (this package).

## Keyboard

| Key | Action |
|---|---|
| Enter / Space / ↓ (on "…") | Open the overflow menu. |
| Escape | Close it and return focus to "…". |
| Tab / click outside | Close it. |
