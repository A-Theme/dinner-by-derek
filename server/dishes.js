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
  const order = SORTS[sort] || SORTS.name;
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
 * Copy a saved soup, salad or dessert onto a week. The review is not copied.
 *
 * The days it runs on are NOT taken from the saved item. If the owner has
 * already said this week's soup runs Tuesday and Wednesday, swapping which
 * soup it is should not quietly put it back to Tuesday/Wednesday/Thursday —
 * the choice of days belongs to the week, not to the recipe.
 */
function applyToWeek(dishId, weekId) {
  const dish = byId(dishId);
  if (!dish || !WEEK_KINDS.has(dish.kind)) return null;

  const existing = db.prepare('SELECT weekdays FROM week_items WHERE week_id = ? AND kind = ?')
    .get(Number(weekId), dish.kind);
  const cols = asWeekColumns(dish);
  const weekdays = existing ? existing.weekdays : '["tue","wed","thu"]';
  const names = Object.keys(cols);

  db.prepare(`INSERT INTO week_items (week_id, kind, weekdays, ${names.join(', ')})
      VALUES (@week_id, @kind, @weekdays, ${names.map((n) => '@' + n).join(', ')})
      ON CONFLICT(week_id, kind) DO UPDATE SET
        ${names.map((n) => `${n}=excluded.${n}`).join(', ')}`)
    .run({ ...cols, week_id: Number(weekId), kind: dish.kind, weekdays });

  db.prepare('UPDATE saved_dishes SET used_count = used_count + 1 WHERE id = ?').run(dish.id);
  return dish;
}

/**
 * Everything a week put in front of customers, kept. Used when a week goes
 * live: the featured dish of each open day, and the week's soup, salad and
 * dessert. A menu that has been published is one worth being able to cook
 * again, whichever level the item sat on.
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
  KINDS, WEEK_KINDS, KIND_LABELS, SORTS, SORT_LABELS,
};
