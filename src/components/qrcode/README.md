# QR Code — `<o-qrcode>`, `Orion.qr`

A from-scratch ISO/IEC 18004 QR encoder (no third-party code): versions 1–40, all four error-correction levels
(L/M/Q/H), numeric/alphanumeric/byte(UTF-8) modes with automatic minimal-size segment planning, penalty-based mask
selection, BCH(15,5) format info and BCH(18,6) version info, GF(256) Reed-Solomon error correction. Renders to
SVG (a standalone `<svg>` string), `<canvas>`, a PNG data URL or a `Blob`.

## Files

| File | Contents |
|---|---|
| `00-qr-encode.js` | The encoder: GF(256) arithmetic, Reed-Solomon, segment planning, bit writer, matrix construction (finder/alignment/timing patterns, data placement, masking), `qrEncode(text, opts)`. |
| `10-qr-render.js` | SVG/canvas/dataURL/blob rendering, module/finder shape styles, logo overlay, payload preset helpers, and the `O.qr` namespace. |
| `20-qr-element.js` | `<o-qrcode>`. |
| `qrcode.css` | Chrome around the code (box, label, error state) — tokens only; the code itself uses the author-supplied `color`/`background`. |

## Public API

- `<o-qrcode>` — renders a QR code from `value`; optional label, download button, logo overlay.
- `Orion.qr.encode(text, opts)` → `{ size, modules, version, ecc, mask }` — the raw module matrix, useful for custom rendering.
- `Orion.qr.svg(textOrEncoded, opts)` → `string` — a standalone `<svg>…</svg>`.
- `Orion.qr.canvas(textOrEncoded, opts)` → `HTMLCanvasElement` (sync; a logo image is drawn in once it loads).
- `Orion.qr.toDataURL(textOrEncoded, opts)` → `Promise<string>`, `Orion.qr.toBlob(...)` → `Promise<Blob>`.
- Payload presets — build the exact payload string for `value`: `Orion.qr.url(text)`, `Orion.qr.wifi({ssid,password,encryption,hidden})`,
  `Orion.qr.vcard({firstName,lastName,org,title,phone,email,url,address,note})`, `Orion.qr.email({to,subject,body})`,
  `Orion.qr.sms({to,body})`, `Orion.qr.geo({lat,lng}|{query})`.

`opts` for the render functions: `size` (px, default 256), `margin` (modules, default 4), `color`/`background`
(any CSS colour string — including `var(--token)`, since these become SVG/canvas fill colours, not sanitised user
text; `background: null | 'transparent'` removes the backing rect), `moduleStyle` (`square|dots|rounded`),
`finderStyle` (`square|dot|rounded`), `logo` (`{src,size,padding,round}`), `ecc`/`version`/`mode`/`mask` (forwarded
to `encode()`).

## `<o-qrcode>` props / events / methods

| Prop (attribute) | Type | Notes |
|---|---|---|
| `value` | string | Required to render; empty shows a placeholder box, not an error. |
| `size` | number | Rendered px (default 200). |
| `ecc` | `L\|M\|Q\|H` | Default `M`; reflected. |
| `color` / `background` | string | Default `#000000`/`#ffffff`. |
| `margin` | number | Quiet zone in modules (default 2). |
| `moduleStyle` (`module-style`) | `square\|dots\|rounded` | |
| `finderStyle` (`finder-style`) | `square\|dot\|rounded` | |
| `logo` | object, property only | `{ src, size, padding, round }`; the element forces `ecc="H"` internally when a logo is set and the current ECC wouldn't beat it. |
| `label` | string | Caption under the code; also the SVG's `aria-label` when set. |
| `download` | string | Shows a download button; the value is the suggested file name (empty string → `qrcode.png`). |

Events: `o-error` (`{ error }`) when `value` cannot be encoded (e.g. too long for version 40 at the requested ECC) —
an inline message replaces the code instead of throwing. Methods: `saveAsPNG()` (same as the download button, at 2×
`size`).

## Keyboard / a11y

The rendered `<svg>` gets `role="img"` and an `aria-label` (the `label` prop, or a generic fallback). The optional
download button is a normal, natively keyboard-operable `<button>`.

## Limitations

- Kanji mode (ISO/IEC 18004's compact CJK encoding) is not implemented; non-Latin text is encoded as UTF-8 byte
  mode, which is spec-legal but less space-efficient than Kanji mode for long Japanese text.
- Structured Append (splitting one payload across multiple linked QR symbols) is not supported.
- `color`/`background` are trusted CSS colour strings rendered as SVG attributes/canvas fill styles — they are not
  HTML-escaped beyond normal attribute escaping, so do not feed them untrusted user text.

## Scanning it back

`src/components/scanner/` owns a pure-JS QR decoder (`BarcodeDetector` first, this decoder as fallback) plus
`<o-scanner>`/`Orion.scanner.decodeImage()`; the two packages' eval tests round-trip every payload helper and ECC
level through it (generate here → decode there → text must match) — see `tests/evals/codes-qr-roundtrip.js`.
