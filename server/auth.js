'use strict';
const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'dbd_admin';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;   // a month; the owner shouldn't relogin daily

function sign(payload) {
  const h = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
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
    secure: config.isProd,
    maxAge: TTL_MS,
    path: '/',
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Constant-time password comparison. */
function passwordMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(config.adminPassword);
  if (a.length !== b.length) {
    // Still burn the comparison so length isn't a timing oracle.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** HTML routes redirect to login; API routes get a bare 401. */
function required(req, res, next) {
  if (verify(req.cookies && req.cookies[COOKIE])) return next();
  if (req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json') {
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
