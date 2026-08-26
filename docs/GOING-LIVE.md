# Going live — handover

What to do when Dinner By Derek stops being a thing on a laptop and starts
taking real orders, in the order it should be done, with the reasoning kept
next to each step so a decision can be revisited rather than re-guessed.

[docs/DEPLOY.md](DEPLOY.md) is the mechanical part — renting the server, DNS,
certificate, systemd. This is everything around it: what must be true before
customers arrive, what to watch in the first weeks, and the one design
question that is deliberately left open until there is evidence to settle it.

---

<!-- toc -->

---

## Where things stand today

Read from the live database and `.env` on 2026-08-26.
Check it again before starting — this is a snapshot, not a guarantee.

This table is the part of the document that rots fastest, because it reads two
things that are not versioned with the code. Git can say the file changed; it
cannot say the file became wrong. It has been wrong three times so far, and once
within four hours of a commit whose entire purpose was to re-read it.

| | state | matters because |
|---|---|---|
| Hosting | `todo: none` | Nothing can run a Node process yet. Everything else waits on this. No server exists anywhere — the Hostinger account was checked against its API on 2026-08-19 and holds no VPS and no domains, and no OVH account exists yet. |
| Domain | `ok: ready` `dinnerbyderek.ca`, in Cloudflare | DNS is ready; nothing points anywhere yet. |
| `BASE_URL` | `todo: localhost` | QR codes point at a placeholder, cookies are not secure, email links are dead. |
| `NODE_ENV` | `todo: development` | Static caching off, and the boot warnings are tuned for a laptop. |
| Admin password | `ok: hashed` scrypt | `ADMIN_PASSWORD_HASH` is set and the plaintext `ADMIN_PASSWORD` line is gone. Step 2 is already done; confirm the boot output rather than redo it. |
| `TRUST_PROXY` | `warn: unset` | Correct until nginx exists. Becomes `1` then. |
| Weeks | `warn: published` one week, live, starting 2026-08-24 | Five service days on the menu (Aug 24–28), all reviewed. Three further days sit outside the week dates and no longer reach a customer — they are in Menu History. Published by hand, not by the scheduler. **Aug 24 and 25 have already passed**, and the rest of it expires on the 28th — so this is not the week a customer will arrive to. See step 3. |
| Soup / salad | `todo: none` | |
| Standing items | `todo: 3 unreviewed` of 6 | Breaded Chicken Cutlets, Pulled Pork and BBQ Brisket. The two reheat bags have no description to review against, so those get written first. Other Options is invisible to customers until all three are ticked. **This is the one blocking item on the list** — see step 4, which also flags a fourth item worth a look. |
| Allergen dictionary | `ok: 479 terms` | Was 303 until the seed learned to reach a database that already exists. The extra 176 include caesar salad, oatmeal, tempura, croissant and most of the breads — the working vocabulary of these menus. A bigger dictionary can raise a new suggestion on an item already reviewed, which revokes that review; all fourteen reviewed items were re-checked on 2026-08-26 and none were revoked. |
| Saved dishes | `ok: 816` | A catalogue was imported. The Load picker is live and long, which is why it now sorts by how often a dish has run. |
| Orders | `warn: 1` a test order | One order exists (Aug 25, Pork Souvlaki). Delete it before the first real one, so the first real one is unmistakably the first. |
| Locations | `ok: 1` Waterloo, home kitchen | |
| Email | `todo: off` | Orders are recorded and shown in the dashboard; nothing is sent. Also the reason a customer sees the e-transfer reference only once, on screen — see [payments](#knowing-which-transfer-paid-for-what). |
| Payments | table exists, **0 rows** | The app has booted against this database, so the table is there. Empty is the correct state until a transfer arrives. |
| Facebook | not connected | Manual copy-and-paste publishing works without it. |

> [!NOTE] Use this while it lasts
> The only order in the database is a test. Rebuilding the week, unpublishing
> it, restoring a backup — all cheap today, all expensive the moment a real
> customer is in the orders table.

---

## Part 1 — Before a customer sees it

Ordered so that each step's prerequisites are already done. Nothing here is
optional; the optional things live in Part 2.

### 1. Get the server up

Follow [docs/DEPLOY.md](DEPLOY.md) end to end. **OVHcloud VPS-1** — 2 vCores,
4 GB RAM, 40 GB NVMe, around **CAD $6.20/month** — in **Beauharnois, Quebec**,
running **Ubuntu 24.04 LTS with no control panel**. Roughly an hour, most of it
waiting on DNS.

Quebec rather than the cheapest box anywhere, and not for speed: a US
datacentre costs perhaps fifteen milliseconds, which nobody notices. It is that
every order holds a customer's name, phone, email and sometimes their home
address, and keeping those in Canada means that question never has to be
answered. Billing in CAD also drops the currency spread.

Check two lines on the order page before paying: whether that price assumes a
longer commitment than month-to-month, and what it renews at.

Stop at the end of step 11 and come back here. Do not publish anything yet.

### 2. Hash the password

```bash
npm run password
```

Paste the hash into `ADMIN_PASSWORD_HASH`, then **blank the `ADMIN_PASSWORD`
line**. The app warns about this at every boot and the warning is right: a
plaintext password next to the hash is the copy that leaks, and it is the only
thing standing between the internet and the dashboard.

Restart, and confirm the boot output has nothing left under "worth fixing
before this is public".

### 3. Build a real week

The week starting 2026-08-24 is published already, with five days on it and
every one reviewed. What it has none of is a soup, a salad or a dessert. Three
further days sit outside its own dates — left behind by a change to the week
start — so they no longer reach a customer and are readable in Menu History.

**That week is not the one to go live on.** It ends on the 28th, and no server
exists yet to serve it, so by the time one does these dates are behind you. Its
value is as a worked example of a finished week rather than as the menu anyone
will read: build the week for the dates actually being cooked once hosting is
real.

**Duplicate last week**, at the top of This Week, copies the most recent week
into a fresh draft with the dates moved forward seven days — so it lands on the
week after whatever it copied, and the week start needs setting by hand if the
gap is longer than that. Closed days are not copied and standing items are not
touched.

> [!IMPORTANT] Duplicating resets every allergen review
> That is deliberate and it is the right behaviour — a review is about a dish on
> a specific menu — but it means duplicating is not a shortcut past step 4. The
> typing is saved; the reading is not.

In the dashboard: **This Week** → set the week start → add the service dates →
fill each day's featured dish with name, description and prices → add soup and
salad if there are any this week.

The dish library now holds 816 saved dishes, so **Put a saved dish on…** at the
top of This Week will do most of the typing for you. It sorts by how often each
dish has run, which is empty ordering today and useful ordering in a month.

**Do not publish yet.** The next step is what makes publishing legal.

### 4. Do the allergen reviews

Three standing items are still at `ack = 0`: **Breaded Chicken Cutlets**,
**Pulled Pork (Reheat Bag)** and **BBQ Brisket (Reheat Bag)**. Breaded Chicken
Cutlets already has a description and suggested allergens, so it needs only the
read and the tick. The two reheat bags have no description at all, and an item
with no description shows nothing useful and cannot be reviewed meaningfully —
so **write those two first, then review all three**.

One to look at while you are in here: **Pulled Chicken (Reheat Bag)** is ticked
but still has no description. The tick is yours and stays yours; it is only
worth knowing that it went on an item with nothing written under it.

For every item and every day's dish: read what the dictionary suggests, accept
what is true, dismiss what is not, and tick the box. The app will refuse to
publish a week holding an unreviewed dish, and that refusal is the single most
important safety property in the whole system. It is not a formality and it is
not something to work around.

> [!IMPORTANT] Only you can do this
> Nobody else can do this step. Not me, not a script — the tick means *you*
> checked this dish, as written, for the menu it is going on.

### 5. Publish, and look at it as a customer

Publish the week, then open `https://dinnerbyderek.ca` on a phone that is not
signed in. Check the day cards name the right dishes, the cutoff line reads
correctly, prices are right, and Other Options shows the standing items now
that they are reviewed.

Place a test order. Then **delete it** from the dashboard before real ones
arrive, so the first real order is unmistakably the first.

### 6. Regenerate the printed graphics

**Settings → Graphics → regenerate**, now that `BASE_URL` is the real domain.

Anything generated before this points at a placeholder. Do this before
anything goes to a printer — the business card and sticker QR codes are the
expensive mistake, because they are wrong on paper rather than wrong on a
screen.

### 7. Reinstall the PWA on the phone

Remove the app from the home screen, reload in Chrome, add it again.

Android caches the icon at install time, so the splash-icon fix (`5812a0f`)
will not appear on an install predating it. **Check the launch screen shows
the whole badge with nothing clipped.** If it is still cut off, the maskable
inset needs to drop from 0.52 to about 0.42 in
[scripts/make-icons.js](../scripts/make-icons.js) — the reasoning is in the
comment there.

### 8. Take a backup

**Settings → Backup → Download a backup**, plus a copy of the uploads folder:

```bash
rsync -av derek@SERVER_IP:/var/lib/dinnerbyderek/ ~/dinnerbyderek-backup/
```

This is the "known good, before customers" snapshot. Keep it somewhere that is
not the server.

---

## Part 2 — The first week live

### Email, when you want it

Orders are recorded and appear in the dashboard whether or not email works, so
this is genuinely optional — but without it, nothing tells you an order
arrived except opening the dashboard.

Sending needs an SMTP provider (Resend, Postmark and Fastmail all have small
or free tiers). Put `SMTP_FROM` on the domain — `orders@dinnerbyderek.ca` —
not on a personal mailbox, or it lands in spam. Receiving is separate and
free: Cloudflare → Email → Email Routing forwards to an inbox you already
read.

Set `SMTP_*` and `BASE_URL` together or not at all. Email with a `localhost`
`BASE_URL` sends you alerts whose links are dead from a phone, which is worse
than no email.

### Knowing which transfer paid for what

**Dashboard → Payments.** Nothing to set up, and nothing to decide before the
first order — but worth understanding before the first e-transfer lands rather
than after.

No money moves through the app and it never talks to a bank. Interac has no API
a supper club can call, so the only signal is the notification email the bank
sends when a transfer arrives. Paste one into the Payments screen and the app
reads the sender, the amount and the message, and tries to name the order.

The one thing worth knowing: **it settles an order by itself only when the
reference in the transfer message and the amount both agree.** A reference on
its own could be a typo; an amount on its own is shared by every order of that
size that week. Anything weaker is shown as a suggestion and waits for you.
Every automatic match is marked as automatic, and unlinking puts the order back
exactly as it was — including leaving it paid if it was already paid by hand.

This works because the confirmation screen and the customer's confirmation
email now ask e-transfer customers to put their order reference in the transfer
message. That happens on its own; there is nothing to switch on. But it is a
reason to get [email](#email-when-you-want-it) working sooner rather than later
— without it, the customer sees the request on screen once and never again, and
a customer who does not include the reference is one you match by hand.

An order marked paid is a statement about money, not about intent. Somebody
choosing "E-transfer" on the form has not paid, and the app has never pretended
otherwise. The Payments screen is what closes that gap.

Full detail in the README, under *Matching e-transfers to orders*.

### Reading the mailbox automatically, if ever

Optional, and nothing here blocks going live — pasting works. But the question
that used to sit in front of it is now answered, so what remains is worth
writing down while it is known.

**The format question is settled.** Three real notifications were read on
2026-08-23, and `fddefc1` taught the parser what they actually contain. Interac
writes the transfer details as a grid — the label alone on one line, a blank
line, then the value — which is what its two-column HTML table flattens to, and
every pattern before that had been written for `Label: value` on one line. The
message field, which is the sole input to the one rung that settles an order by
itself, was not being read at all. The app was asking customers for a reference
it could not then see.

Two things that came out of the same reading are worth knowing even if no poller
is ever built. The sender name was *worse than unread* — the only pattern
reaching a real notification ran over the subject, where the name sits inside a
sentence that continues past it, so whether the mail client wrapped that line
decided what got stored. And a forwarded notification carries two identities,
its own and the original's; the original is the one belonging to the money, so
the same transfer is one payment whether it is forwarded by hand, forwarded
twice, or later read straight from a mailbox. Without that, switching a poller on
would have doubled everything already in flight.

**What is left is plumbing**, and it needs somewhere to run — so it waits on
hosting like everything else:

- A mailbox that receives **only** these notifications, so the parser never
  reads anything else. A dedicated address, or a filter that forwards to one.
- An IMAP client dependency, and `IMAP_*` credentials alongside `SMTP_*`.
- A poller that decodes MIME to the headers and text part the parser expects,
  hands each message to `P.record()` in `server/payments.js`, and runs on a
  timer next to the scheduled publish in `server/index.js`.

Nothing else changes. `record()` already accepts `source: 'mailbox'`, the
Payments screen already labels those rows *from the mailbox*, and duplicate
protection means re-reading the same message is free — so the poller needs no
memory of what it has already seen.

### Facebook, if ever

Optional and skippable forever. The manual copy-and-paste path works and is
the only path for Groups anyway. If you do connect it, `TOKEN_ENCRYPTION_KEY`
becomes required.

### Backups on a schedule

Turn on your provider's automatic snapshots — OVH sells them as an add-on,
Hostinger includes them weekly on most plans. They cover the whole machine after
you break something. That is a different job from the JSON export, which
covers the menu after you delete the wrong week. Have both. Run the `rsync`
before every deploy.

### The orange cloud, if you want it

Proxying through Cloudflare is a five-minute change and buys caching and a
hidden origin IP. Two settings move together: SSL/TLS mode to **Full
(strict)**, and `TRUST_PROXY` from `1` to **`2`**. Getting the second wrong
breaks the login rate limiter in a way that looks like a bug in the limiter.
Full reasoning in [DEPLOY.md](DEPLOY.md#optional-the-orange-cloud).

---

## Part 3 — Desktop or phone: measure, do not guess

**This was left open deliberately, and then answered anyway.** The day editor
got a phone layout in `fdcc210` before a single real week had been built on
either device — reorder below 760px, keep the desktop form above it. That may
well be right. It was reasoned rather than measured, and the measurement it
was waiting for is still worth taking.

Three controls went missing in one week — the Save button, the Load picker,
and the camera button. All three were present and working; all three lost to
something louder next to them, and all three losses were specific to a narrow
screen. Shaping the editor properly means knowing which screen matters.

Guessing is expensive in both directions. Optimise for the phone and a desktop
week-build gets a cramped, over-collapsed form. Optimise for the desktop and
the misses keep happening.

### The measurement costs nothing

nginx's default log format records the User-Agent of every request. After
three or four weeks of building real menus, the logs will simply say which
device you used. No code, no analytics, no third party.

```bash
sudo grep '"GET /admin' /var/log/nginx/access.log | grep -ci mobile
```

```bash
sudo grep '"GET /admin' /var/log/nginx/access.log | grep -civ mobile
```

The first counts phone visits to the dashboard, the second everything else.
Logs rotate weekly, so include the older ones for a fuller picture:

```bash
sudo zgrep -h '"GET /admin' /var/log/nginx/access.log* | grep -ci mobile
```

Rough, and good enough. The question is not "what is the exact ratio", it is
"which of these is the main way this gets done" — and a 5:1 split answers that
just as well as a precise number would.

### What counts as an answer

Count **dashboard page loads while actually building a week**, not idle
checking. Checking today's orders from a phone on the way to the kitchen is
not the same activity as sitting down to write next week's menu, and only the
second one is what the editor should be shaped around.

If the logs are ambiguous, the tiebreaker is simpler: **the next time you sit
down to build a week, notice what you reach for.** That instinct is the
answer.

---

## Part 4 — The day-editor pass

**Largely done, ahead of the evidence.** `fdcc210` gave the editor a phone
layout, `b26f152` stopped the saved-dish picker being drawn seven times per
page, and the Load and camera misses are fixed. What follows is what remains,
and what to check once Part 3 has an answer.

### The problem, stated once

The day editor was built desktop-first: a long scrolling form where everything
is visible at once and scanning is cheap. On a phone it becomes a single
column where **vertical order is priority order**, and anything below the fold
effectively does not exist. One day box holds roughly fifteen controls in an
undifferentiated stack.

The three misses were all the same failure — a quiet important control next to
a loud unimportant one:

| control | what beat it | status |
|---|---|---|
| Save "…" to my dishes | buried below the editor, inside a collapsed box | **still true** |
| Load / "Use it" | hid itself entirely when the library was empty | fixed, `141a2c1`; redrawn once per page in `b26f152` |
| Take photo | a box 3× its size, above it, saying "Tap to choose a photo" | fixed, `84cdff4`, and the real cause in `ef60d78` |

### Work that pays off either way

Do these regardless of what Part 3 says. None of them are device-specific.

**Group controls by how often they are used.** The box currently interleaves
weekly things (dish name, description, price) with rare things (daily cap,
per-day pickup override, closure note) and once-ever things (allergen review).
Three groups, the rare ones behind their own `<details>`. The common path gets
short for everybody.

**One primary button per group.** `btn--primary` should be scarce enough to
mean something. The day editor had none at all until the camera fix, so
nothing signalled what you came there to do.

**Settle one empty-state convention and apply it everywhere.** There are
currently three: the Load picker used to vanish, standing items are invisible
without a description, the QR warns inline when `BASE_URL` is unset. Pick the
one that already proved itself — *show the control, disabled, with the reason*
— and use it consistently.

**Put more in the collapsed summary.** Boxes stay collapsed once a day has a
dish, which is the right call for a clean page. But then the summary line is
the entire interface for a finished day. It shows weekday, date, dish name and
review flag; it could also show the price and whether a photo exists, so a
whole week can be audited without opening anything.

### If the answer is "phone"

**Demote desktop-only affordances.** The dropzone is the proven case — a phone
cannot drag and does not paste, yet it was the largest target on the page.
Walk the whole editor at 375px asking one question of each screen: *what is
the largest thing here, and is it the most important thing here?* Where the
answer differs, that is the next bug waiting.

**Consider hiding the dropzone entirely below a breakpoint** rather than
merely demoting it. It does nothing a phone can use.

**Audit tap targets and order, not just presence.** Every miss so far was a
control that existed, rendered, and worked.

### If the answer is "desktop"

The pass is much smaller. Keep the shared work above, skip the reordering, and
leave the mobile affordances where they are — the phone becomes the "check
orders on the way to the kitchen" surface, which it is already fine for.

Do still fix the Save button's position, because that miss happened on both.

### If it is genuinely mixed

Do the shared work, then optimise the phone for *reading* — order lists, the
day summary, today's totals — and the desktop for *writing*. That split is
honest, and it is a smaller job than making one layout excellent at both.

### Scope

Half a day, and it needs your eyes rather than mine: it is judgment about your
workflow, and there is no test that catches a regression in taste. The useful
starting move is you building one real week while I watch what you reach for.

---

## Part 5 — Known unknowns

Things genuinely unresolved, so nobody has to rediscover them.

**The installed PWA is an untested surface.** Every camera test was in a
Chrome tab. An installed home-screen app is a WebAPK with its own Android
permission grants. If "Take photo" misbehaves there specifically, that is a
new and different question — worth one deliberate check after the reinstall in
Part 1 step 7.

**The Android splash crop is designed to spec, not to observation.** The
maskable icon now clears the documented Android 12+ two-thirds circle with
about 30px to spare. If some launcher compounds the adaptive-icon crop with
the splash circle, 54.6% would still clip. There was no evidence that happens,
and padding harder makes the home-screen icon visibly small — so it is set to
the documented rule. Verify after reinstalling.

**Cloudflare and the "everything we serve, we load" property.** The edge
requested its own `email-decode` script on one page load during testing.
Nothing broke and the e-transfer address renders as plain text, but Cloudflare
does rewrite pages containing email addresses. Worth a look if you turn on the
orange cloud, because the README describes a page that loads nothing it does
not serve, and that stops being strictly true behind the proxy.

**One stale-HTML observation.** Immediately after seeding demo data, a page
served stale content and corrected itself on reload. Never reproduced. Worth
remembering only because "a published week does not appear" would be alarming
and this would be the cause.

---

## Appendix — quick reference

**Deploy a change**

```bash
cd /srv/dinner-by-derek && git pull && npm ci --omit=dev && sudo systemctl restart dinnerbyderek
```

**Watch the app**

```bash
journalctl -u dinnerbyderek -n 50 --no-pager
```

**Back up everything**

```bash
rsync -av derek@SERVER_IP:/var/lib/dinnerbyderek/ ~/dinnerbyderek-backup/
```

**Run the tests**

```bash
npm test
```

**Which device builds the menus**

```bash
sudo zgrep -h '"GET /admin' /var/log/nginx/access.log* | grep -ci mobile
```

**When something is wrong** — work from the inside out: is the app running, is
nginx running, is DNS right. The table in
[DEPLOY.md](DEPLOY.md#when-something-is-wrong) lists the failures that actually
happen and what each one means.
