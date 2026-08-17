'use strict';
/**
 * Publishing a week, by hand or on a schedule.
 *
 * Both paths go through the same two functions here — `blockers()` and
 * `publishNow()` — because a scheduled publish that could go live under rules
 * the button enforces would be a hole in the allergen gate, and the gate is
 * the one thing in this app that must not have a second implementation.
 *
 * THE SCHEDULE REFUSES; IT NEVER OVERRIDES. If a dish is unreviewed at noon on
 * Saturday, the week does not go out. The owner is emailed once, the week stays
 * a draft, and it publishes by itself the moment the review is finished — so a
 * refusal costs a delay, never a missed week, and never an untagged allergen in
 * front of a customer.
 */

const { db, settings } = require('./db');
const T = require('./time');
const A = require('./allergens');
const M = require('./menu');

const tz = () => settings.get('timezone', 'America/Toronto');

/**
 * Everything standing between this week and its customers, in the owner's
 * words. Empty means it can go live.
 *
 * Only levels 1 and 2 are checked. Standing items belong to no week — an
 * unreviewed one is simply absent from the menu and cannot block a week that
 * has nothing to do with it.
 */
function blockers(weekId) {
  const out = [];
  for (const d of M.serviceDaysOf(weekId)) {
    if (!d.dish_name.trim()) continue;
    const st = A.reviewState(d);
    if (!st.ok) out.push(A.reviewMessage(`${T.fmtDayShort(d.service_date, tz())} — ${d.dish_name}`, st));
  }
  const { soup, salad } = M.weekItemsOf(weekId);
  for (const [item, label] of [[soup, 'The soup of the week'], [salad, 'The salad of the week']]) {
    if (!item || !item.name.trim()) continue;
    const st = A.reviewState(item);
    if (!st.ok) out.push(A.reviewMessage(`${label}, ${item.name},`, st));
  }
  return out;
}

/**
 * Nothing on it worth showing anyone.
 *
 * Only the scheduler cares. Publishing an empty week by hand is the owner's
 * business, but doing it unattended would retire a live menu and replace it
 * with a blank one because Saturday arrived before the cooking was decided —
 * a silent way to take the site down.
 */
function isEmpty(weekId) {
  const days = M.serviceDaysOf(weekId).filter((d) => d.dish_name.trim());
  if (days.length) return false;
  const { soup, salad } = M.weekItemsOf(weekId);
  return !(soup && soup.name.trim()) && !(salad && salad.name.trim());
}

/** Retire whatever is live and put this week in its place. One live week. */
function publishNow(weekId) {
  db.transaction(() => {
    db.prepare(`UPDATE weeks SET status='retired' WHERE status='published' AND id != ?`).run(weekId);
    db.prepare(`UPDATE weeks SET status='published', published_at=datetime('now'),
      publish_warned_at=NULL WHERE id=?`).run(weekId);
  })();
}

/**
 * When a draft week should go live, as an instant, or null if it should not.
 *
 * Computed rather than stored, so changing the schedule in Settings moves every
 * week that has not gone out yet instead of only the ones created afterwards.
 *
 * The moment is the configured weekday strictly before the week's start date,
 * at the configured time, in the app's timezone — Saturday 12:00 for a week
 * starting Monday. Local time is resolved through the same zonedToUtc the
 * cutoff uses, so noon stays noon across the daylight-saving boundary rather
 * than drifting an hour in November.
 */
function scheduledFor(week) {
  if (!week || week.status !== 'draft') return null;
  if (!week.auto_publish) return null;
  if (settings.get('auto_publish', '1') !== '1') return null;
  if (!week.week_start) return null;

  const wanted = settings.get('auto_publish_weekday', 'sat');
  const [hh, mm] = String(settings.get('auto_publish_time', '12:00')).split(':').map(Number);
  if (!T.WEEKDAYS.includes(wanted) || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // Walk back from the day before the week starts to the wanted weekday.
  let date = T.addDays(week.week_start, -1);
  for (let i = 0; i < 7 && T.weekdayOf(date) !== wanted; i++) date = T.addDays(date, -1);
  if (T.weekdayOf(date) !== wanted) return null;

  const { y, m, d } = T.parseDate(date);
  return T.zonedToUtc(y, m, d, hh, mm, tz());
}

/**
 * Draft weeks whose moment has arrived.
 *
 * A week is skipped if its scheduled moment fell before the week was created:
 * building next week's menu on Sunday should not fire the Saturday that has
 * already gone by. Everything else overdue is still published, so a server
 * that was off all weekend catches up rather than silently skipping a week.
 */
function due(now = new Date()) {
  const rows = db.prepare(`SELECT * FROM weeks WHERE status='draft' AND week_start IS NOT NULL`).all();
  return rows.filter((w) => {
    const at = scheduledFor(w);
    if (!at || at > now) return false;
    const created = new Date(`${String(w.created_at).replace(' ', 'T')}Z`);
    return !(created instanceof Date && !Number.isNaN(created.getTime()) && at < created);
  });
}

/**
 * Publish everything due. Returns what happened, so the caller can log it and
 * the tests can assert on it without reading the database twice.
 */
function runDue({ now = new Date(), onPublished = null, onRefused = null } = {}) {
  const results = [];
  for (const week of due(now)) {
    const stopped = isEmpty(week.id)
      ? ['There is nothing on this week yet — no dish, no soup, no salad. '
        + 'It was left as a draft rather than replacing the live menu with a blank one.']
      : blockers(week.id);
    if (stopped.length) {
      results.push({ week, published: false, blockers: stopped });
      // Told once. The week stays due, so finishing the review at any point
      // afterwards publishes it on the next tick without another nudge.
      if (!week.publish_warned_at) {
        db.prepare(`UPDATE weeks SET publish_warned_at=datetime('now') WHERE id=?`).run(week.id);
        if (onRefused) onRefused(week, stopped);
      }
      continue;
    }
    publishNow(week.id);
    results.push({ week, published: true, blockers: [] });
    if (onPublished) onPublished(week);
  }
  return results;
}

module.exports = { blockers, isEmpty, publishNow, scheduledFor, due, runDue };
