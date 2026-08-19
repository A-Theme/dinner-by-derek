'use strict';
/**
 * The generated-image sets, and the one place that runs them.
 *
 * Two sets: the social graphics for the Facebook page, and the two faces of
 * the business card. Both are drawn by the scripts in `scripts/`, which the
 * dashboard calls directly rather than shelling out to npm — under systemd the
 * service's PATH often has no npm on it, and spawning a shell from an admin
 * route buys nothing a function call doesn't already give, including the real
 * error text when something fails.
 *
 * Output goes to GRAPHICS_DIR (default `./data/graphics`), which must survive
 * a redeploy for the same reason DB_PATH and UPLOAD_DIR must: these are now
 * made from a phone, not from a checkout, and there is no copy anywhere else.
 * index.js serves that directory ahead of `public/`, so the versions committed
 * to the repo remain the fallback until something is generated over them.
 */

const fs = require('fs');
const path = require('path');

const social = require('../scripts/social');
const card = require('../scripts/card');
const sticker = require('../scripts/sticker');

const SETS = {
  social: {
    key: 'social',
    title: 'Social graphics',
    urlBase: '/social',
    dir: social.OUT,
    generate: social.generate,
    blurb: 'For the Facebook page. The weekly menu post reads whatever is published now, '
      + 'so generate these after publishing a week, not before.',
    files: [
      ['cover.png', 'Page cover', '1640×624'],
      ['profile.png', 'Profile picture', '1080×1080'],
      ['menu.png', "This week's menu, as a post", '1080×1350'],
      ['last-call.png', 'Cutoff reminder for the night before', '1080×1080'],
      ['link-preview.png', 'What Facebook shows when the link is pasted', '1200×630'],
    ],
  },
  card: {
    key: 'card',
    title: 'Business card',
    urlBase: '/print',
    dir: card.OUT,
    generate: card.generate,
    blurb: 'Print-ready at 300 DPI, 3.5×2 inches with bleed. The wording comes from '
      + 'Settings and Locations & Delivery, so fix those first and generate after.',
    files: [
      ['card-front.png', 'Front', '3.5×2in + bleed'],
      ['card-back.png', 'Back', '3.5×2in + bleed'],
    ],
  },
  sticker: {
    key: 'sticker',
    title: 'Sticker',
    urlBase: '/print',
    dir: sticker.OUT,
    generate: sticker.generate,
    blurb: 'For a thermal label printer. Black and transparent only — no greys, no white '
      + 'ink — so it prints as burned dots on whatever colour the stock already is. '
      + 'Give it the size of the labels in your printer and it draws both orientations '
      + 'at that size, replacing the two below.',
    /* Open-ended: whatever sizes have been asked for. Listed from disk rather
     * than from a fixed table, which is why this set carries `listFiles`. */
    files: [],
    listFiles: sticker.made,
    sizes: {
      limits: sticker.SIZE_LIMITS,
      dpiChoices: sticker.DPI_CHOICES,
      presets: sticker.LAYOUTS.map((l) => ({ label: `${l.w} × ${l.h} mm`, w: l.w, h: l.h })),
    },
  },
};

/** Where the repo's committed copies live, used when nothing is generated yet. */
const SHIPPED = {
  social: path.join(__dirname, '..', 'public', 'social'),
  card: path.join(__dirname, '..', 'public', 'print'),
};

/**
 * One run at a time, across both sets.
 *
 * Not a rate limit — a queue of one. Regenerating is several seconds of image
 * work, and a double tap on a phone with a slow connection is the ordinary
 * case, not the adversarial one. The second tap is told what is already
 * happening instead of starting a second pass over the same files.
 */
/**
 * The set by name, or null.
 *
 * `SETS[key]` looked right and answered for names nobody defined: every object
 * inherits __proto__, constructor and toString, so those three walked past an
 * `if (!set)` guard and arrived as a set with no key and no title. Nothing
 * broke — the route is behind the session and the error text is odd rather
 * than dangerous — but a lookup that says yes to a word it has never heard of
 * is worth not having.
 */
function get(key) {
  return Object.prototype.hasOwnProperty.call(SETS, String(key)) ? SETS[key] : null;
}

let running = null;

function busy() {
  return running ? running.key : null;
}

async function run(key, opts) {
  const set = get(key);
  if (!set) throw new Error(`Unknown graphics set: ${key}`);
  if (running) {
    const err = new Error(`${SETS[running.key].title} is being generated right now. Give it a moment.`);
    err.busy = true;
    throw err;
  }

  const job = set.generate(opts);
  running = { key, job };
  try {
    return await job;
  } finally {
    running = null;
  }
}

/**
 * What each file in a set currently is: whether it exists, when it was made,
 * and whether it is the generated copy or the one that shipped with the repo.
 *
 * `v` is the modification time, hung on the URL as a query string. Without it
 * the dashboard shows the previous image for up to an hour after a regenerate
 * — static files are cached hard in production — and the owner concludes the
 * button is broken.
 */
function list(key) {
  const set = get(key);
  // A set whose filenames are not known ahead of time reads them off disk.
  const entries = set.listFiles ? set.listFiles() : set.files;
  return entries.map(([name, label, size]) => {
    for (const [source, dir] of [['generated', set.dir], ['shipped', SHIPPED[key]]]) {
      if (!dir) continue;        // not every set ships a fallback copy
      let stat;
      try {
        stat = fs.statSync(path.join(dir, name));
      } catch (e) {
        continue;
      }
      return {
        name, label, size, source,
        at: stat.mtime,
        url: `${set.urlBase}/${name}?v=${Math.floor(stat.mtimeMs)}`,
      };
    }
    return { name, label, size, source: 'missing', at: null, url: null };
  });
}

module.exports = { SETS, get, run, list, busy, dirs: { social: social.OUT, card: card.OUT } };
