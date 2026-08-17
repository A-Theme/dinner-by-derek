'use strict';
/**
 * Social graphics for the Facebook page.
 *
 *   npm run social
 *
 * Five pieces: a page cover, a profile picture, the weekly menu post, a
 * last-call reminder, and the image Facebook shows when the app's link is
 * pasted. The weekly menu reads the live database, so re-running it after
 * publishing a week produces that week's post rather than a template to fill
 * in by hand.
 *
 * Colours come from theme.css via server/theme.js, so this file contains no
 * hex literals of its own — change a brand colour there and these change too.
 *
 * The database is opened READ ONLY and by path, deliberately bypassing
 * server/config.js: this is a drawing tool, and it should not refuse to run
 * because an unrelated admin password is missing from the environment.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { palette } = require('../server/theme');
const brandmark = require('./brandmark');
const T = require('../server/time');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'public', 'social');

/* --- Type ---------------------------------------------------------------- */
/* Mirrors theme.css. Liberation faces are the metric-compatible substitutes
   a Linux server will have when Georgia and Segoe UI are absent. */
const DISPLAY = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Times New Roman','Liberation Serif',serif";
const BODY = "'Segoe UI',Roboto,'Helvetica Neue',Arial,'Liberation Sans',sans-serif";

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const money = (c) => (c == null ? '' : `$${(Number(c) / 100).toFixed(2)}`);

/** Rough ellipsis fit. Advance widths are unknown here, so this errs short. */
function fit(text, size, maxWidth, factor = 0.5) {
  const max = Math.floor(maxWidth / (size * factor));
  const t = String(text);
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/* --- SVG helpers --------------------------------------------------------- */
function text(s, { x, y, size, fill, font = BODY, anchor = 'start', track = 0, weight = 'normal' }) {
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}"
    text-anchor="${anchor}" letter-spacing="${track}" font-weight="${weight}">${esc(s)}</text>`;
}

/** Small caps label — the workwear-stencil voice used throughout the app. */
const label = (s, o) => text(String(s).toUpperCase(), { ...o, font: BODY, track: o.track ?? 4 });

const rule = (x1, y, x2, stroke, opacity = 0.35, width = 2) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;

async function render(file, width, height, ground, svgBody, marks = []) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${ground}"/>${svgBody}</svg>`
  );
  await sharp(svg)
    .composite(marks)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));
  console.log(`  ${file.padEnd(24)} ${width}×${height}`);
}

/* --- Live menu ------------------------------------------------------------ */
/**
 * The newest week worth posting, with its named dishes. Returns null when
 * there is nothing published yet, and the caller falls back to sample copy so
 * the templates can still be seen before the first real week exists.
 */
function loadWeek() {
  const dbPath = process.env.DB_PATH || path.join(root, 'data', 'dinnerbyderek.db');
  if (!fs.existsSync(dbPath)) return null;

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const setting = (k, d) => {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
      return r ? r.value : d;
    };
    const week = db.prepare(`SELECT * FROM weeks WHERE status IN ('published','draft')
      ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, id DESC LIMIT 1`).get();
    if (!week) return null;

    const days = db.prepare(`SELECT service_date, dish_name, full_price FROM service_days
      WHERE week_id = ? AND TRIM(dish_name) != '' ORDER BY service_date`).all(week.id);
    if (!days.length) return null;

    return {
      title: week.title,
      days,
      tz: setting('timezone', 'America/Toronto'),
      pickup: [setting('pickup_start', '16:00'), setting('pickup_end', '19:00')],
      cutoffHour: Number(setting('cutoff_hour', '22')),
      business: setting('business_name', 'Dinner By Derek'),
    };
  } finally {
    db.close();
  }
}

const SAMPLE = {
  title: 'Sample week',
  days: [
    { service_date: '2026-08-18', dish_name: 'Braised Beef Short Rib', full_price: 2200 },
    { service_date: '2026-08-19', dish_name: 'Butter Chicken', full_price: 1900 },
    { service_date: '2026-08-20', dish_name: 'Pork Schnitzel', full_price: 1800 },
  ],
  tz: 'America/Toronto',
  pickup: ['16:00', '19:00'],
  cutoffHour: 22,
  business: 'Dinner By Derek',
  sample: true,
};

/* --- The pieces ----------------------------------------------------------- */

/**
 * Page cover, 1640×624. Facebook crops the sides hard on phones, so the whole
 * lockup sits in the middle and only the hairlines run to the edges.
 */
async function cover(w) {
  const W = 1640, H = 624, mid = W / 2;
  const mark = await brandmark.wordmark({ height: 300 });
  const win = T.fmtWindow(w.pickup[0], w.pickup[1]);
  const markTop = 92;
  const body = [
    rule(0, 44, W, palette.tan, 0.3),
    rule(0, H - 44, W, palette.tan, 0.3),
    label('Supper club · Kitchener & Waterloo',
      { x: mid, y: 468, size: 27, fill: palette['tan-lift'], anchor: 'middle', track: 7 }),
    text(`Pickup ${win} · Delivery across KW`,
      { x: mid, y: 522, size: 26, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
  ].join('');
  await render('cover.png', W, H, palette.olive, body,
    [{ input: mark.data, top: markTop, left: Math.round(mid - mark.width / 2) }]);
}

/**
 * Profile picture, 1080×1080. Facebook masks it to a circle and shows it at
 * about 40px in a feed, so this is just the mark with breathing room — no
 * added ring, since the logo already carries one and a second reads as noise.
 */
async function profile() {
  const S = 1080, mid = S / 2;
  const mark = await brandmark.wordmark({ width: 760 });
  await render('profile.png', S, S, palette.olive, '',
    [{ input: mark.data, top: Math.round(mid - mark.height / 2), left: Math.round(mid - mark.width / 2) }]);
}

/**
 * The weekly menu post, 1080×1350 — portrait, which is the largest a Facebook
 * feed image is shown at. Dishes come from the live week.
 */
async function menu(w) {
  const W = 1080, H = 1350, mid = W / 2;
  const mark = await brandmark.wordmark({ height: 210 });

  // The panel is sized to its rows and centred in the space between the title
  // and the footer, so a three-day week reads as composed rather than as a
  // seven-day panel with four days missing. Type scales with the row height so
  // a full week still fits without the rows touching.
  const panelX = 64, panelW = W - 128;
  const bandTop = 470, bandBottom = 1120, pad = 52;
  const rows = w.days.slice(0, 7);
  const rowH = Math.min(150, (bandBottom - bandTop - pad * 2) / rows.length);
  const panelH = rows.length * rowH + pad * 2;
  const panelY = Math.round((bandTop + bandBottom) / 2 - panelH / 2);
  const startY = panelY + pad;

  const dishSize = Math.round(Math.max(26, Math.min(40, rowH * 0.27)));
  const dayySize = Math.round(Math.max(17, Math.min(22, rowH * 0.15)));
  const priceSize = Math.round(dishSize * 0.8);
  const dishMax = panelW - 80 - 150;   // leave room for the price column
  const win = T.fmtWindow(w.pickup[0], w.pickup[1]);

  const body = [
    label('This week', { x: mid, y: 378, size: 26, fill: palette['tan-lift'], anchor: 'middle', track: 8 }),
    text(w.title, { x: mid, y: 440, size: 52, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),

    `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="10"
      fill="${palette.parchment}"/>`,

    rows.map((d, i) => {
      const top = startY + i * rowH;
      const dayY = Math.round(top + rowH * 0.30);
      const dishY = Math.round(top + rowH * 0.68);
      const price = money(d.full_price);
      return [
        label(T.fmtDayLong(d.service_date, w.tz),
          { x: panelX + 40, y: dayY, size: dayySize, fill: palette['tan-deep'], track: 4 }),
        text(fit(d.dish_name, dishSize, dishMax),
          { x: panelX + 40, y: dishY, size: dishSize, fill: palette.espresso, font: DISPLAY }),
        price ? text(price, {
          x: panelX + panelW - 40, y: dishY, size: priceSize,
          fill: palette['tan-deep'], anchor: 'end', font: DISPLAY,
        }) : '',
        i < rows.length - 1
          ? rule(panelX + 40, top + rowH, panelX + panelW - 40, palette.tan, 0.3, 1)
          : '',
      ].join('');
    }).join(''),

    label(`Pickup ${win} · Delivery across KW`,
      { x: mid, y: 1188, size: 24, fill: palette['tan-lift'], anchor: 'middle', track: 4 }),
    text(`Orders close ${w.cutoffHour > 12 ? w.cutoffHour - 12 : w.cutoffHour}pm the night before`,
      { x: mid, y: 1240, size: 28, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    rule(mid - 180, 1274, mid + 180, palette.tan, 0.45),
    label('Order on our page', { x: mid, y: 1316, size: 23, fill: palette['tan-lift'], anchor: 'middle', track: 5 }),
  ].join('');

  await render('menu.png', W, H, palette.olive, body,
    [{ input: mark.data, top: 84, left: Math.round(mid - mark.width / 2) }]);
}

/** Last call, 1080×1080. Umber is the palette's own closing/urgent tone. */
async function lastCall(w) {
  const S = 1080, mid = S / 2;
  const mark = await brandmark.wordmark({ height: 190 });
  const day = T.fmtDayLong(w.days[0].service_date, w.tz).split(',')[0];
  const hour = w.cutoffHour > 12 ? w.cutoffHour - 12 : w.cutoffHour;
  const body = [
    label('Last call', { x: mid, y: 502, size: 32, fill: palette.ochre, anchor: 'middle', track: 12 }),
    text(day, { x: mid, y: 638, size: 104, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    rule(mid - 220, 696, mid + 220, palette.tan, 0.5),
    text(`Orders close tonight at ${hour}:00 PM`,
      { x: mid, y: 776, size: 40, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    label('After that it becomes a request, not an order',
      { x: mid, y: 836, size: 22, fill: palette['tan-lift'], anchor: 'middle', track: 3 }),
  ].join('');
  await render('last-call.png', S, S, palette['umber-deep'], body,
    [{ input: mark.data, top: 228, left: Math.round(mid - mark.width / 2) }]);
}

/**
 * Link preview, 1200×630. This is what Facebook shows when the app's address
 * is pasted, so it is wired in as the default og:image in views/layout.js.
 */
async function linkPreview(w) {
  const W = 1200, H = 630, mid = W / 2;
  const mark = await brandmark.wordmark({ height: 290 });
  const win = T.fmtWindow(w.pickup[0], w.pickup[1]);
  const body = [
    rule(0, 36, W, palette.tan, 0.3),
    rule(0, H - 36, W, palette.tan, 0.3),
    label('Order this week’s menu',
      { x: mid, y: 470, size: 30, fill: palette['tan-lift'], anchor: 'middle', track: 7 }),
    text(`Pickup ${win} · Delivery across Kitchener & Waterloo`,
      { x: mid, y: 528, size: 27, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
  ].join('');
  await render('link-preview.png', W, H, palette.olive, body,
    [{ input: mark.data, top: 96, left: Math.round(mid - mark.width / 2) }]);
}

/* --- Run ------------------------------------------------------------------ */
(async () => {
  for (const f of [brandmark.WORDMARK, brandmark.SOURCE]) {
    if (!fs.existsSync(f)) {
      console.error(`\nMissing ${f}\n`);
      process.exit(1);
    }
  }
  fs.mkdirSync(OUT, { recursive: true });

  const live = loadWeek();
  const w = live || SAMPLE;

  console.log('\nGenerating social graphics');
  if (!live) {
    console.log('  (no published week yet — the menu post uses sample dishes)');
  }

  await cover(w);
  await profile();
  await menu(w);
  await lastCall(w);
  await linkPreview(w);

  console.log('\nDone. Images are in public/social/.\n');
})().catch((e) => {
  console.error('\nSocial graphics failed:', e.message, '\n');
  process.exit(1);
});
