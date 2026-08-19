'use strict';
const express = require('express');
const crypto = require('crypto');
const { db, settings } = require('../db');
const config = require('../config');
const auth = require('../auth');
const T = require('../time');
const M = require('../menu');
const A = require('../allergens');
const O = require('../orders');
const P = require('../publish');
const S = require('../signin');
const mail = require('../mailer');
const images = require('../images');
const IF = require('../itemform');
const V = require('../views/admin');
const W = require('../views/admin-week');
const { html, raw, money } = require('../html');
const { rateLimit } = require('../ratelimit');

const router = express.Router();
const tz = () => settings.get('timezone', 'America/Toronto');

/* Nothing in the dashboard is ever cached. */
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

function back(res, req, ok, err) {
  const base = req.get('referer') || '/admin';
  const u = new URL(base, config.baseUrl);
  u.searchParams.delete('ok'); u.searchParams.delete('err');
  if (ok) u.searchParams.set('ok', ok);
  if (err) u.searchParams.set('err', err);
  res.redirect(303, u.pathname + u.search);
}

/* --- Auth ---------------------------------------------------------------- */
router.get('/login', (req, res) => {
  res.type('html').send(String(V.login(null, req.query.next)));
});

router.post('/login', rateLimit('login', 8, 10 * 60_000), async (req, res) => {
  if (!auth.passwordMatches(req.body.password)) {
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

router.post('/logout', (req, res) => { auth.clear(res); res.redirect(303, '/admin/login'); });

router.use(auth.required);

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
    // Defaults to the upcoming week, not the current one — the menu is
    // planned and posted ahead of time (Saturday, for the week starting the
    // following Monday), so "today" is rarely the week being built.
    const weekStart = T.mondayOnOrAfter(T.todayIn(tz()));
    const slug = `week-${T.todayIn(tz())}`;
    const id = db.prepare('INSERT INTO weeks (slug, title, week_start) VALUES (?,?,?)')
      .run(slug, T.fmtWeekRange(weekStart, tz()), weekStart).lastInsertRowid;
    week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(id);
  } else if (!week.week_start) {
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
        db.prepare(`UPDATE service_days SET dish_name=?, description=?, photo=?, halal=?,
            allergens=?, dismissed=?, ack=?, ack_of=?, full_on=?, full_label=?, full_price=?,
            full_cap=?, single_on=?, single_label=?, single_price=?, single_cap=?,
            daily_cap=?, closed=?, closed_note=? WHERE id=?`)
          .run(item.name, item.description, item.photo, item.halal, item.allergens,
            item.dismissed, item.ack, item.ack_of, item.full_on, item.full_label,
            item.full_price, item.full_cap, item.single_on, item.single_label,
            item.single_price, item.single_cap, dailyCap, closed, closedNote, existing.id);
      } else {
        db.prepare(`INSERT INTO service_days
            (week_id, service_date, dish_name, description, photo, halal, allergens, dismissed,
             ack, ack_of, full_on, full_label, full_price, full_cap, single_on, single_label,
             single_price, single_cap, daily_cap, closed, closed_note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id, date, item.name, item.description, item.photo, item.halal, item.allergens,
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

router.post('/week/:id/dates', (req, res) => {
  const id = Number(req.params.id);
  const dates = IF.arr(req.body.dates).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const existing = M.serviceDaysOf(id);
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
  db.prepare(`UPDATE service_days SET pickup_start=?, pickup_end=?, delivery_on=?
      WHERE id=? AND week_id=?`)
    .run(String(req.body.pickup_start || '').trim() || null,
      String(req.body.pickup_end || '').trim() || null,
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

router.post('/week/:id/:kind', (req, res, next) => {
  const kind = req.params.kind;
  if (kind !== 'soup' && kind !== 'salad') return next();
  const weekId = Number(req.params.id);
  const item = IF.parse(req.body, kind, { withWeekdays: true });

  // UNIQUE(week_id, kind) means this upsert can only ever produce one soup and
  // one salad per week, no matter what arrives in the body.
  db.prepare(`INSERT INTO week_items
      (week_id, kind, name, description, photo, halal, allergens, dismissed, ack, ack_of,
       weekdays, full_on, full_label, full_price, full_cap, single_on, single_label,
       single_price, single_cap)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(week_id, kind) DO UPDATE SET
       name=excluded.name, description=excluded.description, photo=excluded.photo,
       halal=excluded.halal, allergens=excluded.allergens, dismissed=excluded.dismissed,
       ack=excluded.ack, ack_of=excluded.ack_of, weekdays=excluded.weekdays,
       full_on=excluded.full_on, full_label=excluded.full_label, full_price=excluded.full_price,
       full_cap=excluded.full_cap, single_on=excluded.single_on, single_label=excluded.single_label,
       single_price=excluded.single_price, single_cap=excluded.single_cap`)
    .run(weekId, kind, item.name, item.description, item.photo, item.halal,
      item.allergens, item.dismissed, item.ack, item.ack_of, item.weekdays,
      item.full_on, item.full_label, item.full_price, item.full_cap,
      item.single_on, item.single_label, item.single_price, item.single_cap);

  if (req.get('X-Draft')) return res.json({ ok: true });
  back(res, req, `${kind === 'soup' ? 'Soup' : 'Salad'} of the week saved.`);
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
        (week_id, service_date, sort, dish_name, description, photo, halal, allergens,
         dismissed, ack, ack_of, full_on, full_label, full_price, full_cap,
         single_on, single_label, single_price, single_cap, pickup_start, pickup_end,
         delivery_on, daily_cap)
        VALUES (?,?,?,?,?,?,?,?,?,0,NULL,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId, T.addDays(d.service_date, shift), d.sort, d.dish_name, d.description,
          d.photo, d.halal, d.allergens, d.dismissed, d.full_on, d.full_label,
          d.full_price, d.full_cap, d.single_on, d.single_label, d.single_price,
          d.single_cap, d.pickup_start, d.pickup_end, d.delivery_on, d.daily_cap);
    }
    for (const w of db.prepare('SELECT * FROM week_items WHERE week_id = ?').all(src.id)) {
      db.prepare(`INSERT INTO week_items
        (week_id, kind, name, description, photo, halal, allergens, dismissed, ack, ack_of,
         weekdays, full_on, full_label, full_price, full_cap, single_on, single_label,
         single_price, single_cap)
        VALUES (?,?,?,?,?,?,?,?,0,NULL,?,?,?,?,?,?,?,?,?)`)
        .run(newId, w.kind, w.name, w.description, w.photo, w.halal, w.allergens,
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
