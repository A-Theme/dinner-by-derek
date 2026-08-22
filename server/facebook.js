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

/** A callback whose state is missing, unknown or already used is rejected. */
function consumeState(state) {
  if (!state) return false;
  const row = db.prepare('SELECT state FROM oauth_states WHERE state = ?').get(state);
  if (!row) return false;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  return true;
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
 * Builds the post body. Same text for both adapters, so the manual copy the
 * owner pastes into a Group is byte-identical to what the Page would receive.
 */
function buildPostText(week) {
  const tz = settings.get('timezone', 'America/Toronto');
  const days = M.serviceDaysOf(week.id);
  const { soup, salad, dessert } = M.weekItemsOf(week.id);
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

  // Day-by-day featured section
  for (const d of days) {
    const menu = M.menuForDay(week, d);
    // Closed days are named rather than skipped: a gap in the list reads as
    // an oversight, and the whole point of closing a day is to say so.
    if (menu.closed) {
      L.push('', `— ${T.fmtDayLong(d.service_date, tz)} —`);
      L.push(menu.closedNote ? `Closed — ${menu.closedNote}` : 'Closed');
      continue;
    }
    if (!menu.featured) continue;
    const f = menu.featured;
    L.push('', `— ${T.fmtDayLong(d.service_date, tz)} —`);
    L.push(f.name);
    if (f.description) L.push(f.description);
    if (f.halal) L.push('Prepared halal as declared by the kitchen');
    if (f.allergens.length) L.push(`Contains: ${f.allergens.join(', ')}`);
    L.push(f.variants.map((v) => `${v.label} ${money(v.price)}`).join(' · '));
    L.push(`Order by ${T.fmtLocal(menu.cutoff, tz, { weekday: 'long' })}`);
  }

  // Week-level soup and salad
  const weekly = [];
  for (const [item, label] of [[soup, 'Soup'], [salad, 'Salad'], [dessert, 'Dessert']]) {
    if (!item || !item.name.trim()) continue;
    const wd = JSON.parse(item.weekdays || '[]').map((w) => T.WEEKDAY_LABELS[w]).join(', ');
    const prices = [];
    if (item.full_on && item.full_price != null) prices.push(`${item.full_label} ${money(item.full_price)}`);
    if (item.single_on && item.single_price != null) prices.push(`${item.single_label} ${money(item.single_price)}`);
    const tags = JSON.parse(item.allergens || '[]');
    weekly.push(`${label}: ${item.name} — ${wd || 'this week'} — ${prices.join(' · ')}`
      + (item.halal ? ' — halal as declared by the kitchen' : '')
      + (tags.length ? ` — contains ${tags.join(', ')}` : ''));
  }
  if (weekly.length) {
    L.push('', 'SOUP, SALAD & DESSERT THIS WEEK');
    L.push(...weekly);
  }

  // Standing catalogue
  const standing = M.standingItems().filter((s) => {
    const { reviewState } = require('./allergens');
    return reviewState(s).ok;
  });
  if (standing.length) {
    L.push('', 'ALWAYS AVAILABLE');
    for (const s of standing) {
      const prices = [];
      if (s.full_on && s.full_price != null) prices.push(`${s.full_label} ${money(s.full_price)}`);
      if (s.single_on && s.single_price != null) prices.push(`${s.single_label} ${money(s.single_price)}`);
      const tags = JSON.parse(s.allergens || '[]');
      L.push(`${s.name} — ${prices.join(' · ')}`
        + (s.halal ? ' — halal as declared by the kitchen' : '')
        + (tags.length ? ` — contains ${tags.join(', ')}` : ''));
    }
  }

  // Fulfillment
  const win = T.fmtWindow(settings.get('pickup_start'), settings.get('pickup_end'));
  L.push('', `PICKUP ${win}`);
  for (const l of M.activeLocations()) L.push(`${l.name} — ${l.address}`);
  if (settings.getInt('delivery_enabled', 1)) {
    const { servedAreas } = require('./delivery');
    L.push('', `DELIVERY ${settings.get('delivery_window')} — ${money(settings.getInt('delivery_fee'))}`);
    L.push(`We deliver to: ${servedAreas().join(', ')}`);
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
  buildPostText, postImageFor, manualAdapter, pageAdapter, decrypt,
  GROUPS_SUPPORTED: false,
  scopes: config.facebook.scopes,
};
