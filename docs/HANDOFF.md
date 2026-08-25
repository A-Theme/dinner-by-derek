---
eyebrow: Handoff · 24 August 2026
figures:
  6 = commits today
  1081 = checks passing
  230 = recipes seeded
  3 = items unreviewed
---

# Handoff — 24 August 2026

Where the project stands at the end of a long day, and what to pick up next.

**This document rots.** The numbers below were read from `data/dinnerbyderek.db`
and `.env` on the evening of 24 August. Re-read both before acting on any of
them — that habit is not decoration, it is what produced half the corrections
made the day before.

**`docs/GOING-LIVE.md` owns the go-live sequence.** This file does not repeat it.
Where the two disagree, that one is the operational document and this one is a
snapshot of a moment.

---

## Where things are

`main` at `e7c597b`, clean, in sync with `origin/main`.
Suites green: **708 acceptance, 373 flow** (`npm test`).

### The database

| | |
|---|---|
| Weeks | 1 — week 6, **published** by hand at 16:05 on 23 Aug, starts 24 Aug |
| Service days | 8 rows; **5 in range** (Aug 24–28), all reviewed |
| | 3 strays (Aug 18–20) outside the week's dates — see below |
| Week items | **0** — no soup, salad or dessert on the week |
| Standing items | 6, of which **3 are unreviewed** and therefore invisible to customers |
| Saved dishes | 816 |
| Allergen terms | 479 |
| Orders | 1 (a test: `A16C0962`, Aug 25, Pork Souvlaki) |
| Payments | 0 |
| Recipes | **29 in this file, 230 in the seed** — see below |
| Recipes linked to a dish | 0 |

The three unreviewed standing items are **Breaded Chicken Cutlets**, **Pulled
Pork (Reheat Bag)** and **BBQ Brisket (Reheat Bag)**. Other Options shows
customers nothing until each is reviewed. They are the owner's to tick — nobody
else can mean it.

### `.env`

| In .env | State |
|---|---|
| Admin password | **hashed**, and the plaintext line is gone |
| Session secret | set |
| `BASE_URL` | still `http://localhost:3000` — everything downstream waits on this |
| `TOKEN_ENCRYPTION_KEY` | empty; needed only for Facebook one-tap publishing |
| `SMTP_*` | empty; orders are still recorded, nothing is sent |
| `FB_APP_ID` / `FB_APP_SECRET` | empty; copy-and-paste publishing works without them |
| `NODE_ENV` / `TRUST_PROXY` | `development`, and unset |

---

## Next steps

1. **Hosting.** Nothing that can run a Node process exists yet, and everything
   below waits on it. The guide recommends OVHcloud VPS-1 in Beauharnois, Quebec —
   chosen so customer names, phones and delivery addresses stay in Canada, not for
   latency. Hostinger is the documented runner-up. Two OVH figures are flagged
   unverified in `DEPLOY.md`: whether the headline price assumes a longer
   commitment, and the renewal rate.
2. **`BASE_URL` on the real domain.** More hangs off this than it looks: secure
   cookies, every link in every email, the QR codes on the card and stickers, and
   Facebook's ability to fetch a post image at all. Set it, then **regenerate the
   graphics before anything reaches a printer** — a wrong QR on paper is the
   expensive version of this mistake.
3. **The three standing-item reviews.** The only work here nobody but Derek can
   do. The tick means he checked that dish, as written, for the menu it is going
   on.
4. **Then, optionally, in this order.** SMTP, so an order arriving is something
   you learn without opening the dashboard — set `SMTP_*` and `BASE_URL` together
   or not at all, because mail with a localhost base is mail whose every button is
   dead. Then `TOKEN_ENCRYPTION_KEY` if Facebook one-tap publishing is wanted; the
   copy-and-paste path works without it. Then the IMAP poller.

---

## What changed on 24 August

Six commits, one thread: recipes. How a dish is made, kept apart from how it
is sold.

### The model — `e083f27`

Three tables. `recipes` carries a slug, a yield stored as quantity and unit so
it can actually be scaled, a `parent_id` for base-and-variation, and a nullable
`dish_id` that survives its dish being deleted. `recipe_ingredients` is one row
per line with the prep state in its own column and a canonical g/ml/ea beside
the written form. `recipe_steps` is method, in order.

**There is no `ack` column, and the reason is sharper than it was for
`saved_dishes`.** An ingredient list is the best allergen signal in the
building — it names the butter that "creamy" only implies. That is exactly what
makes it dangerous: a list this good invites tagging a dish from its recipe and
calling it reviewed, and then a substitution nobody retyped ships under a tick
nobody placed. `allergenText()` returns words for the suggester. Nothing in the
module writes an `allergens` column or touches `ack`, and acceptance asserts it.

It follows sub-recipes **one level down**, which is where the case that bites
lives: a veloute lists stock, roux and salt and names no dairy at all. The
suggester now finds milk in one, through the butter in the roux.

### The screens — `78242ad`, `ab35b8c`

A list, a detail page that scales, and an editor, at `/admin/recipes`.
Owner-only, with `auth.required` applied **in the recipe router** rather than
inherited from the one mounted ahead of it — inherited auth works right up
until somebody reorders the mounts in `index.js`, and the failure is silent.
The flow suite checks it signed out, by name, and that no ingredient leaks into
the redirect body.

Ingredients are typed as lines, not four inputs per row. The parser reads
`500 g onion, peeled` and keeps verbatim anything it cannot read, so "a good
handful of parsley" survives as itself and simply does not scale. Scaling
multiplies quantities and leaves alone what is not one: "to taste" does not
double, a pinch stays a pinch, and the steps come back untouched because a
doubled braise is not a doubled hour.

The dish picker filters as you type — 816 dishes in one select is not a control
anybody uses. Whatever is selected always survives the filter, or the recipe
saves pointing somewhere else because somebody typed in a search box.

### The link — `6475d96`

A recipe can name the saved dish it makes; the dish row links back. One recipe
per dish, as a partial unique index. **The link carries nothing** — no allergen
copy, no tick — and both suites assert it with a fixture full of eggs and wheat
pointing at a dish tagged milk alone.

### The base set — `23b5d95`, `e7c597b`

29 → 230, written from the ratios and the mechanism in our own words. Nothing
transcribed from any published book; the rule is stated at the top of
`server/recipe-seed.js` and acceptance checks the statement is still there,
alongside checks for duplicate slugs and dangling `parent`/`sub` references —
the three ways a hand-added batch fails silently.

The soups were chosen by reading the saved list, so 28 of 30 answer to
something already in the repertoire.

---

## What changed on 23 August

Thirteen commits. Two threads, landed from different sessions.

### The audit and its fixes — `15e9894` … `e9abaf7`

A line-by-line audit produced 24 findings; 23 were fixed and one closed as a
deliberate decision. Acceptance went 424 → 568 over seven commits. The ones
worth remembering:

- **The allergen seed only ever ran on an empty table** (`15e9894`), so every
  dictionary fix since the first install had been landing in the code and never
  in the database. 176 terms were missing, including the compound words a
  previous commit was written specifically to add. Removals are now tombstoned
  so re-seeding cannot resurrect a word the owner deleted.
- **A pasted payment notification could freeze the whole site** (`bb3145a`).
  Unbounded backtracking: 4,000 spaces took 26.5 seconds on the one thread that
  also serves the menu. Now under a millisecond.
- **Four lookups answered for words nobody defined** (`446e5d1`) — `constructor`,
  `__proto__` and friends walked past the guard on the delivery strategy, the
  dish sort order, the week-item kind and the settings allow-list.
- **Two payments could claim one order** (`1afb9c6`), and unlinking the first
  then marked the order unpaid while the second still stood against it.
- **The dictionary learned this kitchen's actual vocabulary** (`b7e6f85`), read
  off the 817 saved dishes rather than guessed: dishes raising nothing fell from
  42% to 36%.

### Payments, the ledger, and the pages — `2e5f15f` … `9004ce2`

- **Days belong to the week whose dates contain them** (`2e5f15f`). Moving
  "Week starts" leaves days behind, attached by `week_id` but outside the week's
  seven dates. The published week was offering Aug 18–20 — three dates already
  past, with their cutoffs long gone. Now filtered everywhere; the rows are kept
  and readable in **Menu History** (`/admin/history`).
- **Interac sends a grid, not `Label: value`** (`fddefc1`). Three real
  notifications showed the label alone on one line, a blank line, then the
  value. Every pattern was written for the other shape, so **the message field —
  the only thing a customer controls, and the sole input to automatic
  matching — was never read at all.** The app was asking customers for a
  reference it could not then see.
- **The dish ledger is generated now** (`d624b2d`), `npm run ledger`, read from
  the database instead of written once by hand.
- **`GOING-LIVE.md`'s snapshot table was corrected** (`e774889`) after going
  stale within a day, in the direction that made the remaining work look smaller.
  One of those corrections was itself wrong — read from a plain copy of the
  database that missed 486 KB of WAL, which reported an empty draft and no
  orders. The trap below is written from that mistake.
- **Every published page has one source now** (`73ca006` … `06d17da`). Each is
  a markdown file in `docs/` rendered by `npm run pages`; the artifact is the
  output, never the thing edited. All of them had drifted from the repo copy
  they restated, and none of the drift was visible from either side.
- **The reviews left are named, not counted** (`9004ce2`). Step 4 of the
  go-live list still described the state before any of them were done.

---

## Traps

**Dictionary growth un-reviews dishes.** Every day in the published week is
currently reviewed. A future addition to `allergen-seed.js` that raises a new
suggestion on one of them will correctly revoke that review and pull the item
from the menu until it is looked at again. That is the gate working. It is also
a surprise if it happens mid-week — so add terms deliberately, not on the way
to something else.

**Never tick an allergen box on the owner's behalf.** Say which items are
unreviewed and leave them.

**The recipe seed runs on boot, not on deploy.** `seedRecipes()` is called once
in `index.js` at startup. A running server keeps serving whatever it loaded when
it started, so adding recipes to the seed changes nothing anyone can see until
the process restarts. This wasted time today: a preview was showing 29 recipes
long after the file held 230, and the file was not the problem. The live
database is at 29 for exactly this reason — the rest arrive the next time the
real server starts. An edited recipe is protected from being overwritten when
they do.

**The suggester over-fires on recipes about avoiding things.** `gf-veloute`
raises wheat and gluten because its summary says "instead of a *roux*", and
`cashew-cheese-sauce` raises milk from the word "cheese". Both are the word
matcher behaving exactly as designed and erring toward over-suggesting, which is
the right direction — but it means the gluten-free and vegan recipes greet the
owner with chips to dismiss, which reads as a bug and is not one.

**Demo against a copy of the database, never the live file.** He edits while
watching. `VACUUM INTO` a scratch copy — a plain file copy misses WAL content.

**Several sessions run at once.** Four were live while this was written, and
three of today's commits came from another one. Before editing a shared file or
republishing an artifact, re-read what is actually there; do not assume the last
version you saw is current.

**`serviceDaysOf` is filtered, `everyServiceDayOf` is not.** The date grid needs
the unfiltered list because `UNIQUE(week_id, service_date)` turns a row it cannot
see into a constraint error rather than a skip.

---

## Known and unbuilt

- **The IMAP poller.** `P.record()` in `server/payments.js` is the whole entry
  point. Now that the grid format is understood, this is plumbing rather than
  guesswork. Point it at a mailbox that receives only the bank's notifications.
- **Two OVH figures** unverified — commitment length and renewal rate.
- **The installed PWA is an untested surface.** Every camera test ran in a
  browser tab; an installed home-screen app has its own Android permission
  grants.
- **A single transfer covering two orders** links to one; the other is marked
  paid by hand.
- **No recipe is linked to a dish yet.** The column, the picker and the checks
  all exist and nothing populates them; every link is one pick in the editor.
  The soups are the place to start — 28 of the 30 match a saved dish by name, so
  the picker finds each in one search.
- **Recipes are owner-only and have no print view.** A kitchen wanting one on
  the bench prints the browser page. The scaled view is a query parameter, so a
  scaled recipe can at least be linked and printed as scaled.

### Test coverage gaps

Both are documented in comments where they matter rather than covered:

- **No DST-boundary test**, despite that being the property `time.js` exists for.
  A cutoff configured in the small hours would land an hour off twice a year.
- **No concurrency test.** `orders.js` is atomic only because better-sqlite3 is
  synchronous and no `await` sits between the read and the write. A second
  worker, or an `await` added inside `create()`, and the day oversells.

One habit worth keeping: several checks now read source files to assert a fix is
still in place. They are useful and they have one failure mode — matching a
*mention* of the thing rather than the thing. One did exactly that during this
work, by matching a comment that quoted the old code.
