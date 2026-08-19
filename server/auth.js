'use strict';
const crypto = require('crypto');
const config = require('./config');
const P = require('./password');

const COOKIE = 'dbd_admin';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;   // a month; the owner shouldn't relogin daily

/**
 * The signing key folds in the current password, so changing the password
 * stops every outstanding cookie from verifying. Without that, a leaked
 * session outlived the password that produced it by up to a month, and the
 * only real revocation lever was rotating SESSION_SECRET — which nothing told
 * you about at the moment you needed it. Rotating the secret still works.
 */
const KEY = crypto.createHmac('sha256', config.sessionSecret)
  .update(`dbd-session-v1:${config.adminVerifier}`)
  .digest();

function sign(payload) {
  const h = crypto.createHmac('sha256', KEY).update(payload).digest('base64url');
  return `${payload}.${h}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return false;
  const i = token.lastIndexOf('.');
  const payload = token.slice(0, i);
  const expected = sign(payload);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const issued = Number(payload.split(':')[1]);
  return Number.isFinite(issued) && Date.now() - issued < TTL_MS;
}

function issue(res) {
  const token = sign(`admin:${Date.now()}`);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: TTL_MS,
    path: '/',
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/**
 * Constant-time password check, hashed or plain depending on what's set.
 *
 * Returns a PROMISE. It has to be awaited — an un-awaited promise is an object,
 * an object is truthy, and `if (!auth.passwordMatches(x))` would then admit
 * everyone. There is one caller and it awaits; the flow suite posts a wrong
 * password over HTTP and expects to be refused, which is the check that would
 * catch this going wrong.
 */
async function passwordMatches(given) {
  const s = String(given || '');
  if (config.adminPasswordHash) return P.matches(s, config.adminPasswordHash);
  return P.sameBytes(Buffer.from(s), Buffer.from(config.adminPassword));
}

/**
 * HTML routes redirect to login; API routes get a bare 401.
 *
 * The autosave posts count as API routes even though their paths do not say so.
 * They are fetches, and a redirect answered a fetch with the login page and a
 * 200 — so `r.ok` was true, the week builder wrote "Saved", and nothing had
 * been saved. An owner could type a whole week into a dashboard whose session
 * had quietly expired, be told it was saved after every keystroke, and lose all
 * of it. The X-Draft header is the same marker the routes already use to answer
 * an autosave with JSON instead of a redirect.
 */
function required(req, res, next) {
  if (verify(req.cookies && req.cookies[COOKIE])) return next();
  if (req.path.startsWith('/api/') || req.get('X-Draft')
      || req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}

/** Exports and backups: 401 rather than a redirect, so nothing leaks a body. */
function requiredStrict(req, res, next) {
  if (verify(req.cookies && req.cookies[COOKIE])) return next();
  return res.status(401).type('text/plain').send('Not authorized.');
}

module.exports = { COOKIE, issue, clear, verify, required, requiredStrict, passwordMatches };
