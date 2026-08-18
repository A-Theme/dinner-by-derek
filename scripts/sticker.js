'use strict';
/**
 * The 54 × 70 mm sticker, for a thermal printer.
 *
 *   npm run sticker
 *
 * Thermal printing has no greys and no white ink. A dot is either burned or it
 * is not, and "white" is whatever the label stock already is. So this file
 * outputs BLACK AND TRANSPARENT ONLY: every pixel is either fully opaque black
 * or fully transparent, with no antialiasing anywhere. A soft edge would be
 * dithered by the printer driver into a scatter of dots, which on a 22 mm QR
 * code is the difference between scanning and not.
 *
 * Two files, because label printers come in two resolutions and resampling a
 * 1-bit image is exactly the thing that ruins it. Print the one that matches
 * your printer; do not scale either to fit.
 *
 *   203 dpi — Zebra, Rollo, most direct-thermal label printers
 *   300 dpi — Brother QL, higher-resolution desktop units
 *
 * The QR is drawn at an integer number of dots per module, so module edges
 * land on dot boundaries rather than between them.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const qr = require('./qr');

const root = path.join(__dirname, '..');
const LINEART = path.join(root, 'brand', 'logo-lineart.png');
const OUT = path.join(process.env.GRAPHICS_DIR || path.join(root, 'data', 'graphics'), 'print');

/* --- The sheet ------------------------------------------------------------ */
const W_MM = 54;
const H_MM = 70;
const MARGIN_MM = 3.5;   // thermal feeds drift; keep ink off the edge
const QR_MM = 22;        // target, rounded down to a whole number of dots per module
const GAP_MM = 3;        // between the mark and the code

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
      .resize(side, side, { kernel: 'nearest' })   // integer, so edges stay hard
      .png(),
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

async function sheet(dpi, url) {
  const dots = (mm) => Math.round((mm / 25.4) * dpi);
  const W = dots(W_MM);
  const H = dots(H_MM);
  const inner = W - dots(MARGIN_MM) * 2;

  const q = qrMask(url, dots(QR_MM));
  const qrPng = await inkOn(await q.mask.toBuffer(), q.side, q.side);

  // The mark takes the width it can have; the code keeps the size it needs.
  const markW = Math.min(inner, W - dots(MARGIN_MM) * 2);
  const markMask = await lineartMask(markW);
  const markH = (await sharp(markMask).metadata()).height;
  const markPng = await inkOn(markMask, markW, markH);

  const block = markH + dots(GAP_MM) + q.side;
  const top = Math.round((H - block) / 2);

  const file = `sticker-${dpi}dpi.png`;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: markPng, top, left: Math.round((W - markW) / 2) },
      { input: qrPng, top: top + markH + dots(GAP_MM), left: Math.round((W - q.side) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  return {
    file, W, H, dpi,
    mark: `${markW}×${markH}`,
    qr: `${q.side}px, ${q.modules} modules at ${q.scale} dots each (v${q.version}, level Q)`,
    qrMm: ((q.side / dpi) * 25.4).toFixed(1),
  };
}

async function generate() {
  if (!fs.existsSync(LINEART)) throw new Error(`Missing brand artwork: ${LINEART}`);
  fs.mkdirSync(OUT, { recursive: true });

  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base || 'https://dinner-by-derek.example';

  const sheets = [];
  for (const dpi of [203, 300]) sheets.push(await sheet(dpi, url));

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
      console.log(`\nSticker — ${W_MM}×${H_MM}mm, black and transparent only\n`);
      for (const s of out.sheets) {
        console.log(`  ${s.file.padEnd(22)} ${s.W}×${s.H} px at ${s.dpi} dpi`);
        console.log(`  ${' '.repeat(22)} mark ${s.mark} · QR ${s.qr} = ${s.qrMm}mm`);
      }
      console.log(`\n  QR points at ${out.url}`);
      for (const w of out.warnings) console.log(`\n  ⚠  ${w}`);
      console.log(`\nFiles are in ${out.dir}\n`);
    })
    .catch((e) => { console.error('\nSticker generation failed:', e.message, '\n'); process.exit(1); });
}
