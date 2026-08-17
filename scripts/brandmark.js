'use strict';
/**
 * The leather medallion, cropped to its own edge and clipped to a circle.
 *
 * Shared by make-icons.js (the site header mark) and social.js (the seal on
 * every social graphic) so both crop the badge identically — the artwork sits
 * in a much larger transparent-turned-grey canvas, and finding its real edge
 * is the fiddly part worth doing once.
 *
 * The source file is only ever READ.
 */

const path = require('path');
const sharp = require('sharp');

const SOURCE = path.join(__dirname, '..', 'brand', 'logo-medallion.jpg');
const WORDMARK = path.join(__dirname, '..', 'brand', 'logo-wordmark.svg');

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
 * The badge is only ~210px across in the source, so asking for much more than
 * that upscales it. Callers that need it large should expect it soft.
 */
async function circle(size, file = SOURCE) {
  const box = await bounds(file);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(file)
    .extract(box)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The full logo lockup — ring, cutlery, "Dinner" script, "BY DEREK" — knocked
 * out of its own background so it can sit on any dark brand colour.
 *
 * It is supplied as gold-and-cream artwork on a cool charcoal ground, which is
 * off-palette. Rather than reproduce the mark, the charcoal is removed: the
 * artwork is light and its ground is dark, so luminance makes a usable alpha.
 * Squaring that alpha twice collapses the faint rectangular wash left by the
 * source's vignette — a plain threshold high enough to kill the wash also eats
 * the darker gold strokes, and a hard threshold jags the script.
 *
 * Light artwork: this belongs on olive, espresso or umber, never on parchment.
 */
let masterPromise = null;
const MASTER = 1200;

function master() {
  if (!masterPromise) {
    masterPromise = (async () => {
      const rgb = await sharp(WORDMARK, { density: 300 })
        .resize(MASTER, MASTER, { fit: 'inside' })
        .removeAlpha()
        .toBuffer();
      let alpha = await sharp(rgb).greyscale().linear(2.4, -130).toColourspace('b-w').toBuffer();
      for (let i = 0; i < 2; i++) {
        alpha = await sharp(alpha)
          .composite([{ input: alpha, blend: 'multiply' }])
          .toColourspace('b-w')
          .toBuffer();
      }
      const cut = await sharp(rgb).joinChannel(alpha).png().toBuffer();
      // Trimmed to the artwork's own edge, in a second pass: trim inspects the
      // pipeline's input, so chaining it onto joinChannel would test the opaque
      // charcoal and find nothing to cut. The source centres the lockup in a
      // square with wide margins, and leaving those in lands the mark far
      // smaller than the size asked for and drags whitespace into every layout.
      return sharp(cut).trim({ threshold: 25 }).png({ compressionLevel: 9 }).toBuffer();
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

module.exports = { SOURCE, WORDMARK, bounds, circle, wordmark };
