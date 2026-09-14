# Document viewer — `<o-docviewer>`, `Orion.preview()`, `Orion.docx`

A single component that previews whatever a user uploads — PDF, Word, CSV, JSON, Markdown, source code, plain
text, images, video and audio — with a small toolbar (filename, zoom where it makes sense, download, print,
open in a new tab, fullscreen). Zero third-party dependencies: DOCX is unzipped and parsed by this package,
using `DecompressionStream('deflate-raw')` (or the dedicated `Orion.zip` package when it happens to be loaded
in the same bundle) and the browser's own `DOMParser`.

```html
<o-docviewer src="report.pdf"></o-docviewer>
<o-docviewer src="brief.docx" filename="Project brief.docx"></o-docviewer>
```

## `<o-docviewer>`

| Attribute | Property | Type | Description |
|---|---|---|---|
| `src` | `src` | `string \| File \| Blob` | File to preview. A URL string, or a `File`/`Blob` set as a property (an object URL is created and revoked automatically). |
| `type` | `type` | `string` | Override auto-detection: `'pdf' \| 'docx' \| 'csv' \| 'json' \| 'markdown' \| 'text' \| 'code' \| 'image' \| 'video' \| 'audio'`. Detected from the filename extension, falling back to a Blob's `.type`. |
| `filename` | `filename` | `string` | Shown in the toolbar and used for type/icon detection; falls back to the URL's last path segment or `File.name`. |
| `label` | `label` | `string` | Accessible name for the toolbar. |
| `texts` | `texts` | `object` | Per-instance string overrides. |

**Methods:** `refresh()` (re-render; also automatic when `src`/`type`/`filename` change), `download()`,
`openInNewTab()`, `print()` (renders the content into a hidden iframe with the page's own stylesheets cloned
in, so only the document prints — not the surrounding page/toolbar), `zoomIn()` / `zoomOut()` / `resetZoom()`
(text-based formats only; images use `<o-zoom>`'s own controls when the gallery package is loaded),
`toggleFullscreen()`.
**Getter:** `kind` — the detected/overridden type.
**Events:** `o-load { type, filename }`, `o-error { error }`.

### Format coverage

| Type | Renderer | Zoom |
|---|---|:---:|
| PDF | The browser's own inline viewer, in an `<iframe>` (feature-detected via `navigator.pdfViewerEnabled`; a download/open-in-new-tab card is shown when unavailable). **Custom (pdf.js-style) rendering is explicitly out of scope.** | native |
| DOCX | Built-in converter (paragraphs, heading styles, bold/italic/underline/strike, colors, highlights, superscript/subscript, hyperlinks, nested bullet/numbered lists, tables with merged cells and shading, inline images) into a paper-like `.o-docviewer-page > .o-prose`. Not covered: headers/footers, footnotes, comments, text boxes, SmartArt, embedded objects, tracked changes. | ✓ |
| CSV | `.o-table` (striped, sticky header). | ✓ |
| JSON | Collapsible tree using native `<details>`/`<summary>` (no extra script for the interaction). | ✓ |
| Markdown | A small **safe** renderer — see below. | ✓ |
| Code | Plain text with line numbers (no syntax highlighting, to stay dependency-free). | ✓ |
| Text | `white-space: pre-wrap`. | ✓ |
| Image | `<o-zoom>` when the gallery package is loaded, else a plain centered `<img>`. | via `<o-zoom>` |
| Video / Audio | `<o-video>` / `<o-audio>` when the player package is loaded, else the native element. | — |

The Markdown renderer escapes the entire source first and only ever splices its own tags around already-escaped
text, so raw HTML in the source (including a stray `<script>`) is always shown as inert text, never executed.
It supports headings, emphasis (bold/italic/strikethrough), inline code, fenced code blocks, links and images
(relative paths resolve against the Markdown file's own URL, not the host page), blockquotes, horizontal
rules, bullet/numbered lists with `- [ ]`/`- [x]` checkboxes, and pipe tables — a useful subset, not full
CommonMark (no footnotes, definition lists or raw-HTML passthrough).

## `Orion.preview(fileOrUrl, opts) → handle`

```js
const handle = Orion.preview(file, { filename: file.name });
const reason = await handle.result; // resolves when the dialog closes
```

Opens `<o-docviewer>` in a fullscreen dialog — the helper an upload package calls after a file is picked, or a
table row's "Preview" action. Uses `Orion.modal` when the modal package is loaded in the same bundle;
otherwise falls back to a minimal dialog on the core overlay stack (Escape, focus trap, scroll lock, focus
return) so it works standalone.

| Option | Default | Description |
|---|---|---|
| `filename`, `type` | — | Forwarded to `<o-docviewer>`. |
| `title` | `filename` | Dialog title. |
| `size` | `'lg'` | Dialog width (only used with `Orion.modal`). |
| `fullscreen` | `'sm'` | Breakpoint below which the dialog goes edge-to-edge (only used with `Orion.modal`). |
| `trigger` | — | Origin element for the portal/focus return. |
| `closable` | `true` | Whether the dialog can be dismissed. |
| `onClose(reason)` | — | Called once, however the dialog closes. |

**Returns:** `{ el, close(reason?), result }` — `result` is a `Promise` resolving to the close reason (matches
the shape of `Orion.modal()`'s handle).

## `Orion.docx.toHTML(src) → Promise<SafeHTML>`

The DOCX → HTML converter used internally by `<o-docviewer>`; call it directly to embed a document's content
in your own page (e.g. inside a report). `src` is a URL, `File` or `Blob`. Throws if `word/document.xml` is
missing (not a Word package).

## CSS

`.o-docviewer*` (toolbar, body, per-format content classes: `-docx-*`, `-md-*`, `-json-*`, `-code-*`, `-csv`,
`-text`, `-page` for the paper look, `-frame` for the PDF iframe), `.o-docviewer-fb*` (the `Orion.preview`
fallback dialog). All tokens-only; the paper page and every renderer follow the surrounding theme, and RTL is
handled through logical properties.
