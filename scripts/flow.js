'use strict';
/**
 * End-to-end flow test. Drives the real server over HTTP, the way a browser
 * would: sign in, build a week, hit the publish gate, clear it, publish, then
 * order as a customer.
 *
 *   node scripts/flow.js
 *
 * The unit checks in acceptance.js prove each module is right on its own. This
 * proves they are wired to each other — which is where the bugs that survive
 * unit tests actually live: a form field named one thing and read as another,
 * a route mounted at the wrong path, a redirect that loses the session.
 *
 * Runs against a scratch database on a spare port. Never touches real orders.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dbd-flow-'));
const PORT = 3999;
process.env.DB_PATH = path.join(scratch, 'flow.db');
process.env.UPLOAD_DIR = path.join(scratch, 'uploads');
process.env.PORT = String(PORT);
process.env.BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.ADMIN_PASSWORD = 'flow-test-password';
process.env.SESSION_SECRET = 'flow-test-secret';
process.env.NODE_ENV = 'development';        // keeps the cookie non-secure over http
process.env.SMTP_HOST = '';                  // email off; orders must survive that

const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const failures = [];

function check(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
  fail++;
  failures.push(`  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}
function ok(label, condition, detail) {
  if (condition) { pass++; return; }
  fail++;
  failures.push(`  ${label}${detail ? `\n      ${detail}` : ''}`);
}

/* --- A cookie jar, so the session survives redirects --------------------- */
let cookie = '';

async function req(method, url, { body, json, redirect = 'manual' } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (json) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body).toString();
  }
  const res = await fetch(`${BASE}${url}`, { method, headers, body: payload, redirect });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text };
}
const GET = (u, o) => req('GET', u, o);
const POST = (u, body, o) => req('POST', u, { body, ...o });

/* --- Dates: pick a service day far enough out to be safely open ---------- */
const T = require('../server/time');
const TZ = 'America/Toronto';
const today = T.todayIn(TZ);
const SERVICE_DATE = T.addDays(today, 3);        // comfortably before its cutoff
const PAST_DATE = T.addDays(today, -2);

(async () => {
  const app = require('../server/index');          // starts listening
  await new Promise((r) => setTimeout(r, 1200));

  /* --- Anonymous ------------------------------------------------------- */
  {
    const home = await GET('/');
    check('the site answers before anything is published', home.status, 200);

    const locked = await GET('/admin/orders');
    check('the dashboard is closed to strangers', locked.status, 302);
    ok('and sends them to sign in', String(locked.location).startsWith('/admin/login'));

    const strict = await GET('/admin/export/orders.csv');
    check('exports refuse outright rather than redirect', strict.status, 401);

    const manifest = await GET('/manifest.webmanifest');
    const m = JSON.parse(manifest.text);
    ok('the manifest is installable', m.display === 'standalone' && m.icons.length >= 3);
    ok('and its icons exist on disk',
      fs.existsSync(path.join(__dirname, '..', 'public', 'icons', 'icon-512.png')));
  }

  /* --- Sign in ---------------------------------------------------------- */
  {
    const wrong = await POST('/admin/login', { password: 'not-it' });
    check('a wrong password is refused', wrong.status, 401);
    ok('and no session is handed out', !cookie.includes('dbd_admin'));

    const good = await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    check('the right password signs in', good.status, 303);
    ok('and sets a session cookie', cookie.includes('dbd_admin'));

    const dash = await GET('/admin');
    check('the dashboard opens', dash.status, 200);
  }

  /* --- Build a week ----------------------------------------------------- */
  let weekId;
  let weekSlug;
  {
    await GET('/admin/week');                     // creates the draft week
    const { db } = require('../server/db');
    const week = db.prepare('SELECT * FROM weeks ORDER BY id DESC LIMIT 1').get();
    ok('visiting This Week starts a draft', !!week);
    weekId = week.id;
    weekSlug = week.slug;
    check('a new week starts as a draft, not live', week.status, 'draft');

    await POST(`/admin/week/${weekId}/basics`, { description: 'A week for testing.' });

    // Point the weekday boxes at the week containing the service date, so the
    // box for that weekday writes to the date the rest of this test uses.
    await POST(`/admin/week/${weekId}/weekstart`, { week_start: T.mondayOf(SERVICE_DATE) });
    await POST(`/admin/week/${weekId}/dates`, { dates: SERVICE_DATE });

    const days = db.prepare('SELECT * FROM service_days WHERE week_id = ?').all(weekId);
    check('the service day was added', days.length, 1);
  }

  /* --- The publish gate -------------------------------------------------- */
  const { db } = require('../server/db');
  const dayId = db.prepare('SELECT id FROM service_days WHERE week_id = ?').get(weekId).id;
  const DISH_DESC = 'Slow braised beef with buttered mash';
  // The featured dish is authored in that weekday's box, not the day card.
  const WD = T.weekdayOf(SERVICE_DATE);
  const dish = (extra) => ({
    [`${WD}_name`]: 'Braised Beef',
    [`${WD}_description`]: DISH_DESC,
    [`${WD}_full_on`]: '1', [`${WD}_full_price`]: '22.00', [`${WD}_full_cap`]: '2',
    [`${WD}_single_on`]: '1', [`${WD}_single_price`]: '14.00',
    ...extra,
  });

  {
    // Featured dish saved WITHOUT the allergen acknowledgement.
    await POST(`/admin/week/${weekId}/weekdays`, dish());

    const blocked = await POST(`/admin/week/${weekId}/publish`, {});
    const week = db.prepare('SELECT status FROM weeks WHERE id = ?').get(weekId);
    check('an unreviewed dish blocks publishing', week.status, 'draft');
    const msg = decodeURIComponent(String(blocked.location || '')).replace(/\+/g, ' ');
    ok('and the refusal names the dish', msg.includes('Braised Beef'),
      `redirect was: ${blocked.location}`);
    ok('and says what to do about it', /allergen review/i.test(msg));

    // Tick the box, but leave the suggested allergens unanswered.
    await POST(`/admin/week/${weekId}/weekdays`, dish({ [`${WD}_ack`]: '1' }));
    await POST(`/admin/week/${weekId}/publish`, {});
    check('ticking the box is not enough while suggestions are unanswered',
      db.prepare('SELECT status FROM weeks WHERE id = ?').get(weekId).status, 'draft');

    // Accept the suggestion the dictionary raised, and acknowledge.
    const A = require('../server/allergens');
    const suggested = A.detect(DISH_DESC).map((h) => h.allergen);
    ok('the dictionary did flag the butter', suggested.includes('milk'));

    await POST(`/admin/week/${weekId}/weekdays`, dish({
      [`${WD}_ack`]: '1',
      [`${WD}_allergens`]: JSON.stringify(suggested),
    }));
    await POST(`/admin/week/${weekId}/publish`, {});
    check('a reviewed week publishes',
      db.prepare('SELECT status FROM weeks WHERE id = ?').get(weekId).status, 'published');

    // The day card owns only the pickup override now. Saving it must not
    // blank the dish the weekday box above authored.
    await POST(`/admin/week/${weekId}/day/${dayId}`, {
      pickup_start: '17:00', pickup_end: '20:00', delivery_override: '',
    });
    const afterOverride = db.prepare('SELECT * FROM service_days WHERE id = ?').get(dayId);
    check('the per-day pickup override saves', afterOverride.pickup_start, '17:00');
    check('and it leaves the dish name alone', afterOverride.dish_name, 'Braised Beef');
    check('and the price', afterOverride.full_price, 2200);
    check('and the allergen acknowledgement', afterOverride.ack, 1);

    // Put it back so the rest of the test sees the standard window.
    await POST(`/admin/week/${weekId}/day/${dayId}`, {
      pickup_start: '', pickup_end: '', delivery_override: '',
    });
  }

  /* --- Level 3 is gated too ---------------------------------------------- */
  {
    // The seeded standing items ship unreviewed, so they are invisible
    // until the owner completes their allergen review. That is the safe
    // default, and it is worth proving rather than assuming.
    const beforeReview = await GET(`/w/${weekSlug}/${SERVICE_DATE}`);
    ok('a standing item stays off the menu until it is reviewed',
      !beforeReview.text.includes('Pork Schnitzel'));

    const A = require('../server/allergens');
    const DESCRIPTIONS = {
      'Chili': 'Beef chili with beans and tomato',
      'Pork Schnitzel': 'Pork schnitzel, panko breaded',
      'Breaded Chicken Cutlets': 'Breaded chicken cutlets, panko crusted',
      'Pulled Pork (Reheat Bag)': 'Pulled pork in a bag, for reheating',
      'BBQ Brisket (Reheat Bag)': 'BBQ beef brisket in a bag, for reheating',
      'Pulled Chicken (Reheat Bag)': 'Pulled chicken in a bag, for reheating',
    };
    for (const s of db.prepare('SELECT * FROM standing_items').all()) {
      const desc = DESCRIPTIONS[s.name] || `${s.name}, made in-house`;
      await POST(`/admin/other-options/${s.id}`, {
        si_name: s.name,
        si_subcategory: 'Mains',
        si_description: desc,
        si_ack: '1',
        si_allergens: JSON.stringify(A.detect(desc).map((h) => h.allergen)),
        si_availability: 'every_service_day',
        si_full_on: '1', si_full_price: '18.00',
      });
    }
    const reviewed = db.prepare('SELECT * FROM standing_items').all();
    ok('every standing item is now reviewed', reviewed.every((r) => r.ack === 1));
  }

  /* --- The menu a customer actually sees --------------------------------- */
  const savedCookie = cookie;
  cookie = '';                                     // become a stranger again
  {
    const day = await GET(`/w/${weekSlug}/${SERVICE_DATE}`);
    check('the service day is public', day.status, 200);
    ok('the featured dish is on it', day.text.includes('Braised Beef'));
    ok('the standing items are merged in', day.text.includes('Pork Schnitzel'));
    ok('the accepted allergen is shown', day.text.toLowerCase().includes('milk'));
    ok('the suggestion-only disclaimer is present',
      /guide only/i.test(day.text)
      && /cross-contamination\s+remains\s+a\s+small\s+possibility/i.test(day.text));
    ok('and it tells an allergic customer to make contact',
      /contact the kitchen/i.test(day.text));
    ok('and it never claims to be allergen-free',
      !/allergen[- ]free/i.test(day.text));
  }

  /* --- Eligibility ------------------------------------------------------- */
  {
    const inArea = await req('POST', '/api/eligibility', { json: { postal: 'n2l3g1' } });
    const a = JSON.parse(inArea.text);
    ok('a KW postal code is eligible', a.ok === true && a.fsa === 'N2L');

    const outArea = await req('POST', '/api/eligibility', { json: { postal: 'M5V 2T6' } });
    const b = JSON.parse(outArea.text);
    check('a Toronto postal code is not', b.ok, false);
  }

  /* --- Place an order ----------------------------------------------------- */
  const M = require('../server/menu');
  const week = M.weekBySlug(weekSlug);
  const dayRow = db.prepare('SELECT * FROM service_days WHERE id = ?').get(dayId);
  const menu = M.menuForDay(week, dayRow);
  const featuredKey = menu.featured.key;
  const schnitzel = menu.allItems.find((i) => i.name === 'Pork Schnitzel');
  ok('a standing item is merged into the day at render time', !!schnitzel);
  ok('and it is tagged as coming from the standing level',
    schnitzel && schnitzel.level === 'Other Options');
  ok('while the featured dish is tagged as its own level',
    menu.featured && menu.featured.level !== 'Other Options');

  {
    const res = await POST('/order', {
      week: weekSlug,
      date: SERVICE_DATE,
      lines: JSON.stringify([
        { key: featuredKey, variant: 'full', qty: 1 },
        { key: schnitzel.key, variant: 'full', qty: 2 },
      ]),
      name: 'Test Customer',
      phone: '519-555-0199',
      email: 'test@example.com',
      method: 'pickup',
      location_id: String(db.prepare('SELECT id FROM locations LIMIT 1').get().id),
    });
    if (res.status !== 200) {
      const m = res.text.match(/<p>([^<]{5,300})<\/p>/);
      console.log('  [order rejected] ' + (m ? m[1] : res.text.slice(0, 300)));
    }
    check('the order is accepted', res.status, 200);
    ok('and the customer gets a confirmation', /thank|confirm|order/i.test(res.text));

    const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
    ok('it was stored', !!order);
    check('before the cutoff it is confirmed, not a late request', order.status, 'confirmed');
    ok('with no SMTP configured the order still survives', !!order && !!order.ref);

    const lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ?').all(order.id);
    check('both lines were kept', lines.length, 2);
    ok('the pickup location was frozen onto the order, not just referenced',
      !!order.location_name);
    ok('the pickup window was frozen onto the order too',
      !!order.pickup_window);
    ok('the price came from the database, frozen onto the line',
      lines.every((l) => l.unit_price > 0));
    check('the total is the sum of the lines',
      order.subtotal, lines.reduce((s, l) => s + l.unit_price * l.qty, 0));
    ok('each line records which of the three levels it came from',
      lines.every((l) => typeof l.source_level === 'string' && l.source_level.length > 0));
    ok('and the levels are distinguished, not collapsed',
      new Set(lines.map((l) => l.source_level)).size === 2);
    ok('the item name is frozen, so renaming a dish later cannot rewrite history',
      lines.every((l) => l.item_name && l.item_name.length > 0));
  }

  /* --- Things a customer must not be able to do --------------------------- */
  {
    const cheaper = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1, price: 1 }]),
      name: 'Chancer', phone: '519-555-0100', email: 'c@example.com',
      method: 'pickup', location_id: '1',
    });
    const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
    ok('a price sent by the browser is ignored', order.subtotal >= 2200,
      `subtotal came out as ${order.subtotal}`);

    const badLocation = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Early Bird', phone: '519-555-0101', email: 'e@example.com',
      method: 'pickup', location_id: '999999',
    });
    check('a nonexistent pickup location is refused', badLocation.status, 400);

    const forgedDelivery = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Far Away', phone: '519-555-0102', email: 'f@example.com',
      method: 'delivery', addr_line: '1 Yonge St', postal: 'M5V 2T6',
      eligible: '1', delivery_fee: '0',
    });
    check('a forged eligibility flag is refused', forgedDelivery.status, 400);

    const pastDay = await POST('/order', {
      week: weekSlug, date: PAST_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Time Traveller', phone: '519-555-0103', email: 't@example.com',
      method: 'pickup', location_id: '1',
    });
    check('an order for a day not on the menu is refused', pastDay.status, 400);

    const overCap = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 40 }]),
      name: 'Bulk Buyer', phone: '519-555-0104', email: 'b@example.com',
      method: 'pickup', location_id: '1',
    });
    check('ordering past the cap is refused', overCap.status, 400);
    ok('and the refusal is a sentence, not a stack trace',
      !overCap.text.includes('at Object.') && !overCap.text.includes('node_modules'));

    const empty = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE, lines: '[]',
      name: 'Nobody', phone: '519-555-0105', email: 'n@example.com',
      method: 'pickup', location_id: '1',
    });
    check('an empty order is refused', empty.status, 400);
  }

  /* --- The featured dish's ceiling for the day ---------------------------- */
  {
    // Two confirmed orders of the featured dish exist by now. Lift the
    // per-size caps out of the way so the day ceiling is what binds, and set
    // it to leave room for exactly one more.
    const sold = db.prepare(`SELECT COALESCE(SUM(l.qty),0) n FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      WHERE l.ref_table='service_days' AND l.ref_id=? AND o.service_date=?
        AND o.status='confirmed'`).get(dayId, SERVICE_DATE).n;

    cookie = savedCookie;
    const A = require('../server/allergens');
    await POST(`/admin/week/${weekId}/weekdays`, dish({
      [`${WD}_ack`]: '1',
      [`${WD}_allergens`]: JSON.stringify(A.detect(DISH_DESC).map((h) => h.allergen)),
      [`${WD}_full_cap`]: '99',
      [`${WD}_single_cap`]: '99',
      [`${WD}_daily_cap`]: String(sold + 1),
    }));
    check('the day ceiling was saved against the service day',
      db.prepare('SELECT daily_cap FROM service_days WHERE id = ?').get(dayId).daily_cap, sold + 1);
    cookie = '';

    // One of each size is two portions, and only one is left.
    const bothSizes = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([
        { key: featuredKey, variant: 'full', qty: 1 },
        { key: featuredKey, variant: 'single', qty: 1 },
      ]),
      name: 'Two Sizes', phone: '519-555-0106', email: 'ts@example.com',
      method: 'pickup', location_id: '1',
    });
    check('the ceiling counts both sizes together, not each on its own',
      bothSizes.status, 400);
    ok('and the refusal says so', /across both sizes/i.test(bothSizes.text));

    const lastOne = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'single', qty: 1 }]),
      name: 'Last One', phone: '519-555-0107', email: 'lo@example.com',
      method: 'pickup', location_id: '1',
    });
    check('the one that fits is taken', lastOne.status, 200);

    const overflow = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Too Late', phone: '519-555-0108', email: 'tl@example.com',
      method: 'pickup', location_id: '1',
    });
    check('the next one is refused', overflow.status, 400);
    ok('and it reads as sold out', /sold out/i.test(overflow.text));

    // A standing item is a different level and keeps its own availability.
    const stillOpen = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: schnitzel.key, variant: 'full', qty: 1 }]),
      name: 'Other Level', phone: '519-555-0109', email: 'ol@example.com',
      method: 'pickup', location_id: '1',
    });
    check('the ceiling does not touch Other Options', stillOpen.status, 200);
  }

  /* --- Back in the dashboard ---------------------------------------------- */
  cookie = savedCookie;
  {
    const orders = await GET('/admin/orders');
    check('the orders page opens', orders.status, 200);
    ok('and the order is on it', orders.text.includes('Test Customer'));

    const csv = await GET('/admin/export/orders.csv');
    check('the CSV exports', csv.status, 200);
    ok('and the customer is in it', csv.text.includes('Test Customer'));
    ok('rows are CRLF terminated, the way Excel expects', csv.text.includes('\r\n'));

    // The BOM has to be checked as bytes: TextDecoder strips it during
    // res.text(), so a string comparison would pass even if it were missing.
    const raw = Buffer.from(await (await fetch(`${BASE}/admin/export/orders.csv`,
      { headers: { Cookie: cookie } })).arrayBuffer());
    ok('with a byte-order mark so Excel reads accented names',
      raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF,
      `first bytes were ${[...raw.slice(0, 3)].map((b) => b.toString(16)).join(' ')}`);

    const backup = await GET('/admin/export/backup.json');
    check('the backup exports', backup.status, 200);
    const parsed = JSON.parse(backup.text.replace(/^\uFEFF/, ''));
    ok('and it carries the orders', JSON.stringify(parsed).includes('Test Customer'));
    ok('but never the Facebook token',
      !JSON.stringify(parsed).includes('token_enc') && !parsed.fb_connection);

    const kitchen = await GET(`/admin/sheet/kitchen/${SERVICE_DATE}`);
    check('the kitchen sheet renders', kitchen.status, 200);
    ok('with the dish on it', kitchen.text.includes('Braised Beef'));

    const pickup = await GET(`/admin/sheet/pickup/${SERVICE_DATE}`);
    check('the pickup sheet renders', pickup.status, 200);
  }

  /* --- Duplicating a week resets every acknowledgement --------------------- */
  {
    const before = db.prepare('SELECT COUNT(*) n FROM weeks').get().n;
    await POST('/admin/week/duplicate', {});
    const after = db.prepare('SELECT COUNT(*) n FROM weeks').get().n;
    check('duplicating makes a new week', after, before + 1);

    const copy = db.prepare('SELECT * FROM weeks ORDER BY id DESC LIMIT 1').get();
    check('the copy is a draft', copy.status, 'draft');

    const copiedDays = db.prepare('SELECT * FROM service_days WHERE week_id = ?').all(copy.id);
    check('the dates moved forward a week',
      copiedDays[0].service_date, T.addDays(SERVICE_DATE, 7));
    check('the dish came along', copiedDays[0].dish_name, 'Braised Beef');
    check('but its acknowledgement was reset', copiedDays[0].ack, 0);
    check('and so was the description it was given against', copiedDays[0].ack_of, null);

    const standing = db.prepare('SELECT COUNT(*) n FROM standing_items').get().n;
    check('standing items were left alone — they never belonged to a week', standing, 6);

    check('the day ceiling came along with the copy',
      copiedDays[0].daily_cap, db.prepare('SELECT daily_cap FROM service_days WHERE id = ?').get(dayId).daily_cap);
  }

  /* --- A late request reserves nothing, so no ceiling applies -------------
     Last, because it adds a service day dated today — earlier than the rest
     of the week — and the duplicate check above reads the first day it finds. */
  {
    cookie = '';
    const A = require('../server/allergens');
    const desc = 'Slow braised beef with buttered mash';
    // Today is past its cutoff (22:00 yesterday) but not past the service day
    // itself, which is the one state that produces a late request.
    const today = T.todayIn(TZ);
    db.prepare(`INSERT INTO service_days
      (week_id, service_date, dish_name, description, allergens, dismissed, ack, ack_of,
       full_on, full_price, daily_cap)
      VALUES (?,?,?,?,?,'[]',1,?,1,2200,1)`)
      .run(weekId, today, 'Cutoff Test Dish', desc,
        JSON.stringify(A.detect(A.reviewedText({ name: 'Cutoff Test Dish', description: desc }))
          .map((h) => h.allergen)),
        A.reviewedText({ name: 'Cutoff Test Dish', description: desc }));

    const lateDay = db.prepare('SELECT id FROM service_days WHERE week_id=? AND service_date=?')
      .get(weekId, today);
    const late = await POST('/order', {
      week: weekSlug, date: today,
      lines: JSON.stringify([{ key: `service_days:${lateDay.id}`, variant: 'full', qty: 5 }]),
      name: 'After Hours', phone: '519-555-0110', email: 'ah@example.com',
      method: 'pickup', location_id: '1',
    });
    check('a late request past the ceiling is still accepted', late.status, 200);
    const row = db.prepare('SELECT status FROM orders ORDER BY id DESC LIMIT 1').get();
    check('and it is held as a request, not a confirmed order', row.status, 'late_request');
    check('so it consumes none of the ceiling',
      M.soldOnAll('service_days', lateDay.id, today), 0);
  }

  /* --- Report -------------------------------------------------------------- */
  console.log('\nEnd-to-end flow — Dinner By Derek\n');
  if (failures.length) {
    console.log(failures.join('\n'));
    console.log(`\n${pass} passed, ${fail} FAILED\n`);
  } else {
    console.log(`  ${pass} checks passed.\n`);
  }
  await new Promise((r) => app.server.close(r));
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  if (failures.length) console.log('\nFailures before the crash:\n' + failures.join('\n'));
  console.error('\nFlow test crashed:', e);
  try { app.server.close(); } catch (_) {}
  try { require('../server/db').db.close(); } catch (_) {}
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(1);
});
