'use strict';

/**
 * The sandbox.
 *
 * One dataset per trainee, held in memory, seeded from seed.js and thrown away
 * when they are done. There is no `require('../db')` anywhere in this folder
 * and there is not meant to be: a training screen cannot write to the real
 * database because it has no handle to write with.
 *
 * State is keyed by a cookie rather than by the admin session, so two people
 * can be trained side by side without treading on each other, and so Reset
 * really does start again.
 */

const crypto = require('crypto');
const seed = require('./seed');
const L = require('./lib');
const C = require('./constants');

const COOKIE = 'dbd_training';

/* Held in a plain Map. Capped and idle-expired, because an in-memory store on
   a long-lived server is a leak with a friendly name otherwise. */
const sessions = new Map();
const MAX_SESSIONS = 200;
const IDLE_MS = 12 * 60 * 60 * 1000;      // a day's training, generously

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.at > IDLE_MS) sessions.delete(id);
  }
  /* Still over the cap after expiring the idle ones: drop the oldest. A
     trainee whose sandbox is evicted mid-session gets a fresh one, which is
     the same thing Reset does and no worse than a server restart. */
  while (sessions.size > MAX_SESSIONS) {
    let oldest = null;
    for (const [id, s] of sessions) if (!oldest || s.at < oldest[1].at) oldest = [id, s];
    sessions.delete(oldest[0]);
  }
}

/**
 * The dataset for this browser, created on first sight.
 *
 * The cookie is not a credential — it names a pile of invented dinners. It is
 * still given the same flags as the real session cookie, because a cookie that
 * rides on http and is readable from script is a habit worth not forming.
 */
function sessionFor(req, res, opts) {
  sweep();
  let id = req.cookies && req.cookies[COOKIE];
  if (!id || !sessions.has(id)) {
    id = crypto.randomBytes(16).toString('hex');
    sessions.set(id, { at: Date.now(), data: seed.build() });
    if (res && !res.headersSent) {
      res.cookie(COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!(opts && opts.secure),
        maxAge: IDLE_MS,
        path: '/admin-training',
      });
    }
  }
  const s = sessions.get(id);
  s.at = Date.now();
  return s.data;
}

/** Start again from the fixtures. */
function reset(req, res, opts) {
  const id = req.cookies && req.cookies[COOKIE];
  if (id) sessions.delete(id);
  return sessionFor(req, res, opts);
}

/* --- Reading the sandbox -------------------------------------------------
 * The same questions menu.js answers against SQL, answered against arrays.
 */

const byId = (rows, id) => rows.find((r) => Number(r.id) === Number(id)) || null;

/** The week the dashboard is about: the draft if there is one, else the published. */
function currentWeek(d) {
  const open = d.weeks.filter((w) => w.status === 'draft' || w.status === 'published');
  open.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
    return b.id - a.id;
  });
  return open[0] || null;
}

/** The week customers can see. */
function activeWeek(d) {
  const live = d.weeks.filter((w) => w.status === 'published').sort((a, b) => b.id - a.id);
  return live[0] || null;
}

/** A week's service days, in date order, limited to the seven days it covers. */
function serviceDaysOf(d, weekId) {
  const week = byId(d.weeks, weekId);
  const all = d.serviceDays.filter((x) => x.week_id === Number(weekId))
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
  if (!week || !week.week_start) return all;
  const end = L.addDays(week.week_start, 7);
  return all.filter((x) => x.service_date >= week.week_start && x.service_date < end);
}

/** Every day attached to the week, including any left adrift by a date change. */
const everyServiceDayOf = (d, weekId) => d.serviceDays
  .filter((x) => x.week_id === Number(weekId))
  .sort((a, b) => a.service_date.localeCompare(b.service_date));

const weekItemsOf = (d, weekId) => d.weekItems.filter((x) => x.week_id === Number(weekId));

function weekItem(d, weekId, kind, slot) {
  return d.weekItems.find((x) => x.week_id === Number(weekId)
    && x.kind === kind && Number(x.slot) === Number(slot)) || null;
}

const activeLocations = (d) => d.locations.filter((l) => l.active);

const slotsOf = (kind) => Array.from(
  { length: C.WEEK_SLOT_COUNTS[kind] || 1 }, (_, i) => i + 1,
);

/** The review state of anything, using this sandbox's own dictionary. */
const review = (d, item) => L.reviewState(item, d.allergenTerms);

/* --- The publish gate ----------------------------------------------------
 * One implementation, exactly as the real publish.js has one, so the button
 * and the schedule can never disagree about what is ready.
 */
function blockers(d, weekId) {
  const week = byId(d.weeks, weekId);
  if (!week) return ['That week no longer exists.'];

  /* A closed week says the kitchen is shut. There is nothing on it to review
     and nothing to get wrong, so it is never blocked. */
  if (week.closed) return [];

  const out = [];
  const days = serviceDaysOf(d, weekId);
  const named = days.filter((x) => !x.closed && String(x.dish_name || '').trim());
  if (!named.length && !weekItemsOf(d, weekId).some((i) => String(i.name || '').trim())) {
    out.push('There is nothing on this week yet. Put a dish on at least one day first.');
    return out;
  }
  for (const day of named) {
    const st = review(d, day);
    if (!st.ok) out.push(L.reviewMessage(`${day.dish_name} on ${L.fmtDayShort(day.service_date)}`, st));
  }
  for (const item of weekItemsOf(d, weekId)) {
    if (!String(item.name || '').trim()) continue;
    const st = review(d, item);
    if (!st.ok) out.push(L.reviewMessage(`${item.name}, this week's ${C.WEEK_ITEM_SLOTS[item.kind].noun}`, st));
  }
  return out;
}

/** When the schedule would publish this week, or null. */
function scheduledFor(d, week) {
  if (!week || week.status === 'published') return null;
  if (!Number(d.settings.auto_publish)) return null;
  if (!week.auto_publish) return null;
  if (!week.week_start) return null;
  /* The configured weekday in the seven days before the week starts. */
  const wd = d.settings.auto_publish_weekday || 'sat';
  for (let back = 1; back <= 7; back += 1) {
    const date = L.addDays(week.week_start, -back);
    if (L.weekdayKey(date) === wd) return { date, time: d.settings.auto_publish_time || '12:00' };
  }
  return null;
}

/* --- Kitchen totals ------------------------------------------------------ */
function kitchenTotals(d, date) {
  const orders = d.orders.filter((o) => o.service_date === date && o.status === 'confirmed');
  const groups = new Map();
  let pickup = 0;
  let delivery = 0;
  for (const o of orders) {
    if (o.method === 'pickup') pickup += 1; else delivery += 1;
    for (const line of o.lines) {
      const key = line.item_name;
      if (!groups.has(key)) groups.set(key, new Map());
      const variants = groups.get(key);
      variants.set(line.variant_label, (variants.get(line.variant_label) || 0) + line.qty);
    }
  }
  return {
    groups: [...groups.entries()].map(([name, variants]) => ({
      name,
      items: [...variants.entries()].map(([variant_label, qty]) => ({ item_name: name, variant_label, qty })),
    })),
    split: { pickup, delivery },
  };
}

/* --- Saved dishes -------------------------------------------------------- */

const DISH_FIELDS = ['kind', 'name', 'description', 'photo', 'single_photo', 'halal',
  'allergens', 'dismissed', 'full_on', 'full_label', 'full_price', 'full_cap',
  'single_on', 'single_label', 'single_price', 'single_cap'];

/**
 * Keep an item on the saved list, by name.
 *
 * The acknowledgement is deliberately not part of what is kept — the tick says
 * the dish was checked for the menu it is going on, and that is not something
 * a saved row can carry forward. Returns 'saved' or 'updated', which is the
 * difference between the two sentences the screen says back.
 */
function saveDish(d, item, kind) {
  const name = String(item.name || item.dish_name || '').trim();
  if (!name) return null;
  const k = kind || item.kind || 'main';
  const existing = d.dishes.find((x) => x.kind === k && x.name.toLowerCase() === name.toLowerCase());
  const target = existing || { id: d.seq.dish++, used_count: 0 };
  for (const f of DISH_FIELDS) {
    if (f === 'kind') { target.kind = k; continue; }
    if (f === 'name') { target.name = name; continue; }
    target[f] = Array.isArray(item[f]) ? [...item[f]] : item[f];
  }
  target.ack = 0;
  target.ack_of = null;
  target.saved_at = L.today();
  if (!existing) d.dishes.push(target);
  return existing ? 'updated' : 'saved';
}

/** Copy a saved dish onto a target item, leaving the review box unticked. */
function applyDish(dish, target) {
  target.name = dish.name;
  if ('dish_name' in target) target.dish_name = dish.name;
  target.description = dish.description;
  target.photo = dish.photo;
  target.single_photo = dish.single_photo;
  target.halal = dish.halal;
  target.allergens = [...(dish.allergens || [])];
  target.dismissed = [...(dish.dismissed || [])];
  target.full_on = dish.full_on;
  target.full_label = dish.full_label;
  target.full_price = dish.full_price;
  target.full_cap = dish.full_cap;
  target.single_on = dish.single_on;
  target.single_label = dish.single_label;
  target.single_price = dish.single_price;
  target.single_cap = dish.single_cap;
  /* Never carried across. See the note on saveDish above. */
  target.ack = 0;
  target.ack_of = null;
  dish.used_count = (dish.used_count || 0) + 1;
  return target;
}

/* --- Payments ------------------------------------------------------------
 * The reconciling logic, which is the part of that screen worth learning: what
 * counts as certain enough to settle on its own, and what has to be looked at.
 */

/** Read an amount, a reference and a sender out of pasted notification text. */
function readNotification(text) {
  const s = String(text || '');
  const amountMatch = /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/.exec(s)
    || /([0-9]+\.[0-9]{2})\s*(?:CAD|dollars)?/i.exec(s);
  if (!amountMatch) return null;
  const amount = Math.round(Number(String(amountMatch[1]).replace(/,/g, '')) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const refMatch = /\b(DBD-\d{3,6})\b/i.exec(s);
  const senderMatch = /(?:from|sent you money|received from|de)\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/.exec(s);
  return {
    amount,
    memo: refMatch ? refMatch[1].toUpperCase() : (/message:\s*(.+)/i.exec(s) || [])[1] || '',
    sender_name: senderMatch ? senderMatch[1].trim() : '',
    ref: refMatch ? refMatch[1].toUpperCase() : null,
  };
}

const unpaidOrders = (d) => d.orders.filter((o) => !o.paid && o.status !== 'declined');

/** Which orders a loose payment might belong to, best first. */
function candidatesFor(d, payment) {
  const out = [];
  const taken = (orderId) => d.payments.some((p) => p.id !== payment.id && p.order_id === orderId);

  const byRef = d.orders.find((o) => payment.memo
    && o.ref.toUpperCase() === String(payment.memo).toUpperCase());
  if (byRef) {
    out.push({
      order: byRef,
      reason: byRef.total === payment.amount ? 'exact' : 'ref_mismatch',
      taken: taken(byRef.id),
    });
  }
  const owing = unpaidOrders(d).filter((o) => o.total === payment.amount);
  if (owing.length === 1 && !out.some((c) => c.order.id === owing[0].id)) {
    out.push({ order: owing[0], reason: 'amount_only', taken: taken(owing[0].id) });
  }
  const senderKey = String(payment.sender_name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (senderKey) {
    for (const o of unpaidOrders(d)) {
      if (out.some((c) => c.order.id === o.id)) continue;
      const nameKey = o.name.toLowerCase().replace(/[^a-z]/g, '');
      const surname = o.name.split(/\s+/).pop().toLowerCase();
      if (senderKey.includes(surname) || nameKey.includes(senderKey)) {
        out.push({ order: o, reason: 'name', taken: taken(o.id) });
      }
    }
  }
  return out.slice(0, 4);
}

module.exports = {
  COOKIE, sessionFor, reset,
  byId, currentWeek, activeWeek, serviceDaysOf, everyServiceDayOf,
  weekItemsOf, weekItem, activeLocations, slotsOf, review,
  blockers, scheduledFor, kitchenTotals,
  saveDish, applyDish,
  readNotification, unpaidOrders, candidatesFor,
};
