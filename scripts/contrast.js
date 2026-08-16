'use strict';
/**
 * WCAG contrast audit.
 *
 *   npm run contrast
 *
 * Checks every colour pairing the app actually ships. Run this after changing
 * anything in public/theme.css — a palette tweak that looks fine on a desktop
 * monitor can quietly drop a label below the readable threshold on a phone in
 * a bright kitchen, which is exactly where this app gets used.
 *
 * Exits non-zero if any shipped pairing fails, so it can gate a deploy.
 * Findings and the reasoning behind the derived tones are in CONTRAST.md.
 */

const { palette } = require('../server/theme');

function luminance(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const chan = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** min: 4.5 normal text, 3.0 large text and non-text UI (borders, indicators). */
const PAIRS = [
  ['Body text on cards', 'espresso', 'parchment', 4.5],
  ['Headings on cards', 'umber', 'parchment', 4.5],
  ['Primary button label', 'espresso', 'tan', 4.5],
  ['Primary button hover', 'espresso', 'ochre', 4.5],
  ['Header / footer links', 'parchment', 'olive', 4.5],
  ['Badge text on tan', 'umber-deep', 'tan', 4.5],
  ['Tan-toned labels on cards', 'tan-deep', 'parchment', 4.5],
  ['Active nav indicator', 'tan-lift', 'olive', 3.0],
  ['Card border on parchment', 'olive', 'parchment', 3.0],
];

let failed = 0;
console.log('\nWCAG contrast audit — Dinner By Derek\n');

for (const [label, fgKey, bgKey, min] of PAIRS) {
  const fg = palette[fgKey];
  const bg = palette[bgKey];
  if (!fg || !bg) {
    console.log(`  MISSING  ${label.padEnd(28)} --dbd-${fg ? bgKey : fgKey} is not in theme.css`);
    failed++;
    continue;
  }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`  ${(ok ? 'pass' : 'FAIL').padEnd(8)} ${label.padEnd(28)} ${r.toFixed(2)}:1  (needs ${min.toFixed(1)})  ${fg} on ${bg}`);
}

if (failed) {
  console.log(`\n${failed} pairing${failed === 1 ? '' : 's'} below the threshold. See CONTRAST.md.\n`);
  process.exit(1);
}
console.log('\nAll shipped pairings pass.\n');
