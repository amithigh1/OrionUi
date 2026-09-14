# FAB — `.o-fab`, `<o-fab>` speed dial

A plain circular (or extended, or mini) floating action button via CSS classes, or `<o-fab>` for a
keyboard-accessible speed dial with labelled child `<o-fab-action>` items in a direction of your choice
(including a radial fan) and an optional backdrop.

```html
<button class="o-fab o-fab-bottom-end" aria-label="Compose"><o-icon name="plus"></o-icon></button>

<o-fab icon="plus" label="Create" direction="up" backdrop>
  <o-fab-action icon="file-text" label="New document"></o-fab-action>
  <o-fab-action icon="image" label="Upload image"></o-fab-action>
</o-fab>
```

## Plain button classes

`.o-fab` (3.5rem circle) · `.o-fab-mini` (2.5rem) · `.o-fab-extended` (pill + text label) ·
`.o-fab-bottom-end` (default position) / `.o-fab-bottom-start` / `.o-fab-top-end` / `.o-fab-top-start`.

## `<o-fab>`

| Attribute | Type | Description |
|---|---|---|
| `icon` | String | Trigger icon when closed (becomes `x` while open). Default `plus`. |
| `label` | String | `aria-label` for the trigger. |
| `direction` | `up｜down｜start｜end｜radial` | Layout of the child actions. Default `up`. |
| `backdrop` | Boolean | Dim the page while open; clicking it closes the dial. |
| `radius` | Number | Fan radius in px for `direction="radial"`. Default 88. |
| `open` | Boolean | Reflected attribute; the property is `isOpen` (`el.open = true` also works, mirroring the attribute). |

Methods: `open()` (focuses the first action), `close(refocus?)`, `toggle()`.
Events: `o-open`, `o-close { reason }`.

## `<o-fab-action>`

| Attribute | Type | Description |
|---|---|---|
| `icon` / `label` | String | Icon and text; `label` also becomes the `aria-label`. |
| `href` | String | Navigated to after the dial closes, unless `o-select` is prevented. |
| `disabled` | Boolean | Skipped by pointer and keyboard. |

Event: `o-select` (bubbles, cancelable — `preventDefault()` to keep the dial open).

## Keyboard

| Key | Action |
|---|---|
| Enter / Space (trigger) | Toggle the dial. |
| Arrow matching `direction` (trigger) | Open and focus the first action. |
| Arrows (in the dial) | Move between actions, wrapping. |
| Home / End | First / last action. |
| Escape | Close and return focus to the trigger. |

## CSS custom properties

`--o-fab-tx`, `--o-fab-ty` (per-action radial offsets, set automatically) · `--o-fab-i` (stagger index).
