# Going live — handover

What to do when Dinner By Derek stops being a thing on a laptop and starts
taking real orders, in the order it should be done, with the reasoning kept
next to each step so a decision can be revisited rather than re-guessed.

[docs/DEPLOY.md](DEPLOY.md) is the mechanical part — renting the server, DNS,
certificate, systemd. This is everything around it: what must be true before
customers arrive, what to watch in the first weeks, and the one design
question that is deliberately left open until there is evidence to settle it.

---

## Contents

- [Where things stand today](#where-things-stand-today)
- [Part 1 — Before a customer sees it](#part-1--before-a-customer-sees-it)
- [Part 2 — The first week live](#part-2--the-first-week-live)
- [Part 3 — Desktop or phone: measure, do not guess](#part-3--desktop-or-phone-measure-do-not-guess)
- [Part 4 — The day-editor pass](#part-4--the-day-editor-pass)
- [Part 5 — Known unknowns](#part-5--known-unknowns)
- [Appendix — quick reference](#appendix--quick-reference)

---

## Where things stand today

Recorded 2026-08-19, from the live database and `.env`. Check it again before
starting — this is a snapshot, not a guarantee.

| | state | matters because |
|---|---|---|
| Hosting | **none** | Nothing can run a Node process yet. Everything else waits on this. |
| Domain | `dinnerbyderek.ca`, in Cloudflare | DNS is ready; nothing points anywhere yet. |
| `BASE_URL` | `http://localhost:3000` | QR codes point at a placeholder, cookies are not secure, email links are dead. |
| `NODE_ENV` | `development` | Static caching off, and the boot warnings are tuned for a laptop. |
| Admin password | **plaintext**, not hashed | `ADMIN_PASSWORD_HASH` is empty. Fine on a laptop, not on a public server. |
| `TRUST_PROXY` | unset | Correct until nginx exists. Becomes `1` then. |
| Weeks | one draft, **zero service days** | Publishing it shows customers an empty menu. |
| Soup / salad | none | |
| Standing items | 6, **all unreviewed**; 3 have no description | Other Options is invisible to customers until these are written and ticked. |
| Saved dishes | 0 | The Load picker is disabled until this has something in it. |
| Orders | 0 | Nothing to preserve. The database can be rebuilt freely right now. |
| Locations | 1 — Waterloo, home kitchen | |
| Email | off | Orders are recorded and shown in the dashboard; nothing is sent. |
| Facebook | not connected | Manual copy-and-paste publishing works without it. |

**The freedom in that table is worth using.** Zero orders means nothing is
precious yet. Rebuilding the week, deleting the draft, restoring a backup —
all cheap today, all expensive once real customers are in the orders table.

---

## Part 1 — Before a customer sees it

Ordered so that each step's prerequisites are already done. Nothing here is
optional; the optional things live in Part 2.

### 1. Get the server up

Follow [docs/DEPLOY.md](DEPLOY.md) end to end. Hostinger KVM 1, Ubuntu 24.04
**with no control panel**, 12-month term. Roughly an hour, most of it waiting
on DNS.

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

The draft in the database has no service days. It cannot be published into
anything a customer would want to see.

In the dashboard: **This Week** → set the week start → add the service dates →
fill each day's featured dish with name, description and prices → add soup and
salad if there are any this week.

**Do not publish yet.** The next step is what makes publishing legal.

### 4. Do the allergen reviews

Six standing items are sitting at `ack = 0`, and three of them
— Pulled Pork, BBQ Brisket, Pulled Chicken — have no description at all. An
item with no description shows nothing useful and cannot be reviewed
meaningfully, so **write the descriptions first, then review**.

For every item and every day's dish: read what the dictionary suggests, accept
what is true, dismiss what is not, and tick the box. The app will refuse to
publish a week holding an unreviewed dish, and that refusal is the single most
important safety property in the whole system. It is not a formality and it is
not something to work around.

Nobody else can do this step. Not me, not a script — the tick means *you*
checked this dish, as written, for the menu it is going on.

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

### Facebook, if ever

Optional and skippable forever. The manual copy-and-paste path works and is
the only path for Groups anyway. If you do connect it, `TOKEN_ENCRYPTION_KEY`
becomes required.

### Backups on a schedule

Turn on Hostinger's weekly VPS snapshots — they cover the whole machine after
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

**This is the open question, and it should stay open for about a month.**

Three controls went missing in one week — the Save button, the Load picker,
and the camera button. All three were present and working; all three lost to
something louder next to them, and all three losses were specific to a narrow
screen. Fixing the editor properly means knowing which screen matters, and
right now neither of us knows.

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

Do this **after** Part 3 has an answer, not before.

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
| Save "…" to my dishes | buried below the editor, inside a collapsed box | still true |
| Load / "Use it" | hid itself entirely when the library was empty | fixed, `141a2c1` |
| Take photo | a box 3× its size, above it, saying "Tap to choose a photo" | fixed, `84cdff4` |

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
