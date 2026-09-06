'use strict';
const { db } = require('./db');

/**
 * The saved list: anything cooked once and worth cooking again.
 *
 * Four kinds live here, told apart by `kind`: the featured dish of a day
 * ('main'), and the three week items — 'soup', 'salad' and 'dessert'. They
 * share a table because they are the same idea wearing different hats, and
 * they are kept apart by the unique index on (kind, name) so a soup and a main
 * may answer to the same words without colliding.
 *
 * THE ACKNOWLEDGEMENT NEVER TRAVELS. Everything else does — description,
 * prices, photo, and the allergen answers already given — but the review box
 * comes back unticked every time, and the day it lands on cannot publish
 * until the owner ticks it again.
 *
 * That is not caution for its own sake. The acknowledgement means "I have
 * checked this dish, as it is written, for the menu it is going on". Copying
 * it forward would make it mean "somebody checked something like this once",
 * which is the sentence that puts an untagged allergen in front of a customer.
 * The accepted and dismissed suggestions do travel, so the review is one tap
 * rather than a re-answering of every chip.
 */

/** 'main' goes on a day; the rest go on the week. */
const KINDS = ['main', 'soup', 'salad', 'dessert'];
const WEEK_KINDS = new Set(['soup', 'salad', 'dessert']);

/**
 * The level-2 slots on a week, and which saved kind fills each.
 *
 * Three of them are named after the kind that fills them and the fourth is
 * not: the meatless slot takes a main, because that is what it is. There is no
 * "meatless" kind on the saved list and there should not be — the same aloo
 * gobi is a main whether it ran on a Monday under its own heading or not, and
 * splitting the catalogue in two would file it twice and let the price drift
 * apart between the copies.
 */
const WEEK_SLOTS = { soup: 'soup', salad: 'salad', dessert: 'dessert', meatless: 'main' };

/** The days a slot starts on when the week has not said otherwise. */
const SLOT_DEFAULT_WEEKDAYS = {
  soup: '["tue","wed","thu"]',
  salad: '["tue","wed","thu"]',
  dessert: '["tue","wed","thu"]',
  meatless: '["mon"]',
};
const KIND_LABELS = { main: 'Mains', soup: 'Soups', salad: 'Salads', dessert: 'Desserts' };

const FIELDS = [
  'kind', 'name', 'description', 'photo', 'halal', 'allergens', 'dismissed',
  'full_on', 'full_label', 'full_price', 'full_cap',
  'single_on', 'single_label', 'single_price', 'single_cap',
];

/**
 * The orders the list can be read in. A whitelist, not a string the caller
 * hands over — this ends up inside the SQL, so nothing typed into a query
 * string is ever allowed to reach it.
 *
 * Every one falls back to the name, so dishes that tie on a count or share a
 * timestamp still come out in a stable, findable order rather than shuffling
 * between page loads.
 */
const SORTS = {
  name: 'name COLLATE NOCASE',
  used: 'used_count DESC, name COLLATE NOCASE',
  recent: 'saved_at DESC, name COLLATE NOCASE',
  price: 'COALESCE(full_price, single_price) DESC, name COLLATE NOCASE',
};

const SORT_LABELS = {
  name: 'A to Z',
  used: 'Cooked most often',
  recent: 'Most recently saved',
  price: 'Dearest first',
};

/**
 * Alphabetical unless asked otherwise; an unknown sort is not an error, and
 * an unknown kind returns everything rather than nothing — a bad query string
 * should show the list, not an empty page.
 */
function all({ sort, kind } = {}) {
  /* This one ends up inside the SQL text rather than bound to a parameter, so
   * the lookup is the whole of the guard. `SORTS[sort]` answered for inherited
   * names — ?sort=constructor produced the Object function and an ORDER BY
   * clause reading "function Object() { [native code] }", which is a syntax
   * error and a 500. Nothing an attacker writes could reach the statement, but
   * a guard that says yes to a word it has never heard of is the wrong guard
   * to have in front of interpolated SQL. */
  const order = Object.prototype.hasOwnProperty.call(SORTS, sort) ? SORTS[sort] : SORTS.name;
  if (KINDS.includes(kind)) {
    return db.prepare(`SELECT * FROM saved_dishes WHERE kind = ? ORDER BY ${order}`).all(kind);
  }
  return db.prepare(`SELECT * FROM saved_dishes ORDER BY ${order}`).all();
}

/** How many of each kind are on the list, for the filter's counts. */
function countsByKind() {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const r of db.prepare('SELECT kind, COUNT(*) n FROM saved_dishes GROUP BY kind').all()) {
    out[r.kind] = r.n;
  }
  return out;
}

function byId(id) {
  return db.prepare('SELECT * FROM saved_dishes WHERE id = ?').get(Number(id)) || null;
}

function count() {
  return db.prepare('SELECT COUNT(*) n FROM saved_dishes').get().n;
}

/**
 * Keep a dish, or refresh the one already kept under that name.
 *
 * Matching on the name rather than on the whole wording is what stops the
 * list filling up. Publishing the same dish every fortnight with the
 * description tightened each time should leave one entry holding the latest
 * wording, not eight entries holding the history of it.
 *
 * Returns 'saved' or 'updated', so the caller can say which happened, or null
 * for a dish with no name — there is nothing to file that under.
 */
function save(item) {
  const name = String(item.name || item.dish_name || '').trim();
  if (!name) return null;
  const kind = KINDS.includes(item.kind) ? item.kind : 'main';

  const existing = db.prepare(
    'SELECT id FROM saved_dishes WHERE kind = ? AND name = ? COLLATE NOCASE').get(kind, name);

  const row = {
    kind,
    name,
    description: String(item.description || '').trim(),
    photo: item.photo || null,
    halal: item.halal ? 1 : 0,
    allergens: item.allergens || '[]',
    dismissed: item.dismissed || '[]',
    full_on: item.full_on ? 1 : 0,
    full_label: item.full_label || 'Full size',
    full_price: item.full_price == null ? null : item.full_price,
    full_cap: item.full_cap == null ? null : item.full_cap,
    single_on: item.single_on ? 1 : 0,
    single_label: item.single_label || 'Meal for one',
    single_price: item.single_price == null ? null : item.single_price,
    single_cap: item.single_cap == null ? null : item.single_cap,
  };

  if (existing) {
    db.prepare(`UPDATE saved_dishes SET
      ${FIELDS.filter((f) => f !== 'name').map((f) => `${f}=@${f}`).join(', ')},
      saved_at=datetime('now') WHERE id=@id`).run({ ...row, id: existing.id });
    return 'updated';
  }
  db.prepare(`INSERT INTO saved_dishes (${FIELDS.join(',')})
    VALUES (${FIELDS.map((f) => `@${f}`).join(',')})`).run(row);
  return 'saved';
}

function remove(id) {
  return db.prepare('DELETE FROM saved_dishes WHERE id = ?').run(Number(id)).changes > 0;
}

/**
 * The dish as a set of columns to write onto a service day.
 *
 * `ack` and `ack_of` are set to 0 and null explicitly rather than left out.
 * Leaving them out would carry whatever the day already held, and a day that
 * had been reviewed before would silently accept a different dish under the
 * old tick — the precise failure this whole module is arranged to prevent.
 */
function asDayColumns(dish) {
  return {
    dish_name: dish.name,
    description: dish.description,
    photo: dish.photo,
    halal: dish.halal,
    allergens: dish.allergens,
    dismissed: dish.dismissed,
    ack: 0,
    ack_of: null,
    full_on: dish.full_on,
    full_label: dish.full_label,
    full_price: dish.full_price,
    full_cap: dish.full_cap,
    single_on: dish.single_on,
    single_label: dish.single_label,
    single_price: dish.single_price,
    single_cap: dish.single_cap,
  };
}

/** Copy a saved dish onto a service day. The review is not copied with it. */
function applyToDay(dishId, dayId) {
  const dish = byId(dishId);
  if (!dish) return null;
  const cols = asDayColumns(dish);
  const set = Object.keys(cols).map((c) => `${c}=@${c}`).join(', ');
  const changed = db.prepare(`UPDATE service_days SET ${set} WHERE id=@day`)
    .run({ ...cols, day: Number(dayId) }).changes;
  if (!changed) return null;
  db.prepare('UPDATE saved_dishes SET used_count = used_count + 1 WHERE id = ?').run(dish.id);
  return dish;
}

/**
 * The dish as the columns a week item wants.
 *
 * `ack` and `ack_of` are cleared for the same reason they are on a day: the
 * tick says somebody checked this wording for this menu, and a soup arriving
 * from the list has not been checked for the week it is landing on.
 */
function asWeekColumns(dish) {
  return {
    name: dish.name,
    description: dish.description,
    photo: dish.photo,
    halal: dish.halal,
    allergens: dish.allergens,
    dismissed: dish.dismissed,
    ack: 0,
    ack_of: null,
    full_on: dish.full_on,
    full_label: dish.full_label,
    full_price: dish.full_price,
    full_cap: dish.full_cap,
    single_on: dish.single_on,
    single_label: dish.single_label,
    single_price: dish.single_price,
    single_cap: dish.single_cap,
  };
}

/**
 * Copy a saved dish into one of a week's level-2 slots. The review is not
 * copied.
 *
 * `slot` names where it lands and defaults to the dish's own kind, which is
 * the answer for soup, salad and dessert. The meatless slot has to be asked
 * for by name, because the dish filling it is an ordinary main and there is
 * nothing in the row to say Derek meant Monday's vegetarian plate rather than
 * Tuesday's featured dish.
 *
 * The days it runs on are NOT taken from the saved item. If the owner has
 * already said this week's soup runs Tuesday and Wednesday, swapping which
 * soup it is should not quietly put it back to Tuesday/Wednesday/Thursday —
 * the choice of days belongs to the week, not to the recipe.
 */
function applyToWeek(dishId, weekId, slot = null, slotNo = 1) {
  const dish = byId(dishId);
  if (!dish) return null;
  const target = slot || dish.kind;
  if (WEEK_SLOTS[target] !== dish.kind) return null;
  const n = Number(slotNo) === 2 ? 2 : 1;

  const existing = db.prepare(
    'SELECT weekdays FROM week_items WHERE week_id = ? AND kind = ? AND slot = ?')
    .get(Number(weekId), target, n);
  const cols = asWeekColumns(dish);
  const weekdays = existing ? existing.weekdays : SLOT_DEFAULT_WEEKDAYS[target];
  const names = Object.keys(cols);

  db.prepare(`INSERT INTO week_items (week_id, kind, slot, weekdays, ${names.join(', ')})
      VALUES (@week_id, @kind, @slot, @weekdays, ${names.map((x) => '@' + x).join(', ')})
      ON CONFLICT(week_id, kind, slot) DO UPDATE SET
        ${names.map((x) => `${x}=excluded.${x}`).join(', ')}`)
    .run({ ...cols, week_id: Number(weekId), kind: target, slot: n, weekdays });

  db.prepare('UPDATE saved_dishes SET used_count = used_count + 1 WHERE id = ?').run(dish.id);
  return dish;
}

/**
 * Everything a week put in front of customers, kept. Used when a week goes
 * live: the featured dish of each open day, and the week's meatless main,
 * soup, salad and dessert. A menu that has been published is one worth being
 * able to cook again, whichever level the item sat on.
 *
 * The meatless row files itself as a main, because `save` keeps only the four
 * kinds the catalogue has and falls back to 'main' for anything else. That is
 * the wanted answer rather than a lucky one: the slot is a billing decision
 * about one week, and the dish outlives it.
 */
function saveFromWeek(weekId) {
  const days = db.prepare(
    `SELECT * FROM service_days WHERE week_id = ? AND closed = 0 AND TRIM(dish_name) != ''`)
    .all(Number(weekId));
  let n = 0;
  for (const d of days) {
    if (save({ ...d, kind: 'main', name: d.dish_name })) n++;
  }
  const items = db.prepare(
    `SELECT * FROM week_items WHERE week_id = ? AND TRIM(name) != ''`).all(Number(weekId));
  for (const it of items) {
    if (save(it)) n++;
  }
  return n;
}

module.exports = {
  all, byId, count, countsByKind, save, remove,
  applyToDay, applyToWeek, saveFromWeek, asDayColumns, asWeekColumns,
  KINDS, WEEK_KINDS, WEEK_SLOTS, SLOT_DEFAULT_WEEKDAYS, KIND_LABELS, SORTS, SORT_LABELS,
};
