---
eyebrow: Handoff · 8 September 2026
figures:
  1472 = checks passing
  230 = recipes seeded
  16 = recipe buttons
  0 = orders taken live
---

# Handoff — 8 September 2026

Where the project stands, and what to pick up next.

**This document rots.** Everything below that reads a database was read on the
date the row says, and the database that matters is on the server. Re-read
before acting on any of it — that habit is not decoration, it is what produced
half the corrections in this file.

**`docs/GOING-LIVE.md` owns the go-live sequence.** This file does not repeat it.
Where the two disagree, that one is the operational document and this one is a
snapshot of a moment.

---

## Where things are

`main` is at `b37f5e8`, clean, suites green at **983 acceptance, 489 flow**
(`npm test`, re-run 8 September). For comparison: 720 / 389 on 26 August,
764 / 416 on the 30th, 840 / 439 on the 31st.

**It is deployed and current.** The live server serves the same shell
fingerprint as `main` — `dbd-shell-6cf352d144`, checked over HTTP on
8 September — so everything through `5a1d6ea` is on the box, including the
training dashboard and the second dish photo.

**The database that matters is on the server**, at
`/var/lib/dinnerbyderek/dinnerbyderek.db`. The laptop's copy is a development file that has
diverged. There is no read-only way in with the deploy key — connecting with it *is* a deploy
— so live figures come from a snapshot pulled down over an interactive login. **Everything
below was read from one taken on 9 September**, which is the second such reading and the first
that took ten minutes rather than a plan.

`sqlite3` is not installed on the box and does not need to be: the app's own
`better-sqlite3` is there, and its online backup API copies a running database correctly,
WAL and all.

### The database — read live 2026-09-09

| | |
|---|---|
| Weeks | **1 row, and it is reused.** Week `#6`, slug `week-2026-08-16`, `week_start` now **2026-09-07**, status **published**. Its `published_at` still reads 2026-08-29 20:27 — the scheduler's first publish — because the row has never been replaced. See [Traps](#traps). |
| Service days | **3**, on 8, 9 and 10 September, none closed, **all three reviewed**. None stranded: the 14 stray rows found on the 6th were cleaned that day and nothing has drifted out of range since. |
| Week items | **5** — a dessert, **two soups and two salads**, all reviewed. The two-of-each slots landed on the 6th and were in real use within two days. |
| Standing items | 6, all reviewed and active, so Other Options is visible to customers |
| Saved dishes | **813** — 375 mains, 145 soups, 187 salads, 106 desserts. **10 carry an allergen review**; the other 803 do not, which is the expected state for an imported catalogue. |
| Allergen terms | 479 |
| Orders | **0 — and zero since going live on 29 August.** Confirmed again on the 9th. Not "none this week": the table has never held a real order. |
| Payments | 0, which is correct while no transfer has arrived |
| Recipes | **415**, across 17 tags — the expanded seed is live. The laptop's copy still holds 230, because it has not been restarted since. |
| Recipes linked to a dish | **0** — the column and the picker exist; nothing populates them |

**Nobody has ordered through the site yet.** The most likely reason is the ordinary one —
customers use Facebook and the phone number the footer gives them. `scripts/flow.js` drives a
real order end to end and passes, so the path works in test; it has not been proven against
production. Do not read a green suite as evidence that live ordering works.

### `.env`

On the server. Mail rows were established by running the tools against it on
31 August; the rest as noted.

| In .env | State |
|---|---|
| Admin password | **hashed**, and the plaintext line is gone |
| Session secret | set |
| `BASE_URL` | `https://dinnerbyderek.ca` since 29 Aug — secure cookies and HSTS follow from the scheme |
| `SMTP_*` | **set and sending, since 31 Aug.** Cyberimpact relay on 587, `SMTP_FROM=orders@dinnerbyderek.ca`, domain showing DKIM ×2, SPF and DMARC all valid |
| `IMAP_*` | set since 30 Aug — the poller reads its own Gmail inbox every five minutes |
| `TOKEN_ENCRYPTION_KEY` | empty; needed only for Facebook one-tap publishing |
| `FB_APP_ID` / `FB_APP_SECRET` | empty; copy-and-paste publishing works without them |
| `NODE_ENV` / `TRUST_PROXY` | **both correct, established 2026-08-30** — production cache headers prove `NODE_ENV=production`, and the boot output's silence then proves `TRUST_PROXY` is on |

---

## Next steps

**Four of the five things this list used to hold are done.** Hosting, on
29 August — an OVHcloud VPS-1 in Beauharnois, Quebec, chosen so customer names,
phones and delivery addresses stay in Canada rather than for latency, on Ubuntu
24.04 behind nginx as the systemd unit `dinnerbyderek`. `BASE_URL` on the real
domain the same day, which is also what turns the secure cookie and HSTS on,
because the app reads the scheme rather than `NODE_ENV` — and the printed
graphics were regenerated afterwards, so the QR codes lead somewhere and the
business card can go to a printer. The three standing-item allergen reviews,
reported on the 30th, which is the only work in this file nobody but Derek could
do and the one thing keeping Other Options hidden from customers. And email, in
both directions, on the 31st.

What is left:

1. **Derek's Outlook rule**, forwarding `payments.interac.ca` mail into the
   poller's inbox and keeping a copy. Everything around it is done — sending
   through Cyberimpact, receiving through Cloudflare Email Routing, the poller
   reading its own inbox every five minutes since 30 August, and
   `orders@dinnerbyderek.ca` registered for Autodeposit at the bank, so a
   notification means money landed. Until the rule exists the poller correctly
   finds nothing, and a successful empty poll writes no journal line at all — so
   the healthy state and the symptom look identical. When it lands, run
   `npm run poll -- --dry --days 90` first. See
   [Known and unbuilt](#known-and-unbuilt).
2. **`TOKEN_ENCRYPTION_KEY`**, if Facebook one-tap publishing is ever wanted.
   The copy-and-paste path works without it and always will.
3. **Nothing about ordering, and that is the thing worth watching.** The site
   has been able to take an order since 29 August and none has arrived. That is
   probably just how his customers behave, but it is untested ground rather than
   a proven path.

---

## What changed on 7 September

### A training dashboard that cannot reach the business — `7c1fb4c`

A complete practice copy of the dashboard at `/admin-training`, working on
invented data held in memory. A new person had until now been taught on the
real one, where every screen worth learning is a screen where a wrong tap
publishes a menu, emails a customer or deletes an order.

**The safety argument is structural rather than careful.** Nothing under
`server/training` requires `db.js`, `mailer.js`, `facebook.js`, `images.js`,
`publish.js` or `payments.js`, so these routes *cannot* write to the database,
send mail or post to a Page — they never load the code that does. An isolation
check in the harness asserts it. `auth.required` is spelled out on the mount
rather than inherited, because Express matches mount paths a segment at a time
and `/admin` is not a prefix of `/admin-training`: without that argument written
down, the module and its Reset button would answer anyone on the open internet
the first time somebody tidied the line.

The sandbox is seeded to teach rather than to look full. One dish is left
unreviewed on purpose, so the first attempt to publish is refused by name and
the trainee meets the allergen gate deliberately rather than by accident on a
Saturday. One description carries a misspelling for the proofreader to find. One
e-transfer is short by exactly the delivery fee. A guided walkthrough of 45
steps rings each control in turn, in the order the work happens rather than the
order the navigation lists it. Emails and Facebook posts go to an Outbox screen,
so declining a late request visibly costs something without costing anything.

The training Payments screen is written and **switched off** by one boolean in
`sections.js`, because the real one is still being finished and teaching a
screen that is about to change teaches something to unlearn.

### A second photo, for the meal for one — `4ed2f29`

Every item table gains a `single_photo` column beside the photo it already had.
`photo` keeps its meaning — the dish, the full pan — and the new one is
optional: null means both sizes are shown under the one picture, which is what
every existing row does. The pair is drawn above the price rows, each half
captioned with its size, and only when it would say something: the second photo
exists *and* both sizes are actually for sale.

Two things worth keeping. The migration sits **below** the `week_items`
rebuilds, and that position is load-bearing — those rebuilds write their
destination columns out by hand, so a column added above them lands in the copy
and not in the destination, and the insert fails on boot for every database old
enough to still need rebuilding. And the dashboard's photo box is now rendered
twice from one helper with every lookup scoped to its own slot; left
editor-wide, the second box's camera button fills in the first box's picture.

### Three smaller ones — `9b757bf`, `5a09a43`, `5a1d6ea`

**Every day box on This Week now starts shut.** A day used to open itself while
empty, which reads well on a week with one day left and badly on a fresh week —
seven empty boxes is seven full item editors stacked down the page, with the
finished days scrolled off the bottom underneath them. The summary line already
answers what the open card was there to answer.

**The paste card says the copying is your job.** It had shipped labelled
"Derek's post", with a greyed-out sample menu behind it and a button reading
"Read it" — which reads as a box that will fill itself. The owner tapped the
button on an empty box and reported that nothing appeared. Nothing was ever
going to: there is no path from this app to Facebook, and that impossibility is
the entire reason the feature is a paste box. The same mistake the photo
dropzone made when it said "Tap to choose a photo" above the camera button.

**The shell fingerprint had drifted.** `CACHE_VERSION` is computed from
`theme.css`, `app.css`, `app.js` and `order.js`; the shell files changed in
`4ed2f29` without it being recomputed, so `sw.js` named a build that no longer
existed and every returning phone kept the old shell. `scripts/acceptance.js`
computes the correct value and had been failing on `main` since that commit —
which is the check working.

---

## What changed on 6 September

### The day Derek misspelled, and both his soups — `913bd89`

On 2026-09-06 he wrote "Tueday - chicken alfredo farfalle pasta bake $50" and
the whole of that Tuesday vanished from the paste. The day pattern wanted the
real weekday name, so the line matched nothing, was skipped in silence, and the
preview simply showed one row fewer — which looks exactly like a day he chose
not to cook. The `s` is optional now in the three weekdays that have one, and
deliberately no looser: these are whole words anchored at the start of a line,
and fuzzy matching here would start reading prose as menu.

**Two soups and two salads.** The posts have read "tomato and dill or sweet corn
chowder" for three years and the week could hold one, so the second was dropped
on the way in. `UNIQUE(week_id, kind)` was what refused it, so the key grew a
slot rather than the kind growing a duplicate — `soup2` would have been a second
kind to teach the saved-dish catalogue, the publish gate and the Facebook post
about, all to say "soup" twice. Everything already stored is slot 1.

`weekItemsOf` now hands back `soups` and `salads` as **arrays**, and the plural
is load-bearing: a caller left reading `.soup` would have gone on working while
quietly ignoring the second one, and one of those callers is the publish gate,
where a slot nobody checked is a hole in the only thing in this app that must
not have one. `undefined` breaks loudly instead.

Found while testing: a migration guard written as a regex had picked up two
literal backspace bytes instead of `\b`, so it could never match and would have
rebuilt `week_items` on **every boot** of the live app.

### The live database, read over SSH

The first proper reading since the move. Two findings, both in
[Traps](#traps): there is exactly one week row and it is reused, which had
stranded 14 day rows and blanked the live menu that morning; and the orders
table has been empty since the site went up.

---

## What changed on 5 September

### Carrying the week's menu over from a phone — `4724f34`

Derek posts the menu to Facebook on Saturday morning and never opens this app,
so getting it across is a standing manual job — and until now a laptop job as
well, because the Groups API went in April 2024 and a page read needs a token
only Derek can issue, which leaves driving a foregrounded Chrome tab with real
wheel events. None of that fits in a pocket, and Saturday is not a day anybody
is at a desk.

Pasting the text does fit. The week page opens with a box that takes the post,
read by the same `parsePost` that read three years of them for the dish library
— so the day lines, the Single Select heading that restarts the days at a
one-plate price, the $12 litre of soup and the $4 dessert all come across
without a second reader to drift apart from the first.

**It reads before it writes, and those are two separate requests.** The first
shows what it made of the post, one card per line, every word in an editable
box; the second writes what is on that form rather than what the parser first
thought.

**Nothing arrives reviewed.** Every dish lands with an empty tag list, no
dismissals and the box unticked, and the photo and halal flag of whatever it
replaced are cleared with them. The post says "chicken satay (peanuts)" and the
dictionary would find the peanuts — but a tag that arrives already accepted is a
tag nobody read. A pasted week costs about seven ticks before it can go out.
That is the price of the feature and it is the point of it.

### The proofreader stopped arguing with words that were already right — `5473b44`

Derek called it clunky. Run over the four thousand rows he has actually written
— the dish library, the recipes, the ingredient lines — the checker raised 76
chips, of which **two** were mistakes: a doubled "with" and a missing space
after a full stop. The other 74 were it arguing with his own kitchen, 43 of them
telling him to write accents he has never once typed.

It defers to him now: a plain spelling this kitchen has already written is the
spelling here, and the chip survives only for a word he has only ever written
accented. "pate" and "creole" are gone outright — Pate Brisee is pate, the
dough, and the chip was offering the terrine. The rest were rules built from
generic English advice rather than from a kitchen.

The measurement is the method worth keeping: run the checker over the corpus the
owner has already written, and treat every chip on it as a false positive until
shown otherwise.

---

## What changed on 31 August

### A spelling and grammar checker on everything the owner writes — `9ae2b43`

Every box the owner writes prose into now carries `data-proof`: dish names and
descriptions (the item editor, so all three menu levels at once), the week
blurb, both closure notes, the payment instructions, delivery notes, and the
five fields of the recipe editor.

Two layers, doing different jobs.

The dashboard shell is `lang="en-CA"` and `public/admin.js` sets
`spellcheck="true"` on every `[data-proof]` field, so the browser's own
dictionary underlines ordinary misspellings in Canadian English. That is the
better tool for the long tail and the new code does not try to replace it.

`server/proofread.js` covers what a red squiggle cannot: real words in the
wrong place ("sever with crusty bread"), doubled words, missing apostrophes,
spacing and punctuation, missing accents, American spellings offered as a
Canadian preference — and the kitchen's own vocabulary, read out of the dish
library, the recipe tables and the allergen dictionary, so "gochujang" is a
word here and "gochjang" is offered back as a typo. Hyphenated compounds are
checked a half at a time. `POST /admin/api/proofread` answers; the panel is
built by `admin.js` and styled as `.proof` in `admin.css`.

**Suggestion-only, on the allergens.js model.** Nothing is applied until a chip
is tapped, and applying one fires an `input` event on the field, so accepting a
fix on a reviewed description takes the allergen tick back off exactly as
typing in it does. Verified in the browser: eight chips on a deliberately bad
description, ✓ rewrote only the flagged word, and the acknowledgement unticked.

Suites: **840 acceptance, 439 flow**, green. The new acceptance block leads
with twelve correct menu sentences that must produce zero findings — that is
the check that matters, and it already caught two false positives during the
build ("shaved" → "shared", and "a desert" being read as pudding).

**Committed as `9ae2b43`.** Later the same evening, `625a755` stopped the week
page advertising a day the kitchen had not decided on: a day with no headline
dish is no longer listed at all, because "Menu coming soon" under a date is a
promise nobody in the kitchen wrote. A day marked **closed** still shows, with
its note — that is a decision said out loud, not an empty slot — and the filter
tests `featured || meatless`, since testing `featured` alone would have taken
Monday down with Friday. The poster and the Facebook post had both decided this
already; the website was the odd one out.

---

## What changed on 30 August

### It went live, and then it was audited — `c4e484f`

The app is deployed. It runs on the VPS, on the real domain, and on the night
of the 29th the scheduler published a week by itself for the first time —
refused as empty at 17:40, live at 20:27 once it had content, which is exactly
the behaviour that branch was written for.

Then a line-by-line audit of every source file, with sixteen findings and every
one of them fixed. Two were worth the exercise on their own:

- **An order counted an item once per line, not once per item.** The browser
  cannot produce a duplicate line — it keys its lines by item and size — but the
  lines are a JSON string in a form field, and three lines of five each sat under
  a remaining count of five and sold fifteen. Reproduced before fixing: fifteen
  portions against a cap of five, and nine of a featured dish against a cap of
  three. Nothing had ever been ordered through it; the hole was open and unused.
- **The backup carried neither the payments, nor the recipe book, nor the record
  of allergen terms deliberately removed.** Restoring onto a fresh machine lost
  the ledger and every house recipe; restoring on the same machine unlinked every
  payment from the order it paid for; and removed terms came back by themselves
  on the next boot, undoing an allergen decision days later and in silence.
  Format version 3. Older files still restore and leave what they do not carry
  alone.

The rest, briefly: a service day outside its own week's dates was still
orderable by URL; the per-day pickup window skipped the clock guard the Settings
form uses and froze `NaN:undefined AM` onto orders; the allergen matcher read
`breaded` but not `breading`, and `gravy` but not `gravies`; a percent sign in
any dashboard message threw out of the toast, so the one time the owner was told
the dashboard was broken was the moment a write had succeeded; and opening This
Week **created a week**, which made a GET the only request in the app that
writes.

**What the suite could not tell us.** All 1,161 checks passed before the audit
and after every one of these bugs was found — which was the premise it started
from. Three fixtures in the flow suite turned out to be built on the
adrift-day hole, and one check asserted the This Week write by name. That is a
better argument that both were real than anything in the report.

Checks are at **1,180** (764 acceptance, 416 flow), and four of them that used
to read the source for a string now ask the running server the question instead.

**Deployed and verified**: `git pull` fast-forwarded `e1a6f06..c4e484f` on the
box and the service restarted. Before deploying, the three changes that could
touch live records were measured against a copy of the database — no reviewed
item lost its tick, no per-day pickup override existed to be refused, and no
order had ever held the same item twice.

---

## What changed on 29 August

### Monday got a meatless main — `65a3d83`

The one thing the model had no room for. A service day holds exactly one
featured dish, deliberately, so Monday could not offer the vegetarian plate
that 110 of the 130 posts read back from the Facebook page carry.

It went in at level 2, as a fourth `week_items` kind alongside soup, salad and
dessert: one per week, `UNIQUE(week_id, kind)` refusing a second, defaulting to
Monday via the `weekdays` column that level already had. Stored as a weekly
item, billed as a main — the day page draws it beside the featured dish under
its own eyebrow, not under Other Options.

Two decisions worth knowing, because both were close calls and both are now
load-bearing:

- **It holds its own daily ceiling**, rather than sharing Monday's. Twenty-five
  of each, not twenty-five between them. Selling out of the featured dish
  leaves the meatless one orderable.
- **It is picked from the saved Mains** and files itself back there. There is
  no meatless catalogue, so the same dish cannot end up filed twice with two
  prices.

Blank name means it is not running that week — nothing shows, nothing blocks
publishing. That is how *"Meatless Monday will return in September"* is said.

The `CHECK` constraint was widened by rebuilding the table, the same way the
dessert kind was added, guarded on the stored DDL so it runs once. **Verified
against a `VACUUM INTO` copy of the live database** — the constraint widened
and no rows were lost — but it has not yet run against the live file itself.

Checks are at 1161 (757 acceptance, 404 flow), up from 1109. The frontmatter
figures at the top of this file were read on 26 August and were not re-read
for this entry.

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

**There is one week row and it gets reused, which strands the days.** Week `#6`
is the only row in `weeks`; each week its `week_start` is moved forward rather
than a new week being started. `POST /admin/week/:id/weekstart` rewrites the
start date and deliberately leaves days already filled in on their original
dates, and `menu.js` shows only days inside `week_start … +6` — so every move
pushes last week's days outside the range, where the week page, the customer
menu and `serviceDayOn()` all filter them out. On 6 September that had left 14
stranded rows spanning Aug 18 – Oct 5 and **the live menu was blank** while the
database was visibly full of dishes. Cleaned that day, with a backup taken on
the box first. It will happen again unless the habit changes to *Duplicate last
week* or *Start this week's menu*. Symptom to recognise instantly: the customer
page says "The menu for these dates isn't up yet" while the dashboard shows a
week with dishes on it.

**A day entered outside the week's dates is accepted.** "Need a date outside
this week?" happily creates one, and one of the stranded rows was `2026-10-05`,
which looks like a typo for the 5th of September. Nothing refuses it because the
grid needs the unfiltered list — see the last trap in this section.

**`/admin` is not a prefix of `/admin-training`.** Express matches mount paths a
segment at a time, so no middleware mounted on `/admin` runs for the training
routes, session check included. `auth.required` is spelled out on that mount for
exactly this reason; deleting it as a duplicate opens the whole practice
dashboard, and its Reset button, to the open internet.

**The shell fingerprint does not recompute itself.** `CACHE_VERSION` in `sw.js`
is a hash of `theme.css`, `app.css`, `app.js` and `order.js`, written into the
file by hand. Change one of those four and the value has to move with it, or
every returning phone keeps the old shell and new client code simply does not
arrive. `scripts/acceptance.js` computes the right value and fails on a
mismatch, which is how the drift from `4ed2f29` was caught.

**A new column has to go below the `week_items` rebuilds.** Those rebuilds copy
a table by writing their destination columns out by hand, so a column added
above them exists in the copy and not in the destination, and the insert throws
on boot for every database old enough to still need rebuilding.

**Dictionary growth un-reviews dishes.** Every day in the published week is
currently reviewed. A future addition to `allergen-seed.js` that raises a new
suggestion on one of them will correctly revoke that review and pull the item
from the menu until it is looked at again. That is the gate working. It is also
a surprise if it happens mid-week — so add terms deliberately, not on the way
to something else.

**Never tick an allergen box on the owner's behalf.** Say which items are
unreviewed and leave them.

**The proofreader's word list is cached, and a write drops it.** `proofread.js`
builds its vocabulary from `saved_dishes`, `week_items`, `standing_items`, the
recipe tables and `allergen_terms`, then holds it. Any non-GET through `/admin`
calls `forgetVocabulary()` (`index.js`, above the route mounts) so a word the
owner has just invented is not offered straight back to him as a typo. A new
write path that bypasses `/admin` would need to drop it too.

**The near-miss layer is the one that can be annoying.** It reads dish and
recipe *names*, ingredient lines and the allergen dictionary as correction
candidates, and everything else — descriptions, method steps, notes — only as
"words this kitchen knows". That split is deliberate and was arrived at by
failure: with one combined list it read "shaved Parmesan" as a typo for
"shared". Raising recall here means widening the candidate pool, which is
exactly the change that makes it wrong.

**A rule that lights up correct prose does not ship.** The proofreader's chips
sit directly above the allergen chips in the same editor. A checker that argues
with correct writing teaches the owner to sweep the whole box away without
reading it — allergen suggestions included. `scripts/acceptance.js` holds a
block of clean menu sentences that must produce zero findings; treat a failure
there as blocking, not as a threshold to adjust.

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

- **Nobody has ordered through the site.** Read live on 6 September: `orders`
  and `order_lines` are empty, and have been since it went up on 29 August.
  Most likely the ordinary reason — customers use Facebook and the phone number
  the footer gives them. The flow suite drives a real order end to end and
  passes, so the path works in test; it has never been exercised by a customer.
  Worth knowing before reading a green suite as proof of anything live.
- **Email sends, and the poller waits on one rule.** Sending went live on
  31 August through Cyberimpact (587, `orders@dinnerbyderek.ca` as From, DKIM
  ×2 / SPF / DMARC all valid); `npm run mailtest` is the one-shot check.
  Receiving is Cloudflare Email Routing. The IMAP poller has been reading its
  own Gmail inbox every five minutes since 30 August and `orders@` is registered
  for **Autodeposit** at the bank, so a notification now means money arrived
  rather than money offered. What is left is **Derek's Outlook rule** —
  forwarding `payments.interac.ca` mail into the poller's inbox, keeping a copy.
  Until it exists the poller correctly finds nothing, which looks exactly like
  working, because a successful empty poll logs nothing at all. When it lands,
  run `npm run poll -- --dry --days 90` first: anything already in that inbox
  predates the 14-day search window and would otherwise never be read, and a
  wide sweep could in principle auto-settle an old order.
- **The training Payments screen is written and switched off.** One boolean in
  `server/training/sections.js`, waiting on the real Payments screen to settle.
  Its walkthrough steps are already written.
- **The installed PWA is an untested surface.** Every camera test ran in a
  browser tab; an installed home-screen app has its own Android permission
  grants.
- **A single transfer covering two orders** links to one; the other is marked
  paid by hand.
- **No recipe is linked to a dish yet.** The column, the picker and the checks
  all exist and nothing populates them; every link is one pick in the editor.
  The soups are the place to start — 28 of the 30 match a saved dish by name, so
  the picker finds each in one search.
- **Recipes are owner-only.** They print properly since 31 August — the button
  sits beside the scale controls and the sheet names the scale in words — but
  there is no path to them for anyone without the dashboard password, which is
  the intended shape rather than a gap.

### Test coverage gaps

Both are documented in comments where they matter rather than covered:

- **No DST-boundary test**, despite that being the property `time.js` exists for.
  A cutoff configured in the small hours would land an hour off twice a year.
- **No concurrency test.** `orders.js` is atomic only because better-sqlite3 is
  synchronous and no `await` sits between the read and the write. A second
  worker, or an `await` added inside `create()`, and the day oversells.

One habit worth keeping: several checks read source files to assert a fix is
still in place. They are useful and they have one failure mode — matching a
*mention* of the thing rather than the thing. One did exactly that during this
work, by matching a comment that quoted the old code.

Four of them were converted on 30 August to ask the running server instead: the
mail escaper and the e-transfer instruction are now called rather than grepped
for, signing out is a real POST expecting the login page, and all three print
sheets are handed a date that is not one. Three remain, each with a comment
saying why — the token-expiry condition cannot be reached without `index.js`
exporting its job, and the other two sit beside stronger behavioural checks of
the same thing.
