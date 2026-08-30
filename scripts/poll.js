'use strict';
/**
 * npm run poll [-- --dry] [-- --days N]
 *
 * Reads the payments mailbox once and says what it found. The server does this
 * on a timer; this is the same code run by hand, for the two moments when a
 * timer is the wrong tool — proving the setup works before trusting it, and
 * catching up after the mailbox or the app has been down.
 *
 * `--dry` connects, fetches, and parses, then stops. Nothing is recorded and
 * no message is marked read, so it can be run against a live mailbox as many
 * times as you like. Do that first: whether the forward is arriving and
 * whether the notification parses are questions worth answering *before*
 * anything writes to the ledger, because a misconfiguration that goes straight
 * to `record()` arrives as rows somebody has to undo.
 *
 * The password is never printed. Everything else is, because each of these is
 * something worth checking by eye when transfers are not showing up.
 */
const config = require('../server/config');
const mailbox = require('../server/mailbox');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
/* The day the forward rule is switched on, everything already sitting in the
 * mailbox is older than the window the timer looks back over, and would never
 * be read at all. `--days` is how that first catch-up is done — and re-reading
 * is free, so overshooting costs nothing. */
const daysArg = Number(argv[argv.indexOf('--days') + 1]);
const days = argv.includes('--days') && Number.isFinite(daysArg) && daysArg > 0
  ? Math.min(daysArg, 3650) : mailbox.WINDOW_DAYS;
const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

async function main() {
  if (!mailbox.configured()) {
    console.error('\nIMAP_HOST is not set, so there is no mailbox to read.');
    console.error('Fill in the IMAP block in .env — see .env.example.\n');
    process.exit(1);
  }

  console.log('');
  console.log(`  Mailbox:  ${config.imap.user} on ${config.imap.host}:${config.imap.port}`);
  console.log(`  Folder:   ${config.imap.mailbox}`);
  console.log(`  Reading:  unread mail from the last ${days} days`
    + `, at most ${Math.round(mailbox.MAX_BYTES / 1024)}KB each`);
  console.log(`  From:     ${config.imap.allowFrom.join(', ')}`);
  console.log(`  Mode:     ${dry ? 'dry run — nothing is recorded or marked read' : 'recording'}`);
  console.log('');

  let tally;
  try {
    tally = await mailbox.poll({
      dryRun: dry,
      windowDays: days,
      onRecorded(result) {
        const p = result.payment;
        const who = p.sender_name || 'an unnamed sender';
        const memo = p.memo ? ` — "${p.memo}"` : ' — no message';
        if (result.dryRun) {
          console.log(`  would record  ${money(p.amount)} from ${who}${memo}`);
        } else if (result.auto) {
          console.log(`  settled       ${money(p.amount)} from ${who} → ${result.matched.ref}`);
        } else {
          console.log(`  recorded      ${money(p.amount)} from ${who}${memo}`);
          console.log(`                waiting to be matched on the Payments screen`);
        }
      },
      onSkipped({ reason }) {
        if (reason !== 'not a notification') console.log(`  unreadable    ${reason}`);
      },
    });
  } catch (e) {
    /* Nearly always one of three things, and the raw error names which. */
    console.error(`\n  Could not read the mailbox: ${e.message}\n`);
    console.error('  Check, in this order: the app password (a Gmail account password');
    console.error('  will not work), that IMAP is switched on in the mail provider, and');
    console.error(`  that ${config.imap.mailbox} is the folder the forward lands in.\n`);
    process.exit(1);
  }

  console.log('');
  console.log(`  Looked at ${tally.seen} message${tally.seen === 1 ? '' : 's'}.`);
  if (tally.ignored) console.log(`  ${tally.ignored} were not bank mail and were left unread.`);
  if (tally.oversized) console.log(`  ${tally.oversized} were too large to be a notification `
    + 'and were left unread.');
  if (tally.unreadable) console.log(`  ${tally.unreadable} looked like bank mail but could not be read.`);
  if (tally.duplicate) console.log(`  ${tally.duplicate} had already been recorded.`);
  console.log(`  ${tally.recorded} ${dry ? 'would be recorded' : 'recorded'}`
    + `${dry ? '' : `, ${tally.matched} of which settled an order by itself`}.`);

  if (!tally.seen) {
    console.log('');
    console.log('  Nothing waiting. If a transfer has arrived and this stays empty,');
    console.log('  the forward rule is the thing to check — the notification has to');
    console.log(`  reach ${config.imap.user}, not just the address it was sent to.`);
  }
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
