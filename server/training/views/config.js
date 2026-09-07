'use strict';

/** Locations & Delivery, Graphics, Settings, and the Facebook connect flow. */

const { html, raw } = require('../../html');
const C = require('../constants');
const L = require('../lib');
const St = require('../store');
const V = require('./layout');

const BASE = V.BASE;

/* ======================= LOCATIONS & DELIVERY ========================== */

function locationsPage(d, q) {
  const zoned = d.zones
    .map((z) => ({ ...z, n: d.fsas.filter((f) => f.zone_id === z.id).length }))
    .filter((z) => z.n > 0);

  const body = html`
    <h1>Locations &amp; Delivery</h1>
    ${V.flash(q)}

    <div class="card" data-coach="locations">
      <h2>Pickup locations</h2>
      ${d.locations.map((l) => html`
        <form method="post" action="${BASE}/locations/${l.id}"
          style="border-bottom:1px solid var(--dbd-rule-olive);padding-bottom:var(--dbd-sp-3);margin-bottom:var(--dbd-sp-3)">
          <input type="text" name="name" value="${l.name}" placeholder="Name">
          <input type="text" name="address" value="${l.address}" placeholder="Full address">
          <input type="text" name="notes" value="${l.notes}" placeholder="Notes, e.g. side door, ring bell" data-proof>
          <button class="btn btn--secondary" type="submit">Save</button>
          ${V.confirmForm({
            action: `${BASE}/locations/${l.id}/toggle`,
            buttonLabel: l.active ? 'Stop offering this location' : 'Offer this location again',
            message: l.active
              ? `Stop offering "${l.name}" at checkout? Orders already placed for it keep the address exactly as it was.`
              : `Offer "${l.name}" at checkout again?`,
          })}
          ${l.active ? '' : html`<span class="flag flag--warn">Not offered at checkout</span>`}
        </form>`)}
      <form method="post" action="${BASE}/locations">
        <h3 class="subhead">Add a location</h3>
        <input type="text" name="name" placeholder="Name" required>
        <input type="text" name="address" placeholder="Full address">
        <input type="text" name="notes" placeholder="Notes" data-proof>
        <button class="btn btn--primary" type="submit">Add location</button>
      </form>
    </div>

    <div class="card" data-coach="window">
      <h2>Pickup window</h2>
      <p class="also">Customers can come any time within this window — there's no time slot to book.</p>
      <form method="post" action="${BASE}/settings/pickup"
        data-confirm="Change the pickup window? It applies to every future service day. Orders already placed keep the window they were given.">
        <div class="stack2">
          <div><label for="pstart">Starts</label>
            <input type="time" id="pstart" name="pickup_start" value="${d.settings.pickup_start}"></div>
          <div><label for="pend">Ends</label>
            <input type="time" id="pend" name="pickup_end" value="${d.settings.pickup_end}"></div>
        </div>
        <button class="btn btn--primary" type="submit">Save pickup window</button>
      </form>
      <p class="also">Currently ${L.fmtWindow(d.settings.pickup_start, d.settings.pickup_end)}.</p>
    </div>

    <div class="card" data-coach="delivery">
      <h2>Delivery</h2>
      <form method="post" action="${BASE}/settings/delivery">
        <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
          <input type="checkbox" name="delivery_enabled" value="1" style="width:22px;height:22px"${d.settings.delivery_enabled ? ' checked' : ''}>
          Offer delivery</label>
        <label for="dfee">Delivery fee</label>
        <input type="text" id="dfee" name="delivery_fee" inputmode="decimal" value="${(d.settings.delivery_fee / 100).toFixed(2)}">
        <label for="dmin">Minimum food subtotal for delivery (0 for none)</label>
        <input type="text" id="dmin" name="delivery_min" inputmode="decimal" value="${(d.settings.delivery_min / 100).toFixed(2)}">
        <label for="dwin">Delivery window shown to customers</label>
        <input type="text" id="dwin" name="delivery_window" value="${d.settings.delivery_window}" data-proof>
        <button class="btn btn--primary" type="submit">Save delivery settings</button>
      </form>
      <p class="also">Changing the fee never changes the fee stored on an order that's already in.</p>
      ${zoned.length ? html`
        <div class="notice notice--strong">
          <strong>This fee does not apply to every area.</strong>
          ${zoned.reduce((n, z) => n + z.n, 0)} postal codes are grouped into a zone with its own
          fee, and a zone's fee wins: ${zoned.map((z) => `${z.name} — ${L.money(z.fee)}`).join(', ')}.
          Set an area back to <em>Flat fee</em> below to have it follow this box.
        </div>` : ''}
    </div>

    <div class="card" data-coach="fsa">
      <h2>Where we deliver</h2>
      <p class="also">The first three characters of a postal code. Add one here and it works
        immediately — nothing to redeploy.</p>
      <table class="dtable">
        <thead><tr><th>Area</th><th>Zone</th><th>Fee</th><th>Orders</th><th></th></tr></thead>
        <tbody>${d.fsas.map((f) => {
          const zone = f.zone_id ? St.byId(d.zones, f.zone_id) : null;
          return html`<tr>
            <td data-label="Area"><strong>${f.code}</strong></td>
            <td data-label="Zone">${zone ? zone.name : 'Flat fee'}</td>
            <td data-label="Fee">${zone ? L.money(zone.fee) : L.money(d.settings.delivery_fee)}</td>
            <td data-label="Orders">${f.uses}</td>
            <td data-label="">${V.confirmForm({
              action: `${BASE}/fsa/remove`,
              buttonLabel: 'Remove',
              hidden: { code: f.code },
              message: `Stop delivering to ${f.code}? ${f.uses} order${f.uses === 1 ? '' : 's'} used it before. Those orders are not changed.`,
            })}</td></tr>`;
        })}</tbody>
      </table>
      <form method="post" action="${BASE}/fsa/add">
        <div class="dl-row">
          <input type="text" name="code" placeholder="e.g. N2L" maxlength="3" style="flex:1 1 100px" required>
          <select name="zone_id" style="flex:1 1 150px">
            <option value="">Flat fee</option>
            ${d.zones.map((z) => html`<option value="${z.id}">${z.name} — ${L.money(z.fee)}</option>`)}
          </select>
          <button class="btn btn--primary" type="submit">Add area</button>
        </div>
      </form>
    </div>`;

  return { title: 'Locations & Delivery', body, current: 'locations' };
}

/* ============================== GRAPHICS ================================ */

const GRAPHIC_SETS = {
  social: {
    key: 'social', title: 'Social graphics',
    files: ['Facebook link preview 1200×630', 'Square post 1080×1080', 'Story 1080×1920'],
  },
  card: {
    key: 'card', title: 'Business card',
    files: ['Front 89×51 mm', 'Back 89×51 mm'],
  },
  sticker: {
    key: 'sticker', title: 'Sticker', sizes: true,
    files: ['Landscape', 'Portrait'],
  },
};

function graphicsPage(d, q) {
  const panel = (set) => {
    const state = d.graphics[set.key];
    return html`
      <div class="card" data-coach="${set.key}">
        <h2>${set.title}</h2>
        ${state.source === 'shipped' ? html`
          <div class="notice">These are the versions that shipped with the app. Generate to
            replace them with your own.</div>` : ''}

        ${set.sizes ? html`
          <form method="post" action="${BASE}/graphics/${set.key}" class="sticker-size">
            <div class="dl-row">
              <label>Width
                <input type="number" name="width_mm" inputmode="numeric" required min="10" max="200"
                  value="${state.width_mm}"> mm</label>
              <label>Height
                <input type="number" name="height_mm" inputmode="numeric" required min="10" max="200"
                  value="${state.height_mm}"> mm</label>
              <label>Printer
                <select name="dpi">
                  ${[203, 300, 600].map((x) => html`<option value="${x}"${state.dpi === x ? ' selected' : ''}>${x} dpi</option>`)}
                </select></label>
            </div>
            <p class="also">203 dpi suits Zebra, Rollo and most direct-thermal units; 300 dpi suits
              a Brother QL. Print the one that matches your printer and never scale it to fit.
              Both orientations are drawn each time.</p>
            <button class="btn btn--primary" type="submit">Generate both orientations</button>
          </form>`
        : html`
          <form method="post" action="${BASE}/graphics/${set.key}">
            <button class="btn btn--primary" type="submit">Generate ${set.title.toLowerCase()}</button>
          </form>`}

        <div class="graphics-grid" style="margin-top:var(--dbd-sp-3)">
          ${set.files.map((f) => html`
            <figure class="graphic">
              <div class="graphic__empty">${state.generated_at ? 'Drawn in training' : 'Not generated yet'}</div>
              <figcaption><strong>${f}</strong><br>
                <span class="variant__label">${state.generated_at
                  ? `made ${L.fmtMonthDay(state.generated_at)}`
                  : 'shipped with the app'}</span></figcaption>
            </figure>`)}
        </div>

        <div class="tr-note">No image file is drawn or written in training. Pressing Generate
          records that you did and updates the wording above, which is the part worth
          practising — the real one writes PNGs into the app's own folders.</div>
      </div>`;
  };

  const body = html`
    <h1>Graphics</h1>
    ${V.flash(q)}
    <p class="also">Everything here is drawn from the logo files and your own settings.
      Generating replaces the previous set — there is nothing to undo, and nothing a customer
      sees changes except the link preview.</p>
    ${Object.values(GRAPHIC_SETS).map(panel)}`;

  return { title: 'Graphics', body, current: 'graphics' };
}

/* ============================== SETTINGS ================================ */

function settingsPage(d, q) {
  const conn = d.facebook;
  const grouped = new Map();
  for (const t of d.allergenTerms.slice().sort((a, b) => a.term.localeCompare(b.term))) {
    if (!grouped.has(t.allergen)) grouped.set(t.allergen, []);
    grouped.get(t.allergen).push(t.term);
  }

  const pad = (n) => String(n).padStart(2, '0');

  const body = html`
    <h1>Settings</h1>
    ${V.flash(q)}

    <div class="card" data-coach="basics">
      <h2>The basics</h2>
      <form method="post" action="${BASE}/settings">
        <label for="bn">Business name</label>
        <input type="text" id="bn" name="business_name" value="${d.settings.business_name}">
        <label for="tzs">Time zone</label>
        <input type="text" id="tzs" name="timezone" value="${d.settings.timezone}">
        <label for="ch">Orders close at (the evening before each service day)</label>
        <input type="time" id="ch" name="cutoff_time"
          value="${pad(d.settings.cutoff_hour)}:${pad(d.settings.cutoff_minute)}">
        <p class="also">Monday service closes Sunday at this time. There are no same-day orders:
          past this, an order can only arrive as a late request, and only until the time below.</p>
        <label for="lc">Late requests stop at (the morning of each service day)</label>
        <input type="time" id="lc" name="late_cutoff_time"
          value="${pad(d.settings.late_cutoff_hour)}:${pad(d.settings.late_cutoff_minute)}">
        <label for="pay">Payment instructions shown to customers</label>
        <textarea id="pay" name="payment_instructions" rows="3" data-proof>${d.settings.payment_instructions}</textarea>
        <label for="oc">How customers reach you</label>
        <input type="text" id="oc" name="owner_contact" value="${d.settings.owner_contact}">
        <label for="ne">Where new orders are emailed</label>
        <input type="email" multiple id="ne" name="notify_email" value="${d.settings.notify_email}">
        <p class="also">More than one address is fine — separate them with commas.</p>
        <button class="btn btn--primary" type="submit">Save settings</button>
      </form>
      <div class="tr-note">Try typing a timezone that does not exist, like
        <code>Amercia/Toronto</code>. The real app refuses it and keeps the old one, because one
        transposed letter there used to take every date on every page down with it. This copy
        refuses it the same way.</div>
    </div>

    <div class="card" data-coach="publishing">
      <h2>Publishing</h2>
      <p class="also">A finished week can go live on its own, on the weekday before it starts.
        <strong>A scheduled publish never skips the allergen review.</strong></p>
      <form method="post" action="${BASE}/settings/publishing">
        <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
          <input type="checkbox" name="auto_publish" value="1" style="width:22px;height:22px"${Number(d.settings.auto_publish) ? ' checked' : ''}>
          Publish a finished week automatically</label>
        <div class="stack2">
          <div><label for="apwd">Day</label>
            <select id="apwd" name="auto_publish_weekday">
              ${C.WEEKDAYS_MON_FIRST.map((w) => html`<option value="${w}"${d.settings.auto_publish_weekday === w ? ' selected' : ''}>${C.WEEKDAY_LABELS[w]}</option>`)}
            </select></div>
          <div><label for="aptime">Time</label>
            <input type="time" id="aptime" name="auto_publish_time" value="${d.settings.auto_publish_time}"></div>
        </div>
        <p class="also">That is the ${C.WEEKDAY_LABELS[d.settings.auto_publish_weekday]}
          <em>before</em> the week starts, in ${d.settings.timezone}.</p>

        <fieldset>
          <legend>If no week has been built</legend>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="remind_missing_week" value="1" style="width:22px;height:22px"${Number(d.settings.remind_missing_week) ? ' checked' : ''}>
            Email me when there's no week built</label>
          <label for="rmwd">How many days before the publish time</label>
          <input type="number" id="rmwd" name="remind_missing_week_days" min="0" max="6" step="1"
            value="${d.settings.remind_missing_week_days}">
        </fieldset>

        <button class="btn btn--primary" type="submit">Save publishing schedule</button>
      </form>
    </div>

    <div class="card" data-coach="capacity">
      <h2>How many of the featured dish</h2>
      <p class="also">The most you'll cook of a day's featured dish, counting both sizes together
        — one full size and one meal for one uses two of them. A single day can be given its own
        number in This Week. Set this to 0 for no limit.</p>
      <form method="post" action="${BASE}/settings/capacity">
        <label for="fcap">Featured dish per day</label>
        <input type="number" id="fcap" name="featured_daily_cap" min="0" step="1"
          value="${d.settings.featured_daily_cap}">
        <button class="btn btn--primary" type="submit">Save</button>
      </form>
    </div>

    <div class="card" data-coach="facebook">
      <h2>Facebook</h2>
      ${conn ? html`
        <p><strong>Connected as ${conn.fb_user_name}</strong><br>
          Posting to <strong>${conn.page_name}</strong><br>
          <span class="variant__label">Connection expires ${conn.expires_at}</span></p>
        ${conn.stale ? html`<div class="notice notice--strong">
          Facebook rejected the last publish. Reconnect to fix it.</div>` : ''}
        <div class="dl-row">
          <a class="btn btn--secondary" href="${BASE}/facebook/connect">Reconnect</a>
          ${V.confirmForm({
            action: `${BASE}/facebook/disconnect`,
            buttonLabel: 'Disconnect',
            message: `Disconnect Facebook? The app forgets the connection and stops being able to post to ${conn.page_name}. Posts already published stay up.`,
          })}
        </div>`
      : html`
        <p>Connecting lets the app post this week's menu to <strong>one Facebook Page you
          choose</strong>, as you. It can't read your messages, your friends, or anything else,
          and it never posts without you pressing Publish and confirming.</p>
        <p><a class="btn btn--primary" href="${BASE}/facebook/connect">Connect Facebook</a></p>`}

      <div class="notice notice--strong">
        <strong>Groups can't be posted to automatically.</strong> Facebook shut that off for all
        apps in April 2024. For your group, use <strong>Copy post text</strong> on the week and
        paste it in yourself.
      </div>
      <div class="tr-note">In training, Connect never leaves this server — it shows you the same
        Page-picking screen against two invented Pages. No Facebook account is involved.</div>
    </div>

    <div class="card" data-coach="terms">
      <h2>Allergen words</h2>
      <p class="also">These are the words that trigger a suggestion. Suggestions are never applied
        on their own — you always accept or dismiss each one, and you always tick the review box
        before a dish can go live.</p>
      <form method="post" action="${BASE}/allergen-terms/add">
        <div class="dl-row">
          <input type="text" name="term" placeholder="Word the kitchen uses, e.g. brown butter"
            style="flex:2 1 200px" required>
          <select name="allergen" style="flex:1 1 150px">
            ${C.HEALTH_CANADA_ORDER.map((a) => html`<option value="${a}">${a}</option>`)}
          </select>
          <button class="btn btn--primary" type="submit">Add word</button>
        </div>
      </form>
      ${[...grouped.entries()].map(([allergen, list]) => html`
        <h3 class="subhead">${allergen} <span class="variant__label">(${list.length} words)</span></h3>
        <p>${list.map((t) => html`<form method="post" action="${BASE}/allergen-terms/remove" class="chip chip--rm">
            <input type="hidden" name="term" value="${t}">
            <input type="hidden" name="allergen" value="${allergen}">
            ${t} <button type="submit" title="Remove ${t}" aria-label="Remove ${t}">✕</button>
          </form> `)}</p>`)}
    </div>

    <div class="card" data-coach="backup">
      <h2>Backup</h2>
      <p class="also">The backup holds every week, dish, soup, salad, dessert, standing item,
        order, allergen word and setting, and your whole saved dish list. It never contains your
        Facebook token or any password.</p>
      <div class="dl-row">
        <a class="btn btn--secondary" href="${BASE}/export/backup.json">Download full backup</a>
        <a class="btn btn--secondary" href="${BASE}/export/contacts.csv">Download customer contacts</a>
      </div>
      <h3 class="subhead">Restore</h3>
      <form method="post" action="${BASE}/restore"
        data-confirm="Restoring replaces everything currently in the app with the contents of that file. Type RESTORE in the box first.">
        <label for="rfile">Backup file</label>
        <input type="text" id="rfile" name="backup_name" placeholder="dbd-backup-2026-09-01.json">
        <label for="rc">Type RESTORE to confirm</label>
        <input type="text" id="rc" name="confirm" placeholder="RESTORE">
        <button class="btn btn--secondary" type="submit">Restore from backup</button>
      </form>
      <div class="tr-note">The real form takes a file off your computer. In training it takes a
        filename, so you can practise the one thing that matters here — that it refuses to do
        anything until you have typed RESTORE — without needing a backup file to hand.</div>
    </div>`;

  return { title: 'Settings', body, current: 'settings' };
}

/** The Page-picking screen the fake OAuth hands back. */
function facebookChoosePage(d, pending, q) {
  const body = html`
    <h1>Choose the Page to post to</h1>
    ${V.flash(q)}
    <p>Connected as <strong>${pending.userName}</strong>.</p>
    <div class="tr-note">Nothing was sent to Facebook. These two Pages are invented, and so is
      the account they belong to.</div>
    ${pending.pages.map((p) => html`
      <div class="card">
        <h2>${p.name}</h2>
        <form method="post" action="${BASE}/facebook/select">
          <input type="hidden" name="choice" value="${pending.choice}">
          <input type="hidden" name="page_id" value="${p.id}">
          <button class="btn btn--primary" type="submit" name="action" value="use">Post to this Page</button>
          <button class="btn btn--secondary" type="submit" name="action" value="test">Test post to this Page</button>
        </form>
      </div>`)}
    <p class="also">Pick one within fifteen minutes, or start again from Settings.</p>`;

  return { title: 'Choose a Page', body, current: 'settings' };
}

module.exports = { locationsPage, graphicsPage, settingsPage, facebookChoosePage, GRAPHIC_SETS };
