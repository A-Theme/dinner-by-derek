'use strict';
/**
 * A QR symbol, drawn from scratch.
 *
 * Used by the business card so the printed code points at the live site. It is
 * here rather than in node_modules because the whole point of this codebase is
 * that the source that ships is the source that runs, and a QR encoder is a
 * few hundred lines of arithmetic with no I/O.
 *
 * Scope, deliberately narrow: byte mode, error correction M or Q, versions 1
 * through 6. Version 7 and up need a version-information block that nothing
 * here would ever exercise, so instead of shipping untested table data the
 * encoder refuses and says so. Six versions at level Q hold 76 bytes — four
 * times the length of any URL this app will ever put on a card.
 *
 * Returns the module matrix only. Drawing it is the caller's problem.
 */

/* --- GF(256) -------------------------------------------------------------
 * The field QR arithmetic happens in: bytes, with the primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11D). Logs turn multiplication into addition;
 * the exponent table is doubled so a sum of two logs never needs a modulo.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** (x - α^0)(x - α^1)…(x - α^(degree-1)), highest coefficient first. */
function generator(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];                    // × x
      next[i + 1] ^= mul(poly[i], EXP[d]);   // × α^d
    }
    poly = next;
  }
  return poly;
}

/** Reed–Solomon remainder: the error-correction codewords for one block. */
function remainder(data, count) {
  const gen = generator(count);
  const work = new Uint8Array(data.length + count);
  work.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) work[i + j] ^= mul(gen[j], factor);
  }
  return Array.from(work.slice(data.length));
}

/* --- Symbol tables --------------------------------------------------------
 * Per version and level: [ecPerBlock, blocksInGroup1, dataPerBlockInGroup1,
 * blocksInGroup2, dataPerBlockInGroup2]. Every row is checked at load against
 * the version's total codeword count, so a typo here fails at require time
 * rather than at a print shop.
 */
const SPEC = {
  M: {
    1: [10, 1, 16], 2: [16, 1, 28], 3: [26, 1, 44],
    4: [18, 2, 32], 5: [24, 2, 43], 6: [16, 4, 27],
  },
  Q: {
    1: [13, 1, 13], 2: [22, 1, 22], 3: [18, 2, 17],
    4: [26, 2, 24], 5: [18, 2, 15, 2, 16], 6: [24, 4, 19],
  },
};

/** Total codewords in a symbol — data plus error correction, all versions. */
const TOTAL = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172 };

/** Centre coordinate of the single alignment pattern. Version 1 has none. */
const ALIGN = { 1: null, 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 };

/** Bits left over after the codewords, which are written as zeroes. */
const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7 };

const LEVEL_BITS = { M: 0b00, Q: 0b11 };

const MAX_VERSION = 6;

for (const [level, versions] of Object.entries(SPEC)) {
  for (const [v, s] of Object.entries(versions)) {
    const [ec, n1, d1, n2 = 0, d2 = 0] = s;
    const blocks = n1 + n2;
    const total = n1 * d1 + n2 * d2 + blocks * ec;
    if (total !== TOTAL[v]) {
      throw new Error(`qr.js: version ${v}-${level} sums to ${total}, expected ${TOTAL[v]}`);
    }
  }
}

const dataCapacity = (version, level) => {
  const [, n1, d1, n2 = 0, d2 = 0] = SPEC[level][version];
  return n1 * d1 + n2 * d2;
};

/* --- Encoding ------------------------------------------------------------- */

/**
 * The payload as a bit array: mode indicator, length, the bytes themselves,
 * terminator, then the two alternating pad bytes the spec names.
 */
function bitstream(bytes, version, level) {
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4);            // byte mode
  push(bytes.length, 8);      // versions 1–9 use an 8-bit count in byte mode
  for (const b of bytes) push(b, 8);

  const capacityBits = dataCapacity(version, level) * 8;
  push(0, Math.min(4, capacityBits - bits.length));       // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const pads = [0xec, 0x11];
  for (let i = 0; bits.length < capacityBits; i++) push(pads[i % 2], 8);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

/**
 * Split into blocks, compute each block's error correction, then interleave.
 *
 * Interleaving is what makes a scuffed corner survivable: a physical smudge
 * lands across several blocks a little rather than one block fatally.
 */
function interleave(codewords, version, level) {
  const [ec, n1, d1, n2 = 0, d2 = 0] = SPEC[level][version];
  const sizes = [...Array(n1).fill(d1), ...Array(n2).fill(d2)];

  const data = [];
  const check = [];
  let at = 0;
  for (const size of sizes) {
    const block = codewords.slice(at, at + size);
    at += size;
    data.push(block);
    check.push(remainder(block, ec));
  }

  const out = [];
  for (let i = 0; i < Math.max(...sizes); i++) {
    for (const block of data) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ec; i++) {
    for (const block of check) out.push(block[i]);
  }
  return out;
}

/* --- The matrix ----------------------------------------------------------- */

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function blank(version) {
  const size = version * 4 + 17;
  return {
    size,
    modules: new Uint8Array(size * size),
    fixed: new Uint8Array(size * size),   // function patterns: never masked
  };
}

/** Set a function module. Coordinates are (column, row), out of range is a no-op. */
function setFixed(m, c, r, dark) {
  if (c < 0 || r < 0 || c >= m.size || r >= m.size) return;
  m.modules[r * m.size + c] = dark ? 1 : 0;
  m.fixed[r * m.size + c] = 1;
}

function drawPatterns(m, version) {
  const size = m.size;

  // Timing first: the alternating row and column that tell a scanner the module
  // pitch. They run the full width, so the finders are drawn over their ends —
  // the other order silently eats the finders' inner edges and produces a
  // symbol that looks plausible and scans as nothing.
  for (let i = 0; i < size; i++) {
    setFixed(m, 6, i, i % 2 === 0);
    setFixed(m, i, 6, i % 2 === 0);
  }

  // Finders, with their separators drawn by the same loop: at Chebyshev
  // distance 2 and 4 from the centre the modules are light, everywhere else
  // in the 9×9 they are dark.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFixed(m, cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }

  const a = ALIGN[version];
  if (a !== null) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFixed(m, a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  // The format information area is not reserved here. drawFormat writes it
  // before any data is placed, and it marks exactly its own fifteen modules —
  // which is the point: a blanket reservation of row 8 and column 8 would also
  // swallow the two timing modules that sit inside them and never get redrawn.
}

/** BCH(15,5) format information, in both of its two copies. */
function drawFormat(m, level, mask) {
  const size = m.size;
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFixed(m, 8, i, bit(i));
  setFixed(m, 8, 7, bit(6));
  setFixed(m, 8, 8, bit(7));
  setFixed(m, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFixed(m, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i++) setFixed(m, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFixed(m, 8, size - 15 + i, bit(i));
  setFixed(m, 8, size - 8, true);
}

/**
 * The codewords, laid in the two-module-wide serpentine that runs up and down
 * from the bottom right, skipping the vertical timing column, with the mask
 * applied as each module is placed.
 */
function drawData(m, codewords, mask) {
  const size = m.size;
  const maskFn = MASKS[mask];
  let bit = 0;
  const total = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (m.fixed[row * size + col]) continue;

        let dark = 0;
        if (bit < total) {
          dark = (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1;
          bit++;
        }
        if (maskFn(row, col)) dark ^= 1;
        m.modules[row * size + col] = dark;
      }
    }
  }
}

/** The four penalty rules. Lowest total wins the mask. */
function penalty(m) {
  const size = m.size;
  const at = (r, c) => m.modules[r * size + c];
  let score = 0;

  // Rule 1 — runs of five or more of one shade, in both directions.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const cur = horizontal ? at(i, j) : at(j, i);
        const prev = horizontal ? at(i, j - 1) : at(j - 1, i);
        if (cur === prev) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }

  // Rule 2 — every 2×2 block of one shade.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3 — the finder-lookalike 1:1:3:1:1 run with four light modules beside it.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      let rowA = true, rowB = true, colA = true, colB = true;
      for (let k = 0; k < 11; k++) {
        if (at(i, j + k) !== A[k]) rowA = false;
        if (at(i, j + k) !== B[k]) rowB = false;
        if (at(j + k, i) !== A[k]) colA = false;
        if (at(j + k, i) !== B[k]) colB = false;
      }
      if (rowA) score += 40;
      if (rowB) score += 40;
      if (colA) score += 40;
      if (colB) score += 40;
    }
  }

  // Rule 4 — drift away from an even split of dark and light.
  let dark = 0;
  for (let i = 0; i < m.modules.length; i++) dark += m.modules[i];
  const percent = (dark * 100) / m.modules.length;
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/* --- Entry point ---------------------------------------------------------- */

/**
 * Encode `text` and return `{ size, modules, version, level, mask }`, where
 * `modules` is a row-major Uint8Array of 0 (light) and 1 (dark) with no quiet
 * zone. Callers must leave four modules of quiet zone when drawing, or no
 * scanner will find the symbol.
 */
function encode(text, { level = 'Q' } = {}) {
  if (!LEVEL_BITS.hasOwnProperty(level)) {
    throw new Error(`qr.js: error correction level ${level} is not supported (M or Q)`);
  }
  const bytes = Array.from(Buffer.from(String(text), 'utf8'));

  let version = null;
  for (let v = 1; v <= MAX_VERSION; v++) {
    // 4 mode bits + 8 length bits + the payload, rounded up to whole codewords.
    if (Math.ceil((12 + bytes.length * 8) / 8) <= dataCapacity(v, level)) {
      version = v;
      break;
    }
  }
  if (version === null) {
    throw new Error(
      `qr.js: ${bytes.length} bytes does not fit in version ${MAX_VERSION} at level ${level}. ` +
      'Shorten the text, or extend this encoder to versions 7 and up.'
    );
  }

  // The remainder bits past the last codeword are left light before masking,
  // which is what drawData does once it runs out of data, so REMAINDER is
  // documentation rather than something to append here.
  const codewords = interleave(bitstream(bytes, version, level), version, level);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = blank(version);
    drawPatterns(m, version);
    drawFormat(m, level, mask);
    drawData(m, codewords, mask);
    const score = penalty(m);
    if (best === null || score < best.score) best = { score, mask, m };
  }

  return {
    size: best.m.size,
    modules: best.m.modules,
    version,
    level,
    mask: best.mask,
  };
}

module.exports = { encode, MAX_VERSION };
