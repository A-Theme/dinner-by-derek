'use strict';
const { db, settings } = require('./db');

/**
 * Delivery eligibility, behind a strategy interface.
 *
 * A strategy is:
 *   {
 *     id: string,
 *     check(rawInput) -> {
 *       ok: boolean,
 *       reason: 'invalid' | 'out_of_area' | null,
 *       normalized, fsa, zoneName, fee (cents)
 *     }
 *   }
 *
 * Two strategies are contemplated. Only `postal_code` is built.
 *
 * --- SEAM FOR A FUTURE `radius` STRATEGY --------------------------------
 * A radius implementation would satisfy the same shape: take the raw address
 * input, resolve it to coordinates, measure against a configured origin and
 * maximum distance, and return the same result object with `fsa`/`zoneName`
 * left null and `fee` derived from distance bands. `resolve()` below is the
 * only place that would need to learn about it, and the order pipeline calls
 * nothing else.
 *
 * Deliberately NOT built here: no geocoder, no Maps SDK, no distance maths,
 * no API key, no cloud project. Adding one is a stop-and-ask, not a decision
 * this file gets to make on its own.
 * ------------------------------------------------------------------------
 */

// Canadian postal codes never use D, F, I, O, Q or U, and never start with W or Z.
const CA_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

/** Uppercase, strip everything that is not a letter or digit. */
function normalizePostal(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const postalCodeStrategy = {
  id: 'postal_code',
  check(raw) {
    const normalized = normalizePostal(raw);
    if (!CA_POSTAL.test(normalized)) {
      return { ok: false, reason: 'invalid', normalized, fsa: null, zoneName: null, fee: 0 };
    }
    const fsa = normalized.slice(0, 3);
    const row = db.prepare(`
      SELECT f.code, z.name AS zone_name, z.fee AS zone_fee
      FROM fsas f LEFT JOIN zones z ON z.id = f.zone_id
      WHERE f.code = ?`).get(fsa);

    if (!row) {
      return { ok: false, reason: 'out_of_area', normalized, fsa, zoneName: null, fee: 0 };
    }
    // A zone fee overrides the flat fee. One zone covering every FSA is the
    // flat-fee case, so both configurations run the same code path.
    const fee = row.zone_fee !== null && row.zone_fee !== undefined
      ? row.zone_fee
      : settings.getInt('delivery_fee', 0);

    return { ok: true, reason: null, normalized, fsa, zoneName: row.zone_name || null, fee };
  },
};

const STRATEGIES = { postal_code: postalCodeStrategy };

function resolve() {
  return STRATEGIES[settings.get('delivery_strategy', 'postal_code')] || postalCodeStrategy;
}

/**
 * The authoritative check. Called on submit, server-side, always.
 * A client-sent eligibility flag or fee is never trusted or even read.
 */
function check(raw) {
  return resolve().check(raw);
}

/** Human list of served areas, for the out-of-area message. */
function servedAreas() {
  return db.prepare('SELECT code FROM fsas ORDER BY code').all().map((r) => r.code);
}

function fsaUsage() {
  return db.prepare(`
    SELECT f.code, z.name AS zone_name, z.fee AS zone_fee,
           (SELECT COUNT(*) FROM orders o WHERE o.fsa = f.code) AS uses
    FROM fsas f LEFT JOIN zones z ON z.id = f.zone_id
    ORDER BY f.code`).all();
}

module.exports = { check, normalizePostal, servedAreas, fsaUsage, CA_POSTAL };
