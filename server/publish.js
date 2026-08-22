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
 *
 * The third path is `runMissingWeek()` at the foot of this file, for the case
 * neither of the others can see: no week was built at all.
 */

const { db, settings } = require('./db');
const T = require('./time');
const A = require('./allergens');
const M = require('./menu');
const D = require('./dishes');

const tz = () => settings.get('timezone', 'America/Toronto');

const weekRow = (weekId) => db.prepare('SELECT * FROM weeks WHERE id = ?').get(weekId);

/**
 * Everything standing between this week and its customers, in the owner's
 * words. Empty means it can go live.
 *
 * Only levels 1 and 2 are checked. Standing items belong to no week — an
 * unreviewed one is simply absent from the menu and cannot block a week that
 * has nothing to do with it.
 *
 * A closed week, or a closed day inside an open one, has nothing on the menu
 * to review. Blocking a closure over an allergen tag on a dish nobody can
 * order would leave the owner unable to announce that the kitchen is shut.
 */
function blockers(weekId) {
  const week = weekRow(weekId);
  if (week && week.closed) return [];
  const out = [];
  for (const d of M.serviceDaysOf(weekId)) {
    if (d.closed || !d.dish_name.trim()) continue;
    const st = A.reviewState(d);
    if (!st.ok) out.push(A.reviewMessage(`${T.fmtDayShort(d.service_date, tz())} — ${d.dish_name}`, st));
  }
  const { soup, salad, dessert } = M.weekItemsOf(weekId);
  for (const [item, label] of [
    [soup, 'The soup of the week'],
    [salad, 'The salad of the week'],
    [dessert, 'The dessert of the week'],
  ]) {
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
 *
 * A closure counts as something to show. "Closed this week" and a blank week
 * look identical in the database if you only count dishes, and they are
 * opposites: one is a decision the customer needs to read, the other is a week
 * nobody got round to.
 */
function isEmpty(weekId) {
  const week = weekRow(weekId);
  if (week && week.closed) return false;
  const days = M.serviceDaysOf(weekId);
  if (days.some((d) => d.closed || d.dish_name.trim())) return false;
  const { soup, salad, dessert } = M.weekItemsOf(weekId);
  return !(soup && soup.name.trim()) && !(salad && salad.name.trim())
    && !(dessert && dessert.name.trim());
}

/**
 * Retire whatever is live and put this week in its place. One live week.
 *
 * Publishing is also what files the week's dishes in the saved list. A dish
 * that has gone in front of customers is one worth being able to cook again,
 * and this is the moment it is finished being edited — earlier than this and
 * the list fills with half-typed names. Saving by name means the same dish
 * published a second time refreshes its entry instead of adding another.
 */
function publishNow(weekId) {
  db.transaction(() => {
    db.prepare(`UPDATE weeks SET status='retired' WHERE status='published' AND id != ?`).run(weekId);
    db.prepare(`UPDATE weeks SET status='published', published_at=datetime('now'),
      publish_warned_at=NULL WHERE id=?`).run(weekId);
    D.saveFromWeek(weekId);
  })();
}

/**
 * The calendar date the schedule points at for a week starting `weekStart` —
 * the configured weekday strictly before it. Null if the setting is nonsense.
 */
function publishDateFor(weekStart) {
  const wanted = settings.get('auto_publish_weekday', 'sat');
  if (!weekStart || !T.WEEKDAYS.includes(wanted)) return null;
  // Walk back from the day before the week starts to the wanted weekday.
  let date = T.addDays(weekStart, -1);
  for (let i = 0; i < 7 && T.weekdayOf(date) !== wanted; i++) date = T.addDays(date, -1);
  return T.weekdayOf(date) === wanted ? date : null;
}

/**
 * The configured time of day on a given date, as an instant. Local time is
 * resolved through the same zonedToUtc the cutoff uses, so noon stays noon
 * across the daylight-saving boundary rather than drifting an hour in November.
 */
function momentOn(date) {
  const [hh, mm] = String(settings.get('auto_publish_time', '12:00')).split(':').map(Number);
  if (!date || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const { y, m, d } = T.parseDate(date);
  return T.zonedToUtc(y, m, d, hh, mm, tz());
}

/**
 * When a draft week should go live, as an instant, or null if it should not.
 *
 * Computed rather than stored, so changing the schedule in Settings moves every
 * week that has not gone out yet instead of only the ones created afterwards.
 */
function scheduledFor(week) {
  if (!week || week.status !== 'draft') return null;
  if (!week.auto_publish) return null;
  if (settings.get('auto_publish', '1') !== '1') return null;
  return momentOn(publishDateFor(week.week_start));
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

/* --- Nothing built at all -------------------------------------------------
 * The schedule can only refuse a week that exists. A week nobody started is
 * invisible to it: no draft row, nothing due, no email, and the first sign of
 * trouble is a customer finding "no menu yet" on Monday.
 *
 * So the absence itself is watched. Two days before the publish moment by
 * default — Thursday noon for a Saturday-noon schedule — with enough notice to
 * either cook or to close the week on purpose.
 *
 * Deliberately NOT gated on auto_publish: someone who publishes by hand needs
 * this reminder more, not less. The schedule's weekday and time are read only
 * as the anchor for when to ask.
 */

/**
 * A week that already answers for the seven days beginning `weekStart`, or
 * null if nothing does.
 *
 * Opening This Week creates an empty draft, so a row existing proves nothing.
 * What counts is content — a dish, a soup, a salad — or a closure, which is
 * content of a kind: it is the owner having decided.
 */
function weekCovering(weekStart) {
  const end = T.addDays(weekStart, 6);
  const dayCount = db.prepare(`SELECT COUNT(*) n FROM service_days
    WHERE week_id = ? AND service_date BETWEEN ? AND ?
      AND (closed = 1 OR TRIM(dish_name) != '')`);
  for (const w of db.prepare(`SELECT * FROM weeks WHERE status IN ('draft','published')`).all()) {
    if (w.week_start === weekStart && (w.closed || !isEmpty(w.id))) return w;
    if (dayCount.get(w.id, weekStart, end).n) return w;
  }
  return null;
}

/** The week ahead, if the moment to ask about it has come and nothing covers it. */
function missingWeek(now = new Date()) {
  if (settings.get('remind_missing_week', '1') !== '1') return null;
  const weekStart = T.mondayOnOrAfter(T.todayIn(tz(), now));
  const publishDate = publishDateFor(weekStart);
  if (!publishDate) return null;

  const raw = settings.getInt('remind_missing_week_days', 2);
  const lead = Number.isFinite(raw) ? Math.max(0, Math.min(6, Math.floor(raw))) : 2;
  const at = momentOn(T.addDays(publishDate, -lead));
  if (!at || at > now) return null;
  if (weekCovering(weekStart)) return null;
  return { weekStart, at, publishAt: momentOn(publishDate) };
}

/**
 * Ask once per week, not every minute. The record is the week being asked
 * about, so building that week and then deleting it again re-arms nothing —
 * but the following week gets its own reminder as normal.
 */
function runMissingWeek({ now = new Date(), onMissing = null } = {}) {
  const miss = missingWeek(now);
  if (!miss) return null;
  if (settings.get('missing_week_warned_for', '') === miss.weekStart) return null;
  settings.set('missing_week_warned_for', miss.weekStart);
  if (onMissing) onMissing(miss);
  return miss;
}

module.exports = {
  blockers, isEmpty, publishNow, scheduledFor, due, runDue,
  publishDateFor, momentOn, weekCovering, missingWeek, runMissingWeek,
};
