'use strict';
/**
 * Acceptance checks for the rules the spec calls out by name.
 *
 *   node scripts/acceptance.js
 *
 * These are the behaviours where being wrong is expensive: a cutoff that fires
 * an hour early loses orders, a postal code that normalizes inconsistently
 * refuses a real customer, a stale allergen acknowledgement publishes a dish
 * whose description has since changed. Run after touching time.js, delivery.js,
 * allergens.js, or the schema.
 *
 * Uses a scratch database so it never touches real orders.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dbd-test-'));
process.env.DB_PATH = path.join(scratch, 'test.db');
process.env.UPLOAD_DIR = path.join(scratch, 'uploads');
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password-1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-for-production';

const T = require('../server/time');
const D = require('../server/delivery');
const A = require('../server/allergens');
const { db } = require('../server/db');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  failures.push(`  ${label}\n      expected ${e}\n      got      ${a}`);
}
function ok(label, condition) { check(label, !!condition, true); }

const TZ = 'America/Toronto';
const CUT_H = 22;
const CUT_M = 0;
const localClock = (instant) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(instant);

/* --- Cutoff: 22:00 the calendar day BEFORE the service date --------------
   THERE ARE NO SAME-DAY ORDERS. The rule, in full:

     up to 22:00 the night before   an order
     22:00 → 06:00 that morning     a late request, which Derek must confirm
     after 06:00                    nothing at all

   Both boundaries are inclusive of the tighter side: at 22:00 exactly it is
   already a request, and at 06:00 exactly it is already refused. */
{
  // Service on Monday 2026-08-17. Cutoff is Sunday 2026-08-16 at 22:00 local.
  const service = '2026-08-17';
  const cutoff = T.cutoffFor(service, CUT_H, CUT_M, TZ);
  const at = (m, d, hh, mm) => T.zonedToUtc(2026, m, d, hh, mm, TZ);
  const state = (now) => T.dayState(service, { cutoffHour: CUT_H, cutoffMinute: CUT_M, tz: TZ, now }).state;

  check('the cutoff lands on the day before, at 22:00 local', localClock(cutoff), '22:00');
  ok('21:59 the night before is still open', at(8, 16, 21, 59) < cutoff);
  ok('22:01 the night before is past cutoff', at(8, 16, 22, 1) > cutoff);
  check('state at 21:59 is orderable', state(at(8, 16, 21, 59)), 'closing');
  check('22:00 on the dot is already too late for an order', state(at(8, 16, 22, 0)), 'late');
  check('and so is 22:01', state(at(8, 16, 22, 1)), 'late');

  // The gap between the two states is two minutes, not an hour: proves the
  // cutoff is not being computed in UTC.
  ok('cutoff sits between them', at(8, 16, 22, 1) - at(8, 16, 21, 59) === 2 * 60 * 1000);

  // The late window runs through the small hours and stops at six.
  check('midnight on the day itself is still a late request', state(at(8, 17, 0, 1)), 'late');
  check('05:59 is the last minute of it', state(at(8, 17, 5, 59)), 'late');
  check('06:00 on the dot takes nothing', state(at(8, 17, 6, 0)), 'closed');
  check('and neither does 09:00', state(at(8, 17, 9, 0)), 'closed');
  check('nor the pickup window itself', state(at(8, 17, 16, 0)), 'closed');
  check('nor the last minute of the day', state(at(8, 17, 23, 59)), 'closed');

  // The day itself stays visible until it is genuinely over.
  check('the service day is past only after it ends', state(at(8, 18, 0, 1)), 'past');
  check('a far-off day reads as open', state(at(8, 14, 9, 0)), 'open');

  // The late cutoff is on the service date, the cutoff on the day before, so
  // the window between them cannot invert however the two are configured.
  const lateEarly = T.dayState(service, {
    cutoffHour: 23, cutoffMinute: 59, lateHour: 0, lateMinute: 1, tz: TZ, now: at(8, 16, 23, 58),
  });
  ok('a one-minute late window is still a window',
    lateEarly.lateCutoff > lateEarly.cutoff, JSON.stringify(lateEarly));

  // Moving the late cutoff moves the wall, and 0 means midnight, not six.
  const midnight = (now) => T.dayState(service,
    { cutoffHour: CUT_H, cutoffMinute: CUT_M, lateHour: 0, lateMinute: 0, tz: TZ, now }).state;
  check('a midnight late cutoff shuts the door at midnight', midnight(at(8, 17, 0, 1)), 'closed');
  check('while 23:59 the night before is still a request', midnight(at(8, 16, 23, 59)), 'late');
}

/* --- The late window survives the clocks changing ------------------------ */
{
  // 06:00 on a spring-forward morning is 06:00, not 05:00 or 07:00 — the hour
  // that goes missing that night is 02:00, before the window closes.
  const springState = (now) => T.dayState('2027-03-14',
    { cutoffHour: 22, cutoffMinute: 0, tz: 'America/Toronto', now }).state;
  const lateCut = T.lateCutoffFor('2027-03-14', 6, 0, TZ);
  check('the late cutoff reads 06:00 local on a 23-hour day', localClock(lateCut), '06:00');
  check('05:59 that morning still takes a request',
    springState(T.zonedToUtc(2027, 3, 14, 5, 59, TZ)), 'late');
  check('06:01 does not', springState(T.zonedToUtc(2027, 3, 14, 6, 1, TZ)), 'closed');

  const fallCut = T.lateCutoffFor('2026-11-01', 6, 0, TZ);
  check('and 06:00 local on a 25-hour day', localClock(fallCut), '06:00');
}

/* --- Cutoff survives the DST boundary ------------------------------------ */
{
  // Clocks spring forward 2027-03-14 in Toronto. A service day on the 15th has
  // its cutoff on the 14th — the day that is only 23 hours long.
  check('cutoff is 22:00 local on a spring-forward day',
    localClock(T.cutoffFor('2027-03-15', CUT_H, CUT_M, TZ)), '22:00');

  // And on fall-back, when 01:00–02:00 happens twice.
  check('cutoff is 22:00 local on a fall-back day',
    localClock(T.cutoffFor('2026-11-02', CUT_H, CUT_M, TZ)), '22:00');

  // Across the transition the UTC gap is 23h or 25h, never a naive 24h.
  const before = T.cutoffFor('2027-03-14', CUT_H, CUT_M, TZ);
  const after = T.cutoffFor('2027-03-15', CUT_H, CUT_M, TZ);
  check('the spring-forward gap is 23 hours, not 24', (after - before) / 36e5, 23);
}

/* --- Each day's cutoff is independent ------------------------------------ */
{
  const mon = T.cutoffFor('2026-08-18', CUT_H, CUT_M, TZ);
  const tue = T.cutoffFor('2026-08-19', CUT_H, CUT_M, TZ);
  check('consecutive days are exactly 24h apart', tue - mon, 24 * 60 * 60 * 1000);
}

/* --- Pickup window formatting ---------------------------------------------- */
{
  check('the window reads as a range', T.fmtWindow('16:00', '19:00'), '4:00 PM–7:00 PM');
  check('a shifted window reflects the shift', T.fmtWindow('17:00', '20:00'), '5:00 PM–8:00 PM');
}

/* --- Monday-of and the week-range title ------------------------------------ */
{
  check('a mid-week date rolls back to its Monday', T.mondayOf('2026-08-13'), '2026-08-10');
  check('a Sunday rolls back to the Monday before it, not itself', T.mondayOf('2026-08-16'), '2026-08-10');
  check('a Monday stays put', T.mondayOf('2026-08-10'), '2026-08-10');

  // The default for a brand-new draft: the menu is posted ahead of time
  // (Saturday, for the week starting the following Monday), so a new week
  // should default to the upcoming week, not the one already underway.
  check('Saturday rolls forward to the Monday after it', T.mondayOnOrAfter('2026-08-15'), '2026-08-17');
  check('Sunday rolls forward to the very next day', T.mondayOnOrAfter('2026-08-16'), '2026-08-17');
  check('a mid-week date rolls forward to next Monday', T.mondayOnOrAfter('2026-08-12'), '2026-08-17');
  check('a Monday stays put going forward too', T.mondayOnOrAfter('2026-08-10'), '2026-08-10');

  // Regression: Intl.DateTimeFormat has no clean "day + year, no month"
  // pattern — {day:'numeric', year:'numeric'} alone falls back to a mangled
  // string like "2026 (day: 16)" in Node's ICU. fmtWeekRange must not hit it.
  check('same-month week range', T.fmtWeekRange('2026-08-10', TZ), 'Aug 10–16, 2026');
  check('cross-month week range', T.fmtWeekRange('2026-08-31', TZ), 'Aug 31–Sep 6, 2026');
  check('cross-year week range', T.fmtWeekRange('2025-12-29', TZ), 'Dec 29, 2025–Jan 4, 2026');
}

/* --- The featured dish's daily ceiling ------------------------------------ */
{
  const M = require('../server/menu');
  const { settings } = require('../server/db');
  const before = settings.get('featured_daily_cap');

  settings.set('featured_daily_cap', 25);
  check('it ships at 25', Number(before), 25);
  check('a day with no number of its own inherits the setting',
    M.featuredCapFor({ daily_cap: null }), 25);
  check('a day with its own number overrides the setting',
    M.featuredCapFor({ daily_cap: 8 }), 8);
  check('and a day set to zero means none, not unlimited',
    M.featuredCapFor({ daily_cap: 0 }), 0);

  settings.set('featured_daily_cap', 0);
  check('zero as the setting means no ceiling at all',
    M.featuredCapFor({ daily_cap: null }), null);
  check('but a day can still impose one when the setting is off',
    M.featuredCapFor({ daily_cap: 6 }), 6);

  settings.set('featured_daily_cap', before);
}

/* --- Postal code normalization -------------------------------------------- */
{
  const forms = ['N2L 3G1', 'n2l3g1', 'N2L-3G1', '  n2l 3g1  ', 'N2l3G1'];
  const results = forms.map((f) => D.check(f));
  ok('every spelling of one KW postal code is eligible', results.every((r) => r.ok));
  ok('every spelling normalizes identically',
    new Set(results.map((r) => r.normalized)).size === 1);
  ok('every spelling resolves to the same FSA',
    new Set(results.map((r) => r.fsa)).size === 1);
  check('the FSA is N2L', results[0].fsa, 'N2L');

  const toronto = D.check('M5V 2T6');
  check('a Toronto postal code is not eligible', toronto.ok, false);
  check('and the reason is out of area, not malformed', toronto.reason, 'out_of_area');
  check('an out-of-area address carries no fee', toronto.fee, 0);

  const nonsense = D.check('hello');
  check('nonsense is rejected', nonsense.ok, false);
  check('and is reported as invalid rather than out of area', nonsense.reason, 'invalid');

  const empty = D.check('');
  check('an empty postal code is rejected', empty.ok, false);
}

/* --- FSA list is data, not code ------------------------------------------- */
{
  const before = D.servedAreas().length;
  db.prepare('INSERT OR IGNORE INTO fsas (code, zone_id) VALUES (?, NULL)').run('N1R');
  ok('adding an FSA takes effect without a redeploy', D.check('N1R 5T2').ok);
  check('served area list grew by one', D.servedAreas().length, before + 1);
  db.prepare('DELETE FROM fsas WHERE code = ?').run('N1R');
  ok('and removing it takes effect too', !D.check('N1R 5T2').ok);
}

/* --- Allergen detection is deterministic keyword matching ----------------- */
{
  const names = (list) => list.map((h) => h.allergen);

  const a = A.detect('Creamy mushroom soup finished with butter and parmesan');
  const b = A.detect('Creamy mushroom soup finished with butter and parmesan');
  check('the same text gives the same answer twice', a, b);
  ok('dairy words are detected', names(a).includes('milk'));

  // Health Canada declares this allergen as "wheat and triticale", and the
  // dictionary uses that exact wording so an accepted chip reads on the menu
  // the way the regulator words it. Matching on a bare 'wheat' would pass a
  // test while putting the wrong phrase in front of a customer.
  const schnitzel = A.detect('Pork schnitzel, panko breaded, pan fried');
  ok('breading suggests wheat', names(schnitzel).includes('wheat and triticale'));
  ok('and gluten is carried as a separate tag', names(schnitzel).includes('gluten'));
  ok('every detected allergen is one Health Canada names',
    names(schnitzel).every((n) => A.HEALTH_CANADA_ORDER.includes(n)));

  // The two standing items most likely to carry allergens are the ones seeded
  // into the catalogue, so they get checked by name.
  ok('breaded chicken cutlets suggest wheat',
    names(A.detect('Breaded chicken cutlets, panko crusted')).includes('wheat and triticale'));

  ok('the matched word is reported back, so the owner can judge it',
    a.find((h) => h.allergen === 'milk').terms.length > 0);

  ok('word boundaries are respected — "buttercup" is not butter',
    !names(A.detect('Buttercup squash, roasted')).includes('milk'));

  check('a plain description detects nothing', A.detect('Roasted carrots with thyme'), []);
  check('an empty description detects nothing', A.detect(''), []);
}

/* --- The publish gate: acknowledgement, and it goes stale ----------------- */
{
  const name = 'Chicken Cutlets';
  const desc = 'Chicken cutlets, breaded and fried';
  // What the owner is shown and ticks against: both halves, as stored.
  const reviewed = A.reviewedText({ name, description: desc });
  const accepted = JSON.stringify(A.detect(reviewed).map((h) => h.allergen));
  const item = (over) => ({ name, description: desc, allergens: accepted, dismissed: '[]', ack: 1, ack_of: reviewed, ...over });

  const unacked = A.reviewState(item({ ack: 0, ack_of: null }));
  check('an unacknowledged item cannot publish', unacked.ok, false);
  check('and the reason says why', unacked.reason, 'not_acknowledged');

  check('an acknowledged item can publish', A.reviewState(item({})).ok, true);

  const edited = A.reviewState(item({ description: `${desc}, served with lemon` }));
  check('editing the description invalidates the acknowledgement', edited.ok, false);
  check('and the reason names the edit', edited.reason, 'description_changed');

  const ignored = A.reviewState(item({ allergens: '[]' }));
  check('unanswered suggestions block publishing', ignored.ok, false);
  check('even when the box is ticked', ignored.reason, 'pending_suggestions');

  const clean = { name: 'Roast Carrots', description: 'Roasted carrots with thyme' };
  const emptyDetection = A.reviewState({ ...clean, allergens: '[]', dismissed: '[]', ack: 0, ack_of: null });
  check('detecting nothing still requires acknowledgement', emptyDetection.ok, false);

  const emptyAcked = A.reviewState({ ...clean, allergens: '[]', dismissed: '[]', ack: 1, ack_of: A.reviewedText(clean) });
  check('acknowledging a clean dish lets it publish', emptyAcked.ok, true);

  const msg = A.reviewMessage('The featured dish', unacked);
  ok('the message names the item and the action',
    msg.includes('The featured dish') && msg.length > 30);
  ok('a dismissed suggestion counts as answered',
    A.reviewState(item({
      allergens: '[]',
      dismissed: JSON.stringify(A.detect(reviewed).map((h) => h.allergen)),
    })).ok);
}

/* --- The name is read too, not just the description ----------------------
   A dish carries its allergen in its title far more often than the dictionary
   gets credit for. "Beer-Battered Haddock" described as chips and mushy peas
   is fish and gluten with nothing detectable in the body. Reading the
   description alone let exactly that through the gate, acknowledged in good
   faith and untagged on the menu. */
{
  const names = (list) => list.map((h) => h.allergen);
  const fishy = { name: 'Beer-Battered Haddock', description: 'Hand-cut chips and mushy peas.' };

  check('the description alone finds nothing here', A.detect(fishy.description), []);
  ok('but the reviewed text finds the fish in the title',
    names(A.detect(A.reviewedText(fishy))).includes('fish'));
  ok('and the gluten in it',
    names(A.detect(A.reviewedText(fishy))).includes('gluten'));

  const pending = A.pendingFor(A.reviewedText(fishy), [], []);
  ok('so it is offered as a suggestion rather than assumed', names(pending).includes('fish'));

  // The tick alone must not carry it: the suggestion is still undecided.
  const ticked = A.reviewState({
    ...fishy, allergens: '[]', dismissed: '[]', ack: 1, ack_of: A.reviewedText(fishy),
  });
  check('ticking the box does not publish a dish with the fish still pending', ticked.ok, false);
  check('and it says which suggestions are waiting', ticked.reason, 'pending_suggestions');

  // Renaming has to reopen the review, or the gate has a hole exactly the size
  // of the fix: review "Chicken Pie", rename to "Salmon Pie", publish untagged.
  const pie = { name: 'Chicken Pie', description: 'Short pastry, roast vegetables.' };
  const acked = { ...pie, allergens: JSON.stringify(A.detect(A.reviewedText(pie)).map((h) => h.allergen)),
    dismissed: '[]', ack: 1, ack_of: A.reviewedText(pie) };
  check('the reviewed pie publishes', A.reviewState(acked).ok, true);

  const renamed = A.reviewState({ ...acked, name: 'Salmon Pie' });
  check('renaming it invalidates the acknowledgement', renamed.ok, false);
  ok('and the fish it now names is waiting to be decided',
    names(renamed.pending).includes('fish'));
}

/* --- Storage keeps the three levels distinct ------------------------------ */
{
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('service_days','week_items','standing_items')"
  ).all().map((r) => r.name).sort();
  check('three levels, three tables', tables, ['service_days', 'standing_items', 'week_items']);

  const week = db.prepare("INSERT INTO weeks (slug, title, status) VALUES ('test-week','Test','draft')").run().lastInsertRowid;
  const ins = db.prepare("INSERT INTO week_items (week_id, kind, name) VALUES (?,?,?)");
  ins.run(week, 'soup', 'Potato leek');
  let secondSoupRejected = false;
  try { ins.run(week, 'soup', 'Tomato basil'); } catch (e) { secondSoupRejected = true; }
  ok('a week cannot hold two soups', secondSoupRejected);

  ins.run(week, 'salad', 'Caesar');
  check('but a soup and a salad coexist',
    db.prepare('SELECT COUNT(*) n FROM week_items WHERE week_id = ?').get(week).n, 2);

  // Desserts are the third kind, and behave exactly like the other two: one
  // per week, sitting alongside rather than replacing.
  ins.run(week, 'dessert', 'Sticky toffee pudding');
  check('a dessert joins them', 
    db.prepare('SELECT COUNT(*) n FROM week_items WHERE week_id = ?').get(week).n, 3);
  let secondDessertRejected = false;
  try { ins.run(week, 'dessert', 'Key lime pie'); } catch (e) { secondDessertRejected = true; }
  ok('a week cannot hold two desserts', secondDessertRejected);

  let junkKindRejected = false;
  try { ins.run(week, 'pudding', 'Not a kind'); } catch (e) { junkKindRejected = true; }
  ok('and no fourth kind can be invented', junkKindRejected);

  check('weekItemsOf hands back all three',
    Object.keys(require('../server/menu').weekItemsOf(week)).sort(),
    ['dessert', 'salad', 'soup']);

  db.prepare('DELETE FROM week_items WHERE week_id = ?').run(week);
  db.prepare('DELETE FROM weeks WHERE id = ?').run(week);
}

/* --- Standing items are seeded and persist -------------------------------- */
{
  const names = db.prepare('SELECT name FROM standing_items ORDER BY sort').all().map((r) => r.name);
  check('the standing items are seeded', names, [
    'Chili', 'Pork Schnitzel', 'Breaded Chicken Cutlets',
    'Pulled Pork (Reheat Bag)', 'BBQ Brisket (Reheat Bag)', 'Pulled Chicken (Reheat Bag)',
  ]);
}

/* --- Weekday availability -------------------------------------------------- */
{
  check('Monday 2026-08-17 is a Monday', T.weekdayOf('2026-08-17'), 'mon');
  check('Tuesday 2026-08-18 is a Tuesday', T.weekdayOf('2026-08-18'), 'tue');

  const tueWedThu = ['tue', 'wed', 'thu'];
  ok('a Tue/Wed/Thu item is absent on Monday', !tueWedThu.includes(T.weekdayOf('2026-08-17')));
  ok('and present on Wednesday', tueWedThu.includes(T.weekdayOf('2026-08-19')));
}

/* --- Calendar maths crosses month and year boundaries --------------------- */
{
  check('adding a day crosses a month', T.addDays('2026-08-31', 1), '2026-09-01');
  check('adding a week crosses a year', T.addDays('2026-12-28', 7), '2027-01-04');
  check('going back a day crosses a month', T.addDays('2026-09-01', -1), '2026-08-31');
  check('leap day exists in 2028', T.addDays('2028-02-28', 1), '2028-02-29');
}

/* --- The palette lives in exactly one file -------------------------------- */
{
  const root = path.join(__dirname, '..');
  const offenders = [];
  const skip = new Set(['node_modules', 'data', '.git', 'brand', 'icons']);

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|css|html)$/.test(entry.name)) continue;
      if (full.endsWith(path.join('public', 'theme.css'))) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const line of text.split('\n')) {
        // Ignore the regexes in theme.js that parse hex, and hex-length checks.
        if (/#[0-9A-Fa-f]{6}\b/.test(line) && !/0-9A-Fa-f|randomBytes|toString\('hex'\)/.test(line)) {
          offenders.push(`${path.relative(root, full)}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
  })(root);

  if (offenders.length) failures.push(`  hex literals outside theme.css\n      ${offenders.join('\n      ')}`);
  check('no hex literals outside theme.css', offenders.length, 0);
}

/* --- Scheduled publishing -------------------------------------------------
   The moment is computed from the week's start date, so a schedule change
   moves every week that has not gone out yet. It has to land on the configured
   weekday BEFORE the week starts, at local wall-clock time, on both sides of
   the daylight-saving boundary — noon must stay noon in November. */
{
  const P = require('../server/publish');
  const { settings } = require('../server/db');
  settings.set('auto_publish', 1);
  settings.set('auto_publish_weekday', 'sat');
  settings.set('auto_publish_time', '12:00');
  settings.set('timezone', 'America/Toronto');

  const draft = (over) => ({
    id: -1, status: 'draft', auto_publish: 1, week_start: '2026-08-24', ...over,
  });

  const local = (instant) => T.fmtLocal(instant, 'America/Toronto',
    { weekday: 'short', month: 'short', day: 'numeric' });

  const summer = P.scheduledFor(draft());
  ok('a week starting Monday publishes the Saturday before',
    local(summer).includes('Sat') && local(summer).includes('22'), local(summer));
  ok('at noon local', local(summer).includes('12:00'), local(summer));

  // Toronto leaves daylight saving on 1 November 2026, so a week starting
  // Monday 9 November schedules on Saturday 7 November — still EDT — and a
  // week starting Monday 16 November schedules in EST. Both must read 12:00.
  const beforeChange = P.scheduledFor(draft({ week_start: '2026-11-02' }));
  const afterChange = P.scheduledFor(draft({ week_start: '2026-11-16' }));
  ok('noon stays noon before the clocks change', local(beforeChange).includes('12:00'), local(beforeChange));
  ok('and after them', local(afterChange).includes('12:00'), local(afterChange));
  ok('which is a different UTC hour on each side of the boundary',
    (beforeChange.getUTCHours() !== afterChange.getUTCHours()));

  check('a published week has no schedule', P.scheduledFor(draft({ status: 'published' })), null);
  check('nor does a week opted out of it', P.scheduledFor(draft({ auto_publish: 0 })), null);
  check('nor does one with no start date', P.scheduledFor(draft({ week_start: null })), null);

  settings.set('auto_publish', 0);
  check('nor any week when the schedule is switched off', P.scheduledFor(draft()), null);
  settings.set('auto_publish', 1);

  settings.set('auto_publish_weekday', 'thu');
  settings.set('auto_publish_time', '09:30');
  const moved = P.scheduledFor(draft());
  ok('changing the schedule moves an existing draft',
    local(moved).includes('Thu') && local(moved).includes('20'), local(moved));
  ok('to the new time', local(moved).includes('9:30'), local(moved));
  settings.set('auto_publish_weekday', 'sat');
  settings.set('auto_publish_time', '12:00');
}

/* --- Closing a day, and closing a week ------------------------------------
   Closed is not blank. A blank day is undecided and shows nothing; a closed
   one is a decision, is shown to customers, carries no menu at all — not even
   the standing items, which are otherwise available every service day — and
   is not something the allergen gate may hold hostage. */
{
  const P = require('../server/publish');
  const M = require('../server/menu');

  const weekId = db.prepare(`INSERT INTO weeks (slug, title, status, week_start)
    VALUES ('closed-test','Closed test','draft','2026-08-24')`).run().lastInsertRowid;
  const insDay = db.prepare(`INSERT INTO service_days
    (week_id, service_date, dish_name, description, ack, ack_of, closed, closed_note, full_on, full_price)
    VALUES (?,?,?,?,?,?,?,?,1,1800)`);

  // A reviewed standing item, so "closed hides even the always-available
  // things" is proved against something that would otherwise be there.
  const standingId = db.prepare(`INSERT INTO standing_items
    (name, subcategory, description, availability, sort, full_on, full_price, ack, ack_of)
    VALUES ('Test Chili','Mains','','every_service_day',99,1,1400,1,?)`)
    .run(A.reviewedText({ name: 'Test Chili', description: '' })).lastInsertRowid;

  const week = () => db.prepare('SELECT * FROM weeks WHERE id = ?').get(weekId);
  const dayOn = (date) => db.prepare('SELECT * FROM service_days WHERE week_id=? AND service_date=?')
    .get(weekId, date);

  // Monday: cooking, reviewed. Tuesday: closed, and deliberately left with an
  // unreviewed dish name on it to prove the gate ignores what nobody can order.
  insDay.run(weekId, '2026-08-24', 'Roast chicken', 'Chicken, potatoes',
    1, A.reviewedText({ name: 'Roast chicken', description: 'Chicken, potatoes' }), 0, '');
  insDay.run(weekId, '2026-08-25', 'Beer-battered haddock', '', 0, null, 1, 'Back Wednesday');

  const openMenu = M.menuForDay(week(), dayOn('2026-08-24'));
  check('an open day still carries its featured dish', openMenu.featured.name, 'Roast chicken');
  ok('and the standing items that run that day',
    openMenu.allItems.some((i) => i.name === 'Test Chili'));

  const shutMenu = M.menuForDay(week(), dayOn('2026-08-25'));
  ok('a closed day says so', shutMenu.closed);
  check('its note is carried to the customer', shutMenu.closedNote, 'Back Wednesday');
  check('it offers no featured dish', shutMenu.featured, null);
  check('and nothing else either — not even the standing items', shutMenu.allItems.length, 0);

  check('an unreviewed dish on a closed day does not block publishing', P.blockers(weekId), []);
  check('and a week with a closed day on it is not an empty week', P.isEmpty(weekId), false);

  // The same dish, reopened, is exactly the blocker it always was.
  db.prepare('UPDATE service_days SET closed=0 WHERE week_id=? AND service_date=?')
    .run(weekId, '2026-08-25');
  check('reopening the day brings its allergen review back', P.blockers(weekId).length, 1);
  db.prepare('UPDATE service_days SET closed=1 WHERE week_id=? AND service_date=?')
    .run(weekId, '2026-08-25');

  // Closing the whole week.
  db.prepare('UPDATE weeks SET closed=1, closed_note=? WHERE id=?').run('Away for a wedding', weekId);
  const closedWeekMenu = M.menuForDay(week(), dayOn('2026-08-24'));
  ok('closing the week closes a day that was cooking', closedWeekMenu.closed);
  check('and the week note stands in for a day note', closedWeekMenu.closedNote, 'Away for a wedding');
  check('a closed week has nothing to review', P.blockers(weekId), []);
  check('and is not empty — a closure is something to show', P.isEmpty(weekId), false);

  // A blank week, by contrast, is still empty: that distinction is the whole
  // reason the flag exists rather than being inferred from having no dishes.
  const blankId = db.prepare(`INSERT INTO weeks (slug, title, status, week_start)
    VALUES ('blank-test','Blank test','draft','2026-09-07')`).run().lastInsertRowid;
  check('a week with nothing on it is still empty', P.isEmpty(blankId), true);

  db.prepare('DELETE FROM service_days WHERE week_id = ?').run(weekId);
  db.prepare('DELETE FROM weeks WHERE id IN (?,?)').run(weekId, blankId);
  db.prepare('DELETE FROM standing_items WHERE id = ?').run(standingId);
}

/* --- The reminder for a week nobody built ---------------------------------
   The refusal email needs a draft week to refuse. Nothing built at all is
   invisible to it, so it is watched separately: two days before the publish
   moment by default, once, and never for a week that is built or closed. */
{
  const P = require('../server/publish');
  const { settings } = require('../server/db');
  settings.set('auto_publish_weekday', 'sat');
  settings.set('auto_publish_time', '12:00');
  settings.set('remind_missing_week', '1');
  settings.set('remind_missing_week_days', '2');
  settings.set('missing_week_warned_for', '');

  // Thursday 20 August 2026, noon — two days before the Saturday that would
  // publish the week starting Monday the 24th.
  const thursdayNoon = T.zonedToUtc(2026, 8, 20, 12, 0, TZ);
  const thursdayJustBefore = T.zonedToUtc(2026, 8, 20, 11, 59, TZ);

  check('nothing is asked before the moment arrives', P.missingWeek(thursdayJustBefore), null);
  const miss = P.missingWeek(thursdayNoon);
  ok('at the moment, the week ahead is named', miss && miss.weekStart === '2026-08-24',
    JSON.stringify(miss));

  // Opening This Week creates an empty draft. That must not count as built —
  // it is the single most likely way to be lulled into missing a week.
  const emptyId = db.prepare(`INSERT INTO weeks (slug, title, status, week_start)
    VALUES ('reminder-empty','Empty','draft','2026-08-24')`).run().lastInsertRowid;
  ok('an empty draft does not count as a week', !!P.missingWeek(thursdayNoon));

  db.prepare(`INSERT INTO service_days (week_id, service_date, dish_name)
    VALUES (?, '2026-08-24', 'Roast chicken')`).run(emptyId);
  check('a dish on it does', P.missingWeek(thursdayNoon), null);

  // Closing counts as answering. Somebody who is not cooking has decided, and
  // being nagged about it weekly would teach them to ignore the email.
  db.prepare('DELETE FROM service_days WHERE week_id = ?').run(emptyId);
  db.prepare('UPDATE weeks SET closed=1 WHERE id=?').run(emptyId);
  check('and so does closing the week', P.missingWeek(thursdayNoon), null);

  db.prepare('DELETE FROM weeks WHERE id = ?').run(emptyId);
  ok('deleting it again puts the question back', !!P.missingWeek(thursdayNoon));

  // Once, not every minute.
  let asked = 0;
  P.runMissingWeek({ now: thursdayNoon, onMissing: () => { asked++; } });
  P.runMissingWeek({ now: thursdayNoon, onMissing: () => { asked++; } });
  P.runMissingWeek({ now: T.zonedToUtc(2026, 8, 21, 9, 0, TZ), onMissing: () => { asked++; } });
  check('asked exactly once for the same week', asked, 1);

  settings.set('remind_missing_week', '0');
  settings.set('missing_week_warned_for', '');
  check('and not at all when switched off', P.missingWeek(thursdayNoon), null);
  settings.set('remind_missing_week', '1');
}

/* --- Saved dishes, and the one thing they must never carry ------------------
   A dish can be kept and put on another day. The acknowledgement cannot: it
   says the owner checked THIS dish for the menu it is going on, and a copy of
   that sentence attached to a different week is how an untagged allergen
   reaches somebody. Everything else travels so the re-review is one tap. */
{
  const DISH = require('../server/dishes');
  db.prepare('DELETE FROM saved_dishes').run();

  const source = {
    dish_name: 'Braised Beef', description: 'Slow braised with buttered mash',
    photo: 'abc123.jpg', halal: 0, allergens: '["milk"]', dismissed: '["gluten"]',
    ack: 1, ack_of: 'Braised Beef\nSlow braised with buttered mash',
    full_on: 1, full_label: 'Full size', full_price: 2200, full_cap: 8,
    single_on: 1, single_label: 'Meal for one', single_price: 1400, single_cap: null,
  };

  check('a dish is saved', DISH.save({ ...source, name: source.dish_name }), 'saved');
  check('and saving it again writes over it', DISH.save({ ...source, name: 'Braised Beef' }), 'updated');
  check('so the list holds one of it', DISH.count(), 1);
  check('the name match ignores case', DISH.save({ ...source, name: 'braised beef' }), 'updated');
  check('still one', DISH.count(), 1);
  check('a dish with no name is not filed', DISH.save({ name: '   ' }), null);

  const saved = DISH.all()[0];
  check('the description travels', saved.description, 'Slow braised with buttered mash');
  check('the price travels', saved.full_price, 2200);
  check('the accepted allergens travel', saved.allergens, '["milk"]');
  check('the dismissed suggestions travel too', saved.dismissed, '["gluten"]');
  ok('but the acknowledgement is not even a column', !('ack' in saved) && !('ack_of' in saved));

  const cols = DISH.asDayColumns(saved);
  check('a day written from it is unacknowledged', cols.ack, 0);
  check('with nothing recorded as reviewed', cols.ack_of, null);
  check('and still carries the tags', cols.allergens, '["milk"]');

  // End to end: onto a day that was already reviewed for something else.
  const wid = db.prepare(`INSERT INTO weeks (slug, title) VALUES ('sd-week','SD')`).run().lastInsertRowid;
  const did = db.prepare(`INSERT INTO service_days
    (week_id, service_date, dish_name, description, ack, ack_of)
    VALUES (?,?,?,?,1,?)`)
    .run(wid, '2026-09-04', 'Something Else', 'and its description',
      'Something Else\nand its description').lastInsertRowid;

  DISH.applyToDay(saved.id, did);
  const day = db.prepare('SELECT * FROM service_days WHERE id = ?').get(did);
  check('the dish lands on the day', day.dish_name, 'Braised Beef');
  check('with its price', day.full_price, 2200);
  check('and the review the day used to hold is cleared', day.ack, 0);
  check('including what it was given against', day.ack_of, null);
  ok('so the day cannot publish until it is reviewed again',
    !A.reviewState(day).ok && A.reviewState(day).reason === 'not_acknowledged');
  check('and the dish counts a use', DISH.byId(saved.id).used_count, 1);

  // Publishing files the week's dishes without needing to be asked.
  db.prepare('DELETE FROM saved_dishes').run();
  db.prepare(`INSERT INTO service_days (week_id, service_date, dish_name, closed)
    VALUES (?,?,?,0)`).run(wid, '2026-09-05', 'Chicken Pie');
  db.prepare(`INSERT INTO service_days (week_id, service_date, dish_name, closed)
    VALUES (?,?,?,1)`).run(wid, '2026-09-06', 'Never Cooked');
  check('publishing keeps the dishes that ran', DISH.saveFromWeek(wid), 2);
  const names = DISH.all().map((d) => d.name).sort();
  check('and skips the closed day', names, ['Braised Beef', 'Chicken Pie']);

  ok('a saved dish can be removed', DISH.remove(DISH.all()[0].id));
  db.prepare('DELETE FROM saved_dishes').run();

  /* Soups, salads and desserts keep the same way, and land on the week
     rather than on a day. */
  check('a soup keeps under its own kind',
    DISH.save({ kind: 'soup', name: 'Potato Leek', description: 'with chives',
      full_on: 1, full_price: 1200 }), 'saved');
  check('and a main may answer to the same name without colliding',
    DISH.save({ kind: 'main', name: 'Potato Leek', description: 'a main, somehow',
      full_on: 1, full_price: 4000 }), 'saved');
  check('so both are on the list', DISH.count(), 2);
  check('filtered by kind, one each', DISH.all({ kind: 'soup' }).length, 1);
  check('and the counts agree', DISH.countsByKind().soup, 1);

  // A week that already says which days its soup runs keeps that choice when
  // a different soup is swapped in.
  db.prepare(`INSERT INTO week_items (week_id, kind, name, ack, ack_of, weekdays)
    VALUES (?,'soup','Old Soup',1,'Old Soup
','["tue","wed"]')`).run(wid);
  const savedSoup = DISH.all({ kind: 'soup' })[0];
  DISH.applyToWeek(savedSoup.id, wid);
  const wi = db.prepare("SELECT * FROM week_items WHERE week_id = ? AND kind = 'soup'").get(wid);
  check('the soup lands on the week', wi.name, 'Potato Leek');
  check('with its price', wi.full_price, 1200);
  check('the review it used to hold is cleared', wi.ack, 0);
  check('the days it runs on belong to the week, not the recipe', wi.weekdays, '["tue","wed"]');
  check('and the soup counts a use', DISH.byId(savedSoup.id).used_count, 1);

  ok('a main cannot be applied to a week', DISH.applyToWeek(
    DISH.all({ kind: 'main' })[0].id, wid) === null);

  // The mirror of that: a soup must not be able to land on a day as its
  // featured dish. applyToDay is reached from a form body, so the kind is
  // checked in the route; this guards the shape the route relies on.
  check('a saved soup knows it is a soup', savedSoup.kind, 'soup');

  // Publishing files the week items too, not only the days.
  db.prepare('DELETE FROM saved_dishes').run();
  // Two open days plus the week's soup. The closed day is still skipped.
  check('publishing keeps the week items as well as the days', DISH.saveFromWeek(wid), 3);
  check('filed under both kinds',
    [...new Set(DISH.all().map((d) => d.kind))].sort(), ['main', 'soup']);

  db.prepare('DELETE FROM week_items WHERE week_id = ?').run(wid);
  db.prepare('DELETE FROM saved_dishes').run();
  db.prepare('DELETE FROM service_days WHERE week_id = ?').run(wid);
  db.prepare('DELETE FROM weeks WHERE id = ?').run(wid);
}

/* --- Words the matcher cannot split ----------------------------------------
   The inflection rule tolerates a trailing plural and a past participle, so
   "buttered" finds butter. It cannot see a word fused to the next one, and
   nothing warns you: "cheesecake" raised no milk, no anything, while "cheese
   cake" read perfectly. The fix is dictionary entries, not looser matching —
   substring matching would find butter inside butternut. */
{
  const expect = [
    ['Cheesecake with berries', 'milk'],
    ['Vanilla milkshake', 'milk'],
    ['Carrot cake with buttercream', 'milk'],
    ['Philly cheesesteak', 'milk'],
    ['Scalloped potatoes', 'milk'],
    ['Almondmilk latte', 'tree nuts'],
    ['Oatmeal cookies', 'gluten'],
    ['Sourdough loaf', 'wheat and triticale'],
    ['Flatbread with dip', 'wheat and triticale'],
    ['Shortbread', 'wheat and triticale'],
    ['Chicken fettuccine', 'wheat and triticale'],
    ['Vegetable tempura', 'wheat and triticale'],
    ['Belgian waffles', 'eggs'],
    ['Caesar salad', 'fish'],
  ];
  for (const [text, allergen] of expect) {
    ok(`${JSON.stringify(text)} raises ${allergen}`,
      A.detect(text).some((h) => h.allergen === allergen),
      `got: ${A.detect(text).map((h) => h.allergen).join(', ') || 'nothing'}`);
  }

  // The boundary the word-boundary rule exists to hold. A squash is not a nut
  // and nutmeg is not a nut, and no amount of wanting to catch "cheesecake"
  // is worth finding butter inside butternut.
  const raises = (t, a) => A.detect(t).some((h) => h.allergen === a);
  ok('butternut squash is not butter', !raises('Butternut squash soup', 'milk'));
  ok('and not a tree nut either', !raises('Butternut squash soup', 'tree nuts'));
  ok('nutmeg is not a tree nut', !raises('Nutmeg and cinnamon', 'tree nuts'));
  ok('buttercup squash is not butter', !raises('Buttercup squash', 'milk'));
  ok('a porterhouse steak is not beer', !raises('Porterhouse steak', 'gluten'));
  ok('but a stout still is', raises('Stout braised beef', 'gluten'));
}

/* --- The words this kitchen actually uses ----------------------------------
   Chosen by reading the 817 saved dishes rather than by imagining a menu. Each
   of these appears on the list, and each raised nothing at all before: 42% of
   the saved dishes were silent, now 36%. The rest are silent because they are
   genuinely clean — a roast beef has no allergen in its name and should not
   invent one.

   Every entry is still only a suggestion. Nothing here can tag a dish; it can
   only put a chip in front of Derek, and a wrong one costs him a tap. */
{
  const raises = (t, a) => A.detect(t).some((h) => h.allergen === a);
  const expect = [
    ['BBQ Glazed Meatloaf', 'wheat and triticale'],   // breadcrumbs bind it
    ['BBQ Glazed Meatloaf', 'eggs'],
    ['Italian Meatballs', 'wheat and triticale'],
    ['Chocolate Pudding Cake', 'milk'],               // 23 dishes, 20 silent
    ['Chocolate Pudding Cake', 'soy'],                // lecithin in the bar
    ['Chocolate Pudding Cake', 'eggs'],               // the cake, not the choc
    ['Chicken Pot Pie', 'wheat and triticale'],
    ['Beef Wellington', 'gluten'],
    ['Curried Vegetable Turnovers', 'wheat and triticale'],
    ['Beef Fajita Burritos', 'gluten'],
    ['Chicken Cordon Swiss Melts', 'milk'],
    ['Chicken Cordon Swiss Melts', 'wheat and triticale'],
    ['Spanakopita', 'milk'],
    ['Spanakopita', 'gluten'],
    ['Beef Braciole', 'wheat and triticale'],
    ['Apple Cobbler', 'wheat and triticale'],
    ['Sausage Stuffing', 'gluten'],
    ['Poutine', 'milk'],
    ['Beef Stroganoff', 'milk'],
    ['Chicken Alfredo', 'milk'],
    ['Bacon Cheeseburgers', 'wheat and triticale'],
    // Rouladen is spread with mustard before it is rolled, and mustard is a
    // priority allergen that the dish name is the only mention of.
    ['Beef Rouladen', 'mustard'],
    // The two fused compounds named in the audit and missing everywhere.
    ['Fishcakes with dill', 'fish'],
    ['Nutloaf', 'tree nuts'],
    ['Crabcakes', 'crustaceans and molluscs'],
  ];
  for (const [text, allergen] of expect) {
    ok(`${JSON.stringify(text)} raises ${allergen}`, raises(text, allergen),
      `got: ${A.detect(text).map((h) => h.allergen).join(', ') || 'nothing'}`);
  }

  /* The boundaries these additions must not cross. A taco is a corn tortilla
     where a burrito is a flour one, and a shepherd's pie is topped with mashed
     potato rather than pastry — so neither inherits wheat from its neighbour. */
  ok('a beef taco is not a burrito', !raises('Beef Tacos', 'wheat and triticale'));
  ok('a shepherds pie is not a pot pie', !raises('Shepherds Pie', 'wheat and triticale'));
  ok('a roast beef stays clean', A.detect('Roast Beef').length === 0);
  ok('and a ratatouille does too', A.detect('Ratatouille').length === 0);
}

/* --- A dictionary fix has to reach a database that already exists ----------
   The checks above passed for months while the live dictionary raised nothing
   for "cheesecake". The seed ran only when allergen_terms was empty, so a word
   added to allergen-seed.js after a database was created never arrived in it —
   and every suite builds a fresh database, which is the one state where the
   old gate looked right.

   So the seed is re-applied on every boot. These checks stand on the two halves
   of that being safe: a word added later turns up, and a word the owner threw
   out stays out. */
{
  const { seedAllergenTerms } = require('../server/db');
  const present = (t, a) => !!db.prepare(
    'SELECT 1 FROM allergen_terms WHERE term=? AND allergen=?').get(t, a);

  // A term the seed carries, deleted the way the dashboard deletes it, without
  // the headstone the route writes. This is a database that predates the term.
  db.prepare('DELETE FROM allergen_terms WHERE term=? AND allergen=?').run('cheesecake', 'milk');
  ok('a seeded term can be missing from an existing database', !present('cheesecake', 'milk'));

  seedAllergenTerms();
  ok('re-seeding brings it back', present('cheesecake', 'milk'));
  ok('and the dish that exposed the gap now raises milk',
    A.detect('Cheesecake with berries').some((h) => h.allergen === 'milk'));

  // The other half. Removing a word has to survive the re-seed, or the owner
  // fights the same false suggestion after every restart.
  db.prepare('DELETE FROM allergen_terms WHERE term=? AND allergen=?').run('vinegar', 'sulphites');
  db.prepare('INSERT OR IGNORE INTO allergen_terms_removed (term, allergen) VALUES (?,?)')
    .run('vinegar', 'sulphites');
  seedAllergenTerms();
  ok('a term the owner removed is not put back', !present('vinegar', 'sulphites'));
  ok('and removing one term does not disturb its neighbours',
    present('balsamic', 'sulphites'));

  // Adding it again by hand clears the headstone, the way the add route does.
  db.prepare('INSERT OR IGNORE INTO allergen_terms (term, allergen) VALUES (?,?)')
    .run('vinegar', 'sulphites');
  db.prepare('DELETE FROM allergen_terms_removed WHERE term=? AND allergen=?')
    .run('vinegar', 'sulphites');
  seedAllergenTerms();
  ok('adding it back makes it stick', present('vinegar', 'sulphites'));

  // Re-running must not multiply rows: UNIQUE(term, allergen) carries this, and
  // a duplicate would show up as a repeated chip on every dish.
  const before = db.prepare('SELECT COUNT(*) n FROM allergen_terms').get().n;
  seedAllergenTerms();
  seedAllergenTerms();
  check('re-seeding twice more changes nothing',
    db.prepare('SELECT COUNT(*) n FROM allergen_terms').get().n, before);
}

/* --- A price box that doesn't hold a price ---------------------------------
   Blank leaves the size off the menu. Anything unreadable has to do the same:
   the stripping that lets "$22.00" through also reduced "free" to nothing,
   and nothing parsed as 0, which is a price a customer can pay. */
{
  const IF = require('../server/itemform');
  check('a plain price', IF.cents('22.00'), 2200);
  check('a price with a currency symbol', IF.cents('$22.00'), 2200);
  check('a price with stray spaces', IF.cents(' 22.00 '), 2200);
  check('an empty box is not a price', IF.cents(''), null);
  check('and neither is "free"', IF.cents('free'), null);
  check('nor a lone currency symbol', IF.cents('$'), null);
  check('nor "ask"', IF.cents('ask'), null);
  check('nor a mistyped number', IF.cents('1.2.3'), null);
  check('zero is still a real price, if it is typed', IF.cents('0'), 0);

  // The reason it matters: a null price leaves the variant off the menu
  // entirely, where a 0 would have put it there orderable at $0.00.
  const M = require('../server/menu');
  const priced = M.toRenderItem(
    { id: 1, full_on: 1, full_price: IF.cents('free'), single_on: 0, allergens: '[]' },
    { level: 'Featured', refTable: 'service_days', subcategory: 'Featured', name: 'Beef' });
  check('an unreadable price puts no orderable size on the menu', priced.variants.length, 0);
}

/* --- A settings row that isn't a number ------------------------------------
   getInt used to return NaN, which reaches the clock and throws from inside
   Intl — a 500 on every customer page from one bad row. */
{
  const { settings } = require('../server/db');
  const M = require('../server/menu');
  const saved = settings.get('cutoff_hour');

  settings.set('cutoff_hour', 'x');
  check('an unreadable setting falls back', settings.getInt('cutoff_hour', 22), 22);
  settings.set('cutoff_hour', '');
  check('an emptied setting falls back too', settings.getInt('cutoff_hour', 22), 22);
  settings.set('cutoff_hour', '0');
  check('but a real zero is kept', settings.getInt('cutoff_hour', 22), 0);
  check('a missing key falls back', settings.getInt('no_such_setting_at_all', 7), 7);
  settings.set('cutoff_hour', '21');
  check('and an ordinary value is read', settings.getInt('cutoff_hour', 22), 21);

  // The failure this prevents, end to end: the clock must still answer.
  settings.set('cutoff_hour', 'nonsense');
  let state = null, threw = null;
  try { state = T.dayState('2026-08-21', M.clock(new Date('2026-08-20T12:00:00Z'))); }
  catch (e) { threw = e; }
  ok('the day still has a state rather than throwing', !threw, threw && threw.message);
  ok('and the cutoff is a real instant', state && !Number.isNaN(state.cutoff.getTime()));

  settings.set('cutoff_hour', saved);
}

/* --- A lookup that says yes to a word it has never heard of -----------------
   Every object in JavaScript inherits constructor, toString, valueOf and
   __proto__, so `TABLE[name]` returns something truthy for four names nobody
   defined. The app had this four times: the graphics set (found and fixed
   earlier), the delivery strategy, the saved-dish sort order, and the kind of a
   week item. Each one guarded something different and each was bypassable the
   same way.

   The consequences ran from harmless to lasting. The sort order interpolates
   into an ORDER BY clause. The delivery strategy is read on every order and
   appears on no form, so a bad value could not be corrected from the dashboard
   at all.

   These check the inherited names by name, on every table that takes one from
   outside. A fifth table added later will not be caught by this — it is caught
   by the settings check below, and by the fix being the same two lines in each
   place, so the next reviewer has four examples to copy. */
{
  const DANGEROUS = ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'];
  const DISH = require('../server/dishes');
  const { settings } = require('../server/db');
  const savedStrategy = settings.get('delivery_strategy');

  for (const name of DANGEROUS) {
    // The delivery strategy: a value only a restored backup could ever write.
    settings.set('delivery_strategy', name);
    const r = D.check('N2L 3G1');
    ok(`delivery still answers with delivery_strategy=${name}`,
      r && typeof r.ok === 'boolean');

    // The sort order, which ends up inside SQL text.
    let rows = null, threw = null;
    try { rows = DISH.all({ sort: name }); } catch (e) { threw = e; }
    ok(`the dish list still sorts with sort=${name}`, !threw && Array.isArray(rows),
      threw && threw.message);

    // A settings key nobody defined is not stored under any name.
    check(`guard() refuses the key ${name}`, settings.guard(name, 'x'), null);
  }

  if (savedStrategy === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run('delivery_strategy');
  } else {
    settings.set('delivery_strategy', savedStrategy);
  }

  // And the one real value still selects the one real strategy.
  settings.set('delivery_strategy', 'postal_code');
  ok('the configured strategy is still the one that runs',
    D.check('N2L 3G1').ok === true || D.check('N2L 3G1').reason === 'out_of_area');
  if (savedStrategy === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run('delivery_strategy');
  }
}

/* --- The settings allow-list has to know every key the app uses -------------
   guard() now refuses a key that is not on the list, which is what stops a
   restored backup writing whatever it likes. The cost of that is a list which
   goes stale: add a setting, forget this, and the Settings form saves it while
   a restore silently drops it — a difference nobody would look for.

   So the list is checked against the code rather than against itself. Every
   settings key literal in server/ has to be on it. */
{
  const { settings } = require('../server/db');
  const dir = path.join(__dirname, '..', 'server');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  })(dir);

  const used = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8')
      .matchAll(/settings\.(?:get|getInt|set)\('([a-z0-9_]+)'/g)) used.add(m[1]);
  }

  ok('the sweep found the settings keys at all', used.size > 20);
  for (const k of [...used].sort()) {
    ok(`the allow-list knows about ${k}`, settings.ALLOWED.has(k));
  }
}

/* --- A CSV cell is data, never a formula -----------------------------------
   Four of the exported columns are typed by the customer. A spreadsheet reads
   a leading = + - @ as the start of a formula, so those have to reach Derek's
   machine as the text he was sent, not as something his spreadsheet runs. */
{
  const X = require('../server/exports');
  const cell = (v, numericCols = []) => X.csv([[v]], numericCols)
    .replace(/^﻿/, '').replace(/\r\n$/, '');

  for (const payload of ['=1+1', '+15195550100', '@A1', '-1+1', '\tSUM(A1)']) {
    ok(`${JSON.stringify(payload)} is defused`, cell(payload).startsWith("'"));
  }
  check('a formula with a comma is defused AND still quoted',
    cell('=HYPERLINK("x",A1)'), `"'=HYPERLINK(""x"",A1)"`);

  // The other half of the job: ordinary values must come through untouched,
  // or the export stops being readable to make it safe.
  for (const plain of ['Derek Hines', '519-555-0100', 'a@b.ca', 'Nut allergy']) {
    check(`${JSON.stringify(plain)} is left alone`, cell(plain), plain);
  }
  check('an equals sign mid-cell is not a formula', cell('table=4'), 'table=4');

  // Numeric columns stay bare so Excel still sums them.
  check('numbers are not quoted or prefixed', cell('22.00', [0]), '22.00');
  check('and a negative number in a numeric column is left summable',
    cell('-5.00', [0]), '-5.00');

  // Through the real export, not just the helper.
  db.prepare(`INSERT INTO orders (ref,service_date,status,name,phone,email,allergy_notes,
    method,subtotal,delivery_fee,total,payment_method)
    VALUES ('CSVTEST1','2026-08-21','confirmed',?,?,?,?,'pickup',2200,0,2200,'cash')`)
    .run('=1+1', '+1519', '@A1', '-1');
  const oid = db.prepare(`SELECT id FROM orders WHERE ref='CSVTEST1'`).get().id;
  db.prepare(`INSERT INTO order_lines (order_id,source_level,ref_table,ref_id,item_name,
    subcategory,variant,variant_label,unit_price,qty)
    VALUES (?,'Featured','service_days',1,'Beef','Featured','full','Full size',2200,1)`).run(oid);

  const row = X.ordersCsv({ date: '2026-08-21' }).split('\r\n')[1].split(',');
  check('the exported customer name is defused', row[1], "'=1+1");
  check('the phone too', row[2], "'+1519");
  check('the email too', row[3], "'@A1");
  check('the allergy notes too', row[18], "'-1");
  check('and the line total is still a bare number', row[9], '22.00');

  db.prepare(`DELETE FROM order_lines WHERE order_id=?`).run(oid);
  db.prepare(`DELETE FROM orders WHERE id=?`).run(oid);
}

/* --- How the password is stored -------------------------------------------
   Stored hashed when ADMIN_PASSWORD_HASH is set, so the file that survives a
   backup, a screen share or a stray copy doesn't hand over the dashboard. */
{
  const PW = require('../server/password');
  const hash = PW.hash('a-long-enough-password');

  ok('the right password is recognised', PW.matchesSync('a-long-enough-password', hash));
  ok('a wrong one is not', !PW.matchesSync('a-long-enough-passwore', hash));
  ok('and neither is the empty string', !PW.matchesSync('', hash));

  const parts = hash.split('$');
  check('the stored form names its algorithm', parts[0], 'scrypt');
  check('and carries its own cost, so it can be raised later', parts.slice(1, 4), ['16384', '8', '1']);

  ok('the same password hashes differently every time',
    PW.hash('a-long-enough-password') !== hash);
  ok('a hash that has been damaged refuses everything',
    !PW.matchesSync('a-long-enough-password', hash.slice(0, -4)));
  ok('and so does a string that was never a hash',
    !PW.matchesSync('a-long-enough-password', 'plaintext'));
}

/* --- What a session is signed against -------------------------------------
   The cookie is bound to the password, not only to SESSION_SECRET. Changing
   the password has to end the sessions it authorised: without that, a leaked
   cookie outlived its password by up to a month and the only lever that
   actually worked was rotating the secret. */
{
  const crypto = require('crypto');
  const auth = require('../server/auth');

  const sessionFor = (secret, verifier) => {
    const key = crypto.createHmac('sha256', secret)
      .update(`dbd-session-v1:${verifier}`).digest();
    const payload = `admin:${Date.now()}`;
    return `${payload}.${crypto.createHmac('sha256', key).update(payload).digest('base64url')}`;
  };
  const secret = process.env.SESSION_SECRET;
  /* Whatever the password is stored as: the hash where there is one, the
   * plaintext otherwise. Reading ADMIN_PASSWORD directly held only in the
   * plaintext setup, and started failing the moment .env moved to a hash —
   * which is the configuration the server is supposed to run in. */
  const password = require('../server/config').adminVerifier;

  ok('a session signed under the current password is accepted',
    auth.verify(sessionFor(secret, password)));
  ok('the same session is refused once the password changes',
    !auth.verify(sessionFor(secret, 'whatever-derek-changes-it-to')));
  ok('rotating the secret still retires it too',
    !auth.verify(sessionFor('a-different-secret', password)));

  const good = sessionFor(secret, password);
  ok('a session with its signature altered is refused',
    !auth.verify(good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A')));
  ok('and one carrying no signature at all is refused', !auth.verify('admin:' + Date.now()));

  const old = `admin:${Date.now() - 31 * 24 * 60 * 60 * 1000}`;
  const key = crypto.createHmac('sha256', secret)
    .update(`dbd-session-v1:${password}`).digest();
  ok('a correctly signed session still expires after a month',
    !auth.verify(`${old}.${crypto.createHmac('sha256', key).update(old).digest('base64url')}`));
}

/* --- Refused sign-ins are written down, and eventually said out loud -------
   The rate limiter forgets on restart and tells nobody. This is the part that
   survives, so a run of guesses is something the owner can see happened. */
{
  const S = require('../server/signin');
  const { settings } = require('../server/db');
  const now = Date.UTC(2026, 7, 18, 12, 0);

  db.prepare('DELETE FROM login_failures').run();
  check('nothing to report when nothing has happened', S.notice(now), null);
  check('and no delay is charged', S.delayFor(now), 0);

  const at = (minsAgo) => now - minsAgo * 60_000;
  for (let i = 0; i < 4; i++) S.record('203.0.113.5', at(30 + i));
  check('four in an hour is still under the notice threshold', S.notice(now), null);
  ok('but the fifth attempt has started costing time', S.delayFor(now) > 0);

  S.record('203.0.113.6', at(20));
  const n = S.notice(now);
  ok('five in a day is worth saying', !!n);
  check('counted in full', n.count, 5);
  check('and the addresses are counted apart', n.addresses, 2);

  // Old failures fall out of the window rather than accumulating forever.
  db.prepare('DELETE FROM login_failures').run();
  for (let i = 0; i < 10; i++) S.record('203.0.113.7', now - 2 * S.DAY_MS);
  check('yesterday-but-one is not today\'s news', S.notice(now), null);

  // The delay is bounded: a flood must not hold every connection open.
  db.prepare('DELETE FROM login_failures').run();
  for (let i = 0; i < 500; i++) S.record('203.0.113.8', at(5));
  ok('the delay is capped however many arrive', S.delayFor(now) <= 2000);

  // One alert an hour, no matter how bad the hour gets.
  settings.set('signin_alert_hour', '');
  ok('a bad hour is worth an email', S.shouldAlert(now));
  ok('but only the one', !S.shouldAlert(now));
  // An hour later, still under attack: a fresh hour earns a fresh email.
  const later = now + S.HOUR_MS;
  for (let i = 0; i < 30; i++) S.record('203.0.113.8', later - 60_000);
  ok('and the next hour gets its own', S.shouldAlert(later));

  db.prepare('DELETE FROM login_failures').run();
  settings.set('signin_alert_hour', '');
  ok('a quiet hour is not worth an email', !S.shouldAlert(now));
}

/* --- Restoring a backup ----------------------------------------------------
   The one route that writes to every table at once, from a file. It runs last
   here because it empties those tables on its way in — and it puts everything
   back at the end, which is the round trip it exists to do.

   Two things it must not do: build SQL out of names the file chose, and store
   a value that stops the app rendering. */
{
  const X = require('../server/exports');
  const { settings } = require('../server/db');
  const good = X.backup();                       // the state everything above left

  const wrap = (extra) => JSON.stringify({ format: 'dinner-by-derek-backup', ...extra });
  const refuses = (payload, label) => {
    let msg = null;
    try { X.restore(payload); } catch (e) { msg = e.message; }
    ok(label, msg !== null, 'it was accepted');
    return msg || '';
  };

  check('a file that is not a backup is refused',
    (() => { try { X.restore('{"format":"something-else"}'); return null; }
      catch (e) { return e.message; } })(),
    'That file isn\'t a Dinner By Derek backup.');

  // A column name is a string from the file that ends up inside a statement.
  const injected = refuses(
    wrap({ weeks: [{ 'id, slug) SELECT 99, 99 -- ': 1 }] }),
    'a column the table does not have stops the restore');
  ok('and the refusal names it', injected.includes('SELECT 99'));
  ok('and says where it might have come from', /newer version/.test(injected));

  refuses(wrap({ weeks: [{ id: 1, slug: 'a', title: 'T', nonsense_column: 1 }] }),
    'an unknown column stops it even when the others are real');
  refuses(wrap({ weeks: ['not a row'] }), 'a section that is not rows is refused');

  /* Every row, not just the first.
   *
   * The shape used to be read off rows[0], so a file could disagree with
   * itself from row two onward and never be looked at. A stray column further
   * down was dropped without a word; a missing one was bound as NULL, which a
   * NOT NULL column refused with a constraint message naming neither the row
   * nor the file — and a nullable column simply took, so a dish came back from
   * a restore that reported success with no price and left the menu.
   *
   * The rows here come out of a real backup, so the shape being checked is the
   * shape the app actually writes. */
  const rowsOf = (name) => JSON.parse(good)[name];
  const withRows = (name, rows) => wrap({ [name]: rows });
  const mutate = (name, i, f) => {
    const rows = rowsOf(name);
    f(rows[i]);
    return withRows(name, rows);
  };

  ok('a real backup has rows to test this on', rowsOf('standing_items').length >= 4);

  const strayLate = refuses(mutate('standing_items', 3, (r) => { r.invented_column = 'x'; }),
    'a stray column on a later row stops the restore too');
  ok('and the refusal names that column', strayLate.includes('invented_column'), strayLate);

  const missingLate = refuses(mutate('standing_items', 3, (r) => { delete r.subcategory; }),
    'a later row missing a column the others have stops it');
  ok('and the refusal counts the row in the file', missingLate.includes('Row 4'), missingLate);
  ok('and names the column that is missing', missingLate.includes('subcategory'), missingLate);

  refuses(mutate('standing_items', 3, (r) => { delete r.full_price; }),
    'including when the missing column is one that allows NULL');

  /* A JSON column is a string in the file, and a file is a thing people edit.
   * An unreadable one used to restore clean and then throw out of the allergen
   * review, which every menu render goes through. */
  const badJson = refuses(mutate('standing_items', 3, (r) => { r.allergens = 'milk, wheat'; }),
    'a JSON column holding something that is not a list stops it');
  ok('and the refusal says which row and which column',
    badJson.includes('Row 4') && badJson.includes('allergens'), badJson);
  ok('and quotes what it found there', badJson.includes('milk, wheat'), badJson);

  refuses(mutate('standing_items', 0, (r) => { r.dismissed = '{}'; }),
    'an object where a list belongs is refused as well');
  refuses(mutate('standing_items', 2, (r) => { r.weekdays = 'mon'; }),
    'and so is a weekday list that is not a list');

  // Nothing above may have gone through: the whole restore is one transaction.
  ok('a refused restore leaves the dictionary where it was',
    db.prepare('SELECT COUNT(*) n FROM allergen_terms').get().n > 300);

  // Settings that would take the app down are skipped, not stored.
  const before = settings.get('timezone');
  const out = X.restore(wrap({
    settings: {
      timezone: 'Not/AZone', cutoff_hour: '99', late_cutoff_minute: 'x',
      business_name: 'Restored By Derek',
    },
  }));
  check('the unusable timezone is kept out', settings.get('timezone'), before);
  check('an hour outside the clock is kept out', settings.getInt('cutoff_hour', 22), 22);
  check('and so is a minute that is not one', settings.getInt('late_cutoff_minute', 0), 0);
  check('an ordinary setting still lands', settings.get('business_name'), 'Restored By Derek');
  check('and the caller is told which were skipped', out.skipped.sort(),
    ['cutoff_hour', 'late_cutoff_minute', 'timezone']);

  // The app still renders dates, which is what all of that was protecting.
  let threw = null;
  try { T.todayIn(settings.get('timezone')); } catch (e) { threw = e; }
  ok('so the clock still works after a hostile file', !threw, threw && threw.message);

  // And the round trip that is the point of the feature.
  const back = X.restore(good);
  check('a real backup restores', back.skipped.length, 0);
  ok('with the dictionary intact',
    db.prepare('SELECT COUNT(*) n FROM allergen_terms').get().n > 300);
  check('and the timezone as it was', settings.get('timezone'), before);
}


/* --- Which day the last-call poster is about --------------------------------
   The cutoff is 22:00 on the day BEFORE service, so the poster made tonight is
   about tomorrow. It used to name the week's first cooking day whatever the
   date was, which meant that from Tuesday onward it advertised a cutoff that
   had already gone — drawn on Tuesday for a Mon–Wed week it said Monday.

   Dates here are relative to today, so these stay true tomorrow. */
{
  const { lastCallDay } = require('../scripts/social');
  const TZ = 'America/Toronto';
  const today = T.todayIn(TZ);
  const D = (n) => T.addDays(today, n);
  const day = (iso, closed = 0) => ({ service_date: iso, dish_name: closed ? '' : 'A dish', closed });

  let r = lastCallDay([day(D(-1)), day(D(1)), day(D(3))], today);
  check('the poster is about tomorrow, not the first day of the week', r.subject.service_date, D(1));
  ok('and tonight really is the cutoff', r.tonight);

  r = lastCallDay([day(D(-2)), day(D(-1))], today);
  ok('a week whose days have all passed has nothing ahead of it', !r.upcoming);
  ok('and does not claim tonight is the cutoff', !r.tonight);

  r = lastCallDay([day(D(1), 1), day(D(3))], today);
  check('a closed day tomorrow is skipped for the next one being cooked',
    r.subject.service_date, D(3));
  ok('and that is not tonight', !r.tonight);

  r = lastCallDay([day(D(3)), day(D(4))], today);
  check('with nothing until later in the week it names the next day cooked',
    r.subject.service_date, D(3));
  ok('and still does not say tonight', !r.tonight);

  r = lastCallDay([day(D(1))], today);
  check('a single day, tomorrow, is the subject', r.subject.service_date, D(1));
  ok('and is tonight', r.tonight);

  r = lastCallDay([day(D(0)), day(D(2))], today);
  check('today is over as far as ordering goes, so it looks past it',
    r.subject.service_date, D(2));
  ok('which is not tonight either', !r.tonight);
}

/* --- The shell cache carries its own version --------------------------------
   The rule used to be "bump CACHE_VERSION when you change a shell file", kept
   by memory alone — and a missed bump is silent: returning visitors keep the
   previous build, so an owner who fixes a price watches customers go on
   reading the old one. Nothing failed, nothing said anything.

   The version IS the fingerprint now, and this recomputes it. When it fails,
   the string it prints is the one to paste into sw.js. */
{
  const crypto = require('crypto');
  const pub = path.join(__dirname, '..', 'public');
  // The files a browser actually caches by URL. /offline and the manifest are
  // rendered by routes, so they change with the code rather than with a file.
  const SHELL_FILES = ['theme.css', 'app.css', 'app.js', 'order.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
  const h = crypto.createHash('sha256');
  for (const n of SHELL_FILES) h.update(n).update(fs.readFileSync(path.join(pub, n)));
  const expected = `dbd-shell-${h.digest('hex').slice(0, 10)}`;

  const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
  const found = (/var CACHE_VERSION = '([^']+)'/.exec(sw) || [])[1];
  check(`the service worker names the shell it is caching (paste ${expected} into sw.js if this fails)`,
    found, expected);

  const listed = [...sw.matchAll(/^\s*'(\/[^']+)',/gm)].map((m) => m[1]);
  for (const n of SHELL_FILES) {
    ok(`${n} is in the shell list it was fingerprinted from`, listed.includes(`/${n}`), listed.join(' '));
  }
  ok('and the dashboard is not cached at any version',
    !listed.includes('/admin.js') && !listed.includes('/admin.css'));
}

/* --- Odds and ends the audit turned up ------------------------------------ */
{
  /* A graphics set is looked up by a name off the URL. Every object inherits
     __proto__, constructor and toString, so a plain SETS[key] answered for all
     three and they walked past the route's `if (!set)` guard. */
  const G = require('../server/graphics');
  ok('a real graphics set is found', !!G.get('social') && !!G.get('card'));
  for (const k of ['__proto__', 'constructor', 'toString', 'valueOf', 'nope']) {
    ok(`"${k}" is not a graphics set`, G.get(k) === null);
  }

  /* A search box holds words, not patterns. */
  const X2 = require('../server/exports');
  check('an ordinary search is wrapped for a contains match',
    X2.likeContains('Smith'), '%Smith%');
  check('an underscore is escaped, not left as "any character"',
    X2.likeContains('O_Brien'), '%O\\_Brien%');
  check('and a percent is escaped, not left as "everything"',
    X2.likeContains('100%'), '%100\\%%');
  check('the escape character escapes itself',
    X2.likeContains('a' + String.fromCharCode(92) + 'b'),
    '%a' + String.fromCharCode(92, 92) + 'b%');

  /* The mail escaper is used on text today, but it is named "escape". */
  const mailerSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'mailer.js'), 'utf8');
  ok('the mail escaper handles double quotes', mailerSrc.includes('&quot;'));
  ok('and single quotes', mailerSrc.includes('&#39;'));

  /* The allergen chips are built from dictionary terms, which the owner
     edits and a restored backup can rewrite. There is no browser here to
     drive, so this pins the construction: nodes and textContent, not a
     string glued together and assigned to innerHTML. */
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  ok('the suggestion chip is built from nodes',
    adminJs.includes('terms.textContent') && adminJs.includes('chip.textContent'));
  ok('and no dictionary term is glued into innerHTML',
    !/innerHTML\s*=\s*.*p\.(allergen|terms)/.test(adminJs));

  /* One back(), not three copies drifting apart. */
  for (const r of ['admin.js', 'admin2.js', 'admin3.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', r), 'utf8');
    ok(`${r} uses the shared back()`, src.includes("require('./back')"));
    ok(`${r} does not keep its own copy`, !src.includes('function back(res, req'));
  }
}

/* --- Saving must not depend on a dialog the browser can switch off ----------
   Every [data-confirm] form went through window.confirm(), and a browser is
   entitled to stop showing those: after a few in a row Chrome and Edge offer
   "prevent this page from creating additional dialogs", and once that is
   ticked confirm() returns false for the rest of the session without asking.
   preventDefault() then ran on every submit, so Save did nothing, silently,
   every time — a price edit that will not save and will not say why.

   Verified in a real browser both ways; this pins the mechanism so it cannot
   quietly come back. */
{
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  ok('submitting does not hang on window.confirm',
    !/if\s*\(!window\.confirm\(/.test(adminJs) && !/window\.confirm\(f\.dataset/.test(adminJs));
  ok('a dialog element is used instead', adminJs.includes("createElement('dialog')"));
  ok('and it is opened modally, so it traps focus and takes Escape',
    adminJs.includes('showModal()'));
  ok('window.confirm survives only as the fallback for browsers without showModal',
    /HTMLDialogElement/.test(adminJs) && /window\.confirm\(message\)/.test(adminJs));
  ok('the form is re-submitted through requestSubmit so validation still runs',
    adminJs.includes('requestSubmit'));
  ok('and the button that was pressed is carried through',
    adminJs.includes('e.submitter'));

  /* The confirmation has to say a save happened. It used to carry only the
     allergen sentence, which reads as a refusal. */
  const admin2 = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin2.js'), 'utf8');
  ok('the Other Options toast leads with Saved on a reviewed item',
    admin2.includes('`Saved. ${f.name} updated on the live menu'));
  ok('and on one still waiting for its allergen review',
    admin2.includes('`Saved. ${A.reviewMessage(f.name, st)}`'));
}

/* --- Clock settings a bad value prints rather than throws -------------------
   fmtClock splits on the colon and trusts what it gets, so these never threw
   and never got noticed: "four pm" printed as "NaN:undefined AM" and 25:00 as
   "1:00 PM" — obviously broken is a bug report, plausibly wrong is a customer
   turning up at the wrong hour. The pickup window is also frozen onto every
   order at submit, so a bad one is written permanently onto records.

   auto_publish_time was checked with a regex that accepts 99:99 and 24:00,
   which momentOn hands to a Date, pushing the publish moment days out. */
{
  const { settings } = require('../server/db');
  const g = (k, v) => settings.guard(k, v);
  for (const key of ['pickup_start', 'pickup_end', 'auto_publish_time']) {
    check(`${key} takes an ordinary time`, g(key, '16:00'), '16:00');
    check(`${key} is normalised to two digits`, g(key, '9:5'), '09:05');
    check(`${key} accepts midnight`, g(key, '0:00'), '00:00');
    check(`${key} accepts the last minute of the day`, g(key, '23:59'), '23:59');
    check(`${key} refuses words`, g(key, 'four pm'), null);
    check(`${key} refuses an hour that does not exist`, g(key, '25:00'), null);
    check(`${key} refuses 24:00, which a plain regex let through`, g(key, '24:00'), null);
    check(`${key} refuses 99:99, which a plain regex also let through`, g(key, '99:99'), null);
    check(`${key} refuses a minute that does not exist`, g(key, '12:60'), null);
    check(`${key} refuses an empty box`, g(key, ''), null);
    check(`${key} refuses a bare hour`, g(key, '16'), null);
  }

  /* And the whole point: what the customer reads. */
  ok('a guarded window formats as a time',
    /^\d{1,2}:\d{2} [AP]M–\d{1,2}:\d{2} [AP]M$/.test(T.fmtWindow(g('pickup_start', '16:00'), g('pickup_end', '19:00'))));
  ok('and the unguarded value is what used to reach the page',
    T.fmtWindow('four pm', '25:00').includes('NaN'));
}

/* --- Autosave says "Saved" only when something was saved --------------------
   The week builder posts every keystroke and set the flag from r.ok. A lost
   session redirected that fetch to the login page, fetch followed it, the 200
   read as ok, and the flag wrote "Saved" over work that was never stored —
   a whole week typed into an expired dashboard, reassured all the way, gone.

   Verified in a browser both ways. This pins the client half; flow.js checks
   the 401 the server now answers. */
{
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  const save = adminJs.slice(adminJs.indexOf('function save()'), adminJs.indexOf("form.addEventListener('input'"));
  ok('the autosave post does not follow redirects', /redirect:\s*'manual'/.test(save), save.slice(0, 200));
  ok('and does not set the flag straight from r.ok alone',
    !/flag\.textContent = r\.ok \? /.test(save));
  ok('a lost session is named as such, not as a connection problem',
    /sign-in expired/i.test(save));
  ok('and it says NOT SAVED where it used to say Saved', /NOT SAVED/.test(save));

  /* The suggestion fetch used to read .length off whatever came back. */
  ok('the suggestion handler checks it got a list before using it',
    /Array\.isArray\(d\.pending\)/.test(adminJs));

  /* And the server half: X-Draft is treated as an API call, not a page. */
  const authJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'auth.js'), 'utf8');
  ok('auth answers an autosave with 401 rather than the login page',
    /req\.get\(\'X-Draft\'\)/.test(authJs));
}

/* --- A broken section must not take the rest of the page with it -----------
   admin.js runs every section at load, in order, in one function. A throw
   anywhere in it used to stop everything after that point from being wired up:
   a mistake in the photo uploader would silently take autosave with it, and
   the page would look completely normal with half its behaviour missing. That
   is the shape of both failures this dashboard has already had — a control
   that does nothing, quietly.

   Verified in a browser by sabotaging one section and watching the rest come
   up regardless, named on screen and in the console. */
{
  const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  ok('there is a runner that confines a failure to one section',
    /function section\(name, run\)/.test(adminJs));
  ok('it catches rather than letting the throw escape', /\}\s*catch \(e\) \{/.test(adminJs));
  ok('it names the section in the console', /console\.error\(\"\[admin\] \" \+ name/.test(adminJs));
  ok('and says so on screen, where the owner is looking',
    /toast\(name \+ \" isn/.test(adminJs));

  const names = [...adminJs.matchAll(/^  section\(\"([^\"]+)\"/gm)].map((m) => m[1]);
  check('every part of the dashboard runs inside one', names.length, 8);
  ok('including the two that have already broken once',
    names.includes('The confirmation step') && names.includes('Autosave'), names.join(' | '));
  ok('and nothing is left outside them',
    !/^  document\.querySelectorAll/m.test(adminJs), 'a top-level querySelectorAll is unguarded');
}
/* --- Reading an e-transfer notification ------------------------------------
   The bank is the only witness that money arrived, and it testifies by email.
   These checks are about not believing it too eagerly: the app may settle an
   order by itself on exactly one rung of the ladder — the reference is in the
   transfer message AND the amount is the order total — and must hand every
   weaker signal to a person instead.

   Being wrong here is expensive in a way the customer feels: an order marked
   paid that wasn't means Derek never chases it, and an order left unpaid that
   was means he chases someone who already paid. */
{
  const P = require('../server/payments');

  const email = ({ from = 'JANE SMITH', amount = '52.00', message = null, id = null,
    bankRef = 'CA9d8f7e6a' }) => [
    'From: notify@payments.interac.ca',
    `Subject: INTERAC e-Transfer: A money transfer from ${from} has been automatically deposited.`,
    'Date: Fri, 21 Aug 2026 18:04:11 -0400',
    ...(id ? [`Message-ID: <${id}@payments.interac.ca>`] : []),
    '',
    `A money transfer from ${from} has been automatically deposited into your account.`,
    '',
    `Amount: $${amount}`,
    ...(message === null ? [] : [`Message: ${message}`]),
    '',
    `Reference Number: ${bankRef}`,
  ].join('\n');

  /* --- Parsing ---------------------------------------------------------- */
  const auto = P.parseNotification(email({ message: 'DEADBEEF thanks!' }));
  check('the sender name is read off the notification', auto.sender_name, 'JANE SMITH');
  check('so is the amount, in cents', auto.amount, 5200);
  check('and the message the customer typed', auto.memo, 'DEADBEEF thanks!');
  check('the message is marked as a field that was found, not guessed', auto.memo_parsed, 1);

  const classic = P.parseNotification([
    'Subject: INTERAC e-Transfer: Bob Jones sent you $18.50 (CAD)',
    '',
    'Bob Jones sent you $18.50 (CAD).',
    'Message from Bob Jones: for tuesday',
  ].join('\n'));
  check('a differently worded notification still gives up its sender', classic.sender_name, 'Bob Jones');
  check('and its amount', classic.amount, 1850);
  check('and its message', classic.memo, 'for tuesday');

  /* --- The grid Interac actually sends ----------------------------------
   * Taken from real notifications, with the names changed. Every field is a
   * label alone on a line and the value below it, which is what the two-column
   * table in the HTML flattens to. Patterns written for `Label: value` read
   * none of it, and the message is the field that matters: it is where the
   * order reference rides, so an unread one is the difference between a
   * payment that settles itself and one that waits for a person.
   */
  const interacGrid = ({ from = 'ALEX RIVERS', amount = '37.00', message = 'Order A1B2C3D4',
    fwd = false, origin = 'orig-1', outer = 'fwd-1' }) => [
    ...(fwd
      ? [`From: Derek Hines <derekhines@hotmail.com>`,
        `Subject: Fw: Interac e-Transfer: You've received $${amount} from ${from}`,
        ' and it has been automatically deposited.',
        'Date: Sun, 23 Aug 2026 15:57:35 -0400',
        'Message-ID:', `\t<${outer}@outlook.com>`,
        'In-Reply-To:', `\t<${origin}@ca-central-1.amazonses.com>`,
        '', `From: ${from} <notify@payments.interac.ca>`]
      : [`From: ${from} <notify@payments.interac.ca>`,
        `Subject: Interac e-Transfer: You've received $${amount} from ${from} and it`,
        ' has been automatically deposited.',
        'Date: Sun, 23 Aug 2026 15:41:30 -0400',
        'Message-ID:', `\t<${origin}@ca-central-1.amazonses.com>`]),
    '', 'Hi DEREK HINES,', 'Funds Deposited!', `$${amount}`, '',
    'Transfer Details', '',
    ...(message === null ? [] : ['Message:', '', message, '']),
    'Date:', '', 'Aug 23, 2026', '',
    'Reference Number:', '', 'C1AkzbyKNVdV', '',
    'Sent From:', '', from, '',
    'Amount:', '', `$${amount} (CAD)`,
  ].join('\n');

  const grid = P.parseNotification(interacGrid({}));
  check('the message is read out of the grid', grid.memo, 'Order A1B2C3D4');
  check('and counts as a field, so it may settle an order', grid.memo_parsed, 1);
  check('the sender is read out of the grid too', grid.sender_name, 'ALEX RIVERS');
  check('and the amount', grid.amount, 3700);

  /* The label is read forward to the next non-empty line, so a label with
     nothing under it must not swallow the label after it. A memo of "Date:" is
     not a cosmetic problem: memos are what the automatic match reads. */
  const emptyMemo = P.parseNotification(
    ['Transfer Details', '', 'Message:', '', 'Date:', '', 'Aug 23, 2026', '', 'Amount:', '', '$12.00'].join('\n'));
  check('an empty message does not swallow the next label', emptyMemo.memo, '');
  check('and is not counted as a message that was found', emptyMemo.memo_parsed, 0);

  /* The subject names the sender inside a sentence that carries on past it.
     Where the mail client happened to wrap that sentence used to decide what
     got stored — the same notification giving three different answers. */
  const wrapped = "Subject: Interac e-Transfer: You've received $9.00 from ALEX RIVERS\n and it has been automatically deposited.";
  check('a sender read from a wrapped subject stops at the name',
    P.parseNotification(wrapped).sender_name, 'ALEX RIVERS');
  check('and stops at the same place when nothing wrapped',
    P.parseNotification(wrapped.replace('\n ', ' ')).sender_name, 'ALEX RIVERS');

  /* Derek forwards these by hand today and a poller may read them straight out
     of his mailbox tomorrow. The same transfer must be one payment either way,
     or the changeover quietly doubles everything in flight. */
  const direct = P.parseNotification(interacGrid({ origin: 'shared-id' }));
  const forwarded = P.parseNotification(interacGrid({ origin: 'shared-id', fwd: true }));
  check('a forwarded notification is identified by the original, not the forward',
    forwarded.external_id, `msgid:shared-id@ca-central-1.amazonses.com`);
  check('so forwarding one does not make it a second payment',
    forwarded.external_id, direct.external_id);
  check('and the forward still gives up its sender', forwarded.sender_name, 'ALEX RIVERS');
  check('and its message', forwarded.memo, 'Order A1B2C3D4');
  ok('two different transfers are still two payments',
    P.parseNotification(interacGrid({ origin: 'a' })).external_id
      !== P.parseNotification(interacGrid({ origin: 'b' })).external_id);

  /* A folded header is not a missing one. Both Outlook and SES put a long
     Message-ID on the line after its own name. */
  check('a Message-ID folded onto the next line is still found',
    P.parseNotification('Subject: you got $5\nMessage-ID:\n\t<folded@x>').external_id, 'msgid:folded@x');

  check('thousands separators survive', P.parseNotification('Subject: you got $1,234.56').amount, 123456);
  check('a whole-dollar amount survives', P.parseNotification('Subject: you got $25').amount, 2500);
  /* One decimal place is what a person types where a bank sends two. It used to
     read as $25.00 — matching "25" and throwing the ".5" away — which is fifty
     cents light, fails the exact-amount test, and drops a transfer that would
     have matched into the pile waiting to be done by hand. */
  check('a single decimal place is not silently dropped',
    P.parseNotification('Subject: you got $25.5').amount, 2550);
  check('and two still read the same as ever',
    P.parseNotification('Subject: you got $25.50').amount, 2550);
  check('a few cents on their own survive',
    P.parseNotification('Subject: you got $0.05').amount, 5);

  /* Three letters is the right floor for an ordinary name, and applied without
     a fallback it dropped some names entirely: "Li Wu" has no token that long,
     so the set was empty and that customer could never be suggested by name.
     Whose names those are is not evenly distributed. */
  check('a short name matches itself', P.nameOverlap('LI WU', 'Li Wu'), 1);
  check('and still does not match a different one', P.nameOverlap('LI WU', 'Bob Jones'), 0);
  check('while a long name is unchanged', P.nameOverlap('JANE A. SMITH', 'Jane Smith'), 1);
  check('and an initial alone is not a match', P.nameOverlap('J', 'Jane Smith'), 0);
  check('text with no money in it is not a payment', P.parseNotification('Your statement is ready.'), null);
  check('and neither is nothing at all', P.parseNotification(''), null);

  /* --- Text that used to stop the whole server -------------------------
     The sender and memo patterns paired an unbounded lazy `([^\n,]+?)` with a
     following `\s+`, over a class that matches spaces itself. On text that does
     not match, the engine tries every way of splitting a run of whitespace
     between the two. It cost about n-cubed: 2,000 spaces took 3.5 seconds and
     4,000 took 26.5, on the one thread that also serves the menu — so a single
     paste stopped customers ordering for as long as it ran.

     A budget rather than a curve, because a curve is a benchmark and this is a
     regression check. The margin is the point: this input took 26 seconds and
     now takes under a millisecond, so a second of headroom distinguishes the
     two without being able to fail on a busy machine. */
  {
    const evil = 'Subject: you got $25\n' + ' '.repeat(4000) + 'X';
    const t0 = Date.now();
    const parsed = P.parseNotification(evil);
    const ms = Date.now() - t0;
    ok(`4,000 spaces parse in well under a second (took ${ms}ms)`, ms < 1000);
    check('and it is still read as a payment', parsed.amount, 2500);

    const huge = 'Subject: you got $25\n' + 'a b'.repeat(80_000);
    const t1 = Date.now();
    ok('so does text far past any real notification', P.parseNotification(huge) !== null
      && Date.now() - t1 < 1000);
  }

  /* Bounding the quantifiers meant tightening line-leading whitespace from \s
     to [ \t], since \s crosses newlines and these patterns anchor to a line.
     These hold the wording that still has to parse. */
  {
    const indented = P.parseNotification([
      'Subject: INTERAC e-Transfer: you got $30.00',
      '',
      '   Sent by  :   Dana Okafor  ',
      '   Message  :   A1B2C3D4 for thursday  ',
    ].join('\n'));
    check('an indented sender line still parses', indented.sender_name, 'Dana Okafor');
    check('and an indented message line', indented.memo, 'A1B2C3D4 for thursday');
  }

  /* A name longer than the bound is not matched into oblivion. It stops at the
     ceiling the stored column uses anyway, rather than costing the parse. */
  {
    const long = P.parseNotification(
      `Subject: INTERAC e-Transfer: ${'Bartholomew '.repeat(30)}sent you $12.00`);
    ok('an absurdly long sender name does not stall the parse', long !== null);
    ok('and is not stored past the column width', long.sender_name.length <= 120);
  }

  const noMemo = P.parseNotification(email({ message: null }));
  check('a transfer with no message parses anyway', noMemo.amount, 5200);
  check('and says the message was not a field', noMemo.memo_parsed, 0);

  ok('a Message-ID is what identifies the email when there is one',
    P.parseNotification(email({ id: 'abc' })).external_id === 'msgid:abc@payments.interac.ca');
  check('identical pasted text identifies as the same payment twice',
    P.parseNotification(email({ message: 'x' })).external_id,
    P.parseNotification(email({ message: 'x' })).external_id);
  ok('a different amount is a different payment',
    P.parseNotification(email({ amount: '10.00' })).external_id
      !== P.parseNotification(email({ amount: '11.00' })).external_id);

  /* --- Names ------------------------------------------------------------ */
  ok('a middle initial does not stop a name matching', P.nameOverlap('Jane A. Smith', 'Jane Smith') >= 0.5);
  ok('case and accents do not either', P.nameOverlap('RENEE TREMBLAY', 'Renée Tremblay') >= 0.5);
  ok('two different people do not match', P.nameOverlap('Jane Smith', 'Bob Jones') < 0.5);

  /* --- The ladder ------------------------------------------------------- */
  const mkOrder = (ref, name, total, extra = {}) => {
    const id = db.prepare(`INSERT INTO orders
      (ref, service_date, status, name, phone, method, subtotal, total, payment_method, paid)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, '2026-08-25', extra.status || 'confirmed', name, '555-0100', 'pickup',
        total, total, 'etransfer', extra.paid || 0).lastInsertRowid;
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  };

  // Rung one: reference and amount agree. This is the only automatic one.
  const o1 = mkOrder('AAAA1111', 'Jane Smith', 5200);
  const r1 = P.record(email({ from: 'JANE SMITH', amount: '52.00', message: 'AAAA1111', id: 'm1' }));
  ok('a reference and a matching amount settle the order by themselves', r1.auto === true);
  check('and the order is marked paid', db.prepare('SELECT paid FROM orders WHERE id=?').get(o1.id).paid, 1);
  check('the match records that it was the app that did it', r1.payment.matched_by, 'auto');
  check('and that the flag was the app\'s to undo', r1.payment.set_paid, 1);

  // The same email again must not do it a second time.
  const again = P.record(email({ from: 'JANE SMITH', amount: '52.00', message: 'AAAA1111', id: 'm1' }));
  ok('the same notification read twice is recognised, not counted twice', again.duplicate === true);
  check('and there is still only one payment against that order',
    db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(o1.id).n, 1);

  // Rung two: the reference is there, the money is not all there.
  const o2 = mkOrder('BBBB2222', 'Bob Jones', 4000);
  const r2 = P.record(email({ from: 'BOB JONES', amount: '35.00', message: 'BBBB2222', id: 'm2' }));
  ok('a short payment is never applied on its own', !r2.auto);
  check('the order is left unpaid', db.prepare('SELECT paid FROM orders WHERE id=?').get(o2.id).paid, 0);
  check('and it is offered as the obvious candidate', r2.suggestions[0].order.id, o2.id);
  check('named as the mismatch it is', r2.suggestions[0].reason, 'ref_mismatch');

  // Rung three: no reference, but only one order is owed exactly that.
  const o3 = mkOrder('CCCC3333', 'Priya Nair', 3175);
  const r3 = P.record(email({ from: 'PRIYA NAIR', amount: '31.75', message: null, id: 'm3' }));
  ok('an amount with no reference is never applied on its own', !r3.auto);
  check('the order stays unpaid', db.prepare('SELECT paid FROM orders WHERE id=?').get(o3.id).paid, 0);
  ok('but it is suggested', r3.suggestions.some((s) => s.order.id === o3.id));

  /* A bank's own reference number is eight hex characters often enough to
     matter. Only the message field is ever read for a reference, so one
     sitting in the body — even standing alone, even matching a real order,
     even when the amount agrees too — must not reach through and settle it. */
  const o4 = mkOrder('9D8F7E6A', 'Coincidence', 7700);
  check('the fixture really does put a lone order reference in the body',
    P.refsIn(email({ bankRef: '9D8F7E6A' })).includes('9D8F7E6A'), true);
  const r4 = P.record(email({ from: 'NOBODY', amount: '77.00', message: null,
    id: 'm4', bankRef: '9D8F7E6A' }));
  ok('a reference found outside the message field settles nothing', !r4.auto);
  check('and that order is untouched',
    db.prepare('SELECT paid FROM orders WHERE id=?').get(o4.id).paid, 0);

  /* --- Undoing ---------------------------------------------------------- */
  P.unlink(r1.payment.id);
  check('unlinking an automatic match makes the order unpaid again',
    db.prepare('SELECT paid FROM orders WHERE id=?').get(o1.id).paid, 0);

  // An order Derek had already ticked himself must survive the same undo.
  const o5 = mkOrder('EEEE5555', 'Already Paid', 2000, { paid: 1 });
  const r5 = P.record(email({ from: 'ALREADY PAID', amount: '20.00', message: 'EEEE5555', id: 'm5' }));
  check('linking to an already-paid order does not claim the flag', r5.payment.set_paid, 0);
  P.unlink(r5.payment.id);
  check('so unlinking leaves it paid, the way he left it',
    db.prepare('SELECT paid FROM orders WHERE id=?').get(o5.id).paid, 1);

  /* --- One order, one payment -------------------------------------------
     The sequence that used to end with money in hand and the customer being
     chased for it. Two payments could point at the same order, because nothing
     said they could not: the flag only flips when the order was not already
     paid, so the second recorded set_paid = 0, and unlinking the FIRST then set
     the order back to unpaid while the second was still linked to it.

     Run in that exact order, because the corruption is in the order. */
  {
    const o6 = mkOrder('FFFF6666', 'Twice Over', 4400);
    const first = P.record(email({ from: 'TWICE OVER', amount: '44.00', message: 'FFFF6666', id: 'm6' }));
    ok('the first payment settles the order', first.auto === true);
    check('so it is paid', db.prepare('SELECT paid FROM orders WHERE id=?').get(o6.id).paid, 1);
    check('and that payment is what flipped it', first.payment.set_paid, 1);

    // A second transfer for the same order, of the same amount, naming it too.
    const second = P.record(email({ from: 'TWICE OVER', amount: '44.00', message: 'FFFF6666', id: 'm7' }));
    ok('the second is not applied on its own', !second.auto);
    check('it is left unclaimed rather than stacked on the order',
      second.payment.order_id, null);

    // Linking it by hand is refused, and says which payment is in the way.
    const refused = P.link(second.payment.id, o6.id, 'owner');
    check('and linking it by hand is refused', refused.refused, 'order_taken');
    check('naming the payment already standing there', refused.held.id, first.payment.id);

    // The step that used to corrupt: undo the first while the second exists.
    P.unlink(first.payment.id);
    check('unlinking the first leaves the order unpaid, correctly',
      db.prepare('SELECT paid FROM orders WHERE id=?').get(o6.id).paid, 0);
    check('and no payment is left claiming it',
      db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').get(o6.id).n, 0);

    // The database refuses it too, not only the code above.
    let constraintHeld = false;
    try {
      P.link(first.payment.id, o6.id, 'owner');
      db.prepare('UPDATE payments SET order_id=? WHERE id=?').run(o6.id, second.payment.id);
    } catch (e) { constraintHeld = /UNIQUE|constraint/i.test(e.message); }
    ok('a direct write cannot put two payments on one order either', constraintHeld);
    db.prepare(`UPDATE payments SET order_id=NULL, matched_by='', matched_at=NULL, set_paid=0
                WHERE order_id=?`).run(o6.id);
    db.prepare('UPDATE orders SET paid=0 WHERE id=?').run(o6.id);
  }

  /* Moving a linked payment to a different order used to overwrite order_id and
     recompute set_paid against the new one, leaving the old order marked paid
     with nothing behind it and nothing to notice it by. */
  {
    const oA = mkOrder('AAAA7777', 'First Home', 1500);
    const oB = mkOrder('BBBB8888', 'Second Home', 1500);
    const r = P.record(email({ from: 'FIRST HOME', amount: '15.00', message: 'AAAA7777', id: 'm8' }));
    check('it lands on the order it named', r.payment.order_id, oA.id);

    const moved = P.link(r.payment.id, oB.id, 'owner');
    check('moving it to another order is refused', moved.refused, 'already_linked');
    check('the first order is still paid', db.prepare('SELECT paid FROM orders WHERE id=?').get(oA.id).paid, 1);
    check('and the second was never touched', db.prepare('SELECT paid FROM orders WHERE id=?').get(oB.id).paid, 0);

    // Unlinking first is the route that works, and it restores the old order.
    P.unlink(r.payment.id);
    check('unlinking puts the first order back', db.prepare('SELECT paid FROM orders WHERE id=?').get(oA.id).paid, 0);
    const relinked = P.link(r.payment.id, oB.id, 'owner');
    ok('and then it moves', relinked && !relinked.refused);
    check('settling the second order', db.prepare('SELECT paid FROM orders WHERE id=?').get(oB.id).paid, 1);
    P.unlink(relinked.id);
  }

  /* --- What the screen reads from --------------------------------------- */
  ok('money nobody has claimed is listed', P.unmatched().length > 0);
  ok('and so are the orders still owing', P.awaiting().some((o) => o.ref === 'BBBB2222'));

  /* --- The customer is told what to type -------------------------------- */
  const customerView = fs.readFileSync(path.join(__dirname, '..', 'server', 'views', 'customer.js'), 'utf8');
  ok('the confirmation screen asks e-transfer customers for the reference',
    /payment_method === 'etransfer'/.test(customerView)
    && /in the e-transfer message/.test(customerView));
  const mailerSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'mailer.js'), 'utf8');
  ok('so does the confirmation email', /in the e-transfer message/.test(mailerSrc));
  ok('but only the customer\'s copy of it', /forCustomer/.test(mailerSrc));
}

/* --- A parameter sent twice is not a server fault --------------------------
   Express turns ?date=a&date=b into an array, better-sqlite3 refuses to bind
   one, and the owner got a 500 on a page whose whole job is showing a list.
   Both the orders screen and the CSV read the same query string. */
{
  const X = require('../server/exports');
  check('one value passes through unchanged', X.one('2026-08-25'), '2026-08-25');
  check('the last of several wins', X.one(['a', 'b', 'c']), 'c');
  check('an absent one stays absent', X.one(undefined), undefined);

  let threw = null;
  try { X.ordersCsv({ date: ['2026-08-25', '2026-08-26'] }); } catch (e) { threw = e; }
  ok('a duplicated date does not throw out of the CSV', !threw, threw && threw.message);

  threw = null;
  try { X.ordersCsv({ q: ['bob', 'jane'], method: ['pickup', 'delivery'] }); }
  catch (e) { threw = e; }
  ok('and neither do the other filters', !threw, threw && threw.message);

  // The orders screen reads the same values, so it must read them the same way.
  const admin2Src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin2.js'), 'utf8');
  ok('the orders screen binds nothing straight off req.query',
    !/args\.push\(req\.query\./.test(admin2Src));
}

/* --- A token that has already died is the urgent case ----------------------
   The warning fired only for a token with time left on it, so a machine off
   over a holiday — or a token that arrived with under a week on it — meant no
   email at all, ever. The subject line is read back off the log, because
   without SMTP configured that is where send() puts it. */
{
  const mailer = require('../server/mailer');
  const said = [];
  const realWarn = console.warn;
  console.warn = (...a) => said.push(a.join(' '));
  try {
    mailer.tokenExpiryEmail(5, 'Dinner By Derek');
    mailer.tokenExpiryEmail(-3, 'Dinner By Derek');
    mailer.tokenExpiryEmail(0, 'Dinner By Derek');
  } finally { console.warn = realWarn; }

  ok('a token with days left still says how many', /expires in 5 days/.test(said[0]));
  ok('an expired one says it has expired', /has expired/.test(said[1]));
  ok('and does not offer a negative countdown', !/-3/.test(said[1]));
  ok('the day it dies counts as expired', /has expired/.test(said[2]));

  /* The condition itself, not any mention of it — the comment above it quotes
     the old one, which is exactly the sort of thing a looser pattern matches. */
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  ok('the check fires on an expired token', /if \(left <= WARN_MS\)/.test(indexSrc));
  ok('and no longer requires time remaining', !/if \(left > 0/.test(indexSrc));
}

/* --- A Page token has no reason to be in the page --------------------------
   Between the OAuth callback and the owner picking a Page, the tokens were
   rendered one per hidden input and posted back. Nothing was leaking them, and
   nothing needed them there either: the form only has to say which Page. */
{
  const FB = require('../server/facebook');
  const held = { userName: 'Derek', expiresAt: '2026-12-01', pages: [
    { id: '1', name: 'Dinner By Derek', access_token: 'SECRET-TOKEN-VALUE' },
    { id: '2', name: 'Other Page', access_token: 'SECOND-TOKEN' },
  ] };
  const id = FB.holdPages(held);
  ok('the hold gives back an unguessable id', typeof id === 'string' && id.length >= 32);

  const got = FB.takePages(id);
  check('and the pages come back by it', got.pages.length, 2);
  check('with the token that never went to the browser', got.pages[0].access_token, 'SECRET-TOKEN-VALUE');
  check('reading it a second time gives nothing', FB.takePages(id), null);
  check('and an id nobody issued gives nothing', FB.takePages('deadbeef'), null);
  check('nor does a missing one', FB.takePages(undefined), null);

  const admin3Src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin3.js'), 'utf8');
  ok('the chooser no longer renders a token into the form',
    !/name="token"/.test(admin3Src));
  ok('and does not interpolate one into markup either',
    !/value="\$\{p\.access_token\}"/.test(admin3Src));
}

/* --- A date off a URL is not a date until it is checked --------------------
   parseDate trusts what it is handed, which is right for the callers reading
   out of the database and wrong for the print sheets, which read one off the
   URL and pass it to Intl. */
{
  ok('an ordinary date passes', T.isCalendarDate('2026-08-25'));
  ok('a leap day passes', T.isCalendarDate('2024-02-29'));
  ok('but not in a year without one', !T.isCalendarDate('2025-02-29'));
  ok('nonsense is refused', !T.isCalendarDate('abc'));
  ok('so is the wrong shape', !T.isCalendarDate('2026-8-5'));
  ok('and an empty string', !T.isCalendarDate(''));
  ok('and something that is not a string', !T.isCalendarDate(undefined));
  /* The interesting one. This has the right shape, and Date.UTC rolls it
     forward to the 1st of September — so before the round-trip check a mistyped
     link answered confidently about a different day than the one asked for. */
  ok('a day past the end of the month is refused, not rolled',
    !T.isCalendarDate('2026-08-32'));
  check('and the roll is real, which is why the check is', T.addDays('2026-08-31', 1), '2026-09-01');

  const admin3Src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin3.js'), 'utf8');
  const sheetGuards = (admin3Src.match(/const date = sheetDate\(req, res\);/g) || []).length;
  check('all three print sheets check the date first', sheetGuards, 3);
}

/* --- Headers belong to the whole site --------------------------------------
   The security headers were registered after the static mounts, so /sw.js and
   both multipart rejections answered without them. */
{
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  const at = (needle) => indexSrc.indexOf(needle);
  ok('the headers go on before anything can answer',
    at('Content-Security-Policy') < at("app.get('/sw.js'"));
  ok('and before the multipart handler that can refuse a request',
    at('Content-Security-Policy') < at("app.use('/admin', (req, res, next)"));
  ok('the upload ceiling is one number, not two',
    /fileSize: images\.MAX_RAW/.test(indexSrc));

  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin.js'), 'utf8');
  ok('signing out is behind the guard, like every other state change',
    adminSrc.indexOf('router.use(auth.required)') < adminSrc.indexOf("router.post('/logout'"));
}

/* --- A day belongs to the week whose dates contain it ----------------------
   Moving "Week starts" re-labels the boxes and never touches a day already
   filled in, which is right — a date change must not quietly discard a dish.
   What it leaves is a day attached to a week by week_id while sitting outside
   the dates that week covers. The live database had a week starting Aug 24
   carrying Aug 18, 19 and 20.

   The display was the least of it. serviceDaysOf feeds the customer week view,
   so publishing would have offered three dates already in the past, with their
   cutoffs long gone; and it feeds the publish gate, where an unreviewed
   straggler blocks publishing from a row no screen shows. */
{
  const P = require('../server/publish');
  const M = require('../server/menu');
  const wid = db.prepare("INSERT INTO weeks (slug,title,week_start,status) VALUES (?,?,?,'draft')")
    .run('week-range-test', 'Range test', '2026-08-24').lastInsertRowid;
  const addDay = (date, dish, ack) => db.prepare(
    `INSERT INTO service_days (week_id, service_date, dish_name, ack, ack_of)
     VALUES (?,?,?,?,?)`).run(wid, date, dish, ack, ack ? `${dish}\n` : null);

  addDay('2026-08-18', 'Left Behind', 1);      // the week before — adrift
  addDay('2026-08-23', 'Day Before', 1);       // the Sunday before it starts
  addDay('2026-08-24', 'Monday Dish', 1);      // first day of the week
  addDay('2026-08-30', 'Sunday Dish', 1);      // seventh day, still in
  addDay('2026-08-31', 'Next Monday', 1);      // one past the end — adrift

  const inWeek = M.serviceDaysOf(wid).map((d) => d.service_date);
  check('only the days inside the week come back', inWeek,
    ['2026-08-24', '2026-08-30']);
  check('the first day of the week is included', inWeek.includes('2026-08-24'), true);
  check('and the seventh, which is the boundary that is easy to lose',
    inWeek.includes('2026-08-30'), true);
  check('the day before it starts is not', inWeek.includes('2026-08-23'), false);
  check('nor the day after it ends', inWeek.includes('2026-08-31'), false);

  check('but nothing is deleted', M.everyServiceDayOf(wid).length, 5);

  /* The gate reads the filtered list, so a straggler can no longer hold a week
     hostage from a row nobody can open. */
  db.prepare('UPDATE service_days SET ack = 0 WHERE week_id = ? AND service_date = ?')
    .run(wid, '2026-08-18');
  const blockers = P.blockers(wid);
  ok('an unreviewed day outside the week does not block publishing',
    !blockers.some((b) => /Left Behind/.test(b)), blockers.join(' | '));

  // And one inside it still does, which is the half that must not break.
  db.prepare('UPDATE service_days SET ack = 0 WHERE week_id = ? AND service_date = ?')
    .run(wid, '2026-08-24');
  ok('an unreviewed day inside the week still does',
    P.blockers(wid).some((b) => /Monday Dish/.test(b)));

  /* A week from before week_start existed is not filtered into nothing. The
     dashboard backfills one the first time such a week is opened. */
  const oldId = db.prepare("INSERT INTO weeks (slug,title,status) VALUES (?,?,'draft')")
    .run('week-no-start', 'No start').lastInsertRowid;
  db.prepare('INSERT INTO service_days (week_id, service_date, dish_name) VALUES (?,?,?)')
    .run(oldId, '2026-01-05', 'Ancient');
  check('a week with no start date keeps its days', M.serviceDaysOf(oldId).length, 1);

  db.prepare('DELETE FROM service_days WHERE week_id IN (?,?)').run(wid, oldId);
  db.prepare('DELETE FROM weeks WHERE id IN (?,?)').run(wid, oldId);
}

/* --- What the Facebook post says about delivery ----------------------------
   It listed all fifteen served FSAs — "We deliver to: N2A, N2B, N2C…" — which
   is a wall of text in a post and answers a question nobody reading a menu is
   asking. Plain English here; the real list still does the work where it is
   wanted, which is the order form refusing a code outside the area. */
{
  const FB = require('../server/facebook');
  const { settings } = require('../server/db');
  const wid = db.prepare("INSERT INTO weeks (slug,title,week_start,status) VALUES (?,?,?,'published')")
    .run('week-post-text', 'Post text week', '2026-09-07').lastInsertRowid;
  const week = db.prepare('SELECT * FROM weeks WHERE id=?').get(wid);
  settings.set('delivery_enabled', 1);

  const text = FB.buildPostText(week);
  ok('the post names the area in words', /We deliver to Kitchener and Waterloo/.test(text));
  ok('and does not list the postal prefixes', !/N2[A-Z], N2[A-Z]/.test(text));
  ok('the delivery heading is still there', /DELIVERY/.test(text));

  /* The detail has to survive where it is useful: a customer whose code is
     refused needs to know which areas are served. */
  const refused = D.check('M5V 3L9');
  check('a code outside the area is refused', refused.reason, 'out_of_area');
  ok('and the served list is still available to say so', D.servedAreas().length > 0);

  // Delivery off means the section goes entirely, not an empty heading.
  settings.set('delivery_enabled', 0);
  ok('no delivery section when delivery is off', !/DELIVERY/.test(FB.buildPostText(week)));
  settings.set('delivery_enabled', 1);

  db.prepare('DELETE FROM weeks WHERE id=?').run(wid);
}

/* --- The handoff page is generated, not written twice ----------------------
   It existed as markdown in the repo and as hand-written HTML in a published
   artifact, and the two had already disagreed — the HTML carried a table of
   .env state the markdown described in prose. One source now.

   The renderer is strict on purpose: it understands the subset the document
   uses and throws on anything else. A generator that quietly drops a construct
   produces a page missing a paragraph nobody notices is missing. */
{
  const H = require('./handoff');

  /* Escaping first, because this ships to somebody else's browser. */
  check('angle brackets in prose are escaped',
    H.inline('a <script>alert(1)</script> b', 1),
    'a &lt;script&gt;alert(1)&lt;/script&gt; b');
  check('and quotes', H.inline('say "hi"', 1), 'say &quot;hi&quot;');

  check('bold becomes strong', H.inline('a **b** c', 1), 'a <strong>b</strong> c');
  check('backticks become code', H.inline('run `npm test` now', 1),
    'run <code>npm test</code> now');
  /* The order these are applied in matters: a code span holding asterisks is
     the one place ** is literal, and taking bold first would eat it. */
  check('asterisks inside code stay literal', H.inline('`a ** b`', 1),
    '<code>a ** b</code>');
  check('a link becomes an anchor', H.inline('[x](/y)', 1), '<a href="/y">x</a>');

  const throws = (md) => {
    try { H.render(md); return null; } catch (e) { return e.message; }
  };
  ok('an unclosed backtick is refused', /unclosed backtick/.test(throws('a `b')));
  ok('unbalanced bold is refused', /unbalanced/.test(throws('a **b')));
  ok('a table with no divider is refused', /divider/.test(throws('| a | b |\n| c | d |')));
  ok('a block quote is refused rather than dropped', /block quote/.test(throws('> quoted')));
  ok('an h4 is refused rather than styled as an h3', /deeper than/.test(throws('#### x')));
  ok('an indented line outside a list is refused', /no code blocks/.test(throws('    x')));

  /* Block level, against the shared sheet's classes. */
  const blocks = H.render('# T\n\npara\n\n## S\n\n- one\n- two\n\n1. first\n2. second\n\n'
    + '| a | b |\n|---|---|\n| 1 | 2 |\n');
  const all = blocks.join('\n');
  ok('an h1 is the title', /<h1>T<\/h1>/.test(all));
  ok('an h2 takes the section class', /<h2 class="section">S<\/h2>/.test(all));
  ok('a dash list becomes the findings list', /<ul class="findings">/.test(all));
  ok('a numbered list becomes the steps list', /<ol class="steps">/.test(all));
  ok('a table is wrapped so it can scroll', /<div class="tablewrap">/.test(all));
  ok('and has a header row', /<thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead>/.test(all));

  /* A wrapped list item is one item, not two. The document wraps at 80
     columns, so every step in it is a continuation line. */
  const wrapped = H.render('- first line\n  continues here\n- second\n').join('');
  check('a wrapped bullet stays one item', (wrapped.match(/<li>/g) || []).length, 2);
  ok('and keeps its continuation', /first line continues here/.test(wrapped));

  /* The real document has to build, and has to still say the things the page
     is for. This is the check that fails if the markdown grows a construct the
     renderer does not know. */
  let built = null, buildErr = null;
  try { built = H.build(); } catch (e) { buildErr = e; }
  ok('docs/HANDOFF.md builds', !buildErr, buildErr && buildErr.message);
  if (built) {
    ok('the page carries the shared theme', /--parchment/.test(built));
    ok('and pulls the same two fonts', /Fraunces.*Karla/s.test(built));
    ok('it has a masthead', /class="masthead"/.test(built));
    ok('and the figures strip from the front matter', /class="fig"/.test(built));
    ok('no doctype, which the artifact host adds', !/^<!doctype/i.test(built));
    ok('no raw markdown survived', !/\*\*/.test(built.replace(/<style>[\s\S]*<\/style>/, '')));
  }
}

/* --- Report ---------------------------------------------------------------- */
console.log(`\nAcceptance checks — Dinner By Derek\n`);
if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\n${pass} passed, ${fail} FAILED\n`);
} else {
  console.log(`  ${pass} checks passed.\n`);
}
db.close();
fs.rmSync(scratch, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
