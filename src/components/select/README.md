# select — `<o-select>`, `<select data-o-select>`, `Orion.Listbox`, `Orion.pickers`

Searchable single / multiple select with chips or a count, groups, icons, avatars, descriptions, remote search
with infinite scroll, virtual scrolling (10k+ options), creatable tags, custom templates and native form participation.
This folder also holds the infrastructure shared by the whole *pickers* package (autocomplete, timepicker,
datepicker and daterange declare `// @deps` on it).

Files: `10-listbox.js` (Listbox + `Orion.pickers`), `20-select.js` (`<o-select>`), `30-native.js` (behavior), `select.css`.

## Types

```ts
interface PickerOption {            // normalized option (what callbacks and events receive)
  value: string; label: string; description?: string; icon?: string; avatar?: string | boolean;
  disabled?: boolean; group?: string; raw: unknown /* your original item */; create?: boolean;
}
type OptionInput = string | number | { value?: any; id?: any; label?: string; name?: string; text?: string;
  description?: string; icon?: string; avatar?: string | boolean; disabled?: boolean; group?: string; [k: string]: any };
type SourceFn = (query: string, ctx: { page: number; signal: AbortSignal }) =>
  OptionInput[] | { options: OptionInput[]; hasMore?: boolean; total?: number } | Promise<…same…>;
type RenderFn = (option: PickerOption, ctx: { query: string; selected: boolean; disabled: boolean }) => string | Node;

interface OSelectElement extends HTMLElement {           // extends Orion FormElement
  value: string | string[] | OptionInput | OptionInput[] | null;
  name: string; disabled: boolean; required: boolean; readonly: boolean;
  multiple: boolean;                     // attr multiple
  tags: boolean;                         // free-form tags (multiple + creatable, inline typing)
  options: OptionInput[];                // attr JSON; combined with <option>/<optgroup> children
  placeholder?: string;
  searchable: boolean | null;            // null/absent = auto (> 8 options, remote or creatable)
  display: 'chips' | 'count';
  clearable: boolean; creatable: boolean; max?: number;
  size?: 'sm' | 'lg';
  source?: SourceFn;
  url?: string;                          // '{q}' / '{page}' placeholders; without {q}: fetched once, filtered locally
  fields?: { value?: string; label?: string; description?: string; icon?: string; avatar?: string; group?: string; disabled?: string };
  debounce: number;                      // 250
  minChars: number;                      // attr min-chars, 0
  renderOption?: RenderFn;               // attr render-option (global function name)
  renderValue?: (option: PickerOption, ctx: { chip: boolean }) => string | Node;
  selectAll: boolean;                    // attr select-all, default true
  hideSelected: boolean;                 // attr hide-selected
  closeOnSelect: boolean | null;         // default: !multiple
  virtualThreshold: number;              // attr virtual-threshold, 150
  texts?: Partial<Record<'placeholder'|'search'|'noResults'|'noOptions'|'loading'|'loadingMore'|'error'|'retry'|'create'|'selectAll'|'clearAll'|'clear'|'remove'|'selected'|'max'|'results'|'minChars', string>>;
  readonly selectedOption: PickerOption | null;
  readonly selectedOptions: PickerOption[];
  readonly query: string;
  open(): void; close(reason?: string): void; toggle(): void;
  clear(emit?: boolean): void; focus(): void;
  setOptions(list: OptionInput[]): this; addOption(o: OptionInput | OptionInput[]): this; removeOption(value: string): this;
  getOption(value: string): PickerOption | null; refresh(): this;
  checkValidity(): boolean; reportValidity(): boolean; setCustomValidity(msg: string): void;
}
interface OSelectEvents {
  'o-change': CustomEvent<{ value: string | null; option: PickerOption | null } | { value: string[]; options: PickerOption[] }>;
  'o-search': CustomEvent<{ query: string }>;
  'o-before-open': CustomEvent<void>;    // cancelable
  'o-open': CustomEvent<void>; 'o-close': CustomEvent<{ reason: 'escape' | 'outside' | 'tab' | 'api' | 'parent' }>;
  'o-create': CustomEvent<{ value: string; label: string }>;   // cancelable, detail is writable
  'o-load': CustomEvent<{ query: string; page: number; options: PickerOption[] }>;
  'o-error': CustomEvent<{ error: unknown; query: string }>;
}
```
Native `input` / `change` are also fired from the host on user changes. Form value: string, or one entry per value when multiple.

### `<select data-o-select>`
`data-o-select` may hold a JSON object of `<o-select>` props; `data-o-select-<prop>` attributes also work.
A leading `<option value="">` becomes the placeholder. `select.oSelect` is the generated element.

## Shared API (`Orion.Listbox`, `Orion.pickers`)

```ts
class Listbox {
  constructor(el: HTMLElement, o?: { multiple?: boolean; threshold?: number; virtual?: boolean; overscan?: number; highlight?: boolean;
    homeEnd?: boolean; tick?: boolean; activeTarget?: HTMLElement | (() => HTMLElement);
    isSelected?(o: PickerOption): boolean; isDisabled?(o: PickerOption): boolean; renderOption?: RenderFn;
    onPick?(o: PickerOption, e: Event): void; onActive?(o: PickerOption | null, i: number): void; onEnd?(): void });
  setItems(options: PickerOption[], o?: { query?: string; active?: 'first' | 'selected' | 'keep' | 'none'; keepScroll?: boolean }): this;
  render(): void; paint(): void; handleKey(e: KeyboardEvent): boolean;
  move(delta: number): void; first(): void; last(): void; setActive(rowIndex: number, o?: { scroll?: boolean; center?: boolean }): void;
  syncTarget(): void; scrollTo(rowIndex: number, center?: boolean): void;
  readonly activeOption: PickerOption | null; readonly options: PickerOption[]; readonly count: number; virtual: boolean;
}
declare const pickers: {
  normalize(item: OptionInput, fields?: object): PickerOption;
  mediaHTML(o: PickerOption, size?: 'xs' | 'sm'): string;
  openPanel(owner: HTMLElement, panel: HTMLElement, anchor: HTMLElement, o?: { sheet?: boolean; placement?: string;
    matchWidth?: false | 'min' | 'exact'; offset?: number; returnFocus?: boolean; onClose?(reason: string): void }): { close(reason?: string): void; readonly open: boolean };
  isSheet(): boolean;                     // viewport ≤ 575.98px → bottom sheet
  syncLabel(host: HTMLElement, target: HTMLElement): void;
  Remote: new (get: () => { source?: SourceFn; url?: string; fields?: object }) => { load(q: string, page?: number): Promise<{ options: PickerOption[]; hasMore: boolean; total: number | null }>; abort(): void; clear(): void };
  // added by other folders of the package:
  time: TimeUtil;                         // timepicker
  disabledFn(v: any): ((d: Date) => boolean) | null; highlightFn(v: any): ((d: Date) => any) | null;   // datepicker
};
```

CSS: `--o-select-max-h`, `--o-listbox-row-h`; shared classes `.o-listbox-*`, `.o-picker-backdrop`, `.o-floating.is-sheet`.
