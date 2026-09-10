'use strict';

/** Saved Dishes, Recipes, Other Options, and Menu History. */

const { html, raw } = require('../../html');
const C = require('../constants');
const L = require('../lib');
const St = require('../store');
const V = require('./layout');

const BASE = V.BASE;

/* =========================== SAVED DISHES =============================== */

function dishesPage(d, q) {
  const sort = ['name', 'used', 'recent', 'price'].includes(q.sort) ? q.sort : 'name';
  const kind = C.KINDS.includes(q.kind) ? q.kind : '';

  let list = d.dishes.filter((x) => !kind || x.kind === kind);
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name),
    used: (a, b) => (b.used_count || 0) - (a.used_count || 0) || a.name.localeCompare(b.name),
    recent: (a, b) => String(b.saved_at).localeCompare(String(a.saved_at)) || a.name.localeCompare(b.name),
    price: (a, b) => ((b.full_price || b.single_price || 0) - (a.full_price || a.single_price || 0))
      || a.name.localeCompare(b.name),
  };
  list = list.slice().sort(cmp[sort]);

  const counts = {};
  for (const k of C.KINDS) counts[k] = d.dishes.filter((x) => x.kind === k).length;

  const recipeFor = new Map(d.recipes.filter((r) => r.dish_id).map((r) => [r.dish_id, r]));

  const kindTab = (value, label, n) => html`<a
    class="btn ${kind === value ? 'btn--primary' : 'btn--secondary'}"
    href="${BASE}/dishes?kind=${value}&sort=${sort}">${label} (${n})</a>`;

  const body = html`
    <h1>Saved dishes</h1>
    ${V.flash(q)}
    <p class="also">Everything worth cooking again. Mains go on a day; soups, salads and desserts
      go on the week. Saving something already here writes over it, so the list stays the length
      of what you cook rather than the length of what you have cooked.</p>

    <form method="get" action="${BASE}/dishes" class="card no-print">
      <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)" data-coach="kinds">
        ${kindTab('', 'All', d.dishes.length)}
        ${C.KINDS.map((k) => kindTab(k, C.KIND_LABELS[k], counts[k]))}
      </div>
      <div class="dl-row" data-coach="sort">
        <input type="hidden" name="kind" value="${kind}">
        <label style="flex:1 1 220px">Sort by
          <select name="sort">
            ${Object.keys(C.SORT_LABELS).map((k) => html`<option value="${k}"${sort === k ? ' selected' : ''}>${C.SORT_LABELS[k]}</option>`)}
          </select>
        </label>
        <button class="btn btn--secondary" type="submit">Sort</button>
      </div>
    </form>

    <div class="notice" data-coach="notice">
      <strong>Allergen reviews are not saved with a dish.</strong> Putting one on a day brings
      back its description, prices, photo and tags, but the review box comes back unticked every
      time — the tick says you have checked this dish for the menu it is going on, and that is
      not something a recipe can carry with it.
    </div>

    ${list.length ? html`
      <table class="dtable">
        <thead><tr><th>Dish</th>${kind ? '' : html`<th>Kind</th>`}<th>Sizes</th><th>Recipe</th><th>Used</th><th></th></tr></thead>
        <tbody>${list.map((x, i) => html`<tr>
          <td data-label="Dish"><strong>${x.name}</strong>
            ${x.description ? html`<br><span class="variant__label">${x.description}</span>` : ''}</td>
          ${kind ? '' : html`<td data-label="Kind">${C.KIND_LABELS[x.kind] || x.kind}</td>`}
          <td data-label="Sizes">
            ${x.full_on && x.full_price != null ? html`${x.full_label} ${L.money(x.full_price)}` : ''}
            ${x.single_on && x.single_price != null ? html`<br>${x.single_label} ${L.money(x.single_price)}` : ''}</td>
          <td data-label="Recipe">${recipeFor.has(x.id)
            ? html`<a href="${BASE}/recipes/${recipeFor.get(x.id).slug}">${recipeFor.get(x.id).name}</a>`
            : html`<a class="variant__label" href="${BASE}/recipes/new">Write one</a>`}</td>
          <td data-label="Used">${x.used_count === 0 ? 'not yet' : `${x.used_count}×`}</td>
          <td data-label="">${V.confirmForm({
            action: `${BASE}/dishes/${x.id}/delete`,
            buttonLabel: 'Remove',
            message: `Remove "${x.name}" from your saved dishes? Days already using it keep what they have.`,
            coachKey: i === 0 ? 'remove' : '',
          })}</td>
        </tr>`)}</tbody>
      </table>`
      : html`<div class="card"><p>Nothing saved under that heading yet.</p></div>`}`;

  return { title: 'Saved dishes', body, current: 'dishes' };
}

/* ============================== RECIPES ================================= */

function recipesListPage(d, q) {
  const category = C.RECIPE_CATEGORIES.includes(q.category) ? q.category : '';
  const search = String(q.q || '').trim().slice(0, 80).toLowerCase();

  const tagCounts = new Map();
  for (const r of d.recipes) {
    if (category && r.category !== category) continue;
    for (const t of r.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const tag = tagCounts.has(q.tag) ? String(q.tag) : '';

  let list = d.recipes.filter((r) => (!category || r.category === category)
    && (!tag || (r.tags || []).includes(tag))
    && (!search || r.name.toLowerCase().includes(search)
      || String(r.summary || '').toLowerCase().includes(search)));
  list = list.slice().sort((a, b) => a.name.localeCompare(b.name));

  const catTab = (value, label) => html`<a
    class="btn ${category === value ? 'btn--primary' : 'btn--secondary'}"
    href="${BASE}/recipes${value ? `?category=${value}` : ''}${tag ? `${value ? '&' : '?'}tag=${tag}` : ''}">${label}</a>`;

  const body = html`
    <h1>Recipes</h1>
    ${V.flash(q)}
    <p class="also">The kitchen's own documents. Customers never see any of this.</p>

    <form method="get" action="${BASE}/recipes" class="card no-print">
      <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)" data-coach="filters">
        ${catTab('', 'All')}
        ${C.RECIPE_CATEGORIES.map((c) => catTab(c, c[0].toUpperCase() + c.slice(1) + 's'))}
      </div>
      ${tagCounts.size ? html`<p>${[...tagCounts.entries()].sort().map(([t, n]) => html`<a
        class="btn ${tag === t ? 'btn--primary' : 'btn--secondary'}"
        href="${BASE}/recipes?category=${category}&tag=${tag === t ? '' : t}">${t} (${n})</a> `)}</p>` : ''}
      <div class="dl-row">
        <input type="hidden" name="category" value="${category}">
        <input type="hidden" name="tag" value="${tag}">
        <label style="flex:1 1 220px">Search
          <input type="search" name="q" value="${q.q || ''}" placeholder="Name or summary"></label>
        <button class="btn btn--secondary" type="submit" style="align-self:flex-end">Search</button>
        <a class="btn btn--primary" href="${BASE}/recipes/new" style="align-self:flex-end"
          data-coach="new">Write a new one</a>
      </div>
    </form>

    ${list.length ? html`
      <table class="dtable">
        <thead><tr><th>Recipe</th><th>Category</th><th>Makes</th><th>Built on</th></tr></thead>
        <tbody>${list.map((r) => {
          const parent = r.parent_id ? St.byId(d.recipes, r.parent_id) : null;
          return html`<tr>
            <td data-label="Recipe"><strong><a href="${BASE}/recipes/${r.slug}">${r.name}</a></strong>
              ${r.summary ? html`<br><span class="variant__label">${r.summary}</span>` : ''}</td>
            <td data-label="Category">${r.category}</td>
            <td data-label="Makes">${r.yield_qty != null ? `${r.yield_qty} ${r.yield_unit || ''}` : '—'}</td>
            <td data-label="Built on">${parent
              ? html`<a href="${BASE}/recipes/${parent.slug}">${parent.name}</a>` : '—'}</td>
          </tr>`;
        })}</tbody>
      </table>`
      : html`<div class="card"><p>Nothing here yet. <a href="${BASE}/recipes/new">Write one</a>.</p></div>`}`;

  return { title: 'Recipes', body, current: 'recipes' };
}

function recipeDetailPage(d, recipe, factor, q) {
  const kids = d.recipes.filter((r) => r.parent_id === recipe.id);
  const dish = recipe.dish_id ? St.byId(d.dishes, recipe.dish_id) : null;
  const scale = (n) => (n == null ? null : Math.round(n * factor * 100) / 100);

  const allergenText = [
    recipe.name,
    ...(recipe.ingredients || []).map((i) => i.text),
  ].join('\n');
  const suggestions = L.detect(allergenText, d.allergenTerms);

  const groups = new Map();
  for (const i of recipe.ingredients || []) {
    const g = i.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  }

  const scaleLink = (f, label) => html`<a
    class="btn ${factor === f ? 'btn--primary' : 'btn--secondary'}"
    href="${BASE}/recipes/${recipe.slug}${f === 1 ? '' : `?x=${f}`}">${label}</a>`;

  const body = html`
    <p class="also"><a href="${BASE}/recipes">← All recipes</a></p>
    <h1>${recipe.name}</h1>
    ${V.flash(q)}
    ${recipe.summary ? html`<p>${recipe.summary}</p>` : ''}
    ${(recipe.tags || []).length ? html`<p>${recipe.tags.map((t) => html`<a
      class="btn btn--secondary" href="${BASE}/recipes?tag=${t}">${t}</a> `)}</p>` : ''}

    <div class="card">
      <p>
        ${recipe.yield_qty != null ? html`Makes <strong>${scale(recipe.yield_qty)} ${recipe.yield_unit || ''}</strong>` : ''}
        ${recipe.portions != null ? html` · <strong>${Math.round(recipe.portions * factor)}</strong> portions` : ''}
        ${dish ? html`<br><span class="variant__label">On the menu as
          <a href="${BASE}/dishes?kind=${dish.kind}">${dish.name}</a></span>` : ''}
      </p>
      <div class="dl-row" data-coach="scale">
        ${scaleLink(0.5, 'Half')}${scaleLink(1, 'As written')}${scaleLink(2, 'Double')}${scaleLink(3, 'Triple')}
      </div>
      ${factor !== 1 ? html`<p class="notice">Showing this recipe at ${factor}×.
        The recipe itself has not been changed.</p>` : ''}
      <p class="no-print"><button type="button" class="btn btn--primary" data-print>Print this recipe</button></p>
    </div>

    <div class="card">
      <h2>Ingredients</h2>
      ${[...groups.entries()].map(([g, items]) => html`
        ${g ? html`<h3>${g}</h3>` : ''}
        <ul>${items.map((i) => html`<li>${i.qty != null ? `${scale(i.qty)} ${i.unit || ''} ` : ''}${i.text}
          ${i.sub_slug ? html` <a class="variant__label" href="${BASE}/recipes/${i.sub_slug}">(recipe)</a>` : ''}</li>`)}</ul>`)}
    </div>

    <div class="card">
      <h2>Method</h2>
      <ol>${(recipe.steps || []).map((s) => html`<li>${s.text}</li>`)}</ol>
    </div>

    ${recipe.notes ? html`<div class="card"><h2>Notes</h2><p>${recipe.notes}</p></div>` : ''}

    ${kids.length ? html`<div class="card">
      <h2>Built on this</h2>
      <ul>${kids.map((k) => html`<li><a href="${BASE}/recipes/${k.slug}">${k.name}</a>
        ${k.summary ? html`<span class="variant__label"> — ${k.summary}</span>` : ''}</li>`)}</ul>
    </div>` : ''}

    <div class="notice">
      <strong>What this recipe would suggest on a menu.</strong>
      ${suggestions.length
        ? html`Reading its ingredients, the allergen dictionary finds
            ${suggestions.map((s, i) => html`${i ? ', ' : ''}<strong>${s.allergen}</strong>`)}.
            That is a prompt, not a tag. Nothing here has been applied to any dish and no review
            box has been ticked. When you put a dish on a day, review it there.`
        : html`The allergen dictionary finds nothing in this one. That is not a clearance — it
            only knows the words in its dictionary, and a dish still has to be reviewed on the
            day it goes out.`}
    </div>

    <div class="dl-row no-print" data-coach="link">
      <a class="btn btn--secondary" href="${BASE}/recipes/${recipe.slug}/edit">Edit</a>
      ${V.confirmForm({
        action: `${BASE}/recipes/${recipe.id}/delete`,
        buttonLabel: 'Delete this recipe',
        message: `Delete "${recipe.name}"? Recipes built on it keep their own text.`,
      })}
    </div>`;

  return { title: recipe.name, body, current: 'recipes' };
}

function recipeEditorPage(d, recipe, error, q) {
  const r = recipe || {};
  const isNew = !r.id;
  const ingredientText = (r.ingredients || [])
    .map((i) => `${i.qty != null ? `${i.qty} ${i.unit || ''} ` : ''}${i.text}`.trim())
    .join('\n');
  const stepText = (r.steps || []).map((s) => s.text).join('\n\n');

  const body = html`
    <p class="also"><a href="${BASE}/recipes${r.slug ? `/${r.slug}` : ''}">← Back</a></p>
    <h1>${isNew ? 'Write a recipe' : `Edit ${r.name}`}</h1>
    ${V.flash(q)}
    ${error ? html`<div class="notice notice--strong">${error}</div>` : ''}

    <form method="post" action="${isNew ? `${BASE}/recipes` : `${BASE}/recipes/${r.id}`}" class="card">
      <label for="rname">Name</label>
      <input type="text" id="rname" name="name" value="${r.name || ''}" required maxlength="120" data-proof>

      <label for="rsum">Summary</label>
      <input type="text" id="rsum" name="summary" value="${r.summary || ''}" maxlength="240" data-proof>

      <div class="stack2">
        <div><label for="rcat">Category</label>
          <select id="rcat" name="category">
            ${C.RECIPE_CATEGORIES.map((c) => html`<option value="${c}"${r.category === c ? ' selected' : ''}>${c}</option>`)}
          </select></div>
        <div><label for="rport">Portions</label>
          <input type="number" id="rport" name="portions" value="${r.portions == null ? '' : r.portions}"></div>
      </div>

      <div class="stack2">
        <div><label for="ryq">Makes</label>
          <input type="number" step="any" id="ryq" name="yield_qty" value="${r.yield_qty == null ? '' : r.yield_qty}"></div>
        <div><label for="ryu">Unit</label>
          <input type="text" id="ryu" name="yield_unit" value="${r.yield_unit || ''}" maxlength="20" placeholder="ml, g, ea"></div>
      </div>

      <label for="rdish">On the menu as</label>
      <select id="rdish" name="dish_id" class="dish-picker">
        <option value="">Not linked to a saved dish</option>
        ${d.dishes.map((x) => html`<option value="${x.id}"${Number(r.dish_id) === x.id ? ' selected' : ''}>${x.name}</option>`)}
      </select>

      <label for="rparent">Built on</label>
      <select id="rparent" name="parent_id">
        <option value="">Not a variation</option>
        ${d.recipes.filter((x) => x.id !== r.id).map((x) => html`<option value="${x.id}"${Number(r.parent_id) === x.id ? ' selected' : ''}>${x.name}</option>`)}
      </select>

      <label for="rtags">Tags <span class="variant__label">(comma separated)</span></label>
      <input type="text" id="rtags" name="tags" value="${(r.tags || []).join(', ')}">

      <label for="ring">Ingredients <span class="variant__label">(one a line, e.g. "500 g onion, peeled")</span></label>
      <textarea id="ring" name="ingredients" rows="10" data-proof>${ingredientText}</textarea>

      <label for="rsteps">Method <span class="variant__label">(a blank line between steps)</span></label>
      <textarea id="rsteps" name="steps" rows="12" data-proof>${stepText}</textarea>

      <label for="rnotes">Notes</label>
      <textarea id="rnotes" name="notes" rows="3" data-proof>${r.notes || ''}</textarea>

      <button class="btn btn--primary" type="submit">${isNew ? 'Save recipe' : 'Save changes'}</button>
      <a class="btn btn--secondary" href="${BASE}/recipes${r.slug ? `/${r.slug}` : ''}">Cancel</a>
    </form>`;

  return { title: isNew ? 'Write a recipe' : `Edit ${r.name}`, body, current: 'recipes' };
}

/* =========================== OTHER OPTIONS ============================== */

function otherOptionsPage(d, q) {
  const editing = q.edit ? St.byId(d.standing, q.edit) : null;
  const saved = q.saved === '1';
  const savedState = editing ? St.review(d, editing) : null;

  const blank = {
    name: '', subcategory: 'Mains', description: '', allergens: [], dismissed: [],
    availability: 'every_service_day', weekdays: [], full_on: 1, active: 1,
    ack: 0, ack_of: null, halal: 0, photo: null, single_photo: null,
    full_label: d.settings.full_label, full_price: null, full_cap: null,
    single_on: 0, single_label: d.settings.single_label, single_price: null, single_cap: null,
  };

  const body = html`
    <h1>Other Options</h1>
    ${V.flash(q)}
    <p class="also" data-coach="live">These stay on the menu week after week. You never retype them.
      Changes here reach customers <strong>immediately</strong> — there is no publish step.</p>

    <table class="dtable">
      <thead><tr><th>Item</th><th>Available</th><th>Prices</th><th>Status</th><th></th></tr></thead>
      <tbody>
      ${d.standing.map((i, idx) => {
        const wd = i.availability === 'every_service_day' ? 'Every service day'
          : (L.jsonArr(i.weekdays).map((w) => L.weekdayLabel(w).slice(0, 3)).join(", ") || 'No days set');
        const prices = [
          i.full_on && i.full_price != null ? `${i.full_label} ${L.money(i.full_price)}` : null,
          i.single_on && i.single_price != null ? `${i.single_label} ${L.money(i.single_price)}` : null,
        ].filter(Boolean).join(' · ') || '—';
        return html`<tr>
          <td data-label="Item"><strong>${i.name}</strong><br>
            <span class="variant__label">${C.subcategoryLabel(i.subcategory)}</span></td>
          <td data-label="Available">${wd}</td>
          <td data-label="Prices">${prices}</td>
          <td data-label="Status">
            ${i.active ? V.reviewFlag(d, i, i.name) : html`<span class="flag flag--warn">Hidden from customers</span>`}</td>
          <td data-label=""${idx === 0 ? raw(' data-coach="rowactions"') : ''}>
            <a class="btn btn--secondary" href="${BASE}/other-options?edit=${i.id}">Edit</a>
            <form method="post" action="${BASE}/other-options/${i.id}/duplicate" style="display:inline">
              <button class="btn btn--secondary" type="submit">Duplicate</button></form>
            ${V.confirmForm({
              action: `${BASE}/other-options/${i.id}/toggle`,
              buttonLabel: i.active ? 'Hide' : 'Show',
              message: i.active
                ? `Hide "${i.name}" from the customer menu right now? Orders that already include it stay exactly as they are.`
                : `Put "${i.name}" back on the customer menu right now?`,
            })}
          </td></tr>`;
      })}
      </tbody>
    </table>

    <div class="card" style="margin-top:var(--dbd-sp-5)" data-coach="editor">
      <h2>${editing ? `Edit ${editing.name}` : 'Add an item'}</h2>
      ${saved && editing ? html`
        <div class="card card--warn" style="margin-bottom:var(--dbd-sp-4)">
          <strong>Saved.</strong>
          ${savedState.ok
            ? html` These are the prices customers see now.`
            : html` ${L.reviewMessage(editing.name, savedState)}
              <br><strong>Until that is done this item stays off the customer menu</strong>, at any price.`}
          <br><span class="variant__label">Stored just now:
            ${editing.full_on && editing.full_price != null
              ? html`${editing.full_label} ${L.money(editing.full_price)}` : 'no full size'}${
              editing.single_on && editing.single_price != null
                ? html` · ${editing.single_label} ${L.money(editing.single_price)}` : ''}</span>
        </div>` : ''}
      ${editing ? html`<div class="notice notice--strong">
        Saving changes here updates what customers see straight away, including on the week
        that's already published.</div>` : ''}

      <form method="post" action="${BASE}/other-options${editing ? `/${editing.id}` : ''}"
        data-confirm="${editing ? 'Save these changes? They appear on the live customer menu immediately. Orders already placed keep the name and price they had when they were ordered.' : 'Add this item to the live menu?'}">
        ${V.itemEditor(d, { prefix: 'si', item: editing || blank, nameLabel: 'Item name' })}

        <label for="sub">Section</label>
        <select id="sub" name="si_subcategory">
          ${C.SUBCATEGORY_ORDER.map((s) => html`<option value="${s}"${(editing ? editing.subcategory : 'Mains') === s ? ' selected' : ''}>${C.subcategoryLabel(s)}</option>`)}
        </select>

        <fieldset data-coach="availability">
          <legend>When it's available</legend>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="radio" name="si_availability" value="every_service_day" style="width:22px;height:22px"
              ${(editing ? editing.availability : 'every_service_day') === 'every_service_day' ? ' checked' : ''}>
            Every service day</label>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="radio" name="si_availability" value="weekdays" style="width:22px;height:22px"
              ${editing && editing.availability === 'weekdays' ? ' checked' : ''}>
            Only certain days</label>
          <div style="margin-top:var(--dbd-sp-2)">
          ${C.WEEKDAYS.map((w) => {
            const on = editing ? L.jsonArr(editing.weekdays).includes(w) : false;
            return html`<label style="display:inline-flex;gap:var(--dbd-sp-2);align-items:center;margin-right:var(--dbd-sp-4)">
              <input type="checkbox" name="si_weekdays" value="${w}" style="width:22px;height:22px"${on ? ' checked' : ''}>
              ${C.WEEKDAY_LABELS[w].slice(0, 3)}</label>`;
          })}</div>
        </fieldset>

        <button class="btn btn--primary" type="submit">${editing ? 'Save changes' : 'Add item'}</button>
        ${editing ? html`<a class="btn btn--secondary" href="${BASE}/other-options">Cancel</a>` : ''}
      </form>
    </div>`;

  return { title: 'Other Options', body, current: 'other' };
}

/* ============================ MENU HISTORY ============================== */

function historyPage(d, q) {
  const rows = d.serviceDays.slice()
    .sort((a, b) => b.service_date.localeCompare(a.service_date));

  const groups = new Map();
  for (const r of rows) {
    const week = St.byId(d.weeks, r.week_id);
    const monday = L.mondayOf(r.service_date);
    if (!groups.has(monday)) groups.set(monday, []);
    const adrift = week && week.week_start
      && (r.service_date < week.week_start || r.service_date >= L.addDays(week.week_start, 7));
    groups.get(monday).push({ ...r, week, adrift });
  }

  const thisMonday = L.mondayOf(L.today());

  const body = html`
    <h1>Menu history</h1>
    ${V.flash(q)}
    <p class="also" data-coach="history">Every service day that has ever been written down,
      newest first, grouped by the week the date falls in. Nothing here can be edited — the
      current week is edited in <a href="${BASE}/week">This Week</a>.</p>

    ${groups.size ? [...groups.entries()].map(([monday, days]) => html`
      <div class="card card--tight">
        <h2>${L.fmtWeekRange(monday)}${monday === thisMonday
          ? html` <span class="flag flag--ok">This week</span>` : ''}</h2>
        <table class="dtable dtable--tight">
          <thead><tr><th>Day</th><th>Dish</th><th></th></tr></thead>
          <tbody>
            ${days.map((x) => {
              /* No whitespace inside the last cell, so a day with nothing to
                 flag renders `<td data-label=""></td>` and the phone
                 stylesheet can drop it with :empty. Same shape as the real
                 screen — see the note in routes/admin2.js. */
              const marks = html`${x.week && x.week.status === 'published' ? html`<span class="variant__label">published</span>` : ''}${x.adrift ? html`<span class="flag flag--warn">Not on ${x.week.title}</span>` : ''}`;
              const dish = x.closed
                ? html`<em>Kitchen closed</em>`
                : (x.dish_name && x.dish_name.trim() ? x.dish_name : html`<em>No dish</em>`);
              return html`<tr><td data-label="Day">${L.fmtDayShort(x.service_date)}</td><td data-label="Dish">${dish}</td><td data-label="">${marks}</td></tr>`;
            })}
          </tbody>
        </table>
      </div>`)
      : html`<div class="card"><p>No service days have been written down yet.</p></div>`}`;

  return { title: 'Menu history', body, current: 'history' };
}

module.exports = {
  dishesPage, recipesListPage, recipeDetailPage, recipeEditorPage,
  otherOptionsPage, historyPage,
};
