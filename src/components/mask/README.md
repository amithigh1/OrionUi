# mask

Input masking behaviors for a native `<input>` — the element stays the real form field. Caret-preserving,
paste-safe, IME-safe, with a small pattern-compiler and a set of built-in presets (dates, cards, IBAN, IP, MAC…).

## Usage

```html
<input class="o-input" data-o-mask="(999) 999-9999" data-o-mask-placeholder="_">
<input data-o-mask="date" data-o-mask-format="DD/MM/YYYY">
<input data-o-mask="card">
<input data-o-mask-regex="^[A-Z]{0,3}\d{0,4}$" data-o-mask-case="upper">
```

```js
const m = Orion.mask(el, '99-99' | MaskOptions);
m.value; m.unmasked; m.complete;
m.set('123456'); m.update({ mask: 'aaa-999' }); m.toDate(); m.destroy();
```

## Types

```ts
type MaskToken = { test: RegExp | ((char: string, prev: string) => boolean); case?: 'upper' | 'lower'; pad?: boolean };

interface MaskOptions {
  mask?: string | string[] | RegExp | ((raw: string, ctrl: Masker) => string);
  regex?: string | RegExp;
  flags?: string;
  placeholder?: string;                 // guide character, or a full guide string e.g. "DD/MM/YYYY"
  tokens?: Record<string, RegExp | string | MaskToken>;
  case?: 'upper' | 'lower';
  complete?: string | ((raw: string, value: string, ctrl: Masker) => boolean);
  validate?: (raw: string, value: string, ctrl: Masker) => string;   // returns a validity message, or ''
  accept?: (candidate: string, ctrl: Masker) => boolean;             // free-form filter mode (no `mask`)
  prepare?: (char: string, before: string, after: string, ctrl: Masker) => string; // e.g. auto-insert '.' for IP
  format?: string;                      // date/time token format, used by the date/time/datetime presets
  inputmode?: string;
  validity?: boolean;                   // false disables the built-in custom validity message
}

type MaskPreset =
  | 'date' | 'time' | 'datetime' | 'phone-us' | 'card' | 'cvc' | 'expiry'
  | 'iban' | 'ip' | 'mac' | 'postcode-us' | 'ssn' | 'hex-color';

declare class Masker {
  readonly el: HTMLInputElement | HTMLTextAreaElement;
  readonly value: string;
  readonly unmasked: string;
  readonly complete: boolean;
  set(value: string, fire?: boolean): this;
  update(opts: MaskOptions | MaskPreset | string): this;
  unmask(): string;
  toDate(): Date | null;
  destroy(): void;
}

interface OrionMask {
  (target: string | Element, opts?: MaskOptions | MaskPreset | string | RegExp): Masker | null;
  get(target: string | Element): Masker | null;
  unmask(target: string | Element): string;
  format(value: string, opts: MaskOptions | MaskPreset | string): string;
  presets: Record<MaskPreset, (opts: MaskOptions) => MaskOptions>;
  tokens: Record<string, MaskToken>;
  cardType(n: string): 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'maestro' | '';
  luhn(n: string): boolean;
  iban(v: string): boolean;
  dateParts(fmt: string): unknown[];
}

// on the global Orion object:
interface Orion { mask: OrionMask }
```

## Events

| Event | Detail | Fires on |
|---|---|---|
| `o-mask-complete` | `{ value, unmasked, cardType }` | the masked `<input>`, once the pattern becomes complete |

## Also in this folder

- `data-o-counter` / `data-o-autosize` — see [`../counter/README.md`](../counter/README.md) (character counter and
  textarea autosize ship in the `counter` folder but are documented together on the Input mask docs page).
