'use strict';
const express = require('express');
const { db, settings } = require('../db');
const config = require('../config');
const auth = require('../auth');
const T = require('../time');
const O = require('../orders');
const FB = require('../facebook');
const X = require('../exports');
const S = require('../summary');
const G = require('../graphics');
const V = require('../views/admin');
const { palette } = require('../theme');
const { html, money } = require('../html');

/**
 * Two routers, deliberately.
 *
 * `strict` holds everything guarded by requiredStrict — exports, the restore,
 * and the print sheets. Those answer an unauthenticated request with a bare
 * 401 rather than a redirect, because a CSV download should not come back as
 * an HTML login page, and a print sheet should not leak a body.
 *
 * `router` holds the Facebook pages, which sit behind the ordinary redirect-to-
 * login guard.
 *
 * They are separate because Express runs a sub-router's `router.use` middleware
 * for every request that enters it, including paths it has no route for. A
 * single router carrying `auth.required` would therefore hijack requests meant
 * for the other admin modules — including the login page itself — the moment it
 * were mounted ahead of them. Keeping the strict routes in a router with no
 * blanket middleware lets index.js mount them first safely.
 */
const strict = express.Router();
const router = express.Router();
const tz = () => settings.get('timezone', 'America/Toronto');
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
strict.use(noStore);
router.use(noStore);

const { back } = require('./back');

/* ========================= INSTALLING THE DASHBOARD ======================
   The dashboard as an app on a phone's home screen and a computer's dock:
   its own icon, its own window, opening on /admin rather than the menu.

   DELIBERATELY NOT BEHIND auth.requiredStrict, and that is the whole reason
   this route is up here with a paragraph on it rather than filed with the
   pages it describes. A <link rel="manifest"> is fetched with credentials
   OMITTED unless the tag says crossorigin="use-credentials" — so a manifest
   guarded like the exports below would answer the browser's own fetch with a
   401, and the browser would then decline to offer the install with no error
   on the page, nothing in the console worth reading, and everything looking
   correct to a signed-in owner testing it on a laptop. It fails only on the
   device that was the point.

   Nothing in here is worth guarding. It is the business name, five icon paths
   and the word "standalone" — the same facts the login page already gives to
   anyone who loads it. The password is on the pages, which is where it does
   the work.

   No `orientation`. The customer app pins itself to portrait because it is a
   phone menu; this one is read on a laptop as often as a phone, and locking a
   dashboard to portrait would be a bug on the larger screen.

   `id` is set rather than left to default. It defaults to start_url, so it
   would work today — and would silently become a different app the day anyone
   changed where this opens, orphaning every icon already installed. */
strict.get('/manifest.webmanifest', (req, res) => {
  const name = settings.get('business_name');
  res.type('application/manifest+json').json({
    id: '/admin',
    name: `${name} Dashboard`,
    short_name: 'Dashboard',
    description: `Take orders, build the week's menu and read the takings for ${name}.`,
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    theme_color: palette.olive,
    background_color: palette.parchment,
    icons: [
      { src: '/icons/admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/admin-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/admin-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

/* ============================== EXPORTS =================================
   Personal data lives behind requiredStrict: a 401, never a redirect, and
   never a guessable static path. */

strict.get('/export/orders.csv', auth.requiredStrict, (req, res) => {
  const body = X.ordersCsv(req.query);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${X.filename('orders', req.query.date, 'csv')}"`);
  res.send(body);
});

/* The week's lines, for a spreadsheet. The date names a week rather than a day
   and is normalised to its Monday, so a link built out of a service date lands
   on the week that date falls in rather than 404ing on a Wednesday. */
strict.get('/export/week.csv', auth.requiredStrict, (req, res) => {
  const asked = X.one(req.query.week);
  const monday = T.mondayOf(T.isCalendarDate(asked) ? asked : T.todayIn(tz()));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${X.filename('week', monday, 'csv')}"`);
  res.send(S.weekCsv(monday));
});

strict.get('/export/contacts.csv', auth.requiredStrict, (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${X.filename('contacts', null, 'csv')}"`);
  res.send(X.contactsCsv());
});

strict.get('/export/backup.json', auth.requiredStrict, (req, res) => {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${X.filename('backup', null, 'json')}"`);
  res.send(X.backup());
});

strict.post('/restore', auth.requiredStrict, (req, res) => {
  if (String(req.body.confirm || '').trim().toUpperCase() !== 'RESTORE') {
    return back(res, req, null, 'Type RESTORE in the box to confirm.');
  }
  try {
    const n = X.restore(req.uploadBuffer ? req.uploadBuffer.toString('utf8') : req.body.backup);
    // A skipped setting is worth a sentence. It means the file held a value
    // that would have broken the app — an unusable timezone throws out of
    // every date on every page — so the one already stored was kept instead,
    // and the owner should know which to go and check.
    const kept = n.skipped && n.skipped.length
      ? ` ${n.skipped.length} setting${n.skipped.length === 1 ? '' : 's'} in the file `
        + `couldn't be used and ${n.skipped.length === 1 ? 'was' : 'were'} left as ${
          n.skipped.length === 1 ? 'it is' : 'they are'}: ${n.skipped.join(', ')}.`
      : '';
    /* An older backup has no saved dishes in it, so the list on disk was left
     * where it was rather than emptied. Say so plainly — the alternative is an
     * owner who thinks the whole database came from the file. */
    const dishes = n.keptLibrary
      ? ' That file predates saved dishes, so your saved list was left as it is.'
      : ` ${n.dishes} saved dish${n.dishes === 1 ? '' : 'es'} came back too.`;
    /* The same courtesy for the recipe book and the ledger, which version 3 is
     * the first format to carry. Named separately rather than lumped in with
     * the dishes, because "left as it is" and "came back" are different
     * outcomes and an owner deciding whether to restore again needs to know
     * which one they got. */
    const older = [];
    if (n.keptRecipes) older.push('recipes');
    if (n.keptPayments) older.push('payments');
    const legacy = older.length
      ? ` That file predates ${older.join(' and ')}, so ${older.length === 1 ? 'that' : 'those'} `
        + `on this server ${older.length === 1 ? 'was' : 'were'} left as ${
          older.length === 1 ? 'it is' : 'they are'}.`
      : ` ${n.recipes} recipe${n.recipes === 1 ? '' : 's'} and `
        + `${n.payments} payment${n.payments === 1 ? '' : 's'} came back as well.`;
    /* Payments kept from before a legacy restore are put back on the order with
     * the same reference. Any that could not be is money with nothing against
     * it, which is the one thing on this screen worth chasing. */
    const money = n.orphaned
      ? ` ${n.orphaned} payment${n.orphaned === 1 ? '' : 's'} could not be matched to an `
        + `order in that file and ${n.orphaned === 1 ? 'is' : 'are'} now unclaimed on the `
        + 'Payments screen.'
      : '';
    back(res, req, `Restored ${n.weeks} weeks, ${n.orders} orders and `
      + `${n.standing} standing items.${dishes}${legacy}${money}${kept}`);
  } catch (e) {
    // The message names what was wrong with the file when the file was the
    // problem, because "check it's the right backup" is no help to someone
    // holding the only copy they have.
    back(res, req, null, `That file couldn't be restored. ${e.message}`);
  }
});

/* ============================ PRINT SHEETS ==============================
   Rendered as print-optimised HTML rather than generated PDFs: the owner
   taps Print and either sends it to the kitchen printer or saves as PDF,
   which is one step either way and avoids embedding a PDF toolchain and
   font stack for three one-page documents. Every sheet is one page. */

function sheetShell(title, body) {
  return V.shell({
    title,
    /* The marker, not a script tag: admin.js opens the print dialog for any
       sheet carrying data-autoprint, and the button asks for it again. Both
       used to be written inline, which is what a page has to give up to be
       able to refuse inline script altogether. */
    body: html`<div class="sheet" data-autoprint>${body}
      <p class="no-print" style="margin-top:var(--dbd-sp-5)">
        <button class="btn btn--primary" type="button" data-print>Print or save as PDF</button>
        <a class="btn btn--secondary" href="/admin/orders">Back to orders</a></p></div>`,
  });
}

/* The three sheets are the only places a date arrives off a URL rather than out
   of the database, and every one of them hands it to Intl by way of parseDate.
   A shape parseDate cannot read became a 500 that blamed the server. */
function sheetDate(req, res) {
  const date = req.params.date;
  if (!T.isCalendarDate(date)) {
    res.status(404).type('text/plain').send('That is not a date this app can print.');
    return null;
  }
  return date;
}

strict.get('/sheet/kitchen/:date', auth.requiredStrict, (req, res) => {
  const date = sheetDate(req, res);
  if (!date) return;
  const totals = O.kitchenTotals(date);
  const notes = db.prepare(`SELECT name, allergy_notes FROM orders
    WHERE service_date=? AND status='confirmed' AND allergy_notes != '' ORDER BY name`).all(date);

  const body = html`
    <h1>Kitchen — ${T.fmtDayLong(date, tz())}</h1>
    <p>${totals.split.pickup} pickup · ${totals.split.delivery} delivery</p>
    ${totals.groups.map((g) => html`
      <h2>${g.name}</h2>
      <table class="dtable"><tbody>
        ${g.items.map((i) => html`<tr>
          <td data-label="Item"><strong>${i.item_name}</strong> — ${i.variant_label}</td>
          <td data-label="Qty" style="text-align:right;font-size:1.4em"><strong>${i.qty}</strong></td>
        </tr>`)}
      </tbody></table>`)}
    <h2>Allergy notes from customers</h2>
    ${notes.length ? notes.map((n) => html`
      <p class="allergy-note"><strong>${n.name}:</strong> ${n.allergy_notes}</p>`)
      : html`<p>No allergy notes for this day.</p>`}
    <p style="margin-top:1em;font-size:0.9em">Allergen information is a guide only.
      Every necessary precaution is taken in the kitchen, but cross-contamination remains a
      small possibility.</p>`;

  res.type('html').send(String(sheetShell('Kitchen sheet', body)));
});

strict.get('/sheet/pickup/:date', auth.requiredStrict, (req, res) => {
  const date = sheetDate(req, res);
  if (!date) return;
  const orders = db.prepare(`SELECT * FROM orders WHERE service_date=? AND method='pickup'
    AND status='confirmed' ORDER BY location_name, name`).all(date);

  // Grouped by location only — customers can arrive any time in the window,
  // so there is no time-slot sub-grouping to print.
  const byLoc = new Map();
  for (const o of orders) {
    const l = o.location_name || 'Unassigned';
    if (!byLoc.has(l)) byLoc.set(l, []);
    byLoc.get(l).push(o);
  }

  const body = html`
    <h1>Pickups — ${T.fmtDayLong(date, tz())}</h1>
    ${[...byLoc.entries()].map(([loc, list]) => html`
      <h2>${loc} — ${list.length} bags, anytime ${list[0].pickup_window}</h2>
      <table class="dtable">
        <thead><tr><th>✓</th><th>Customer</th><th>Phone</th><th>Items</th><th>Owed</th></tr></thead>
        <tbody>${list.map((o) => html`<tr>
          <td data-label="✓">☐</td>
          <td data-label="Customer">${o.name}</td>
          <td data-label="Phone">${o.phone}</td>
          <td data-label="Items">${O.linesOf(o.id).map((l) => `${l.qty}× ${l.item_name}`).join(', ')}</td>
          <td data-label="Owed">${money(o.total)}${o.paid ? ' (paid)' : ''}</td>
        </tr>`)}</tbody>
      </table>`)}
    ${orders.length ? '' : html`<p>No pickups for this day.</p>`}`;

  res.type('html').send(String(sheetShell('Pickup sheet', body)));
});

strict.get('/sheet/delivery/:date', auth.requiredStrict, (req, res) => {
  const date = sheetDate(req, res);
  if (!date) return;
  const orders = db.prepare(`SELECT * FROM orders WHERE service_date=? AND method='delivery'
    AND status='confirmed' ORDER BY fsa, postal_norm, name`).all(date);

  const byFsa = new Map();
  for (const o of orders) {
    if (!byFsa.has(o.fsa)) byFsa.set(o.fsa, []);
    byFsa.get(o.fsa).push(o);
  }

  const body = html`
    <h1>Delivery run — ${T.fmtDayLong(date, tz())}</h1>
    <p>${orders.length} stop${orders.length === 1 ? '' : 's'} · ${settings.get('delivery_window')}</p>
    ${[...byFsa.entries()].map(([fsa, list]) => html`
      <h2>${fsa} — ${list.length}</h2>
      <table class="dtable">
        <thead><tr><th>✓</th><th>Stop</th><th>Phone</th><th>Items</th><th>Owed</th></tr></thead>
        <tbody>${list.map((o) => html`<tr>
          <td data-label="✓">☐</td>
          <td data-label="Stop"><strong>${o.name}</strong><br>${o.addr_line}${o.addr_unit ? `, ${o.addr_unit}` : ''}<br>
            ${o.postal_norm}
            ${o.addr_notes ? html`<br><em>${o.addr_notes}</em>` : ''}
            <br><a class="no-print" href="https://maps.apple.com/?q=${encodeURIComponent(`${o.addr_line}, ${o.postal_norm}, Ontario, Canada`)}">Open in maps</a></td>
          <td data-label="Phone">${o.phone}</td>
          <td data-label="Items">${O.linesOf(o.id).map((l) => `${l.qty}× ${l.item_name}`).join(', ')}</td>
          <td data-label="Owed">${money(o.total)}${o.paid ? ' (paid)' : ''}</td>
        </tr>`)}</tbody>
      </table>`)}
    ${orders.length ? '' : html`<p>No deliveries for this day.</p>`}`;

  res.type('html').send(String(sheetShell('Delivery run', body)));
});

/**
 * The week, added up — the one sheet that is read after the cooking rather
 * than during it.
 *
 * Not wrapped in `.sheet` and not auto-printing, unlike the three above. Those
 * are a document for one day, opened to be printed; this one is browsed —
 * back a week, forward a week, and out to the day sheets — and a page that
 * throws up a print dialog every time you step to the week before is a page
 * nobody steps through. The Print button is there for when it is wanted.
 *
 * Any date in the week is accepted and folded to its Monday, so the links off
 * the Orders screen can carry a service date without knowing the rule.
 */
strict.get('/sheet/week', auth.requiredStrict, (req, res) => {
  const asked = X.one(req.query.week);
  const monday = T.mondayOf(T.isCalendarDate(asked) ? asked : T.todayIn(tz()));
  res.redirect(303, `/admin/sheet/week/${monday}`);
});

strict.get('/sheet/week/:date', auth.requiredStrict, (req, res) => {
  const date = sheetDate(req, res);
  if (!date) return;
  const monday = T.mondayOf(date);
  const s = S.weekSummary(monday);
  const weeks = S.weeksWithOrders();

  const cols = html`<thead><tr>
    <th>Item</th><th>Size</th><th style="text-align:right">Price</th>
    <th style="text-align:right">Sold</th><th style="text-align:right">Money</th>
  </tr></thead>`;

  /* `days` is set on the week roll-up only, and only says something worth
     saying when a dish ran more than once: eight sold over two nights and eight
     sold in one are not the same result. */
  const rows = (g) => g.items.map((i) => html`<tr>
    <td data-label="Item">${i.item_name}${i.days > 1
      ? html` <span class="variant__label">on ${i.days} days</span>` : ''}</td>
    <td data-label="Size">${i.variant_label}</td>
    <td data-label="Price" style="text-align:right">${i.mixed ? html`<span class="variant__label">mixed</span>` : money(i.unit_price)}</td>
    <td data-label="Sold" style="text-align:right"><strong>${i.qty}</strong></td>
    <td data-label="Money" style="text-align:right">${money(i.revenue)}</td>
  </tr>`);

  /* Food, delivery and total on one line, then what has actually arrived. Paid
     is money in the bank; outstanding is the number to chase, and it is spelled
     out rather than left as a subtraction for the reader to do. */
  const takings = (t) => html`<p class="variant__label">Food ${money(t.food)}
    · Delivery ${money(t.fees)}
    · <strong style="font-size:var(--dbd-step-1)">Total ${money(t.total)}</strong>
    · Paid ${money(t.paid)}${t.outstanding
      ? html` · <span class="flag flag--warn">${money(t.outstanding)} outstanding</span>` : ''}</p>`;

  const counts = (t) => html`${t.orders} order${t.orders === 1 ? '' : 's'}
    · ${t.pickups} pickup · ${t.deliveries} delivery`;

  const body = html`
    <h1>Week totals — ${T.fmtWeekRange(monday, tz())}</h1>
    <p class="also">Confirmed orders only, by the day the food was for.${s.pending
      ? html` <span class="flag flag--warn">${s.pending} late request${s.pending === 1 ? '' : 's'}</span>
        ${s.pending === 1 ? 'is' : 'are'} still waiting on you and ${s.pending === 1 ? 'is' : 'are'}
        not counted here — <a href="/admin/orders?status=late_request">Orders</a>.` : ''}${s.declined
      ? html` ${s.declined} declined request${s.declined === 1 ? '' : 's'} ${s.declined === 1 ? 'is' : 'are'} left out.` : ''}</p>

    <form method="get" action="/admin/sheet/week" class="card no-print">
      <div class="dl-row">
        <select name="week" style="flex:1 1 220px">
          ${weeks.includes(monday) ? '' : html`<option value="${monday}" selected>${T.fmtWeekRange(monday, tz())}</option>`}
          ${weeks.map((m) => html`<option value="${m}"${m === monday ? ' selected' : ''}>${T.fmtWeekRange(m, tz())}</option>`)}
        </select>
        <button class="btn btn--secondary" type="submit">Show that week</button>
        <a class="btn btn--secondary" href="/admin/sheet/week/${T.addDays(monday, -7)}">&larr; Week before</a>
        <a class="btn btn--secondary" href="/admin/sheet/week/${T.addDays(monday, 7)}">Week after &rarr;</a>
      </div>
      <div class="dl-row">
        <button class="btn btn--primary" type="button" data-print>Print or save as PDF</button>
        <a class="btn btn--secondary" href="/admin/export/week.csv?week=${monday}">Week CSV</a>
        <a class="btn btn--secondary" href="/admin/orders">Back to orders</a>
      </div>
      <p class="also">The CSV holds one row per item per day, plus a row for each
        day's delivery fees. It carries no totals of its own — the Money column
        adds up to the week, and the sums are on this page.</p>
    </form>

    ${s.empty ? html`<div class="card"><p>No confirmed orders for this week.</p></div>` : ''}

    ${s.days.map((d) => html`<div class="card week-day">
      <h2>${T.fmtDayLong(d.date, tz())}${d.dish_name ? ` — ${d.dish_name}` : ''}</h2>
      <p class="variant__label">${d.closed ? html`<em>Kitchen closed.</em> ` : ''}${counts(d)}
        <span class="no-print">· <a href="/admin/sheet/kitchen/${d.date}">Kitchen</a>
        · <a href="/admin/orders?date=${d.date}">Orders</a></span></p>
      ${d.sections.length ? d.sections.map((g) => html`
        <h3>${g.name}</h3>
        <table class="dtable">${cols}<tbody>${rows(g)}</tbody></table>`)
        : html`<p>Nothing sold on this day.</p>`}
      ${d.orders ? takings(d) : ''}
    </div>`)}

    ${s.empty ? '' : html`<div class="card week-total">
      <h2>The whole week</h2>
      <p class="variant__label">${counts(s.week)}</p>
      ${s.week.sections.map((g) => html`
        <h3>${g.name}</h3>
        <table class="dtable">${cols}<tbody>${rows(g)}</tbody></table>`)}
      ${takings(s.week)}
    </div>`}`;

  res.type('html').send(String(V.shell({ title: 'Week totals', body, current: 'weektotals' })));
});

/* Everything below is behind the ordinary redirect-to-login guard: these are
   dashboard pages, so an expired session should land on the login form rather
   than on a bare 401 the way the exports above do. */
router.use(auth.required);

/* =========================== GRAPHICS ==================================
   The social graphics and the business card, generated from the dashboard
   instead of from a terminal. The images themselves are served statically
   from GRAPHICS_DIR — see index.js — so this page is a list of links and
   two buttons, and the drawing lives in scripts/ where the command line
   already used it. */

function graphicsPanel(set) {
  const files = G.list(set.key);
  const stale = files.some((f) => f.source === 'shipped');

  return html`
    <div class="card">
      <h2>${set.title}</h2>
      <p class="also">${set.blurb}</p>
      ${set.key === 'card' && !process.env.BASE_URL ? html`
        <div class="notice notice--strong">
          <strong>The QR points at a placeholder.</strong> BASE_URL isn't set on this server,
          so the code on the card doesn't lead anywhere. Set it and generate again before
          sending anything to a printer. The address is printed under the code, so you can
          read it off the card below and check.
        </div>` : ''}
      ${stale ? html`
        <div class="notice">
          Some of these are the versions that shipped with the app. Generate to replace them
          with your own.
        </div>` : ''}

      ${set.sizes ? html`
        <!-- The one set where the size is the owner's to choose: label stock
             comes in whatever the roll happens to be, and resampling a 1-bit
             image to fit is exactly what ruins it. So it is drawn at the size
             asked for rather than scaled afterwards. -->
        <form method="post" action="/admin/graphics/${set.key}" class="sticker-size">
          <div class="dl-row">
            <label>Width
              <input type="number" name="width_mm" inputmode="numeric" required
                min="${set.sizes.limits.min}" max="${set.sizes.limits.max}"
                value="${set.sizes.presets[0].w}"> mm</label>
            <label>Height
              <input type="number" name="height_mm" inputmode="numeric" required
                min="${set.sizes.limits.min}" max="${set.sizes.limits.max}"
                value="${set.sizes.presets[0].h}"> mm</label>
            <label>Printer
              <select name="dpi">
                ${set.sizes.dpiChoices.map((d) => html`
                  <option value="${d}">${d} dpi</option>`)}
              </select></label>
          </div>
          <p class="also">203 dpi suits Zebra, Rollo and most direct-thermal units;
            300 dpi suits a Brother QL. Print the one that matches your printer and
            never scale it to fit. Both orientations are drawn each time, so the two
            below are always a matched pair. Common sizes:
            ${set.sizes.presets.map((p) => p.label).join(', ')}.</p>
          <button class="btn btn--primary" type="submit">Generate both orientations</button>
        </form>`
      : html`
        <form method="post" action="/admin/graphics/${set.key}">
          <button class="btn btn--primary" type="submit">Generate ${set.title.toLowerCase()}</button>
        </form>`}

      <div class="graphics-grid">
        ${files.map((f) => html`
          <figure class="graphic${set.sizes ? ' graphic--shape' : ''}">
            ${f.url
              ? html`<a href="${f.url}" download="${f.name}"><img src="${f.url}" alt="${f.label}" loading="lazy"></a>`
              : html`<div class="graphic__empty">Not generated yet</div>`}
            <figcaption>
              <strong>${f.label}</strong><br>
              <span class="variant__label">${f.size}
                ${f.source === 'generated'
                  ? html`· made ${T.fmtLocal(f.at, tz(), { month: 'short', day: 'numeric' })}` : ''}
                ${f.source === 'shipped' ? '· shipped with the app' : ''}</span>
              ${f.url ? html`<br><a href="${f.url}" download="${f.name}">Download</a>` : ''}
            </figcaption>
          </figure>`)}
      </div>
    </div>`;
}

router.get('/graphics', (req, res) => {
  const body = html`
    <h1>Graphics</h1>
    <p class="also">Everything here is drawn from the logo files and your own settings.
      Generating replaces the previous set — there is nothing to undo, and nothing a
      customer sees changes except the link preview.</p>
    ${Object.values(G.SETS).map(graphicsPanel)}`;

  res.type('html').send(String(V.shell({ title: 'Graphics', body, current: 'graphics' })));
});

router.post('/graphics/:set', async (req, res) => {
  const set = G.get(req.params.set);
  if (!set) return back(res, req, null, 'That isn\'t something this app draws.');

  const opts = set.sizes ? {
    widthMm: req.body.width_mm,
    heightMm: req.body.height_mm,
    dpi: req.body.dpi,
  } : undefined;

  try {
    const out = await G.run(set.key, opts);
    const notes = [...(out.notes || []), ...(out.warnings || [])];
    back(res, req, `${set.title} generated.${notes.length ? ` ${notes.join(' ')}` : ''}`);
  } catch (e) {
    // A missing brand file or an unreadable database is worth saying plainly:
    // the owner can act on both, and neither is a bug to hide behind "try again".
    // A second tap while the first is still drawing is not a fault at all, so it
    // is answered without filling the log with a stack trace.
    if (!e.busy) console.error('[graphics]', e);
    back(res, req, null, e.busy ? e.message : `That didn't generate: ${e.message}`);
  }
});

/* =========================== FACEBOOK ================================== */

router.get('/facebook/connect', (req, res) => {
  if (!config.facebook.appId || !config.facebook.appSecret) {
    return back(res, req, null, 'Facebook publishing isn\'t set up on this server yet.');
  }
  if (!config.tokenKey) {
    return back(res, req, null, 'The server is missing its token encryption key, so connecting isn\'t safe yet.');
  }
  res.redirect(302, FB.beginAuth());
});

router.get('/facebook/callback', async (req, res) => {
  // A callback with a missing, unknown or already-used state is rejected
  // outright — no token exchange is attempted.
  if (!FB.consumeState(req.query.state)) {
    return res.status(400).type('html').send(String(V.shell({
      title: 'Connection failed',
      body: html`<div class="card"><h1>That didn't come back from Facebook cleanly</h1>
        <p>For your safety the connection was stopped. Start again from Settings.</p>
        <p><a class="btn btn--primary" href="/admin/settings">Back to Settings</a></p></div>`,
    })));
  }
  if (req.query.error || !req.query.code) {
    return back(res, req, null, 'Facebook didn\'t complete the connection. You can try again any time.');
  }
  try {
    const { userName, pages, expiresAt } = await FB.completeAuth(String(req.query.code));
    if (!pages.length) {
      return back(res, req, null, 'That Facebook account doesn\'t administer any Pages, so there\'s nowhere to post.');
    }
    /* The Pages stay on the server until one is chosen. The form carries the
       id of the held set and which Page was picked — never the Page access
       token itself, which used to ride in a hidden input and come back up in
       the POST body for no reason other than that it was easy. */
    const choice = FB.holdPages({ userName, pages, expiresAt });
    const body = html`
      <h1>Choose the Page to post to</h1>
      <p>Connected as <strong>${userName}</strong>.</p>
      ${pages.map((p) => html`
        <div class="card">
          <h2>${p.name}</h2>
          <form method="post" action="/admin/facebook/select">
            <input type="hidden" name="choice" value="${choice}">
            <input type="hidden" name="page_id" value="${p.id}">
            <button class="btn btn--primary" type="submit" name="action" value="use">Post to this Page</button>
            <button class="btn btn--secondary" type="submit" name="action" value="test">Test post to this Page</button>
          </form>
        </div>`)}
      <p class="also">Pick one within fifteen minutes, or start again from Settings.</p>`;
    res.type('html').send(String(V.shell({ title: 'Choose a Page', body, current: 'settings' })));
  } catch (e) {
    back(res, req, null, 'Facebook wouldn\'t complete the connection. Try again from Settings.');
  }
});

router.post('/facebook/select', async (req, res) => {
  const { choice, page_id, action } = req.body;
  /* Read once and gone. An expired or already-used hold is the ordinary case of
     a form left open over lunch, not a fault, so it says what to do next. */
  const held = FB.takePages(choice);
  if (!held) {
    return back(res, req, null,
      'That connection took too long to finish, so it was dropped. Start again from Settings.');
  }
  const chosen = held.pages.find((p) => String(p.id) === String(page_id));
  if (!chosen) {
    return back(res, req, null, 'That Page wasn\'t one of the ones offered. Start again from Settings.');
  }
  /* The same check /facebook/connect makes, because this is where it bites.
     saveConnection encrypts the token and encrypt() throws without a key, so
     this failed closed already — but into the catch below, which blames
     Facebook for refusing something it was never asked. The server is missing a
     setting; say that, since it is the only one of the two the owner can fix. */
  if (!config.tokenKey) {
    return back(res, req, null, 'The server is missing its token encryption key, so the '
      + 'connection can\'t be stored safely. Set TOKEN_ENCRYPTION_KEY and connect again.');
  }
  const page_name = chosen.name;
  try {
    if (action === 'test') {
      await FB.testPost(chosen.id, chosen.access_token);
    }
    FB.saveConnection({
      fbUserName: held.userName, pageId: chosen.id, pageName: chosen.name,
      token: chosen.access_token, scopes: FB.scopes, expiresAt: held.expiresAt,
    });
    res.redirect(303, `/admin/settings?ok=${encodeURIComponent(
      action === 'test'
        ? `Test post sent to ${page_name} — go and delete it when you've seen it. Connection saved.`
        : `Connected. Menus will publish to ${page_name}.`)}`);
  } catch (e) {
    res.redirect(303, `/admin/settings?err=${encodeURIComponent(
      'Facebook wouldn\'t accept that. Try connecting again.')}`);
  }
});

router.post('/facebook/disconnect', async (req, res) => {
  FB.disconnect();
  back(res, req, 'Facebook disconnected. Posts already published stay up.');
});

router.get('/facebook/preview/:id', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id=?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');
  const conn = FB.connection();
  const text = FB.buildPostText(week);
  const image = FB.postImageFor(week);
  const canPage = FB.pageAdapter.available();

  const body = html`
    <h1>Post to Facebook</h1>
    ${week.fb_post_id ? html`<div class="notice notice--strong">
      This week was already published to Facebook.
      <a href="${week.fb_post_url}" target="_blank" rel="noopener">See the post</a>.</div>` : ''}

    <div class="card">
      <h2>What will be posted</h2>
      ${image ? html`<img src="/uploads/${image}" alt="" style="max-width:280px;border-radius:var(--dbd-radius)">` : ''}
      <pre style="white-space:pre-wrap;font-family:var(--dbd-body);background:var(--dbd-surface-sunk);
        padding:var(--dbd-sp-3);border-radius:var(--dbd-radius-sm)">${text}</pre>
    </div>

    <div class="card">
      <h2>Post it yourself</h2>
      <p class="also">Works whether or not Facebook is connected. This is the only way to post
        into a group — Facebook blocked apps from doing that in April 2024.</p>
      <div class="dl-row">
        <!-- The post text rides on the button, read by the one [data-copy]
             listener in admin.js that the week page's copy buttons already
             use. It was an inline script until the CSP started refusing
             those, which left this button doing nothing — on the page whose
             whole purpose is being the fallback when publishing fails. -->
        <button class="btn btn--primary" type="button" id="copybtn"
          data-copy="${text}" data-copied="Post text copied. Paste it into Facebook.">Copy post text</button>
        ${image ? html`<a class="btn btn--secondary" href="/uploads/${image}" download>Download the image</a>` : ''}
      </div>
    </div>

    <div class="card">
      <h2>Publish to your Page</h2>
      ${canPage ? html`
        <p>This posts to <strong>${conn.page_name}</strong> as ${conn.fb_user_name}.</p>
        ${V.confirmForm({
          action: `/admin/facebook/publish/${week.id}`,
          buttonLabel: week.fb_post_id ? 'Publish again' : 'Publish to Facebook',
          kind: 'primary',
          message: week.fb_post_id
            ? `This week is already on Facebook. Publish a second post to ${conn.page_name}?`
            : `Publish this menu to ${conn.page_name} now?`,
        })}`
      : html`<p>No Facebook Page is connected, so use "Copy post text" above.
          <a href="/admin/settings">Connect a Page in Settings</a> if you want one-tap publishing.</p>`}
    </div>`;

  res.type('html').send(String(V.shell({ title: 'Post to Facebook', body, current: 'week' })));
});

router.post('/facebook/publish/:id', async (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id=?').get(Number(req.params.id));
  if (!week) return back(res, req, null, 'That week no longer exists.');
  try {
    const r = await FB.pageAdapter.publish(week);
    db.prepare(`UPDATE weeks SET fb_status='published', fb_post_id=?, fb_post_url=?,
      fb_published_at=datetime('now') WHERE id=?`).run(r.postId, r.postUrl, week.id);
    res.redirect(303, `/admin/facebook/preview/${week.id}?ok=${encodeURIComponent(
      `Posted to ${r.pageName}.`)}`);
  } catch (e) {
    // No retry loop. Mark stale, offer one-tap reconnect, keep the manual
    // path working — it is on the same page the owner is looking at.
    if (e.isAuth) FB.markStale();
    res.redirect(303, `/admin/facebook/preview/${week.id}?err=${encodeURIComponent(
      e.isAuth
        ? 'Facebook has stopped accepting the connection. Reconnect in Settings, or use "Copy post text" above right now.'
        : 'Facebook wouldn\'t take the post just now. Use "Copy post text" above, or try again in a minute.')}`);
  }
});

module.exports = { strict, router };
