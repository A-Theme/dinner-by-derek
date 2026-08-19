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
     Level 2  week_items     — soup and salad, owned by the week.
                               UNIQUE(week_id, kind) makes a second soup or a
                               second salad impossible at the storage layer.
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
  kind          TEXT NOT NULL CHECK (kind IN ('soup','salad')),
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
  UNIQUE(week_id, kind)          -- one soup, one salad. Enforced in storage.
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

-- Allergen dictionary -------------------------------------------------------
CREATE TABLE IF NOT EXISTS allergen_terms (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  term     TEXT NOT NULL,
  allergen TEXT NOT NULL,
  UNIQUE(term, allergen)
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_dishes_name
  ON saved_dishes(name COLLATE NOCASE);

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

/* --- Seed: allergen dictionary ------------------------------------------ */
if (db.prepare('SELECT COUNT(*) n FROM allergen_terms').get().n === 0) {
  const seed = require('./allergen-seed');
  const ins = db.prepare('INSERT OR IGNORE INTO allergen_terms (term, allergen) VALUES (?,?)');
  const tx = db.transaction(() => {
    for (const [allergen, terms] of Object.entries(seed)) {
      for (const t of terms) ins.run(t, allergen);
    }
  });
  tx();
}

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
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_submission
         ON orders(submission_key) WHERE submission_key IS NOT NULL`);

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

const GUARDS = {
  timezone: (v) => (usableTimezone(v) ? String(v) : null),
  cutoff_hour: (v) => clampInt(v, 0, 23),
  cutoff_minute: (v) => clampInt(v, 0, 59),
  late_cutoff_hour: (v) => clampInt(v, 0, 23),
  late_cutoff_minute: (v) => clampInt(v, 0, 59),
};

/**
 * The value to store, or null when it cannot be stored at all.
 *
 * Null means "keep what is already there and tell the owner". Never means
 * "store a default": silently correcting a timezone to somewhere the owner
 * does not live would move every cutoff in the app without saying so.
 */
function guard(key, value) {
  const g = GUARDS[key];
  if (!g) return value === null || value === undefined ? null : String(value);
  return g(value);
}
function all() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

module.exports = { db, settings: { get, getInt, set, all, guard, usableTimezone } };
