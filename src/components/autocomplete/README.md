# autocomplete — `<o-autocomplete>`

Text input with suggestions (typeahead): local `items` or async `source` / `url`, fuzzy matching with highlighted
matches, groups, templates, inline (ghost) completion, recent searches, free text or `strict` mode.
Depends on `select` (`O.Listbox`, `O.pickers`).

```ts
type ItemInput = string | { value?: any; label: string; description?: string; icon?: string; avatar?: string | boolean;
  group?: string; disabled?: boolean; [k: string]: any };

interface OAutocompleteElement extends HTMLElement {     // extends Orion FormElement
  value: string;                          // typed text (free) or picked item's value (item.value ?? label)
  name: string; disabled: boolean; required: boolean; readonly: boolean;
  items: ItemInput[];                     // attr JSON
  source?: (query: string, ctx: { page: number; signal: AbortSignal }) => ItemInput[] | Promise<ItemInput[]> | Promise<{ options: ItemInput[] }>;
  url?: string;                           // '{q}' placeholder
  fields?: Record<string, string>;
  minChars: number;                       // attr min-chars, 1
  debounce: number;                       // 200
  limit: number;                          // max local results, 10
  strict: boolean;                        // only picked items are accepted; unmatched text reverts on blur
  inline: boolean;                        // ghost completion, Tab / → / End accepts
  recent: boolean; recentKey?: string; recentMax: number;   // attrs recent-key, recent-max (5); localStorage 'orion:autocomplete:<key|id|name>'
  openOnFocus: boolean;                   // attr open-on-focus
  placeholder?: string; icon?: string; clearable: boolean /* true */; size?: 'sm' | 'lg';
  renderItem?: (item: any /* original */, ctx: { query: string; selected: boolean; disabled: boolean }) => string | Node;
  texts?: Partial<Record<'noResults'|'loading'|'error'|'retry'|'recent'|'clearRecent'|'clear'|'suggestions'|'results'|'completion', string>>;
  readonly item: any | null;              // picked item (original object)
  readonly query: string;
  open(): void; close(reason?: string): void; search(query: string): void;
  clear(emit?: boolean): void; clearRecent(): void; focus(): void;
}
interface OAutocompleteEvents {
  'o-input': CustomEvent<{ query: string }>;
  'o-select': CustomEvent<{ item: any; value: string }>;          // item = { label, recent: true } for recent searches
  'o-change': CustomEvent<{ value: string; item: any | null }>;    // committed (pick, Enter, blur)
  'o-before-open': CustomEvent<void>; 'o-open': CustomEvent<void>; 'o-close': CustomEvent<{ reason: string }>;
}
```
Validity: `required`; in strict mode `badInput` while the text does not match a picked item.
CSS: `--o-ac-max-h`; parts `.o-ac-control`, `.o-ac-input`, `.o-ac-ghost`, `.o-ac-panel` (rows use `.o-listbox-*`).
