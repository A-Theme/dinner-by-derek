'use strict';
/**
 * Writes src/data/qr.json — the module matrix CardStickerQr.tsx draws.
 *
 *   npm run qr
 *   npm run qr -- https://example.test
 *
 * The scene shows the business card's code, so it has to be the real one: a
 * decorative QR in a video about a QR would be a strange thing to ship. It is
 * encoded here rather than in the component because the encoder is the app's
 * own — ../../scripts/qr.js, the same few hundred lines of arithmetic that
 * print the card — and reaching out of the video project at render time would
 * couple the bundle to a file outside its own tree.
 *
 * Committed, like public/music/lofi-jazz.mp3 and for the same reason: a fresh
 * checkout must be able to render without running anything first. It is
 * regenerated, not edited.
 *
 * WHY THIS SCRIPT EXISTS. The file it writes was referenced by the scene and
 * never committed, so `remotion bundle`, `remotion render` and `tsc` all failed
 * on a clean checkout — for every composition in the project, not just that one
 * scene, because the bundler resolves the whole graph. A generated file with no
 * generator is a file that goes missing exactly once and then stays missing.
 */

const fs = require('fs');
const path = require('path');
const qr = require('../../scripts/qr');

const URL = process.argv[2] || 'https://dinnerbyderek.ca';
const OUT = path.join(__dirname, '..', 'src', 'data', 'qr.json');

const code = qr.encode(URL, { level: 'Q' });

/* One string of '0'/'1' per row, which is what the scene maps over. JSON has no
   byte array worth having and the matrix is small enough that legibility in a
   diff is worth more than compactness. */
const rows = [];
for (let y = 0; y < code.size; y++) {
  let row = '';
  for (let x = 0; x < code.size; x++) row += code.modules[y * code.size + x] ? '1' : '0';
  rows.push(row);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ url: URL, size: code.size, rows }, null, 2)}\n`);

console.log(`\n  ${path.relative(process.cwd(), OUT)}`);
console.log(`  ${code.size}×${code.size} modules, version ${code.version}, level ${code.level}`);
console.log(`  ${URL}\n`);
