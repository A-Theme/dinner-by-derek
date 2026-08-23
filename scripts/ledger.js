'use strict';
/**
 * Rebuild the dish ledger page from the database.
 *
 *   node scripts/ledger.js                    # writes data/dish-ledger.html
 *   node scripts/ledger.js --out <path>       # writes somewhere else too
 *
 * The page was first written by hand from the Facebook import and then
 * published as an artifact, where it immediately began to rot: the counts move
 * every time a week publishes, and the flat claim that no dish carries an
 * allergen tag stopped being true the first evening Derek reviewed one. So the
 * numbers now come out of saved_dishes at build time and nothing about the
 * review state is asserted in prose.
 *
 * TWO SOURCES, AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   data/dinnerbyderek.db   what is true now — names, descriptions, prices,
 *                           use counts, and which dishes have been reviewed.
 *   data/facebook-menus.json  where it came from — how many posts were read,
 *                           the span they cover, which week a dish last ran in,
 *                           and which ones ran under a Meatless heading.
 *
 * The second cannot be recovered from the first. saved_dishes files every main
 * under kind='main' whether it ran on a Meatless Monday or not, and it holds no
 * memory of which week a dish last appeared in — only a saved_at, which is when
 * the row was last written. Drop the JSON and those two columns go quiet; the
 * counts and prices carry on regardless.
 *
 * READ-ONLY, DELIBERATELY. This opens the database with readonly:true rather
 * than going through server/db.js, which would open it for writing and run the
 * schema. A page generator has no business migrating anything, and this is
 * expected to run unattended on a schedule while the app is serving.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../server/config');
const { parsePost, rollUp, keyOf } = require('./import-facebook-menus');

const ARCHIVE = path.join(config.root, 'data', 'facebook-menus.json');
const OUT = path.join(config.root, 'data', 'dish-ledger.html');
const THEME = path.join(config.root, 'brand', 'artifact-theme.css');

/**
 * The look, read at build time rather than pasted in here.
 *
 * brand/artifact-theme.css is shared by every published page, so a colour
 * fixed there reaches all of them the next time each one is rebuilt. It is
 * also the reason this file holds no hex literals of its own, which is what
 * the palette check in scripts/acceptance.js insists on.
 */
function theme() {
  return `<style>
${fs.readFileSync(THEME, 'utf8').trim()}
</style>`;
}

/* --- Where a dish last ran, and whether it ran meatless ------------------- */

/**
 * The archive, rolled up and keyed the way the importer keys it.
 *
 * keyOf is what decides that "veggies" and "vegetable" are one dish, so the
 * lookup has to use it too or two thirds of the rows would come back without a
 * last-seen week. Returns an empty map — not an error — when the archive is
 * missing, because the ledger is still worth building without it.
 */
function provenance() {
  if (!fs.existsSync(ARCHIVE)) return { by: new Map(), posts: 0, items: 0, meta: null };

  const meta = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  let items = [];
  for (const p of meta.posts) items = items.concat(parsePost(p));

  const by = new Map();
  for (const d of rollUp(items)) {
    const k = keyOf(d.name);
    const seen = by.get(k);
    /* Posts arrive newest first, so the smallest n wins a tie between a dish
     * that ran as a family dinner and the same dish as a Single Select. */
    if (!seen || d.newest.n < seen.n) {
      by.set(k, { n: d.newest.n, last: d.lastSeen, meatless: seen ? seen.meatless : false });
    }
    if (d.kind === 'meatless') {
      const cur = by.get(k);
      cur.meatless = true;
    }
  }
  return { by, posts: meta.posts.length, items: items.length, meta };
}

/** "Menu - August 17th to 20th" is the newest post; n counts backwards. */
function span(meta, posts) {
  if (!meta || !posts.length) return null;
  const back = /(\d{4})-\d{2}-\d{2}/.exec(meta.note || '');
  return {
    oldest: posts[posts.length - 1].week,
    newest: posts[0].week,
    fromYear: back ? Number(back[1]) : null,
    toYear: meta.harvested ? Number(String(meta.harvested).slice(0, 4)) : null,
  };
}

/* --- The database side --------------------------------------------------- */

function read() {
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT kind, name, description, used_count, full_on, full_price, single_price, allergens
      FROM saved_dishes`).all();
    return rows;
  } finally {
    db.close();
  }
}

function build() {
  const prov = provenance();
  const rows = read();

  const side = (kind) => rows
    .filter((r) => r.kind === kind)
    .map((r) => ({ name: r.name, n: r.used_count || 0 }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  const mains = rows.filter((r) => r.kind === 'main').map((r) => {
    const p = prov.by.get(keyOf(r.name));
    return {
      name: r.name,
      desc: r.description || '',
      n: r.used_count || 0,
      /* Single Select is a fact of the row — those dishes are sold as one
       * plate and carry no family size. Meatless is not; it only ever existed
       * as a heading in the posts. */
      kind: !r.full_on ? 'single' : (p && p.meatless ? 'meatless' : 'main'),
      price: r.full_on ? r.full_price : r.single_price,
      last: (p && p.last) || '',
      reviewed: r.allergens !== '[]' && r.allergens !== '' && r.allergens != null,
    };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  const reviewed = rows.filter((r) => r.allergens !== '[]' && r.allergens !== '' && r.allergens != null).length;

  return {
    generated: new Date().toISOString(),
    posts: prov.posts,
    itemsRead: prov.items,
    ...(span(prov.meta, prov.meta ? prov.meta.posts : []) || {}),
    saved: rows.length,
    reviewed,
    unreviewed: rows.length - reviewed,
    library: mains,
    soups: side('soup'),
    salads: side('salad'),
    desserts: side('dessert'),
  };
}

/* --- The page ------------------------------------------------------------ */

function page(data) {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Derek&#39;s Dish Ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Karla:wght@400;500;700&display=swap">
${theme()}
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Dinner By Derek &middot; menu history</p>
    <h1>Every dish, and how often it ran</h1>
    <p class="standfirst">
      Read out of the kitchen's own Facebook posts &mdash; <strong id="postcount"></strong> weekly
      menus spanning <span id="daterange"></span>. All of it &mdash; mains, soups, salads and
      desserts &mdash; is now sitting in the app's Saved&nbsp;Dishes list.
    </p>

    <div class="figures" id="figures"></div>
  </header>

  <div class="note">
    <h2>What is in the database, and what isn't</h2>
    <p>
      <strong>The mains are in.</strong> All <span id="libcount"></span> of them, with the
      description from the most recent week Derek cooked them and a use count in the
      &ldquo;Used&rdquo; column.
    </p>
    <p id="review-note"></p>
    <p>
      <strong>Soups, salads and desserts are in as their own kinds.</strong> They go on the
      <em>week</em>, not on a day &mdash; picked from &ldquo;Put a saved soup here&rdquo; in
      This&nbsp;Week. A soup can't be dropped onto a day as its featured dish; the app refuses
      it, so &ldquo;cream of broccoli&rdquo; can never be sold as a Tuesday main at a family
      price. Soup and salad carry $12 a litre, desserts $4 each, straight from the posts.
    </p>
    <p>
      <strong>Desserts are new to the app.</strong> There was no dessert slot at all before
      this &mdash; the week now holds one alongside the soup and the salad, and it flows to the
      customer menu, the order, the kitchen sheet and the Facebook post.
    </p>
    <p>
      <strong>Prices are the last price actually charged.</strong> A dish that hasn't run since
      the rise to $50 carries its older $40 or $45. The date each one last appeared is on
      its row.
    </p>
  </div>

  <div class="controls">
    <input class="search" id="q" type="search" placeholder="Search dishes, e.g. schnitzel, birria, tofu" aria-label="Search dishes">
    <button class="chip" id="f-all"      aria-pressed="true">All</button>
    <button class="chip" id="f-main"     aria-pressed="false">Mains</button>
    <button class="chip" id="f-meatless" aria-pressed="false">Meatless</button>
    <button class="chip" id="f-single"   aria-pressed="false">Single Select</button>
    <button class="chip" id="f-repeat"   aria-pressed="false">Ran more than once</button>
    <button class="chip" id="f-unreviewed" aria-pressed="false">Not yet reviewed</button>
    <p class="count-note" id="shown"></p>
  </div>

  <div class="rows" id="rows"></div>
  <button class="more" id="more" hidden></button>

  <h2 class="section" id="soups-h"></h2>
  <p class="section-note">Two a week, $12 a litre. On the saved list now &mdash; soup lives on
    the week, not on a day.</p>
  <div class="cols"><ul id="soups"></ul></div>

  <h2 class="section" id="salads-h"></h2>
  <p class="section-note">Also $12 a litre, also two a week, also on the saved list.</p>
  <div class="cols"><ul id="salads"></ul></div>

  <h2 class="section" id="desserts-h"></h2>
  <p class="section-note">Mostly $4 each, offered as a pair most weeks. The week now has a
    dessert slot of its own to put them in.</p>
  <div class="cols"><ul id="desserts"></ul></div>

  <footer>
    Compiled from the public posts on the Dinner&nbsp;by&nbsp;Derek page. Dish names are trimmed
    to the dish itself &mdash; sides come off, so &ldquo;chicken Milanese with side pasta salad&rdquo;
    and &ldquo;chicken Milanese with roast vegetables&rdquo; count as one dish cooked twice.
    Near&#8209;duplicates that survived that trimming are worth merging by hand in Saved&nbsp;Dishes.
    <p style="margin:10px 0 0">Counts, prices and review state read from the app database on
      <span id="stamp"></span>. The database is the copy that is true.</p>
  </footer>
</div>


<script>
const DATA = ${JSON.stringify(data)};
const $ = (id) => document.getElementById(id);
const money = (c) => c == null ? '—' : '$' + (c / 100).toFixed(2).replace(/\.00$/, '');
const clean = (w) => (w || '').replace(/^Menu[,\s-]*/i, '').replace(/\.$/, '') || 'undated';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* masthead */
$('postcount').textContent = DATA.posts;
$('daterange').textContent = DATA.fromYear && DATA.toYear
  ? (DATA.toYear - DATA.fromYear) + ' years, from the week of ' + clean(DATA.oldest)
    + ', ' + DATA.fromYear + ' to the week of ' + clean(DATA.newest) + ', ' + DATA.toYear
  : 'the week of ' + clean(DATA.oldest) + ' to the week of ' + clean(DATA.newest);
$('libcount').textContent = DATA.library.length;

const airings = DATA.library.reduce((n, d) => n + d.n, 0);
const figs = [
  [DATA.library.length, 'distinct mains'],
  [airings, 'times cooked'],
  [DATA.soups.length + DATA.salads.length, 'soups & salads'],
  [DATA.desserts.length, 'desserts'],
];
$('figures').innerHTML = figs.map(([n, label]) =>
  '<div class="fig"><b>' + n + '</b><span>' + label + '</span></div>').join('');

/* Review state is read out of the database, never asserted. Nobody but Derek
 * ticks a review box, so this counts them rather than claiming a number. */
$('review-note').innerHTML = DATA.reviewed === 0
  ? '<strong>Not one dish carries an allergen tag yet.</strong> Every dish arrived with an '
    + 'empty tag list and an unticked review box, exactly as if it had been typed in fresh '
    + '&mdash; including the ones whose posts say &ldquo;(peanuts)&rdquo; out loud. A tag that '
    + 'arrives pre-accepted is a tag nobody read. All ' + DATA.saved + ' stay unreviewed until '
    + 'Derek ticks them.'
  : '<strong>' + plural(DATA.reviewed, 'dish has', 'dishes have') + ' been reviewed.</strong> '
    + 'The other ' + DATA.unreviewed + ' of ' + DATA.saved + ' arrived with an empty tag list '
    + 'and an unticked review box, exactly as if typed in fresh &mdash; including the ones whose '
    + 'posts say &ldquo;(peanuts)&rdquo; out loud. A tag that arrives pre-accepted is a tag '
    + 'nobody read. Use <em>Not yet reviewed</em> below to see which mains are still waiting; '
    + 'a day cannot publish until the dish on it is ticked.';

/* the ledger */
const MAXN = Math.max.apply(null, DATA.library.map((d) => d.n).concat([1]));
const TAG = { meatless: 'Meatless', single: 'Single Select' };
const FILTERS = ['all', 'main', 'meatless', 'single', 'repeat', 'unreviewed'];
let filter = 'all', query = '', limit = 60;

function matches(d) {
  if (filter === 'repeat' && d.n < 2) return false;
  if (filter === 'unreviewed' && d.reviewed) return false;
  if (filter !== 'all' && filter !== 'repeat' && filter !== 'unreviewed' && d.kind !== filter) return false;
  if (!query) return true;
  return (d.name + ' ' + d.desc).toLowerCase().includes(query);
}

function render() {
  const hits = DATA.library.filter(matches);
  const page = hits.slice(0, limit);

  $('rows').innerHTML = page.length ? page.map((d) => {
    const tag = TAG[d.kind] ? '<span class="tag ' + d.kind + '">' + TAG[d.kind] + '</span>' : '';
    const flag = d.reviewed ? '' : '<span class="tag unreviewed" title="No allergen review yet">Unreviewed</span>';
    const desc = d.desc && d.desc.toLowerCase() !== d.name.toLowerCase()
      ? '<div class="desc">' + esc(d.desc) + '</div>' : '';
    const last = d.last ? 'last ' + esc(clean(d.last)) : '';
    return '<div class="row">'
      + '<div class="tally"><div class="n">' + d.n + '<small>&times;</small></div>'
      + '<div class="bar" style="width:' + Math.round(100 * d.n / MAXN) + '%"></div></div>'
      + '<div><span class="dish">' + esc(d.name) + '</span>' + tag + flag + '</div>'
      + '<div class="meta"><b>' + money(d.price) + '</b>' + last + '</div>'
      + desc
      + '</div>';
  }).join('') : '<p class="empty">Nothing matches that.</p>';

  $('shown').textContent = hits.length
    ? 'Showing ' + page.length + ' of ' + hits.length + ' dishes'
    : '';
  const rest = hits.length - page.length;
  $('more').hidden = rest <= 0;
  $('more').textContent = 'Show ' + Math.min(rest, 120) + ' more';
}

$('more').addEventListener('click', () => { limit += 120; render(); });
$('q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); limit = 60; render(); });

FILTERS.forEach((k) => {
  $('f-' + k).addEventListener('click', () => {
    filter = k; limit = 60;
    FILTERS.forEach((j) => $('f-' + j).setAttribute('aria-pressed', String(j === k)));
    render();
  });
});

/* soups, salads, desserts */
function sideList(elId, headId, rows, label) {
  const once = rows.filter((r) => r.n === 1).length;
  $(headId).textContent = label + ' — ' + rows.length + ' distinct';
  $(elId).innerHTML = rows.map((r) =>
    '<li><span class="c">' + r.n + '</span><span>' + esc(r.name) + '</span></li>').join('')
    + '<li><span class="c"></span><span style="color:var(--ink-faint)">' + once
    + ' of these ran exactly once.</span></li>';
}
sideList('soups', 'soups-h', DATA.soups, 'Soups');
sideList('salads', 'salads-h', DATA.salads, 'Salads');
sideList('desserts', 'desserts-h', DATA.desserts, 'Desserts');

$('stamp').textContent = new Date(DATA.generated).toLocaleString(undefined,
  { dateStyle: 'long', timeStyle: 'short' });

render();
</script>
</body>
</html>
`;
}

/* --- Running ------------------------------------------------------------- */

function main() {
  const args = process.argv.slice(2);
  const extra = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (!args[i + 1]) { console.error('--out needs a path.'); process.exit(1); }
      extra.push(path.resolve(args[++i]));
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  const data = build();
  const html = page(data);

  for (const out of [OUT, ...extra]) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`${data.library.length} mains, ${data.soups.length} soups, `
    + `${data.salads.length} salads, ${data.desserts.length} desserts.`);
  console.log(`${data.reviewed} of ${data.saved} saved dishes reviewed; `
    + `${data.unreviewed} still unreviewed.`);
  if (!data.posts) {
    console.log('No data/facebook-menus.json — built without last-seen weeks or Meatless tags.');
  }
}

if (require.main === module) main();
module.exports = { build, page };
