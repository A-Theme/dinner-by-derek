'use strict';
/**
 * Build every published page that is a document.
 *
 *   node scripts/pages.js               # all of them
 *   node scripts/pages.js handoff       # just one
 *
 * Each page is one markdown file in docs/ rendered by scripts/artifact-page.js
 * into the gitignored data/. Edit the markdown; never the page.
 *
 * WHY THERE IS A LIST HERE AT ALL. Every one of these started as hand-written
 * HTML in a published artifact, restating something the repo already said. All
 * of them drifted, and none of the drift was visible from either copy — the
 * handoff page carried a table of .env state that its markdown described in
 * prose, and that was inside a day of writing both. One source each, and one
 * command that rebuilds the set, is what stops that recurring.
 *
 * NOT EVERYTHING BELONGS HERE. Two published pages are generated but not from
 * markdown, and are built by their own scripts because their sources are not
 * documents:
 *
 *   Derek's Dish Ledger   scripts/ledger.js — reads saved_dishes, so the counts
 *                         are true at build time rather than asserted in prose
 *   Bank Format Checker   a program, not a page: it runs the real notification
 *                         parser in the browser against text you paste. There
 *                         is no markdown that could produce it, and rendering
 *                         it from prose would mean reimplementing the parser a
 *                         second time — which is the exact failure this file
 *                         exists to prevent.
 *
 * The `url` on each entry is the artifact it publishes to. Publishing without
 * it creates a duplicate instead of updating, which is a mess to unpick.
 */

const fs = require('fs');
const path = require('path');
const config = require('../server/config');
const { buildPage } = require('./artifact-page');

const PAGES = [
  {
    key: 'handoff',
    src: 'docs/HANDOFF.md',
    title: 'Handoff at Dinner By Derek',
    out: 'data/handoff.html',
    url: 'https://claude.ai/code/artifact/ee6ed124-32df-40fc-b71f-e0142bdf9219',
  },
  {
    /* Title and eyebrow come from here rather than from front matter: this is a
       repo document first and a published page second, and the top of a file
       people read in the repo is not the place for page furniture. */
    key: 'going-live',
    src: 'docs/GOING-LIVE.md',
    out: 'data/going-live.html',
    title: 'Going Live at Dinner By Derek',
    eyebrow: 'Before a customer arrives',
    source: 'docs/GOING-LIVE.md',
    url: 'https://claude.ai/code/artifact/156e95f6-7ad5-443c-bf32-fca397be0cfd',
  },
  /* These two have no markdown yet. They were written straight into their
     artifacts and the published page is still the only copy, so bringing them
     in means writing the source first — reversing the page into docs/, which is
     a content job rather than a wiring one. Listed here so the gap is visible
     rather than forgotten, and skipped until the file exists. */
  {
    key: 'history',
    src: 'docs/HISTORY.md',
    out: 'data/history.html',
    title: 'Building Dinner By Derek',
    url: 'https://claude.ai/code/artifact/1fa0a89e-6069-4766-82c1-b8f2fd78ce85',
  },
  {
    key: 'payments',
    src: 'docs/PAYMENTS.md',
    out: 'data/payments.html',
    title: 'Payments at Dinner By Derek',
    url: 'https://claude.ai/code/artifact/895d36d7-8601-4399-bd1a-0968c69bc713',
  },
];

function sourceExists(page) {
  return fs.existsSync(path.join(config.root, page.src));
}

function build(page) {
  const src = path.join(config.root, page.src);
  const out = path.join(config.root, page.out);
  const html = buildPage(fs.readFileSync(src, 'utf8'), {
    title: page.title,
    eyebrow: page.eyebrow,
    source: page.source || page.src,
    fallbackTitle: page.title,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return { ...page, bytes: html.length };
}

function buildAll(only = null) {
  const wanted = only ? PAGES.filter((p) => p.key === only) : PAGES;
  if (only && !wanted.length) {
    throw new Error(`no page called "${only}". Try: ${PAGES.map((p) => p.key).join(', ')}`);
  }
  return wanted.filter(sourceExists).map(build);
}

module.exports = { PAGES, build, buildAll, sourceExists };

if (require.main === module) {
  const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  let failed = 0;
  for (const page of (only ? PAGES.filter((p) => p.key === only) : PAGES)) {
    if (!sourceExists(page)) {
      console.log(`  ${page.key.padEnd(11)} skipped — ${page.src} does not exist yet`);
      continue;
    }
    try {
      const r = build(page);
      console.log(`  ${r.key.padEnd(11)} ${r.src.padEnd(22)} -> ${r.out}  `
        + `(${(r.bytes / 1024).toFixed(1)} KB)`);
    } catch (e) {
      failed++;
      console.error(`  ${page.key.padEnd(11)} FAILED  ${e.message}`);
    }
  }
  if (only && !PAGES.some((p) => p.key === only)) {
    console.error(`no page called "${only}". Try: ${PAGES.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }
  console.log(failed ? `\n${failed} page(s) failed.` : '\nAll pages built.');
  process.exit(failed ? 1 : 0);
}
