# shortcuts

Keyboard shortcut registry: combo parsing (`mod+s`, sequences like `g i`, comma-separated alternatives, `mod` =
⌘ on Mac / Ctrl elsewhere), scopes (with exclusive scopes that suppress global bindings), a searchable/fuzzy-filtered
help overlay (opened by `?` by default), combo recording, and the `data-o-shortcut` behavior for binding a shortcut
declaratively to any clickable/focusable element.

## `Orion.shortcuts`

### Properties

| Property | Type | Notes |
|---|---|---|
| `isMac` | `Boolean` | Platform detection used for combo parsing/formatting. |
| `enabled` | `Boolean` | Getter; see `enable()`/`disable()`. |
| `scope` | `String` | Getter; current top scope name, or `'global'`. |
| `scopes` | `String[]` | Getter; the full scope stack (names). |
| `helpOpen` | `Boolean` | Getter; whether the help overlay is open. |

### Methods

| Method | Description |
|---|---|
| `add(combo, handler, options = {})` | Registers `combo` (`'mod+s'`, `'g i'` sequence, `'mod+s, ctrl+shift+s'` alternatives) → `remove()`. Also accepts `add({ combo: handler, ... }, sharedOptions)` → removes all. |
| `remove(bindingOrIdOrCombo, handler?)` | Removes matching binding(s) by object, id, or combo string (+ optional handler). |
| `pushScope(name, { exclusive = false } = {})` | Pushes a scope; `exclusive` also suppresses `'global'`-scoped bindings while active. Clears any pending sequence → `pop()`. |
| `popScope(name?)` | Pops a named scope (or the top one) → new `scope`. |
| `setScope(name)` | Replaces the whole scope stack with a single scope (or clears to `'global'`) → `shortcuts`. |
| `enable()` / `disable()` | Globally enable/disable dispatch → `shortcuts`. |
| `list({ all = false, scope } = {})` | → `[{ id, combo, description, group, scope, formatted, enabled }]`. Only bindings with a `description` and, unless `all`, only ones active in the current scope. |
| `trigger(combo, event = null)` | Manually invokes the most-recently-added enabled handler for `combo` → `Boolean` (found?). |
| `configure({ sequenceTimeout, helpKey })` | `sequenceTimeout` (ms, default `1000`); `helpKey` (default `'?'`, falsy disables the built-in help binding) → `shortcuts`. |
| `record({ allowEscape = false } = {})` | → `Promise<String\|null>` of the next combo pressed; Escape cancels (`null`) unless `allowEscape`. |
| `comboFromEvent(e)` | → combo `String` for a raw `keydown` event, or `null` for a bare modifier key. |
| `parse(combo)` | Alias for the internal combo parser → nested array of step objects. |
| `format(combo, { mac = isMac } = {})` | → human label, e.g. `"⌘⇧K"` (Mac) / `"Ctrl+Shift+K"`; sequences joined by "then", alternatives by ", ". |
| `kbd(combo, { mac = isMac } = {})` | → `SafeHTML`, one `<kbd class="o-kbd">` per key. |
| `ariaKeys(combo)` | → value for `aria-keyshortcuts` (single-step alternatives only). |
| `isTyping(el)` | → `Boolean`, true when `el` is a text-entry field or `contenteditable`. |
| `help(options?)` / `closeHelp()` / `toggleHelp(options?)` | Open/close/toggle the help overlay. `options: { title }`. |

## Events (bus only — no DOM CustomEvents)

| Event | Detail | Notes |
|---|---|---|
| `shortcuts:change` | — (no detail) | Emitted after `add()`/`remove()`. |
| `shortcuts:help` | `{ open: true\|false }` | Emitted when the help overlay opens/closes. |

## Behaviors

### `data-o-shortcut="combo"`

Applies to any element (typically a button/link). Registers `combo`; pressing it focuses+selects text
inputs/selects/`FormElement`s, or `.click()`s the element otherwise. Only "usable" elements (connected, not
`disabled`/`aria-disabled`/inside `[inert]`/`[hidden]`, and visible) are eligible and listed in the help overlay.

| Sub-attribute | Notes |
|---|---|
| `data-o-shortcut-hint` | `'title'` (default, adds a title tooltip) \| `'kbd'` (also appends a visible `<span class="o-shortcut-hint">` with `kbd()` markup) \| `'none'`. |
| `data-o-shortcut-scope` | Binding scope; default `'global'`. |
| `data-o-shortcut-group` | Group label in the help overlay; default localized "On this page". |
| `data-o-shortcut-description` | Overrides the auto-derived label (else `aria-label` → `title` → own text → `placeholder` → closest `<label>` → the combo itself). |
| `data-o-shortcut-inputs` | Presence enables `allowInInputs` (fires even while typing in a field). |

Automatically sets `aria-keyshortcuts` and (unless `hint="none"`) a `title` of `"<label> (<formatted combo>)"`;
restores the original `title`/`aria-keyshortcuts` and removes the hint span on cleanup (attribute removed or
element disconnected).
