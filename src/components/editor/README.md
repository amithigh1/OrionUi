# `<o-editor>` — Rich Text Editor

A zero-dependency WYSIWYG rich text editor built entirely on native DOM/Range APIs (no
`document.execCommand`). Form-associated custom element; light DOM.

Files (concatenated in this order into one scope):

- `00-dom.js` — strings, icons, the editor's HTML schema, DOM/selection helpers (`markSel`/`restoreSel`,
  `textBlockOf`, `splitBlock`, `caretIn`, etc.)
- `10-markdown.js` — CommonMark/GFM-subset Markdown ⇄ HTML converter (`Orion.markdown`)
- `20-clean.js` — schema normalisation (`normalizeTree`), paste cleaning (`cleanPaste`), serialisation
  (`serializeHTML`/`serializeText`/`serializeJSON`, `prettyHTML`, `countText`)
- `30-commands.js` — pure DOM/Range command layer (`EDITOR_COMMANDS`), no UI
- `40-element.js` — the `OEditor` class: lifecycle, history (undo/redo), native input handling, markdown
  shortcuts, the slash command menu, mentions wiring, paste/drop, counts, public API
- `50-toolbar.js` — toolbar UI, popovers (link/image/table/color), the bubble/selection toolbar, source
  view, fullscreen, and `define('o-editor', OEditor)`
- `editor.css`

Depends at runtime (never at definition time) on `codeeditor` (`Orion.highlight`/`Orion.highlightElement`
for code-block syntax highlighting, and `<o-code-editor>` for the source-view panel when available) and
`mentions` (`Orion.mentions`, `Orion.mentions.emoji`, `Orion.editorKit`).

## Usage

```html
<o-editor placeholder="Start writing…" label="Post body"></o-editor>
<script>
  const ed = document.querySelector('o-editor');
  ed.mentions = { source: [{ id: 1, label: 'Ada Lovelace' }] };
  ed.uploadImage = (file) => fetch('/upload', { method: 'POST', body: file }).then(r => r.text());
  ed.addEventListener('o-change', e => console.log(e.detail.value)); // sanitised HTML
</script>
```

Declarative initial content: put HTML (or nothing) inside the tag — it is parsed once in `setup()`,
otherwise use the `value` attribute/property.

## Props / attributes

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | String | `''` | Sanitised editor HTML (see Output below). Setting it (attribute or property) reloads the document **only if it differs from the live content** — this means it never fights the user while they're typing, and is also why the property setter is the right way to seed initial content. |
| `placeholder` | `placeholder` | String | — | Shown via CSS (`::before`) when the document is a single empty paragraph. |
| `label` | `label` | String | — | `aria-label` for the editable region; falls back to a translated default. |
| `toolbar` | — (`attr:false`) | Array \| `false` | `null` | `null`/unset = the full default toolbar. `false` hides the toolbar entirely. An array of arrays customises groups, e.g. `[['bold','italic'],['link']]` — see **Toolbar button ids** below. |
| `maxLength` | `max-length` | Number | — | Maximum plain-text character count (`Orion` word/grapheme segmentation via `Intl.Segmenter`). Enforced two ways: `beforeinput` blocks the *next* keystroke once at the limit (no jank while typing), and every edit is also hard-truncated to the limit afterward (covers paste/programmatic inserts that arrive as one big chunk). |
| `mentions` | — (`attr:false`) | Array \| Object \| Function | — | Shorthand array of users (`{id,label,avatar}` or plain strings) → `@` trigger; an async function → `@` trigger with a remote source; or a full `Orion.mentions()` options object (e.g. `{ source, triggers: {...} }`) for multiple triggers (`#`, custom, etc.). A `:` emoji trigger is always added unless you provide your own `triggers[':']`. |
| `uploadImage` | — (`attr:false`) | `(file: File) => Promise<string> \| string` | — | Resolves to the `src` to insert for an uploaded/pasted/dropped image. Without it, images are inlined as `data:` URLs via `FileReader` (fine for demos, not for production — the value can get large). |
| `spellcheck` | `spellcheck` | Boolean | `true` | Native browser spellcheck on the editable region. |
| `name`, `disabled`, `required`, `readonly` | same | — | — | Standard `FormElement` props. `readonly`/`disabled` disable the toolbar and set `contenteditable="false"`. |
| `texts` | `texts` | Object | — | Per-instance string overrides, see i18n keys below (`this.t('editor.bold')` reads `texts.bold` or `texts['editor.bold']` first). |

### Toolbar button ids

`undo redo blockType bold italic underline strike code superscript subscript color highlight
bulletList orderedList checkList blockquote codeBlock align link image table hr emoji clear source
fullscreen` — pass an array of arrays (groups, separated visually) as `toolbar`, e.g.:

```js
ed.toolbar = [['bold', 'italic'], ['bulletList', 'orderedList'], ['link']];
```

The toolbar wraps into an overflow "…" menu (via `Orion.editorKit.menu`) when it doesn't fit; it uses a
single roving tabindex (`ListNav`, horizontal) for keyboard access, `role="toolbar"`, and `aria-pressed`
on toggle buttons.

## Output formats

- **HTML** (`value` / `getHTML()`): the editor's internal schema serialised and passed through
  `sanitize()` — safe to store/render elsewhere. Selection-restoration markers, editor-only classes and
  upload placeholders are stripped; code blocks are reduced to `<pre><code class="language-x">` (any
  live syntax-highlighting markup is discarded, not persisted).
- **Markdown** (`getMarkdown()` / `setMarkdown(md)`): a CommonMark/GFM-ish subset — headings, emphasis
  (`**bold**`, `_italic_`), `~~strike~~`, inline/fenced code, blockquotes, ordered/bullet/task lists
  (nested), tables, links, images, hard breaks (`  \n`), horizontal rules. `setMarkdown` sanitises and
  normalises the converted HTML before loading it (never trust `mdToHtml`'s raw output directly).
- **Plain text** (`getText()`): blocks joined by newlines, table cells by tabs.
- **JSON block model**: available at the engine level as `serializeJSON(root)` (not exposed as a public
  method on the element, but stable and reusable) — `{ type:'doc', version:1, blocks:[...] }` with
  `paragraph`/`heading`/`list`/`quote`/`code`/`image`/`divider`/`table` block types, each carrying both
  `text` and sanitised `html` for its inline content.

## Methods

| Method | Description |
|---|---|
| `exec(name, value?) -> boolean` | Runs a formatting command (see ids above, minus `blockType`/`align`/`source`/`fullscreen`/`emoji`/`undo`/`redo` which aren't `EDITOR_COMMANDS`; those are `toggleFullscreen`/`toggleSourceView`/`undo`/`redo` methods, or open a popover). `value` per command: `heading` → level 1-4; `align` → `left`\|`center`\|`right`\|`justify`; `color`/`highlight` → CSS color string or `''` to clear; `link` → `{ href, text?, newTab?, title? }` or a URL string; `image` → `{ src, alt?, width? }`; `table` → `{ rows, cols, header? }`; table ops (`rowAbove`, `rowBelow`, `colBefore`, `colAfter`, `deleteRow`, `deleteCol`, `toggleHeader`, `deleteTable`) take no value and require the caret to be inside a table. |
| `isActive(name) -> boolean` | Whether a mark (`bold`…`subscript`) or `link` is active at the current selection. |
| `insertHTML(html)` | Sanitises + normalises `html`, then inserts it at the caret (splitting the current block as needed). |
| `insertText(text)` | Plain text at the caret; multi-line text becomes multiple paragraphs, or a literal `\n` inside a code block. |
| `getMarkdown()` / `setMarkdown(md)` | See Output formats. Safe to call immediately after creating the element — queued until `setup()` completes if needed. |
| `getText()` / `getHTML()` / `getSelectionText()` | Plain text, HTML (= `.value`), current selection as text. |
| `getMentions()` | `[{ id, label, trigger }]` for mentions currently present in the document (requires `mentions` to be set). |
| `undo()` / `redo() -> boolean` | History navigation. Rapid typing/deleting is merged into a single step (700ms window); every other change (commands, shortcuts, paste) is its own step. `canUndo` / `canRedo` getters. |
| `toggleFullscreen(force?)` | Expands the editor to fill the viewport (`position:fixed`, page scroll locked). Fires `o-fullscreen` / `o-fullscreen-exit`. |
| `toggleSourceView(force?)` | Shows/hides a raw-HTML source editor in place of the WYSIWYG view (uses `<o-code-editor language="html">` when the codeeditor package is loaded, else a plain `<textarea>`). Applying re-sanitises the typed HTML before loading it back. |
| `clear()` | Empties the document. |
| `focus(opts?)` / `blur()` | Standard focus management; `focus()` places the caret at the end of the content if nothing is selected. |
| `range() -> Range \| null` | The current Selection range if it's inside the editor, else `null`. |

`setMarkdown`, `insertHTML`, `insertText`, `clear` and `focus` are safe to call immediately after
creating the element (even before it's connected/upgraded) — they're queued via an internal
`_whenReady()` helper and flushed at the end of `setup()`.

## Events

All bubble, are composed, and (except `o-input`/`o-focus`/`o-blur`) cancelable is not meaningful (they're
notifications, not "before" events).

| Event | `detail` | When |
|---|---|---|
| `o-input` | `{ value }` | Synchronously after every change. |
| `o-change` | `{ value }` | Debounced ~400ms after the user stops editing (also fires a native `change`). |
| `o-focus` / `o-blur` | — | The editable region gains/loses focus. |
| `o-image-upload` | `{ file, src?, alt?, error? }` | After an uploaded/pasted/dropped image's `uploadImage`/data-URL read resolves (`src` present) or fails (`error: true`). |
| `o-mention` | `{ item, trigger }` | A mention or emoji is inserted via the `@`/`:` popup (from `Orion.mentions`). |
| `o-fullscreen` / `o-fullscreen-exit` | — | Fullscreen mode toggled. |

Native `input`/`change` from the underlying editable `<div>` are stopped at the host per `FormElement`
convention — only the host's own `input`/`change` (fired by `setValue`) are observable from outside.

## Formatting features

Bold/italic/underline/strike/inline-code/sup/sub, paragraph, headings 1-4, bullet/ordered/check lists
(check lists toggle by clicking the checkbox area, and nest/un-nest with `Tab`/`Shift+Tab`), blockquote,
code blocks (syntax highlighted live via the codeeditor package's tokenizer when loaded; language is
stored as `data-lang` and re-highlighted after edits without losing the caret), text alignment, text
color & highlight (a small preset swatch palette + a native `<input type=color>`), links (insert/edit/
remove, URL validated and normalized — bare domains become `https://…`, emails become `mailto:`, phone-
looking strings become `tel:`, `javascript:`/`data:`/`vbscript:`/`file:` are rejected), images (toolbar
upload/URL popover, paste, drag & drop, resize via corner handles, alt text), tables (insert via a hover
grid picker; row/column insert/delete, header toggle, delete table via a contextual menu when the caret
is inside a table cell; `Tab`/`Shift+Tab` moves between cells, adding a row past the last cell),
horizontal rule, clear formatting, undo/redo, Markdown shortcuts, a `/` slash command menu, `@` mentions
and `:` emoji (via the `mentions` package), source/HTML view, fullscreen, word/character counts with an
optional hard `max-length`, and paste cleaning (Word/Google-Docs/web HTML → the editor's schema, always
routed through `sanitize()`).

### Markdown shortcuts

At the start of a block, typing one of `# `, `## `, `### `, `#### ` (heading 1-4), `- ` or `* ` (bullet
list), `1. ` (ordered list), `[] `/`[ ] `/`[x] ` (check list, checked for `[x]`), `> ` (blockquote), or
` ``` ` (code block) converts the block. Inline, finishing `**bold**`, `*italic*`/`_italic_`, `~~strike~~`
or `` `code` `` converts the just-typed span. All of this is IME-safe (suppressed while composing).

### Slash command menu

Typing `/` at the start of a line (optionally followed by a query, e.g. `/tab` → Table) opens a menu of:
Text, Heading 1-4, Bulleted/Numbered/Check list, Quote, Code block, Table, Image, Divider, Emoji.
Arrow keys / `Enter` / `Tab` / `Escape`; the caret stays in the document (virtual/aria-activedescendant
navigation) so you can keep typing to filter.

## Accessibility

`role="textbox" aria-multiline="true"` on the editable region; the toolbar is `role="toolbar"` with a
single roving tabindex and `aria-pressed` on toggles; popovers/menus use `Orion.editorKit`'s
`role="dialog"`/`role="menu"` conventions with focus return and Escape-to-close; the slash menu and
mentions use `aria-activedescendant` so typing keeps working while a suggestion list is open; check-list
toggles and image up-/downloads are announced via `announce()`.

## Security

All external HTML (declarative markup, `value`, paste, `insertHTML`, `setMarkdown`, source-view apply)
goes through `sanitize()` before it reaches the live DOM — scripts, event handlers and unsafe URL schemes
are stripped. `<script>`/`onerror=`/etc. payloads are neutralised; verified via automated paste-injection
tests.

## Known limitations

- No collaborative/real-time editing (single-user, single-document).
- Table column widths aren't individually resizable (only image width, via corner handles).
- `<o-colorpicker>` isn't built yet elsewhere in the library; the color/highlight popover uses its own
  preset-swatches + native color input fallback (easy to upgrade later — feature-detect
  `customElements.get('o-colorpicker')` in `_openColorPopover`).
- The default `uploadImage` fallback inlines images as `data:` URLs, which bloats `value` — always pass a
  real `uploadImage` hook in production.
- History (undo/redo) is per-instance and in-memory only (not persisted across reloads).
