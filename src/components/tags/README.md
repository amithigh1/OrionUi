# tags

`<o-tags>` — a chip-list input: type-to-add, paste-to-split, suggestions (static or async), drag reorder and inline
edit. Form-associated.

## Usage

```html
<o-tags name="skills" value='["js","css"]' suggestions='["html","css","js","go"]' max="8"></o-tags>
```

```js
const tags = document.querySelector('o-tags');
tags.source = async q => (await fetch(`/api/search?q=${q}`)).json();
tags.add('typescript');
```

## Types

```ts
interface TagSuggestion { value: string; label: string; color?: string }

interface OTagsProps {
  value: string[];
  placeholder?: string;
  max?: number;
  allowDuplicates?: boolean;
  pattern?: string;                                  // regex source, tags must match
  suggestions: Array<string | TagSuggestion>;
  source?: (query: string) => Promise<Array<string | TagSuggestion>>;   // property only
  strict?: boolean;                                  // only accept values from suggestions/source
  separator?: string;                                // join into one form field; default: one entry per tag
  delimiters: string;                                 // default ",;" (plus Enter/Tab)
  minChars: number;                                   // default 1
  maxLength?: number;
  transform?: 'lower' | 'upper';
  colorFor?: (tag: string) => string | undefined;     // property only
  colors: Record<string, string>;                     // tag text -> semantic name | CSS color
  editable: boolean;                                  // default true
  sortable: boolean;                                  // default true
  size?: 'sm' | 'lg';
  name?: string; required?: boolean; disabled?: boolean; readonly?: boolean;
  texts?: Record<string, string>;
}

declare class OTags extends HTMLElement implements OTagsProps {
  // ...OTagsProps
  readonly tags: string[];
  add(tag: string | string[]): number;      // returns the number actually added
  remove(tag: string | number): void;
  clear(): void;
  open(): void;
  close(): void;
  focus(opts?: FocusOptions): void;
}

interface Orion { Tags: typeof OTags }
declare global { interface HTMLElementTagNameMap { 'o-tags': OTags } }
```

## Events

| Event | Detail |
|---|---|
| `o-add` | `{ tag }` — cancelable |
| `o-remove` | `{ tag, index }` — cancelable |
| `o-change`, `input`, `change` | `{ value }` |

## Keyboard

Enter/,/Tab adds · Backspace on an empty field removes the last tag · ←/→ moves between chips (RTL-aware) ·
Alt+←/→ reorders · Delete/Backspace on a chip removes it · Enter/F2 edits it · ↓ opens suggestions.
