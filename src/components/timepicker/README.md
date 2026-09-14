# timepicker — `<o-timepicker>`, `Orion.TimeColumns`, `Orion.pickers.time`

Typed time input with a dropdown list of times or a scroll-spinner columns panel (hours · minutes · seconds ·
AM/PM), or `inline` columns with no input. Follows the locale's 12/24-hour clock unless `hour12` is set,
understands lenient typed input (`"2:30 pm"`, `"1430"`, `"14.30"`, `"2p"`), steps the segment under the caret
with the arrow keys, and submits `HH:mm` (`HH:mm:ss` with `seconds`).

Files: `10-time.js` (`Orion.pickers.time` + `Orion.TimeColumns`), `20-timepicker.js` (`<o-timepicker>`), `timepicker.css`.
`Orion.TimeColumns` is reused by the datetime modes of `datepicker` and `daterange` (`// @deps select`).

```ts
interface TimeValue { h: number; m: number; s: number; }         // 24h hour, 0-23

interface OTimepickerElement extends HTMLElement {    // extends Orion FormElement
  value: string;                          // 'HH:mm' ('HH:mm:ss' with `seconds`), '' when empty
  name: string; disabled: boolean; required: boolean; readonly: boolean;
  hour12?: boolean;                       // attr hour12; default from locale (Orion.date.uses12h()); hour12="false" forces 24h
  step: number;                           // attr step, minutes: list interval (default 15) and column step / ↑↓ step (default 1)
  seconds: boolean;                       // adds a seconds segment / column
  min?: string; max?: string;             // 'HH:mm', inclusive
  view: 'list' | 'columns';               // attr view, default 'list'
  inline: boolean;                        // attr inline, reflected; renders the columns in place (no input)
  placeholder?: string;                   // default: 'hh:mm[:ss] [am]'
  clearable: boolean;                     // default true
  size?: 'sm' | 'lg';
  texts?: Partial<Record<'choose'|'now'|'clear'|'done'|'times'|'invalid'|'min'|'max'|
    'hours'|'minutes'|'seconds'|'period', string>>;
  readonly time: TimeValue | null;
  open(focusPanel?: boolean): void; close(reason?: string): void; toggle(): void;
  clear(emit?: boolean): void; focus(opts?: FocusOptions): void;
  checkValidity(): boolean; reportValidity(): boolean; setCustomValidity(msg: string): void;
}
interface OTimepickerEvents {
  'o-change': CustomEvent<{ value: string; time: TimeValue | null }>;
  'o-before-open': CustomEvent<void>;      // cancelable
  'o-open': CustomEvent<void>; 'o-close': CustomEvent<{ reason: 'escape' | 'outside' | 'tab' | 'api' | 'parent' }>;
}
```
Native `input` / `change` also fire from the host on user changes. Form value: `HH:mm[:ss]` string. Validity:
`required`, `min`/`max` (`rangeUnderflow` / `rangeOverflow`), unparsable typed text (`badInput`).

Keyboard (input): `↑` / `↓` increment/decrement the time segment under the caret (list closed); `Alt+↓` / `F4` /
the clock button open the panel; `Enter` parses typed text and closes. List open: `↑`/`↓`, `PageUp`/`PageDown`
move the active time, `Enter` picks it. Columns: `↑`/`↓` change the focused column's value, `←`/`→` switch
columns (mirrored in RTL), digits jump to a value, `A`/`P` set AM/PM, `Enter` closes.

## `Orion.pickers.time`

```ts
declare const time: {
  uses12h(locale?: string): boolean;
  periods(locale?: string): { am: string; pm: string };             // localized day-period labels
  format(tm: TimeValue | null, o?: { hour12?: boolean; seconds?: boolean; locale?: string }): string;
  parts(tm: TimeValue, o?: { hour12?: boolean; seconds?: boolean; locale?: string }):
    { type: string; value: string; start: number; end: number }[];  // formatToParts with character offsets
  toISO(tm: TimeValue | null, seconds?: boolean): string;            // 'HH:mm' / 'HH:mm:ss'
  fromISO(v: string | Date | { h: number; m: number; s?: number } | null): TimeValue | null;
  /** Lenient typed-time parser: '2:30 pm', '14:30', '1430', '930', '2p', '14.30.15', localized AM/PM markers. */
  parse(str: string, locale?: string): TimeValue | null;
  secs(tm: TimeValue | null): number | null;                        // h*3600 + m*60 + s
};
```

## `Orion.TimeColumns`

```ts
interface TimeColumnsOptions {
  hour12?: boolean; step?: number /* minute column step, 1-60 */; secondStep?: number; seconds?: boolean;
  min?: string; max?: string;             // 'HH:mm', disables out-of-range column cells
  locale?: string;
  onChange?(tm: TimeValue): void;         // user picked/changed a value
  onEnter?(): void;                       // Enter pressed in a column
}
declare class TimeColumns {
  constructor(el: HTMLElement, o?: TimeColumnsOptions);
  value: TimeValue | null;
  configure(o: Partial<TimeColumnsOptions>): this;    // merge options and re-render
  render(): void;
  set(tm: TimeValue | null, scroll?: boolean): this;  // programmatic, no onChange
  reveal(): void;                          // scroll every column to its selected cell (call once visible)
  focus(column?: 'h' | 'm' | 's' | 'p'): void;
}
```

CSS: `--o-tc-h` (column height), `--o-tc-row` (row height), `--o-tc-w` (column width). Parts: `.o-tp-control`,
`.o-tp-panel`, `.o-tp-list` (rows share `.o-listbox-*` with Select), `.o-tp-cols` / `.o-tp-inline`, `.o-tc-col`,
`.o-tc-cell` (`.is-selected`).
