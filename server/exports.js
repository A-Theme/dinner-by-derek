'use strict';
const { db, settings } = require('./db');
const T = require('./time');
const O = require('./orders');

/**
 * CSV is UTF-8 with a BOM so Excel opens accented names correctly, and numeric
 * fields are written unquoted so totals sum without cleanup.
 */
const BOM = '\uFEFF';

function csvCell(v, numeric = false) {
  if (v === null || v === undefined) return '';
  if (numeric) return String(v);
  const s = String(v);
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

function ordersCsv(filters = {}) {
  const where = [];
  const args = [];
  if (filters.date) { where.push('o.service_date = ?'); args.push(filters.date); }
  if (filters.method) { where.push('o.method = ?'); args.push(filters.method); }
  if (filters.status) { where.push('o.status = ?'); args.push(filters.status); }
  if (filters.location) { where.push('o.location_id = ?'); args.push(Number(filters.location)); }
  if (filters.q) { where.push('(o.name LIKE ? OR o.phone LIKE ?)'); args.push(`%${filters.q}%`, `%${filters.q}%`); }

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

function restore(json) {
  const data = JSON.parse(json);
  if (data.format !== 'dinner-by-derek-backup') {
    throw new Error('That file isn\'t a Dinner By Derek backup.');
  }
  const tables = ['order_lines', 'orders', 'service_days', 'week_items', 'weeks',
    'standing_items', 'locations', 'fsas', 'zones', 'allergen_terms'];

  const tx = db.transaction(() => {
    for (const name of tables) db.prepare(`DELETE FROM ${name}`).run();
    const insertAll = (name, rows) => {
      if (!rows || !rows.length) return;
      const cols = Object.keys(rows[0]);
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
    for (const [k, v] of Object.entries(data.settings || {})) settings.set(k, v);
  });
  tx();
  return {
    weeks: (data.weeks || []).length,
    orders: (data.orders || []).length,
    standing: (data.standing_items || []).length,
  };
}

module.exports = { ordersCsv, contactsCsv, backup, restore, filename, csv, money };
