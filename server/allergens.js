'use strict';
const { db } = require('./db');

/**
 * SUGGESTION ONLY. This module can never put a tag on a customer-facing item.
 * It returns candidate allergens for a description; the dashboard shows them
 * as pending chips; the owner accepts or dismisses each one; and nothing goes
 * live until the owner also ticks the acknowledgement checkbox.
 *
 * Deterministic, offline, inspectable: plain word-boundary matching against a
 * dictionary held in SQLite. No model, no network call, no scoring, no
 * heuristics that could change between runs. The same description always
 * yields the same suggestions, and the owner can read the dictionary that
 * produced them.
 */

const HEALTH_CANADA_ORDER = [
  'peanuts', 'tree nuts', 'sesame seeds', 'milk', 'eggs', 'fish',
  'crustaceans and molluscs', 'soy', 'wheat and triticale', 'mustard',
  'sulphites', 'gluten',
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All dictionary rows, grouped term -> [allergen]. */
function dictionary() {
  return db.prepare('SELECT term, allergen FROM allergen_terms ORDER BY term').all();
}

/**
 * Detect allergens in a free-text description.
 * Returns [{ allergen, terms: [matched words] }] ordered by the Health Canada list.
 */
function detect(description) {
  const text = String(description || '').toLowerCase();
  if (!text.trim()) return [];

  const hits = new Map(); // allergen -> Set(term)
  for (const { term, allergen } of dictionary()) {
    const t = term.toLowerCase().trim();
    if (!t) continue;
    // Word-boundary match, tolerating the inflections menu writing actually
    // uses: a trailing plural, and the past participle. "Buttered mash" has to
    // match "butter" and "creamed corn" has to match "cream", or the dish that
    // most needs a milk tag is the one that silently gets none. Multi-word
    // terms are matched literally, since inflecting a phrase is guesswork.
    //
    // The trade is deliberate. A false suggestion costs the owner one tap to
    // dismiss; a missed one reaches a customer with an allergy.
    const inflect = t.includes(' ') ? '' : '(?:e?s|ed|d)?';
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(t)}${inflect}(?:$|[^a-z0-9])`, 'i');
    if (re.test(text)) {
      if (!hits.has(allergen)) hits.set(allergen, new Set());
      hits.get(allergen).add(term);
    }
  }

  const order = (a) => {
    const i = HEALTH_CANADA_ORDER.indexOf(a);
    return i === -1 ? 999 : i;
  };
  return [...hits.entries()]
    .map(([allergen, terms]) => ({ allergen, terms: [...terms].sort() }))
    .sort((a, b) => order(a.allergen) - order(b.allergen));
}

/**
 * Split detection into pending suggestions vs already-decided.
 * `accepted` and `dismissed` are the item's stored arrays.
 */
function pendingFor(description, accepted, dismissed) {
  const acc = new Set(accepted || []);
  const dis = new Set(dismissed || []);
  return detect(description)
    .filter((d) => !acc.has(d.allergen) && !dis.has(d.allergen));
}

/**
 * THE PUBLISH GATE.
 *
 * An item may go live only when:
 *   1. the owner has ticked the acknowledgement, AND
 *   2. the description has not changed since that tick, AND
 *   3. no suggestion is still sitting undecided.
 *
 * An empty detection result does NOT satisfy this. A dish whose description
 * trips no dictionary term still requires the acknowledgement — absence of a
 * match is absence of information, never a clean bill of health.
 */
function reviewState(item) {
  const accepted = JSON.parse(item.allergens || '[]');
  const dismissed = JSON.parse(item.dismissed || '[]');
  const pending = pendingFor(item.description, accepted, dismissed);

  if (!item.ack) {
    return { ok: false, reason: 'not_acknowledged', pending };
  }
  if ((item.ack_of || '') !== (item.description || '')) {
    return { ok: false, reason: 'description_changed', pending };
  }
  if (pending.length) {
    return { ok: false, reason: 'pending_suggestions', pending };
  }
  return { ok: true, reason: null, pending: [] };
}

/** Plain-language sentence for the owner. Never a status code or field name. */
function reviewMessage(itemLabel, state) {
  switch (state.reason) {
    case 'not_acknowledged':
      return `${itemLabel} still needs its allergen review. Open it and tick "I have reviewed the allergen information for this dish."`;
    case 'description_changed':
      return `${itemLabel} was edited after its allergen review. Open it, check the tags still match the new description, and tick the review box again.`;
    case 'pending_suggestions':
      return `${itemLabel} has suggested allergens waiting on you: ${state.pending.map((p) => p.allergen).join(', ')}. Accept or dismiss each one.`;
    default:
      return '';
  }
}

module.exports = {
  detect, pendingFor, reviewState, reviewMessage, dictionary,
  HEALTH_CANADA_ORDER,
};
