'use strict';

/** This Week, the paste preview, and the Facebook post screen. */

const { html, raw } = require('../../html');
const C = require('../constants');
const L = require('../lib');
const St = require('../store');
const V = require('./layout');

const BASE = V.BASE;

/* A sample post to prime the paste box, so the trainee has something to paste
   without having to invent a week's menu first. This is what Derek's Saturday
   post looks like. */
const SAMPLE_POST = `Menu for next week!

Monday - Chicken and Leek Pie $18 / meal for one $11
Tuesday - Aloo Gobi (veg) $16 / $10
Wednesday - Beef Bourguignon $21 / $13
Sunday - Roast Chicken Dinner $19.50 / $12

Soup of the week: Carrot and Coriander $12 / $7
Dessert: Sticky Toffee Pudding $9 / $6

Order by 10pm the night before. E-transfer to orders@example.invalid`;

function weekPage(d, week, q) {
  const days = St.serviceDaysOf(d, week.id);
  const weekStart = week.week_start;
  const published = week.status === 'published';
  const savedMains = d.dishes.filter((x) => x.kind === 'main');
  const blockers = St.blockers(d, week.id);
  const scheduled = St.scheduledFor(d, week);

  /* One box per weekday, Monday first, each showing whatever is on its date. */
  const dayFor = (offset) => {
    const date = L.addDays(weekStart, offset);
    const row = days.find((x) => x.service_date === date);
    return { date, row };
  };

  const emptyItem = {
    name: '', description: '', allergens: [], dismissed: [], ack: 0, ack_of: null,
    full_on: 1, full_label: d.settings.full_label, full_price: null, full_cap: null,
    single_on: 0, single_label: d.settings.single_label, single_price: null, single_cap: null,
    halal: 0, photo: null, single_photo: null,
  };

  const body = html`
    <h1>This week</h1>
    ${V.flash(q)}

    <p class="also">${week.title} — <strong>${published ? 'published' : 'draft'}</strong>${
      week.closed ? html` · <span class="flag flag--stop">closed</span>` : ''}.
      ${published
        ? 'Customers can see this now. Changes you save go out immediately.'
        : 'Customers cannot see this yet.'}</p>

    <!-- Put the menu in -->
    <div class="card" data-coach="paste">
      <h2>Put this week's menu in</h2>
      <p class="also">Paste the post you wrote for Facebook. The app reads the days, the dishes
        and the prices out of it and shows you what it found — nothing is written to the week
        until you check that page and press the button on it.</p>
      <form method="post" action="${BASE}/week/${week.id}/paste">
        <label for="post">Derek's post</label>
        <textarea id="post" name="post" rows="8">${SAMPLE_POST}</textarea>
        <button class="btn btn--primary btn--block" type="submit">Read what I pasted</button>
      </form>
    </div>

    <div class="card" data-coach="duplicate">
      <h2>Or start from last week</h2>
      <p class="also">Copies the most recent week into a new draft with the dates moved forward
        seven days. Standing items are untouched. Every allergen review is cleared.</p>
      <form method="post" action="${BASE}/week/duplicate"
        data-confirm="This copies last week's menu into a brand new draft with the dates moved forward seven days. Your standing Other Options are not touched. Every dish will need its allergen review again before you can publish.">
        <button class="btn btn--primary btn--block" type="submit">Duplicate last week</button>
      </form>
    </div>

    <!-- Week basics -->
    <div class="card">
      <h2>Week basics</h2>
      <form method="post" action="${BASE}/week/${week.id}/weekstart" class="dl-row"
        style="margin-bottom:var(--dbd-sp-4)" data-coach="weekstart">
        <label style="flex:1 1 200px">Week starts
          <input type="date" id="wstart" name="week_start" value="${weekStart}"></label>
        <button class="btn btn--secondary" type="submit" style="align-self:flex-end">Move the boxes below</button>
      </form>
      <form method="post" action="${BASE}/week/${week.id}/basics" data-autosave>
        <label for="wdesc">A line about the week <span class="variant__label">(optional)</span></label>
        <textarea id="wdesc" name="description" rows="3" data-proof>${week.description || ''}</textarea>
        <p class="variant__label" data-saveflag>Saved</p>
        <button class="btn btn--secondary" type="submit">Save description</button>
      </form>
    </div>

    <!-- The seven days -->
    <div class="card">
      <h2>This week's days</h2>
      <p class="also">One box per day. Fill in the ones you are cooking and leave the rest
        alone — an empty box is not a day.</p>

      <div class="dl-row" style="margin-bottom:var(--dbd-sp-4)" data-coach="usedish">
        <label style="flex:1 1 140px">Put a saved dish on
          <select name="wd" form="usedish"${savedMains.length ? '' : ' disabled'}>
            ${C.WEEKDAYS_MON_FIRST.map((wd) => html`<option value="${wd}">${C.WEEKDAY_LABELS[wd]}</option>`)}
          </select></label>
        <label style="flex:2 1 240px">Dish
          <select name="dish_id" form="usedish"${savedMains.length ? '' : ' disabled'}>
            ${savedMains.map((x) => html`<option value="${x.id}">${x.name}${x.used_count ? ` (${x.used_count}×)` : ''}</option>`)}
          </select></label>
        <button class="btn btn--secondary" type="submit" form="usedish"
          style="align-self:flex-end"${savedMains.length ? '' : ' disabled'}>Use it</button>
      </div>

      <form method="post" action="${BASE}/week/${week.id}/weekdays" data-autosave data-coach="days">
        ${C.WEEKDAYS_MON_FIRST.map((wd, offset) => {
          const { date, row } = dayFor(offset);
          const item = row || { ...emptyItem };
          const shown = { ...item, name: item.dish_name || '' };
          return html`
            <details class="day-box"${row && row.dish_name ? '' : ''}>
              <summary>${C.WEEKDAY_LABELS[wd]}, ${L.fmtMonthDay(date)}
                ${row && row.closed ? html` <span class="flag flag--stop">closed</span>`
                  : row && row.dish_name ? html` — ${row.dish_name} ${V.reviewFlag(d, row, row.dish_name)}`
                  : html` <span class="variant__label">— nothing yet</span>`}</summary>

              ${V.itemEditor(d, { prefix: wd, item: shown, nameLabel: 'Dish' })}

              <details>
                <summary>Closed this day, and how many to make</summary>
                <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
                  <input type="checkbox" name="${wd}_closed" value="1" style="width:22px;height:22px"${row && row.closed ? ' checked' : ''}>
                  The kitchen is shut this day</label>
                <label for="cn_${wd}">What to tell customers</label>
                <input type="text" id="cn_${wd}" name="${wd}_closed_note" maxlength="200" data-proof
                  value="${(row && row.closed_note) || ''}">
                <label for="cap_${wd}">How many of this dish to make</label>
                <input type="number" id="cap_${wd}" name="${wd}_daily_cap" min="0" step="1"
                  value="${row && row.daily_cap != null ? row.daily_cap : ''}"
                  placeholder="Blank uses the setting (${d.settings.featured_daily_cap})">
              </details>

              <p class="day-save"><button class="btn btn--secondary" type="submit" form="savedish-${wd}">
                Keep "${(row && row.dish_name) || 'this dish'}" on my saved list</button></p>
            </details>`;
        })}
        <button class="btn btn--primary" type="submit">Save this week's days</button>
      </form>

      <!-- The pickers post through forms that live outside the big one, so a
           nested form is never needed. Same trick the real page uses. -->
      <form method="post" action="${BASE}/week/${week.id}/dish/use" id="usedish"></form>
      ${C.WEEKDAYS_MON_FIRST.map((wd) => html`
        <form method="post" action="${BASE}/week/${week.id}/dish/${wd}/save" id="savedish-${wd}"></form>`)}
    </div>

    <details class="card">
      <summary>Need a date outside this week?</summary>
      <form method="post" action="${BASE}/week/${week.id}/dates">
        <p class="also">Adds a service day on a date the seven boxes above do not cover.</p>
        <div class="dl-row">
          <input type="date" name="dates" style="flex:1 1 160px">
          <button class="btn btn--secondary" type="submit">Add day</button>
        </div>
      </form>
    </details>

    <!-- Level 2: the week's own items -->
    <div class="card" data-coach="weekitems">
      <h2>Meatless Monday ${(() => {
        const it = St.weekItem(d, week.id, 'meatless', 1);
        return it ? V.reviewFlag(d, it, 'The meatless dish') : '';
      })()}</h2>
      ${weekItemBlock(d, week, 'meatless', 1, savedMains)}
    </div>

    <div class="card">
      <h2>Soups, salads &amp; dessert of the week</h2>
      <p class="also">These sit on the week rather than on one day, and each carries the days
        it is available on.</p>
      ${['soup', 'salad', 'dessert'].map((kind) => St.slotsOf(kind).map((slot) => {
        const it = St.weekItem(d, week.id, kind, slot);
        const label = C.WEEK_ITEM_SLOTS[kind].label;
        return html`
          <h3 class="subhead">${label} of the week${St.slotsOf(kind).length > 1 ? ` (${slot})` : ''}
            ${it ? V.reviewFlag(d, it, `The ${C.WEEK_ITEM_SLOTS[kind].noun}`) : ''}</h3>
          ${weekItemBlock(d, week, kind, slot, d.dishes.filter((x) => x.kind === C.WEEK_SLOTS[kind]))}`;
      }))}
    </div>

    <!-- Day details -->
    <div class="card" data-coach="daydetails">
      <h2>Day details</h2>
      <p class="also">The dish itself is edited in the boxes above. This is only for a day whose
        pickup or delivery is different from the usual.</p>
      ${days.length ? days.map((x) => html`
        <details>
          <summary>${L.fmtDayLong(x.service_date)} — ${x.closed ? 'closed' : (x.dish_name || 'no dish yet')}</summary>
          <form method="post" action="${BASE}/week/${week.id}/day/${x.id}" data-autosave>
            <div class="stack2">
              <div><label for="ps${x.id}">Pickup starts <span class="variant__label">(blank = usual)</span></label>
                <input type="time" id="ps${x.id}" name="pickup_start" value="${x.pickup_start || ''}"></div>
              <div><label for="pe${x.id}">Pickup ends</label>
                <input type="time" id="pe${x.id}" name="pickup_end" value="${x.pickup_end || ''}"></div>
            </div>
            <label for="do${x.id}">Delivery on this day</label>
            <select id="do${x.id}" name="delivery_override">
              <option value=""${x.delivery_on == null ? ' selected' : ''}>Use the usual setting</option>
              <option value="1"${x.delivery_on === 1 ? ' selected' : ''}>Yes, deliver</option>
              <option value="0"${x.delivery_on === 0 ? ' selected' : ''}>No delivery this day</option>
            </select>
            <p class="variant__label" data-saveflag>Saved</p>
            <button class="btn btn--primary" type="submit">Save ${L.fmtDayShort(x.service_date)}</button>
          </form>
          ${V.confirmForm({
            action: `${BASE}/week/${week.id}/day/${x.id}/delete`,
            buttonLabel: 'Remove this service day',
            message: `Remove ${L.fmtDayShort(x.service_date)} from this week? The dish on it goes with it.`,
          })}
        </details>`)
        : html`<p class="also">No service days yet. Fill a box above and save.</p>`}
    </div>

    <!-- Closing the week -->
    <div class="card" data-coach="closed">
      <h2>Closing the whole week</h2>
      <p class="also">A closed week is still published — it tells customers the kitchen is shut
        for these dates. Nothing is deleted.</p>
      <form method="post" action="${BASE}/week/${week.id}/closed">
        <label for="wclosednote">What to tell customers</label>
        <input type="text" id="wclosednote" name="closed_note" maxlength="200" data-proof
          value="${week.closed_note || ''}" placeholder="e.g. Back the following week — thank you!">
        ${week.closed
          ? html`<button class="btn btn--primary" type="submit" name="closed" value="0">Reopen this week</button>
                 <button class="btn btn--secondary" type="submit" name="closed" value="1">Save the note</button>`
          : html`<button class="btn btn--secondary" type="submit" name="closed" value="1">Close the whole week</button>`}
      </form>
    </div>

    <!-- Preview and publish -->
    <div class="card">
      <h2>Preview and publish</h2>

      ${published ? html`
        <p><strong>Share link</strong><br>
          <code>https://example.invalid/w/${week.slug}</code>
          <button class="btn btn--secondary" type="button"
            data-copy="https://example.invalid/w/${week.slug}" data-copied="Link copied.">Copy</button></p>
        <h3 class="subhead">Cutoffs</h3>
        <ul>${days.map((x) => html`<li>${L.fmtDayShort(x.service_date)} — closes
          ${L.fmtDayLong(L.addDays(x.service_date, -1))}
          <button class="btn btn--secondary" type="button"
            data-copy="https://example.invalid/w/${week.slug}/${x.service_date}"
            data-copied="Day link copied.">Copy link</button></li>`)}</ul>
        ${V.confirmForm({
          action: `${BASE}/week/${week.id}/unpublish`,
          buttonLabel: 'Move back to draft',
          message: 'This hides the whole week from customers straight away. Orders already placed are kept. Your standing Other Options stay live.',
        })}`
      : html`
        ${scheduled ? html`
          <div class="notice${blockers.length ? ' notice--strong' : ''}">
            <strong>Goes live by itself ${L.fmtDayLong(scheduled.date)} at ${scheduled.time}.</strong>
            ${blockers.length ? html`<br>
              As things stand it will be <strong>refused</strong> — ${blockers.length}
              item${blockers.length === 1 ? '' : 's'} still need${blockers.length === 1 ? 's' : ''}
              an allergen review. Nothing will be published and you'll get an email.
              <ul>${blockers.map((b) => html`<li>${b}</li>`)}</ul>`
              : week.closed
                ? html`<br>It will go out as a <strong>closed</strong> week.`
                : html`<br>Everything on it has been reviewed, so it will publish.`}
          </div>` : html`<p class="also">This week has no automatic publish time.</p>`}

        <div data-coach="autopublish">
          ${week.auto_publish ? html`
            <form method="post" action="${BASE}/week/${week.id}/auto-publish">
              <input type="hidden" name="auto_publish" value="0">
              <button class="btn btn--secondary" type="submit">Don't publish this week automatically</button>
            </form>`
          : html`
            <form method="post" action="${BASE}/week/${week.id}/auto-publish">
              <input type="hidden" name="auto_publish" value="1">
              <button class="btn btn--secondary" type="submit">Let this week publish on schedule</button>
            </form>`}
        </div>

        <div data-coach="publish">
          ${V.confirmForm({
            action: `${BASE}/week/${week.id}/publish`,
            buttonLabel: 'Publish this week now',
            message: 'This makes the week visible to customers immediately and retires the previous week. Your standing Other Options are not affected.',
            kind: 'primary',
          })}
        </div>`}
    </div>

    <div class="card">
      <h2>Share on Facebook</h2>
      <p><a class="btn btn--secondary" href="${BASE}/facebook/preview/${week.id}">Preview the post</a></p>
    </div>`;

  return { title: 'This Week', body, current: 'week' };
}

/** One level-2 slot: the picker, the editor, and the keep-it button. */
function weekItemBlock(d, week, kind, slot, list) {
  const it = St.weekItem(d, week.id, kind, slot) || {
    name: '', description: '', allergens: [], dismissed: [], ack: 0, ack_of: null,
    weekdays: kind === 'meatless' ? ['mon'] : ['tue', 'wed', 'thu'],
    full_on: 1, full_label: d.settings.full_label, full_price: null, full_cap: null,
    single_on: 0, single_label: d.settings.single_label, single_price: null, single_cap: null,
    halal: 0, photo: null, single_photo: null,
  };
  const prefix = slot === 1 ? kind : `${kind}${slot}`;
  const noun = C.WEEK_ITEM_SLOTS[kind].noun;

  return html`
    <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
      <label style="flex:2 1 240px">Use a saved ${C.KIND_LABELS[C.WEEK_SLOTS[kind]].toLowerCase().replace(/s$/, '')}
        <select name="dish_id" form="use-${prefix}"${list.length ? '' : ' disabled'}>
          ${list.map((x) => html`<option value="${x.id}">${x.name}</option>`)}
        </select></label>
      <button class="btn btn--secondary" type="submit" form="use-${prefix}"
        style="align-self:flex-end"${list.length ? '' : ' disabled'}>Use it</button>
    </div>

    <form method="post" action="${BASE}/week/${week.id}/${kind}" data-autosave>
      <input type="hidden" name="slot" value="${slot}">
      ${V.itemEditor(d, { prefix, item: it, nameLabel: 'Name', showWeekdays: true })}
      <p class="variant__label" data-saveflag>Saved</p>
      <button class="btn btn--secondary" type="submit">Save ${noun}</button>
    </form>

    <p style="margin-top:var(--dbd-sp-3)"><button class="btn btn--secondary" type="submit" form="keep-${prefix}">
      Keep "${it.name || `this ${noun}`}" on my saved list</button></p>

    <form method="post" action="${BASE}/week/${week.id}/${kind}/use" id="use-${prefix}">
      <input type="hidden" name="slot" value="${slot}"></form>
    <form method="post" action="${BASE}/week/${week.id}/${kind}/save" id="keep-${prefix}">
      <input type="hidden" name="slot" value="${slot}"></form>`;
}

/* ========================= THE PASTE PREVIEW ============================ */

function pastePage(d, week, rows, text, q) {
  const body = html`
    <h1>What I read in that post</h1>
    ${V.flash(q)}
    <p class="also">Nothing has been written to the week yet. Check each row, correct anything
      that came out wrong, untick anything you do not want, and press the button at the bottom.</p>

    <form method="post" action="${BASE}/week/${week.id}/paste/apply">
      <input type="hidden" name="rows" value="${rows.length}">
      ${rows.length ? rows.map((row, i) => html`
        <div class="card">
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="r${i}_use" value="1"${row.use ? ' checked' : ''}
              style="width:22px;height:22px">
            <strong>${row.where}</strong></label>
          <input type="hidden" name="r${i}_kind" value="${row.kind}">
          <input type="hidden" name="r${i}_slot" value="${row.slot || 1}">
          <input type="hidden" name="r${i}_wd" value="${row.wd || ''}">

          <label for="r${i}_name">Name</label>
          <input type="text" id="r${i}_name" name="r${i}_name" value="${row.name}">

          <label for="r${i}_description">Description</label>
          <textarea id="r${i}_description" name="r${i}_description" rows="3">${row.description}</textarea>

          <div class="stack2">
            <div><label for="r${i}_full_price">Full size price</label>
              <input type="text" id="r${i}_full_price" name="r${i}_full_price" inputmode="decimal"
                value="${row.full_price != null ? (row.full_price / 100).toFixed(2) : ''}"></div>
            <div><label for="r${i}_single_price">Meal for one price</label>
              <input type="text" id="r${i}_single_price" name="r${i}_single_price" inputmode="decimal"
                value="${row.single_price != null ? (row.single_price / 100).toFixed(2) : ''}"></div>
          </div>
          ${row.note ? html`<p class="variant__label">${row.note}</p>` : ''}
        </div>`)
        : html`<div class="card"><p>Nothing in that text looked like a day and a dish.
          Check it has lines like "Monday - Chicken Pie $18 / $11".</p></div>`}

      <div class="notice">
        <strong>Every dish put on the week this way arrives unreviewed.</strong> The app has read
        somebody's words, not checked a kitchen — so each one still needs its allergen review
        before the week can publish.
      </div>

      ${rows.length ? html`<button class="btn btn--primary btn--block" type="submit">Put these on the week</button>` : ''}
    </form>

    <div class="card">
      <h2>Read it again</h2>
      <form method="post" action="${BASE}/week/${week.id}/paste">
        <textarea id="reread" name="post" rows="10">${text}</textarea>
        <button class="btn btn--secondary btn--block" type="submit">Read it again</button>
      </form>
    </div>`;

  return { title: 'Reading the post', body, current: 'week' };
}

/* ========================= THE FACEBOOK POST ============================ */

function facebookPreviewPage(d, week, postText, q) {
  const conn = d.facebook;
  const body = html`
    <h1>Post to Facebook</h1>
    ${V.flash(q)}

    ${week.fb_post_id ? html`<div class="notice notice--strong">
      This week was already published to Facebook.
      <a href="${week.fb_post_url}">See the post</a>.</div>` : ''}

    <div class="card">
      <h2>What will be posted</h2>
      <pre style="white-space:pre-wrap;font-family:var(--dbd-body);background:var(--dbd-surface-sunk);
        padding:var(--dbd-sp-3);border-radius:var(--dbd-radius-sm)">${postText}</pre>
    </div>

    <div class="card">
      <h2>Post it yourself</h2>
      <p class="also">Works whether or not Facebook is connected. This is the only way to post
        into a group — Facebook blocked apps from doing that in April 2024.</p>
      <div class="dl-row">
        <button class="btn btn--primary" type="button"
          data-copy="${postText}" data-copied="Post text copied. Paste it into Facebook.">Copy post text</button>
      </div>
    </div>

    <div class="card">
      <h2>Publish to your Page</h2>
      ${conn ? html`
        <p>This posts to <strong>${conn.page_name}</strong> as ${conn.fb_user_name}.</p>
        ${V.confirmForm({
          action: `${BASE}/facebook/publish/${week.id}`,
          buttonLabel: week.fb_post_id ? 'Publish again' : 'Publish to Facebook',
          kind: 'primary',
          message: week.fb_post_id
            ? `This week is already on Facebook. Publish a second post to ${conn.page_name}?`
            : `Publish this menu to ${conn.page_name} now?`,
        })}
        <div class="tr-note">Nothing leaves this server. The post is written to the
          <a href="${BASE}/outbox">Outbox</a> so you can see what would have gone out.</div>`
      : html`<p>No Facebook Page is connected, so use "Copy post text" above.
          <a href="${BASE}/settings">Connect a Page in Settings</a> if you want one-tap publishing.</p>`}
    </div>`;

  return { title: 'Post to Facebook', body, current: 'week' };
}

module.exports = { weekPage, pastePage, facebookPreviewPage, SAMPLE_POST };
