'use strict';
/**
 * Generate every PWA icon from the logo.
 *
 *   npm run icons
 *
 * Source of truth is brand/logo-lineart.png — the black line-art mark, which
 * is the highest-resolution version available and the one that survives being
 * shrunk to 48px on a home screen. The leather medallion (brand/logo-medallion.jpg)
 * is kept for artwork and social posts, but its usable area is only ~206px
 * across, so upscaling it to 512 would be visibly soft.
 *
 * That source carries real transparency, and the thresholds below are written
 * for ink on paper, so it is flattened onto white once at the top and every
 * stage works from that. Feeding the transparent file in directly would read
 * as a solid black canvas: transparent pixels carry whatever RGB the encoder
 * happened to leave behind, and here that is black.
 *
 * The originals are READ ONLY here. Everything is written to public/icons/.
 * Re-running is safe and idempotent; replace the file in brand/ and re-run to
 * change the icon.
 *
 * Colours come from theme.css via server/theme.js, so this script contains no
 * hex literals of its own.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { palette } = require('../server/theme');
const brandmark = require('./brandmark');

const root = path.join(__dirname, '..');
const SOURCE = path.join(root, 'brand', 'logo-lineart.png');
const MEDALLION_SOURCE = path.join(root, 'brand', 'logo-medallion.jpg');
const OUT = path.join(root, 'public', 'icons');

/**
 * The source as ink on paper: transparency resolved to white, once, in memory.
 * The original file is never modified. White is written as a channel triple
 * rather than a hex string because theme.css is the only file here allowed to
 * contain one, and paper is not a brand colour.
 */
let paperPromise = null;
const paper = () => {
  if (!paperPromise) {
    paperPromise = sharp(SOURCE)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
  }
  return paperPromise;
};

/** Ink threshold: pixels darker than this are logo, lighter are paper. */
const INK_GAIN = 3.0;
const INK_BIAS = -180;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

/** Bounding box of the ink, so padding is measured from the mark, not the file. */
async function inkBounds() {
  const { data, info } = await sharp(await paper()).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 160) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`No logo found in ${SOURCE} — is the image blank?`);

  // Grow the short side to make the crop square. A square crop needs no letter-
  // boxing later, which keeps the mark optically centred and avoids resampling
  // against padding.
  let w = maxX - minX + 1;
  let h = maxY - minY + 1;
  let left = minX;
  let top = minY;
  const side = Math.max(w, h);
  left = Math.round(minX - (side - w) / 2);
  top = Math.round(minY - (side - h) / 2);

  // Stay inside the file.
  left = Math.max(0, Math.min(left, info.width - side));
  top = Math.max(0, Math.min(top, info.height - side));
  const clamped = Math.min(side, info.width, info.height);

  return { left, top, width: clamped, height: clamped };
}

/**
 * Turn the black-on-white scan into a transparent stencil of the given colour.
 * The mark keeps its antialiased edges, so it stays smooth when scaled down.
 */
async function stencil(box, colour, size) {
  // Stays raw the whole way. An intermediate JPEG here would ring at the hard
  // black/white edges and print faint bands into the finished icon.
  const mask = await sharp(await paper())
    .extract(box)
    .greyscale()
    .negate()                      // ink becomes bright
    .linear(INK_GAIN, INK_BIAS)    // crush the paper to nothing, keep soft edges
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const { r, g, b } = hexToRgb(colour);
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  })
    .joinChannel(mask)             // greyscale mask becomes the alpha channel
    .png()
    .toBuffer();
}

/**
 * @param file    output filename
 * @param size    square edge in px
 * @param inset   fraction of the canvas the mark occupies (maskable needs slack)
 * @param bg      background colour
 * @param ink     mark colour
 */
async function icon(file, size, inset, bg, ink) {
  const box = await inkBounds();
  const markSize = Math.round(size * inset);
  const mark = await stencil(box, ink, markSize);
  const pad = Math.round((size - markSize) / 2);
  const { r, g, b } = hexToRgb(bg);

  await sharp({ create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  console.log(`  ${file.padEnd(28)} ${size}×${size}`);
}

/**
 * The header mark is a different job from the PWA icons above: it's a
 * full-colour photo of a leather medallion, not black ink on white, so there
 * is no threshold to stencil — just a crop to the badge and a circular clip.
 *
 * That crop lives in brandmark.js, shared with the business card so both find
 * the badge's edge the same way.
 *
 * 252px is three times the 84px it is displayed at, which is what a phone
 * wants. The source holds a badge about 950px across, so that is a downscale,
 * not a stretch — it was 240px against a 210px source before, and looked it.
 *
 * Quantised to a palette on the way out. The badge is one hue in a few dozen
 * shades, so there is nothing for 24-bit colour to hold that survives being
 * drawn at 84px — and this is the largest thing the customer page loads: 155KB
 * as truecolour, 44KB quantised. The card seal is deliberately NOT quantised;
 * that one is printed at 300 DPI, where the banding this hides would show.
 */
const headerMark = async (size) => sharp(await brandmark.circle(size, MEDALLION_SOURCE))
  .png({ palette: true, quality: 100, effort: 10 })
  .toBuffer();

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`\nMissing ${SOURCE}`);
    console.error('Put the logo there (black line art on white) and run this again.\n');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  console.log('\nGenerating icons from brand/logo-lineart.png');

  // Standard icons: the mark on parchment, 14.08:1 contrast, reads at any size.
  await icon('icon-192.png', 192, 0.86, palette.parchment, palette.espresso);
  await icon('icon-512.png', 512, 0.86, palette.parchment, palette.espresso);

  // Maskable: Android crops to a circle, so the mark stays inside the 80% safe
  // zone and the background runs full bleed.
  await icon('icon-maskable-512.png', 512, 0.62, palette.parchment, palette.espresso);

  // iOS applies its own rounding and refuses transparency, so this is flat.
  await icon('apple-touch-icon.png', 180, 0.86, palette.parchment, palette.espresso);

  // Browser tab.
  await icon('favicon-32.png', 32, 0.92, palette.parchment, palette.espresso);

  // Site header — the full-colour leather medallion, not the line-art stencil.
  if (fs.existsSync(MEDALLION_SOURCE)) {
    console.log('\nGenerating header mark from brand/logo-medallion.jpg');
    fs.writeFileSync(path.join(OUT, 'header-mark.png'), await headerMark(252));
    console.log(`  header-mark.png             252×252`);
  }

  console.log('\nDone. Icons are in public/icons/.\n');
})().catch((e) => {
  console.error('\nIcon generation failed:', e.message, '\n');
  process.exit(1);
});
