# timers — `<o-countdown>`, `<o-stopwatch>`, `Orion.timer`

`<o-countdown>` counts down to a target timestamp; `<o-stopwatch>` counts up with lap splits. Both
recompute their displayed value from `Date.now()` on every tick (never a decrementing/incrementing
counter), so neither drifts even after the tab was backgrounded or throttled.

Files: `00-model.js` (`Orion.timer` duration math shared by both elements), `10-countdown.js`
(`<o-countdown>`), `20-stopwatch.js` (`<o-stopwatch>`), `timers.css`.

```ts
type DateLike = string | number | Date;
type TimerFormat = 'dhms' | 'hms' | 'ms';       // dhms: d/h/m/s · hms: hours roll past 24 · ms: minutes roll past 60

interface OCountdownElement extends HTMLElement {
  to?: DateLike;                                 // target timestamp
  format: TimerFormat;                            // attr, reflected, default 'dhms'
  variant: 'tiles' | 'inline' | 'flip' | 'ring';  // attr, reflected, default 'tiles'
  labels: boolean;                                // default true; unit labels under each tile/ring
  autostart: boolean;                             // default true; start as soon as `to` is set
  pauseOnHidden: boolean;                         // attr pause-on-hidden, default true; stops the render loop (not the underlying time) while document.hidden
  completeText?: string;                          // shown + announced once `to` is reached
  locale?: string;
  texts?: Record<string, string>;                 // timers.* key overrides

  start(): void; pause(): void;
  restart(to?: DateLike): void;                   // optionally set a new target, then (re)start
  getRemaining(): number | null;                  // ms remaining, or null when `to` is unset
}
interface OCountdownEvents { 'o-complete': CustomEvent<{ to: Date | null }>; }   // fires once, when the target is reached

interface OStopwatchElement extends HTMLElement {
  autostart: boolean;                             // start immediately on connect
  format: 'hms' | 'ms';                           // attr, reflected, default 'hms'
  centiseconds: boolean;                          // default true; show a de-emphasised .cc segment
  persist?: string;                               // localStorage key; when set, elapsed time + laps survive a reload
  locale?: string; texts?: Record<string, string>;

  start(): void; resume(): void;                  // resume is an alias of start (continues from the current elapsed time)
  pause(): void; toggle(): void;                  // toggle is bound to Space
  lap(): void;                                    // bound to L while running
  reset(): void;                                  // bound to R while stopped; clears elapsed time and laps
  getElapsed(): number;                           // current elapsed milliseconds
  getLaps(): { n: number; lap: number; total: number }[];   // milliseconds
}
// No custom events beyond native focus/keydown; poll getElapsed()/getLaps() or read the rendered DOM.

declare const timer: {
  parts(ms: number, format?: TimerFormat): { d: number; h: number; m: number; s: number; cs: number; totalMs: number; totalSec: number };
  clock(ms: number, format?: TimerFormat, withCentiseconds?: boolean): string;   // "01:02:03[.45]" / "d:hh:mm:ss"
  compact(ms: number, format?: TimerFormat): string;                             // "1d 2h 03m 04s"
};
```

`persist` only restores the elapsed time and lap list — a stopwatch that was left running is **not**
silently resumed on reload (surprising a visitor with a timer that kept running in the background is worse
than asking them to press start again); it restores paused with the correctly caught-up elapsed time.

## Accessibility

Both elements expose a visually-hidden `aria-live="polite"` region. The countdown announces the remaining
time **once per minute** (not every second, which would spam a screen reader), plus once immediately on
`o-complete`. The stopwatch's numeric face is `aria-hidden` (it changes many times a second); `start`,
`pause` and each recorded lap are announced instead. `<o-stopwatch>` is `role="group"` with a `tabindex`,
so Space/L/R work as soon as it (or a child) has focus; its buttons are plain `<button>`s with icon + text.

## CSS

`.o-countdown` (`.is-tiles` / `.is-inline` / `.is-flip` / `.is-ring` per `variant`), parts
`.o-countdown-unit`, `.o-countdown-val`, `.o-countdown-label`; the `ring` variant reuses the core
`.o-progress-ring` utility (its largest unit — e.g. hours in `format="hms"` — has no natural cycle length
and renders as a plain number instead of a ring). `.o-stopwatch` (`.is-running`), parts
`.o-stopwatch-time`/`.o-stopwatch-main`/`.o-stopwatch-cs`, `.o-stopwatch-controls`,
`.o-stopwatch-laps` (`tr.is-best` / `tr.is-worst` once there are 3+ laps). All colors are tokens
(`--o-c-text`/`--o-c-subtle` context-aware, `--o-success-text` while running); reduced motion is handled
by the shared global rule.
