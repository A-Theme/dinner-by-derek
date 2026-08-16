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
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
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
`);

/* --- Settings ----------------------------------------------------------- */
const DEFAULTS = {
  business_name: 'Dinner By Derek',
  timezone: 'America/Toronto',
  cutoff_hour: '22',
  cutoff_minute: '0',
  pickup_start: '16:00',
  pickup_end: '19:00',
  delivery_enabled: '1',
  delivery_fee: '500',
  delivery_min: '0',
  delivery_window: '4:00–7:00 PM',
  payment_instructions:
    'No online payment. Pay at pickup, on delivery, or by e-transfer to derek@example.com.',
  owner_contact: 'Message Dinner By Derek on Facebook, or call (519) 555-0142.',
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

/* --- Seed: delivery area ------------------------------------------------- */
if (db.prepare('SELECT COUNT(*) n FROM zones').get().n === 0) {
  const z = db.prepare('INSERT INTO zones (name, fee) VALUES (?,?)')
    .run('Kitchener–Waterloo', 500).lastInsertRowid;
  // Verified against Canada Post FSA assignments, Aug 2026:
  // Kitchener N2A–N2H and N2M–N2R; Waterloo N2J, N2K, N2L, N2T, N2V.
  const fsas = ['N2A','N2B','N2C','N2E','N2G','N2H','N2J','N2K','N2L',
                'N2M','N2N','N2P','N2R','N2T','N2V'];
  const insF = db.prepare('INSERT OR IGNORE INTO fsas (code, zone_id) VALUES (?,?)');
  for (const f of fsas) insF.run(f, z);
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

function renameColumn(table, from, to) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === from) && !cols.some((c) => c.name === to)) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}
// Pickup stopped being slot-based; the window itself is frozen onto the order.
renameColumn('orders', 'pickup_slot', 'pickup_window');

/* --- Settings accessors -------------------------------------------------- */
const getRow = db.prepare('SELECT value FROM settings WHERE key = ?');
const setRow = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

function get(key, fallback = null) {
  const r = getRow.get(key);
  return r ? r.value : fallback;
}
function getInt(key, fallback = 0) {
  const v = get(key);
  return v === null ? fallback : Number(v);
}
function set(key, value) { setRow.run(key, String(value)); }
function all() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

module.exports = { db, settings: { get, getInt, set, all } };
