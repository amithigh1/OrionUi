# Camera & Document Scanner — `<o-camera>`, `<o-doc-scanner>`

`<o-camera>` is a live webcam capture element with three modes:

```html
<o-camera facing="user" mode="photo" countdown="3" grid></o-camera>
<o-camera mode="face"></o-camera>          <!-- oval guide, auto-capture -->
<o-camera mode="document"></o-camera>      <!-- delegates to <o-doc-scanner> -->
```

```js
const file = await Orion.camera.capture({ mode: 'photo', countdown: 3 }); // modal helper -> File | null
const cams = await Orion.camera.devices();                                // [{ deviceId, label }]
```

## `<o-camera>` attributes

`facing` (user/environment) · `resolution` (e.g. `1280x720`, `hd`, `fhd`, `4k`) · `mirror` (boolean, front camera only) ·
`aspect` (e.g. `4/3`) · `format` / `quality` (capture image type) · `countdown` (seconds) · `grid` (rule of thirds) ·
`torch-toggle` / `zoom-control` (show hardware controls when supported) · `mode` (photo/face/document) · `device-id` ·
`auto-start` · `review` (retake/use screen, default on) · `source` (property only, see below).

**Methods** `start()` `stop()` `capture(opts)` `switchCamera()` `retake()` `confirmCapture()`
**Events** `o-ready { stream }` `o-capture { file, blob, dataURL }` `o-error { reason, message }` `o-state { state }`
`o-scan` (document mode, bubbles up from the internal `<o-doc-scanner>`)

States (permission/hardware) are shown as a clear panel with an icon, message and retry button: `denied`, `nodevice`,
`insecure` (non-HTTPS), `unsupported`, `hardware` (in use elsewhere).

## `<o-doc-scanner>`

Capture or upload a page, automatic edge detection (grayscale → box blur → Sobel → convex hull → largest
quadrilateral, falling back to the full frame), draggable corner handles with a magnifier loupe, perspective
correction (a real 3×3 homography solved from the 4 corners + bilinear sampling), filters, rotate, a reorderable
multi-page session and PDF/image export.

**Methods** `start()` `stop()` `capture()` `loadImage(source)` `autoDetect()` `applyCorners()` `setFilter(i, name)`
`rotate(i, deg)` `removePage(i)` `reorderPage(from, to)` `clear()` `exportPDF()` `exportImages()`
**Properties** `pages` (read-only), `corners` (the 4 points being edited)
**Events** `o-ready` `o-error` `o-scan { page, pages, index }`

`exportPDF()` uses `O.PDF` when the `pdf` component is present in the build; otherwise it downloads each page as a
JPEG and shows a status message.

## The `source` property (test/fixture path)

Both `<o-camera>` and `<o-doc-scanner>` accept a `source` property (not an attribute — set it in JS), mirroring
`<o-scanner source>` (see `src/components/scanner/README.md`) so the whole capture flow can be exercised with no
real camera:

* **A `MediaStream`-like value** (anything with `getTracks()`) — assigned straight to the internal `<video>` as
  `srcObject`, exactly like a real `getUserMedia()` stream. `canvas.captureStream()` produces one of these.
* **A `<video>`/`<canvas>`/`ImageBitmap`/`ImageData`/`File`/`Blob`/image URL** — resolved to a drawable and
  redrawn onto an internal canvas, which is itself turned into a stream via `canvas.captureStream()` (a `<video>`
  source is copied frame-by-frame on a `requestAnimationFrame` loop so a *live* fixture keeps updating; anything
  else is drawn once). Either way `start()` never calls `getUserMedia`, so `mirror`, `grid`, `countdown`,
  `capture()`/`review`, face-mode auto-capture and `<o-doc-scanner>`'s auto-detect/corner-adjust/perspective-crop
  all run against the fixture exactly as they would against a live camera.

```js
const cam = document.querySelector('o-camera');
cam.source = fixtureCanvas;      // or a File/Blob/image URL/<video>/ImageBitmap/ImageData
await cam.start();
const file = await cam.capture({ format: 'image/jpeg' });   // resolves once "Use photo" is confirmed (review: false skips that)
```

Setting `mode="document"` forwards `source` to the internal `<o-doc-scanner>` automatically. `<o-doc-scanner>` also
has the separate one-shot `loadImage(source)` method (accepts the same source types) that skips the "live" step
entirely and drops straight into corner-editing — the more direct path when there is no live-preview step to test.

Mocking `navigator.mediaDevices.getUserMedia` (reject with a `DOMException` named `NotAllowedError` for `denied`,
or delete `navigator.mediaDevices` for `unsupported`) still works for the permission/hardware states without
`source` — that path is unchanged.

## Notes / limitations

* Camera access requires a secure context (HTTPS or localhost) — a clear message is shown otherwise.
* Face-mode auto-capture uses the Shape Detection `FaceDetector` API where supported; elsewhere it falls back to a
  luminance + blur heuristic and cannot truly confirm "this is a face", only that the frame is bright and steady.
* Edge detection is a lightweight JS pipeline (no OpenCV/WASM), tuned for a document with reasonable contrast
  against its background; it always has a full-frame fallback so the workflow never gets stuck.
* `torchToggle`/`zoomControl` and device switching read the real `MediaStreamTrack` capabilities, so they stay
  hidden against a `source` fixture (a canvas-backed stream reports none of these).
