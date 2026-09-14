# daterange — `<o-daterange>`

Start/end date range picker: two months side by side (one on phones), a live hover/keyboard preview band,
quick presets, minimum/maximum length limits, an apply/cancel footer (or `instant` commit), optional start/end
times and typed start/end inputs. Depends on `datepicker` (`Orion.Calendar`, `O.pickers.disabledFn/highlightFn`)
and uses `<o-timepicker>` for the time-of-day fields.

File: `daterange.js` + `daterange.css` (`// @deps datepicker`).

```ts
type DateLike = string | number | Date;
type PresetInput = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' |
  { label: string; value: [DateLike, DateLike] | { start: DateLike; end: DateLike } | (() => [DateLike, DateLike]) };

interface ODaterangeElement extends HTMLElement {      // extends Orion FormElement
  value: { start: string; end: string } | string | null;   // ISO dates ('YYYY-MM-DDTHH:mm' with `time`); attribute also accepts "start/end"
  name: string;                            // submits "start/end" as one field (ignored if nameStart/nameEnd set)
  nameStart?: string; nameEnd?: string;    // attrs name-start / name-end: submit two fields instead
  required: boolean; disabled: boolean; readonly: boolean;   // required needs both ends
  format?: string;                         // Orion.date tokens; default Orion.date.localePattern() (+ time tokens with `time`)
  min?: DateLike; max?: DateLike;          // inclusive, as in Date Picker
  disabledDates?: DisabledDatesInput;      // attr disabled-dates — same shape as Date Picker
  highlighted?: HighlightInput;            // attr highlighted — same shape as Date Picker
  weekStart?: number; weekNumbers: boolean;   // attrs week-start (0-6), week-numbers
  months: number;                          // attr months, default 2 (forced to 1 on phones)
  presets: boolean | string | PresetInput[];  // attr presets: true (built-in list), a subset of keys, custom objects, or false
  minDays?: number; maxDays?: number;      // attrs min-days / max-days: inclusive range length limits
  instant: boolean;                        // commit as soon as the range (or a preset) is picked, no Apply/Cancel
  time: boolean;                           // adds start/end <o-timepicker> fields (defaults 00:00 -> 23:59)
  hour12?: boolean; step: number;          // attr step, minutes, default 15 — passed to the time pickers
  placeholderStart?: string; placeholderEnd?: string;
  clearable: boolean;                      // default true
  size?: 'sm' | 'lg';
  texts?: Partial<Record<'start'|'end'|'dialog'|'presets'|'today'|'yesterday'|'last7'|'last30'|'last90'|
    'thisWeek'|'thisMonth'|'lastMonth'|'thisYear'|'apply'|'cancel'|'clear'|'startTime'|'endTime'|'days'|
    'pickStart'|'pickEnd'|'minDays'|'maxDays'|'invalid'|'order'|'min'|'max'|'unavailable', string>>;
  readonly start: Date | null; readonly end: Date | null;   // dates of the committed value
  readonly calendar: InstanceType<typeof Orion.Calendar>;
  open(): void; close(reason?: string): void; toggle(): void;
  apply(): void;                           // commit the in-panel draft and close
  cancel(): void;                          // discard the draft, fire o-cancel, and close
  setRange(start: DateLike | null, end: DateLike | null): this;   // set the value programmatically (no events)
  clear(emit?: boolean): void; focus(opts?: FocusOptions): void;
  checkValidity(): boolean; reportValidity(): boolean; setCustomValidity(msg: string): void;
}
interface ODaterangeEvents {
  'o-change': CustomEvent<{ value: { start: string; end: string } | null; start: Date | null; end: Date | null }>;
  'o-select': CustomEvent<{ start: Date | null; end: Date | null }>;   // the in-panel draft changed; end is null while choosing
  'o-preset': CustomEvent<{ preset: PresetInput; start: Date; end: Date }>;
  'o-before-open': CustomEvent<void>;      // cancelable
  'o-open': CustomEvent<void>; 'o-close': CustomEvent<{ reason: 'escape' | 'outside' | 'tab' | 'api' | 'parent' }>;
  'o-cancel': CustomEvent<void>;
}
```
Native `input` / `change` also fire from the host when a range is committed. Form value: with `name`, one
field `"start/end"` (ISO on each side); with `nameStart`/`nameEnd`, two separate `FormData` entries. Validity:
`required` (needs both ends), unparsable typed text (`badInput`), end before start (`badInput`), `min`/`max`
(`rangeUnderflow` / `rangeOverflow`), `minDays`/`maxDays` violations (`rangeUnderflow` / `rangeOverflow`), a
disabled start/end date (`badInput`).

Built-in presets: `today yesterday last7 last30 last90 thisWeek thisMonth lastMonth thisYear`. Typed input
parses like Date Picker (locale pattern, ISO, alternate separators). Keyboard: `↓` / `F4` in an input opens
the panel and focuses that end; arrows/Home/End/PageUp/PageDown move in the calendar (mirrored in RTL) and
preview the range to the focused day; Enter/Space sets the start, then the end; Tab cycles start input, end
input, presets, calendar, times and footer while open; Esc cancels (restores the previous range) and closes.

CSS: `--o-cal-cell` (day size, shared with Date Picker), `--o-dr-presets-w` (presets column width). Parts:
`.o-dr-control`, `.o-dr-panel`, `.o-dr-layout`, `.o-dr-presets`, `.o-dr-preset` (`[aria-pressed]`), `.o-dr-main`,
`.o-dr-times`, `.o-dr-foot`, `.o-dr-summary`; range states on calendar cells: `.is-range-start`, `.is-in-range`,
`.is-range-end`, `.is-preview`, `.is-preview-start`, `.is-preview-end` (see Date Picker's `Orion.MonthGrid`).
