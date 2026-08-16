'use strict';
/**
 * Minimal server-side rendering. Tagged templates escape interpolated values
 * by default; `raw()` opts a fragment out. No view engine, no build step, and
 * everything a Facebook crawler needs is present in the first response.
 */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

class Raw { constructor(v) { this.v = String(v); } toString() { return this.v; } }
const raw = (v) => new Raw(v);

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let piece;
    if (v instanceof Raw) piece = v.v;
    else if (Array.isArray(v)) piece = v.map((x) => (x instanceof Raw ? x.v : escapeHtml(x))).join('');
    else if (v === null || v === undefined || v === false) piece = '';
    else piece = escapeHtml(v);
    out += piece + strings[i + 1];
  }
  return new Raw(out);
}

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

/** Attribute-safe JSON for data-* payloads. */
const jsonAttr = (obj) => escapeHtml(JSON.stringify(obj));

module.exports = { html, raw, escapeHtml, money, jsonAttr };
