'use strict';
const { html, raw, money, jsonAttr } = require('../html');
const L = require('./layout');
const T = require('../time');
const { settings } = require('../db');
const M = require('../menu');
const O = require('../orders');

const tz = () => settings.get('timezone', 'America/Toronto');

/* JSON safe to sit inside a <script> element: the only sequences that can end
   one early are escaped, so no value in the menu can close the tag. */
const jsonBlock = (v) => JSON.stringify(v)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/* "Ordering closed" rather than plain "closed", because a day the kitchen is
   shut sits in the same list and means something else entirely: one is a
   cutoff that has passed, the other is nobody cooking. */
const STATE_LABEL = {
  open: 'Open',
  closing: 'Closing tonight',
  late: 'Ordering closed — late requests only',
  closed: 'Ordering closed',
  past: 'This day is over',
};

function stateLine(st, cutoff, lateCutoff) {
  const when = T.fmtLocal(cutoff, tz(), { weekday: 'short' });
  if (st === 'open') return `Orders close ${when}`;
  if (st === 'closing') return `Orders close tonight at ${T.fmtLocal(cutoff, tz())}`;
  if (st === 'late') return `Closed ${when} — late requests until ${T.fmtLocal(lateCutoff, tz())}`;
  if (st === 'closed') return 'Nothing more can be ordered for this day';
  return 'Past service day';
}

/* --- Week / day selector ------------------------------------------------ */
function weekView({ week, days }) {
  // A closed week is published like any other and says so plainly. The day
  // list is not shown at all: there is nothing to pick between.
  const body = week.closed ? html`
    <h1>${week.title || 'This week'}</h1>
    <div class="notice notice--strong">
      <strong>The kitchen is closed this week.</strong>
      ${week.closed_note ? html`<br>${week.closed_note}` : ''}
    </div>
    <p>There's nothing to order for these dates. Check back for the following week.</p>
    <p>${settings.get('owner_contact')}</p>`
  : html`
    ${week.image ? html`<img src="/uploads/${week.image}" alt="" class="featured__photo" style="border-radius:var(--dbd-radius);margin-bottom:var(--dbd-sp-4)">` : ''}
    <h1>${week.title || 'This week'}</h1>
    ${week.description ? html`<p>${week.description}</p>` : ''}

    <div class="section-rule"><h2>Pick a day</h2></div>
    <ul class="daylist">
      ${days.map((d) => {
        const menu = M.menuForDay(week, d);
        if (menu.closed) {
          return html`<li>
            <div class="daycard daycard--shut">
              <div class="daycard__date">${T.fmtDayLong(d.service_date, tz())}</div>
              <div class="daycard__dish">Not cooking</div>
              <div class="daycard__meta">
                <span class="state state--shut">The kitchen is closed this day</span>
                ${menu.closedNote ? html` · ${menu.closedNote}` : ''}
              </div>
            </div>
          </li>`;
        }
        return html`<li>
          <a class="daycard" href="/w/${week.slug}/${d.service_date}">
            <div class="daycard__date">${T.fmtDayLong(d.service_date, tz())}</div>
            <div class="daycard__dish">${menu.featured ? menu.featured.name : 'Menu coming soon'}</div>
            ${menu.meatless ? html`<div class="daycard__alt"><span>${menu.meatless.level}</span>${menu.meatless.name}</div>` : ''}
            <div class="daycard__meta">
              <span class="state state--${menu.state}">${STATE_LABEL[menu.state]}</span>
              · ${stateLine(menu.state, menu.cutoff, menu.lateCutoff)}
              · Pickup ${T.fmtWindow(menu.window.start, menu.window.end)}
              · ${menu.deliveryOn ? 'Delivery available' : 'Pickup only'}
            </div>
          </a>
        </li>`;
      })}
    </ul>
    ${L.allergenDisclaimer()}`;

  return L.page({
    title: week.title || 'This week',
    description: week.description || 'Order this week\'s supper club menu.',
    image: week.image ? `/uploads/${week.image}` : null,
    url: `/w/${week.slug}`,
    body,
  });
}

/* --- Item rendering ----------------------------------------------------- */
/**
 * A stepper that cannot step, marked so it can still answer for itself.
 *
 * `disabled` was the honest word for it and the wrong attribute: a disabled
 * button receives no click at all, so tapping one on a closed day produced
 * silence — no quantity, no total bar, and no way for anything to say why.
 * aria-disabled tells assistive tech the same thing while leaving the tap
 * audible, which is what lets the warning exist. Nothing wires these up on a
 * closed day anyway — order.js returns early without an order form — so the
 * only thing the tap can do is explain itself.
 *
 * raw(), because the value carries quotes and html`` would escape them into
 * an attribute the browser never sees. See the same bug in views/admin.js.
 */
const off = (disabled) => (disabled ? raw(' aria-disabled="true"') : '');

function variantRows(item, disabled) {
  return html`${item.variants.map((v) => html`
    <div class="variant">
      <div>
        <div class="variant__label">${v.label}</div>
        ${v.remaining !== null && v.remaining > 0 && v.remaining <= 3
          ? html`<div class="variant__label" style="color:var(--dbd-warn)">Only ${v.remaining} left</div>` : ''}
      </div>
      <div class="variant__price">${money(v.price)}</div>
      ${v.soldOut
        ? html`<span class="chip chip--soldout">Sold out</span>`
        : html`<div class="qty" data-qty${disabled ? raw(' data-shut') : ''}
                 data-key="${item.key}" data-variant="${v.id}"
                 data-price="${v.price}" data-name="${item.name}"
                 data-label="${v.label}" data-level="${item.level}"
                 data-max="${v.remaining === null ? '' : v.remaining}">
            <button type="button" data-step="-1" aria-label="One fewer ${item.name}, ${v.label}"${off(disabled)}>−</button>
            <output aria-live="polite">0</output>
            <button type="button" data-step="1" aria-label="One more ${item.name}, ${v.label}"${off(disabled)}>+</button>
          </div>`}
    </div>`)}`;
}

/**
 * A headline dish. Monday draws this twice — the featured dish, then the
 * meatless one — so the eyebrow is a parameter rather than a constant. The
 * meatless dish passes its own level, which is "Meatless Monday" on the day
 * it is named after and plain "Meatless" anywhere else.
 */
function featuredBlock(item, cap, readOnly, eyebrow = 'Featured tonight') {
  // The day's ceiling across both sizes. Only worth saying out loud once it is
  // close enough to change what someone does.
  const capNote = cap && cap.remaining === 0
    ? html`<p><span class="chip chip--soldout">Sold out for today</span></p>`
    : cap && cap.remaining <= 5
      ? html`<p class="variant__label" style="color:var(--dbd-warn)">
          Only ${cap.remaining} left for today</p>`
      : '';
  return html`
  <section class="featured">
    ${item.photo ? zoomablePhoto(item, 'featured__photo') : ''}
    <div class="featured__body">
      <p class="featured__eyebrow">${eyebrow}</p>
      <h2 class="featured__name">${item.name}</h2>
      ${item.halal ? html`<p>${L.halalBadge(true)}</p>` : ''}
      ${capNote}
      ${item.description ? html`<p>${item.description}</p>` : ''}
      ${L.allergenChips(item.allergens)}
      ${variantRows(item, readOnly)}
    </div>
  </section>`;
}

/**
 * The dish photo, and a way into the big one.
 *
 * Both sizes are already on disk: store() writes a 1400px web copy for the
 * page and keeps the full-resolution original beside it. So the card carries
 * the small file and the tap loads the original -- nothing new is generated
 * and nothing large is downloaded until somebody asks for it.
 *
 * data-web is the fallback. Every photo the app has ever stored has an
 * original, but a missing one should show the picture the page already has
 * rather than a broken frame.
 */
function zoomablePhoto(item, cls) {
  const original = item.photo.replace(/\.jpg$/, '-original.jpg');
  return html`
    <button type="button" class="photozoom photozoom--${cls}" data-zoom
            data-full="/uploads/${original}" data-web="/uploads/${item.photo}"
            data-name="${item.name}" data-desc="${item.description || ''}"
            aria-label="See a bigger picture of ${item.name}">
      <img class="${cls}" src="/uploads/${item.photo}" alt="${item.name}">
    </button>`;
}

function optionCard(item, readOnly) {
  return html`
  <article class="optioncard">
    ${item.photo ? zoomablePhoto(item, 'optioncard__photo') : ''}
    <div style="flex:1">
      <div class="optioncard__name">${item.name}</div>
      ${item.halal ? html`<p style="margin:var(--dbd-sp-1) 0">${L.halalBadge(true)}</p>` : ''}
      ${item.description ? html`<p class="optioncard__desc">${item.description}</p>` : ''}
      ${L.allergenChips(item.allergens)}
      ${variantRows(item, readOnly)}
    </div>
  </article>`;
}

/* --- Day view + checkout ------------------------------------------------ */
function dayView({ week, day, menu, locations, deliveryFee, deliveryMin, servedAreas }) {
  const late = menu.state === 'late';
  // Past the late cutoff but the day itself still to come. The menu is worth
  // showing — someone reading it at breakfast should see what they missed and
  // what the rest of the week holds — but there is nothing to fill in.
  const shut = menu.state === 'closed';
  const past = menu.state === 'past';
  const dayLabel = T.fmtDayLong(day.service_date, tz());

  // Closed — the day is still reachable by its permalink, because the link may
  // be sitting in somebody's messages, and it should explain itself rather
  // than 404. No menu, no order form, and no late-request route either: a
  // closure is not a cutoff, and there is nothing to request.
  if (menu.closed) {
    return L.page({
      title: `${dayLabel} — closed`,
      description: `Dinner By Derek isn't cooking on ${dayLabel}.`,
      url: `/w/${week.slug}/${day.service_date}`,
      body: html`
        <p><a href="/w/${week.slug}">← All days</a></p>
        <h1>${dayLabel}</h1>
        <div class="notice notice--strong">
          <strong>Derek isn't cooking on ${dayLabel}.</strong>
          ${menu.closedNote ? html`<br>${menu.closedNote}` : ''}
        </div>
        <p>Nothing can be ordered for this day.</p>
        <p>${settings.get('owner_contact')}</p>
        <p style="margin-top:var(--dbd-sp-5)">
          <a class="btn btn--primary" href="/w/${week.slug}">See the other days</a></p>`,
    });
  }

  const banner = past
    ? html`<div class="notice notice--strong"><strong>This day has closed.</strong>
        ${dayLabel} is in the past and is shown for reference only.</div>`
    : shut
      ? html`<div class="notice notice--strong">
          <strong>Ordering has closed for ${dayLabel}.</strong>
          Late requests were taken until ${T.fmtLocal(menu.lateCutoff, tz())} this morning;
          after that the shopping is done and the cooking has started. The menu below is
          shown so you can see what's on — nothing on it can be ordered for today.
          ${settings.get('owner_contact')}</div>`
      : late
        ? html`<div class="notice notice--late"><strong>Ordering has closed for ${dayLabel}.</strong>
            You can still send a late request until
            <strong>${T.fmtLocal(menu.lateCutoff, tz())} on the morning of
            ${T.fmtDayShort(day.service_date, tz())}</strong>, but it is
            <strong>not confirmed</strong> until Derek confirms it.
            ${settings.get('owner_contact')}</div>`
        : menu.state === 'closing'
          ? html`<div class="notice"><strong>Closing tonight at ${T.fmtLocal(menu.cutoff, tz())}.</strong>
              Get your order in before then.</div>`
          : '';

  /* Why this day cannot take an order, in one sentence. Said three times over,
     in descending order of how hard it is to miss: the banner at the top, the
     line under the stepper that was tapped, and — once somebody has tapped
     twice, which is the tell that neither has landed — the box below. */
  const shutNote = past
    ? `${dayLabel} has already passed, so nothing on it can be ordered.`
    : shut
      ? `Ordering has closed for ${dayLabel}.`
      : '';

  const body = html`
    <p><a href="/w/${week.slug}">← All days</a></p>
    <h1>${dayLabel}</h1>
    ${banner}
    ${L.allergenDisclaimer()}

    ${menu.featured ? featuredBlock(menu.featured, menu.featuredCap, past || shut) : html`<div class="notice">No featured dish is set for this day yet.</div>`}
    ${menu.meatless ? featuredBlock(menu.meatless, menu.meatlessCap, past || shut, menu.meatless.level) : ''}

    ${menu.grouped.length ? html`
      <div class="section-rule"><h2>Other Options</h2></div>
      ${menu.grouped.map((g) => html`
        <h3 class="subhead">${g.label}</h3>
        ${g.items.map((i) => optionCard(i, past || shut))}`)}` : ''}

    <!-- The third telling, and the loud one. Only rendered on a day that
         cannot take an order, and only opened once somebody has tapped a
         stepper twice — by which point the banner and the inline line have
         both failed, and repeating them a third time quietly would fail too.
         It carries the way out rather than only the refusal: the whole reason
         someone is tapping is that they want to order something. -->
    ${past || shut ? html`
    <dialog class="shutbox" id="shutbox" aria-labelledby="shutbox-title">
      <h2 class="shutbox__title" id="shutbox-title">You can't order for this day</h2>
      <p class="shutbox__why">${shutNote}</p>
      <p>The menu is still here so you can see what was on. To order, pick a day
        that is still open.</p>
      <div class="shutbox__actions">
        <a class="btn btn--primary" href="/w/${week.slug}">See the days you can order</a>
        <button type="button" class="btn btn--secondary" data-shutbox-close>Stay here</button>
      </div>
    </dialog>` : ''}

    ${past || shut ? '' : html`
    <form id="orderform" method="post" action="/order" novalidate>
      <input type="hidden" name="week" value="${week.slug}">
      <input type="hidden" name="date" value="${day.service_date}">
      <input type="hidden" name="lines" id="lines" value="[]">
      <!-- Stamped once when this page is drawn, so the same page posting
           twice is recognisably the same submission. Filled in by order.js;
           an unscripted post simply leaves it empty and is treated as new. -->
      <input type="hidden" name="submission_key" id="submission-key" value="">

      <div class="section-rule"><h2>How would you like it?</h2></div>

      <div id="empty-note" class="notice">Add something above to continue.</div>

      <div id="fulfil" hidden>
        <fieldset>
          <legend>Pickup or delivery</legend>
          <div class="radio-row">
            <label class="radio-card"><input type="radio" name="method" value="pickup" checked> Pickup</label>
            ${menu.deliveryOn ? html`<label class="radio-card"><input type="radio" name="method" value="delivery"> Delivery</label>` : ''}
          </div>
        </fieldset>

        <div id="pickup-pane">
          <fieldset>
            <legend>Where you'll collect it</legend>
            ${locations.map((l, i) => html`
              <label class="radio-card" style="justify-content:flex-start;margin-bottom:var(--dbd-sp-2)">
                <input type="radio" name="location_id" value="${l.id}"${i === 0 ? ' checked' : ''}>
                <span><strong>${l.name}</strong><br>
                  <span class="variant__label">${l.address}${l.notes ? ` — ${l.notes}` : ''}</span></span>
              </label>`)}
          </fieldset>
          <p class="notice">
            Pickup anytime ${T.fmtWindow(menu.window.start, menu.window.end)} — no time to book, just come by.</p>
        </div>

        ${menu.deliveryOn ? html`
        <div id="delivery-pane" hidden>
          <fieldset>
            <legend>Delivery address</legend>
            <label for="postal">Postal code</label>
            <input type="text" id="postal" name="postal" autocomplete="postal-code" inputmode="text"
              placeholder="N2L 3G1" aria-describedby="err-postal">
            <p class="field-err" id="err-postal" hidden></p>
            <div id="eligibility" class="notice" hidden></div>
            <label for="addr">Street address</label>
            <input type="text" id="addr" name="addr_line" autocomplete="address-line1"
              aria-describedby="err-addr">
            <p class="field-err" id="err-addr" hidden></p>
            <label for="unit">Unit or buzzer <span class="variant__label">(optional)</span></label>
            <input type="text" id="unit" name="addr_unit" autocomplete="address-line2">
            <label for="anotes">Delivery instructions <span class="variant__label">(optional)</span></label>
            <textarea id="anotes" name="addr_notes" rows="2"></textarea>
            <p class="variant__label">Delivery ${settings.get('delivery_window')}.</p>
          </fieldset>
        </div>` : ''}

        <fieldset>
          <legend>Your details</legend>
          <label for="cname">Name</label>
          <input type="text" id="cname" name="name" autocomplete="name" required
            aria-describedby="err-cname">
          <p class="field-err" id="err-cname" hidden></p>
          <label for="cphone">Phone</label>
          <input type="tel" id="cphone" name="phone" autocomplete="tel" required
            aria-describedby="err-cphone">
          <p class="field-err" id="err-cphone" hidden></p>
          <!-- "for your confirmation" described what the box was for. It did not
               say what skipping it costs, which is the only part worth knowing
               while deciding whether to bother. -->
          <label for="cemail">Email
            <span class="variant__label">Optional — but without it we can't send you
              anything to keep</span></label>
          <input type="email" id="cemail" name="email" autocomplete="email"
            aria-describedby="err-cemail">
          <p class="field-err" id="err-cemail" hidden></p>
          <label for="callergy">Allergies or notes for the kitchen</label>
          <textarea id="callergy" name="allergy_notes" rows="3"
            placeholder="Tell Derek about any allergies here."></textarea>
        </fieldset>

        <fieldset>
          <legend>How you'll pay</legend>
          <p class="also">No payment is taken here. This just tells the kitchen what to expect.</p>
          ${O.PAYMENT_METHODS.map((p, i) => html`
            <label style="display:flex;gap:var(--dbd-sp-3);align-items:center;min-height:var(--dbd-tap)">
              <input type="radio" name="payment_method" value="${p.key}"
                style="width:22px;height:22px"${i === 0 ? ' checked' : ''} required>
              <span>${p.label}${p.note ? html` <span class="variant__label">— ${p.note}</span>` : ''}</span>
            </label>`)}
          <p class="notice" style="margin-top:var(--dbd-sp-3)">${settings.get('payment_instructions')}</p>
        </fieldset>

        <div class="card totals">
          <div class="totals__row"><span>Food subtotal</span><span id="t-sub">$0.00</span></div>
          <div class="totals__row" id="t-feerow" hidden><span>Delivery</span><span id="t-fee">$0.00</span></div>
          <div class="totals__row totals__row--grand"><span>Total</span><span id="t-total">$0.00</span></div>
        </div>

        <div id="formerror" class="notice notice--strong" role="alert" tabindex="-1" hidden></div>

        <button type="submit" class="btn btn--primary btn--block" id="submitbtn">
          ${late ? 'Review late request' : 'Review order'}
        </button>
        <p class="variant__label" style="margin-top:var(--dbd-sp-2);text-align:center">
          You'll see everything to check before anything is sent.</p>
      </div>
    </form>

    <!-- The bar is the button. It sat at the bottom of every screen showing a
         running total and did nothing when tapped, which is the one thing a
         running total invites you to do. It says so now, because a control
         that only looks tappable to the person who wrote it is not a control. -->
    <button type="button" class="orderbar" id="orderbar" hidden
            aria-haspopup="dialog" aria-controls="cart">
      <span id="bar-count">0 items</span>
      <span class="orderbar__right">
        <span class="orderbar__cue">View order</span>
        <span class="orderbar__total" id="bar-total">$0.00</span>
      </span>
    </button>

    <!-- What's in the order, without leaving the page to find out. Priced from
         the same figures the bar shows; the binding check against the server
         is still the review step, which is where Place order lives. -->
    <dialog class="review" id="cart" aria-labelledby="cart-title">
      <form method="dialog" class="review__close">
        <button class="btn btn--secondary" value="cancel" aria-label="Close">✕</button>
      </form>
      <h2 id="cart-title">Your order</h2>
      <div id="cart-body"></div>
      <div class="review__actions">
        <button type="button" class="btn btn--secondary" id="cart-back">Keep adding</button>
        <button type="button" class="btn btn--primary" id="cart-complete">
          ${late ? 'Complete request' : 'Complete order'}
        </button>
      </div>
    </dialog>

    <!-- The review step. A <dialog> so the browser handles the focus trap, the
         backdrop and Escape — behaviour that is tedious and easy to get subtly
         wrong by hand, and that a screen reader depends on. Filled from
         /api/quote, so what is shown here is priced by the server, not by the
         page. Hidden entirely without JavaScript, where the form submits
         directly as it always did. -->
    <dialog class="review" id="review" aria-labelledby="review-title">
      <form method="dialog" class="review__close">
        <button class="btn btn--secondary" value="cancel" aria-label="Close review">✕</button>
      </form>
      <h2 id="review-title">${late ? 'Check your request' : 'Check your order'}</h2>
      <div id="review-body"></div>
      <div class="review__actions">
        <button type="button" class="btn btn--secondary" id="review-back">Back to edit</button>
        <button type="button" class="btn btn--primary" id="review-confirm">
          ${late ? 'Send request' : 'Place order'}
        </button>
      </div>
      <p class="variant__label" id="review-foot"></p>
    </dialog>`}`;

  const cfg = {
    late,
    deliveryFee,
    deliveryMin,
    servedAreas,
    ownerContact: settings.get('owner_contact'),
    /* Empty on a day that is open, and the handler stays out of the way. */
    shutNote,
  };

  return L.page({
    title: `${dayLabel} — ${menu.featured ? menu.featured.name : 'Menu'}`,
    description: menu.featured
      ? (menu.featured.description || `Featured: ${menu.featured.name}`).slice(0, 200)
      : `Order for ${dayLabel}.`,
    image: menu.featured && menu.featured.photo ? `/uploads/${menu.featured.photo}`
      : (week.image ? `/uploads/${week.image}` : null),
    url: `/w/${week.slug}/${day.service_date}`,
    body,
    /* Data, not code. A JSON block the script reads, rather than a script tag
       that builds a global: it lets the page ban inline script outright, and
       it takes away the older hazard of a dish name containing the characters
       that end a script tag early. */
    scripts: html`<script type="application/json" id="dbd-config">${raw(jsonBlock(cfg))}</script>
<script src="/order.js" defer></script>`,
  });
}

/* --- Confirmation -------------------------------------------------------- */
function confirmationView({ order, lines, late }) {
  const body = html`
    <div class="card">
      ${late
        ? html`<h1>Late request sent</h1>
            <div class="notice notice--strong">
              <strong>This is not confirmed yet.</strong> Ordering had closed for
              ${T.fmtDayLong(order.service_date, tz())}, so Derek needs to confirm
              it personally. You'll hear back shortly.
              ${settings.get('owner_contact')}</div>`
        : html`<h1>Order confirmed</h1>
            <p>Thanks ${order.name} — you're on the list for
            <strong>${T.fmtDayLong(order.service_date, tz())}</strong>.</p>`}

      <!-- Whether anything is coming, said on the one screen where the customer
           is still looking. Without this, an order placed with no email address
           ends at "Order confirmed" and then silence — and the reference, which
           is the only record that survives closing the page, was the smallest
           muted line on it. -->
      ${order.email
        ? html`<p class="confirm__sent">A copy is on its way to
            <strong>${order.email}</strong>. Your reference is
            <strong>${order.ref}</strong>.</p>`
        : html`<div class="notice notice--strong confirm__norecord">
            <strong>This page is your only record.</strong>
            You didn't give an email address, so there is nothing for us to send.
            Please write this reference down or take a photo of this screen:
            <span class="confirm__ref">${order.ref}</span>
            ${settings.get('owner_contact')}</div>`}

      <h3 class="subhead">Your order</h3>
      ${lines.map((l) => html`
        <div class="totals__row">
          <span>${l.qty} × ${l.item_name} <span class="variant__label">(${l.variant_label})</span></span>
          <span>${money(l.unit_price * l.qty)}</span>
        </div>`)}
      <div class="totals">
        <div class="totals__row"><span>Food subtotal</span><span>${money(order.subtotal)}</span></div>
        ${order.method === 'delivery'
          ? html`<div class="totals__row"><span>Delivery</span><span>${money(order.delivery_fee)}</span></div>` : ''}
        <div class="totals__row totals__row--grand"><span>Total owed</span><span>${money(order.total)}</span></div>
      </div>

      <h3 class="subhead">${order.method === 'pickup' ? 'Pickup' : 'Delivery'}</h3>
      ${order.method === 'pickup'
        ? html`<p><strong>${order.location_name}</strong><br>${order.location_addr}<br>
            Anytime ${order.pickup_window}</p>`
        : html`<p>${order.addr_line}${order.addr_unit ? `, ${order.addr_unit}` : ''}<br>
            ${order.postal_norm}<br>${settings.get('delivery_window')}</p>`}

      <h3 class="subhead">Paying</h3>
      ${order.payment_method
        ? html`<p><strong>You chose ${O.PAYMENT_LABEL(order.payment_method)}.</strong>
            Nothing has been charged — payment happens with Derek directly.</p>` : ''}
      <p>${settings.get('payment_instructions')}</p>
      ${/* The reference is asked for in the transfer message because the
            message is the one field that travels with the money and comes
            back out the other end. With it, the payment finds this order by
            itself; without it, somebody matches it up by hand later. */
        order.payment_method === 'etransfer'
        ? html`<div class="notice notice--strong">
            <strong>Put <code>${order.ref}</code> in the e-transfer message.</strong>
            That is what tells Derek which order the money is for. Send
            ${money(order.total)}.</div>` : ''}

      <p style="margin-top:var(--dbd-sp-5)"><a class="btn btn--secondary" href="/">Back to the menu</a></p>
    </div>
    ${L.allergenDisclaimer()}`;

  return L.page({ title: late ? 'Late request sent' : 'Order confirmed', body, url: '/' });
}

function emptyView(message) {
  return L.page({
    title: 'Nothing on the menu yet',
    body: html`<div class="card">
      <h1>Nothing on the menu yet</h1>
      <p>${message}</p>
      <p>${settings.get('owner_contact')}</p>
    </div>`,
  });
}

module.exports = { weekView, dayView, confirmationView, emptyView, STATE_LABEL };
