'use strict';
const { db, settings } = require('./db');

/**
 * What happens after a password is refused.
 *
 * The rate limiter caps one address at eight tries per ten minutes, which is
 * the right answer to one machine hammering the door and no answer at all to
 * the two things that follow from it: a caller who rotates addresses, and an
 * owner who never learns any of it happened. So refusals are written down,
 * every refusal costs the next caller a little time, and a bad hour is worth
 * an email.
 *
 * Deliberately not a lockout. A threshold that turns the dashboard off would
 * hand anyone who can reach the login page a way to keep Derek out of his own
 * kitchen on a Friday afternoon, which is a worse day than the one being
 * defended against.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* Enough failures in an hour that it is no longer someone's fat thumb. */
const ALERT_AT = 20;
/* Enough in a day to be worth saying on the dashboard. Below this it is
   almost always Derek, and a dashboard that cries wolf gets ignored. */
const NOTICE_AT = 5;

function record(ip, now = Date.now()) {
  db.prepare('INSERT INTO login_failures (at, ip) VALUES (?,?)').run(now, String(ip || ''));
  db.prepare('DELETE FROM login_failures WHERE at < ?').run(now - MONTH_MS);
}

function countSince(from) {
  return db.prepare('SELECT COUNT(*) n FROM login_failures WHERE at >= ?').get(from).n;
}

function addressesSince(from) {
  return db.prepare(
    'SELECT COUNT(DISTINCT ip) n FROM login_failures WHERE at >= ? AND ip <> \'\'').get(from).n;
}

function lastAt() {
  const row = db.prepare('SELECT at FROM login_failures ORDER BY at DESC LIMIT 1').get();
  return row ? row.at : null;
}

/**
 * What the dashboard should say, or null for the ordinary case of nothing to
 * report. Counted over a day, because the question being answered is "has
 * anything been going on while I was cooking", not "right now".
 */
function notice(now = Date.now()) {
  const count = countSince(now - DAY_MS);
  if (count < NOTICE_AT) return null;
  return {
    count,
    addresses: addressesSince(now - DAY_MS),
    lastAt: lastAt(),
    /* An hour's worth in the last day says it is still going on. */
    active: countSince(now - HOUR_MS) >= NOTICE_AT,
  };
}

/**
 * How long to sit on a refusal, from how many there have already been in the
 * last hour. Costs a guessing script the time it would otherwise spend
 * guessing, and costs the owner who mistyped once almost nothing. Capped, so
 * a flood can't tie up every connection the server has.
 */
function delayFor(now = Date.now()) {
  const recent = countSince(now - HOUR_MS);
  if (recent <= 3) return 0;
  return Math.min(2000, (recent - 3) * 150);
}

/**
 * True at most once an hour, and only when the hour has been bad. The stamp
 * is the hour itself, the same way the missing-week reminder stamps the week
 * it asked about: restarting the app doesn't earn a second email, and the
 * next bad hour gets its own.
 */
function shouldAlert(now = Date.now()) {
  if (countSince(now - HOUR_MS) < ALERT_AT) return false;
  const bucket = String(Math.floor(now / HOUR_MS));
  if (settings.get('signin_alert_hour', '') === bucket) return false;
  settings.set('signin_alert_hour', bucket);
  return true;
}

module.exports = {
  record, notice, delayFor, shouldAlert,
  countSince, addressesSince, lastAt,
  ALERT_AT, NOTICE_AT, HOUR_MS, DAY_MS,
};
