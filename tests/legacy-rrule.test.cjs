#!/usr/bin/env node
/* legacy-rrule.test.cjs — salvaged from .tmp/rrule-test.js.
 *
 * Why this runs as a plain Node script instead of through build/check.mjs's browser harness: the whole
 * script only calls Orion.rrule (expand/parse/toString/describe), pure date-math logic with no DOM
 * dependency. Orion Admin's build is deliberately Node/SSR-safe (ARCHITECTURE.md §2: `HTMLBase = isBrowser
 * ? HTMLElement : class {}`), so `require('../dist/orion.js')` loads cleanly without a browser — confirmed
 * empirically (`node -e "require('./dist/orion.js').rrule"` returns the real module, no DOM needed).
 * (.tmp/timers-test.js was NOT converted the same way: <o-stopwatch>/<o-countdown> ARE real custom
 * elements whose setup() builds DOM nodes via `h()`, so under plain Node — where OElement extends a bare
 * `class {}` instead of HTMLElement — calling their methods throws immediately; that script stays a
 * browser eval, kept as tests/evals/legacy-timers.js.)
 *
 * Run: node tests/legacy-rrule.test.cjs   (from the repo root; run `npm run build` / build/build.mjs first)
 */
const path = require('path');
const Orion = require(path.resolve(__dirname, '..', 'dist', 'orion.js'));
const R = Orion.rrule;

const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const results = {};

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'DAILY', interval: 2, count: 5 }, { dtstart }).map(fmt);
  const expected = [0, 2, 4, 6, 8].map(n => fmt(new Date(2026, 0, 1 + n)));
  results.dailyInterval = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 8, 7);
  const weekStartDate = new Date(dtstart); weekStartDate.setDate(dtstart.getDate() - dtstart.getDay() + 1);
  const got = R.expand({ freq: 'WEEKLY', byday: ['MO', 'WE', 'FR'], count: 9 }, { dtstart }).map(fmt);
  let expected = [];
  for (let w = 0; w < 4 && expected.length < 9; w++) for (const off of [0, 2, 4]) { const dd = new Date(weekStartDate); dd.setDate(weekStartDate.getDate() + w * 7 + off); if (dd >= dtstart) expected.push(fmt(dd)); }
  expected = expected.slice(0, 9);
  results.weeklyByday = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'MONTHLY', byday: ['2MO'], count: 6 }, { dtstart }).map(fmt);
  let expected = [];
  for (let m = 0; m < 8 && expected.length < 6; m++) { const mondays = []; for (let day = 1; day <= 31; day++) { const dd = new Date(2026, m, day); if (dd.getMonth() !== m) break; if (dd.getDay() === 1) mondays.push(dd); } if (mondays[1] && mondays[1] >= dtstart) expected.push(fmt(mondays[1])); }
  expected = expected.slice(0, 6);
  results.monthlyOrdinal = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'MONTHLY', byday: ['-1FR'], count: 6 }, { dtstart }).map(fmt);
  let expected = [];
  for (let m = 0; m < 8 && expected.length < 6; m++) { const fridays = []; for (let day = 1; day <= 31; day++) { const dd = new Date(2026, m, day); if (dd.getMonth() !== m) break; if (dd.getDay() === 5) fridays.push(dd); } const last = fridays[fridays.length - 1]; if (last && last >= dtstart) expected.push(fmt(last)); }
  expected = expected.slice(0, 6);
  results.lastFriday = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'MONTHLY', bymonthday: [-1], count: 6 }, { dtstart }).map(fmt);
  let expected = []; for (let m = 0; m < 6; m++) expected.push(fmt(new Date(2026, m + 1, 0)));
  results.lastDayOfMonth = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'MONTHLY', byday: ['MO', 'TU', 'WE', 'TH', 'FR'], bysetpos: [-1], count: 6 }, { dtstart }).map(fmt);
  let expected = []; for (let m = 0; m < 6; m++) { let d = new Date(2026, m + 1, 0); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); expected.push(fmt(d)); }
  results.bysetposLastWeekday = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'DAILY', until: new Date(2026, 0, 5) }, { dtstart }).map(fmt);
  const expected = [0, 1, 2, 3, 4].map(n => fmt(new Date(2026, 0, 1 + n)));
  results.until = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 10, 26);
  const got = R.expand({ freq: 'YEARLY', count: 3 }, { dtstart }).map(fmt);
  const expected = [2026, 2027, 2028].map(y => fmt(new Date(y, 10, 26)));
  results.yearly = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  const dtstart = new Date(2026, 0, 1);
  const got = R.expand({ freq: 'DAILY', count: 5, exdates: ['2026-01-03'] }, { dtstart }).map(fmt);
  const expected = [0, 1, 3, 4].map(n => fmt(new Date(2026, 0, 1 + n)));
  results.exdate = { got, expected, pass: JSON.stringify(got) === JSON.stringify(expected) };
}

{
  // NOTE: fixed vs the original .tmp/rrule-test.js, which asserted `s === s2` (exact string equality).
  // toString() deliberately canonicalizes its output — src/components/calendar/10-recurrence.js line 87:
  // `if (r.interval > 1) p.push('INTERVAL=' + r.interval);` — so the redundant, explicit "INTERVAL=1" in
  // the input (interval=1 is already the default) is correctly dropped on the way back out. That's a
  // deliberate normalization, not a bug, so this compares the two strings' PARSED form instead of their
  // literal text — the real round-trip property (same rule in, same rule out), not a string diff.
  const s = 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR';
  const r = R.parse(s); const s2 = R.toString(r);
  const r2 = R.parse(s2);
  const desc = R.describe(s, { dtstart: new Date(2026, 0, 1) });
  results.roundtrip = { s, s2, pass: JSON.stringify(r) === JSON.stringify(r2), desc };
}

{
  // WKST effect: informational only (no fixed expected value asserted in the original script either).
  const dtstart = new Date(2026, 8, 8); // Tue Sep 8 2026
  const got = R.expand({ freq: 'WEEKLY', interval: 2, byday: ['SU'], wkst: 'MO', count: 3 }, { dtstart }).map(fmt);
  results.wkst = { got, note: 'WKST=MO weekly/2 on SU from a Tuesday start' };
}

const ok = Object.keys(results).filter(k => k !== 'wkst').every(k => results[k].pass !== false);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
