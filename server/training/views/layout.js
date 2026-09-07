'use strict';

/**
 * The training shell and the pieces every screen shares.
 *
 * The stylesheets are the real ones — theme.css, app.css, admin.css — because
 * a trainee who learns a different-looking dashboard has learned a different
 * dashboard. Only training.css is added on top, and it adds: it draws the
 * banner and the walkthrough panel and touches nothing the real screens use.
 */

const { html, raw } = require('../../html');
const C = require('../constants');
const L = require('../lib');
const St = require('../store');
const sections = require('../sections');
const coach = require('../coach');

const BASE = '/admin-training';

/**
 * Every page, wrapped.
 *
 * The banner is not subtle on purpose. It is fixed to the top of the viewport,
 * it survives scrolling, it is repeated in the <title> so it shows in the tab
 * and in a bookmark, and the whole page carries a tinted border — because the
 * one unrecoverable mistake this module could cause is somebody believing they
 * are in here when they are not, or the other way about.
 */
function shell({ title, body, current = '', step = null, sectionSteps = [] }) {
  const enabledKeys = sections.enabled().map((s) => s.key);
  const pos = coach.position(current, enabledKeys);

  const navItem = (s) => {
    const here = current === s.key ? raw(' aria-current="page"') : '';
    return html`<li><a href="${BASE}${s.path}"${here}>${s.label}</a></li>`;
  };

  return html`<!doctype html>
<html lang="en-CA"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TRAINING — ${title}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/admin.css">
<link rel="stylesheet" href="${BASE}/training.css">
</head><body class="tr-body">

<!-- The banner. Fixed, unmissable, and on every single screen. -->
<div class="tr-banner" role="alert">
  <span class="tr-banner__tag">TRAINING MODE</span>
  <span class="tr-banner__text">Practice only. Nothing here is real and nothing here is saved to the
    business. No customer is emailed, no menu is published, no money moves.</span>
  <span class="tr-banner__actions">
    <a class="tr-banner__link" href="/admin">Leave training</a>
    <form method="post" action="${BASE}/reset" style="display:inline"
      data-confirm="Throw away everything you have done in training and start again from the beginning? The real dashboard is not affected either way.">
      <button type="submit" class="tr-banner__btn">Reset sandbox</button>
    </form>
  </span>
</div>

<nav class="admin-nav no-print tr-nav"><ul>
  ${sections.enabled().map(navItem)}
</ul></nav>

<main class="admin-wrap tr-wrap">
${coachPanel({ current, step, sectionSteps, pos })}
${body}
<p class="tr-foot">You are in the training copy of the dashboard.
  Every screen above is a practice version working on invented data.
  <a href="/admin">Go to the real dashboard</a>.</p>
</main>

<div id="toasts" aria-live="polite"></div>
<script src="${BASE}/training.js" defer></script>
</body></html>`;
}

/**
 * The walkthrough panel.
 *
 * Server-rendered and driven by ?step=, so Next and Back are ordinary links
 * and the tour works with no script at all. training.js adds the part script
 * is actually needed for: finding the target, opening the <details> it is
 * inside, scrolling to it and ringing it.
 */
function coachPanel({ current, step, sectionSteps, pos }) {
  if (!sectionSteps.length) return '';
  const n = Number(step);
  const active = Number.isFinite(n) && n >= 1 && n <= sectionSteps.length ? n : null;

  if (!active) {
    return html`
      <div class="tr-coach tr-coach--closed" data-coach-panel>
        <div class="tr-coach__head">
          <strong>Guided walkthrough</strong>
          ${pos ? html`<span class="tr-coach__pos">Section ${pos.index} of ${pos.total}</span>` : ''}
        </div>
        <p class="tr-coach__body">${sectionSteps.length} step${sectionSteps.length === 1 ? '' : 's'}
          on this screen. It points at each control in turn and says what it does.</p>
        <p><a class="btn btn--primary" href="?step=1">Walk me through this screen</a></p>
      </div>`;
  }

  const s = sectionSteps[active - 1];
  const last = active === sectionSteps.length;
  const nextSection = pos && pos.next;

  return html`
    <div class="tr-coach" data-coach-panel data-coach-target="${s.target}">
      <div class="tr-coach__head">
        <strong>Step ${active} of ${sectionSteps.length}</strong>
        ${pos ? html`<span class="tr-coach__pos">Section ${pos.index} of ${pos.total}</span>` : ''}
        <a class="tr-coach__close" href="?">Close</a>
      </div>
      <h3 class="tr-coach__title">${s.title}</h3>
      <p class="tr-coach__body">${s.body}</p>
      <div class="tr-coach__nav">
        ${active > 1 ? html`<a class="btn btn--secondary" href="?step=${active - 1}">Back</a>` : ''}
        ${last
          ? (nextSection
            ? html`<a class="btn btn--primary" href="${BASE}${sections.find(nextSection).path}?step=1">
                Next: ${sections.find(nextSection).label}</a>`
            : html`<a class="btn btn--primary" href="${BASE}/">Finish the tour</a>`)
          : html`<a class="btn btn--primary" href="?step=${active + 1}">Next</a>`}
      </div>
    </div>`;
}

/** The ok/err line a redirect carries back, same as the real dashboard's. */
function flash(query) {
  const ok = query.ok ? String(query.ok) : '';
  const err = query.err ? String(query.err) : '';
  if (!ok && !err) return '';
  return html`
    ${err ? html`<div class="notice notice--strong tr-flash" role="status">${err}</div>` : ''}
    ${ok ? html`<div class="notice tr-flash" role="status">${ok}</div>` : ''}`;
}

/** Plain-language review state, used everywhere an item is listed. */
function reviewFlag(d, item, label) {
  const st = St.review(d, item);
  if (st.ok) return html`<span class="flag flag--ok">Reviewed</span>`;
  return html`<span class="flag flag--stop" title="${L.reviewMessage(label || 'This item', st)}">Needs allergen review</span>`;
}

function confirmForm({ action, buttonLabel, message, hidden = {}, kind = 'secondary', coachKey = '' }) {
  return html`<form method="post" action="${action}" data-confirm="${message}" style="display:inline"
    ${coachKey ? raw(`data-coach="${coachKey}"`) : ''}>
    ${Object.entries(hidden).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
    <button type="submit" class="btn btn--${kind}">${buttonLabel}</button>
  </form>`;
}

/**
 * One photo box.
 *
 * The real one uploads to /admin/api/upload, which writes a file to disk. This
 * one never leaves the browser: training.js reads the chosen file with a
 * FileReader and shows it, and the hidden field carries a sandbox placeholder
 * name. A trainee gets the whole gesture — take, choose, drag, paste, remove —
 * and the disk is never touched.
 */
function photoSlot({ prefix, field, label, value, hint = '', optional = false }) {
  const name = `${prefix}_${field}`;
  return html`
  <div data-photoslot style="margin-bottom:var(--dbd-sp-4)">
    <label for="${name}_take">${label}${optional ? html` <span class="variant__label">(optional)</span>` : ''}</label>
    ${hint ? html`<p class="variant__label" style="margin-bottom:var(--dbd-sp-2)">${hint}</p>` : ''}
    <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
      <button type="button" class="btn btn--primary" id="${name}_take" data-take>Take photo</button>
      <button type="button" class="btn btn--secondary" data-choose>Choose from library</button>
      <button type="button" class="btn btn--secondary" data-clearphoto${value ? '' : ' hidden'}>Remove photo</button>
    </div>
    <div class="dropzone" data-drop tabindex="0" role="button">
      ${value ? html`<div class="tr-photo" data-preview>Photo on file: ${value}</div>` : html`<div class="tr-photo" data-preview hidden></div>`}
      <p><strong>Or drag a photo here</strong><br>
        <span class="variant__label">or paste one from the clipboard. In training the picture
        stays in your browser — nothing is uploaded.</span></p>
      <p class="dz-msg variant__label"></p>
    </div>
    <input type="file" accept="image/*,.heic,.heif" hidden data-file>
    <input type="file" accept="image/*" capture="environment" hidden data-camera>
    <input type="hidden" name="${name}" value="${value || ''}" data-photo>
  </div>`;
}

/**
 * The item editor, used unchanged at all three levels — a day's dish, a week's
 * soup, a standing item — exactly as the real one is.
 */
function itemEditor(d, { prefix, item, showName = true, nameLabel = 'Name', showWeekdays = false,
  showPhoto = true, showHalal = true, showPrices = true }) {
  const accepted = L.jsonArr(item.allergens);
  const dismissed = L.jsonArr(item.dismissed);
  const weekdays = L.jsonArr(item.weekdays);
  const ackValid = item.ack && (item.ack_of || '') === L.reviewedText(item);

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

    <div class="ie-allergens" data-coach="suggestions">
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
        ${C.HEALTH_CANADA_ORDER.map((a) => html`<option value="${a}">${a}</option>`)}
      </select></p>

      <div class="ackbox" data-coach="ack">
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
        hint: 'Only if the smaller size looks different enough to be worth its own picture.',
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
        ${C.WEEKDAYS.map((w) => html`
          <label style="display:inline-flex;gap:var(--dbd-sp-2);align-items:center;margin-right:var(--dbd-sp-4)">
            <input type="checkbox" name="${prefix}_weekdays" value="${w}" style="width:22px;height:22px"${weekdays.includes(w) ? ' checked' : ''}>
            ${C.WEEKDAY_LABELS[w].slice(0, 3)}</label>`)}
      </fieldset>` : ''}

    ${showPrices ? html`
    <fieldset class="ie-prices">
      <legend>Sizes and prices</legend>
      <div class="stack2">
        <div>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="${prefix}_full_on" value="1" style="width:22px;height:22px"${item.full_on ? ' checked' : ''}>
            Offer full size</label>
          <input type="text" name="${prefix}_full_label" value="${item.full_label || d.settings.full_label}" placeholder="Label">
          <input type="text" name="${prefix}_full_price" inputmode="decimal"
            value="${item.full_price != null ? (item.full_price / 100).toFixed(2) : ''}" placeholder="Price, e.g. 18.00">
          <input type="number" name="${prefix}_full_cap" min="0" step="1"
            value="${item.full_cap == null ? '' : item.full_cap}" placeholder="How many available (blank = no limit)">
        </div>
        <div>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="${prefix}_single_on" value="1" style="width:22px;height:22px"${item.single_on ? ' checked' : ''}>
            Offer meal for one</label>
          <input type="text" name="${prefix}_single_label" value="${item.single_label || d.settings.single_label}" placeholder="Label">
          <input type="text" name="${prefix}_single_price" inputmode="decimal"
            value="${item.single_price != null ? (item.single_price / 100).toFixed(2) : ''}" placeholder="Price">
          <input type="number" name="${prefix}_single_cap" min="0" step="1"
            value="${item.single_cap == null ? '' : item.single_cap}" placeholder="How many available">
        </div>
      </div>
    </fieldset>` : ''}
  </div>`;
}

module.exports = { BASE, shell, flash, reviewFlag, confirmForm, itemEditor, photoSlot };
