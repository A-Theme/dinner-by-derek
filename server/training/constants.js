'use strict';

/**
 * The dashboard's vocabulary, copied rather than imported.
 *
 * Every module that owns one of these lists — allergens.js, time.js, menu.js,
 * dishes.js — opens the real database at require time. The training module is
 * meant to be provably unable to touch it, and "provably" means not loading it
 * at all, not loading it and being careful. So the words are copied here.
 *
 * The cost is that a list changed in the real app has to be changed here too.
 * That is the intended trade: a training screen a fortnight out of date is a
 * small problem, and a training screen holding a live database handle is not
 * a small problem.
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAYS_MON_FIRST = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABELS = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

const HEALTH_CANADA_ORDER = [
  'peanuts', 'tree nuts', 'sesame seeds', 'milk', 'eggs', 'fish',
  'crustaceans and molluscs', 'soy', 'wheat and triticale', 'mustard',
  'sulphites', 'gluten',
];

const KINDS = ['main', 'soup', 'salad', 'dessert'];
const KIND_LABELS = { main: 'Mains', soup: 'Soups', salad: 'Salads', dessert: 'Desserts' };
const WEEK_SLOTS = { soup: 'soup', salad: 'salad', dessert: 'dessert', meatless: 'main' };
const WEEK_SLOT_COUNTS = { meatless: 1, soup: 2, salad: 2, dessert: 1 };

const SORT_LABELS = {
  name: 'A to Z',
  used: 'Cooked most often',
  recent: 'Most recently saved',
  price: 'Dearest first',
};

const SUBCATEGORY_ORDER = ['Soups', 'Salads', 'Desserts', 'Mains'];
const SUBCATEGORY_LABELS = { Mains: 'Everyday Items' };
const subcategoryLabel = (s) => SUBCATEGORY_LABELS[s] || s;

const RECIPE_CATEGORIES = ['preparation', 'component', 'dish'];

/* The four level-2 slots, with the two names each needs — the noun a sentence
   uses, and the line confirming a save. Mirrors WEEK_ITEM_SLOTS in the real
   routes/admin.js. */
const WEEK_ITEM_SLOTS = {
  soup: { noun: 'soup', label: 'Soup', saved: 'Soup of the week saved.' },
  salad: { noun: 'salad', label: 'Salad', saved: 'Salad of the week saved.' },
  dessert: { noun: 'dessert', label: 'Dessert', saved: 'Dessert of the week saved.' },
  meatless: { noun: 'meatless dish', label: 'Meatless Monday', saved: 'Meatless Monday saved.' },
};

module.exports = {
  WEEKDAYS, WEEKDAYS_MON_FIRST, WEEKDAY_LABELS,
  HEALTH_CANADA_ORDER,
  KINDS, KIND_LABELS, WEEK_SLOTS, WEEK_SLOT_COUNTS, SORT_LABELS,
  SUBCATEGORY_ORDER, subcategoryLabel,
  RECIPE_CATEGORIES, WEEK_ITEM_SLOTS,
};
