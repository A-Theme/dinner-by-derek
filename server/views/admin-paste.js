'use strict';
/**
 * What the pasted post says, before any of it is on the menu.
 *
 * This page is the whole safety margin of the paste feature, so it is built to
 * be read on a phone standing up: one card per line of the post, in the order
 * the post wrote them, every box big enough to correct with a thumb. Nothing on
 * it has been written yet and it says so twice.
 *
 * Every row carries its own indexed fields — r0_name, r0_slot and so on. See
 * the note in server/paste.js about why this is not four parallel arrays.
 */

const { html } = require('../html');
const { settings } = require('../db');
const T = require('../time');
const PASTE = require('../paste');
const V = require('./admin');

const tz = () => settings.get('timezone', 'America/Toronto');

/** The line under a row that says what it is about to write over. */
function occupantLine(week, row) {
  if (!row.slot) return '';
  const held = PASTE.occupantOf(week, row.slot);
  const where = PASTE.labelOfSlot(week, row.slot);
  if (held === 'closed') {
    return html`<p class="also"><strong>${where} is marked closed.</strong> Nothing will be
      put on it until you reopen it further down the week page.</p>`;
  }
  if (held) {
    return html`<p class="also">${where} currently has <strong>${held}</strong>. Saving
      this replaces it.</p>`;
  }
  return html`<p class="also">${where} has nothing on it yet.</p>`;
}

/** The one control that decides where a row lands. */
function slotPicker(week, i, row) {
  const dayOption = (wd) => {
    const date = PASTE.dateOfSlot(week, wd);
    const held = PASTE.occupantOf(week, wd);
    const state = held === 'closed' ? 'closed' : (held || 'nothing yet');
    return html`<option value="${wd}"${row.slot === wd ? ' selected' : ''}>${T.WEEKDAY_LABELS[wd]},
      ${T.fmtMonthDay(date, tz())} — ${state}</option>`;
  };
  return html`
    <label for="r${i}_slot">Where it goes</label>
    <select id="r${i}_slot" name="r${i}_slot">
      <option value=""${row.slot ? '' : ' selected'}>Nowhere — leave this one off</option>
      <optgroup label="A day of the week">
        ${T.WEEKDAYS_MON_FIRST.map(dayOption)}
      </optgroup>
      <optgroup label="The whole week">
        ${PASTE.WEEK_SLOTS.map((s) => html`<option value="${s}"${row.slot === s ? ' selected' : ''}>${PASTE.SLOT_LABELS[s]}${(() => {
          const held = PASTE.occupantOf(week, s);
          return held ? ` — ${held}` : ' — nothing yet';
        })()}</option>`)}
      </optgroup>
    </select>`;
}

function rowCard(week, i, row) {
  return html`
    <div class="card paste-row">
      <input type="hidden" name="r${i}_kind" value="${row.kind}">
      <input type="hidden" name="r${i}_full_label" value="${row.full_label}">
      <input type="hidden" name="r${i}_single_label" value="${row.single_label}">

      <div class="paste-use">
        <label>
          <input type="checkbox" name="r${i}_use" value="1"${row.use ? ' checked' : ''}>
          <span>Put this on the week</span>
        </label>
      </div>

      ${row.note ? html`<p class="also">${row.note}</p>` : ''}

      ${slotPicker(week, i, row)}
      ${occupantLine(week, row)}

      <label for="r${i}_name">Dish name</label>
      <input type="text" id="r${i}_name" name="r${i}_name" value="${row.name}">

      <label for="r${i}_description">Description</label>
      <textarea id="r${i}_description" name="r${i}_description" rows="3">${row.description}</textarea>

      <div class="stack2">
        <div>
          <label for="r${i}_full_price">${row.full_label} price</label>
          <input type="text" id="r${i}_full_price" name="r${i}_full_price" inputmode="decimal"
            value="${row.full_price != null ? (row.full_price / 100).toFixed(2) : ''}"
            placeholder="Blank = don't offer it">
        </div>
        <div>
          <label for="r${i}_single_price">${row.single_label} price</label>
          <input type="text" id="r${i}_single_price" name="r${i}_single_price" inputmode="decimal"
            value="${row.single_price != null ? (row.single_price / 100).toFixed(2) : ''}"
            placeholder="Blank = don't offer it">
        </div>
      </div>
    </div>`;
}

/** The box that takes the post again, for a re-read after an edit. */
function reReadForm(week, text) {
  return html`
    <details class="daycard-edit">
      <summary>Change the text and read it again</summary>
      <form method="post" action="/admin/week/${week.id}/paste">
        <p class="also">Reading it again throws away the corrections above and starts over from
          this text. Nothing on the week is touched either way.</p>
        <label for="reread">Derek's post</label>
        <textarea id="reread" name="post" rows="10">${text}</textarea>
        <button class="btn btn--secondary btn--block" type="submit">Read it again</button>
      </form>
    </details>`;
}

function pastePage({ week, rows, text }) {
  const weekStart = week.week_start || T.mondayOnOrAfter(T.todayIn(tz()));
  const body = html`
    <h1>What the post says</h1>
    <p class="also">Draft week of ${T.fmtDayShort(weekStart, tz())} to
      ${T.fmtDayShort(T.addDays(weekStart, 6), tz())} — ${week.title}</p>

    ${week.status === 'published' ? html`
      <div class="notice notice--strong"><strong>This week is live.</strong> Customers are
        looking at it now. Anything put on it arrives unreviewed, and an unreviewed dish is not
        shown — so replacing a day here takes that day off the menu until you tick its allergen
        box. Move the week back to draft first if you would rather they didn't see the gap.</div>` : ''}

    ${rows.length ? html`
      <div class="notice notice--strong">
        <strong>Nothing has been written yet.</strong> This is what the post was read as.
        Fix anything that came out wrong, untick anything you don't want, then use the button
        at the bottom. Every dish that lands arrives with <strong>no allergen tags and no
        review</strong> — the week cannot publish until you have ticked each one by hand on
        the week page.
      </div>

      <p class="also">Derek's weeks run Sunday to Wednesday and this page runs Monday to Sunday,
        so check the date on each row before you save — a Sunday dish lands on the Sunday at the
        <em>end</em> of this draft unless you move it or move the week's start date.</p>

      <form method="post" action="/admin/week/${week.id}/paste/apply">
        <input type="hidden" name="rows" value="${rows.length}">
        ${rows.map((row, i) => rowCard(week, i, row))}
        <button class="btn btn--primary btn--block" type="submit">Put these on the week</button>
      </form>
      <p class="also" style="margin-top:var(--dbd-sp-3)">Or
        <a href="/admin/week?id=${week.id}">go back to the week</a> and change nothing.</p>`
    : html`
      <div class="notice notice--strong">
        <strong>Nothing was read out of that.</strong> Nothing has been written, and the week is
        exactly as you left it. The reader wants Derek's own lines — <em>Monday - chicken
        Milanese with side pasta salad $50</em> and the rest of them, one to a line. A copied
        post usually carries the header and the comments with it; those are ignored, but a post
        pasted as a single unbroken paragraph has no day lines in it to find.
      </div>
      <p><a class="btn btn--secondary btn--block" href="/admin/week?id=${week.id}">Back to the week</a></p>`}

    ${reReadForm(week, text)}`;

  return V.shell({ title: 'What the post says', body, current: 'week' });
}

module.exports = { pastePage };
