#!/usr/bin/env node
/* gantt-timeline-dst.js — DST-crossing week boundaries, with FIXED 2026 dates (not Date.now()).
 *
 * Why this runs as a plain Node script instead of through build/check.mjs's browser harness:
 * headless Chrome on Windows does not honor the TZ environment variable (verified empirically —
 * `TZ=EST5EDT node build/check.mjs ... --eval=...` still reports Asia/Calcutta inside the page,
 * the OS's configured zone, with no DST). Windows Chromium reads its zone from the OS, not TZ.
 * Node's own Date/Intl DO honor a POSIX-style TZ value on this machine (confirmed: `TZ=EST5EDT
 * node -e "console.log(new Date(2026,0,1).getTimezoneOffset(), new Date(2026,6,1).getTimezoneOffset())"`
 * prints "300 240", i.e. real DST). So this script loads the actual built bundle (Node/SSR-safe
 * per ARCHITECTURE.md #2) under a real DST-observing zone and exercises the SAME production code:
 *   - `timelineview/10-scale.js`'s week-tick boundary delegates directly to the shared core
 *     `Orion.date.startOf(d, 'week')` — the function this test calls.
 *   - `gantt/10-calendar.js`'s day-number engine, exercised through the exposed `Orion.gantt.*` API.
 *
 * Run:  TZ=EST5EDT node .tmp/evals/gantt-timeline-dst.js   (from the repo root)
 * (A plain `node .tmp/evals/gantt-timeline-dst.js` still runs, just without a real DST zone to
 * prove the interesting case — it will report which zone/offsets it actually saw.)
 */
// Force a DST-observing zone unless the caller chose one: Node re-reads TZ at runtime, and an npm script cannot set
// an environment variable portably on Windows. Must run before any Date is constructed below.
process.env.TZ = process.env.TZ || 'EST5EDT';
const path = require('path');
const Orion = require(path.resolve(__dirname, '..', 'dist', 'orion.js'));   // the shipped bundle (run `npm run build` first)

const HOUR = 36e5, DAY = 864e5;
const janOffset = new Date(2026, 0, 1).getTimezoneOffset();
const julOffset = new Date(2026, 6, 1).getTimezoneOffset();
const tzHasDST = janOffset !== julOffset;

const results = [];
const check = (name, cond, extra) => results.push({ name, ok: !!cond, ...extra });

// --- 1) timelineview's week-axis boundary (Orion.date.startOf), across the two 2026 US transitions ---
// 2026-03-08 is the US "spring forward" Sunday (2:00am -> 3:00am); 2026-11-01 is "fall back".
const springWeekStart = Orion.date.startOf(new Date(2026, 2, 10, 15, 0), 'week'); // a Tuesday inside that week
const springNextWeekStart = Orion.date.startOf(new Date(2026, 2, 17, 15, 0), 'week');
const springWeekMs = +springNextWeekStart - +springWeekStart;
check('spring week starts on the correct Sunday (2026-03-08)', springWeekStart.getFullYear() === 2026 && springWeekStart.getMonth() === 2 && springWeekStart.getDate() === 8 && springWeekStart.getHours() === 0,
  { springWeekStart: springWeekStart.toString() });
check('spring-forward week is exactly 167h (7d - 1h), not a naive 7*24h', tzHasDST ? springWeekMs === 7 * DAY - HOUR : springWeekMs === 7 * DAY,
  { springWeekMs, expectedIfDST: 7 * DAY - HOUR, expectedIfNoDST: 7 * DAY, tzHasDST });

// 2026-11-01 is itself the fall-back Sunday (clocks fall back at 2am, still within the week that
// STARTS Nov 1) — so the affected week is Nov1-Nov8, not the week ending at Nov1.
const fallWeekStart = Orion.date.startOf(new Date(2026, 10, 5, 15, 0), 'week'); // a Thursday inside the week of Nov 1
const fallNextWeekStart = Orion.date.startOf(new Date(2026, 10, 12, 15, 0), 'week'); // week of Nov 8
const fallWeekMs = +fallNextWeekStart - +fallWeekStart;
check('fall week starts on the correct Sunday (2026-11-01)', fallWeekStart.getFullYear() === 2026 && fallWeekStart.getMonth() === 10 && fallWeekStart.getDate() === 1,
  { fallWeekStart: fallWeekStart.toString() });
check('fall-back week is exactly 169h (7d + 1h), not a naive 7*24h', tzHasDST ? fallWeekMs === 7 * DAY + HOUR : fallWeekMs === 7 * DAY,
  { fallWeekMs, expectedIfDST: 7 * DAY + HOUR, expectedIfNoDST: 7 * DAY, tzHasDST });

// every day within the spring-forward week must still resolve to the SAME week start (no day lost/duplicated)
const springWeekDays = [8, 9, 10, 11, 12, 13, 14].map(d => +Orion.date.startOf(new Date(2026, 2, d, 12, 0), 'week'));
check('every day of the spring-forward week maps back to the same week start', springWeekDays.every(t => t === +springWeekStart), { springWeekDays });

// --- 2) gantt's day-number engine is immune to DST by construction (integer days, UTC arithmetic
//     internally) — exercised through the exposed Orion.gantt.* API across the same transitions.
const dSpringBefore = Orion.gantt.day('2026-03-07'), dSpringAfter = Orion.gantt.day('2026-03-09');
check('gantt day numbers are consecutive across the spring-forward date', dSpringAfter - dSpringBefore === 2, { dSpringBefore, dSpringAfter });
const dFallBefore = Orion.gantt.day('2026-10-31'), dFallAfter = Orion.gantt.day('2026-11-02');
check('gantt day numbers are consecutive across the fall-back date', dFallAfter - dFallBefore === 2, { dFallBefore, dFallAfter });

// round-trip: date(day('2026-03-08')) must be local midnight on 2026-03-08, not shifted by the DST jump
const rt = Orion.gantt.date(Orion.gantt.day('2026-03-08'));
check('gantt.date(gantt.day(x)) round-trips to local midnight on the transition day itself', rt.getFullYear() === 2026 && rt.getMonth() === 2 && rt.getDate() === 8 && rt.getHours() === 0, { roundTrip: rt.toString() });

// the calendar's working-day counter must not gain/lose a day across the transition (5 working days = 5, always)
const cal = Orion.gantt.calendar({ workingDays: [1, 2, 3, 4, 5] });
const wStart = Orion.gantt.day('2026-03-02'); // Monday before spring-forward
const wEnd = cal.endFor(wStart, 5); // 5 working days later (exclusive end)
const workingDaysCounted = cal.count(wStart, wEnd);
check('a 5-working-day span across the spring-forward weekend still counts as exactly 5', workingDaysCounted === 5, { wStart, wEnd, workingDaysCounted });

const ok = results.every(r => r.ok);
console.log(JSON.stringify({ ok, tzHasDST, janOffset, julOffset, results }, null, 2));
process.exit(ok ? 0 : 1);
