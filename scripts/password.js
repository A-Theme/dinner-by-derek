'use strict';
/**
 * npm run password
 *
 * Turns a password you type into the line that goes in .env, so the password
 * itself is never stored on disk and never lands in shell history. Typing is
 * hidden where the terminal allows it.
 *
 * Prints the line rather than writing .env: this file is the one thing the
 * owner edits by hand, and a script that rewrites it is a script that can
 * lose the rest of it.
 */
const readline = require('readline');
const P = require('../server/password');

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden && process.stdin.isTTY) {
      // Swallow the echo, but keep the newline the prompt is waiting on.
      rl._writeToOutput = (s) => { if (s.includes('\n')) rl.output.write('\n'); };
    }
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal, so the password can be typed without being echoed.');
    process.exit(1);
  }

  const first = await ask('New admin password: ', true);
  if (first.length < 12) {
    console.error('\nToo short. Twelve characters minimum — there is no lockout behind this,');
    console.error('only the rate limiter, so length is what actually protects the dashboard.');
    process.exit(1);
  }

  const second = await ask('Type it again: ', true);
  if (first !== second) {
    console.error('\nThose did not match. Nothing was changed.');
    process.exit(1);
  }

  const line = `ADMIN_PASSWORD_HASH=${P.hash(first)}`;
  console.log('\nPut this in .env, and delete the ADMIN_PASSWORD line:\n');
  console.log(line);
  console.log('\nThen restart the app. Everyone signed in is signed out — the session');
  console.log('cookie is signed against the password, so changing it retires the old ones.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
