# Scanner — `<o-scanner>`, `Orion.scanner`

Camera-based QR/barcode scanning: the native [`BarcodeDetector`](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
API where the browser supports it, and a from-scratch pure-JS decoder everywhere else (no third-party code) —
a QR decoder (ISO/IEC 18004: finder/alignment detection, perspective homography, Reed-Solomon) and a 1D decoder
(EAN-13/EAN-8/UPC-A/Code128/Code39/ITF/ITF-14/Codabar) built on the same spec tables as `qrcode`/`barcode`. Also
scans a still image (file, drag-drop or paste) with no camera at all, and — for tests and demos — a `source`
property that accepts a fixture instead of a real camera.

## Files

| File | Contents |
|---|---|
| `00-qr-decode.js` | The pure-JS QR decoder: grayscale → adaptive binarization → finder/alignment detection → perspective homography → grid sampling → format/version info (BCH) → unmask → Reed-Solomon → segment decode. |
| `10-1d-decode.js` | The pure-JS 1D decoder: scanline run-length extraction → pattern matching for each symbology, tried across 20 rows in both directions. |
| `20-scanner-core.js` | Shared image-source handling (`File`/`Blob`/`<img>`/`<video>`/`<canvas>`/`ImageData`/`ImageBitmap`), `BarcodeDetector` feature detection per format, `Orion.scanner.decodeImage()`/`.open()`. |
| `30-scanner-element.js` | `<o-scanner>`. |
| `scanner.css` | The scanner UI — **shared with `camera/`'s `<o-doc-scanner>`**, see below. |

## Public API

- `<o-scanner formats continuous beep vibrate torch camera-select region>` — live camera / file / fixture scanning; fires `o-scan`.
- `Orion.scanner.decodeImage(source, { formats })` → `Promise<[{ text, format, points }]>` — `source` is a `File`, `Blob`,
  `<img>`, `<video>`, `<canvas>`, `ImageData` or `ImageBitmap`.
- `Orion.scanner.open({ formats, title })` → `Promise<{text,format,points}|null>` — a one-line modal camera/upload picker.
- `Orion.scanner.formats` — the full list of supported format strings.

## `<o-scanner>` props

| Prop (attribute) | Type | Notes |
|---|---|---|
| `formats` | array (JSON or comma list) | Default: every format (`qr_code ean13 ean8 upca code128 code128a code128b code128c code39 itf itf14 codabar`). |
| `continuous` | boolean | Keep scanning after a match instead of stopping (single-shot is the default); reflected. |
| `beep` / `vibrate` | boolean | Feedback on a match (WebAudio beep / `navigator.vibrate`). |
| `torch` | boolean | Current flashlight state; reflected. The button stays hidden unless the active track reports the `torch` capability. |
| `cameraSelect` (`camera-select`) | boolean | Show a device `<select>` instead of a cycle button when 2+ cameras are available. |
| `region` | boolean | Show the corner-bracket scan-frame overlay (default on). |
| `source` | object, **property only** | A `MediaStream`-like value (anything with `getTracks()`) or a live `<video>`/`<canvas>`/`ImageBitmap` to pull frames from instead of calling `getUserMedia`. See below. |

## Events / methods

| Member | Description |
|---|---|
| `o-scan` `{ text, format, points }` | A code was decoded (camera, `source` or file). `points` is `[x,y]` corners in source-pixel space. |
| `o-start` `{}` | The camera/source started and the scan loop is running. |
| `o-error` `{ error }` | Permission denied, no camera, insecure context, a bad `source`, or a file with no recognizable code. |
| `start()` / `stop()` | Start (camera, or `source` when set) / stop scanning and release the camera. |
| `switchCamera()` | Next camera, or flips `facingMode` on a single-camera device. |
| `toggleTorch()` | Toggles the flashlight when supported. |
| `decodeFile(file)` | Decode a still `File`/`Blob`/image without the camera; fires `o-scan`/`o-error`. |

## States (`data-state`)

`idle` (not started, or stopped) → `starting` (permission requested) → `scanning` (analysing frames) → `result`
(brief green-outline flash on a match, then back to `scanning`, or to `idle` in single-shot mode after the flash).
Failure states: `unsupported` (no `getUserMedia`, or an insecure — non-HTTPS/localhost — context) and `denied`
(the user declined the permission prompt); a third generic `error` covers everything else (e.g. `NotFoundError` —
no camera hardware). The status bar text explains which one, and it is an `aria-live="polite"` region.

## The `source` property (test/fixture path)

The test browser this package was built against has **no camera and no network**. `<o-scanner>` supports three ways
to exercise it without either:

1. **Still images** — `decodeFile(file)` / `Orion.scanner.decodeImage(source, opts)` accept a `File`, `Blob`,
   `<img>`, `<canvas>`, `ImageData` or `ImageBitmap` directly; no camera involved. This is also what the toolbar's
   upload button and drag-drop onto the stage use.
2. **`source` = a `<canvas>`/`<video>`/`ImageBitmap`** — `start()` pulls frames from it on the same loop a live
   camera would use (continuous scanning, the result flash, etc. all behave the same); the scanner's own internal
   canvas mirrors it into the visible stage. Useful for a scripted, repeatable "camera feed" in a test or a demo —
   see `docs/components/scanner.html#source`.
3. **`source` = a `MediaStream`-like object** (anything with `getTracks()`) — assigned to the internal `<video>` as
   `srcObject`, exactly like a real `getUserMedia()` stream. `canvas.captureStream()` produces one of these from a
   `<canvas>` you redraw over time, so a full "fake camera" can be built with no native APIs at all.
4. **Mocking `navigator.mediaDevices.getUserMedia`** directly (no `source` needed) also works for asserting the
   `unsupported`/`denied` states — reject with a `DOMException` named `NotAllowedError` for `denied`, or delete
   `navigator.mediaDevices` for `unsupported`.

Fixture images (QR codes and barcodes produced by this project's own `qrcode`/`barcode` generators, so the round
trip is self-contained with no external assets) live in `docs/fixtures/codes/`. `tests/evals/codes-scanner.js` and
`codes-qr-roundtrip.js`/`codes-barcode.js` exercise all of the above.

## Keyboard

The toolbar (switch camera / device select / torch / upload) is a row of plain, independently-focusable native
`<button>`/`<select>` elements — `Tab` moves through them in DOM order, `Enter`/`Space` activates a button, and
arrow keys on the device `<select>` change the camera (native behaviour, triggers a restart).

## Limitations

- The pure-JS QR decoder fits a single global homography from the 3 finder patterns plus the nearest alignment
  pattern (not a piecewise/per-alignment-pattern grid like some production decoders). Very high versions (~30+) at
  low pixel density (well under ~5px/module) can occasionally fail where a more complex decoder would still
  succeed; prefer the native `BarcodeDetector` (used automatically when supported) or a higher-resolution capture.
- 1D decoding samples 20 evenly-spaced horizontal scanlines in both directions; a barcode tilted more than a few
  degrees from horizontal, or framed so close only a few bars are visible, may need reframing.
- `code128a`/`code128b`/`code128c` are **generator-only** distinctions — decoding reports the generic `code128`
  format regardless of which forced subset produced the symbol (a Code 128 symbol does not carry a "stay in this
  subset only" marker beyond its start code); requesting any of the four formats decodes the others' output too.
- `toggleTorch()`/zoom depend entirely on what the active camera's `MediaStreamTrack` reports; most laptop/desktop
  webcams support neither.

## Shared UI with `camera/`'s `<o-doc-scanner>` — ownership notes

`camera/` reuses this package's scanner "stage" chrome for `<o-doc-scanner>` (which also adds the class `o-scanner`
to its own host, alongside its own `.o-scanner-quad`/`.o-scanner-handle`/`.o-scanner-loupe`/`.o-scanner-edit-canvas`
etc.). **This package owns and keeps generic** (not QR/barcode-specific) three selectors so `camera/` never needs
its own copy:

- `.o-scanner-stage` — the aspect-ratio'd preview box (`--o-scanner-ar` custom property, default `4/3`; `max-height`;
  `isolation: isolate` so overlays from either package stack correctly).
- `.o-scanner-video` — full-bleed, `object-fit: cover`; applies equally to a `<video>` or `<canvas>` (`camera/` also
  reuses it for its own `<video>`/edit-`<canvas>`).
- `.o-scanner-overlay` — full-bleed, centers a single child (`display:grid;place-items:center`) for this package's
  scan-frame; also fine as a bare full-bleed layer for `camera/`'s absolutely-positioned SVG quad-overlay.

This package also owns the `scanner` i18n namespace (`scanner.close`, `.permission`, `.https`, `.noCamera`,
`.starting`, `.switchCamera`, `.torch`, `.upload`, `.dropHint`, `.scanning`, `.found`) — keep adding this package's
own strings under `scanner.*`.
