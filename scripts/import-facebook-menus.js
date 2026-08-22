'use strict';
/**
 * Read the menus Derek has already posted to Facebook and file the dishes he
 * cooked into the saved-dish list, with a count of how often each one ran.
 *
 *   node scripts/import-facebook-menus.js            # report only, writes nothing
 *   node scripts/import-facebook-menus.js --write    # also fill saved_dishes
 *
 * WHAT DOES NOT COME ACROSS: allergen tags. Every dish lands with an empty tag
 * list and no acknowledgement, exactly as if it had been typed in fresh. The
 * post says "chicken satay(peanuts)" and the dictionary would find the peanuts,
 * but a tag that arrives already accepted is a tag nobody read, and the whole
 * point of the review is that a person looked. So the dishes come in bare, and
 * every one of them is unreviewed until Derek says otherwise.
 *
 * Soups, salads and desserts are written too, each under its own `kind`. They
 * land on the week rather than on a day, so "cream of broccoli" comes back as
 * this week's soup at $12 a litre and can never turn up as a Tuesday main at a
 * family-dinner price.
 */

const fs = require('fs');
const path = require('path');

/* --- Reading a post ------------------------------------------------------ */

/** Day lines. "Meatless" is written both with and without "Monday". */
const DAY = /^(meatless\s+monday|meatless|taco\s+tuesday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[-–—:]+\s*(.*)$/i;

/**
 * "Single Select" is a heading, and the day names start over underneath it:
 *
 *   Thursday - pulled brisket ... $45     <- feeds four
 *   Single Select - $25ea
 *   Thursday - chicken supreme ...        <- one plate, a different dish
 *
 * Read flat, the second Thursday overwrites the first and a $25 single plate
 * is filed as that week's family dinner. So the heading is carried downward.
 */
const SINGLE_SELECT = /^single\s*select\b/i;

/** A day that was named but had nothing on it. */
const NOTHING = /^(no offering|nothing|will (return|reappear)|returns?\b|closed|off\b|tba|next week|coming|back (in|next)|none|-+)$|^(will|next)\b/i;

function priceOf(s) {
  const m = String(s).match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:ea)?\s*[.,]?\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return Math.round(n * 100);
}

function stripPrice(s) {
  return s.replace(/[-–—,]?\s*\$?\s*\d+(?:\.\d{1,2})?\s*(?:ea)?\s*[.,]?\s*$/, '').trim();
}

/**
 * The words that mean "and here is what was next to it on the plate". A comma
 * followed by one of these is the end of the dish's name.
 */
const SIDE = new RegExp('^(?:\\w+\\s+){0,2}(?:potatoes?|rice|noodles?|buns?|rolls?|salad|veg|veggies|vegetables'
  + '|mac and cheese|pierogi(?:e)?s|biscuits|fries|wedges|coleslaw|slaw|gravy|pasta|penne|rigatoni|linguine'
  + '|couscous|quinoa|naan|pita|corn|greens|beans|lentils|broccoli|cauliflower|asparagus|spaetzle|gnocchi'
  + '|tots|garlic bread|pancakes|tortillas|chips|stuffing|risotto|polenta|farro|tabouli|hummus)\\b', 'i');

/**
 * The dish's name: as short as it can be while still naming the dish.
 *
 * Derek writes "<the thing> with <what is beside it>", so the sides come off
 * and what is left is the name. Filing "chicken Milanese with side pasta salad
 * and Italian vegetables" under the whole sentence would make every week's
 * version its own dish and every count would come out 1.
 */
function nameOf(body) {
  let n = body
    .replace(/\s*\(([^)]*)\)\s*/g, ' ')
    .replace(/\s*\*[^*]*\*\s*/g, ' ')
    .split(/\s+(?:with|topped with|served with|over|on a bed of|and side|, side|- side)\s+/i)[0]
    .split(/\s+and\s+(?:a\s+)?(?:side|sides)\b/i)[0]
    .split(/\s+[-–—]\s+/)[0]
    .replace(/[.,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // A comma is sometimes the end of the dish and sometimes the middle of it.
  // "Roast beef, mashed potatoes and veggies" is a roast beef with sides;
  // "BBQ glazed, bacon wrapped meatloaf" is one meatloaf described twice over.
  // What follows the comma settles it: a side dish ends the name, an adjective
  // does not. Cutting at every comma filed that meatloaf under "BBQ glazed"
  // and turned "chicken, black bean and cheese burritos" into plain "chicken".
  const c = n.indexOf(', ');
  if (c > 0 && SIDE.test(n.slice(c + 2))) n = n.slice(0, c);
  else n = n.replace(/^(.{25,}?)\s*,\s.*$/, '$1');

  n = n.replace(/\s+and\s+(?:veg|veggies|vegetables)$/i, '').trim();
  if (n.length > 60) n = n.slice(0, 60).replace(/\s+\S*$/, '');
  return n;
}

/**
 * The small words that stay small inside a title: articles, conjunctions, and
 * the short prepositions. "Chicken and Black Bean Enchiladas", not "Chicken And
 * Black Bean Enchiladas"; "Pot de Creme" and "Tarte au Sucre" keep their French
 * particles down too.
 */
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'au', 'aux', 'but', 'by', 'de', 'del',
  'en', 'for', 'from', 'if', 'in', 'into', 'la', 'le', 'nor', 'of', 'on', 'onto', 'or',
  'over', 'per', 'the', 'to', 'up', 'via', 'with',
  'w']);   // "w/" -- the trailing slash is stripped before the lookup

/** Capitalise one word, respecting hyphens and slashes but not apostrophes. */
function capWord(w) {
  // Already shouting (BBQ, MYO, DIY) -- leave it alone.
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
  // Split on the joiners that make compound words, so "chuck/brisket" and
  // "peri-peri" get both halves. Apostrophes are NOT joiners: "shepherd's"
  // must not come back as "Shepherd'S".
  return w.split(/([-/])/).map((part) => (
    /^[-/]$/.test(part) ? part : part.replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase())
  )).join('');
}

/**
 * A dish name is a title, so it is capitalised like one.
 *
 * Derek types his menus in running sentence case -- "bacon double cheeseburger
 * mac and cheese" -- which reads fine in a Facebook post and looks unfinished in
 * a menu list. First and last word always rise; everything but the small words
 * in between rises too.
 */
function titleCase(name) {
  const words = String(name).trim().split(/\s+/);
  return words.map((w, i) => {
    const bare = w.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    if (i > 0 && i < words.length - 1 && MINOR.has(bare)) return w.toLowerCase();
    return capWord(w);
  }).join(' ');
}

/** Title case, with the acronyms Derek shouts left shouting. */
function displayName(name) {
  return titleCase(name)
    .replace(/\bBbq\b/g, 'BBQ')
    .replace(/\bBbq(['’])D\b/g, 'BBQ$1d')
    .replace(/\bMyo\b/g, 'MYO')
    .replace(/\bDiy\b/g, 'DIY');
}

/** Two spellings of one dish have to land on one key or the counts lie. */
function keyOf(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(\d+\s*oz|\d+|fresh|homemade|house|our|the|a|an|style|gourmet|big|classic|old timey|traditional)\b/g, ' ')
    .replace(/\bveggies?\b/g, 'vegetable')
    .split(/\s+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ').trim();
}

/** "X or Y" -> [X, Y]. Soup and salad are always written as a choice of two. */
function alts(s) {
  return String(s)
    .replace(/\$?\s*\d+(?:\.\d{1,2})?\s*(?:ea|a litre|per litre)?\s*[.]?\s*$/i, '')
    .split(/\s+or\s+/i)
    .map((x) => x.replace(/^[,\s]+|[.,\s]+$/g, '').replace(/\s*\$?\d+ea\s*$/i, '').trim())
    .filter((x) => x.length > 2 && x.length < 140 && !NOTHING.test(x));
}

/** Derek has written the soup line six different ways over three years. */
function listAfter(line) {
  let m = line.match(/(?:this\s*week'?s?|these\s*week'?s?|this\s*weeks)\s*(?:features?|selections?)\s*(?:are|is)?\s*[:,]?\s*(.+)$/i);
  if (m) return m[1];
  m = line.match(/^(?:soups?|salads?)\s*(?:,\s*now available [a-z]+)?\s*[-–—:]\s*(.+)$/i);
  if (m) return m[1];
  m = line.match(/(?:features?|selections?)\s*(?:are|is)?\s*[:,]?\s*(.+)$/i);
  if (m) return m[1];
  return null;
}

function parsePost(post) {
  const out = [];
  const week = post.week || '';
  let section = 'featured';
  let sectionPrice = null;

  for (const raw of post.lines) {
    const line = String(raw).trim();
    if (!line) continue;

    if (SINGLE_SELECT.test(line) && !DAY.test(line)) {
      section = 'single_select';
      sectionPrice = priceOf(line);
      continue;
    }

    // Some weeks put the soup and the salad in one sentence.
    if (/^soups?\b/i.test(line) && /,\s*salads?\s/i.test(line)) {
      const [soupPart, saladPart] = line.split(/,\s*(?=salads?\s)/i);
      for (const a of alts(listAfter(soupPart) || '')) {
        out.push({ n: post.n, week, kind: 'soup', name: a, description: a, price: null });
      }
      for (const a of alts(listAfter(saladPart) || saladPart.replace(/^salads?\s*(this week are|this week)?/i, ''))) {
        out.push({ n: post.n, week, kind: 'salad', name: a, description: a, price: null });
      }
      continue;
    }

    if (/^desserts?\b/i.test(line) && !DAY.test(line)) {
      const body = line.replace(/^desserts?\s*(\$\d+ea)?\s*(\/\s*available[^-–—:]*)?\s*[-–—:]?\s*/i, '');
      for (const a of alts(body)) {
        out.push({ n: post.n, week, kind: 'dessert', name: nameOf(a), description: a, price: priceOf(line) });
      }
      continue;
    }

    if (/^salads?\b/i.test(line)) {
      const body = listAfter(line) || line.replace(/^salads?\s*(are also \$?\d+[^,]*,)?\s*(this week[^,]*,?)?\s*/i, '');
      for (const a of alts(body)) {
        out.push({ n: post.n, week, kind: 'salad', name: a, description: a, price: null });
      }
      continue;
    }

    if (/^soups?\b/i.test(line)) {
      for (const a of alts(listAfter(line) || '')) {
        out.push({ n: post.n, week, kind: 'soup', name: a, description: a, price: null });
      }
      continue;
    }

    const m = line.match(DAY);
    if (!m) continue;
    const day = m[1].toLowerCase().replace(/\s+/g, ' ');
    const body = m[2].trim();
    if (!body || NOTHING.test(body)) continue;

    const price = priceOf(body);
    const description = stripPrice(body);
    if (!description || description.length < 4) continue;

    out.push({
      n: post.n,
      week,
      day,
      kind: section === 'featured' && /^meatless/.test(day) ? 'meatless' : section,
      name: nameOf(description),
      description,
      price: price != null ? price : sectionPrice,
    });
  }
  return out;
}

/* --- Rolling the instances up into dishes -------------------------------- */

const MAIN_KINDS = new Set(['featured', 'meatless', 'single_select']);

/** Posts arrive newest first, so the smallest n is the most recent airing. */
function rollUp(items) {
  const byKey = new Map();
  for (const it of items) {
    const k = keyOf(it.name);
    if (!k) continue;
    const key = it.kind + ' ' + k;
    let d = byKey.get(key);
    if (!d) {
      d = { key, kind: it.kind, count: 0, newest: it, oldest: it, prices: [], names: new Map() };
      byKey.set(key, d);
    }
    d.count++;
    if (it.n < d.newest.n) d.newest = it;
    if (it.n > d.oldest.n) d.oldest = it;
    if (it.price != null) d.prices.push({ n: it.n, price: it.price });
    d.names.set(it.name, (d.names.get(it.name) || 0) + 1);
  }
  for (const d of byKey.values()) {
    // The label Derek reached for most often, ties broken alphabetically.
    const best = [...d.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    d.name = displayName(best[0]);
    d.description = d.newest.description;
    d.lastSeen = d.newest.week || '';
    d.prices.sort((a, b) => a.n - b.n);
    d.price = d.prices.length ? d.prices[0].price : null;   // most recent
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* --- Writing ------------------------------------------------------------- */

const SINGLE_PORTION = 1250;   // "single portions for $12.50", in every post
const SINGLE_SELECT_PRICE = 2500;

/**
 * One row per dish name, whatever headings it ran under.
 *
 * saved_dishes is unique on the name, so a dish that ran as a $50 family
 * dinner four times and once as a $25 Single Select cannot be two rows. Left
 * to the insert order the second one silently overwrote the first, and garlic
 * steak bites — a Thursday main all spring — ended up in the library as a
 * single $25 plate that had run once. Merging first keeps both sizes and the
 * whole count.
 */
function mergeForLibrary(mains) {
  const byName = new Map();
  for (const d of mains) {
    const k = keyOf(d.name);
    let m = byName.get(k);
    if (!m) {
      m = { name: d.name, count: 0, newest: d, family: null, select: null };
      byName.set(k, m);
    }
    m.count += d.count;
    if (d.newest.n < m.newest.newest.n) { m.newest = d; m.name = d.name; }
    const slot = d.kind === 'single_select' ? 'select' : 'family';
    if (!m[slot] || d.newest.n < m[slot].newest.n) m[slot] = d;
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function toSavedDish(m) {
  const family = m.family;
  return {
    kind: 'main',
    name: m.name,
    description: m.newest.description,
    photo: null,
    halal: 0,
    allergens: '[]',     // never carried across. See the note at the top.
    dismissed: '[]',
    full_on: family ? 1 : 0,
    full_label: 'Full size',
    full_price: family ? family.price : null,
    full_cap: null,
    single_on: 1,
    single_label: 'Meal for one',
    single_price: family ? SINGLE_PORTION : ((m.select && m.select.price) || SINGLE_SELECT_PRICE),
    single_cap: null,
  };
}

/**
 * How the sides are sold, taken from the posts rather than guessed: soup and
 * salad go by the litre at $12, desserts are $4 each. One size, so the second
 * variant is left switched off rather than invented.
 */
const SIDE_SHAPE = {
  soup: { label: 'Litre', price: 1200 },
  salad: { label: 'Litre', price: 1200 },
  dessert: { label: 'Each', price: 400 },
};

function toSavedSide(d, kind) {
  const shape = SIDE_SHAPE[kind];
  return {
    kind,
    name: d.name,
    description: d.description === d.name ? '' : d.description,
    photo: null,
    halal: 0,
    allergens: '[]',
    dismissed: '[]',
    full_on: 1,
    full_label: shape.label,
    full_price: d.price != null ? d.price : shape.price,
    full_cap: null,
    single_on: 0,
    single_label: 'Meal for one',
    single_price: null,
    single_cap: null,
  };
}

function main() {
  const write = process.argv.includes('--write');
  const src = path.join(__dirname, '..', 'data', 'facebook-menus.json');
  const { posts } = JSON.parse(fs.readFileSync(src, 'utf8'));

  let items = [];
  for (const p of posts) items = items.concat(parsePost(p));
  const dishes = rollUp(items);

  const mains = dishes.filter((d) => MAIN_KINDS.has(d.kind));
  const sides = dishes.filter((d) => !MAIN_KINDS.has(d.kind));

  const money = (c) => (c == null ? '--' : '$' + (c / 100).toFixed(2));
  const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

  console.log(`${posts.length} menu posts read, ${items.length} menu items in them.`);

  head(`MAINS -- ${mains.length} distinct dishes over ${mains.reduce((n, d) => n + d.count, 0)} airings`);
  for (const d of mains) {
    console.log(`${String(d.count).padStart(3)}x  ${money(d.price).padStart(7)}  ${d.name.padEnd(46)}  last: ${d.lastSeen}`);
  }

  for (const kind of ['soup', 'salad', 'dessert']) {
    const g = sides.filter((d) => d.kind === kind);
    head(`${kind.toUpperCase()}S -- ${g.length} distinct, ${g.reduce((n, d) => n + d.count, 0)} airings (now on the saved list too)`);
    for (const d of g.filter((x) => x.count > 1)) console.log(`${String(d.count).padStart(3)}x  ${d.name}`);
    console.log(`  ... and ${g.filter((x) => x.count === 1).length} that ran once.`);
  }

  if (!write) {
    console.log('\nReport only. Re-run with --write to fill saved_dishes.');
    return;
  }

  const DISH = require('../server/dishes');
  const { db } = require('../server/db');
  const rows = mergeForLibrary(mains);
  let saved = 0;
  let updated = 0;
  let recased = 0;
  let sidesWritten = 0;
  const tx = db.transaction(() => {
    for (const m of rows) {
      const what = DISH.save(toSavedDish(m));
      if (what === 'saved') saved++;
      else if (what === 'updated') updated++;

      // DISH.save() rewrites every column except the name -- it matches on the
      // name, so it has no reason to touch it. That leaves a row imported under
      // an older spelling still wearing it, so the capitalisation is set here.
      // Safe against the unique index: two rows that differ only in case cannot
      // exist, so a row can only ever be recased into itself.
      const row = db.prepare(
        "SELECT id, name FROM saved_dishes WHERE kind = 'main' AND name = ? COLLATE NOCASE")
        .get(m.name);
      if (row && row.name !== m.name) {
        db.prepare('UPDATE saved_dishes SET name = ? WHERE id = ?').run(m.name, row.id);
        recased++;
      }
      db.prepare(
        "UPDATE saved_dishes SET used_count = ? WHERE kind = 'main' AND name = ? COLLATE NOCASE")
        .run(m.count, m.name);
    }

    // Soups, salads and desserts are their own kinds on the same list. They go
    // on the week rather than on a day, which is why they waited until
    // week_items grew a dessert and the saved list grew a `kind`.
    for (const kind of ['soup', 'salad', 'dessert']) {
      for (const d of sides.filter((x) => x.kind === kind)) {
        if (DISH.save(toSavedSide(d, kind))) sidesWritten++;
        db.prepare('UPDATE saved_dishes SET used_count = ? WHERE kind = ? AND name = ? COLLATE NOCASE')
          .run(d.count, kind, d.name);
      }
    }
  });
  tx();
  if (recased) console.log(`\n${recased} names recapitalised in place.`);
  console.log(`\nsaved_dishes: ${saved} mains added, ${updated} rewritten, `
    + `${sidesWritten} soups, salads and desserts filed.`);
  console.log('Every one is unreviewed — no allergen tags travelled with them, and nothing');
  console.log('can publish until Derek ticks the box.');
}

if (require.main === module) main();
module.exports = { parsePost, rollUp, mergeForLibrary, nameOf, keyOf, priceOf, toSavedDish };
