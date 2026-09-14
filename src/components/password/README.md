# password

Behaviors for a native `<input type="password">`: show/hide toggle, secure generator, Caps Lock hint, and a
pattern-aware strength meter. The input stays the real form field.

## Usage

```html
<div class="o-input-wrap"><input type="password" data-o-password-toggle data-o-password-generate="16"></div>
<input type="password" data-o-strength data-o-strength-rules="length:12,upper,lower,number,symbol,common,repeat" data-o-strength-min="2">
```

```js
Orion.password.strength('hunter2');      // -> StrengthResult
Orion.password.generate({ length: 20 }); // -> string
Orion.password.toggle(el, true);
Orion.password.refresh(el);
```

## Types

```ts
interface StrengthRules {
  length?: number;
  upper?: boolean; lower?: boolean; number?: boolean; symbol?: boolean; common?: boolean; repeat?: boolean;
}

interface StrengthOptions {
  rules?: string | StrengthRules;   // e.g. "length:12,upper,lower,number,symbol,common,repeat"
  userInputs?: string[];            // values (name, email…) that are penalised if reused in the password
}

interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;                    // '' | 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong'
  entropy: number;                  // bits
  crackSeconds: number;             // rough offline-attack estimate
  checks: Record<'length' | 'upper' | 'lower' | 'number' | 'symbol' | 'common' | 'repeat', boolean>;
  rules: StrengthRules;
  suggestions: string[];
  patterns: Array<'common' | 'word' | 'personal' | 'sequence' | 'keyboard' | 'repeat' | 'date'>;
}

interface GenerateOptions {
  length?: number;            // default 16
  lower?: boolean; upper?: boolean; numbers?: boolean; symbols?: boolean;   // default true
  excludeSimilar?: boolean;   // drop look-alike characters (il1Lo0O...)
}

interface OrionPassword {
  strength(pw: string, opts?: StrengthOptions): StrengthResult;
  generate(opts?: number | GenerateOptions): string;
  toggle(target: string | Element, show?: boolean): void;
  refresh(target: string | Element): void;
  common: string[];   // the common-password wordlist used by strength()
}

interface Orion { password: OrionPassword }
```

## Attributes

| Attribute | Description |
|---|---|
| `data-o-password-toggle` | Adds the show/hide button. |
| `data-o-password-generate="16" \| '{...}'` | Adds the generate button; number sets length, or pass JSON `GenerateOptions`. |
| `data-o-strength` | Renders the strength meter + checklist. |
| `data-o-strength-rules` | Comma list, see `StrengthRules`. |
| `data-o-strength-min` | Minimum acceptable score (0-4). |
| `data-o-strength-checklist="false"` | Hide the rules list. |
| `data-o-strength-target="#el"` | Render the meter elsewhere. |
| `data-o-strength-user="#name,#email"` | Selectors whose values penalise reused text. |
| `data-o-capslock="false"` | Disable the Caps Lock hint for a field. |

## Events

| Event | Detail |
|---|---|
| `o-password-toggle` | `{ visible: boolean }` |
| `o-password-generate` | `{ value: string }` |
| `o-strength` | `StrengthResult`, fired when the score changes |
