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

function matches(given, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, key] = parts;
  try {
    const expected = Buffer.from(key, 'base64url');
    /* The length to derive comes from the stored hash, so that raising keylen
     * later doesn't strand what is already written. That makes the floor
     * necessary rather than decorative: without it a hash truncated in the
     * file would be compared against an equally truncated derivation and
     * still let the password through, quietly weakened. */
    if (expected.length < 32) return false;
    const actual = crypto.scryptSync(String(given), Buffer.from(salt, 'base64url'),
      expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM });
    return sameBytes(actual, expected);
  } catch {
    return false;                 // a malformed hash refuses everything
  }
}

module.exports = { hash, matches, sameBytes, PARAMS };
