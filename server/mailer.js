'use strict';
const nodemailer = require('nodemailer');
const config = require('./config');
const { settings } = require('./db');

const { palette } = require('./theme');
const T = require('./time');
const O = require('./orders');

/**
 * Who the owner-facing mail goes to.
 *
 * One address or several, comma separated. Kept as a plain string because that
 * is what nodemailer takes and what the Settings field holds; the split here
 * only tidies stray spaces and empty entries, so a trailing comma cannot
 * produce an invalid recipient and lose the whole message.
 */
const owners = () => String(settings.get('notify_email', ''))
  .split(',').map((a) => a.trim()).filter(Boolean).join(', ');

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
/* Quotes as well as angle brackets. Every value this is wrapped around today
 * lands in text, where the quotes make no difference — but the name says
 * "escape", the next person to reach for it will put something in an
 * attribute, and an escaper that half-works is worse than one that looks
 * like it doesn't. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

/* `forCustomer` adds the one line only a customer can act on: put the
   reference in the transfer message. The owner's copy leaves it out — he is
   not the one sending the money, and an instruction aimed past him is noise
   on the email he reads at the stove. */
/**
 * The one thing left to do, in the HTML mail, said the same way the screen says
 * it. Written once because two places need it: the confirmation, and a late
 * request once Derek confirms it — that second one gave the total and the
 * payment instructions and never mentioned the code at all, so the customer
 * most likely to be paying late was the one told least about it.
 *
 * The code is set large rather than in the 13px small print it used to share
 * with the caveats: it is copied by hand into a banking app, often from a
 * phone, by someone who may be reading it at arm's length.
 */
function etransferBox(order) {
  return `<div style="border:2px solid ${palette.tan};border-radius:8px;padding:14px;margin:14px 0;
       background:${palette.parchment}">
       <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:${palette.umber}">
         When you send the e-transfer</p>
       <p style="margin:0">Send <strong>${money(order.total)}</strong>, and type this code
         into the <strong>message</strong> box:</p>
       <p style="margin:10px 0;font-family:ui-monospace,Menlo,Consolas,monospace;
         font-size:26px;letter-spacing:2px;font-weight:700;color:${palette.umber}">${esc(order.ref)}</p>
       <p style="margin:0;font-size:14px;color:${palette['umber-soft']}">The code is how Derek knows
         which order your payment is for. Without it, nothing connects the two until someone works
         it out by hand.</p></div>`;
}

function plain(order, lines, heading, { forCustomer = false } = {}) {
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
  if (order.payment_method) parts.push('', `Paying by: ${O.PAYMENT_LABEL(order.payment_method)}`);
  if (order.allergy_notes) parts.push('', `Allergy notes: ${order.allergy_notes}`);
  parts.push('', settings.get('payment_instructions'));
  if (forCustomer && order.payment_method === 'etransfer') {
    /* Set out as a step to follow rather than a sentence to parse, and the code
       on its own line so it survives being read on a phone and copied into a
       banking app. "Message" is the word that app puts on the box. */
    parts.push('',
      'WHEN YOU SEND THE E-TRANSFER',
      `Send ${money(order.total)}, and type this code into the message box:`,
      '',
      `    ${order.ref}`,
      '',
      'The code is how Derek knows which order your payment is for. Without it,',
      'nothing connects the two until someone works it out by hand.');
  }
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
    ${order.payment_method ? `<p><strong>Paying by ${esc(O.PAYMENT_LABEL(order.payment_method))}</strong>
      — as declared by the customer. Nothing is paid until you say so.</p>` : ''}
    ${allergy}
    <p><a href="${config.baseUrl}/admin/orders?date=${order.service_date}"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Open in dashboard</a></p>`);

  return send({
    to: owners(),
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
    <p><strong>Paying:</strong>${order.payment_method
      ? ` you chose ${esc(O.PAYMENT_LABEL(order.payment_method))}.` : ''}
      ${esc(settings.get('payment_instructions'))}</p>
    ${order.payment_method === 'etransfer' ? etransferBox(order) : ''}
    ${tags ? `<p><strong>Allergen information as shown when you ordered</strong></p><ul>${tags}</ul>` : ''}
    <p style="font-size:13px;color:${palette['umber-soft']}">Allergen information is a guide only.
      Every necessary precaution is taken in the kitchen, but cross-contamination remains a
      small possibility. ${esc(settings.get('owner_contact'))}</p>`);

  return send({
    to: order.email,
    subject: late ? `Late request received — ${day}` : `Order confirmed — ${day}`,
    html,
    text: plain(order, lines, late ? 'Late request received (not yet confirmed)' : 'Order confirmed',
      { forCustomer: true }),
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
        + (order.payment_method === 'etransfer' ? etransferBox(order) : '')
      : `<p>${esc(settings.get('owner_contact'))}</p>`}`);
  return send({
    to: order.email,
    subject: confirmed ? `Confirmed — ${day}` : `Couldn't fit your late request — ${day}`,
    html,
    /* forCustomer, because this one goes to the customer and they still have to
       pay it. Without the flag the plain-text copy of a confirmed late order
       carried the total and no instruction to put the code in the message. */
    text: confirmed ? plain(order, lines, 'Your late order is confirmed', { forCustomer: true })
      : `Sorry — Derek wasn't able to fit your late request for ${day} in. ${settings.get('owner_contact')}`,
  });
}

/**
 * `days` may be zero or negative: the check that calls this now also fires for a
 * token that has already died, which it used to pass over in silence. Saying
 * "expires in -3 days" would be worse than the silence, so an expired
 * connection gets its own sentence and its own subject line.
 */
async function tokenExpiryEmail(days, pageName) {
  const gone = days <= 0;
  const when = gone
    ? 'has expired'
    : `expires in ${days} day${days === 1 ? '' : 's'}`;
  const subject = gone
    ? 'Facebook connection has expired'
    : `Facebook connection expires in ${days} days`;
  const why = gone
    ? 'Publishing to the Page will fail until it is reconnected. Copy post text on '
      + 'the week page still works in the meantime.'
    : 'Reconnect it now so publishing doesn\'t fail on a Sunday night.';
  const html = shell(gone ? 'Facebook connection expired' : 'Facebook connection expiring', `
    <p>The Facebook connection for <strong>${esc(pageName)}</strong> ${when}.</p>
    <p>${why}</p>
    <p><a href="${config.baseUrl}/admin/settings"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Reconnect Facebook</a></p>`);
  return send({
    to: owners(),
    subject,
    html,
    text: `The Facebook connection for ${pageName} ${when}. ${why} `
      + `Reconnect at ${config.baseUrl}/admin/settings`,
  });
}

/** A scheduled publish went out on its own. Sent so it is never a surprise. */
async function weekPublishedEmail(week) {
  const title = week.title || 'Your week';
  const html = shell('Week published', `
    <p><strong>${esc(title)}</strong> went live on schedule. Customers can order it now.</p>
    <p>Standing items were not touched.</p>
    <p><a href="${config.baseUrl}/admin/week"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Open This Week</a></p>`);
  return send({
    to: owners(),
    subject: `Published: ${title}`,
    html,
    text: `${title} went live on schedule. ${config.baseUrl}/admin/week`,
  });
}

/**
 * A scheduled publish was refused. This is the email that matters: the week is
 * still a draft, customers see nothing, and it goes out by itself as soon as
 * the reviews are done.
 */
async function weekPublishRefusedEmail(week, blockers) {
  const title = week.title || 'Your week';
  const list = blockers.map((b) => `<li>${esc(b)}</li>`).join('');
  const html = shell('Week not published', `
    <p style="background:${palette.parchment};border-left:4px solid ${palette.umber};padding:10px">
      <strong>${esc(title)} did not go live.</strong> It was due to publish just now, but
      something on it still needs its allergen review. Nothing was published and customers
      see no change.</p>
    <ul>${list}</ul>
    <p>Finish the reviews and it publishes by itself — there is nothing else to press.</p>
    <p><a href="${config.baseUrl}/admin/week"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Finish the review</a></p>`);
  return send({
    to: owners(),
    subject: `Not published: ${title} still needs an allergen review`,
    html,
    text: `${title} did not publish. Still to do:\n\n${blockers.map((b) => `- ${b}`).join('\n')}\n\n`
      + `Finish the reviews and it publishes by itself. ${config.baseUrl}/admin/week`,
  });
}

/**
 * Nothing has been built for the week ahead. The one failure the schedule
 * cannot report itself, since it has no week to refuse.
 *
 * Written to be answerable two ways, because both are legitimate: build it, or
 * close the week on purpose. Closing is offered as plainly as cooking is.
 */
async function weekMissingEmail({ weekStart, publishAt }) {
  const tz = settings.get('timezone');
  const range = T.fmtWeekRange(weekStart, tz);
  const due = publishAt
    ? T.fmtLocal(publishAt, tz, { weekday: 'long', month: 'long', day: 'numeric' })
    : null;
  const html = shell('No menu for next week yet', `
    <p style="background:${palette.parchment};border-left:4px solid ${palette.umber};padding:10px">
      <strong>Nothing is built for ${esc(range)}.</strong>
      ${due ? `It would publish itself on ${esc(due)}, but there is no week for it to publish.` : ''}</p>
    <p>Two ways to settle it, and closing counts:</p>
    <ul>
      <li><strong>Cooking?</strong> Build the week in This Week — Duplicate last week is the quick way —
        and it goes live on schedule once the allergen reviews are done.</li>
      <li><strong>Not cooking?</strong> Close the week. Customers get one clear message for those
        dates instead of a stale menu, and this reminder stops.</li>
    </ul>
    <p>Leave it and nothing breaks: last week's menu simply stays up until you do one or the other.</p>
    <p><a href="${config.baseUrl}/admin/week"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Open This Week</a></p>`);
  return send({
    to: owners(),
    subject: `No menu built for ${range}`,
    html,
    text: `Nothing is built for ${range}.`
      + (due ? ` It would publish itself on ${due}, but there is no week to publish.` : '')
      + `\n\nBuild it, or close the week — both settle it. ${config.baseUrl}/admin/week`,
  });
}

async function signinFailuresEmail({ count, addresses }) {
  const many = addresses > 1;
  const html = shell('Someone is guessing the password', `
    <p style="background:${palette.parchment};border-left:4px solid ${palette.umber};padding:10px">
      <strong>${esc(String(count))} refused sign-ins in the last hour</strong>,
      from ${esc(String(addresses))} ${many ? 'different addresses' : 'address'}.</p>
    <p>Nothing is locked and nothing is broken — the dashboard is still yours to open,
      and each wrong guess now waits a little longer than the one before it.</p>
    <p>Worth doing if this keeps up:</p>
    <ul>
      <li><strong>Change the password</strong> to something longer. That also signs out
        every device, including anything already signed in that shouldn't be.</li>
      <li><strong>Check it isn't you</strong> — a saved password on an old phone retrying
        by itself looks exactly like this.</li>
    </ul>
    <p>You will not get another of these for an hour, however many more arrive.</p>
    <p><a href="${config.baseUrl}/admin"
      style="background:${palette.tan};color:${palette.espresso};padding:10px 16px;
      border-radius:6px;text-decoration:none;display:inline-block">Open the dashboard</a></p>`);
  return send({
    to: owners(),
    subject: `${count} refused sign-ins in the last hour`,
    html,
    text: `${count} refused sign-ins in the last hour, from ${addresses} `
      + `${many ? 'different addresses' : 'address'}.\n\n`
      + `Nothing is locked. If it keeps up, change the password — that signs out every `
      + `device too. ${config.baseUrl}/admin\n\n`
      + `No further alert for an hour.`,
  });
}

module.exports = {
  /* esc and plain are exported for the suite. They were checked by grepping
     this file for "&quot;" and for the word forCustomer, which is an
     assertion about the source rather than about the behaviour: it passes if
     the string is anywhere in the file and fails on a rename that changes
     nothing. Both are pure functions of their arguments, so the suite can
     simply call them. */
  esc, plain,
  send, ownerOrderEmail, customerOrderEmail, lateDecisionEmail, tokenExpiryEmail,
  weekPublishedEmail, weekPublishRefusedEmail, weekMissingEmail, signinFailuresEmail,
  configured: () => !!config.smtp.host,
};
