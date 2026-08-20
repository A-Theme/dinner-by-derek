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
const auth = require('./auth');
const { db } = require('./db');

const app = express();

/* Only when TRUST_PROXY says so — see the note in config.js. Behind nginx it
 * makes req.ip and req.protocol reflect the real client; exposed directly it
 * would let the caller name their own address and walk past the login limit. */
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.set('etag', 'strong');

/* --- Body parsing --------------------------------------------------------
 * Three shapes arrive: ordinary form posts, JSON from the small fetch APIs,
 * and multipart (photo uploads, the backup restore, and the autosave posts
 * which use FormData even when they carry no file at all).
 */
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

/* Neither parser sets req.body when it does not recognise the body, and a POST
 * with no Content-Type at all is the easy way to arrive here with nothing.
 * Every route downstream reads req.body.something straight off, so that
 * undefined was a TypeError and a 500 — the server reporting a fault of its
 * own for what was only a malformed request. An empty object hands the
 * question back to the route, which already knows what to say: the login page
 * answers "that password isn't right" rather than crashing, and the rate
 * limiter still counts the attempt. */
app.use((req, res, next) => { if (!req.body) req.body = {}; next(); });

app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 26 * 1024 * 1024, files: 2, fields: 200 },
});

/**
 * Accept a multipart body, put its text fields on req.body the way the routes
 * expect, and hand the first file to req.uploadBuffer. Size and type are
 * judged later by images.js, which sniffs the actual bytes.
 *
 * Mounted under /admin and behind the session check, because every multipart
 * body this app has a use for is one the owner sent: the photo upload, the
 * backup restore, and the autosave posts. Parsing before that check meant a
 * caller with no session could hand the process 25 MB to hold, at any path,
 * including ones that do not exist — read, buffered, and only then thrown
 * away by a 404. Eight concurrent 20 MB posts to /admin/api/upload moved the
 * server 232 MB; refused here they move it 81 MB.
 *
 * That 81 MB is the honest limit of what this file can do. Refusing early
 * stops the bytes being *held* — no multer buffer, no 25 MB per connection —
 * but they are still sent, and Node still reads and discards them. Capping
 * the body before it reaches Node is the proxy's job: set client_max_body_size
 * to something a little over 25 MB when this goes behind nginx.
 *
 * Mounting on /admin rather than testing the path inside also means req.path
 * is already admin-relative, so auth.required decides the unauthenticated
 * answer exactly as it does for every other admin route — a 401 for the API,
 * the login redirect for a form.
 */
app.use('/admin', (req, res, next) => {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('multipart/form-data')) return next();
  /* Never reaches next(): verify has already said no. */
  if (!auth.verify(req.cookies && req.cookies[auth.COOKIE])) return auth.required(req, res, next);
  upload.any()(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than 25 MB. Try a smaller photo.'
        : "That upload didn't come through. Try again.";
      if (req.path.startsWith('/api/')) return res.status(400).json({ error: message });
      return res.status(400).type('text/plain').send(message);
    }
    if (req.files && req.files.length) req.uploadBuffer = req.files[0].buffer;
    req.multipartParsed = true;
    next();
  });
});

/* Anywhere the middleware above did not claim, multipart is not a shape this
 * app accepts. Saying so beats parsing it into a req.body nobody reads, and
 * beats the silence of leaving req.body empty and letting a route blame the
 * caller for a field they did send. */
app.use((req, res, next) => {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('multipart/form-data')) return next();
  if (req.multipartParsed) return next();          // already handled, under /admin
  return res.status(415).type('text/plain').send('Unsupported content type.');
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
/* --- Security headers -----------------------------------------------------
 * Everything this app loads it also serves — no CDN, no font host, no
 * analytics — so 'self' is the whole allowance and anything a page tries to
 * reach past it is a bug or an injection.
 *
 * Inline script is refused outright. That is only sayable because the handful
 * of onclick attributes and the one inline config blob were moved into the
 * script files first; leaving them and adding 'unsafe-inline' would have been
 * a header that describes nothing.
 *
 * Inline *style* is still allowed. Seventy-odd style attributes sit in the
 * views, several computing a width from a number, and an injected style
 * cannot do what an injected script can. Worth revisiting, not worth blocking
 * this on.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",                    // photos, icons and graphics are all ours
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",            // nobody frames the dashboard
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.set('Content-Security-Policy', CSP);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');            // for anything still reading it
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  /* Only worth sending where the browser can act on it, and only true once
   * the site is actually reachable over https. Sent from an http address it
   * is ignored; sent from a site that later has to fall back to http it is a
   * promise nobody can keep. */
  if (config.cookieSecure) {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

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

/* --- Background job: scheduled publishing --------------------------------
 * Checked every minute rather than hourly, because the owner sets a time and
 * expects that time. The query is one indexed read over a handful of rows.
 *
 * The gate is not negotiable here: publish.js runs the same allergen check the
 * button runs, and a week that fails it stays a draft and emails the owner
 * instead of going out. Never throws into the interval — a failed publish must
 * not take the timer down with it.
 */
const publish = require('./publish');

function runScheduledPublish() {
  try {
    publish.runDue({
      onPublished(week) {
        console.log(`[publish] ${week.title || week.slug} went live on schedule`);
        mailer.weekPublishedEmail(week).catch((e) => console.error('[email] published', e));
      },
      onRefused(week, blockers) {
        console.warn(`[publish] refused ${week.title || week.slug}: ${blockers[0]}`);
        mailer.weekPublishRefusedEmail(week, blockers)
          .catch((e) => console.error('[email] publish refused', e));
      },
    });
  } catch (e) {
    console.error('[job] scheduled publish', e);
  }

  // Separately, because it is the case the publisher cannot see: a week that
  // was never built has no draft row to be due, and would otherwise pass in
  // total silence.
  try {
    publish.runMissingWeek({
      onMissing(miss) {
        console.warn(`[publish] nothing built for the week of ${miss.weekStart}`);
        mailer.weekMissingEmail(miss).catch((e) => console.error('[email] week missing', e));
      },
    });
  } catch (e) {
    console.error('[job] missing week reminder', e);
  }
}

/* --- Start ---------------------------------------------------------------
 * Three settings are safe on a laptop and wrong on a public address, and each
 * fails silently rather than loudly, so they are said out loud at boot.
 */
function warnAboutExposure() {
  const notes = [];
  if (config.baseUrl.startsWith('https://') === false && config.isProd) {
    notes.push('BASE_URL is not https, so the login cookie is sent in the clear.');
  }
  if (!config.adminPasswordHash) {
    notes.push('ADMIN_PASSWORD is stored in the clear. Run `npm run password` to hash it.');
  } else if (config.adminPassword) {
    notes.push('ADMIN_PASSWORD is still in .env next to the hash, which is the '
      + 'copy that matters. Delete that line.');
  }
  if (config.isProd && config.trustProxy === false) {
    notes.push('TRUST_PROXY is off. Behind nginx set TRUST_PROXY=1, or every '
      + 'visitor shares one rate-limit bucket.');
  }
  if (!notes.length) return;
  console.log('  Worth fixing before this is public:');
  for (const n of notes) console.log(`    - ${n}`);
  console.log('');
}

const server = app.listen(config.port, () => {
  console.log(`\nDinner By Derek is running.`);
  console.log(`  Customers:  ${config.baseUrl}/`);
  console.log(`  Dashboard:  ${config.baseUrl}/admin`);
  console.log(`  Database:   ${config.dbPath}`);
  console.log(`  Uploads:    ${config.uploadDir}\n`);
  warnAboutExposure();
  checkTokenExpiry();
  setInterval(checkTokenExpiry, 60 * 60 * 1000).unref();
  runScheduledPublish();
  setInterval(runScheduledPublish, 60 * 1000).unref();
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
