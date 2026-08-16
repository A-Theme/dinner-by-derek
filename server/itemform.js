'use strict';

/**
 * Reads one item-editor block out of a form body. The same parser serves all
 * three levels, because the editor is the same at all three levels.
 */

function cents(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function intOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function arr(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function jsonArr(v) {
  try {
    const p = JSON.parse(v || '[]');
    return Array.isArray(p) ? p.map(String) : [];
  } catch { return []; }
}

/**
 * The acknowledgement is only recorded together with the description it was
 * given against. That pairing is what lets a later edit invalidate it.
 */
function parse(body, prefix, { withWeekdays = false } = {}) {
  const description = String(body[`${prefix}_description`] || '').trim();
  const ack = body[`${prefix}_ack`] ? 1 : 0;

  const out = {
    name: String(body[`${prefix}_name`] || '').trim(),
    description,
    photo: String(body[`${prefix}_photo`] || '').trim() || null,
    halal: body[`${prefix}_halal`] ? 1 : 0,
    allergens: JSON.stringify(jsonArr(body[`${prefix}_allergens`])),
    dismissed: JSON.stringify(jsonArr(body[`${prefix}_dismissed`])),
    ack,
    ack_of: ack ? description : null,
    full_on: body[`${prefix}_full_on`] ? 1 : 0,
    full_label: String(body[`${prefix}_full_label`] || '').trim() || 'Full size',
    full_price: cents(body[`${prefix}_full_price`]),
    full_cap: intOrNull(body[`${prefix}_full_cap`]),
    single_on: body[`${prefix}_single_on`] ? 1 : 0,
    single_label: String(body[`${prefix}_single_label`] || '').trim() || 'Meal for one',
    single_price: cents(body[`${prefix}_single_price`]),
    single_cap: intOrNull(body[`${prefix}_single_cap`]),
  };
  if (withWeekdays) out.weekdays = JSON.stringify(arr(body[`${prefix}_weekdays`]).map(String));
  return out;
}

module.exports = { parse, cents, intOrNull, arr, jsonArr };
