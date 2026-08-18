'use strict';
/**
 * The two ways this app draws its own logo, from two source files that are
 * only ever READ:
 *
 *   circle()    the leather medallion, cropped to its edge and clipped round.
 *               Used at the two small sizes where a photographed object beats
 *               thin lines: the 84px site header mark, and the 96px seal on
 *               the back of the business card.
 *
 *   wordmark()  the line-art badge, filled with the brand's gold. Used
 *               everywhere the mark is shown large — the card front, the five
 *               social graphics, the README banner.
 *
 * The app icons are cut from the same line art by make-icons.js, in ink rather
 * than gold, which is why the ink threshold is defined here and read there.
 *
 * brand/logo-wordmark.svg — the coloured vector of the mark — is deliberately
 * not referenced. It is a trace of a soft render and loses to the line art at
 * every size; the README says so, so nobody has to rediscover it.
 */

const path = require('path');
const sharp = require('sharp');
const { palette } = require('../server/theme');

const SOURCE = path.join(__dirname, '..', 'brand', 'logo-medallion.jpg');
const LINEART = path.join(__dirname, '..', 'brand', 'logo-lineart.png');

/** Ink threshold: pixels darker than this are logo, lighter are paper. */
const INK_GAIN = 3.0;
const INK_BIAS = -180;

/**
 * Bounding box of the coloured artwork, grown to a square.
 *
 * Detection is by saturation, not darkness: the file was flattened against a
 * grey checkerboard, so "not grey" finds the leather while a brightness
 * threshold would also catch the checkerboard's dark squares.
 */
async function bounds(file = SOURCE) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`No coloured artwork found in ${file}`);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const side = Math.max(w, h);
  let left = Math.round(minX - (side - w) / 2);
  let top = Math.round(minY - (side - h) / 2);
  left = Math.max(0, Math.min(left, width - side));
  top = Math.max(0, Math.min(top, height - side));
  const clamped = Math.min(side, width, height);

  return { left, top, width: clamped, height: clamped };
}

/**
 * The medallion as a transparent-cornered circular PNG at `size` px.
 *
 * The badge is about 950px across in the source, with real detail to roughly
 * 500 — comfortably more than the two sizes that ship (a 240px header mark and
 * a 96px card seal), so neither is upscaled.
 *
 * EDGE_INSET is why this is not simply "crop to the bounds and clip". The badge
 * carries a soft drop shadow, and the source is flattened against a
 * checkerboard, so the last few pixels before its edge are neither leather nor
 * cleanly transparent — colour enough for bounds() to include, grey enough to
 * show as a speckled rim once clipped. The clip therefore lands just inside the
 * badge. What it costs is 3% of a plain leather border; what it buys is an edge
 * that is leather all the way to the cut.
 */
const EDGE_INSET = 0.03;

async function circle(size, file = SOURCE) {
  const box = await bounds(file);
  const cut = Math.round(box.width * EDGE_INSET);
  const inner = {
    left: box.left + cut, top: box.top + cut,
    width: Math.max(1, box.width - cut * 2), height: Math.max(1, box.height - cut * 2),
  };
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(file)
    .extract(inner)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The full logo lockup — double ring, cutlery, "Dinner" script, "BY DEREK" —
 * in the brand's gold, on a transparent ground so it can sit on any dark brand
 * colour.
 *
 * CUT FROM THE LINE ART, NOT FROM THE GOLD ARTWORK. Both exist. The gold
 * version is a trace of a soft render: its strokes carry the original's
 * blur, its outer ring is broken, and it arrives on a charcoal ground that has
 * to be keyed out by luminance — which eats the darker strokes at exactly the
 * edges that matter. The line art is the same mark drawn cleanly, with real
 * transparency and an unbroken ring, so the shape comes from there and only
 * the colour is applied here.
 *
 * The colour is a gradient of three palette stops, light at the top left and
 * deepening to the bottom right, which is what the gold artwork does and what
 * a stamped metal badge does. Nothing is sampled from the old file; the stops
 * are palette names, so the lockup moves when the palette moves.
 *
 * Light artwork: this belongs on olive, espresso or umber, never on parchment.
 */
const GOLD = [
  [0, palette.parchment],
  [0.55, palette['tan-lift']],
  [1, palette.tan],
];

function goldFill(width, height) {
  const stops = GOLD.map(([offset, colour]) =>
    `<stop offset="${offset}" stop-color="${colour}"/>`).join('');
  return Buffer.from(`<svg width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">${stops}</linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/></svg>`);
}

let masterPromise = null;

function master() {
  if (!masterPromise) {
    masterPromise = (async () => {
      // Built at the source's own size and resized once, on the way out, so a
      // caller asking for 296px gets one interpolation rather than an upscale
      // to some master size and a downscale back again.
      const alpha = await sharp(LINEART)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .greyscale()
        .negate()                      // ink becomes bright
        .linear(INK_GAIN, INK_BIAS)    // crush the paper to nothing, keep soft edges
        .toColourspace('b-w')
        .png()
        .toBuffer();
      const { width, height } = await sharp(alpha).metadata();

      // removeAlpha before joining: the rasterised gradient already carries an
      // alpha channel, and joining onto four channels makes a fifth that sharp
      // keeps as a band rather than as transparency — a fully opaque rectangle.
      const fill = await sharp(goldFill(width, height)).removeAlpha().png().toBuffer();
      const cut = await sharp(fill).joinChannel(alpha).png().toBuffer();

      // Trimmed in a second pass: trim inspects the pipeline's input, so
      // chaining it onto joinChannel would test the opaque gradient and find
      // nothing to cut.
      return sharp(cut).trim({ threshold: 10 }).png({ compressionLevel: 9 }).toBuffer();
    })();
  }
  return masterPromise;
}

/**
 * The lockup at a given width, tight to the ink.
 * Returns the PNG together with its rendered size, since it is wider than it
 * is tall and callers need both numbers to place it.
 */
async function wordmark({ width, height }) {
  const out = await sharp(await master())
    .resize(width ? { width } : { height })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(out).metadata();
  return { data: out, width: meta.width, height: meta.height };
}

module.exports = { SOURCE, LINEART, INK_GAIN, INK_BIAS, bounds, circle, wordmark };
