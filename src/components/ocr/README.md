# ocr — `<o-ocr>`, `Orion.ocr`

OCR is an **adapter contract**: this library ships no third-party OCR code. `Orion.ocr.use(engine)`
registers whatever recognizes text for you; `<o-ocr>` is a UI shell around it (image input, region
selection, progress, editable result) that works with any conforming engine, including the bundled
offline fixture engine used by the docs and by `tests/evals/ocr-*.js`.

## Files

| File | Contents |
|---|---|
| `00-service.js` | `Orion.ocr` registry, the built-in `fixture()` engine + sample data, and `shapeDetection()` (native `TextDetector`, no adapter needed) |
| `10-element.js` | `<o-ocr>` |
| `20-adapters.js` | Documented, developer-opt-in `Orion.ocr.tesseract()` adapter for Tesseract.js (nothing fetched unless you configure it) |
| `ocr.css` | tokens-only styles |

## The engine contract

```ts
interface OcrEngine {
  name: string;
  recognize(imageSource: HTMLImageElement | HTMLCanvasElement | Blob | string, opts: {
    lang?: string;
    region?: { x: number; y: number; width: number; height: number };   // fractional, 0..1 of the image's natural size
    onProgress?: (info: { status: string; progress: number }) => void;   // progress 0..1; called at least once
    signal?: AbortSignal;
  }) => Promise<{
    text: string; confidence: number;                                   // confidence 0..1
    words?: Array<{ text: string; bbox: { x: number; y: number; width: number; height: number }; confidence: number }>; // bbox in the image's native pixels
  }>;
}
```

## `Orion.ocr`

| Member | Description |
|---|---|
| `use(engine)` | Validates (`name` + `recognize` required — throws a descriptive `Error` otherwise) and makes it the active engine. |
| `register(engine)` | Same validation, but doesn't activate it. |
| `get(name)` / `list()` | Look up a registered engine / list registered names. |
| `active` / `setActive(name)` | Getter / setter for which registered engine `recognize()` uses by default. |
| `recognize(imageSource, opts)` | `opts.engine` picks a specific registered engine; otherwise uses `active`. Rejects with a clear error if nothing is registered yet. |
| `fixture(opts?)` | Factory → the built-in offline engine (see below). `opts: { fixtures?: [...], latency? }`. |
| `shapeDetection(opts?)` | Factory → wraps the browser's native `TextDetector` (Shape Detection API). Throws "not supported" on the (currently: most) browsers without it — a progressive enhancement, not a dependable default. |
| `tesseract(opts)` | Documented in `20-adapters.js` — see **Tesseract.js adapter** below. |

Nothing is active until you call `Orion.ocr.use(...)` — same bring-your-own-engine philosophy as
`Orion.ai` (see `ai/00-provider.js`).

## The fixture engine

```js
Orion.ocr.use(Orion.ocr.fixture());
```

Matches the image source against a small built-in table (`Orion.ocr.fixtures`) by, in order:

1. `imageSource.dataset.ocrFixture` / `getAttribute('data-ocr-fixture')` (an `<img data-ocr-fixture="invoice">`), or a plain string source equal to a fixture id, or `.ocrFixture` on a plain object source.
2. An exact match of `naturalWidth`/`naturalHeight` (or `width`/`height`) against a fixture's declared size.
3. Otherwise a deterministic "no match" result (`confidence: 0.5`, an explanatory `text`, no `words`) — never rejects.

Bundled fixtures (`docs/fixtures/ocr/*.svg` — plain SVGs so the whole thing works with zero binary
assets and zero network dependencies beyond the doc page itself):

| id | file | size | sample text |
|---|---|---|---|
| `invoice` | `invoice.svg` | 800×600 | an invoice with line items and a total |
| `receipt` | `receipt.svg` | 400×700 | a grocery receipt |
| `card` | `business-card.svg` | 350×200 | a business card |

Passing a `region` (fractional `{x,y,width,height}`) narrows both `text` and `words` to whatever
bundled words intersect that rectangle — a real, deterministic way to see "region selection changes
the result" without a real OCR engine. `onProgress` fires three times (`0`, `~0.4`, `~0.75`, all with
`status: 'recognizing'`) then once more with `{status:'done', progress:1}`, each separated by
`opts.latency` (default 120ms) so `signal` abort has a real window to land in.

## `<o-ocr>`

```html
<o-ocr languages='[{"value":"eng","label":"English"},{"value":"fra","label":"Français"}]'></o-ocr>
<script>
  Orion.ocr.use(Orion.ocr.fixture());               // required — nothing recognizes text until an engine is active
  document.querySelector('o-ocr').addEventListener('o-result', e => console.log(e.detail.text));
</script>
```

| Prop | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `engine` | — | `Object` (attr:false) | – | Per-instance engine override (skips `Orion.ocr`'s active engine). |
| `lang` | `lang` | `String` | `'eng'` | Passed to the engine as `opts.lang`. |
| `languages` | `languages` | `Array` | `[{value:'eng',label:'English'}]` | Populates the language `<select>`. |
| `src` | — | `Any` (attr:false) | – | Set an initial image (see `load()`). |
| `fixture` | `fixture` | `String` | – | Convenience: stamps `data-ocr-fixture` on the loaded preview image when set together with `src`. |
| `autoRecognize` | `auto-recognize` | `Boolean` | `false` | Calls `recognize()` automatically once an image finishes loading. |
| `camera` | `camera` | `Boolean` | `true` | Shows a "Camera" button **only** when `<o-camera>`/`Orion.camera.capture` are actually present in the build (feature-detected — this package never depends on `camera`). |
| `label` | `label` | `String` | – | `aria-label` for the element. |
| `texts` | — | `Object` | – | Per-instance string overrides (`ocr.*` keys). |

#### Methods

| Method | Description |
|---|---|
| `load(source, fixtureId?)` | `source`: `File`/`Blob`, a URL string, or an already-loaded `<img>` (its `currentSrc` is reused). Resets any previous result/region. |
| `recognize()` | Runs the active/instance engine against the loaded image (and current region, if any) → `Promise<Result \| null>` (`null` if no image/engine, or on error/abort). |
| `abort()` | Aborts an in-flight `recognize()` via its `AbortSignal`. |
| `clearRegion()` | Clears the selected region; auto re-recognizes if a result already exists. |
| `busy` / `result` / `region` | Read-only getters. |

#### Events

| Event | Detail | Cancelable |
|---|---|---|
| `o-before-recognize` | `{ region }` | Yes — veto starting recognition. |
| `o-progress` | `{ status, progress }` | No — mirrors the engine's `onProgress`. |
| `o-result` | `{ text, confidence, words? }` | No |
| `o-error` | `{ error }` | No |
| `o-region` | `{ region }` | No — fires on every region change, including clearing it (`region: null`). |
| `o-copy` / `o-download` | `{ text }` | No |
| `o-load` | `{ width, height }` | No — the preview image finished loading. |

## Region selection

Drag anywhere on the loaded preview to draw a rectangle; releasing commits it (drags under 8×8px are
treated as "clear"). The next `recognize()` call passes it as `opts.region`, and if a result is already
showing, changing the region **automatically re-runs recognition** so the result panel stays in sync.
Pointer-only by design (no keyboard drag) — a documented limitation, same trade-off `<o-cropper>` makes
for its own drag handles (that one adds keyboard nudging once focused; this one doesn't, to keep the
element small — clear the region with the "Clear region" button, which is a normal, keyboard-operable
`<button>`).

## Tesseract.js adapter (developer opt-in)

Orion never fetches Tesseract.js. To use it, host a build yourself (or point at a CDN URL you trust)
and register the adapter:

```js
Orion.ocr.use(Orion.ocr.tesseract({
  scriptUrl: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',  // YOU choose/host this
  workerOptions: { langPath: 'https://your-cdn/lang-data' },                        // where .traineddata files live
}));
await document.querySelector('o-ocr').recognize();   // now runs real OCR
```

`scriptUrl` is loaded via the core `loadScript()` helper (cached) the first time `recognize()` runs —
not on `Orion.ocr.tesseract()` itself, and not at all if you never call `recognize()`. Progress is
routed from Tesseract's own `logger` option into `onProgress`. Region cropping happens on an offscreen
canvas (`ocrCropToCanvas()`, shared with `Orion.ocr.shapeDetection()`) before handing pixels to the
worker. This mirrors how `captcha/20-adapters.js` lazy-loads reCAPTCHA/hCaptcha/Turnstile only once a
`sitekey` is configured — see that file for the same pattern applied to a different vendor.

## Keyboard / a11y

Language select, Browse/Camera/Clear region/Recognize/Cancel buttons, the result textarea and the
word-boxes switch are all native, keyboard-operable controls. The drop zone is `role="button"
tabindex="0"` and responds to Enter/Space. The confidence badge is colour **and** text (`"Confidence:
82%"`), never colour alone. Word-box overlays are `pointer-events: none` and purely visual.

## Limitations

* No built-in perspective correction / edge detection (that's `<o-doc-scanner>` in the `camera`
  package) — `<o-ocr>` assumes a reasonably flat, upright image.
* Region selection is pointer-only (see above).
* The camera snapshot button depends entirely on the `camera` package being present in your build
  (`Orion.camera.capture()` + `<o-camera>` both feature-detected) — it simply stays hidden otherwise.
* `Orion.ocr.shapeDetection()` is unsupported in effectively every current browser (`TextDetector` for
  text was removed from the Shape Detection API); it's shipped as a zero-cost progressive enhancement,
  not something to build a default flow around.
