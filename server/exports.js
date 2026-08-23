'use strict';
const { db, settings } = require('./db');
const T = require('./time');
const O = require('./orders');

/**
 * CSV is UTF-8 with a BOM so Excel opens accented names correctly, and numeric
 * fields are written unquoted so totals sum without cleanup.
 */
const BOM = '\uFEFF';

/**
 * A cell a spreadsheet would run instead of read.
 *
 * Excel and Sheets treat a leading = + - @ as the start of a formula, and the
 * customer supplies four of the columns here \u2014 name, phone, email and allergy
 * notes. A name of =HYPERLINK("http://\u2026"&A1,"Click") is a working exfiltration
 * of the row beside it the moment Derek opens the export.
 *
 * Quoting does not help: the quotes are the CSV's, and the spreadsheet strips
 * them before it decides what the cell is. The apostrophe does, because it
 * survives into the cell and forces text.
 *
 * Numeric columns are exempt and must stay that way \u2014 Quantity and the money
 * columns are written bare precisely so the totals sum without cleanup, and
 * none of them can begin with one of these characters anyway.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v, numeric = false) {
  if (v === null || v === undefined) return '';
  if (numeric) return String(v);
  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows, numericCols = []) {
  return BOM + rows.map((r) => r.map((c, i) => csvCell(c, numericCols.includes(i))).join(',')).join('\r\n') + '\r\n';
}

function slug() {
  return settings.get('business_name', 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Self-describing, sortable: orders_2026-08-17_dinner-by-derek.csv */
function filename(kind, date, ext) {
  const d = date || T.todayIn(settings.get('timezone', 'America/Toronto'));
  return `${kind}_${d}_${slug()}.${ext}`;
}

const money = (c) => (Number(c || 0) / 100).toFixed(2);

/**
 * A search box holds words, not patterns.
 *
 * LIKE reads % as "anything" and _ as "any one character", so a customer
 * called O_Brien matched every four-letter O-something-Brien on the list and
 * a bare % matched all of them. Escaped, and declared with ESCAPE, so what
 * the owner typed is what gets looked for. The backslash is replaced first,
 * or it would go on to escape the escapes.
 */
function likeContains(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One value out of a query parameter that might be several.
 *
 * Express turns `?date=a&date=b` into an array, and better-sqlite3 refuses to
 * bind one — "Too many parameter values were provided" — so a duplicated
 * parameter reached the owner as a 500 on a page that was only ever going to
 * show a list. Both the orders screen and this file's CSV read the same query
 * string, so both had it.
 *
 * Last one wins, which is what a browser does with a duplicated form field, and
 * leaves a single value behaving exactly as before.
 */
function one(v) {
  if (v === undefined || v === null) return v;
  return String(Array.isArray(v) ? v[v.length - 1] : v);
}

function ordersCsv(filters = {}) {
  const where = [];
  const args = [];
  const date = one(filters.date);
  const method = one(filters.method);
  const status = one(filters.status);
  const location = one(filters.location);
  const q = one(filters.q);
  if (date) { where.push('o.service_date = ?'); args.push(date); }
  if (method) { where.push('o.method = ?'); args.push(method); }
  if (status) { where.push('o.status = ?'); args.push(status); }
  if (location) { where.push('o.location_id = ?'); args.push(Number(location)); }
  if (q) {
    where.push("(o.name LIKE ? ESCAPE '\\' OR o.phone LIKE ? ESCAPE '\\')");
    args.push(likeContains(q), likeContains(q));
  }

  const rows = db.prepare(`
    SELECT o.*, l.source_level, l.subcategory, l.item_name, l.variant_label,
           l.unit_price, l.qty
    FROM orders o JOIN order_lines l ON l.order_id = o.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.service_date, o.id, l.id`).all(...args);

  const out = [[
    'Service day', 'Customer', 'Phone', 'Email', 'Item', 'Source level', 'Section',
    'Size', 'Quantity', 'Line total', 'Fulfillment', 'Pickup location', 'Pickup window',
    'Delivery address', 'Postal code', 'Delivery fee', 'Order total', 'Paying by',
    'Allergy notes', 'Status', 'Reference',
  ]];
  for (const r of rows) {
    out.push([
      r.service_date, r.name, r.phone, r.email, r.item_name, r.source_level,
      r.subcategory, r.variant_label, r.qty, money(r.unit_price * r.qty),
      r.method, r.location_name || '', r.pickup_window || '',
      r.method === 'delivery' ? [r.addr_line, r.addr_unit].filter(Boolean).join(', ') : '',
      r.postal_norm || '', money(r.delivery_fee), money(r.total),
      O.PAYMENT_LABEL(r.payment_method),
      r.allergy_notes, r.status, r.ref,
    ]);
  }
  // Quantity, line total, delivery fee, order total unquoted so Excel sums them.
  return csv(out, [8, 9, 15, 16]);
}

function contactsCsv() {
  const rows = db.prepare(`
    SELECT name, email, phone, MAX(placed_at) AS last
    FROM orders GROUP BY LOWER(COALESCE(NULLIF(email,''), phone))
    ORDER BY name`).all();
  return csv([['Name', 'Email', 'Phone', 'Last order'],
    ...rows.map((r) => [r.name, r.email, r.phone, r.last])]);
}

/**
 * Full backup. Deliberately excludes fb_connection and oauth_states — a
 * backup file travels through email and cloud storage, and an access token
 * must never travel with it.
 */
function backup() {
  const t = (name) => db.prepare(`SELECT * FROM ${name}`).all();
  return JSON.stringify({
    format: 'dinner-by-derek-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    note: 'Facebook tokens and other secrets are deliberately excluded.',
    settings: settings.all(),
    weeks: t('weeks'),
    service_days: t('service_days'),
    week_items: t('week_items'),
    standing_items: t('standing_items'),
    locations: t('locations'),
    zones: t('zones'),
    fsas: t('fsas'),
    orders: t('orders'),
    order_lines: t('order_lines'),
    allergen_terms: t('allergen_terms'),
  }, null, 2);
}

/** The columns a table actually has, so a file cannot invent one. */
function columnsOf(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

/**
 * Columns holding a JSON array, wherever they appear.
 *
 * Their names are checked against the table, but until now their VALUES were
 * written through untouched — and a backup is a text file people edit. A
 * standing item whose `allergens` reads `milk, wheat` instead of
 * `["milk","wheat"]` restores without complaint, reports success, and then
 * throws out of JSON.parse inside the allergen review, which every menu render
 * goes through. One edited word in a file, and the customer menu is a 500.
 *
 * Refused rather than coerced. Turning an unreadable value into `[]` would
 * drop allergen tags off a dish silently, which is the one failure this whole
 * app is arranged to prevent — better to hand back the file and say which row.
 */
const JSON_ARRAY_COLUMNS = new Set(['allergens', 'dismissed', 'weekdays']);

function isJsonArray(v) {
  if (typeof v !== 'string') return false;
  try { return Array.isArray(JSON.parse(v)); } catch (e) { return false; }
}

function restore(json) {
  const data = JSON.parse(json);
  if (data.format !== 'dinner-by-derek-backup') {
    throw new Error('That file isn\'t a Dinner By Derek backup.');
  }
  const tables = ['order_lines', 'orders', 'service_days', 'week_items', 'weeks',
    'standing_items', 'locations', 'fsas', 'zones', 'allergen_terms'];

  const skipped = [];

  const tx = db.transaction(() => {
    for (const name of tables) db.prepare(`DELETE FROM ${name}`).run();
    const insertAll = (name, rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
        throw new Error(`The "${name}" section of that backup isn't a list of rows.`);
      }
      /* Column names come out of the file, and until they are checked against
       * the table they are a string this code is about to put inside a SQL
       * statement. Anything the table doesn't have stops the restore by name
       * rather than being dropped quietly — a backup carrying columns this
       * app has never heard of is either from a newer version or has been
       * edited, and silently discarding part of a restore is worse than
       * refusing the whole of it.
       *
       * Read across every row, not just the first. Taking the shape from
       * rows[0] made that promise true of one row and no other. A stray column
       * further down was never compared against the table at all and was
       * dropped in silence. A row missing one bound NULL: a NOT NULL column
       * refused it with a constraint message naming neither the row nor the
       * file, and a nullable column simply took it — so a dish came back from
       * a restore that reported success with no price at all, which is how it
       * leaves the customer menu without anyone being told. */
      const known = columnsOf(name);
      const cols = [];
      for (const r of rows) {
        for (const c of Object.keys(r)) if (!cols.includes(c)) cols.push(c);
      }
      const unknown = cols.filter((c) => !known.has(c));
      if (unknown.length) {
        throw new Error(`The "${name}" rows in that backup have a column this app `
          + `doesn't have: ${unknown[0]}. It may have come from a newer version.`);
      }
      if (!cols.length) return;
      /* Row numbers are 1-based and count the rows in the file, because that
       * is what the owner is looking at when they open it. */
      rows.forEach((r, i) => {
        for (const c of cols) {
          if (!Object.prototype.hasOwnProperty.call(r, c)) {
            throw new Error(`Row ${i + 1} of "${name}" in that backup is missing `
              + `the ${c} column that the other rows have.`);
          }
          if (JSON_ARRAY_COLUMNS.has(c) && !isJsonArray(r[c])) {
            throw new Error(`Row ${i + 1} of "${name}" in that backup has a value in `
              + `${c} that isn't a list: ${JSON.stringify(r[c])}.`);
          }
        }
      });
      const stmt = db.prepare(
        `INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const r of rows) stmt.run(...cols.map((c) => r[c]));
    };
    insertAll('weeks', data.weeks);
    insertAll('service_days', data.service_days);
    insertAll('week_items', data.week_items);
    insertAll('standing_items', data.standing_items);
    insertAll('zones', data.zones);
    insertAll('locations', data.locations);
    insertAll('fsas', data.fsas);
    insertAll('orders', data.orders);
    insertAll('order_lines', data.order_lines);
    insertAll('allergen_terms', data.allergen_terms);
    const incoming = data.settings;
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      for (const [k, v] of Object.entries(incoming)) {
        if (v === null || typeof v === 'object') { skipped.push(k); continue; }
        const clean = settings.guard(k, v);
        if (clean === null) skipped.push(k);
        else settings.set(k, clean);
      }
    }
  });
  tx();
  return {
    weeks: (data.weeks || []).length,
    orders: (data.orders || []).length,
    standing: (data.standing_items || []).length,
    skipped,
  };
}

module.exports = { ordersCsv, contactsCsv, backup, restore, filename, csv, money, likeContains, one };
