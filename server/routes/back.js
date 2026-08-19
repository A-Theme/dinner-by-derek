'use strict';
const config = require('../config');

/**
 * Send the owner back to the page they posted from, carrying a sentence.
 *
 * The destination comes from the Referer header, which is the browser's word
 * and not the app's. It was never an open redirect — only the path and query
 * survive, so a referer naming another host reduces to a path on this one —
 * but it was not checked either, and it landed wherever the string pointed.
 * "javascript:alert(1)" parses to the relative path `alert(1)`, which the
 * browser resolved against the current page and turned into a 404 for someone
 * who had just saved a form successfully.
 *
 * Every caller is an admin route redirecting to an admin page, so anything
 * that isn't one is not where the owner came from and the dashboard is a
 * better answer than a guess.
 *
 * One copy, because there were three — the same eight lines in admin.js,
 * admin2.js and admin3.js, which is three places for the next fix to be
 * applied in two of.
 */
function back(res, req, ok, err) {
  let target = '/admin';
  try {
    const u = new URL(req.get('referer') || '/admin', config.baseUrl);
    if (u.pathname === '/admin' || u.pathname.startsWith('/admin/')) {
      u.searchParams.delete('ok');
      u.searchParams.delete('err');
      if (ok) u.searchParams.set('ok', ok);
      if (err) u.searchParams.set('err', err);
      return res.redirect(303, u.pathname + u.search);
    }
  } catch (e) {
    // A referer that isn't a URL at all. The fallback below is the answer.
  }
  const q = new URLSearchParams();
  if (ok) q.set('ok', ok);
  if (err) q.set('err', err);
  const s = q.toString();
  return res.redirect(303, s ? `${target}?${s}` : target);
}

module.exports = { back };
