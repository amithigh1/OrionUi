# Theme Builder — `<o-theme-builder>`

A live visual editor on top of `Orion.theme`. Every control calls `Orion.theme.set()` /
`Orion.theme.setFontScale()` immediately — there is no separate "apply" step — so it doubles as a way to
prototype a brand directly against the real component CSS.

```html
<o-theme-builder presets='[{"name":"Acme Blue","primary":"#2563eb"}]'></o-theme-builder>
```

* **Colors** — primary/secondary/success/danger/warning/info, each with a generated `Orion.color.palette()`
  preview strip. Uses `<o-colorpicker>` when the `inputs` package is present, a native `<input type=color>`
  otherwise.
* **Surfaces** — a neutral-tint slider mixes a hint of the primary hue into `--o-bg/surface/border` (light
  and dark computed separately, so both preview panes and the live page stay correct in either mode).
* **Shape & density** — a radius slider derives the whole `--o-radius-*` scale; density switches
  `--o-control-h(-sm|-lg)` between compact/comfortable/spacious.
* **Typography** — font family (`--o-font-sans`) and a base-size-and-scale slider (`theme.setFontScale`).
* **Shadow intensity** — regenerates `--o-shadow-xs…xl` at the same hue but a different alpha, per mode.
* **Sidebar style** — light/dark/branded, via `--o-sidebar-bg` / `--o-sidebar-text`.
* **Live preview** — side-by-side `.o-theme-light` / `.o-theme-dark` mockups built from real `.o-card`,
  `.o-btn`, `.o-input`, `.o-badge` and `.o-table` markup, not illustrations.
* **WCAG contrast** — each semantic color's contrast against its computed on-color, an AA/AAA/fail badge,
  and a one-click "Use suggested" fix (nudged toward black/white until it clears 4.5:1).
* **Presets** — Indigo, Emerald, Rose, Amber, Ocean, Slate, Violet, Corporate by default; override entirely
  with the `presets` prop (`[{ name, primary, secondary?, info?, radius?, density? }]`).
* **Import / export** — JSON (the full draft — round-trips through `importJSON`/`exportJSON`) and CSS
  (`Orion.theme.exportCSS()`, ready to paste into a stylesheet loaded after Orion).
* **Save as tenant** — `Orion.theme.register(name, { ...tokens, brand: { name } })` + `Orion.theme.use(name)`.

## API

Methods: `applyPreset(name)`, `exportJSON()`, `exportCSS()`, `importJSON(json)`, `saveAsTenant(name)`, `reset()`.
Events: `o-change {draft}` (fires on every edit), `o-preset {name}`, `o-save-tenant {name, tokens}`, `o-reset`.

## Files

`10-presets.js` pure token/contrast helpers · `20-theme-builder.js` `<o-theme-builder>` · `themebuilder.css`.
