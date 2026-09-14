# formbuilder

`<o-form>`: renders a full, validated form from a JSON schema. Renders Orion custom elements (`<o-select>`,
`<o-datepicker>`, `<o-upload>`, `<o-range>`, `<o-colorpicker>`, `<o-rating>`, `<o-tags>`, `<o-phone>`,
`<o-number>`, `<o-daterange>`, `<o-timepicker>`) when they're registered, with native fallbacks otherwise.
Depends on `validation` (per-field rules), `conditional` (showIf/hideIf/enableIf/requiredIf) and `repeater`
(the `repeater` field type). Docs: `docs/components/dynamic-forms.html`.

## Files

| File | Contents |
|---|---|
| `10-fields.js` | The field-type registry (`Orion.form.registerField`) and every built-in renderer |
| `20-form.js` | `<o-form>`, `Orion.form()`, schema layout/sections/conditions/computed/async-options wiring |
| `formbuilder.css` | `.o-dform-*` grid, groups, sections, range/star/html field styling |

## Schema

```ts
interface FormSchema {
  fields: FieldDef[];
  layout?: { columns?: number; sections?: { title?: string; description?: string; fields: string[]; columns?: number }[] };
  columns?: number;                                    // shorthand for layout.columns
  submitText?: string; resetText?: string; actions?: boolean;   // actions:false hides the Submit/Reset row
  live?: 'blur' | 'input' | 'submit' | 'dirty'; summary?: boolean;
  messages?: Record<string, Record<string, string>>;
}
interface FieldDef {
  name: string; type?: FieldType;                      // default 'text'
  label?: string; placeholder?: string; help?: string;
  options?: Option[] | ((values: object) => Option[] | Promise<Option[]>);
  dependsOn?: string[];                                // re-fetches async `options` when these fields change
  default?: any; rules?: string | any[]; required?: boolean; messages?: Record<string, string>;
  col?: number;                                        // 1-12 grid span (default 12/columns)
  showIf?: Cond; hideIf?: Cond; enableIf?: Cond; requiredIf?: Cond;
  computed?(values: object): any;                      // read-only, recomputed on every change
  attrs?: Record<string, any>; props?: Record<string, any>; native?: boolean;   // force the native control
  fields?: FieldDef[];                                 // type:'group' | type:'repeater'
  min?: number; max?: number; addText?: string; itemLabel?: string; sortable?: boolean; initial?: number; // repeater
  inline?: boolean;                                    // radio/checkbox groups
}
type FieldType = 'text' | 'email' | 'password' | 'url' | 'tel' | 'search' | 'number' | 'textarea' | 'select' |
  'multiselect' | 'radio' | 'checkboxes' | 'checkbox' | 'switch' | 'date' | 'time' | 'datetime' | 'daterange' |
  'file' | 'range' | 'color' | 'rating' | 'tags' | 'phone' | 'currency' | 'hidden' | 'html' | 'group' | 'repeater';
type Cond = string | { field: string; op?: string; value?: any } | { all?: Cond[] } | { any?: Cond[] } | ((values: object) => boolean);
type Option = string | { value: string; label?: string; disabled?: boolean; description?: string };
```

## `<o-form>` / `Orion.form`

```ts
class OForm extends OElement {
  schema: FormSchema; onSubmit?(data: object, el: OForm): Promise<void | { errors }> | void;
  getData(): object; setData(data: object, opts?: { silent?: boolean }): void;
  validate(): Promise<boolean>; reset(): void; setSchema(schema: FormSchema): void;
  getField(name: string): Element | null;
  readonly validator: Validator | null; readonly form: HTMLFormElement | HTMLDivElement;
}
function form(target: Element | string, schema?: FormSchema, opts?: { onSubmit? }): OForm;
form.registerField(type: string, def: FieldTypeDef): typeof form;
form.types(): string[];
interface FieldTypeDef {
  render(field: FieldDef, ctx: { id, name, form, field, value, options }): Element;
  group?: boolean;      // wrap in <fieldset>/<legend> instead of <div>/<label>
  label?: boolean;       // false: the control renders its own label (e.g. a checkbox)
  wrap?: boolean;        // false: render() already returns the full cell, skip the .o-field wrapper
  getValue?(cell: Element, field: FieldDef): any; setValue?(cell: Element, value: any, field: FieldDef): void;
  out?(raw: any, field: FieldDef): any; in?(value: any, field: FieldDef): any;   // getData/setData transforms
  setOptions?(cell: Element, field: FieldDef, options: Option[]): void;          // for async `dependsOn` refresh
}
```

Events: `o-submit { data }` (cancelable, form-level), `o-change { name, value, values }`, `o-ready {}`.
If `<o-form>` is placed **inside** an existing `<form>`, it renders a `<div>` (not a nested `<form>`) and skips
its own Submit/Reset buttons and validator submit-binding — the outer form drives submission.

`showIf`/`hideIf`/`enableIf`/`requiredIf` compile to `data-o-show-if`/`data-o-hide-if`/`data-o-enable-if`/
`data-o-require-if` attributes when the condition is a string/object (see the `conditional` package); a
function condition is watched programmatically instead (not supported inside repeater rows).

## CSS

`.o-dform-grid` (12-col, container-query responsive), `.o-dform-cell`, `.o-dform-group`, `.o-dform-section`,
`.o-dform-range` / `-slider` / `-stars`, `.o-dform-html`, `.is-computed`.
