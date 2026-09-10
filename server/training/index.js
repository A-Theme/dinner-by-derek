'use strict';

/**
 * The training module.
 *
 * A complete practice copy of the dashboard, mounted at /admin-training and
 * working entirely on an in-memory sandbox. Nothing in this folder requires
 * ../db, ../mailer, ../facebook, ../images, ../publish or ../payments — the
 * modules that write things — so no route below can reach the real database,
 * send an email, post to a Page, or put a file on disk. It cannot do those
 * things by accident because it has nothing to do them with.
 *
 * The real dashboard is untouched. This router is mounted alongside it and
 * shares nothing but the stylesheets and server/html.js, both of which are
 * read-only.
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { html } = require('../html');
const C = require('./constants');
const L = require('./lib');
const St = require('./store');
const PASTE = require('./paste');
const sections = require('./sections');
const coach = require('./coach');

const V = require('./views/layout');
const ops = require('./views/ops');
const weekViews = require('./views/week');
const catalog = require('./views/catalog');
const config = require('./views/config');
const payments = require('./views/payments');

const router = express.Router();
const BASE = V.BASE;

/* Nothing in the training dashboard is ever cached, for the same reason the
   real one is not: every page is a view of state that just changed. */
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* --- The two static files ------------------------------------------------
 * Served from this folder rather than from public/, so the whole module is one
 * directory and nothing of it leaks into the real app's asset tree.
 */
const ASSETS = path.join(__dirname, 'assets');
router.get('/training.css', (req, res) => {
  res.type('text/css').sendFile(path.join(ASSETS, 'training.css'));
});
router.get('/training.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(ASSETS, 'training.js'));
});

/* --- Every request gets a sandbox ---------------------------------------- */
router.use((req, res, next) => {
  res.locals.d = St.sessionFor(req, res, { secure: !!req.secure });
  next();
});

/** Render a page object through the shell, with its walkthrough steps. */
function send(req, res, page) {
  const enabledKeys = sections.enabled().map((s) => s.key);
  const steps = enabledKeys.includes(page.current) ? coach.stepsFor(page.current) : [];
  res.type('html').send(String(V.shell({
    title: page.title,
    body: page.body,
    current: page.current,
    step: req.query.step,
    sectionSteps: steps,
  })));
}

/**
 * Back where they came from, carrying a sentence.
 *
 * Same shape as routes/back.js, and the same reasoning: the destination comes
 * off the Referer, which is the browser's word, so anything that is not a
 * training path is not where they came from and the training dashboard is a
 * better answer than a guess.
 */
function back(res, req, ok, err) {
  let pathname = BASE;
  let search = '';
  try {
    const u = new URL(req.get('referer') || BASE, 'http://placeholder.invalid');
    if (u.pathname === BASE || u.pathname.startsWith(`${BASE}/`)) {
      u.searchParams.delete('ok');
      u.searchParams.delete('err');
      u.searchParams.delete('saved');
      if (ok) u.searchParams.set('ok', ok);
      if (err) u.searchParams.set('err', err);
      pathname = u.pathname;
      search = u.search;
      return res.redirect(303, pathname + search);
    }
  } catch (e) {
    /* A referer that is not a URL at all. The fallback below is the answer. */
  }
  const q = new URLSearchParams();
  if (ok) q.set('ok', ok);
  if (err) q.set('err', err);
  const s = q.toString();
  return res.redirect(303, s ? `${BASE}?${s}` : BASE);
}

const go = (res, to, ok, err) => {
  const q = new URLSearchParams();
  if (ok) q.set('ok', ok);
  if (err) q.set('err', err);
  const s = q.toString();
  return res.redirect(303, s ? `${to}${to.includes('?') ? '&' : '?'}${s}` : to);
};

/** Refuse a route whose section is switched off. */
function gate(key) {
  return (req, res, next) => {
    if (sections.isEnabled(key)) return next();
    return res.status(404).type('html').send(String(V.shell({
      title: 'Not in training yet',
      current: '',
      body: html`
        <h1>That part of training isn't switched on</h1>
        <div class="card">
          <p>The <strong>${sections.find(key) ? sections.find(key).label : key}</strong> training
            screen is built but not in use yet, because the real one is still being finished.</p>
          <p>Training somebody on a screen that is about to change teaches them something they
            would have to unlearn, so it is held back until the real screen settles.</p>
          <p><a class="btn btn--primary" href="${BASE}/">Back to training</a></p>
        </div>`,
    })));
  };
}

/* ========================= SANDBOX CONTROLS ============================= */

router.post('/reset', (req, res) => {
  St.reset(req, res, { secure: !!req.secure });
  go(res, `${BASE}/`, 'Sandbox reset. Everything is back as it started.');
});

router.post('/logout', (req, res) => {
  back(res, req, 'On the real dashboard that would sign you out and return you to the sign-in '
    + 'screen. Here there is no session to end — you are still in training.');
});

/* --- The two advisory APIs ----------------------------------------------
 * Both are pure reads against the sandbox's own dictionary and rule list. The
 * real ones live at /admin/api/* and read the database; these deliberately do
 * not call them.
 */
router.post('/api/suggest', (req, res) => {
  const d = res.locals.d;
  const { name, description, accepted, dismissed } = req.body || {};
  res.json({
    pending: L.pendingFor(
      L.reviewedText({ name, description }), accepted, dismissed, d.allergenTerms,
    ),
  });
});

router.post('/api/proofread', (req, res) => {
  const findings = L.proofread(String((req.body && req.body.text) || ''));
  res.json({ findings, summary: L.proofSummary(findings) });
});

/* ============================== TODAY =================================== */

router.get('/', (req, res) => send(req, res, ops.todayPage(res.locals.d, req.query)));

/* ============================ THIS WEEK ================================= */

router.get('/week', (req, res) => {
  const d = res.locals.d;
  const week = req.query.id ? St.byId(d.weeks, req.query.id) : St.currentWeek(d);

  if (!week) {
    const body = html`
      <h1>This week</h1>
      ${V.flash(req.query)}
      <div class="card">
        <p>There is no week started yet. This makes an empty one, dated the week beginning
          ${L.fmtDayShort(L.mondayOf(L.today()))}, and opens it for you to fill in.</p>
        <form method="post" action="${BASE}/week/new">
          <button class="btn btn--primary btn--block" type="submit">Start this week's menu</button>
        </form>
      </div>`;
    return send(req, res, { title: 'This Week', body, current: 'week' });
  }
  return send(req, res, weekViews.weekPage(d, week, req.query));
});

router.post('/week/new', (req, res) => {
  const d = res.locals.d;
  /* Two taps, or a tab restored onto the POST, should not make two weeks. */
  const already = St.currentWeek(d);
  if (already) return go(res, `${BASE}/week?id=${already.id}`);

  const weekStart = L.mondayOf(L.today());
  const week = {
    id: d.seq.week++,
    slug: `week-${weekStart}-${crypto.randomBytes(2).toString('hex')}`,
    title: L.fmtWeekRange(weekStart),
    description: '', image: null, status: 'draft', closed: 0, closed_note: '',
    week_start: weekStart, auto_publish: 1,
    fb_post_id: null, fb_post_url: null, fb_published_at: null,
  };
  d.weeks.push(week);
  go(res, `${BASE}/week?id=${week.id}`, 'Week started. Fill in the days below.');
});

router.post('/week/duplicate', (req, res) => {
  const d = res.locals.d;
  const src = d.weeks.slice().sort((a, b) => b.id - a.id)[0];
  if (!src) return back(res, req, null, 'There is no previous week to duplicate yet.');

  const weekStart = L.addDays(src.week_start || L.mondayOf(L.today()), 7);
  const week = {
    id: d.seq.week++,
    slug: `week-${weekStart}-${crypto.randomBytes(2).toString('hex')}`,
    title: L.fmtWeekRange(weekStart),
    description: src.description, image: src.image, status: 'draft',
    closed: 0, closed_note: '', week_start: weekStart, auto_publish: 1,
    fb_post_id: null, fb_post_url: null, fb_published_at: null,
  };
  d.weeks.push(week);

  /* Every acknowledgement is reset. Last week's tick was about last week's
     menu, and this is a different menu on different dates. */
  for (const day of St.serviceDaysOf(d, src.id)) {
    d.serviceDays.push({
      ...day, id: d.seq.day++, week_id: week.id,
      service_date: L.addDays(day.service_date, 7),
      allergens: [...day.allergens], dismissed: [...day.dismissed],
      ack: 0, ack_of: null,
      /* Closed days are not copied — the reason a week was shut rarely repeats. */
      closed: 0, closed_note: '',
    });
  }
  for (const item of St.weekItemsOf(d, src.id)) {
    d.weekItems.push({
      ...item, id: d.seq.weekItem++, week_id: week.id,
      allergens: [...item.allergens], dismissed: [...item.dismissed],
      weekdays: [...(item.weekdays || [])],
      ack: 0, ack_of: null,
    });
  }

  go(res, `${BASE}/week?id=${week.id}`,
    'Last week copied as a draft with dates moved forward. Every dish needs its allergen '
    + 'review again before you publish.');
});

router.post('/week/:id/basics', (req, res) => {
  const week = St.byId(res.locals.d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  week.description = String(req.body.description || '').trim();
  back(res, req, 'Week details saved.');
});

router.post('/week/:id/weekstart', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const raw = String(req.body.week_start || '').trim();
  if (!L.isCalendarDate(raw)) return back(res, req, null, "That date doesn't look right.");
  week.week_start = L.mondayOf(raw);
  week.title = L.fmtWeekRange(week.week_start);
  back(res, req, 'Week updated. Existing service days were kept — only the boxes above moved.');
});

router.post('/week/:id/weekdays', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const weekStart = week.week_start || L.mondayOf(L.today());

  C.WEEKDAYS_MON_FIRST.forEach((wd, offset) => {
    const item = L.parseItem(req.body, wd);
    /* Closing a day is itself something entered, so it creates the row a blank
       day never gets. */
    const closed = req.body[`${wd}_closed`] ? 1 : 0;
    const closedNote = String(req.body[`${wd}_closed_note`] || '').trim().slice(0, 200);
    const date = L.addDays(weekStart, offset);
    const existing = d.serviceDays.find((x) => x.week_id === week.id && x.service_date === date);

    /* A day that already exists is always written, or unticking Closed on a day
       with no dish would be dropped by the guard below and leave the day shut. */
    if (!existing && !item.name && !item.description && !closed && !closedNote) return;

    const dailyCap = L.intOrNull(req.body[`${wd}_daily_cap`]);
    const fields = {
      dish_name: item.name,
      description: item.description,
      photo: item.photo,
      single_photo: item.single_photo,
      halal: item.halal,
      allergens: item.allergens,
      dismissed: item.dismissed,
      ack: item.ack,
      /* The tick is recorded against the dish name, which is where a service
         day keeps it — not against `name`, which this row does not have. */
      ack_of: item.ack ? L.reviewedText({ name: item.name, description: item.description }) : null,
      full_on: item.full_on,
      full_label: item.full_label,
      full_price: item.full_price,
      full_cap: item.full_cap,
      single_on: item.single_on,
      single_label: item.single_label,
      single_price: item.single_price,
      single_cap: item.single_cap,
      daily_cap: dailyCap,
      closed,
      closed_note: closedNote,
    };

    if (existing) Object.assign(existing, fields);
    else {
      d.serviceDays.push({
        id: d.seq.day++, week_id: week.id, service_date: date, sort: offset,
        pickup_start: null, pickup_end: null, delivery_on: null, ...fields,
      });
    }
  });

  back(res, req, "This week's days saved.");
});

/* --- Derek's post, pasted ------------------------------------------------
 * Two routes, and the split between them is the whole feature. The first reads
 * and shows; only the second writes, and only what came back off the form the
 * trainee was looking at.
 */
router.post('/week/:id/paste', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const text = String(req.body.post || '').slice(0, 20000);
  send(req, res, weekViews.pastePage(d, week, PASTE.read(text, week), text, req.query));
});

router.post('/week/:id/paste/apply', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const rows = PASTE.rowsFromBody(req.body);
  const done = [];

  for (const row of rows) {
    /* Everything arriving this way is unreviewed, deliberately: the app has
       read somebody's words, not checked a kitchen. */
    const common = {
      description: row.description,
      allergens: [], dismissed: [], ack: 0, ack_of: null,
      full_on: 1, full_label: d.settings.full_label,
      full_price: row.full_price, full_cap: null,
      single_on: row.single_price != null ? 1 : 0,
      single_label: d.settings.single_label,
      single_price: row.single_price, single_cap: null,
    };

    if (row.kind === 'day') {
      const offset = C.WEEKDAYS_MON_FIRST.indexOf(row.wd);
      if (offset === -1) continue;
      const date = L.addDays(week.week_start, offset);
      let day = d.serviceDays.find((x) => x.week_id === week.id && x.service_date === date);
      if (!day) {
        day = {
          id: d.seq.day++, week_id: week.id, service_date: date, sort: offset,
          halal: 0, photo: null, single_photo: null, daily_cap: null,
          closed: 0, closed_note: '', pickup_start: null, pickup_end: null, delivery_on: null,
        };
        d.serviceDays.push(day);
      }
      Object.assign(day, common, { dish_name: row.name });
      done.push(`${L.weekdayLabel(row.wd)} — ${row.name}`);
    } else {
      const slot = Math.min(row.slot, C.WEEK_SLOT_COUNTS[row.kind] || 1);
      let item = St.weekItem(d, week.id, row.kind, slot);
      if (!item) {
        item = {
          id: d.seq.weekItem++, week_id: week.id, kind: row.kind, slot,
          halal: 0, photo: null, single_photo: null,
          weekdays: row.kind === 'meatless' ? ['mon'] : ['tue', 'wed', 'thu'],
        };
        d.weekItems.push(item);
      }
      Object.assign(item, common, { name: row.name });
      done.push(`${C.WEEK_ITEM_SLOTS[row.kind].label} — ${row.name}`);
    }
  }

  /* Not back(): the referer is the preview page, and re-showing a preview of
     text that has now been written is how the same post gets pasted twice. */
  const said = done.length
    ? `${done.length} item${done.length === 1 ? '' : 's'} put on the week: ${done.join(', ')}. `
      + 'Every one of them still needs its allergen review.'
    : 'Nothing was ticked, so nothing was written.';
  go(res, `${BASE}/week?id=${week.id}`, done.length ? said : null, done.length ? null : said);
});

/* --- Saved dishes on and off the week ------------------------------------ */

const weekdayDate = (week, wd) => {
  const offset = C.WEEKDAYS_MON_FIRST.indexOf(String(wd));
  return offset === -1 ? null : L.addDays(week.week_start || L.mondayOf(L.today()), offset);
};

router.post('/week/:id/dish/:wd/save', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const date = weekdayDate(week, req.params.wd);
  const day = date && d.serviceDays.find((x) => x.week_id === week.id && x.service_date === date);

  if (!day || !String(day.dish_name || '').trim()) {
    return back(res, req, null, 'There is no dish on that day yet. '
      + 'Fill it in, save the week, then save the dish.');
  }
  const what = St.saveDish(d, { ...day, name: day.dish_name }, 'main');
  back(res, req, what === 'updated'
    ? `"${day.dish_name}" was already on your list — it now holds this week's wording and prices.`
    : `"${day.dish_name}" saved. You can put it on any day from now on.`);
});

router.post('/week/:id/dish/use', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const dish = St.byId(d.dishes, req.body.dish_id);
  if (!dish) return back(res, req, null, 'Pick one of your saved dishes first.');
  /* The picker only offers mains, but the id arrives in a form body and the
     check that matters is the one on this side of it. */
  if (dish.kind !== 'main') {
    return back(res, req, null, `"${dish.name}" is a saved ${dish.kind}, not a main. `
      + 'Soups, salads and desserts go on the week, further down this page.');
  }
  const date = weekdayDate(week, req.body.wd);
  if (!date) return back(res, req, null, 'Pick which day it goes on first.');

  let day = d.serviceDays.find((x) => x.week_id === week.id && x.service_date === date);
  if (!day) {
    day = {
      id: d.seq.day++, week_id: week.id, service_date: date,
      sort: C.WEEKDAYS_MON_FIRST.indexOf(String(req.body.wd)),
      dish_name: '', description: '', halal: 0, photo: null, single_photo: null,
      allergens: [], dismissed: [], ack: 0, ack_of: null,
      full_on: 1, full_label: d.settings.full_label, full_price: null, full_cap: null,
      single_on: 0, single_label: d.settings.single_label, single_price: null, single_cap: null,
      daily_cap: null, closed: 0, closed_note: '',
      pickup_start: null, pickup_end: null, delivery_on: null,
    };
    d.serviceDays.push(day);
  }
  if (day.closed) {
    return back(res, req, null, `${L.fmtDayShort(date)} is marked closed. `
      + 'Reopen it first, then put a dish on it.');
  }

  St.applyDish(dish, day);
  back(res, req, `"${dish.name}" is on ${L.fmtDayShort(date)}, with its allergen tags. `
    + 'The review box is unticked — tick it before you publish.');
});

router.post('/week/:id/dates', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const dates = L.arr(req.body.dates).map(String).filter(L.isCalendarDate);
  const existing = St.everyServiceDayOf(d, week.id);
  let added = 0;
  for (const date of dates) {
    if (existing.some((x) => x.service_date === date)) continue;
    d.serviceDays.push({
      id: d.seq.day++, week_id: week.id, service_date: date, sort: 9,
      dish_name: '', description: '', halal: 0, photo: null, single_photo: null,
      allergens: [], dismissed: [], ack: 0, ack_of: null,
      full_on: 1, full_label: d.settings.full_label, full_price: null, full_cap: null,
      single_on: 0, single_label: d.settings.single_label, single_price: null, single_cap: null,
      daily_cap: null, closed: 0, closed_note: '',
      pickup_start: null, pickup_end: null, delivery_on: null,
    });
    added += 1;
  }
  back(res, req, added ? 'Service days added.' : 'No dates to add.');
});

/* The dish itself is edited in the weekday box — this route only ever touches
   the per-day pickup and delivery overrides. */
router.post('/week/:id/day/:dayId', (req, res) => {
  const d = res.locals.d;
  const day = St.byId(d.serviceDays, req.params.dayId);
  if (!day || day.week_id !== Number(req.params.id)) {
    return back(res, req, null, 'That day no longer exists.');
  }

  /* Three answers, not two. Blank is how a day says "use the usual window" and
     has to keep meaning null; false is "not a time at all". */
  const override = (v) => {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return null;
    return L.clockTime(raw) || false;
  };
  const start = override(req.body.pickup_start);
  const end = override(req.body.pickup_end);

  /* Refused whole, and nothing changed. Saving the delivery override while
     dropping a time the owner typed would leave the form showing one thing and
     the day doing another. */
  if (start === false || end === false) {
    return back(res, req, null, 'A pickup time has to look like 16:00, or be left empty to use '
      + 'the usual window. Nothing was changed.');
  }

  /* And two times are still not a window. Compared after falling back, not
     before: each half inherits on its own, so checking only the two boxes
     would pass a day that sets a late start and leaves the end inheriting the
     usual one. What is stored here is frozen onto every order placed on the
     day, which is why the real app guards the override as well as the global
     window. */
  const effStart = start || d.settings.pickup_start;
  const effEnd = end || d.settings.pickup_end;
  if (effStart >= effEnd) {
    return back(res, req, null,
      `Pickup has to finish after it starts, and ${L.fmtWindow(effStart, effEnd)} does not. `
      + 'Nothing was changed.'
      + (start && end ? '' : ' A box left empty uses the usual window, so the times you did '
        + 'set are being read against that.'));
  }

  day.pickup_start = start;
  day.pickup_end = end;
  day.delivery_on = req.body.delivery_override === ''
    ? null : (req.body.delivery_override === '1' ? 1 : 0);
  back(res, req, 'Pickup override saved.');
});

router.post('/week/:id/day/:dayId/delete', (req, res) => {
  const d = res.locals.d;
  const i = d.serviceDays.findIndex((x) => x.id === Number(req.params.dayId)
    && x.week_id === Number(req.params.id));
  if (i === -1) return back(res, req, null, 'That day is already gone.');
  d.serviceDays.splice(i, 1);
  back(res, req, 'Service day removed.');
});

/* --- The four level-2 slots ---------------------------------------------- */

const isWeekItemKind = (k) => Object.prototype.hasOwnProperty.call(C.WEEK_ITEM_SLOTS, k);

function slotFrom(body, kind) {
  const n = Math.floor(Number(body.slot));
  return n >= 1 && n <= (C.WEEK_SLOT_COUNTS[kind] || 1) ? n : 1;
}
const prefixFor = (kind, slot) => (slot === 1 ? kind : `${kind}${slot}`);

router.post('/week/:id/:kind/save', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const d = res.locals.d;
  const slot = slotFrom(req.body, kind);
  const item = St.weekItem(d, Number(req.params.id), kind, slot);
  const noun = C.WEEK_ITEM_SLOTS[kind].noun;

  if (!item || !String(item.name || '').trim()) {
    return back(res, req, null, `There is no ${noun} on this week yet. `
      + `Fill it in, save it, then save the ${noun}.`);
  }
  const what = St.saveDish(d, item, C.WEEK_SLOTS[kind]);
  back(res, req, what === 'updated'
    ? `"${item.name}" was already on your list — it now holds this week's wording and prices.`
    : `"${item.name}" saved. You can put it on any week from now on.`);
});

router.post('/week/:id/:kind/use', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const wants = C.WEEK_SLOTS[kind];
  const dish = St.byId(d.dishes, req.body.dish_id);
  if (!dish || dish.kind !== wants) {
    return back(res, req, null,
      `Pick one of your saved ${C.KIND_LABELS[wants].toLowerCase()} first.`);
  }
  const slot = slotFrom(req.body, kind);
  let item = St.weekItem(d, week.id, kind, slot);
  if (!item) {
    item = {
      id: d.seq.weekItem++, week_id: week.id, kind, slot,
      weekdays: kind === 'meatless' ? ['mon'] : ['tue', 'wed', 'thu'],
    };
    d.weekItems.push(item);
  }
  St.applyDish(dish, item);
  back(res, req, `"${dish.name}" is this week's ${C.WEEK_ITEM_SLOTS[kind].noun}. `
    + 'The review box is unticked — tick it before you publish.');
});

router.post('/week/:id/:kind', (req, res, next) => {
  const kind = req.params.kind;
  if (!isWeekItemKind(kind)) return next();
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  const slot = slotFrom(req.body, kind);
  const parsed = L.parseItem(req.body, prefixFor(kind, slot), { withWeekdays: true });

  let item = St.weekItem(d, week.id, kind, slot);
  if (!item) {
    item = { id: d.seq.weekItem++, week_id: week.id, kind, slot };
    d.weekItems.push(item);
  }
  Object.assign(item, parsed);
  back(res, req, C.WEEK_ITEM_SLOTS[kind].saved);
});

/* --- Publishing ---------------------------------------------------------- */

router.post('/week/:id/publish', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');

  /* The same gate the schedule runs. One implementation, deliberately. */
  const blockers = St.blockers(d, week.id);
  if (blockers.length) return back(res, req, null, blockers[0]);

  for (const other of d.weeks) {
    if (other.id !== week.id && other.status === 'published') other.status = 'retired';
  }
  week.status = 'published';
  back(res, req, 'Week published. Standing items are untouched and still live.');
});

router.post('/week/:id/auto-publish', (req, res) => {
  const week = St.byId(res.locals.d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const on = req.body.auto_publish === '1' ? 1 : 0;
  week.auto_publish = on;
  back(res, req, on
    ? 'This week will publish on schedule once everything is reviewed.'
    : "This week will not publish itself. Use the button when you're ready.");
});

router.post('/week/:id/closed', (req, res) => {
  const week = St.byId(res.locals.d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const on = req.body.closed === '1' ? 1 : 0;
  const live = week.status === 'published';
  week.closed = on;
  week.closed_note = String(req.body.closed_note || '').trim().slice(0, 200);
  back(res, req, on
    ? (live ? 'Week closed. Customers can see that straight away and can order nothing on these dates.'
      : 'Week closed. It will tell customers the kitchen is shut when it publishes.')
    : (live ? 'Week reopened. The menu is back in front of customers.'
      : 'Week reopened. The dishes on it are as you left them.'));
});

router.post('/week/:id/unpublish', (req, res) => {
  const week = St.byId(res.locals.d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  week.status = 'draft';
  back(res, req, 'Week moved back to draft. Customers can no longer see it.');
});

/* ============================ SAVED DISHES ============================== */

router.get('/dishes', (req, res) => send(req, res, catalog.dishesPage(res.locals.d, req.query)));

router.post('/dishes/:id/delete', (req, res) => {
  const d = res.locals.d;
  const i = d.dishes.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return back(res, req, null, 'That dish is already gone.');
  const [gone] = d.dishes.splice(i, 1);
  back(res, req, `"${gone.name}" removed. Menus already using it are untouched.`);
});

/* ============================ MENU HISTORY ============================== */

router.get('/history', (req, res) => send(req, res, catalog.historyPage(res.locals.d, req.query)));

/* ============================== RECIPES ================================= */

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 60) || 'recipe';

router.get('/recipes', (req, res) => send(req, res, catalog.recipesListPage(res.locals.d, req.query)));

/* `new` before `:slug`, so a recipe can never shadow the editor. */
router.get('/recipes/new', (req, res) => {
  send(req, res, catalog.recipeEditorPage(res.locals.d, null, null, req.query));
});

router.get('/recipes/:slug', (req, res, next) => {
  const d = res.locals.d;
  const recipe = d.recipes.find((r) => r.slug === req.params.slug);
  if (!recipe) return next();
  /* Clamped rather than trusted: a number out of a query string reaches
     arithmetic here, and x=1e9 should give a sensible answer. */
  const raw = Number(req.query.x);
  const factor = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 1;
  send(req, res, catalog.recipeDetailPage(d, recipe, factor, req.query));
});

router.get('/recipes/:slug/edit', (req, res, next) => {
  const d = res.locals.d;
  const recipe = d.recipes.find((r) => r.slug === req.params.slug);
  if (!recipe) return next();
  send(req, res, catalog.recipeEditorPage(d, recipe, null, req.query));
});

/** Read the two free-text boxes into the shapes the detail page renders. */
function recipeFromBody(d, body, existing) {
  const ingredients = String(body.ingredients || '').split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const m = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]{1,6})?\s+(.*)$/.exec(line);
      if (!m) return { qty: null, unit: '', text: line, group: '' };
      return { qty: Number(m[1]), unit: m[2] || '', text: m[3], group: '' };
    });
  const steps = String(body.steps || '').split(/\r?\n\s*\r?\n/)
    .map((s) => s.trim()).filter(Boolean).map((text) => ({ text }));
  const name = String(body.name || '').trim();

  return {
    id: existing ? existing.id : d.seq.recipe++,
    slug: existing ? existing.slug : slugify(name),
    name,
    summary: String(body.summary || '').trim(),
    category: C.RECIPE_CATEGORIES.includes(body.category) ? body.category : 'dish',
    yield_qty: body.yield_qty === '' ? null : Number(body.yield_qty),
    yield_unit: String(body.yield_unit || '').trim(),
    portions: body.portions === '' ? null : Math.floor(Number(body.portions)),
    dish_id: body.dish_id ? Number(body.dish_id) : null,
    parent_id: body.parent_id ? Number(body.parent_id) : null,
    tags: String(body.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    ingredients,
    steps,
    notes: String(body.notes || '').trim(),
  };
}

router.post('/recipes', (req, res) => {
  const d = res.locals.d;
  if (!String(req.body.name || '').trim()) {
    return send(req, res, catalog.recipeEditorPage(d, req.body, 'A recipe needs a name.', req.query));
  }
  const recipe = recipeFromBody(d, req.body, null);
  /* A slug already taken gets a tail rather than a collision. */
  if (d.recipes.some((r) => r.slug === recipe.slug)) {
    recipe.slug = `${recipe.slug}-${crypto.randomBytes(2).toString('hex')}`;
  }
  d.recipes.push(recipe);
  go(res, `${BASE}/recipes/${recipe.slug}`, `"${recipe.name}" saved.`);
});

router.post('/recipes/:id', (req, res) => {
  const d = res.locals.d;
  const existing = St.byId(d.recipes, req.params.id);
  if (!existing) return back(res, req, null, 'That recipe is gone.');
  if (!String(req.body.name || '').trim()) {
    return send(req, res, catalog.recipeEditorPage(
      d, { ...existing, ...req.body }, 'A recipe needs a name.', req.query,
    ));
  }
  Object.assign(existing, recipeFromBody(d, req.body, existing));
  go(res, `${BASE}/recipes/${existing.slug}`, 'Recipe saved.');
});

router.post('/recipes/:id/delete', (req, res) => {
  const d = res.locals.d;
  const i = d.recipes.findIndex((r) => r.id === Number(req.params.id));
  if (i === -1) return back(res, req, null, 'That recipe is already gone.');
  const [gone] = d.recipes.splice(i, 1);
  /* Variations keep their own text — a derivative outlives the base it was
     written against rather than vanishing with it. */
  for (const r of d.recipes) if (r.parent_id === gone.id) r.parent_id = null;
  go(res, `${BASE}/recipes`, `"${gone.name}" deleted. Anything built on it kept its own text.`);
});

/* =========================== OTHER OPTIONS ============================== */

function standingFromBody(d, body) {
  const item = L.parseItem(body, 'si');
  return {
    ...item,
    subcategory: C.SUBCATEGORY_ORDER.includes(body.si_subcategory) ? body.si_subcategory : 'Mains',
    availability: body.si_availability === 'weekdays' ? 'weekdays' : 'every_service_day',
    weekdays: L.arr(body.si_weekdays).map(String),
  };
}

router.get('/other-options', (req, res) => {
  send(req, res, catalog.otherOptionsPage(res.locals.d, req.query));
});

router.post('/other-options', (req, res) => {
  const d = res.locals.d;
  const f = standingFromBody(d, req.body);
  if (!f.name) return back(res, req, null, 'Give the item a name first.');
  const item = {
    id: d.seq.standing++, active: 1,
    sort: d.standing.reduce((n, x) => Math.max(n, x.sort || 0), 0) + 1,
    ...f,
  };
  d.standing.push(item);
  go(res, `${BASE}/other-options`,
    `${f.name} added.${f.ack ? '' : ' It stays hidden until you complete its allergen review.'}`);
});

router.post('/other-options/:id', (req, res) => {
  const d = res.locals.d;
  const item = St.byId(d.standing, req.params.id);
  if (!item) return back(res, req, null, 'That item no longer exists.');
  Object.assign(item, standingFromBody(d, req.body));
  const st = St.review(d, item);
  /* Back to the item, not away from it: the editor reopens with what was
     actually stored, so the new prices are on screen rather than taken on
     trust. */
  go(res, `${BASE}/other-options?edit=${item.id}&saved=1`,
    st.ok
      ? `Saved. ${item.name} updated on the live menu. Existing orders are unchanged.`
      : `Saved. ${L.reviewMessage(item.name, st)}`);
});

router.post('/other-options/:id/toggle', (req, res) => {
  const d = res.locals.d;
  const item = St.byId(d.standing, req.params.id);
  if (!item) return back(res, req, null, 'That item no longer exists.');
  const wasActive = item.active;
  item.active = wasActive ? 0 : 1;
  back(res, req, wasActive
    ? `${item.name} is hidden from customers. You can put it back any time.`
    : `${item.name} is back on the menu.`);
});

router.post('/other-options/:id/duplicate', (req, res) => {
  const d = res.locals.d;
  const item = St.byId(d.standing, req.params.id);
  if (!item) return back(res, req, null, 'That item no longer exists.');
  d.standing.push({
    ...item,
    id: d.seq.standing++,
    name: `${item.name} (copy)`,
    allergens: [...item.allergens],
    dismissed: [...item.dismissed],
    weekdays: [...L.jsonArr(item.weekdays)],
    /* A copy always arrives hidden and unreviewed. */
    ack: 0, ack_of: null, active: 0,
    sort: d.standing.reduce((n, x) => Math.max(n, x.sort || 0), 0) + 1,
  });
  back(res, req, 'Copied. The copy is hidden until you review its allergens and show it.');
});

/* ============================== ORDERS ================================== */

router.get('/orders', (req, res) => send(req, res, ops.ordersPage(res.locals.d, req.query)));

router.post('/orders/:id/flag', (req, res) => {
  const d = res.locals.d;
  const order = St.byId(d.orders, req.params.id);
  if (!order) return back(res, req, null, 'That order no longer exists.');
  const field = req.body.field === 'paid' ? 'paid' : 'fulfilled';
  order[field] = order[field] ? 0 : 1;
  back(res, req, field === 'paid'
    ? (order.paid ? 'Marked as paid.' : 'Marked as unpaid again.')
    : (order.fulfilled ? 'Marked as handed over.' : 'Undone.'));
});

router.post('/orders/:id/delete', (req, res) => {
  const d = res.locals.d;
  const i = d.orders.findIndex((o) => o.id === Number(req.params.id));
  if (i === -1) return back(res, req, null, 'That order no longer exists.');
  const [gone] = d.orders.splice(i, 1);
  /* A payment against a deleted order is unlinked, not deleted: money that
     arrived is a fact, and it becomes unclaimed rather than disappearing. */
  let unlinked = 0;
  for (const p of d.payments) {
    if (p.order_id === gone.id) { p.order_id = null; p.matched_by = null; p.set_paid = 0; unlinked += 1; }
  }
  const who = `${gone.name}, ${L.fmtDayShort(gone.service_date)}`;
  back(res, req, unlinked
    ? `Deleted the order from ${who}. The e-transfer that paid for it is still in Payments, now unlinked.`
    : `Deleted the order from ${who}.`);
});

router.post('/orders/:id/decide', (req, res) => {
  const d = res.locals.d;
  const order = St.byId(d.orders, req.params.id);
  if (!order) return back(res, req, null, 'That order no longer exists.');
  const decision = req.body.decision === 'confirmed' ? 'confirmed' : 'declined';
  order.status = decision;

  /* The real app emails the customer here. Written to the Outbox instead, so
     the trainee can see that pressing Decline is not a free action. */
  d.outbox.push({
    kind: 'Late request decided',
    to: order.email,
    subject: decision === 'confirmed'
      ? `Your order ${order.ref} is confirmed`
      : `About your order ${order.ref}`,
    at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    body: decision === 'confirmed'
      ? `Hello ${order.name},\n\nWe managed to fit your order in for `
        + `${L.fmtDayLong(order.service_date)}. See you then.\n\n— ${d.settings.business_name}`
      : `Hello ${order.name},\n\nI'm sorry — we couldn't fit your order in for `
        + `${L.fmtDayLong(order.service_date)}. Nothing has been charged.\n\n`
        + `— ${d.settings.business_name}`,
  });

  back(res, req, decision === 'confirmed'
    ? `Confirmed. ${order.name} would have been emailed — see the Outbox.`
    : `Declined. ${order.name} would have been emailed — see the Outbox.`);
});

/* ============================= PAYMENTS =================================
 * Behind the gate. See sections.js and views/payments.js. */

router.get('/payments', gate('payments'), (req, res) => {
  send(req, res, payments.paymentsPage(res.locals.d, req.query));
});

router.post('/payments/record', gate('payments'), (req, res) => {
  const r = payments.record(res.locals.d, String(req.body.notification || ''));
  back(res, req, r.ok ? r.message : null, r.ok ? null : r.message);
});

router.post('/payments/:id/link', gate('payments'), (req, res) => {
  const orderId = Number(req.body.order_id);
  if (!orderId) return back(res, req, null, 'Choose an order first.');
  const r = payments.link(res.locals.d, req.params.id, orderId);
  back(res, req, r.ok, r.err);
});

router.post('/payments/:id/unlink', gate('payments'), (req, res) => {
  const r = payments.unlink(res.locals.d, req.params.id);
  back(res, req, r.ok, r.err);
});

/* ======================= LOCATIONS & DELIVERY =========================== */

router.get('/locations', (req, res) => send(req, res, config.locationsPage(res.locals.d, req.query)));

router.post('/locations', (req, res) => {
  const d = res.locals.d;
  const name = String(req.body.name || '').trim();
  if (!name) return back(res, req, null, 'Give the location a name first.');
  d.locations.push({
    id: d.seq.location++, name,
    address: String(req.body.address || '').trim(),
    notes: String(req.body.notes || '').trim(),
    active: 1,
    sort: d.locations.reduce((n, x) => Math.max(n, x.sort || 0), 0) + 1,
  });
  back(res, req, `${name} added.`);
});

router.post('/locations/:id', (req, res) => {
  const loc = St.byId(res.locals.d.locations, req.params.id);
  if (!loc) return back(res, req, null, 'That location no longer exists.');
  loc.name = String(req.body.name || '').trim();
  loc.address = String(req.body.address || '').trim();
  loc.notes = String(req.body.notes || '').trim();
  back(res, req, 'Location saved.');
});

router.post('/locations/:id/toggle', (req, res) => {
  const loc = St.byId(res.locals.d.locations, req.params.id);
  if (!loc) return back(res, req, null, 'That location no longer exists.');
  loc.active = loc.active ? 0 : 1;
  back(res, req, 'Location updated. Existing orders are unchanged.');
});

router.post('/fsa/add', (req, res) => {
  const d = res.locals.d;
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]\d[A-Z]$/.test(code)) {
    return back(res, req, null, "That doesn't look like the first three characters of a postal "
      + 'code. Try something like N2L.');
  }
  if (d.fsas.some((f) => f.code === code)) return back(res, req, null, `${code} is already on the list.`);
  d.fsas.push({ code, zone_id: req.body.zone_id ? Number(req.body.zone_id) : null, uses: 0 });
  d.fsas.sort((a, b) => a.code.localeCompare(b.code));
  back(res, req, `${code} added. Customers there can order delivery right now.`);
});

router.post('/fsa/remove', (req, res) => {
  const d = res.locals.d;
  const code = String(req.body.code || '').toUpperCase();
  const i = d.fsas.findIndex((f) => f.code === code);
  if (i === -1) return back(res, req, null, 'That area is already gone.');
  d.fsas.splice(i, 1);
  back(res, req, 'Area removed.');
});

router.post('/settings/pickup', (req, res) => {
  const d = res.locals.d;
  /* Refused rather than defaulted: this window is frozen onto every order
     placed afterwards, so a silent correction becomes wrong text on records
     nobody can easily fix. */
  const start = L.clockTime(req.body.pickup_start);
  const end = L.clockTime(req.body.pickup_end);
  const unchanged = () => `The window is still ${L.fmtWindow(d.settings.pickup_start, d.settings.pickup_end)}.`;
  if (start === null || end === null) {
    return back(res, req, null,
      `A pickup time has to look like 16:00 — nothing was changed. ${unchanged()}`);
  }
  /* Both are times, and two times are not yet a window. Stored as typed, 19:00
     to 16:00 printed as "7:00 PM–4:00 PM" on the customer menu and was frozen
     onto every order placed that day — a record nobody can correct, telling a
     customer to collect three hours before collection opens. Refused whole
     rather than swapped round: the owner knows which of the two boxes they
     meant. The real app made this same correction on 2026-09-09. */
  if (start >= end) {
    return back(res, req, null,
      `Pickup has to finish after it starts — nothing was changed. ${unchanged()}`);
  }
  d.settings.pickup_start = start;
  d.settings.pickup_end = end;
  back(res, req, `Pickup window saved — ${L.fmtWindow(start, end)}. Future days use the new `
    + 'window; orders already placed keep the window they were given.');
});

router.post('/settings/delivery', (req, res) => {
  const d = res.locals.d;
  d.settings.delivery_enabled = req.body.delivery_enabled ? 1 : 0;
  d.settings.delivery_fee = L.cents(req.body.delivery_fee) || 0;
  d.settings.delivery_min = L.cents(req.body.delivery_min) || 0;
  d.settings.delivery_window = String(req.body.delivery_window || '').trim();
  back(res, req, 'Delivery settings saved. Orders already placed keep the fee they were quoted.');
});

/* ============================== GRAPHICS ================================ */

router.get('/graphics', (req, res) => send(req, res, config.graphicsPage(res.locals.d, req.query)));

router.post('/graphics/:set', (req, res) => {
  const d = res.locals.d;
  const set = config.GRAPHIC_SETS[req.params.set];
  if (!set) return back(res, req, null, "That isn't something this app draws.");
  const state = d.graphics[set.key];

  if (set.sizes) {
    const w = Math.floor(Number(req.body.width_mm));
    const h = Math.floor(Number(req.body.height_mm));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 10 || h < 10 || w > 200 || h > 200) {
      return back(res, req, null, 'A sticker has to be between 10 mm and 200 mm on each side. '
        + 'Nothing was drawn.');
    }
    state.width_mm = w;
    state.height_mm = h;
    state.dpi = Number(req.body.dpi) || 203;
  }
  state.generated_at = L.today();
  state.source = 'generated';

  back(res, req, `${set.title} generated. In training nothing is written to disk — the wording `
    + 'above changed to show what a real run would have left behind.');
});

/* ============================== SETTINGS ================================ */

router.get('/settings', (req, res) => send(req, res, config.settingsPage(res.locals.d, req.query)));

/* The zones the sandbox will accept, so a typo is refused the way the real
   app refuses one. Intl is never asked, because asking it is what used to
   throw out of every date on every page. */
const KNOWN_ZONES = ['America/Toronto', 'America/Vancouver', 'America/Edmonton',
  'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'UTC'];

router.post('/settings', (req, res) => {
  const d = res.locals.d;
  let rejected = null;

  for (const k of ['business_name', 'payment_instructions', 'owner_contact']) {
    if (req.body[k] === undefined) continue;
    d.settings[k] = String(req.body[k]).trim();
  }
  if (req.body.timezone !== undefined) {
    const tz = String(req.body.timezone).trim();
    if (KNOWN_ZONES.includes(tz)) d.settings.timezone = tz;
    else rejected = 'timezone';
  }
  if (req.body.notify_email !== undefined) {
    /* Stored tidy rather than raw: a trailing comma would otherwise reach the
       mailer as an empty recipient. */
    d.settings.notify_email = String(req.body.notify_email)
      .split(',').map((a) => a.trim()).filter(Boolean).join(', ');
  }

  /* Number(x) || fallback would turn a legitimate 0 into the fallback, which
     for an hour is the difference between midnight and six in the morning. */
  const hhmm = (raw, hourDefault, minuteDefault) => {
    const parts = String(raw || '').split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    return [
      Number.isFinite(h) && h >= 0 && h <= 23 ? h : hourDefault,
      Number.isFinite(m) && m >= 0 && m <= 59 ? m : minuteDefault,
    ];
  };
  const [ch, cm] = hhmm(req.body.cutoff_time, 22, 0);
  const [lh, lm] = hhmm(req.body.late_cutoff_time, 6, 0);
  d.settings.cutoff_hour = ch;
  d.settings.cutoff_minute = cm;
  d.settings.late_cutoff_hour = lh;
  d.settings.late_cutoff_minute = lm;

  if (rejected === 'timezone') {
    return back(res, req, 'Everything else was saved.',
      "That timezone isn't one this system knows, so the previous one was kept. "
      + 'Use a name like America/Toronto.');
  }
  back(res, req, 'Settings saved.');
});

router.post('/settings/publishing', (req, res) => {
  const d = res.locals.d;
  d.settings.auto_publish = req.body.auto_publish ? 1 : 0;
  const wd = String(req.body.auto_publish_weekday || 'sat');
  if (C.WEEKDAYS.includes(wd)) d.settings.auto_publish_weekday = wd;
  const t = L.clockTime(req.body.auto_publish_time);
  if (t !== null) d.settings.auto_publish_time = t;
  d.settings.remind_missing_week = req.body.remind_missing_week ? 1 : 0;
  d.settings.remind_missing_week_days = Math.max(0, Math.min(6,
    Math.floor(Number(req.body.remind_missing_week_days)) || 0));
  back(res, req, 'Publishing schedule saved.');
});

router.post('/settings/capacity', (req, res) => {
  const d = res.locals.d;
  const n = Math.max(0, Math.floor(Number(req.body.featured_daily_cap)) || 0);
  d.settings.featured_daily_cap = n;
  back(res, req, n === 0
    ? 'Saved. The featured dish now has no daily limit.'
    : `Saved. Up to ${n} of the featured dish a day, unless a day says otherwise.`);
});

router.post('/allergen-terms/add', (req, res) => {
  const d = res.locals.d;
  const term = String(req.body.term || '').trim().toLowerCase();
  const allergen = String(req.body.allergen || '').trim();
  if (!term || !C.HEALTH_CANADA_ORDER.includes(allergen)) {
    return back(res, req, null, 'Enter a word and pick which allergen it points to.');
  }
  if (!d.allergenTerms.some((t) => t.term === term && t.allergen === allergen)) {
    d.allergenTerms.push({ term, allergen });
  }
  back(res, req, `"${term}" now suggests ${allergen} the next time you edit a description.`);
});

router.post('/allergen-terms/remove', (req, res) => {
  const d = res.locals.d;
  const term = String(req.body.term || '');
  const allergen = String(req.body.allergen || '');
  const i = d.allergenTerms.findIndex((t) => t.term === term && t.allergen === allergen);
  if (i === -1) return back(res, req, null, 'That word is already gone.');
  d.allergenTerms.splice(i, 1);
  back(res, req, `"${term}" no longer suggests ${allergen}.`);
});

router.post('/restore', (req, res) => {
  const d = res.locals.d;
  if (String(req.body.confirm || '').trim().toUpperCase() !== 'RESTORE') {
    return back(res, req, null, 'Type RESTORE in the box to confirm.');
  }
  const name = String(req.body.backup_name || '').trim();
  if (!name) return back(res, req, null, 'Name a backup file to restore from.');
  back(res, req, `This is where the real app would replace everything with the contents of `
    + `"${name}" — every week, order, dish and setting. In training nothing was replaced, so `
    + 'you can practise the confirmation without losing the sandbox you have built.');
});

/* ============================== FACEBOOK ================================
 * The whole flow, with no Facebook in it. Connect goes straight to the same
 * Page-picking screen the real callback renders, against two invented Pages. */

router.get('/facebook/connect', (req, res) => {
  const d = res.locals.d;
  d.fbPending = {
    choice: crypto.randomBytes(8).toString('hex'),
    userName: 'Derek Hall',
    pages: [
      { id: '100000000000001', name: 'Dinner by Derek' },
      { id: '100000000000002', name: "Derek's Test Page" },
    ],
  };
  go(res, `${BASE}/facebook/callback`);
});

router.get('/facebook/callback', (req, res) => {
  const d = res.locals.d;
  if (!d.fbPending) {
    return go(res, `${BASE}/settings`, null,
      'That connection took too long to finish, so it was dropped. Start again from Settings.');
  }
  send(req, res, config.facebookChoosePage(d, d.fbPending, req.query));
});

router.post('/facebook/select', (req, res) => {
  const d = res.locals.d;
  const held = d.fbPending;
  d.fbPending = null;                        // read once and gone
  if (!held || held.choice !== req.body.choice) {
    return go(res, `${BASE}/settings`, null,
      'That connection took too long to finish, so it was dropped. Start again from Settings.');
  }
  const chosen = held.pages.find((p) => String(p.id) === String(req.body.page_id));
  if (!chosen) {
    return go(res, `${BASE}/settings`, null,
      "That Page wasn't one of the ones offered. Start again from Settings.");
  }

  d.facebook = {
    fb_user_name: held.userName,
    page_id: chosen.id,
    page_name: chosen.name,
    expires_at: L.addDays(L.today(), 60),
    stale: false,
  };

  if (req.body.action === 'test') {
    d.outbox.push({
      kind: 'Facebook test post',
      to: chosen.name,
      subject: `Test post to ${chosen.name}`,
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      body: 'Testing the connection from Dinner by Derek. Nothing was sent — this is training.',
    });
    return go(res, `${BASE}/settings`,
      `Test post written to the Outbox instead of being sent to ${chosen.name}. Connection saved.`);
  }
  go(res, `${BASE}/settings`, `Connected. Menus will publish to ${chosen.name}.`);
});

router.post('/facebook/disconnect', (req, res) => {
  const d = res.locals.d;
  const name = d.facebook ? d.facebook.page_name : 'that Page';
  d.facebook = null;
  back(res, req, `Facebook disconnected. Posts already published stay up. (${name})`);
});

/** The post text a week would go out with. */
function buildPostText(d, week) {
  const lines = [`Menu for ${week.title}`, ''];
  for (const day of St.serviceDaysOf(d, week.id)) {
    if (day.closed) { lines.push(`${L.fmtDayShort(day.service_date)} — kitchen closed`); continue; }
    if (!String(day.dish_name || '').trim()) continue;
    const prices = [
      day.full_on && day.full_price != null ? L.money(day.full_price) : null,
      day.single_on && day.single_price != null ? L.money(day.single_price) : null,
    ].filter(Boolean).join(' / ');
    lines.push(`${L.fmtDayShort(day.service_date)} — ${day.dish_name}${prices ? ` ${prices}` : ''}`);
  }
  const items = St.weekItemsOf(d, week.id).filter((i) => String(i.name || '').trim());
  if (items.length) {
    lines.push('');
    for (const i of items) {
      const prices = [
        i.full_on && i.full_price != null ? L.money(i.full_price) : null,
        i.single_on && i.single_price != null ? L.money(i.single_price) : null,
      ].filter(Boolean).join(' / ');
      lines.push(`${C.WEEK_ITEM_SLOTS[i.kind].label}: ${i.name}${prices ? ` ${prices}` : ''}`);
    }
  }
  lines.push('', d.settings.payment_instructions);
  return lines.join('\n');
}

router.get('/facebook/preview/:id', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  send(req, res, weekViews.facebookPreviewPage(d, week, buildPostText(d, week), req.query));
});

router.post('/facebook/publish/:id', (req, res) => {
  const d = res.locals.d;
  const week = St.byId(d.weeks, req.params.id);
  if (!week) return back(res, req, null, 'That week no longer exists.');
  if (!d.facebook) {
    return go(res, `${BASE}/facebook/preview/${week.id}`, null,
      'No Facebook Page is connected. Use "Copy post text" above, or connect a Page in Settings.');
  }

  week.fb_post_id = crypto.randomBytes(5).toString('hex');
  week.fb_post_url = `https://example.invalid/training/post/${week.fb_post_id}`;
  week.fb_published_at = L.today();

  d.outbox.push({
    kind: 'Facebook post',
    to: d.facebook.page_name,
    subject: `Menu for ${week.title}`,
    at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    body: buildPostText(d, week),
  });

  go(res, `${BASE}/facebook/preview/${week.id}`,
    `Posted to ${d.facebook.page_name} — except that nothing left this server. `
    + 'The post is in the Outbox.');
});

/* ============================ WEEK TOTALS ===============================
 * Any date in the week is accepted and folded to its Monday, so a link built
 * out of a service date lands on the week that date falls in rather than
 * 404ing on a Wednesday. */

router.get('/sheet/week', (req, res) => {
  const asked = req.query.week ? String(req.query.week) : '';
  const monday = L.mondayOf(L.isCalendarDate(asked) ? asked : L.today());
  res.redirect(303, `${BASE}/sheet/week/${monday}`);
});

router.get('/sheet/week/:date', (req, res) => {
  if (!L.isCalendarDate(req.params.date)) {
    return res.status(404).type('text/plain').send('That is not a date this app can print.');
  }
  send(req, res, ops.weekTotalsPage(res.locals.d, L.mondayOf(req.params.date), req.query));
});

/* ============================ PRINT SHEETS ============================== */

router.get('/sheet/:kind/:date', (req, res, next) => {
  const kind = req.params.kind;
  if (!['kitchen', 'pickup', 'delivery'].includes(kind)) return next();
  if (!L.isCalendarDate(req.params.date)) {
    return res.status(404).type('text/plain').send('That is not a date this app can print.');
  }
  send(req, res, ops.sheetPage(res.locals.d, kind, req.params.date));
});

/* ============================== EXPORTS ================================= */

/** One CSV cell, quoted the way a spreadsheet expects. */
const cell = (v) => {
  const s = String(v == null ? '' : v);
  /* A leading =, +, - or @ is a formula to Excel. Prefixed so a cell that
     starts with one is read as text, exactly as the real export does. */
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

router.get('/export/orders.csv', (req, res) => {
  const d = res.locals.d;
  let list = d.orders.slice();
  if (req.query.date) list = list.filter((o) => o.service_date === String(req.query.date));
  if (req.query.method) list = list.filter((o) => o.method === String(req.query.method));
  if (req.query.status) list = list.filter((o) => o.status === String(req.query.status));

  const rows = [['ref', 'name', 'phone', 'email', 'service_date', 'method', 'status',
    'paid', 'fulfilled', 'subtotal', 'delivery_fee', 'total', 'items', 'allergy_notes']];
  for (const o of list) {
    rows.push([o.ref, o.name, o.phone, o.email, o.service_date, o.method, o.status,
      o.paid ? 'yes' : 'no', o.fulfilled ? 'yes' : 'no',
      (o.subtotal / 100).toFixed(2), (o.delivery_fee / 100).toFixed(2), (o.total / 100).toFixed(2),
      o.lines.map((l) => `${l.qty}x ${l.item_name} (${l.variant_label})`).join('; '),
      o.allergy_notes]);
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="TRAINING-orders.csv"');
  res.send(csv(rows));
});

/**
 * The week's lines, for a spreadsheet.
 *
 * Deliberately only the lines: no subtotal rows and no grand total, because a
 * file carrying both its parts and its sums is one AutoSum away from a number
 * twice the size of the week. Delivery gets a row of its own per day rather
 * than a column, for the same reason — it is money the week made, it is not an
 * item anybody ordered, and a column of fees repeated beside every line would
 * be summed too.
 */
router.get('/export/week.csv', (req, res) => {
  const d = res.locals.d;
  const asked = req.query.week ? String(req.query.week) : '';
  const monday = L.mondayOf(L.isCalendarDate(asked) ? asked : L.today());
  const s = St.weekSummary(d, monday);

  const rows = [['Service day', 'Weekday', 'Kind', 'Section', 'Item', 'Size',
    'Unit price', 'Sold', 'Money']];
  for (const day of s.days) {
    for (const g of day.sections) {
      for (const i of g.items) {
        rows.push([day.date, L.weekdayLabel(L.weekdayKey(day.date)),
          i.source_level, g.name, i.item_name, i.variant_label,
          (i.unit_price / 100).toFixed(2), i.qty, (i.revenue / 100).toFixed(2)]);
      }
    }
    if (day.fees) {
      rows.push([day.date, L.weekdayLabel(L.weekdayKey(day.date)),
        'Delivery', 'Delivery', 'Delivery fees', '', '', day.deliveries,
        (day.fees / 100).toFixed(2)]);
    }
  }

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="TRAINING-week-${monday}.csv"`);
  res.send(csv(rows));
});

router.get('/export/contacts.csv', (req, res) => {
  const d = res.locals.d;
  const seen = new Map();
  for (const o of d.orders) if (!seen.has(o.phone)) seen.set(o.phone, o);
  const rows = [['name', 'phone', 'email', 'orders', 'last_order']];
  for (const [phone, o] of seen) {
    const mine = d.orders.filter((x) => x.phone === phone);
    rows.push([o.name, phone, o.email, mine.length,
      mine.map((x) => x.service_date).sort().pop()]);
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="TRAINING-contacts.csv"');
  res.send(csv(rows));
});

router.get('/export/backup.json', (req, res) => {
  const d = res.locals.d;
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="TRAINING-backup.json"');
  res.send(JSON.stringify({
    note: 'This is a TRAINING backup of invented data. It is not a backup of the business.',
    version: 3,
    made_at: new Date().toISOString(),
    settings: d.settings,
    weeks: d.weeks,
    service_days: d.serviceDays,
    week_items: d.weekItems,
    dishes: d.dishes,
    standing_items: d.standing,
    orders: d.orders,
    payments: d.payments,
    locations: d.locations,
    zones: d.zones,
    fsas: d.fsas,
    recipes: d.recipes,
    allergen_terms: d.allergenTerms,
  }, null, 2));
});

/* =============================== OUTBOX ================================= */

router.get('/outbox', (req, res) => send(req, res, ops.outboxPage(res.locals.d, req.query)));

router.post('/outbox/clear', (req, res) => {
  res.locals.d.outbox.length = 0;
  back(res, req, 'Outbox emptied.');
});

/* ============================== NOT FOUND =============================== */

router.use((req, res) => {
  res.status(404).type('html').send(String(V.shell({
    title: 'Not found',
    current: '',
    body: html`
      <h1>There's nothing at that address</h1>
      <div class="card">
        <p>That page isn't part of the training dashboard.</p>
        <p><a class="btn btn--primary" href="${BASE}/">Back to training</a></p>
      </div>`,
  })));
});

module.exports = router;
