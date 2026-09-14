# Preferences — `<o-preferences>` and `Orion.preferences`

A settings panel for the things every admin app needs a place for: theme mode, density, high contrast,
text size, a reduced-motion override, language and notification toggles. Persists through
`Orion.prefs.get/set` when the `services-b` package is present, `localStorage` otherwise — both paths go
through the same two internal helpers, so nothing else needs to change once that package lands.

```html
<o-preferences sections="appearance,accessibility,language,notifications"
  notifications='[{"key":"product","label":"Product updates","description":"New features"}]'>
</o-preferences>
```

* **Appearance** — theme mode (delegates to `Orion.theme.setMode`) and density (compact/comfortable/spacious,
  applied as `--o-control-h(-sm|-lg)`).
* **Accessibility** — high contrast (`Orion.theme.setContrast`), text size (A−/A/A+ buttons that reuse the
  built-in `data-o-action="theme" data-o-value="font-|font+"` actions, plus a slider bound to
  `Orion.theme.setFontScale`), and a reduced-motion override (System/Reduce/Full) that adds an
  `html.o-motion-reduce` class collapsing every CSS transition/animation to ~0 regardless of the OS setting.
  **Limitation**: this cannot reach JS-driven `Orion.animate()` calls, which only check
  `prefers-reduced-motion` — see the package report for a proposed one-line core change.
* **Language & region** — every locale registered with `Orion.i18n.add()`, switched via `Orion.i18n.set()`,
  with a live preview of the date/time/relative formats in that locale.
* **Notifications** — a switch per entry in the `notifications` prop; toggling persists
  `notif.<key>` and fires `o-notification-change` for your app to wire into its real backend.

Events: `o-change {key, value}` (theme/density/contrast/motion/language), `o-notification-change {key, value}`.
Method: `reset()`.

## `Orion.preferences.open(opts?)`

Opens `<o-preferences>` in a drawer — `Orion.drawer` when the `overlays` package is present, a minimal
panel built directly on core `portal()`/`overlays`/`animate()` otherwise. `opts`: `{ sections, notifications, texts }`.
Also: `Orion.preferences.close()`, `.toggle(opts?)`, and `data-o-action="preferences"` for a delegated button.

## Files

`10-preferences.js` `<o-preferences>` · `20-preferences-service.js` `Orion.preferences` · `preferences.css`.
