'use strict';
const { html, raw, money } = require('../html');
const { settings } = require('../db');
const config = require('../config');
const T = require('../time');
const M = require('../menu');
const A = require('../allergens');
const P = require('../publish');
const DISH = require('../dishes');
const V = require('./admin');

const tz = () => settings.get('timezone', 'America/Toronto');

function weekPage({ week, days, items, hasPrevious }) {
  // Ordered by how often each has run, so the dishes Derek actually cooks sit
  // at the top of a list that is now hundreds long.
  const saved = DISH.all({ sort: 'used' });
  const savedOf = (kind) => saved.filter((d) => d.kind === kind);
  // A day takes a main and nothing else. Handing it the whole list would offer
  // "Cream of Broccoli" as Tuesday's featured dish at a family-dinner price.
  const savedMains = savedOf('main');

  /* The seven boxes, worked out once. The single dish picker above them needs
     to name every day and say what is on it, and the boxes themselves need the
     same rows, so neither can own the loop. */
  const dayRows = T.WEEKDAYS_MON_FIRST.map((wd, offset) => {
    const date = T.addDays(week.week_start || T.mondayOf(T.todayIn(tz())), offset);
    const existing = days.find((d) => d.service_date === date);
    const stub = {
      dish_name: '', description: '', allergens: '[]', dismissed: '[]', ack: 0, ack_of: null,
      photo: null, halal: 0, full_on: 1, full_label: '', full_price: null, full_cap: null,
      single_on: 0, single_label: '', single_price: null, single_cap: null, daily_cap: null,
      closed: 0, closed_note: '',
    };
    return { wd, date, existing, item: existing || stub };
  });
  const published = week.status === 'published';
  const cutoffHour = settings.getInt('cutoff_hour', 22);
  const cutoffMin = settings.getInt('cutoff_minute', 0);
  const lateHour = settings.getInt('late_cutoff_hour', 6);
  const lateMin = settings.getInt('late_cutoff_minute', 0);
  const weekStart = week.week_start || T.mondayOf(T.todayIn(tz()));
  const globalCap = M.featuredCapFor({});   // null when the setting is 0

  /* One blank to fall back on, so an empty slot renders the same boxes a
     filled one does. */
  const blank = (kind) => ({
    kind, weekdays: '["tue","wed","thu"]', allergens: '[]', dismissed: '[]', full_on: 1,
  });
  /* Two soups and two salads, one dessert — M.WEEK_SLOT_COUNTS is the authority
     on how many, so adding a third soup is a number there and nothing here. */
  const slotRows = (kind, label, subject, list) => M.slotsOf(kind).map((n) => ({
    kind,
    slot: n,
    // Slot 1 keeps the bare field prefix it has always had, so nothing that was
    // already typed into a form changes name underneath it.
    prefix: n === 1 ? kind : `${kind}${n}`,
    label: M.WEEK_SLOT_COUNTS[kind] > 1 ? `${label} ${n}` : label,
    subject: M.WEEK_SLOT_COUNTS[kind] > 1 ? `${subject} ${n}` : subject,
    item: list[n - 1] || blank(kind),
  }));
  const weekRows = [
    ...slotRows('soup', 'Soup', 'The soup', items.soups || []),
    ...slotRows('salad', 'Salad', 'The salad', items.salads || []),
    ...slotRows('dessert', 'Dessert', 'The dessert', items.dessert ? [items.dessert] : []),
  ];
  // Monday, because that is what it is called. It is a row of checkboxes like
  // any other level-2 item and can be moved, but nothing should have to be
  // ticked for the ordinary week.
  const meatless = items.meatless || { kind: 'meatless', weekdays: '["mon"]', allergens: '[]', dismissed: '[]', full_on: 1 };

  const body = html`
    <h1>This Week</h1>
    <p><span class="flag ${published ? 'flag--ok' : 'flag--warn'}">
      ${published ? 'Published — customers can see this' : 'Draft — customers cannot see this'}</span>
      ${week.closed ? html` <span class="flag flag--stop">Closed for the week</span>` : ''}</p>
    ${week.closed ? html`<div class="notice notice--strong"><strong>This week is marked closed.</strong>
      ${published ? 'Customers are being told the kitchen is shut for these dates and can order nothing on them.'
        : 'Once published, customers will be told the kitchen is shut for these dates.'}
      Anything filled in below is kept, but none of it is shown. Reopen it at the bottom of this page.</div>` : ''}

    <!-- 0. Derek's post, pasted.
         First on the page because it is the fastest way to fill the whole week,
         and because it is the only one of these that works standing in a kitchen
         with a phone. Everything below it still does what it did.

         THE BOX IS AN INPUT AND HAS TO LOOK LIKE ONE. It first shipped labelled
         "Derek's post" with a greyed-out sample menu behind it and a button
         reading "Read it", and it was read as a box that would fill itself —
         the owner tapped the button on an empty box and reported that nothing
         appeared. Nothing was going to: there is no path from here to Facebook,
         which is the entire reason this is a paste box. So the steps are on the
         card, the label is an instruction, the placeholder says what to do
         instead of showing fake content, and the button says what it reads.
         Same mistake the photo dropzone made when it said "Tap to choose a
         photo" above the camera button. -->
    <div class="card">
      <h2>Put this week's menu in</h2>
      <p class="also">This copies Derek's Facebook post across. It does not fetch anything —
        you copy it, you paste it, and it reads what you pasted.</p>
      <ol class="paste-steps">
        <li>Open the <strong>Dinner by Derek</strong> page on Facebook and find this week's
          menu post.</li>
        <li>Tap <strong>See more</strong> if the post is cut short — the menu is usually
          below the fold.</li>
        <li>Press and hold the post, then <strong>Copy</strong>.</li>
        <li>Press and hold the box below, then <strong>Paste</strong>.</li>
        <li>Tap <strong>Read what I pasted</strong>.</li>
      </ol>
      <form method="post" action="/admin/week/${week.id}/paste">
        <label for="post">Paste Derek's post here</label>
        <textarea id="post" name="post" rows="8"
          placeholder="Paste the whole post — the day lines, the prices, the soups, the salads and the dessert. Anything else in it is ignored."></textarea>
        <button class="btn btn--primary btn--block" type="submit">Read what I pasted</button>
      </form>
      <p class="also">The next page shows what it made of the post — every day, price and
        name in a box you can correct. <strong>Nothing goes on the week until you confirm
        it there.</strong> Dishes arrive with no allergen tags and no review, however they
        got here, so they still need ticking below before the week can publish.</p>
    </div>

    ${hasPrevious ? html`
      <form method="post" action="/admin/week/duplicate" data-confirm="This copies last week's menu into a brand new draft with the dates moved forward seven days. Your standing Other Options are not touched. Closed days are not copied. Every dish will need its allergen review again before you can publish.">
        <button class="btn btn--primary btn--block" type="submit">Duplicate last week</button>
      </form>
      <p class="also" style="margin-bottom:var(--dbd-sp-5)">Copies the dishes, soup, salad, prices and photos. Resets every allergen review.
        Closures aren't copied — a day you were shut last week opens again in the new one.</p>` : ''}

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
        <textarea id="wdesc" name="description" rows="3" data-proof>${week.description}</textarea>
        <input type="hidden" name="week_image" value="${week.image || ''}">
        <button class="btn btn--secondary" type="submit">Save description</button>
        <span class="saveflag" data-saveflag></span>
      </form>
    </div>

    <!-- 2. One box per day -->
    <div class="card">
      <h2>This week's days</h2>
      <p class="also">Fill in whichever days you're cooking. Leave a day blank to skip it quietly, or tick
        <em>Closed</em> to say so out loud on the menu. A pickup-window override for just that day, and
        removing it, are below in Day details once it has a name.</p>
      <!-- One picker for the whole week, not one per box.
           It used to sit inside every weekday box, which drew the entire saved
           list seven times: 2,600-odd options and a quarter of a megabyte of
           HTML for a control that is used once or twice a week. The day it
           lands on is a field beside it instead. -->
      <div class="dl-row" style="align-items:flex-end;margin-bottom:var(--dbd-sp-4)">
        <label style="flex:1 1 210px">Put a saved dish on
          <select name="wd" form="usedish"${savedMains.length ? '' : ' disabled'}>
            ${dayRows.map((r) => html`<option value="${r.wd}">${T.WEEKDAY_LABELS[r.wd]},
              ${T.fmtMonthDay(r.date, tz())} — ${r.item.closed
                ? 'closed'
                : (r.item.dish_name || 'nothing yet')}</option>`)}
          </select></label>
        <label style="flex:2 1 260px">Dish
          <select name="dish_id" form="usedish"${savedMains.length ? '' : ' disabled'}>
            ${savedMains.length
              ? html`<option value="">Choose a saved dish…</option>
                  ${savedMains.map((s) => html`<option value="${s.id}">${s.name}${s.used_count ? ` — ${s.used_count}×` : ''}</option>`)}`
              : html`<option>No saved dishes yet</option>`}
          </select></label>
        <button class="btn btn--secondary" type="submit" form="usedish"${savedMains.length ? '' : ' disabled'}>Use it</button>
      </div>
      ${savedMains.length ? '' : html`
        <p class="also" style="margin-bottom:var(--dbd-sp-4)">Nothing saved yet.
          Use <strong>Save "…" to my dishes</strong> inside a day once it has a name on it,
          or publish a week — every featured dish on it is filed here automatically.</p>`}

      <form method="post" action="/admin/week/${week.id}/weekdays" data-autosave>
        ${dayRows.map(({ wd, date, existing, item }) => {
          return html`
          <!-- Open only while the day is still empty, so a week in progress
               shows the boxes still wanting something and keeps the finished
               ones out of the way. The Save and Load controls sit inside, so
               they are a tap behind the summary rather than on the page — the
               trade the owner asked for, a clean page over a visible button. -->
          <details class="daycard-edit"${existing && (existing.dish_name || existing.closed) ? '' : ' open'}>
            <summary>${T.WEEKDAY_LABELS[wd]}, ${T.fmtMonthDay(date, tz())}
              — ${item.closed ? 'closed' : (item.dish_name || 'nothing yet')}
              ${existing && !item.closed ? V.reviewFlag(item, item.dish_name || 'This dish') : ''}
              ${item.closed ? html`<span class="flag flag--warn">Closed</span>` : ''}</summary>

            <!-- One wrapper so the phone can reorder what's in it. It is a
                 plain block on a desktop and this order is what shows there;
                 below the breakpoint it becomes a flex column and the dish
                 comes first, because that is the part filled in every week. -->
            <div class="daybox">

              <!-- The two settings a day rarely needs, together in one
                   disclosure. A desktop opens it and hides its summary, so it
                   reads as the two plain blocks it always was; a phone gets one
                   line it can leave shut. -->
              <details class="day-rare">
                <summary>Closed this day, and how many to make</summary>
                <fieldset>
                  <legend>Cooking this day?</legend>
                  <label style="display:flex;gap:var(--dbd-sp-3);align-items:center">
                    <input type="checkbox" name="${wd}_closed" value="1" style="width:22px;height:22px"${item.closed ? ' checked' : ''}>
                    <span><strong>Closed — not cooking this day.</strong> Customers see the day marked
                      closed and can order nothing on it, not even the standing Other Options.</span>
                  </label>
                  <label for="cn_${wd}">Note for customers (optional)</label>
                  <input type="text" id="cn_${wd}" name="${wd}_closed_note" maxlength="200" data-proof
                    value="${item.closed_note || ''}" placeholder="e.g. Back on Thursday">
                </fieldset>
                <label for="cap_${wd}">How many this day (both sizes together)</label>
                <input type="number" id="cap_${wd}" name="${wd}_daily_cap" min="0" step="1"
                  value="${item.daily_cap == null ? '' : item.daily_cap}"
                  placeholder="Blank = the usual ${globalCap === null ? 'no limit' : globalCap}">
              </details>

              <!-- The Save button belongs to the day it sits under but posts to
                   its own route, so it is associated by its form attribute with
                   the little form at the foot of the page — the weekday boxes are
                   one big form and HTML has no nested ones.

                   Loading a saved dish is NOT here: that control is one picker
                   above all seven boxes. -->
              ${V.itemEditor({ prefix: wd, item, nameLabel: 'Featured dish' })}
              ${item.dish_name && item.dish_name.trim() ? html`
                <p class="day-save"><button class="btn btn--secondary" type="submit" form="savedish-${wd}">
                  Save "${item.dish_name}" to my dishes</button></p>` : ''}
            </div>
          </details>`;
        })}
        <button class="btn btn--primary" type="submit">Save this week's days</button>
        <span class="saveflag" data-saveflag></span>
      </form>

      <!-- The targets of the form attributes above. Empty on purpose: the
           selects and the buttons carry the values.

           One "use" form for the week, because there is one picker; still one
           "save" per day, because that button names the dish sitting in its
           own box. -->
      <form method="post" action="/admin/week/${week.id}/dish/use" id="usedish"></form>
      ${T.WEEKDAYS_MON_FIRST.map((wd) => html`
        <form method="post" action="/admin/week/${week.id}/dish/${wd}/save" id="savedish-${wd}"></form>`)}
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

    <!-- 3. Meatless Monday — a second main, entered once for the week -->
    <div class="card">
      <h2>Meatless Monday ${V.reviewFlag(meatless, 'The meatless dish')}</h2>
      <p class="also">A second main, entered once for the whole week and shown beside Monday's
        featured dish rather than under Other Options. It keeps its own price and its own daily
        ceiling — selling out of one does not close the other.</p>
      <p class="also">Leave the name blank for a week it isn't running. Nothing is shown, and
        nothing blocks publishing.</p>

      <!-- Picked from the mains, because that is what it is. The same dish is
           filed once whether it ran under a Meatless heading or not. -->
      <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
        <label style="flex:1 1 200px">Put a saved main here
          <select name="dish_id" form="use-meatless"${savedMains.length ? '' : ' disabled'}>
            ${savedMains.length
              ? html`<option value="">Choose a saved main…</option>
                  ${savedMains.map((d) => html`<option value="${d.id}">${d.name}${d.used_count ? ` — ${d.used_count}×` : ''}</option>`)}`
              : html`<option>No saved mains yet</option>`}
          </select>
        </label>
        <button class="btn btn--secondary" type="submit" form="use-meatless"${savedMains.length ? '' : ' disabled'}>Use it</button>
      </div>

      <form method="post" action="/admin/week/${week.id}/meatless" data-autosave>
        ${V.itemEditor({ prefix: 'meatless', item: meatless, nameLabel: 'Meatless dish name', showWeekdays: true })}
        <button class="btn btn--secondary" type="submit">Save meatless dish</button>
        <span class="saveflag" data-saveflag></span>
      </form>

      ${meatless && meatless.name && meatless.name.trim() ? html`
        <p style="margin-top:var(--dbd-sp-3)"><button class="btn btn--secondary" type="submit" form="keep-meatless">
          Keep "${meatless.name}" on the saved list</button></p>` : ''}

      <form method="post" action="/admin/week/${week.id}/meatless/use" id="use-meatless"></form>
      <form method="post" action="/admin/week/${week.id}/meatless/save" id="keep-meatless"></form>
    </div>

    <!-- 4. Soup & salad of the week -->
    <div class="card">
      <h2>Soups, salads &amp; dessert of the week</h2>
      <p class="also">Entered once for the whole week. Two soups, two salads and a dessert —
        Derek offers a choice of two, and each one is its own litre on the menu. Any of them can
        be left blank and simply won't be shown. They default to Tuesday, Wednesday and Thursday.</p>
      <div class="stack2">
        ${weekRows.map(({ kind, slot, prefix, label, subject, item }) => {
          const list = savedOf(kind);
          return html`
        <div>
          <h3 class="subhead">${label} of the week ${V.reviewFlag(item, subject)}</h3>

          <!-- Pull one off the saved list. Ordered by how often it has run, so
               the soups Derek actually makes are at the top of a long list. -->
          <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
            <label style="flex:1 1 200px">Put a saved ${kind} here
              <select name="dish_id" form="use-${prefix}"${list.length ? '' : ' disabled'}>
                ${list.length
                  ? html`<option value="">Choose a saved ${kind}…</option>
                      ${list.map((d) => html`<option value="${d.id}">${d.name}${d.used_count ? ` — ${d.used_count}×` : ''}</option>`)}`
                  : html`<option>No saved ${kind}s yet</option>`}
              </select>
            </label>
            <button class="btn btn--secondary" type="submit" form="use-${prefix}"${list.length ? '' : ' disabled'}>Use it</button>
          </div>

          <form method="post" action="/admin/week/${week.id}/${kind}" data-autosave>
            <input type="hidden" name="slot" value="${slot}">
            ${V.itemEditor({ prefix, item, nameLabel: `${label} name`, showWeekdays: true })}
            <button class="btn btn--secondary" type="submit">Save ${label.toLowerCase()}</button>
            <span class="saveflag" data-saveflag></span>
          </form>

          ${item && item.name && item.name.trim() ? html`
            <p style="margin-top:var(--dbd-sp-3)"><button class="btn btn--secondary" type="submit" form="keep-${prefix}">
              Keep "${item.name}" on the saved list</button></p>` : ''}

          <!-- The slot rides in the body of these too: they are the forms the
               buttons above belong to, and an empty one would mean slot 1. -->
          <form method="post" action="/admin/week/${week.id}/${kind}/use" id="use-${prefix}">
            <input type="hidden" name="slot" value="${slot}"></form>
          <form method="post" action="/admin/week/${week.id}/${kind}/save" id="keep-${prefix}">
            <input type="hidden" name="slot" value="${slot}"></form>
        </div>`;
        })}
      </div>
    </div>

    <!-- 5. Service day details: pickup override, and removing a day -->
    <h2>Day details</h2>
    <p class="also" style="margin-bottom:var(--dbd-sp-4)">A pickup-window override for just this day, and
      removing a day, for whichever days have a name above. Name, description, photo, halal and price are
      all edited in the box above — this is not a second copy of them.</p>
    ${days.length ? days.map((d) => {
      const cutoff = T.cutoffFor(d.service_date, cutoffHour, cutoffMin, tz());
      const win = M.pickupWindowFor(d);
      return html`
      <details class="daycard-edit"${d.dish_name || d.closed ? '' : ' open'}>
        <summary>${T.fmtDayLong(d.service_date, tz())} — ${d.closed ? 'closed' : (d.dish_name || 'no dish yet')}
          &nbsp;${d.closed ? html`<span class="flag flag--warn">Closed</span>` : V.reviewFlag(d, d.dish_name || 'This dish')}</summary>

        <p class="also">Also available that day: ${M.alsoAvailableLine(week, d)}</p>
        <p class="variant__label">Orders close ${T.fmtLocal(cutoff, tz(), { weekday: 'long', month: 'short', day: 'numeric' })}
           · Late requests until ${T.fmtLocal(T.lateCutoffFor(d.service_date, lateHour, lateMin, tz()), tz())}
           that morning, then nothing
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

    <!-- 6. Closing the whole week -->
    <div class="card">
      <h2>Closing the whole week</h2>
      <p class="also">For a week you're away, or not cooking at all. Customers see one clear message
        instead of a menu, and nothing on these dates can be ordered — including the standing Other
        Options. It still publishes like any other week${week.status === 'published' ? ', and this one is live, so the change is visible the moment you save it' : ', on the same schedule, and needs no allergen review'}.</p>
      ${week.closed ? html`
        <p><span class="flag flag--stop">Closed — this week is shut</span></p>` : ''}
      <form method="post" action="/admin/week/${week.id}/closed">
        <label for="wclosednote">Note for customers (optional)</label>
        <input type="text" id="wclosednote" name="closed_note" maxlength="200" data-proof
          value="${week.closed_note || ''}" placeholder="e.g. Away for a wedding — back the following Monday">
        ${week.closed
          ? html`<button class="btn btn--primary" type="submit" name="closed" value="0">Reopen this week</button>
                 <button class="btn btn--secondary" type="submit" name="closed" value="1">Save the note</button>`
          : html`<button class="btn btn--secondary" type="submit" name="closed" value="1">Close the whole week</button>`}
      </form>
    </div>

    <!-- Preview + publish -->
    <div class="card">
      <h2>Preview and publish</h2>
      <p class="also">The preview shows exactly what a customer sees, with all three levels merged.</p>
      <p><a class="btn btn--secondary" href="/w/${week.slug}" target="_blank" rel="noopener">Open customer preview</a></p>

      ${published ? html`
        <p><strong>Share link</strong><br>
          <code>${config.baseUrl}/w/${week.slug}</code>
          <button class="btn btn--secondary" type="button"
            data-copy="${config.baseUrl}/w/${week.slug}" data-copied="Link copied.">Copy</button></p>
        <h3 class="subhead">Cutoffs</h3>
        <ul>${days.map((d) => html`<li>${T.fmtDayShort(d.service_date, tz())} — closes
          ${T.fmtLocal(T.cutoffFor(d.service_date, cutoffHour, cutoffMin, tz()), tz(), { weekday: 'long' })}
          <button class="btn btn--secondary" type="button"
            data-copy="${config.baseUrl}/w/${week.slug}/${d.service_date}"
            data-copied="Day link copied.">Copy link</button></li>`)}</ul>
        ${V.confirmForm({
          action: `/admin/week/${week.id}/unpublish`,
          buttonLabel: 'Move back to draft',
          message: 'This hides the whole week from customers straight away. Orders already placed are kept. Your standing Other Options stay live.',
        })}`
      : html`
        ${(() => {
          const at = P.scheduledFor(week);
          const stopped = P.blockers(week.id);
          if (!at) {
            return html`<p class="also">This week has no automatic publish time — either the
              schedule is off in Settings, this week is set not to publish itself, or it has no
              start date yet. Publish it by hand below whenever it's ready.</p>`;
          }
          return html`
            <div class="notice${stopped.length ? ' notice--strong' : ''}">
              <strong>Goes live by itself
                ${T.fmtLocal(at, tz(), { weekday: 'long', month: 'long', day: 'numeric' })}.</strong>
              ${stopped.length ? html`<br>
                As things stand it will be <strong>refused</strong> — ${stopped.length}
                item${stopped.length === 1 ? '' : 's'} still need${stopped.length === 1 ? 's' : ''}
                an allergen review. Nothing will be published and you'll get an email. Finish the
                reviews and it goes out on its own.
                <ul>${stopped.map((b) => html`<li>${b}</li>`)}</ul>`
                : week.closed
                  ? html`<br>It will go out as a <strong>closed</strong> week — customers will be told
                      the kitchen is shut for these dates. A closed week needs no allergen review.`
                  : html`<br>Everything on it has been reviewed, so it will publish.`}
            </div>
            <form method="post" action="/admin/week/${week.id}/auto-publish">
              <input type="hidden" name="auto_publish" value="0">
              <button class="btn btn--secondary" type="submit">Don't publish this week automatically</button>
            </form>`;
        })()}
        ${week.auto_publish ? '' : html`
          <form method="post" action="/admin/week/${week.id}/auto-publish">
            <input type="hidden" name="auto_publish" value="1">
            <button class="btn btn--secondary" type="submit">Let this week publish on schedule</button>
          </form>`}
        ${V.confirmForm({
          action: `/admin/week/${week.id}/publish`,
          buttonLabel: 'Publish this week now',
          message: 'This makes the week visible to customers immediately and retires the previous week. Your standing Other Options are not affected.',
          kind: 'primary',
        })}`}
    </div>

    <div class="card">
      <h2>Share on Facebook</h2>
      <p><a class="btn btn--secondary" href="/admin/facebook/preview/${week.id}">Preview the post</a></p>
    </div>`;

  return V.shell({ title: 'This Week', body, current: 'week' });
}

module.exports = { weekPage };
