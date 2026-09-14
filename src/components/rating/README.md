# rating

`<o-rating>` — a star (or heart/thumb/custom icon) rating, form-associated, with fractional precision, hover
preview and a `radiogroup`/`radio` keyboard pattern.

## Usage

```html
<o-rating name="score" value="3.5" max="5" precision="0.5" color="warning"></o-rating>
<o-rating icon="heart" color="danger" readonly value="4"></o-rating>
```

## Types

```ts
type RatingIcon = 'star' | 'heart' | 'thumb' | 'custom' | string;   // any other value: a core icon name

interface ORatingProps {
  value: number;                  // 0 means "not rated"
  max: number;                    // default 5
  precision: number;              // smallest selectable step, e.g. 0.5 (default 1)
  icon: RatingIcon;                // default 'star'
  iconOn?: string;                 // raw SVG inner markup, used when icon === 'custom'
  iconOff?: string;
  color?: string;                  // semantic name ('warning', 'danger', ...) or any CSS color
  size: 'sm' | 'md' | 'lg';        // default 'md'
  clearable?: boolean;             // clicking the current value (or Home) resets to 0
  itemLabels: string[];            // one label per whole level
  format?: (value: number, el: ORating) => string;
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class ORating extends HTMLElement implements ORatingProps {
  // ...ORatingProps
  setValue(value: number): void;
  clear(): void;
  focus(opts?: FocusOptions): void;
}

interface Orion { Rating: typeof ORating }
declare global { interface HTMLElementTagNameMap { 'o-rating': ORating } }
```

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native |
| `o-change` | `{ value }` |
| `o-hover` | `{ value }` while previewing on hover/drag; `value: null` on leave |

## Keyboard

→/↑ +precision, ←/↓ -precision (←/→ follow RTL) · Home/End to the lowest selectable value (0 if `clearable`) / max ·
Space/Enter selects the focused level fully.

## Accessibility

Host: `role="radiogroup"`. Each level: `role="radio"` with roving `tabindex` and `aria-checked` on the level matching
the current (rounded-up) value. A visually-hidden live region announces the precise, including fractional, value.
