# Print and in person

The channel that reaches people a feed does not, and the one this business is
unusually well set up for: the card and the sticker already exist, they are
already 300 DPI with bleed, and their QR codes already resolve to the live site.

---

## The generated set

```bash
npm run campaign
```

Writes six images to `GRAPHICS_DIR/campaign/`, from the same palette, the same
mark and the same generator style as the weekly social graphics. Nothing is
hand-edited; change `scripts/campaign.js` or `public/theme.css` and run it
again.

| File | Size | Where it goes |
|---|---|---|
| `announce.png` | 1080×1350 | **A1 — What this is.** The feed post that introduces the business |
| `how-it-works.png` | 1080×1350 | **A2 — How it works.** Four steps, for a stranger |
| `quiet-move.png` | 1080×1080 | **R1 and R3.** For the regulars. Deliberately the quietest image in the set |
| `allergens.png` | 1080×1080 | **A4 — The allergen review** |
| `story.png` | 1080×1920 | Stories and reels covers. Carries a QR |
| `flyer-a.png` | 1275×1650 | **Print.** US Letter at 150 DPI, with a QR. Centred |
| `flyer-b.png` | 1275×1650 | **Print.** The same sheet ranged left |
| `flyer-c.png` | 1275×1650 | **Print.** The same sheet with a banded head |

Two of these carry a **QR code**, and both take the same care the business card
does: the address is printed under the code, so a wrong one is visible before it
is a thousand flyers.

> **The `BASE_URL` trap, and how this script avoids it.**
> `scripts/card.js` and `scripts/sticker.js` read `process.env.BASE_URL`
> directly, and `dotenv` is loaded in exactly one file — `server/config.js` —
> which neither requires. Run from a shell they see no `BASE_URL` and quietly
> emit a placeholder. `scripts/campaign.js` loads `.env` itself and **refuses to
> write anything carrying a QR** when `BASE_URL` is missing, rather than writing
> it wrong. The other four still generate.

---

## The card in the bag

**The highest-conversion surface in either campaign.** The person holding it has
just been handed supper by somebody they like. They are not scrolling past it.

- One in every bag, every order, from week 1. No exceptions and no rationing.
- Front is the mark on olive; back is how to order, the pickup window, the
  contact, and a QR that opens the site.
- Generate from **Dashboard → Graphics**, never `npm run card` — the same
  `BASE_URL` trap, and the card is the one that ends up at a printer.
- Say one sentence when you hand it over, or nothing. Wording in
  [COPY-BANK → Handing over the card](COPY-BANK.md#handing-over-the-card).

**Two cards to a regular, once**, in week 3 or 4: one for them, one for whoever
they were going to tell about it anyway. No script, no referral scheme, no code
to track. Just the second card.

---

## The sticker

`npm run sticker`, or Dashboard → Graphics. The face says **SCAN ME** and
nothing else.

- On the lid of every container that goes out.
- On the bag, if the container is not the sort that takes one.

A container in somebody's fridge is seen by everyone in the house, which is a
household rather than a customer. That is the whole argument for the sticker and
it is a good one.

> **The sticker cannot show you it is wrong.** The face carries no address — only
> "SCAN ME" — so a roll printed with a dead QR looks perfect and is worthless.
> Scan one from the proof, with a phone, before ordering a roll. The card prints
> its address under the code and can be proofread; the sticker cannot.

---

## The flyer

`flyer-a.png`, `flyer-b.png`, `flyer-c.png` — US Letter at 150 DPI. Print at
home on decent paper; this does not need a print shop.

**Three arrangements of one sheet.** Same words, same facts, same code — A is
centred, B is ranged left, C has a dark banded head. Nothing is lost by using
only one, and the reason there are three is density: fifty identical sheets
across a city read as one thing being pushed, and a board carrying three of
them reads as three. Rotate them by area rather than by board, so the same
street does not show the same sheet twice.

C spends the most ink, by a good margin. If the printer is yours and the toner
is not free, print A and B and keep C for the boards that matter.

**Where it works**

- Community noticeboards — libraries, community centres, the Y, church halls.
- Cafés and independent shops that keep a board. **Ask first, always.**
- Apartment and condo noticeboards, where the building allows it.
- Workplace kitchens, if somebody who works there is a customer.

**Where it does not**

- Cars. Windscreen flyers generate complaints rather than orders.
- Mailboxes. Canada Post mailboxes are not yours to use, and it reads as junk.
- Poles and utility boxes. Illegal in most of the region and it looks it.

**Realistic numbers.** Thirty flyers on good boards, refreshed when they come
down, is a fortnight's effort and will produce a small number of customers who
live nearby and stay. It is a slow channel and a durable one. Do not print three
hundred.

Check boards once a fortnight. A flyer that has been covered over is doing
nothing, and the board it was on is still free.

---

## In person

**Markets and community events** are the strongest acquisition channel available
to a business like this, and the one this campaign deliberately does not plan,
because it needs food, a table, a permit and a day — which is a different
project with a different cost.

Worth knowing what it would take, so the decision is made rather than drifted
past: a table at a KW market is a day of Derek's time, a food-handling permit,
and stock cooked for strangers on spec. That is the whole week's margin. It is
probably the right move in month three or four. It is the wrong move in week 1,
because the kitchen has not yet cooked for a single customer who found the
business through this campaign.

**What costs nothing now:**

- Cards to the businesses you already buy from. A butcher, a baker and a
  greengrocer between them meet more people who cook than any Facebook group.
- A card on the counter of anywhere that will have one, asked politely.
- The two-cards handover above.

---

## Before anything goes to a printer

| | Check |
|---|---|
| 1 | **Scan every QR with a real phone**, from the proof, not from the screen it was generated on |
| 2 | It resolves to `https://dinnerbyderek.ca` — and the card prints that address under the code, so read it |
| 3 | The pickup window on the piece matches Dashboard → Locations & Delivery |
| 4 | The cutoff on the piece matches Settings |
| 5 | The phone number is the one you actually answer |
| 6 | Print **one** of anything before printing many |

Paper is the one part of this campaign that cannot be edited after the fact.
Everything else is a post that can be deleted.
