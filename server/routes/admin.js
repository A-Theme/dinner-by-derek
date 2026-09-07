'use strict';
const express = require('express');
const crypto = require('crypto');
const { db, settings } = require('../db');
const auth = require('../auth');
const T = require('../time');
const M = require('../menu');
const A = require('../allergens');
const PROOF = require('../proofread');
const O = require('../orders');
const P = require('../publish');
const DISH = require('../dishes');
const R = require('../recipes');
const S = require('../signin');
const mail = require('../mailer');
const images = require('../images');
const IF = require('../itemform');
const PASTE = require('../paste');
const V = require('../views/admin');
const W = require('../views/admin-week');
const WP = require('../views/admin-paste');
const { html, raw, money } = require('../html');
const { rateLimit } = require('../ratelimit');

const router = express.Router();
const tz = () => settings.get('timezone', 'America/Toronto');

/* Nothing in the dashboard is ever cached. */
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const { back } = require('./back');

/* --- Auth ---------------------------------------------------------------- */
router.get('/login', (req, res) => {
  res.type('html').send(String(V.login(null, req.query.next)));
});

router.post('/login', rateLimit('login', 8, 10 * 60_000), async (req, res) => {
  if (!(await auth.passwordMatches(req.body.password))) {
    /* Written down before the wait, so a caller who hangs up early is still
       counted — otherwise abandoning each request is how you avoid the record
       and the delay at the same time. */
    S.record(req.ip);
    const wait = S.delayFor();
    if (S.shouldAlert()) mail.signinFailuresEmail({
      count: S.countSince(Date.now() - S.HOUR_MS),
      addresses: S.addressesSince(Date.now() - S.HOUR_MS),
    }).catch((e) => console.error('[mail] sign-in alert failed:', e.message));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return res.status(401).type('html')
      .send(String(V.login('That password isn\'t right. Try again.', req.body.next)));
  }
  auth.issue(res);
  const next = String(req.body.next || '/admin');
  res.redirect(303, next.startsWith('/admin') ? next : '/admin');
});

router.use(auth.required);

/* Below the guard, not above it. Signing out is a state change, and up here it
 * answered anyone — so a form on another site could clear the session of
 * whoever loaded it. Only a nuisance, since it destroys access rather than
 * granting it, but a request with no session has nothing to sign out of and the
 * login page is where it wants to go anyway. */
router.post('/logout', (req, res) => { auth.clear(res); res.redirect(303, '/admin/login'); });

/* --- Today --------------------------------------------------------------- */
router.get('/', (req, res) => {
  const today = T.todayIn(tz());
  const week = M.activeWeek();
  const days = week ? M.serviceDaysOf(week.id) : [];

  const countFor = (d) => db.prepare(
    `SELECT COUNT(*) n FROM orders WHERE service_date = ? AND status = 'confirmed'`).get(d).n;
  const lateCount = db.prepare(
    `SELECT COUNT(*) n FROM orders WHERE status = 'late_request'`).get().n;

  const tomorrow = T.addDays(today, 1);

  // A closed day is not the next service day — there is no cooking to show
  // totals for, and putting one at the top of Today would read as a shift the
  // kitchen still has to work.
  const weekClosed = !!(week && week.closed);
  const upcoming = weekClosed ? [] : days.filter((d) => d.service_date >= today && !d.closed);
  const next = upcoming[0] || null;
  const cutoff = next ? T.cutoffFor(next.service_date, settings.getInt('cutoff_hour', 22),
    settings.getInt('cutoff_minute', 0), tz()) : null;

  const totals = next ? O.kitchenTotals(next.service_date) : null;

  // The one thing that most needs doing next.
  let primary;
  if (!week) primary = { href: '/admin/week', label: 'Build this week\'s menu' };
  else if (week.status === 'draft') primary = { href: '/admin/week', label: 'Finish and publish this week' };
  else if (weekClosed) primary = { href: '/admin/week', label: 'Plan the next week' };
  else if (lateCount) primary = { href: '/admin/orders?status=late_request', label: `Review ${lateCount} late request${lateCount === 1 ? '' : 's'}` };
  else if (next) primary = { href: `/admin/orders?date=${next.service_date}`, label: `See orders for ${T.fmtDayShort(next.service_date, tz())}` };
  else primary = { href: '/admin/week', label: 'Plan next week' };

  // Refused sign-ins, when there have been enough of them to mean something.
  // Below the threshold this says nothing at all: a notice that appears every
  // time Derek fumbles his own password is a notice he stops reading.
  const signin = S.notice();

  const body = html`
    <h1>Today</h1>
    <p><a class="btn btn--primary btn--block" href="${primary.href}">${primary.label}</a></p>

    ${signin ? html`
      <div class="card card--warn">
        <h2>${signin.count} refused sign-ins</h2>
        <!-- The time is never sentence-final: "9:09 p.m." brings its own
             full stop and a second one lands right behind it. -->
        <p>In the last 24 hours, from ${signin.addresses}
           ${signin.addresses === 1 ? 'address' : 'different addresses'} — the last at
           ${T.fmtLocal(new Date(signin.lastAt), tz(),
             { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
           ${signin.active ? 'Still going on now.' : ''}</p>
        <p>Nothing is locked — the dashboard is still yours, and each wrong guess
           now waits longer than the last. If it wasn't you, a longer password is
           the fix, and setting one signs out every device at the same time.</p>
      </div>` : ''}

    <!-- Each tile opens the list behind its own number. A count you cannot
         open is a dead end: the next question after "3 orders tomorrow" is
         always "which three". -->
    <div class="tile-grid" style="margin:var(--dbd-sp-4) 0">
      <a class="tile tile--link" href="/admin/orders?date=${today}">
        <div class="tile__n">${countFor(today)}</div><div class="tile__l">Orders today</div></a>
      <a class="tile tile--link" href="/admin/orders?date=${tomorrow}">
        <div class="tile__n">${countFor(tomorrow)}</div><div class="tile__l">Orders tomorrow</div></a>
      <a class="tile tile--link" href="/admin/orders?status=late_request">
        <div class="tile__n">${lateCount}</div><div class="tile__l">Late requests</div></a>
    </div>

    ${next ? html`
      <div class="card">
        <h2>${T.fmtDayLong(next.service_date, tz())}</h2>
        <p>Orders close ${T.fmtLocal(cutoff, tz(), { weekday: 'long', month: 'short', day: 'numeric' })}
           — <span class="countdown" data-countdown="${cutoff.toISOString()}">…</span> left</p>
        <h3 class="subhead">Kitchen totals</h3>
        ${totals.groups.length ? totals.groups.map((g) => html`
          <p><strong>${g.name}</strong></p>
          <ul>${g.items.map((i) => html`<li>${i.qty} × ${i.item_name} <span class="variant__label">(${i.variant_label})</span></li>`)}</ul>`)
          : html`<p class="also">No confirmed orders yet.</p>`}
        <p class="variant__label">${totals.split.pickup} pickup · ${totals.split.delivery} delivery</p>
        <p><a class="btn btn--secondary" href="/admin/sheet/kitchen/${next.service_date}">Kitchen sheet</a>
           <a class="btn btn--secondary" href="/admin/sheet/pickup/${next.service_date}">Pickup sheet</a></p>
      </div>` : weekClosed
        ? html`<div class="card"><p><span class="flag flag--stop">Closed for the week</span></p>
            <p>${week.title} is marked closed — customers are told the kitchen is shut and can order
            nothing on these dates. Reopen it, or start the next week, in This Week.</p></div>`
        : html`<div class="card"><p>No upcoming service days. Build a week to get going.</p></div>`}

    <form method="post" action="/admin/logout" class="no-print">
      <button class="btn btn--secondary" type="submit">Sign out</button></form>`;

  res.type('html').send(String(V.shell({ title: 'Today', body, current: 'today' })));
});

/* --- Allergen suggestion API -------------------------------------------- */
router.post('/api/suggest', (req, res) => {
  const { name, description, accepted, dismissed } = req.body || {};
  // Suggestions are read from the name and the description together, the same
  // pair the publish gate stores the acknowledgement against.
  res.json({
    pending: A.pendingFor(A.reviewedText({ name, description }), accepted, dismissed),
  });
});

/* --- Proofreading API ----------------------------------------------------
 * Advisory, like /api/suggest above it and for the same reason: nothing it
 * returns has any effect until the owner taps a chip, and the field saves
 * exactly as typed either way.
 *
 * Rate limited even though it is behind the session guard, because it is the
 * one dashboard endpoint a keystroke can call. The debounce in admin.js keeps
 * ordinary typing to a few requests a minute; this is the ceiling for a stuck
 * key or a second tab, and 240 a minute is far above anything a person types.
 */
router.post('/api/proofread', rateLimit('proofread', 240, 60_000), (req, res) => {
  const findings = PROOF.check(String((req.body && req.body.text) || ''));
  res.json({ findings, summary: PROOF.summarize(findings) });
});

/* --- Upload -------------------------------------------------------------- */
router.post('/api/upload', rateLimit('upload', 60, 60_000), async (req, res) => {
  try {
    const buf = req.uploadBuffer;
    const name = await images.store(buf);
    res.json({ photo: name });
  } catch (e) {
    res.status(400).json({
      error: e instanceof images.UploadError ? e.message
        : "That photo didn't upload. Try another one.",
    });
  }
});

/* --- This Week ----------------------------------------------------------- */
router.get('/week', (req, res) => {
  let week = req.query.id
    ? db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.query.id))
    : db.prepare(`SELECT * FROM weeks WHERE status IN ('draft','published')
                  ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, id DESC LIMIT 1`).get();

  if (!week) {
    /* Offered rather than done. Opening this page used to CREATE a week, which
     * made a GET the only request in the app that writes — and the session
     * cookie is SameSite=Lax, which is sent on a top-level cross-site
     * navigation, so a link on somebody else's page could make one. A browser
     * restoring tabs or prefetching a link did just as well.
     *
     * A blank draft is not harmless: publish.js sees it, isEmpty() refuses it,
     * and the owner gets a "there is nothing on this week yet" email about a
     * week they never opened. So the button says so and the POST below does it.
     *
     * Only reachable with no draft and no published week at all, which in
     * practice means a fresh install — publishing always leaves one behind. */
    const body = html`
      <h1>This week</h1>
      <div class="card">
        <p>There is no week started yet. This makes an empty one, dated the week
          beginning ${T.fmtDayShort(T.mondayOnOrAfter(T.todayIn(tz())), tz())}, and opens it
          for you to fill in.</p>
        <form method="post" action="/admin/week/new">
          <button class="btn btn--primary btn--block" type="submit">Start this week's menu</button>
        </form>
      </div>`;
    return res.type('html').send(String(V.shell({ title: 'This Week', body, current: 'week' })));
  }
  if (!week.week_start) {
    // Backfills a week created before week_start existed. Prefers its earliest
    // service day, so an already-planned week keeps showing the right dates.
    const earliest = db.prepare(`SELECT MIN(service_date) d FROM service_days WHERE week_id = ?`).get(week.id).d;
    const weekStart = earliest ? T.mondayOf(earliest) : T.mondayOnOrAfter(T.todayIn(tz()));
    db.prepare('UPDATE weeks SET week_start=?, title=? WHERE id=?')
      .run(weekStart, T.fmtWeekRange(weekStart, tz()), week.id);
    week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(week.id);
  }

  res.type('html').send(String(W.weekPage({
    week,
    days: M.serviceDaysOf(week.id),
    items: M.weekItemsOf(week.id),
    hasPrevious: !!db.prepare(`SELECT id FROM weeks WHERE id != ? ORDER BY id DESC LIMIT 1`).get(week.id),
  })));
});

/* The write the page above used to do on a GET.
 *
 * Defaults to the upcoming week, not the current one — the menu is planned and
 * posted ahead of time (Saturday, for the week starting the following Monday),
 * so "today" is rarely the week being built.
 *
 * The slug carries a random tail, the way a duplicate's does. It was
 * `week-${today}`, which is unique only until a week created today has been
 * retired and no draft or published one is left — at which point the INSERT
 * collided with a UNIQUE column and the owner got a 500 on the button that
 * starts their week. */
router.post('/week/new', (req, res) => {
  /* Two taps, or a tab restored onto the POST, should not make two weeks. */
  const already = db.prepare(`SELECT id FROM weeks WHERE status IN ('draft','published')
                              ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, id DESC LIMIT 1`).get();
  if (already) return res.redirect(303, `/admin/week?id=${already.id}`);

  const weekStart = T.mondayOnOrAfter(T.todayIn(tz()));
  const slug = `week-${weekStart}-${crypto.randomBytes(2).toString('hex')}`;
  const id = db.prepare('INSERT INTO weeks (slug, title, week_start) VALUES (?,?,?)')
    .run(slug, T.fmtWeekRange(weekStart, tz()), weekStart).lastInsertRowid;
  res.redirect(303, `/admin/week?id=${id}`);
});

router.post('/week/:id/basics', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE weeks SET description=?, image=? WHERE id=?')
    .run(String(req.body.description || '').trim(),
      String(req.body.week_image || '').trim() || null, id);
  if (req.get('X-Draft')) return res.json({ ok: true });
  back(res, req, 'Week details saved.');
});

router.post('/week/:id/weekstart', (req, res) => {
  const id = Number(req.params.id);
  const raw = String(req.body.week_start || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return back(res, req, null, 'That date doesn\'t look right.');
  const weekStart = T.mondayOf(raw);
  db.prepare('UPDATE weeks SET week_start=?, title=? WHERE id=?')
    .run(weekStart, T.fmtWeekRange(weekStart, tz()), id);
  back(res, req, 'Week updated. Existing service days were kept — only the boxes above moved.');
});

/* One box per weekday, Monday through Sunday. Each upserts the service day
   for its computed date with everything the box shows — name, description,
   photo, halal, allergen review, sizes and prices. Only the per-day pickup
   override (set below in Day details) is left untouched by this route. */
router.post('/week/:id/weekdays', (req, res) => {
  const id = Number(req.params.id);
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const weekStart = week.week_start || T.mondayOnOrAfter(T.todayIn(tz()));

  const tx = db.transaction(() => {
    T.WEEKDAYS_MON_FIRST.forEach((wd, offset) => {
      const item = IF.parse(req.body, wd);
      // Closing a day is itself something entered, so it creates the row a
      // blank day never gets. Without this, "closed" on a day with no dish
      // would have nowhere to be stored and would silently do nothing.
      const closed = req.body[`${wd}_closed`] ? 1 : 0;
      const closedNote = String(req.body[`${wd}_closed_note`] || '').trim().slice(0, 200);
      const date = T.addDays(weekStart, offset);
      const existing = db.prepare('SELECT id FROM service_days WHERE week_id = ? AND service_date = ?').get(id, date);
      // A day that already exists is always written, or unticking Closed on a
      // day with no dish on it would be silently dropped by the guard below
      // and leave the day shut.
      if (!existing && !item.name && !item.description && !closed && !closedNote) return;
      // Blank inherits the global setting, so it stays NULL rather than 0.
      const dailyCap = IF.intOrNull(req.body[`${wd}_daily_cap`]);
      if (existing) {
        db.prepare(`UPDATE service_days SET dish_name=?, description=?, photo=?, single_photo=?, halal=?,
            allergens=?, dismissed=?, ack=?, ack_of=?, full_on=?, full_label=?, full_price=?,
            full_cap=?, single_on=?, single_label=?, single_price=?, single_cap=?,
            daily_cap=?, closed=?, closed_note=? WHERE id=?`)
          .run(item.name, item.description, item.photo, item.single_photo, item.halal, item.allergens,
            item.dismissed, item.ack, item.ack_of, item.full_on, item.full_label,
            item.full_price, item.full_cap, item.single_on, item.single_label,
            item.single_price, item.single_cap, dailyCap, closed, closedNote, existing.id);
      } else {
        db.prepare(`INSERT INTO service_days
            (week_id, service_date, dish_name, description, photo, single_photo, halal, allergens, dismissed,
             ack, ack_of, full_on, full_label, full_price, full_cap, single_on, single_label,
             single_price, single_cap, daily_cap, closed, closed_note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id, date, item.name, item.description, item.photo, item.single_photo, item.halal, item.allergens,
            item.dismissed, item.ack, item.ack_of, item.full_on, item.full_label,
            item.full_price, item.full_cap, item.single_on, item.single_label,
            item.single_price, item.single_cap, dailyCap, closed, closedNote);
      }
    });
  });
  tx();
  if (req.get('X-Draft')) return res.json({ ok: true });
  back(res, req, 'This week\'s days saved.');
});

/* --- Derek's post, pasted -------------------------------------------------
 * Two routes, and the split between them is the whole feature. The first reads
 * and shows; only the second writes, and only what came back off the form the
 * owner was looking at. server/paste.js has the reasoning.
 *
 * A POST rather than a GET for the reading half, because the post is a body and
 * not a query string: it is a dozen lines long, it holds Derek's apostrophes and
 * dollar signs, and a menu has no business sitting in a URL, a history entry or
 * a server log.
 */
router.post('/week/:id/paste', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');
  /* Long enough for the longest post in three years of them, several times
     over, and short enough that a paste of something else is not a page with
     four hundred cards on it. */
  const text = String(req.body.post || '').slice(0, 20000);
  res.type('html').send(String(WP.pastePage({ week, rows: PASTE.read(text, week), text })));
});

/* The write. Everything it puts on the week comes out of the form above --
   nothing is re-parsed here, so a correction made on that page is the thing
   that lands rather than the thing the reader first thought. */
router.post('/week/:id/paste/apply', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const result = PASTE.apply(week, PASTE.rowsFromBody(req.body));
  const said = PASTE.summary(result);
  /* Not back(): the referer is the preview page, and re-showing a preview of
     text that has now been written is how the same post gets pasted twice. */
  res.redirect(303, `/admin/week?id=${week.id}`
    + `&${result.done.length ? 'ok' : 'err'}=${encodeURIComponent(said)}`);
});

/* --- Saved dishes ---------------------------------------------------------
 * Kept by name, so the list is the length of the repertoire rather than the
 * length of the history. The acknowledgement is never part of what is kept or
 * what comes back — see the note at the top of dishes.js.
 */
function weekdayDate(week, wd) {
  const offset = T.WEEKDAYS_MON_FIRST.indexOf(String(wd));
  if (offset === -1) return null;
  return T.addDays(week.week_start || T.mondayOnOrAfter(T.todayIn(tz())), offset);
}

router.post('/week/:id/dish/:wd/save', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const date = weekdayDate(week, req.params.wd);
  const day = date && db.prepare(
    'SELECT * FROM service_days WHERE week_id = ? AND service_date = ?').get(week.id, date);

  if (!day || !day.dish_name.trim()) {
    return back(res, req, null, 'There is no dish on that day yet. '
      + 'Fill it in, save the week, then save the dish.');
  }
  const what = DISH.save({ ...day, name: day.dish_name });
  back(res, req, what === 'updated'
    ? `"${day.dish_name}" was already on your list — it now holds this week's wording and prices.`
    : `"${day.dish_name}" saved. You can put it on any day from now on.`);
});

/**
 * Put a saved dish on a day. The day arrives in the body rather than the path.
 *
 * There used to be one of these controls inside every weekday box, which meant
 * the page carried the whole saved list seven times over — 2,600 options and a
 * quarter of a megabyte before the library had even finished growing. One
 * picker with a day beside it says the same thing once.
 */
router.post('/week/:id/dish/use', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const dish = DISH.byId(req.body.dish_id);
  if (!dish) return back(res, req, null, 'Pick one of your saved dishes first.');
  // The picker only offers mains, but the id arrives in a form body and the
  // check that matters is the one on this side of it. A soup on a day would be
  // a $12 litre sold as that day's featured dinner.
  if (dish.kind !== 'main') {
    return back(res, req, null, `"${dish.name}" is a saved ${dish.kind}, not a main. `
      + 'Soups, salads and desserts go on the week, further down this page.');
  }
  const date = weekdayDate(week, req.body.wd);
  if (!date) return back(res, req, null, 'Pick which day it goes on first.');

  // The day may not exist yet — an empty weekday box has no row behind it
  // until something is entered. Putting a dish on it is something entered.
  let day = db.prepare(
    'SELECT * FROM service_days WHERE week_id = ? AND service_date = ?').get(week.id, date);
  if (!day) {
    const id = db.prepare('INSERT INTO service_days (week_id, service_date) VALUES (?,?)')
      .run(week.id, date).lastInsertRowid;
    day = db.prepare('SELECT * FROM service_days WHERE id = ?').get(id);
  }
  if (day.closed) {
    return back(res, req, null, `${T.fmtDayShort(date, tz())} is marked closed. `
      + 'Reopen it first, then put a dish on it.');
  }

  DISH.applyToDay(dish.id, day.id);
  back(res, req, `"${dish.name}" is on ${T.fmtDayShort(date, tz())}, with its allergen tags. `
    + 'The review box is unticked — tick it before you publish.');
});

router.get('/dishes', (req, res) => {
  const sort = Object.prototype.hasOwnProperty.call(DISH.SORTS, req.query.sort)
    ? req.query.sort : 'name';
  const kind = DISH.KINDS.includes(req.query.kind) ? req.query.kind : '';
  const dishes = DISH.all({ sort, kind });
  const counts = DISH.countsByKind();
  const total = DISH.count();
  /* One query rather than one per row: the recipes that point at a dish, keyed
     by the dish they point at. Most dishes have none. */
  const recipeFor = new Map(
    R.list().filter((r) => r.dish_id).map((r) => [r.dish_id, r]),
  );

  const kindTab = (value, label, n) => html`<a
    class="btn ${kind === value ? 'btn--primary' : 'btn--secondary'}"
    href="/admin/dishes?kind=${value}&sort=${sort}">${label} (${n})</a>`;

  const body = html`
    <h1>Saved dishes</h1>
    <p class="also">Everything worth cooking again. Mains go on a day; soups, salads and
      desserts go on the week. A week adds its items here when it publishes, and the Save
      buttons in This Week add one before that. Saving something already here writes over
      it, so the list stays the length of what you cook rather than the length of what you
      have cooked.</p>

    <form method="get" action="/admin/dishes" class="card no-print">
      <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
        ${kindTab('', 'All', total)}
        ${DISH.KINDS.map((k) => kindTab(k, DISH.KIND_LABELS[k], counts[k]))}
      </div>
      <div class="dl-row">
        <input type="hidden" name="kind" value="${kind}">
        <label style="flex:1 1 220px">Sort by
          <select name="sort">
            ${Object.keys(DISH.SORTS).map((k) => html`<option value="${k}"${sort === k ? ' selected' : ''}>${DISH.SORT_LABELS[k]}</option>`)}
          </select>
        </label>
        <button class="btn btn--secondary" type="submit">Sort</button>
      </div>
    </form>
    <div class="notice">
      <strong>Allergen reviews are not saved with a dish.</strong> Putting one on a day
      brings back its description, prices, photo and tags, but the review box comes back
      unticked every time — the tick says you have checked this dish for the menu it is
      going on, and that is not something a recipe can carry with it.
    </div>
    ${dishes.length ? html`
      <table class="dtable">
        <thead><tr><th>Dish</th>${kind ? '' : html`<th>Kind</th>`}<th>Sizes</th><th>Recipe</th><th>Used</th><th></th></tr></thead>
        <tbody>${dishes.map((d) => html`<tr>
          <td data-label="Dish"><strong>${d.name}</strong>
            ${d.description ? html`<br><span class="variant__label">${d.description}</span>` : ''}</td>
          ${kind ? '' : html`<td data-label="Kind">${DISH.KIND_LABELS[d.kind] || d.kind}</td>`}
          <td data-label="Sizes">
            ${d.full_on && d.full_price != null ? html`${d.full_label} ${money(d.full_price)}` : ''}
            ${d.single_on && d.single_price != null ? html`<br>${d.single_label} ${money(d.single_price)}` : ''}</td>
          <td data-label="Recipe">${recipeFor.has(d.id)
            ? html`<a href="/admin/recipes/${recipeFor.get(d.id).slug}">${recipeFor.get(d.id).name}</a>`
            : html`<a class="variant__label" href="/admin/recipes/new">Write one</a>`}</td>
          <td data-label="Used">${d.used_count === 0 ? 'not yet' : `${d.used_count}×`}</td>
          <td data-label="">${V.confirmForm({
            action: `/admin/dishes/${d.id}/delete`,
            buttonLabel: 'Remove',
            message: `Remove "${d.name}" from your saved dishes? Days already using it keep what they have.`,
          })}</td>
        </tr>`)}</tbody>
      </table>`
      : html`<div class="card"><p>${kind
        ? `Nothing saved under ${DISH.KIND_LABELS[kind]} yet.`
        : 'Nothing saved yet.'} Publish a week, or use the Save buttons in
        This Week, and items will collect here.</p></div>`}`;

  res.type('html').send(String(V.shell({ title: 'Saved dishes', body, current: 'dishes' })));
});

router.post('/dishes/:id/delete', (req, res) => {
  const dish = DISH.byId(req.params.id);
  if (!dish) return back(res, req, null, 'That dish is already gone.');
  DISH.remove(dish.id);
  back(res, req, `"${dish.name}" removed. Menus already using it are untouched.`);
});

router.post('/week/:id/dates', (req, res) => {
  const id = Number(req.params.id);
  const dates = IF.arr(req.body.dates).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  /* Every row, not just the in-range ones: UNIQUE(week_id, service_date) makes
     a day this check cannot see an error rather than a skip, so moving the week
     start back onto an out-of-range day would fail the save. */
  const existing = M.everyServiceDayOf(id);
  const tx = db.transaction(() => {
    for (const d of dates) {
      if (!existing.find((e) => e.service_date === d)) {
        db.prepare('INSERT INTO service_days (week_id, service_date) VALUES (?,?)').run(id, d);
      }
    }
  });
  tx();
  back(res, req, dates.length ? 'Service days added.' : 'No dates to add.');
});

/* The dish itself (name, description, photo, halal, allergens, prices) is
   edited in the weekday box above — this route only ever touches the
   per-day pickup override, so it can never clobber what that box saved. */
router.post('/week/:id/day/:dayId', (req, res) => {
  /* Through the same clock guard the global pickup window goes through.
   *
   * This box was the one way into the app that stored a time without asking
   * whether it was one. The Settings form has been guarded since a typed
   * "four pm" printed as "NaN:undefined AM" on the customer menu — and this
   * override is the worse of the two places for that, because it is not only
   * shown. It is frozen onto every order placed on that day: fmtWindow reads it
   * at submit and writes the result into orders.pickup_window, permanently, on
   * a record no screen can correct and in the confirmation email the customer
   * keeps. A stored 99:99 printed as "3:99 PM", which is the dangerous kind of
   * wrong — obviously broken is a bug report, plausibly wrong is somebody
   * arriving at the wrong hour.
   *
   * Three answers, not two. Blank is not a bad value here: it is how a day says
   * "use the usual window", and it has to keep meaning NULL. So null is
   * inherit, false is "not a time at all", and a string is the normalised
   * value — '9:5' is stored as '09:05', which is the form fmtClock expects.
   */
  const override = (v) => {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return null;                                // inherit the global window
    return settings.clockTime(raw) || false;              // false: not a time
  };
  const start = override(req.body.pickup_start);
  const end = override(req.body.pickup_end);

  /* Refused whole, and nothing changed — the same bargain /admin/settings/pickup
     makes. Saving the delivery override while dropping a time the owner typed
     would leave the form showing one thing and the day doing another. */
  if (start === false || end === false) {
    const message = 'A pickup time has to look like 16:00, or be left empty to use the '
      + 'usual window. Nothing was changed.';
    if (req.get('X-Draft')) return res.status(400).json({ error: message });
    return back(res, req, null, message);
  }

  db.prepare(`UPDATE service_days SET pickup_start=?, pickup_end=?, delivery_on=?
      WHERE id=? AND week_id=?`)
    .run(start, end,
      req.body.delivery_override === '' ? null : (req.body.delivery_override === '1' ? 1 : 0),
      Number(req.params.dayId), Number(req.params.id));
  if (req.get('X-Draft')) return res.json({ ok: true });
  back(res, req, 'Pickup override saved.');
});

router.post('/week/:id/day/:dayId/delete', (req, res) => {
  db.prepare('DELETE FROM service_days WHERE id=? AND week_id=?')
    .run(Number(req.params.dayId), Number(req.params.id));
  back(res, req, 'Service day removed.');
});

/* The four level-2 slots, each with the two names it needs: the noun a
 * sentence uses, and the line confirming a save. Two names rather than one
 * because the fourth slot will not decline like the others — "Meatless Monday
 * of the week saved" is neither English nor true. */
const WEEK_ITEM_SLOTS = {
  soup: { noun: 'soup', saved: 'Soup of the week saved.' },
  salad: { noun: 'salad', saved: 'Salad of the week saved.' },
  dessert: { noun: 'dessert', saved: 'Dessert of the week saved.' },
  meatless: { noun: 'meatless dish', saved: 'Meatless Monday saved.' },
};

/* One copy, because there are three routes asking it, and because
 * `WEEK_ITEM_SLOTS[kind]` answered for inherited names: POSTing to
 * /admin/week/1/constructor walked past the guard and reached the INSERT, where
 * the table's CHECK constraint refused it and the owner got a 500. The database
 * was doing the guard's job, which is a fine backstop and a poor front door. */
const isWeekItemKind = (k) => Object.prototype.hasOwnProperty.call(WEEK_ITEM_SLOTS, k);

/* Which of a kind's slots a form is talking about, read off the body rather
   than the path so the URLs did not all have to change when soup grew a second
   one. Anything that is not a slot this kind actually has becomes slot 1 —
   never a 500, and never a row wearing a slot number the menu will not look
   for. `${kind}2` is the field prefix for the second; the first keeps the bare
   kind, so every field name that existed before still means what it did. */
function slotFrom(body, kind) {
  const n = Math.floor(Number(body.slot));
  return n >= 1 && n <= (M.WEEK_SLOT_COUNTS[kind] || 1) ? n : 1;
}
const prefixFor = (kind, slot) => (slot === 1 ? kind : `${kind}${slot}`);

/* Keep this week's meatless dish, soup, salad or dessert on the saved list —
   the same button the featured dish of a day has, at the level above it. */
router.post('/week/:id/:kind/save', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const slot = slotFrom(req.body, kind);
  const item = db.prepare('SELECT * FROM week_items WHERE week_id = ? AND kind = ? AND slot = ?')
    .get(Number(req.params.id), kind, slot);
  const noun = WEEK_ITEM_SLOTS[kind].noun;
  if (!item || !item.name.trim()) {
    return back(res, req, null, `There is no ${noun} on this week yet. `
      + `Fill it in, save it, then save the ${noun}.`);
  }
  const what = DISH.save(item);
  back(res, req, what === 'updated'
    ? `"${item.name}" was already on your list — it now holds this week's wording and prices.`
    : `"${item.name}" saved. You can put it on any week from now on.`);
});

/* Put a saved dish into one of the week's slots. Three of them take their own
   kind; the meatless slot takes a main, which is what the list it is picked
   from holds. */
router.post('/week/:id/:kind/use', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const wants = DISH.WEEK_SLOTS[kind];
  const dish = DISH.byId(req.body.dish_id);
  if (!dish || dish.kind !== wants) {
    return back(res, req, null,
      `Pick one of your saved ${DISH.KIND_LABELS[wants].toLowerCase()} first.`);
  }
  DISH.applyToWeek(dish.id, week.id, kind, slotFrom(req.body, kind));
  back(res, req, `"${dish.name}" is this week's ${WEEK_ITEM_SLOTS[kind].noun}. `
    + 'The review box is unticked — tick it before you publish.');
});

router.post('/week/:id/:kind', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const weekId = Number(req.params.id);
  const slot = slotFrom(req.body, kind);
  const item = IF.parse(req.body, prefixFor(kind, slot), { withWeekdays: true });

  // UNIQUE(week_id, kind) means this upsert can only ever produce one soup,
  // one salad, one dessert and one meatless dish per week, no matter what
  // arrives in the body.
  db.prepare(`INSERT INTO week_items
      (week_id, kind, slot, name, description, photo, single_photo, halal, allergens, dismissed, ack, ack_of,
       weekdays, full_on, full_label, full_price, full_cap, single_on, single_label,
       single_price, single_cap)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(week_id, kind, slot) DO UPDATE SET
       name=excluded.name, description=excluded.description, photo=excluded.photo,
       single_photo=excluded.single_photo,
       halal=excluded.halal, allergens=excluded.allergens, dismissed=excluded.dismissed,
       ack=excluded.ack, ack_of=excluded.ack_of, weekdays=excluded.weekdays,
       full_on=excluded.full_on, full_label=excluded.full_label, full_price=excluded.full_price,
       full_cap=excluded.full_cap, single_on=excluded.single_on, single_label=excluded.single_label,
       single_price=excluded.single_price, single_cap=excluded.single_cap`)
    .run(weekId, kind, slot, item.name, item.description, item.photo, item.single_photo, item.halal,
      item.allergens, item.dismissed, item.ack, item.ack_of, item.weekdays,
      item.full_on, item.full_label, item.full_price, item.full_cap,
      item.single_on, item.single_label, item.single_price, item.single_cap);

  if (req.get('X-Draft')) return res.json({ ok: true });
  back(res, req, WEEK_ITEM_SLOTS[kind].saved);
});

/* Duplicate last week — the biggest time saver, so it is built first and
   sits at the top of the page. Standing items are untouched: they never
   belonged to a week. Every allergen acknowledgement is reset. */
router.post('/week/duplicate', (req, res) => {
  const src = db.prepare(`SELECT * FROM weeks ORDER BY id DESC LIMIT 1`).get();
  if (!src) return back(res, req, null, 'There is no previous week to duplicate yet.');

  const srcDays = M.serviceDaysOf(src.id);
  const shift = srcDays.length ? 7 : 0;
  const slug = `week-${srcDays.length ? T.addDays(srcDays[0].service_date, shift) : T.todayIn(tz())}-${crypto.randomBytes(2).toString('hex')}`;
  const weekStart = T.addDays(src.week_start || T.mondayOnOrAfter(T.todayIn(tz())), 7);
  const title = T.fmtWeekRange(weekStart, tz());

  const tx = db.transaction(() => {
    const newId = db.prepare('INSERT INTO weeks (slug, title, description, image, status, week_start) VALUES (?,?,?,?,?,?)')
      .run(slug, title, src.description, src.image, 'draft', weekStart).lastInsertRowid;

    for (const d of srcDays) {
      db.prepare(`INSERT INTO service_days
        (week_id, service_date, sort, dish_name, description, photo, single_photo, halal, allergens,
         dismissed, ack, ack_of, full_on, full_label, full_price, full_cap,
         single_on, single_label, single_price, single_cap, pickup_start, pickup_end,
         delivery_on, daily_cap)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,NULL,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId, T.addDays(d.service_date, shift), d.sort, d.dish_name, d.description,
          d.photo, d.single_photo, d.halal, d.allergens, d.dismissed, d.full_on, d.full_label,
          d.full_price, d.full_cap, d.single_on, d.single_label, d.single_price,
          d.single_cap, d.pickup_start, d.pickup_end, d.delivery_on, d.daily_cap);
    }
    for (const w of db.prepare('SELECT * FROM week_items WHERE week_id = ?').all(src.id)) {
      db.prepare(`INSERT INTO week_items
        (week_id, kind, name, description, photo, single_photo, halal, allergens, dismissed, ack, ack_of,
         weekdays, full_on, full_label, full_price, full_cap, single_on, single_label,
         single_price, single_cap)
        VALUES (?,?,?,?,?,?,?,?,?,0,NULL,?,?,?,?,?,?,?,?,?)`)
        .run(newId, w.kind, w.name, w.description, w.photo, w.single_photo, w.halal, w.allergens,
          w.dismissed, w.weekdays, w.full_on, w.full_label, w.full_price, w.full_cap,
          w.single_on, w.single_label, w.single_price, w.single_cap);
    }
    return newId;
  });

  const id = tx();
  res.redirect(303, `/admin/week?id=${id}&ok=${encodeURIComponent('Last week copied as a draft with dates moved forward. Every dish needs its allergen review again before you publish.')}`);
});

/* Publish — blocked by name if any level-1 or level-2 item is unreviewed. */
router.post('/week/:id/publish', (req, res) => {
  const id = Number(req.params.id);
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  // Same gate the scheduler runs. One implementation, deliberately.
  const blockers = P.blockers(id);
  if (blockers.length) return back(res, req, null, blockers[0]);

  P.publishNow(id);
  back(res, req, 'Week published. Standing items are untouched and still live.');
});

router.post('/week/:id/auto-publish', (req, res) => {
  const on = req.body.auto_publish === '1' ? 1 : 0;
  db.prepare('UPDATE weeks SET auto_publish=?, publish_warned_at=NULL WHERE id=?')
    .run(on, Number(req.params.id));
  back(res, req, on
    ? 'This week will publish on schedule once everything is reviewed.'
    : 'This week will not publish itself. Use the button when you\'re ready.');
});

/* Closing the whole week. Kept separate from publishing: a closed week is
   still published, it just says the kitchen is shut. Nothing is deleted — the
   dishes stay in the draft and come back if it is reopened. */
router.post('/week/:id/closed', (req, res) => {
  const id = Number(req.params.id);
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const on = req.body.closed === '1' ? 1 : 0;
  db.prepare('UPDATE weeks SET closed=?, closed_note=? WHERE id=?')
    .run(on, String(req.body.closed_note || '').trim().slice(0, 200), id);

  const live = week.status === 'published';
  back(res, req, on
    ? (live ? 'Week closed. Customers can see that straight away and can order nothing on these dates.'
      : 'Week closed. It will tell customers the kitchen is shut when it publishes.')
    : (live ? 'Week reopened. The menu is back in front of customers.'
      : 'Week reopened. The dishes on it are as you left them.'));
});

router.post('/week/:id/unpublish', (req, res) => {
  db.prepare(`UPDATE weeks SET status='draft' WHERE id=?`).run(Number(req.params.id));
  back(res, req, 'Week moved back to draft. Customers can no longer see it.');
});

module.exports = router;
