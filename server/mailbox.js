'use strict';
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const config = require('./config');
const P = require('./payments');

/**
 * Reading the bank's notifications out of a mailbox, so Derek does not have to.
 *
 * This is the other end of `server/payments.js`. That module can already read a
 * notification and decide, carefully, which order it belongs to; until now the
 * only way to get one in front of it was to paste it into the Payments screen.
 * This fetches them instead. Nothing about the decision changes — the same
 * `record()`, the same one rung where an order settles itself, the same
 * suggestions for everything weaker. All that is different is who does the
 * copying.
 *
 * **It must have a mailbox to itself.** The domain runs one address,
 * `orders@dinnerbyderek.ca`, and that address carries customer replies as well
 * as bank mail — it is the reply-to on every confirmation. So the poller does
 * not read it. It reads a separate inbox, fed by a rule that forwards only the
 * bank's notifications, which exists for no other purpose and which nobody
 * reads by eye. Two consequences follow and both are already handled: every
 * message arriving is a *forwarded copy*, and the identity that belongs to the
 * money is the original's, which `parseNotification` already prefers.
 *
 * **What it does not do is authenticate.** The forward strips the original's
 * DMARC verdict on the way through — what survives is the forwarding server's
 * verdict on the forward, which says nothing about Interac. `allowFrom` is
 * therefore a filter for deciding what is worth reading, not evidence that a
 * message is genuine. What stands between a forged notification and a wrong
 * `paid` is the rule in payments.js: an order settles itself only when the
 * reference *and* the exact total agree. That is a high bar for a stranger and
 * a low one for the customer who was shown both, which is worth knowing and is
 * not worth solving here — a customer who forges a deposit to avoid paying for
 * dinner has done something a person notices at the door.
 *
 * Nothing here throws into the timer, and nothing here needs to remember what
 * it has already read: `record()` dedupes on the bank's own Message-ID, so
 * re-reading a message is free. That is what makes the failure mode boring —
 * if a poll dies halfway, the next one picks up the rest, and the ones it
 * already did cost nothing.
 */

/** How often to look. Transfers are not urgent; a menu going live is. */
const POLL_MS = 5 * 60 * 1000;

/** How far back to search, so junk that lands here does not accumulate work. */
const WINDOW_DAYS = 14;

/** Enough for a busy week read in one go; the rest waits five minutes. */
const MAX_PER_POLL = 50;

/**
 * A ceiling on what is worth downloading at all, checked before anything is.
 *
 * A real notification is a few kilobytes. Everything downstream of the fetch —
 * MIME decoding, flattening, the parse — is linear in the size of the message,
 * so none of it is the catastrophic-backtracking class of problem that
 * `parseNotification` guards against. It is still time spent on the one thread
 * that also serves the menu, and `MAX_INPUT` in payments.js cannot help:
 * that slice happens at the end, after the download and the decode and the
 * flatten have all already been paid for.
 *
 * So the cap goes at the front, where it is free. Sizes come back in one small
 * fetch and anything oversized is never downloaded at all — an 8MB attachment
 * in this mailbox costs a number in a list rather than 150ms of parsing, fifty
 * times over.
 */
const MAX_BYTES = 1024 * 1024;

const configured = () => !!config.imap.host;

/**
 * What actually went wrong, rather than what the IMAP client called it.
 *
 * ImapFlow reports a rejected login as `Command failed`, which is true and
 * useless: the server's own words are on `responseText`, and they are the whole
 * diagnosis — `[AUTHENTICATIONFAILED] Invalid credentials` is a different
 * afternoon from `[ALERT] Please log in via your web browser`. Printing only
 * the message sends someone to check the four things that were already right.
 *
 * Learned the slow way on the first live run, which failed with `Command
 * failed` and nothing else while the cause sat one property away.
 */
function describe(err) {
  const parts = [err && err.message ? err.message : 'unknown error'];
  const detail = (err && err.responseText) || (err && err.serverResponseCode) || '';
  if (detail && detail !== parts[0]) parts.push(detail);
  return parts.join(' — ');
}

/* --- HTML to the grid the parser expects ---------------------------------
 * Interac states the transfer as a two-column table, and `parseNotification`
 * was written against what that table flattens to: the label alone on a line,
 * the value on a line below it. So the job here is not "render this email" —
 * it is to end a line everywhere the table ends a cell, and otherwise stay out
 * of the way. A general-purpose html-to-text pass would reflow the two columns
 * back into sentences and lose exactly the structure the parser reads.
 *
 * Only needed when the plain-text part is missing or is a stub, which some
 * forwards produce.
 */
function flatten(html) {
  return String(html == null ? '' : html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // A cell, a row, or any block is the end of a line. This is the whole trick.
    .replace(/<\/(?:td|th|tr|p|div|li|h[1-6]|table)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]{0,2000}>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:#39|apos);/gi, "'")
    .replace(/&#(\d{1,7});/g, (_, d) => String.fromCharCode(Number(d)))
    /* Spaces are collapsed per line rather than globally, because the parser's
     * patterns are anchored to line starts and ends. The blank line between a
     * label and its value is kept — the grid pattern allows up to four and
     * needs none, but keeping them means the text read here and the text a
     * person pastes look the same. */
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    /* Mail HTML opens and closes with wrappers, so the text otherwise arrives
     * inside a shell of blank lines. They parse fine and read badly, and this
     * text is quoted back in logs. */
    .trim();
}

/**
 * How much of a notification a given rendering gave up.
 *
 * The memo is weighted highest because it is the field the automatic match
 * turns on: it is where the order reference rides, and a reading that finds
 * the amount but not the message is precisely the one that looks fine in the
 * log and quietly never settles anything.
 */
function readability(text) {
  const p = P.parseNotification(text);
  if (!p) return -1;
  return 1 + (p.memo_parsed ? 3 : 0) + (p.sender_name ? 2 : 0);
}

/**
 * One parsed message, as the text `parseNotification` understands.
 *
 * Headers go in raw and whole. They are where the identity lives — the bank's
 * Message-ID, and on a forward the `In-Reply-To` naming the original — and
 * `parseNotification` reads them with patterns that already step over a folded
 * line, so rewriting them here could only do damage.
 *
 * The body is chosen rather than guessed at, and that is not caution for its
 * own sake. An HTML-only notification has no text part of its own, so
 * mailparser makes one by stripping the tags — which puts the whole grid on a
 * single line, `Amount:$37.00Message:Order A1B2C3D4`. That reading still
 * contains an amount, so any test of the form "does this half mention money"
 * picks it, and the memo is gone. The order then arrives unmatched with
 * nothing in the log to say why.
 *
 * So both renderings are parsed and the better one wins. It costs two passes
 * over a few kilobytes and removes a whole class of silent half-reading. The
 * flattened HTML is tried first, so it takes ties: it is the rendering built
 * for this parser, where the other is a general-purpose fallback that happens
 * to be close.
 */
function messageText(parsed) {
  const headers = (parsed.headerLines || []).map((h) => h.line).join('\n');
  const bodies = [];
  if (parsed.html) bodies.push(flatten(parsed.html));
  const plain = String(parsed.text || '').trim();
  if (plain) bodies.push(plain);

  let best = `${headers}\n\n${plain}`;
  let bestScore = -Infinity;
  for (const body of bodies) {
    const candidate = `${headers}\n\n${body}`;
    const score = readability(candidate);
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

/* Interac's own wording, which survives being forwarded because it is in the
 * subject rather than the envelope. Deliberately loose: it decides what is
 * worth parsing, and the parser refuses anything with no money in it anyway. */
const NOTIFICATION_SUBJECT = /^Subject:.*(?:interac|e-?transfer|virement)/im;

/**
 * Is this worth handing to the parser at all?
 *
 * Searched over the whole message rather than the `From:` header, because on
 * every message that arrives here the outer `From:` belongs to whoever set up
 * the forward. Interac's address is usually still in there, one level in,
 * where the forward quoted the original headers.
 *
 * *Usually* is why the subject counts too. A rule that redirects rather than
 * forwards can leave a message whose body is the bank's HTML table and whose
 * headers name nobody but the forwarder — no `@payments.interac.ca` anywhere.
 * Matching on the address alone drops that one, and drops it *silently*: an
 * ignored message is never logged, never marked, and never recorded, so the
 * only symptom is a transfer that quietly needs pasting by hand.
 *
 * Being too permissive fails in a much better direction. A message that is not
 * a notification reaches `parseNotification`, which returns null for anything
 * with no money in it, and is logged as unreadable rather than acted on. And
 * this mailbox holds nothing but bank mail to begin with — that is the whole
 * reason it is a separate one.
 */
function isNotification(text, allowFrom = config.imap.allowFrom) {
  const raw = String(text || '');
  const t = raw.toLowerCase();
  if (allowFrom.some((domain) => t.includes(`@${domain}`))) return true;
  return NOTIFICATION_SUBJECT.test(raw);
}

/* --- The poll -------------------------------------------------------------
 * Messages that are not notifications are left exactly as they were found:
 * unread, unflagged, untouched. If this is ever pointed at a mailbox holding
 * somebody's real mail, the damage should be nothing. They are remembered for
 * the life of the process instead, so a piece of spam sitting in the inbox is
 * parsed once rather than every five minutes, and the search window drops it
 * out of range eventually anyway.
 */
const skipped = new Set();

/**
 * Bounded, because it is a cache and not a record.
 *
 * A UID is unique within one mailbox and one `UIDVALIDITY`, so this set is only
 * ever a way to avoid re-reading the same junk within a run of the process. It
 * must never be the reason a message is not read: forgetting an entry costs one
 * wasted parse, and `record()` dedupes on the bank's own Message-ID anyway.
 * Dropping the oldest half rather than clearing keeps that cheap.
 */
const SKIP_MEMORY = 2000;
function remember(uid) {
  if (skipped.size >= SKIP_MEMORY) {
    for (const old of [...skipped].slice(0, Math.floor(SKIP_MEMORY / 2))) skipped.delete(old);
  }
  skipped.add(uid);
}

function connect() {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
    // A poll that hangs must not still be hanging when the next one starts.
    socketTimeout: 60 * 1000,
    greetingTimeout: 20 * 1000,
  });
}

/**
 * Read what is waiting, and hand each notification to `record()`.
 *
 * Returns a tally rather than throwing, for the same reason `record()` does:
 * every outcome is something a log line or a screen has to say in a sentence.
 * The one thing it throws for is the caller's own mistake — asking it to poll
 * with no mailbox configured.
 */
async function poll({
  onRecorded, onSkipped, limit = MAX_PER_POLL, dryRun = false, windowDays = WINDOW_DAYS,
} = {}) {
  if (!configured()) throw new Error('IMAP_HOST is not set');

  const tally = {
    seen: 0, recorded: 0, matched: 0, duplicate: 0, unreadable: 0, ignored: 0, oversized: 0,
  };
  const client = connect();
  await client.connect();
  let lock;
  try {
    lock = await client.getMailboxLock(config.imap.mailbox);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const found = (await client.search({ seen: false, since }, { uid: true })) || [];
    const uids = found.filter((uid) => !skipped.has(uid)).slice(0, limit);

    /* Sizes first, in one fetch, so the cap can be applied before anything
     * large is pulled down the wire or handed to a parser. */
    const sizes = new Map();
    if (uids.length) {
      for await (const meta of client.fetch(uids, { uid: true, size: true }, { uid: true })) {
        sizes.set(meta.uid, meta.size);
      }
    }

    for (const uid of uids) {
      tally.seen += 1;

      const size = sizes.get(uid);
      if (size != null && size > MAX_BYTES) {
        /* Left unread, like anything else that is not ours to act on. A real
         * notification is never this big, so this is somebody's attachment or
         * somebody's attempt, and either way a person should find it here. */
        remember(uid);
        tally.oversized += 1;
        if (onSkipped) onSkipped({ uid, reason: `too large to be a notification (${size} bytes)` });
        continue;
      }

      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) { remember(uid); continue; }

      const text = messageText(await simpleParser(msg.source));
      if (!isNotification(text)) {
        /* Not ours. Left unread on purpose — see above. */
        remember(uid);
        tally.ignored += 1;
        if (onSkipped) onSkipped({ uid, reason: 'not a notification' });
        continue;
      }

      /* A dry run proves the credentials, the forward, and the parsing without
       * writing a payment or touching a flag. It is what the first run should
       * be: finding out that the mailbox half works is a separate question
       * from letting it near the ledger, and answering them together means a
       * misconfiguration arrives as rows to undo. */
      if (dryRun) {
        const parsed = P.parseNotification(text);
        if (!parsed) {
          tally.unreadable += 1;
          if (onSkipped) onSkipped({ uid, reason: 'unreadable' });
          continue;
        }
        tally.recorded += 1;
        if (onRecorded) onRecorded({ ok: true, payment: parsed, dryRun: true });
        continue;
      }

      const result = P.record(text, { source: 'mailbox' });

      /* Marked read whatever the parser made of it, including nothing. An
       * unreadable notification left unread would be re-fetched and re-refused
       * every five minutes forever; read and logged, it is still sitting in the
       * mailbox for a person to look at. */
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });

      if (!result.ok) {
        tally.unreadable += 1;
        if (onSkipped) onSkipped({ uid, reason: result.reason });
        continue;
      }
      if (result.duplicate) { tally.duplicate += 1; continue; }

      tally.recorded += 1;
      if (result.auto) tally.matched += 1;
      if (onRecorded) onRecorded(result);
    }
  } finally {
    if (lock) lock.release();
    try { await client.logout(); } catch (e) { client.close(); }
  }
  return tally;
}

module.exports = {
  configured, poll, flatten, messageText, isNotification,
  POLL_MS, WINDOW_DAYS, MAX_PER_POLL, MAX_BYTES, describe,
};
