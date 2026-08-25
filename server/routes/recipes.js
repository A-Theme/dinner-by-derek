'use strict';
const express = require('express');
const auth = require('../auth');
const A = require('../allergens');
const R = require('../recipes');
const V = require('../views/admin');
const RV = require('../views/recipe');
const { back } = require('./back');

/**
 * The recipe screens, owner-only.
 *
 * `auth.required` is applied here rather than left to the router mounted
 * ahead of this one. Relying on a sibling router's blanket middleware works
 * today and would keep working right up until somebody reorders the mounts in
 * index.js, at which point every recipe in the kitchen becomes a public page
 * with no error anywhere to say so. A guard that costs one line is worth not
 * having to reason about mount order to know whether the kitchen's working
 * documents are exposed.
 *
 * Nothing in this module renders into a customer view and no public route
 * reaches it. The recipe is the kitchen's own document.
 */
const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(auth.required);

const CATEGORIES = ['preparation', 'component', 'dish'];

router.get('/recipes', (req, res) => {
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
  const q = String(req.query.q || '').trim().slice(0, 80);
  const recipes = R.list({ category, q });
  const body = RV.list({ recipes, category, q });
  res.type('html').send(String(V.shell({ title: 'Recipes', body, current: 'recipes' })));
});

/* `new` is matched before `:slug` so a recipe can never shadow the editor.
   Slugs are generated from names, and "New" is a name somebody will use. */
router.get('/recipes/new', (req, res) => {
  const body = RV.editor({ recipe: null, error: null, dishes: R.dishOptions() });
  res.type('html').send(String(V.shell({ title: 'Write a recipe', body, current: 'recipes' })));
});

router.get('/recipes/:slug', (req, res, next) => {
  const recipe = R.get(req.params.slug);
  if (!recipe) return next();

  // The scale factor is clamped rather than trusted. A number out of a query
  // string reaches arithmetic here, and x=1e9 should give a sensible answer
  // instead of a page full of exponent notation.
  const raw = Number(req.query.x);
  const factor = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 1;
  const scaled = factor === 1 ? null : R.scale(recipe, factor);

  const body = RV.detail({
    recipe,
    scaled,
    factor,
    kids: R.variations(recipe.id),
    // Suggestion only. This reads the recipe and its sub-recipes and reports
    // what the dictionary would say; it writes nothing and ticks nothing.
    suggestions: A.detect(R.allergenText(recipe)),
  });
  res.type('html').send(String(V.shell({ title: recipe.name, body, current: 'recipes' })));
});

router.get('/recipes/:slug/edit', (req, res, next) => {
  const recipe = R.get(req.params.slug);
  if (!recipe) return next();
  const body = RV.editor({ recipe, error: null, dishes: R.dishOptions(recipe.id) });
  res.type('html').send(String(V.shell({ title: `Edit ${recipe.name}`, body, current: 'recipes' })));
});

router.post('/recipes', (req, res) => {
  if (!String(req.body.name || '').trim()) {
    const body = RV.editor({
      recipe: req.body, error: 'A recipe needs a name.', dishes: R.dishOptions(),
    });
    return res.type('html').send(String(V.shell({ title: 'Write a recipe', body, current: 'recipes' })));
  }
  const { id, warning } = R.put(req.body);
  const saved = R.get(String(id));
  res.redirect(`/admin/recipes/${saved.slug}${warning ? `?err=${encodeURIComponent(warning)}` : ''}`);
});

router.post('/recipes/:id', (req, res) => {
  const recipe = R.get(req.params.id);
  if (!recipe) return back(res, req, null, 'That recipe is gone.');
  if (!String(req.body.name || '').trim()) {
    const body = RV.editor({
      recipe: { ...recipe, ...req.body },
      error: 'A recipe needs a name.',
      dishes: R.dishOptions(recipe.id),
    });
    return res.type('html').send(String(V.shell({ title: 'Edit recipe', body, current: 'recipes' })));
  }
  const { warning } = R.put(req.body, recipe.id);
  const saved = R.get(String(recipe.id));
  res.redirect(`/admin/recipes/${saved.slug}${warning ? `?err=${encodeURIComponent(warning)}` : ''}`);
});

router.post('/recipes/:id/delete', (req, res) => {
  const recipe = R.get(req.params.id);
  if (!recipe) return back(res, req, null, 'That recipe is already gone.');
  R.remove(recipe.id);
  // Variations keep their own text; parent_id is ON DELETE SET NULL, so a
  // derivative outlives the base it was written against rather than vanishing
  // with it.
  res.redirect('/admin/recipes');
});

module.exports = { router };
