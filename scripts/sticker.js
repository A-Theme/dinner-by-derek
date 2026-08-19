'use strict';
/**
 * The sticker, for a thermal printer — 54 × 70 mm, portrait and landscape.
 *
 *   npm run sticker
 *
 * Thermal printing has no greys and no white ink. A dot is either burned or it
 * is not, and "white" is whatever the label stock already is. So this file
 * outputs BLACK AND TRANSPARENT ONLY: every pixel is either fully opaque black
 * or fully transparent, with no antialiasing anywhere. A soft edge would be
 * dithered by the printer driver into a scatter of dots, which on a 20 mm QR
 * code is the difference between scanning and not.
 *
 * Two files, one per orientation, each overwritten when you draw it again.
 * Label printers come in two resolutions and resampling a 1-bit image is
 * exactly the thing that ruins it, so a sticker is drawn at the resolution it
 * will print at — chosen in the dashboard, or 203 from the command line. Print
 * the one that matches your printer and the shape of your stock; never scale
 * one to fit.
 *
 *   203 dpi — Zebra, Rollo, most direct-thermal label printers
 *   300 dpi — Brother QL, higher-resolution desktop units
 *
 * The QR is drawn at an integer number of dots per module, so module edges land
 * on dot boundaries rather than between them. Its size is set by what scans,
 * not by what fits: in the tighter layout the mark gives up width, never the
 * code.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const qr = require('./qr');

const root = path.join(__dirname, '..');
const LINEART = path.join(root, 'brand', 'logo-lineart.png');
const OUT = path.join(process.env.GRAPHICS_DIR || path.join(root, 'data', 'graphics'), 'print');

/* --- The sheets -----------------------------------------------------------
 * One label in two orientations. Portrait stacks the mark over the code;
 * landscape sets them side by side, which is the only arrangement that uses
 * the extra width instead of leaving a band of blank stock down each side.
 */
const MARGIN_MM = 4.5;   // thermal feeds drift; keep ink well off the edge
/* And the mark never takes the whole of what is left. A logo running edge to
 * edge reads as an overflow even when it is inside the margin — it wants air
 * around it to look placed rather than crammed. */
const MARK_SHARE = 0.9;  // of the inner width, at most
/* The third sticker's wording, and how much of the label's height it takes.
 * Small on purpose: the code is what gets used, the words only say so. */
const SCAN_TEXT = 'SCAN ME';
const SCAN_TEXT_SHARE = 0.07; // of the inner height
const QR_MM = 21;        // target, rounded down to a whole number of dots per module
const GAP_MM = 2.5;      // between the mark and the code

const LAYOUTS = [
  { name: 'portrait', w: 54, h: 70, stack: 'vertical' },
  { name: 'landscape', w: 70, h: 54, stack: 'horizontal' },
  { name: 'scan', w: 54, h: 70, stack: 'scan' },
];

/* Below this the code stops being worth printing. A phone camera in a doorway
 * needs modules it can resolve, and a QR that has been squeezed onto a label
 * too small for it is worse than no sticker: it looks finished and does
 * nothing. A label that cannot hold one is refused by name rather than
 * quietly printed. */
const MIN_QR_MM = 15;
/* Smaller than this the mark is a smudge rather than a logo, and the label is
 * better off carrying the code alone. */
const MIN_MARK_MM = 10;
const SIZE_LIMITS = { min: 20, max: 200 };   // mm, per side
const DPI_CHOICES = [203, 300];

/** The artwork's own proportions, read once. */
let aspectCache = null;
async function markAspect() {
  if (aspectCache === null) {
    const m = await sharp(LINEART).metadata();
    aspectCache = m.width / m.height;
  }
  return aspectCache;
}

/**
 * Ink as alpha: white in this mask means burn a dot.
 *
 * Thresholded AFTER resizing, never before. Resizing interpolates and produces
 * grey; thresholding last is what turns that grey back into a hard edge at the
 * final size rather than a soft one scaled up.
 */
async function lineartMask(width) {
  return sharp(LINEART)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width, kernel: 'lanczos3' })
    .greyscale()
    .negate()                 // ink becomes bright
    .threshold(128)           // and then absolute: 0 or 255, nothing between
    .toColourspace('b-w')
    .png()
    .toBuffer();
}

/** The QR as an alpha mask, at an exact whole number of dots per module. */
function qrMask(url, maxDots) {
  const code = qr.encode(url, { level: 'Q' });
  const quiet = 4;                       // the standard quiet zone, in modules
  const n = code.size + quiet * 2;
  const scale = Math.max(2, Math.floor(maxDots / n));
  const side = n * scale;

  const buf = Buffer.alloc(n * n);
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n) - quiet;
    const c = (i % n) - quiet;
    const on = r >= 0 && c >= 0 && r < code.size && c < code.size
      && code.modules[r * code.size + c];
    buf[i] = on ? 255 : 0;
  }
  return {
    mask: sharp(buf, { raw: { width: n, height: n, channels: 1 } })
      .resize(side, side, { kernel: 'nearest' }),   // integer, so edges stay hard
    side,
    scale,
    version: code.version,
    modules: code.size,
  };
}

/**
 * "SCAN ME", set the way the brandmark sets BY DEREK.
 *
 * The same face, weight and wide tracking as the lettering inside the
 * medallion — a sticker that says something in a different voice from the logo
 * two inches away looks like it came from somewhere else. Rendered large and
 * thresholded like everything else here, so the letters end up as burned dots
 * with hard edges rather than grey ones the printer will dither.
 */
const LABEL_FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,'Liberation Sans',sans-serif";

async function textMask(text, sizeDots) {
  const track = Math.round(sizeDots * 0.18);       // the wide tracking of BY DEREK
  const pad = Math.round(sizeDots);
  const w = Math.round(sizeDots * (text.length + 2) * 0.9) + pad * 2;
  const h = Math.round(sizeDots * 2.4);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <rect width="100%" height="100%" fill="white"/>
       <text x="${Math.round(w / 2)}" y="${Math.round(h / 2)}"
             text-anchor="middle" dominant-baseline="central"
             font-family="${LABEL_FONT}" font-size="${sizeDots}" font-weight="700"
             letter-spacing="${track}" fill="black">${text}</text>
     </svg>`);

  const mask = await sharp(svg)
    .greyscale()
    .negate()                 // ink becomes bright, as in lineartMask
    .threshold(128)
    .toColourspace('b-w')
    .trim()                   // crop to the lettering itself
    .png()
    .toBuffer();
  const m = await sharp(mask).metadata();
  return { mask, width: m.width, height: m.height };
}

/** Black pixels wherever the mask says burn, transparent everywhere else. */
async function inkOn(mask, width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(mask)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The third sticker: the code, as large as the label allows, and the two words
 * telling somebody what to do with it.
 *
 * No medallion on this one. It goes beside the other two, which carry the
 * name — this is the one for a takeaway lid or a jar, where the whole job is
 * being scanned from arm's length and nothing else. The code takes everything
 * it can get and the words take what is left.
 */
async function scanSheet(layout, dpi, url) {
  const dots = (mm) => Math.round((mm / 25.4) * dpi);
  const W = dots(layout.w);
  const H = dots(layout.h);
  const margin = dots(MARGIN_MM);
  const gap = dots(GAP_MM);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;

  const textSize = Math.max(dots(3), Math.round(innerH * SCAN_TEXT_SHARE));
  const label = await textMask(SCAN_TEXT, textSize);

  // Whatever is left after the words is the code's, which is the point of it.
  const q = qrMask(url, Math.min(innerW, innerH - label.height - gap));
  const qrMm = (q.side / dpi) * 25.4;
  if (q.side > innerW || qrMm < MIN_QR_MM) {
    throw new Error(
      `A ${layout.w}×${layout.h} mm label leaves only ${qrMm.toFixed(1)} mm for the QR code `
      + `once the ${MARGIN_MM} mm margins and the wording are taken off, and below `
      + `${MIN_QR_MM} mm it stops scanning reliably. Use a bigger label.`);
  }

  const qrPng = await inkOn(await q.mask.png().toBuffer(), q.side, q.side);
  const labelPng = await inkOn(label.mask, label.width, label.height);

  const blockH = q.side + gap + label.height;
  const top = Math.round((H - blockH) / 2);
  const place = [
    { input: qrPng, top, left: Math.round((W - q.side) / 2) },
    { input: labelPng, top: top + q.side + gap, left: Math.round((W - label.width) / 2) },
  ];

  const file = 'sticker-scan.png';
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(place)
    .withMetadata({ density: dpi })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  return {
    file, W, H, dpi,
    withMark: false,
    mm: `${layout.w}×${layout.h}`,
    mark: `"${SCAN_TEXT}" at ${((label.height / dpi) * 25.4).toFixed(1)} mm`,
    qr: `${q.modules} modules at ${q.scale} dots (v${q.version}, level Q)`,
    qrMm: ((q.side / dpi) * 25.4).toFixed(1),
  };
}

async function sheet(layout, dpi, url) {
  const dots = (mm) => Math.round((mm / 25.4) * dpi);
  const W = dots(layout.w);
  const H = dots(layout.h);
  const margin = dots(MARGIN_MM);
  const gap = dots(GAP_MM);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;

  // The code is sized first and never squeezed: it is the part that has to
  // survive being scanned in a doorway. What is left over belongs to the mark.
  const q = qrMask(url, Math.min(dots(QR_MM), innerW, innerH));
  const qrMm = (q.side / dpi) * 25.4;
  if (q.side > innerW || q.side > innerH || qrMm < MIN_QR_MM) {
    throw new Error(
      `A ${layout.w}×${layout.h} mm label leaves only ${qrMm.toFixed(1)} mm for the QR code `
      + `once the ${MARGIN_MM} mm margins are taken off, and below ${MIN_QR_MM} mm it stops `
      + 'scanning reliably. Use a bigger label.');
  }
  const qrPng = await inkOn(await q.mask.png().toBuffer(), q.side, q.side);

  const horizontal = layout.stack === 'horizontal';

  /* The mark gets whatever the code and the gap leave — in BOTH directions.
   *
   * Only its width used to be constrained. Stacked, that handed it the full
   * inner width and let the artwork's own proportions decide its height, so
   * mark + gap + code came to more than the label was tall; the block was then
   * centred on the whole canvas and the overflow went straight out through the
   * margins. A 54 × 70 label was leaving 0.13 mm at the top, which a thermal
   * feed eats. Fitting the height as well is what keeps the 3.5 mm honest at
   * every size and in either orientation. */
  const aspect = await markAspect();
  const roomW = horizontal ? innerW - q.side - gap : innerW;
  const roomH = horizontal ? innerH : innerH - gap - q.side;
  const markW = Math.max(0, Math.min(
    roomW,
    Math.round(roomH * aspect),
    Math.round(innerW * MARK_SHARE),
  ));

  /* On a label with no room for both, the code wins and says so. It is the
   * part that does something; the mark is decoration, and a 4 mm smear of it
   * is worse than none. */
  const withMark = markW >= dots(MIN_MARK_MM);
  let markPng = null;
  let markH = 0;
  if (withMark) {
    const markMask = await lineartMask(markW);
    markH = (await sharp(markMask).metadata()).height;
    markPng = await inkOn(markMask, markW, markH);
  }

  let place;
  if (!withMark) {
    place = [{
      input: qrPng,
      left: Math.round((W - q.side) / 2),
      top: Math.round((H - q.side) / 2),
    }];
  } else if (horizontal) {
    const blockW = markW + gap + q.side;
    const left = Math.round((W - blockW) / 2);
    place = [
      { input: markPng, left, top: Math.round((H - markH) / 2) },
      { input: qrPng, left: left + markW + gap, top: Math.round((H - q.side) / 2) },
    ];
  } else {
    const blockH = markH + gap + q.side;
    const top = Math.round((H - blockH) / 2);
    place = [
      { input: markPng, top, left: Math.round((W - markW) / 2) },
      { input: qrPng, top: top + markH + gap, left: Math.round((W - q.side) / 2) },
    ];
  }

  /* One file per orientation, overwritten. The size and resolution live in
     the PNG's own density chunk rather than in its name, so re-rendering at
     the other dpi replaces the sticker instead of adding to a pile of them —
     and a printer driver reading the file knows how big it is meant to be. */
  const file = `sticker-${horizontal ? 'landscape' : 'portrait'}.png`;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(place)
    .withMetadata({ density: dpi })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  return {
    file, W, H, dpi,
    withMark,
    mm: `${layout.w}×${layout.h}`,
    mark: withMark ? `${markW}×${markH}` : "none — no room for one",
    qr: `${q.modules} modules at ${q.scale} dots (v${q.version}, level Q)`,
    qrMm: ((q.side / dpi) * 25.4).toFixed(1),
  };
}

/**
 * A whole number of millimetres, inside the range a label printer can take.
 * Returns null for anything else, so the caller reports it rather than
 * drawing something nobody asked for.
 */
function mm(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= SIZE_LIMITS.min && n <= SIZE_LIMITS.max ? n : null;
}

/**
 * The stock sizes already drawn, read off disk.
 *
 * The set is open-ended now — whatever sizes the owner has asked for — so the
 * Graphics tab cannot hold a fixed list of filenames the way the card and the
 * social set do. It reads what is there instead.
 */
/** Width, height and dpi straight out of a PNG header. Synchronous, because
 *  the Graphics tab renders in one pass and sharp is async. */
function sizeOf(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 33 || buf.readUInt32BE(12) !== 0x49484452) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let density = null;
  let at = 8;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "pHYs" && buf.length >= at + 8 + 9) {
      const perMetre = buf.readUInt32BE(at + 8);
      if (buf[at + 8 + 8] === 1) density = Math.round(perMetre * 0.0254);
      break;
    }
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + len;
  }
  return { width, height, density };
}
function made() {
  const out = [];
  for (const [file, label] of [
    ['sticker-portrait.png', 'Portrait'],
    ['sticker-landscape.png', 'Landscape'],
    ['sticker-scan.png', 'Scan me — code only'],
  ]) {
    let size = "";
    try {
      const { width, height, density } = sizeOf(path.join(OUT, file));
      const dpi = density || 203;
      const mm = (px) => Math.round((px / dpi) * 25.4);
      size = `${mm(width)} × ${mm(height)} mm at ${dpi} dpi`;
    } catch (e) {
      continue;                       // not drawn yet
    }
    out.push([file, label, size]);
  }
  return out;
}

/**
 * Draw the sticker.
 *
 * With no options this is what `npm run sticker` has always done: both
 * orientations at both resolutions. Given a size it draws that one label, at
 * the one resolution, which is what the Graphics tab asks for — the owner
 * knows what stock is in the printer and does not need the other three.
 */
async function generate(opts = {}) {
  if (!fs.existsSync(LINEART)) throw new Error(`Missing brand artwork: ${LINEART}`);
  fs.mkdirSync(OUT, { recursive: true });

  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base || 'https://dinner-by-derek.example';

  let layouts = LAYOUTS;
  let dpis = [DPI_CHOICES[0]];   // one resolution per run; the tab picks the other

  if (opts.widthMm !== undefined || opts.heightMm !== undefined) {
    const w = mm(opts.widthMm);
    const h = mm(opts.heightMm);
    if (w === null || h === null) {
      throw new Error(`Give both sides in whole millimetres, between `
        + `${SIZE_LIMITS.min} and ${SIZE_LIMITS.max}.`);
    }
    const dpi = DPI_CHOICES.includes(Number(opts.dpi)) ? Number(opts.dpi) : DPI_CHOICES[0];
    /* Both orientations of the stock, every time. Asking for 54 x 70 and
       getting only the portrait meant a second trip through the form with
       the numbers swapped to see the other one — and the two tiles are
       there to be compared. The short side leads on the portrait, the long
       side on the landscape, whichever way round the numbers arrived. */
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    layouts = [
      { name: 'portrait', w: short, h: long, stack: 'vertical' },
      { name: 'landscape', w: long, h: short, stack: 'horizontal' },
      { name: 'scan', w: short, h: long, stack: 'scan' },
    ];
    dpis = [dpi];
  }

  const sheets = [];
  for (const layout of layouts) {
    for (const dpi of dpis) {
      sheets.push(await (layout.stack === 'scan' ? scanSheet : sheet)(layout, dpi, url));
    }
  }

  return {
    dir: OUT,
    url,
    sheets,
    notes: sheets.map((s) => `${s.mm} mm at ${s.dpi} dpi — QR ${s.qrMm} mm.`),
    warnings: base ? [] : [
      'BASE_URL is not set, so the QR points at a placeholder. Set it and run '
      + 'this again before printing a roll of these.',
    ],
  };
}

module.exports = { generate, made, OUT, SIZE_LIMITS, DPI_CHOICES, LAYOUTS };

if (require.main === module) {
  generate()
    .then((out) => {
      console.log('\nSticker — black and transparent only\n');
      for (const s of out.sheets) {
        console.log(`  ${s.file.padEnd(30)} ${s.mm}mm — ${s.W}×${s.H} px at ${s.dpi} dpi`);
        console.log(`  ${' '.repeat(30)} mark ${s.mark} · QR ${s.qrMm}mm, ${s.qr}`);
      }
      console.log(`\n  QR points at ${out.url}`);
      for (const w of out.warnings) console.log(`\n  ⚠  ${w}`);
      console.log(`\nFiles are in ${out.dir}\n`);
    })
    .catch((e) => { console.error('\nSticker generation failed:', e.message, '\n'); process.exit(1); });
}
