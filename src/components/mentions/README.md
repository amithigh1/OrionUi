# Mentions & Emoji (`src/components/mentions/`)

Caret-positioned autocomplete for `@mentions`, `#tags`, `:emoji:` and any other
trigger character, plus a small (~300 entry) built-in emoji set with a search
popup. This folder also owns `Orion.editorKit`, the floating-panel primitives
shared by the mentions list, the emoji picker, and the rich-text `<o-editor>`
component (`src/components/editor/`, owned elsewhere — treat `editorKit`'s
public surface as a stable contract).

Files (concatenated in this order into one scope):

| File | Provides |
|---|---|
| `00-kit.js` | `Orion.editorKit` — `popover()`, `menu()`, `caretRect()`, `rangeRect()` |
| `05-emoji.js` | `Orion.mentions.emoji` — emoji list, `search()`, `picker()`, `source` |
| `10-mentions.js` | `Orion.mentions()` factory, the `Mentions` class, the `data-o-mentions` behavior |
| `mentions.css` | `.o-ek-*` (kit/menu/emoji-picker) and `.o-mentions*` / `.o-mention` styles |

This is a **service + behavior**, not a custom element (see ARCHITECTURE.md
layer table): there is no `<o-mentions>` tag. You either call `Orion.mentions()`
yourself, or add `data-o-mentions` to a `<textarea>`/`<input>`/contenteditable
element and it wires itself up.

---

## `Orion.editorKit`

```ts
type AnchorLike = Element | { getBoundingClientRect(): DOMRect | RectLike } | { x: number; y: number; width?: number; height?: number };
interface RectLike { x: number; y: number; left: number; top: number; width: number; height: number; right: number; bottom: number; }
```

### `Orion.editorKit.popover(anchor, content, opts?) -> PopoverHandle`

Opens a floating panel: builds a `.o-floating.o-ek-pop` wrapper, appends
`content`, portals it (to `<body>`, or the nearest open `<dialog>`), places it
with `autoPlace()`, and registers it with the global `overlays` stack (Escape,
click-outside, nesting, focus return, z-index — see ARCHITECTURE.md §6).

* `anchor: AnchorLike` — element or `{getBoundingClientRect}`-like object the
  panel is placed against.
* `content: Node` — appended into the panel wrapper as-is (build it yourself;
  it is **not** escaped — the caller owns sanitization of anything user-supplied).
* `opts`:
  | Option | Type | Default | Notes |
  |---|---|---|---|
  | `placement` | string | `'bottom-start'` | passed to `autoPlace` |
  | `offset` | number | `6` | px gap from anchor |
  | `className` | string | — | extra class(es) on the wrapper |
  | `role` | string | `'dialog'` | wrapper's `role`; `aria-modal="false"` is set only when `role` is `'dialog'` or omitted |
  | `label` | string | — | `aria-label` on the wrapper |
  | `focus` | `Element \| true` | — | element to focus once open, or `true`/truthy to `focusFirst()` inside the panel |
  | `trap` | boolean | `false` | forwarded to `overlays.open({trap})` (focus trap) |
  | `owner` | Element | anchor (if an Element) | clicks on `owner` don't count as "outside"; also the portal's context-inherit source |
  | `returnFocus` | boolean | `true` | restore focus to the opener on close |
  | `zOffset` | number | `0` | forwarded to `overlays.open` |
  | `onClose` | `(reason: string) => void` | — | called after the panel is removed |

  Returns `PopoverHandle`:
  ```ts
  interface PopoverHandle {
    el: HTMLDivElement;              // the floating wrapper (has the content appended)
    open: boolean;                   // false once closed
    close(reason?: string): void;    // closes via the overlay stack (fires onClose)
    update(): void;                  // re-run placement (e.g. after the anchor rect moved)
  }
  ```
  The panel animates in with `animate(el, 'zoomIn', {duration: 120})` and is
  fully removed from the DOM on close (`el.remove()` — a new `popover()` call
  is needed to reopen).

### `Orion.editorKit.menu(anchor, items, opts?) -> PopoverHandle & { nav: ListNav }`

A `role="menu"` popover with `ListNav` keyboard handling (arrows, Home/End,
typeahead, RTL-aware) built on top of `popover()`.

* `items: Array<MenuItem | '-'>` where
  ```ts
  interface MenuItem {
    id: string; label?: string; html?: string;   // html wins over label, is NOT escaped
    icon?: string | Node;                         // icon name (resolved via O.icon) or a Node/SVG-string
    hint?: string; shortcut?: string;              // right-aligned text (shortcut wins)
    disabled?: boolean; checked?: boolean;         // checked != null -> role="menuitemcheckbox"
    danger?: boolean; className?: string; separator?: boolean;
  }
  ```
  `'-'` (or `{separator: true}`) renders a separator row.
* `opts`: `{ onSelect(item), label, placement, owner, className, onClose }` — same
  meaning as `popover()`'s, plus `onSelect(item: MenuItem)` fired on click/Enter/Space.
* Clicking an item, or pressing Enter/Space on the focused item, calls `onSelect`
  and closes with reason `'select'`. `Tab` closes with reason `'tab'` (does not
  select). If any item has `checked: true`, it becomes the initially-focused
  item; otherwise **the first enabled item is focused automatically** once the
  menu opens (WAI-ARIA menu-button pattern) — this is intentional, not a bug.

### `Orion.editorKit.caretRect(target, offset?) -> RectLike | null`

Viewport rect (0-width, line-height tall) of a caret position, for anchoring a
popover to where the user is typing.

* `target`: a `<textarea>`/`<input>` — builds an off-screen mirror `<div>`
  (copies box model + font/text CSS props, see `MIRROR_PROPS`) containing the
  text up to `offset` (default `target.selectionStart`), measures where the
  trailing marker span lands, and removes the mirror. Works for both wrapped
  (`textarea`) and single-line (`input`) fields.
* `target`: anything else (including `null`/omitted) — falls back to the
  current DOM selection via `rangeRect(selection.getRangeAt(0))`.
* Returns `null` if there is no usable selection.

### `Orion.editorKit.rangeRect(range) -> RectLike | null`

Viewport rect of a (collapsed) `Range`. If the range's own `getClientRects()`
is empty or a degenerate `0,0` rect (e.g. an empty block/line), it falls back
to the bounding rect + padding of the nearest element, using `isRTL()` to pick
the correct edge (`right` in RTL) as the caret's `x`. Returns `null` only if
neither the range nor a fallback element can be resolved.

---

## `Orion.mentions.emoji`

```js
Orion.mentions.emoji.list          // -> [{ char, name, keywords: string[], category, search }]  (~300 entries)
Orion.mentions.emoji.categories    // -> string[] (7 categories: smileys, people, symbols, objects, nature, food)
Orion.mentions.emoji.search(q, limit = 50) -> EmojiEntry[]
Orion.mentions.emoji.picker(anchor, opts?) -> PopoverHandle
Orion.mentions.emoji.recent() -> string[]           // up to 16 recently-picked chars, most-recent first
Orion.mentions.emoji.remember(char)                 // records a pick (used internally by picker())
Orion.mentions.emoji.source                          // (query) => MentionItem[] — ready to use as a trigger source
```

* `search(q, limit)`: case-insensitive, `_`→space normalized, strips a leading
  `:`. Empty query returns the first `limit` entries in declaration order.
  Otherwise: entries whose **name** or any **keyword** *starts with* `q` sort
  first, then entries whose combined `search` string merely *contains* `q`,
  truncated to `limit`.
* `picker(anchor, opts)`:
  | Option | Type | Default | Notes |
  |---|---|---|---|
  | `onSelect` | `(char: string, emoji: EmojiEntry) => void` | — | fired on pick; the picker is already closed by then |
  | `placement` | string | `'bottom-start'` | forwarded to `popover()` |
  | `owner` | Element | — | forwarded to `popover()` |
  | `recent` | boolean | `true` | show a "Recently used" tab/section when there is history |
  | `onClose` | `(reason) => void` | — | forwarded to `popover()` |

  Returns the `popover()` handle. Renders a search input (autofocused), a row
  of category tabs (hidden while searching), and a scrollable grid
  (`role="grid"`) of emoji buttons. Picking an emoji calls `remember(char)`
  (persisted to `localStorage` under `orion:emoji:recent`, capped at 16), then
  `onSelect(char, entry)`.
* `source(q)`: `searchEmoji(q, 8).map(e => ({ id: e.char, label: e.name, char: e.char, emoji: e.char, value: e.char }))`
  — the shape `Orion.mentions()` expects from a trigger `source`. Pass it
  directly: `Orion.mentions(el, { triggers: { ':': { source: Orion.mentions.emoji.source, minChars: 1 } } })`.

### Emoji picker keyboard

| Key | Where | Action |
|---|---|---|
| Typing | search input | filters the grid (name/keyword match) |
| `ArrowDown` | search input | moves focus into the grid, activating the first cell |
| `Enter` | search input | picks the first result in the grid |
| `↑ ↓ ← →` | grid | move one cell (wraps; grid column count is recomputed from `grid.clientWidth`) |
| `Home` / `End` | grid | first / last cell |
| `Enter` / `Space` | grid | pick the focused emoji |
| `Escape` | anywhere in the popover | closes the picker (handled by the overlay stack) |

---

## `Orion.mentions(target, options?) -> Mentions`

Also available as `new Orion.mentions.Mentions(target, options)`.

```ts
type MentionSource =
  | Array<string | { id?: any; label?: string; name?: string; [k: string]: any }>
  | ((query: string, trigger: string) => any[] | Promise<any[]>)
  | string;   // dotted path resolved against `window` with getPath(), e.g. "myApp.searchUsers"

interface TriggerConfig {
  source: MentionSource;
  insert?(item: any, trigger: string): string | Node;   // default: "{trigger}{label} " for fields, a <span class="o-mention"> token for rich text
  render?(item: any, query: string, trigger: string): string | Node;  // custom suggestion row; string is NOT escaped
  onSelect?(item: any, trigger: string): void;
  allowSpaces?: boolean;   // overrides options.allowSpaces for this trigger
  maxLength?: number;      // overrides options.maxLength (max query length) for this trigger
  minChars?: number;       // overrides options.minChars for this trigger
  limit?: number;          // overrides options.limit for this trigger
  startOfLine?: boolean;   // trigger only matches at the start of a line/block (default false)
  hideEmpty?: boolean;     // close instead of showing "No matches" when a query yields 0 results
  className?: string;      // extra class on this trigger's popover
}

interface MentionsOptions {
  triggers?: Record<string, MentionSource | TriggerConfig>;  // e.g. { '@': users, '#': { source: tags } }
  trigger?: string;    // default '@' — used only when `triggers` is omitted
  source?: MentionSource;  // shorthand for triggers['@'] when `triggers` is omitted (with `trigger` as the key)
  limit?: number;      // default 8   — max suggestions shown
  minChars?: number;   // default 0   — min chars after the trigger before searching
  debounce?: number;   // default 120 — ms to debounce async source calls while the popup is already open
  allowSpaces?: boolean;  // default true — allow up to 2 space-separated words in the query (e.g. "@Ada Lov")
  maxLength?: number;  // default 40  — max query length before the trigger is abandoned
  insert?(item, trigger): string | Node;    // default inserter, see TriggerConfig.insert
  render?(item, query, trigger): string | Node;  // default row renderer, see TriggerConfig.render
  onSelect?(item, trigger): void;
  className?: string;  // default popover class
  texts?: object;       // reserved for per-instance i18n overrides (not currently read — see Known limitations)
}
```

* `target`: a `<textarea>`, an `<input>`, any element with the `contenteditable`
  attribute, **or** an `<o-editor>` host element (its `.contentEl` /
  `.o-editor-content` child is used as the actual editing surface, and its
  events/`getBoundingClientRect` are anchored to that host). Throws
  `Error('Orion.mentions: target not found')` if `target` resolves to nothing
  (it's run through the core `$()` helper, so a CSS selector string also works).
* Multiple trigger characters are independent state machines; when more than
  one matches at the caret, the **right-most** (closest to the caret) match
  wins.
* A trigger is recognized only when: the character immediately before it is
  whitespace/`([{"'`/NBSP/ZWSP or start-of-text; the query after it has no
  newline, is ≤ `maxLength`, and (with `allowSpaces`) has no double-space, no
  leading space, and at most 3 whitespace-separated words — or (without
  `allowSpaces`) has no whitespace at all.

### `Mentions` instance

| Member | Type | Description |
|---|---|---|
| `.isOpen` | `boolean` (getter) | whether the suggestion popover is currently open |
| `.items` | `array` (readonly-ish) | the currently-shown suggestion items |
| `.getMentions()` | `() => Array<{id, label, trigger}>` | see below |
| `.update(opts)` | `(opts: Partial<MentionsOptions>) => void` | merges `opts` into the live options; passing `triggers` replaces the whole trigger map |
| `.close(reason?)` | `(reason?: string) => void` | closes the popover (if open) without inserting anything |
| `.destroy()` | `() => void` | removes all listeners, ARIA attributes, and closes the popover — call this before discarding the instance/removing the target from the DOM |

`getMentions()`:
* **Rich text / contenteditable target**: queries `.o-mention` elements
  currently in the DOM and reads back `data-id` / `data-label` / `data-trigger`
  (falls back to the token's own text minus a leading `@`/`#`). This reflects
  the live DOM, so it's always accurate even if the user edited around a token.
* **`<textarea>`/`<input>` target**: there is no DOM token to inspect, so it
  is best-effort — every non-emoji selection is recorded internally as it's
  inserted, then `getMentions()` returns the subset whose literal
  `"{trigger}{label}"` substring is still present somewhere in `.value`
  (de-duplicated by `trigger+id`). Editing the surrounding text can produce
  false positives/negatives (e.g. deleting one occurrence of a mention that
  was inserted twice, or a coincidental substring match) — see *Known
  limitations* below.
* Emoji picks (items with `.emoji`/`.char`) are never included.

### Events

| Event | Target | Detail | Notes |
|---|---|---|---|
| `o-mention` | the `<o-editor>` host if hosted, else the field/contenteditable element | `{ item, trigger }` | fired after a suggestion (mention **or** emoji) is inserted; bubbles, composed, cancelable (cancellation has no effect — the insert already happened) |

There is no `open`/`close` event; use `.isOpen` or the `onClose` you'd pass if
you were calling `editorKit.popover` yourself (not applicable here — build on
`onSelect` instead, or poll `.isOpen`).

### `data-o-mentions` behavior

```html
<textarea data-o-mentions='["Ada Lovelace","Alan Turing","Grace Hopper"]'></textarea>
<textarea data-o-mentions="window.MyApp.users" data-o-mentions-trigger="#"></textarea>
<div contenteditable data-o-mentions='["Ada Lovelace"]' data-o-mentions-emoji></div>
```

* `data-o-mentions` (required to activate): either inline JSON (an array or
  object — detected by the value starting with `[` or `{`) or a dotted path
  resolved against `window` with `getPath()` (e.g. a global array or an async
  function). Empty/falsy resolves to `[]` (no matches, trigger still active).
* `data-o-mentions-trigger`: the trigger character for the source above.
  Default `'@'`.
* `data-o-mentions-emoji` (boolean, presence-only): also wires up `':'` as a
  second trigger using `Orion.mentions.emoji.source`, with `minChars: 1`.
* Internally calls `Orion.mentions(el, { triggers })` and stashes the instance
  on `el.__oMentions` (undocumented/private — prefer keeping your own
  reference from calling `Orion.mentions()` yourself if you need the API).
  The behavior's cleanup calls `.destroy()` and deletes `el.__oMentions` when
  the attribute is removed or the element leaves the DOM.
* This behavior only supports **one** declarative source; for multiple
  trigger characters with different sources, call `Orion.mentions()` yourself.

### Keyboard (mentions suggestion list)

| Key | Action |
|---|---|
| Typing the trigger char (`@`, `#`, `:`, …) | opens the popup once followed by a valid query |
| `↓` / `↑` | move the active suggestion (wraps) |
| `Enter` / `Tab` | insert the active suggestion (no-op if `Shift+Tab`/`Shift+Enter` or nothing is active) |
| `Escape` | closes the popup without inserting; the exact same trigger occurrence won't reopen automatically until the query text at that position changes (retyping/deleting re-arms it) |
| Click / mouse-hover a row | select / preview-highlight it |
| Arrow-Left/Right, Home, End, click (in the field) | re-evaluates the caret context (may open, move, or close the popup) |
| Blur (~120 ms grace period) | closes the popup |

### Default insertion & tokens

* **Field target** (`textarea`/`input`): default insert is `"{trigger}{label} "`
  (trailing space), replacing from the trigger character through the current
  caret via `el.setRangeText(...)`, followed by a real `input` event
  (`inputType: 'insertReplacementText'`) so frameworks/validators see the change.
* **Rich text target** (contenteditable / `<o-editor>`): default insert is
  `Orion.mentions.token(item, trigger)` — a
  `<span class="o-mention" contenteditable="false" data-id data-label data-trigger>@Label</span>`
  — followed by a non-breaking space text node so the caret can move past the
  (non-editable) token; also followed by a real `input` event.
* Emoji picks (source rows with `.emoji`/`.char`) bypass the token/space and
  insert the raw character in both modes.
* `Orion.mentions.token(item, trigger = '@')` and `Orion.mentions.avatar(item, size?)`
  (a lightweight `.o-avatar` — image with initials fallback, no `<o-avatar>`
  dependency) and `Orion.mentions.initials(name)` are exported for reuse by
  custom `insert`/`render` callbacks.

---

## CSS

All classes use design tokens only (see ARCHITECTURE.md §8) — dark mode and
custom themes need no per-component overrides.

| Class | Where |
|---|---|
| `.o-ek-pop`, `.o-ek-menu`, `.o-ek-item`, `.o-ek-sep`, `.o-ek-label`, `.o-ek-hint` | `editorKit.menu()` |
| `.o-ek-emoji-pop`, `.o-ek-emoji-panel`, `.o-ek-emoji-search`, `.o-ek-emoji-tabs`, `.o-ek-emoji-tab`, `.o-ek-emoji-grid`, `.o-ek-emoji-cat`, `.o-ek-emoji-set`, `.o-ek-emoji`, `.o-ek-emoji-none` | emoji picker |
| `.o-mentions`, `.o-mentions-list`, `.o-mentions-item` (`.is-active`), `.o-mentions-text`, `.o-mentions-label`, `.o-mentions-desc`, `.o-mentions-emoji`, `.o-mentions-icon`, `.o-mentions-hint`, `.o-mentions-status` | suggestion popover |
| `.o-mention` (`[data-trigger="#"]` variant) | inserted rich-text token |

---

## Known limitations / integration notes for `<o-editor>`

These don't block shipping but are worth knowing if you're building on top of
`O.mentions` / `O.mentions.emoji` / `O.editorKit` from the editor component:

1. **`getMentions()` on plain fields is substring-based**, not a real parse of
   the textarea value (see above) — fine for typical "@Full Name " use, but
   can misreport if a user manually types text that happens to match
   `"{trigger}{label}"`, or edits inside an inserted mention. The
   contenteditable/`<o-editor>` path does not have this issue since it reads
   real `.o-mention` DOM nodes.
2. **No locale-reactivity**: `Mentions` is a plain controller, not an
   `OElement`, so it never receives an `update(changed)` with `'locale'`.
   Strings looked up via `t('mentions.*')` are read fresh each time the popup
   opens, so a locale switch *does* apply to the next popup — but a
   currently-open popup's static status text ("Loading…"/"No matches") will
   not re-render mid-flight. In practice this is a non-issue since popups are
   short-lived.
3. **Escape guard is per-(position, query)**, not per-position: after
   `Escape`, the identical trigger occurrence stays dismissed only while its
   query text doesn't change; typing or deleting a character re-arms it. (This
   was fixed during this audit — see `10-mentions.js`'s `_detect()`/`_key()`
   for the one-line diff if you're diffing behavior.)
4. **One `Mentions` instance = one full re-scan per `input`/`click`/arrow-key
   event.** For extremely large documents/fields, `_context()` deliberately
   only looks back 120 characters (fields) or to the previous element boundary
   (rich text) to keep this cheap — that's a hard cap on how far back a
   trigger can be found from the caret, not configurable today.
5. `<o-editor>`'s `_setupMentions()` always injects a `':'` trigger for emoji
   (falling back to `Orion.mentions.emoji.source` unless the editor's own
   `mentions.triggers[':']` overrides it) — so any custom trigger map you pass
   into the editor's `mentions` option should avoid needing `':'` for
   something else, or override it explicitly.
6. `editorKit.popover()`/`menu()` fully remove their DOM on close; holding a
   stale `PopoverHandle` after `onClose` and calling `.update()`/`.close()`
   again is harmless (no-ops against a detached/removed element) but will not
   reopen anything.
