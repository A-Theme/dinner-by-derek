'use strict';
/**
 * Launch campaign artwork.
 *
 *   npm run campaign
 *
 * Six pieces for the launch described in marketing/. They are campaign
 * graphics rather than weekly ones: they say durable things — what this is,
 * how ordering works, where delivery reaches — and they are generated once and
 * posted over six weeks. The weekly menu poster and the last-call reminder are
 * a different job and stay in scripts/social.js, where they read the live
 * database every Saturday.
 *
 * | announce       1080×1350  what this is                      (post A1)
 * | how-it-works   1080×1350  four steps, for a stranger         (post A2)
 * | quiet-move     1080×1080  for the regulars — the quietest    (posts R1, R3)
 * | allergens      1080×1080  the review that gates publishing   (post A4)
 * | story          1080×1920  stories and reels covers      QR
 * | flyer          1275×1650  US Letter at 150 DPI          QR   print
 *
 * Colours come from theme.css via server/theme, so this file contains no hex
 * literals of its own — the same rule the rest of the codebase keeps, and one
 * the acceptance suite enforces. Every text pairing used here is one
 * CONTRAST.md already measured; see the note above each ground.
 *
 * WHY THIS ONE LOADS dotenv AND THE OTHERS DO NOT. card.js and sticker.js read
 * process.env.BASE_URL directly, and dotenv is loaded in exactly one file —
 * server/config.js — which neither of them requires. Run from a shell they see
 * no BASE_URL and quietly emit a placeholder QR, which is why the README sends
 * you to the Dashboard for those two. This script is only ever run from a
 * shell, so instead it reads .env itself and REFUSES to write the two pieces
 * carrying a QR when there is still no BASE_URL. A missing flyer is a problem
 * you can see. A flyer with a dead code on it is one you find out about from a
 * printer's invoice.
 *
 * The database is opened READ ONLY and by path, deliberately bypassing
 * server/config.js: this is a drawing tool and it should not refuse to run
 * because an unrelated admin password is missing from the environment.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { palette } = require('../server/theme');
const brandmark = require('./brandmark');
const qr = require('./qr');

const root = path.join(__dirname, '..');

/* .env, before anything reads BASE_URL. Wrapped because dotenv is a dependency
   of the app rather than of this script, and a drawing tool should degrade to
   "no QR pieces" rather than fail to start. */
try { require('dotenv').config({ path: path.join(root, '.env'), quiet: true }); } catch { /* not installed */ }

const GRAPHICS = process.env.GRAPHICS_DIR || path.join(root, 'data', 'graphics');
const OUT = path.join(GRAPHICS, 'campaign');

/* --- Type ----------------------------------------------------------------
   Mirrors theme.css. Liberation faces are the metric-compatible substitutes a
   Linux server will have when Georgia and Segoe UI are absent. */
const DISPLAY = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman','Liberation Serif',serif";
const BODY = "'Segoe UI',Roboto,'Helvetica Neue',Arial,'Liberation Sans',sans-serif";

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* --- SVG helpers ---------------------------------------------------------- */
function text(s, { x, y, size, fill, font = BODY, anchor = 'start', track = 0, weight = 'normal' }) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}"
    text-anchor="${anchor}" letter-spacing="${track}" font-weight="${weight}">${esc(s)}</text>`;
}

/** Small caps label — the workwear-stencil voice used throughout the app. */
const label = (s, o) => text(String(s).toUpperCase(), { ...o, font: BODY, track: o.track ?? 4 });

const rule = (x1, y, x2, stroke, opacity = 0.35, width = 2) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;

/**
 * A run of lines at a fixed leading. Every string is written out in full at
 * the call site rather than wrapped here: these are six fixed posters, and a
 * wrapping routine that guesses advance widths is how a line ends up one word
 * over the edge on a machine with different fonts installed.
 */
function lines(items, { x, y, size, fill, font = BODY, anchor = 'start', leading }) {
  return items.map((s, i) => text(s, { x, y: y + i * leading, size, fill, font, anchor })).join('');
}

async function render(file, width, height, ground, svgBody, marks = []) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${ground}"/>${svgBody}</svg>`
  );
  await sharp(svg)
    .composite(marks)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
  return { name: file, width, height };
}

/* --- The QR ---------------------------------------------------------------
 * Lifted in shape from card.js and for the same reason: drawn as raw pixels
 * and scaled by whole modules with nearest-neighbour, so every module edge
 * lands on a pixel boundary. A resampled QR with soft edges is a QR that a
 * phone in a dim hallway gives up on. Espresso on cream-hi, 15.21:1.
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

/* --- Live wording ---------------------------------------------------------
 * The pickup window, the cutoff and whether delivery is on are all settings a
 * person can change from a phone, and two of these pieces get printed. Read
 * them rather than assert them, and fall back to the seeded values when there
 * is no database yet — a fresh checkout should still be able to see the
 * layouts.
 */
function loadFacts() {
  const fallback = { pickup: ['16:00', '19:00'], cutoffHour: 22, deliveryOn: true };

  const dbPath = process.env.DB_PATH || path.join(root, 'data', 'dinnerbyderek.db');
  if (!fs.existsSync(dbPath)) return fallback;

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const setting = (k, d) => {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
      return r && String(r.value).trim() !== '' ? r.value : d;
    };
    return {
      pickup: [setting('pickup_start', '16:00'), setting('pickup_end', '19:00')],
      cutoffHour: Number(setting('cutoff_hour', '22')),
      deliveryOn: setting('delivery_enabled', '1') === '1',
    };
  } catch {
    /* An older file may predate a column or a key this reads. The posters are
       not worth failing over; the seeded values are the ones they were written
       against. Nothing else is read here, so there is nothing correct to
       lose by falling back wholesale. */
    return fallback;
  } finally {
    db.close();
  }
}

/** 22 → "10 PM". The cutoff is always on the hour in Settings. */
const hour12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/** "16:00" → "4:00". Sides of a window, so the meridiem is printed once. */
const clock = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`;
};
const windowText = ([a, b]) => {
  const [ha] = String(a).split(':').map(Number);
  const [hb] = String(b).split(':').map(Number);
  const mer = (h) => (h < 12 ? 'AM' : 'PM');
  return mer(ha) === mer(hb)
    ? `${clock(a)}–${clock(b)} ${mer(hb)}`
    : `${clock(a)} ${mer(ha)}–${clock(b)} ${mer(hb)}`;
};

/* ==========================================================================
   1 · announce — what this is                                     (post A1)
   Olive ground: parchment body at 5.38:1, tan-lift for the tracked labels,
   which are large. Saddle Tan appears as a rule only — 1.88:1 on olive, and
   CONTRAST.md is explicit that it is never text.
   ========================================================================== */
async function announce(f) {
  const W = 1080, H = 1350, MID = W / 2;
  const mark = await brandmark.wordmark({ height: 300 });

  const body = [
    rule(88, 92, W - 88, palette.tan, 0.34, 2),
    label('Supper club · Kitchener & Waterloo',
      { x: MID, y: 486, size: 26, fill: palette['tan-lift'], anchor: 'middle', track: 8 }),
    rule(MID - 200, 534, MID + 200, palette.tan, 0.5),

    lines([
      'A small menu,',
      'cooked the day',
      'you collect it.',
    ], { x: MID, y: 664, size: 84, fill: palette.parchment, font: DISPLAY, anchor: 'middle', leading: 104 }),

    rule(MID - 200, 1000, MID + 200, palette.tan, 0.5),

    lines([
      `Order by ${hour12(f.cutoffHour)} the night before.`,
      f.deliveryOn
        ? `Collect ${windowText(f.pickup)}, or delivered.`
        : `Collect ${windowText(f.pickup)}.`,
    ], { x: MID, y: 1084, size: 38, fill: palette.parchment, font: DISPLAY, anchor: 'middle', leading: 56 }),

    label('dinnerbyderek.ca',
      { x: MID, y: 1232, size: 32, fill: palette['tan-lift'], anchor: 'middle', track: 6 }),
    rule(88, H - 92, W - 88, palette.tan, 0.34, 2),
  ].join('');

  return render('announce.png', W, H, palette.olive, body,
    [{ input: mark.data, top: 150, left: Math.round(MID - mark.width / 2) }]);
}

/* ==========================================================================
   2 · how-it-works — four steps                                   (post A2)
   Parchment ground: espresso body 14.08:1, umber headings 11.23:1, tan-deep
   for the numerals 5.14:1. The step numbers sit in tan discs with umber-deep
   on them, 4.52:1 — the badge pairing the audit produced.
   ========================================================================== */
async function howItWorks(f) {
  const W = 1080, H = 1350, LEFT = 104;
  const seal = await brandmark.stamp({ width: 108, colour: palette.umber });

  /* Broken by hand rather than wrapped. These are four fixed lines on one
     fixed poster, and a wrapping routine that guesses advance widths is how a
     line ends up one word over the edge on a machine with different fonts
     installed. Keep each under about sixty characters. */
  const steps = [
    ['Look at the week', [
      'Every day, every dish, the prices, and what has sold out.',
    ]],
    ['Pick your day', [
      'Pickup or delivery. Type your postal code and it answers',
      'on the spot — no waiting on a reply.',
    ]],
    [`Order by ${hour12(f.cutoffHour)}`, [
      'The night before. Everything is cooked the day you get it,',
      'so there are no same-day orders.',
    ]],
    ['Collect, or answer the door', [
      `${windowText(f.pickup)}. E-transfer or cash. No account,`,
      'no card, nothing to download.',
    ]],
  ];

  const rows = steps.map(([title, desc], i) => {
    const y = 460 + i * 190;
    return [
      `<circle cx="${LEFT + 38}" cy="${y - 14}" r="38" fill="${palette.tan}"/>`,
      text(String(i + 1), {
        x: LEFT + 38, y: y + 2, size: 40, fill: palette['umber-deep'],
        anchor: 'middle', font: DISPLAY,
      }),
      text(title, { x: LEFT + 108, y: y - 20, size: 46, fill: palette.umber, font: DISPLAY }),
      lines(desc, { x: LEFT + 108, y: y + 26, size: 25, fill: palette.espresso, leading: 36 }),
      i < steps.length - 1 ? rule(LEFT, y + 96, W - LEFT, palette.tan, 0.3) : '',
    ].join('');
  }).join('');

  const body = [
    rule(LEFT, 92, W - LEFT, palette.tan, 0.4, 3),
    label('How it works', { x: LEFT, y: 262, size: 28, fill: palette['tan-deep'], track: 8 }),
    text('Ordering supper', { x: LEFT, y: 352, size: 78, fill: palette.umber, font: DISPLAY }),
    rows,
    rule(LEFT, 1160, W - LEFT, palette.tan, 0.4, 3),
    text('dinnerbyderek.ca', { x: LEFT, y: 1232, size: 40, fill: palette.umber, font: DISPLAY }),
    label('Supper club · Kitchener & Waterloo',
      { x: LEFT, y: 1274, size: 21, fill: palette['umber-soft'], track: 4 }),
  ].join('');

  return render('how-it-works.png', W, H, palette.parchment, body,
    [{ input: seal.data, top: 1180, left: W - LEFT - 108 }]);
}

/* ==========================================================================
   3 · quiet-move — for the regulars                          (posts R1, R3)
   The quietest piece in the set on purpose: this one is shown to people who
   have been ordering for three years and are being offered something, not
   sold it. Umber-deep ground, parchment text — the same ground the last-call
   reminder uses, so it reads as part of the weekly furniture rather than as
   an announcement.
   ========================================================================== */
async function quietMove() {
  const S = 1080, MID = S / 2;
  const mark = await brandmark.wordmark({ height: 168 });

  const body = [
    label('Nothing has changed', { x: MID, y: 470, size: 26, fill: palette.ochre, anchor: 'middle', track: 10 }),
    lines([
      'Same menu.',
      'Same Derek.',
    ], { x: MID, y: 590, size: 92, fill: palette.parchment, font: DISPLAY, anchor: 'middle', leading: 104 }),
    rule(MID - 190, 748, MID + 190, palette.tan, 0.5),
    text('There’s a link now, if you want it.',
      { x: MID, y: 828, size: 40, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    label('Order in the comments as always — either one reaches me',
      { x: MID, y: 890, size: 19, fill: palette['tan-lift'], anchor: 'middle', track: 2 }),
    label('dinnerbyderek.ca',
      { x: MID, y: 966, size: 26, fill: palette['tan-lift'], anchor: 'middle', track: 6 }),
  ].join('');

  return render('quiet-move.png', S, S, palette['umber-deep'], body,
    [{ input: mark.data, top: 214, left: Math.round(MID - mark.width / 2) }]);
}

/* ==========================================================================
   4 · allergens — the review that gates publishing                (post A4)
   The one genuinely unusual claim this business has, and the poster is built
   to be boring on purpose: a mechanism stated plainly is more convincing than
   a mechanism decorated. The caveat line is not optional — without it the
   image reads as a safety claim, which it is not. See marketing/STRATEGY.md.
   ========================================================================== */
async function allergens() {
  const S = 1080, LEFT = 100;

  const body = [
    rule(LEFT, 96, S - LEFT, palette.tan, 0.4, 3),
    label('Before the menu goes up', { x: LEFT, y: 232, size: 26, fill: palette['tan-deep'], track: 8 }),
    lines([
      'Every dish is',
      'read for allergens.',
    ], { x: LEFT, y: 320, size: 72, fill: palette.umber, font: DISPLAY, leading: 88 }),
    rule(LEFT, 462, LEFT + 260, palette.tan, 0.6, 3),

    lines([
      'Not a warning I can click past — the app refuses',
      'to publish a week holding a dish nobody has',
      'reviewed. Every dish, every week, checked against',
      'a dictionary of 479 ingredients and terms.',
    ], { x: LEFT, y: 548, size: 30, fill: palette.espresso, leading: 46 }),

    rule(LEFT, 736, S - LEFT, palette.tan, 0.3),
    lines([
      'It does not make a one-person kitchen',
      'allergen-free, and I would never tell you it did.',
      'Tell me when you order as well.',
    ], { x: LEFT, y: 794, size: 25, fill: palette['umber-soft'], leading: 38 }),

    rule(LEFT, S - 172, S - LEFT, palette.tan, 0.4, 3),
    text('dinnerbyderek.ca', { x: LEFT, y: S - 108, size: 38, fill: palette.umber, font: DISPLAY }),
    label('Supper club · Kitchener & Waterloo',
      { x: S - LEFT, y: S - 108, size: 20, fill: palette['umber-soft'], anchor: 'end', track: 4 }),
  ].join('');

  return render('allergens.png', S, S, palette.parchment, body);
}

/* ==========================================================================
   5 · story — 1080×1920, carries a QR
   A story is watched with a thumb already on the screen, so the code sits low
   where a thumb is not, and the address is printed under it — the same rule
   the business card follows, so a wrong one is visible rather than silent.
   ========================================================================== */
async function story(f, url) {
  const W = 1080, H = 1920, MID = W / 2;
  const mark = await brandmark.wordmark({ height: 300 });
  const code = await qrImage(url, 320);

  const body = [
    rule(96, 120, W - 96, palette.tan, 0.34, 2),
    label('Supper club · Kitchener & Waterloo',
      { x: MID, y: 740, size: 26, fill: palette['tan-lift'], anchor: 'middle', track: 8 }),
    rule(MID - 200, 790, MID + 200, palette.tan, 0.5),

    lines([
      'A small menu,',
      'cooked the day',
      'you collect it.',
    ], { x: MID, y: 920, size: 80, fill: palette.parchment, font: DISPLAY, anchor: 'middle', leading: 100 }),

    lines([
      `Order by ${hour12(f.cutoffHour)} the night before.`,
      f.deliveryOn ? `Collect ${windowText(f.pickup)}, or delivered.` : `Collect ${windowText(f.pickup)}.`,
    ], { x: MID, y: 1240, size: 36, fill: palette.parchment, font: DISPLAY, anchor: 'middle', leading: 54 }),

    label('dinnerbyderek.ca',
      { x: MID, y: 1748, size: 30, fill: palette['tan-lift'], anchor: 'middle', track: 6 }),
    rule(96, H - 120, W - 96, palette.tan, 0.34, 2),
  ].join('');

  return render('story.png', W, H, palette.olive, body, [
    { input: mark.data, top: 370, left: Math.round(MID - mark.width / 2) },
    { input: code.data, top: 1390, left: Math.round(MID - code.side / 2) },
  ]);
}

/* ==========================================================================
   6 · flyer — US Letter at 150 DPI, carries a QR
   Printed at home on a home printer, so: parchment ground rather than a solid
   flood of olive, which drinks a cartridge and bleeds on ordinary paper. The
   mark is the flat stamp for the same reason — the gold lockup is a gradient
   and needs a dark ground to be lighter than.
   ========================================================================== */
async function flyer(f, url) {
  const W = 1275, H = 1650, LEFT = 120, MID = W / 2;
  const seal = await brandmark.stamp({ width: 300, colour: palette.umber });
  /* 240 rather than the card's 300. At 150 DPI that is a 40mm symbol, which a
     phone reads from arm's length off a noticeboard, and it leaves room under
     the code for the address — which is the whole reason a flyer can be
     proofread and a sticker cannot. */
  const code = await qrImage(url, 240);

  const facts = [
    [`Order by ${hour12(f.cutoffHour)}`, 'the night before'],
    ['Collect', windowText(f.pickup)],
    [f.deliveryOn ? 'Delivery' : 'Pickup only', f.deliveryOn ? 'across Kitchener & Waterloo' : 'no delivery at present'],
    ['E-transfer or cash', 'no card, no account'],
  ];

  const factRows = facts.map(([k, v], i) => {
    const y = 900 + i * 92;
    return [
      label(k, { x: LEFT, y, size: 26, fill: palette['tan-deep'], track: 5 }),
      text(v, { x: LEFT + 430, y, size: 30, fill: palette.espresso }),
      rule(LEFT, y + 30, W - LEFT, palette.tan, 0.28),
    ].join('');
  }).join('');

  const codeTop = 1280;
  const codeLeft = W - LEFT - code.side;
  const body = [
    rule(LEFT, 110, W - LEFT, palette.tan, 0.45, 3),
    text('DINNER BY DEREK', { x: MID, y: 560, size: 76, fill: palette.umber, anchor: 'middle', font: DISPLAY, track: 4 }),
    label('Supper club · Kitchener & Waterloo',
      { x: MID, y: 616, size: 25, fill: palette['tan-deep'], anchor: 'middle', track: 8 }),
    rule(MID - 230, 664, MID + 230, palette.tan, 0.6, 2),

    lines([
      'A small menu, cooked fresh, a few days a week.',
      'Pick it up, or have it brought to you.',
    ], { x: MID, y: 752, size: 34, fill: palette.espresso, font: DISPLAY, anchor: 'middle', leading: 50 }),

    factRows,

    lines([
      'Scan it, or type it in.',
      'The whole week is on there —',
      'every day, every dish, every price.',
    ], { x: LEFT, y: 1348, size: 30, fill: palette['umber-soft'], leading: 44 }),

    /* The address under the code, the way the business card prints it. A
       sticker cannot show you it is wrong; a flyer can, and should. */
    label('dinnerbyderek.ca', {
      x: codeLeft + code.side / 2, y: codeTop + code.side + 48,
      size: 26, fill: palette.umber, anchor: 'middle', track: 4,
    }),
    rule(LEFT, H - 50, W - LEFT, palette.tan, 0.45, 3),
  ].join('');

  return render('flyer.png', W, H, palette.parchment, body, [
    { input: seal.data, top: 190, left: Math.round(MID - 150) },
    { input: code.data, top: codeTop, left: codeLeft },
  ]);
}

/* --- Generate ------------------------------------------------------------- */
async function generate() {
  if (!fs.existsSync(brandmark.LINEART)) {
    throw new Error(`Missing brand artwork: ${brandmark.LINEART}`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const f = loadFacts();
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');

  const files = [
    await announce(f),
    await howItWorks(f),
    await quietMove(),
    await allergens(),
  ];
  const warnings = [];
  let codeNote = null;

  if (base) {
    const s = await story(f, base);
    const fl = await flyer(f, base);
    files.push(s, fl);
    codeNote = `QR: ${base}`;
  } else {
    /* Not a placeholder. The flyer is the one piece here that ends up on
       paper, and a placeholder QR on paper is discovered by a stranger with a
       phone rather than by anyone who could fix it.
       Anything left from an earlier run goes too. Refusing to write a file
       while last week's copy of it sits in the same folder is not a refusal —
       it is a stale flyer that looks freshly generated, which is the failure
       this branch exists to prevent, wearing a different hat. */
    for (const stale of ['story.png', 'flyer.png']) {
      fs.rmSync(path.join(OUT, stale), { force: true });
    }
    warnings.push(
      'BASE_URL is not set, so story.png and flyer.png were NOT written, and any '
      + 'earlier copies of them were removed — both carry a QR code, and a printed '
      + 'flyer with a dead code on it cannot be corrected. Set BASE_URL in .env and '
      + 'run this again. The other four pieces carry no code and are finished.'
    );
  }

  return { dir: OUT, files, url: base || null, warnings, notes: codeNote ? [codeNote] : [] };
}

if (require.main === module) {
  (async () => {
    console.log('\nGenerating the launch campaign artwork');
    const out = await generate();
    for (const file of out.files) {
      console.log(`  ${file.name.padEnd(18)} ${file.width}×${file.height}`);
    }
    for (const n of out.notes) console.log(`  ${'QR'.padEnd(18)} ${n.replace(/^QR: /, '')}`);
    for (const w of out.warnings) console.log(`\n  ⚠  ${w}`);
    console.log(`\nDone. ${out.files.length} piece${out.files.length === 1 ? '' : 's'} in ${out.dir}.`);
    console.log('Where each one goes: marketing/PRINT.md\n');
  })().catch((e) => {
    console.error('\nCampaign artwork failed:', e.message, '\n');
    process.exit(1);
  });
}

module.exports = { generate, OUT };
