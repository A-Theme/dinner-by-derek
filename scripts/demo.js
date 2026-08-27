'use strict';
/**
 * Run the app against a throwaway copy of the database.
 *
 *   npm run demo
 *
 * WHY THIS EXISTS RATHER THAN `npm run dev`. A demo is something somebody is
 * watching, and the person watching edits things while they look — a price, a
 * description, a review box. Pointed at the live file those edits are real, and
 * the ones made to show how a screen behaves are exactly the ones nobody meant
 * to keep. So the demo gets its own copy and the live file is never opened.
 *
 * VACUUM INTO, not a file copy. The database runs in WAL mode, so recent writes
 * live in `-wal` beside the main file until a checkpoint folds them in. Copying
 * only the one file has already produced a "copy" that reported an empty draft
 * and no orders, and a correction was written from it. VACUUM INTO asks SQLite
 * for a consistent snapshot including everything still in the log.
 *
 * The copy is rebuilt on every run and lives in data/, which is gitignored.
 * Nothing here writes back.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..');
const live = process.env.DEMO_SOURCE_DB || path.join(root, 'data', 'dinnerbyderek.db');
const copy = path.join(root, 'data', 'demo-copy.db');

if (!fs.existsSync(live)) {
  console.error(`No database at ${live}. Start the app once to create one.`);
  process.exit(1);
}

for (const f of [copy, `${copy}-wal`, `${copy}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const src = new Database(live, { readonly: true });
src.prepare('VACUUM INTO ?').run(copy);
src.close();

const bytes = fs.statSync(copy).size;
console.log(`Demo copy: ${copy} (${(bytes / 1024).toFixed(0)} KB)`);
console.log('The live database is not open. Edits made here are thrown away on the next run.\n');

process.env.DB_PATH = copy;
// Uploads land beside the copy so a photo added during a demo does not join the
// real ones, where it would be indistinguishable from a dish Derek uploaded.
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(root, 'data', 'demo-uploads');
// A demo must not be able to send mail. Orders placed while showing someone the
// screens would otherwise reach real addresses out of the real account.
process.env.SMTP_HOST = '';

require('../server/index.js');
