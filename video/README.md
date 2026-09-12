# The videos

Two cuts of the same story, built with [Remotion](https://remotion.dev). React
components render to frames; there is no timeline file and no editor project —
the source here *is* the edit.

| Composition | Length | What it is |
|---|---|---|
| `Brief` | 0:46 | Eight slides, one idea each. The short answer to "what is this?" |
| `Overview` | 5:16 | The full tour: 35 feature slides in six chapters, a title card opening each. |

Nothing in here reaches the app. It reads the app's colours, its seeded data
and its own QR encoder, and renders video; the app does not know it exists.

## Running it

```bash
npm install
npm run music        # writes public/music/lofi-jazz.mp3 — see below
npm run dev          # Remotion Studio
```

The Studio opens on port 3000 by default, which is also the app's port — and
the app's service worker will happily answer for it and serve you the offline
page instead of the Studio. Use another port:

```bash
npx remotion studio --port 3100
```

## Rendering

```bash
npx remotion render Brief out/brief.mp4
npx remotion render Overview out/tour.mp4
```

`out/` is ignored by Git. The tour is about 35 MB at the default quality.

## The music

`npm run music` synthesises `public/music/lofi-jazz.mp3` from
[scripts/make-music.js](scripts/make-music.js) — sine waves and filtered noise,
about 250 lines of arithmetic. Nothing is sampled or downloaded, so the track
carries no licence and no attribution requirement.

The mp3 is committed so a fresh checkout can render without running anything
first. It is regenerated, not edited: change `BARS` for length, `BPM` for
tempo, the `SECTION_A` / `SECTION_B` tables for the chords.

## How the slides are put together

Scenes live one per file in [src/scenes](src/scenes). Two of them take props
because they are reused — `ChapterCard` (six times) and `BriefSlide` (six) —
and the rest are written out in full, because each is different.

Styles are inline literal objects with inline `interpolate()` calls, and
animation uses the `scale` / `translate` / `rotate` CSS properties rather than
`transform`. That is not a style preference: it is what lets Remotion Studio
recognise the structure, so elements can be selected on the canvas and their
keyframes edited by hand, writing back to these files.

[Overview.tsx](src/Overview.tsx) and [Brief.tsx](src/Brief.tsx) hold the running
order. Durations are inline numbers so they can be dragged in the Studio
timeline; each transition overlaps its two neighbours, so a composition is
15 frames shorter per transition than its durations added up — the arithmetic
is written in a comment at the top of each file, and `Root.tsx` has to agree.

## Two things that will bite

**Fonts.** `src/fonts.ts` is imported for its side effect only, so
`package.json` lists it under `sideEffects` alongside `*.css`. Remove it from
that list and the bundler drops the import, the fonts never load, and
everything renders in Times without a single error anywhere.

**Safe area.** Slides are laid out inside 150px of padding on a 1920×1080
frame. Fraunces and Inter are wider than the fallback serif, so any copy change
wants a still rendered and checked before it is believed:

```bash
npx remotion still Overview out/check.png --scale=0.5 --frame=1200
```
