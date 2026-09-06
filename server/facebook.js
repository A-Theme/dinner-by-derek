'use strict';
const crypto = require('crypto');
const { db, settings } = require('./db');
const config = require('./config');
const T = require('./time');
const M = require('./menu');
const { DISCLAIMER_TEXT } = require('./views/layout');

/**
 * PLATFORM REALITY, verified against Meta's developer documentation and
 * announcements (August 2026):
 *
 *  - The Facebook Groups API was deprecated with Graph API v19.0 (announced
 *    23 Jan 2024) and removed from all versions on 22 April 2024, taking
 *    `publish_to_groups` and `groups_access_member_info` with it. There is no
 *    supported way for a third-party app to publish into a Group. The manual
 *    adapter is therefore the ONLY group path, and the dashboard says so in
 *    plain words rather than showing a button that cannot work.
 *
 *  - Pages remain publishable. Minimum scopes for text + photo publishing:
 *      pages_show_list        — list the Pages the owner administers
 *      pages_read_engagement  — dependency of pages_manage_posts
 *      pages_manage_posts     — create the post
 *    Nothing else is requested. No profile, friends, insights, messaging or
 *    ads scopes.
 *
 *  - App Review: not required while the only authorizing user holds an
 *    admin, developer or tester role on the app. The owner is the sole user
 *    and will be the app admin, so this app runs in development mode
 *    indefinitely without review. Adding any second, unrelated Facebook user
 *    would change that.
 *
 *  - Token lifetimes: a short-lived user token (~1h) is exchanged for a
 *    long-lived user token (~60 days); the Page token derived from a
 *    long-lived user token does not itself expire, but is invalidated by a
 *    password change, app deauthorization, or a Page role change. The
 *    60-day user-token expiry is tracked and warned on, because that is the
 *    date after which a reconnect will be needed.
 */

const GRAPH = () => `https://graph.facebook.com/${config.facebook.graphVersion}`;

/* --- Token encryption at rest ------------------------------------------- */
function key() {
  if (!config.tokenKey) return null;
  return crypto.createHash('sha256').update(config.tokenKey).digest();
}

function encrypt(plaintext) {
  const k = key();
  if (!k) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function decrypt(blob) {
  const k = key();
  if (!k || !blob) return null;
  try {
    const raw = Buffer.from(blob, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

/* --- Connection record --------------------------------------------------- */
function connection() {
  const row = db.prepare('SELECT * FROM fb_connection WHERE id = 1').get();
  if (!row) return null;
  // The token itself is never returned to any caller but publish().
  const { token_enc, ...safe } = row;
  const days = row.expires_at
    ? Math.ceil((new Date(row.expires_at) - Date.now()) / 86400000)
    : null;
  return { ...safe, hasToken: !!token_enc, daysToExpiry: days, expiringSoon: days !== null && days <= 7 };
}

function saveConnection({ fbUserName, pageId, pageName, token, scopes, expiresAt }) {
  db.prepare(`INSERT INTO fb_connection
      (id, fb_user_name, page_id, page_name, token_enc, scopes, expires_at, connected_at, stale)
      VALUES (1,?,?,?,?,?,?,datetime('now'),0)
      ON CONFLICT(id) DO UPDATE SET
        fb_user_name=excluded.fb_user_name, page_id=excluded.page_id,
        page_name=excluded.page_name, token_enc=excluded.token_enc,
        scopes=excluded.scopes, expires_at=excluded.expires_at,
        connected_at=excluded.connected_at, stale=0`)
    .run(fbUserName, pageId, pageName, encrypt(token), JSON.stringify(scopes), expiresAt);
}

function disconnect() {
  db.prepare('DELETE FROM fb_connection WHERE id = 1').run();
}

function markStale() {
  db.prepare('UPDATE fb_connection SET stale = 1 WHERE id = 1').run();
}

/* --- OAuth 2.0 authorization code flow ----------------------------------- */
function redirectUri() { return `${config.baseUrl}/admin/facebook/callback`; }

function beginAuth() {
  const state = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, created_at) VALUES (?,?)').run(state, Date.now());
  db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Date.now() - 15 * 60 * 1000);
  const u = new URL(`https://www.facebook.com/${config.facebook.graphVersion}/dialog/oauth`);
  u.searchParams.set('client_id', config.facebook.appId);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', config.facebook.scopes.join(','));
  return u.toString();
}

/**
 * A callback whose state is missing, unknown, expired or already used is
 * rejected.
 *
 * The age was checked nowhere. beginAuth prunes rows older than fifteen minutes
 * — but only when a NEW connection is started, so a flow abandoned halfway and
 * never followed by another left its state valid indefinitely. Single-use and
 * thirty-two random bytes either way, so this was a stale form completing rather
 * than anything a stranger could reach; fifteen minutes is what the screen
 * promises, and the promise should be the one enforced.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

function consumeState(state) {
  if (!state) return false;
  const row = db.prepare('SELECT state, created_at FROM oauth_states WHERE state = ?').get(state);
  if (!row) return false;
  /* Spent whether or not it was still in time: a state that has been presented
     once is finished with, and leaving an expired one behind would let it be
     retried until the next connection pruned it. */
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  return Date.now() - Number(row.created_at) < STATE_TTL_MS;
}

/* --- The Pages a callback came back with ---------------------------------
 * Between the OAuth callback and the owner choosing a Page, the Page access
 * tokens have to live somewhere. They used to live in the page itself, one
 * hidden input per Page, and travel back up in the POST body.
 *
 * Nothing was leaking them — the page is admin-only, no-store, and the CSP
 * refuses inline script — but a long-lived credential in the DOM is reachable
 * by anything with a foothold in the browser, and there was no reason for it to
 * be there. The form only ever needed to say WHICH Page was chosen.
 *
 * Held in memory rather than in the database, deliberately: this is the one
 * place a token exists in the clear, it is needed for about as long as it takes
 * to click a button, and a process restart losing it costs a reconnect. Nothing
 * is written to disk, so nothing survives to be found in a backup.
 */
const PENDING_TTL_MS = 15 * 60 * 1000;
const pending = new Map();

function holdPages(payload) {
  const id = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_TTL_MS) pending.delete(k);
  pending.set(id, { at: now, ...payload });
  return id;
}

/** The held Pages, and they are only readable once. */
function takePages(id) {
  const held = pending.get(String(id || ''));
  if (!held) return null;
  pending.delete(String(id));
  if (Date.now() - held.at > PENDING_TTL_MS) return null;
  return held;
}

async function graph(pathname, params, method = 'GET', body = null) {
  const u = new URL(`${GRAPH()}${pathname}`);
  if (method === 'GET') for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error ? data.error.message : 'Facebook request failed');
    err.fbCode = data.error && data.error.code;
    err.isAuth = data.error && [190, 102, 10, 200].includes(data.error.code);
    throw err;
  }
  return data;
}

/**
 * Exchange the code server-side. The app secret never leaves this process and
 * the token never reaches the browser.
 */
async function completeAuth(code) {
  const short = await graph('/oauth/access_token', {
    client_id: config.facebook.appId,
    client_secret: config.facebook.appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  const long = await graph('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: config.facebook.appId,
    client_secret: config.facebook.appSecret,
    fb_exchange_token: short.access_token,
  });
  const me = await graph('/me', { access_token: long.access_token, fields: 'name' });
  const accounts = await graph('/me/accounts', {
    access_token: long.access_token,
    fields: 'id,name,access_token',
  });
  const expiresAt = new Date(Date.now() + (long.expires_in || 60 * 86400) * 1000).toISOString();
  return { userName: me.name, pages: accounts.data || [], expiresAt };
}

/* --- Post text ----------------------------------------------------------- */
const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

/**
 * The variants of a raw item row. Routed through the menu's own render shape so
 * the label defaults — an item with a blank full_label showing the setting's
 * "Full size" — are resolved in one place rather than two that can disagree.
 */
const variantsOf = (row, refTable) => M.toRenderItem(row, {
  level: 'price', refTable, subcategory: '', name: row.name || '',
}).variants;

/**
 * THE STANDARD PRICE, said once at the top instead of on every line.
 *
 * The post used to repeat the full price list under every dish, every weekly
 * item and every standing item — "Full size $50.00 · Meal for one $12.50",
 * eighteen times in a week — which is the same sentence over and over between
 * the reader and the only thing that changes, which is the food.
 *
 * So the most common (label, price) pair for each variant becomes the standard,
 * printed once, and an item only carries a price where it does not match. This
 * is NOT an assertion that everything costs the same. It is not true today: the
 * published week runs three dishes at $50, one at $45 and one at $40, and the
 * standing catalogue prices a 1 L soup and a pack of four differently again.
 * All of those still print their own price. What is dropped is only the
 * repetition of a number the reader has already been given.
 *
 * The standard is taken from the featured dishes when there are any, because
 * those are what "the price" means to someone reading a weekly menu. Letting
 * the standing catalogue vote would let a shelf of $16 sides outnumber the
 * dishes and make every dish an exception to a price nobody quoted.
 */
function priceStandard(featured, fallback) {
  const tally = new Map();
  for (const v of (featured.length ? featured : fallback).flat()) {
    // Keyed as JSON so a label carrying punctuation cannot collide with
    // another label plus a price.
    const key = JSON.stringify([v.id, v.label, v.price]);
    const seen = tally.get(key) || { ...v, n: 0 };
    seen.n += 1;
    tally.set(key, seen);
  }
  const best = new Map();
  for (const e of tally.values()) {
    const held = best.get(e.id);
    // Ties break towards the cheaper price, so the number said once at the top
    // is never one an item quietly undercuts.
    if (!held || e.n > held.n || (e.n === held.n && e.price < held.price)) best.set(e.id, e);
  }
  /** Is this variant the one already quoted at the top? Label as well as price:
      a "1 L" at $14 is not the "Full size" the top is talking about. */
  const covers = (v) => {
    const e = best.get(v.id);
    return !!e && e.label === v.label && e.price === v.price;
  };

  return {
    covers,
    /** An item's price list, reduced to what the top has not already said. */
    line: (variants) => variants.filter((v) => !covers(v))
      .map((v) => `${v.label} ${money(v.price)}`).join(' · '),
    /** The standard itself, full size first, for the block at the top. */
    quoted: () => ['full', 'single'].filter((id) => best.has(id))
      .map((id) => `${best.get(id).label} ${money(best.get(id).price)}`),
  };
}

/**
 * Builds the post body. Same text for both adapters, so the manual copy the
 * owner pastes into a Group is byte-identical to what the Page would receive.
 */
function buildPostText(week) {
  const tz = settings.get('timezone', 'America/Toronto');
  const days = M.serviceDaysOf(week.id);
  const { soups, salads, dessert } = M.weekItemsOf(week.id);
  const L = [];

  L.push(week.title || 'This week at ' + settings.get('business_name'));

  // A closed week is announced, not itemised. Listing the standing items and
  // the delivery area under "we're shut" would invite exactly the orders the
  // closure exists to prevent.
  if (week.closed) {
    L.push('', 'The kitchen is closed this week.');
    if (week.closed_note) L.push(week.closed_note);
    L.push('', 'There is nothing to order for these dates.');
    L.push('', settings.get('owner_contact'));
    return L.join('\n');
  }

  if (week.description) L.push('', week.description);

  /* Everything the post will list, gathered before any of it is written, because
     the price block at the top is derived from it. The day menus are built once
     here and re-read in the loop below rather than built twice. */
  const dayMenus = days.map((d) => ({ d, menu: M.menuForDay(week, d) }));
  const featured = dayMenus.filter((x) => !x.menu.closed && x.menu.featured).map((x) => x.menu.featured);
  /* The meatless dish is listed with its day but does NOT vote for the price
     standard. It has run five dollars under the other mains for years, and a
     week with one Monday dish and one meatless dish would otherwise tie —
     ties break towards the cheaper price, which would quote the meatless
     price at the top and make every meat dish an exception to it. */
  const meatlessItems = dayMenus.filter((x) => !x.menu.closed && x.menu.meatless)
    .map((x) => x.menu.meatless);
  /* Both soups and both salads get their own line, the way Derek writes them.
     Each keeps the plain label: the post reads "Soup: Chicken Mulligatawny"
     twice over, which is how a choice of two is offered out loud. */
  const weeklyRows = [
    ...soups.map((item) => [item, 'Soup']),
    ...salads.map((item) => [item, 'Salad']),
    [dessert, 'Dessert'],
  ].filter(([item]) => item && item.name.trim());
  const { reviewState } = require('./allergens');
  const standing = M.standingItems().filter((s) => reviewState(s).ok);

  const price = priceStandard(
    featured.map((f) => f.variants),
    [...weeklyRows.map(([item]) => variantsOf(item, 'week_items')),
      ...standing.map((s) => variantsOf(s, 'standing_items'))],
  );
  const quoted = price.quoted();
  // The caveat is earned, not boilerplate: it appears only in a week that
  // actually prices something differently, so a week where the standard holds
  // throughout says the price once and nothing else.
  const exceptions = [...featured.map((f) => f.variants),
    ...meatlessItems.map((f) => f.variants),
    ...weeklyRows.map(([item]) => variantsOf(item, 'week_items')),
    ...standing.map((s) => variantsOf(s, 'standing_items'))]
    .some((vs) => vs.some((v) => !price.covers(v)));
  if (quoted.length || settings.getInt('delivery_enabled', 1)) {
    L.push('', 'PRICES');
    if (quoted.length) L.push(quoted.join(' · '));
    // The delivery fee is quoted here and nowhere else. The DELIVERY section
    // below keeps the window and the area, which is what is wanted down there.
    if (settings.getInt('delivery_enabled', 1)) {
      L.push(`Delivery ${money(settings.getInt('delivery_fee'))}`);
    }
    if (exceptions) L.push('Anything priced differently says so where it is listed.');
  }

  // Day-by-day featured section
  for (const { d, menu } of dayMenus) {
    // Closed days are named rather than skipped: a gap in the list reads as
    // an oversight, and the whole point of closing a day is to say so.
    if (menu.closed) {
      L.push('', `— ${T.fmtDayLong(d.service_date, tz)} —`);
      L.push(menu.closedNote ? `Closed — ${menu.closedNote}` : 'Closed');
      continue;
    }
    // A day with only the meatless dish set still gets its heading. Skipping
    // it because the featured box is empty would drop Monday's one main.
    if (!menu.featured && !menu.meatless) continue;
    L.push('', `— ${T.fmtDayLong(d.service_date, tz)} —`);

    /* Both mains are written the same way, the meatless one under the heading
       it has carried in these posts for years. */
    const dish = (f, heading) => {
      L.push(heading ? `${heading} — ${f.name}` : f.name);
      if (f.description) L.push(f.description);
      if (f.halal) L.push('Prepared halal as declared by the kitchen');
      if (f.allergens.length) L.push(`Contains: ${f.allergens.join(', ')}`);
      const dishPrice = price.line(f.variants);
      if (dishPrice) L.push(dishPrice);
    };
    if (menu.featured) dish(menu.featured, null);
    if (menu.meatless) {
      if (menu.featured) L.push('');
      dish(menu.meatless, menu.meatless.level);
    }
    // One cutoff for the day, said once after both dishes — it is a property
    // of the date, not of the plate.
    L.push(`Order by ${T.fmtLocal(menu.cutoff, tz, { weekday: 'long' })}`);
  }

  // Week-level soup and salad
  const weekly = [];
  for (const [item, label] of weeklyRows) {
    const wd = JSON.parse(item.weekdays || '[]').map((w) => T.WEEKDAY_LABELS[w]).join(', ');
    const tags = JSON.parse(item.allergens || '[]');
    // Built as parts and joined, so an item at the standard price loses its
    // price rather than leaving a dangling dash where one used to be.
    const parts = [`${label}: ${item.name}`, wd || 'this week'];
    const prices = price.line(variantsOf(item, 'week_items'));
    if (prices) parts.push(prices);
    if (item.halal) parts.push('halal as declared by the kitchen');
    if (tags.length) parts.push(`contains ${tags.join(', ')}`);
    weekly.push(parts.join(' — '));
  }
  if (weekly.length) {
    L.push('', 'SOUP, SALAD & DESSERT THIS WEEK');
    L.push(...weekly);
  }

  // Standing catalogue
  if (standing.length) {
    L.push('', 'ALWAYS AVAILABLE');
    for (const s of standing) {
      const tags = JSON.parse(s.allergens || '[]');
      const parts = [s.name];
      const prices = price.line(variantsOf(s, 'standing_items'));
      if (prices) parts.push(prices);
      if (s.halal) parts.push('halal as declared by the kitchen');
      if (tags.length) parts.push(`contains ${tags.join(', ')}`);
      L.push(parts.join(' — '));
    }
  }

  // Fulfillment
  const win = T.fmtWindow(settings.get('pickup_start'), settings.get('pickup_end'));
  L.push('', `PICKUP ${win}`);
  for (const l of M.activeLocations()) L.push(`${l.name} — ${l.address}`);
  if (settings.getInt('delivery_enabled', 1)) {
    L.push('', `DELIVERY ${settings.get('delivery_window')}`);
    /* Named in plain English rather than as the FSA list. Fifteen postal
     * prefixes is a wall of text in a Facebook post and answers a question
     * nobody reading a menu is asking; the order form still checks the real
     * list and still names it when a code falls outside the area, which is the
     * moment the detail is actually wanted.
     *
     * This is a claim about geography that the fsas table does not enforce, so
     * it is worth knowing they can disagree: every prefix served today is
     * Kitchener or Waterloo, and adding one further out means changing this
     * line too. */
    L.push('We deliver to Kitchener and Waterloo');
  }

  L.push('', settings.get('payment_instructions'));
  L.push('', DISCLAIMER_TEXT);
  L.push('', `Order here: ${config.baseUrl}/w/${week.slug}`);

  return L.join('\n');
}

function postImageFor(week) {
  if (week.image) return week.image;
  const days = M.serviceDaysOf(week.id);
  const withPhoto = days.find((d) => d.photo);
  return withPhoto ? withPhoto.photo : null;
}

/* --- Adapters ------------------------------------------------------------ */

/** Always available, needs no connection at all. The only path for a Group. */
const manualAdapter = {
  id: 'manual',
  available: () => true,
  async publish(week) {
    return {
      mode: 'manual',
      text: buildPostText(week),
      image: postImageFor(week),
    };
  },
};

const pageAdapter = {
  id: 'facebook_page',
  available() {
    const c = connection();
    return !!(config.facebook.appId && c && c.hasToken && !c.stale);
  },
  async publish(week) {
    const row = db.prepare('SELECT * FROM fb_connection WHERE id = 1').get();
    const token = decrypt(row && row.token_enc);
    if (!token) {
      const e = new Error('No Facebook connection');
      e.isAuth = true;
      throw e;
    }
    const text = buildPostText(week);
    const image = postImageFor(week);

    let result;
    if (image) {
      result = await graph(`/${row.page_id}/photos`, {}, 'POST', {
        url: `${config.baseUrl}/uploads/${image}`,
        caption: text,
        access_token: token,
      });
    } else {
      result = await graph(`/${row.page_id}/feed`, {}, 'POST', {
        message: text,
        access_token: token,
      });
    }
    const postId = result.post_id || result.id;
    return {
      mode: 'page',
      postId,
      postUrl: `https://www.facebook.com/${postId}`,
      pageName: row.page_name,
    };
  },
};

async function testPost(pageId, pageToken) {
  const res = await graph(`/${pageId}/feed`, {}, 'POST', {
    message: 'Test post from the Dinner By Derek ordering app. You can delete this.',
    access_token: pageToken,
  });
  return res.id;
}

module.exports = {
  connection, saveConnection, disconnect, markStale,
  beginAuth, consumeState, completeAuth, redirectUri, testPost,
  holdPages, takePages,
  buildPostText, postImageFor, manualAdapter, pageAdapter, decrypt,
  GROUPS_SUPPORTED: false,
  scopes: config.facebook.scopes,
};
