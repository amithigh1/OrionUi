# colorpicker

`<o-colorpicker>` — a saturation/value area + hue/alpha sliders, switchable hex/RGB/HSL fields, swatches, a persisted
recent-colors list, an EyeDropper button where supported, and a WCAG contrast hint. Form-associated. Popup (default,
a floating panel per the architecture's floating-panel pattern) or `inline`.

## Usage

```html
<o-colorpicker name="brand" value="#4f46e5"></o-colorpicker>
<o-colorpicker alpha format="rgb" swatches='["#4f46e5","#dc2626","#15803d"]'></o-colorpicker>
<o-colorpicker inline value="#0e7490"></o-colorpicker>
```

## Types

```ts
interface OColorPickerProps {
  value: string;                    // any CSS color (hex/rgb/hsl/named); default "#4f46e5"
  format: 'hex' | 'rgb' | 'hsl';     // default 'hex' — the serialized value/form value
  alpha?: boolean;                   // show the alpha slider + RGBA/HSLA output
  swatches: string[];
  recent: boolean;                   // persist + show recently picked colors (default true)
  inline?: boolean;
  eyedropper: boolean;               // default true; button only renders when window.EyeDropper exists
  contrastHint: boolean;             // default true
  placement: string;                 // popup placement, default 'bottom-start'
  size?: 'sm' | 'lg';
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class OColorPicker extends HTMLElement implements OColorPickerProps {
  // ...OColorPickerProps
  setValue(value: string): void;
  open(): void;
  close(): void;
  toggle(): void;
  focus(opts?: FocusOptions): void;
}

interface Orion { ColorPicker: typeof OColorPicker }
declare global { interface HTMLElementTagNameMap { 'o-colorpicker': OColorPicker } }
```

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native |
| `o-change` | `{ value }` |
| `o-open` | — |
| `o-close` | `{ reason: 'escape' \| 'outside' \| 'api' }` |

## Keyboard

| Control | Keys | Action |
|---|---|---|
| Trigger button | Enter / Space / ↓ | Open the panel |
| Saturation/brightness area | ←→↑↓ (Shift ×5), Home/End | Adjust saturation/brightness; Home/End set saturation to 0/100 |
| Hue slider | ←→ (Shift ×10), Home/End | Adjust hue 0-360 |
| Alpha slider | ←→ (Shift ×10), Home/End | Adjust alpha 0-100% |

## Notes

- The saturation/hue/alpha canvases are intentionally **not** mirrored in RTL — colors have no reading direction,
  matching native OS/browser color pickers. Everything else (panel placement, field/button layout) is RTL-aware.
- Uses `Orion.color.parse/toHex/toRgb/toHsl/contrast` from core; no bundled color library.
