'use strict';

/**
 * PAYMENTS — BUILT AND NOT IN USE YET.
 *
 * This screen is finished. Every control on it works against the sandbox: the
 * paste box reads a notification, the suggestions rank themselves the way the
 * real reconciler does, links and unlinks behave, and the wording matches the
 * real screen's.
 *
 * It is switched off in sections.js because the real Payments screen is still
 * being finished, and training somebody on a screen that is about to change
 * teaches them something they will have to unlearn. Nothing here is loaded
 * into the navigation or the walkthrough while that flag is false, and the
 * routes answer 404.
 *
 * To turn it on: set `enabled: true` on the payments row in sections.js. There
 * is nothing else to do — no route to add, no link to write, no step to insert.
 * The walkthrough already has its five steps waiting in coach.js.
 */

const { html, raw } = require('../../html');
const L = require('../lib');
const St = require('../store');
const V = require('./layout');

const BASE = V.BASE;

/** Why a suggested match is being suggested. */
const REASONS = {
  exact: 'Reference and amount both match',
  ref_mismatch: 'Reference matches, amount does not',
  amount_only: 'The only unpaid order owed exactly this',
  name: 'The sender name matches the customer',
};

/* A sample notification, so the trainee has something to paste. */
const SAMPLE_NOTIFICATION = `INTERAC e-Transfer: A money transfer from WES NAKAMURA has been automatically deposited.

Amount: $30.50 (CAD)
Message: dinner thursday
Deposited into: Chequing ****4417`;

const stamp = (s) => String(s || '').replace('T', ' ').slice(0, 16);

function paymentsPage(d, q) {
  const unmatched = d.payments.filter((p) => !p.order_id);
  const matched = d.payments.filter((p) => p.order_id);
  const unpaid = St.unpaidOrders(d);
  const awaiting = unpaid.filter((o) => o.payment_method === 'etransfer' && o.status !== 'declined');

  const body = html`
    <h1>Payments</h1>
    ${V.flash(q)}
    <p class="also">Money that has arrived, and the orders still waiting for it.
      Nothing here talks to a bank — it reads the notification emails your bank sends.</p>

    <form method="post" action="${BASE}/payments/record" class="card no-print" data-coach="paste">
      <label for="notification"><strong>Paste an e-transfer notification</strong></label>
      <p class="also">The whole email, or just its text. If the customer put their order
        reference in the transfer message and the amount matches, the order is marked paid on
        the spot. Anything less certain waits for you below.</p>
      <textarea id="notification" name="notification" rows="6" required
        placeholder="Paste the email from your bank here.">${SAMPLE_NOTIFICATION}</textarea>
      <button class="btn btn--primary" type="submit">Read it</button>
    </form>

    <h2 class="subhead">Money with no order yet${unmatched.length ? html` (${unmatched.length})` : ''}</h2>
    <div data-coach="unmatched">
    ${unmatched.length ? unmatched.map((p) => {
      const suggestions = St.candidatesFor(d, p);
      const short = suggestions.some((c) => c.order.total !== p.amount);
      return html`<div class="card"${short ? raw(' data-coach="short"') : ''}>
        <div class="dl-row" style="justify-content:space-between;align-items:baseline">
          <div><strong>${p.sender_name || 'Sender not recognised'}</strong>
            <br><span class="variant__label">${stamp(p.received_at)}${p.source === 'mailbox' ? ' · from the mailbox' : ''}</span></div>
          <div class="tile__n" style="font-size:var(--dbd-step-2)">${L.money(p.amount)}</div>
        </div>
        ${p.memo ? html`<p>Message: <strong>${p.memo}</strong></p>`
          : html`<p class="also">No message came with this transfer.</p>`}

        ${suggestions.length ? suggestions.map((c) => html`
          <form method="post" action="${BASE}/payments/${p.id}/link" class="dl-row"
            style="align-items:baseline;gap:var(--dbd-sp-3)">
            <input type="hidden" name="order_id" value="${c.order.id}">
            <button class="btn ${c.reason === 'exact' ? 'btn--primary' : 'btn--secondary'}" type="submit">
              This is ${c.order.name} · ${c.order.ref} · ${L.money(c.order.total)}</button>
            <span class="variant__label">${REASONS[c.reason]}${
              c.order.total !== p.amount
                ? ` · ${c.order.total > p.amount
                    ? `${L.money(c.order.total - p.amount)} short`
                    : `${L.money(p.amount - c.order.total)} over`}`
                : ''}${c.taken ? ' · that order is already settled by another payment' : ''}</span>
          </form>`)
          : html`<p class="also">Nothing matches this one.</p>`}

        <form method="post" action="${BASE}/payments/${p.id}/link" class="dl-row" style="align-items:baseline">
          <select name="order_id" style="flex:1 1 220px">
            <option value="">Pick the order by hand…</option>
            ${unpaid.map((o) => html`<option value="${o.id}">${o.name} · ${o.ref} · ${L.money(o.total)} · ${L.fmtDayShort(o.service_date)}${o.payment_method === 'cash' ? ' · said cash' : ''}</option>`)}
          </select>
          <button class="btn btn--secondary" type="submit">Link</button>
        </form>
      </div>`;
    }) : html`<div class="card"><p>No unclaimed payments. Everything that came in has an order.</p></div>`}
    </div>

    <h2 class="subhead">Still waiting on an e-transfer${awaiting.length ? html` (${awaiting.length})` : ''}</h2>
    <div data-coach="awaiting">
    ${awaiting.length ? html`<table class="dtable">
      <thead><tr><th>Customer</th><th>Service day</th><th>Reference</th><th>Owed</th></tr></thead>
      <tbody>${awaiting.map((o) => html`<tr>
        <td data-label="Customer"><strong>${o.name}</strong><br><span class="variant__label">${o.phone}</span></td>
        <td data-label="Service day">${L.fmtDayShort(o.service_date)}</td>
        <td data-label="Reference">${o.ref}</td>
        <td data-label="Owed">${L.money(o.total)}</td></tr>`)}</tbody></table>`
      : html`<div class="card"><p>Nobody owes an e-transfer.</p></div>`}
    </div>

    ${matched.length ? html`
      <h2 class="subhead">Matched</h2>
      <table class="dtable">
        <thead><tr><th>From</th><th>Amount</th><th>Order</th><th>How</th><th></th></tr></thead>
        <tbody>${matched.map((p, i) => {
          const o = St.byId(d.orders, p.order_id);
          return html`<tr>
            <td data-label="From">${p.sender_name || '—'}<br><span class="variant__label">${stamp(p.received_at)}</span></td>
            <td data-label="Amount">${L.money(p.amount)}${o && p.amount !== o.total
              ? html`<br><span class="flag flag--warn">order was ${L.money(o.total)}</span>` : ''}</td>
            <td data-label="Order">${o ? html`${o.name} · ${o.ref}` : html`<em>that order was deleted</em>`}</td>
            <td data-label="How">${p.matched_by === 'auto' ? 'Automatically' : 'By you'}</td>
            <td data-label=""${i === 0 ? raw(' data-coach="unlink"') : ''}>
              <form method="post" action="${BASE}/payments/${p.id}/unlink"
                data-confirm="Unlink this payment from ${o ? `${o.name}'s order` : 'that order'}?">
                <button class="btn btn--secondary" type="submit">Unlink</button></form></td>
          </tr>`;
        })}</tbody></table>` : ''}`;

  return { title: 'Payments', body, current: 'payments' };
}

/* --- The writes, kept here with the screen they belong to ---------------- */

/** Read a pasted notification and file it. Returns what to say back. */
function record(d, text) {
  const read = St.readNotification(text);
  if (!read) {
    return { ok: false, message: "That didn't read like a payment notification — no amount in it. Paste the whole email." };
  }
  const duplicate = d.payments.some((p) => p.amount === read.amount
    && String(p.memo || '') === String(read.memo || '')
    && String(p.sender_name || '') === String(read.sender_name || ''));
  if (duplicate) {
    return { ok: false, message: 'That notification is already recorded.' };
  }

  const payment = {
    id: d.seq.payment++,
    amount: read.amount,
    sender_name: read.sender_name,
    memo: read.memo,
    received_at: `${L.today()}T${new Date().toISOString().slice(11, 16)}`,
    source: 'pasted',
    order_id: null,
    matched_by: null,
    set_paid: 0,
  };
  d.payments.push(payment);

  /* Settled on the spot only when the reference and the amount both agree.
     Anything less certain is left for a person to look at, which is the whole
     argument of this screen. */
  const byRef = read.ref && d.orders.find((o) => o.ref.toUpperCase() === read.ref);
  const free = byRef && !d.payments.some((p) => p.id !== payment.id && p.order_id === byRef.id);
  if (byRef && free && byRef.total === payment.amount) {
    payment.order_id = byRef.id;
    payment.matched_by = 'auto';
    payment.set_paid = byRef.paid ? 0 : 1;
    byRef.paid = 1;
    return {
      ok: true,
      message: `Matched automatically: ${L.money(payment.amount)} from `
        + `${payment.sender_name || 'an unnamed sender'} settles ${byRef.name}'s order `
        + `${byRef.ref}. Marked as paid.`,
    };
  }

  const n = St.candidatesFor(d, payment).length;
  return {
    ok: true,
    message: n
      ? `Recorded ${L.money(payment.amount)}. ${n === 1 ? 'One order looks like a match' : `${n} orders look like matches`} — pick one below.`
      : `Recorded ${L.money(payment.amount)}, but nothing matches it. It's in the list below.`,
  };
}

/** Link a payment to an order by hand. */
function link(d, paymentId, orderId) {
  const p = St.byId(d.payments, paymentId);
  const o = St.byId(d.orders, orderId);
  if (!p || !o) return { err: 'That payment or order no longer exists.' };

  if (p.order_id) {
    const other = St.byId(d.orders, p.order_id);
    return {
      err: `That payment is already linked to ${other ? `${other.name}'s order ${other.ref}` : 'another order'}. `
        + 'Unlink it there first — that puts the other order back exactly as it was.',
    };
  }
  const held = d.payments.find((x) => x.id !== p.id && x.order_id === o.id);
  if (held) {
    return {
      err: `${o.name}'s order ${o.ref} already has ${L.money(held.amount)} against it`
        + `${held.sender_name ? ` from ${held.sender_name}` : ''}. Unlink that payment first if `
        + 'this is the one that really paid for it. If both are real, leave this one unclaimed '
        + '— two transfers for one order is worth being able to see.',
    };
  }

  p.order_id = o.id;
  p.matched_by = 'owner';
  /* Remembered, so unlinking can put the order back exactly as it was: a tick
     the owner made by hand is not this payment's to undo. */
  p.set_paid = o.paid ? 0 : 1;
  const wasPaid = o.paid;
  o.paid = 1;
  return {
    ok: wasPaid
      ? `Linked. ${o.name}'s order ${o.ref} was already marked paid, so nothing else changed.`
      : `Linked. ${o.name}'s order ${o.ref} is marked as paid.`,
  };
}

function unlink(d, paymentId) {
  const p = St.byId(d.payments, paymentId);
  if (!p || !p.order_id) return { err: 'That payment is not linked to anything.' };
  const o = St.byId(d.orders, p.order_id);
  const undo = p.set_paid;
  p.order_id = null;
  p.matched_by = null;
  p.set_paid = 0;
  if (o && undo) o.paid = 0;
  return {
    ok: undo
      ? `Unlinked, and ${o ? o.name : 'that customer'}'s order is unpaid again.`
      : `Unlinked. ${o ? o.name : 'That customer'}'s order stays marked paid — you had marked it yourself.`,
  };
}

module.exports = { paymentsPage, record, link, unlink, SAMPLE_NOTIFICATION, REASONS };
