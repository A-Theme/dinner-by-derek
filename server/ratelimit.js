'use strict';

/**
 * Small in-memory limiter. Sized for a single-operator supper club behind one
 * nginx instance; no store, no dependency. Buckets are pruned lazily.
 */
const buckets = new Map();

function rateLimit(name, max, windowMs) {
  return function (req, res, next) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      return res.status(429).type('text/plain')
        .send('Too many attempts. Please wait a minute and try again.');
    }
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    next();
  };
}

module.exports = { rateLimit };
