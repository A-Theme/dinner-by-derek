'use strict';
const crypto = require('crypto');
const { db, settings } = require('./db');
const T = require('./time');
const M = require('./menu');
const D = require('./delivery');

/**
 * Everything the browser sends is treated as a request, not a fact.
 *
 * Re-decided here, server-side, on every submit:
 *   - that each item exists, is available on THAT service day, and that the
 *     chosen variant is enabled
 *   - the unit price (taken from the database, never from the form)
 *   - remaining availability for the day, per size and against the featured
 *     dish's whole-day ceiling
 *   - delivery eligibility and the fee (recomputed from the postal code)
 *   - the delivery minimum
 *   - whether the cutoff has passed, which decides confirmed vs late_request
 *
 * A forged eligibility flag, an edited fee, or an item posted against a day
 * it does not run on are all rejected here.
 */

class OrderError extends Error {}

/**
 * How the customer says they intend to pay.
 *
 * No money moves through this app, so this is a declaration of intent, not a
 * payment. It exists so the kitchen knows what to expect at the door and can
 * chase the e-transfer that never arrived. The `paid` flag stays separate and
 * stays the owner's to set — a customer choosing "e-transfer" has not paid.
 *
 * Stored as the key; the label is what the customer read when they chose it,
 * and lives here so the order form, the emails and the dashboard cannot drift.
 */
const PAYMENT_METHODS = [
  { key: 'etransfer', label: 'E-transfer', note: 'preferred' },
  { key: 'cash', label: 'Cash', note: '' },
];
const PAYMENT_LABEL = (key) => {
  const m = PAYMENT_METHODS.find((p) => p.key === key);
  return m ? m.label : '';
};

function ref() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function parseLines(input) {
  let arr;
  try { arr = JSON.parse(input || '[]'); } catch { throw new OrderError('We couldn\'t read your order. Please add your items again.'); }
  if (!Array.isArray(arr) || !arr.length) throw new OrderError('Your order is empty.');
  if (arr.length > 60) throw new OrderError('That order is too large to place online. Please get in touch directly.');
  return arr.map((l) => ({
    key: String(l.key || ''),
    variant: String(l.variant || ''),
    qty: Math.floor(Number(l.qty)),
  }));
}

/**
 * Everything an order is, decided from the database, without writing anything.
 *
 * This is the whole of the old create() up to the INSERT, lifted out so the
 * review step can show the customer the same numbers the submit will use. It
 * throws the same OrderError for the same reasons, so a sold-out dish or a
 * postal code outside the area is reported at review time rather than after
 * the customer has committed.
 *
 * create() calls this again rather than trusting a quote the browser hands
 * back: between reviewing and confirming, a dish can sell out. The review is a
 * courtesy, never a reservation.
 */
function quote(payload) {
  const tz = settings.get('timezone', 'America/Toronto');
  const week = M.weekBySlug(String(payload.week || ''));
  if (!week || week.status !== 'published') throw new OrderError('That menu is no longer available.');

  const day = db.prepare('SELECT * FROM service_days WHERE week_id = ? AND service_date = ?')
    .get(week.id, String(payload.date || ''));
  if (!day) throw new OrderError('That service day is no longer on the menu.');

  const menu = M.menuForDay(week, day);
  if (menu.state === 'past') throw new OrderError('That service day has already passed.');

  // Cutoff decides the status. Standing items get no exemption: the cutoff
  // governs the whole order for that day, at every level.
  const status = menu.state === 'closed' ? 'late_request' : 'confirmed';

  /* --- Lines ----------------------------------------------------------- */
  const requested = parseLines(payload.lines);
  const lines = [];
  let subtotal = 0;
  let featuredQty = 0;

  for (const r of requested) {
    if (!Number.isFinite(r.qty) || r.qty < 1 || r.qty > 40) {
      throw new OrderError('One of the quantities on your order isn\'t valid.');
    }
    const item = M.findItem(menu, r.key);
    if (!item) {
      throw new OrderError('Something on your order isn\'t available for that day any more. Please refresh and try again.');
    }
    const variant = item.variants.find((v) => v.id === r.variant);
    if (!variant) {
      throw new OrderError(`The size you picked for ${item.name} isn't offered.`);
    }
    // Availability is only held by confirmed orders — a pending late request
    // reserves nothing, so late requests skip the remaining-count check.
    if (status === 'confirmed' && variant.remaining !== null && r.qty > variant.remaining) {
      throw new OrderError(variant.remaining === 0
        ? `${item.name} (${variant.label}) has just sold out for that day.`
        : `Only ${variant.remaining} of ${item.name} (${variant.label}) left for that day.`);
    }
    if (item.level === 'Featured') featuredQty += r.qty;
    lines.push({
      source_level: item.level,
      ref_table: item.refTable,
      ref_id: item.refId,
      item_name: item.name,
      subcategory: item.subcategory,
      variant: variant.id,
      variant_label: variant.label,
      unit_price: variant.price,     // from the database, not the form
      qty: r.qty,
      allergens: item.allergens,
    });
    subtotal += variant.price * r.qty;
  }

  /* --- The featured dish's ceiling for the day -------------------------- */
  // Checked on the total rather than per size: two sizes can each sit under
  // what is left while together they go over it. Like the per-variant check
  // above, a late request reserves nothing and so is not measured against it.
  if (status === 'confirmed' && featuredQty > 0 && menu.featuredCap) {
    const left = menu.featuredCap.remaining;
    if (featuredQty > left) {
      const name = menu.featured ? menu.featured.name : 'The featured dish';
      throw new OrderError(left === 0
        ? `${name} has sold out for that day.`
        : `Only ${left} of ${name} left for that day, across both sizes.`);
    }
  }

  /* --- Customer -------------------------------------------------------- */
  const name = String(payload.name || '').trim().slice(0, 120);
  const phone = String(payload.phone || '').trim().slice(0, 40);
  const email = String(payload.email || '').trim().slice(0, 160);
  const allergyNotes = String(payload.allergy_notes || '').trim().slice(0, 2000);
  if (!name) throw new OrderError('Please add your name.');
  if (!phone) throw new OrderError('Please add a phone number so Derek can reach you.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new OrderError('That email address doesn\'t look right.');

  // Rejected rather than defaulted. Quietly recording "e-transfer" for someone
  // who never chose it would put a wrong expectation in front of the kitchen,
  // which is the one thing this field exists to prevent.
  const paymentMethod = String(payload.payment_method || '').trim();
  if (!PAYMENT_METHODS.some((p) => p.key === paymentMethod)) {
    throw new OrderError('Please choose how you\'ll pay.');
  }

  /* --- Fulfillment ----------------------------------------------------- */
  const method = payload.method === 'delivery' ? 'delivery' : 'pickup';
  const o = {
    ref: ref(), week_id: week.id, service_date: day.service_date, status,
    name, phone, email, allergy_notes: allergyNotes, method,
    payment_method: paymentMethod,
    location_id: null, location_name: null, location_addr: null, pickup_window: null,
    addr_line: null, addr_unit: null, postal_raw: null, postal_norm: null,
    fsa: null, zone_name: null, addr_notes: null,
    subtotal, delivery_fee: 0, total: subtotal,
  };

  if (method === 'pickup') {
    const loc = db.prepare('SELECT * FROM locations WHERE id = ? AND active = 1')
      .get(Number(payload.location_id));
    if (!loc) throw new OrderError('Please choose a pickup location.');
    o.location_id = loc.id;
    o.location_name = loc.name;     // frozen: renaming a location later must
    o.location_addr = loc.address;  // not rewrite this order
    o.pickup_window = T.fmtWindow(menu.window.start, menu.window.end); // frozen too
  } else {
    if (!menu.deliveryOn) throw new OrderError('Delivery isn\'t running on that day.');

    // The client's eligibility flag and fee are not read at all. Recomputed.
    const check = D.check(payload.postal);
    if (!check.ok) {
      throw new OrderError(check.reason === 'invalid'
        ? 'That postal code doesn\'t look right. It should look like N2L 3G1.'
        : `We don't deliver to ${check.fsa || 'that area'} yet. We serve ${D.servedAreas().join(', ')}.`);
    }
    const addrLine = String(payload.addr_line || '').trim().slice(0, 200);
    if (!addrLine) throw new OrderError('Please add your street address.');

    const min = settings.getInt('delivery_min', 0);
    if (min > 0 && subtotal < min) {
      const short = ((min - subtotal) / 100).toFixed(2);
      throw new OrderError(`Delivery orders start at $${(min / 100).toFixed(2)}. You're $${short} short.`);
    }

    o.addr_line = addrLine;
    o.addr_unit = String(payload.addr_unit || '').trim().slice(0, 80) || null;
    o.addr_notes = String(payload.addr_notes || '').trim().slice(0, 500) || null;
    o.postal_raw = String(payload.postal || '').trim().slice(0, 20);
    o.postal_norm = check.normalized;
    o.fsa = check.fsa;
    o.zone_name = check.zoneName;
    o.delivery_fee = check.fee;      // frozen onto the order at submit
    o.total = subtotal + check.fee;
  }

  return { order: o, lines, status, menu };
}

function create(payload) {
  const { order: o, lines } = quote(payload);

  /* --- Persist --------------------------------------------------------- */
  const tx = db.transaction(() => {
    const cols = Object.keys(o);
    const stmt = db.prepare(
      `INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    );
    const id = stmt.run(...cols.map((c) => o[c])).lastInsertRowid;
    const ins = db.prepare(`INSERT INTO order_lines
      (order_id, source_level, ref_table, ref_id, item_name, subcategory,
       variant, variant_label, unit_price, qty)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lines) {
      ins.run(id, l.source_level, l.ref_table, l.ref_id, l.item_name,
        l.subcategory, l.variant, l.variant_label, l.unit_price, l.qty);
    }
    return id;
  });

  const id = tx();
  return { order: db.prepare('SELECT * FROM orders WHERE id = ?').get(id), lines };
}

function linesOf(orderId) {
  return db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id').all(orderId);
}

function byRef(ref) {
  return db.prepare('SELECT * FROM orders WHERE ref = ?').get(ref);
}

/** Kitchen totals for a service day: featured first, then Soups/Salads/Mains. */
function kitchenTotals(serviceDate) {
  const rows = db.prepare(`
    SELECT l.source_level, l.subcategory, l.item_name, l.variant_label,
           SUM(l.qty) AS qty
    FROM order_lines l JOIN orders o ON o.id = l.order_id
    WHERE o.service_date = ? AND o.status = 'confirmed'
    GROUP BY l.source_level, l.subcategory, l.item_name, l.variant_label
    ORDER BY l.item_name`).all(serviceDate);

  const order = { Featured: 0, Soups: 1, Salads: 2, Mains: 3 };
  const groups = new Map();
  for (const r of rows) {
    const g = r.source_level === 'Featured' ? 'Featured' : r.subcategory;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const split = db.prepare(`
    SELECT method, COUNT(*) n FROM orders
    WHERE service_date = ? AND status = 'confirmed' GROUP BY method`).all(serviceDate);

  return {
    groups: [...groups.entries()]
      .sort((a, b) => (order[a[0]] ?? 9) - (order[b[0]] ?? 9))
      .map(([name, items]) => ({ name, items })),
    split: {
      pickup: (split.find((s) => s.method === 'pickup') || {}).n || 0,
      delivery: (split.find((s) => s.method === 'delivery') || {}).n || 0,
    },
  };
}

module.exports = {
  create, quote, linesOf, byRef, kitchenTotals, OrderError,
  PAYMENT_METHODS, PAYMENT_LABEL,
};
