# The videos

Four compositions, built with [Remotion](https://remotion.dev). React components
render to frames; there is no timeline file and no editor project — the source
here *is* the edit.

| Composition | Size | Length | What it is |
|---|---|---|---|
| `Brief` | 1920×1080 | 0:46 | Eight slides, one idea each. The short answer to "what is this?" |
| `Overview` | 1920×1080 | 5:16 | The full tour: 35 feature slides in six chapters, a title card opening each. |
| `Launch` | 1080×1350 | 0:20 | **For customers.** The feed cut — what this is, when to order, how you get it, how you pay. |
| `LaunchStory` | 1080×1920 | 0:20 | The same component at 9:16, for stories and reels. |

The first two are a tour of the app, made for whoever runs it. `Launch` is the
other audience — somebody scrolling a feed who has never heard of any of it —
and it is the one the launch campaign posts. It answers the four questions a
stranger actually has and then holds the address. Both cuts are built to work
with the sound off.

The campaign that uses it is in [marketing/](../marketing), which is a separate
folder for a separate job: this project renders the video, and that one decides
where it goes.

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
npx remotion render Launch out/launch.mp4
npx remotion render LaunchStory out/launch-story.mp4
```

`out/` is ignored by Git. The tour is about 35 MB at the default quality; the
launch cuts are a few megabytes each.

Rendering downloads a Chrome Headless Shell on first use and fetches the two
Google fonts from the network. On a machine that cannot reach either, point
Remotion at a headless shell you already have — `--browser-executable=...` —
and expect the fonts to be the remaining problem; they are loaded by
[src/fonts.ts](src/fonts.ts) at module scope, which is the one thing here that
needs the internet.

## The two generated files

Both are committed, so a fresh checkout renders without running anything. Both
are regenerated rather than edited.

```bash
npm run qr      # src/data/qr.json      — the card's real QR, as a module matrix
npm run mark    # public/icons/mark-gold.png — the brand lockup, gold on transparency
```

`npm run qr` encodes `https://dinnerbyderek.ca` with the app's own encoder —
`scripts/qr.js`, the same few hundred lines of arithmetic that print the
business card — so the code the `CardStickerQr` scene draws is the code on the
card. Pass a different address as an argument to change it.

`npm run mark` cuts the gold line art the social graphics and the card front
use. It is **not** `public/icons/icon-512.png`: that file is ink on a parchment
tile and is the right artwork for the two scenes that depict a home-screen
icon, and the wrong artwork for a logo — dropped on the launch cut's olive it
reads as a white box. This one is made for a dark ground.

`npm run mark` reads the app's `brandmark` helper, so it needs the repository
root's dependencies installed (`npm install` there first). `npm run qr` does
not — the encoder has none.

## The music

`npm run music` synthesises `public/music/lofi-jazz.mp3` from
[scripts/make-music.js](scripts/make-music.js) — sine waves and filtered noise,
about 250 lines of arithmetic. Nothing is sampled or downloaded, so the track
carries no licence and no attribution requirement.

The mp3 is committed so a fresh checkout can render without running anything
first. It is regenerated, not edited: change `BARS` for length, `BPM` for
tempo, the `SECTION_A` / `SECTION_B` tables for the chords.

## How the slides are put together

Scenes live one per file in [src/scenes](src/scenes), with the customer-facing
cut's three in [src/scenes/launch](src/scenes/launch) — kept apart because they
are portrait and written for a different audience, and mixing them into the
tour's folder would invite reuse in the wrong direction. Two of them take props
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
