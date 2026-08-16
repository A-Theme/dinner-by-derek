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

module.exports = {
  root,
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  adminPassword: req('ADMIN_PASSWORD'),
  sessionSecret: req('SESSION_SECRET'),
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
