# Switchers — `<o-theme-switch>`, `<o-lang-switch>`

Small controls bound to the core theme and i18n services. Both listen for external changes (another
switcher, a restored preference, a keyboard shortcut) and stay in sync without any wiring.

```html
<o-theme-switch variant="segmented" show-contrast show-font-size></o-theme-switch>
<o-lang-switch variant="menu"></o-lang-switch>
```

## `<o-theme-switch>`

| Attribute | Type | Description |
|---|---|---|
| `variant` | `icon｜segmented｜select｜toggle` | Default `icon`. `toggle` is binary (light/dark only; ignores `auto`). |
| `show-contrast` | Boolean | Adds a switch bound to `Orion.theme.setContrast()`. |
| `show-font-size` | Boolean | Adds a −/percentage/+ stepper bound to `Orion.theme.setFontScale()` (double-click the percentage to reset). |
| `texts` | Object | Per-instance string overrides. |

Bound to `Orion.theme.mode` / `.resolved` / `.highContrast` / `.fontScale` via `Orion.theme.onChange()`.

## `<o-lang-switch>`

| Attribute | Type | Description |
|---|---|---|
| `variant` | `select｜menu｜flags` | Default `select`. Locales come from `Orion.i18n.locales()`. |

`menu` opens a floating listbox (arrow keys, typeahead via the shared `ListNav`, `Escape` to close).
`flags` shows one button per locale using a built-in emoji-flag map (falls back to 🏳️ for unmapped
languages). Selecting a locale calls `Orion.i18n.set(code)`.

## CSS

`.o-theme-switch` / `.o-lang-switch` and their variant sub-elements — both reuse core control classes
(`.o-btn`, `.o-segmented`, `.o-select`, `.o-switch`, `.o-floating`) so they inherit any theme customization
automatically. See the source for the full class list.
