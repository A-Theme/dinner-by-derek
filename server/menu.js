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

/* Soup, salad and dessert change every week; the mains under Other Options do
   not. So the three that change come first, together, where a returning
   customer scrolling a familiar list will actually see what is new this week.
   Desserts used to sit last, where a menu puts them -- which is the right
   place on a menu you read once and the wrong one on a list most people have
   already read. */
const SUBCATEGORY_ORDER = ['Soups', 'Salads', 'Desserts', 'Mains'];

/* What each section is called on screen, which is not the same as what it is
   called in storage. 'Mains' is the value sitting in standing_items.subcategory
   on every row, in the column's DEFAULT, and in the seed data; renaming the
   value would be a migration against a live database, to change a word. So the
   key stays and the label moves.

   "Everyday Items" is also the truer name: these are the things available every
   service day, which is exactly what distinguishes them from the soup, salad
   and dessert above that change every week. */
const SUBCATEGORY_LABELS = { Mains: 'Everyday Items' };
const subcategoryLabel = (s) => SUBCATEGORY_LABELS[s] || s;

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
 * A headline dish's ceiling for one day, counted across both sizes.
 * The day's own number wins; otherwise the global setting. Null means no
 * ceiling — either the setting is 0, or it is missing.
 *
 * Monday has two headline dishes, and each is measured against this number on
 * its own rather than sharing one pot: the ceiling says how many of a dish the
 * kitchen will make, and the meatless dish is cooked beside the featured one,
 * not instead of it. Twenty-five of each, not twenty-five between them.
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

/**
 * The days that belong to a week — meaning the ones inside its own seven dates.
 *
 * Moving "Week starts" re-labels the boxes and deliberately never touches a day
 * already filled in, which is right: it stops a date change quietly discarding
 * a dish. What it leaves behind is a day still attached to the week by week_id
 * while sitting outside the dates that week covers. A week starting Aug 24 was
 * carrying Aug 18, 19 and 20.
 *
 * That is not only untidy. This function feeds the customer week view, so a
 * published week would have offered days from the week before it — three dates
 * already in the past, orderable, with their cutoffs long gone. It also feeds
 * the publish gate, where an unreviewed straggler could block publishing from a
 * row no screen would show you.
 *
 * Nothing is deleted. The rows stay, and Menu history is where they can still
 * be read; they simply stop being part of a week they are not in.
 *
 * A week with no week_start is not filtered — those predate the column, and the
 * dashboard backfills one the first time such a week is opened.
 */
/* Written once, because two questions ask it and they must not be able to
   disagree: "which days does this week have" and "does this week have this day".
   The second used to be asked with a plain week_id-and-date lookup that knew
   nothing about the range, so it answered yes where the first said no — and a
   date absent from the week page, absent from Menu history's idea of the week,
   and never checked by the publish gate was still reachable by URL and still
   took confirmed orders. */
const IN_WEEK_RANGE = `(w.week_start IS NULL
       OR (sd.service_date >= w.week_start
           AND sd.service_date < date(w.week_start, '+7 days')))`;

function serviceDaysOf(weekId) {
  return db.prepare(`
    SELECT sd.* FROM service_days sd
    JOIN weeks w ON w.id = sd.week_id
    WHERE sd.week_id = ? AND ${IN_WEEK_RANGE}
    ORDER BY sd.service_date`).all(weekId);
}

/**
 * One day of a week, by date — and only if the week actually covers that date.
 *
 * The customer deep link and the order pipeline both start here. Neither has any
 * business seeing a day the week page does not list: a straggler left behind by
 * a change to "Week starts" is not part of this menu, and the two places that
 * used to look it up directly are the two places where saying otherwise costs
 * something. Returns undefined for a date outside the range, which is the same
 * answer they already handle for a date with no row at all.
 */
function serviceDayOn(weekId, serviceDate) {
  return db.prepare(`
    SELECT sd.* FROM service_days sd
    JOIN weeks w ON w.id = sd.week_id
    WHERE sd.week_id = ? AND sd.service_date = ? AND ${IN_WEEK_RANGE}`)
    .get(weekId, serviceDate);
}

/**
 * Every row attached to the week, in range or not.
 *
 * Two callers need this and both would break on the filtered list. The date
 * grid checks what already exists before inserting, and UNIQUE(week_id,
 * service_date) means a day it could not see is a constraint error rather than
 * a no-op — move the week start back onto a straggler and the save would 500.
 * Menu history needs it because showing the stragglers is the point.
 */
function everyServiceDayOf(weekId) {
  return db.prepare('SELECT * FROM service_days WHERE week_id = ? ORDER BY service_date')
    .all(weekId);
}

/**
 * How many of each level-2 item a week can hold.
 *
 * Two soups and two salads, because that is what Derek offers: the posts have
 * read "tomato and dill or sweet corn chowder" for three years and the second
 * one used to be dropped on the way in. One dessert and one meatless main.
 *
 * The count lives here rather than in the schema. Storage enforces that a
 * (kind, slot) pair is filled at most once — which is a fact about rows — and
 * this is the menu's rule about how many of them there are, which is the kind
 * of thing that changes when Derek changes what he cooks.
 */
const WEEK_SLOT_COUNTS = { meatless: 1, soup: 2, salad: 2, dessert: 1 };

/** The slot numbers a kind has, [1] or [1, 2]. */
const slotsOf = (kind) => Array.from(
  { length: WEEK_SLOT_COUNTS[kind] || 1 }, (_, i) => i + 1,
);

/**
 * The week's level-2 items.
 *
 * `soups` and `salads` are arrays in slot order and may be empty; `dessert` and
 * `meatless` are the single item or null. The plurals are named that way on
 * purpose — when the second soup was added, a caller left reading `.soup` would
 * have gone on working and quietly ignored it, and one of those callers is the
 * publish gate. `undefined` breaks loudly instead.
 */
function weekItemsOf(weekId) {
  const rows = db.prepare('SELECT * FROM week_items WHERE week_id = ? ORDER BY kind, slot')
    .all(weekId);
  const listOf = (kind) => rows
    .filter((r) => r.kind === kind)
    .sort((a, b) => (a.slot || 1) - (b.slot || 1));
  return {
    soups: listOf('soup'),
    salads: listOf('salad'),
    dessert: listOf('dessert')[0] || null,
    meatless: listOf('meatless')[0] || null,
  };
}

/**
 * What the meatless dish is called where a customer reads it.
 *
 * "Meatless Monday" is the name the thing has had for years of posts, and it
 * is the name on the day it runs. It defaults to Monday and almost always
 * stays there — but the weekdays are a row of checkboxes like every other
 * level-2 item, and a Meatless Monday sitting on a Wednesday page is a small
 * lie told confidently. On any other day it is simply "Meatless".
 */
function meatlessLabel(weekday) {
  return weekday === 'mon' ? 'Meatless Monday' : 'Meatless';
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

/** Does the week's soup, salad or dessert run on this weekday? */
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

/** The clock rules, read once from settings, in the shape dayState wants. */
function clock(now = new Date()) {
  return {
    cutoffHour: settings.getInt('cutoff_hour', 22),
    cutoffMinute: settings.getInt('cutoff_minute', 0),
    lateHour: settings.getInt('late_cutoff_hour', 6),
    lateMinute: settings.getInt('late_cutoff_minute', 0),
    tz: settings.get('timezone', 'America/Toronto'),
    now,
  };
}

/**
 * Is the kitchen shut for this day — either the day itself, or the whole week?
 * The day's own note is preferred over the week's, being the more specific.
 */
function closureFor(week, day) {
  if (day && day.closed) return { closed: true, note: (day.closed_note || week.closed_note || '').trim() };
  if (week && week.closed) return { closed: true, note: (week.closed_note || '').trim() };
  return { closed: false, note: '' };
}

/**
 * The full menu for one service day, all three levels merged.
 * Items failing their allergen review are omitted — the gate is enforced here,
 * not only at publish time, so a later edit cannot leak an unreviewed item
 * onto a live menu.
 *
 * A closed day returns no items at all — not the featured dish, and not the
 * standing Other Options either. Closed means the kitchen is shut, and Chili
 * left orderable on a day nobody is cooking is a customer turning up to a dark
 * house. Everything downstream — the views, the order validation, the day
 * ceiling — reads emptiness from here rather than each checking the flag.
 */
function menuForDay(week, day) {
  const weekday = T.weekdayOf(day.service_date);
  const closure = closureFor(week, day);
  if (closure.closed) {
    return {
      day,
      closed: true,
      closedNote: closure.note,
      featured: null,
      meatless: null,
      grouped: [],
      allItems: [],
      featuredCap: null,
      meatlessCap: null,
      window: pickupWindowFor(day),
      deliveryOn: false,
      ...T.dayState(day.service_date, clock()),
    };
  }
  const { soups, salads, dessert, meatless } = weekItemsOf(week.id);

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

  /* The same clamp serves both headline dishes, so it is written once. */
  const clampToCap = (item, left) => {
    if (!item || left === null) return;
    for (const v of item.variants) {
      v.remaining = v.remaining === null ? left : Math.min(v.remaining, left);
      v.soldOut = v.remaining === 0;
    }
  };
  clampToCap(featured, capLeft);

  /* The meatless main.
   *
   * Level 2 by storage and a headline by billing, so it is built here beside
   * the featured dish rather than pushed into `others` — nothing downstream
   * should mistake it for a side, least of all the kitchen sheet.
   *
   * A blank name, an unticked Monday or a failed review and it is simply
   * absent. That absence is also how a pause is said: for years the post read
   * "Meatless Monday — will return in September", and the way to say that here
   * is to leave the box empty.
   */
  const meatlessItem = weekItemRunsOn(meatless, weekday) && reviewState(meatless).ok
    ? toRenderItem(meatless, {
        level: meatlessLabel(weekday), refTable: 'week_items',
        subcategory: 'Featured', name: meatless.name,
        serviceDate: day.service_date,
      })
    : null;
  const mCapLimit = meatlessItem ? featuredCapFor(day) : null;
  const mCapSold = mCapLimit == null ? 0 : soldOnAll('week_items', meatless.id, day.service_date);
  const mCapLeft = mCapLimit == null ? null : Math.max(0, mCapLimit - mCapSold);
  clampToCap(meatlessItem, mCapLeft);

  const others = [];

  /* Both soups and both salads, each its own orderable litre, in slot order.
     A week that only has one of either reads exactly as it did before. */
  for (const soup of soups) {
    if (!weekItemRunsOn(soup, weekday) || !reviewState(soup).ok) continue;
    others.push(toRenderItem(soup, {
      level: 'Soup of the week', refTable: 'week_items',
      subcategory: 'Soups', name: soup.name, serviceDate: day.service_date,
    }));
  }
  for (const salad of salads) {
    if (!weekItemRunsOn(salad, weekday) || !reviewState(salad).ok) continue;
    others.push(toRenderItem(salad, {
      level: 'Salad of the week', refTable: 'week_items',
      subcategory: 'Salads', name: salad.name, serviceDate: day.service_date,
    }));
  }
  if (weekItemRunsOn(dessert, weekday) && reviewState(dessert).ok) {
    others.push(toRenderItem(dessert, {
      level: 'Dessert of the week', refTable: 'week_items',
      subcategory: 'Desserts', name: dessert.name, serviceDate: day.service_date,
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
    .map((sub) => ({
      subcategory: sub,                       // the stored value
      label: subcategoryLabel(sub),           // what the customer reads
      items: others.filter((i) => i.subcategory === sub),
    }))
    .filter((g) => g.items.length);

  const state = T.dayState(day.service_date, clock());

  return {
    day,
    closed: false,
    closedNote: '',
    featured,
    meatless: meatlessItem,
    grouped,
    allItems: [featured, meatlessItem].filter(Boolean).concat(others),
    featuredCap: capLimit == null ? null : { cap: capLimit, sold: capSold, remaining: capLeft },
    meatlessCap: mCapLimit == null ? null : { cap: mCapLimit, sold: mCapSold, remaining: mCapLeft },
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
  if (menu.closed) return 'Nothing — the kitchen is closed this day';
  // The meatless dish leads the line and says what it is. It is not in
  // `grouped` — it is a headline, not a side — and a Monday summary that
  // listed only the soup would be the one place the second main went unsaid.
  const names = menu.grouped.flatMap((g) => g.items.map((i) => i.name));
  if (menu.meatless) names.unshift(`${menu.meatless.level}: ${menu.meatless.name}`);
  return names.length ? names.join(', ') : 'Nothing else runs on this day yet';
}

function activeLocations() {
  return db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY sort, id').all();
}

module.exports = {
  SUBCATEGORY_ORDER, subcategoryLabel, activeWeek, weekBySlug, serviceDaysOf, serviceDayOn, weekItemsOf,
  WEEK_SLOT_COUNTS, slotsOf,
  everyServiceDayOf, meatlessLabel,
  standingItems, standingRunsOn, weekItemRunsOn, pickupWindowFor, clock,
  deliveryOnFor, closureFor, menuForDay, findItem, alsoAvailableLine, activeLocations,
  soldOn, soldOnAll, featuredCapFor, toRenderItem,
};
