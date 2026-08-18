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
 * Two orientations, two resolutions, four files. Label printers come in two
 * resolutions and resampling a 1-bit image is exactly the thing that ruins it,
 * so each is drawn at its own. Print the one that matches your printer and the
 * shape of your stock; do not scale any of them to fit.
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
const MARGIN_MM = 3.5;   // thermal feeds drift; keep ink off the edge
const QR_MM = 22;        // target, rounded down to a whole number of dots per module
const GAP_MM = 3;        // between the mark and the code

const LAYOUTS = [
  { name: 'portrait', w: 54, h: 70, stack: 'vertical' },
  { name: 'landscape', w: 70, h: 54, stack: 'horizontal' },
];

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

/** Black pixels wherever the mask says burn, transparent everywhere else. */
async function inkOn(mask, width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(mask)
    .png({ compressionLevel: 9 })
    .toBuffer();
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
  const qrPng = await inkOn(await q.mask.png().toBuffer(), q.side, q.side);

  const horizontal = layout.stack === 'horizontal';
  const markW = horizontal
    ? Math.min(innerW - q.side - gap, innerH)   // beside the code, and no taller than the label
    : innerW;
  const markMask = await lineartMask(markW);
  const markH = (await sharp(markMask).metadata()).height;
  const markPng = await inkOn(markMask, markW, markH);

  let place;
  if (horizontal) {
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

  const file = `sticker-${layout.name}-${dpi}dpi.png`;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(place)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  return {
    file, W, H, dpi,
    mm: `${layout.w}×${layout.h}`,
    mark: `${markW}×${markH}`,
    qr: `${q.modules} modules at ${q.scale} dots (v${q.version}, level Q)`,
    qrMm: ((q.side / dpi) * 25.4).toFixed(1),
  };
}

async function generate() {
  if (!fs.existsSync(LINEART)) throw new Error(`Missing brand artwork: ${LINEART}`);
  fs.mkdirSync(OUT, { recursive: true });

  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base || 'https://dinner-by-derek.example';

  const sheets = [];
  for (const layout of LAYOUTS) {
    for (const dpi of [203, 300]) sheets.push(await sheet(layout, dpi, url));
  }

  return {
    dir: OUT,
    url,
    sheets,
    warnings: base ? [] : [
      'BASE_URL is not set, so the QR points at a placeholder. Set it and run '
      + 'this again before printing a roll of these.',
    ],
  };
}

module.exports = { generate, OUT };

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
