'use strict';
/**
 * The four ways this app draws its own logo, from two source files that are
 * only ever READ. Three of them are the same line art with something different
 * poured through it; the fourth is the photographed badge.
 *
 *   wordmark()  the line-art badge, filled with the brand's gold. Used
 *               everywhere the mark is shown large — the card front, the five
 *               social graphics, the README banner.
 *
 *   disc()      that same gold lockup centred on an olive disc: the profile
 *               picture, cut round. Used for the site header mark.
 *
 *   stamp()     the line art in one flat colour. For the pale half of a page,
 *               where the gold gradient has nothing to sit on — the seal on
 *               the back of the business card.
 *
 *   circle()    the leather medallion, cropped to its edge and clipped round.
 *               Kept because the medallion is still brand artwork and this
 *               crop is the only thing that finds its edge, but nothing in the
 *               app draws it now: the header mark and the card seal both moved
 *               to the line art, which survives being shrunk in a way a
 *               photographed object does not.
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

let alphaPromise = null;

/**
 * The line art as a bare alpha channel — ink opaque, paper gone — at the
 * source's own size. Every treatment below is this mask with something
 * different poured through it, which is what keeps one threshold tuning them
 * all rather than three that drift apart.
 */
function alpha() {
  if (!alphaPromise) {
    alphaPromise = (async () => {
      const buf = await sharp(LINEART)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .greyscale()
        .negate()                      // ink becomes bright
        .linear(INK_GAIN, INK_BIAS)    // crush the paper to nothing, keep soft edges
        .toColourspace('b-w')
        .png()
        .toBuffer();
      const { width, height } = await sharp(buf).metadata();
      return { buf, width, height };
    })();
  }
  return alphaPromise;
}

/**
 * Pour `paint` — a rasterised image the size of the line art — through that
 * mask, and trim to the ink.
 *
 * removeAlpha before joining: a rasterised SVG already carries an alpha
 * channel, and joining onto four channels makes a fifth that sharp keeps as a
 * band rather than as transparency — a fully opaque rectangle.
 *
 * Trimmed in a second pass: trim inspects the pipeline's input, so chaining it
 * onto joinChannel would test the opaque paint and find nothing to cut.
 */
async function pour(paint) {
  const { buf } = await alpha();
  const fill = await sharp(paint).removeAlpha().png().toBuffer();
  const cut = await sharp(fill).joinChannel(buf).png().toBuffer();
  return sharp(cut).trim({ threshold: 10 }).png({ compressionLevel: 9 }).toBuffer();
}

let masterPromise = null;

/** Built at the source's own size and resized once, on the way out, so a caller
 *  asking for 296px gets one interpolation rather than an upscale to some
 *  master size and a downscale back again. */
function master() {
  if (!masterPromise) {
    masterPromise = (async () => {
      const { width, height } = await alpha();
      return pour(goldFill(width, height));
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

/**
 * The profile picture, cut round: the gold lockup centred on an olive disc.
 *
 * MARK_ON_DISC mirrors social.js — 760px of mark in a 1080px square — because
 * that is the proportion Facebook's circular mask was chosen against, and the
 * outer ring clearing that cut is the whole reason the number is what it is.
 * Reusing it means the site header and the Facebook page show the same
 * picture, rather than two arrangements of the same parts.
 *
 * The disc is olive, so against the olive header band the ground disappears
 * and what reads is the gold. That is intended: one image that works both on
 * the band and anywhere else a round copy of the mark is wanted.
 */
const MARK_ON_DISC = 760 / 1080;

async function disc(size) {
  const mark = await wordmark({ width: Math.round(size * MARK_ON_DISC) });
  const cut = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp({ create: { width: size, height: size, channels: 4, background: palette.olive } })
    .composite([
      {
        input: mark.data,
        top: Math.round((size - mark.height) / 2),
        left: Math.round((size - mark.width) / 2),
      },
      { input: cut, blend: 'dest-in' },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The lockup in one flat colour, on a transparent ground.
 *
 * Dark artwork, for the pale half of a page. The gold above is a gradient built
 * to sit on olive or espresso; on parchment it has nothing to be lighter than
 * and reads as a smudge. This is the same line art the stickers print, in
 * whatever single colour the surface can carry — one mark, one shape, a
 * different ink.
 *
 * Memoised per colour, like the gold master, so a caller asking for two sizes
 * of the same seal thresholds the source once.
 */
const stampMasters = new Map();

async function stamp({ width, height, colour = palette.espresso }) {
  if (!stampMasters.has(colour)) {
    stampMasters.set(colour, (async () => {
      const a = await alpha();
      return pour(Buffer.from(
        `<svg width="${a.width}" height="${a.height}"><rect width="${a.width}" height="${a.height}" fill="${colour}"/></svg>`
      ));
    })());
  }
  const out = await sharp(await stampMasters.get(colour))
    .resize(width ? { width } : { height })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(out).metadata();
  return { data: out, width: meta.width, height: meta.height };
}

module.exports = {
  SOURCE, LINEART, INK_GAIN, INK_BIAS, bounds, circle, wordmark, disc, stamp,
};
