# `<o-code-editor>` and `Orion.highlight`

Source: `00-highlight.js` (tokenizer + `Orion.highlight` + `data-o-highlight`), `05-validate.js`
(JSON validator), `10-codeeditor.js` (element core), `20-search.js` (search & replace panel,
`define('o-code-editor', ...)`).

A `<textarea>` (for native selection, IME, clipboard, undo-integration with the OS) is layered
under a synchronized, virtualized, highlighted `<pre>`. The component owns its own undo history,
auto-indent, bracket/quote autoclose, comment toggle, line move/duplicate, a search & replace
panel and pluggable validation (JSON built in).

```html
<o-code-editor language="json" line-numbers validate>{"a": 1}</o-code-editor>
```

Initial content can come from the `value` property/attribute, from a `<template>` child, from a
`<textarea>` child, or from the element's own text content (read once in `setup()`, then the
element replaces its children with its own DOM). Leading common indentation is stripped
(`dedentText`) so content can be indented to match surrounding HTML.

---

## Props / attributes

`OCodeEditor extends FormElement`, so it also has `name`, `value` (see below), `disabled`,
`required`, `readonly` from `FormElement.props` (all reflected boolean/string attributes).

| Property | Attribute | Type | Default | Notes |
|---|---|---|---|---|
| `value` | `value` | `String` | `''` | The document text. Setting it resets undo history and re-validates. Reading it always reflects the live `<textarea>` value (kept in sync on every edit). |
| `language` | `language` | `String` (reflected) | `'plaintext'` | Any key or alias accepted by `Orion.highlight.resolve()` (see **Languages** below). Unknown values fall back to `plaintext`. |
| `lineNumbers` | `line-numbers` | `Boolean` | `false` | Shows a gutter (non-wrap) or an inline number before each visual line (wrap mode). |
| `wrap` | `wrap` | `Boolean` (reflected) | `false` | Soft-wraps long lines instead of horizontal scrolling. Disables virtualization (see **Performance**). |
| `tabSize` | `tab-size` | `Number` | `2` | Spaces per indent level. Tab/indent/outdent/backspace and CSS `tab-size` all use it. |
| `minLines` | `min-lines` | `Number` | `3` | Minimum visible height, in lines. |
| `maxLines` | `max-lines` | `Number` | — (unset) | When set, the editor scrolls internally once content exceeds this many lines instead of growing forever. |
| `placeholder` | `placeholder` | `String` | — | Placeholder shown on the empty `<textarea>`. |
| `label` | `label` | `String` | — | Overrides the auto-generated `aria-label` (`"Code editor, {language}"`). |
| `validate` | `validate` | `Any` | — | `true`/omitted: for `language="json"` only, runs the built-in JSON validator. `false`/`"false"`: disables all validation (including the JSON built-in). A `Function`: `(value, language) => errors` (may be async / return a Promise). A `String`: a dotted path resolved against `window` via `getPath`, e.g. `validate="myApp.validateSql"`, called the same way. Errors: `{ line, column, message, severity? }[]` (`severity` defaults to `'error'`; anything else is treated as a warning). |
| `autoClose` | `auto-close` | `Boolean` | `true` | Auto-inserts the matching `)]}"'\`` and type-over/backspace-pairs them. |
| `statusbar` | `statusbar` | `Boolean` | `false` | Shows a bottom bar: cursor position, indent size, language name, problem count. |
| `texts` | `texts` | `Object` | — | Per-instance string overrides, see **i18n** below. |

`value`/`language`/etc. can be set as plain attributes (frameworks that set attributes, e.g. React
18, work) or as properties (frameworks that set properties, e.g. React 19/Vue/Angular, and plain
JS, work — properties always win and may be set before the element upgrades).

### Read-only / computed properties

| Property | Description |
|---|---|
| `canUndo` / `canRedo` | Whether `undo()` / `redo()` would currently do anything. |

---

## Public methods

### Editing
| Method | Description |
|---|---|
| `insertText(text)` | Inserts `text` at the current selection (replacing it), one undo step. |
| `getSelection()` | `{ start, end, text }` — current selection (character offsets into `value`). |
| `setSelection(start, end = start)` | Sets the selection and scrolls it into view. |
| `gotoLine(line, column = 1)` | 1-based line/column; focuses the editor and moves the caret there. |
| `indent()` / `outdent()` | Indent/outdent the current line or every selected line by one `tabSize` unit (outdent removes up to one unit of leading spaces or a leading tab). |
| `toggleComment()` | Toggles the language's line comment (`//`, `#`, `--`, …) on the selected lines, or wraps/unwraps a block comment (`/* */`, `<!-- -->`) for languages that only have one. No-op if the language has neither. |
| `duplicate()` | Duplicates the selection (or, with no selection, the current line) directly after it and moves the caret into the copy. |
| `moveLines(dir)` | `dir < 0` moves the selected lines up, `dir > 0` down (swaps with the neighboring line); no-op at a document edge. |
| `format()` | Pretty-prints with `JSON.stringify(..., null, tabSize)` when `language === 'json'` and the document parses; returns `true`/`false`. No-op (returns `false`) for every other language. |
| `undo()` / `redo()` | Step through the internal history (max 400 steps; same-kind rapid typing/deleting within 800ms is coalesced into one step). Return `true` if a step was taken. |
| `refresh()` | Re-measures geometry and re-renders (call after external layout changes, e.g. the container was resized by something `ResizeObserver` didn't catch, or fonts finished loading). |

### Search & replace
| Method | Description |
|---|---|
| `openSearch(replace = false)` | Opens the panel (pre-filled with the current selection when it's a single line under 200 chars), optionally with the replace row expanded, and focuses it. |
| `closeSearch()` | Hides the panel and restores focus/selection to the editor at the last active match. |
| `find(query, opts)` | Opens the panel, sets the query and options (`{ case, regex, word }`, all boolean, default `false`), jumps to the nearest match, and returns the match count. |
| `findNext()` / `findPrev()` | Move to the next/previous match (opens the panel first if it's closed). Also bound to F3 / Shift+F3 even while the panel is closed. |
| `replaceCurrent()` | Replaces the active match with the replace field's value (supports `$1`-style backreferences when "regex" is on) and advances to the next match. |
| `replaceAll(query?, replacement?, opts?)` | With no arguments, uses whatever is currently in the find/replace fields and options; with arguments, sets them first (like `find()`). Returns the number of replacements made and calls `announce()` with a localized count. |

### Validation
| Method | Description |
|---|---|
| `getErrors()` | Returns a copy of the last validation result: `{ line, column, offset, message, severity }[]` (1-based line/column, clamped to the document). |
| `validateNow()` | `async` — cancels the pending debounced validation and runs it immediately, returning the same array as `getErrors()`. |
| `getValidity()` | `FormElement` override: `{ flags: { customError: true }, message }` when there is at least one `severity: 'error'`, else `null`. Feeds `checkValidity()`/`reportValidity()`/native form validation. |

Inherited from `FormElement`: `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)`,
`focus()`/`blur()` (focus the inner `<textarea>`), `form`, `validity`, `validationMessage`.

---

## Events

All custom events are `o-`-prefixed, bubble, are composed, and (per architecture convention) are
cancelable where noted. `input`/`change` (native, undecorated) also fire on the host per
`FormElement.setValue`.

| Event | Detail | When |
|---|---|---|
| `o-input` | `{ value }` | On every edit (keystroke, paste, undo/redo, programmatic `_edit`). Also fires native `input`. |
| `o-change` | `{ value }` | Debounced ~400ms after the last edit, or immediately on blur/disconnect if a change is pending, whenever the value actually differs from the last emitted one. Also fires native `change`. |
| `o-validate` | `{ errors, valid }` | After each validation run (debounced ~300ms after edits, or immediately after `validateNow()`/an initial `value`/`language` change). |
| `o-save` | `{ value }` | Ctrl/Cmd+S (default browser save is prevented; wire this up to your own save action). |
| `o-search-open` | `{ replace }` | `openSearch()` was called (including via Ctrl+F/Ctrl+H). |

---

## Keyboard shortcuts

Shortcuts use Cmd on macOS, Ctrl elsewhere (`modKey()` checks `navigator.platform`/`userAgent`
for Mac).

| Key | Action |
|---|---|
| Tab / Shift+Tab | Indent / outdent the line or selection (Tab inside a multi-line selection always indents, regardless of caret column). |
| Enter | Auto-indents to match the previous line; adds one level after a line ending in `{[(` (or `:` for Python/YAML, or an opening HTML/XML tag); pressing Enter between an auto-paired bracket/quote or between `<tag>` and `</tag>` expands to a 3-line block with the caret indented in the middle. Python also dedents one level after `return`/`pass`/`break`/`continue`/`raise`. |
| Backspace | Deletes a whole auto-closed empty pair (`()`, `""`, …) in one step; deletes a full indent unit when the caret is inside leading whitespace. |
| Home | Smart home: first press moves to the first non-whitespace character of the line, second press (from there) moves to column 0. Shift+Home extends the selection the same way. |
| Typing `([{"'\`` etc. | Auto-closes the matching character (skipped for prose languages' `'`, inside words, or when disabled via `auto-close="false"`); typing the closing character while it's already the next character moves over it instead of inserting a duplicate. |
| Ctrl/Cmd+/ | `toggleComment()`. |
| Ctrl/Cmd+D | `duplicate()`. |
| Alt+ArrowUp / Alt+ArrowDown | `moveLines(-1)` / `moveLines(1)`. |
| Ctrl/Cmd+] / Ctrl/Cmd+[ | `indent()` / `outdent()`. |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y | `undo()` / `redo()` / `redo()`. Native `Ctrl+Z`/`Ctrl+Y` browser undo (`beforeinput` `historyUndo`/`historyRedo`) is intercepted and redirected to the same history. |
| Ctrl/Cmd+S | `o-save` event (default prevented). |
| Ctrl/Cmd+F | `openSearch(false)`. |
| Ctrl/Cmd+H | `openSearch(true)` (search + replace). |
| F3 / Shift+F3 | `findNext()` / `findPrev()`, even while the panel is closed. |
| Escape | Closes the search panel if open; otherwise arms "Escape then Tab" to let Tab move focus out of the editor instead of inserting indentation (announced to screen readers via a visually-hidden hint, `codeeditor.tabHint`). |
| Escape (in the search panel) | Closes the panel. |
| Enter / Shift+Enter (in the find field) | `findNext()` / `findPrev()`. |
| Enter (in the replace field) | `replaceCurrent()`; Ctrl/Cmd+Alt+Enter runs `replaceAll()`. |
| Ctrl/Cmd+F / Ctrl/Cmd+H (panel focused) | Refocus the find / replace field. |
| Alt+C / Alt+R / Alt+W (panel focused) | Toggle match case / regex / whole word. |

All of the above are suppressed while `readonly`/`disabled` except: Ctrl+F/H, Ctrl+Z/Y (undo/redo
of read-only content is a no-op anyway since no edits are recorded), Ctrl+S, Escape and F3.

---

## Validation details (`Orion.highlight.validateJSON`)

`05-validate.js` exports a hand-written recursive-descent JSON validator:

```js
Orion.highlight.validateJSON(text) // -> [{ line, column, offset, message, severity: 'error' }]
```

* Returns an **empty array** for valid JSON (or an empty document).
* Returns **at most one** error — parsing stops at the first problem — with a 1-based
  `line`/`column` and a character `offset`.
* Produces friendlier messages than `JSON.parse` for common mistakes: single quotes, unquoted
  keys, trailing commas, comments (`//`/`/* */`, which `JSON.parse` also rejects), control
  characters and bad `\uXXXX`/`\` escapes in strings, and trailing content after a valid value.
  Messages are looked up via `i18n` under `codeeditor.json.*` (see `05-validate.js` for keys),
  so they localize with the rest of the library.
* This is what `<o-code-editor language="json" validate>` (or simply `language="json"` with no
  `validate` attribute at all) uses by default.

---

## CSS custom properties

Set on the host (`.o-ce`) or globally; all have sensible defaults from the design tokens.

| Property | Default | Purpose |
|---|---|---|
| `--o-ce-fs` | `.8125rem` | Font size (editor + gutter + status bar use `--o-font-mono`). |
| `--o-ce-lh` | `1.25rem` | Line height; drives virtualization math, so keep it a fixed length (not `normal`). |
| `--o-ce-pad-y` | `.5rem` | Vertical padding of the text area / highlighted layer. |
| `--o-ce-pad-x` | `.75rem` | Horizontal padding. |
| `--o-ce-bg` | `var(--o-surface)` | Editor background (becomes `--o-surface-2` automatically when `readonly`). |
| `--o-ce-gutter-w` | `calc(var(--o-ce-digits) * 1ch + 1.5rem)` | Gutter width; `--o-ce-digits` is set automatically to the line-count's digit count (min 2). |
| `--o-ce-tab` | `2` | CSS `tab-size`; kept in sync with the `tabSize` prop automatically — don't set it directly. |

Token overrides for syntax colors (from `codeeditor.css`, shared with `Orion.highlight` output
and static `data-o-highlight` blocks — see below): `--o-code-kw`, `--o-code-str`, `--o-code-num`,
`--o-code-com`, `--o-code-fn`, `--o-code-tag`, `--o-code-attr`, `--o-code-type`, `--o-code-prop`,
`--o-code-meta`, `--o-code-punct`. Each falls back to a `color-mix()` of a chart token or a
semantic text token, so dark mode and RTL need no special handling.

### State classes on the host
`.is-focused`, `.is-invalid` (bad validation, tints `--o-focus`/border red), `.is-readonly`,
`.is-disabled`, `.is-wrap`, `.has-gutter`, `.is-composing` (IME active).

---

## `Orion.highlight` (tokenizer service)

A small line-based tokenizer: a state machine of named "modes", each a list of
`[regex, tokenType, action?, when?]` rules tried in order (sticky regex, longest-rules-first is
*not* guaranteed — first matching rule wins, so order rules from most to least specific).

```js
Orion.highlight(code, language)                    // -> HTML string, escaped, wrapped in <span class="o-tk-*">
Orion.highlight(code, 'js', { lines: true })        // -> each line wrapped in <span class="o-hl-line"> (for CSS line numbers)
Orion.highlight.tokenize(line, language, state)     // -> { tokens: [[type, text], ...], state }  (incremental / editor use)
Orion.highlight.render(tokens, decos?)              // -> HTML string; decos: [{ from, to, cls }] char-offset overlays (used for search matches, error underlines, bracket match)
Orion.highlight.languages()                         // -> array of canonical language keys
Orion.highlight.names                               // -> { javascript: 'JavaScript', ... } display names
Orion.highlight.resolve(lang)                       // -> canonical key (resolves aliases, 'language-xxx'/'lang-xxx' prefixes, falls back to 'plaintext')
Orion.highlight.grammar(lang)                       // -> the raw grammar object { modes, lineComment, blockComment }
Orion.highlight.compiled(lang)                      // -> compiled (cached) grammar used internally
Orion.highlight.register(name, grammar, aliases?)   // -> add/override a language
Orion.highlight.validateJSON(text)                  // -> see Validation details
Orion.highlight.element(el, lang?)                  // -> same as Orion.highlightElement
```

`Orion.highlightElement(el, lang?)` highlights a `<pre>` or `<code>` element's text **in place**
(replaces `textContent` with tokenized `innerHTML`, so call it once per element / text). If `el`
is a `<pre>` with a `<code>` child, the `<code>` element's text is what gets highlighted. The
language is `lang` if given, else read from (in order) the element's or its `<code>`/`<pre>`
counterpart's `data-o-highlight` / `data-lang` / `data-language` attribute, or a
`language-xxx`/`lang-xxx` class — defaulting to `plaintext`. Adds `.o-code-hl` to the `<pre>` (or
the element itself), sets `data-lang-name` to the display name, and — if `data-o-line-numbers` is
present on the element or its `<pre>` parent — renders `<span class="o-hl-line">`-wrapped lines
and adds `.o-hl-numbered` (CSS then draws the gutter with `counter()`, no extra markup needed).

### `data-o-highlight` behavior

```html
<pre data-o-highlight="js"><code>const x = 1;</code></pre>
<pre data-o-highlight="python" data-o-line-numbers><code>def f(): pass</code></pre>
```

Registered as `behavior('data-o-highlight', ...)`: automatically highlights every current and
future matching element (works with React/Vue/Angular-rendered markup too, via the shared
`MutationObserver`). The attribute's value is the language (empty value falls back to
`langFromEl` detection, i.e. `plaintext` if nothing else matches). Cleanup (attribute removed or
element disconnected) restores the original text and removes `.o-code-hl`/`.o-hl-numbered`.

### Supported languages (canonical keys)

`plaintext`, `javascript`, `typescript`, `json`, `html`, `xml`, `css`, `scss`, `sql`, `python`,
`php`, `java`, `csharp`, `go`, `rust`, `bash`, `yaml`, `markdown`.

Aliases (resolved by `Orion.highlight.resolve`): `js`/`mjs`/`cjs`/`jsx`/`node` → `javascript`,
`ts`/`tsx` → `typescript`, `htm`/`xhtml`/`vue` → `html`, `svg`/`rss` → `xml`, `py` → `python`,
`rb` → `plaintext` (no Ruby grammar yet), `sh`/`shell`/`zsh`/`console` → `bash`,
`yml` → `yaml`, `md` → `markdown`, `cs`/`c#` → `csharp`, `golang` → `go`, `rs` → `rust`,
`text`/`txt`/`plain`/`none` → `plaintext`, `jsonc`/`json5` → `json`,
`mysql`/`pgsql`/`postgres`/`sqlite`/`tsql` → `sql`, `less`/`sass` → `scss` (SCSS grammar is used
as an approximation; not a real Sass/Less grammar).

HTML embeds JS (`<script>`) and CSS (`<style>`) sub-grammars automatically. TypeScript is the
JavaScript grammar with extra keywords/types (no real type-checking, it's a lexer, not a parser).

### Token types → CSS classes

Each token renders as `<span class="o-tk-{type}">` (or no span for `null`-typed / whitespace
tokens). Types in use: `kw`, `str`, `code` (inline code / fenced code in markdown), `num`,
`const`, `com` (comment), `fn` (function call / definition), `heading`, `link`, `tag`, `var`,
`attr`, `sel` (CSS selector), `type`, `builtin`, `prop`, `key` (JSON/YAML object key), `regex`,
`meta`, `punct`, `op`, `bold`, `italic`, `del` (markdown strikethrough), `err` (JSON's "not
actually valid JSON" catch-all token — distinct from the *validator's* error decorations).
See `codeeditor.css` for the color mapping (all via CSS custom properties, see above).

---

## Accessibility

* The `<textarea>` gets `role`-appropriate semantics for free (it's a real `<textarea>`) plus
  `aria-multiline="true"`, `aria-label` (`label` prop or a localized "Code editor, {language}"),
  and `aria-describedby` pointing at a visually-hidden hint about the Tab-trap escape hatch
  (`codeeditor.tabHint`) — extended to also reference the problems panel's id when validation
  fails, and `aria-invalid="true"` is set in that case.
* The gutter and highlighted `<pre>` overlay are `aria-hidden="true"` (the `<textarea>` is the
  single source of truth for assistive tech).
* The problems panel is `role="status"` (polite announcement region) and its entries are
  `<button>`s that jump the caret to the error.
* `replaceAll()` calls `announce()` with a translated "Replaced N occurrence(s)" message.
* Search match counts (`aria-live="polite"`) are announced as they change.

## i18n

All strings are under the `codeeditor.*` namespace (see the `i18n.add('en', ...)` calls at the
top of `10-codeeditor.js` and `05-validate.js` for the full key list and interpolation params).
Per-instance overrides: set the `texts` prop/attribute, e.g.
`texts='{"find":"Search","problems":{"one":"1 issue","other":"{count} issues"}}'` — short keys
(without the `codeeditor.` prefix) are looked up first, see `OElement.t()`.

## Performance

* Tokenization is cached per line (`_cache`) and incrementally revalidated: an edit only
  re-tokenizes from the first changed line to the end of the file *up to whatever is currently
  rendered* (`_ensure(upTo)`), and lines whose text and starting tokenizer state are unchanged
  are skipped entirely on the next render.
* Rendering of the highlighted `<pre>` and the gutter is **virtualized** once a document exceeds
  150 lines (`VIRTUAL_MIN`) and `wrap` is off: only the lines intersecting the viewport (plus a
  10-line buffer) get DOM nodes; the rest are represented purely by a `translateY` offset. This
  makes multi-thousand-line documents responsive. The `<textarea>` itself is never virtualized
  (native selection/IME require the real text), so extremely large documents (tens of MB) are
  still bounded by what a native `<textarea>` can hold, not by this component.
* `wrap="true"` disables virtualization (soft-wrapped line heights vary, so offset math isn't
  possible) — very large wrapped documents will be slower to render.

## Limitations / known edge cases

* `format()` only pretty-prints JSON; there's no formatter for other languages.
* The tokenizer is a lexer, not a parser — it never reports semantic errors (unmatched brackets,
  undefined variables, type errors) for anything other than the built-in JSON validator; wire a
  real parser/linter through the `validate` prop for that.
* `replaceCurrent()`'s backreference support (`$1`, regex mode) re-runs the search pattern against
  just the matched substring to resolve capture groups; a pattern that relies on lookahead/
  lookbehind context outside the match itself may not resolve correctly in that one code path
  (`replaceAll()` is not affected — it uses `String.replace` directly).
* `rb` (Ruby) and `less`/`sass` aliases currently point at `plaintext`/`scss` respectively — there
  is no dedicated Ruby, Less or Sass grammar yet.
