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

/**
 * Lower case, and one kind of apostrophe.
 *
 * A word processor, a phone keyboard and Facebook all produce the curly one;
 * the dictionary is typed into a form and carries the straight one. They are
 * the same character to a cook and different characters to a regular
 * expression, so "brewer's yeast" pasted out of a post raised no gluten at all
 * while the same words typed by hand raised it. Applied to both sides, so it
 * does not matter which of them has which.
 */
function flatten(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[‘’ʼ]/g, '\'');
}

/**
 * Every written form of one dictionary term, as regex alternatives.
 *
 * A phrase is matched literally — inflecting one is guesswork, and "half and
 * half" has no plural worth guessing at.
 *
 * A single word carries the endings menu writing actually uses. The suffixes
 * are the cheap half: butter/butters/buttered/buttering all hang off the term
 * unchanged. The -y words are the half that needs its own form, because
 * "gravy" to "gravies" is a change to the stem rather than something added to
 * the end of it, and a suffix group can never reach it — which is why a menu
 * "finished with two gravies" raised no wheat and no gluten.
 *
 * Only a consonant before the y. "soy" must not become "soies", and it is the
 * vowel that tells them apart.
 */
function formsOf(t) {
  if (t.includes(' ')) return [escapeRe(t)];
  /* -ing earns its place the same way -ed did: "breaded" raised wheat and
     gluten and "breading" raised nothing, for the same chicken. It costs a few
     false suggestions — a rolling boil now offers wheat off "roll" — and that
     is the trade this file has always made on purpose: a wrong suggestion is
     one tap to dismiss, a missing one reaches a customer with an allergy. */
  const forms = [`${escapeRe(t)}(?:e?s|ed|d|ing)?`];
  if (/[^aeiou]y$/.test(t)) forms.push(`${escapeRe(t.slice(0, -1))}ies`);
  return forms;
}

/** All dictionary rows, grouped term -> [allergen]. */
function dictionary() {
  return db.prepare('SELECT term, allergen FROM allergen_terms ORDER BY term').all();
}

/**
 * The dictionary as compiled expressions, built once and kept until something
 * is written.
 *
 * detect() used to read all 479 rows and build 479 RegExp objects on every
 * call, and it is called far more often than that sounds. reviewState() goes
 * through here for every item on a menu, and menuForDay() builds a menu per
 * day — so one customer week page was ninety-odd of these, about 43,000
 * expressions compiled to answer a question whose answer had not changed.
 * Measured on the published week page: 55ms a request, nearly all of it here.
 *
 * The stamp is sqlite's own total_changes(), which counts every row this
 * connection has inserted, updated or deleted since it opened. That is a
 * deliberately blunt instrument — an order being placed drops the cache along
 * with a dictionary edit — and blunt is the point: it cannot go stale, because
 * there is no write anywhere in the app that it fails to notice. A cache the
 * next route has to remember to clear is a cache that eventually serves a
 * dismissed allergen back to somebody, and this is not the module to be clever
 * in. It costs 0.27µs to read, against 740µs to rebuild.
 *
 * Rebuilding on an unrelated write is free in the case that matters: rendering
 * a menu writes nothing, so a page that reads the dictionary ninety times
 * compiles it once.
 */
const changeCount = db.prepare('SELECT total_changes() AS n').pluck();
let compiled = null;
let compiledAt = -1;

function compiledDictionary() {
  const stamp = changeCount.get();
  if (compiled && compiledAt === stamp) return compiled;
  compiled = dictionary().map(({ term, allergen }) => {
    const t = flatten(term).trim();
    if (!t) return null;
    // Word-boundary match around every written form of the term — see formsOf.
    // "Buttered mash" has to match "butter" and "creamed corn" has to match
    // "cream", or the dish that most needs a milk tag is the one that silently
    // gets none.
    return {
      term,
      allergen,
      re: new RegExp(`(?:^|[^a-z0-9])(?:${formsOf(t).join('|')})(?:$|[^a-z0-9])`, 'i'),
    };
  }).filter(Boolean);
  compiledAt = stamp;
  return compiled;
}

/**
 * The text an item is reviewed against: its name and its description together.
 *
 * The name is not decoration — it is where the allergen usually is. "Beer-
 * Battered Haddock", described as "hand-cut chips and mushy peas", contains
 * fish and gluten in the title and nothing detectable in the body. Reading the
 * description alone found nothing, the owner ticked the box in good faith, and
 * a fish dish reached the menu with no fish tag. The dictionary knew both words
 * perfectly well; it was never shown them.
 *
 * Level 1 stores the name as `dish_name` and levels 2 and 3 as `name`, so both
 * are accepted here rather than making three callers remember which is which.
 */
function reviewedText(item) {
  const name = item.name != null ? item.name : item.dish_name;
  return `${String(name || '').trim()}\n${String(item.description || '').trim()}`;
}

/**
 * Detect allergens in free text — a name and description together, in practice.
 * Returns [{ allergen, terms: [matched words] }] ordered by the Health Canada list.
 */
function detect(description) {
  const text = flatten(description);
  if (!text.trim()) return [];

  const hits = new Map(); // allergen -> Set(term)
  for (const { term, allergen, re } of compiledDictionary()) {
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
 * What has already been decided about an item, as a set.
 *
 * Both arrive as lists everywhere the app writes them — JSON out of the
 * dashboard's hidden inputs, a parsed column out of storage — and `new Set(5)`
 * throws, so `new Set(accepted || [])` was a TypeError for anything that was
 * not one. /admin/api/suggest returned a 500 for `{"accepted": 5}`, and these
 * same two lines are what reviewState() runs on every item of every menu, so a
 * row holding valid JSON that is not a list would have been a 500 on the whole
 * customer menu from a value no screen could explain.
 *
 * Anything that is not a list is read as nothing decided, which leaves every
 * suggestion showing as pending. That is the direction this module errs in
 * everywhere else: one suggestion too many is one tap to dismiss, and one
 * missed reaches somebody with an allergy.
 */
const decided = (v) => new Set(Array.isArray(v) ? v : []);

/**
 * Split detection into pending suggestions vs already-decided.
 * `text` is the reviewed text — name and description — not the description
 * alone. `accepted` and `dismissed` are the item's stored arrays.
 */
function pendingFor(text, accepted, dismissed) {
  const acc = decided(accepted);
  const dis = decided(dismissed);
  return detect(text)
    .filter((d) => !acc.has(d.allergen) && !dis.has(d.allergen));
}

/**
 * THE PUBLISH GATE.
 *
 * An item may go live only when:
 *   1. the owner has ticked the acknowledgement, AND
 *   2. neither the name nor the description has changed since that tick, AND
 *   3. no suggestion is still sitting undecided.
 *
 * An empty detection result does NOT satisfy this. A dish whose description
 * trips no dictionary term still requires the acknowledgement — absence of a
 * match is absence of information, never a clean bill of health.
 *
 * Rule 2 covers the name as well as the description because rule 3 now reads
 * both. Renaming "Chicken Pie" to "Salmon Pie" changes what the dictionary
 * finds, so it has to put the review back on the owner's desk exactly as an
 * edit to the description does.
 */
function reviewState(item) {
  const accepted = JSON.parse(item.allergens || '[]');
  const dismissed = JSON.parse(item.dismissed || '[]');
  const text = reviewedText(item);
  const pending = pendingFor(text, accepted, dismissed);

  if (!item.ack) {
    return { ok: false, reason: 'not_acknowledged', pending };
  }
  if ((item.ack_of || '') !== text) {
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
      return `${itemLabel} was edited after its allergen review. Open it, check the tags still match the name and description, and tick the review box again.`;
    case 'pending_suggestions':
      return `${itemLabel} has suggested allergens waiting on you: ${state.pending.map((p) => p.allergen).join(', ')}. Accept or dismiss each one.`;
    default:
      return '';
  }
}

module.exports = {
  detect, pendingFor, reviewState, reviewMessage, dictionary, reviewedText,
  HEALTH_CANADA_ORDER,
};
