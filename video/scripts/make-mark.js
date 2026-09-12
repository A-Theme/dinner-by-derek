'use strict';
/**
 * Writes public/icons/mark-gold.png — the brand lockup, for the launch cut.
 *
 *   npm run mark
 *
 * Not the same thing as public/icons/icon-512.png, which is already here and is
 * the right file for the two scenes that use it: those scenes are *depicting a
 * home-screen icon*, so the icon is the subject. Used as a logo it is wrong —
 * it is ink artwork on a parchment tile, and dropped onto the launch cut's
 * olive it reads as a white box with a drawing in it.
 *
 * This is the gold line art on transparency: the same mark, cut the same way,
 * that the five social graphics and the front of the business card use, and it
 * is made for exactly this — a dark ground with nothing behind it.
 *
 * Generated from the app's own brandmark helper rather than copied, so a change
 * to the brand artwork reaches the video by re-running this instead of by
 * somebody remembering. Requires the app's dependencies: `npm install` in the
 * repository root first. The output is committed, so a fresh checkout renders
 * without needing them.
 */

const fs = require('fs');
const path = require('path');
const brandmark = require('../../scripts/brandmark');

const OUT = path.join(__dirname, '..', 'public', 'icons', 'mark-gold.png');

/* 600 tall for a mark drawn at 300: rendered at 2× so it stays crisp if a
   scene ever shows it larger, which costs a few kilobytes and nothing else. */
(async () => {
  const mark = await brandmark.wordmark({ height: 600 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, mark.data);
  console.log(`\n  ${path.relative(process.cwd(), OUT)}`);
  console.log(`  ${mark.width}×${mark.height}, gold line art on transparency\n`);
})().catch((e) => {
  console.error('\nCould not write the mark:', e.message);
  console.error('Run `npm install` in the repository root first — this reads the app\'s brandmark helper.\n');
  process.exit(1);
});
