---
title: Building Dinner By Derek
eyebrow: Project history · 16–23 August 2026
source: docs/HISTORY.md
figures:
  90 = commits
  6 = days worked
  8 = dependencies
  0 = real orders
---

# Building Dinner By Derek

Eight days from an empty folder to a supper club that can take an order, refuse
the wrong one, and tell you which e-transfer paid for it. What got built, in
what order, and what had to be undone along the way.

Its companion, `docs/GOING-LIVE.md`, looks forward at what still has to be true
before a customer arrives. This one looks back.

<!-- toc -->

## What shaped everything

Two decisions sit under almost every entry below, and both were made on the
first day.

**No money moves through the app.** It takes orders; Derek gets paid his own
way. Interac has no API a supper club can call, so the only signal available is
the notification email a bank sends — which is why reconciliation, when it
finally arrived, was a parser rather than an integration.

**Nothing tells a customer a dish is safe except Derek.** The allergen tool
suggests, he decides, and the app refuses to publish a week until he has. Every
other safety property in the system is downstream of that one.

## Sunday 16 August — the shape of a week

Ten commits. Deciding what a supper club actually is, in database terms.

An installable web app on Express and SQLite — one database file, no build step,
no customer accounts, no app store. Pages are HTML the server writes and the
browser renders. That choice held for the whole week and never came up for
review.

Two things were built and then immediately corrected, which set the pattern for
everything after. Pickup **time slots** became a single open window, because a
supper club run out of a kitchen does not operate slots — people come by.
Free-typed dates became a **Monday–Sunday grid**, and then the grid's default
moved from the current week to the upcoming one, because the menu goes out on
Saturday for the week *after*.

Print and social came the same day, all generated from `brand/` by scripts
rather than maintained by hand in an image editor.

## Monday 17 August — making it true

Thirteen commits, and the day filling in a realistic week started finding
things. Four separate faults, all found the same way: by using the app and
looking at it as a customer. None were visible from reading the code.

> [!NOTE] The pattern worth remembering
> Every one of these worked exactly as written. The delivery fee computed
> correctly from a zone seeded to cover everywhere at one price. The allergen
> detector matched the dictionary perfectly against a string that did not
> include the dish name.

That second one is the failure mode that matters most here, because it fails
*quietly*: an empty suggestion list looks identical whether the dish is clean or
the detector never looked.

The same day brought the two cutoff boundaries — an order until 22:00 the night
before, a late request until 06:00 on the day, nothing after — and the rule that
**closed is not blank**, because a blank day reads as an oversight and the whole
point of closing a day is to say so.

## Tuesday 18 August — the hardening day

Twenty-six commits, the heaviest of the week, and almost none of it new
features. This was the day spent asking what happens when the app is on a public
address rather than a laptop. The answer was: several things, most of them
quiet.

- **The rate limiter could be walked past.** `X-Forwarded-For` was trusted
  unconditionally, so a caller could name a new address on every request.
- **The CSV export handed Excel a formula to run.** Four exported columns are
  typed by the customer, and a spreadsheet reads a leading `=` as code.
- **One submission could place two orders.** The only guard was a button
  disabling itself, which a refreshed form walks straight past.
- **Restore trusted the backup file twice over** — column names came out of the
  JSON and went straight into the INSERT.
- **Uploads ran before authentication**, so anyone could hand the process 25 MB
  to hold at a path that did not exist.

Seven commits went on three thermal stickers, which is the honest cost of a
physical thing you cannot undo once it is printed.

## Wednesday 19 August — the audit, and three missing buttons

Thirteen commits. Half the day closing a list of small faults; the other half
discovering that a working control nobody can find is the same as a broken one.

> [!IMPORTANT] Three controls went missing in one week
> Save, Load, and Take photo. All three existed. All three worked. All three
> lost to something louder next to them, and all three losses were specific to a
> narrow screen.

The camera one is worth the space. Take photo did open the camera — and the
dropzone above it, three times the size and worded as an instruction, opened the
photo library on top of it. Every single time.

> [!WARNING] The probe removed the bug it was measuring
> Every earlier attempt to reproduce it replaced the click method with a
> recorder that did not call through. The click never dispatched, never bubbled,
> and the dropzone handler never ran — so the instrumentation reported the
> camera firing correctly, which it was. What it could not see was what happened
> next.

## Saturday 22 August — money, and a test that lied

Eleven commits.

**Payments arrived.** Orders carried a payment method, which is a statement of
intent, and nothing downstream knew whether a transfer had landed. The rule that
makes it safe is narrow on purpose: an order settles by itself only when the
reference in the transfer message *and* the exact amount both agree. A reference
alone could be a typo; an amount alone is shared by every order that size that
week.

**The end-to-end suite only passed on weekdays.** Green Monday to Friday,
crashing at the weekend, with no code change between — it had been quietly
depending on the calendar for days, and was caught only because a deploy
happened on a Saturday.

**The server moved to Canada.** The deploy guide recommended Boston, correctly,
as the closest datacentre *the chosen provider* had. Nobody had asked which
providers have one in Canada. Several do, and every order holds a customer's
name, phone and sometimes their home address.

## Sunday 23 August — the audit, and everything after

Seventeen commits, the largest day of the project.

### A line-by-line audit

Twenty-four findings; twenty-three fixed, one closed as a deliberate decision.
Acceptance checks went from 424 to 568 over seven commits. The ones worth
carrying:

- **The allergen seed only ever ran on an empty table**, so every dictionary fix
  since the first install had been landing in the code and never in the
  database. 176 terms were missing, including the compound words a previous
  commit was written specifically to add.
- **A pasted payment notification could freeze the whole site.** Unbounded
  backtracking: 4,000 spaces took 26.5 seconds on the one thread that also
  serves the menu.
- **Four lookups answered for words nobody defined** — `constructor` and
  `__proto__` walked past the guard on the delivery strategy, the dish sort
  order, the week-item kind and the settings allow-list.
- **Two payments could claim one order**, and unlinking the first then marked
  the order unpaid while the second still stood against it.
- **The dictionary learned this kitchen's vocabulary**, read off the 817 saved
  dishes rather than guessed. Dishes raising nothing fell from 42% to 36%.

### And then the rest of the day

**Days belong to the week whose dates contain them.** Moving "Week starts"
leaves days behind, attached by `week_id` but outside the week's seven dates.
The published week was offering three dates already in the past.

**Interac sends a grid, not `Label: value`.** Three real notifications showed
the label alone on one line, a blank line, then the value. Every pattern was
written for the other shape, so the message field — the only part of a transfer
a customer controls, and the sole input to automatic matching — was never read
at all. The app was asking customers for a reference it could not then see.

**The published pages became generated.** The dish ledger reads the database;
the handoff, this page and the go-live guide are rendered from markdown in
`docs/`. Every one of them had drifted from the repo copy it restated, usually
within a day, and always in the direction of looking more finished than the repo
was.

## The misses, collected

Gathered because the pattern in them is more useful than any single entry.

**Four things that worked exactly as written, and were wrong.** The delivery
fee, computed correctly from a badly seeded zone. The allergen detector,
matching perfectly against text that excluded the dish name. Clock settings,
storing and printing exactly what was typed, including "four pm". The autosave
flag, reporting that a response arrived rather than that a write happened.

None of these throw. None appear in a log. Every one was found by using the app,
and none by reading the code.

**Three fixes that shipped and never arrived.** The allergen seed is the clean
example: the compound-word fix was written, tested, committed and inert, because
the code path that would have applied it only ran on a database that did not
exist yet. The test agreed with the code and both disagreed with production.

**Two documents that were confidently wrong.** Hosting prices guessed rather
than read from the account — right shape, every figure wrong, in a document
whose reader is about to spend money. And the go-live snapshot, which has now
gone stale within a day three times running, always in the direction of making
the remaining work look smaller.

**Rework that was just rework.** Seven commits for three stickers. Three to
re-cut artwork from sources that existed all along. Pickup slots built and
removed on day one. None of it wasted, exactly — but none of it was planning
either.

## Where it stands

**Nothing is live.** The domain is bought and pointing nowhere, there is no
server that can run a Node process, and `BASE_URL` is still localhost — so QR
codes point at a placeholder and no email leaves the app.

One week is published locally with five reviewed days on it, three standing
items are still unreviewed, and the only order in the database is a test.

The current state, and what to do next, is in `docs/HANDOFF.md`. The go-live
sequence is in `docs/GOING-LIVE.md`. Both are versioned with the code, which is
the point: this page is generated from the repo, so it can be wrong, but it
cannot disagree with the file it is generated from.
