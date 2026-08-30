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

/**
 * Self-describing, sortable: orders_2026-08-17_dinner-by-derek.csv
 *
 * The date arrives off a query string — the Orders screen hangs its filters on
 * the download link — and this lands inside a quoted Content-Disposition
 * header. A date containing a quote closed that quoting early, and a repeated
 * ?date= parameter arrives as an array and stringified to "a,b". Neither was
 * reachable by anyone but the owner, and CR/LF is refused by Node before it
 * reaches the wire, so nothing here was dangerous — a header this app builds by
 * hand should still only be built out of the shapes it means.
 *
 * A date that is not one is dropped rather than refused: the file is still the
 * right file, and failing a download over the name of it would be a worse
 * answer than naming it after today.
 */
function filename(kind, date, ext) {
  const asked = one(date);
  const d = asked && T.isCalendarDate(asked)
    ? asked
    : T.todayIn(settings.get('timezone', 'America/Toronto'));
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
 *
 * Version 2 carries saved_dishes. Version 1 did not, and the omission was the
 * expensive kind: the tables were listed by hand here, the saved list was
 * added to the app later, and nobody came back to this function. A backup
 * taken the day before a restore would have put the week and the orders back
 * and left the dish library empty — 800-odd rows, three years of menus read
 * out of Facebook, and the only other copy of them is a file in data/ that is
 * gitignored. Adding a table to the schema means adding it here.
 *
 * Version 3 carries the three that had drifted the same way since, and the
 * sentence above is the reason all three are named rather than summarised:
 *
 *   payments                 the money that has actually arrived. An order is
 *                            what somebody asked for; this is the record of a
 *                            bank transfer, and nothing else in the app holds
 *                            a second copy of it.
 *   recipes and their
 *   ingredients, steps
 *   and tags                 the kitchen's own documents. The seed comes back
 *                            on boot, so a restore without these looked
 *                            survivable — but it comes back as the SEED, and
 *                            every edit the owner ever made to one is in the
 *                            row, not in the file it was seeded from.
 *   allergen_terms_removed   the words deliberately taken out of the
 *                            dictionary. This one is the quiet one: the seed
 *                            re-applies on every boot and skips only what this
 *                            table remembers, so a restore that dropped it put
 *                            every removed term back the next time the app
 *                            started — undoing an allergen decision the owner
 *                            made on purpose, days later, silently.
 *
 * fb_connection and oauth_states stay out, as above. login_failures stays out
 * too: it is a month of security noise, it is pruned on its own, and it is not
 * something anybody restores.
 */
function backup() {
  const t = (name) => db.prepare(`SELECT * FROM ${name}`).all();
  return JSON.stringify({
    format: 'dinner-by-derek-backup',
    version: 3,
    exported_at: new Date().toISOString(),
    note: 'Facebook tokens and other secrets are deliberately excluded.',
    settings: settings.all(),
    weeks: t('weeks'),
    service_days: t('service_days'),
    week_items: t('week_items'),
    standing_items: t('standing_items'),
    saved_dishes: t('saved_dishes'),
    locations: t('locations'),
    zones: t('zones'),
    fsas: t('fsas'),
    orders: t('orders'),
    order_lines: t('order_lines'),
    payments: t('payments'),
    allergen_terms: t('allergen_terms'),
    allergen_terms_removed: t('allergen_terms_removed'),
    recipes: t('recipes'),
    recipe_ingredients: t('recipe_ingredients'),
    recipe_steps: t('recipe_steps'),
    recipe_tags: t('recipe_tags'),
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

  /**
   * The saved list is emptied only when the file has one to put back.
   *
   * Every other table here is cleared before the insert, which is right when
   * the file is a full backup: restore means "make it look like this". But
   * version 1 files exist, they are on Derek's disk, and they carry no
   * saved_dishes section at all. Clearing on the way in would read that
   * silence as "the library was empty" and delete 800 dishes on the way to
   * restoring a week — which is the exact loss this change was made to
   * prevent, arriving through the fix for it.
   *
   * So an absent section leaves the library alone and the caller is told. An
   * empty ARRAY is different and does empty it: that is a file saying the
   * library was empty, which is a statement rather than a silence.
   *
   * The same bargain now covers everything version 3 added, for the same
   * reason: version 1 and version 2 files are on Derek's disk today, none of
   * them carries a recipe book or a payment ledger, and reading that silence
   * as "there were none" would destroy both on the way to restoring a week.
   */
  const section = (v) => (Array.isArray(v) ? v : null);
  const library = section(data.saved_dishes);
  const ledger = section(data.payments);
  const removed = section(data.allergen_terms_removed);
  /* One flag for the whole recipe book. The four tables are one document —
     a recipe without its ingredients is not a partial recipe, it is a wrong
     one — so they arrive together or not at all. */
  const book = section(data.recipes);

  const skipped = [];
  /* Filled inside the transaction, read after it, the same way `skipped` is. */
  const outcome = { relinked: 0, orphaned: 0 };

  const tx = db.transaction(() => {
    /* Foreign keys are checked at COMMIT rather than at each row.
     *
     * Not a relaxation — a dangling reference still refuses the whole file, and
     * the transaction still rolls back. It is that a restore writes a graph, and
     * a graph has no insert order that is correct row by row: `recipes.parent_id`
     * points at another recipe, and a derivative whose base was written to the
     * file after it cannot be inserted before its base exists. Deferring is the
     * one mechanism SQLite offers for exactly this, and it is checked here rather
     * than trusted — a payment naming an order nobody restored is still refused.
     *
     * It does NOT defer ON DELETE actions, which is why the links below have to
     * be carried across by hand rather than simply surviving. */
    db.pragma('defer_foreign_keys = ON');

    /* Which order each payment belongs to, held across a restore that has no
     * payments of its own to put back.
     *
     * Deleting the orders fires ON DELETE SET NULL on every payment pointing at
     * one, so a version 2 file — which carries no payments section, and is what
     * is on Derek's disk today — silently unlinked the whole ledger on its way
     * to restoring a week. The money survived; what it had paid for did not.
     *
     * Carried by REFERENCE, never by id. The ids in the file are re-inserted as
     * written and usually do come back the same, but "usually" is not a thing to
     * decide with: restoring somebody else's backup, or an older one taken before
     * an order existed, would reattach a transfer to whichever order happened to
     * land on that number. A ref is the order's name. If it does not come back,
     * the payment stays unclaimed, which is the honest answer and the one the
     * Payments screen is built to show. */
    const heldLinks = ledger ? [] : db.prepare(
      `SELECT p.id, o.ref FROM payments p JOIN orders o ON o.id = p.order_id`).all();

    for (const name of tables) db.prepare(`DELETE FROM ${name}`).run();
    if (library) db.prepare('DELETE FROM saved_dishes').run();
    if (ledger) db.prepare('DELETE FROM payments').run();
    if (removed) db.prepare('DELETE FROM allergen_terms_removed').run();
    /* Children first, matching order_lines above. ON DELETE CASCADE would reach
       them from `recipes` alone; saying so is how the next reader knows the
       whole document goes, rather than having to look the schema up. */
    if (book) {
      for (const name of ['recipe_tags', 'recipe_steps', 'recipe_ingredients', 'recipes']) {
        db.prepare(`DELETE FROM ${name}`).run();
      }
    }
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
    if (library) insertAll('saved_dishes', library);
    insertAll('zones', data.zones);
    insertAll('locations', data.locations);
    insertAll('fsas', data.fsas);
    insertAll('orders', data.orders);
    insertAll('order_lines', data.order_lines);
    if (ledger) insertAll('payments', ledger);
    insertAll('allergen_terms', data.allergen_terms);
    if (removed) insertAll('allergen_terms_removed', removed);
    /* After saved_dishes, which recipes.dish_id points at, and before its own
       three children. */
    if (book) {
      insertAll('recipes', book);
      insertAll('recipe_ingredients', data.recipe_ingredients);
      insertAll('recipe_steps', data.recipe_steps);
      insertAll('recipe_tags', data.recipe_tags);
    }

    /* The links held above, put back on the orders that answer to the same
       reference. Anything whose order did not come back stays unclaimed. */
    let relinked = 0;
    if (heldLinks.length) {
      const orderByRef = db.prepare('SELECT id FROM orders WHERE ref = ?');
      const relink = db.prepare('UPDATE payments SET order_id = ? WHERE id = ?');
      for (const held of heldLinks) {
        const o = orderByRef.get(held.ref);
        if (o) { relink.run(o.id, held.id); relinked++; }
      }
    }
    outcome.relinked = relinked;
    outcome.orphaned = heldLinks.length - relinked;

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
    dishes: library ? library.length : 0,
    recipes: book ? book.length : 0,
    payments: ledger ? ledger.length : 0,
    /* True when the file predates version 2 and the library on disk was left
     * standing. The owner needs that sentence: what they have now is a week
     * from the file and a dish list from before it, which is not what the
     * word "restore" led them to expect. */
    keptLibrary: !library,
    /* The same sentence, owed for the same reason, about the two that version 3
     * added. An owner who restores a version 2 file still has the recipe book
     * and the ledger that were on disk a minute ago, not the ones the file is
     * named after. */
    keptRecipes: !book,
    keptPayments: !ledger,
    /* How many of those kept payments found their order again by reference, and
     * how many are now sitting in the unclaimed list because it did not come
     * back. Both are worth saying: the second is money the owner has to look at. */
    relinked: outcome.relinked,
    orphaned: outcome.orphaned,
    skipped,
  };
}

module.exports = { ordersCsv, contactsCsv, backup, restore, filename, csv, money, likeContains, one };
