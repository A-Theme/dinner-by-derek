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
      db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(id);

      // Tags come from the seed and are rewritten with it, so a recipe moved
      // from one section of the file to another moves button with it.
      for (const tag of r.tags || []) {
        db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag) VALUES (?, ?)')
          .run(id, String(tag));
      }

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
  const recipe = db.prepare(`SELECT r.*, d.name AS dish_name, d.kind AS dish_kind
    FROM recipes r LEFT JOIN saved_dishes d ON d.id = r.dish_id
    WHERE r.${where}`).get(idOrSlug);
  if (!recipe) return null;
  // The sub-recipe's slug comes along so the screen can link to it without a
  // second query per ingredient.
  recipe.ingredients = db.prepare(`SELECT i.*, s.slug AS sub_slug, s.name AS sub_name
    FROM recipe_ingredients i
    LEFT JOIN recipes s ON s.id = i.sub_recipe_id
    WHERE i.recipe_id = ? ORDER BY i.sort`).all(recipe.id);
  recipe.steps = db.prepare(
    'SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY sort',
  ).all(recipe.id);
  recipe.tags = db.prepare(
    'SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag',
  ).all(recipe.id).map((t) => t.tag);
  return recipe;
}

/* Column names are written qualified because the list query joins the parent
   recipe onto itself, and an unqualified `name` in that query is ambiguous. */
const SORTS = {
  name: 'r.name COLLATE NOCASE',
  category: "CASE r.category WHEN 'preparation' THEN 0 WHEN 'component' THEN 1 ELSE 2 END, r.name COLLATE NOCASE",
  recent: 'r.created_at DESC, r.name COLLATE NOCASE',
};

/**
 * The list. `sort` is a whitelist key, never a string from the caller -- it
 * ends up inside the SQL, same rule as the saved dish list.
 */
function list({ category = '', q = '', tag = '', sort = 'category' } = {}) {
  const where = [];
  const args = [];
  if (category) { where.push('r.category = ?'); args.push(category); }
  if (q) { where.push('(r.name LIKE ? OR r.summary LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  /* EXISTS rather than a join, because a recipe carries more than one tag and
     joining would return it once per tag it happens to match. */
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM recipe_tags t WHERE t.recipe_id = r.id AND t.tag = ?)');
    args.push(tag);
  }
  const sql = `SELECT r.*, p.name AS parent_name, p.slug AS parent_slug,
      d.name AS dish_name, d.kind AS dish_kind
    FROM recipes r
    LEFT JOIN recipes p ON p.id = r.parent_id
    LEFT JOIN saved_dishes d ON d.id = r.dish_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${SORTS[sort] || SORTS.category}`;
  return db.prepare(sql).all(...args);
}

/**
 * Every tag in use, with how many recipes carry it.
 *
 * The buttons are built from this rather than from a list written in the view,
 * so a tag that no recipe has any more cannot leave a button that filters to an
 * empty page. Counted against the same category filter the buttons sit under,
 * because "German (8)" next to a Preparations tab showing none of them is a
 * number that lies.
 */
function tagCounts({ category = '' } = {}) {
  const sql = `SELECT t.tag, COUNT(*) AS n
    FROM recipe_tags t JOIN recipes r ON r.id = t.recipe_id
    ${category ? 'WHERE r.category = ?' : ''}
    GROUP BY t.tag ORDER BY n DESC, t.tag`;
  return category ? db.prepare(sql).all(category) : db.prepare(sql).all();
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

/* --- Writing --------------------------------------------------------------
 *
 * Ingredients are typed as lines, not as a form with twelve boxes per row.
 * A cook writing out a recipe writes "500 g onion, peeled" and a screen that
 * demands quantity, unit, item and prep in four separate inputs turns a
 * two-minute job into a twenty-minute one, which means it does not get done.
 *
 * The parse is deliberately forgiving and never refuses a line. Anything it
 * cannot read becomes the item, whole and unaltered -- "a good handful of
 * parsley" survives as itself rather than being rejected or guessed at. A
 * recipe with an unparsed line is a working recipe with one line that will
 * not scale; a recipe the editor refused to save is nothing at all.
 */
const UNIT_WORDS = new Set([
  ...Object.keys(TO_G), ...Object.keys(TO_ML),
  'tsp', 'tbsp', 'cup', 'cups', 'sprig', 'sprigs', 'stem', 'stems', 'clove', 'cloves',
  'pinch', 'dash', 'bunch', 'slice', 'slices', 'ea', 'each', 'to', 'as',
]);

/** "1/2", "1 1/2", "0.5", "2" -> Number, or null. */
function parseQty(s) {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function parseIngredientLine(line) {
  let text = String(line || '').trim();
  if (!text) return null;

  let optional = 0;
  const opt = /\s*\((optional)\)\s*$/i.exec(text);
  if (opt) { optional = 1; text = text.slice(0, opt.index).trim(); }

  const words = text.split(/\s+/);
  let qty = null;
  let unit = '';
  let rest = words;

  const first = parseQty(words[0]);
  if (first != null) {
    qty = first;
    rest = words.slice(1);
    // "1 1/2 cup flour" -- the fraction is part of the number, not the unit.
    if (rest.length && parseQty(`${words[0]} ${rest[0]}`) != null) {
      qty = parseQty(`${words[0]} ${rest[0]}`);
      rest = rest.slice(1);
    }
    const maybe = String(rest[0] || '').toLowerCase().replace(/\.$/, '');
    if (UNIT_WORDS.has(maybe)) {
      // "to taste" and "as needed" are two words and mean one thing.
      if ((maybe === 'to' || maybe === 'as') && rest[1]) {
        unit = `${maybe} ${String(rest[1]).toLowerCase()}`;
        rest = rest.slice(2);
      } else {
        unit = maybe;
        rest = rest.slice(1);
      }
    }
  }

  const remainder = rest.join(' ').trim();
  const comma = remainder.indexOf(',');
  const item = comma === -1 ? remainder : remainder.slice(0, comma).trim();
  const prep = comma === -1 ? '' : remainder.slice(comma + 1).trim();
  if (!item) return { qty: null, unit: '', item: text, prep: '', optional };
  return { qty, unit, item, prep, optional };
}

function slugify(name, id) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 60) || 'recipe';
  const taken = db.prepare('SELECT id FROM recipes WHERE slug = ?').get(base);
  if (!taken || (id && taken.id === id)) return base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM recipes WHERE slug = ?').get(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Create or update. `edited` is set on any save that touches a seeded recipe,
 * which is what stops the next boot from reverting the owner's version.
 */
function put(fields, id = null) {
  const name = String(fields.name || '').trim();
  if (!name) return null;
  const row = {
    name,
    category: ['preparation', 'component', 'dish'].includes(fields.category)
      ? fields.category : 'preparation',
    summary: String(fields.summary || '').trim(),
    yield_qty: fields.yield_qty === '' || fields.yield_qty == null ? null : Number(fields.yield_qty),
    yield_unit: String(fields.yield_unit || '').trim(),
    portions: fields.portions === '' || fields.portions == null ? null : Number(fields.portions),
    notes: String(fields.notes || '').trim(),
    /* The link to a saved dish, and nothing else.
     *
     * Attaching a recipe to a dish says "this is how that is made". It does
     * NOT copy the recipe's allergens onto the dish, and it does not tick
     * anything, because the recipe knows what goes in the pot and the tick is
     * a statement about a dish on a menu this week. Those are different
     * claims, and the day the link starts making the second one on the
     * strength of the first is the day a substitution nobody retyped goes out
     * under somebody else's signature. The link is a cross-reference. */
    dish_id: fields.dish_id === '' || fields.dish_id == null ? null : Number(fields.dish_id),
  };
  if (row.dish_id != null
      && !db.prepare('SELECT 1 FROM saved_dishes WHERE id = ?').get(row.dish_id)) {
    row.dish_id = null;
  }

  /* Somebody else's recipe already claims that dish. Refuse the link and say
     whose, rather than letting the unique index raise a 500 -- the owner
     picked a dish from a list and deserves a sentence, not a stack trace. */
  let warning = null;
  if (row.dish_id != null) {
    const taken = db.prepare(
      'SELECT name FROM recipes WHERE dish_id = ? AND id IS NOT ?',
    ).get(row.dish_id, id);
    if (taken) {
      warning = `That dish is already linked to "${taken.name}", so this recipe was saved without a dish.`;
      row.dish_id = null;
    }
  }

  const tx = db.transaction(() => {
    let rid = id;
    if (rid) {
      db.prepare(`UPDATE recipes SET name=@name, category=@category, summary=@summary,
        yield_qty=@yield_qty, yield_unit=@yield_unit, portions=@portions, notes=@notes,
        dish_id=@dish_id, slug=@slug, edited=1 WHERE id=@id`)
        .run({ ...row, slug: slugify(name, rid), id: rid });
    } else {
      rid = db.prepare(`INSERT INTO recipes
        (slug, name, category, summary, yield_qty, yield_unit, portions, notes, dish_id, source)
        VALUES (@slug, @name, @category, @summary, @yield_qty, @yield_unit, @portions, @notes, @dish_id, 'house')`)
        .run({ ...row, slug: slugify(name) }).lastInsertRowid;
    }

    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(rid);
    db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(rid);

    String(fields.ingredients || '').split('\n')
      .map(parseIngredientLine).filter(Boolean)
      .forEach((ing, i) => {
        const c = canon(ing.qty, ing.unit);
        db.prepare(`INSERT INTO recipe_ingredients
          (recipe_id, sort, qty, unit, item, prep, optional, canon_qty, canon_unit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(rid, i, ing.qty, ing.unit, ing.item, ing.prep, ing.optional, c.canon_qty, c.canon_unit);
      });

    // Steps split on blank lines, so a step may run to more than one sentence
    // without becoming two steps.
    String(fields.steps || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
      .forEach((text, i) => {
        db.prepare('INSERT INTO recipe_steps (recipe_id, sort, text) VALUES (?, ?, ?)')
          .run(rid, i, text.replace(/\s*\n\s*/g, ' '));
      });

    return rid;
  });
  return { id: tx(), warning };
}

/** The recipe attached to a saved dish, or null. */
function byDish(dishId) {
  const row = db.prepare('SELECT slug FROM recipes WHERE dish_id = ?').get(Number(dishId));
  return row ? get(row.slug) : null;
}

/**
 * Every saved dish, flagged with whether a recipe already points at it.
 *
 * The editor's dish list, and the reason it is a query rather than two: a
 * select showing dishes that are already taken, with no sign of which, is a
 * select that produces the refusal above instead of preventing it.
 */
function dishOptions(exceptRecipeId = null) {
  return db.prepare(`SELECT d.id, d.name, d.kind,
      r.id AS taken_by, r.name AS taken_by_name
    FROM saved_dishes d
    LEFT JOIN recipes r ON r.dish_id = d.id AND r.id IS NOT ?
    ORDER BY d.kind, d.name COLLATE NOCASE`).all(exceptRecipeId);
}

function remove(id) {
  return db.prepare('DELETE FROM recipes WHERE id = ?').run(Number(id)).changes > 0;
}

/** The ingredient list back as editable text, exactly as the editor expects it. */
function asLines(recipe) {
  return (recipe.ingredients || []).map((i) => {
    const qty = i.qty == null ? '' : String(i.qty);
    const bits = [qty, i.unit, i.item].filter(Boolean).join(' ');
    return `${bits}${i.prep ? `, ${i.prep}` : ''}${i.optional ? ' (optional)' : ''}`;
  }).join('\n');
}

module.exports = {
  seedRecipes, get, list, variations, scale, allergenText, canon,
  put, remove, asLines, parseIngredientLine, byDish, dishOptions, tagCounts, SORTS,
};
