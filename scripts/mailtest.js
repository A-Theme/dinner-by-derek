'use strict';
/**
 * npm run mailtest [address]
 *
 * Sends one real message through whatever `.env` says, and reports what
 * happened. The point is to find out that email works *before* an order
 * depends on it — otherwise the first test is a customer's confirmation, and a
 * failure there is silent by design: `server/mailer.js` swallows send errors so
 * a broken mailbox can never lose an order that is already stored.
 *
 * With no address it goes to `notify_email` from Settings — the same address
 * the owner alerts use, so a typo there fails here too rather than waiting for
 * a Sunday night. Pass an address to send somewhere else.
 *
 * READ-ONLY on the database, like scripts/ledger.js and for the same reason:
 * going through server/db.js would open it for writing and run the migrations,
 * which is not a thing a test should do to a live file on the server.
 *
 * The password is never printed. Everything else is, because every one of them
 * is something worth checking with your own eyes when mail is not arriving.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const config = require('../server/config');

function notifyEmail() {
  if (!fs.existsSync(config.dbPath)) return '';
  try {
    const db = new Database(config.dbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('notify_email');
    db.close();
    return String((row && row.value) || '').trim();
  } catch {
    return '';                     // No database yet, or an older one. Not the point of the test.
  }
}

async function main() {
  const { smtp } = config;

  if (!smtp.host) {
    console.error('\nSMTP_HOST is empty, so email is off. Nothing was sent.\n');
    console.error('That is a supported state — orders are still saved and still appear in');
    console.error('the dashboard. To turn sending on, fill in the SMTP_ block in .env and');
    console.error('set BASE_URL to the public https address at the same time, or the links');
    console.error('inside your own alert emails point at localhost.\n');
    process.exit(1);
  }

  const to = (process.argv[2] || '').trim() || notifyEmail();
  const from = smtp.from || smtp.user;

  console.log('');
  console.log(`  Host      ${smtp.host}:${smtp.port}${smtp.secure ? ' (TLS)' : ' (STARTTLS)'}`);
  console.log(`  User      ${smtp.user || '(none — sending unauthenticated)'}`);
  console.log(`  From      ${from}${smtp.from ? '' : '   ← SMTP_FROM empty, falling back to SMTP_USER'}`);
  console.log(`  To        ${to || '(nowhere)'}`);
  console.log(`  BASE_URL  ${config.baseUrl}`);
  console.log('');

  if (!to) {
    console.error('No recipient. Set notify_email in Dashboard → Settings, or pass an');
    console.error('address: npm run mailtest -- you@example.com\n');
    process.exit(1);
  }

  /* Warnings, not refusals. Each one is a message that sends and then
   * disappoints — the kind that is hard to diagnose later precisely because
   * nothing failed. */
  const fromDomain = (from.split('@')[1] || '').toLowerCase();
  const siteDomain = (() => { try { return new URL(config.baseUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const realSite = siteDomain.includes('.') && !siteDomain.endsWith('localhost');
  if (fromDomain && realSite && !fromDomain.endsWith(siteDomain)) {
    console.log(`  ! From is ${fromDomain}, the site is ${siteDomain}. Mail sent on behalf of`);
    console.log('    the business from another domain is what spam filters are built to catch.');
  }
  if (config.baseUrl.includes('localhost')) {
    console.log('  ! BASE_URL is localhost. This will send, and every link in it will be');
    console.log('    dead on a phone. Set BASE_URL before relying on the alerts.');
  }

  const t = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  /* Connection and credentials are checked on their own first, because the two
   * failures need different fixes and a single "send failed" hides which one
   * you have. */
  try {
    await t.verify();
    console.log('  Connected and authenticated.');
  } catch (e) {
    console.error(`\nCould not connect or sign in: ${e.message}\n`);
    console.error('Wrong port, wrong SMTP_SECURE for that port, or the password is not the');
    console.error('one the provider issued. Providers that require an app password reject');
    console.error('the account password here with an authentication error, not a hint.\n');
    process.exit(1);
  }

  try {
    const info = await t.sendMail({
      from,
      to,
      subject: 'Dinner By Derek — test message',
      text: [
        'Email is working.',
        '',
        'This was sent by `npm run mailtest`. Nothing else about the site changed,',
        'and no order was involved.',
        '',
        'Two things worth checking on the copy that arrived:',
        '',
        '  1. It is in the inbox, not the spam folder. If it is in spam, the domain\'s',
        '     SPF and DKIM records are what fix that, not anything in the app.',
        `  2. This link opens the dashboard from the phone you are reading on:`,
        `     ${config.baseUrl}/admin`,
        '',
        'Every alert the app sends carries a link like that one. If it is dead here,',
        'it is dead in all of them, and BASE_URL is what to fix.',
      ].join('\n'),
    });
    console.log(`  Accepted for delivery — ${info.messageId}`);
    if (info.rejected && info.rejected.length) console.log(`  Rejected: ${info.rejected.join(', ')}`);
    console.log('');
    console.log(`Now go and look at ${to}. Handed off is not the same as arrived:`);
    console.log('the server accepting it says nothing about which folder it lands in.');
    console.log('');
  } catch (e) {
    console.error(`\nSigned in, but the send was refused: ${e.message}\n`);
    console.error('Usually the From address: most providers will only send as an address');
    console.error('you have proved you own. Check SMTP_FROM against what the provider');
    console.error('has verified.\n');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
