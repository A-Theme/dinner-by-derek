'use strict';
const { db } = require('./db');
const seed = require('./recipe-seed');

/**
 * Recipes: how a thing is made, kept apart from how it is sold.
 *
 * Three jobs live here. Reading a recipe with its ingredients and steps
 * attached; scaling one to a different yield; and handing its ingredient list
 * to the allergen suggester.
 *
 * THAT LAST ONE IS THE POINT OF THE WHOLE MODULE, and it is also the one
 * place it could do real harm. An ingredient list names the butter that a
 * description only implies with "creamy", so it finds allergens the existing
 * scan cannot. What it must never do is decide anything. `allergenText`
 * returns words for the suggester; the suggester returns pending chips; the
 * owner accepts, dismisses and ticks. There is no code path in this file that
 * writes to an item's `allergens` column or touches `ack`, and adding one
 * would undo the guarantee the rest of the app is arranged around.
 */

/* --- Units ---------------------------------------------------------------
 * Canonical amounts exist so scaling and costing have one number to work
 * with. The written form is kept exactly as typed: a cook reads "2 tbsp", and
 * showing 30 ml instead is a worse recipe, not a more precise one.
 *
 * Volume conversions are the Canadian metric cup and spoon (250 / 15 / 5 ml),
 * not the US customary ones. Anything not in this table canonicalises to null,
 * which is honest -- "2 sprigs thyme" has no gram weight and inventing one
 * would put a made-up number into a cost report.
 */
const TO_ML = { ml: 1, l: 1000, litre: 1000, tsp: 5, tbsp: 15, cup: 250, floz: 30 };
const TO_G = { g: 1, kg: 1000, mg: 0.001, lb: 453.592, oz: 28.3495 };
const COUNT = new Set(['', 'ea', 'each', 'whole']);

function canon(qty, unit) {
  if (qty == null || !Number.isFinite(Number(qty))) return { canon_qty: null, canon_unit: null };
  const n = Number(qty);
  const u = String(unit || '').trim().toLowerCase();
  if (TO_G[u]) return { canon_qty: n * TO_G[u], canon_unit: 'g' };
  if (TO_ML[u]) return { canon_qty: n * TO_ML[u], canon_unit: 'ml' };
  if (COUNT.has(u)) return { canon_qty: n, canon_unit: 'ea' };
  return { canon_qty: null, canon_unit: null };
}

/* --- Seeding -------------------------------------------------------------
 * Re-applied on boot so a later release reaches a database that already
 * exists. Matched on slug, and an edited recipe is left alone -- the same
 * bargain the allergen dictionary strikes with allergen_terms_removed. A
 * kitchen that has tuned its own stock does not want it reverted by an update.
 */
function seedRecipes() {
  const existing = new Map(
    db.prepare('SELECT slug, id, edited FROM recipes').all().map((r) => [r.slug, r]),
  );

  const insRecipe = db.prepare(`INSERT INTO recipes
    (slug, name, category, summary, yield_qty, yield_unit, portions, source, notes)
    VALUES (@slug, @name, @category, @summary, @yield_qty, @yield_unit, @portions, 'seed', @notes)`);
  const updRecipe = db.prepare(`UPDATE recipes SET
    name = @name, category = @category, summary = @summary,
    yield_qty = @yield_qty, yield_unit = @yield_unit, portions = @portions, notes = @notes
    WHERE slug = @slug`);
  const insIng = db.prepare(`INSERT INTO recipe_ingredients
    (recipe_id, sort, group_label, qty, unit, item, prep, optional, canon_qty, canon_unit)
    VALUES (@recipe_id, @sort, @group_label, @qty, @unit, @item, @prep, @optional, @canon_qty, @canon_unit)`);
  const insStep = db.prepare(
    'INSERT INTO recipe_steps (recipe_id, sort, text, minutes) VALUES (?, ?, ?, ?)',
  );

  const tx = db.transaction(() => {
    // Pass one: every recipe row, so that pass two can resolve a `sub` or a
    // `parent` to an id no matter what order the seed happens to be written in.
    for (const r of seed) {
      const prior = existing.get(r.slug);
      if (prior && prior.edited) continue;
      const row = {
        slug: r.slug,
        name: r.name,
        category: r.category || 'preparation',
        summary: r.summary || '',
        yield_qty: Array.isArray(r.yield) ? r.yield[0] : null,
        yield_unit: Array.isArray(r.yield) ? r.yield[1] : null,
        portions: r.portions == null ? null : r.portions,
        notes: r.notes || '',
      };
      if (prior) updRecipe.run(row); else insRecipe.run(row);
    }

    const idOf = new Map(
      db.prepare('SELECT slug, id FROM recipes').all().map((r) => [r.slug, r.id]),
    );

    for (const r of seed) {
      const prior = existing.get(r.slug);
      if (prior && prior.edited) continue;
      const id = idOf.get(r.slug);
      if (!id) continue;

      if (r.parent && idOf.has(r.parent)) {
        db.prepare('UPDATE recipes SET parent_id = ? WHERE id = ?').run(idOf.get(r.parent), id);
      }

      // Children are rewritten wholesale rather than diffed. The recipe is
      // small, the seed is the authority for an unedited one, and a diff here
      // would be more code and more ways to be wrong.
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);

      (r.ingredients || []).forEach((ing, i) => {
        const c = canon(ing.qty, ing.unit);
        insIng.run({
          recipe_id: id,
          sort: i,
          group_label: ing.group || '',
          qty: ing.qty == null ? null : Number(ing.qty),
          unit: ing.unit || '',
          item: ing.item,
          prep: ing.prep || '',
          optional: ing.optional ? 1 : 0,
          canon_qty: c.canon_qty,
          canon_unit: c.canon_unit,
        });
        if (ing.sub && idOf.has(ing.sub)) {
          db.prepare(`UPDATE recipe_ingredients SET sub_recipe_id = ?
            WHERE recipe_id = ? AND sort = ?`).run(idOf.get(ing.sub), id, i);
        }
      });

      (r.steps || []).forEach((s, i) => {
        const text = typeof s === 'string' ? s : s.text;
        const minutes = typeof s === 'string' ? null : (s.minutes == null ? null : s.minutes);
        insStep.run(id, i, text, minutes);
      });
    }
  });
  tx();
}

/* --- Reading -------------------------------------------------------------- */

/** One recipe with its ingredients and steps attached, or null. */
function get(idOrSlug) {
  const where = Number.isInteger(idOrSlug) || /^\d+$/.test(String(idOrSlug)) ? 'id = ?' : 'slug = ?';
  const recipe = db.prepare(`SELECT * FROM recipes WHERE ${where}`).get(idOrSlug);
  if (!recipe) return null;
  recipe.ingredients = db.prepare(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort',
  ).all(recipe.id);
  recipe.steps = db.prepare(
    'SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY sort',
  ).all(recipe.id);
  return recipe;
}

const SORTS = {
  name: 'name COLLATE NOCASE',
  category: "CASE category WHEN 'preparation' THEN 0 WHEN 'component' THEN 1 ELSE 2 END, name COLLATE NOCASE",
  recent: 'created_at DESC, name COLLATE NOCASE',
};

/**
 * The list. `sort` is a whitelist key, never a string from the caller -- it
 * ends up inside the SQL, same rule as the saved dish list.
 */
function list({ category = '', q = '', sort = 'category' } = {}) {
  const where = [];
  const args = [];
  if (category) { where.push('category = ?'); args.push(category); }
  if (q) { where.push('(name LIKE ? OR summary LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const sql = `SELECT * FROM recipes ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${SORTS[sort] || SORTS.category}`;
  return db.prepare(sql).all(...args);
}

/** The variations built on a base. */
function variations(id) {
  return db.prepare('SELECT * FROM recipes WHERE parent_id = ? ORDER BY name COLLATE NOCASE').all(id);
}

/* --- Scaling -------------------------------------------------------------- */

/**
 * The same recipe at a different yield.
 *
 * Returns a copy; nothing is written. Lines with no canonical amount are
 * scaled in their written quantity where there is one, and left completely
 * alone where there is not -- "1 bouquet garni" does not become 2.4 of one,
 * and a seasoning line reading "to taste" stays "to taste".
 *
 * Scaling is not linear for everything and the app does not pretend it is:
 * seasoning, thickener and cooking time all lag behind volume. The scaled
 * recipe carries a flag saying so, for the screen to show.
 */
function scale(recipe, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return recipe;
  const out = { ...recipe };
  out.scaled_by = f;
  out.yield_qty = recipe.yield_qty == null ? null : recipe.yield_qty * f;
  out.portions = recipe.portions == null ? null : Math.round(recipe.portions * f);
  out.ingredients = (recipe.ingredients || []).map((ing) => {
    if (NON_SCALING.has(String(ing.unit || '').trim().toLowerCase())) return { ...ing };
    const count = ing.canon_unit === 'ea';
    return {
      ...ing,
      qty: ing.qty == null ? null : (count ? half(ing.qty * f) : round(ing.qty * f)),
      canon_qty: ing.canon_qty == null ? null : (count ? half(ing.canon_qty * f) : round(ing.canon_qty * f)),
    };
  });
  // Time does not scale. A doubled braise is not a doubled hour, and the steps
  // are returned untouched so nobody reads a computed number as a promise.
  out.steps = recipe.steps || [];
  out.scaling_caveat = f !== 1;
  return out;
}

/** Two decimals, without the floating-point tail. */
function round(n) {
  return Math.round(n * 100) / 100;
}

/** Nearest half, for things that come in units. Half an onion is real; 1.27 of
 * one is a number pretending to be an instruction. */
function half(n) {
  return Math.round(n * 2) / 2;
}

/* Units that describe rather than measure. Doubling a batch does not double
 * "to taste", and a recipe that says 2.5 pinches has stopped being a recipe.
 * These lines come back from a scale exactly as written, which is also the
 * honest answer: seasoning is adjusted at the pass, not computed here. */
const NON_SCALING = new Set(['to taste', 'pinch', 'dash', 'as needed', 'a few', 'splash']);

/* --- Allergens ------------------------------------------------------------ */

/**
 * A recipe as text for the allergen suggester, ingredients included.
 *
 * SUGGESTION INPUT ONLY. This returns a string. It does not tag anything, it
 * does not tick anything, and the caller must run it through the same accept/
 * dismiss flow every other suggestion goes through. See the module header.
 *
 * Sub-recipes are followed one level down, because the allergen in a dish is
 * very often in its stock rather than in its own list -- a veloute names no
 * dairy at all until you look at the roux underneath it. One level, not the
 * whole tree: deep enough for the case that actually bites, shallow enough
 * that a cycle in the data cannot hang the request.
 */
function allergenText(idOrSlug, depth = 1) {
  const r = typeof idOrSlug === 'object' ? idOrSlug : get(idOrSlug);
  if (!r) return '';
  const parts = [r.name, r.summary];
  for (const ing of r.ingredients || []) {
    parts.push([ing.item, ing.prep].filter(Boolean).join(' '));
    if (ing.sub_recipe_id && depth > 0) {
      parts.push(allergenText(ing.sub_recipe_id, depth - 1));
    }
  }
  return parts.filter(Boolean).join('\n');
}

module.exports = {
  seedRecipes, get, list, variations, scale, allergenText, canon,
};
