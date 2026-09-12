# Measurement

No analytics vendor, no tracking pixel, no third party, and nothing added to the
app. Everything below is read from things that already exist: the dashboard, the
delivery page, the nginx log, and a question asked in a message.

That is not a compromise. The whole system is built so that a customer's name
and address stay on one box in Quebec, and bolting a tracker onto the order page
to measure a marketing campaign would undo that for a number nobody needs.

---

## Every Sunday, five minutes

Four numbers. Write them in the table at the bottom of this file.

| Number | Where to get it |
|---|---|
| **Orders through the app this week** | Dashboard → Week Totals |
| **Orders taken by comment or phone this week** | Count them by hand. It is a small number and the ratio is the point |
| **New postal codes** | Dashboard → Locations & Delivery — the per-area order counts. An area that was 0 last week and is 1 this week is a new neighbourhood |
| **First-time names** | Dashboard → Orders. Names you do not recognise |

Five minutes, once a week. A campaign nobody is counting is a campaign that
cannot be stopped when it stops working.

---

## The gate: five orders, ever

The only number that matters in weeks 1–2.

**Dashboard → Orders.** Count every order that came through the app since the
campaign started. When it reaches five, real, placed by customers rather than by
you, the acquisition campaign may start. Not five a week — five in total.

Why five and not one: one order proves the form submits. Five means at least
one person other than the first has done it, at least one confirmation email has
landed in somebody else's inbox, and there has been a chance for somebody to tell
you that the postal code box is confusing. See
[STRATEGY.md → Sequencing](STRATEGY.md#sequencing).

---

## Where did they come from

The only source attribution this campaign has, and it is one sentence in the
message you were going to send anyway:

> "Thanks — this all came through fine. Out of interest, how did you come across
> us?"

Ask **first-time customers only**, and ask it in the confirmation message rather
than on the order form. A question on the form costs orders; a question in a
friendly message after the order is placed costs nothing and gets a better
answer.

Tally them here — a tick is enough:

| Source | Ticks |
|---|---|
| Facebook — Derek's Page | |
| Facebook — a group (which one?) | |
| A friend told them | |
| The card, from someone else's order | |
| A flyer or a sticker | |
| Walked past / already knew of it | |

After six weeks this table is the answer to "where should the effort go", and it
cost nothing to build.

---

## Reading the nginx log

The server already records every request, including where the visitor came from.
No code, no analytics, no third party — the same technique
[docs/GOING-LIVE.md](../docs/GOING-LIVE.md) uses to settle the desktop-or-phone
question.

**How many people arrived from Facebook this week:**

```bash
sudo grep -c 'facebook\.com\|fb\.me\|m\.facebook' /var/log/nginx/access.log
```

**How many arrived with no referrer at all** — which is a QR scan, a typed
address, or a home-screen launch. In other words: print, and returning
customers.

```bash
sudo grep '"GET / HTTP' /var/log/nginx/access.log | grep -c '"-" "'
```

**Visits across the whole retained log**, since it rotates weekly:

```bash
sudo zgrep -h '"GET / HTTP' /var/log/nginx/access.log* | wc -l
```

The ratio between the first two is the useful part: Facebook against everything
else. It is rough — bots inflate both, a home-screen launch looks like a typed
address — and rough is enough. The question is "is print doing anything at all",
and a 10:1 split answers that as well as a precise number would.

> **What this cannot tell you** is which group a visit came from. Facebook
> rewrites its referrers and a group post and a Page post look identical in the
> log. That is what the question above is for.

---

## What the first five said

Fill this in during weeks 1–2. It is the highest-value page in this folder,
because it is the only feedback that will ever arrive from people who like you
enough to be honest.

| # | Who | What they found annoying | Fixed? |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

**Fix these before the acquisition campaign starts.** They are free, they came
from real use, and every one of them would have cost a stranger's only order.

---

## The group log

One post per group per month, never the same post twice. This table is what
enforces that.

| Group | Rules (business posts allowed?) | Posted | Which post | Response |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

Fill the rules column **before** posting, not after. A group that allows local
business posts only on Fridays is useful; a group you have been removed from is
not, and there is no way back.

---

## Reading it at week 6

The targets, restated from [STRATEGY.md](STRATEGY.md#what-success-looks-like) so
they cannot be quietly rewritten to match the outcome.

| | Target | Actual |
|---|---|---|
| Orders through the app, week 6 | Half the week's orders | |
| First-time customers, weeks 3–6 | 8–10 | |
| Postal codes that had never ordered | 2 or more | |
| Comments still open and answered | Yes | |

### What each outcome means

| Result | Reading | Do |
|---|---|---|
| **Both targets met** | It worked | Drop to the maintenance rate in [CALENDAR → After week 6](CALENDAR.md#after-week-6) |
| **Regulars moved, no new customers** | The app is good; the reach is not. Groups are the weak link | Keep the app running. Rethink acquisition — markets, a stall, a partner business, print |
| **New customers, regulars didn't move** | Perfectly fine, and the commonest outcome. Habits are strong and new customers have none | Stop the Quiet Move posts. Keep the two lines. Keep taking comments forever |
| **Neither** | The campaign is not the problem | Stop posting. Six weeks of menus and a hundred conversations are worth more than the next six posts. Find out what supper costs people to decide on |
| **Too many orders** | The good problem, and still a problem | Lower the cap, slow the posting. See [STRATEGY → Capacity](STRATEGY.md#capacity-is-the-real-risk) |

---

## The weekly log

| Week | App orders | Comment/phone | New postal codes | First-time names | Note |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | gate: 5 total? |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | six-week read |
