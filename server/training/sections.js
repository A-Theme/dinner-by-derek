'use strict';

/**
 * Which training sections exist, and which of them are switched on.
 *
 * ────────────────────────────────────────────────────────────────────────
 *  PAYMENTS IS BUILT AND DELIBERATELY OFF.
 *
 *  Every screen, every button and every message for it is written and works —
 *  see views/payments.js. It is held back because the real Payments screen is
 *  still being finished, and training somebody on a screen that is about to
 *  change teaches them something they will have to unlearn.
 *
 *  To switch it on when the real one is ready: change `enabled` to true on the
 *  payments row below. That is the whole change. It appears in the navigation,
 *  joins the guided walkthrough in its proper place, and its routes start
 *  answering. Nothing else needs touching.
 * ────────────────────────────────────────────────────────────────────────
 */

const SECTIONS = [
  { key: 'today', path: '/', label: 'Today', enabled: true },
  { key: 'week', path: '/week', label: 'This Week', enabled: true },
  { key: 'history', path: '/history', label: 'Menu History', enabled: true },
  { key: 'dishes', path: '/dishes', label: 'Saved Dishes', enabled: true },
  { key: 'recipes', path: '/recipes', label: 'Recipes', enabled: true },
  { key: 'other', path: '/other-options', label: 'Other Options', enabled: true },
  { key: 'orders', path: '/orders', label: 'Orders', enabled: true },

  /* Built, complete, and not in use yet. See the note above. */
  { key: 'payments', path: '/payments', label: 'Payments', enabled: false },

  { key: 'locations', path: '/locations', label: 'Locations & Delivery', enabled: true },
  { key: 'graphics', path: '/graphics', label: 'Graphics', enabled: true },
  { key: 'settings', path: '/settings', label: 'Settings', enabled: true },
  { key: 'outbox', path: '/outbox', label: 'Outbox', enabled: true },
];

const enabled = () => SECTIONS.filter((s) => s.enabled);
const isEnabled = (key) => SECTIONS.some((s) => s.key === key && s.enabled);
const find = (key) => SECTIONS.find((s) => s.key === key) || null;

module.exports = { SECTIONS, enabled, isEnabled, find };
