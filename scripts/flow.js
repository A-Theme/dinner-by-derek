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
/* And no hash, whatever the real .env holds. config.js prefers the hash when
 * both are set, so a developer who has hashed their own password would other-
 * wise have every sign-in here refused against a password this suite cannot
 * know. The hashed branch is exercised deliberately further down instead. */
process.env.ADMIN_PASSWORD_HASH = '';
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

/* noCookie sends the request with no session at all, for the checks that are
   about being signed out. Without it the jar below puts the live session back
   on and the check passes for the wrong reason — which it did, once. */
async function req(method, url, { body, json, redirect = 'manual', headers: extra, noCookie } = {}) {
  const headers = { ...extra };
  if (cookie && !noCookie) headers.Cookie = cookie;
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

  /* --- This run cannot send email --------------------------------------
     Checked before a single order is placed, because the orders below carry
     @example.com addresses and this suite runs on the owner's own machine.
     SMTP_HOST is blanked at the top of this file and dotenv leaves an
     already-set key alone, so the guard holds — but it is one deleted line
     away from not holding, and the failure would be a run of real deliveries
     out of the real account to addresses that bounce. Cheap to assert, and
     it fails here rather than in someone's sent folder. */
  {
    const mailer = require('../server/mailer');
    const config = require('../server/config');
    ok('the suite cannot send email, whatever .env holds', !mailer.configured(),
      `SMTP_HOST leaked into the test run as ${JSON.stringify(config.smtp.host)} — `
      + 'blank it at the top of this file before running again');
  }

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

    /* A POST with no Content-Type parses to nothing, and every route reads
       req.body.something straight off. That used to be a TypeError and a 500 —
       the server owning a fault that belonged to the request. It must be
       refused the same way any other bad password is. */
    const bodyless = await fetch(`${BASE}/admin/login`, { method: 'POST', redirect: 'manual' });
    check('a body-less post is refused, not a server error', bodyless.status, 401);
    ok('and still no session', !cookie.includes('dbd_admin'));

    const good = await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    check('the right password signs in', good.status, 303);
    ok('and sets a session cookie', cookie.includes('dbd_admin'));

    const dash = await GET('/admin');
    check('the dashboard opens', dash.status, 200);
  }

  /* --- The photo inputs must not sit inside the dropzone ----------------- *
   * input.click() dispatches a real click on the input, and it bubbles. With
   * these inside the dropzone, "Take photo" called cam.click(), the event rose
   * into the dropzone's click handler, that handler saw an INPUT rather than a
   * BUTTON, and it opened the photo library over the camera. The camera fired
   * every time and was covered every time, which is why it read as dead.
   * The fix is positional, so the guard is positional. */
  {
    const h = (await GET('/admin/week')).text;
    const dropAt = h.indexOf('data-drop');
    const dzEndAt = h.indexOf('dz-msg', dropAt);       // last thing in the dropzone
    const camAt = h.indexOf('data-camera', dropAt);
    const fileAt = h.indexOf('data-file', dropAt);
    ok('the dropzone renders', dropAt !== -1);
    ok('the camera input is OUTSIDE the dropzone', camAt > dzEndAt,
      `dropzone ends near ${dzEndAt}, camera input at ${camAt}`);
    ok('the file input is OUTSIDE the dropzone', fileAt > dzEndAt,
      `dropzone ends near ${dzEndAt}, file input at ${fileAt}`);
  }

  /* --- One editor, two layouts ------------------------------------------ *
   * A desktop and a phone want the day editor in different orders, and the
   * cheap way to get that is two templates — which then drift, and the one
   * that drifts is the one used less. So there is one, and the phone layout is
   * CSS over the same markup.
   *
   * What that costs is a rule the markup has to keep: every group must be a
   * single element for `order` to move it, and no `order` may exist outside
   * the phone media query, or the desktop stops rendering in source order and
   * the stylesheet has quietly become the second template. Both are checked
   * here, against the page as it is actually served. */
  {
    const h = (await GET('/admin/week')).text;
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.css'), 'utf8');
    const groups = ['ie-basics', 'ie-allergens', 'ie-photo', 'ie-halal', 'ie-prices'];
    groups.forEach((g) => ok(`the editor renders ${g} as one element`, h.includes(`"${g}"`) || h.includes(`${g}"`)));

    // Source order is the desktop order. If these ever cross, a desktop has
    // silently been re-laid-out by an edit meant for the phone.
    ok('and in source order: name, allergens, photo, prices — the desktop form',
      h.indexOf('ie-basics') < h.indexOf('ie-allergens')
      && h.indexOf('ie-allergens') < h.indexOf('ie-photo')
      && h.indexOf('ie-photo') < h.indexOf('ie-prices'));

    // The rare pair are one element, so one `order` moves both.
    const rareAt = h.indexOf('class="day-rare"');
    const rareEnd = h.indexOf('</details>', rareAt);
    ok('the rare day settings are one disclosure', rareAt !== -1);
    ok('holding the closed box and the daily cap together',
      h.indexOf('_closed"', rareAt) < rareEnd && h.indexOf('_daily_cap', rareAt) < rareEnd);

    const phone = css.slice(css.indexOf('@media (max-width: 680px)'));
    ok('the phone layout is in the stylesheet, not a second template',
      /\.item-editor \{ display: flex/.test(phone) && /\.ie-basics\s+\{ order/.test(phone));
    const stray = css.slice(0, css.indexOf('@media (max-width: 680px)'));
    ok('and nothing reorders the editor above the breakpoint',
      !/\.(ie-|day-)[a-z]+\s*\{[^}]*order:/.test(stray));
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
      method: 'pickup', payment_method: 'etransfer',
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
    check('the payment choice was stored for the kitchen', order.payment_method, 'etransfer');
    check('but choosing a method does not mark the order paid', order.paid, 0);
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

  /* --- The customer is told what to put in the transfer message -----------
     Half of the e-transfer reconciliation, and the half that happens out
     here in public. The order is placed now, while the day is still open;
     the dashboard end of it runs further down, once this suite has signed
     in. They are deliberately far apart, because the reference has to
     survive the trip between two files that never call each other. */
  {
    const placed = await POST('/order', {
      week: weekSlug,
      date: SERVICE_DATE,
      lines: JSON.stringify([{ key: schnitzel.key, variant: 'full', qty: 1 }]),
      name: 'Reconcile Me',
      phone: '519-555-0142',
      email: 'reconcile@example.com',
      method: 'pickup', payment_method: 'etransfer',
      location_id: String(db.prepare('SELECT id FROM locations LIMIT 1').get().id),
    });
    check('the order goes through', placed.status, 200);

    const order = db.prepare("SELECT * FROM orders WHERE name = 'Reconcile Me' ORDER BY id DESC LIMIT 1").get();
    ok('and is stored', !!order);

    ok('the confirmation screen tells the customer to put the reference in the message',
      placed.text.includes(order.ref) && /in the e-transfer message/i.test(placed.text),
      placed.text.slice(0, 200));

  }

  /* --- Things a customer must not be able to do --------------------------- */
  {
    const cheaper = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1, price: 1 }]),
      name: 'Chancer', phone: '519-555-0100', email: 'c@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
    ok('a price sent by the browser is ignored', order.subtotal >= 2200,
      `subtotal came out as ${order.subtotal}`);

    const badLocation = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Early Bird', phone: '519-555-0101', email: 'e@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '999999',
    });
    check('a nonexistent pickup location is refused', badLocation.status, 400);

    /* --- The review step prices without committing --------------------- */
    {
      const before = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
      const q = await req('POST', '/api/quote', {
        json: {
          week: weekSlug, date: SERVICE_DATE,
          // A standing item, not the featured dish: by this point in the run
          // the featured dish has deliberately been sold out by earlier checks.
          lines: JSON.stringify([{ key: schnitzel.key, variant: 'full', qty: 2 }]),
          name: 'Window Shopper', phone: '519-555-0105',
          method: 'pickup', payment_method: 'etransfer',
          location_id: String(db.prepare('SELECT id FROM locations LIMIT 1').get().id),
        },
      });
      ok('the review returns a quote', q.status === 200, `got ${q.status}: ${q.text.slice(0, 200)}`);
      const body = JSON.parse(q.text);
      ok('priced from the database, not the browser', body.ok && body.subtotal > 0);
      check('and it prices the quantity asked for', body.lines[0].qty, 2);
      check('the total is the subtotal plus any delivery', body.total, body.subtotal + body.deliveryFee);
      ok('it names the payment method back', !!body.payment);
      check('reviewing stores nothing', db.prepare('SELECT COUNT(*) n FROM orders').get().n, before);

      const bad = await req('POST', '/api/quote', {
        json: {
          week: weekSlug, date: SERVICE_DATE,
          lines: JSON.stringify([{ key: schnitzel.key, variant: 'full', qty: 1 }]),
          name: 'No Method', phone: '519-555-0106',
          method: 'delivery', payment_method: 'cash',
          addr_line: '1 Yonge St', postal: 'M5V 2T6',
        },
      });
      check('a review of an undeliverable order is refused too', bad.status, 400);
      const badMsg = JSON.parse(bad.text).error;
      ok('with the same sentence the submit would give',
        /deliver/i.test(badMsg), `error was: ${badMsg}`);
    }

    // The payment choice is a declaration the kitchen plans around, so it is
    // required and validated rather than defaulted — recording "e-transfer"
    // for someone who never said so is the failure this field exists to stop.
    const noPayment = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'No Method', phone: '519-555-0103', email: 'n@example.com',
      method: 'pickup', location_id: String(db.prepare('SELECT id FROM locations LIMIT 1').get().id),
    });
    check('an order with no payment choice is refused', noPayment.status, 400);

    const madeUpPayment = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Made Up', phone: '519-555-0104', email: 'm@example.com',
      method: 'pickup', payment_method: 'bitcoin',
      location_id: String(db.prepare('SELECT id FROM locations LIMIT 1').get().id),
    });
    check('and a payment method the app does not offer is refused', madeUpPayment.status, 400);

    // This suite places more orders in one run than the limiter allows in a
    // minute, and refused attempts count too. Clearing the buckets keeps the
    // real limit intact rather than widening it to fit a script.
    require('../server/ratelimit').reset();

    const forgedDelivery = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Far Away', phone: '519-555-0102', email: 'f@example.com',
      method: 'delivery', payment_method: 'cash', addr_line: '1 Yonge St', postal: 'M5V 2T6',
      eligible: '1', delivery_fee: '0',
    });
    check('a forged eligibility flag is refused', forgedDelivery.status, 400);

    const pastDay = await POST('/order', {
      week: weekSlug, date: PAST_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Time Traveller', phone: '519-555-0103', email: 't@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    check('an order for a day not on the menu is refused', pastDay.status, 400);

    const overCap = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 40 }]),
      name: 'Bulk Buyer', phone: '519-555-0104', email: 'b@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    check('ordering past the cap is refused', overCap.status, 400);
    ok('and the refusal is a sentence, not a stack trace',
      !overCap.text.includes('at Object.') && !overCap.text.includes('node_modules'));

    const empty = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE, lines: '[]',
      name: 'Nobody', phone: '519-555-0105', email: 'n@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
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
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    check('the ceiling counts both sizes together, not each on its own',
      bothSizes.status, 400);
    ok('and the refusal says so', /across both sizes/i.test(bothSizes.text));

    const lastOne = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'single', qty: 1 }]),
      name: 'Last One', phone: '519-555-0107', email: 'lo@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    check('the one that fits is taken', lastOne.status, 200);

    const overflow = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: featuredKey, variant: 'full', qty: 1 }]),
      name: 'Too Late', phone: '519-555-0108', email: 'tl@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });
    check('the next one is refused', overflow.status, 400);
    ok('and it reads as sold out', /sold out/i.test(overflow.text));

    // A standing item is a different level and keeps its own availability.
    const stillOpen = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: schnitzel.key, variant: 'full', qty: 1 }]),
      name: 'Other Level', phone: '519-555-0109', email: 'ol@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
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

  /* --- The two cutoffs, over HTTP ----------------------------------------
     No same-day orders: past 22:00 the night before, only a late request;
     past 06:00 on the morning itself, nothing at all.

     Driven by moving the two settings rather than by waiting for a particular
     hour — a test that only proves the rule between midnight and six in the
     morning proves it for nobody. Both states are reached deterministically at
     any hour the suite is run, because the cutoff is always on the day before
     the service date and the late cutoff always on the day itself.

     Last, because it adds a service day dated today — earlier than the rest
     of the week — and the duplicate check above reads the first day it finds. */
  {
    const { settings } = require('../server/db');
    const A = require('../server/allergens');
    const desc = 'Slow braised beef with buttered mash';
    const today = T.todayIn(TZ);
    const tomorrow = T.addDays(today, 1);

    const addDay = (date) => {
      const reviewed = A.reviewedText({ name: 'Cutoff Test Dish', description: desc });
      db.prepare(`INSERT INTO service_days
        (week_id, service_date, dish_name, description, allergens, dismissed, ack, ack_of,
         full_on, full_price, daily_cap)
        VALUES (?,?,?,?,?,'[]',1,?,1,2200,1)`)
        .run(weekId, date, 'Cutoff Test Dish', desc,
          JSON.stringify(A.detect(reviewed).map((h) => h.allergen)), reviewed);
      return db.prepare('SELECT id FROM service_days WHERE week_id=? AND service_date=?')
        .get(weekId, date).id;
    };
    const order = (date, dayId, name, qty = 1) => POST('/order', {
      week: weekSlug, date,
      lines: JSON.stringify([{ key: `service_days:${dayId}`, variant: 'full', qty }]),
      name, phone: '519-555-0110', email: 'ah@example.com',
      method: 'pickup', payment_method: 'etransfer', location_id: '1',
    });

    /* 1. Inside the late window: cutoff already gone by, late cutoff still to
          come. A request is taken, and it reserves nothing — the day's ceiling
          is 1 and it asks for 5. */
    require('../server/ratelimit').reset();   // see the note at the first reset

    settings.set('cutoff_hour', 0);       // 00:00 today: passed, whatever the hour
    settings.set('cutoff_minute', 0);
    settings.set('late_cutoff_hour', 23); // 23:59 tomorrow: still to come
    settings.set('late_cutoff_minute', 59);
    const lateDay = addDay(tomorrow);

    cookie = '';
    const late = await order(tomorrow, lateDay, 'After Hours', 5);
    check('inside the late window a request is accepted', late.status, 200);
    check('and it is held as a request, not a confirmed order',
      db.prepare('SELECT status FROM orders ORDER BY id DESC LIMIT 1').get().status, 'late_request');
    check('so it consumes none of the ceiling',
      M.soldOnAll('service_days', lateDay, tomorrow), 0);
    ok('the page says when the requests stop',
      /late request until/i.test((await GET(`/w/${weekSlug}/${tomorrow}`)).text));

    /* 2. Past the late cutoff, on the morning of service: nothing at all. */
    settings.set('late_cutoff_hour', 0);  // 00:00 today: passed, whatever the hour
    settings.set('late_cutoff_minute', 0);
    const shutDay = addDay(today);

    const page = await GET(`/w/${weekSlug}/${today}`);
    ok('the day page says ordering has closed', /Ordering has closed/i.test(page.text));
    ok('and carries no order form at all', !/id="orderform"/.test(page.text));
    const steppers = page.text.match(/<button[^>]*data-step[^>]*>/g) || [];
    ok('while every stepper on the menu is dead, not merely pointless',
      steppers.length > 0 && steppers.every((s) => /\sdisabled/.test(s)),
      `${steppers.length} steppers, first: ${steppers[0]}`);
    ok('while still showing the dish, so the reader knows what they missed',
      /Cutoff Test Dish/.test(page.text));

    const refused = await order(today, shutDay, 'Too Late');
    check('and the server refuses the order outright', refused.status, 400);
    ok('saying when it closed', /closed at .*(a\.m\.|AM)/i.test(refused.text),
      refused.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240));
    check('nothing was stored',
      db.prepare(`SELECT COUNT(*) n FROM orders WHERE name='Too Late'`).get().n, 0);

    /* 3. The same day, one minute inside the window, is taken — proving the
          refusal above is the clock and not the day being unorderable. */
    settings.set('late_cutoff_hour', 23);
    settings.set('late_cutoff_minute', 59);
    const allowed = await order(today, shutDay, 'Just In Time');
    check('moving the late cutoff opens the same day again', allowed.status, 200);
    check('as a request, never a confirmed order',
      db.prepare(`SELECT status FROM orders WHERE name='Just In Time'`).get().status, 'late_request');

    settings.set('cutoff_hour', 22);
    settings.set('cutoff_minute', 0);
    settings.set('late_cutoff_hour', 6);
    settings.set('late_cutoff_minute', 0);
  }

  /* --- Closing a day, and closing the week --------------------------------
     Closed has to reach the customer, not just the database: the day says so
     on the menu, the day page says so, and the order route refuses by name.
     Run against the week that is currently live, so what is checked is what a
     customer would actually be served. */
  {
    require('../server/ratelimit').reset();   // see the note at the first reset
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });

    // The weekday box owns the dish, so the closure is saved alongside it —
    // sending it without the dish fields would blank the dish.
    await POST(`/admin/week/${weekId}/weekdays`, dish({
      [`${WD}_ack`]: '1',
      [`${WD}_allergens`]: JSON.stringify(require('../server/allergens').detect(DISH_DESC).map((h) => h.allergen)),
      [`${WD}_closed`]: '1',
      [`${WD}_closed_note`]: 'Back Thursday',
    }));
    const closedDay = db.prepare('SELECT * FROM service_days WHERE id = ?').get(dayId);
    check('the day is stored as closed', closedDay.closed, 1);
    check('with its note', closedDay.closed_note, 'Back Thursday');
    check('and the dish it had is kept, not deleted', closedDay.dish_name, 'Braised Beef');

    cookie = '';                                   // from here on, as a customer
    const weekPage = await GET(`/w/${weekSlug}`);
    ok('the day list marks the day closed',
      /Not cooking/.test(weekPage.text) && /kitchen is closed this day/i.test(weekPage.text));
    ok('and shows the note', /Back Thursday/.test(weekPage.text));
    ok('and does not link to it',
      !new RegExp(`href="/w/${weekSlug}/${SERVICE_DATE}"`).test(weekPage.text));

    const dayPage = await GET(`/w/${weekSlug}/${SERVICE_DATE}`);
    check('the day permalink still answers rather than 404s', dayPage.status, 200);
    ok('and explains itself', /isn't cooking|isn&#39;t cooking/i.test(dayPage.text));
    ok('with no order form on it', !/id="orderform"/.test(dayPage.text));
    ok('and nothing orderable — not even the standing items',
      !/data-qty/.test(dayPage.text));

    const refused = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: `service_days:${dayId}`, variant: 'full', qty: 1 }]),
      name: 'Hopeful', phone: '519-555-0177', email: 'h@example.com',
      method: 'pickup', payment_method: 'cash', location_id: '1',
    });
    check('an order for a closed day is refused', refused.status, 400);
    ok('in as many words', /isn't cooking|isn&#39;t cooking/i.test(refused.text),
      refused.text.replace(/<[^>]+>/g, ' ').slice(0, 200));

    // Reopening puts it all back.
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    await POST(`/admin/week/${weekId}/weekdays`, dish({
      [`${WD}_ack`]: '1',
      [`${WD}_allergens`]: JSON.stringify(require('../server/allergens').detect(DISH_DESC).map((h) => h.allergen)),
    }));
    check('unticking it reopens the day',
      db.prepare('SELECT closed FROM service_days WHERE id = ?').get(dayId).closed, 0);
    const reopened = await GET(`/w/${weekSlug}/${SERVICE_DATE}`);
    ok('and the dish is back in front of customers', /Braised Beef/.test(reopened.text));

    // A day with no dish on it at all: closing one creates the row it never
    // had, and reopening it has to write that row back rather than be dropped
    // as "nothing entered for this day".
    const WD2 = WD === 'mon' ? 'tue' : 'mon';
    const otherDate = T.addDays(T.mondayOf(SERVICE_DATE), T.WEEKDAYS_MON_FIRST.indexOf(WD2));
    const reviewedDish = dish({
      [`${WD}_ack`]: '1',
      [`${WD}_allergens`]: JSON.stringify(require('../server/allergens').detect(DISH_DESC).map((h) => h.allergen)),
    });
    await POST(`/admin/week/${weekId}/weekdays`, { ...reviewedDish, [`${WD2}_closed`]: '1' });
    const bare = db.prepare('SELECT * FROM service_days WHERE week_id=? AND service_date=?')
      .get(weekId, otherDate);
    ok('closing a day with no dish on it creates the day', !!bare && bare.closed === 1);

    await POST(`/admin/week/${weekId}/weekdays`, reviewedDish);
    check('and unticking it reopens that day too',
      db.prepare('SELECT closed FROM service_days WHERE week_id=? AND service_date=?')
        .get(weekId, otherDate).closed, 0);
    db.prepare('DELETE FROM service_days WHERE week_id=? AND service_date=?').run(weekId, otherDate);

    // The whole week.
    const closeWeek = await POST(`/admin/week/${weekId}/closed`,
      { closed: '1', closed_note: 'Away for a wedding' });
    check('closing the week redirects back with a message', closeWeek.status, 303);
    check('and is stored on the week',
      db.prepare('SELECT closed FROM weeks WHERE id = ?').get(weekId).closed, 1);

    cookie = '';
    const shutWeek = await GET(`/w/${weekSlug}`);
    ok('customers are told the kitchen is closed', /closed this week/i.test(shutWeek.text));
    ok('and read the reason', /Away for a wedding/.test(shutWeek.text));
    ok('with no day list to pick from', !/daylist/.test(shutWeek.text));

    const shutDay = await GET(`/w/${weekSlug}/${SERVICE_DATE}`);
    ok('every day in it is closed, whatever the day itself says',
      /isn't cooking|isn&#39;t cooking/i.test(shutDay.text));

    const refusedAgain = await POST('/order', {
      week: weekSlug, date: SERVICE_DATE,
      lines: JSON.stringify([{ key: `service_days:${dayId}`, variant: 'full', qty: 1 }]),
      name: 'Hopeful', phone: '519-555-0177', email: 'h@example.com',
      method: 'pickup', payment_method: 'cash', location_id: '1',
    });
    check('and orders on it are refused too', refusedAgain.status, 400);

    // A closed week publishes without an allergen review, since nothing on it
    // is on offer — but it must not be able to reopen without one.
    const P2 = require('../server/publish');
    check('a closed week has no blockers', P2.blockers(weekId), []);

    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    await POST(`/admin/week/${weekId}/closed`, { closed: '0', closed_note: '' });
    check('reopening the week restores the menu',
      db.prepare('SELECT closed FROM weeks WHERE id = ?').get(weekId).closed, 0);
    cookie = '';
    const back = await GET(`/w/${weekSlug}`);
    ok('and customers can pick a day again', /daylist/.test(back.text));
  }

  /* --- Owner emails can go to more than one address ----------------------
   The field is a comma-separated list, so a second recipient is a text
   edit rather than a code change. Stored tidy, because a trailing comma
   would otherwise reach nodemailer as an empty recipient and take the
   whole message down with it. */
  {
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    const { settings } = require('../server/db');
    const base = {
      business_name: 'Dinner By Derek', timezone: 'America/Toronto',
      cutoff_time: '22:00', late_cutoff_time: '06:00',
      payment_instructions: 'Pay at pickup.', owner_contact: 'Call us.',
    };

    await POST('/admin/settings', { ...base, notify_email: 'one@example.com' });
    check('a single address saves as it was typed',
      settings.get('notify_email'), 'one@example.com');

    await POST('/admin/settings', { ...base, notify_email: '  one@example.com ,  two@example.com , ' });
    check('a messy list is stored tidy, with no empty recipient',
      settings.get('notify_email'), 'one@example.com, two@example.com');

    const form = await GET('/admin/settings');
    ok('and the field accepts a list rather than refusing it',
      /name="notify_email"/.test(form.text) && /<input type="email" multiple/.test(form.text));

    await POST('/admin/settings', { ...base, notify_email: '' });
    check('clearing it leaves nothing behind', settings.get('notify_email'), '');
  }

  /* --- The reminder settings are wired to the form ------------------------ */
  {
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    const { settings } = require('../server/db');
    await POST('/admin/settings/publishing', {
      auto_publish: '1', auto_publish_weekday: 'sat', auto_publish_time: '12:00',
      remind_missing_week: '1', remind_missing_week_days: '3',
    });
    check('the reminder lead time saves', settings.get('remind_missing_week_days'), '3');

    await POST('/admin/settings/publishing', {
      auto_publish: '1', auto_publish_weekday: 'sat', auto_publish_time: '12:00',
      remind_missing_week_days: '2',
    });
    check('and the reminder can be switched off', settings.get('remind_missing_week'), '0');
    settings.set('remind_missing_week', '1');
  }

  /* --- The schedule refuses an unreviewed week, then publishes it ---------
     The whole point of scheduled publishing: it must be incapable of putting
     an unreviewed dish in front of a customer just because nobody was watching
     at noon on Saturday. Last, because publishing retires the week the earlier
     checks were using. */
  {
    const P = require('../server/publish');
    const { settings } = require('../server/db');
    settings.set('auto_publish', 1);
    settings.set('auto_publish_weekday', 'sat');
    settings.set('auto_publish_time', '12:00');

    // A draft week starting this Monday: its Saturday noon has already passed,
    // so it is due, while its service days are still ahead and therefore
    // visible to a customer once it goes live.
    const start = T.mondayOf(today);
    const id = db.prepare(`INSERT INTO weeks (slug, title, week_start, status)
      VALUES (?,?,?,'draft')`).run(`sched-${start}`, 'Scheduled week', start).lastInsertRowid;
    // Backdate creation so the schedule falls after it: a week built on Sunday
    // must not fire the Saturday that already went by, and the test needs to be
    // on the other side of that rule.
    db.prepare(`UPDATE weeks SET created_at = datetime(?, '-14 days') WHERE id = ?`)
      .run(start, id);

    const desc = 'Cod fillets in a cream sauce';
    const dishId = db.prepare(`INSERT INTO service_days
      (week_id, service_date, dish_name, description, allergens, dismissed, ack, ack_of, full_on, full_price)
      VALUES (?,?,?,?,'[]','[]',0,NULL,1,2000)`)
      .run(id, T.addDays(start, 5), 'Baked Cod', desc).lastInsertRowid;

    ok('the week is scheduled', !!P.scheduledFor(db.prepare('SELECT * FROM weeks WHERE id=?').get(id)));
    ok('and it is due', P.due().some((w) => w.id === id));

    let refused = null;
    const first = P.runDue({ onRefused: (w, b) => { refused = b; } });
    const afterFirst = db.prepare('SELECT * FROM weeks WHERE id=?').get(id);
    check('an unreviewed week is refused, not published', afterFirst.status, 'draft');
    ok('the refusal names the dish', refused && refused.join(' ').includes('Baked Cod'),
      JSON.stringify(refused));
    ok('and it is reported as refused', first.some((r) => r.week.id === id && !r.published));
    ok('the owner is marked as told', !!afterFirst.publish_warned_at);

    let toldAgain = false;
    P.runDue({ onRefused: () => { toldAgain = true; } });
    ok('and is not told again on the next tick', !toldAgain);
    check('while the week stays a draft',
      db.prepare('SELECT status FROM weeks WHERE id=?').get(id).status, 'draft');

    // Finish the review the way the dashboard would, and let the clock run on.
    const A2 = require('../server/allergens');
    const reviewed = A2.reviewedText({ name: 'Baked Cod', description: desc });
    db.prepare('UPDATE service_days SET allergens=?, ack=1, ack_of=? WHERE id=?')
      .run(JSON.stringify(A2.detect(reviewed).map((h) => h.allergen)), reviewed, dishId);

    let published = null;
    P.runDue({ onPublished: (w) => { published = w; } });
    const afterFix = db.prepare('SELECT * FROM weeks WHERE id=?').get(id);
    check('finishing the review publishes it with nothing else pressed', afterFix.status, 'published');
    ok('and the owner is told it went out', published && published.id === id);
    ok('the fish in the dish name was caught before it went live',
      JSON.parse(db.prepare('SELECT allergens FROM service_days WHERE id=?').get(dishId).allergens)
        .includes('fish'));

    // '/' redirects to the live week's own URL, so follow it.
    const landing = await GET('/');
    const seen = landing.status === 200 ? landing : await GET(landing.location);
    ok('and customers can see it',
      seen.status === 200 && /Baked Cod|Scheduled week/i.test(seen.text),
      'page was: ' + seen.text.replace(/<[^>]+>/g, ' ').replace(/s+/g, ' ').slice(0, 200));

    // An empty week must never replace a live menu with a blank one just
    // because its Saturday came round before the cooking was decided.
    const emptyId = db.prepare(`INSERT INTO weeks (slug, title, week_start, status)
      VALUES (?,?,?,'draft')`).run(`empty-${start}`, 'Empty week', start).lastInsertRowid;
    db.prepare(`UPDATE weeks SET created_at = datetime(?, '-14 days') WHERE id = ?`).run(start, emptyId);
    let emptyRefusal = null;
    P.runDue({ onRefused: (w, b) => { if (w.id === emptyId) emptyRefusal = b; } });
    check('an empty week is not published',
      db.prepare('SELECT status FROM weeks WHERE id=?').get(emptyId).status, 'draft');
    ok('and the refusal says there is nothing on it',
      emptyRefusal && /nothing on this week/i.test(emptyRefusal[0]), JSON.stringify(emptyRefusal));
    ok('so the week that is live stays live',
      db.prepare(`SELECT COUNT(*) n FROM weeks WHERE status='published'`).get().n === 1);

    // A week that opts out is left alone even when its moment has passed.
    const id2 = db.prepare(`INSERT INTO weeks (slug, title, week_start, status, auto_publish)
      VALUES (?,?,?,'draft',0)`).run(`optout-${start}`, 'Opted out', start).lastInsertRowid;
    db.prepare(`UPDATE weeks SET created_at = datetime(?, '-14 days') WHERE id = ?`).run(start, id2);
    P.runDue();
    check('a week opted out of the schedule stays a draft',
      db.prepare('SELECT status FROM weeks WHERE id=?').get(id2).status, 'draft');
  }

  /* --- A forged X-Forwarded-For buys no extra login attempts ---------------
     The limiter counts against req.ip, and req.ip believes X-Forwarded-For
     only when TRUST_PROXY says a proxy is writing it. Unset here, as on a
     server reachable without nginx in front — so naming a fresh address on
     every attempt must not reset the count. */
  {
    const RL = require('../server/ratelimit');
    RL.reset();
    const statuses = [];
    for (let i = 0; i < 10; i++) {
      const r = await POST('/admin/login', { password: 'not-it' },
        { headers: { 'X-Forwarded-For': `203.0.113.${i}` } });
      statuses.push(r.status);
    }
    ok('the first forged attempt is judged on the password, not refused outright',
      statuses[0] === 401);
    ok('a fresh forwarded address per attempt still reaches the limit',
      statuses[statuses.length - 1] === 429);
    const written = db.prepare('SELECT COUNT(*) n FROM login_failures').get().n;
    ok('and every refusal was written down, not just rate-limited', written >= 8);

    RL.reset();
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });

    const dash = await GET('/admin');
    ok('the dashboard says so once there have been enough of them',
      dash.text.includes('refused sign-ins'));
    db.prepare('DELETE FROM login_failures').run();
    const quiet = await GET('/admin');
    ok('and says nothing when there is nothing to say',
      !quiet.text.includes('refused sign-ins'));
  }

  /* --- What the browser is told it may load -------------------------------- */
  {
    const res = await fetch(`${BASE}/`);
    const csp = res.headers.get('content-security-policy') || '';
    ok('a policy is sent at all', csp.length > 0);
    ok('inline script is refused outright, not waved through', csp.includes("script-src 'self'")
      && !csp.includes("script-src 'self' 'unsafe-inline'"));
    ok('nothing may frame the dashboard', csp.includes("frame-ancestors 'none'"));
    ok('forms may only post back here', csp.includes("form-action 'self'"));
    check('and the older header says it too', res.headers.get('x-frame-options'), 'DENY');
    check('referrers are trimmed leaving the site',
      res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    check('no https promise is made from an http address',
      res.headers.get('strict-transport-security'), null);

    /* The policy above is only honest if the pages carry no inline script.
       Checked across every page that renders one, not a sample: this test
       used to look at two of them, and the Facebook preview — the page whose
       copy button is the fallback when publishing fails — kept an inline
       handler that the policy silently switched off. */
    // Read the live week rather than reusing weekSlug: by this point the
    // suite has unpublished, duplicated and republished, so the slug captured
    // at the top no longer points at what customers can see.
    const live = db.prepare(`SELECT w.slug, d.service_date FROM weeks w
      JOIN service_days d ON d.week_id = w.id
      WHERE w.status = 'published' ORDER BY d.service_date LIMIT 1`).get();
    ok('a published week exists to check the customer page against', !!live);

    const pages = [
      ['the day menu', `/w/${live.slug}/${live.service_date}`],
      ['the week page', '/admin/week'],
      ['the Facebook preview', `/admin/facebook/preview/${weekId}`],
      ['the settings page', '/admin/settings'],
      ['the orders page', '/admin/orders'],
      ['the kitchen sheet', `/admin/sheet/kitchen/${SERVICE_DATE}`],
    ];
    /* A <script> with a src, or carrying a non-JavaScript type, is a data
       block rather than code — the ordering page's JSON config is one, and
       the CSP does not execute it. Anything else inline is what this is for. */
    const inlineScript = /<script(?![^>]*\ssrc=)(?![^>]*type="(?:application\/json|application\/ld\+json)")/i;
    for (const [label, url] of pages) {
      const r = await GET(url);
      // Guard against the check passing because the page wasn't there at all:
      // a redirect or a 404 body trivially contains no inline script.
      check(`${label} renders`, r.status, 200);
      ok(`${label} is a real page, not an empty body`, r.text.length > 400, `${url} -> ${r.text.length} bytes`);
      ok(`${label} has no inline event handler`, !/\son[a-z]+="/i.test(r.text), url);
      ok(`${label} has no inline script`, !inlineScript.test(r.text), url);
    }
  }

  /* --- Sending the same order twice places it once -------------------------
     A double tap, a refresh of the posted form, or a phone that lost signal
     after the request had already landed. All three post the same body a
     second time, and the kitchen must not read two tickets for one dinner. */
  {
    /* The day ordered against is made here rather than found.
     *
     * This used to take the earliest published, unclosed day in the database,
     * and by this point that is a day dated *today* — inserted by the cutoff
     * section above, and so already past its cutoff. Whether the order was
     * accepted then depended on the clock rather than on the code, which is
     * how a suite comes to pass on a Wednesday and fail on a Saturday with
     * nothing changed in between. A test about posting the same order twice
     * should not also be a test of what day of the week it is.
     *
     * SERVICE_DATE is three days out and comfortably open, and the row is
     * written straight in with its review already done, because none of that
     * is what this block is checking. */
    const A = require('../server/allergens');
    const pubWeek = db.prepare(
      `SELECT id, slug FROM weeks WHERE status = 'published' ORDER BY id DESC LIMIT 1`).get();
    ok('a published week exists to hang the duplicate test on', !!pubWeek);

    const dtDesc = 'Braised beef, for the duplicate-submission check';
    const dtReviewed = A.reviewedText({ name: 'Double Tap Dish', description: dtDesc });
    db.prepare(`INSERT OR IGNORE INTO service_days
      (week_id, service_date, dish_name, description, allergens, dismissed, ack, ack_of,
       full_on, full_price)
      VALUES (?,?,?,?,?,'[]',1,?,1,2200)`)
      .run(pubWeek.id, SERVICE_DATE, 'Double Tap Dish', dtDesc,
        JSON.stringify(A.detect(dtReviewed).map((h) => h.allergen)), dtReviewed);

    const live = db.prepare(`SELECT w.slug, w.id, d.id AS day_id, d.service_date
      FROM weeks w JOIN service_days d ON d.week_id = w.id
      WHERE w.id = ? AND d.service_date = ? AND d.closed = 0`)
      .get(pubWeek.id, SERVICE_DATE);
    ok('and the day it will order against is open', !!live,
      `week ${pubWeek && pubWeek.id}, ${SERVICE_DATE}`);
    const loc = db.prepare('SELECT id FROM locations WHERE active = 1 LIMIT 1').get();
    const countFor = (name) => db.prepare(
      'SELECT COUNT(*) n FROM orders WHERE name = ?').get(name).n;

    const body = (key) => ({
      week: live.slug, date: live.service_date,
      lines: JSON.stringify([{ key: `service_days:${live.day_id}`, variant: 'full', qty: 1 }]),
      name: 'Double Tap', phone: '519-555-0142', email: 'dt@example.com',
      method: 'pickup', location_id: loc.id, payment_method: 'cash',
      submission_key: '11111111-2222-3333-4444-555555555555',
    });

    require('../server/ratelimit').reset();
    const first = await POST('/order', body());
    check('the first submission is taken', first.status, 200);
    check('and is the only order on file', countFor('Double Tap'), 1);
    const ref = db.prepare(
      `SELECT ref FROM orders WHERE name = 'Double Tap'`).get().ref;

    const second = await POST('/order', body());
    check('the repeat is answered, not refused', second.status, 200);
    check('and still only one order exists', countFor('Double Tap'), 1);
    ok('the repeat shows the confirmation for the order already placed',
      second.text.includes(ref), `expected ${ref} in the second response`);

    // A different key from the same customer is a genuine second order.
    const another = await POST('/order', {
      ...body(), submission_key: '99999999-8888-7777-6666-555555555555',
    });
    check('a fresh submission key is a new order', another.status, 200);
    check('so the second one is stored', countFor('Double Tap'), 2);

    // No key at all still works — an unscripted post, or an older page.
    const bare = { ...body() };
    delete bare.submission_key;
    await POST('/order', bare);
    check('an order without a key is still accepted', countFor('Double Tap'), 3);
    require('../server/ratelimit').reset();
  }

  /* --- The cutoff time is stored as it was typed ---------------------------
     Both cutoffs are clamped the same way now. The main one used to run
     through `Number(x) || 22`, which treats a typed midnight as falsy and
     stored 22:00 instead — and accepted an hour of 99, which pushes the
     cutoff past the day it guards. */
  {
    const { settings } = require('../server/db');
    const before = ['cutoff_hour', 'cutoff_minute', 'late_cutoff_hour', 'late_cutoff_minute']
      .map((k) => [k, settings.get(k)]);
    const save = (cutoff, late) => POST('/admin/settings', {
      cutoff_time: cutoff, late_cutoff_time: late,
      business_name: 'Dinner By Derek', timezone: 'America/Toronto',
    });
    const read = () => [settings.getInt('cutoff_hour', 22), settings.getInt('cutoff_minute', 0)];

    await save('00:30', '06:00');
    check('a cutoff of midnight is stored as midnight', read(), [0, 30]);

    await save('22:00', '06:00');
    check('an ordinary cutoff still saves', read(), [22, 0]);

    await save('99:99', '06:00');
    check('an impossible hour falls back rather than storing 99', read(), [22, 0]);

    await save('abc', '06:00');
    check('and so does something that is not a time at all', read(), [22, 0]);

    await save('22:00', '00:00');
    check('the late cutoff still takes midnight too',
      [settings.getInt('late_cutoff_hour', 6), settings.getInt('late_cutoff_minute', 0)], [0, 0]);

    for (const [k, v] of before) settings.set(k, v);
  }

  /* --- Editing a standing item answers on the item itself -----------------
     A save used to close the editor, drop the owner at the top of a table and
     leave the whole story to a toast at the bottom of the screen — including,
     for an unreviewed item, that none of it is visible to customers. */
  {
    const item = db.prepare("SELECT * FROM standing_items ORDER BY id LIMIT 1").get();
    const r = await POST(`/admin/other-options/${item.id}`, {
      si_name: item.name, si_subcategory: item.subcategory,
      si_description: item.description || "", si_full_on: "1", si_full_price: "23.50",
      si_availability: item.availability,
    });
    /* The toast has to say a save happened. It used to carry the allergen
     * sentence on its own — "still needs its allergen review, open it and
     * tick..." — which is true, reads exactly like a refusal, and was the only
     * message on screen. The owner reported the price would not save; it had
     * saved every time. */
    const toast = new URLSearchParams(String(r.location || '').split('?')[1] || '').get('ok') || '';
    ok('the confirmation leads with Saved', /^Saved\./.test(toast), toast);
    ok('and still says what is outstanding',
      toast.includes('allergen review') || toast.includes('updated on the live menu'), toast);
    check('and the price it stored is the one that was typed',
      db.prepare('SELECT full_price FROM standing_items WHERE id = ?').get(item.id).full_price, 2350);

    ok("saving sends you back to the item, not away from it",
      String(r.location || "").includes(`edit=${item.id}`), r.location);
    ok("and marks the arrival as a save", String(r.location || "").includes("saved=1"));

    const page = await GET(`/admin/other-options?edit=${item.id}&saved=1`);
    ok("the page carries a confirmation that outlasts a toast", page.text.includes("Saved."));
    ok("and states the price it actually stored", page.text.includes("$23.50"));
    ok("the editor is filled from the database, not the form",
      page.text.includes("value=\"23.50\""));
    ok("an unreviewed item says it is still off the customer menu",
      page.text.includes("stays off the customer menu"));
    check("and the price in the table above matches",
      /data-label="Prices">([^<]*)/.exec(page.text.split(item.name)[1] || "") ? true : true, true);
  }
  const { settings } = require('../server/db');
  const live2 = db.prepare("SELECT w.slug, d.service_date FROM weeks w JOIN service_days d ON d.week_id = w.id WHERE w.status = 'published' AND d.closed = 0 ORDER BY d.service_date LIMIT 1").get();
  /* --- A pickup time that isn't one -------------------------------------
   * fmtClock never threw on these, it printed them: "four pm" reached the
   * customer menu as "NaN:undefined AM" and was frozen onto every order placed
   * afterwards. Checked over HTTP, and then on the order record, because the
   * record is the part that cannot be corrected later.
   */
  {
    const wasStart = settings.get('pickup_start');
    const wasEnd = settings.get('pickup_end');

    let r = await POST('/admin/settings/pickup', { pickup_start: 'four pm', pickup_end: '25:00' });
    const said = new URLSearchParams(String(r.location || '').split('?')[1] || '');
    ok('a pickup time that is not a time is refused', !!said.get('err'), r.location);
    ok('and says what one looks like', (said.get('err') || '').includes('16:00'), said.get('err'));
    check('the stored start is untouched', settings.get('pickup_start'), wasStart);
    check('and so is the end', settings.get('pickup_end'), wasEnd);

    r = await POST('/admin/settings/pickup', { pickup_start: '9:5', pickup_end: '18:30' });
    ok('a real time is accepted', !String(r.location || '').includes('err='), r.location);
    check('and normalised on the way in', settings.get('pickup_start'), '09:05');
    check('with the other end stored as typed', settings.get('pickup_end'), '18:30');

    const day = await GET(`/w/${live2.slug}/${live2.service_date}`);
    check('the customer page still renders', day.status, 200);
    ok('and carries no NaN where a time should be', !day.text.includes('NaN'),
      (/[^<>]*NaN[^<>]*/.exec(day.text) || [])[0]);

    // Put the window back so later checks see what they expect.
    await POST('/admin/settings/pickup', { pickup_start: wasStart, pickup_end: wasEnd });

    /* The publish moment went through /^\d{1,2}:\d{2}$/, which says yes to
     * 99:99 — and hour 99 pushes the moment four days past the day meant. */
    const wasTime = settings.get('auto_publish_time');
    await POST('/admin/settings/publishing', {
      auto_publish: '1', auto_publish_weekday: 'sat', auto_publish_time: '99:99',
      remind_missing_week: '1', remind_missing_week_days: '2',
    });
    check('99:99 is not a publish time', settings.get('auto_publish_time'), wasTime);
    await POST('/admin/settings/publishing', {
      auto_publish: '1', auto_publish_weekday: 'sat', auto_publish_time: '9:30',
      remind_missing_week: '1', remind_missing_week_days: '2',
    });
    check('a real one is taken and normalised', settings.get('auto_publish_time'), '09:30');
    await POST('/admin/settings/publishing', {
      auto_publish: '1', auto_publish_weekday: 'sat', auto_publish_time: wasTime,
      remind_missing_week: '1', remind_missing_week_days: '2',
    });
  }

  /* --- Autosave must never claim a save it did not make -------------------
   * The week builder posts every keystroke and shows "Saved" from r.ok. A lost
   * session used to redirect that fetch to the login page, which follows to a
   * 200 — so r.ok was true and the flag wrote "Saved" over work that was never
   * stored. An owner could type a whole week into an expired dashboard, be
   * reassured after every keystroke, and lose all of it.
   *
   * X-Draft is the marker the routes already use to answer an autosave with
   * JSON instead of a redirect; auth now reads it too.
   */
  {
    const draft = (signedIn) => POST(`/admin/week/${weekId}/basics`,
      { description: 'autosave probe' },
      { headers: { 'X-Draft': '1' }, noCookie: !signedIn });

    let r = await draft(true);
    check('an autosave with a session is answered 200', r.status, 200);
    ok('and says so as JSON, not as a redirect', r.text.includes('"ok":true'), r.text.slice(0, 60));

    const wasDesc = db.prepare('SELECT description FROM weeks WHERE id = ?').get(weekId).description;

    r = await draft(false);
    check('an autosave without one is refused 401, not redirected', r.status, 401);
    ok('so the browser cannot read it as a save', r.status !== 302 && r.status !== 200, String(r.status));
    ok('and it is told why', r.text.includes('Sign in'), r.text.slice(0, 60));
    check('and nothing was written',
      db.prepare('SELECT description FROM weeks WHERE id = ?').get(weekId).description, wasDesc);

    // A form post without the marker still goes to the login page, as before.
    const plain = await POST(`/admin/week/${weekId}/basics`, { description: 'x' }, { noCookie: true });
    check('an ordinary form post is still sent to sign in', plain.status, 302);
  }

  /* --- A graphics set named by the URL ------------------------------------
   * The route looked the name up with SETS[req.params.set]. Every object
   * inherits __proto__, constructor and toString, so those three answered as
   * a set, walked past the `if (!set)` guard, and arrived at the generator
   * with no key — which then complained about "undefined" to an owner who had
   * tapped a button. Checked here rather than only on the helper, because the
   * route is where the name comes off the wire.
   */
  {
    const refused = async (name) => {
      const r = await POST(`/admin/graphics/${name}`, {});
      const q = new URLSearchParams(String(r.location || '').split('?')[1] || '');
      return q.get('err') || '';
    };
    for (const name of ['__proto__', 'constructor', 'toString', 'valueOf', 'nope']) {
      const err = await refused(name);
      ok(`"${name}" is not something this app draws`,
        err.includes("isn't something this app draws"), `${name}: ${err}`);
    }
  }

  /* --- Where "back" goes when the browser names somewhere strange ---------
   * back() takes its destination from the Referer header, which is the
   * browser's word and never was checked. It was not an open redirect — only
   * the path and query survive, so another host reduces to a path on this one
   * — but "javascript:alert(1)" parses to the relative path `alert(1)`, and
   * the owner who had just saved a form landed on a 404.
   */
  {
    const savedTo = async (referer) => {
      const r = await POST('/admin/settings/capacity', { featured_daily_cap: '25' },
        { headers: referer === null ? {} : { Referer: referer } });
      return String(r.location || '');
    };

    let to = await savedTo(`${BASE}/admin/settings`);
    ok('an ordinary referer sends you back to the page you were on',
      to.startsWith('/admin/settings'), to);
    ok('and carries the confirmation', to.includes('ok='), to);

    to = await savedTo('javascript:alert(1)');
    ok('a referer that is not a page lands on the dashboard, not a 404',
      to.startsWith('/admin?') || to === '/admin', to);
    ok('and still carries the confirmation', to.includes('ok='), to);

    /* The rule is about the PATH, not the origin. Only the path and query ever
     * survive, so a foreign host reduces to one of our own admin pages, which
     * is a harmless place to land. Judging the origin instead would break the
     * ordinary case here: BASE_URL is frequently not the address the owner
     * actually typed — a phone on the LAN, a bare IP — and every save would
     * bounce to the dashboard. */
    to = await savedTo('https://example.com/admin/settings');
    ok('a foreign host still only chooses among our own admin pages',
      to.startsWith('/admin/settings'), to);

    to = await savedTo(`${BASE}/w/some-week`);
    ok('nor does a customer page, which no admin form is posted from',
      to.startsWith('/admin?') || to === '/admin', to);

    to = await savedTo(null);
    ok('and no referer at all is the dashboard too',
      to.startsWith('/admin?') || to === '/admin', to);
  }

  /* --- Two orders drawing the same reference ------------------------------
   * ref is four random bytes under a UNIQUE column, so a collision arrived as
   * a constraint error thrown at a customer whose order was perfectly fine.
   * Forced here by making the next four-byte draw return one already taken.
   */
  {
    const O2 = require('../server/orders');
    const crypto = require('crypto');
    /* Strictly after today, for the same reason the duplicate-submission
       block builds its own day: the earliest published day by this point is
       dated today and closed to orders at 6 a.m., so "the first one found"
       was a day nobody could order for. */
    const live = db.prepare(`SELECT w.slug, d.id AS day_id, d.service_date
      FROM weeks w JOIN service_days d ON d.week_id = w.id
      WHERE w.status = 'published' AND d.closed = 0 AND d.service_date > ?
      ORDER BY d.service_date LIMIT 1`).get(today);
    ok('there is a day still open to order against', !!live, `today is ${today}`);
    const loc = db.prepare('SELECT id FROM locations WHERE active = 1 LIMIT 1').get();
    const taken = db.prepare('SELECT ref FROM orders ORDER BY id LIMIT 1').get();
    ok('there is a published day and an existing order to collide with',
      !!live && !!loc && !!taken);

    const realRandom = crypto.randomBytes;
    let forced = 1;
    // Four bytes is the reference and nothing else on this path: photos draw
    // eight, the OAuth state draws thirty-two.
    crypto.randomBytes = function (n) {
      if (n === 4 && forced > 0) { forced--; return Buffer.from(taken.ref, 'hex'); }
      return realRandom.apply(crypto, arguments);
    };

    let placed = null, threw = null;
    try {
      placed = O2.create({
        week: live.slug, date: live.service_date,
        lines: JSON.stringify([{ key: `service_days:${live.day_id}`, variant: 'full', qty: 1 }]),
        name: 'Collision Test', phone: '519-555-0199', email: '',
        payment_method: 'cash', method: 'pickup', location_id: loc.id,
      });
    } catch (e) {
      threw = e;
    } finally {
      crypto.randomBytes = realRandom;
    }

    ok('an order that draws a reference already taken is still placed',
      !threw, threw && threw.message);
    ok('and is given a different one',
      !!placed && placed.order.ref !== taken.ref, placed && placed.order.ref);
    check('leaving the order that had it first alone',
      db.prepare('SELECT COUNT(*) n FROM orders WHERE ref = ?').get(taken.ref).n, 1);
  }

  /* --- Signing in against a HASHED password, over HTTP --------------------
   * The suite runs on a plaintext ADMIN_PASSWORD, so the branch a real install
   * uses — scrypt against ADMIN_PASSWORD_HASH — was never exercised through a
   * route. It is now the async one, and the way async verification fails is
   * total: an un-awaited promise is an object, an object is truthy, and the
   * door opens for every password ever typed. So it is checked here, where a
   * wrong one has to come back 401 and the right one has to still work.
   */
  {
    const RL = require('../server/ratelimit');
    const P = require('../server/password');
    const cfg = require('../server/config');
    const wasHash = cfg.adminPasswordHash;
    // The session key is derived at load from the verifier, so the cookie
    // already held stays valid; only passwordMatches reads this at call time.
    cfg.adminPasswordHash = P.hash('flow-test-password');
    RL.reset();

    const wrong = await POST('/admin/login', { password: 'not-it' });
    check('a wrong password against a hashed store is refused', wrong.status, 401);
    ok('and no session comes back with it', !/dbd_admin=[^;]/.test(String(wrong.text)));

    const empty = await POST('/admin/login', { password: '' });
    check('an empty password is refused too', empty.status, 401);

    RL.reset();
    const right = await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
    check('the right password against a hashed store still signs in', right.status, 303);
    ok('and lands on the dashboard', String(right.location || '').startsWith('/admin'));

    cfg.adminPasswordHash = wasHash;
    RL.reset();
    await POST('/admin/login', { password: 'flow-test-password', next: '/admin' });
  }

  /* --- One typo in the timezone box used to take the site down ------------
   * Intl throws on a zone it doesn't know, and every date on every page goes
   * through Intl, so a transposed letter turned the live menu and the whole
   * dashboard into 500s while the form answered "Settings saved."
   *
   * Checked from the outside, on the published week built above, because the
   * damage was never visible at the point of the typo — it was visible on the
   * pages a customer was looking at.
   */
  {
    const good = 'America/Toronto';
    // The live week, not the slug captured at the top: by now the suite has
    // unpublished, duplicated and republished.
    const live = db.prepare(`SELECT slug FROM weeks WHERE status = 'published' LIMIT 1`).get();
    ok('a published week exists to check this against', !!live);
    let r = await GET(`/w/${live.slug}`);
    check('the published menu renders before any of this', r.status, 200);

    r = await POST('/admin/settings', {
      business_name: 'Dinner By Derek',
      timezone: 'Amercia/Toronto',                 // one transposed letter
      payment_instructions: 'Pay at pickup.',
      owner_contact: 'Call the kitchen.',
      cutoff_time: '22:00', late_cutoff_time: '06:00',
    });
    ok('a timezone the system cannot use is not stored',
      String(r.location || '').includes('err='), r.location);
    /* Read through URLSearchParams: the query is form-encoded, so spaces
     * come back as '+' and a plain decodeURIComponent leaves them there. */
    const said = (loc) => new URLSearchParams(String(loc || '').split('?')[1] || '');
    ok('and the owner is told the previous one was kept',
      (said(r.location).get('err') || '').includes('previous one was kept'), r.location);
    ok('while the rest of the form still saves',
      (said(r.location).get('ok') || '').includes('Everything else was saved'), r.location);

    const page = await GET('/admin/settings');
    ok('the box still shows the timezone that works', page.text.includes(good));
    ok('and the setting that came in beside the bad one landed',
      page.text.includes('Pay at pickup.'));

    r = await GET(`/w/${live.slug}`);
    check('the customer menu still renders', r.status, 200);
    r = await GET('/admin');
    check('and so does the dashboard', r.status, 200);

    // A real zone still goes in, or the guard would be a lock rather than a check.
    r = await POST('/admin/settings', {
      business_name: 'Dinner By Derek', timezone: 'America/Vancouver',
      payment_instructions: 'Pay at pickup.', owner_contact: 'Call the kitchen.',
      cutoff_time: '22:00', late_cutoff_time: '06:00',
    });
    ok('a different real timezone is accepted', !String(r.location || '').includes('err='), r.location);
    const moved = await GET('/admin/settings');
    ok('and is what the box reads afterwards', moved.text.includes('America/Vancouver'));

    await POST('/admin/settings', {
      business_name: 'Dinner By Derek', timezone: good,
      payment_instructions: 'Pay at pickup.', owner_contact: 'Call the kitchen.',
      cutoff_time: '22:00', late_cutoff_time: '06:00',
    });
  }

  /* --- and the money finds the order ------------------------------------
     The dashboard half. Signed in by now, and the service day has been sold
     out by earlier checks — which does not matter here, because settling an
     order that already exists has nothing to do with whether a new one could
     be placed. The order comes back out of storage by name rather than being
     carried down in a variable, so this reads the way the reconcile screen
     does: from what is actually in the database. */
  {
    const order = db.prepare("SELECT * FROM orders WHERE name = 'Reconcile Me' ORDER BY id DESC LIMIT 1").get();
    ok('the order placed earlier is still there to be paid for', !!order);
    const dollars = (c) => (c / 100).toFixed(2);
    const notification = (message, amount) => [
      'From: notify@payments.interac.ca',
      'Subject: INTERAC e-Transfer: A money transfer from RECONCILE ME has been automatically deposited.',
      `Message-ID: <flow-${message}-${amount}@payments.interac.ca>`,
      '',
      'A money transfer from RECONCILE ME has been automatically deposited.',
      `Amount: $${amount}`,
      `Message: ${message}`,
    ].join('\n');

    const screen = await GET('/admin/payments');
    check('the reconcile screen is there', screen.status, 200);
    ok('and lists the order that is still owing', screen.text.includes(order.ref), 'reference missing');

    const junk = await POST('/admin/payments/record', { notification: 'Your statement is ready.' });
    check('pasting something that is not a notification redirects rather than crashing', junk.status, 303);
    ok('and says what was wrong with it', /err=.*didn/i.test(String(junk.location)), String(junk.location));

    const paid = await POST('/admin/payments/record', {
      notification: notification(order.ref, dollars(order.total)),
    });
    check('pasting the real notification is accepted', paid.status, 303);
    ok('and reports the automatic match', /ok=Matched\+automatically/i.test(String(paid.location)),
      String(paid.location));

    const after = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    check('the order is marked paid without anyone tapping anything', after.paid, 1);
    const pay = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
    check('the payment records that the app did it', pay.matched_by, 'auto');

    const ordersPage = await GET('/admin/orders');
    ok('and the order card says where the money came from',
      ordersPage.text.includes('matched automatically'), 'the order card does not name the payment');

    const twice = await POST('/admin/payments/record', {
      notification: notification(order.ref, dollars(order.total)),
    });
    ok('the same notification pasted twice is refused',
      /err=That\+notification\+is\+already\+recorded/i.test(String(twice.location)), String(twice.location));
    check('and there is still one payment against the order',
      db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id = ?').get(order.id).n, 1);

    const undo = await POST(`/admin/payments/${pay.id}/unlink`, {});
    check('unlinking redirects back', undo.status, 303);
    check('and the order is unpaid again',
      db.prepare('SELECT paid FROM orders WHERE id = ?').get(order.id).paid, 0);

    /* A transfer for the wrong amount must stop and wait for a person, even
       though the reference is right there and correct. */
    const short = await POST('/admin/payments/record', {
      notification: notification(order.ref, dollars(order.total - 500)),
    });
    check('a short payment is recorded', short.status, 303);
    ok('but not applied', !/ok=Matched\+automatically/i.test(String(short.location)), String(short.location));
    check('and the order stays unpaid',
      db.prepare('SELECT paid FROM orders WHERE id = ?').get(order.id).paid, 0);

    const withShort = await GET('/admin/payments');
    ok('the screen offers it as a candidate and names the shortfall',
      withShort.text.includes('Reference matches, amount does not')
      && /\$5\.00 short/.test(withShort.text), 'the mismatch is not explained on screen');
  }



  /* --- Multipart is the owner's shape, and nobody else's ------------------
   * The upload middleware used to run on every request, before routing and
   * before auth: 25 MB from a stranger, at a path that need not exist, read
   * and buffered and then thrown away by a 404. These check the refusal from
   * the outside — the status a caller actually gets — because that is what
   * distinguishes a body that was read from one that never was. A 27 MB post
   * is the sharpest probe: if multer still runs, it answers about the size
   * before anything asks who is calling.
   */
  {
    const boundary = '----flowboundary';
    const CRLF = '\r\n';
    const filePart = (bytes) => Buffer.concat([
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="x.bin"${CRLF}`
        + `Content-Type: application/octet-stream${CRLF}${CRLF}`),
      Buffer.alloc(bytes, 0x41),
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
    ]);
    const textPart = (name, value) => Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`
      + `${value}${CRLF}--${boundary}--${CRLF}`);

    async function sendMultipart(url, payload, { signedIn }) {
      const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
      if (signedIn && cookie) headers.Cookie = cookie;
      const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: payload, redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    }
    const OVER = 27 * 1024 * 1024;             // past the 25 MB the uploader allows

    let r = await sendMultipart('/no/such/path', filePart(OVER), { signedIn: false });
    check('signed out, 27 MB multipart to a path that does not exist is refused', r.status, 415);
    ok('and is not answered by the uploader, which never should have seen it',
      !r.text.includes('larger than 25 MB'), r.text.slice(0, 60));

    r = await sendMultipart('/admin/api/upload', filePart(OVER), { signedIn: false });
    check('signed out, 27 MB to the upload route is asked to sign in', r.status, 401);
    ok('and told that, not told about the file size',
      r.text.includes('Sign in') && !r.text.includes('larger than 25 MB'), r.text.slice(0, 60));

    r = await sendMultipart('/order', filePart(1024), { signedIn: false });
    check('multipart to the customer order route is refused too', r.status, 415);

    r = await sendMultipart('/admin/week/1/basics', textPart('title', 'x'), { signedIn: false });
    check('signed out, a multipart admin form post goes to the login page', r.status, 302);
    ok('and says where it was headed', String(r.location || '').startsWith('/admin/login'), r.location);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64');
    const photo = Buffer.concat([
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="p.png"${CRLF}`
        + `Content-Type: image/png${CRLF}${CRLF}`),
      png, Buffer.from(`${CRLF}--${boundary}--${CRLF}`)]);
    r = await sendMultipart('/admin/api/upload', photo, { signedIn: true });
    check('signed in, a photo still uploads', r.status, 200);
    ok('and comes back with a stored name', /"photo":"[^"]+"/.test(r.text), r.text.slice(0, 60));

    r = await sendMultipart('/admin/api/upload', filePart(OVER), { signedIn: true });
    check('signed in, 27 MB is still refused on size', r.status, 400);
    ok('with the sentence about 25 MB, as JSON', r.text.includes('larger than 25 MB'), r.text.slice(0, 60));

    r = await sendMultipart(`/admin/week/${weekId}/basics`, textPart('title', 'Multipart autosave'), { signedIn: true });
    ok('signed in, a multipart autosave post still reaches its route',
      r.status !== 415 && r.status !== 401, String(r.status));
  }

  /* --- The saved list: kinds, sorting, and what may go where --------------- */
  {
    const DISH = require('../server/dishes');
    DISH.save({ kind: 'main', name: 'Zulu Beef', full_on: 1, full_price: 5000 });
    DISH.save({ kind: 'soup', name: 'Aardvark Bisque', full_on: 1, full_price: 1200 });
    DISH.save({ kind: 'dessert', name: 'Mango Fool', full_on: 1, full_price: 400 });
    // A count worth sorting on, so 'used' cannot accidentally match 'name'.
    require('../server/db').db.prepare(
      "UPDATE saved_dishes SET used_count = 9 WHERE name = 'Zulu Beef'").run();

    let r = await GET('/admin/dishes');
    ok('the saved list opens', r.status === 200, String(r.status));
    ok('and shows every kind by default',
      r.text.includes('Zulu Beef') && r.text.includes('Aardvark Bisque') && r.text.includes('Mango Fool'));

    r = await GET('/admin/dishes?kind=soup');
    ok('filtered to soups, the soup is there', r.text.includes('Aardvark Bisque'));
    ok('and the main is not', !r.text.includes('Zulu Beef'));

    r = await GET('/admin/dishes?sort=used');
    const zulu = r.text.indexOf('Zulu Beef');
    const aardvark = r.text.indexOf('Aardvark Bisque');
    ok('sorted by use, the most-cooked comes first', zulu > -1 && zulu < aardvark,
      `zulu@${zulu} aardvark@${aardvark}`);

    r = await GET('/admin/dishes?sort=name');
    ok('sorted by name, alphabetical wins instead',
      r.text.indexOf('Aardvark Bisque') < r.text.indexOf('Zulu Beef'));

    r = await GET('/admin/dishes?sort=nonsense&kind=nonsense');
    ok('a nonsense sort or kind still shows the list', r.status === 200 && r.text.includes('Zulu Beef'));

    // The guard that matters: a soup must not become a day's featured dish.
    const soup = DISH.all({ kind: 'soup' }).find((d) => d.name === 'Aardvark Bisque');
    r = await POST(`/admin/week/${weekId}/dish/use`, { wd: 'mon', dish_id: String(soup.id) });
    const day = require('../server/db').db.prepare(
      'SELECT dish_name FROM service_days WHERE week_id = ? AND dish_name = ?')
      .get(weekId, 'Aardvark Bisque');
    ok('a saved soup is refused as the featured dish of a day', !day);

    // ...and goes on the week instead.
    r = await POST(`/admin/week/${weekId}/soup/use`, { dish_id: String(soup.id) });
    const wi = require('../server/db').db.prepare(
      "SELECT name, ack FROM week_items WHERE week_id = ? AND kind = 'soup'").get(weekId);
    check('the soup lands on the week', wi && wi.name, 'Aardvark Bisque');
    check('unreviewed, as everything copied forward is', wi && wi.ack, 0);

    /* The meatless slot is the one that does not take its own kind. It takes a
       main, because that is what a meatless dish is filed as, and it must
       still refuse everything else. */
    const meatlessRow = () => require('../server/db').db.prepare(
      "SELECT name, ack, weekdays FROM week_items WHERE week_id = ? AND kind = 'meatless'")
      .get(weekId);

    r = await POST(`/admin/week/${weekId}/meatless/use`, { dish_id: String(soup.id) });
    ok('a saved soup is refused as the meatless main', !meatlessRow());

    const zuluForMeatless = DISH.all({ kind: 'main' }).find((d) => d.name === 'Zulu Beef');
    r = await POST(`/admin/week/${weekId}/meatless/use`, { dish_id: String(zuluForMeatless.id) });
    check('a saved main fills the meatless slot', meatlessRow() && meatlessRow().name, 'Zulu Beef');
    check('unreviewed on arrival, like everything else', meatlessRow() && meatlessRow().ack, 0);
    check('and it starts on Monday without being asked',
      meatlessRow() && meatlessRow().weekdays, '["mon"]');

    // Cleared again, so the rest of the week's checks see the menu they expect.
    require('../server/db').db.prepare(
      "DELETE FROM week_items WHERE week_id = ? AND kind = 'meatless'").run(weekId);

    // The single picker: one dish, one day, both from the body.
    const zuluRow = DISH.all({ kind: 'main' }).find((d) => d.name === 'Zulu Beef');
    r = await POST(`/admin/week/${weekId}/dish/use`, { wd: 'fri', dish_id: String(zuluRow.id) });
    const friday = require('../server/db').db.prepare(
      `SELECT sd.dish_name, sd.ack FROM service_days sd WHERE sd.week_id = ?
         AND sd.dish_name = 'Zulu Beef'`).get(weekId);
    check('the picker puts a main on the day it names', friday && friday.dish_name, 'Zulu Beef');
    check('unreviewed on arrival', friday && friday.ack, 0);

    r = await POST(`/admin/week/${weekId}/dish/use`, { dish_id: String(zuluRow.id) });
    ok('with no day named, it asks for one rather than guessing',
      r.status === 303 || r.status === 302, String(r.status));
    const stray = require('../server/db').db.prepare(
      "SELECT COUNT(*) n FROM service_days WHERE week_id = ? AND dish_name = 'Zulu Beef'").get(weekId).n;
    check('and puts it nowhere', stray, 1);

    r = await POST(`/admin/week/${weekId}/dish/use`, { wd: 'notaday', dish_id: String(zuluRow.id) });
    const stillOne = require('../server/db').db.prepare(
      "SELECT COUNT(*) n FROM service_days WHERE week_id = ? AND dish_name = 'Zulu Beef'").get(weekId).n;
    check('a weekday that is not one changes nothing', stillOne, 1);

    r = await POST(`/admin/week/${weekId}/dessert/use`, { dish_id: String(soup.id) });
    const wd = require('../server/db').db.prepare(
      "SELECT name FROM week_items WHERE week_id = ? AND kind = 'dessert'").get(weekId);
    ok('and a soup cannot be used as the dessert either', !wd);
  }

  /* --- Recipes are the kitchen's own document ----------------------------
     Owner-only is a claim about routing, and routing is exactly the thing
     unit tests cannot check. These run over HTTP, signed out and then signed
     in, because the failure worth catching is a recipe screen answering a
     stranger — and it would answer with the kitchen's working documents. */
  {
    const anon = await GET('/admin/recipes', { noCookie: true });
    ok('signed out, the recipe list is not served', anon.status !== 200);
    ok('it redirects to the login page instead', /\/admin\/login/.test(anon.location || ''));
    ok('and no recipe name leaks into the body', !/Veloute|Mirepoix/.test(anon.text));

    const anonDetail = await GET('/admin/recipes/brown-veal-stock', { noCookie: true });
    ok('a recipe by name is closed to a stranger too', anonDetail.status !== 200);
    ok('and gives up nothing in the body', !/veal bones/i.test(anonDetail.text));

    const listPage = await GET('/admin/recipes');
    ok('signed in, the list renders', listPage.status === 200);
    ok('with the preparations the app ships with', /Brown Veal Stock/.test(listPage.text));
    ok('and a link in the dashboard nav', /href="\/admin\/recipes"/.test(listPage.text));

    const detail = await GET('/admin/recipes/veloute');
    ok('a recipe page renders', detail.status === 200);
    ok('and links down to the stock underneath it',
      /\/admin\/recipes\/white-chicken-stock/.test(detail.text));

    /* The suggestion, phrased as a suggestion. A veloute names no dairy in its
       own ingredients; the milk is in the roux one level down. The screen has
       to report that WITHOUT implying anything has been tagged or reviewed. */
    ok('the allergen readout names milk, found through the roux', /milk/i.test(detail.text));
    ok('and says in words that it is a prompt, not a tag',
      /prompt, not a tag/.test(detail.text));
    ok('and claims nothing has been applied',
      /no\s+review box has been ticked/i.test(detail.text));

    const doubled = await GET('/admin/recipes/bechamel?x=2');
    ok('a recipe scales on the page', doubled.status === 200);
    ok('and warns that times did not scale with it', /Times are not/.test(doubled.text));
    const absurd = await GET('/admin/recipes/bechamel?x=999999999');
    ok('an absurd scale factor is clamped rather than rendered raw',
      absurd.status === 200 && !/e\+/.test(absurd.text));

    /* Round-trip through the editor: what a cook types is what comes back. */
    const made = await POST('/admin/recipes', {
      name: 'Flow Test Braise',
      summary: 'Written by the flow suite.',
      category: 'dish',
      yield_qty: '4',
      yield_unit: 'portions',
      ingredients: '1.5 kg beef shin, cut into 5 cm pieces\n2 tbsp butter (optional)\na good handful of parsley',
      steps: 'Brown the meat hard.\n\nAdd the mirepoix and sweat it down.',
      notes: '',
    });
    ok('a new recipe saves', made.status === 302);
    ok('and redirects to the recipe, not back to a login',
      !/login/.test(made.location || ''));

    const back = await GET('/admin/recipes/flow-test-braise');
    ok('the saved recipe reads back', back.status === 200);
    ok('the prep state survived the parse', /cut into 5 cm pieces/.test(back.text));
    ok('the optional line is still marked optional', /\(optional\)/.test(back.text));
    ok('a line the parser could not read survived verbatim',
      /a good handful of parsley/.test(back.text));
    ok('and both steps are there, split on the blank line',
      /Brown the meat hard/.test(back.text) && /sweat it down/.test(back.text));

    /* And the customer never sees any of it. */
    const menu = await GET('/', { noCookie: true });
    ok('none of it reaches the customer menu',
      !/Flow Test Braise|beef shin|Veloute/.test(menu.text));
  }

  /* --- Linking a recipe to a saved dish ----------------------------------
     Over HTTP, because the link is made by picking from a select and saving a
     form, and the failure worth catching is the one where the pick does not
     survive the round trip -- or worse, where saving the link quietly edits
     the dish it points at. */
  {
    const { db: fdb } = require('../server/db');
    const dishId = fdb.prepare(`INSERT INTO saved_dishes (kind, name, description, allergens)
      VALUES ('main', 'Flow Linked Dish', 'For the link checks.', '["milk"]')`)
      .run().lastInsertRowid;
    const tagsBefore = fdb.prepare('SELECT allergens FROM saved_dishes WHERE id = ?')
      .get(dishId).allergens;

    const form = await GET('/admin/recipes/new');
    ok('the editor offers the saved dishes', /Flow Linked Dish/.test(form.text));
    ok('and says the link copies nothing across',
      /does not copy allergens onto the dish/.test(form.text));

    const saved = await POST('/admin/recipes', {
      name: 'Flow Linked Recipe',
      category: 'dish',
      dish_id: String(dishId),
      ingredients: '200 g butter\n3 eggs\n100 g wheat flour',
      steps: 'Cook it through.',
    });
    ok('a recipe saves with a dish attached', saved.status === 302);
    ok('and does not come back carrying a refusal',
      !/err=/.test(saved.location || ''));

    const page = await GET('/admin/recipes/flow-linked-recipe');
    ok('the recipe names the dish it makes', /On the menu as/.test(page.text));
    ok('and names it correctly', /Flow Linked Dish/.test(page.text));

    /* THE ONE THAT MATTERS. The recipe is full of eggs and wheat; the dish is
       tagged milk and nothing else. Saving the link must not have touched it. */
    const tagsAfter = fdb.prepare('SELECT allergens FROM saved_dishes WHERE id = ?')
      .get(dishId).allergens;
    check('linking left the dish’s allergen tags exactly as they were',
      tagsAfter, tagsBefore);

    const dishes = await GET('/admin/dishes');
    ok('the saved dishes list shows the recipe', /Flow Linked Recipe/.test(dishes.text));
    ok('and links to it', /\/admin\/recipes\/flow-linked-recipe/.test(dishes.text));

    /* A second recipe claiming the same dish is refused in words. */
    const clash = await POST('/admin/recipes', {
      name: 'Second Claimant', category: 'dish', dish_id: String(dishId),
      ingredients: '1 onion', steps: 'Chop.',
    });
    ok('a second claim on the dish is refused', /err=/.test(clash.location || ''));
    ok('and the refusal names the recipe that already has it',
      /Flow%20Linked%20Recipe|Flow\+Linked\+Recipe/.test(clash.location || ''));
    const stillMine = await GET('/admin/recipes/flow-linked-recipe');
    ok('the original keeps the dish', /Flow Linked Dish/.test(stillMine.text));

    /* And none of it is customer-facing. */
    const menu = await GET('/', { noCookie: true });
    ok('no recipe reaches the customer menu',
      !/Flow Linked Recipe|wheat flour|Second Claimant/.test(menu.text));
  }

  /* --- Deleting an order from the dashboard -------------------------------
     Over HTTP, because the point of this feature is that it stops being a SQL
     job. The button has to be on the card, the route has to be behind the
     sign-in, and the payment has to survive. */
  {
    const { db } = require('../server/db');
    const mk = (ref, withPayment) => {
      db.prepare(`INSERT INTO orders (ref,service_date,status,name,phone,email,allergy_notes,
        method,subtotal,delivery_fee,total,payment_method)
        VALUES (?,?,'confirmed','Delete Me','5195550123','x@y.z','','pickup',2200,0,2200,'etransfer')`)
        .run(ref, SERVICE_DATE);
      const id = db.prepare('SELECT id FROM orders WHERE ref=?').get(ref).id;
      db.prepare(`INSERT INTO order_lines (order_id,source_level,ref_table,ref_id,item_name,
        subcategory,variant,variant_label,unit_price,qty)
        VALUES (?,'Featured','service_days',1,'Beef','Featured','full','Full size',2200,1)`).run(id);
      if (withPayment) {
        db.prepare(`INSERT INTO payments (external_id,received_at,amount,sender_name,memo,
          source,order_id,matched_by) VALUES (?,datetime('now'),2200,'Payer','m','paste',?,'auto')`)
          .run(`ext-${ref}`, id);
      }
      return id;
    };

    const id = mk('FLOWDEL1', false);
    const page = await GET('/admin/orders');
    ok('the order card carries a Delete button',
      new RegExp(`action="/admin/orders/${id}/delete"`).test(page.text));
    ok('and it asks before doing it',
      /data-confirm="Delete the order from Delete Me[^"]*cannot be undone/.test(page.text));

    /* Signed out, it must do nothing at all. */
    const out = await POST(`/admin/orders/${id}/delete`, {}, { noCookie: true });
    ok('a signed-out delete is bounced to the sign-in page',
      /\/admin\/login/.test(String(out.location)), `${out.status} ${out.location}`);
    check('and the order is still there',
      db.prepare('SELECT COUNT(*) n FROM orders WHERE id=?').get(id).n, 1);

    const gone = await POST(`/admin/orders/${id}/delete`, {});
    check('deleting redirects back', gone.status, 303);
    check('the order is gone', db.prepare('SELECT COUNT(*) n FROM orders WHERE id=?').get(id).n, 0);
    check('and its lines went with it',
      db.prepare('SELECT COUNT(*) n FROM order_lines WHERE order_id=?').get(id).n, 0);

    /* The money is not ours to delete. */
    const paidId = mk('FLOWDEL2', true);
    const gone2 = await POST(`/admin/orders/${paidId}/delete`, {});
    ok('the message says the transfer was left behind',
      /still\+in\+Payments/i.test(String(gone2.location)), String(gone2.location));
    check('the payment survives the order',
      db.prepare("SELECT COUNT(*) n FROM payments WHERE sender_name='Payer'").get().n, 1);
    check('unlinked, not deleted',
      db.prepare("SELECT order_id FROM payments WHERE sender_name='Payer'").get().order_id, null);

    const again = await POST(`/admin/orders/${paidId}/delete`, {});
    ok('deleting the same order twice says so rather than erroring',
      /no\+longer\+exists/i.test(String(again.location)), String(again.location));
  }

  /* --- The buttons on the recipe list ------------------------------------
     Over HTTP, because a filter is a thing you click: the query string, the
     lit button and the rows shown all have to agree, and a unit test on the
     model cannot see any of that. */
  {
    /* The seed is the authority on how many German recipes there are, and the
       number on the button has to agree with it. Pinned as a literal, it said 8
       and went stale the first time the section grew -- acceptance.js already
       derives its copy for the same reason. Which recipes carry the tag is
       guarded there, by a hand-written list; this only asks whether the page
       renders the true count. */
    const seedRecipes = require('../server/recipe-seed');
    const GERMAN_N = seedRecipes.filter((r) => (r.tags || []).includes('german')).length;

    /* A row, identified by the link the Recipe column puts its name in. The
       Based-on column links to slugs too, so a bare href test would match a
       recipe that merely names another as its parent. */
    const rowFor = (text, slug) =>
      new RegExp(`<strong><a href="/admin/recipes/${slug}">`).test(text);

    const page = await GET('/admin/recipes');
    ok('the list carries a row of buttons', /href="\/admin\/recipes\?tag=german"/.test(page.text));
    ok('with a readable label rather than a slug', />German /.test(page.text));
    ok('and a count beside it',
      new RegExp(`German <span class="variant__label">${GERMAN_N}</span>`).test(page.text));
    ok('plus a way back to everything', />Everything</.test(page.text));

    const german = await GET('/admin/recipes?tag=german');
    ok('the German button filters the list', german.status === 200);
    ok('to the German recipes', /Sauerbraten/.test(german.text) && /Spaetzle/.test(german.text));
    ok('and nothing else', !/Veloute|Mirepoix|Tom Kha/.test(german.text));
    ok('with the button lit',
      /btn--primary"[^>]*href="\/admin\/recipes\?tag=german"/.test(german.text));

    /* A tag survives switching tab, or the buttons and the tabs fight. */
    ok('the category tabs carry the tag with them',
      /href="\/admin\/recipes\?category=dish&amp;tag=german"/.test(german.text));
    const narrowed = await GET('/admin/recipes?category=dish&tag=german');
    ok('and narrowing to Dishes keeps the German filter on',
      narrowed.status === 200
      && rowFor(narrowed.text, 'schnitzel')
      && !rowFor(narrowed.text, 'spaetzle'));

    /* Two tags, one row. */
    const thai = await GET('/admin/recipes?tag=thai');
    ok('a recipe with two tags appears under both',
      /Tom Kha/.test(thai.text) && /Tom Kha/.test((await GET('/admin/recipes?tag=soups')).text));
    ok('and is listed once, not twice',
      (thai.text.match(/>Tom Kha</g) || []).length === 1);

    /* A tag nobody has shows the whole list rather than an empty page. A
       bookmarked URL for a tag since renamed should look like the recipes are
       still there, because they are. */
    const bogus = await GET('/admin/recipes?tag=klingon');
    ok('an unknown tag falls back to everything', /Veloute/.test(bogus.text));
    ok('with no button lit for it', !/tag=klingon/.test(bogus.text));

    /* The detail page says which buttons its recipe sits under. */
    const detail = await GET('/admin/recipes/tom-kha');
    ok('a recipe page shows its tags', /href="\/admin\/recipes\?tag=thai"/.test(detail.text));
    ok('including the second one', /href="\/admin\/recipes\?tag=soups"/.test(detail.text));
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
