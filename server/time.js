'use strict';
/**
 * All timestamps are stored in UTC (ISO strings). All wall-clock reasoning goes
 * through the configured IANA timezone. The server's own system timezone is
 * never consulted.
 *
 * The cutoff rule is fixed: 22:00 (configurable hour) local time on the
 * calendar day BEFORE the service date. "Day before" is computed on the
 * calendar date string, never by subtracting 24h from an epoch — that is what
 * makes it survive DST transitions, where the prior local midnight may be 23 or
 * 25 hours away.
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_LABELS = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

/** Offset (ms) between the given instant's wall time in `tz` and UTC. */
function tzOffsetMs(instant, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return asUTC - instant.getTime();
}

/** Convert a local wall-clock time in `tz` to a UTC Date. */
function zonedToUtc(y, m, d, hh, mm, tz) {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  // Two passes settle the offset even when the guess lands on the other side
  // of a DST boundary.
  let guess = naive - tzOffsetMs(new Date(naive), tz);
  guess = naive - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** 'YYYY-MM-DD' -> {y,m,d} */
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function fmtDate({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Calendar arithmetic on the date itself. DST-proof by construction. */
function addDays(iso, n) {
  const { y, m, d } = parseDate(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return fmtDate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Weekday key ('mon'…) for a calendar date. Independent of timezone. */
function weekdayOf(iso) {
  const { y, m, d } = parseDate(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Cutoff instant for a service date.
 * Monday service + hour 22 + America/Toronto => Sunday 22:00 EST/EDT.
 */
function cutoffFor(serviceDate, cutoffHour, cutoffMinute, tz) {
  const prior = addDays(serviceDate, -1);
  const { y, m, d } = parseDate(prior);
  return zonedToUtc(y, m, d, cutoffHour, cutoffMinute, tz);
}

/** 'open' before cutoff, 'closed' after. Purely a function of `now`. */
function dayState(serviceDate, cutoffHour, cutoffMinute, tz, now = new Date()) {
  const cutoff = cutoffFor(serviceDate, cutoffHour, cutoffMinute, tz);
  const next = parseDate(addDays(serviceDate, 1));
  const endOfService = zonedToUtc(next.y, next.m, next.d, 0, 0, tz);
  if (now >= endOfService) return { state: 'past', cutoff };
  if (now >= cutoff) return { state: 'closed', cutoff };
  const hoursLeft = (cutoff - now) / 36e5;
  return { state: hoursLeft <= 12 ? 'closing' : 'open', cutoff };
}

/** Today's calendar date in `tz`. */
function todayIn(tz, now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return dtf.format(now); // en-CA formats as YYYY-MM-DD
}

/** Human wall-clock rendering in `tz`. */
function fmtLocal(instant, tz, opts = {}) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    ...opts,
  }).format(instant);
}

function fmtDayLong(iso, tz) {
  const { y, m, d } = parseDate(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function fmtDayShort(iso, tz) {
  const { y, m, d } = parseDate(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "16:00"+"19:00"+30 -> ['16:00','16:30',…,'18:30'] */
function generateSlots(windowStart, windowEnd, slotMinutes) {
  const toMin = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin(windowStart), end = toMin(windowEnd);
  const step = Math.max(5, Number(slotMinutes) || 30);
  const out = [];
  for (let t = start; t + step <= end; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/** "16:30" -> "4:30 PM" */
function fmtClock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtWindow(start, end) {
  return `${fmtClock(start)}–${fmtClock(end)}`;
}

module.exports = {
  WEEKDAYS, WEEKDAY_LABELS,
  tzOffsetMs, zonedToUtc, addDays, weekdayOf, cutoffFor, dayState,
  todayIn, fmtLocal, fmtDayLong, fmtDayShort,
  generateSlots, fmtClock, fmtWindow, parseDate,
};
