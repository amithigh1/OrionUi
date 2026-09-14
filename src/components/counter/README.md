# counter

Two independent behaviors for plain `<input>`/`<textarea>` elements: a character/word counter, and textarea autosize.

## Usage

```html
<textarea class="o-textarea" data-o-counter maxlength="200"></textarea>
<input data-o-counter data-o-counter-max="60" data-o-counter-mode="words" data-o-counter-warn="10">
<textarea data-o-autosize="8" rows="2"></textarea>
```

```js
Orion.counter.count('two words', 'words');   // -> 2
Orion.counter.refresh(el);                    // force a counter to re-evaluate
Orion.autosize(el);                           // force a textarea to refit (after setting .value in code)
```

## Types

```ts
interface OrionCounter {
  count(text: string, mode?: 'chars' | 'words'): number;
  refresh(target: string | Element): void;
}

interface Orion {
  counter: OrionCounter;
  autosize(target: string | Element): void;
}
```

## Attributes

| Attribute | Description |
|---|---|
| `data-o-counter` | Enable the counter; reads `maxlength` automatically, or use `data-o-counter-max`. |
| `data-o-counter-mode` | `chars` (default) \| `words` \| `remaining`. |
| `data-o-counter-max` | Overrides `maxlength` as the limit. |
| `data-o-counter-warn` | Absolute count or `"N%"` — when the near-limit color kicks in. |
| `data-o-counter-target="#el"` | Render the counter into an existing element instead of after the field. |
| `data-o-autosize="N"` | Grow a `<textarea>` up to `N` rows (no cap if omitted; `rows` sets the minimum). |

Over a `data-o-counter-max` limit with no native `maxlength`, the field gets a custom validity error until edited back
under the limit.
