# numberinput

`<o-number>` — a locale-aware number/currency/percent/unit input with a stepper. Form-associated. Also ships a
`data-o-number` behavior for plain `<input>` elements (formats live, submits a clean numeric value via a hidden input).

## Usage

```html
<o-number name="price" currency="USD" min="0" max="100000" step="0.5"></o-number>
<o-number percent max="100"></o-number>
<input class="o-input" data-o-number data-o-number-name="amount" data-o-currency="EUR" data-o-number-precision="2">
```

## Types

```ts
interface ONumberProps {
  value: number | null;
  min?: number; max?: number; step: number; precision?: number;
  currency?: string; percent?: boolean; unit?: string;
  prefix?: string; suffix?: string;
  allowNegative?: boolean;
  controls: 'stepper' | 'split' | 'none';
  wheel?: boolean;
  locale?: string;
  grouping: boolean;
  placeholder?: string;
  size?: 'sm' | 'lg';
  align?: 'start' | 'end';
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class ONumber extends HTMLElement implements ONumberProps {
  // ...ONumberProps
  stepUp(n?: number): void;
  stepDown(n?: number): void;
  clear(): void;
  focus(opts?: FocusOptions): void;
}

interface NumberFormatOptions {
  locale?: string; currency?: string; percent?: boolean; unit?: string;
  prefix?: string; suffix?: string; precision?: number; minPrecision?: number; grouping?: boolean;
}

interface OrionNumber {
  format(value: number, opts?: NumberFormatOptions): string;
  parse(text: string, opts?: { locale?: string }): number | null;
  info(opts?: NumberFormatOptions): { locale: string; group: string; decimal: string; prefix: string; suffix: string; frac: number | null };
  value(input: string | Element): number | null;   // current value of a data-o-number input
}

interface Orion { number: OrionNumber; NumberInput: typeof ONumber }
declare global { interface HTMLElementTagNameMap { 'o-number': ONumber } }
```

## `data-o-number` behavior attributes

| Attribute | Description |
|---|---|
| `data-o-number` | Enable the behavior; `data-o-number="percent"` switches style. |
| `data-o-number-name` | Adds a hidden input with this name carrying the clean numeric value. |
| `data-o-currency` | Currency code. |
| `data-o-number-precision` / `-min` / `-max` / `-locale` | As above. |
| `data-o-number-negative` | Presence enables negative numbers. |
| `data-o-number-grouping="false"` | Disable thousands separators. |

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native; `input` fires continuously while typing, `change`/`o-change` on commit (blur/Enter) |
| `o-change` | `{ value }` |

## Keyboard

↑/↓ ±1 step (×10 with Shift); Page Up/Down ±10 steps; Enter commits (clamps + fires change).
