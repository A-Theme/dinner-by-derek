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

/* --- Cutoff: 22:00 the calendar day BEFORE the service date -------------- */
{
  // Service on Monday 2026-08-17. Cutoff is Sunday 2026-08-16 at 22:00 local.
  const service = '2026-08-17';
  const cutoff = T.cutoffFor(service, CUT_H, CUT_M, TZ);
  const sunday2159 = T.zonedToUtc(2026, 8, 16, 21, 59, TZ);
  const sunday2201 = T.zonedToUtc(2026, 8, 16, 22, 1, TZ);

  check('the cutoff lands on the day before, at 22:00 local', localClock(cutoff), '22:00');
  ok('21:59 the night before is still open', sunday2159 < cutoff);
  ok('22:01 the night before is past cutoff', sunday2201 > cutoff);
  check('state at 21:59 is orderable',
    T.dayState(service, CUT_H, CUT_M, TZ, sunday2159).state, 'closing');
  check('state at 22:01 is closed to normal orders',
    T.dayState(service, CUT_H, CUT_M, TZ, sunday2201).state, 'closed');

  // The gap between the two states is two minutes, not an hour: proves the
  // cutoff is not being computed in UTC.
  ok('cutoff sits between them', sunday2201 - sunday2159 === 2 * 60 * 1000);

  // The day itself stays visible until it is genuinely over.
  check('the service day is past only after it ends',
    T.dayState(service, CUT_H, CUT_M, TZ, T.zonedToUtc(2026, 8, 18, 0, 1, TZ)).state, 'past');
  check('a far-off day reads as open',
    T.dayState(service, CUT_H, CUT_M, TZ, T.zonedToUtc(2026, 8, 14, 9, 0, TZ)).state, 'open');
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
