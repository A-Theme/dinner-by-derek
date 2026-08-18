'use strict';
/**
 * The README's artwork.
 *
 *   npm run readme-art
 *
 * Writes an animated banner, a row of badges and the palette swatches to
 * `docs/`, all from `brand/` and the colours in `theme.css`. Committed rather
 * than generated on the fly, because GitHub renders the file in the repository
 * and cannot run anything first — same arrangement as `public/icons/`.
 *
 * Everything is a self-contained SVG with the logo embedded as a data URI.
 * No shields.io, no CDN, no webfont: the README of a codebase whose whole
 * argument is "no build step, no external service" should not need three
 * network round-trips to draw its own title.
 *
 * On the animation. GitHub serves README images through a proxy that strips
 * scripts, so anything moving has to be declarative — SMIL <animate> elements,
 * which survive being loaded as an <img> in every current browser. Motion is
 * kept to what a kitchen actually does: heat rising, and a shine travelling
 * along a brass rule. Nothing blinks, nothing bounces, and it all runs at a
 * pace you can ignore while reading.
 */

const fs = require('fs');
const path = require('path');
const { palette } = require('../server/theme');
const brandmark = require('./brandmark');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'docs');

/* Mirrors theme.css. A README is read on machines this repo knows nothing
   about, so both stacks end in a generic family. */
const DISPLAY = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman',serif";
const BODY = "'Segoe UI',Roboto,'Helvetica Neue',Arial,Helvetica,sans-serif";

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Advance widths are unknowable here, so badge sizing errs wide. */
const widthOf = (text, size, factor = 0.58) => Math.ceil(String(text).length * size * factor);

function write(file, svg) {
  fs.writeFileSync(path.join(OUT, file), `${svg.trim()}\n`);
  const kb = (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(1);
  console.log(`  ${file.padEnd(26)} ${kb} kB`);
}

/* --- Banner ---------------------------------------------------------------
 * Olive ground, the real lockup, and three things moving: steam off the mark,
 * a shine crossing both hairlines, and a slow warm bloom behind the logo.
 */
async function banner() {
  const W = 1200, H = 340, mid = W / 2;

  // The lockup is embedded rather than linked. A relative <image href> inside
  // an SVG that is itself loaded as an <img> does not resolve on GitHub, and
  // the whole banner would render as an empty olive box.
  const mark = await brandmark.wordmark({ height: 168 });
  const uri = `data:image/png;base64,${mark.data.toString('base64')}`;
  const markLeft = Math.round(mid - mark.width / 2);
  const markTop = 54;

  /** One wisp of steam: rises, drifts sideways, fades out, repeats. */
  const wisp = (x, delay, drift, dur) => `
    <g opacity="0">
      <path d="M ${x} 60 c -9 -16 9 -26 0 -42 c -9 -16 7 -25 0 -40"
        fill="none" stroke="${palette['tan-lift']}" stroke-width="3.5"
        stroke-linecap="round" opacity="0.75"/>
      <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.25;0.6;1"
        dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="translate"
        values="0 26; ${drift * 0.4} 0; ${drift} -30" keyTimes="0;0.5;1"
        dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
    </g>`;

  /** The shine that travels along a hairline. */
  const shine = (y) => `
    <rect x="0" y="${y - 2}" width="${W}" height="4" fill="url(#shine)">
      <animate attributeName="x" values="${-W};${W}" dur="7s" repeatCount="indefinite"/>
    </rect>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
  role="img" aria-label="Dinner By Derek — supper club, Kitchener and Waterloo">
  <defs>
    <radialGradient id="bloom" cx="50%" cy="42%" r="42%">
      <stop offset="0%" stop-color="${palette.ochre}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${palette.ochre}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${palette['tan-lift']}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${palette['tan-lift']}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${palette['tan-lift']}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${palette.olive}"/>

  <!-- Warm bloom behind the mark: the oven door opening, roughly. -->
  <ellipse cx="${mid}" cy="140" rx="330" ry="150" fill="url(#bloom)">
    <animate attributeName="opacity" values="0.35;0.85;0.35" dur="6s" repeatCount="indefinite"/>
  </ellipse>

  <line x1="0" y1="26" x2="${W}" y2="26" stroke="${palette.tan}" stroke-opacity="0.4" stroke-width="3"/>
  <line x1="0" y1="${H - 26}" x2="${W}" y2="${H - 26}" stroke="${palette.tan}" stroke-opacity="0.4" stroke-width="3"/>
  ${shine(26)}
  ${shine(H - 26)}

  <g transform="translate(${mid} 0)">
    ${wisp(-64, 0, -18, 5.5)}
    ${wisp(0, 1.4, 8, 6.2)}
    ${wisp(62, 2.9, 20, 5.9)}
  </g>

  <image href="${uri}" x="${markLeft}" y="${markTop}" width="${mark.width}" height="${mark.height}"/>

  <text x="${mid}" y="272" font-family="${BODY}" font-size="21" letter-spacing="7"
    fill="${palette['tan-lift']}" text-anchor="middle" font-weight="600">SUPPER CLUB · KITCHENER &amp; WATERLOO</text>
  <text x="${mid}" y="306" font-family="${DISPLAY}" font-size="22"
    fill="${palette.parchment}" text-anchor="middle">Order by link · Pickup or delivery · No app store</text>
</svg>`;
}

/* --- Badges ---------------------------------------------------------------
 * Made here rather than fetched, and coloured from the palette. Both pairings
 * are ones CONTRAST.md already measures: parchment on olive at 5.38:1 for the
 * label, espresso on tan at 4.91:1 for the value.
 */
function badge(label, value) {
  const size = 13, pad = 11, h = 30;
  const lw = widthOf(label, size) + pad * 2;
  const vw = widthOf(value, size) + pad * 2;
  const w = lw + vw;
  const r = 6;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
  role="img" aria-label="${esc(label)}: ${esc(value)}">
  <defs>
    <clipPath id="r"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="${h}" fill="${palette.olive}"/>
    <rect x="${lw}" width="${vw}" height="${h}" fill="${palette.tan}"/>
  </g>
  <text x="${lw / 2}" y="${h / 2 + 4.5}" font-family="${BODY}" font-size="${size}" font-weight="600"
    fill="${palette.parchment}" text-anchor="middle">${esc(label)}</text>
  <text x="${lw + vw / 2}" y="${h / 2 + 4.5}" font-family="${BODY}" font-size="${size}" font-weight="700"
    fill="${palette.espresso}" text-anchor="middle">${esc(value)}</text>
</svg>`;
}

const BADGES = [
  ['node', 'Node', '20+'],
  ['build', 'Build step', 'none'],
  ['data', 'Database', 'one file'],
  ['install', 'Installs', 'to a home screen'],
  ['contrast', 'Contrast', 'WCAG AA, measured'],
  ['print', 'Card', '300 DPI, bleed'],
];

/* --- Swatches -------------------------------------------------------------
 * One chip per palette colour, for the table in the colours section — a hex
 * code is not a colour until you can see it.
 */
function swatch(hex) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 20" width="44" height="20" role="img" aria-label="${hex}">
  <rect width="44" height="20" rx="4" fill="${hex}" stroke="${palette['umber-soft']}" stroke-opacity="0.45"/>
</svg>`;
}

const SWATCHES = ['olive', 'tan', 'umber', 'parchment', 'espresso', 'ochre',
  'olive-deep', 'tan-deep', 'umber-soft', 'parchment-2', 'espresso-2', 'cream-hi',
  'umber-deep', 'tan-lift'];

/* --- Run ------------------------------------------------------------------ */
async function generate() {
  if (!fs.existsSync(brandmark.LINEART)) {
    throw new Error(`Missing brand artwork: ${brandmark.LINEART}`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  write('banner.svg', await banner());
  for (const [file, label, value] of BADGES) write(`badge-${file}.svg`, badge(label, value));
  for (const name of SWATCHES) write(`swatch-${name}.svg`, swatch(palette[name]));

  return { dir: OUT };
}

if (require.main === module) {
  (async () => {
    console.log('\nGenerating README artwork');
    const out = await generate();
    console.log(`\nDone. Artwork is in ${out.dir}. Commit it — GitHub can't run the script.\n`);
  })().catch((e) => {
    console.error('\nREADME artwork failed:', e.message, '\n');
    process.exit(1);
  });
}

module.exports = { generate, OUT };
