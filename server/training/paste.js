'use strict';

/**
 * Reading Derek's Facebook post into rows a person can check.
 *
 * A cut-down cousin of server/paste.js. The real one has three years of Derek's
 * punctuation in it — the day he misspells, the two soups on one line, the
 * dollar sign he sometimes leaves off. This one handles the shapes a trainee
 * needs to see: a weekday, a dish, and one or two prices.
 *
 * The split that matters is the same, and it is the whole feature: read() only
 * reads, and nothing is written until somebody has looked at what it found and
 * pressed the button on the preview page.
 */

const C = require('./constants');
const L = require('./lib');

/* Monday, Mon, Monday's — enough to find the day at the start of a line. */
const DAY_WORDS = {
  mon: 'mon', monday: 'mon', tue: 'tue', tues: 'tue', tuesday: 'tue',
  wed: 'wed', weds: 'wed', wednesday: 'wed', thu: 'thu', thur: 'thu',
  thurs: 'thu', thursday: 'thu', fri: 'fri', friday: 'fri',
  sat: 'sat', saturday: 'sat', sun: 'sun', sunday: 'sun',
};

const KIND_WORDS = [
  [/^soups?\s*(of the week)?\s*[:\-–]/i, 'soup'],
  [/^salads?\s*(of the week)?\s*[:\-–]/i, 'salad'],
  [/^desserts?\s*(of the week)?\s*[:\-–]/i, 'dessert'],
  [/^meatless(\s+monday)?\s*[:\-–]/i, 'meatless'],
];

/** Every price on a line, in cents, in the order they appear. */
function pricesIn(text) {
  const out = [];
  const re = /\$?\s*(\d{1,3}(?:\.\d{2})?)\b/g;
  let m = re.exec(text);
  while (m !== null) {
    const cents = L.cents(m[1]);
    /* A bare number under 100 with no dollar sign is as likely to be a
       quantity as a price, so only take those when the line has a $ on it. */
    if (cents != null && (text.includes('$') || cents >= 500)) out.push(cents);
    m = re.exec(text);
  }
  return out;
}

/** Strip the day, the prices and the punctuation, leaving the dish. */
function dishFrom(line) {
  return line
    .replace(/^[^a-z0-9]*/i, '')
    .replace(/^\w+\s*[-–—:]\s*/, '')
    .replace(/\$?\s*\d{1,3}(?:\.\d{2})?/g, '')
    .replace(/\s*\/\s*(meal for one|single|small)?\s*$/i, '')
    .replace(/[\s\-–—:\/]+$/, '')
    .trim();
}

/**
 * Read a post. Returns rows in the order they were found, each already carrying
 * where it would go and whether it is ticked.
 */
function read(text, week) {
  const rows = [];
  const slotUsed = { soup: 0, salad: 0, dessert: 0, meatless: 0 };

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    /* A week-level line: "Soup of the week: Carrot and Coriander $12 / $7" */
    let kind = null;
    for (const [re, k] of KIND_WORDS) {
      if (re.test(line)) { kind = k; break; }
    }
    if (kind) {
      const prices = pricesIn(line);
      const slot = Math.min((slotUsed[kind] += 1), C.WEEK_SLOT_COUNTS[kind] || 1);
      rows.push({
        kind,
        slot,
        wd: '',
        where: `${C.WEEK_ITEM_SLOTS[kind].label} of the week${
          (C.WEEK_SLOT_COUNTS[kind] || 1) > 1 ? ` (${slot})` : ''}`,
        name: dishFrom(line.replace(/^[^:\-–]*[:\-–]\s*/, '')),
        description: '',
        full_price: prices[0] != null ? prices[0] : null,
        single_price: prices[1] != null ? prices[1] : null,
        use: true,
        note: '',
      });
      continue;
    }

    /* A day line: "Monday - Chicken and Leek Pie $18 / meal for one $11" */
    const dayMatch = /^([A-Za-z]+)\b/.exec(line);
    const wd = dayMatch && DAY_WORDS[dayMatch[1].toLowerCase()];
    if (!wd) continue;

    const prices = pricesIn(line);
    const name = dishFrom(line.slice(dayMatch[0].length));
    if (!name) continue;

    const offset = C.WEEKDAYS_MON_FIRST.indexOf(wd);
    const date = week && week.week_start ? L.addDays(week.week_start, offset) : null;

    rows.push({
      kind: 'day',
      slot: 1,
      wd,
      where: `${C.WEEKDAY_LABELS[wd]}${date ? `, ${L.fmtMonthDay(date)}` : ''}`,
      name,
      description: '',
      full_price: prices[0] != null ? prices[0] : null,
      single_price: prices[1] != null ? prices[1] : null,
      use: true,
      note: prices.length === 0 ? 'No price found on that line — type one before you use it.' : '',
    });
  }

  return rows;
}

/**
 * The rows as they came back off the preview form — which is what gets written,
 * not what read() first thought. A correction made on that page is the thing
 * that lands.
 */
function rowsFromBody(body) {
  const n = Math.max(0, Math.min(60, Math.floor(Number(body.rows)) || 0));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (!body[`r${i}_use`]) continue;
    const name = String(body[`r${i}_name`] || '').trim();
    if (!name) continue;
    out.push({
      kind: String(body[`r${i}_kind`] || 'day'),
      slot: Math.max(1, Math.floor(Number(body[`r${i}_slot`])) || 1),
      wd: String(body[`r${i}_wd`] || ''),
      name,
      description: String(body[`r${i}_description`] || '').trim(),
      full_price: L.cents(body[`r${i}_full_price`]),
      single_price: L.cents(body[`r${i}_single_price`]),
    });
  }
  return out;
}

module.exports = { read, rowsFromBody };
