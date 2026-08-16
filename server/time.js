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
/** Monday-first order, for laying out a week as a grid. */
const WEEKDAYS_MON_FIRST = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

/** The Monday on or before this date. */
function mondayOf(iso) {
  const idx = WEEKDAYS.indexOf(weekdayOf(iso)); // sun=0 … sat=6
  const back = idx === 0 ? 6 : idx - 1;
  return addDays(iso, -back);
}

/** The Monday on or after this date — today counts if today is already Monday. */
function mondayOnOrAfter(iso) {
  const m = mondayOf(iso);
  return m === iso ? iso : addDays(m, 7);
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

/** "Aug 19" — no weekday, for labels that already state the weekday. */
function fmtMonthDay(iso, tz) {
  const { y, m, d } = parseDate(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
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

/** "Aug 17–23, 2026" — a Monday-start week, formatted as a range. Handles
 *  the week crossing a month or year boundary. */
function fmtWeekRange(startIso, tz) {
  const endIso = addDays(startIso, 6);
  const s = parseDate(startIso), e = parseDate(endIso);
  const startDate = new Date(Date.UTC(s.y, s.m - 1, s.d, 12));
  const endDate = new Date(Date.UTC(e.y, e.m - 1, e.d, 12));
  const fmt = (opts) => (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts }).format(d);

  if (s.y !== e.y) {
    const full = fmt({ month: 'short', day: 'numeric', year: 'numeric' });
    return `${full(startDate)}–${full(endDate)}`;
  }
  if (s.m !== e.m) {
    return `${fmt({ month: 'short', day: 'numeric' })(startDate)}–${fmt({ month: 'short', day: 'numeric', year: 'numeric' })(endDate)}`;
  }
  // Intl has no clean "day + year, no month" pattern (ICU falls back to an
  // odd disambiguated string), so that piece is built by hand instead.
  return `${fmt({ month: 'short', day: 'numeric' })(startDate)}–${e.d}, ${e.y}`;
}

module.exports = {
  WEEKDAYS, WEEKDAY_LABELS, WEEKDAYS_MON_FIRST,
  tzOffsetMs, zonedToUtc, addDays, weekdayOf, mondayOf, mondayOnOrAfter, cutoffFor, dayState,
  todayIn, fmtLocal, fmtDayLong, fmtDayShort, fmtMonthDay,
  fmtClock, fmtWindow, fmtWeekRange, parseDate,
};
