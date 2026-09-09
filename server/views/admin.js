'use strict';
const { html, raw, money, jsonAttr } = require('../html');
const { settings } = require('../db');
const { palette } = require('../theme');
const T = require('../time');
const A = require('../allergens');
const assets = require('../assets');

const NAV = [
  ['/admin', 'This Week', '/admin/week'],
  ['/admin/week', 'This Week'],
  ['/admin/other-options', 'Other Options'],
  ['/admin/orders', 'Orders'],
  ['/admin/locations', 'Locations & Delivery'],
  ['/admin/graphics', 'Graphics'],
  ['/admin/settings', 'Settings'],
];

function shell({ title, body, current = '', extraHead = null, scripts = null }) {
  /* raw(), because html`` escapes what it interpolates — and an escaped
     attribute is not an attribute. This shipped as
     `aria-current=&quot;page&quot;`, so `[aria-current=page]` matched nothing:
     the active tab has never been marked, for a screen reader or for the
     stylesheet that was already written to highlight it. Every route was
     passing `current` correctly the whole time. */
  const here = (key) => (current === key ? raw(' aria-current="page"') : '');

  /* en-CA, not en. This is the language the browser's own spell checker picks
     its dictionary from, and it is the difference between "flavour" being
     underlined in red on every dish description and not. server/proofread.js
     offers the same preference for the words a dictionary treats as equal. */
  return html`<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} — Dashboard</title>
<meta name="theme-color" content="${palette.olive}">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="${assets.url('/admin.css')}">
${extraHead || ''}
</head><body>
<nav class="admin-nav no-print"><ul>
  <li><a href="/admin"${here('today')}>Today</a></li>
  <li><a href="/admin/week"${here('week')}>This Week</a></li>
  <li><a href="/admin/history"${here('history')}>Menu History</a></li>
  <li><a href="/admin/dishes"${here('dishes')}>Saved Dishes</a></li>
  <li><a href="/admin/recipes"${here('recipes')}>Recipes</a></li>
  <li><a href="/admin/other-options"${here('other')}>Other Options</a></li>
  <li><a href="/admin/orders"${here('orders')}>Orders</a></li>
  <li><a href="/admin/sheet/week/${T.todayIn(settings.get('timezone', 'America/Toronto'))}"${here('weektotals')}>Week Totals</a></li>
  <li><a href="/admin/payments"${here('payments')}>Payments</a></li>
  <li><a href="/admin/locations"${here('locations')}>Locations &amp; Delivery</a></li>
  <li><a href="/admin/graphics"${here('graphics')}>Graphics</a></li>
  <li><a href="/admin/settings"${here('settings')}>Settings</a></li>
  <li><a href="/admin-training">Training Mode</a></li>
</ul></nav>
<main class="admin-wrap">
${body}
</main>
<div id="toasts" aria-live="polite"></div>
<script src="${assets.url('/admin.js')}" defer></script>
${scripts || ''}
</body></html>`;
}

function login(error, next) {
  return html`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title><meta name="theme-color" content="${palette.olive}">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/app.css">
</head><body><main class="wrap" style="max-width:420px;margin-top:var(--dbd-sp-7)">
<div class="card">
<h1>Dinner By Derek</h1>
<p>Sign in to the dashboard.</p>
${error ? html`<div class="notice notice--strong">${error}</div>` : ''}
<form method="post" action="/admin/login">
<input type="hidden" name="next" value="${next || '/admin'}">
<label for="pw">Password</label>
<input type="password" id="pw" name="password" autocomplete="current-password" autofocus required
  style="width:100%;min-height:var(--dbd-tap);padding:var(--dbd-sp-2) var(--dbd-sp-3);
  border:1px solid var(--dbd-olive);border-radius:var(--dbd-radius-sm);
  background:var(--dbd-cream-hi);margin-bottom:var(--dbd-sp-3);font:inherit">
<button class="btn btn--primary btn--block" type="submit">Sign in</button>
</form></div></main></body></html>`;
}

/** Plain-language review state indicator used everywhere an item is listed. */
function reviewFlag(item, label) {
  const st = A.reviewState(item);
  if (st.ok) return html`<span class="flag flag--ok">Reviewed</span>`;
  const msg = A.reviewMessage(label || 'This item', st);
  return html`<span class="flag flag--stop" title="${msg}">Needs allergen review</span>`;
}

/**
 * One photo box. The editor renders it twice — the dish, then the optional
 * meal-for-one — and the two are identical apart from the field they write to,
 * which is what lets admin.js wire them with the same code.
 *
 * Everything inside is found relative to [data-photoslot], not to the editor.
 * While there was one box per editor these were editor-wide lookups; with two,
 * an editor-wide querySelector returns the first box for both, and the second
 * box's camera button fills in the first box's picture.
 */
function photoSlot({ prefix, field, label, value, hint = '', optional = false }) {
  const name = `${prefix}_${field}`;
  return html`
  <div data-photoslot style="margin-bottom:var(--dbd-sp-4)">
    <label for="${name}_take">${label}${optional ? html` <span class="variant__label">(optional)</span>` : ''}</label>
    ${hint ? html`<p class="variant__label" style="margin-bottom:var(--dbd-sp-2)">${hint}</p>` : ''}
    <!-- Buttons first, dropzone second, and it matters which way round.
         The dropzone came first and said "Tap to choose a photo" in bold. On a
         phone it measured 271x158 against the button's 271x51 — three times
         the area, above it, and instructing a tap. So the owner tapped it, got
         the photo library, and reported that Take photo did not open the
         camera. It never ran. The camera was working the whole time.
         A phone cannot drag and does not paste, so the box below is desktop
         affordance; the two things a phone can actually do now come first, and
         taking a photo is the one Derek does standing over the food. -->
    <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
      <button type="button" class="btn btn--primary" id="${name}_take" data-take>Take photo</button>
      <button type="button" class="btn btn--secondary" data-choose>Choose from library</button>
      <button type="button" class="btn btn--secondary" data-clearphoto${value ? '' : ' hidden'}>Remove photo</button>
    </div>
    <div class="dropzone" data-drop tabindex="0" role="button">
      ${value ? html`<img src="/uploads/${value}" alt="">` : ''}
      <p><strong>Or drag a photo here</strong><br>
        <span class="variant__label">or paste one from the clipboard. iPhone HEIC is fine.</span></p>
      <div class="progress" hidden><div></div></div>
      <p class="dz-msg variant__label"></p>
    </div>
    <!-- Outside the dropzone, deliberately. input.click() fires a real click on
         the input and it bubbles: while these sat inside, Take photo called
         cam.click(), the event rose into the dropzone's own click handler,
         which saw an INPUT rather than a BUTTON and opened the photo library
         over the camera. Nothing renders here — they are hidden, and admin.js
         finds them from the slot rather than from the dropzone — so the only
         thing their position controls is what their clicks bubble through. -->
    <input type="file" accept="image/*,.heic,.heif" hidden data-file>
    <input type="file" accept="image/*" capture="environment" hidden data-camera>
    <input type="hidden" name="${name}" value="${value || ''}" data-photo>
  </div>`;
}

/**
 * The item editor. Used unchanged for all three levels — the allergen gate,
 * variants and photo behave identically whether the owner is editing a
 * featured dish, the week's soup, or a standing item.
 *
 * The showPhoto/showHalal/showPrices flags trim it down for the This Week
 * quick-entry boxes, which only need a name, description and allergen
 * review — enough to pass the publish gate. Price, photo and halal are
 * still edited in the full day card below once the day exists.
 */
function itemEditor({ prefix, item, showName = true, nameLabel = 'Name', showWeekdays = false,
  showPhoto = true, showHalal = true, showPrices = true, label }) {
  const accepted = JSON.parse(item.allergens || '[]');
  const dismissed = JSON.parse(item.dismissed || '[]');
  const weekdays = JSON.parse(item.weekdays || '[]');
  const ackValid = item.ack && (item.ack_of || '') === A.reviewedText(item);

  /* Six groups, each a single element, because the phone reorders them.
     Source order IS the desktop order — nothing in the stylesheet touches this
     editor above the breakpoint. Below it .item-editor becomes a flex column
     and the groups carry `order`, so a phone gets name, prices, photo,
     allergens without a second template to keep in step with this one. */
  return html`
  <div class="item-editor" data-editor data-prefix="${prefix}">
    <div class="ie-basics">
      ${showName ? html`
        <label for="${prefix}_name">${nameLabel}</label>
        <input type="text" id="${prefix}_name" name="${prefix}_name" data-item-name data-proof
          value="${item.name || item.dish_name || ''}">` : ''}

      <label for="${prefix}_description">Description</label>
      <textarea id="${prefix}_description" name="${prefix}_description" rows="4"
        data-description data-proof data-ack-of="${item.ack_of || ''}">${item.description || ''}</textarea>
    </div>

    <div class="ie-allergens">
      <div class="suggestions" data-suggestions hidden>
        <div class="suggestions__label">Suggested from the name and description — nothing is applied until you accept it</div>
        <div data-sugg-list></div>
      </div>

      <label>Allergen tags on this dish</label>
      <div data-tags>
        ${accepted.map((a) => html`<span class="tag" data-tag="${a}">${a}
          <button type="button" data-remove aria-label="Remove ${a}">✕</button></span>`)}
      </div>
      <input type="hidden" name="${prefix}_allergens" value="${JSON.stringify(accepted)}" data-allergens>
      <input type="hidden" name="${prefix}_dismissed" value="${JSON.stringify(dismissed)}" data-dismissed>
      <p><select data-add-allergen style="max-width:260px;display:inline-block">
        <option value="">Add an allergen manually…</option>
        ${A.HEALTH_CANADA_ORDER.map((a) => html`<option value="${a}">${a}</option>`)}
      </select></p>

      <div class="ackbox">
        <label>
          <input type="checkbox" name="${prefix}_ack" value="1" data-ack${ackValid ? ' checked' : ''}>
          <span>I have reviewed the allergen information for this dish.
          ${!ackValid && item.ack ? html`<br><span class="flag flag--warn">The description changed since you last reviewed it — please check the tags again.</span>` : ''}</span>
        </label>
      </div>
    </div>

    ${showPhoto ? html`
    <div class="ie-photo">
      ${photoSlot({ prefix, field: 'photo', label: 'Photo', value: item.photo,
        hint: showPrices
          ? 'Shown on the card, and against both sizes unless you add a second photo below.'
          : '' })}
      ${showPrices ? photoSlot({
        prefix, field: 'single_photo', label: 'Meal-for-one photo', optional: true,
        value: item.single_photo,
        hint: 'Only if the smaller size looks different enough to be worth its own picture. Leave it empty and the photo above is used for both sizes.',
      }) : ''}
    </div>` : ''}

    ${showHalal ? html`
    <label class="ie-halal" style="display:flex;gap:var(--dbd-sp-3);align-items:center">
      <input type="checkbox" name="${prefix}_halal" value="1" style="width:24px;height:24px"${item.halal ? ' checked' : ''}>
      <span>Prepared halal — shown to customers as declared by the kitchen</span>
    </label>` : ''}

    ${showWeekdays ? html`
      <fieldset class="ie-weekdays">
        <legend>Available on</legend>
        ${T.WEEKDAYS.map((w) => html`
          <label style="display:inline-flex;gap:var(--dbd-sp-2);align-items:center;margin-right:var(--dbd-sp-4)">
            <input type="checkbox" name="${prefix}_weekdays" value="${w}" style="width:22px;height:22px"${weekdays.includes(w) ? ' checked' : ''}>
            ${T.WEEKDAY_LABELS[w].slice(0, 3)}</label>`)}
      </fieldset>` : ''}

    ${showPrices ? html`
    <fieldset class="ie-prices">
      <legend>Sizes and prices</legend>
      <div class="stack2">
        <div>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="${prefix}_full_on" value="1" style="width:22px;height:22px"${item.full_on ? ' checked' : ''}>
            Offer full size</label>
          <input type="text" name="${prefix}_full_label" value="${item.full_label || settings.get('full_label')}" placeholder="Label">
          <input type="text" name="${prefix}_full_price" inputmode="decimal"
            value="${item.full_price != null ? (item.full_price / 100).toFixed(2) : ''}" placeholder="Price, e.g. 18.00">
          <input type="number" name="${prefix}_full_cap" min="0" step="1"
            value="${item.full_cap == null ? '' : item.full_cap}" placeholder="How many available (blank = no limit)">
        </div>
        <div>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="${prefix}_single_on" value="1" style="width:22px;height:22px"${item.single_on ? ' checked' : ''}>
            Offer meal for one</label>
          <input type="text" name="${prefix}_single_label" value="${item.single_label || settings.get('single_label')}" placeholder="Label">
          <input type="text" name="${prefix}_single_price" inputmode="decimal"
            value="${item.single_price != null ? (item.single_price / 100).toFixed(2) : ''}" placeholder="Price">
          <input type="number" name="${prefix}_single_cap" min="0" step="1"
            value="${item.single_cap == null ? '' : item.single_cap}" placeholder="How many available">
        </div>
      </div>
    </fieldset>` : ''}
  </div>`;
}

function confirmForm({ action, buttonLabel, message, hidden = {}, kind = 'secondary' }) {
  return html`<form method="post" action="${action}" data-confirm="${message}" style="display:inline">
    ${Object.entries(hidden).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
    <button type="submit" class="btn btn--${kind}">${buttonLabel}</button>
  </form>`;
}

module.exports = { shell, login, itemEditor, reviewFlag, confirmForm };
