'use strict';
const { db } = require('./db');
const T = require('./time');
const O = require('./orders');
const X = require('./exports');

/**
 * The week, added up.
 *
 * Everything else about orders is a list: the Orders screen shows them one card
 * at a time, the kitchen sheet counts one day's portions, the CSV writes one
 * row per line of one order. None of them answers the question the week ends
 * on — what sold, on which day, and for how much.
 *
 * CONFIRMED ORDERS ONLY, and that is the whole rule. A late request is money
 * nobody has agreed to yet and a declined one is money that never existed;
 * counting either would put a number on this page that the bank will never
 * match. Both are counted separately and named on the page, because a week
 * whose totals quietly omit three pending requests is a week the owner should
 * be told about rather than left to discover.
 *
 * MONDAY TO SUNDAY. Not because the food runs that way — the service days sit
 * wherever the week's menu put them — but because Menu History already groups
 * by the Monday on or before, weeks.week_start is a Monday, and a summary that
 * drew its boundary anywhere else would disagree with both of them about which
 * week a Sunday belongs to.
 */

const SPAN = 7;

/**
 * Prices are part of the grouping, not a property of the item.
 *
 * A price rise lands mid-week — it has already happened here once — and the
 * lines carry the price they were sold at, frozen. Grouping without it would
 * average two real prices into one that was never charged; grouping with it
 * splits the item into the two rows that actually happened. The week roll-up
 * puts them back together and says the price is mixed rather than picking one.
 */
function weekSummary(monday) {
  const end = T.addDays(monday, SPAN - 1);

  const lines = db.prepare(`
    SELECT o.service_date AS date, l.source_level, l.subcategory, l.item_name,
           l.variant_label, l.unit_price,
           SUM(l.qty) AS qty, SUM(l.qty * l.unit_price) AS revenue
    FROM order_lines l JOIN orders o ON o.id = l.order_id
    WHERE o.service_date BETWEEN ? AND ? AND o.status = 'confirmed'
    GROUP BY o.service_date, l.source_level, l.subcategory, l.item_name,
             l.variant_label, l.unit_price
    ORDER BY o.service_date, l.item_name, l.variant_label`).all(monday, end);

  const totals = db.prepare(`
    SELECT service_date AS date, COUNT(*) AS orders,
           SUM(CASE WHEN method = 'pickup' THEN 1 ELSE 0 END) AS pickups,
           SUM(CASE WHEN method = 'delivery' THEN 1 ELSE 0 END) AS deliveries,
           SUM(subtotal) AS food, SUM(delivery_fee) AS fees, SUM(total) AS total,
           SUM(CASE WHEN paid THEN total ELSE 0 END) AS paid
    FROM orders
    WHERE service_date BETWEEN ? AND ? AND status = 'confirmed'
    GROUP BY service_date`).all(monday, end);

  /* The menu, for the day headings. A date with a service day and no orders is
     still a day that happened, and printing it as a zero is the answer to "did
     anyone order on the Tuesday?" — which a missing row does not give.

     Ordered so the row that was actually in front of customers wins. Two weeks
     can hold the same date — a draft built over a week already gone out is the
     ordinary way to get there — and the rows were read unordered into a map
     keyed by date, where the last one silently took the heading. That put a
     dish nobody cooked above the orders for the dish they did. Published beats
     retired beats draft, and for a week in the past there is no published row
     covering it, so the retired one — which is what was live when those orders
     were taken — wins over any draft. */
  const menu = db.prepare(`
    SELECT sd.service_date AS date, sd.dish_name, sd.closed
    FROM service_days sd JOIN weeks w ON w.id = sd.week_id
    WHERE sd.service_date BETWEEN ? AND ?
    ORDER BY CASE w.status WHEN 'published' THEN 2 WHEN 'retired' THEN 1 ELSE 0 END,
             w.id`).all(monday, end);

  const other = db.prepare(`
    SELECT status, COUNT(*) AS n FROM orders
    WHERE service_date BETWEEN ? AND ? AND status != 'confirmed'
    GROUP BY status`).all(monday, end);

  const byDate = (rows) => new Map(rows.map((r) => [r.date, r]));
  const total = byDate(totals);
  const dish = byDate(menu);

  const days = [];
  for (let i = 0; i < SPAN; i++) {
    const date = T.addDays(monday, i);
    const t = total.get(date);
    const d = dish.get(date);
    if (!t && !d) continue;              // a date the business never touched
    days.push({
      date,
      dish_name: d ? d.dish_name : '',
      closed: !!(d && d.closed),
      sections: O.groupBySection(lines.filter((l) => l.date === date)),
      ...counted(t),
    });
  }

  return {
    monday,
    end,
    days,
    week: { sections: rollUp(lines), ...counted(sum(totals)) },
    pending: (other.find((o) => o.status === 'late_request') || {}).n || 0,
    declined: (other.find((o) => o.status === 'declined') || {}).n || 0,
    empty: !totals.length,
  };
}

/** A totals row, with the one figure nobody stores: what is still owed. */
function counted(t) {
  const r = {
    orders: 0, pickups: 0, deliveries: 0, food: 0, fees: 0, total: 0, paid: 0, ...(t || {}),
  };
  r.outstanding = r.total - r.paid;
  return r;
}

function sum(rows) {
  const out = { orders: 0, pickups: 0, deliveries: 0, food: 0, fees: 0, total: 0, paid: 0 };
  for (const r of rows) for (const k of Object.keys(out)) out[k] += r[k] || 0;
  return out;
}

/** Every item across the week, its days folded together. */
function rollUp(lines) {
  const items = new Map();
  for (const l of lines) {
    /* Joined on a character no dish name can contain, so a section called "A" and
       an item called "B C" cannot collide with a section "A B" and an item "C". */
    const key = [O.sectionOf(l), l.item_name, l.variant_label].join('\u0000');
    const cur = items.get(key);
    if (!cur) {
      items.set(key, { ...l, days: 1, prices: new Set([l.unit_price]) });
      continue;
    }
    cur.qty += l.qty;
    cur.revenue += l.revenue;
    cur.days += 1;
    cur.prices.add(l.unit_price);
  }
  /* Biggest earner first inside each section, which is the order the question
     is actually asked in — the days already run in date order, and repeating
     that here would only say again what the day tables above have said. */
  return O.groupBySection([...items.values()]
    .map((i) => ({ ...i, mixed: i.prices.size > 1 }))
    .sort((a, b) => b.revenue - a.revenue || a.item_name.localeCompare(b.item_name)));
}

/**
 * The same numbers as a spreadsheet, and deliberately only the lines.
 *
 * No subtotal rows and no grand total: a file carrying both its parts and its
 * sums is one AutoSum away from a number twice the size of the week. The
 * Revenue column adds up to what the week made, first row to last, and the
 * printed sheet is where the totals are already done.
 *
 * Delivery gets a row of its own per day rather than a column, for the same
 * reason — it is money the week made, it is not an item anybody ordered, and a
 * column of fees repeated beside every line of an order would be summed too.
 */
function weekCsv(monday) {
  const s = weekSummary(monday);
  const out = [[
    'Service day', 'Weekday', 'Kind', 'Section', 'Item', 'Size',
    'Unit price', 'Quantity', 'Revenue',
  ]];
  for (const d of s.days) {
    // Derived from the date, so the key is always one of ours.
    const weekday = T.WEEKDAY_LABELS[T.weekdayOf(d.date)];
    for (const g of d.sections) {
      for (const i of g.items) {
        out.push([d.date, weekday, 'Item', g.name, i.item_name, i.variant_label,
          X.money(i.unit_price), i.qty, X.money(i.revenue)]);
      }
    }
    if (d.deliveries) {
      out.push([d.date, weekday, 'Delivery', 'Delivery', 'Delivery fees', '',
        '', d.deliveries, X.money(d.fees)]);
    }
  }
  // Unit price, Quantity and Revenue unquoted, so the column sums as it stands.
  return X.csv(out, [6, 7, 8]);
}

/**
 * The weeks there is anything to show, newest first — the picker's options.
 * Built from the orders themselves rather than from `weeks`, because a week row
 * with no orders against it has nothing to add up, and an order outlives the
 * week it was placed against.
 */
function weeksWithOrders(limit = 26) {
  const dates = db.prepare('SELECT DISTINCT service_date FROM orders ORDER BY service_date DESC').all();
  const mondays = [];
  for (const { service_date: d } of dates) {
    const m = T.mondayOf(d);
    if (!mondays.includes(m)) mondays.push(m);
    if (mondays.length >= limit) break;
  }
  return mondays;
}

module.exports = { weekSummary, weekCsv, weeksWithOrders, SPAN };
