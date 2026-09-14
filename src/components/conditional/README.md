# conditional

Show, hide, enable or require parts of a form based on other fields' values — a small attribute-driven
expression engine used directly (`data-o-show-if`) or programmatically by `formbuilder`, `wizard` and
`survey`. Docs: `docs/components/dynamic-forms.html` (a "Skip logic" / conditional-visibility section).

## Files

| File | Contents |
|---|---|
| `conditional.js` | Expression tokenizer/parser, DOM value reader, the 4 behaviors, `Orion.conditional` |

## Attributes

```html
<div data-o-show-if="country=MY">…</div>
<div data-o-hide-if="agree checked">…</div>
<input data-o-enable-if="plan=pro">
<div data-o-require-if="type=company && vat notEmpty || country in:MY,SG">…</div>
```

- Operators: `=` `==` `!=` `>` `<` `>=` `<=` `in:a,b` `not in:a,b` (also `!in:`), `checked` / `unchecked`,
  `empty` / `notEmpty` (aliases `blank`/`filled`), and a bare field name for "truthy".
- `&&` binds tighter than `||`; parentheses and a leading `!` (negation) are supported.
- Field names resolve against the closest `<form>` / `[data-o-scope]` (or `document.body`); inside an
  `<o-repeater>` row, a bare name first matches the sibling field in the same row (`items[0][name]`).
- **Show/hide**: the element is disabled while hidden (excluded from `Orion.serialize` and validation) and
  animated with `collapse()`. **Enable**: toggles `disabled`/`aria-disabled` + `.is-disabled`. **Require**:
  toggles the `required` property on every control inside and `.is-required` on its first `.o-label`.
- Fires `o-condition` on the target: `{ kind: 'show', shown }` / `{ kind: 'enable', on }` / `{ kind: 'require', on }`.

## `Orion.conditional`

```ts
type Cond = string
  | { field: string; op?: '='|'!='|'>'|'<'|'>='|'<='|'in'|'notIn'|'empty'|'notEmpty'|'checked'|'contains'; value?: any }
  | Cond[]                                    // implicit AND
  | { all: Cond[] } | { any: Cond[] }
  | ((values: object) => boolean);

const conditional: {
  parse(expr: string): AstNode;
  evaluate(expr: string, source: Element | object, from?: Element): boolean;      // element -> reads live DOM values
  test(cond: Cond, values: object): boolean;                                       // plain-object values
  watch(el: Element, conds: { showIf?; hideIf?; enableIf?; requireIf?: Cond }, root?: Element): () => void;
  refresh(root?: Element): void;              // re-run every condition (after programmatic value changes)
};
```

Multiple conditions can target the same element (e.g. `showIf` + `requireIf`); each is independent and
composes correctly (reference counting so two behaviors both disabling the same control don't fight).
