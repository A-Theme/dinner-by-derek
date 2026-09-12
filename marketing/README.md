# Marketing — the launch

Everything for taking Dinner By Derek public lives in this folder. Nothing in
here reaches the app: no file outside `marketing/`, `scripts/campaign.js` and
`video/src/scenes/launch/` was touched to build it. The campaign can be
rewritten, replaced or thrown away without a redeploy.

## Two campaigns, not one

There are two audiences and they want opposite things, so there are two
campaigns and they are run differently.

| | **The Quiet Move** | **Room at the Table** |
|---|---|---|
| Who | The people already ordering — by comment and by phone, for three years | People in Kitchener–Waterloo who have never heard of this |
| Ask | None. The link is offered, never pushed | Come and eat |
| Where | Derek's own Page, the weekly menu post, the bag | Local groups, print, QR, word of mouth |
| Volume | Three posts in six weeks | Two a week |
| Success | The first real order arrives without anyone being nagged | New names in the orders table, from postal codes that were not there before |
| Plan | [CAMPAIGN-REGULARS.md](CAMPAIGN-REGULARS.md) | [CAMPAIGN-NEW-CUSTOMERS.md](CAMPAIGN-NEW-CUSTOMERS.md) |

They share one Facebook Page and one person's time, which is the constraint
that shapes both. [STRATEGY.md](STRATEGY.md) is where that is worked out.

## Start here

1. Read [STRATEGY.md](STRATEGY.md). It is short and it is the part that stops
   the two campaigns undoing each other.
2. Do the four things in **[Before anything is posted](#before-anything-is-posted)**
   below. None of them are marketing; all of them are the difference between a
   launch and a complaint.
3. Generate the artwork: `npm run campaign`.
4. Work [CALENDAR.md](CALENDAR.md) week by week, pasting from
   [COPY-BANK.md](COPY-BANK.md).

## Before anything is posted

Four checks, in order. Each one is a thing that goes wrong in public if it is
skipped.

| | Check | Where | Why it comes first |
|---|---|---|---|
| 1 | A week is **published** and reads correctly on a phone that is not signed in | `https://dinnerbyderek.ca` | Every post points at the site. A post that lands on "the menu for these dates isn't up yet" is worse than no post |
| 2 | A **daily cap** is set on each service day | Dashboard → This Week | Acquisition works or it doesn't; if it works, the cap is the only thing between a good week and a bad night. See [Capacity](STRATEGY.md#capacity-is-the-real-risk) |
| 3 | You have placed a **test order and deleted it** | Dashboard → Orders | So the first real order is unmistakably the first, and so you have seen what the customer sees |
| 4 | The printed QR codes resolve to `https://dinnerbyderek.ca` | Dashboard → Graphics | Wrong on paper is the expensive version of the mistake. Already done on 2026-08-30 — redo only if `BASE_URL` changed |

Checks 1, 3 and 4 are steps 3, 5 and 6 of [docs/GOING-LIVE.md](../docs/GOING-LIVE.md).
This folder does not restate them; it depends on them.

## What's in here

| File | What it is |
|---|---|
| [STRATEGY.md](STRATEGY.md) | Positioning, the two audiences, voice, guardrails, sequencing |
| [CAMPAIGN-REGULARS.md](CAMPAIGN-REGULARS.md) | The Quiet Move — migration without pressure |
| [CAMPAIGN-NEW-CUSTOMERS.md](CAMPAIGN-NEW-CUSTOMERS.md) | Room at the Table — acquisition in KW |
| [COPY-BANK.md](COPY-BANK.md) | Every post, ready to paste. Also the replies to the questions that will get asked |
| [CALENDAR.md](CALENDAR.md) | Six weeks, both campaigns interleaved, one line per day |
| [PRINT.md](PRINT.md) | Card, sticker, flyer — what to print, how many, where they go |
| [MEASUREMENT.md](MEASUREMENT.md) | How to tell whether it worked, using only what you already have |

## The artwork

Dashboard → Graphics → **Launch campaign**, which is where it belongs: two of
the pieces carry a QR code, and `BASE_URL` is only reliably set in the
service's environment. From a terminal it also works —

```bash
npm run campaign
```

— but that path reads `.env` itself and refuses to write the flyers when
`BASE_URL` is missing, rather than quietly printing a placeholder.

Writes eight images to `GRAPHICS_DIR/campaign/`: four evergreen posts, a story
cover, and **three arrangements of the same flyer** so a noticeboard carrying
more than one does not look like the same sheet twice. Same palette, same mark,
same generator style as the weekly social graphics — see
[PRINT.md → The generated set](PRINT.md#the-generated-set) for what each one is
and where it goes.

The weekly `menu.png` and `last-call.png` are **not** part of this campaign.
They already exist, they already read the live database, and they carry on
exactly as they are: `npm run social`, or Dashboard → Graphics.

## The video

A customer-facing spot lives in [video/src/scenes/launch](../video/src/scenes/launch).
It is new and separate from the two videos already in that project — those are
a tour of the app made for whoever runs it, and they are the wrong thing to
show a customer.

```bash
cd video && npm install
npx remotion render Launch out/launch.mp4          # 1080×1350, feed
npx remotion render LaunchStory out/launch-story.mp4  # 1080×1920, stories
```

Twenty seconds, no voiceover, legible with the sound off — which is how it will
be watched.
