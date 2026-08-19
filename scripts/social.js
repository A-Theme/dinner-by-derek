'use strict';
/**
 * Social graphics for the Facebook page.
 *
 *   npm run social          — from a terminal
 *   Dashboard → Graphics    — from a phone
 *
 * Both go through generate() below. The command-line path is a shim around it,
 * so what the button does and what the command does cannot drift apart.
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

/**
 * Generated images live outside the app directory, beside the database and the
 * uploads, because a redeploy wipes the app directory and these are now made
 * from a phone rather than from a checkout. `public/social/` still holds the
 * versions committed to the repo; index.js serves this directory first and
 * falls back to those, so a fresh install has a link preview before anything
 * has been generated. Point GRAPHICS_DIR at a persistent volume in production,
 * the same as DB_PATH and UPLOAD_DIR.
 */
const GRAPHICS = process.env.GRAPHICS_DIR || path.join(root, 'data', 'graphics');
const OUT = path.join(GRAPHICS, 'social');

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
  return { name: file, width, height };
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
    // A closed week has nothing to advertise. Better to fall back to the
    // sample copy, which is obviously a sample, than to post a menu graphic
    // for dates the kitchen is shut.
    if (week.closed) return null;

    // Opened readonly, so this file may predate the closure columns if the
    // server has not started against it yet. Ask before relying on them.
    const hasClosed = db.prepare('PRAGMA table_info(service_days)').all()
      .some((c) => c.name === 'closed');

    // A closed day is ON the poster, not missing from it. Leaving it out
    // produces a week with a hole in the middle, which reads as an oversight —
    // and the whole reason for closing a day rather than leaving it blank is
    // to tell people. Blank days stay out: those are the ones nobody decided.
    const days = db.prepare(`
      SELECT service_date, dish_name, full_price
             ${hasClosed ? ', closed, closed_note' : ', 0 AS closed, \'\' AS closed_note'}
      FROM service_days
      WHERE week_id = ? AND (TRIM(dish_name) != ''${hasClosed ? ' OR closed = 1' : ''})
      ORDER BY service_date`).all(week.id);
    if (!days.length) return null;
    if (days.every((d) => d.closed)) return null;   // nothing to advertise

    return {
      title: week.title,
      days,
      tz: setting('timezone', 'America/Toronto'),
      pickup: [setting('pickup_start', '16:00'), setting('pickup_end', '19:00')],
      cutoffHour: Number(setting('cutoff_hour', '22')),
      /* As a clock string, because the poster prints a time and the minutes
       * are part of it: a 22:30 cutoff used to be drawn as 10:00 PM. */
      cutoff: `${String(setting('cutoff_hour', '22')).padStart(2, '0')}:`
        + `${String(setting('cutoff_minute', '0')).padStart(2, '0')}`,
      lateCutoff: `${String(setting('late_cutoff_hour', '6')).padStart(2, '0')}:`
        + `${String(setting('late_cutoff_minute', '0')).padStart(2, '0')}`,
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
    // A closed day in the sample too, so the template can be judged with one
    // in it rather than only discovering how it looks on a real post.
    { service_date: '2026-08-19', dish_name: '', full_price: null, closed: 1, closed_note: 'Back Thursday' },
    { service_date: '2026-08-20', dish_name: 'Pork Schnitzel', full_price: 1800 },
  ],
  tz: 'America/Toronto',
  pickup: ['16:00', '19:00'],
  cutoffHour: 22,
  cutoff: '22:00',
  lateCutoff: '06:00',
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
  return render('cover.png', W, H, palette.olive, body,
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
  return render('profile.png', S, S, palette.olive, '',
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
      // A closed day keeps its date and its row, and says so where the dish
      // would be — in the muted ink, with no price, so the eye reads it as a
      // gap in the cooking rather than as a dish called "Closed".
      const shut = !!d.closed;
      const note = String(d.closed_note || '').trim();
      // Separated by a middot, not a dash: the note is the owner's own
      // sentence and often contains a dash of its own, and "Closed — Back
      // Wednesday — kitchen deep clean" reads as one long stutter.
      const line = shut ? (note ? `Closed · ${note}` : 'Closed') : d.dish_name;
      const price = shut ? '' : money(d.full_price);
      return [
        label(T.fmtDayLong(d.service_date, w.tz),
          { x: panelX + 40, y: dayY, size: dayySize, fill: palette['tan-deep'], track: 4 }),
        text(fit(line, dishSize, shut ? panelW - 80 : dishMax), {
          x: panelX + 40, y: dishY, size: dishSize, font: DISPLAY,
          fill: shut ? palette['umber-soft'] : palette.espresso,
        }),
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

  return render('menu.png', W, H, palette.olive, body,
    [{ input: mark.data, top: 84, left: Math.round(mid - mark.width / 2) }]);
}

/**
 * Which day the last-call poster is about, and whether tonight is its cutoff.
 *
 * The cutoff is 22:00 on the day BEFORE service, so the answer is tomorrow's
 * service day — not the week's first, which is what this used to draw. Made on
 * a Tuesday the poster has to read Wednesday, because tonight's ten o'clock is
 * what closes Wednesday. Naming the first day of the week meant that from
 * Tuesday onward it advertised a cutoff already gone.
 *
 * Separate from the drawing so it can be checked without rendering a PNG, and
 * so the rule lives in one readable place rather than inside an SVG template.
 *
 * Returns { subject, tonight, upcoming }:
 *   subject   the day to name
 *   tonight   true when the cutoff really is this evening
 *   upcoming  false when nothing on this week is still ahead, so the caller
 *             can say so instead of drawing a confident poster about a day
 *             that has been and gone
 */
function lastCallDay(days, today) {
  // A closed day is never the subject: there is no order to get in before it.
  const cooking = days.filter((d) => !d.closed);
  const tonight = cooking.find((d) => d.service_date === T.addDays(today, 1)) || null;
  const next = tonight || cooking.find((d) => d.service_date > today) || null;
  return {
    subject: next || cooking[0] || days[0] || null,
    tonight: !!tonight,
    upcoming: !!next,
  };
}

/**
 * Last call, 1080×1080. Umber is the palette's own closing/urgent tone.
 *
 * "Tonight" is only said when tonight is really the cutoff — see lastCallDay.
 * When the next day being cooked is further out, a Tuesday with nothing on
 * until Friday, the evening is named instead: a poster that says "tonight"
 * about Thursday is worse than one that says Thursday.
 */
async function lastCall(w) {
  const S = 1080, mid = S / 2;
  const mark = await brandmark.wordmark({ height: 190 });

  const { subject, tonight, upcoming } = lastCallDay(w.days, T.todayIn(w.tz));
  const dayName = (iso) => T.fmtDayLong(iso, w.tz).split(',')[0];
  const day = dayName(subject.service_date);
  const closes = T.fmtClock(w.cutoff || '22:00');
  const lateEnds = T.fmtClock(w.lateCutoff || '06:00');

  const body = [
    label('Last call', { x: mid, y: 502, size: 32, fill: palette.ochre, anchor: 'middle', track: 12 }),
    text(day, { x: mid, y: 638, size: 104, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    rule(mid - 220, 696, mid + 220, palette.tan, 0.5),
    text(tonight
      ? `Orders close tonight at ${closes}`
      : `Orders close ${dayName(T.addDays(subject.service_date, -1))} at ${closes}`,
      { x: mid, y: 776, size: 40, fill: palette.parchment, anchor: 'middle', font: DISPLAY }),
    // The second line has to name the end of the late window as well as its
    // start, or "it becomes a request" reads as an invitation to ask at four
    // the next afternoon — which the app now refuses. "Tomorrow" only works
    // when the cutoff is tonight; otherwise the day itself is named.
    label(tonight
      ? `Requests only after that, until ${lateEnds} tomorrow`
      : `Requests only after that, until ${lateEnds} ${day}`,
      { x: mid, y: 836, size: 22, fill: palette['tan-lift'], anchor: 'middle', track: 3 }),
  ].join('');

  const out = await render('last-call.png', S, S, palette['umber-deep'], body,
    [{ input: mark.data, top: 228, left: Math.round(mid - mark.width / 2) }]);

  /* Said out loud rather than drawn wrong. With every day on the week behind
   * us there is no last call to make, and the poster falls back to naming one
   * that has already gone. */
  return upcoming ? out : {
    ...out,
    note: 'The last-call reminder has no upcoming day to point at — every day on '
      + 'this week has passed, so it names one that is over. Publish the next week '
      + 'before posting it.',
  };
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
  return render('link-preview.png', W, H, palette.olive, body,
    [{ input: mark.data, top: 96, left: Math.round(mid - mark.width / 2) }]);
}

/* --- Run ------------------------------------------------------------------
 * generate() is the whole of it. The dashboard button calls it directly rather
 * than shelling out to `npm run social`: under systemd the service's PATH
 * often has no npm, and spawning a shell from an admin route buys nothing that
 * a function call doesn't already give — including the real error text.
 */
async function generate() {
  for (const f of [brandmark.LINEART, brandmark.SOURCE]) {
    if (!fs.existsSync(f)) throw new Error(`Missing brand artwork: ${f}`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const live = loadWeek();
  const w = live || SAMPLE;

  const files = [
    await cover(w),
    await profile(),
    await menu(w),
    await lastCall(w),
    await linkPreview(w),
  ];

  /* A piece that could not say the true thing says so here rather than
   * drawing it anyway — the dashboard prints these beside the button. */
  const notes = live ? [] : ['No week is published yet, so the menu post uses sample dishes.'];
  for (const f of files) if (f.note) notes.push(f.note);

  return {
    dir: OUT,
    files,
    notes,
  };
}

if (require.main === module) {
  (async () => {
    console.log('\nGenerating social graphics');
    const out = await generate();
    for (const f of out.files) {
      console.log(`  ${f.name.padEnd(24)} ${f.width}×${f.height}`);
    }
    for (const n of out.notes) console.log(`  (${n})`);
    console.log(`\nDone. Images are in ${out.dir}.\n`);
  })().catch((e) => {
    console.error('\nSocial graphics failed:', e.message, '\n');
    process.exit(1);
  });
}

module.exports = { generate, OUT, lastCallDay };
