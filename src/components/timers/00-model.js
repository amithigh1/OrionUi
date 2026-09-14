/* ============================================================================
 * Orion timers — model: duration math shared by <o-countdown> and <o-stopwatch>.
 * Every file in this folder shares one function scope (ARCHITECTURE.md §2).
 * ========================================================================== */

i18n.add('en', {
  timers: {
    day: 'days', hour: 'hours', minute: 'minutes', second: 'seconds',
    complete: 'Time’s up', remaining: '{time} remaining',
    start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', lap: 'Lap',
    lapN: 'Lap {n}', lapCol: 'Lap', totalCol: 'Total', elapsed: 'Elapsed time',
    started: 'Started', paused: 'Paused', lapRecorded: 'Lap {n}, {time}',
  },
});

const TM_S = 1000, TM_M = 60 * TM_S, TM_H = 60 * TM_M, TM_D = 24 * TM_H;
const tmPad = (n, w = 2) => String(Math.trunc(n)).padStart(w, '0');

/** Split a millisecond duration into { d, h, m, s, cs } per `fmt`: 'dhms' | 'hms' | 'ms'. Never negative. */
function tmParts(ms, fmt = 'dhms') {
  let total = Math.max(0, Math.round(ms));
  const cs = Math.floor((total % TM_S) / 10);
  let secTotal = Math.floor(total / TM_S);
  let d = 0, h = 0, m = 0;
  if (fmt === 'dhms') { d = Math.floor(secTotal / 86400); secTotal -= d * 86400; h = Math.floor(secTotal / 3600); secTotal -= h * 3600; }
  else if (fmt === 'hms') { h = Math.floor(secTotal / 3600); secTotal -= h * 3600; }
  m = Math.floor(secTotal / 60); secTotal -= m * 60;
  const s = secTotal;
  return { d, h, m, s, cs, totalMs: total, totalSec: Math.floor(total / TM_S) };
}
/** Units (in order) rendered for a format, with their natural cycle length (for ring variants). */
const TM_UNITS = { dhms: ['d', 'h', 'm', 's'], hms: ['h', 'm', 's'], ms: ['m', 's'] };
const TM_MAX = { d: null, h: 24, m: 60, s: 60 };
const TM_LABEL_KEY = { d: 'day', h: 'hour', m: 'minute', s: 'second' };

/** Plain "HH:MM:SS" / "D:HH:MM:SS" clock string (stopwatch + inline countdown). */
function tmClock(ms, fmt, withCentis) {
  const p = tmParts(ms, fmt);
  const segs = [];
  if (fmt === 'dhms' && p.d) segs.push(String(p.d));
  if (fmt !== 'ms') segs.push(fmt === 'dhms' && p.d ? tmPad(p.h) : String(p.h));
  segs.push(fmt === 'ms' ? String(p.m) : tmPad(p.m));
  segs.push(tmPad(p.s));
  return segs.join(':') + (withCentis ? '.' + tmPad(p.cs) : '');
}
/** "3d 4h 12m 05s" compact text. */
function tmCompact(ms, fmt) {
  const p = tmParts(ms, fmt);
  const out = [];
  if (fmt === 'dhms' && p.d) out.push(p.d + 'd');
  if (fmt !== 'ms' && (p.h || out.length)) out.push(p.h + 'h');
  out.push((out.length ? tmPad(p.m) : p.m) + 'm');
  out.push(tmPad(p.s) + 's');
  return out.join(' ');
}

O.timer = {
  /** parts(ms, 'dhms'|'hms'|'ms') -> { d, h, m, s, cs, totalMs, totalSec } */
  parts: tmParts,
  /** clock(ms, fmt, withCentiseconds) -> "01:02:03" */
  clock: tmClock,
  /** compact(ms, fmt) -> "1d 2h 03m 04s" */
  compact: tmCompact,
};
