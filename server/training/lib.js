'use strict';

/**
 * The small pure helpers the training screens need: dates, money, the allergen
 * review gate, a cut-down proofreader, and the form parser.
 *
 * Every one of these has a real counterpart (time.js, html.js, allergens.js,
 * proofread.js, itemform.js) that reaches the database or carries three years
 * of accumulated rules. These are deliberately simpler and deliberately
 * separate — see the note at the top of constants.js.
 */

const C = require('./constants');

/* --- Dates ---------------------------------------------------------------
 * Plain YYYY-MM-DD arithmetic. The real app is careful about timezones because
 * a cutoff landing an hour out is a customer at the wrong door; nothing in a
 * sandbox has a door, so noon UTC is close enough and never drifts a day.
 */
const asDate = (d) => new Date(`${d}T12:00:00Z`);
const ymd = (d) => d.toISOString().slice(0, 10);

function addDays(date, n) {
  const d = asDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

function today() { return ymd(new Date()); }

/** The Monday on or before `date`. */
function mondayOf(date) {
  const dow = asDate(date).getUTCDay();            // 0 Sun … 6 Sat
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

const weekdayKey = (date) => C.WEEKDAYS[asDate(date).getUTCDay()];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function fmtDayLong(date) {
  const d = asDate(date);
  return `${C.WEEKDAY_LABELS[C.WEEKDAYS[d.getUTCDay()]]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtDayShort(date) {
  const d = asDate(date);
  return `${C.WEEKDAY_LABELS[C.WEEKDAYS[d.getUTCDay()]].slice(0, 3)} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

function fmtMonthDay(date) {
  const d = asDate(date);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

function fmtWeekRange(weekStart) {
  const a = asDate(weekStart);
  const b = asDate(addDays(weekStart, 6));
  const month = (d) => MONTHS[d.getUTCMonth()].slice(0, 3);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `Week of ${month(a)} ${a.getUTCDate()}–${b.getUTCDate()}`
    : `Week of ${month(a)} ${a.getUTCDate()} – ${month(b)} ${b.getUTCDate()}`;
}

/** "16:00" and "19:00" become "4–7 PM". */
function fmtWindow(start, end) {
  const clock = (t) => {
    const parts = String(t || '').split(':');
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    if (!Number.isFinite(hh)) return String(t || '');
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const hour = hh % 12 === 0 ? 12 : hh % 12;
    return { text: mm ? `${hour}:${String(mm).padStart(2, '0')}` : String(hour), suffix };
  };
  const a = clock(start);
  const b = clock(end);
  if (typeof a === 'string' || typeof b === 'string') return `${start}–${end}`;
  return a.suffix === b.suffix
    ? `${a.text}–${b.text} ${b.suffix}`
    : `${a.text} ${a.suffix}–${b.text} ${b.suffix}`;
}

/** A clock string, normalised, or null when it is not a time at all.
 *  Loose on the way in and strict on the way out, like the real settings
 *  guard: "9:5" is a time somebody typed, and it is stored as "09:05". */
function clockTime(v) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

const isCalendarDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/* --- Money and form fields ---------------------------------------------- */

const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

/** A price in cents, or null when the box doesn't hold one. Mirrors itemform.cents. */
function cents(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const digits = String(v).replace(/[^0-9.]/g, '');
  if (!/\d/.test(digits)) return null;              // 'free', '$', 'ask' — not a price
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;             // '1.2.3'
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
  if (Array.isArray(v)) return v.map(String);
  try {
    const p = JSON.parse(v || '[]');
    return Array.isArray(p) ? p.map(String) : [];
  } catch (e) { return []; }
}

/* --- The allergen review gate -------------------------------------------
 * The centre of the real app's safety story, reproduced faithfully because a
 * trainee who learns to walk past it has learned the wrong thing. The tick is
 * recorded against the exact text it was given for; editing either the name or
 * the description invalidates it.
 */

const flatten = (s) => String(s == null ? '' : s).toLowerCase()
  .replace(/[‘’ʼ]/g, "'");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function reviewedText(item) {
  const name = item.name != null ? item.name : item.dish_name;
  return `${String(name || '').trim()}\n${String(item.description || '').trim()}`;
}

/** [{ allergen, terms }] in Health Canada order, read off the training dictionary. */
function detect(text, dictionary) {
  const hay = flatten(text);
  if (!hay.trim()) return [];
  const hits = new Map();
  for (const entry of dictionary || []) {
    const t = flatten(entry.term).trim();
    if (!t) continue;
    const re = new RegExp(`(^|[^a-z])${escapeRe(t)}(s|es)?([^a-z]|$)`);
    if (!re.test(hay)) continue;
    if (!hits.has(entry.allergen)) hits.set(entry.allergen, new Set());
    hits.get(entry.allergen).add(entry.term);
  }
  return C.HEALTH_CANADA_ORDER
    .filter((a) => hits.has(a))
    .map((a) => ({ allergen: a, terms: [...hits.get(a)] }));
}

function pendingFor(text, accepted, dismissed, dictionary) {
  const acc = new Set(accepted || []);
  const dis = new Set(dismissed || []);
  return detect(text, dictionary).filter((d) => !acc.has(d.allergen) && !dis.has(d.allergen));
}

/** THE PUBLISH GATE. Three ways to fail it, each with its own sentence below. */
function reviewState(item, dictionary) {
  const accepted = jsonArr(item.allergens);
  const dismissed = jsonArr(item.dismissed);
  const text = reviewedText(item);
  const pending = pendingFor(text, accepted, dismissed, dictionary);

  if (!item.ack) return { ok: false, reason: 'not_acknowledged', pending };
  if ((item.ack_of || '') !== text) return { ok: false, reason: 'description_changed', pending };
  if (pending.length) return { ok: false, reason: 'pending_suggestions', pending };
  return { ok: true, pending: [] };
}

function reviewMessage(itemLabel, state) {
  switch (state.reason) {
    case 'not_acknowledged':
      return `${itemLabel} still needs its allergen review. Open it and tick "I have reviewed the allergen information for this dish."`;
    case 'description_changed':
      return `${itemLabel} was edited after its allergen review. Open it, check the tags still match the name and description, and tick the review box again.`;
    case 'pending_suggestions':
      return `${itemLabel} has suggested allergens waiting on you: ${state.pending.map((p) => p.allergen).join(', ')}. Accept or dismiss each one.`;
    default:
      return `${itemLabel} needs an allergen review.`;
  }
}

/* --- One item, read off a form body -------------------------------------
 * The same shape itemform.parse returns, with the JSON columns left as real
 * arrays: nothing here is going into SQLite, so there is nothing to stringify
 * for.
 */
function parseItem(body, prefix, opts) {
  const withWeekdays = !!(opts && opts.withWeekdays);
  const description = String(body[`${prefix}_description`] || '').trim();
  const name = String(body[`${prefix}_name`] || '').trim();
  const ack = body[`${prefix}_ack`] ? 1 : 0;

  const out = {
    name,
    description,
    photo: String(body[`${prefix}_photo`] || '').trim() || null,
    // Optional. Null means the dish has one picture and both sizes show it.
    single_photo: String(body[`${prefix}_single_photo`] || '').trim() || null,
    halal: body[`${prefix}_halal`] ? 1 : 0,
    allergens: jsonArr(body[`${prefix}_allergens`]),
    dismissed: jsonArr(body[`${prefix}_dismissed`]),
    ack,
    ack_of: ack ? reviewedText({ name, description }) : null,
    full_on: body[`${prefix}_full_on`] ? 1 : 0,
    full_label: String(body[`${prefix}_full_label`] || '').trim() || 'Full size',
    full_price: cents(body[`${prefix}_full_price`]),
    full_cap: intOrNull(body[`${prefix}_full_cap`]),
    single_on: body[`${prefix}_single_on`] ? 1 : 0,
    single_label: String(body[`${prefix}_single_label`] || '').trim() || 'Meal for one',
    single_price: cents(body[`${prefix}_single_price`]),
    single_cap: intOrNull(body[`${prefix}_single_cap`]),
  };
  if (withWeekdays) out.weekdays = arr(body[`${prefix}_weekdays`]).map(String);
  return out;
}

/* --- A very small proofreader -------------------------------------------
 * The real one is three years of rules, tuned against Derek's own writing so
 * it stops arguing with words that were already right. Reproducing it here
 * would be copying 48 KB to teach one gesture — tap a chip, the text changes,
 * nothing is applied until you do.
 *
 * So this is a handful of unambiguous cases, seeded into the fixtures on
 * purpose, and the panel says plainly that it is the short version.
 */
const PROOF_RULES = [
  { kind: 'spelling', find: /\brecieved?\b/gi, to: 'received' },
  { kind: 'spelling', find: /\bseperate(d|ly)?\b/gi, to: 'separate' },
  { kind: 'spelling', find: /\bacommodate\b/gi, to: 'accommodate' },
  { kind: 'spelling', find: /\bvegtables?\b/gi, to: 'vegetables' },
  { kind: 'spelling', find: /\btomatoe\b/gi, to: 'tomato' },
  { kind: 'spelling', find: /\bavailible\b/gi, to: 'available' },
  { kind: 'spacing', find: /[ \t]{2,}/g, to: ' ' },
  { kind: 'spacing', find: /[ \t]+(?=[,.;:!?])/g, to: '' },
  { kind: 'typography', find: /\.\.\./g, to: '…' },
];

function proofread(text) {
  const s = String(text == null ? '' : text).slice(0, 20000);
  const found = [];
  for (const rule of PROOF_RULES) {
    const re = new RegExp(rule.find.source, rule.find.flags);
    let m = re.exec(s);
    while (m !== null) {
      if (m[0] === '') { re.lastIndex += 1; m = re.exec(s); continue; }
      if (m[0] !== rule.to) {
        found.push({
          kind: rule.kind,
          found: m[0],
          suggestion: rule.to,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
      if (found.length >= 25) break;
      m = re.exec(s);
    }
  }
  /* Two rules can flag the same span — "  ," is both a run of spaces and a
     space before a comma. First one to see it wins, or the second's offsets
     are computed against text the first has already rewritten. */
  const out = [];
  for (const f of found.sort((a, b) => a.start - b.start)) {
    if (out.some((g) => f.start < g.end && g.start < f.end)) continue;
    out.push(f);
  }
  return out.slice(0, 12);
}

function proofSummary(findings) {
  if (!findings.length) return 'Nothing to flag.';
  return `${findings.length} thing${findings.length === 1 ? '' : 's'} worth a look.`;
}

module.exports = {
  addDays, today, mondayOf, weekdayKey, ymd,
  fmtDayLong, fmtDayShort, fmtMonthDay, fmtWeekRange, fmtWindow,
  clockTime, isCalendarDate,
  money, cents, intOrNull, arr, jsonArr,
  reviewedText, detect, pendingFor, reviewState, reviewMessage,
  parseItem, proofread, proofSummary,
};
