# emailpreview — `<o-email-preview>`

`src/components/emailpreview/` (`00-helpers.js`, `05-sendtest.js`, `10-emailpreview.js`, `20-factory.js`
+ `emailpreview.css`). Registers `<o-email-preview>` (`O.EmailPreview`) and `Orion.emailPreview()`.

Renders an HTML email body inside a **sandboxed `<iframe srcdoc>`** — the sandbox never includes
`allow-scripts`, so nothing in the message can ever execute, no matter what it contains — with a
device-width toolbar, a dark-mode-simulation toggle, images on/off, zoom, a plain-text view, a
highlighted-source view and a one-line inbox-row view.

## Security model (read this first)

- The email body is rendered via `iframe.srcdoc`, never `iframe.src` with a `blob:`/`data:` URL (which
  can inherit the parent's origin in some browsers) and never `iframe.contentDocument.write(...)`.
- `sandbox="allow-popups"` is the **only** sandbox token ever set on the iframe. `allow-scripts` is never
  added, under any prop combination — this is enforced structurally (the attribute is a static string
  in `setup()`, never computed from props) and is covered by the automated `--eval` security check in
  `docs/components/email-preview.html`'s test run.
- Defense in depth, in order, before anything reaches `srcdoc`:
  1. `epStripScripts()` (`00-helpers.js`) — a manual regex pass that removes `<script>` blocks, every
     `on*="…"` handler attribute and `javascript:` URLs. This runs even though step 2 already removes
     all of it, so a script can never survive even if `sanitize()` were missing or reconfigured.
  2. `sanitize(html, { tags: ['style'], attrs: ['bgcolor'] })` — the core sanitizer (`src/core/00-env.js`).
     `<script>`, `<iframe>`, `<object>`, `<form>`, `<input>` etc. are dropped with their content; every
     `on*` attribute and unsafe `href`/`src` scheme is stripped; `<style>` is explicitly re-allowed
     (dropped by default) because email HTML relies on it and it is inert with no `allow-scripts`.
- Because the iframe has no `allow-scripts`, an inline `<style>` block, `<link>`-free CSS and even
  `javascript:` no-ops in the sanitized markup are harmless — there is no script engine to run them.
- `sanitize()`'s URL allowlist for `<img src>` only accepts raster `data:` URIs (`image/png|jpeg|gif|webp|
  avif|bmp`) — `data:image/svg+xml` is rejected everywhere, including here, as a defense against SVG-borne
  script payloads. An email embedding inline SVG images as data URIs will have that `src` stripped; use a
  hosted URL or a raster data URI instead. (The docs page's sample newsletter generates its placeholder
  images as PNG data URIs via `<canvas>.toDataURL('image/png')` for exactly this reason.)
- `Orion.highlight()` (source view) and the plain-text converter both render through `esc()`/`textContent`
  only — the raw, **unsanitized** `html` prop is shown in the "Source" view (so a developer can see
  exactly what they passed in), but it is always escaped character-by-character, never parsed as markup.

## `<o-email-preview>`

### Props / attributes

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `html` | `html` | `String` | `''` | The email body HTML. Sanitized before display (see above). |
| `subject` | `subject` | `String` | `''` | Shown in the meta line, inbox row and iframe `title`. |
| `from` | `from` | `String` | `''` | Display name and/or `"Name <email>"`. Drives the inbox-row avatar initial. |
| `to` | `to` | `String \| String[]` | `''` | Accepts a JSON array in the attribute (`to='["a@x.com","b@x.com"]'`) or a plain string. |
| `preheader` | `preheader` | `String` | `''` | The hidden preview text many clients show next to the subject; shown in the meta line and inbox row, hidden when empty. |
| `device` | `device` | `'desktop'\|'tablet'\|'mobile'` | `'desktop'` | Reflected. Controls the preview frame's width (`--o-ep-w-*`). |
| `dark` | `dark` | `Boolean` | `false` | Reflected. Simulates a mail client forcing dark mode onto the message. |
| `images` | `images` | `Boolean` | `true` | Reflected. `false` replaces every `<img>` with a labelled placeholder. |
| `zoom` | `zoom` | `75\|100\|125` | `100` | Reflected. Scale of the preview frame (`style.zoom`). |
| `view` | `view` | `'preview'\|'text'\|'source'\|'inbox'` | `'preview'` | Reflected. Which panel is visible. |
| `toolbar` | `toolbar` | `Boolean` | `true` | Reflected. `false` hides the whole toolbar (used to stack plain inbox rows — see the docs page). |
| `texts` | — (`attr:false`, property only) | `Object` | — | Per-instance text overrides, e.g. `{ sendTest: 'Send a copy' }` — see `this.t()` in ARCHITECTURE.md §5.11. |

### Methods

| Method | Returns | Description |
|---|---|---|
| `refresh()` | `void` | Re-renders every panel from the current props (rarely needed — props already do this reactively). |
| `getPlainText()` | `string` | The same HTML→text conversion shown in the "Text" view. |
| `getSanitizedHTML()` | `string` | The sanitized HTML actually rendered inside the preview iframe. |
| `sendTest(to?: string)` | `Promise<string \| null>` | Emits `o-send-test`. With no argument, asks for an address first (`Orion.prompt()` if loaded, else a small built-in popover) and resolves `null` if the user cancels. |

### Events

All events bubble, are composed, and are dispatched via `this.emit()` (see ARCHITECTURE.md §5.5), so the
DOM event name is `o-` + the name below.

| Event | Detail | Fired when |
|---|---|---|
| `o-send-test` | `{ to: string }` | `sendTest()` resolves with an address (button click or a scripted call). Wire this to your actual test-send API. |
| `o-view-change` | `{ view, previous }` | The visible panel changes (`view` prop set, by the toolbar or by script) — not fired for the initial render. |

### CSS custom properties

| Property | Default | Purpose |
|---|---|---|
| `--o-ep-w-desktop` | `640px` | Preview frame width for `device="desktop"`. |
| `--o-ep-w-tablet` | `480px` | Preview frame width for `device="tablet"`. |
| `--o-ep-w-mobile` | `375px` | Preview frame width for `device="mobile"`. |

All other colors/spacing come from the shared design tokens (ARCHITECTURE.md §8) and are not
independently overridable per-instance beyond the normal CSS cascade.

## `Orion.emailPreview(html, options?) -> Handle`

A programmatic modal factory (ARCHITECTURE.md §1), implemented directly on `overlays.open()` +
`portal()` (§6) rather than depending on `Orion.modal` — the modal/dialogs components are developed
separately and may not be present in a bundle that only builds `emailpreview`.

```ts
function emailPreview(html: string, options?: {
  title?: string,                                  // modal header text; default "Email preview"
  subject?: string, from?: string, to?: string | string[], preheader?: string,
  device?: 'desktop' | 'tablet' | 'mobile',         // default 'desktop'
  dark?: boolean,                                   // default false
  images?: boolean,                                 // default true
  view?: 'preview' | 'text' | 'source' | 'inbox',   // default 'preview'
  toolbar?: boolean,                                // default true
  texts?: Record<string, string>,
  trigger?: Element,                                // origin element for focus return / portal context
  onClose?: (reason: string) => void,
}): Handle;

type Handle = {
  el: HTMLElement,                 // the modal root (already in the DOM, in the shared #o-portal)
  viewer: HTMLElement,             // the <o-email-preview> instance inside it — read/write its props directly
  close(reason?: string): void,
  closed: Promise<string>,         // resolves with the close reason once the modal has fully closed
};
```

Opens a focus-trapped, scroll-locking modal (`overlays.open({ modal: true, trap: true, lockScroll: true })`)
containing an `<o-email-preview>`. **Escape** closes it (the overlay stack's default), as does a click on
the backdrop or the close button. Closing removes the modal from the DOM and resolves `closed`.

## Dark-mode simulation — how it works and its limits

When `dark` is enabled, `epBuildSrcdoc()` (`00-helpers.js`) checks whether the message already declares
dark-mode awareness — a `<meta name="color-scheme"|"supported-color-schemes" content="…dark…">` tag, or a
`@media (prefers-color-scheme: dark)` rule in an inline `<style>` — via `epDeclaresDark()`. If it does, no
override CSS is injected (the message's own rules are left alone). If it doesn't, a best-effort forced-dark
stylesheet is injected: backgrounds go dark, text/borders go light, background-image declarations are
stripped, links get a lighter blue, and images get a slight brightness/contrast pull — approximating how
Outlook.com or a Gmail app forces dark mode onto a message with no dark styles of its own.

**This cannot be pixel-accurate**, and that is a real, permanent limitation rather than a bug to fix later:

- Real mail clients use different, undocumented heuristics for what to recolor (some invert everything,
  some only touch text, some skip images, some skip anything with an explicit inline color). Ours is one
  reasonable approximation, not a reproduction of any specific client.
- A brand-colored CTA button or a colored banner **will** get muddled by the forced overrides here,
  exactly like it would in a real forced-dark inbox — that visual "damage" is the point of the simulation,
  not a defect.
- When the email already declares dark support, this component intentionally does **not** try to make the
  browser actually evaluate `prefers-color-scheme: dark` inside the iframe (that preference comes from the
  OS/browser, not from script, and cannot be forced per-iframe from the parent page). "Respecting" a
  dark-aware email currently just means *not* double-darkening it — its own `@media` rules will only take
  effect if the browser's real color scheme preference happens to be dark already.

## Images on/off

Handled entirely in the **parent**, before `srcdoc` is set: `epImagesOff()` parses the sanitized HTML into
a detached `<template>` (never inserted into the document, so the original `src` is never requested even
once), rewrites every `<img src>` to a generated `data:image/svg+xml` placeholder sized like the original
(clamped to a sane range) and labelled with the image's `alt` text (kept on the `<img>` itself, so the
accessible name is unchanged — an `<img>`'s `alt` already gives it the implicit `role="img"` accessible
name), and re-serializes the fragment back to a string.

## Text-only view

`epHtmlToText()` (`00-helpers.js`) is a small, dependency-free HTML→text pass: block elements
(`p`, `div`, `table`, `tr`, `li`, headings, `blockquote`, …) each start a new line, `<br>` is a line break,
`<a href>` becomes `label (url)` (or just the label/URL when they're identical or there's no href), `<img
alt>` becomes `[alt text]`, `<style>`/`<script>` content is skipped entirely, and runs of blank lines are
collapsed. It is not a full readability/Markdown-style converter — just a plausible plain-text rendition,
per the brief.

## Highlighted source view

Uses `Orion.highlight(html, 'html', { lines: true })` — the sibling `codeeditor` component's own
highlighter (`src/components/codeeditor/00-highlight.js`) — at runtime only (never referenced at the top
level of this folder), feature-detected with `isFn(O.highlight)`. When the host bundle doesn't include
`codeeditor` (e.g. building `emailpreview` on its own), it falls back to an escaped plain-text `<pre>` via
`textContent` — still safe, just unstyled. The **raw, unsanitized** `html` prop is shown here (so a
developer can see exactly what was passed in); this is safe because both code paths only ever escape the
text or set it via `textContent`, never parse it as markup.

## Inbox-row view

Not a separate custom element — `view="inbox"` on the same `<o-email-preview>` swaps the toolbar's
secondary controls and meta block for a single Gmail/Outlook-style row (`.o-avatar` initial from `from`,
bold sender, subject + preheader on one truncating line via the `.o-truncate` utility). The docs page
stacks several instances with `toolbar="false"` to demonstrate a small inbox list; each instance still owns
its full state (you could flip one row's `view` back to `"preview"` independently of the others).

## Framework notes

Standard `OElement` behavior (ARCHITECTURE.md §10): React 19 sets properties directly; React 18/plain HTML
can pass `to` as a JSON string attribute. `o-send-test` / `o-view-change` are plain `CustomEvent`s — attach
with `addEventListener` (or a framework's native-event binding), not a JSX prop.
