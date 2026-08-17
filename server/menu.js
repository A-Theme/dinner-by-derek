'use strict';
const { db, settings } = require('./db');
const T = require('./time');
const { reviewState } = require('./allergens');

/**
 * The merge layer.
 *
 * Storage keeps the three levels apart. This is the ONLY place they come
 * together, and they come together as a flat list of render objects that carry
 * their own provenance in `level` / `refTable` / `refId` so an order line can
 * record where each item came from.
 *
 * The customer never sees which level an item belongs to. A week's soup and a
 * standing main sit in the same Other Options list under the same headings,
 * with the same fulfillment terms. The split is an authoring concern.
 */

const SUBCATEGORY_ORDER = ['Soups', 'Salads', 'Mains'];

/** Shared shape for an item from any level. */
function toRenderItem(row, { level, refTable, subcategory, name, serviceDate }) {
  const variants = [];
  if (row.full_on && row.full_price != null) {
    variants.push({
      id: 'full',
      label: row.full_label || settings.get('full_label'),
      price: row.full_price,
      cap: row.full_cap,
    });
  }
  if (row.single_on && row.single_price != null) {
    variants.push({
      id: 'single',
      label: row.single_label || settings.get('single_label'),
      price: row.single_price,
      cap: row.single_cap,
    });
  }
  for (const v of variants) {
    v.remaining = v.cap == null ? null : Math.max(0, v.cap - soldOn(refTable, row.id, v.id, serviceDate));
    v.soldOut = v.remaining === 0;
  }
  return {
    key: `${refTable}:${row.id}`,
    level, refTable, refId: row.id,
    name, subcategory,
    description: row.description || '',
    photo: row.photo || null,
    halal: !!row.halal,
    allergens: JSON.parse(row.allergens || '[]'),
    variants,
  };
}

/** Confirmed quantity already sold for an item+variant on a date. */
function soldOn(refTable, refId, variant, serviceDate) {
  if (!serviceDate) return 0;
  const r = db.prepare(`
    SELECT COALESCE(SUM(l.qty),0) AS n
    FROM order_lines l JOIN orders o ON o.id = l.order_id
    WHERE l.ref_table = ? AND l.ref_id = ? AND l.variant = ?
      AND o.service_date = ? AND o.status = 'confirmed'`)
    .get(refTable, refId, variant, serviceDate);
  return r.n;
}

/** The same, but across every variant — what the day ceiling counts. */
function soldOnAll(refTable, refId, serviceDate) {
  if (!serviceDate) return 0;
  const r = db.prepare(`
    SELECT COALESCE(SUM(l.qty),0) AS n
    FROM order_lines l JOIN orders o ON o.id = l.order_id
    WHERE l.ref_table = ? AND l.ref_id = ?
      AND o.service_date = ? AND o.status = 'confirmed'`)
    .get(refTable, refId, serviceDate);
  return r.n;
}

/**
 * The featured dish's ceiling for one day, counted across both sizes.
 * The day's own number wins; otherwise the global setting. Null means no
 * ceiling — either the setting is 0, or it is missing.
 */
function featuredCapFor(day) {
  if (day && day.daily_cap != null) return day.daily_cap;
  const global = settings.getInt('featured_daily_cap', 0);
  return global > 0 ? global : null;
}

function activeWeek() {
  return db.prepare(`SELECT * FROM weeks WHERE status='published'
                     ORDER BY published_at DESC, id DESC LIMIT 1`).get();
}

function weekBySlug(slug) {
  return db.prepare('SELECT * FROM weeks WHERE slug = ?').get(slug);
}

function serviceDaysOf(weekId) {
  return db.prepare('SELECT * FROM service_days WHERE week_id = ? ORDER BY service_date')
    .all(weekId);
}

function weekItemsOf(weekId) {
  const rows = db.prepare('SELECT * FROM week_items WHERE week_id = ?').all(weekId);
  return {
    soup: rows.find((r) => r.kind === 'soup') || null,
    salad: rows.find((r) => r.kind === 'salad') || null,
  };
}

function standingItems({ activeOnly = true } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM standing_items WHERE active = 1 ORDER BY sort, id'
    : 'SELECT * FROM standing_items ORDER BY sort, id';
  return db.prepare(sql).all();
}

/** Does a standing item run on this weekday? */
function standingRunsOn(item, weekday) {
  if (item.availability === 'every_service_day') return true;
  try { return JSON.parse(item.weekdays || '[]').includes(weekday); }
  catch { return false; }
}

/** Does the week's soup/salad run on this weekday? */
function weekItemRunsOn(item, weekday) {
  if (!item || !item.name.trim()) return false;
  try { return JSON.parse(item.weekdays || '[]').includes(weekday); }
  catch { return false; }
}

/** Effective pickup window for a day — per-day override, else the global one. */
function pickupWindowFor(day) {
  return {
    start: day && day.pickup_start ? day.pickup_start : settings.get('pickup_start', '16:00'),
    end: day && day.pickup_end ? day.pickup_end : settings.get('pickup_end', '19:00'),
  };
}

function deliveryOnFor(day) {
  if (day && day.delivery_on !== null && day.delivery_on !== undefined) return !!day.delivery_on;
  return settings.getInt('delivery_enabled', 1) === 1;
}

/**
 * The full menu for one service day, all three levels merged.
 * Items failing their allergen review are omitted — the gate is enforced here,
 * not only at publish time, so a later edit cannot leak an unreviewed item
 * onto a live menu.
 */
function menuForDay(week, day) {
  const weekday = T.weekdayOf(day.service_date);
  const { soup, salad } = weekItemsOf(week.id);

  const featured = reviewState(day).ok && day.dish_name.trim()
    ? toRenderItem(day, {
        level: 'Featured', refTable: 'service_days',
        subcategory: 'Featured', name: day.dish_name,
        serviceDate: day.service_date,
      })
    : null;

  // The day ceiling, and the featured variants clamped to whatever is left of
  // it. Clamping here means the menu, the quantity steppers' maximums and the
  // sold-out chips all honour the ceiling without each having to know about
  // it. It is not sufficient on its own — two sizes can each fit under the
  // remainder while their sum exceeds it — so orders.js also checks the total.
  const capLimit = featured ? featuredCapFor(day) : null;
  const capSold = capLimit == null ? 0 : soldOnAll('service_days', day.id, day.service_date);
  const capLeft = capLimit == null ? null : Math.max(0, capLimit - capSold);

  if (featured && capLeft !== null) {
    for (const v of featured.variants) {
      v.remaining = v.remaining === null ? capLeft : Math.min(v.remaining, capLeft);
      v.soldOut = v.remaining === 0;
    }
  }

  const others = [];

  if (weekItemRunsOn(soup, weekday) && reviewState(soup).ok) {
    others.push(toRenderItem(soup, {
      level: 'Soup of the week', refTable: 'week_items',
      subcategory: 'Soups', name: soup.name, serviceDate: day.service_date,
    }));
  }
  if (weekItemRunsOn(salad, weekday) && reviewState(salad).ok) {
    others.push(toRenderItem(salad, {
      level: 'Salad of the week', refTable: 'week_items',
      subcategory: 'Salads', name: salad.name, serviceDate: day.service_date,
    }));
  }
  for (const s of standingItems()) {
    if (!standingRunsOn(s, weekday)) continue;
    if (!reviewState(s).ok) continue;
    others.push(toRenderItem(s, {
      level: 'Other Options', refTable: 'standing_items',
      subcategory: s.subcategory || 'Mains', name: s.name,
      serviceDate: day.service_date,
    }));
  }

  // Group for display. Items simply absent when they don't run today — no
  // greyed-out "not available Monday" placeholders.
  const grouped = SUBCATEGORY_ORDER
    .map((sub) => ({ subcategory: sub, items: others.filter((i) => i.subcategory === sub) }))
    .filter((g) => g.items.length);

  const state = T.dayState(
    day.service_date,
    settings.getInt('cutoff_hour', 22),
    settings.getInt('cutoff_minute', 0),
    settings.get('timezone', 'America/Toronto')
  );

  return {
    day,
    featured,
    grouped,
    allItems: featured ? [featured, ...others] : others,
    featuredCap: capLimit == null ? null : { cap: capLimit, sold: capSold, remaining: capLeft },
    window: pickupWindowFor(day),
    deliveryOn: deliveryOnFor(day),
    ...state,
  };
}

/** Find one render item by its key, for order validation. */
function findItem(menu, key) {
  return menu.allItems.find((i) => i.key === key) || null;
}

/** Summary line the dashboard shows on each service day card. */
function alsoAvailableLine(week, day) {
  const menu = menuForDay(week, day);
  const names = menu.grouped.flatMap((g) => g.items.map((i) => i.name));
  return names.length ? names.join(', ') : 'Nothing else runs on this day yet';
}

function activeLocations() {
  return db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY sort, id').all();
}

module.exports = {
  SUBCATEGORY_ORDER, activeWeek, weekBySlug, serviceDaysOf, weekItemsOf,
  standingItems, standingRunsOn, weekItemRunsOn, pickupWindowFor,
  deliveryOnFor, menuForDay, findItem, alsoAvailableLine, activeLocations,
  soldOn, soldOnAll, featuredCapFor, toRenderItem,
};
