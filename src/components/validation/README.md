# validation

Form validation engine: a rule-string mini-language, live (blur/input/submit/dirty) validation, async/remote
rules, an error summary, focus management, and `Orion.serialize()` / `Orion.fill()` used by every other forms
package (formbuilder, repeater, wizard, autosave). Docs: `docs/components/validation.html`.

## Files

| File | Contents |
|---|---|
| `10-serialize.js` | `Orion.serialize`/`fill`/`formFields`, name parsing (`a[b][c]`, `tags[]`), `labelOf`/`displayValue` |
| `20-rules.js` | The rule registry, `parseRules`, all built-in rules, message interpolation |
| `30-validator.js` | The `Validator` class, `Orion.validate()`, the `data-o-validate` behavior |
| `validation.css` | Error summary, async "checking…" state |

## `Orion.validate(form, options)`

```ts
interface ValidateOptions {
  rules?: Record<string, string | any[]>;               // per-field extra rules (name -> rule string/array)
  messages?: Record<string, string | Record<string, string>>;
  live?: 'blur' | 'input' | 'submit' | 'dirty';          // default 'blur'
  summary?: boolean | string | Element;                  // error summary; a selector/element hosts it
  success?: boolean;                                      // add .is-valid / .o-valid-msg on success
  scrollToError?: boolean;                                // default true
  focusInvalid?: boolean;                                 // default true
  remoteDelay?: number; inputDelay?: number;               // debounce ms (450 / 160)
  remote?(url: string, ctx: { value: any; name: string; field: Element; form: Element; signal?: AbortSignal }): Promise<boolean | string | { valid: boolean; message?: string }>;
  onSubmit?(data: object, form: Element): Promise<void | { errors: Record<string, string | string[]> }>;
  onInvalid?(errors: Record<string, string>, form: Element): void;
  resetOnSuccess?: boolean;
}
interface Validator {
  validate(scope?: Element | string | string[], opts?: { submit?: boolean; focus?: boolean }): Promise<boolean>;
  validateField(name: string): Promise<boolean>;
  errors: Record<string, string>;                         // getter
  valid: boolean;                                          // getter
  setErrors(errors: Record<string, string | string[]>, opts?: { focus?: boolean }): void;
  focusField(name: string): void;
  clear(): void; reset(): void; destroy(): void;
}
function validate(root: Element | string, opts?: ValidateOptions): Validator;   // one instance per root; re-calling merges opts
validate.rule(name: string, fn: RuleFn, message?: string | ((params, ctx) => string), opts?: { always?: boolean }): typeof validate;
validate.get(el: Element | string): Validator | null;
validate.rules(): string[];
validate.parse(input: string | any[] | object | Function): [string | Function, any[]][];
validate.check(value: any, rules: string | any[], opts?: { label?: string }): Promise<string | null>;
validate.remote(url: string, ctx): Promise<any>;           // default GET ?field=value implementation
```

`RuleFn = (value, params: string[], el: Element, form: Element, ctx: RuleContext) => boolean | string | Promise<boolean | string> | { valid: boolean; message?: string }`.
`RuleContext`: `{ value, label, kind: 'string'|'number'|'date', hasField(name), other(name), otherLabel(name), remote(url, value), values(): object, params: object }`.

### Declarative

```html
<form data-o-validate data-o-live="input" data-o-summary data-o-onsubmit="mySubmitFn">
  <input name="email" data-o-rules="required|email|remote:/api/check-email" data-o-messages='{"required":"We need this"}'>
</form>
```

### Rule tokens (`data-o-rules="a|b:1,2"`)

`required` `accepted` `required_if:field[,values]` `required_with:field[,…]` `email` `url` `number`/`numeric`
`integer` `alpha` `alphanum` `alpha_dash` `digits[:n]` `phone` `min:n` `max:n` `between:a,b` `minlength:n`
`maxlength:n` `same:field` `different:field` `pattern:/regex/flags` `date` `before:ref` `after:ref`
`before_or_equal:ref` `after_or_equal:ref` `in:a,b` `not_in:a,b` `filesize:2mb` `filetype:image/*,.pdf`
`dimensions:min_width=100,ratio=16/9` `remote:url|globalFnName`. `ref` in date rules accepts `today`/`now`/
`tomorrow`/`yesterday`, an ISO date, or another field's name. `min`/`max`/`between` adapt their message to
string length, array item count, number or date automatically.

Native constraint attributes (`required`, `type=email|url|number`, `minlength`, `maxlength`, `pattern`, `min`/
`max` on numbers/dates, `accept` on files) are read automatically — you don't need `data-o-rules` for those.
Works with any Orion form-associated custom element (anything exposing `value`/`checkValidity`).

### Events (on the form/root)

`o-invalid { errors, fields }` · `o-valid {}` · `o-submit { data, form }` (cancelable, only when no `onSubmit`
is set) · `o-submitted { data, result? , native? }`.

### CSS / attributes applied

`.o-field.is-invalid` (or `.is-invalid` directly on the control(s) if there's no `.o-field`), `.o-error`
(auto-created if missing), `.o-validation-summary`, `aria-invalid`, `aria-describedby` (merges with any
`.o-help`), `is-validating` while an async/remote rule runs.

## `Orion.serialize` / `Orion.fill` (`O.formUtil`)

```ts
function serialize(root: Element | string, opts?: { disabled?: boolean; files?: boolean; exclude?: string[] }): object;
function fill(root: Element | string, data: object, opts?: { events?: boolean }): void;
function formFields(root: Element, opts?: { buttons?: boolean }): Element[];   // named controls, DOM order
```

Names use the `user[address][city]` / `tags[]` / `items[0][name]` convention throughout the whole forms
system (repeater, wizard review, formbuilder). Checkbox groups and multi-selects become arrays; a lone
checkbox becomes `true`/`false` (or its `value` attribute); numbers/ranges become `Number`; files become
`File`/`File[]`; Orion custom fields use `.value` as-is.
