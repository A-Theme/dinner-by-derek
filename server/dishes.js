'use strict';
const { db } = require('./db');

/**
 * The saved-dish list: a featured dish kept so it can be cooked again.
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

const FIELDS = [
  'name', 'description', 'photo', 'halal', 'allergens', 'dismissed',
  'full_on', 'full_label', 'full_price', 'full_cap',
  'single_on', 'single_label', 'single_price', 'single_cap',
];

function all() {
  return db.prepare('SELECT * FROM saved_dishes ORDER BY name COLLATE NOCASE').all();
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

  const existing = db.prepare(
    'SELECT id FROM saved_dishes WHERE name = ? COLLATE NOCASE').get(name);

  const row = {
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

/** Every featured dish on a week, kept. Used when a week goes live. */
function saveFromWeek(weekId) {
  const days = db.prepare(
    `SELECT * FROM service_days WHERE week_id = ? AND closed = 0 AND TRIM(dish_name) != ''`)
    .all(Number(weekId));
  let n = 0;
  for (const d of days) {
    if (save({ ...d, name: d.dish_name })) n++;
  }
  return n;
}

module.exports = { all, byId, count, save, remove, applyToDay, saveFromWeek, asDayColumns };
