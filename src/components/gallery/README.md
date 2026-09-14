# Gallery, Lightbox & Zoom — `<o-gallery>`, `Orion.lightbox()`, `data-o-preview`, `<o-zoom>`

Four related pieces, all in this package:

* **`<o-gallery>`** — responsive grid / masonry / justified tile layout that opens the lightbox on click.
* **`Orion.lightbox(items, options)`** — the full-screen viewer (pan/zoom/rotate, slideshow, thumbnails,
  swipe navigation, video items). Used internally by `<o-gallery>` and `data-o-preview`, and callable directly.
* **`data-o-preview`** — turns any `<img>` or link into a lightbox trigger, with grouping.
* **`<o-zoom>`** — a standalone pan-and-zoom box for a single piece of content (image, inline SVG, a div…).

## `<o-gallery>`

```html
<o-gallery layout="masonry" min-width="200" gap="8" label="Trip photos">
  <a href="full.jpg" data-caption="…"><img src="thumb.jpg" alt="…" width="1600" height="1067"></a>
</o-gallery>
```

Children are never moved; give tiles `width`/`height` attributes (or `data-width`/`data-height`) to avoid
layout shift in `masonry`/`justified`. Alternatively, set `items` and the component renders the tiles for you.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `layout` | `layout` | `'grid' \| 'masonry' \| 'justified'` | `'grid'` | Tile layout. |
| `columns` | `columns` | `number` | — | Fixed column count (`grid`/`masonry`). Empty = as many `min-width` columns as fit. |
| `min-width` | `minWidth` | `number` | `200` | Minimum tile width (px) for automatic columns. |
| `gap` | `gap` | `number \| string` | `8` | Space between tiles. |
| `aspect` | `aspect` | `string` | `'1'` | Tile aspect ratio in `grid` layout, e.g. `"4/3"`. |
| `row-height` | `rowHeight` | `number` | `220` | Target row height (`justified`). |
| `captions` | `captions` | `'hover' \| 'below' \| 'none'` | `'hover'` | Where `.o-gallery-cap`/`<figcaption>` is shown. |
| `lightbox` | `lightbox` | `boolean` | `true` | Open the lightbox on click. |
| `lightbox-options` | `lightboxOptions` | `object` | `{}` | Forwarded to `Orion.lightbox()`. |
| `items` | `items` | `array` | `[]` | `[{ src, thumb, title, caption, alt, width, height, type, poster, tracks, download }]` — rendered as tiles instead of reading children. |
| `label` | `label` | `string` | — | Accessible name. |

**Methods:** `open(i)` (open the lightbox at tile `i`), `relayout()` (recompute masonry/justified), `getItems()`
(items as the lightbox would see them, from `items` or from the current children).
**Events:** `o-open { index, item }` — cancelable; call `preventDefault()` to handle the click yourself.

## `Orion.lightbox(items, options) → handle`

```js
const lb = Orion.lightbox(photos, { index: 1, share: true, origin: triggerEl });
```

`items`: array of `{ src, thumb, title, caption, alt, type: 'image'|'video', width, height, poster, srcset,
tracks, download }`, plain URL strings, or `<img>`/`<a>` elements (read the same way `data-o-preview` does).

| Option | Default | Description |
|---|---|---|
| `index` | `0` | Item shown first. |
| `loop` | `true` | Wrap navigation at the ends (forced `false` for a single item). |
| `zoom` / `maxZoom` / `upscale` | `true` / `4` / `false` | Zoom via buttons, wheel, pinch, double-tap; `maxZoom` is relative to "fit" (at least real pixels × 2); `upscale` allows small images past 100%. |
| `thumbnails` | `items.length > 1` | Thumbnail strip. |
| `counter` | `true` | "n / N" indicator. |
| `download` | `true` | Download button (per item, disable with `item.download = false`). |
| `slideshow` / `interval` | `true` / `4000` | Play button and delay (ms). |
| `share` | `false` | Share button (Web Share API, else copies the link). |
| `fullscreen` | `true` | Fullscreen toggle button. |
| `rotate` | `true` | Rotate button + `R`/`Shift+R` keys (images only). |
| `swipeClose` | `true` | Swipe up/down to close. |
| `origin` | — | Element the viewer animates from/to and returns focus to. |
| `label` | — | Accessible name of the dialog. |
| `onChange(index, item)` / `onClose(reason)` | — | Callbacks. |

**Returns:** `{ el, index, item, zoom, next(), prev(), goTo(i), close(), zoomIn(), zoomOut(), reset(), rotate(deg),
play(), pause(), fullscreen() }`. The dialog element also dispatches `o-change { index, item }`, and
`o-lightbox-close { index, reason }` is dispatched on the `origin` element (or `document.body`).

**Keyboard:** `←`/`→` (mirrored in RTL) navigate or pan while zoomed, `Home`/`End` jump to the first/last item,
`+`/`-`/`0` zoom, `R`/`Shift+R` rotate, `F` fullscreen, `S` slideshow, `Esc` closes.
**Touch:** swipe left/right to navigate, swipe down/up to close, pinch to zoom, double-tap to zoom, tap to
toggle the chrome. The dialog always uses the dark theme tokens so photos keep their contrast.

## `data-o-preview`

```html
<img data-o-preview data-o-preview-src="full.jpg" data-caption="…" src="thumb.jpg" alt="…">
<a href="full.jpg" data-o-preview="colors" data-title="Coral"><img src="thumb.jpg" alt="Coral"></a>
```

| Attribute | Description |
|---|---|
| `data-o-preview="group"` | On an `<img>` or a link. Elements sharing a value are browsed together; an empty value previews a single image. |
| `data-o-preview-src` | Full-size source (links use `href`). |
| `data-title` / `data-caption` | Caption text (falls back to `alt`). |
| `data-width` / `data-height` / `data-type` / `data-poster` | Real dimensions, `"video"` items, and their poster. |
| `data-o-preview-options` | JSON options object forwarded to `Orion.lightbox()`. |

An `<img>` automatically gets `tabindex="0"`, `role="button"` and an `aria-label` if it doesn't have one, so it
opens with `Enter`/`Space` too.

## `<o-zoom>`

```html
<o-zoom min="1" max="8" minimap wheel="ctrl" style="--o-zoom-h: 26rem">
  <img src="plan.svg" alt="Floor plan">
</o-zoom>
<o-zoom src="plan.svg" alt="Floor plan"></o-zoom>
```

The first non-UI child (or the image built from `src`/`alt`) is the content; it is fitted into the box, then
zoomed with the toolbar, `Ctrl`/`⌘` + wheel (`wheel="zoom"` for a plain wheel, `"none"` to disable), trackpad/
touch pinch, double-click/double-tap, and panned by dragging.

| Attribute | Property | Default | Description |
|---|---|---|---|
| `min` / `max` | `min` / `max` | `1` / `8` | Zoom range relative to "fit" (`1` = fit). |
| `step` | `step` | `1.5` | Factor for the +/− buttons and keys. |
| `controls` | `controls` | `true` | Built-in toolbar. |
| `minimap` | `minimap` | `false` | Overview thumbnail with a draggable viewport box. |
| `wheel` | `wheel` | `'ctrl'` | `'ctrl'` (Ctrl/⌘+wheel, pinch), `'zoom'` (plain wheel), or `'none'`. |
| `src` / `alt` | `src` / `alt` | — | Convenience: render an `<img>` as the content. |
| `fullscreen` | `fullscreen` | `true` | Fullscreen toggle button. |
| `label` / `texts` | — | — | Accessible name / string overrides. |

**Methods:** `zoomIn()`, `zoomOut()`, `zoomTo(level)` (`1` = fit), `reset()`, `panBy(dx, dy)`.
**Getters:** `zoom` (`1` = fit), `scale` (content px scale).
**Events:** `o-change { zoom, scale, x, y }` on every change.
**Keyboard** (focused): `+`/`-`/`0`, arrow keys pan while zoomed (`Shift` = faster).

## CSS

`.o-lightbox*` (dialog), `.o-gallery*` (tiles, captions, badge), `.o-preview-trigger`, `.o-zoom*` (box, toolbar,
minimap). Variables: `--o-gallery-gap/-min/-aspect/-row-h/-radius`, `--o-zoom-h`. See `gallery.css` for the
full class list; everything uses design tokens so dark mode and RTL come for free.
