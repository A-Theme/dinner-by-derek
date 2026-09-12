'use strict';
/**
 * The backing track, synthesised rather than sourced.
 *
 * WHERE THIS COMES FROM, because it is the same question the recipe seed has
 * to answer. Nothing here is sampled, transcribed or downloaded. It is a few
 * hundred lines of arithmetic writing sine waves and filtered noise into a
 * WAV, so the result carries no licence, no attribution requirement and no
 * third party who can change their mind about it later. A stock-music track
 * would sound better and would also be somebody else's, on somebody else's
 * terms, in a repository that has to survive a takedown notice.
 *
 * The genre is chosen to suit the method as much as the video: lo-fi wants a
 * dull top end, a soft attack and audible noise, all of which are what crude
 * synthesis produces anyway. Trying for a bright, dry recording with these
 * tools would sound broken. Trying for this sounds intentional.
 *
 * Run: npm run music
 */

const fs = require('fs');
const path = require('path');

const RATE = 44100;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/* 100 bars is five and a half minutes at this tempo, a little past the 5:16
   tour, so the composition always ends on the track's own fade rather than
   running out under the closing card. A longer video wants more bars. */
const BARS = 100;
const TAIL = 2.5;
const LENGTH = BARS * BAR + TAIL;
const N = Math.ceil(LENGTH * RATE);

/* Swing: where the second eighth of each beat actually lands. Straight is
   0.5; jazz sits nearer two thirds. 0.62 is a lazy shuffle rather than a
   hard triplet, which is the difference between a groove and a limp. */
const SWING = 0.62;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * The turnaround, one bar each: Fmaj7 - Dm7 - Gm7 - C7.
 *
 * Voiced without roots in the right hand, because the bass has the root and
 * doubling it an octave up is what makes a synthesised chord sound like a
 * calculator. The voicings are chosen to move as little as possible between
 * chords -- the top voice barely shifts across the whole loop, which is what
 * keeps a four-bar repeat from announcing itself every four bars.
 */
const SECTION_A = [
  { bass: 41, voices: [69, 72, 76, 79] }, // Fmaj7  : A  C  E  G
  { bass: 38, voices: [69, 72, 77, 81] }, // Dm7    : A  C  F  A
  { bass: 43, voices: [70, 74, 77, 81] }, // Gm7    : Bb D  F  A
  { bass: 36, voices: [70, 74, 76, 79] }, // C7(9)  : Bb D  E  G
];

/* The bridge: IV - iii - ii - V. Four minutes of one four-bar loop is where
   background music turns into a dripping tap, so every fourth phrase goes
   somewhere else and comes back -- AABA, the oldest trick in the book. */
const SECTION_B = [
  { bass: 46, voices: [69, 72, 74, 77] }, // Bbmaj7 : A  C  D  F
  { bass: 45, voices: [67, 71, 72, 76] }, // Am9    : G  B  C  E
  { bass: 43, voices: [70, 74, 77, 81] }, // Gm7    : Bb D  F  A
  { bass: 36, voices: [70, 74, 76, 79] }, // C7(9)  : Bb D  E  G
];

/** The chord for a bar, following the AABA form four bars at a time. */
function chordAt(barIndex) {
  const section = Math.floor(barIndex / 4) % 4 === 2 ? SECTION_B : SECTION_A;
  return section[barIndex % 4];
}

const left = new Float64Array(N);
const right = new Float64Array(N);

function add(t, dur, fn) {
  const start = Math.floor(t * RATE);
  const end = Math.min(N, start + Math.ceil(dur * RATE));
  for (let i = Math.max(0, start); i < end; i++) {
    const local = (i - start) / RATE;
    const [l, r] = fn(local);
    left[i] += l;
    right[i] += r;
  }
}

/**
 * A Rhodes-ish tone: fundamental plus a bell-like partial that dies away
 * faster than the body does. Real electric pianos have a tine attack far more
 * complex than this, but the part that reads as "electric piano" rather than
 * "sine wave" is mostly that the harmonics decay at different rates.
 */
function rhodes(freq, amp, pan, drift) {
  return (t) => {
    const env = Math.exp(-t * 1.5) * (1 - Math.exp(-t * 220));
    const bell = Math.exp(-t * 5.5);
    const f = freq * (1 + drift);
    const body =
      Math.sin(2 * Math.PI * f * t) +
      0.32 * bell * Math.sin(2 * Math.PI * f * 2 * t) +
      0.11 * bell * Math.sin(2 * Math.PI * f * 4.02 * t);
    const v = body * env * amp;
    // A few milliseconds of delay to one side, for width without phasing.
    return [v * (1 - pan * 0.35), v * (1 + pan * 0.35)];
  };
}

/** Upright-ish bass: mostly fundamental, with a short woody knock on top. */
function bass(freq, amp) {
  return (t) => {
    const env = Math.exp(-t * 2.2) * (1 - Math.exp(-t * 300));
    const knock = Math.exp(-t * 40) * 0.25;
    const v =
      (Math.sin(2 * Math.PI * freq * t) +
        0.18 * Math.sin(2 * Math.PI * freq * 2 * t) +
        knock * Math.sin(2 * Math.PI * freq * 6 * t)) *
      env *
      amp;
    return [v, v];
  };
}

function kick(amp) {
  return (t) => {
    // Pitch sweep down into the floor: 95 Hz to about 45 Hz in a tenth of a second.
    const f = 45 + 50 * Math.exp(-t * 28);
    const env = Math.exp(-t * 9) * (1 - Math.exp(-t * 800));
    const v = Math.sin(2 * Math.PI * f * t) * env * amp;
    return [v, v];
  };
}

/* Brushes rather than a struck snare: noise with a slow swell and no crack.
   A brush is the one percussion sound that is genuinely just filtered noise,
   which makes it the one this method can do honestly. */
function brush(amp, seed) {
  let s = seed;
  let lp = 0;
  return (t) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    const white = (s / 2147483648) - 1;
    lp = lp * 0.6 + white * 0.4;
    const env = Math.exp(-t * 11) * (1 - Math.exp(-t * 90));
    const v = lp * env * amp;
    return [v * 0.85, v * 1.15];
  };
}

function hat(amp, seed) {
  let s = seed;
  let prev = 0;
  return (t) => {
    s = (s * 1103515245 + 12345) >>> 0;
    const white = (s / 2147483648) - 1;
    const hp = white - prev;
    prev = white;
    const env = Math.exp(-t * 55);
    const v = hp * env * amp;
    return [v * 1.1, v * 0.9];
  };
}

/* --- Arrangement --------------------------------------------------------- */

for (let barIndex = 0; barIndex < BARS; barIndex++) {
  const barTime = barIndex * BAR;
  const chord = chordAt(barIndex);
  const cycle = Math.floor(barIndex / 4);

  /* The drums sit out the first bar of every sixteen after the opening one:
     a breath at roughly every chapter's length, so the groove keeps arriving
     rather than simply continuing. */
  const drums = !(barIndex % 16 === 0 && barIndex > 0);

  /* The whole track fades up over the first two bars and down over the last
     three, so the composition never has to fight a full-level entry. */
  const shape =
    Math.min(1, barIndex / 2) * Math.min(1, (BARS - barIndex) / 3);

  // Chord: struck on beat one, answered softly on the and-of-two.
  chord.voices.forEach((note, i) => {
    const drift = 0.0006 * Math.sin(2 * Math.PI * 0.27 * barTime + i);
    const pan = (i / (chord.voices.length - 1)) * 2 - 1;
    add(barTime + 0.01 * i, 3.2, rhodes(midi(note), 0.085 * shape, pan, drift));
    if (cycle % 2 === 1) {
      add(
        barTime + BEAT * 1.5 + 0.008 * i,
        2.2,
        rhodes(midi(note + 12), 0.028 * shape, -pan, drift),
      );
    }
  });

  // Bass: root on one, fifth on three, and a passing tone into the next bar.
  add(barTime, 1.6, bass(midi(chord.bass), 0.3 * shape));
  add(barTime + BEAT * 2, 1.2, bass(midi(chord.bass + 7), 0.2 * shape));
  const next = chordAt(barIndex + 1);
  add(barTime + BEAT * 3.5, 0.7, bass(midi(next.bass - 1), 0.16 * shape));

  if (!drums) continue;

  // Kick on one and the and-of-three; brushes on two and four.
  add(barTime, 0.5, kick(0.38 * shape));
  add(barTime + BEAT * 2 + BEAT * SWING, 0.4, kick(0.22 * shape));
  add(barTime + BEAT, 0.5, brush(0.13 * shape, 7919 + barIndex * 31));
  add(barTime + BEAT * 3, 0.5, brush(0.13 * shape, 104729 + barIndex * 17));

  // Hats on swung eighths, skipping one at random for a human-ish gap.
  for (let beat = 0; beat < 4; beat++) {
    add(barTime + beat * BEAT, 0.2, hat(0.05 * shape, 1013 + barIndex * 53 + beat));
    if ((barIndex + beat) % 7 !== 3) {
      add(
        barTime + (beat + SWING) * BEAT,
        0.15,
        hat(0.032 * shape, 5077 + barIndex * 91 + beat),
      );
    }
  }
}

/* --- Lo-fi treatment ----------------------------------------------------- */

/* One-pole lowpass. The dull top end is most of what separates this from
   sounding like a ringtone, and it also hides the aliasing that crude
   additive synthesis produces on the higher partials. */
function lowpass(buf, cutoff) {
  const dt = 1 / RATE;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  let prev = buf[0];
  for (let i = 0; i < buf.length; i++) {
    prev += a * (buf[i] - prev);
    buf[i] = prev;
  }
}

lowpass(left, 3000);
lowpass(right, 3000);

// Vinyl: a steady noise floor plus sparse crackle, both very quiet.
let seed = 20260910;
for (let i = 0; i < N; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const u = (seed / 2147483648) - 1;
  const floorNoise = u * 0.0035;
  const crackle = Math.abs(u) > 0.99965 ? u * 0.055 : 0;
  left[i] += floorNoise + crackle;
  right[i] += floorNoise * 0.9 + crackle * 0.8;
}

// Soft saturation, then normalise to a background level with headroom to spare.
let peak = 0;
for (let i = 0; i < N; i++) {
  left[i] = Math.tanh(left[i] * 1.6) * 0.62;
  right[i] = Math.tanh(right[i] * 1.6) * 0.62;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = peak > 0 ? 0.82 / peak : 1;

/* --- WAV ----------------------------------------------------------------- */

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * gain * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * gain * 32767))), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(__dirname, '..', 'public', 'music', 'lofi-jazz.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, data]));

console.log(
  `wrote ${out}\n${LENGTH.toFixed(1)}s · ${BPM} BPM · ${BARS} bars · ` +
    `${(fs.statSync(out).size / 1048576).toFixed(1)} MB`,
);
