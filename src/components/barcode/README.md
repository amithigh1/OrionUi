# Barcode — `<o-barcode>`, `Orion.barcode`

Eleven 1D barcode symbologies implemented from their specifications (no third-party code): **Code 128** (ISO/IEC
15417, subsets A/B/C with automatic subset-switching, plus forced `code128a`/`code128b`/`code128c`), **Code 39**,
**EAN-13**, **EAN-8**, **UPC-A**, **Interleaved 2 of 5** (plus **ITF-14**) and **Codabar**. Renders to SVG, `<canvas>`,
a PNG data URL or a `Blob`, with guard bars and human-readable text for the EAN/UPC family.

## Files

| File | Contents |
|---|---|
| `00-barcode-encode.js` | The encoders: `barcodeEncode(value, format)` → `{ modules, format, text }` (a bar/space bit sequence, no quiet zone) for each symbology, including check-digit computation/verification for EAN-13, EAN-8, UPC-A and ITF-14. |
| `10-barcode-render.js` | SVG/canvas/dataURL/blob rendering (guard bars, human-readable digit grouping) and the `O.barcode` namespace. |
| `20-barcode-element.js` | `<o-barcode>`. |
| `barcode.css` | Chrome around the symbol (box, error state) — tokens only, except the box's own white backing (see Limitations). |

## Public API

- `<o-barcode>` — renders a barcode from `value`/`format`; optional download button.
- `Orion.barcode.encode(value, format)` → `{ modules, format, text }` — low-level; most callers want `.svg()`/`.canvas()`.
- `Orion.barcode.svg(value, opts)` → `string` (standalone `<svg>…</svg>`), `.canvas(value, opts)` → `HTMLCanvasElement`,
  `.toDataURL(value, opts)` → `string`, `.toBlob(value, opts)` → `Promise<Blob>`.

`opts`: `format` (default `code128`), `height` (px, default 80), `moduleWidth` (narrowest bar, px, default 2),
`margin` (px, default 10), `showText` (default `true`), `fontSize` (default 14), `color`/`background` (any CSS
colour, including `var(--token)`), `guardBars` (EAN/UPC only, default `true`), `mime` (default `image/png`).

### Formats and check digits

| `format` | Payload | Check digit |
|---|---|---|
| `code128` | Any ASCII 0–127; auto-switches to subset C for runs of 4+ digits | computed (mod 103), not user-supplied |
| `code128a` / `code128b` / `code128c` | Forced single subset (`code128c` needs an even number of digits) | computed |
| `code39` | `0-9 A-Z space - . $ / + %` (lower-cased input is upper-cased) | none |
| `ean13` | 12 digits, or 13 including the check digit | computed if 12 given; **verified** (throws with the expected digit) if 13 given |
| `ean8` | 7 or 8 digits | same as EAN-13 |
| `upca` | 11 or 12 digits | same |
| `itf` | any even count of digits | none |
| `itf14` | 13 or 14 digits | same as EAN-13 |
| `codabar` | digits + `- $ : / . +`, optionally wrapped in start/stop letters `A-D` | none |

A wrong supplied check digit throws `Orion.barcode.svg: invalid <FORMAT> check digit (expected N, got M)` instead of
silently drawing an invalid code — `<o-barcode>` catches this and shows an inline error (see below).

## `<o-barcode>` props / events / methods

| Prop (attribute) | Type | Notes |
|---|---|---|
| `value` | string | Required. |
| `format` | see table above | Default `code128`; reflected. |
| `height` | number | Bar height in px (default 80). |
| `moduleWidth` (`module-width`) | number | Narrowest-bar width in px (default 2). |
| `margin` | number | Quiet zone in px (default 10). |
| `showText` (`show-text`) | boolean | Default on. |
| `fontSize` (`font-size`) | number | Default 14. |
| `color` / `background` | string | Default `#000000`/`#ffffff`. |
| `guardBars` (`guard-bars`) | boolean | EAN/UPC only; default on. |
| `download` | string | Shows a download button; suggested file name. |

Events: `o-error` (`{ error }`) — invalid value for the format (wrong length, bad checksum, disallowed character);
an inline message replaces the code. Methods: `saveAsPNG()`.

## Keyboard / a11y

The rendered `<svg>` has `role="img"` and an `aria-label` combining the format and value, so a screen reader still
announces something useful with `show-text` off. The download button is a normal `<button>`.

## Limitations

- `.o-barcode-box`'s white backing (`barcode.css`) is intentionally hard-coded, not token-based: barcodes need a
  light, high-contrast quiet zone to stay scannable in both light and dark mode, matching the project's documented
  exceptions for other functionally-required fixed colours (print rules, the colour-picker hue ramp).
- Code 128's automatic planner switches to subset C for runs of 4+ digits and otherwise extends A/B as far as
  possible; it does not search for the globally shortest encoding some libraries compute — output is always a few
  bytes at most from optimal, never a scannability issue.
- Only ASCII 0–127 is supported in Code 128 A/B. GS1 Application Identifiers are not specially parsed — pass the
  raw digit/character string you want encoded (GS1-128's FNC1 separators are out of scope).

## Scanning it back

`src/components/scanner/` decodes every format above (native `BarcodeDetector` first, a pure-JS fallback decoder
otherwise) via `<o-scanner>`/`Orion.scanner.decodeImage()`. `tests/evals/codes-barcode.js` round-trips each
symbology (generate here → decode there → text and format must match) and asserts checksum rejection.
