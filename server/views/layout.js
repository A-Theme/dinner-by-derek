'use strict';
const { html, raw } = require('../html');
const config = require('../config');
const { settings } = require('../db');
const { palette } = require('../theme');

/**
 * Every public page is fully rendered server-side. That is what makes the
 * Facebook crawler see a title, description and image when the owner pastes a
 * week link — the crawler does not run JavaScript.
 */

function og({ title, description, image, url }) {
  const abs = (p) => (p && p.startsWith('http') ? p : `${config.baseUrl}${p || '/icons/icon-512.png'}`);
  return html`
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${settings.get('business_name')}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${abs(image)}">
    <meta property="og:url" content="${abs(url)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${abs(image)}">`;
}

function page({ title, description = '', image = null, url = '/', body, bodyClass = '', extraHead = null, scripts = null }) {
  const name = settings.get('business_name');
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} — ${name}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="${palette.olive}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${name}">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/app.css">
${og({ title, description, image, url })}
${extraHead || ''}
</head>
<body class="${bodyClass}">
<div id="install-slot"></div>
<header class="site-header">
  <div class="wrap">
    <a href="/"><img src="/icons/icon-192.png" alt="" class="brandmark"></a>
    <div>
      <p class="site-title"><a href="/">${name}</a></p>
      <span class="site-tag">Kitchener &amp; Waterloo</span>
    </div>
  </div>
</header>
<main class="wrap" id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>${name} — supper club serving Kitchener and Waterloo.</p>
    <p>${settings.get('owner_contact')}</p>
  </div>
</footer>
<script src="/app.js" defer></script>
${scripts || ''}
</body>
</html>`;
}

/**
 * The standing allergen notice. Appears on every customer menu view and is
 * reproduced verbatim in the generated Facebook post. Never softened, never
 * conditional on whether an item has tags.
 */
function allergenDisclaimer() {
  return html`
  <aside class="notice notice--strong">
    <strong>About allergens.</strong> Allergen information is a guide only.
    Every dish is prepared in a shared home kitchen where cross-contamination is
    possible. If you have an allergy, contact the kitchen directly before
    ordering. ${settings.get('owner_contact')}
  </aside>`;
}

const DISCLAIMER_TEXT =
  'Allergen information is a guide only. Every dish is prepared in a shared ' +
  'home kitchen where cross-contamination is possible. If you have an allergy, ' +
  'contact the kitchen directly before ordering.';

function halalBadge(on) {
  return on ? html`<span class="badge" title="Owner-declared, not third-party certified">Prepared halal as declared by the kitchen</span>` : '';
}

function allergenChips(tags) {
  if (!tags || !tags.length) return '';
  return html`<p class="chips">${tags.map((t) => html`<span class="chip chip--allergen">Contains ${t}</span>`)}</p>`;
}

module.exports = { page, og, allergenDisclaimer, DISCLAIMER_TEXT, halalBadge, allergenChips, raw, html };
