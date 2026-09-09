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

Read from the server on 2026-08-30, over HTTP on 2026-09-08, and from a **snapshot of the
live database pulled down on 2026-09-09** — which is where every database row below now
comes from. Check it before starting —
this is a snapshot, not a guarantee.

Every row is dated, and there are no carried-forward figures left. What the server tells
anyone asking — that it is up, what base URL it booted with, what cache headers it sets — was
read over HTTP. Everything **inside** the database was read from a snapshot taken on the 9th
with the app's own `better-sqlite3` backup API and copied down over an interactive login,
because the deploy key cannot read anything (connecting with it *is* a deploy) and `sqlite3`
is not installed on the box. That takes about ten minutes and is worth repeating rather than
guessing.

This table is the part of the document that rots fastest, because it reads two
things that are not versioned with the code. Git can say the file changed; it
cannot say the file became wrong. It has been wrong three times so far, and once
within four hours of a commit whose entire purpose was to re-read it.

| | state | matters because |
|---|---|---|
| Hosting | `ok: live` OVH VPS, Ubuntu 24.04 | **Done.** The app runs under systemd as `dinnerbyderek`, code in `/srv/dinner-by-derek`, data in `/var/lib/dinnerbyderek`. Deploying a change is `git pull` and a restart — see [DEPLOY](DEPLOY.md#deploying-a-change-later). |
| Domain | `ok: live` `dinnerbyderek.ca`, in Cloudflare | Resolving, with a certificate. The site answers on https. |
| `BASE_URL` | `ok: https://dinnerbyderek.ca` | Read off the server's own boot line. Secure cookies and HSTS follow from it automatically — the app decides both from the scheme rather than from `NODE_ENV`. The graphics were regenerated afterwards and the codes were **decoded and checked on 2026-08-30**: the card back and the scan sticker served from `/print` both resolve to `https://dinnerbyderek.ca`, and the card prints that address under the code. See [step 6](#6-regenerate-the-printed-graphics). |
| `NODE_ENV` / `TRUST_PROXY` | `ok: both correct` 2026-08-30 | **They are visible from outside after all.** `isProd` gates only two boot warnings and the static cache lifetime, so the headers report it: `/app.css` comes back `max-age=604800` and `/print/…` `max-age=3600`, which are the `7d` and `1h` branches — therefore `NODE_ENV=production`. The boot output then carries no "Worth fixing before this is public" block, and with `isProd` true that block is printed whenever `trustProxy` is false — so `TRUST_PROXY` is set. The same silence proves the admin password is hashed and the plaintext line is gone, since that note is not gated on `isProd` at all. |
| Admin password | `ok: hashed` scrypt | `ADMIN_PASSWORD_HASH` is set and the plaintext `ADMIN_PASSWORD` line is gone. Step 2 is already done; confirm the boot output rather than redo it. |
| Weeks | `warn: one row, reused` read live 2026-09-09 | There is exactly **one** row in `weeks` — `week-2026-08-16` — and its start date is moved forward each week rather than a new week being started. That is the workflow actually in use, and it strands the previous week's days outside the new range, where every customer-facing query filters them out. On 6 September that had stranded 14 day rows and **the live menu was blank** while the database was full of dishes; they were cleaned that day after a backup. As of the 9th `week_start` is 2026-09-07, the week is published, and **nothing is stranded** — it carries three service days (8, 9 and 10 September), all reviewed. Its `published_at` still reads 29 August, because the row itself has never been replaced. See [step 3](#3-build-a-real-week) before touching a week start. |
| Soup / salad / dessert | `ok: 5 items` read live 2026-09-09 | Two soups, two salads and a dessert, all reviewed. The second slot for soup and salad landed on 6 September and was in use within two days — the posts have offered a choice of two for three years. |
| Standing items | `ok: all reviewed` | **Done, reported 2026-08-30.** Breaded Chicken Cutlets, Pulled Pork and BBQ Brisket were the three outstanding, and they were the one blocking item on this list. **Other Options is therefore visible to customers now**, which it had never been — the section stays hidden while any item in it is unticked. |
| Allergen dictionary | `ok: 479 terms` read live 2026-09-09 | Was 303 until the seed learned to reach a database that already exists. The extra 176 include caesar salad, oatmeal, tempura, croissant and most of the breads — the working vocabulary of these menus. A bigger dictionary can raise a new suggestion on an item already reviewed, which revokes that review; all fourteen reviewed items were re-checked on 2026-08-26 and none were revoked. |
| Saved dishes | `ok: 813` read live 2026-09-09 | 375 mains, 145 soups, 187 salads, 106 desserts. **10 carry an allergen review**; an imported catalogue is unreviewed until a dish goes on a menu, which is the design. The Load picker sorts by how often a dish has run. |
| Orders | `ok: none` read live 2026-09-09 | **Empty, and empty since the site went up on 29 August** — not "none this week". `orders` and `order_lines` both hold nothing. The likeliest reason is the ordinary one: customers use Facebook and the phone number in the footer. The flow suite drives a real order end to end and passes, so the path works in test and has never been exercised by a customer. |
| Recipes | `ok: 415` read live 2026-09-09 | Across 17 tags, and **none linked to a dish** — the column, the picker and the checks all exist and nothing populates them. The laptop still holds 230, because the recipe seed runs at boot and that process has not restarted. |
| Email | `ok: sending and receiving` 2026-08-31 | **Both directions work.** Receiving is Cloudflare Email Routing on `orders@dinnerbyderek.ca`. Sending went live on the 31st through Cyberimpact — port 587, `SMTP_FROM=orders@dinnerbyderek.ca`, and the domain shows DKIM ×2, SPF and DMARC all valid. `npm run mailtest` is the one-shot check. So a customer now gets their confirmation, with the reference they are asked to put in the transfer, rather than seeing it once on screen. |
| Payments | `ok: 0 rows` read live 2026-09-09 | Empty is the correct state until a transfer arrives. The **poller is live** — reading its own inbox every five minutes since 30 August — and `orders@` is registered for **Autodeposit**, so a notification means money landed rather than money offered. One thing is outstanding: the rule in Derek's Outlook that forwards `payments.interac.ca` mail into that inbox. Until it exists the poller correctly finds nothing, and a successful empty poll logs nothing at all. |
| Facebook | not connected | Manual copy-and-paste publishing works without it. |

> [!NOTE] Use this while it lasts
> Read live on 2026-09-09: the orders table is **empty and always has been**,
> and no payment has ever arrived. While that holds, rebuilding the week,
> unpublishing it and restoring a backup are all cheap, and all expensive the
> moment a real customer is in the orders table. Check before assuming it still
> holds — the site has been taking orders on a public address since 29 August,
> and nothing announces the first one except the dashboard and, now that
> sending works, an email.

---

## Part 1 — Before a customer sees it

Ordered so that each step's prerequisites are already done. Nothing here is
optional; the optional things live in Part 2.

> [!IMPORTANT] Steps 1 and 2 are done
> The server is up and the password is hashed. Both are kept below rather than
> deleted, because they are also how the box gets rebuilt if it is ever lost,
> and the reasoning behind the choices is not recoverable from a running
> machine. Start at step 3.

### 1. Get the server up

Follow [docs/DEPLOY.md](DEPLOY.md) end to end. **OVHcloud VPS-1** (2027
range) — 2 vCores, 4 GB RAM, 40 GB NVMe, **CAD $6.20/month** — in
**Beauharnois, Quebec**, running **Ubuntu 24.04 LTS with no control panel**.
Roughly an hour, most of it waiting on DNS.

**[Order it here](https://www.ovhcloud.com/en-ca/vps/configurator/?planCode=vps-2027-model1&pricing=upfront12)**
— the configurator, opened on VPS-1 with the twelve-month term already
selected.

Two things on that page will not be what you expect. Beauharnois sits under
the **North America** tab and is the only entry there — Toronto is not sold
for VPS. And the image list **opens on Ubuntu 26.04**: open the version
selector and pick **24.04 LTS**, which is what every command in DEPLOY.md was
written against. Take none of the paid options; daily backup is included.

Quebec rather than the cheapest box anywhere, and not for speed: a US
datacentre costs perhaps fifteen milliseconds, which nobody notices. It is that
every order holds a customer's name, phone, email and sometimes their home
address, and keeping those in Canada means that question never has to be
answered. Billing in CAD also drops the currency spread.

Both questions this step used to leave open are now answered, from the
configurator on 2026-08-29. The $6.20 is the **twelve-month price, paid
upfront** — $74.40 for the year ex. taxes, about $84 with HST; month-to-month
is $7.30. And it **renews at the same rate**, so there is no second-year step
to meet on a statement.

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

A week is live and has been since 29 August, when the scheduler published one
by itself for the first time. So this step is no longer "build the first week"
— it is the ordinary Saturday job, and it is worth reading before doing it,
because the way it is currently done has a failure mode.

> [!IMPORTANT] Moving the week start strands the days already on it
> There is one week row in the database and its start date gets moved forward
> each week. Moving it deliberately leaves filled-in days on their original
> dates — and the customer menu shows only days inside `week_start … +6`, so
> every move pushes last week's days out of sight. On 6 September that had left
> 14 stranded rows and a **blank live menu** over a database full of dishes.
> Use **Duplicate last week** or **Start this week's menu** instead. If the
> customer page says "The menu for these dates isn't up yet" while the dashboard
> plainly has dishes on it, this is what happened.

**Paste the Facebook post.** Since `4724f34` the week page opens with a box
that takes Derek's own post and reads it with the same parser that read three
years of them for the dish library: day lines, the Single Select heading, the
$12 litre of soup, the $4 dessert. It reads before it writes — the preview is
one editable card per line — and **nothing arrives reviewed**, so a pasted week
still costs about seven ticks in step 4. That is the price of the feature and
the point of it. It works on a phone, which is where Saturday actually happens.

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
salad if there are any this week. The week holds **two soups and two salads**
since `913bd89`, because the posts have offered a choice of two for three
years, and a day with no headline dish is no longer listed to customers at all
rather than reading "Menu coming soon".

The dish library holds around 816 saved dishes, so **Put a saved dish on…** at
the top of This Week will do most of the typing. It sorts by how often each dish
has run.

**Do not publish yet.** The next step is what makes publishing legal.

### 4. Do the allergen reviews

**Done — reported 2026-08-30.** The three that were outstanding — **Breaded
Chicken Cutlets**, **Pulled Pork (Reheat Bag)** and **BBQ Brisket (Reheat
Bag)** — have been reviewed.

**What follows from that is worth a look:** Other Options was invisible to
customers for as long as any of the three was unticked, and it is not any more.
The customer menu shows more than it did the day before, so it is worth reading
the live site once as a customer to see the standing items the way they now
appear.

The method is kept below because it is the same every week, for every new dish.

**Pulled Chicken (Reheat Bag)** was raised here as ticked-with-no-description
and consciously left. It is not an open action; it is recorded so nobody
rediscovers it and files it as a bug.

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

**Done — reported 2026-08-30.** Regenerated after `BASE_URL` became the real
domain, so **the QR codes now lead somewhere and printing is safe.** That was
the last thing standing between the business card and a printer.

The reason it was a step of its own: anything generated before `BASE_URL` was
set points at a placeholder, and that is the expensive version of the mistake —
wrong on paper rather than wrong on a screen. Regenerate again if `BASE_URL`
ever changes.

> [!WARNING] Regenerate from the Dashboard, never from `npm run`
> `scripts/card.js` and `scripts/sticker.js` read `process.env.BASE_URL`
> directly, and `dotenv` is loaded in exactly one file — `server/config.js` —
> which neither script requires. Run from a shell, **on the server or the
> laptop**, they therefore see no `BASE_URL` and quietly emit the placeholder.
> **Dashboard → Graphics** calls the same two functions from inside the server
> process, where `.env` was already read at boot. The card prints its address
> under the code so a bad one is visible; the sticker face says only "SCAN ME",
> so a roll can be printed dead with nothing on it to give that away.

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

### Email — live since 31 August

**This is done.** Sending runs through Cyberimpact on port 587 with
`SMTP_FROM=orders@dinnerbyderek.ca`, the domain validated there with two DKIM
CNAMEs and a return-path CNAME added **DNS-only** at Cloudflare, and DKIM, SPF
and DMARC all show valid. Receiving is Cloudflare Email Routing on the same
address. `npm run mailtest` sends one real message and separates connecting
from being allowed to send as that From address.

Two traps cost an afternoon on the way in, both written up in
[DEPLOY](DEPLOY.md#optional-email), and both present as an authentication
failure while being nothing of the sort. The provider checks DNS the moment the
domain is added and **caches the miss** for the zone's SOA minimum — half an
hour here — so every check inside that window says invalid however correct the
records are; the tell is DMARC passing while the three new records fail, which
proves the checker can read the zone and is answering from cache. And the SMTP
password shown while creating the user is not committed until Save is pressed,
and cannot be displayed again afterwards.

Left as written, for whoever changes it: keep `SMTP_FROM` on the domain rather
than a personal mailbox, or it lands in spam. Never add a second SPF record —
two is invalid rather than stricter, and Cloudflare has already written the
first. Set `SMTP_*` and `BASE_URL` together or not at all: email with a
`localhost` `BASE_URL` sends alerts whose links are dead from a phone, which
is worse than no email.

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
message. That happens on its own; there is nothing to switch on. That mattered more before
[email](#email-live-since-31-august) worked: until 31 August the customer saw the
request on screen once and never again. Now the confirmation carries it too, and
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

**It is built, deployed and running.** `server/mailbox.js` has been reading a
mailbox every five minutes since 30 August, off entirely unless `IMAP_HOST` is
set, with `npm run poll -- --dry` to try it without writing anything. Three of
the four arrangements below are done: one address on the domain, `orders@`
registered for Autodeposit at the bank, and an inbox of the poller's own that
takes a password over IMAP.

**One is outstanding, and it is Derek's to make:** the rule in his Outlook that
forwards mail from `payments.interac.ca` into that inbox, keeping a copy. Until
it exists the poller finds nothing and says nothing, because a successful empty
poll logs no line at all — the healthy state and the symptom look identical.
When the rule lands, run `npm run poll -- --dry --days 90` first: anything
already sitting in that inbox is older than the 14-day search window and would
otherwise never be read, and a sweep that wide could in principle auto-settle an
old order on a reference-plus-exact-total match.

The reasoning behind all four is worth keeping, because it is the substance of
the thing rather than an afterthought:

The domain runs **one address**, `orders@dinnerbyderek.ca`. It is what
customers see, what the app sends from, and what transfers are addressed to. It
is not a mailbox: Cloudflare Email Routing forwards it to Derek's own inbox, and
that inbox is where a person reads it — see
[DEPLOY → Optional: email](DEPLOY.md#optional-email).

- **An e-transfer is not an email, and the forward is invisible to Interac.**
  The customer types the address into their own bank; Interac looks it up in its
  **Autodeposit registry**, which is a lookup keyed on the exact address, not a
  delivery. Registering the personal inbox that `orders@` forwards *into* does
  nothing for transfers addressed to `orders@`. The address itself has to be
  registered, at the bank, by Derek. The confirmation link Interac sends to it
  arrives down the forward like anything else, and a bank account can hold
  several autodeposit addresses, so a personal one already registered is
  undisturbed.
- **Only one of the two notifications is proof of money.** Unregistered, a
  transfer produces *"X sent you money"* with a claim link, and the money has
  **not** moved — it moves when a person clicks it and answers a security
  question. Registered, it produces *"…has been automatically deposited"*, which
  is the transfer landing. `record()` may only be trusted with the second, or
  `paid` stops meaning money arrived and starts meaning someone intends to
  send it — which is the exact confusion this whole module exists to prevent.
  It is also the notification the parser was built and tested against.
- **The parser no longer gets a mailbox of its own**, and that is the cost of
  one address: `orders@` carries customer replies as well as bank mail. The
  poller reads a **separate inbox that receives nothing else**, fed by a rule on
  Derek's inbox that forwards only mail from `payments.interac.ca`. That keeps
  the exclusive mailbox the parser wants without a second address on the domain,
  and Derek keeps seeing the notifications himself.
- **Not Derek's own inbox, read directly.** Personal Outlook/Hotmail accounts no
  longer accept a password over IMAP — basic auth was withdrawn — so reading one
  means OAuth2: an app registration, a refresh token, and renewal running on the
  VPS. A plain-password inbox that exists only for this is smaller in every
  direction, and it is not somebody's personal mail.
- Everything the poller reads is therefore a **forwarded copy**, which is
  already handled: the original identity is the one kept, so a transfer is one
  payment however many times it was forwarded.
- **A `From:` line is not evidence.** The address is printed on the site, so
  anyone can send it a message shaped like a notification, and the forward strips
  the original's DMARC verdict on the way through. What stands between that and a
  wrong `paid` is the existing rule: auto-marking requires the order reference
  *and* the exact total to agree. That is a high bar for a stranger and a low one
  for the customer who was shown both, so a forged notification is worth
  remembering as a thing a customer could do, not a thing a passer-by could.
- The mailbox has to allow **a password over IMAP**, which is the step that
  catches people out. Gmail does, with an app password and 2-Step Verification
  switched on first; the account's own password fails and does not say why.
  Step-by-step in [DEPLOY → Optional: reading the bank's
  notifications](DEPLOY.md#optional-reading-the-banks-notifications).

Nothing else changes. `record()` already accepts `source: 'mailbox'`, the
Payments screen already labels those rows *from the mailbox*, and duplicate
protection means re-reading the same message is free — so the poller needs no
memory of what it has already seen.

### Facebook, if ever

Optional and skippable forever. The manual copy-and-paste path works and is
the only path for Groups anyway. If you do connect it, `TOKEN_ENCRYPTION_KEY`
becomes required.

### Backups on a schedule

**On OVH this is already done** — daily automatic backup of the previous 24
hours comes with the VPS, and there is nothing to switch on. (Hetzner sells
snapshots as an add-on; Hostinger includes weekly ones on most plans.) They
cover the whole machine after you break something. That is a different job
from the JSON export, which covers the menu after you delete the wrong week.
Have both. Run the `rsync` before every deploy.

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
