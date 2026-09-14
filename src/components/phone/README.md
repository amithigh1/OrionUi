# phone

`<o-phone>` — a phone number input with a searchable country selector, live formatting and a normalised E.164 value.
Form-associated (extends `FormElement`).

## Usage

```html
<o-phone name="mobile" country="MY" preferred="MY,SG,US" required></o-phone>
```

```js
document.querySelector('o-phone').addEventListener('o-change', e => console.log(e.detail.value)); // "+60123456789"
```

## Types

```ts
interface OPhoneProps {
  value: string;                 // E.164, e.g. "+60123456789"
  country?: string;               // ISO2, default from the current locale's region
  preferred: string[];            // ISO2 codes, or a CSV string attribute
  format: 'national' | 'international' | 'e164';   // default 'national'
  recent: boolean;                 // remember recently picked countries (default true)
  placeholder?: string;
  locale?: string;
  size?: 'sm' | 'lg';
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  texts?: Record<string, string | ((params: Record<string, unknown>) => string)>;
}

interface CountryInfo { iso: string; dial: string; name: string; areas: string[] }

declare class OPhone extends HTMLElement implements OPhoneProps {
  // ...OPhoneProps
  readonly countryInfo: CountryInfo;
  readonly valid: boolean;
  readonly national: string;
  readonly e164: string;
  open(): void;
  close(): void;
  clear(): void;
  setCountry(iso: string, user?: boolean): void;
  focus(opts?: FocusOptions): void;
  checkValidity(): boolean;
  reportValidity(): boolean;
}

interface OrionPhone {
  parse(text: string, iso?: string): { country: string; dial: string; national: string; e164: string; valid: boolean };
  format(value: string, style?: 'national' | 'international' | 'e164', iso?: string): string;
  validate(value: string, iso?: string): boolean;
  countries: CountryInfo[];
  country(iso: string): CountryInfo | null;
  name(iso: string, locale?: string): string;
  flag(iso: string): string;   // emoji, or the ISO code on platforms without flag glyphs (e.g. Windows)
}

interface Orion { phone: OrionPhone; Phone: typeof OPhone }

declare global { interface HTMLElementTagNameMap { 'o-phone': OPhone } }
```

## Events

| Event | Detail |
|---|---|
| `input`, `change` | native, mirrored from the internal field |
| `o-change` | `{ value, country, valid }` |
| `o-country` | `{ country }` — fired when the country changes (typed, pasted or picked) |

## Keyboard

Country button: Enter/Space/↓ opens; typing a character opens + searches; ↑/↓, Home/End, Page Up/Down move; Enter picks;
Esc closes.
