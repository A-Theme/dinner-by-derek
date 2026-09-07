'use strict';

/** Today, Orders, the three print sheets, and the Outbox. */

const { html, raw } = require('../../html');
const L = require('../lib');
const St = require('../store');
const V = require('./layout');

const BASE = V.BASE;

/* ============================== TODAY =================================== */

function todayPage(d, q) {
  const today = L.today();
  const week = St.activeWeek(d);
  const days = week ? St.serviceDaysOf(d, week.id) : [];
  const draft = d.weeks.find((w) => w.status === 'draft');

  const countFor = (date) => d.orders
    .filter((o) => o.service_date === date && o.status === 'confirmed').length;
  const lateCount = d.orders.filter((o) => o.status === 'late_request').length;
  const tomorrow = L.addDays(today, 1);

  const weekClosed = !!(week && week.closed);
  const upcoming = weekClosed ? [] : days.filter((x) => x.service_date >= today && !x.closed);
  const next = upcoming[0] || null;
  const totals = next ? St.kitchenTotals(d, next.service_date) : null;

  /* The one thing that most needs doing next — the same ladder the real
     dashboard walks down. */
  let primary;
  if (!week && !draft) primary = { href: `${BASE}/week`, label: "Build this week's menu" };
  else if (draft) primary = { href: `${BASE}/week`, label: 'Finish and publish this week' };
  else if (weekClosed) primary = { href: `${BASE}/week`, label: 'Plan the next week' };
  else if (lateCount) primary = { href: `${BASE}/orders?status=late_request`, label: `Review ${lateCount} late request${lateCount === 1 ? '' : 's'}` };
  else if (next) primary = { href: `${BASE}/orders?date=${next.service_date}`, label: `See orders for ${L.fmtDayShort(next.service_date)}` };
  else primary = { href: `${BASE}/week`, label: 'Plan next week' };

  const cutoff = next
    ? new Date(`${L.addDays(next.service_date, -1)}T${String(d.settings.cutoff_hour).padStart(2, '0')}:${String(d.settings.cutoff_minute).padStart(2, '0')}:00Z`)
    : null;

  const body = html`
    <h1>Today</h1>
    ${V.flash(q)}

    <div class="tr-note">
      <strong>Welcome to the training dashboard.</strong> This is a working copy of the real
      thing, filled with invented dinners and invented customers. Press anything. Publish the
      week, delete an order, disconnect Facebook — none of it reaches the business, and
      <em>Reset sandbox</em> in the bar above puts it all back.
    </div>

    <p data-coach="primary"><a class="btn btn--primary btn--block" href="${primary.href}">${primary.label}</a></p>

    <div class="tile-grid" style="margin:var(--dbd-sp-4) 0" data-coach="tiles">
      <a class="tile tile--link" href="${BASE}/orders?date=${today}">
        <div class="tile__n">${countFor(today)}</div><div class="tile__l">Orders today</div></a>
      <a class="tile tile--link" href="${BASE}/orders?date=${tomorrow}">
        <div class="tile__n">${countFor(tomorrow)}</div><div class="tile__l">Orders tomorrow</div></a>
      <a class="tile tile--link" href="${BASE}/orders?status=late_request">
        <div class="tile__n">${lateCount}</div><div class="tile__l">Late requests</div></a>
    </div>

    ${next ? html`
      <div class="card" data-coach="totals">
        <h2>${L.fmtDayLong(next.service_date)}</h2>
        <p>Orders close ${L.fmtDayLong(L.addDays(next.service_date, -1))}
           — <span class="countdown" data-countdown="${cutoff.toISOString()}">…</span> left</p>
        <h3 class="subhead">Kitchen totals</h3>
        ${totals.groups.length ? totals.groups.map((g) => html`
          <p><strong>${g.name}</strong></p>
          <ul>${g.items.map((i) => html`<li>${i.qty} × ${i.item_name}
            <span class="variant__label">(${i.variant_label})</span></li>`)}</ul>`)
          : html`<p class="also">No confirmed orders yet.</p>`}
        <p class="variant__label">${totals.split.pickup} pickup · ${totals.split.delivery} delivery</p>
        <p data-coach="sheets">
          <a class="btn btn--secondary" href="${BASE}/sheet/kitchen/${next.service_date}">Kitchen sheet</a>
          <a class="btn btn--secondary" href="${BASE}/sheet/pickup/${next.service_date}">Pickup sheet</a></p>
      </div>` : weekClosed
        ? html`<div class="card"><p><span class="flag flag--stop">Closed for the week</span></p>
            <p>${week.title} is marked closed — customers are told the kitchen is shut and can
            order nothing on these dates. Reopen it, or start the next week, in This Week.</p></div>`
        : html`<div class="card"><p>No upcoming service days. Build a week to get going.</p></div>`}

    <div class="card">
      <h2>Signing out</h2>
      <p class="also">On the real dashboard this button ends your session and returns you to the
        sign-in screen. In training it does nothing but say so — you are not signed in to
        anything here.</p>
      <form method="post" action="${BASE}/logout">
        <button class="btn btn--secondary" type="submit">Sign out</button></form>
    </div>`;

  return { title: 'Today', body, current: 'today' };
}

/* ============================== ORDERS ================================== */

function ordersPage(d, q) {
  const fDate = q.date ? String(q.date) : '';
  const fMethod = q.method ? String(q.method) : '';
  const fStatus = q.status ? String(q.status) : '';
  const fLocation = q.location ? String(q.location) : '';
  const fQ = q.q ? String(q.q) : '';

  let orders = d.orders.slice();
  if (fDate) orders = orders.filter((o) => o.service_date === fDate);
  if (fMethod) orders = orders.filter((o) => o.method === fMethod);
  if (fStatus) orders = orders.filter((o) => o.status === fStatus);
  if (fLocation) orders = orders.filter((o) => Number(o.location_id) === Number(fLocation));
  if (fQ) {
    const needle = fQ.toLowerCase();
    orders = orders.filter((o) => o.name.toLowerCase().includes(needle)
      || String(o.phone).toLowerCase().includes(needle));
  }
  /* Late requests first, then newest service day. The same order the real list
     uses, because the thing that needs a decision belongs at the top. */
  orders.sort((a, b) => {
    const la = a.status === 'late_request' ? 0 : 1;
    const lb = b.status === 'late_request' ? 0 : 1;
    if (la !== lb) return la - lb;
    if (a.service_date !== b.service_date) return b.service_date.localeCompare(a.service_date);
    return b.id - a.id;
  });

  const paidBy = new Map();
  for (const p of d.payments) if (p.order_id) paidBy.set(p.order_id, p);

  const dates = [...new Set(d.orders.map((o) => o.service_date))].sort().reverse();
  const qs = new URLSearchParams(
    Object.entries(q).filter(([k, v]) => v && k !== 'step').map(([k, v]) => [k, String(v)]),
  ).toString();

  const body = html`
    <h1>Orders</h1>
    ${V.flash(q)}

    <form method="get" action="${BASE}/orders" class="card no-print" data-coach="filters">
      <div class="dl-row">
        <select name="date" style="flex:1 1 150px">
          <option value="">All service days</option>
          ${dates.map((x) => html`<option value="${x}"${fDate === x ? ' selected' : ''}>${L.fmtDayShort(x)}</option>`)}
        </select>
        <select name="method" style="flex:1 1 120px">
          <option value="">Pickup and delivery</option>
          <option value="pickup"${fMethod === 'pickup' ? ' selected' : ''}>Pickup only</option>
          <option value="delivery"${fMethod === 'delivery' ? ' selected' : ''}>Delivery only</option>
        </select>
        <select name="location" style="flex:1 1 150px">
          <option value="">All locations</option>
          ${St.activeLocations(d).map((l) => html`<option value="${l.id}"${Number(fLocation) === l.id ? ' selected' : ''}>${l.name}</option>`)}
        </select>
        <input type="text" name="q" placeholder="Name or phone" value="${fQ}" style="flex:1 1 150px">
        <button class="btn btn--secondary" type="submit">Filter</button>
      </div>
      <p class="also">Downloads below use the filters you've set here.</p>
      <div class="dl-row" data-coach="downloads">
        <a class="btn btn--secondary" href="${BASE}/export/orders.csv?${qs}">Orders CSV</a>
        ${fDate ? html`
          <a class="btn btn--secondary" href="${BASE}/sheet/kitchen/${fDate}">Kitchen sheet</a>
          <a class="btn btn--secondary" href="${BASE}/sheet/pickup/${fDate}">Pickup sheet</a>
          <a class="btn btn--secondary" href="${BASE}/sheet/delivery/${fDate}">Delivery run</a>` : ''}
      </div>
    </form>

    ${orders.length ? orders.map((o) => {
      const late = o.status === 'late_request';
      const pay = paidBy.get(o.id);
      return html`<div class="card"${late ? raw(' data-coach="late"') : ''}>
        <div class="dl-row" style="justify-content:space-between;align-items:baseline">
          <div>
            <strong>${o.name}</strong> · ${o.phone}
            ${late ? html`<span class="flag flag--stop"> LATE REQUEST</span>` : ''}
            ${o.status === 'declined' ? html`<span class="flag flag--warn"> Declined</span>` : ''}
            <br><span class="variant__label">${L.fmtDayLong(o.service_date)} · ${o.ref} · ${o.placed_at}</span>
          </div>
          <div class="tile__n" style="font-size:var(--dbd-step-2)">${L.money(o.total)}</div>
        </div>

        ${o.allergy_notes ? html`
          <div class="notice notice--strong allergy-note"${o.id === 2 ? raw(' data-coach="allergy"') : ''}>
            <strong>Allergy notes:</strong> ${o.allergy_notes}</div>` : ''}

        <ul>${o.lines.map((l) => html`<li>${l.qty} × ${l.item_name}
          <span class="variant__label">(${l.variant_label}, ${L.money(l.unit_price)})</span></li>`)}</ul>

        <p class="variant__label">Food ${L.money(o.subtotal)}${o.method === 'delivery' ? ` · Delivery ${L.money(o.delivery_fee)}` : ''}
          ${o.payment_method ? html` · Paying by <strong>${o.payment_method === 'cash' ? 'cash' : 'e-transfer'}</strong>` : ''}
          ${o.paid ? html` · <span class="flag flag--ok">Paid</span>` : ''}</p>

        ${pay ? html`<p class="variant__label">${L.money(pay.amount)} from
          ${pay.sender_name || 'an unnamed sender'}, ${pay.matched_by === 'auto' ? 'matched automatically' : 'linked by you'}${
            pay.amount !== o.total
              ? html` — <span class="flag flag--warn">${pay.amount < o.total
                  ? `${L.money(o.total - pay.amount)} short` : `${L.money(pay.amount - o.total)} over`}</span>` : ''}</p>` : ''}

        <p>${o.method === 'pickup'
          ? html`<strong>Pickup</strong> ${o.location_name}, anytime ${o.pickup_window}`
          : html`<strong>Delivery</strong> ${o.addr_line}${o.addr_unit ? `, ${o.addr_unit}` : ''}, ${o.postal_norm}
              ${o.addr_notes ? html`<br><span class="variant__label">${o.addr_notes}</span>` : ''}`}</p>

        <div class="dl-row no-print"${!late && o.id === 1 ? raw(' data-coach="flags"') : ''}>
          ${late ? html`
            <form method="post" action="${BASE}/orders/${o.id}/decide" style="display:inline">
              <input type="hidden" name="decision" value="confirmed">
              <button class="btn btn--primary" type="submit">Confirm this late order</button></form>
            <form method="post" action="${BASE}/orders/${o.id}/decide" style="display:inline"
              data-confirm="Decline this late request? ${o.name} will get an email saying you couldn't fit it in. In training the email goes to the Outbox instead.">
              <input type="hidden" name="decision" value="declined">
              <button class="btn btn--secondary" type="submit">Decline</button></form>` : ''}
          <form method="post" action="${BASE}/orders/${o.id}/flag" style="display:inline">
            <input type="hidden" name="field" value="paid">
            <button class="btn btn--secondary" type="submit">${o.paid ? 'Mark as unpaid' : 'Mark as paid'}</button></form>
          <form method="post" action="${BASE}/orders/${o.id}/flag" style="display:inline">
            <input type="hidden" name="field" value="fulfilled">
            <button class="btn btn--secondary" type="submit">
              ${o.fulfilled ? 'Undo' : (o.method === 'pickup' ? 'Mark as picked up' : 'Mark as delivered')}</button></form>
          <form method="post" action="${BASE}/orders/${o.id}/delete" style="display:inline"
            data-confirm="Delete the order from ${o.name} for ${L.fmtDayShort(o.service_date)} — ${L.money(o.total)}? This cannot be undone.">
            <button class="btn btn--secondary" type="submit">Delete</button></form>
        </div>
      </div>`;
    }) : html`<div class="card"><p>No orders match those filters.</p></div>`}`;

  return { title: 'Orders', body, current: 'orders' };
}

/* ============================ PRINT SHEETS ============================== */

function sheetPage(d, kind, date) {
  const orders = d.orders
    .filter((o) => o.service_date === date && o.status === 'confirmed')
    .filter((o) => (kind === 'pickup' ? o.method === 'pickup'
      : kind === 'delivery' ? o.method === 'delivery' : true));

  const titles = {
    kitchen: 'Kitchen sheet',
    pickup: 'Pickup sheet',
    delivery: 'Delivery run',
  };

  let inner;
  if (kind === 'kitchen') {
    const totals = St.kitchenTotals(d, date);
    const allergies = orders.filter((o) => o.allergy_notes);
    inner = html`
      <h2>What to cook</h2>
      ${totals.groups.length ? totals.groups.map((g) => html`
        <p><strong>${g.name}</strong></p>
        <ul>${g.items.map((i) => html`<li>${i.qty} × ${i.variant_label}</li>`)}</ul>`)
        : html`<p>Nothing ordered for this day.</p>`}
      <p>${totals.split.pickup} pickup · ${totals.split.delivery} delivery</p>
      ${allergies.length ? html`
        <h2>Allergy notes</h2>
        <ul>${allergies.map((o) => html`<li><strong>${o.name}</strong> (${o.ref}) — ${o.allergy_notes}</li>`)}</ul>`
        : html`<p class="also">No allergy notes on this day.</p>`}`;
  } else if (kind === 'pickup') {
    inner = html`
      <h2>Who is collecting</h2>
      ${orders.length ? html`<table class="dtable">
        <thead><tr><th>Name</th><th>Phone</th><th>Order</th><th>Where</th><th>Paid</th></tr></thead>
        <tbody>${orders.map((o) => html`<tr>
          <td>${o.name}</td><td>${o.phone}</td>
          <td>${o.lines.map((l) => `${l.qty}× ${l.item_name}`).join(', ')}</td>
          <td>${o.location_name}, ${o.pickup_window}</td>
          <td>${o.paid ? 'yes' : 'NO'}</td></tr>`)}</tbody></table>`
        : html`<p>Nobody is collecting on this day.</p>`}`;
  } else {
    inner = html`
      <h2>Delivery run</h2>
      ${orders.length ? html`<ol>${orders.map((o) => html`<li>
        <strong>${o.name}</strong> · ${o.phone}<br>
        ${o.addr_line}${o.addr_unit ? `, ${o.addr_unit}` : ''}, ${o.postal_norm}
        ${o.addr_notes ? html`<br><em>${o.addr_notes}</em>` : ''}<br>
        ${o.lines.map((l) => `${l.qty}× ${l.item_name}`).join(', ')} — ${L.money(o.total)}
        ${o.paid ? '(paid)' : '(NOT PAID)'}</li>`)}</ol>`
        : html`<p>No deliveries on this day.</p>`}`;
  }

  const body = html`
    <div class="sheet">
      <h1>${titles[kind]} — ${L.fmtDayLong(date)}</h1>
      <p class="variant__label">${d.settings.business_name} · training copy, not for the kitchen</p>
      ${inner}
      <p class="no-print" style="margin-top:var(--dbd-sp-5)">
        <button class="btn btn--primary" type="button" data-print>Print or save as PDF</button>
        <a class="btn btn--secondary" href="${BASE}/orders">Back to orders</a></p>
    </div>`;

  return { title: titles[kind], body, current: 'orders' };
}

/* ============================== OUTBOX ==================================
 * Not a screen the real dashboard has, and the one place this module adds
 * something rather than copying it.
 *
 * The real app emails customers when a late request is decided, emails the
 * owner when a publish is refused, and posts to Facebook. A training module
 * must send none of those — but "nothing happened" teaches the trainee that
 * pressing Decline is free, which is the opposite of true. So everything the
 * sandbox would have sent is collected here instead, and the buttons that
 * would have sent it say so on the spot.
 */
function outboxPage(d, q) {
  const body = html`
    <h1>Outbox</h1>
    ${V.flash(q)}
    <div class="tr-note">
      <strong>This screen is not in the real dashboard.</strong> It exists so you can see what
      you would have sent. Every email and every Facebook post you trigger in training is
      written down here instead of being sent to anybody.
    </div>

    ${d.outbox.length ? d.outbox.slice().reverse().map((m) => html`
      <div class="card">
        <div class="dl-row" style="justify-content:space-between;align-items:baseline">
          <div><strong>${m.subject}</strong><br>
            <span class="variant__label">${m.kind} · to ${m.to} · ${m.at}</span></div>
          <span class="flag flag--warn">Not sent</span>
        </div>
        <p style="white-space:pre-wrap">${m.body}</p>
      </div>`)
      : html`<div class="card"><p>Nothing yet. Confirm or decline a late request in Orders, or
        publish a week to Facebook, and what would have gone out appears here.</p></div>`}

    ${d.outbox.length ? html`
      <form method="post" action="${BASE}/outbox/clear"
        data-confirm="Empty the training outbox?">
        <button class="btn btn--secondary" type="submit">Empty the outbox</button></form>` : ''}`;

  return { title: 'Outbox', body, current: 'outbox' };
}

module.exports = { todayPage, ordersPage, sheetPage, outboxPage };
