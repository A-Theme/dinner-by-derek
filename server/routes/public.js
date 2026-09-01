'use strict';
const express = require('express');
const { settings } = require('../db');
const M = require('../menu');
const D = require('../delivery');
const O = require('../orders');
const mailer = require('../mailer');
const V = require('../views/customer');
const L = require('../views/layout');
const { html } = require('../html');
const { palette } = require('../theme');
const { rateLimit } = require('../ratelimit');

const router = express.Router();

/* Live data must never be cached by a proxy or the browser. */
function noStore(res) {
  res.set('Cache-Control', 'no-store, must-revalidate');
}

router.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').json({
    name: settings.get('business_name'),
    short_name: settings.get('business_name').split(' ')[0] || 'Dinner',
    description: 'Order this week\'s supper club menu for pickup or delivery in Kitchener–Waterloo.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: palette.olive,
    background_color: palette.parchment,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

/* Branded offline screen — same palette, no white flash. */
router.get('/offline', (req, res) => {
  res.type('html').send(String(L.page({
    title: 'Offline',
    body: html`<div class="card" style="text-align:center;margin-top:var(--dbd-sp-7)">
      <h1>You're offline</h1>
      <p>The menu changes every week, so it's always fetched fresh — which means
      we can't show it without a connection.</p>
      <p>Reconnect and pull down to refresh.</p>
      <p style="margin-top:var(--dbd-sp-5)">
        <button class="btn btn--primary" type="button" data-reload>Try again</button></p>
    </div>`,
  })));
});

/* / resolves to the active week. */
router.get('/', (req, res) => {
  noStore(res);
  const week = M.activeWeek();
  if (!week) {
    return res.type('html').send(String(V.emptyView(
      'Derek hasn\'t published this week\'s menu yet. Check back soon.'
    )));
  }
  res.redirect(302, `/w/${week.slug}`);
});

/* Stable week permalink. */
router.get('/w/:slug', (req, res) => {
  noStore(res);
  const week = M.weekBySlug(req.params.slug);
  if (!week || week.status !== 'published') {
    return res.status(404).type('html').send(String(V.emptyView('That menu isn\'t available.')));
  }
  const days = M.serviceDaysOf(week.id);
  res.type('html').send(String(V.weekView({ week, days })));
});

/* Deep link to a service day. */
router.get('/w/:slug/:date', (req, res) => {
  noStore(res);
  const week = M.weekBySlug(req.params.slug);
  if (!week || week.status !== 'published') {
    return res.status(404).type('html').send(String(V.emptyView('That menu isn\'t available.')));
  }
  /* The week-range filter, which is what keeps a straggling date attached to
     this week by id from being reachable here.

     It is no longer the whole of what the week page shows. That page drops a
     day with no headline dish as well, so a dishless date IS still reachable
     by typing it in or following a link somebody was already sent — it just
     is not offered. Deliberate: an old link keeps working, and the page says
     for itself that no dish is set. */
  const day = M.serviceDayOn(week.id, req.params.date);
  if (!day) {
    return res.status(404).type('html').send(String(V.emptyView('That day isn\'t on the menu.')));
  }
  const menu = M.menuForDay(week, day);
  res.type('html').send(String(V.dayView({
    week, day, menu,
    locations: M.activeLocations(),
    deliveryFee: settings.getInt('delivery_fee'),
    deliveryMin: settings.getInt('delivery_min'),
    servedAreas: D.servedAreas(),
  })));
});

/* Eligibility probe. Advisory only — the real decision happens on submit. */
router.post('/api/eligibility', rateLimit('eligibility', 40, 60_000), (req, res) => {
  noStore(res);
  const r = D.check(req.body && req.body.postal);
  // The normalized postal code goes back in the body, never in a query string.
  res.json({ ok: r.ok, reason: r.reason, fsa: r.fsa, fee: r.fee, zone: r.zoneName });
});

/**
 * Priced review, for the confirm-before-you-submit step. Writes nothing.
 *
 * The numbers come from the same code the submit runs, so the review cannot
 * promise a price the order will not honour — and a dish that sold out while
 * the customer was filling in their address is reported here, before they
 * commit, rather than after.
 *
 * Its own limiter, looser than the order limiter: reviewing is something a
 * hesitant customer may reasonably do several times, and the round trip that
 * talks them out of a mistake should not be the one that locks them out.
 */
router.post('/api/quote', rateLimit('quote', 40, 60_000), (req, res) => {
  noStore(res);
  try {
    const q = O.quote(req.body);
    res.json({
      ok: true,
      late: q.status === 'late_request',
      lines: q.lines.map((l) => ({
        name: l.item_name, variant: l.variant_label, qty: l.qty,
        unit: l.unit_price, total: l.unit_price * l.qty,
        allergens: l.allergens || [],
      })),
      subtotal: q.order.subtotal,
      deliveryFee: q.order.delivery_fee,
      total: q.order.total,
      method: q.order.method,
      pickup: q.order.method === 'pickup'
        ? { name: q.order.location_name, address: q.order.location_addr, window: q.order.pickup_window }
        : null,
      delivery: q.order.method === 'delivery'
        ? { line: q.order.addr_line, unit: q.order.addr_unit, postal: q.order.postal_norm }
        : null,
      payment: O.PAYMENT_LABEL(q.order.payment_method),
      allergyNotes: q.order.allergy_notes || '',
    });
  } catch (e) {
    if (e instanceof O.OrderError) return res.status(400).json({ ok: false, error: e.message });
    throw e;
  }
});

/* Submit. */
router.post('/order', rateLimit('order', 12, 60_000), async (req, res) => {
  noStore(res);
  let result;
  try {
    result = O.create(req.body);
  } catch (e) {
    if (e instanceof O.OrderError) {
      return res.status(400).type('html').send(String(L.page({
        title: 'We couldn\'t place that order',
        body: html`<div class="card">
          <h1>We couldn't place that order</h1>
          <p>${e.message}</p>
          <p><button class="btn btn--primary" type="button" data-back>Go back</button></p>
        </div>`,
      })));
    }
    throw e;
  }

  const { order, lines, repeat } = result;
  /* Email failures must never lose an order that is already stored, so these
     stay detached and unawaited. They no longer stay quiet, though: mailer's
     own send() logs an SMTP refusal, but anything thrown before that — a
     template reading a field that isn't there — used to be swallowed whole.
     The reference goes in the line, because "an email failed" is not
     actionable and "the confirmation for A1B2C3D4 failed" is. */
  const mailFailed = (what) => (e) =>
    console.error(`[mail] ${what} failed for order ${order.ref}:`, (e && e.message) || e);
  /* Not on a repeat. The order is the one already placed, and the kitchen
     reading a second copy of the same ticket is how one dinner gets cooked
     twice. The customer still sees their confirmation below. */
  if (!repeat) {
    mailer.ownerOrderEmail(order, lines).catch(mailFailed('owner order email'));
    mailer.customerOrderEmail(order, lines).catch(mailFailed('customer confirmation'));
  }

  res.type('html').send(String(V.confirmationView({
    order,
    lines: O.linesOf(order.id),
    late: order.status === 'late_request',
  })));
});

module.exports = router;
