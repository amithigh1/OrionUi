# querybuilder — `<o-query-builder>`

A nested AND/OR/NOT visual rule builder with type-aware operators and value editors, a compact
search-bar query language, and four export formats (parameterized SQL, MongoDB, a human sentence,
and a JS predicate). No third-party code.

Docs: `docs/components/query-builder.html`. Files: `00-model.js` (field/operator metadata, tree
node constructors, validation, tree-walking helpers), `10-output.js` (`toSQL`/`toMongo`/`toString`/
`toPredicate`), `20-parser.js` (the search-bar tokenizer/parser), `30-element.js` (the element),
`querybuilder.css`.

```html
<o-query-builder fields='[
  {"key":"status","label":"Status","type":"select","options":["Active","Pending","Closed"]},
  {"key":"age","label":"Age","type":"number"}
]'></o-query-builder>
```
```js
const qb = document.querySelector('o-query-builder');
qb.addEventListener('o-change', () => {
  rows = allRows.filter(qb.toPredicate());          // client-side
  const { sql, params } = qb.toSQL({ dialect: 'postgres' });  // server-side (parameterized)
});
```

## Tree shape (`value`)

```ts
type Node = Group | Rule;
interface Group { id: string; type: 'group'; op: 'and' | 'or'; not: boolean; children: Node[]; }
interface Rule  { id: string; type: 'rule'; field: string; operator: string; value: any; not: boolean; }
```
`value` always normalizes to this shape when set (ids are filled in automatically, so you can hand
it a plain object without ids — e.g. `{ type: 'group', op: 'and', children: [...] }` — from outside).

## Field definition (`fields`)

```ts
interface FieldDef {
  key: string; label?: string; type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'array';
  options?: Array<string | { value: string; label: string }>;   // select / array
  min?: number; max?: number; step?: number;                     // number
  placeholder?: string;
}
```

## Operators by type

| Type | Operators |
|---|---|
| `text` | `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `endsWith`, `isEmpty`, `isNotEmpty`, `matchesRegex` |
| `number` | `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `between`, `notBetween` (`between`/`notBetween` take a `[from, to]` value) |
| `date` | `on`, `before`, `after`, `between`, `inLastNDays` (value = a day count), `thisWeek`, `thisMonth`, `thisYear` |
| `boolean` | `isTrue`, `isFalse` (no value) |
| `select` | `in`, `notIn` (value = `string[]`) |
| `array` | `containsAny`, `containsAll`, `containsNone` (value = `string[]`) |

Value editors use `<o-datepicker>` (date) and `<o-select multiple>` (select/array, when `options`
are given) when those Orion packages are loaded, else a native `<input type="date">` / `<select
multiple>` / comma-separated text input.

## Properties

| Prop | Type | Default | Notes |
|---|---|---|---|
| `value` | `Group` | an empty AND group | |
| `fields` | `FieldDef[]` | `[]` | |
| `maxDepth` | `number` | `5` | Hides "Add group" at the deepest allowed level. |
| `mode` | `'builder' \| 'bar'` | `'builder'` | Reflected attribute; switching to `'bar'` renders the tree as search-bar text (best effort — see `treeToQueryString`), switching back re-parses it. |
| `dialect` | `'ansi' \| 'postgres' \| 'mysql'` | `'ansi'` | Default for `toSQL()`: `postgres` uses `$1,$2,…` placeholders, `mysql` quotes identifiers with backticks, `ansi` uses `?` and double quotes. |
| `name`, `disabled`, `required`, `readonly` | | | It's a `FormElement`; `required` means "at least one rule". |

## Methods

| Method | Returns | |
|---|---|---|
| `toSQL({ dialect? })` | `{ sql: string, params: any[] }` | Always parameterized — values are bound as params, **never** string-concatenated. |
| `toMongo()` | `object` | A MongoDB query filter document. |
| `toString()` | `string` | A human sentence, e.g. `status is any of "Active" and age > 30`. |
| `toPredicate()` | `(row) => boolean` | Reads nested paths via dot-notation (`user.name`). |
| `fromJSON(json)` | `this` | Accepts an object or a JSON string; normalizes and re-renders. |

`Orion.qb` also exposes the same builders as plain functions for use without an element instance
(handy for server code or unit tests): `Orion.qb.toSQL(tree, fields, opts)`, `.toMongo(tree, fields)`,
`.toString(tree, fields)`, `.toPredicate(tree, fields)`, `.parseQueryString(text)`,
`.parseToTree(text, fields)`, `.treeToQueryString(tree, fields)`, `.rule(overrides)`,
`.group(overrides)`, `.normalize(node)`, `.operators(fieldType)`.

## The `_text` free-text field

A bare word, a `"quoted phrase"`, or an explicit `_text:"…"` in the search bar always produces a
rule with `field: '_text'`. It doesn't need to appear in `fields`: `toPredicate`/`toSQL`/`toMongo`
search across every declared `type: 'text'` field (OR'd together), or — if none are declared — the
whole row (`toPredicate`) or a literal `_text` column (`toSQL`/`toMongo`, for backends with a
dedicated search column).

## Search-bar query language

```
status:active age>30 "exact phrase" -excluded
```
- `key:value`, `key:"quoted value"`, `key>value`, `key>=value`, `key<value`, `key<=value`, `key!=value`
  target a field; the concrete operator is resolved from that field's `type` in `fields` (e.g. `:`
  becomes `in` for a `select` field, `eq` for `number`, `on` for `date`, `equals` for `text`) — with
  no matching field, `text` semantics are assumed.
- A bare word or a quoted phrase with no `key:` prefix becomes a free-text `contains` rule (see above).
- A leading `-` negates any token (`-excluded`, `-status:closed`).
- All top-level conditions are AND-joined (the compact language has no OR/nesting — build those in
  the visual builder, or post-process the returned tree).

## Events

| Event | `detail` |
|---|---|
| `o-change` | `{ value }` — also native `input`/`change` fire on the host (`FormElement`). |

## Keyboard & drag

Rows and groups (depth > 0) are `draggable` (pointer drag-and-drop, including a visual before/after
drop indicator); their grip handle is also a `tabindex="0"` button that responds to `Alt+ArrowUp`/
`Alt+ArrowDown` to reorder among siblings without a pointer. Add/remove/duplicate/NOT/AND-OR are all
plain buttons, reachable by `Tab`.

## Notes & limits

- `array`/`containsAll` in `toSQL` is approximated as `col LIKE '%v1%' AND col LIKE '%v2%' AND …`
  (SQL has no portable array-contains operator); adjust for your schema (e.g. a real array/JSON
  column) if needed — the params are still fully bound, never concatenated.
- The search-bar language is intentionally small (flat AND only); it's meant as a fast typed
  shortcut for common filters, not a replacement for the full nested builder.
