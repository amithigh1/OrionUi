# commandpalette — `Orion.commands`, `Orion.commandPalette`, `<o-command-menu>`

A Raycast/Linear-style command palette: a global command registry, a modal ⌘K palette built on
`Orion.overlays`, and an inline `<o-command-menu>` custom element that shares the same fuzzy
ranking, sectioning, nested-page and keyboard-navigation engine. No third-party code.

Docs: `docs/components/command-palette.html`. Files:

| File | Contents |
|---|---|
| `00-registry.js` | `Orion.commands` — register/add/remove/list commands and async providers |
| `10-engine.js` | `CommandEngine` — internal: filtering/ranking, sections, recent commands, provider debouncing/aborting, danger confirm, keyboard + mouse selection (not part of the public API) |
| `20-palette.js` | `Orion.commandPalette` — the modal dialog + default `mod+k` hotkey |
| `30-menu.js` | `<o-command-menu>` — the inline, non-modal variant |
| `commandpalette.css` | tokens-only styles for both variants |

## `Orion.commands`

```ts
interface Command {
  id?: string;                 // auto-generated when omitted
  title: string;
  subtitle?: string;
  icon?: string;                // Orion.icon() name
  section?: string;             // group heading; default "Commands"
  keywords?: string[];          // extra fuzzy-match text, not shown
  shortcut?: string;            // e.g. "mod+i" — rendered with Orion.shortcuts when present, else a small fallback formatter
  badge?: string | number;
  danger?: boolean;             // requires pressing Enter/clicking twice ("Press again to confirm")
  disabled?: boolean;
  run?(ctx: { close(): void; query: string }): void;
  href?: string;                 // navigates via location.href when there is no run()
  children?: Command[];          // opens a nested page immediately (breadcrumb pushed)
  load?(query: string): Command[] | Promise<Command[]>;  // nested page that (re)loads per keystroke
  when?(): boolean;              // hide the command while this returns false
}
interface CommandProvider {      // async, root-page-only search source (e.g. "search Users")
  id?: string;
  section: string | (() => string);
  icon?: string;
  minChars?: number;              // default 1
  debounce?: number;               // default 200ms
  limit?: number;                  // default 8 — results are truncated to this
  search(query: string, ctx: { signal: AbortSignal }): Promise<Command[]>;
}
```

| Member | Returns | |
|---|---|---|
| `register(commands: Command[])` | `() => void` | Adds many commands at once. |
| `register(command: Command)` | `() => void` | Adds one command. |
| `register(provider: CommandProvider)` | `() => void` | Detected by the presence of `.search`. |
| `register(fn: () => Command[] \| Promise<Command[]>)` | `() => void` | Resolved once immediately (lazy static list); call again to refresh. |
| `add(command)` | `id` | |
| `remove(id)` / `unregister(id)` | `void` | |
| `update(id, patch)` | `void` | Shallow-merges into an existing command. |
| `get(id)` | `Command \| undefined` | |
| `list({ includeHidden? })` | `Command[]` | Commands whose `when()` (if any) currently passes. |
| `providers()` | `CommandProvider[]` | |
| `clear()` | `void` | Removes everything (commands, providers, lazy lists). |

Every `register()`/`add()` call also fires `Orion.on('commands:change', …)` internally so any open
palette or `<o-command-menu>` re-renders immediately.

## `Orion.commandPalette`

| Member | | |
|---|---|---|
| `open({ query?: string; page?: string \| Command })` | `void` | `page` jumps straight into a command's nested page (`children`/`load`). |
| `close()` | `void` | |
| `toggle(opts?)` | `void` | |
| `isOpen` | `boolean` (getter) | |
| `hotkey(combo: string \| false)` | `void` | Default `'mod+k'`. Uses `Orion.shortcuts.add()` when that package is loaded (so it shows up in the shortcuts help overlay), otherwise a small built-in `keydown` listener. Pass `false` to remove it. |

Dialog events (bubble from the `.o-cmdk` element, and therefore from `document`):

| Event | Cancelable | `detail` |
|---|---|---|
| `o-before-open` | ✓ | `{}` |
| `o-open` | | `{}` |
| `o-close` | | `{ reason: 'escape' \| 'outside' \| 'api' }` |
| `o-command` | | `{ command, query }` — a command was run (also fired by `<o-command-menu>`) |

## `<o-command-menu>`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `commands` | `Command[]` | `[]` | Local list; falls back to the global `Orion.commands` registry when empty. |
| `placeholder` | `string` | – | |
| `autofocus` | `boolean` | `false` | |
| `providers` | `boolean` | `false` | Also search `Orion.commands.providers()` (only meaningful without a local `commands` list). |
| `hints` | `boolean` | `true` | Shows the keyboard-hints footer. |

Methods: `focus(opts?)`, `reset(query? = '')` (back to the root page), `refresh()` (re-render, e.g.
after a `when()` result changed elsewhere).

Events: `o-command { command, query }`, `o-search { query }`, `o-navigate { pages: (string|null)[] }`.

## Keyboard

`↑`/`↓` (loops, typeahead), `Home`/`End`, `Enter` (run / open nested page / arm-then-confirm a
`danger` command), `Backspace` with an empty query (go back one page). Rows also respond to
`pointermove` (hover) and `click`. The palette dialog itself closes on `Escape` or an outside
click/tap via `Orion.overlays` (focus-trapped, scroll-locked, returns focus on close).

## Notes & limits

- Async providers only run on the **root** page (not inside a `children`/`load` nested page) and
  only once the query reaches `minChars`; a new keystroke aborts the previous in-flight `search()`
  via `AbortSignal` and clears its pending debounce timer.
- Recent commands are persisted to `localStorage` under `orion:commandpalette:recent` (command
  `id`s only, capped at 10) and are only shown on the **global registry root** with an empty query
  — not inside `<o-command-menu>` when it is given a local `commands` list.
- `danger` commands never run on the first Enter/click; the row switches to a "Press again to
  confirm" state for 4 seconds (or until you change the query).
