'use strict';
const { html, raw } = require('../html');
const A = require('../allergens');
const R = require('../recipes');

/**
 * The recipe screens. Owner-facing, all of them.
 *
 * Nothing in this file has a customer counterpart and nothing it renders is
 * reachable from the public routes. That is a deliberate property of the
 * feature and not an accident of what has been built so far: a recipe is the
 * kitchen's working document, it names suppliers and shortcuts and quantities
 * that are nobody else's business, and the menu already says everything a
 * customer needs to hear about a dish.
 *
 * The one place recipe data touches customer-facing work is the allergen
 * readout on the detail page, and it touches it as a suggestion the owner has
 * to act on -- never as a tag, never as a tick. See the note in recipes.js.
 */

const CATEGORIES = [
  ['preparation', 'Preparations', 'Building blocks. Stocks, roux, mother sauces.'],
  ['component', 'Components', 'Made as part of something else.'],
  ['dish', 'Dishes', 'Goes on a menu as written.'],
];
const CAT_LABEL = { preparation: 'Preparation', component: 'Component', dish: 'Dish' };

/** "2 L", "1.5 kg", or nothing at all. */
function yieldOf(r) {
  if (r.yield_qty == null) return '';
  const n = Number(r.yield_qty);
  const shown = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return `${shown}${r.yield_unit ? ` ${r.yield_unit}` : ''}`;
}

function ingredientLine(i) {
  const qty = i.qty == null ? '' : (Number.isInteger(i.qty) ? i.qty : Math.round(i.qty * 100) / 100);
  return html`${[qty, i.unit, i.item].filter((x) => x !== '' && x != null).join(' ')}${i.prep ? html`<span class="variant__label">, ${i.prep}</span>` : ''}${i.optional ? html` <span class="variant__label">(optional)</span>` : ''}`;
}

/* --- List ----------------------------------------------------------------- */

/* Buttons read as words rather than as slugs. A tag with no entry here falls
   back to its own name capitalised, so adding one to the seed puts a working
   button on the screen without needing a second edit here to make it legible. */
const TAG_LABELS = {
  classical: 'Classical',
  sides: 'Sides',
  charcuterie: 'Charcuterie',
  desserts: 'Desserts',
  soups: 'Soups',
  japanese: 'Japanese',
  korean: 'Korean',
  chinese: 'Chinese',
  mongolian: 'Mongolian',
  mexican: 'Mexican',
  german: 'German',
  thai: 'Thai',
  vegan: 'Vegan',
  'gluten-free': 'Gluten-free',
  modernist: 'Modernist',
  preserving: 'Preserving',
};
const tagLabel = (t) => TAG_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1));

function list({ recipes, category, q, tag = '', tags = [] }) {
  const keep = (extra) => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    if (q) p.set('q', q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    const s = p.toString();
    return `/admin/recipes${s ? `?${s}` : ''}`;
  };

  const tab = (value, label) => html`<a
    class="btn ${category === value ? 'btn--primary' : 'btn--secondary'}"
    href="/admin/recipes${value ? `?category=${value}` : ''}${tag ? `${value ? '&' : '?'}tag=${tag}` : ''}">${label}</a>`;

  return html`
    <h1>Recipes</h1>
    <p class="also">How things are made, as opposed to how they are sold. This list is
      yours alone — no part of it appears on the menu or anywhere a customer can reach.
      The app ships with the standard preparations; everything else you add yourself.</p>

    <form method="get" action="/admin/recipes" class="card no-print">
      <div class="dl-row" style="margin-bottom:var(--dbd-sp-3)">
        ${tab('', 'All')}
        ${CATEGORIES.map(([v, label]) => tab(v, label))}
      </div>
      ${tags.length ? html`<div class="dl-row" style="margin-bottom:var(--dbd-sp-3);flex-wrap:wrap">
        <a class="btn ${tag ? 'btn--secondary' : 'btn--primary'}" href="${raw(keep({ tag: '' }))}">Everything</a>
        ${tags.map((t) => html`<a
          class="btn ${tag === t.tag ? 'btn--primary' : 'btn--secondary'}"
          href="${raw(keep({ tag: t.tag }))}">${tagLabel(t.tag)} <span class="variant__label">${t.n}</span></a>`)}
      </div>` : ''}

      <div class="dl-row">
        <input type="hidden" name="category" value="${category}">
        <input type="hidden" name="tag" value="${tag}">
        <label style="flex:1 1 220px">Search
          <input type="search" name="q" value="${q}" placeholder="Name or summary">
        </label>
        <button class="btn btn--secondary" type="submit">Search</button>
        <a class="btn btn--primary" href="/admin/recipes/new">Write a new one</a>
      </div>
    </form>

    ${recipes.length ? html`
      <table class="dtable">
        <thead><tr><th>Recipe</th><th>Kind</th><th>Makes</th><th>Based on</th></tr></thead>
        <tbody>${recipes.map((r) => html`<tr>
          <td data-label="Recipe">
            <strong><a href="/admin/recipes/${r.slug}">${r.name}</a></strong>
            ${r.summary ? html`<br><span class="variant__label">${r.summary}</span>` : ''}
          </td>
          <td data-label="Kind">${CAT_LABEL[r.category] || r.category}</td>
          <td data-label="Makes">${yieldOf(r) || '—'}</td>
          <td data-label="Based on">${r.parent_name
            ? html`<a href="/admin/recipes/${r.parent_slug}">${r.parent_name}</a>`
            : '—'}</td>
        </tr>`)}</tbody>
      </table>`
      : html`<div class="card"><p>${q
        ? `Nothing matches "${q}"${tag ? ` under ${tagLabel(tag)}` : ''}.`
        : tag
          ? `Nothing under ${tagLabel(tag)}${category ? ` in ${category}s` : ''}.`
          : 'Nothing here yet.'} <a href="/admin/recipes/new">Write one</a>.</p></div>`}`;
}

/* --- Detail --------------------------------------------------------------- */

function detail({ recipe, scaled, factor, kids, suggestions }) {
  const r = scaled || recipe;
  const grouped = new Map();
  for (const i of r.ingredients || []) {
    const g = i.group_label || '';
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g).push(i);
  }

  const scaleBtn = (f, label) => html`<a
    class="btn ${Number(factor) === f ? 'btn--primary' : 'btn--secondary'}"
    href="/admin/recipes/${recipe.slug}${f === 1 ? '' : `?x=${f}`}">${label}</a>`;

  return html`
    <p class="also"><a href="/admin/recipes">← All recipes</a></p>
    <h1>${recipe.name}</h1>
    ${recipe.summary ? html`<p class="also">${recipe.summary}</p>` : ''}
    ${(recipe.tags || []).length ? html`<p class="also no-print">${recipe.tags.map((t) => html`<a
      class="btn btn--secondary" style="margin-right:var(--dbd-sp-2)"
      href="/admin/recipes?tag=${t}">${tagLabel(t)}</a>`)}</p>` : ''}

    <div class="card no-print">
      <div class="dl-row">
        <span><strong>Makes</strong> ${yieldOf(r) || 'unspecified'}${r.portions ? ` · ${r.portions} portions` : ''}</span>
        ${recipe.dish_name ? html`<span><strong>On the menu as</strong>
          <a href="/admin/dishes?kind=${recipe.dish_kind || ''}">${recipe.dish_name}</a></span>` : ''}
      </div>
      <div class="dl-row" style="margin-top:var(--dbd-sp-3)">
        ${scaleBtn(0.5, 'Half')}
        ${scaleBtn(1, 'As written')}
        ${scaleBtn(2, 'Double')}
        ${scaleBtn(3, 'Triple')}
      </div>
      ${r.scaling_caveat ? html`<p class="variant__label" style="margin-top:var(--dbd-sp-2)">
        Quantities are scaled. Times are not, and seasoning is left as written — a doubled
        braise is not a doubled hour, and "to taste" does not double.</p>` : ''}
    </div>

    <div class="card">
      <h2>Ingredients</h2>
      ${[...grouped.entries()].map(([g, items]) => html`
        ${g ? html`<h3>${g}</h3>` : ''}
        <ul>${items.map((i) => html`<li>${ingredientLine(i)}${i.sub_recipe_id && i.sub_slug
          ? html` <a class="variant__label" href="/admin/recipes/${i.sub_slug}">(recipe)</a>` : ''}</li>`)}</ul>`)}
    </div>

    ${(r.steps || []).length ? html`<div class="card">
      <h2>Method</h2>
      <ol>${r.steps.map((s) => html`<li>${s.text}${s.minutes
        ? html` <span class="variant__label">— about ${s.minutes} min</span>` : ''}</li>`)}</ol>
    </div>` : ''}

    ${recipe.notes ? html`<div class="card"><h2>Notes</h2><p>${recipe.notes}</p></div>` : ''}

    ${kids.length ? html`<div class="card">
      <h2>Built on this</h2>
      <ul>${kids.map((k) => html`<li><a href="/admin/recipes/${k.slug}">${k.name}</a>
        ${k.summary ? html`<span class="variant__label"> — ${k.summary}</span>` : ''}</li>`)}</ul>
    </div>` : ''}

    <div class="notice">
      <strong>What this recipe would suggest on a menu.</strong>
      ${suggestions.length
        ? html`Reading its ingredients — and the recipes underneath them — the allergen
            dictionary finds ${raw(suggestions.map((s) => `<strong>${s.allergen}</strong>`).join(', '))}.
            That is a prompt, not a tag. Nothing here has been applied to any dish and no
            review box has been ticked. When you put a dish on a day, review it there.`
        : html`The allergen dictionary finds nothing in this one. That is not a clearance —
            it only knows the words in its dictionary, and a dish still has to be reviewed
            on the day it goes out.`}
    </div>

    <div class="dl-row no-print">
      <a class="btn btn--secondary" href="/admin/recipes/${recipe.slug}/edit">Edit</a>
    </div>`;
}

/* --- Editor ---------------------------------------------------------------
 * One textarea for ingredients and one for method, rather than a row of inputs
 * per line. A cook writing a recipe writes lines; a form that demands four
 * boxes per ingredient is a form that does not get filled in. The parser reads
 * what it can and keeps the rest verbatim, so nothing typed here is ever lost
 * to a format it did not expect.
 */
function editor({ recipe, error, dishes = [] }) {
  const r = recipe || {};
  const isNew = !r.id;
  const KIND_LABELS = { main: 'Mains', soup: 'Soups', salad: 'Salads', dessert: 'Desserts' };
  const byKind = new Map();
  for (const d of dishes) {
    if (!byKind.has(d.kind)) byKind.set(d.kind, []);
    byKind.get(d.kind).push(d);
  }
  return html`
    <p class="also"><a href="/admin/recipes${r.slug ? `/${r.slug}` : ''}">← Back</a></p>
    <h1>${isNew ? 'Write a recipe' : `Edit ${r.name}`}</h1>
    ${error ? html`<div class="notice"><strong>${error}</strong></div>` : ''}

    ${!isNew && r.source === 'seed' ? html`<div class="notice">
      This is one of the recipes the app shipped with. Saving your changes makes it yours —
      it will not be reverted by a later update.</div>` : ''}

    <form method="post" action="${isNew ? '/admin/recipes' : `/admin/recipes/${r.id}`}" class="card">
      <label>Name
        <input type="text" name="name" value="${r.name || ''}" required maxlength="120">
      </label>
      <label>One line about it
        <input type="text" name="summary" value="${r.summary || ''}" maxlength="240">
      </label>
      <div class="dl-row">
        <label style="flex:1 1 180px">Kind
          <select name="category">
            ${CATEGORIES.map(([v, label]) => html`<option value="${v}"${(r.category || 'preparation') === v ? ' selected' : ''}>${label}</option>`)}
          </select>
        </label>
        <label style="flex:1 1 120px">Makes
          <input type="number" step="any" name="yield_qty" value="${r.yield_qty == null ? '' : r.yield_qty}">
        </label>
        <label style="flex:1 1 100px">Unit
          <input type="text" name="yield_unit" value="${r.yield_unit || ''}" maxlength="20" placeholder="ml, g, ea">
        </label>
        <label style="flex:1 1 120px">Portions
          <input type="number" name="portions" value="${r.portions == null ? '' : r.portions}">
        </label>
      </div>

      <label>What it makes on the menu
        ${dishes.length > 12 ? html`<input type="search" class="dish-filter"
          placeholder="Type to narrow the list" aria-label="Filter the dish list" hidden>` : ''}
        <select name="dish_id" class="dish-picker">
          <option value=""${r.dish_id ? '' : ' selected'}>Not a menu dish — a preparation</option>
          ${[...byKind.entries()].map(([kind, items]) => html`<optgroup label="${KIND_LABELS[kind] || kind}">
            ${items.map((d) => html`<option value="${d.id}"${r.dish_id === d.id ? ' selected' : ''}${d.taken_by ? ' disabled' : ''}>${d.name}${d.taken_by ? ` — already ${d.taken_by_name}` : ''}</option>`)}
          </optgroup>`)}
        </select>
      </label>
      <p class="variant__label">Linking a recipe to a saved dish is a cross-reference and
        nothing more. It does not copy allergens onto the dish and it does not tick the
        review box — the recipe knows what goes in the pot, and the tick says you have
        checked a dish for the menu it is going on. Those stay separate.</p>

      <label>Ingredients — one per line
        <textarea name="ingredients" rows="10" placeholder="500 g onion, peeled
2 tbsp butter, clarified
1 bay leaf
salt (optional)">${R.asLines(r)}</textarea>
      </label>
      <p class="variant__label">Written as you would say them: amount, unit, item, then a
        comma and how it is prepared. Anything it cannot read is kept exactly as typed —
        it just will not scale with the rest.</p>

      <label>Method — leave a blank line between steps
        <textarea name="steps" rows="12">${(r.steps || []).map((s) => s.text).join('\n\n')}</textarea>
      </label>

      <label>Notes
        <textarea name="notes" rows="3">${r.notes || ''}</textarea>
      </label>

      <div class="dl-row">
        <button class="btn btn--primary" type="submit">${isNew ? 'Save recipe' : 'Save changes'}</button>
        <a class="btn btn--secondary" href="/admin/recipes${r.slug ? `/${r.slug}` : ''}">Cancel</a>
      </div>
    </form>`;
}

module.exports = { list, detail, editor, CATEGORIES, CAT_LABEL, yieldOf };
