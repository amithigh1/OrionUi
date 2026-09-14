# range

`<o-range>` — a single or dual-thumb slider (min/max range), form-associated, with marks/ticks, tooltips, vertical
orientation and optional linked plain-number inputs.

## Usage

```html
<o-range name="volume" min="0" max="100" value="40"></o-range>
<o-range dual name="price" value-start="200" value-end="800" min="0" max="1000" step="10" min-distance="50" format="currency:USD"></o-range>
```

```js
const r = document.querySelector('o-range[dual]');
r.setRange(100, 400);
r.addEventListener('o-change', e => console.log(e.detail.value)); // [100, 400]
```

## Types

```ts
type RangeMark = number | { value: number; label?: string };

interface ORangeProps {
  value: number | null;                 // single-thumb mode
  valueStart: number | null;             // dual mode
  valueEnd: number | null;               // dual mode
  dual?: boolean;
  min: number; max: number; step: number;   // default 0 / 100 / 1
  minDistance: number;                   // dual mode only, default 0
  marks: RangeMark[] | Record<number, string>;
  ticks?: boolean;                       // auto tick marks at every step (capped at 200)
  format?: ((value: number, el: ORange) => string) | `currency:${string}` | 'percent' | `number:${number}`;
  orientation: 'horizontal' | 'vertical';
  tooltip: 'auto' | 'always' | 'never';
  inputs: Array<string | HTMLInputElement>;   // 1 (single) or 2 (dual) linked plain-number inputs
  nameEnd?: string;                      // dual mode form field name for the end value (default name + "End")
  size?: 'sm' | 'lg';
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class ORange extends HTMLElement implements ORangeProps {
  // ...ORangeProps
  setValue(value: number | [number, number]): void;
  setRange(start: number, end: number): void;   // dual mode convenience, fires one change
  focus(opts?: FocusOptions): void;
}

interface Orion { Range: typeof ORange }
declare global { interface HTMLElementTagNameMap { 'o-range': ORange } }
```

## CSS variables

| Variable | Description |
|---|---|
| `--o-rs-track` | Track thickness. |
| `--o-rs-thumb` | Thumb diameter. |
| `--o-c` | Accent color (wrap in `.o-c-{color}` or set directly). |

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native; `input` fires continuously while dragging/typing |
| `o-change` | `{ value, valueStart, valueEnd }` — `value` is a number (single) or `[start, end]` (dual) |

## Keyboard

→/↑ +step, ←/↓ -step (←/→ follow RTL) · Page Up/Down ±10 steps · Home/End to min/max.

## Notes

- Form value: single mode submits one field (`name`); dual mode submits two (`name` and `name-end`/`name+"End"`).
- Dragging uses Pointer Events (mouse, pen, touch); clicking the track jumps the nearest thumb there.
