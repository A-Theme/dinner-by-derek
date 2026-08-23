'use strict';
const crypto = require('crypto');
const { db } = require('./db');

/**
 * Money that has actually arrived, and which order it belongs to.
 *
 * No money moves through this app, so nothing here talks to a bank. Interac
 * has no API a supper club can call; the only signal available is the
 * notification email the bank sends when a transfer lands. This module reads
 * one of those, stores what it could understand, and decides — carefully —
 * whether it can name the order that paid for it.
 *
 * The rule the rest of the app is built on still holds: `paid` is a fact
 * about money, not about intent, and a customer choosing "E-transfer" on the
 * order form has not paid. See PAYMENT_METHODS in orders.js.
 *
 * This module is allowed to set `paid` on its own, but only on the one rung
 * where two independent facts agree: the customer typed the order reference
 * into the transfer message, AND the amount is exactly the order total. A
 * reference alone could be a typo; an amount alone is shared by every order
 * of the same size that week. Together they are as good as Derek reading the
 * email himself — and every automatic match records that it was automatic
 * and stays reversible. Every weaker signal produces a suggestion and waits.
 */

/* --- Parsing ------------------------------------------------------------
 * Banks word these differently and rewrite the template without telling
 * anyone, so nothing here assumes one layout. Each field is looked for
 * several ways and is allowed to come back empty: a notification that could
 * only be half read is still worth storing, because a person can finish it
 * on the reconcile screen. Returning null is reserved for text with no money
 * in it at all, which is not a payment notification by any reading.
 */

/* One or two decimal places, not exactly two. "$25.50" is what a bank sends and
 * "$25.5" is what a person types, and the old pattern read the second as $25.00
 * — it matched "25", stopped, and threw the ".5" away. Silently fifty cents
 * light, which then fails the exact-amount test and drops a transfer that would
 * have matched into the pile waiting for a person. Wrong in the safe direction,
 * and still wrong. */
const AMOUNT_RE = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;

/**
 * Every quantifier here is bounded, and that is not tidiness.
 *
 * These patterns all had the same shape: a lazy `([^\n,]+?)` with no ceiling,
 * followed by `\s+`, over a character class that itself matches spaces. On text
 * that does not match, the engine has to try every way of splitting a run of
 * whitespace between the two, and the cost climbs about cubically. Measured on
 * the old `^\s*([^\n,]+?)\s+sent you\b`: 500 spaces took 232ms, 1,000 took
 * 486ms, 2,000 took 3.5s and 4,000 took 26.5 seconds.
 *
 * This module runs on one thread that also serves the menu, so those 26 seconds
 * are 26 seconds in which nobody can read a menu or place an order. The trigger
 * does not have to be an attack: a forwarded notification carrying a rendered
 * table or quoted-printable padding is a long run of spaces on one line.
 *
 * It matters more than the paste screen suggests. `record()` is the documented
 * entry point for the mailbox poller, and the moment that exists this becomes
 * reachable by anyone who can send an email to the address it reads.
 *
 * The ceilings are the ones the code already imposes downstream: a sender name
 * is stored `.slice(0, 120)` and a memo `tidy()`s to 200, so matching further
 * than that was never going to be kept. Line-leading whitespace is `[ \t]`
 * rather than `\s`, because `\s` crosses newlines and these are anchored to a
 * line — which was a second source of the same ambiguity.
 */
/**
 * Interac writes its details as a grid, not as sentences.
 *
 * Every field in a real notification looks like this — the label alone on one
 * line, a blank line, then the value:
 *
 *     Message:
 *
 *     Order A1B2C3D4
 *
 *     Date:
 *
 *     Aug 23, 2026
 *
 * which is what a two-column HTML table flattens to. Patterns written for
 * `Label: value` find nothing in it, and the field that matters most is the
 * message: it is the only part of a transfer the customer controls, so it is
 * where the order reference travels, and it is the difference between a
 * payment that settles itself and one that waits for Derek.
 *
 * The lookahead is the guard. Reading forward to the next non-empty line means
 * that a label with no value under it — an empty message, a field this bank
 * leaves blank — would otherwise swallow the *next label* as its value. Naming
 * the labels this format uses is not elegant, but a memo that reads "Date:"
 * would be worse: memos are what the automatic match reads.
 */
const GRID_LABEL = '(?:date|reference number|sent from|amount|message|sent by|memo)';
const gridValue = (label) => new RegExp(
  `^[ \\t]{0,20}${label}[ \\t]{0,20}:[ \\t]{0,20}\\n(?:[ \\t]{0,20}\\n){0,4}`
  + `[ \\t]{0,20}(?!${GRID_LABEL}[ \\t]{0,20}:[ \\t]{0,20}$)(.{1,200}?)[ \\t]{0,20}$`,
  'im');

const SENDER_PATTERNS = [
  /* Interac puts the customer's name in the From: display name and its own
     address after it, on the original and inside a forward alike. It is the
     only place the name appears as a field rather than inside a sentence, so
     it is tried first and anchored to the address it must not be confused
     with — Derek's own From: line, or the customer's real email. */
  /^[ \t]{0,20}From[ \t]{0,20}:[ \t]{0,20}([^<\n]{1,120}?)[ \t]{0,20}<[^>\n]{0,120}@payments\.interac\.ca>/im,
  gridValue('sent from'),
  /INTERAC[^:\n]{0,80}[:\s-]{1,10}[ \t]{0,10}([^\n,]{1,120}?)\s{1,20}sent you\b/i,
  /(?:money transfer|funds|transfer|e-?transfer)\s{1,20}from\s{1,20}([^\n,]{1,120}?)\s{1,20}(?:has|have|was|were)\b/i,
  /* The subject names the sender inside a sentence that carries on past it:
     "…received $37.00 from KRISTYN CLAIRMONT and it has been automatically
     deposited." Stopping at the clause rather than at the full stop is the
     difference between a name and a paragraph — a header that happens to wrap
     after the name used to look like this pattern working. */
  /you(?:'ve| have)?\s{1,20}received\s{1,20}(?:\$[\d.,]{1,20}\s{1,20})?from\s{1,20}([^\n,.]{1,120}?)(?=\s{1,20}and\s|\s{0,20}[.,]|\s{0,20}$)/i,
  /^[ \t]{0,20}Sent by[ \t]{0,20}:[ \t]{0,20}(.{1,120}?)[ \t]{0,20}$/im,
  /^[ \t]{0,20}([^\n,]{1,120}?)\s{1,20}sent you\b/im,
];

const MEMO_PATTERNS = [
  /^[ \t]{0,20}(?:sender'?s?[ \t]{1,20})?message[ \t]{0,20}:[ \t]{0,20}(.{1,200}?)[ \t]{0,20}$/im,
  gridValue('message'),
  /^[ \t]{0,20}message from [^:\n]{1,120}:[ \t]{0,20}(.{1,200}?)[ \t]{0,20}$/im,
  /^[ \t]{0,20}memo[ \t]{0,20}:[ \t]{0,20}(.{1,200}?)[ \t]{0,20}$/im,
];

/**
 * A ceiling on the text itself, as the second half of the same guard.
 *
 * Bounded quantifiers cap the work done at each starting position; this caps
 * how many starting positions there are. A real Interac notification is a few
 * kilobytes, and the body parser already refuses anything over a megabyte, so
 * this only ever bites on something that was never a notification.
 */
const MAX_INPUT = 100_000;

/** Cents from "$1,234.56", "$25.00" or "$25". */
function cents(str) {
  const n = Number(String(str).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const utcStamp = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

const tidy = (s) => String(s == null ? '' : s)
  .replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').slice(0, 200);

function firstMatch(patterns, text) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && tidy(m[1])) return tidy(m[1]);
  }
  return '';
}

/**
 * Read one notification email into the fields that can be acted on.
 *
 * Takes the whole message when it is available — headers give a stable
 * identity and the real arrival time — but works on a pasted body alone,
 * which is what forwarding one by hand produces.
 */
function parseNotification(input) {
  const text = String(input == null ? '' : input).replace(/\r\n/g, '\n').slice(0, MAX_INPUT);
  if (!text.trim()) return null;

  const subject = tidy((text.match(/^Subject\s*:[ \t]*(.+)$/im) || [])[1] || '');
  const dateHeader = ((text.match(/^Date\s*:[ \t]*(.+)$/im) || [])[1] || '').trim();

  /* Headers fold. Outlook and SES both put a long Message-ID on the line after
     its own name, and requiring the `<` to sit on the same line quietly threw
     away the bank's own guarantee that one email is seen once.
     `[ \t]*\n?[ \t]*` steps over exactly one fold and nothing else. */
  const header = (name) => ((text.match(
    new RegExp(`^${name}\\s*:[ \\t]{0,20}\\n?[ \\t]{0,20}<([^>\\n]{1,200})>`, 'im')) || [])[1] || '').trim();

  /* A forwarded notification carries two identities: the forward's own, and —
     in In-Reply-To and References — the identity of the notification Interac
     sent. The second is the one that belongs to the money. Preferring it means
     the same transfer is recognised as one payment however it arrives: read
     straight out of Derek's mailbox, forwarded once, or forwarded twice. */
  const messageId = header('In-Reply-To') || header('References') || header('Message-ID');

  // The subject carries the amount on every format seen so far and never
  // carries a second one; a body can hold a fee line or an account balance.
  const amountMatch = subject.match(AMOUNT_RE) || text.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amount = cents(amountMatch[1]);
  if (amount == null || amount <= 0) return null;

  /* The body before the subject, which is the opposite of the amount above.
     An amount is safer read from the subject because a body can hold a second
     one; a name is safer read from the body, because there it is a field with
     an end, and in the subject it is a phrase inside a sentence that runs on
     past it. Whether that sentence happened to wrap after the name is not
     something to let decide what gets stored. */
  let senderName = firstMatch(SENDER_PATTERNS, text) || firstMatch(SENDER_PATTERNS, subject);
  // A From: header names the bank, not the customer. Never let one through.
  if (senderName.includes('@')) senderName = '';

  const memo = firstMatch(MEMO_PATTERNS, text);

  let receivedAt = null;
  if (dateHeader) {
    const d = new Date(dateHeader);
    if (!Number.isNaN(d.getTime())) receivedAt = utcStamp(d);
  }

  /* Identity. A real Message-ID is the bank's own guarantee that one email is
   * seen once. Without headers the text is hashed instead, so pasting the
   * same notification twice is caught rather than counted twice.
   *
   * Two genuinely separate transfers identical in every visible character —
   * same sender, same cent, same message, no timestamp — would collide here,
   * and the second is refused as a duplicate. That is the safer way to be
   * wrong: nothing gets marked paid that wasn't, and "Mark as paid" is still
   * there for the one that was swallowed. */
  const externalId = messageId
    ? `msgid:${messageId}`
    : `sha256:${crypto.createHash('sha256').update(text.trim()).digest('hex')}`;

  return {
    external_id: externalId,
    received_at: receivedAt,
    sender_name: tidy(senderName).slice(0, 120),
    amount,
    memo: tidy(memo),
    subject: subject.slice(0, 200),
    // Whether the message field was found as a field, rather than guessed at
    // from loose text. Only a parsed memo may drive an automatic match.
    memo_parsed: memo ? 1 : 0,
  };
}

/* --- References ----------------------------------------------------------
 * An order reference is four random bytes printed as eight hex characters.
 * Anything shaped like one is a candidate; only a lookup makes it real, so a
 * bank's own reference number that happens to be eight hex characters finds
 * no order and falls through to the manual path.
 */
const REF_RE = /\b[0-9A-Fa-f]{8}\b/g;

function refsIn(text) {
  const seen = new Set();
  for (const m of String(text == null ? '' : text).matchAll(REF_RE)) {
    seen.add(m[0].toUpperCase());
  }
  return [...seen];
}

/** The orders whose reference appears in this text. */
function ordersNamedIn(text) {
  const refs = refsIn(text);
  if (!refs.length) return [];
  const stmt = db.prepare('SELECT * FROM orders WHERE ref = ?');
  return refs.map((r) => stmt.get(r)).filter(Boolean);
}

/* --- Matching ------------------------------------------------------------ */

/** Name comparison that survives "Jane A. Smith" against "Jane Smith". */
function nameTokens(s) {
  // Accents stripped rather than compared: banks and order forms disagree
  // about them constantly, and "Renee" must find "Renée".
  const words = String(s == null ? '' : s)
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean);
  /* Three letters is the right floor for an ordinary name — it drops the
   * initials and the "de"s and "van"s that would otherwise match everybody.
   * Applied without a fallback it also drops some names entirely: "Li Wu" has
   * no token three letters long, so the set came back empty, nameOverlap
   * returned 0, and that customer could never be suggested by name at all.
   * Whose names those are is not evenly distributed, which is what makes it
   * worth the extra line.
   *
   * So the floor is a preference rather than a rule: keep the long tokens when
   * there are any, and fall back to the short ones when there are not. A name
   * made only of short words is matched on those words, and every match here is
   * a suggestion a person still has to accept. */
  const long = words.filter((w) => w.length >= 3);
  return new Set(long.length ? long : words.filter((w) => w.length >= 2));
}

function nameOverlap(a, b) {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

/**
 * The orders this payment could belong to, best first, each with its reason.
 *
 * Ordered by how much is actually known, not by how likely it feels:
 *
 *   exact          the reference is in the message and the amount agrees
 *   ref_mismatch   the reference is in the message, the amount is not
 *   amount_only    exactly one open order is owed exactly this much
 *   name           the sender's name matches the customer's
 *
 * Only `exact` is ever applied without a person. The rest are shown.
 */
function candidatesFor(payment, { windowDays = 45 } = {}) {
  const paymentFor = db.prepare('SELECT * FROM payments WHERE order_id = ?');
  const out = [];
  const push = (order, reason) => {
    if (!order || out.some((c) => c.order.id === order.id)) return;
    const taken = paymentFor.get(order.id);
    out.push({
      order,
      reason,
      // Already settled by another notification. Still shown, so a genuine
      // double payment is visible rather than silently dropped, but never
      // applied on its own.
      taken: taken && taken.id !== payment.id ? taken : null,
    });
  };

  if (payment.memo_parsed) {
    for (const order of ordersNamedIn(payment.memo)) {
      push(order, order.total === payment.amount ? 'exact' : 'ref_mismatch');
    }
  }

  const open = db.prepare(`
    SELECT * FROM orders
    WHERE status != 'declined' AND placed_at >= datetime('now', ?)
    ORDER BY placed_at DESC LIMIT 400`).all(`-${Number(windowDays)} days`);

  const sameAmount = open.filter((o) => !o.paid && o.total === payment.amount);
  if (sameAmount.length === 1) push(sameAmount[0], 'amount_only');

  for (const o of open) {
    if (o.paid) continue;
    if (nameOverlap(payment.sender_name, o.name) >= 0.5) push(o, 'name');
  }

  const rank = { exact: 0, ref_mismatch: 1, amount_only: 2, name: 3 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

/**
 * Link a payment to an order, settling the order if it wasn't already.
 *
 * `set_paid` remembers whether this link is what flipped the flag, so
 * unlinking puts the order back exactly as it was. An order Derek had
 * already marked paid by hand stays paid when the link is undone.
 */
const link = db.transaction((paymentId, orderId, by) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!p || !o) return null;

  /* Two refusals, both of which used to be silent corruption rather than an
   * answer. Returned as a reason rather than thrown, because each one is
   * something the screen has to say in a sentence — and because a constraint
   * error would reach the owner as "something went wrong" on an action that is
   * perfectly sensible to have attempted.
   *
   * An order that already has a payment against it. The flag only flips when
   * the order was not already paid, so a second payment recorded set_paid = 0,
   * and unlinking the first then marked the order unpaid while the second was
   * still linked to it. A genuine second transfer for the same order stays in
   * the unclaimed list, which is where money nobody has accounted for belongs. */
  const held = db.prepare('SELECT * FROM payments WHERE order_id = ? AND id != ?')
    .get(orderId, paymentId);
  if (held) return { refused: 'order_taken', held };

  /* A payment that is already linked somewhere else. Moving it overwrote
   * order_id and recomputed set_paid against the new order, which left the old
   * one marked paid with nothing standing behind it and no way to notice.
   * Unlink first: that path already restores the old order exactly. */
  if (p.order_id && p.order_id !== orderId) {
    return { refused: 'already_linked', held: p };
  }

  const flips = o.paid ? 0 : 1;
  db.prepare(`UPDATE payments SET order_id = ?, matched_by = ?, matched_at = datetime('now'),
              set_paid = ? WHERE id = ?`).run(orderId, by, flips, paymentId);
  if (flips) db.prepare('UPDATE orders SET paid = 1 WHERE id = ?').run(orderId);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
});

const unlink = db.transaction((paymentId) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!p || !p.order_id) return null;
  if (p.set_paid) db.prepare('UPDATE orders SET paid = 0 WHERE id = ?').run(p.order_id);
  db.prepare(`UPDATE payments SET order_id = NULL, matched_by = '', matched_at = NULL,
              set_paid = 0 WHERE id = ?`).run(paymentId);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
});

/**
 * Store one notification, and match it if the evidence allows.
 *
 * Returns what happened rather than throwing, because every outcome here —
 * including "that could not be read" — is something the screen has to say in
 * a sentence. A notification that parses but matches nothing is still
 * stored: unclaimed money on the reconcile screen is the finding, not a
 * failure.
 */
function record(input, { source = 'paste' } = {}) {
  const parsed = parseNotification(input);
  if (!parsed) return { ok: false, reason: 'unreadable' };

  const existing = db.prepare('SELECT * FROM payments WHERE external_id = ?').get(parsed.external_id);
  if (existing) return { ok: true, duplicate: true, payment: existing };

  const id = db.prepare(`INSERT INTO payments
    (external_id, received_at, sender_name, amount, memo, memo_parsed, subject, source)
    VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?)`)
    .run(parsed.external_id, parsed.received_at, parsed.sender_name, parsed.amount,
      parsed.memo, parsed.memo_parsed, parsed.subject, source).lastInsertRowid;

  let payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  const best = candidatesFor(payment)[0];

  if (best && best.reason === 'exact' && !best.taken) {
    /* `taken` already says another payment holds this order, so a refusal here
     * means the two disagreed — and the automatic path is the last place to
     * insist. It falls through and waits for a person, which is what every
     * rung below `exact` does anyway. */
    const linked = link(id, best.order.id, 'auto');
    if (linked && !linked.refused) {
      return { ok: true, payment: linked, matched: best.order, auto: true };
    }
  }
  return { ok: true, payment, suggestions: candidatesFor(payment) };
}

/* --- Queries ------------------------------------------------------------- */

const withOrder = `
  SELECT p.*, o.ref AS order_ref, o.name AS order_name, o.total AS order_total,
         o.service_date AS order_service_date
  FROM payments p LEFT JOIN orders o ON o.id = p.order_id`;

const unmatched = () => db.prepare(
  `${withOrder} WHERE p.order_id IS NULL ORDER BY p.received_at DESC, p.id DESC LIMIT 200`).all();

const matched = (limit = 50) => db.prepare(
  `${withOrder} WHERE p.order_id IS NOT NULL ORDER BY p.matched_at DESC, p.id DESC LIMIT ?`).all(limit);

const forOrder = (orderId) => db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);

/**
 * Orders that said e-transfer and are still not marked paid.
 *
 * The chase list: these are the people to nudge. Narrowed to the ones who
 * said they would send a transfer, because nudging someone who is paying
 * cash at the door about a missing e-transfer is worse than not nudging.
 */
const awaiting = () => db.prepare(`
  SELECT * FROM orders
  WHERE paid = 0 AND status != 'declined' AND payment_method = 'etransfer'
  ORDER BY service_date DESC, id DESC LIMIT 200`).all();

/**
 * Every order still owing, whatever they said they would pay with.
 *
 * What the link-by-hand list is built from, and deliberately wider than
 * awaiting(). Somebody who picked Cash on the form and then sent a transfer
 * anyway has to be linkable — the declared method is intent, and this whole
 * module exists because intent and money are different things.
 */
const unpaid = () => db.prepare(`
  SELECT * FROM orders
  WHERE paid = 0 AND status != 'declined'
  ORDER BY service_date DESC, id DESC LIMIT 200`).all();

module.exports = {
  parseNotification, refsIn, ordersNamedIn, nameOverlap,
  candidatesFor, record, link, unlink,
  unmatched, matched, forOrder, awaiting, unpaid,
};
