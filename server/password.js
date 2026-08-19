'use strict';
const crypto = require('crypto');

/**
 * How a password is stored, kept apart from auth.js so that the tool which
 * writes the hash doesn't have to load config.js — which exits on a missing
 * ADMIN_PASSWORD, exactly the state you are in when you first run it.
 *
 * The stored form carries its own parameters and salt:
 *   scrypt$N$r$p$salt$key      (salt and key base64url)
 * so the cost can be raised later without stranding the hash already written.
 */
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 };
const MAXMEM = 256 * 1024 * 1024;

/** Constant-time comparison that tolerates a length mismatch. */
function sameBytes(a, b) {
  if (a.length !== b.length) {
    // Still burn a comparison so length isn't a timing oracle.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function hash(plain, params = PARAMS) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, params.keylen, {
    N: params.N, r: params.r, p: params.p, maxmem: MAXMEM,
  });
  return [
    'scrypt', params.N, params.r, params.p,
    salt.toString('base64url'), key.toString('base64url'),
  ].join('$');
}

/**
 * What a stored hash says, or null if it doesn't say it.
 *
 * The two verifiers below differ only in which scrypt they call, so what
 * counts as a usable stored form is decided once, here, rather than twice.
 */
function parse(stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, N, r, p, salt, key] = parts;
  try {
    const expected = Buffer.from(key, 'base64url');
    /* The length to derive comes from the stored hash, so that raising keylen
     * later doesn't strand what is already written. That makes the floor
     * necessary rather than decorative: without it a hash truncated in the
     * file would be compared against an equally truncated derivation and
     * still let the password through, quietly weakened. */
    if (expected.length < 32) return null;
    return {
      salt: Buffer.from(salt, 'base64url'),
      expected,
      opts: { N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM },
    };
  } catch {
    return null;
  }
}

/**
 * Verify, without stopping the server to do it.
 *
 * scrypt is meant to be slow — that is the whole of its value — and scryptSync
 * spends that slowness on the one thread everything else in this process runs
 * on. A wrong password therefore cost every other request in flight: eight of
 * them at once, which is all the rate limiter permits from one address, held
 * an ordinary customer page for 280ms. Handed to the threadpool instead it
 * costs the guesser exactly as much and everyone else nothing.
 *
 * Async is the only verifier the server has. A synchronous one kept beside it
 * would eventually be the one somebody called, and the failure would not look
 * like a bug — it would look like the site being slow under load.
 */
async function matches(given, stored) {
  const p = parse(stored);
  if (!p) return false;                 // a malformed hash refuses everything
  try {
    const actual = await new Promise((resolve, reject) => {
      crypto.scrypt(String(given), p.salt, p.expected.length, p.opts,
        (err, key) => (err ? reject(err) : resolve(key)));
    });
    return sameBytes(actual, p.expected);
  } catch {
    return false;
  }
}

/**
 * The same answer, synchronously, for the two callers that are not the server:
 * `npm run password`, which has nothing else to be getting on with, and the
 * acceptance suite, which is a straight line of checks with no event loop to
 * protect. Never reach for this from a route.
 */
function matchesSync(given, stored) {
  const p = parse(stored);
  if (!p) return false;
  try {
    return sameBytes(crypto.scryptSync(String(given), p.salt, p.expected.length, p.opts),
      p.expected);
  } catch {
    return false;
  }
}

module.exports = { hash, matches, matchesSync, sameBytes, PARAMS };
