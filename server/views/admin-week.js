'use strict';
const { html, raw, money } = require('../html');
const { settings } = require('../db');
const config = require('../config');
const T = require('../time');
const M = require('../menu');
const A = require('../allergens');
const V = require('./admin');

const tz = () => settings.get('timezone', 'America/Toronto');

function weekPage({ week, days, items, hasPrevious }) {
  const published = week.status === 'published';
  const cutoffHour = settings.getInt('cutoff_hour', 22);
  const cutoffMin = settings.getInt('cutoff_minute', 0);
  const weekStart = week.week_start || T.mondayOf(T.todayIn(tz()));
  const globalCap = M.featuredCapFor({});   // null when the setting is 0

  const soup = items.soup || { kind: 'soup', weekdays: '["tue","wed","thu"]', allergens: '[]', dismissed: '[]', full_on: 1 };
  const salad = items.salad || { kind: 'salad', weekdays: '["tue","wed","thu"]', allergens: '[]', dismissed: '[]', full_on: 1 };

  const body = html`
    <h1>This Week</h1>
    <p><span class="flag ${published ? 'flag--ok' : 'flag--warn'}">
      ${published ? 'Published — customers can see this' : 'Draft — customers cannot see this'}</span></p>

    ${hasPrevious ? html`
      <form method="post" action="/admin/week/duplicate" data-confirm="This copies last week's menu into a brand new draft with the dates moved forward seven days. Your standing Other Options are not touched. Every dish will need its allergen review again before you can publish.">
        <button class="btn btn--primary btn--block" type="submit">Duplicate last week</button>
      </form>
      <p class="also" style="margin-bottom:var(--dbd-sp-5)">Copies the dishes, soup, salad, prices and photos. Resets every allergen review.</p>` : ''}

    <!-- 1. Week basics -->
    <div class="card">
      <h2>Week basics</h2>
      <p class="also"><strong>Title:</strong> ${week.title}</p>
      <form method="post" action="/admin/week/${week.id}/weekstart" class="dl-row" style="margin-bottom:var(--dbd-sp-4)">
        <div style="flex:1 1 160px">
          <label for="wstart">Week starts (Monday)</label>
          <input type="date" id="wstart" name="week_start" value="${weekStart}">
        </div>
        <button class="btn btn--secondary" type="submit" style="align-self:flex-end">Move the boxes below</button>
      </form>
      <p class="also" style="margin-bottom:var(--dbd-sp-4)">Changing this only moves which dates the boxes below point
        at — days you've already filled in stay exactly as they are.</p>

      <form method="post" action="/admin/week/${week.id}/basics" data-autosave>
        <label for="wdesc">Description</label>
        <p class="also">A short blurb for customers. A good place for reminders — that Chili, Pulled Pork,
          BBQ Brisket and Pulled Chicken are always available under Other Options, for instance.</p>
        <textarea id="wdesc" name="description" rows="3">${week.description}</textarea>
        <input type="hidden" name="week_image" value="${week.image || ''}">
        <button class="btn btn--secondary" type="submit">Save description</button>
        <span class="saveflag" data-saveflag></span>
      </form>
    </div>

    <!-- 2. One box per day -->
    <div class="card">
      <h2>This week's days</h2>
      <p class="also">Fill in whichever days you're cooking. Leave a day blank to skip it. A pickup-window
        override for just that day, and removing it, are below in Day details once it has a name.</p>
      <form method="post" action="/admin/week/${week.id}/weekdays" data-autosave>
        ${T.WEEKDAYS_MON_FIRST.map((wd, offset) => {
          const date = T.addDays(weekStart, offset);
          const existing = days.find((d) => d.service_date === date);
          const stub = {
            dish_name: '', description: '', allergens: '[]', dismissed: '[]', ack: 0, ack_of: null,
            photo: null, halal: 0, full_on: 1, full_label: '', full_price: null, full_cap: null,
            single_on: 0, single_label: '', single_price: null, single_cap: null, daily_cap: null,
          };
          const item = existing || stub;
          return html`
          <details class="daycard-edit"${existing && existing.dish_name ? '' : ' open'}>
            <summary>${T.WEEKDAY_LABELS[wd]}, ${T.fmtMonthDay(date, tz())}
              — ${item.dish_name || 'nothing yet'}
              ${existing ? V.reviewFlag(item, item.dish_name || 'This dish') : ''}</summary>
            ${V.itemEditor({ prefix: wd, item, nameLabel: 'Featured dish' })}
            <label for="cap_${wd}">How many this day (both sizes together)</label>
            <input type="number" id="cap_${wd}" name="${wd}_daily_cap" min="0" step="1"
              value="${item.daily_cap == null ? '' : item.daily_cap}"
              placeholder="Blank = the usual ${globalCap === null ? 'no limit' : globalCap}">
          </details>`;
        })}
        <button class="btn btn--primary" type="submit">Save this week's days</button>
        <span class="saveflag" data-saveflag></span>
      </form>
    </div>

    <details class="daycard-edit" style="margin-bottom:var(--dbd-sp-5)">
      <summary>Need a date outside this week?</summary>
      <form method="post" action="/admin/week/${week.id}/dates">
        <p class="also">For a one-off date that doesn't fit the boxes above — a holiday pop-up, say.</p>
        <div class="dl-row">
          <input type="date" name="dates" style="flex:1 1 160px">
          <button class="btn btn--secondary" type="submit">Add day</button>
        </div>
      </form>
    </details>

    <!-- 3. Soup & salad of the week -->
    <div class="card">
      <h2>Soup &amp; salad of the week</h2>
      <p class="also">Entered once for the whole week. One soup, one salad — either can be left blank.
        They default to Tuesday, Wednesday and Thursday.</p>
      <div class="stack2">
        <div>
          <h3 class="subhead">Soup of the week ${V.reviewFlag(soup, 'The soup')}</h3>
          <form method="post" action="/admin/week/${week.id}/soup" data-autosave>
            ${V.itemEditor({ prefix: 'soup', item: soup, nameLabel: 'Soup name', showWeekdays: true })}
            <button class="btn btn--secondary" type="submit">Save soup</button>
            <span class="saveflag" data-saveflag></span>
          </form>
        </div>
        <div>
          <h3 class="subhead">Salad of the week ${V.reviewFlag(salad, 'The salad')}</h3>
          <form method="post" action="/admin/week/${week.id}/salad" data-autosave>
            ${V.itemEditor({ prefix: 'salad', item: salad, nameLabel: 'Salad name', showWeekdays: true })}
            <button class="btn btn--secondary" type="submit">Save salad</button>
            <span class="saveflag" data-saveflag></span>
          </form>
        </div>
      </div>
    </div>

    <!-- 4. Service day details: pickup override, and removing a day -->
    <h2>Day details</h2>
    <p class="also" style="margin-bottom:var(--dbd-sp-4)">A pickup-window override for just this day, and
      removing a day, for whichever days have a name above. Name, description, photo, halal and price are
      all edited in the box above — this is not a second copy of them.</p>
    ${days.length ? days.map((d) => {
      const cutoff = T.cutoffFor(d.service_date, cutoffHour, cutoffMin, tz());
      const win = M.pickupWindowFor(d);
      return html`
      <details class="daycard-edit"${d.dish_name ? '' : ' open'}>
        <summary>${T.fmtDayLong(d.service_date, tz())} — ${d.dish_name || 'no dish yet'}
          &nbsp;${V.reviewFlag(d, d.dish_name || 'This dish')}</summary>

        <p class="also">Also available that day: ${M.alsoAvailableLine(week, d)}</p>
        <p class="variant__label">Orders close ${T.fmtLocal(cutoff, tz(), { weekday: 'long', month: 'short', day: 'numeric' })}
           · Pickup ${T.fmtWindow(win.start, win.end)}</p>

        <form method="post" action="/admin/week/${week.id}/day/${d.id}" data-autosave>
          <fieldset>
            <legend>Just for this day (optional)</legend>
            <div class="stack2">
              <div>
                <label for="ps${d.id}">Pickup starts</label>
                <input type="time" id="ps${d.id}" name="pickup_start" value="${d.pickup_start || ''}">
              </div>
              <div>
                <label for="pe${d.id}">Pickup ends</label>
                <input type="time" id="pe${d.id}" name="pickup_end" value="${d.pickup_end || ''}">
              </div>
            </div>
            <label for="do${d.id}">Delivery</label>
            <select id="do${d.id}" name="delivery_override">
              <option value=""${d.delivery_on === null ? ' selected' : ''}>Same as usual</option>
              <option value="1"${d.delivery_on === 1 ? ' selected' : ''}>Delivering this day</option>
              <option value="0"${d.delivery_on === 0 ? ' selected' : ''}>Pickup only this day</option>
            </select>
          </fieldset>
          <button class="btn btn--primary" type="submit">Save ${T.fmtDayShort(d.service_date, tz())}</button>
          <span class="saveflag" data-saveflag></span>
        </form>

        ${V.confirmForm({
          action: `/admin/week/${week.id}/day/${d.id}/delete`,
          buttonLabel: 'Remove this day',
          message: `Remove ${T.fmtDayLong(d.service_date, tz())} and its featured dish from this week? Orders already placed for that day are kept.`,
        })}
      </details>`;
    }) : html`<div class="card"><p>No service days yet. Add one above.</p></div>`}

    <!-- Preview + publish -->
    <div class="card">
      <h2>Preview and publish</h2>
      <p class="also">The preview shows exactly what a customer sees, with all three levels merged.</p>
      <p><a class="btn btn--secondary" href="/w/${week.slug}" target="_blank" rel="noopener">Open customer preview</a></p>

      ${published ? html`
        <p><strong>Share link</strong><br>
          <code>${config.baseUrl}/w/${week.slug}</code>
          <button class="btn btn--secondary" type="button"
            onclick="navigator.clipboard.writeText('${config.baseUrl}/w/${week.slug}');window.dbdToast('Link copied.')">Copy</button></p>
        <h3 class="subhead">Cutoffs</h3>
        <ul>${days.map((d) => html`<li>${T.fmtDayShort(d.service_date, tz())} — closes
          ${T.fmtLocal(T.cutoffFor(d.service_date, cutoffHour, cutoffMin, tz()), tz(), { weekday: 'long' })}
          <button class="btn btn--secondary" type="button"
            onclick="navigator.clipboard.writeText('${config.baseUrl}/w/${week.slug}/${d.service_date}');window.dbdToast('Day link copied.')">Copy link</button></li>`)}</ul>
        ${V.confirmForm({
          action: `/admin/week/${week.id}/unpublish`,
          buttonLabel: 'Move back to draft',
          message: 'This hides the whole week from customers straight away. Orders already placed are kept. Your standing Other Options stay live.',
        })}`
      : V.confirmForm({
          action: `/admin/week/${week.id}/publish`,
          buttonLabel: 'Publish this week',
          message: 'This makes the week visible to customers immediately and retires the previous week. Your standing Other Options are not affected.',
          kind: 'primary',
        })}
    </div>

    <div class="card">
      <h2>Share on Facebook</h2>
      <p><a class="btn btn--secondary" href="/admin/facebook/preview/${week.id}">Preview the post</a></p>
    </div>`;

  return V.shell({ title: 'This Week', body, current: 'week' });
}

module.exports = { weekPage };
