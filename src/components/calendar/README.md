# calendar — `<o-calendar>`, `<o-recurrence-editor>`, `Orion.rrule`

Full scheduling calendar: month, week, day, list, year and resource-timeline (`resource-day` /
`resource-week` / `resource-month`) views. Events come from a plain array, an async range-based `source`
function or a URL. Click-drag creates events, drag-move/-resize reschedules them (including across
resources), recurring events use a hand-written RFC&nbsp;5545 `RRULE` subset (exported as `Orion.rrule`),
with an editable "this / this and following / all" scope on change and delete. Uses `Orion.modal` when
available (falls back to a built-in dialog), and `<o-datepicker>` / `<o-timepicker>` in the event editor
when those elements are registered (falls back to native `<input type=date|time>`).

Files: `00-model.js` (strings, date helpers, event store), `10-recurrence.js` (`Orion.rrule`),
`12-rrule-editor.js` (`<o-recurrence-editor>` + picker adapters), `15-base.js` (shared view pieces),
`20-month.js`, `30-timegrid.js` (week/day), `40-list.js`, `45-year.js`, `50-resource.js` (timeline),
`60-editor.js` (dialogs/popovers), `70-dnd.js` (pointer + keyboard interactions), `80-navigator.js`
(mini-month), `90-element.js` (`<o-calendar>`), `calendar.css`.

**Naming note:** the custom element is `<o-calendar>` and the JS class is registered as
`Orion.FullCalendar` (not `Orion.Calendar` — that name belongs to the `datepicker` package's month-grid
widget). Use `Orion.calendar(el, config)` as a factory, or just the `<o-calendar>` tag; you rarely need the
class directly. The CSS prefix is `.o-calendar*`; `.o-cal*` is reserved for the datepicker's own grid.

```ts
type DateLike = string | number | Date;
type EventColor = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark' |
  `chart-${1|2|3|4|5|6|7|8}` | `--${string}` /* CSS var */ | string /* any CSS color */;
type CalendarView = 'month' | 'week' | 'day' | 'list' | 'year' | 'resource-day' | 'resource-week' | 'resource-month';

interface OrionEventInput {
  id?: string | number;                      // auto-generated (uid) if omitted
  title?: string;
  start: DateLike;                            // required; 'YYYY-MM-DD' (no time) implies allDay
  end?: DateLike;                              // exclusive; defaults to start + defaultDuration (timed) or +1 day (all-day)
  allDay?: boolean;
  rrule?: string | RRuleInput | null;         // RFC 5545 subset, see Orion.rrule
  exdates?: (DateLike)[];                     // excluded occurrence dates ('YYYY-MM-DD' or exact datetime)
  color?: EventColor; textColor?: string;
  resourceId?: string | number | null;        // resource-* views
  location?: string; description?: string; url?: string;
  attendees?: (string | { name?: string; email?: string })[] | number;   // number/array length checked against resource.capacity
  editable?: boolean;                          // false locks this one event even when the calendar is editable
  className?: string;
  [key: string]: any;                          // passed through to eventContent / eventDidMount and returned events
}
/** Occurrence handed to callbacks: OrionEventInput plus resolved Date fields and, for recurring instances: */
interface OrionEventOccurrence extends OrionEventInput { start: Date; end: Date; exdates: string[];
  recurrenceId?: string; recurringEventId?: string; seriesStart?: Date; }
interface OrionResource { id: string | number; title?: string; subtitle?: string; color?: EventColor;
  capacity?: number; group?: string; avatar?: string | boolean; [key: string]: any; }

interface OCalendarElement extends HTMLElement {
  view: CalendarView;                          // attr view, default 'month', reflected
  views: CalendarView[];                       // attr JSON, default ['month','week','day','list']; toolbar + shortcut list
  date?: DateLike;                             // date the current view is centred on
  events: OrionEventInput[];                   // attr JSON; local events (merged with `source` results)
  source?: ((range: { start: Date; end: Date; startStr: string; endStr: string; view: CalendarView; signal?: AbortSignal })
    => OrionEventInput[] | Promise<OrionEventInput[] | { events: OrionEventInput[] } | { data: OrionEventInput[] }>) | string /* URL, ?start&end */;
  resources: OrionResource[];                  // attr JSON; resource-* views
  weekStart?: number;                          // attr week-start, 0-6; default from locale
  firstHour: number; lastHour: number;         // attrs first-hour/last-hour, 0-24; visible range in time-grid/resource views
  scrollTime: string;                          // attr scroll-time, 'HH:mm', default '08:00'
  slotMinutes: number;                         // attr slot-minutes, default 30
  snapMinutes?: number;                        // attr snap-minutes; default min(15, slotMinutes)
  defaultDuration: number;                     // attr default-duration (minutes), default 60
  businessHours?: boolean | { days?: number[]; start?: string; end?: string } | Array<{ days?: number[]; start?: string; end?: string }>;
  editable: boolean; selectable: boolean;      // attrs, reflected as presence
  nowIndicator: boolean; weekNumbers: boolean; fixedWeeks: boolean;
  height: string;                              // attr, default 'auto' (grows with content) or any CSS length
  toolbar: boolean | { start?: string; center?: string; end?: string };  // token strings: 'today prev,next title', 'zoom views' …
  navigator: boolean;                          // mini-month sidebar
  dayMaxEvents: number | 'auto' | false;       // attr day-max-events; rows before "+N more" in month cells
  allDayMaxRows: number;                       // attr all-day-max-rows, default 3
  listRange: 'day' | 'week' | 'month' | number;  // attr list-range, default 'month'
  responsive: boolean;                         // default true; auto list view under ~620px container width
  locale?: string; hour12?: boolean;           // default from site locale / Orion.date.uses12h()
  eventColor: EventColor;                      // attr event-color, default 'primary'
  zoom: number;                                 // attr, 0-4; resource-* views
  conflicts: boolean;                          // attr, default true; outline overlapping same-resource bookings
  droppable: boolean;                          // attr, default true; accept data-o-calendar-draggable items
  confirmDelete: boolean;                      // attr confirm-delete, default true (non-recurring, from the dialog)
  shortcuts: boolean;                          // attr, default true; t/n/p/m/w/d/a/y single-key nav
  popover: boolean;                             // attr, default true; built-in details popover on click
  builtinDialogs: boolean;                     // attr built-in-dialogs; force the fallback dialog even if Orion.modal exists
  eventContent?: (event: OrionEventOccurrence, info: { view: CalendarView; timeText: string; el: HTMLElement }) => string | Node | false | null;  // property only
  eventDidMount?: (info: { el: HTMLElement; event: OrionEventOccurrence; view: CalendarView }) => void;   // property only
  texts?: Record<string, string>;              // calendar.* / rrule.* key overrides

  addEvent(raw: OrionEventInput): OrionEventOccurrence | null;
  updateEvent(id: string | number, changes: Partial<OrionEventInput>): OrionEventOccurrence | null;
  removeEvent(id: string | number): OrionEventOccurrence | null;
  getEventById(id: string | number): OrionEventOccurrence | null;
  getEvents(range?: { start: DateLike; end: DateLike }): OrionEventOccurrence[];   // no range: raw stored events; with range: expanded occurrences
  refetch(): void;                              // clear the `source` cache and reload the visible range
  gotoDate(date: DateLike): void; next(): void; prev(): void; today(): void;
  changeView(view: CalendarView, date?: DateLike): void;
  scrollToTime(time: string): void;
  zoomBy(steps: number, clientX?: number): void;
  openEditor(eventOrPartial?: string | number | Partial<OrionEventInput>): void;
  getView(): { type: CalendarView; start?: Date; end?: Date; title: string; date: Date };
  readonly currentDate: Date;
  print(): void;
  toICS(opts?: { name?: string }): string;      // RFC 5545 text of all stored events
}
interface OCalendarEvents {
  'o-event-click': CustomEvent<{ event: OrionEventOccurrence; el: HTMLElement; originalEvent: Event }>;              // cancelable (prevents the popover)
  'o-event-create': CustomEvent<{ event: OrionEventOccurrence; source: 'dialog' | 'external' }>;                     // cancelable
  'o-event-change': CustomEvent<{ event: OrionEventOccurrence; oldEvent: OrionEventOccurrence; revert(): void;
    scope: 'this' | 'following' | 'all' | null; source: 'drag' | 'resize' | 'dialog' | 'keyboard' }>;                 // cancelable
  'o-event-delete': CustomEvent<{ event: OrionEventOccurrence; scope: 'this' | 'following' | 'all' | null; revert(): void }>;  // cancelable
  'o-select-range': CustomEvent<{ start: Date; end: Date; allDay: boolean; resourceId: string | number | null;
    view: CalendarView; source: 'click' | 'drag' | 'keyboard' }>;                                                     // cancelable
  'o-view-change': CustomEvent<{ view: CalendarView; requested: CalendarView }>;
  'o-dates-change': CustomEvent<{ start: Date; end: Date; view: CalendarView }>;
  'o-source-error': CustomEvent<{ error: Error; start: Date; end: Date }>;
  'o-loading': CustomEvent<{ loading: boolean }>;
}
```

External drag sources: `<div data-o-calendar-draggable='{"title":"Interview","duration":45,"color":"success"}'>`
(JSON, or plain text as the title) becomes droppable onto any `editable`, `droppable` calendar; dropping fires
`o-event-create` with `source: 'external'`.

## `<o-recurrence-editor>` (form-associated)

```ts
interface ORecurrenceEditorElement extends HTMLElement {   // extends Orion FormElement
  value: string;                               // RRULE string ('' = does not repeat)
  start?: DateLike;                             // the event's start date; drives ordinal/weekday defaults and phrasing
  weekStart?: number; locale?: string;
  texts?: Record<string, string>;               // rrule.* key overrides
  preview(n?: number): Date[];                  // next n occurrences from the current value
}
// Fires input / change / o-change like any form control: CustomEvent<{ value: string }>
```

## `Orion.rrule`

```ts
type RRuleFreq = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY';
type RRuleWeekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | `${number}${'SU'|'MO'|'TU'|'WE'|'TH'|'FR'|'SA'}`;  // '2MO', '-1FR'
interface RRuleInput {                          // also accepted as an RRULE / DTSTART / EXDATE text block
  freq: RRuleFreq; interval?: number; count?: number; until?: DateLike; untilDateOnly?: boolean;
  byday?: (RRuleWeekday | { day: number | RRuleWeekday; n?: number })[];
  bymonthday?: number[]; bymonth?: number[]; byyearday?: number[]; bysetpos?: number[];
  byhour?: number[]; byminute?: number[]; wkst?: number | RRuleWeekday; dtstart?: DateLike; exdates?: DateLike[];
}
declare const rrule: {
  parse(input: string | RRuleInput): Required<RRuleInput> | null;
  toString(input: string | RRuleInput, opts?: { full?: boolean }): string;   // full adds DTSTART:/EXDATE: lines
  expand(input: string | RRuleInput, opts: { dtstart?: DateLike; from?: DateLike; to?: DateLike; exdates?: DateLike[]; limit?: number }): Date[];
  between(input: string | RRuleInput, from: DateLike, to: DateLike, opts?: { dtstart?: DateLike; exdates?: DateLike[]; limit?: number }): Date[];
  after(input: string | RRuleInput, date: DateLike, opts?: { dtstart?: DateLike }): Date | null;
  describe(input: string | RRuleInput, opts?: { dtstart?: DateLike; locale?: string }): string;   // "Monthly on the last Friday"
  weekdays: RRuleWeekday[];                     // ['SU','MO',...,'SA']
};
```
Occurrences are computed in local wall-clock time via `Date` field arithmetic (never raw millisecond/day
addition), so a 9am rule stays at 9am across a DST transition.

## Accessibility & keyboard

`role="grid"`/`gridcell` (month/year), `role="group"` per day column (time grid), `role="toolbar"`. Arrow
keys move focus between days/slots (Home/End/PageUp/PageDown jump further; RTL-aware); Enter/Space opens an
event or starts a selection; Shift+arrows extend a time-slot selection; Alt+arrows move a focused editable
event, Alt+Shift+arrows resize it; Delete/Backspace removes it. `t`/`n`/`j`/`p`/`k` and `m`/`w`/`d`/`a`/`l`/`y`
are single-key shortcuts (disabled while focus is in a field, or via `shortcuts="false"`). Live region
announces navigation, moves, creates, deletes and cancellations.

## CSS

Root class `.o-calendar`. Custom properties: `--o-calendar-lane`, `--o-calendar-dayhead` (month lane/day-number
sizing used by the JS to compute how many events fit), `--o-calendar-slot-h`, `--o-calendar-tg-timecol`
(time-grid gutter width), `--o-calendar-tl-resw`, `--o-calendar-tl-row-h` (resource timeline), `--o-calendar-now`,
`--o-calendar-weekend`, `--o-calendar-off`. Per-event color: set `ev.color` to a token/CSS var/color;
chips read it through the `--ev` custom property with a token-derived readable text color, never a raw
hue — safe in dark mode automatically. States: `.is-today`, `.is-weekend`, `.is-other`, `.is-selected`,
`.is-editable`, `.is-recurring`, `.is-conflict`, `.is-over` (capacity), `.is-dragging`, `.is-narrow`.
Print: call `print()`; `@media print` hides chrome and expands scroll areas on the printing instance only.
