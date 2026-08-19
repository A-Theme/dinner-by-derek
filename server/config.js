'use strict';
require('dotenv').config({ quiet: true });
const path = require('path');

const root = path.join(__dirname, '..');

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\nMissing required environment variable: ${name}`);
    console.error(`Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return v;
}

/**
 * The password is kept either hashed (ADMIN_PASSWORD_HASH, written by
 * `npm run password`) or in the clear (ADMIN_PASSWORD). One or the other is
 * required; the hash wins when both are present.
 */
const adminPasswordHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
const adminPassword = adminPasswordHash
  ? (process.env.ADMIN_PASSWORD || '')
  : req('ADMIN_PASSWORD');

const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
  .replace(/\/$/, '');

/**
 * How many proxies stand in front of us, and so how far to believe
 * X-Forwarded-For. Off unless stated, because `req.ip` is what the login
 * limiter counts against: trusting a header nobody is rewriting lets a caller
 * name a fresh address on every request and never reach the limit. Behind
 * nginx, set TRUST_PROXY=1. Forgetting it is the harmless direction — every
 * caller shares one bucket, which is strict rather than open.
 */
function trustProxySetting() {
  const v = (process.env.TRUST_PROXY || '').trim();
  if (!v || v === 'false' || v === '0') return false;
  if (v === 'true') return 1;
  if (/^\d+$/.test(v)) return Number(v);
  return v;                       // 'loopback', a CIDR, a comma-separated list
}

module.exports = {
  root,
  port: Number(process.env.PORT || 3000),
  baseUrl,
  adminPassword,
  adminPasswordHash,
  /* What the session cookie is signed against, so that changing the password
   * retires every cookie issued under the old one. */
  adminVerifier: adminPasswordHash || adminPassword,
  sessionSecret: req('SESSION_SECRET'),
  trustProxy: trustProxySetting(),
  /* Secure cookies follow the address the browser actually used rather than
   * NODE_ENV: an https BASE_URL with NODE_ENV unset used to hand the session
   * out in the clear. */
  cookieSecure: baseUrl.startsWith('https://'),
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY || '',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'dinnerbyderek.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  facebook: {
    appId: process.env.FB_APP_ID || '',
    appSecret: process.env.FB_APP_SECRET || '',
    graphVersion: process.env.FB_GRAPH_VERSION || 'v21.0',
    // Minimum set required to publish to a Page. Justified in README.
    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  },
  isProd: process.env.NODE_ENV === 'production',
};
