'use strict';
/**
 * Carrying Derek's Facebook post onto the draft week, from a phone.
 *
 * Derek posts the week's menu to the page on Saturday morning and never opens
 * this app. Getting the menu across has always been a laptop job: a signed-in
 * Chrome tab, foregrounded, scrolled with real wheel events, because the Groups
 * API went away in April 2024 and reading the page needs a token only Derek can
 * issue. None of that fits in a pocket. Pasting the text does — a long press on
 * the post, a long press in a box, and the shorthand this app already knows how
 * to read does the rest.
 *
 * TWO STEPS, ALWAYS. `read()` turns the text into rows and writes nothing;
 * `apply()` writes the rows it is handed back. Nothing goes onto the week
 * without passing through a form the owner has looked at, because the parser is
 * right most of the time and a menu is wrong in public. Derek has written the
 * salad line six different ways over three years and one of those ways loses
 * half of it; the preview is where that gets fixed, in the ten seconds before it
 * matters.
 *
 * NO ALLERGEN TAG EVER TRAVELS. Every row lands with an empty tag list, no
 * dismissals and the review box unticked — see the head of
 * scripts/import-facebook-menus.js and of server/allergens.js. The post says
 * "chicken satay(peanuts)" and the dictionary would find the peanuts, but a tag
 * that arrives already accepted is a tag nobody read. publish.js refuses a week
 * holding an unreviewed dish and is not consulted here, so a pasted week is a
 * week that cannot publish until roughly seven boxes have been ticked by hand.
 * That is the cost of the feature and it is the point of it.
 */

const { db, settings } = require('./db');
const T = require('./time');
const DISH = require('./dishes');
const M = require('./menu');
const {
  parsePost, displayName, SIDE_SHAPE, SINGLE_PORTION,
} = require('../scripts/import-facebook-menus');

const tz = () => settings.get('timezone', 'America/Toronto');

/** The four slots that belong to the week rather than to a day. */
/* One entry per (kind, slot) the week actually has — two soups and two salads,
   one dessert, one meatless main. Derived from menu.js so this list cannot drift
   from the one the week page draws and the publish gate checks. */
const WEEK_SLOTS = [];
const SLOT_KIND = {};
const SLOT_NUMBER = {};
const SLOT_LABELS = {};
const SLOT_NOUNS = {};
for (const [kind, noun, label] of [
  ['meatless', 'meatless dish', 'Meatless Monday'],
  ['soup', 'soup', 'Soup'],
  ['salad', 'salad', 'Salad'],
  ['dessert', 'dessert', 'Dessert'],
]) {
  for (const n of M.slotsOf(kind)) {
    // Slot 1 keeps the bare kind as its name, so a form field, a saved link or
    // a test that already said "soup" still means the first soup.
    const key = n === 1 ? kind : `${kind}${n}`;
    WEEK_SLOTS.push(key);
    SLOT_KIND[key] = kind;
    SLOT_NUMBER[key] = n;
    SLOT_LABELS[key] = kind === 'meatless' ? label
      : `${label}${M.WEEK_SLOT_COUNTS[kind] > 1 ? ` ${n}` : ''} of the week`;
    SLOT_NOUNS[key] = noun;
  }
}
const isWeekSlot = (s) => WEEK_SLOTS.includes(s);
const isDaySlot = (s) => T.WEEKDAYS_MON_FIRST.includes(s);

/**
 * Which box on this page a day line points at.
 *
 * Derek names his days at length — "Meatless Monday", "Taco Tuesday" — so the
 * weekday is looked for inside the line rather than matched against it. A bare
 * "Meatless" is Monday, which is what it has always been called.
 *
 * These carry the same optional `s` as the DAY regex in
 * scripts/import-facebook-menus.js, and they have to: the parser hands back the
 * words it matched, so a line reading "Tueday" arrives here spelled that way.
 * Matching the literal "tuesday" would leave the row with no box to go in —
 * which is worse than the bug being fixed, because the dish would then show up
 * in the preview pointing at nothing instead of being quietly absent.
 */
const DAY_PATTERNS = [
  [/sunday/, 'sun'], [/monday/, 'mon'], [/tues?day/, 'tue'], [/wednes?day/, 'wed'],
  [/thurs?day/, 'thu'], [/friday/, 'fri'], [/saturday/, 'sat'],
];
function weekdayKeyOf(day) {
  const s = String(day || '').toLowerCase();
  for (const [re, key] of DAY_PATTERNS) if (re.test(s)) return key;
  return s.startsWith('meatless') ? 'mon' : '';
}

/** The date a day slot lands on, given the week it is being pasted into. */
function dateOfSlot(week, slot) {
  const offset = T.WEEKDAYS_MON_FIRST.indexOf(slot);
  if (offset === -1) return null;
  return T.addDays(week.week_start || T.mondayOnOrAfter(T.todayIn(tz())), offset);
}

/** The name of a slot, for a sentence. */
function labelOfSlot(week, slot) {
  if (isWeekSlot(slot)) return SLOT_LABELS[slot];
  const date = dateOfSlot(week, slot);
  return date ? `${T.WEEKDAY_LABELS[slot]}, ${T.fmtMonthDay(date, tz())}` : 'nowhere yet';
}

/**
 * One parsed line, in the shape the preview form and the writer both use.
 *
 * The prices are the ones the posts have carried for three years, and they are
 * read out of scripts/import-facebook-menus.js rather than typed again here: a
 * family dinner also sells as a $12.50 plate for one, soup and salad go by the
 * $12 litre, a dessert is $4. Every one of them is a box the owner can change
 * before anything is written.
 */
function rowOf(it) {
  const row = {
    kind: it.kind,
    slot: '',
    use: true,
    name: displayName(it.name),
    // A soup is written as its own description, so it would otherwise say
    // everything twice. The same rule the bulk import uses.
    description: it.description === it.name ? '' : it.description,
    full_label: settings.get('full_label', 'Full size'),
    full_price: null,
    single_label: settings.get('single_label', 'Meal for one'),
    single_price: null,
    note: '',
  };

  const shape = SIDE_SHAPE[it.kind];
  if (shape) {
    row.slot = it.kind;
    row.full_label = shape.label;
    row.full_price = it.price != null ? it.price : shape.price;
    return row;
  }

  if (it.kind === 'meatless') row.slot = 'meatless';
  else if (it.kind === 'featured') row.slot = weekdayKeyOf(it.day);

  if (it.kind === 'single_select') {
    /* A Single Select is one plate at $25, offered beside the family dinner of
       the same day. The menu has one featured dish a day and nowhere to put a
       second, so it is read, shown, and left switched off — rather than
       silently dropped, or silently written over the dinner it sits beside. */
    row.use = false;
    row.single_price = it.price;
    row.note = 'A Single Select — one plate beside that day\'s dinner. This menu has room for '
      + 'one featured dish a day, so it arrives switched off. Turn it on and pick a day to use '
      + 'it instead of what that day has.';
    return row;
  }

  row.full_price = it.price;
  row.single_price = it.price != null ? SINGLE_PORTION : null;
  return row;
}

/**
 * Read a pasted post. Writes nothing, and reading is the whole of what the
 * paste button does — see the note at the top of this file.
 *
 * Two soups in a post and one soup on a week is the ordinary case, not an
 * error: Derek offers a choice of two most weeks. Both are shown, the first is
 * ticked, and the second says why it isn't.
 */
function read(text, week) {
  const items = parsePost({ n: 0, week: '', lines: String(text || '').split(/\r?\n/) });
  const filled = new Map();       // kind -> how many of its slots are spoken for
  const days = new Set();         // weekday keys already taken

  return items.map((it) => {
    const row = rowOf(it);
    if (!row.slot || !row.use) return row;

    /* A day takes one dish. Two lines aimed at one weekday is the post naming
       it twice, and the second is shown switched off rather than silently
       overwriting the first. */
    if (isDaySlot(row.slot)) {
      if (days.has(row.slot)) {
        row.use = false;
        row.note = `The post names ${labelOfSlot(week, row.slot)} more than once, and a day `
          + 'takes one dish. This one arrives switched off — tick it and untick the other if '
          + 'it is the one you want.';
      } else {
        days.add(row.slot);
      }
      return row;
    }

    /* Soup one, then soup two. Derek offers a choice of two and the week now
       holds both, so the second is ticked like the first instead of arriving
       switched off with an apology. A third would have nowhere to go. */
    const kind = SLOT_KIND[row.slot];
    const slots = M.slotsOf(kind);
    const taken = filled.get(kind) || 0;
    if (taken < slots.length) {
      const n = slots[taken];
      row.slot = n === 1 ? kind : `${kind}${n}`;
      filled.set(kind, taken + 1);
    } else {
      row.use = false;
      row.slot = '';
      const noun = SLOT_NOUNS[kind] || 'item';
      row.note = `The week holds ${slots.length} ${noun}${slots.length === 1 ? '' : 's'} and the `
        + `post offers more, so this one arrives switched off. Put it somewhere else, or untick `
        + `one above and tick this instead.`;
    }
    return row;
  });
}

/**
 * What a slot holds on the draft right now, so the preview can say what a row
 * is about to write over. 'closed' for a day that is shut; null for a slot with
 * nothing in it.
 */
function occupantOf(week, slot) {
  if (isWeekSlot(slot)) {
    const r = db.prepare('SELECT name FROM week_items WHERE week_id = ? AND kind = ? AND slot = ?')
      .get(week.id, SLOT_KIND[slot], SLOT_NUMBER[slot]);
    return r && r.name.trim() ? r.name : null;
  }
  const date = dateOfSlot(week, slot);
  if (!date) return null;
  const d = db.prepare('SELECT dish_name, closed FROM service_days WHERE week_id = ? AND service_date = ?')
    .get(week.id, date);
  if (!d) return null;
  if (d.closed) return 'closed';
  return d.dish_name.trim() ? d.dish_name : null;
}

/* --- Writing -------------------------------------------------------------- */

/**
 * The columns that describe the dish, and only those.
 *
 * The photos and the halal flag are cleared along with the tags, because they
 * belong to whatever was in the box before and this is a different dish — last
 * week's brisket photographed over this week's schnitzel is the same class of
 * mistake as last week's allergen tags on it. The ceilings and the pickup
 * override are left alone: how many to make and when to hand it over are
 * decisions about the kitchen, not about the dish.
 */
function dishColumns(row) {
  return {
    description: row.description,
    photo: null,
    single_photo: null,
    halal: 0,
    allergens: '[]',      // never carried across. See the note at the top.
    dismissed: '[]',
    ack: 0,               // and nothing arrives reviewed.
    ack_of: null,
    full_on: row.full_price != null ? 1 : 0,
    full_label: row.full_label,
    full_price: row.full_price,
    single_on: row.single_price != null ? 1 : 0,
    single_label: row.single_label,
    single_price: row.single_price,
  };
}

function writeDay(week, slot, row) {
  const date = dateOfSlot(week, slot);
  const c = dishColumns(row);
  const existing = db.prepare('SELECT id, closed FROM service_days WHERE week_id = ? AND service_date = ?')
    .get(week.id, date);
  if (existing && existing.closed) {
    return {
      skipped: `${labelOfSlot(week, slot)} is marked closed, so "${row.name}" was not put on it. `
        + 'Reopen the day first.',
    };
  }
  if (existing) {
    db.prepare(`UPDATE service_days SET dish_name=@name, description=@description, photo=@photo, single_photo=@single_photo,
        halal=@halal, allergens=@allergens, dismissed=@dismissed, ack=@ack, ack_of=@ack_of,
        full_on=@full_on, full_label=@full_label, full_price=@full_price,
        single_on=@single_on, single_label=@single_label, single_price=@single_price
        WHERE id=@id`).run({ ...c, name: row.name, id: existing.id });
  } else {
    db.prepare(`INSERT INTO service_days
        (week_id, service_date, dish_name, description, photo, single_photo, halal, allergens, dismissed,
         ack, ack_of, full_on, full_label, full_price, single_on, single_label, single_price)
        VALUES (@week_id, @service_date, @name, @description, @photo, @single_photo, @halal, @allergens,
         @dismissed, @ack, @ack_of, @full_on, @full_label, @full_price, @single_on,
         @single_label, @single_price)`)
      .run({ ...c, name: row.name, week_id: week.id, service_date: date });
  }
  return { done: `${labelOfSlot(week, slot)} — ${row.name}` };
}

function writeWeekItem(week, slot, row) {
  const c = dishColumns(row);
  /* The days a soup runs are the owner's, not the post's: Derek writes "soup
     will be ready on Tuesday" in a sentence this app has no way to read, and a
     slot that already has its days set keeps them. */
  const kind = SLOT_KIND[slot];
  const n = SLOT_NUMBER[slot];
  const existing = db.prepare(
    'SELECT weekdays FROM week_items WHERE week_id = ? AND kind = ? AND slot = ?')
    .get(week.id, kind, n);
  db.prepare(`INSERT INTO week_items
      (week_id, kind, slot, name, description, photo, single_photo, halal, allergens, dismissed, ack, ack_of,
       weekdays, full_on, full_label, full_price, single_on, single_label, single_price)
      VALUES (@week_id, @kind, @slot, @name, @description, @photo, @single_photo, @halal, @allergens, @dismissed,
       @ack, @ack_of, @weekdays, @full_on, @full_label, @full_price, @single_on,
       @single_label, @single_price)
      ON CONFLICT(week_id, kind, slot) DO UPDATE SET
       name=excluded.name, description=excluded.description, photo=excluded.photo,
       single_photo=excluded.single_photo,
       halal=excluded.halal, allergens=excluded.allergens, dismissed=excluded.dismissed,
       ack=excluded.ack, ack_of=excluded.ack_of, full_on=excluded.full_on,
       full_label=excluded.full_label, full_price=excluded.full_price,
       single_on=excluded.single_on, single_label=excluded.single_label,
       single_price=excluded.single_price`)
    .run({
      ...c,
      name: row.name,
      week_id: week.id,
      kind,
      slot: n,
      weekdays: existing ? existing.weekdays : DISH.SLOT_DEFAULT_WEEKDAYS[kind],
    });
  return { done: `${SLOT_LABELS[slot]} — ${row.name}` };
}

/**
 * Put the confirmed rows on the week. One transaction: a paste that half lands
 * is worse than one that does not land at all, because half of it looks
 * finished.
 *
 * Two rows aimed at one slot is refused rather than resolved. The second would
 * quietly write over the first, and the owner would be looking at a week
 * holding a soup they did not pick with nothing on the page to say so.
 */
function apply(week, rows) {
  const done = [];
  const skipped = [];
  const taken = new Set();

  db.transaction(() => {
    for (const row of rows) {
      if (!row.use) continue;
      if (!row.name.trim()) {
        skipped.push('A row with nothing in its name box was left alone.');
        continue;
      }
      if (!isWeekSlot(row.slot) && !isDaySlot(row.slot)) {
        skipped.push(`"${row.name}" has no day or slot picked, so it was left off.`);
        continue;
      }
      if (taken.has(row.slot)) {
        skipped.push(`"${row.name}" was aimed at ${labelOfSlot(week, row.slot)}, which something `
          + 'above it had already taken. Only the first one was used.');
        continue;
      }
      const r = isWeekSlot(row.slot)
        ? writeWeekItem(week, row.slot, row)
        : writeDay(week, row.slot, row);
      if (r.skipped) skipped.push(r.skipped);
      else { taken.add(row.slot); done.push(r.done); }
    }
  })();

  return { done, skipped };
}

/* --- The form round trip ---------------------------------------------------
 * The preview posts back one indexed group of fields per row rather than a set
 * of parallel arrays. An unticked checkbox sends nothing at all, so parallel
 * arrays come back shorter than the ones beside them and every row after the
 * first untick is paired with somebody else's name — which is a menu written
 * off the wrong line.
 */
function cents(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const digits = String(v).replace(/[^0-9.]/g, '');
  if (!/\d/.test(digits)) return null;          // 'free', '$', 'ask' — not a price
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * The most rows one paste can carry onto the week.
 *
 * Exported because the preview has to honour the same number. It did not: the
 * page drew a card for every row the parser found and posted back
 * `rows = rows.length`, while this clamped to 60 — so a paste long enough to
 * make more than sixty rows showed the owner sixty-one cards, let them tick
 * the lot, and dropped everything past the sixtieth with nothing anywhere
 * saying so. A silent drop is the one failure this whole two-step feature
 * exists to prevent.
 *
 * Sixty is far past any real post — three years of them top out around a
 * dozen rows — so the cap is only ever reached by pasting something that was
 * never a menu. The page says which rows it can take rather than pretending
 * there is no limit.
 */
const MAX_ROWS = 60;

function rowsFromBody(body) {
  const n = Math.min(Math.max(Number(body.rows) || 0, 0), MAX_ROWS);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (k) => body[`r${i}_${k}`];
    const slot = String(f('slot') || '');
    out.push({
      kind: String(f('kind') || ''),
      slot: (isWeekSlot(slot) || isDaySlot(slot)) ? slot : '',
      use: !!f('use'),
      name: String(f('name') || '').trim().slice(0, 200),
      description: String(f('description') || '').trim().slice(0, 2000),
      full_label: String(f('full_label') || '').trim().slice(0, 60) || 'Full size',
      full_price: cents(f('full_price')),
      single_label: String(f('single_label') || '').trim().slice(0, 60) || 'Meal for one',
      single_price: cents(f('single_price')),
      note: '',
    });
  }
  return out;
}

/**
 * The sentence the owner gets back on the week page.
 *
 * A count rather than a list of eight dish names: this arrives as a toast on a
 * phone, and the week itself is on the screen underneath it saying the same
 * thing in more detail. Anything that did NOT land is spelled out in full,
 * because that is the part the page below cannot tell them.
 */
function summary({ done, skipped }) {
  if (!done.length) {
    return skipped.length
      ? `Nothing was put on the week. ${skipped.join(' ')}`
      : 'Nothing was ticked, so nothing was put on the week.';
  }
  const one = done.length === 1;
  return (one ? `${done[0]} put on the week. It needs` : `${done.length} things put on the week. `
    + 'Every one of them needs')
    + ' an allergen review before you can publish.'
    + (skipped.length ? ` ${skipped.join(' ')}` : '');
}

module.exports = {
  read, apply, rowsFromBody, summary, occupantOf, labelOfSlot, dateOfSlot,
  weekdayKeyOf, cents, MAX_ROWS,
  WEEK_SLOTS, SLOT_LABELS, SLOT_NOUNS, isWeekSlot, isDaySlot,
};
