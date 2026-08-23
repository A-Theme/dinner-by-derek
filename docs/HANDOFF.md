# Handoff — 23 August 2026

Where the project stands at the end of a long day, and what to pick up next.

**This document rots.** The numbers below were read from `data/dinnerbyderek.db`
and `.env` on the evening of 23 August. Re-read both before acting on any of
them — that habit is not decoration, it is what produced half the corrections
made today.

**`docs/GOING-LIVE.md` owns the go-live sequence.** This file does not repeat it.
Where the two disagree, that one is the operational document and this one is a
snapshot of a moment.

---

## Where things are

`main` at `e774889`, clean, in sync with `origin/main`.
Suites green: **597 acceptance, 336 flow** (`npm test`).

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

The three unreviewed standing items are **Breaded Chicken Cutlets**, **Pulled
Pork (Reheat Bag)** and **BBQ Brisket (Reheat Bag)**. Other Options shows
customers nothing until each is reviewed. They are the owner's to tick — nobody
else can mean it.

### `.env`

Ready: `ADMIN_PASSWORD_HASH` (plaintext line gone), `SESSION_SECRET`, `DB_PATH`.

Not set: `BASE_URL` (still `http://localhost:3000`), `TOKEN_ENCRYPTION_KEY`,
all `SMTP_*`, `FB_APP_ID` / `FB_APP_SECRET`. `NODE_ENV=development`,
`TRUST_PROXY` unset.

---

## Next steps

**1. Hosting.** Nothing that can run a Node process exists yet, and everything
below waits on it. The guide recommends OVHcloud VPS-1 in Beauharnois, Quebec —
chosen so customer names, phones and delivery addresses stay in Canada, not for
latency. Hostinger is the documented runner-up. Two OVH figures are flagged
unverified in `DEPLOY.md`: whether the headline price assumes a longer
commitment, and the renewal rate.

**2. `BASE_URL` on the real domain.** More hangs off this than it looks:
secure cookies, every link in every email, the QR codes on the card and
stickers, and Facebook's ability to fetch a post image at all. Set it, then
**regenerate the graphics before anything reaches a printer** — a wrong QR on
paper is the expensive version of this mistake.

**3. The three standing-item reviews.** The only work here nobody but the owner
can do.

**4. Optional, in rough order of value.** SMTP, so an order arriving is
something you learn without opening the dashboard — set `SMTP_*` and `BASE_URL`
together or not at all, because mail with a localhost base is mail whose every
button is dead. Then `TOKEN_ENCRYPTION_KEY` if Facebook one-tap publishing is
wanted; the copy-and-paste path works without it. Then the IMAP poller.

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

### Payments, the ledger, and the week — `2e5f15f` … `e774889`

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
