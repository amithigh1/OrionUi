# datepicker — `<o-datepicker>`, `Orion.MonthGrid`, `Orion.Calendar`

Typed date / datetime input with a popup calendar (a bottom sheet on phones) or an `inline` calendar:
min/max, disabled dates (array or function), highlighted dates (dot or badge), week numbers, week-start,
month & year quick-pick views, several months side by side, `single` or `multiple` selection, a datetime
mode (reuses `timepicker`'s `Orion.TimeColumns`) and native form participation. The month grid is exported
as `Orion.MonthGrid` (one accessible `<table role="grid">` month) and `Orion.Calendar` (one or more months
with captions, navigation and quick-pick views) for reuse by the calendar, scheduler and booking packages.

Files: `10-calendar.js` (`Orion.MonthGrid` + `Orion.Calendar`), `20-datepicker.js` (`<o-datepicker>`), `datepicker.css`.
Depends on `timepicker` (`Orion.TimeColumns`, `// @deps timepicker`).

```ts
type DisabledDatesInput = string | (Date | string | number)[] |
  (string | number | 'weekends' | 'weekdays' | { from?: DateLike; to?: DateLike })[] | ((d: Date) => boolean);
type HighlightInput = string | (string | { date: DateLike; color?: string; label?: string; badge?: string | number })[] |
  ((d: Date) => null | true | { color?: string; label?: string; badge?: string | number });
type DateLike = string | number | Date;

interface ODatepickerElement extends HTMLElement {          // extends Orion FormElement
  value: string | Date | string[] | null;    // 'YYYY-MM-DD'; 'YYYY-MM-DDTHH:mm' with `time`; array with mode="multiple"
  name: string; disabled: boolean; required: boolean; readonly: boolean;
  mode: 'single' | 'multiple';               // attr mode, default 'single'
  format?: string;                            // Orion.date tokens; default Orion.date.localePattern() (+ time tokens with `time`)
  min?: DateLike; max?: DateLike;             // inclusive
  disabledDates?: DisabledDatesInput;         // attr disabled-dates (JSON array, comma list, or global fn name); or set the property to a function
  highlighted?: HighlightInput;               // attr highlighted
  weekNumbers: boolean;                       // attr week-numbers
  weekStart?: number;                         // attr week-start, 0-6; default from locale
  months: number;                             // attr months, default 1 (side by side)
  outsideDays?: boolean;                      // attr outside-days; default: true only when months===1
  time: boolean;                              // datetime mode -> value becomes 'YYYY-MM-DDTHH:mm'
  hour12?: boolean;                           // attr hour12; default from locale (Orion.date.uses12h())
  step: number;                               // attr step, minute step for the time columns, default 5
  inline: boolean;                            // attr inline, reflected; renders the calendar in place (still a form control)
  placeholder?: string;                       // default: the active format, lower-cased
  todayButton: boolean;                       // attr today-button, default true
  clearable: boolean;                         // default true
  closeOnSelect: boolean;                     // attr close-on-select, default true (ignored while `time` or mode="multiple" keep the panel open)
  size?: 'sm' | 'lg';
  texts?: Partial<Record<'today'|'now'|'clear'|'done'|'time'|'dialog'|'invalid'|'min'|'max'|'unavailable'|
    'choose'|'chooseMonth'|'chooseYear'|'prevMonth'|'nextMonth'|'prevYear'|'nextYear'|'prevYears'|'nextYears'|
    'months'|'years'|'wk'|'week'|'weekN', string>>;
  readonly date: Date | null;                 // first selected date
  readonly dates: Date[];                     // all selected dates (mode="multiple")
  readonly calendar: InstanceType<typeof Orion.Calendar>;
  open(focusCalendar?: boolean): void; close(reason?: string): void; toggle(): void;
  show(date: DateLike): this;                 // navigate the calendar to a month without changing the value
  clear(emit?: boolean): void; focus(opts?: FocusOptions): void;
  checkValidity(): boolean; reportValidity(): boolean; setCustomValidity(msg: string): void;
}
interface ODatepickerEvents {
  'o-change': CustomEvent<{ value: string | string[] | null; date: Date | null } | { value: string[]; dates: Date[] }>;
  'o-before-open': CustomEvent<void>;         // cancelable
  'o-open': CustomEvent<void>; 'o-close': CustomEvent<{ reason: 'escape' | 'outside' | 'tab' | 'api' | 'parent' }>;
  'o-view': CustomEvent<{ month: string }>;   // the displayed (leftmost) month changed, 'YYYY-MM-01'
}
```
Native `input` / `change` also fire from the host on user changes. Form value: ISO date (or datetime with `time`),
one `FormData` entry per date with `mode="multiple"`. Validity: `required`, `min`/`max` (`rangeUnderflow` /
`rangeOverflow`), a disabled date (`badInput`), unparsable typed text (`badInput`).

Typed input is parsed with `format` (ISO `YYYY-MM-DD[THH:mm]` is always accepted in addition). Keyboard: `↓` / `Alt+↓` /
`F4` in the input opens the calendar and focuses it; inside the grid, arrows move by day/week (mirrored in RTL),
Home/End move to the first/last day of the week, PageUp/PageDown change month (Shift: year), Enter/Space select;
clicking the caption opens a month view, then a year view (Esc steps back one level, otherwise closes and returns
focus to the input).

## `Orion.MonthGrid` & `Orion.Calendar`

```ts
interface MonthGridOptions {
  year: number; month: number;                // 0-11
  weekStart?: number; locale?: string; weekNumbers?: boolean; outsideDays?: boolean /* true */; fixedWeeks?: boolean /* true, always 6 rows */;
  focusDate?: Date | null;                     // gets tabindex="0"
  labelledBy?: string;                         // id of the caption element
  isDisabled?(d: Date): boolean;
  dayState?(d: Date): Record<string, boolean | undefined>;   // truthy keys become `.is-<kebab-key>` classes (selected, rangeStart, rangeEnd, inRange, preview, previewStart, previewEnd, …)
  highlight?(d: Date): null | true | { color?: string; label?: string; badge?: string | number };
  renderDay?(d: Date, td: HTMLTableCellElement): string | Node;   // cell content; the day number by default
  dayLabel?(d: Date): string;                  // aria-label override (default: full localized date)
  onSelect?(d: Date, e: Event): void; onHover?(d: Date | null, e: Event): void; onFocus?(d: Date, e: Event): void;
}
declare class MonthGrid {
  constructor(el: HTMLElement, o?: MonthGridOptions);
  readonly table: HTMLTableElement; readonly weekStart: number; o: MonthGridOptions;
  set(o: Partial<MonthGridOptions>): this;
  render(): this;                              // rebuild the table for o.year / o.month
  refresh(): this;                             // re-apply states/highlights without rebuilding
  cell(d: Date): HTMLTableCellElement | null;
  focus(d?: Date): HTMLElement | null;         // focuses the given date, or the current tabindex="0" cell
  destroy(): void;
  static keyTarget(e: KeyboardEvent, d: Date, o?: { rtl?: boolean; weekStart?: number }): Date | null;
}
interface CalendarOptions extends Omit<MonthGridOptions, 'year' | 'month' | 'focusDate'> {
  months?: number;                             // side by side, default 1
  min?: DateLike; max?: DateLike;
  onView?(firstMonth: Date): void;             // the leftmost displayed month changed
}
declare class Calendar {
  constructor(el: HTMLElement, o?: CalendarOptions & { focusDate?: DateLike });
  readonly grids: { g: MonthGrid; title: HTMLButtonElement }[]; view: 'days' | 'months' | 'years';
  first: Date; focusDate: Date; readonly count: number;   // clamped months, 1-12
  set(o: Partial<CalendarOptions>): this;
  show(d: DateLike, o?: { focus?: boolean; force?: boolean }): this;   // show the month containing d
  render(): this; refresh(): this;             // refresh repaints every grid's states
  isDisabled(d: Date): boolean;
  moveFocus(d: Date): void;                    // move keyboard focus to d, paging the view when needed
  focus(d?: DateLike): void;
}
```
`O.pickers.disabledFn(v)` / `O.pickers.highlightFn(v)` (added by this folder) normalize the `disabled-dates` /
`highlighted` prop shapes above into `(d: Date) => …` functions; reused by `daterange`.

CSS: `--o-cal-cell` (day cell size), `--o-cal-gap`. States: `.is-selected`, `.is-today`, `.is-disabled`,
`.is-outside`, `.is-weekend`, `.is-in-range`, `.is-range-start`, `.is-range-end`, `.is-preview*`, `.is-highlighted`.
Parts: `.o-dp-control`, `.o-dp-panel`, `.o-dp-inline`, `.o-cal`, `.o-cal-month`, `.o-cal-caption`, `.o-mg` (the
`<table>`), `.o-mg-cell`, `.o-mg-day`, `.o-mg-mark` (`.o-mg-dot` / `.o-mg-badge`).
