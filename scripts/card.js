'use strict';
/**
 * The business card.
 *
 *   npm run card            — from a terminal
 *   Dashboard → Graphics    — from a phone
 *
 * Both go through generate() below, so what the button does and what the
 * command does cannot drift apart.
 *
 * Two print-ready faces at 300 DPI, North American 3.5 × 2 in, with an eighth
 * of an inch of bleed on every side — 1125 × 675 pixels of image for 1050 × 600
 * of card. The DPI is written into the PNG so a print shop opening the file
 * sees a 3.75-inch image rather than a 1125-pixel one.
 *
 * Front is the lockup on olive. Back is the working information on parchment,
 * with a QR that points at BASE_URL.
 *
 * Colours come from theme.css via server/theme.js and the wording comes from
 * the live database, exactly as the social graphics do — change the pickup
 * window in Settings and the next card carries the new one. Nothing here holds
 * a hex literal or a second copy of a setting.
 *
 * The database is opened READ ONLY and by path, bypassing server/config.js on
 * purpose: this is a drawing tool and should not refuse to run because an
 * unrelated admin password is missing from the environment.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { palette } = require('../server/theme');
const brandmark = require('./brandmark');
const qr = require('./qr');
const T = require('../server/time');

const root = path.join(__dirname, '..');

/** Beside the database and the uploads, not in the app directory a redeploy
 *  replaces. See the same note in social.js. */
const GRAPHICS = process.env.GRAPHICS_DIR || path.join(root, 'data', 'graphics');
const OUT = path.join(GRAPHICS, 'print');

/* --- Geometry -------------------------------------------------------------
 * Everything is in pixels at 300 DPI. TRIM is where the guillotine is aimed;
 * it lands anywhere within about a sixteenth of an inch of that, so ink that
 * must survive stays inside SAFE and ink that must reach the edge runs past
 * TRIM into the bleed.
 */
const DPI = 300;
const BLEED = Math.round(DPI / 8);           // 37.5 → 38px of bleed per side
const W = Math.round(3.5 * DPI) + BLEED * 2; // 1126
const H = Math.round(2.0 * DPI) + BLEED * 2; // 676
const SAFE = BLEED + Math.round(DPI * 0.16); // 86px in from the sheet edge
const MID = W / 2;

/* --- Type ----------------------------------------------------------------
 * Mirrors theme.css, with the Liberation faces a Linux server falls back to.
 */
const DISPLAY = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman','Liberation Serif',serif";
const BODY = "'Segoe UI',Roboto,'Helvetica Neue',Arial,'Liberation Sans',sans-serif";

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function text(s, { x, y, size, fill, font = BODY, anchor = 'start', track = 0, weight = 'normal' }) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}"
    text-anchor="${anchor}" letter-spacing="${track}" font-weight="${weight}">${esc(s)}</text>`;
}

/** Small caps label — the workwear-stencil voice used throughout the app. */
const label = (s, o) => text(String(s).toUpperCase(), { ...o, font: BODY, track: o.track ?? 4 });

const rule = (x1, y, x2, stroke, opacity = 0.35, width = 2) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;

async function render(file, ground, svgBody, marks = []) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${ground}"/>${svgBody}</svg>`
  );
  await sharp(svg)
    .composite(marks)
    .withMetadata({ density: DPI })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
  return { name: file, width: W, height: H };
}

/* --- The QR ---------------------------------------------------------------
 * Drawn as raw pixels rather than SVG rectangles and scaled by whole modules
 * with nearest-neighbour, so every module edge lands on a pixel boundary. A
 * resampled QR with soft edges is a QR that a phone in a dim hallway gives up
 * on. Espresso on cream, which CONTRAST.md measures at 15.21:1.
 */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function qrImage(url, box) {
  const code = qr.encode(url, { level: 'Q' });
  const quiet = 4;
  const n = code.size + quiet * 2;
  const scale = Math.max(3, Math.floor(box / n));

  const light = rgb(palette['cream-hi']);
  const dark = rgb(palette.espresso);
  const buf = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n) - quiet;
    const c = (i % n) - quiet;
    const on = r >= 0 && c >= 0 && r < code.size && c < code.size && code.modules[r * code.size + c];
    buf.set(on ? dark : light, i * 3);
  }

  const side = n * scale;
  const data = await sharp(buf, { raw: { width: n, height: n, channels: 3 } })
    .resize(side, side, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { data, side, version: code.version, level: code.level };
}

/* --- Live wording --------------------------------------------------------- */

/** Settings from the running app, or the seeded defaults when there is no file yet. */
function loadDetails() {
  const fallback = {
    business: 'Dinner By Derek',
    pickup: ['16:00', '19:00'],
    cutoffHour: 22,
    deliveryOn: true,
    zone: 'Kitchener–Waterloo',
    contact: 'Message Dinner By Derek on Facebook, or call (226) 748-8378.',
  };

  const dbPath = process.env.DB_PATH || path.join(root, 'data', 'dinnerbyderek.db');
  if (!fs.existsSync(dbPath)) return fallback;

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const setting = (k, d) => {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
      return r && String(r.value).trim() !== '' ? r.value : d;
    };
    const zones = db.prepare('SELECT name FROM zones ORDER BY id').all().map((z) => z.name);
    return {
      business: setting('business_name', fallback.business),
      pickup: [setting('pickup_start', '16:00'), setting('pickup_end', '19:00')],
      cutoffHour: Number(setting('cutoff_hour', '22')),
      deliveryOn: setting('delivery_enabled', '1') === '1',
      zone: zones.length === 1 ? zones[0] : (zones.length ? 'Kitchener & Waterloo' : fallback.zone),
      contact: setting('owner_contact', fallback.contact),
    };
  } finally {
    db.close();
  }
}

/** 22 → "10 PM". The cutoff is always on the hour in Settings. */
const hour12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/* --- Front ----------------------------------------------------------------
 * Identity only. The lockup is light artwork — it needs the dark ground and
 * would vanish on parchment — and it already contains the name, so nothing is
 * set in type up here except the one line saying what this is and where.
 */
async function front() {
  // Sized to the badge's width, not its height. The lockup used to be a wide
  // mark about 400px across at this height; cut from the line art it is very
  // nearly square, so holding the old height would have quietly shrunk it by a
  // quarter and left the card looking underfilled. Grown until it carries the
  // same width as before, and its centre held where it was.
  const mark = await brandmark.wordmark({ height: 340 });
  const body = [
    rule(0, 100, W, palette.tan, 0.32, 2),
    rule(0, 576, W, palette.tan, 0.32, 2),
    label('Supper club · Kitchener & Waterloo',
      { x: MID, y: 506, size: 22, fill: palette['tan-lift'], anchor: 'middle', track: 6 }),
  ].join('');

  return render('card-front.png', palette.olive, body,
    [{ input: mark.data, top: 124, left: Math.round(MID - mark.width / 2) }]);
}

/* --- Back -----------------------------------------------------------------
 * The half someone actually uses: how to order, when to collect, what it costs
 * them to ask. Parchment, because a card that gets written on gets kept.
 */
async function back(d, url) {
  const seal = await brandmark.circle(96);
  const code = await qrImage(url, 300);

  const left = SAFE;
  const qrRight = W - SAFE;
  const qrLeft = qrRight - code.side;
  const qrTop = 138;

  const rows = [
    ['Pickup', T.fmtWindow(d.pickup[0], d.pickup[1])],
    d.deliveryOn ? ['Delivery', `Across ${d.zone}`] : null,
    ['Orders close', `${hour12(d.cutoffHour)} the night before`],
  ].filter(Boolean);

  const rowTop = 300;
  const rowH = 84;
  const columnRight = qrLeft - 56;

  const body = [
    label('Supper club', { x: left + 122, y: 168, size: 19, fill: palette['tan-deep'], track: 6 }),
    text(d.business, { x: left + 122, y: 224, size: 52, fill: palette.umber, font: DISPLAY }),
    rule(left, 262, columnRight, palette.tan, 0.45, 2),

    rows.map(([k, v], i) => {
      const top = rowTop + i * rowH;
      return [
        label(k, { x: left, y: top, size: 18, fill: palette['tan-deep'], track: 5 }),
        text(v, { x: left, y: top + 38, size: 29, fill: palette.espresso, font: DISPLAY }),
      ].join('');
    }).join(''),

    text(d.contact,
      { x: left, y: H - SAFE - 6, size: 21, fill: palette['umber-soft'], font: BODY }),

    label('Scan to order', {
      x: qrLeft + code.side / 2, y: qrTop + code.side + 46,
      size: 19, fill: palette['tan-deep'], anchor: 'middle', track: 5,
    }),
    text(url.replace(/^https?:\/\//, ''), {
      x: qrLeft + code.side / 2, y: qrTop + code.side + 86,
      size: 24, fill: palette.umber, anchor: 'middle', font: DISPLAY,
    }),
  ].join('');

  const file = await render('card-back.png', palette.parchment, body, [
    { input: seal, top: 128, left },
    { input: code.data, top: qrTop, left: qrLeft },
  ]);

  return { file, code };
}

/* --- Run ------------------------------------------------------------------ */
async function generate() {
  for (const f of [brandmark.LINEART, brandmark.SOURCE]) {
    if (!fs.existsSync(f)) throw new Error(`Missing brand artwork: ${f}`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const d = loadDetails();
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base || 'https://dinner-by-derek.example';

  const face = await front();
  const { file, code } = await back(d, url);

  return {
    dir: OUT,
    files: [face, file],
    url,
    qr: `version ${code.version}, level ${code.level}`,
    // The warning is returned rather than printed, because the person running
    // this from a phone is not looking at a terminal. It is the only thing
    // standing between a placeholder and a box of cards with a dead QR on them.
    warnings: base ? [] : [
      'BASE_URL is not set on this server, so the QR points at a placeholder. ' +
      'Set it and generate again before sending anything to a printer. The address ' +
      'is printed under the code, so the wrong one is visible on the card.',
    ],
    notes: [`QR: ${url}`],
  };
}

if (require.main === module) {
  (async () => {
    console.log('\nGenerating the business card');
    const out = await generate();
    for (const f of out.files) {
      console.log(`  ${f.name.padEnd(18)} ${f.width}×${f.height}  (3.5×2in + bleed, ${DPI} DPI)`);
    }
    console.log(`  QR                 ${out.qr}, ${out.url}`);
    for (const w of out.warnings) console.log(`\n  ⚠  ${w}`);
    console.log(`\nDone. Both faces are in ${out.dir}.\n`);
  })().catch((e) => {
    console.error('\nBusiness card failed:', e.message, '\n');
    process.exit(1);
  });
}

module.exports = { generate, OUT };
