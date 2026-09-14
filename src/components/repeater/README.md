# repeater

`<o-repeater>`: repeatable groups of fields (work experience, line items, emergency contacts…) cloned from a
`<template>`, with automatic name re-indexing, drag/keyboard reordering, and min/max limits. Depends on
`validation` for `Orion.formUtil` (serialize/fill). Docs: `docs/components/dynamic-forms.html`.

## Files

| File | Contents |
|---|---|
| `repeater.js` | `<o-repeater>` |
| `repeater.css` | Row card, drag handle, actions, empty state, container-query responsive collapse |

## Usage

```html
<o-repeater name="experience" min="1" max="10" add-text="Add position" item-label="Position {n}" sortable>
  <template>
    <div class="o-field"><label class="o-label" for="company">Company</label><input class="o-input" id="company" name="company"></div>
    <input name="skills[]" ...>
    <span data-o-row-number></span>
  </template>
</o-repeater>
```

Every `[name]` inside the template is re-written to `experience[0][company]`, `experience[1][company]`, …
on every add/remove/reorder (nested names like `a[b]` are preserved as `experience[0][a][b]`). `id`s and any
attribute that references one (`for`, `aria-*`, `list`, `data-o-error-for`) are made unique per row
automatically, so labels/validation keep working inside each row.

```ts
class ORepeater extends OElement {
  name: string;            // default 'items'
  min: number; max: number; initial: number | null;
  sortable: boolean; duplicable: boolean;      // attribute `duplicate`; default true (the prop is not named `duplicate` because that is the method)
  addText?: string; emptyText?: string; itemLabel?: string;   // itemLabel supports {n}
  value: object[];         // get/set the whole list (array of row data)
  texts?: Record<string, string>;

  readonly rows: HTMLElement[]; readonly count: number;
  add(data?: object, index?: number, opts?: { focus?: boolean }): HTMLElement | null;
  remove(index: number): Promise<boolean>;
  duplicate(index: number): HTMLElement | null;
  move(from: number, to: number, opts?: { focus?: boolean }): void;
  getValue(): object[]; setValue(list: object[], opts?: { silent?: boolean }): void;
  clear(): void;
}
```

Events: `o-before-add` / `o-add { row, index }` (before-add is cancelable), `o-before-remove` / `o-remove
{ index, data }`, `o-sort { from, to }`, `o-change { value }`.

Keyboard: `Alt+ArrowUp` / `Alt+ArrowDown` anywhere in a row moves it (when `sortable`); `ArrowUp`/`ArrowDown`
on the drag handle itself doesn't need Alt. The handle is also pointer-draggable. Add/remove/duplicate/move
buttons and the "N of max" counter get accessible labels and are announced via `announce()`.
