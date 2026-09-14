# Image tools — `<o-cropper>`, `Orion.image`, `Orion.cropImage()`

Canvas-based image editing with no dependencies: a full crop-box element, a library of promise-based image
transforms, and a one-line modal cropper for upload flows.

## `<o-cropper>`

```html
<o-cropper src="photo.jpg" aspect="4/3" round guides preview="#avatar-preview" toolbar></o-cropper>
```

`src` accepts a URL, or a `File`/`Blob` set as a property. The image always covers the crop area (zooming in
automatically when needed); dragging inside the box pans, dragging a handle resizes, wheel/pinch/toolbar zoom.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `src` | `src` | `File \| Blob \| string` | — | Image to edit. |
| `aspect` | `aspect` | `'free' \| number \| string` | `'free'` | Locked ratio; `"w/h"` or `"w:h"` strings accepted. |
| `min-width` / `min-height` | `minWidth` / `minHeight` | `number` | `0` | Minimum crop box size, in source-image pixels. |
| `output-type` | `outputType` | `string` | — | Default MIME for `toBlob()`/`toDataURL()` (else JPEG, or PNG when `round`). |
| `quality` | `quality` | `number` | `0.92` | Default encoder quality. |
| `round` | `round` | `boolean` | `false` | Elliptical crop area and output. |
| `guides` | `guides` | `boolean` | `true` | Rule-of-thirds grid while dragging/focused. |
| `toolbar` | `toolbar` | `boolean` | `true` | Built-in zoom/rotate/flip/reset bar. |
| `preview` | `preview` | `string \| Element \| Element[]` | — | Element(s) that receive a live `<canvas class="o-cropper-preview">` mirroring the crop. |
| `max-zoom` | `maxZoom` | `number` | `8` | Max zoom relative to fit. |
| `coverage` | `coverage` | `number` | `0.86` | Initial crop box size as a fraction of the fitted image. |
| `label` / `texts` | `label` / `texts` | `string` / `object` | — | Accessible name / per-instance strings. |

**Methods:** `load(src)`, `reset()`, `rotate(deg)` (90° multiples snap the free-angle slider), `rotateTo(deg)`,
`zoom(factor)`, `zoomTo(scale)` (screen px per image px), `flip('h' | 'v')`, `setAspect(a)`,
`getData()` → `{ x, y, width, height, rotate, scaleX, scaleY }` (source-image pixels), `setData(data)`,
`getCanvas({ width, height, maxWidth, maxHeight, fill, round })` (native resolution by default),
`toBlob(type?, quality?, opts?)`, `toDataURL(type?, quality?, opts?)`.
**Getter:** `ready`.
**Events:** `o-ready { width, height }`, `o-crop` (detail = `getData()`, fired on every change), `o-error { error }`.
**Keyboard** (crop area focused): arrows move (`Ctrl` = 10px steps), `Shift`+arrows resize, `+`/`-` zoom,
`R`/`Shift+R` rotate 90°, `0` resets.

## `Orion.image`

Canvas helpers; every function accepts a `File`, `Blob`, URL, `<img>` or `<canvas>` and returns a `Promise`.

| Function | Description |
|---|---|
| `load(src)` / `fromFile(file)` | → an upright `<img>` (EXIF orientation applied even where the browser doesn't do it for you). |
| `readExifOrientation(blobOrArrayBuffer)` | → `1`–`8`. |
| `exifAuto()` | → `Promise<boolean>`, whether the current browser already applies EXIF orientation itself (cached). |
| `toCanvas(src, { width, height, fit, maxWidth, maxHeight, background })` | `fit`: `'contain'` (default) \| `'cover'` \| `'fill'`. |
| `toBlob(canvas, type = 'image/png', quality)` | |
| `compress(src, { maxWidth, maxHeight, quality = .8, type = 'image/jpeg', maxSizeKB, minQuality = .4, background = '#fff' })` | Binary-searches quality, then downsizes 15% at a time, until the result is ≤ `maxSizeKB`. Result has `.report = { before, after, saved, width, height, quality, type }` (`saved` is a 0–1 fraction). Returns the original file unchanged if compressing wouldn't actually shrink it. `before`/`saved` are only known when `src` is a `Blob`/`File` — pass one (not a bare URL string) if you want to report the size reduction. |
| `resize(src, { width, height, fit, type, quality })` | |
| `rotate(src, deg, opts)` / `flip(src, 'h' \| 'v', opts)` | Any angle; the canvas grows to fit. |
| `crop(src, { x, y, width, height }, opts)` | Pixel-rect crop. |
| `filter(src, { brightness, contrast, saturation, grayscale, sepia, blur, hue, invert }, opts)` | Uses the native canvas `filter` when supported, a per-pixel fallback otherwise. |
| `filterCSS(filters)` | Same filter map → a CSS `filter` string (for live previews without a canvas round-trip). |
| `info(src)` | → `{ width, height, type, size, orientation }`. |

`opts` on the mutating helpers (`resize`/`rotate`/`flip`/`crop`/`filter`) accepts `type` and `quality` for the
output encoding; when `src` is a `File`, the result is also a `File` with a matching extension.

## `Orion.cropImage(fileOrUrl, opts) → Promise<Blob | null>`

```js
const blob = await Orion.cropImage(file, { aspect: 1, round: true, maxWidth: 512, type: 'image/webp' });
if (blob) await upload(blob);
```

Opens a modal around `<o-cropper>` and resolves the cropped `Blob` on **Apply**, or `null` if the dialog is
cancelled or dismissed. Uses `Orion.modal` when the modal package is loaded in the same bundle; otherwise falls
back to its own minimal dialog on the core overlay stack (Escape, focus trap, scroll lock, focus return).

| Option | Default | Description |
|---|---|---|
| `aspect`, `round`, `minWidth`, `minHeight`, `guides` | `'free'`, `false`, `0`, `0`, `true` | Forwarded to `<o-cropper>`. |
| `height` | `22` | Cropper viewport height, in `rem`. |
| `type`, `quality`, `width`, `height`, `maxWidth`, `maxHeight`, `fill` | — | Forwarded to `toBlob()`/`getCanvas()`. |
| `title` | "Crop image" | Dialog title. |
| `size` | `'md'` | Dialog size (passed to `Orion.modal`). |

## CSS

Classes: `.o-cropper`, `.o-cropper-stage/-box/-grid/-handle/-size/-status/-error/-toolbar/-group/-angle/-preview`,
state `.is-round`, `.has-guides`, `.is-loading`, `.is-ready`, `.is-error`, `.is-dragging`.
`Orion.cropImage`'s fallback dialog: `.o-cropimage-fb*`. All tokens-only (dark mode and RTL are automatic).
