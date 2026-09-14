/* ============================================================================
 * Orion booking — model: availability computation, slot grouping, ICS export.
 * Every file in this folder shares one function scope (ARCHITECTURE.md §2).
 * ========================================================================== */

i18n.add('en', {
  booking: {
    service: 'Service', duration: '{count} min', selectService: 'Select a service',
    date: 'Date', time: 'Time', selectDate: 'Select a date', selectTime: 'Select a time',
    morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening',
    noSlots: 'No times available this day', noSlotsHint: 'Try another date.',
    loading: 'Loading availability…', loadError: 'Couldn’t load availability.', retry: 'Retry',
    timezone: 'Times shown in {tz}', change: 'Change', back: 'Back', continueBtn: 'Continue',
    yourDetails: 'Your details', name: 'Name', email: 'Email', phone: 'Phone', notes: 'Notes',
    namePh: 'Full name', emailPh: 'you@example.com', phonePh: 'Optional', notesPh: 'Anything we should know?',
    confirm: 'Confirm booking', confirming: 'Booking…', bookError: 'Couldn’t complete the booking. Please try again.',
    confirmedTitle: 'You’re booked!', confirmedText: 'A confirmation has been sent to {email}.',
    addToCalendar: 'Add to calendar', bookAnother: 'Book another', with: 'with {name}',
    summaryWith: '{service} · {duration} min', today: 'Today', prev: 'Previous month', next: 'Next month',
    required: 'This field is required', invalidEmail: 'Enter a valid email address',
  },
});

const BK_MIN = 6e4;
const bkPad2 = n => String(n).padStart(2, '0');
const bkKey = d => d.getFullYear() + '-' + bkPad2(d.getMonth() + 1) + '-' + bkPad2(d.getDate());
const bkSod = d => { const x = new Date(+d); x.setHours(0, 0, 0, 0); return x; };
const bkAddDays = (d, n) => { const x = new Date(+d); x.setDate(x.getDate() + n); return x; };
const bkTimeMin = (v, dflt = 0) => {
  if (v == null || v === '') return dflt;
  if (isNum(v)) return v * 60;
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : dflt;
};

/** true | {days,start,end} | [...] -> [{days:Set, start, end}] (minutes), default Mon-Fri 09:00-17:00 */
function bkHours(v) {
  if (v == null || v === true || v === '') v = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
  const list = Array.isArray(v) ? v : [v];
  return list.filter(isObj).map(b => ({
    days: new Set(toArr(b.days ?? b.daysOfWeek ?? [1, 2, 3, 4, 5]).map(Number)),
    start: bkTimeMin(b.start ?? b.startTime, 540), end: bkTimeMin(b.end ?? b.endTime, 1020),
  }));
}
/** merged [start,end] minute ranges for a given day-of-week */
function bkRanges(hours, dow) {
  const r = hours.filter(h => h.days.has(dow)).map(h => [h.start, h.end]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}
/** does [s,e) (minutes on `day`) overlap any interval in `busy` (Date pairs), with a buffer on both sides? */
function bkOverlapsBusy(day, s, e, busy, buffer) {
  const st = +bkSod(day) + s * BK_MIN - buffer * BK_MIN, en = +bkSod(day) + e * BK_MIN + buffer * BK_MIN;
  return busy.some(b => st < +b.end && en > +b.start);
}

/**
 * Compute slots for one day from local config (no async `availability`).
 * cfg: { workingHours, slotMinutes, bufferMinutes, booked:[{start,end}], minNotice, duration }
 * -> [{ start: Date, end: Date }]
 */
function bkComputeSlots(day, cfg) {
  const hours = bkHours(cfg.workingHours);
  const ranges = bkRanges(hours, day.getDay());
  if (!ranges.length) return [];
  const dur = Math.max(1, +cfg.duration || cfg.slotMinutes || 30), step = Math.max(1, +cfg.slotMinutes || 30);
  const busy = toArr(cfg.booked).map(b => ({ start: date.parse(b.start), end: date.parse(b.end) })).filter(b => b.start && b.end);
  const now = new Date(), notice = +cfg.minNotice || 0;
  const earliest = new Date(+now + notice * BK_MIN);
  const out = [];
  for (const [rs, re] of ranges) {
    for (let t = rs; t + dur <= re; t += step) {
      const s = new Date(+bkSod(day) + t * BK_MIN), e = new Date(+s + dur * BK_MIN);
      if (s < earliest) continue;
      if (busy.length && bkOverlapsBusy(day, t, t + dur, busy, +cfg.bufferMinutes || 0)) continue;
      out.push({ start: s, end: e });
    }
  }
  return out;
}
/** Normalise whatever an `availability()` hook returned into [{start,end}], applying minNotice. */
function bkNormSlots(raw, day, cfg) {
  const dur = Math.max(1, +cfg.duration || cfg.slotMinutes || 30);
  const now = new Date(), earliest = new Date(+now + (+cfg.minNotice || 0) * BK_MIN);
  return toArr(raw).map(s => {
    if (isStr(s) && /^\d{1,2}:\d{2}/.test(s)) { const st = date.setTime(day, s); return st ? { start: st, end: new Date(+st + dur * BK_MIN) } : null; }
    const start = date.parse(isObj(s) ? s.start : s);
    if (!start) return null;
    const end = isObj(s) && s.end ? date.parse(s.end) : new Date(+start + dur * BK_MIN);
    return { start, end };
  }).filter(Boolean).filter(s => s.start >= earliest).sort((a, b) => +a.start - +b.start);
}
/** Group slots into morning (<12) / afternoon (12-17) / evening (>=17) buckets, in order. */
function bkGroup(slots) {
  const g = { morning: [], afternoon: [], evening: [] };
  for (const s of slots) { const h = s.start.getHours(); (h < 12 ? g.morning : h < 17 ? g.afternoon : g.evening).push(s); }
  return g;
}

/* ── ICS (RFC 5545) ──────────────────────────────────────────────────── */
const bkIcsEsc = s => String(s ?? '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
const bkIcsDate = d => new Date(+d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const bkIcsFold = l => { let out = ''; while (l.length > 74) { out += l.slice(0, 74) + '\r\n '; l = l.slice(74); } return out + l; };
/** icsText({ title, start, end, location, description, organizer, attendeeEmail, uid }) -> .ics text */
function bkIcs(o) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orion Admin//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:' + bkIcsEsc(o.uid || uid('bk')) + '@orion', 'DTSTAMP:' + bkIcsDate(new Date()),
    'DTSTART:' + bkIcsDate(o.start), 'DTEND:' + bkIcsDate(o.end), 'SUMMARY:' + bkIcsEsc(o.title)];
  if (o.location) lines.push('LOCATION:' + bkIcsEsc(o.location));
  if (o.description) lines.push('DESCRIPTION:' + bkIcsEsc(o.description));
  if (o.organizer) lines.push('ORGANIZER:CN=' + bkIcsEsc(o.organizer) + ':MAILTO:' + bkIcsEsc(o.organizerEmail || 'noreply@example.com'));
  if (o.attendeeEmail) lines.push('ATTENDEE;CN=' + bkIcsEsc(o.attendeeName || o.attendeeEmail) + ':MAILTO:' + bkIcsEsc(o.attendeeEmail));
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(bkIcsFold).join('\r\n') + '\r\n';
}
function bkDownloadIcs(o) {
  download(bkIcs(o), (o.filename || o.title || 'booking').replace(/[^\w-]+/g, '-') + '.ics', 'text/calendar');
}

const BK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
