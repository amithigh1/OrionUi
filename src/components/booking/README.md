# booking — `<o-booking>`

Self-contained appointment-booking wizard: pick a service, an available day on an inline month calendar, a
time slot (grouped morning/afternoon/evening), fill in contact details, confirm. Availability is computed
locally from `working-hours` + `booked` ranges, or delegated to an async `availability(date, service)` hook
for a real backend. Generates its own `.ics` file for "Add to calendar" (no external library).

Files: `00-model.js` (availability computation, slot grouping, ICS export), `10-element.js`
(`<o-booking>`), `booking.css`.

```ts
type DateLike = string | number | Date;
interface OrionService { id: string | number; title: string; duration?: number; [key: string]: any; }
interface OrionTimeRange { days?: number[]; daysOfWeek?: number[]; start?: string; end?: string; startTime?: string; endTime?: string; }  // 'HH:mm'
interface OrionBookedRange { start: DateLike; end: DateLike; }
interface OrionSlot { start: Date; end: Date; }
interface OrionBookingPayload { service: OrionService; start: Date; end: Date;
  details: { name?: string; email?: string; phone?: string; notes?: string; [key: string]: string }; }

interface OBookingElement extends HTMLElement {
  services: OrionService[];                    // attr JSON; 0 = no selector, 1 = shown as text, 2+ = selectable cards
  workingHours?: boolean | OrionTimeRange | OrionTimeRange[];   // attr working-hours; default Mon-Fri 09:00-17:00; ignored when `availability` is set
  slotMinutes: number;                          // attr slot-minutes, default 30 (grid step, and a service's default duration)
  bufferMinutes: number;                        // attr buffer-minutes, default 0; gap kept around each `booked` range
  booked: OrionBookedRange[];                   // attr JSON; excluded ranges (local computation only)
  minNotice: number;                            // attr min-notice (minutes), default 60
  maxDaysAhead: number;                         // attr max-days-ahead, default 60
  availability?: (date: Date, service: OrionService) =>
    (OrionSlot | { start: DateLike; end?: DateLike } | string /* 'HH:mm' */)[] | Promise<...>;   // property only; overrides local computation
  timezone?: string;                            // attr; label only, default Intl.DateTimeFormat().resolvedOptions().timeZone
  locale?: string; weekStart?: number;
  fields: ('name' | 'email' | 'phone' | 'notes')[];   // attr JSON, default all four; name & email are required
  location?: string; organizer?: string;        // included in the confirmation card and the generated .ics
  onBook?: (payload: OrionBookingPayload) => void | Promise<void>;   // property only; throw/reject to show an inline error and stay on the form

  reset(): void;                                 // back to the first step, clears the selection
  gotoStep(step: 'pick' | 'details' | 'done'): void;
  getBooking(): OrionBookingPayload | null;      // the confirmed booking, or null
  downloadICS(): void;                           // also wired to the "Add to calendar" button
}
interface OBookingEvents {
  'o-date-select': CustomEvent<{ date: Date }>;
  'o-slot-select': CustomEvent<{ start: Date; end: Date }>;
  'o-book': CustomEvent<OrionBookingPayload>;     // cancelable; fires before `onBook` runs
  'o-booked': CustomEvent<{ booking: OrionBookingPayload }>;   // fires once `onBook` resolves
}
```

`availability` results are normalised and then filtered by `minNotice` regardless of source. A plain
`"HH:mm"` string is combined with the service's (or `slotMinutes`) duration to make a `{ start, end }` pair.

## ICS export

`downloadICS()` / the "Add to calendar" button build an RFC&nbsp;5545 `VEVENT` (via the shared
`bkIcs()`/`download()` core helper) with `SUMMARY`, `DTSTART`/`DTEND`, `LOCATION`, `DESCRIPTION` (from
`details.notes`), `ORGANIZER` and `ATTENDEE`, then triggers a browser download — no server round-trip and
no third-party calendar library.

## Accessibility & keyboard

The mini calendar is `role="grid"`; day buttons are native `<button>` (Tab/Enter/Space work without extra
wiring); disabled days (`is-disabled`: outside the month, in the past, or past `max-days-ahead`) are real
`disabled` buttons, skipped by Tab. The contact form uses native `<label for>`/`required`/`novalidate` with
inline `.o-error` messages announced via field-level `aria-invalid` styling. Errors and confirmation state
changes are plain DOM updates (no code changes needed for RTL — the wizard already mirrors through logical
CSS properties and grid track direction).

## CSS

Root class `.o-booking`, states `.is-step-pick` / `.is-step-details` / `.is-step-done`. Parts:
`.o-booking-svcs`/`.o-booking-svc` (service cards), `.o-booking-cal`/`.o-booking-day` (mini calendar),
`.o-booking-slot-group`/`.o-booking-slot` (time grid), `.o-booking-form`, `.o-booking-done*`
(confirmation). Responsive: the calendar/slots grid collapses to one column under 640px.
