'use strict';
/**
 * Dinner By Derek — application entry point.
 *
 * Everything the app needs is wired here and nowhere else: configuration,
 * body parsing, static files, the four route modules, and a single error
 * handler that never shows the owner a stack trace.
 *
 * Run with:  node server/index.js
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const config = require('./config');
const { db } = require('./db');

const app = express();

/* Behind nginx, so req.ip and req.protocol should reflect the real client. */
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('etag', 'strong');

/* --- Body parsing --------------------------------------------------------
 * Three shapes arrive: ordinary form posts, JSON from the small fetch APIs,
 * and multipart (photo uploads, the backup restore, and the autosave posts
 * which use FormData even when they carry no file at all).
 */
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 26 * 1024 * 1024, files: 2, fields: 200 },
});

/**
 * Accept any multipart body, put its text fields on req.body the way the
 * routes expect, and hand the first file to req.uploadBuffer. Size and type
 * are judged later by images.js, which sniffs the actual bytes.
 */
app.use((req, res, next) => {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('multipart/form-data')) return next();
  upload.any()(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than 25 MB. Try a smaller photo.'
        : "That upload didn't come through. Try again.";
      if (req.path.startsWith('/admin/api/')) return res.status(400).json({ error: message });
      return res.status(400).type('text/plain').send(message);
    }
    if (req.files && req.files.length) req.uploadBuffer = req.files[0].buffer;
    next();
  });
});

/* --- Static files --------------------------------------------------------
 * The shell is versioned by the service worker, so it can be cached hard;
 * the service worker itself must never be, or a bad release would stick.
 */
const publicDir = path.join(config.root, 'public');

app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(publicDir, 'sw.js'));
});

/* Generated graphics are mounted ahead of publicDir so a set made from the
 * dashboard wins over the copy committed to the repo, and a fresh install that
 * has generated nothing yet still has a link preview to serve. They get a short
 * max-age rather than the shell's seven days: they are a handful of small PNGs
 * fetched rarely, and a week-long cache on an image the owner just regenerated
 * from a phone reads as the button having done nothing. */
const graphics = require('./graphics');
for (const [key, dir] of Object.entries(graphics.dirs)) {
  fs.mkdirSync(dir, { recursive: true });
  app.use(graphics.SETS[key].urlBase, express.static(dir, {
    index: false,
    dotfiles: 'deny',
    maxAge: config.isProd ? '1h' : 0,
  }));
}

app.use(express.static(publicDir, {
  maxAge: config.isProd ? '7d' : 0,
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store');
  },
}));

/* Uploaded photos are served as inert bytes: never inline HTML, never sniffed
 * into something executable, never listed. */
fs.mkdirSync(config.uploadDir, { recursive: true });
app.use('/uploads', express.static(config.uploadDir, {
  index: false,
  dotfiles: 'deny',
  maxAge: '30d',
  setHeaders(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', 'inline');
  },
}));

/* --- Routes -------------------------------------------------------------- */
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const adminRoutes2 = require('./routes/admin2');
const adminRoutes3 = require('./routes/admin3');

/* Mount order matters. admin.js applies `auth.required` to everything passing
 * through it, which redirects to the login page — right for a dashboard page,
 * wrong for a CSV download or a print sheet, which should get a bare 401 and no
 * body. Those routes live in admin3's `strict` router, which carries no blanket
 * middleware of its own and so can safely go first: requests it doesn't match
 * fall straight through to the routers below. */
app.use('/admin', adminRoutes3.strict);
app.use('/admin', adminRoutes);
app.use('/admin', adminRoutes2.router);
app.use('/admin', adminRoutes3.router);
app.use('/', publicRoutes);

/* --- Not found ----------------------------------------------------------- */
app.use((req, res) => {
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).type('html').send(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/app.css">
<main class="wrap"><div class="card"><h1>That page isn't here.</h1>
<p><a class="btn btn--primary" href="/">Go to this week's menu</a></p></div></main>`);
});

/* --- Errors --------------------------------------------------------------
 * The owner sees a sentence they can act on. The detail goes to the log.
 */
app.use((err, req, res, next) => {                    // eslint-disable-line no-unused-vars
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(500).json({ error: 'Something went wrong. Try that again.' });
  }
  res.status(500).type('html').send(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/app.css">
<main class="wrap"><div class="card"><h1>Something went wrong.</h1>
<p>Nothing was lost. Go back and try that again.</p>
<p><a class="btn btn--primary" href="/admin">Back to the dashboard</a></p></div></main>`);
});

/* --- Background job: Facebook token expiry warning -----------------------
 * A token that quietly dies is the failure the owner would notice last, so
 * warn once at seven days out. Checked hourly; harmless if it never fires.
 */
const mailer = require('./mailer');
const WARN_MS = 7 * 24 * 60 * 60 * 1000;

function checkTokenExpiry() {
  try {
    const row = db.prepare('SELECT * FROM fb_connection WHERE id = 1').get();
    if (!row || !row.expires_at || row.warned_at) return;
    const left = new Date(row.expires_at).getTime() - Date.now();
    if (left > 0 && left <= WARN_MS) {
      const days = Math.max(1, Math.round(left / 86_400_000));
      mailer.tokenExpiryEmail(days, row.page_name || 'your Page')
        .catch((e) => console.error('[email] token warning', e));
      db.prepare('UPDATE fb_connection SET warned_at = ? WHERE id = 1')
        .run(new Date().toISOString());
    }
  } catch (e) {
    console.error('[job] token expiry check', e);
  }
}

/* --- Start --------------------------------------------------------------- */
const server = app.listen(config.port, () => {
  console.log(`\nDinner By Derek is running.`);
  console.log(`  Customers:  ${config.baseUrl}/`);
  console.log(`  Dashboard:  ${config.baseUrl}/admin`);
  console.log(`  Database:   ${config.dbPath}`);
  console.log(`  Uploads:    ${config.uploadDir}\n`);
  checkTokenExpiry();
  setInterval(checkTokenExpiry, 60 * 60 * 1000).unref();
});

function shutdown(signal) {
  console.log(`\n${signal} — shutting down.`);
  server.close(() => { try { db.close(); } catch (e) {} process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
module.exports.server = server;
