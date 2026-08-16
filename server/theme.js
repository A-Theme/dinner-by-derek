'use strict';
const fs = require('fs');
const path = require('path');

/**
 * theme.css is the single source of colour truth. A handful of places need a
 * literal hex rather than a CSS variable — the manifest's theme_color and
 * background_color, the <meta name="theme-color">, generated icon padding, and
 * the branded email palette. Rather than restate the values here (and let them
 * drift), the file is parsed at boot.
 *
 * Consequence: `grep -rn '#[0-9A-Fa-f]\{6\}' --include=*.js --include=*.css`
 * outside theme.css returns nothing.
 */

const themePath = path.join(__dirname, '..', 'public', 'theme.css');
const css = fs.readFileSync(themePath, 'utf8');

const palette = {};
for (const m of css.matchAll(/--dbd-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
  palette[m[1]] = m[2];
}

const required = ['olive', 'tan', 'umber', 'parchment', 'espresso', 'ochre'];
for (const key of required) {
  if (!palette[key]) throw new Error(`theme.css is missing --dbd-${key}`);
}

module.exports = { palette, themePath };
