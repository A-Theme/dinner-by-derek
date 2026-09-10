'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Cache-busting for the dashboard's own files.
 *
 * The customer shell is versioned by CACHE_VERSION in public/sw.js — the
 * fingerprint of the shell files themselves, so a changed file is a changed
 * cache name and a returning visitor never keeps the previous build. The
 * dashboard gets none of that on purpose: the service worker skips everything
 * under /admin, because an admin response is behind a session and must never
 * be cached. But the plain HTTP cache still applies, and /admin.js and
 * /admin.css are served with a seven-day max-age — so a deployed dashboard fix
 * reached the browser only after a hard reload, or after a week. That is how
 * the photo-upload fix in 9196234 sat unseen: nothing was wrong with the
 * deploy, the browser simply had not asked again.
 *
 * Same recipe as CACHE_VERSION, applied to the URL rather than to a cache
 * name: /admin.js?v=<fingerprint of admin.js>. Change the file and the page
 * asks for a different URL, so the seven-day copy is a copy of something
 * nobody requests any more — and the file that did not change is still served
 * from cache, which is the point of the seven days in the first place.
 */

const publicDir = path.join(config.root, 'public');

/**
 * The fingerprint of a set of files: sha256 over each name and its bytes, cut
 * short enough to sit in a URL. sw.js's CACHE_VERSION is this over the shell
 * files and the acceptance suite recomputes it from here, so there is one
 * recipe rather than two that can drift apart.
 */
function fingerprint(names, dir = publicDir) {
  const h = crypto.createHash('sha256');
  for (const n of names) h.update(n).update(fs.readFileSync(path.join(dir, n)));
  return h.digest('hex').slice(0, 10);
}

/* The dashboard files, and only those. The shell files are cached BY URL in
 * the service worker's SHELL list, so hanging a query string on /app.css here
 * would ask for a URL that list does not contain and quietly defeat it. */
const VERSIONED = ['/admin.css', '/admin.js', '/install.js'];

/* Read once at boot, so a missing file fails loudly at startup rather than
 * halfway through rendering a page. */
const atBoot = new Map(VERSIONED.map((p) => [p, fingerprint([p.slice(1)])]));

/** `/admin.js` → `/admin.js?v=1a2b3c4d5e`. */
function url(p) {
  if (!atBoot.has(p)) throw new Error(`${p} is not a versioned asset`);
  /* Re-read in development: `npm run dev` restarts on a change to server/, not
   * on a change to public/, and a query string left over from boot would be
   * this same bug in miniature. */
  return `${p}?v=${config.isProd ? atBoot.get(p) : fingerprint([p.slice(1)])}`;
}

module.exports = { fingerprint, url, VERSIONED, publicDir };
