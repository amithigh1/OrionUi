# Signature — `<o-signature>`

A form-associated signature pad: smooth pressure/velocity-aware ink on a resize-safe canvas, stroke-level
undo, a typed-signature fallback, and PNG/JPEG/SVG/points export.

```html
<o-signature name="agreement" required pen-color="#1e293b" background="#fff"></o-signature>
<o-signature typed></o-signature>
```

## Attributes / properties

| Name | Type | Default | Notes |
|---|---|---|---|
| `pen-color` | string | `#1e293b` | Ink color (also a toolbar color swatch). |
| `pen-width` | number | `2` | Constant width used when `velocity-filter` is off. |
| `min-width` / `max-width` | number | `0.6` / `2.6` | Stroke width range driven by pointer pressure or speed. |
| `velocity-filter` | boolean | `true` | Disable for a constant-width pen. |
| `background` | string | `''` (transparent) | CSS color painted into the exported bitmap. |
| `typed` | boolean | `false` | Adds a Draw/Type tab pair — the keyboard-accessible alternative. |
| `readonly` / `disabled` / `required` / `name` / `value` | — | — | Standard form semantics; `value` is a trimmed PNG data URL or `null`. |

## Methods

`clear()` · `undo()` · `toDataURL(type, quality)` · `toPNG()` · `toJPEG(quality)` · `toBlob(type, quality)` ·
`toFile(name, type, quality)` · `toSVG()` · `toPoints()` · `fromDataURL(url)` · `fromPoints(strokes)`

## Events

`o-begin`, `o-end`, `o-change { value }` (plus native `input`/`change` on the host for form libraries).

## Notes

* Canvas drawing is inherently pointer-driven; enable `typed` to give keyboard-only users a way to produce
  a signature value without a mouse, stylus or touchscreen.
* Points are stored as fractions of the pad size, so resizing the container never blurs or distorts ink.

## Testing (no real pointer hardware needed)

The canvas listens for standard `pointerdown`/`pointermove`/`pointerup` events, so a headless test can drive it
by dispatching real `PointerEvent`s at page coordinates over the canvas (`el.getBoundingClientRect()` + `new
PointerEvent('pointerdown', { clientX, clientY, pointerId: 1, bubbles: true })`, then a few `pointermove`s and a
`pointerup`) — no native input simulation is required. One gotcha: the pad reads `e.getCoalescedEvents()` on each
move (for smoother real-hardware sampling), and Chrome returns an **empty list** for synthetic/non-trusted
PointerEvents, which would silently drop every synthetic `pointermove`. A test dispatching synthetic pointer events
should patch `PointerEvent.prototype.getCoalescedEvents = function () { return [this]; }` first (see
`tests/evals/capture-signature.js`). `setPointerCapture`/`releasePointerCapture` are called
defensively (`try {}`) so they no-op harmlessly on a synthetic pointer id in a headless browser. `fromPoints()` /
`toPoints()` give a hardware-free round trip when only the exported data matters, and `required` + `checkValidity()`
can be asserted directly against a form without any drawing at all.
