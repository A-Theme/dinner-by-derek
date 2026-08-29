---
eyebrow: Handoff · 26 August 2026
figures:
  1109 = checks passing
  230 = recipes seeded
  16 = recipe buttons
  3 = items unreviewed
---

# Handoff — 26 August 2026

Where the project stands at the end of a long day, and what to pick up next.

**This document rots.** The numbers below were read from `data/dinnerbyderek.db`
and `.env` on the evening of 26 August. Re-read both before acting on any of
them — that habit is not decoration, it is what produced half the corrections
made across these three days.

**`docs/GOING-LIVE.md` owns the go-live sequence.** This file does not repeat it.
Where the two disagree, that one is the operational document and this one is a
snapshot of a moment.

---

## Where things are

`main` was at `7064c6d` when this was written, clean and in sync with
`origin/main`, suites green at **720 acceptance, 389 flow**. Re-read on
29 August, five commits later: **732 acceptance, 389 flow** (`npm test`).

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
| Recipes | 230, all of them tagged onto one of 16 buttons |
| Recipes linked to a dish | **0** — the column and the picker exist; nothing populates them |

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
   latency. Hostinger is the documented runner-up. Both figures `DEPLOY.md` used to
   flag unverified were read off the configurator on 2026-08-29: the CAD $6.20 is
   the twelve-month price paid upfront (≈$74.40/year ex. taxes, against $7.30
   month-to-month), and it renews at the same rate rather than stepping up.
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

## What changed on 26 August

Three commits, two of them from another session.

### The recipes got buttons — `7064c6d`

Two hundred and thirty recipes behind one search box is a list you can only use
if you already know what you are looking for. Every recipe now carries the
section of the seed file it was written in, and the list renders a button per
tag with a count. At `7064c6d` those read: Classical 64, Soups 35, Preserving
18, Modernist 16, Sides 16, Desserts 13, Vegan 13, German 8, Mexican 8, Thai 8,
Chinese 7, Japanese 7, Korean 7, Gluten-free 6, Mongolian 5, Charcuterie 4.

They do not any more. `28c706c` levelled the uneven sections and added a
fifteenth button, taking the seed to 415 recipes: Classical 64, Rubs and
marinades 50, Soups 46, and twenty each under Charcuterie, Chinese, Desserts,
German, Gluten-free, Japanese, Korean, Mexican, Modernist, Mongolian,
Preserving, Sides, Thai and Vegan. Read them back off the seed rather than off
this paragraph — `28c706c` moved the German count from 8 to 20 and left a flow
assertion still pinned to 8, which is how that number gets found to be wrong.

Tags are their own table rather than JSON on the recipe row — the opposite of
what `saved_dishes` does for allergens, and deliberately. Those are read back
with the row and never queried across; this exists only to answer "show me the
German ones", and a `LIKE` against a JSON string matches the wrong thing the
first time one tag is a substring of another.

A recipe may carry more than one, because tom kha is Thai *and* a soup. The
filter is an `EXISTS` rather than a join, so two tags do not list a recipe
twice — asserted, because that is the bug this shape invites.

Two smaller decisions, both about not lying to the reader. Counts are computed
under the current category tab, since a number counting rows the tab is not
showing is a number that lies. And an unknown tag in a bookmarked URL falls back
to the whole list with no button lit, rather than an empty page that reads as
"the recipes are gone".

### `npm run demo` — `7064c6d`

`npm run dev` opens the live database, and a demo is watched by someone who
edits while looking. The demo script takes a `VACUUM INTO` snapshot first and
runs against that. The snapshot came out at 640 KB where a plain file copy of
the same database gave 438 KB, and the difference is the WAL content — the same
gap that produced a wrong correction in this repo once before. It also blanks
`SMTP_*`, because an order placed to show somebody a screen should not reach a
real address. `.claude/launch.json` points at it, with `autoPort` on so it stops
colliding with whatever else holds 3000.

### From another session — `db75734`, `0b74789`

The page renderer learned to give subsections their own anchors, and
`GOING-LIVE.md` had its table re-read and gained a passage on what the week is
for. Both published pages were rebuilt from those. Worth knowing because the
renderer change affects *every* markdown-sourced page, not only the one whose
document changed.

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
the process restarts. This wasted time on 24 August: a preview was showing 29
recipes long after the file held 230, and the file was not the problem. The live
database has since restarted and holds all 230 — but the trap is the same for
the next batch, and for the tags, which are rewritten from the seed on every
boot. An edited recipe is protected from being overwritten when they are.

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
