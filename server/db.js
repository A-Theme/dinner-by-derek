'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---------------------------------------------------------------------------
   THREE LEVELS, THREE TABLES.

   The domain model is deliberately NOT a single generic dish table:
     Level 1  service_days   — one row per date, featured dish inline.
                               A service day IS a date plus its featured dish.
     Level 2  week_items     — soup, salad, dessert and the meatless main,
                               owned by the week. UNIQUE(week_id, kind) makes a
                               second one of any of them impossible at the
                               storage layer.
     Level 3  standing_items — the persistent catalogue. Belongs to no week.

   They are merged only by menu.js at render time.

   Shared item fields are repeated across the three tables rather than
   normalised into a shared parent. That repetition is the point: it is what
   stops a later refactor from quietly collapsing the levels into one.
--------------------------------------------------------------------------- */

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weeks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL DEFAULT '',          -- computed from week_start
  description   TEXT NOT NULL DEFAULT '',
  week_start    TEXT,                              -- Monday of the week, YYYY-MM-DD
  image         TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | published | retired
  published_at  TEXT,
  fb_status     TEXT NOT NULL DEFAULT 'unpublished',
  fb_post_id    TEXT,
  fb_post_url   TEXT,
  fb_published_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LEVEL 1 -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_days (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  service_date  TEXT NOT NULL,                   -- YYYY-MM-DD
  sort          INTEGER NOT NULL DEFAULT 0,

  -- the one featured dish. Not a list. Not nullable in spirit.
  dish_name     TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  halal         INTEGER NOT NULL DEFAULT 0,
  allergens     TEXT NOT NULL DEFAULT '[]',
  dismissed     TEXT NOT NULL DEFAULT '[]',
  ack           INTEGER NOT NULL DEFAULT 0,
  ack_of        TEXT,                            -- description at ack time

  full_on       INTEGER NOT NULL DEFAULT 1,
  full_label    TEXT NOT NULL DEFAULT 'Full size',
  full_price    INTEGER,                         -- cents
  full_cap      INTEGER,                         -- NULL = unlimited
  single_on     INTEGER NOT NULL DEFAULT 0,
  single_label  TEXT NOT NULL DEFAULT 'Meal for one',
  single_price  INTEGER,
  single_cap    INTEGER,

  pickup_start  TEXT,                            -- NULL = inherit global
  pickup_end    TEXT,
  delivery_on   INTEGER,                         -- NULL = inherit global
  daily_cap     INTEGER,                         -- NULL = inherit global
  UNIQUE(week_id, service_date)
);

-- LEVEL 2 -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS week_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('soup','salad','dessert','meatless')),
  name          TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  halal         INTEGER NOT NULL DEFAULT 0,
  allergens     TEXT NOT NULL DEFAULT '[]',
  dismissed     TEXT NOT NULL DEFAULT '[]',
  ack           INTEGER NOT NULL DEFAULT 0,
  ack_of        TEXT,
  weekdays      TEXT NOT NULL DEFAULT '["tue","wed","thu"]',
  full_on       INTEGER NOT NULL DEFAULT 1,
  full_label    TEXT NOT NULL DEFAULT 'Full size',
  full_price    INTEGER,
  full_cap      INTEGER,
  single_on     INTEGER NOT NULL DEFAULT 0,
  single_label  TEXT NOT NULL DEFAULT 'Meal for one',
  single_price  INTEGER,
  single_cap    INTEGER,
  UNIQUE(week_id, kind)          -- one of each kind. Enforced in storage.
);

-- LEVEL 3 -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standing_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  subcategory   TEXT NOT NULL DEFAULT 'Mains',
  description   TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  halal         INTEGER NOT NULL DEFAULT 0,
  allergens     TEXT NOT NULL DEFAULT '[]',
  dismissed     TEXT NOT NULL DEFAULT '[]',
  ack           INTEGER NOT NULL DEFAULT 0,
  ack_of        TEXT,
  availability  TEXT NOT NULL DEFAULT 'every_service_day', -- or 'weekdays'
  weekdays      TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  full_on       INTEGER NOT NULL DEFAULT 1,
  full_label    TEXT NOT NULL DEFAULT 'Full size',
  full_price    INTEGER,
  full_cap      INTEGER,                         -- per service day
  single_on     INTEGER NOT NULL DEFAULT 0,
  single_label  TEXT NOT NULL DEFAULT 'Meal for one',
  single_price  INTEGER,
  single_cap    INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fulfillment ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  address  TEXT NOT NULL DEFAULT '',
  notes    TEXT NOT NULL DEFAULT '',
  active   INTEGER NOT NULL DEFAULT 1,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zones (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  fee      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fsas (
  code     TEXT PRIMARY KEY,
  zone_id  INTEGER REFERENCES zones(id) ON DELETE SET NULL
);

-- Orders --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ref           TEXT NOT NULL UNIQUE,
  week_id       INTEGER REFERENCES weeks(id),
  service_date  TEXT NOT NULL,
  status        TEXT NOT NULL,                   -- confirmed | late_request | declined
  placed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  allergy_notes TEXT NOT NULL DEFAULT '',
  method        TEXT NOT NULL,                   -- pickup | delivery
  location_id   INTEGER REFERENCES locations(id),
  location_name TEXT,
  location_addr TEXT,
  pickup_window TEXT,                            -- frozen window text, e.g. "4:00–7:00 PM"
  addr_line     TEXT,
  addr_unit     TEXT,
  postal_raw    TEXT,
  postal_norm   TEXT,
  fsa           TEXT,
  zone_name     TEXT,
  addr_notes    TEXT,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  delivery_fee  INTEGER NOT NULL DEFAULT 0,      -- frozen at submit
  total         INTEGER NOT NULL DEFAULT 0,
  paid          INTEGER NOT NULL DEFAULT 0,
  fulfilled     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  source_level TEXT NOT NULL,   -- Featured | Soup of the week | Salad of the week | Other Options
  ref_table    TEXT NOT NULL,   -- service_days | week_items | standing_items
  ref_id       INTEGER NOT NULL,
  item_name    TEXT NOT NULL,   -- frozen
  subcategory  TEXT NOT NULL,   -- frozen
  variant      TEXT NOT NULL,   -- full | single
  variant_label TEXT NOT NULL,  -- frozen
  unit_price   INTEGER NOT NULL,-- frozen
  qty          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(service_date);
CREATE INDEX IF NOT EXISTS idx_lines_order ON order_lines(order_id);

/* Money that arrived, as reported by the bank's notification email.
 *
 * Separate from orders on purpose. An order is what somebody asked for; a
 * payment is what showed up, and the two do not always line up — a transfer
 * can arrive for the wrong amount, for two orders at once, or from a name
 * nobody recognises. Keeping it in its own table means unclaimed money is
 * something the app can show rather than something that vanishes.
 *
 * external_id is the bank email's Message-ID where there is one, and a hash
 * of the text where there isn't. UNIQUE, so the same notification read twice
 * — a re-poll, a second paste — cannot settle an order twice.
 *
 * order_id is nullable and stays nullable: an unmatched payment is a normal
 * state, not an error. set_paid records whether linking is what flipped the
 * order's paid flag, so unlinking can put it back the way it was rather than
 * quietly unpaying an order that had been settled by hand.
 */
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id  TEXT NOT NULL UNIQUE,
  received_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sender_name  TEXT NOT NULL DEFAULT '',
  amount       INTEGER NOT NULL,                -- cents
  memo         TEXT NOT NULL DEFAULT '',
  memo_parsed  INTEGER NOT NULL DEFAULT 0,      -- the message was a field, not a guess
  subject      TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'paste',   -- paste | mailbox
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  matched_by   TEXT NOT NULL DEFAULT '',        -- '' | auto | owner
  matched_at   TEXT,
  set_paid     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Allergen dictionary -------------------------------------------------------
CREATE TABLE IF NOT EXISTS allergen_terms (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  term     TEXT NOT NULL,
  allergen TEXT NOT NULL,
  UNIQUE(term, allergen)
);

-- Words from the seed that the owner has deliberately taken out.
--
-- The seed is re-applied on every boot so that terms added in a later release
-- reach a database that already exists. That is only safe if a removal is
-- remembered: the owner is told to drop terms that fire wrongly for their
-- cooking, and a word that came back on every restart would be a worse bug
-- than the one re-seeding fixes.
CREATE TABLE IF NOT EXISTS allergen_terms_removed (
  term     TEXT NOT NULL,
  allergen TEXT NOT NULL,
  PRIMARY KEY (term, allergen)
);

-- Facebook ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fb_connection (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  fb_user_name  TEXT,
  page_id       TEXT,
  page_name     TEXT,
  token_enc     TEXT,          -- encrypted at rest, never exported
  scopes        TEXT,
  expires_at    TEXT,
  connected_at  TEXT,
  stale         INTEGER NOT NULL DEFAULT 0,
  warned_at     TEXT           -- set once when the expiry warning goes out
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

/* Dishes worth cooking again.
 *
 * A featured dish belongs to one day and dies with the week. This is the
 * catalogue it can be copied out of — name, description, prices, photo and
 * the allergen answers already given for it.
 *
 * There is deliberately NO ack or ack_of column. The acknowledgement is a
 * statement about a dish going on a menu this week, not a property of the
 * recipe, so it cannot be stored here and cannot travel with a copy. Reusing
 * a dish brings back everything except the tick.
 *
 * One row per name: saving a dish already on the list writes over it rather
 * than growing a second copy, so publishing the same thing every fortnight
 * keeps the list the length of the repertoire rather than the length of the
 * history. */
CREATE TABLE IF NOT EXISTS saved_dishes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL DEFAULT 'main',   -- main | soup | salad | dessert
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  photo         TEXT,
  halal         INTEGER NOT NULL DEFAULT 0,
  allergens     TEXT NOT NULL DEFAULT '[]',
  dismissed     TEXT NOT NULL DEFAULT '[]',
  full_on       INTEGER NOT NULL DEFAULT 1,
  full_label    TEXT NOT NULL DEFAULT 'Full size',
  full_price    INTEGER,
  full_cap      INTEGER,
  single_on     INTEGER NOT NULL DEFAULT 0,
  single_label  TEXT NOT NULL DEFAULT 'Meal for one',
  single_price  INTEGER,
  single_cap    INTEGER,
  saved_at      TEXT NOT NULL DEFAULT (datetime('now')),
  used_count    INTEGER NOT NULL DEFAULT 0
);
-- The unique index is NOT created here. It spans the kind column, which older
-- databases only grow further down in the migrations, and this block runs
-- first -- naming the column here would break every existing install on boot.
-- See the saved_dishes migration.

/* Every refused sign-in. The rate limiter already slows a run of guesses down,
   but it forgets: it lives in memory, it empties on restart, and it never told
   anyone. This is the record that survives, so the dashboard can say a thing
   happened and roughly how hard someone tried. Pruned at a month. */
CREATE TABLE IF NOT EXISTS login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,           -- epoch ms
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_failures_at ON login_failures(at);

/* --- Recipes --------------------------------------------------------------
 *
 * How a thing is made, as opposed to how it is sold.
 *
 * Everything above this line describes a dish on its way to a customer: what
 * it is called, what it costs, which day it runs. None of it says what is in
 * the pot. This is that record, and it is deliberately a separate one, because
 * the two have different lifetimes. A menu entry dies with its week. A stock
 * recipe outlives every menu it ever appeared on.
 *
 * THERE IS NO ack COLUMN HERE EITHER, and the reason is sharper than it was
 * for saved_dishes. An ingredient list is the best allergen signal in the
 * building -- far better than a description, because it names the butter that
 * "creamy" only implies. That is exactly what makes it dangerous. A list this
 * good invites the shortcut of tagging an item from its recipe and calling the
 * item reviewed, and the day that ships is the day an untagged substitution --
 * the cream swapped for coconut, the stock that was bought rather than made --
 * reaches a customer under a tick nobody put there. Ingredients feed the
 * suggester like any other text. The owner still ticks the box.
 */
CREATE TABLE IF NOT EXISTS recipes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  -- preparation: a building block, never sold on its own (stock, mother sauce)
  -- component:   sold as part of something (a braise, a pastry cream)
  -- dish:        goes on a menu as written
  category    TEXT NOT NULL DEFAULT 'preparation'
                CHECK (category IN ('preparation','component','dish')),
  summary     TEXT NOT NULL DEFAULT '',

  -- Yield is stored as a quantity and a unit rather than a sentence, because
  -- scaling is the operation the kitchen actually performs and it needs a
  -- ratio. "Makes about 2 L" cannot be halved by a computer; 2000 / 'ml' can.
  yield_qty   REAL,
  yield_unit  TEXT,
  portions    INTEGER,
  portion_qty REAL,
  portion_unit TEXT,

  -- The base this is a variation of. A veloute is a stock and a blond roux;
  -- everything after that is a derivative, and saying so in one column keeps
  -- the repertoire the size of the ideas in it rather than the size of the
  -- menu. NULL means this recipe stands on its own.
  parent_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,

  -- The menu entry this recipe produces, when there is one. SET NULL, not
  -- CASCADE: dropping a dish from the saved list is an editorial decision
  -- about the menu, and it must never take the method down with it.
  dish_id     INTEGER REFERENCES saved_dishes(id) ON DELETE SET NULL,

  -- Where the text came from. Provenance is a real field here, not bookkeeping:
  -- 'seed' is the base set shipped with the app, written in-house from the
  -- common formulas of the trade. Anything typed by the owner is 'house'.
  -- Nothing is ever copied in from a published cookbook -- the ratios are
  -- everyone's, the wording is not.
  source      TEXT NOT NULL DEFAULT 'house'
                CHECK (source IN ('house','seed','imported')),

  -- Set the first time the owner edits a seeded recipe. The seed is re-applied
  -- on boot so later releases reach an existing database, and that is only
  -- safe if an edit is remembered -- same bargain the allergen dictionary
  -- makes with allergen_terms_removed.
  edited      INTEGER NOT NULL DEFAULT 0,

  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recipes_parent ON recipes(parent_id);
CREATE INDEX IF NOT EXISTS idx_recipes_dish ON recipes(dish_id);

/* One row per ingredient, never one line of prose.
 *
 * The prep state gets its own column because it is where the money and the
 * allergens hide. "Butter, clarified" and "butter" are the same word to a
 * shopping list and different things to a cook, and a prep state buried in
 * free text is invisible to both.
 *
 * canon_qty/canon_unit hold the same amount in grams, millilitres or each, so
 * scaling and costing have one number to work with regardless of how the line
 * was written. The written form is kept as typed: a cook reads "2 tbsp", and
 * rewriting that as 30 ml on screen is a worse recipe, not a more precise one. */
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  group_label TEXT NOT NULL DEFAULT '',   -- "For the braise", "To finish"
  qty        REAL,
  unit       TEXT NOT NULL DEFAULT '',
  item       TEXT NOT NULL,
  prep       TEXT NOT NULL DEFAULT '',    -- diced, clarified, room temperature
  optional   INTEGER NOT NULL DEFAULT 0,
  canon_qty  REAL,
  canon_unit TEXT CHECK (canon_unit IN ('g','ml','ea') OR canon_unit IS NULL),
  -- When the ingredient is itself something the kitchen makes. This is the
  -- edge that turns a flat list into a tree: a sauce names its stock, and the
  -- stock's allergens are reachable from the dish without retyping them.
  sub_recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_ing_recipe ON recipe_ingredients(recipe_id, sort);
CREATE INDEX IF NOT EXISTS idx_recipe_ing_sub ON recipe_ingredients(sub_recipe_id);

/* Method, in order. Steps are rows so a prep list can be rendered from the
   front of the recipe and a timing from the back; minutes is nullable because
   most steps are "until it looks right" and pretending otherwise is a lie the
   schema does not need to tell. */
CREATE TABLE IF NOT EXISTS recipe_steps (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort      INTEGER NOT NULL DEFAULT 0,
  text      TEXT NOT NULL,
  minutes   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id, sort);
/* What a recipe belongs to, for the buttons on the list.
 *
 * A table rather than a JSON column on the recipe row, which is what
 * saved_dishes does for its allergens. The difference is what the two are for: those are
 * read back with the row and never queried across, while this exists purely to
 * answer "show me the German ones" -- and a LIKE against a JSON string is a
 * filter that quietly matches the wrong thing the first time a tag is a
 * substring of another.
 *
 * A recipe may carry more than one. Tom kha is Thai and it is also a soup, and
 * being made to pick one would put it under a button nobody would look for it
 * behind.
 *
 * Tags are seeded from the recipe file and are not free text: the buttons are
 * built from what is actually in this table, so a tag nobody uses cannot leave
 * an empty button on the screen. */
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag);

`);

/* --- Settings ----------------------------------------------------------- */
const DEFAULTS = {
  business_name: 'Dinner By Derek',
  timezone: 'America/Toronto',
  cutoff_hour: '22',
  cutoff_minute: '0',
  // The late window closes at 06:00 on the morning of service. Between the
  // cutoff and this, a customer may send a late REQUEST, which is not an order
  // until it is confirmed. After it, nothing: the shopping is done and the
  // cooking has started, and a request that arrives then cannot be met.
  late_cutoff_hour: '6',
  late_cutoff_minute: '0',
  pickup_start: '16:00',
  pickup_end: '19:00',
  // Whole-day ceiling on the featured dish, counted across both size
  // variants. 0 means no ceiling. A service day can override it.
  featured_daily_cap: '25',
  delivery_enabled: '1',
  delivery_fee: '500',
  delivery_min: '0',
  delivery_window: '4:00–7:00 PM',
  // A finished week goes live on its own, on the weekday before it starts.
  // Saturday noon: the menu is up for the weekend, and Monday's cutoff is
  // still a day and a half away.
  auto_publish: '1',
  auto_publish_weekday: 'sat',
  auto_publish_time: '12:00',
  // The schedule can only publish a week that exists. Nothing built for the
  // week ahead is the one failure it cannot report, so it is reported here
  // instead — a couple of days before the publish moment, while there is still
  // time to cook or to close the week on purpose.
  remind_missing_week: '1',
  remind_missing_week_days: '2',
  payment_instructions:
    'No online payment. Pay at pickup, on delivery, or by e-transfer to derekhines@hotmail.com.',
  owner_contact: 'Message Dinner By Derek on Facebook, or call (226) 748-8378.',
  notify_email: '',
  full_label: 'Full size',
  single_label: 'Meal for one',
};
const putSetting = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(DEFAULTS)) putSetting.run(k, v);

/* --- Seed: standing catalogue ------------------------------------------- */
if (db.prepare('SELECT COUNT(*) n FROM standing_items').get().n === 0) {
  const ins = db.prepare(`INSERT INTO standing_items
    (name, subcategory, description, availability, sort, full_price, full_on)
    VALUES (?,?,?,?,?,?,1)`);
  ins.run('Chili', 'Mains', '', 'every_service_day', 1, 1400);
  ins.run('Pork Schnitzel', 'Mains', '', 'every_service_day', 2, 1800);
  ins.run('Breaded Chicken Cutlets', 'Mains', '', 'every_service_day', 3, 1700);
}

/* --- Seed: standing items added after the initial release ---------------
 * Gated per-item by name, not table emptiness, so this also backfills an
 * install that already seeded the original three. Descriptions are left
 * blank on purpose — same as the original seed — so each still needs its
 * own allergen review before it can appear to customers.
 */
{
  const hasItem = db.prepare('SELECT 1 FROM standing_items WHERE name = ?');
  const insOne = db.prepare(`INSERT INTO standing_items
    (name, subcategory, description, availability, sort, full_price, full_on)
    VALUES (?,?,?,?,?,?,1)`);
  const nextSort = () => (db.prepare('SELECT COALESCE(MAX(sort),0) n FROM standing_items').get().n) + 1;
  const seedIfMissing = (name, price) => {
    if (!hasItem.get(name)) insOne.run(name, 'Mains', '', 'every_service_day', nextSort(), price);
  };
  seedIfMissing('Pulled Pork (Reheat Bag)', 1600);
  seedIfMissing('BBQ Brisket (Reheat Bag)', 1900);
  seedIfMissing('Pulled Chicken (Reheat Bag)', 1500);
}

/* --- Seed: delivery area -------------------------------------------------
 * Seeded with NO zone, so every area falls to the flat delivery_fee setting.
 *
 * They used to be seeded into a "Kitchener–Waterloo" zone at $5. That looked
 * tidy and behaved badly: delivery.js prefers a zone's fee over the flat fee,
 * nothing in the dashboard could edit a zone, and so the Delivery fee box in
 * Settings silently did nothing on a fresh install. The owner would set $10,
 * save, and every customer would still be charged $5.
 *
 * Zones remain supported for grouping areas at different prices later. They
 * are just not conjured up for someone who never asked for one.
 */
if (db.prepare('SELECT COUNT(*) n FROM fsas').get().n === 0) {
  // Verified against Canada Post FSA assignments, Aug 2026:
  // Kitchener N2A–N2H and N2M–N2R; Waterloo N2J, N2K, N2L, N2T, N2V.
  const fsas = ['N2A','N2B','N2C','N2E','N2G','N2H','N2J','N2K','N2L',
                'N2M','N2N','N2P','N2R','N2T','N2V'];
  const insF = db.prepare('INSERT OR IGNORE INTO fsas (code, zone_id) VALUES (?, NULL)');
  for (const f of fsas) insF.run(f);
}

if (db.prepare('SELECT COUNT(*) n FROM locations').get().n === 0) {
  db.prepare('INSERT INTO locations (name,address,notes,sort) VALUES (?,?,?,1)')
    .run('Kitchener — Home kitchen', 'Set this address in Locations & Delivery', 'Side door, ring bell');
}

/* --- Seed: allergen dictionary ------------------------------------------
 * Applied on every boot, not only to an empty table.
 *
 * It used to run only when the table held nothing, which meant a term added to
 * allergen-seed.js in a later release reached a database created after it and
 * no other. "cheesecake" was added the day the compound-word gap was found and
 * never appeared in the live dictionary at all — so months later the very dish
 * that exposed the gap still raised no milk, in the one place it mattered.
 *
 * The tests could not see it. Both suites build a scratch database, where an
 * empty table means the seed always applies in full, so the check that asserts
 * cheesecake raises milk passed while production missed it. A fix that ships in
 * the code and never reaches the data is the shape of bug this guards against.
 *
 * INSERT OR IGNORE leaves an existing row alone, so re-running is cheap and
 * never disturbs a term the owner edited. Removals are the case that needs
 * remembering, and allergen_terms_removed is where they are written down.
 */
function seedAllergenTerms() {
  const seed = require('./allergen-seed');
  const ins = db.prepare(`INSERT OR IGNORE INTO allergen_terms (term, allergen)
    SELECT ?, ? WHERE NOT EXISTS (
      SELECT 1 FROM allergen_terms_removed WHERE term = ? AND allergen = ?)`);
  const tx = db.transaction(() => {
    for (const [allergen, terms] of Object.entries(seed)) {
      for (const t of terms) ins.run(t, allergen, t, allergen);
    }
  });
  tx();
}
seedAllergenTerms();

/* --- Migrations ----------------------------------------------------------
 * CREATE TABLE IF NOT EXISTS won't add a column to a database that already
 * exists, so new columns are added here. Adding a column twice is an error,
 * so each one is checked first. This runs in milliseconds on a small file.
 */
function addColumn(table, column, definition) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('fb_connection', 'warned_at', 'TEXT');
addColumn('weeks', 'week_start', 'TEXT');
// NULL = inherit the featured_daily_cap setting. A number is that day's own
// ceiling; 0 closes the featured dish for the day.
addColumn('service_days', 'daily_cap', 'INTEGER');
// How the customer says they intend to pay. No money moves through the app,
// so this is a declaration of intent for the kitchen's benefit, never a
// payment record — which is why `paid` stays a separate flag the owner sets.
addColumn('orders', 'payment_method', "TEXT NOT NULL DEFAULT ''");
// Scheduled publishing. `auto_publish` is the per-week off switch; the moment
// itself is computed from the settings and the week's start date rather than
// stored, so changing the schedule moves every week that has not gone out yet.
// `publish_warned_at` records that the owner has been told a scheduled publish
// was refused, so the refusal is emailed once rather than every minute.
addColumn('weeks', 'auto_publish', 'INTEGER NOT NULL DEFAULT 1');
addColumn('weeks', 'publish_warned_at', 'TEXT');
// Closing up shop, at either scale. A closed day or week is NOT a blank one:
// blank means undecided and shows nothing, closed is a decision, is shown to
// customers in as many words, publishes like any other week, and refuses
// orders. The note is optional and appears under the closure — "back on the
// 25th", "away for a wedding".
addColumn('service_days', 'closed', 'INTEGER NOT NULL DEFAULT 0');
addColumn('service_days', 'closed_note', "TEXT NOT NULL DEFAULT ''");
addColumn('weeks', 'closed', 'INTEGER NOT NULL DEFAULT 0');
addColumn('weeks', 'closed_note', "TEXT NOT NULL DEFAULT ''");
/* One submission, one order. The browser puts a random key on the form when
 * the page is drawn, and the same key arriving twice is the same order being
 * sent twice — a double tap, a refresh of the posted form, or a phone that
 * lost signal after the request had already landed. The index is what makes
 * that true in storage rather than only in the code that checks it. Orders
 * placed before this existed carry NULL, which the partial index ignores. */
addColumn('orders', 'submission_key', 'TEXT');
/* The saved list grew past featured dishes. A soup, a salad and a dessert are
 * worth keeping and cooking again for exactly the same reason a main is, so
 * they share the table and are told apart by `kind`. Rows that predate this
 * are all featured dishes, hence the default.
 *
 * The unique index has to move with it: one on the name alone would refuse a
 * soup called "Chicken Tortilla" because a main already answered to that, and
 * those are two different things that happen to share a name. */
addColumn('saved_dishes', 'kind', "TEXT NOT NULL DEFAULT 'main'");
db.exec('DROP INDEX IF EXISTS idx_saved_dishes_name');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_dishes_kind_name
         ON saved_dishes(kind, name COLLATE NOCASE)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_submission
         ON orders(submission_key) WHERE submission_key IS NOT NULL`);

/* One recipe per saved dish, and only where a link exists at all.
 *
 * A partial index, because most recipes are attached to no dish: a stock is
 * not a menu item and never will be, and a plain UNIQUE column would let
 * exactly one of them hold NULL. Two recipes claiming the same dish is the
 * case worth refusing outright -- the question "what is in this dish" has to
 * have one answer, or the answer is worthless. */
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_one_per_dish
         ON recipes(dish_id) WHERE dish_id IS NOT NULL`);

/* One payment per order, enforced by the database rather than by remembering.
 *
 * Nothing stopped two payments pointing at the same order, and the damage did
 * not show up until an unlink. link() only flips `paid` when the order was not
 * already paid, so the second payment recorded set_paid = 0; unlinking the
 * first then set the order back to unpaid while the second was still sitting
 * against it. The result is an order with a payment linked to it that appears
 * in the chase list — money in hand and a customer being nudged for it.
 *
 * A partial index, matching idx_orders_submission above: order_id is NULL for
 * every unclaimed payment and NULL never collides in SQLite, so unclaimed money
 * is unaffected.
 *
 * Any database that already carries a duplicate has to be tidied before the
 * index can exist, or this line takes the app down at boot on exactly the
 * databases that hit the bug. The extras are unlinked rather than deleted —
 * that returns them to the unclaimed list, which is where money nobody has
 * accounted for belongs, and it is the same state a fresh paste would produce.
 * The one kept is whichever actually flipped the flag, so the unlink that
 * follows still restores the order correctly.
 */
{
  const dupes = db.prepare(`SELECT order_id FROM payments WHERE order_id IS NOT NULL
                            GROUP BY order_id HAVING COUNT(*) > 1`).all();
  if (dupes.length) {
    const keepFor = db.prepare(`SELECT id FROM payments WHERE order_id = ?
                                ORDER BY set_paid DESC, id ASC LIMIT 1`);
    const release = db.prepare(`UPDATE payments SET order_id = NULL, matched_by = '',
                                matched_at = NULL, set_paid = 0
                                WHERE order_id = ? AND id != ?`);
    const tx = db.transaction(() => {
      for (const d of dupes) release.run(d.order_id, keepFor.get(d.order_id).id);
    });
    tx();
    console.warn(`[db] ${dupes.length} order(s) had more than one payment against them. `
      + 'The extras are back in the unclaimed list on the Payments screen.');
  }
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_per_order
         ON payments(order_id) WHERE order_id IS NOT NULL`);

function renameColumn(table, from, to) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === from) && !cols.some((c) => c.name === to)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}
// Pickup stopped being slot-based; the window itself is frozen onto the order.
renameColumn('orders', 'pickup_slot', 'pickup_window');

/* The allergen review used to be recorded against the description alone. It is
 * now recorded against the name and the description together, because the
 * suggestions read both — see reviewedText() in allergens.js.
 *
 * Acknowledgements that were valid under the old rule are carried forward
 * rather than voided, which would have pulled reviewed dishes off the menu on
 * deploy for a reason the owner never saw. Carrying them forward is safe: the
 * gate still recomputes suggestions over the new text, so any allergen the
 * name introduces comes back as an undecided suggestion and blocks publishing
 * with a message naming it. The tick survives; the new information does not
 * get waved through.
 *
 * Only rows whose ack_of still equals the description are touched — those are
 * the ones that were valid. Rows already stale stay stale. Idempotent, since
 * the rewritten value always contains a newline and can never equal the
 * description again.
 */
for (const [table, nameCol] of [
  ['service_days', 'dish_name'], ['week_items', 'name'], ['standing_items', 'name'],
]) {
  db.prepare(`UPDATE ${table}
    SET ack_of = TRIM(${nameCol}) || char(10) || TRIM(description)
    WHERE ack = 1 AND ack_of IS NOT NULL AND ack_of = description`).run();
}

/* Desserts became a third week item alongside the soup and the salad.
 *
 * The kind is guarded by a CHECK constraint, and SQLite cannot alter one in
 * place — CREATE TABLE IF NOT EXISTS leaves an existing database still holding
 * the two-kind rule, so the first dessert saved would be refused by the file
 * rather than by the code. The table is rebuilt instead, columns and rows
 * carried over.
 *
 * Guarded on the stored DDL rather than on a version number, so it runs once
 * and is a no-op on a database created after this shipped.
 */
{
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='week_items'").get();
  if (ddl && !ddl.sql.includes("'dessert'")) {
    const cols = db.prepare('PRAGMA table_info(week_items)').all().map((c) => c.name).join(', ');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE week_items_rebuild (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL CHECK (kind IN ('soup','salad','dessert')),
        name          TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        photo         TEXT,
        halal         INTEGER NOT NULL DEFAULT 0,
        allergens     TEXT NOT NULL DEFAULT '[]',
        dismissed     TEXT NOT NULL DEFAULT '[]',
        ack           INTEGER NOT NULL DEFAULT 0,
        ack_of        TEXT,
        weekdays      TEXT NOT NULL DEFAULT '["tue","wed","thu"]',
        full_on       INTEGER NOT NULL DEFAULT 1,
        full_label    TEXT NOT NULL DEFAULT 'Full size',
        full_price    INTEGER,
        full_cap      INTEGER,
        single_on     INTEGER NOT NULL DEFAULT 0,
        single_label  TEXT NOT NULL DEFAULT 'Meal for one',
        single_price  INTEGER,
        single_cap    INTEGER,
        UNIQUE(week_id, kind)
      )`);
      db.exec(`INSERT INTO week_items_rebuild (${cols}) SELECT ${cols} FROM week_items`);
      db.exec('DROP TABLE week_items');
      db.exec('ALTER TABLE week_items_rebuild RENAME TO week_items');
    })();
    db.pragma('foreign_keys = ON');
  }
}

/**
 * The meatless main joins level 2, and the CHECK constraint has to be widened
 * the same way again — SQLite still cannot alter one in place.
 *
 * It sits here rather than on service_days because of what it is: one dish per
 * week, chosen once, running on Monday. That is the shape week_items already
 * has, down to UNIQUE(week_id, kind) refusing a second one and the `weekdays`
 * column deciding which days it runs. Putting it inline on the day would have
 * meant a second set of dish columns on all seven days to serve one of them.
 *
 * What it is NOT is a side. It is billed on the day page beside the featured
 * dish and it carries its own ceiling; the level it is stored at is an
 * authoring fact, not a claim about where it appears.
 */
{
  const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='week_items'").get();
  if (ddl && !ddl.sql.includes("'meatless'")) {
    const cols = db.prepare('PRAGMA table_info(week_items)').all().map((c) => c.name).join(', ');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE week_items_rebuild (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL CHECK (kind IN ('soup','salad','dessert','meatless')),
        name          TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        photo         TEXT,
        halal         INTEGER NOT NULL DEFAULT 0,
        allergens     TEXT NOT NULL DEFAULT '[]',
        dismissed     TEXT NOT NULL DEFAULT '[]',
        ack           INTEGER NOT NULL DEFAULT 0,
        ack_of        TEXT,
        weekdays      TEXT NOT NULL DEFAULT '["tue","wed","thu"]',
        full_on       INTEGER NOT NULL DEFAULT 1,
        full_label    TEXT NOT NULL DEFAULT 'Full size',
        full_price    INTEGER,
        full_cap      INTEGER,
        single_on     INTEGER NOT NULL DEFAULT 0,
        single_label  TEXT NOT NULL DEFAULT 'Meal for one',
        single_price  INTEGER,
        single_cap    INTEGER,
        UNIQUE(week_id, kind)
      )`);
      db.exec(`INSERT INTO week_items_rebuild (${cols}) SELECT ${cols} FROM week_items`);
      db.exec('DROP TABLE week_items');
      db.exec('ALTER TABLE week_items_rebuild RENAME TO week_items');
    })();
    db.pragma('foreign_keys = ON');
  }
}

/* --- Settings accessors -------------------------------------------------- */
const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
const setRow = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

function get(key, fallback = null) {
  const r = getRow.get(key);
  return r ? r.value : fallback;
}
/**
 * The fallback covers an unusable value, not only a missing key.
 *
 * It used to return Number(v) whatever v was, so a settings row holding a
 * non-number handed NaN to the caller. NaN reaches cutoffFor, builds an
 * Invalid Date, and Intl throws RangeError deep inside dayState — which means
 * every customer page and the dashboard 500 on one bad row, with a stack that
 * points at time.js rather than at the setting that caused it. Callers that
 * already knew to distrust this (publish.js) guarded themselves; the clock
 * settings did not.
 *
 * An empty string counts as unset rather than as zero, since that is what an
 * emptied form field means.
 */
function getInt(key, fallback = 0) {
  const v = get(key);
  if (v === null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function set(key, value) { setRow.run(key, String(value)); }

/* --- Settings a bad value can break the app with -------------------------
 * Most settings are stored as written: a wrong business name is a typo, not
 * an outage. These are the ones where the app stops rendering. A nonsense
 * timezone throws out of Intl on every date on every page, which is the whole
 * customer menu and the whole dashboard, not one field; the clock values feed
 * the cutoff that decides whether a day is still taking orders.
 *
 * They live here rather than beside the backup format because they are a fact
 * about the setting, not about restoring. Both ways in — the Settings form and
 * a restored file — ask the same question of the same value, and a guard only
 * one of them consults is the bug this pair keeps producing.
 */
function usableTimezone(v) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: String(v) });
    return true;
  } catch (e) {
    return false;
  }
}

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? String(n) : null;
}

/**
 * A wall-clock time as 'HH:MM', or null.
 *
 * These are not parsed anywhere — fmtClock splits on the colon and trusts what
 * it gets — so a bad one does not throw, which is why it went unnoticed. It
 * prints. "four pm" became "NaN:undefined AM" on the customer menu, and 25:00
 * quietly became "1:00 PM", which is worse: obviously broken is a bug report,
 * plausibly wrong is a customer arriving at the wrong hour.
 *
 * The pickup window is also frozen onto every order at submit, so a bad value
 * is not just a wrong page — it is written permanently onto records the owner
 * cannot easily correct.
 *
 * Normalised on the way in, so '9:5' is stored as '09:05' and the stored form
 * is always the one fmtClock expects.
 */
function clockTime(v) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const GUARDS = {
  timezone: (v) => (usableTimezone(v) ? String(v) : null),
  cutoff_hour: (v) => clampInt(v, 0, 23),
  cutoff_minute: (v) => clampInt(v, 0, 59),
  late_cutoff_hour: (v) => clampInt(v, 0, 23),
  late_cutoff_minute: (v) => clampInt(v, 0, 59),
  /* The two ends of the pickup window, and the moment a finished week goes out
   * on its own. auto_publish_time was checked with /^\d{1,2}:\d{2}$/, which
   * accepts 99:99 and 24:00 — and momentOn feeds those straight into a Date,
   * where hour 99 rolls the publish moment four days past the day it was meant
   * to be. Same guard for all three now. */
  pickup_start: clockTime,
  pickup_end: clockTime,
  auto_publish_time: clockTime,
};

/**
 * Every key this app stores, and so the only ones it will accept.
 *
 * Restore walks whatever the file's `settings` object happens to hold and hands
 * each key to guard(), which used to store anything it did not recognise. A
 * backup is a file that travels — through email, through cloud storage, through
 * whoever sent it — so "any key at all" was a wider door than it looked.
 *
 * `delivery_strategy` is the one that made it matter: it decides which
 * eligibility strategy runs, is read by delivery.js, and appears on no form, so
 * a value written into it could not be seen or corrected from the dashboard.
 *
 * The list is the seeded defaults plus the three the app writes for itself. A
 * check in the acceptance suite reads every settings key literal out of
 * server/ and fails if one is missing here, so adding a setting and forgetting
 * this list is caught rather than discovered by a restore that drops it.
 */
const ALLOWED_SETTINGS = new Set([
  ...Object.keys(DEFAULTS),
  'delivery_strategy',        // which eligibility strategy resolve() picks
  'missing_week_warned_for',  // publish.js: one reminder per week
  'signin_alert_hour',        // signin.js: one alert per bad hour
]);

/**
 * The value to store, or null when it cannot be stored at all.
 *
 * Null means "keep what is already there and tell the owner". Never means
 * "store a default": silently correcting a timezone to somewhere the owner
 * does not live would move every cutoff in the app without saying so. An
 * unknown key is the same answer, and restore names it in the sentence it
 * shows rather than dropping it in silence.
 */
function guard(key, value) {
  if (!ALLOWED_SETTINGS.has(key)) return null;
  /* GUARDS[key] answered for names nobody defined — every object inherits
   * constructor, toString and __proto__, so `guard('constructor', v)` reached
   * `g(value)` with g being the Object constructor. The allow-list above makes
   * that unreachable today; the check stays because the two lines are one
   * argument apart and the next key added to the list should not have to be
   * the one that remembers this. */
  const g = Object.prototype.hasOwnProperty.call(GUARDS, key) ? GUARDS[key] : null;
  if (!g) return value === null || value === undefined ? null : String(value);
  return g(value);
}
function all() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

module.exports = {
  db,
  /* clockTime is exported for the same reason usableTimezone is: it is not
   * only a settings guard, it is this app's definition of a wall-clock time it
   * can store and print, and a service day's pickup override is one of those
   * without being a setting. Reaching it through guard('pickup_start', …) would
   * have worked and would have been a lie about what was being validated. */
  settings: { get, getInt, set, all, guard, usableTimezone, clockTime, ALLOWED: ALLOWED_SETTINGS },
  /* Exported so the suite can drive a re-seed rather than restarting a process.
   * The old gate could not be tested at all from outside: it ran once at
   * require time against a database the test had just created empty, which is
   * the one state in which it behaves correctly. */
  seedAllergenTerms,
};
