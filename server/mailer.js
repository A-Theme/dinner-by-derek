'use strict';
const nodemailer = require('nodemailer');
const config = require('./config');
const { settings } = require('./db');
const { palette } = require('./theme');
const T = require('./time');

let transport = null;
function tx() {
  if (transport) return transport;
  if (!config.smtp.host) return null;
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
}

const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shell(title, inner) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:${palette.parchment};
    font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:${palette.espresso}">
  <div style="max-width:560px;margin:0 auto;background:${palette['cream-hi']};
       border:1px solid ${palette.tan};border-radius:10px;overflow:hidden">
    <div style="background:${palette.olive};color:${palette.parchment};padding:16px 20px">
      <div style="font-size:18px;font-weight:700">${esc(settings.get('business_name'))}</div>
    </div>
    <div style="padding:20px">
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:${palette.umber}">${esc(title)}</h1>
      ${inner}
    </div>
  </div></body></html>`;
}

function linesTable(lines) {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines.map((l) => `
    <tr><td style="padding:6px 0;border-bottom:1px solid ${palette.parchment}">
      ${l.qty} × ${esc(l.item_name)} <span style="color:${palette['umber-soft']}">(${esc(l.variant_label)})</span>
    </td><td align="right" style="padding:6px 0;border-bottom:1px solid ${palette.parchment}">
      ${money(l.unit_price * l.qty)}</td></tr>`).join('')}</table>`;
}

function fulfilBlock(order) {
  const tz = settings.get('timezone');
  if (order.method === 'pickup') {
    return `<p><strong>Pickup</strong><br>${esc(order.location_name)}<br>
      ${esc(order.location_addr)}<br>Anytime ${esc(order.pickup_window)}</p>`;
  }
  return `<p><strong>Delivery</strong><br>${esc(order.addr_line)}
    ${order.addr_unit ? `, ${esc(order.addr_unit)}` : ''}<br>
    ${esc(order.postal_norm)}<br>${esc(settings.get('delivery_window'))}</p>`;
}

function plain(order, lines, heading) {
  const tz = settings.get('timezone');
  const parts = [
    heading, '',
    `Service day: ${T.fmtDayLong(order.service_date, tz)}`,
    `Reference: ${order.ref}`, '',
    ...lines.map((l) => `${l.qty} x ${l.item_name} (${l.variant_label}) — ${money(l.unit_price * l.qty)}`),
    '',
    `Food subtotal: ${money(order.subtotal)}`,
  ];
  if (order.method === 'delivery') parts.push(`Delivery: ${money(order.delivery_fee)}`);
  parts.push(`Total: ${money(order.total)}`, '');
  parts.push(order.method === 'pickup'
    ? `Pickup: ${order.location_name}, ${order.location_addr}, anytime ${order.pickup_window}`
    : `Delivery: ${order.addr_line}${order.addr_unit ? ', ' + order.addr_unit : ''}, ${order.postal_norm}`);
  if (order.allergy_notes) parts.push('', `Allergy notes: ${order.allergy_notes}`);
  parts.push('', settings.get('payment_instructions'));
  return parts.join('\n');
}

async function send({ to, subject, html, text }) {
  const t = tx();
  if (!t || !to) {
    console.warn(`[mail] not sent (SMTP not configured or no recipient): ${subject}`);
    return { sent: false };
  }
  try {
    await t.sendMail({ from: config.smtp.from || config.smtp.user, to, subject, html, text });
    return { sent: true };
  } catch (e) {
    // Never let a mail failure lose an order that is already stored.
    console.error('[mail] send failed:', e.message);
    return { sent: false, error: e.message };
  }
}

/* --- Owner ---------------------------------------------------------------- */
async function ownerOrderEmail(order, lines) {
  const tz = settings.get('timezone');
  const late = order.status === 'late_request';
  const day = T.fmtDayLong(order.service_date, tz);
  const subject = `${late ? '[LATE REQUEST] ' : ''}${day} — ${order.method === 'pickup' ? 'Pickup' : 'Delivery'} — ${order.name}`;

  const allergy = order.allergy_notes
    ? `<div style="border:2px solid ${palette.umber};border-radius:8px;padding:12px;margin:12px 0;
         background:${palette.parchment}">
         <strong style="color:${palette.umber}">Allergy notes from the customer</strong>
         <p style="margin:6px 0 0;font-size:16px">${esc(order.allergy_notes)}</p></div>`
    : `<p style="color:${palette['umber-soft']}">No allergy notes given.</p>`;

  const html = shell(late ? 'Late request' : 'New order', `
    ${late ? `<p style="background:${palette.parchment};border-left:4px solid ${palette.umber};
        padding:10px">This came in after the cutoff. Confirm or decline it in the dashboard.</p>` : ''}
    <p><strong>${esc(day)}</strong><br>${esc(order.name)} — ${esc(order.phone)}
      ${order.email ? `<br>${esc(order.email)}` : ''}</p>
    ${linesTable(lines)}
    <p>Food subtotal ${money(order.subtotal)}
      ${order.method === 'delivery' ? `<br>Delivery ${money(order.delivery_fee)}` : ''}
      <br><strong>Total ${money(order.total)}</strong></p>
    ${fulfilBlock(order)}
    ${allergy}
    <p><a href="${config.baseUrl}/admin/orders?date=${order.service_date}"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Open in dashboard</a></p>`);

  return send({
    to: settings.get('notify_email'),
    subject,
    html,
    text: plain(order, lines, late ? 'LATE REQUEST' : 'New order'),
  });
}

/* --- Customer ------------------------------------------------------------- */
async function customerOrderEmail(order, lines) {
  if (!order.email) return { sent: false };
  const tz = settings.get('timezone');
  const late = order.status === 'late_request';
  const day = T.fmtDayLong(order.service_date, tz);

  const tags = lines
    .filter((l) => l.allergens && l.allergens.length)
    .map((l) => `<li>${esc(l.item_name)}: contains ${l.allergens.map(esc).join(', ')}</li>`)
    .join('');

  const html = shell(late ? 'Your late request' : 'Your order is confirmed', `
    ${late
      ? `<p style="background:${palette.parchment};border-left:4px solid ${palette.umber};padding:10px">
         <strong>Not confirmed yet.</strong> Ordering had closed for ${esc(day)}, so Derek
         will confirm this personally and get back to you.</p>`
      : `<p>Thanks ${esc(order.name)} — you're on the list for <strong>${esc(day)}</strong>.</p>`}
    ${linesTable(lines)}
    <p>Food subtotal ${money(order.subtotal)}
      ${order.method === 'delivery' ? `<br>Delivery ${money(order.delivery_fee)}` : ''}
      <br><strong>Total owed ${money(order.total)}</strong></p>
    ${fulfilBlock(order)}
    <p><strong>Paying:</strong> ${esc(settings.get('payment_instructions'))}</p>
    ${tags ? `<p><strong>Allergen information as shown when you ordered</strong></p><ul>${tags}</ul>` : ''}
    <p style="font-size:13px;color:${palette['umber-soft']}">Allergen information is a guide only.
      Dishes are prepared in a shared home kitchen where cross-contamination is possible.
      ${esc(settings.get('owner_contact'))}</p>`);

  return send({
    to: order.email,
    subject: late ? `Late request received — ${day}` : `Order confirmed — ${day}`,
    html,
    text: plain(order, lines, late ? 'Late request received (not yet confirmed)' : 'Order confirmed'),
  });
}

async function lateDecisionEmail(order, lines, decision) {
  if (!order.email) return { sent: false };
  const day = T.fmtDayLong(order.service_date, settings.get('timezone'));
  const confirmed = decision === 'confirmed';
  const html = shell(confirmed ? 'Your late order is confirmed' : 'About your late request', `
    <p>${confirmed
      ? `Good news — Derek confirmed your late order for <strong>${esc(day)}</strong>.`
      : `Sorry — Derek wasn't able to fit your late request for <strong>${esc(day)}</strong> in.`}</p>
    ${confirmed ? linesTable(lines) + fulfilBlock(order)
      + `<p><strong>Total owed ${money(order.total)}</strong></p>
         <p>${esc(settings.get('payment_instructions'))}</p>`
      : `<p>${esc(settings.get('owner_contact'))}</p>`}`);
  return send({
    to: order.email,
    subject: confirmed ? `Confirmed — ${day}` : `Couldn't fit your late request — ${day}`,
    html,
    text: confirmed ? plain(order, lines, 'Your late order is confirmed')
      : `Sorry — Derek wasn't able to fit your late request for ${day} in. ${settings.get('owner_contact')}`,
  });
}

async function tokenExpiryEmail(days, pageName) {
  const html = shell('Facebook connection expiring', `
    <p>The Facebook connection for <strong>${esc(pageName)}</strong> expires in
      ${days} day${days === 1 ? '' : 's'}.</p>
    <p>Reconnect it now so publishing doesn't fail on a Sunday night.</p>
    <p><a href="${config.baseUrl}/admin/settings"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Reconnect Facebook</a></p>`);
  return send({
    to: settings.get('notify_email'),
    subject: `Facebook connection expires in ${days} days`,
    html,
    text: `The Facebook connection for ${pageName} expires in ${days} days. Reconnect at ${config.baseUrl}/admin/settings`,
  });
}

module.exports = {
  send, ownerOrderEmail, customerOrderEmail, lateDecisionEmail, tokenExpiryEmail,
  configured: () => !!config.smtp.host,
};
