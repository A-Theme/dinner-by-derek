---
title: Payments at Dinner By Derek
eyebrow: How the money gets matched
source: docs/PAYMENTS.md
figures:
  1 = rung that settles by itself
  4 = outcomes when you paste
  0 = money moving through the app
---

# Payments

How a transfer that lands in the bank becomes an order marked paid, and why the
app is careful about it in the specific places it is careful.

No money moves through this app and none should. It takes orders; Derek gets
paid his own way.

<!-- toc -->

## Where this stands — 8 September 2026

Everything on this page is built and deployed. What is worth knowing before
reading the rest is which parts have actually been exercised.

- **The poller runs.** `server/mailbox.js` has read a mailbox of its own every
  five minutes since 30 August, on the live server.
- **`orders@dinnerbyderek.ca` is registered for Autodeposit**, so a
  notification means money landed rather than money offered — which is the
  difference between the two Interac emails, and the reason only one of them may
  be trusted.
- **One arrangement is outstanding**, and it is not code: the rule in Derek's
  Outlook forwarding `payments.interac.ca` mail into the poller's inbox. Until
  it exists the poller correctly finds nothing — and a successful empty poll
  writes no journal line at all, so working and waiting look identical from
  outside.
- **Nothing has been matched yet, because nothing has been ordered.** Read from
  the live database on 6 September: `payments` is empty and so is `orders`,
  and `orders` has been empty since the site went up on 29 August. Everything
  below is proven by the suites and by three real notifications read in August;
  none of it has yet met a real customer's transfer.

## The problem this solves

Every order already carries a payment method, because the form asks. That is a
**declaration of intent, not a payment record** — choosing "E-transfer" is not
paying, and the app has never pretended otherwise. `paid` stays a separate flag.

Which left a gap. Payment instructions said to e-transfer, and nothing
downstream knew whether any transfer had arrived. Derek reconciled by reading
his bank email and remembering.

Interac has no API a supper club can call. The only signal available is the
notification email the bank sends when money lands, so that is what this reads.

## What happens when you paste one

**Dashboard → Payments.** Paste the notification into the box. One of four
things happens.

| The notification shows | What happens |
|---|---|
| The reference **and** the exact order total | `ok: settled` the order is marked paid, no tap |
| The reference, a different amount | `warn: suggested` offered as a candidate, shortfall named |
| No reference, but only one order is owed exactly that | `warn: suggested` offered as a candidate |
| A sender name matching a customer | `warn: suggested` offered as a candidate |
| None of the above | `todo: unclaimed` kept as money nobody has accounted for |

> [!IMPORTANT] Only the first row is automatic
> It takes two independent facts agreeing: the customer typed the order
> reference into the transfer message, **and** the amount equals the order
> total. A reference alone could be a typo. An amount alone is shared by every
> order that size that week. Together they are as good as reading the email
> yourself.

Every automatic match records that it was automatic, so **Unlink** puts it back
exactly as it was — including leaving an order paid if you had already marked it
by hand. The app only ever undoes its own flag.

## Why the reference is the whole mechanism

Every order carries an eight-character reference. The confirmation screen and
the confirmation email ask e-transfer customers to put it in the transfer
message, because **that message is the one field that travels with the money and
comes back out the other end**.

> [!WARNING] The reference is read from the message field only
> Never from the body of the email. Bank reference numbers are eight hex
> characters often enough to matter, and one of them must never settle somebody
> else's order.

This is also the strongest argument for turning email on. Without it the
customer sees that request on screen once and never again, and a customer who
omits the reference is one matched by hand.

## What the bank actually sends

Interac writes the transfer details as a **grid**, not as `Label: value` on one
line — the label alone, a blank line, then the value, which is what its
two-column HTML table flattens to.

Every pattern in the parser was originally written for the other shape, so none
of them read any of it. The consequence was not cosmetic: the message field is
the sole input to the one rung that settles an order without Derek, so
**unread, the automatic path could never fire at all.** The app was asking
customers for something it could not then see.

The sender name was worse than unread, because it looked like it worked. The
only pattern reaching a real notification was the one over the subject, where
the name sits inside a sentence that runs on past it — so whether the mail
client happened to wrap that line after the name decided what got stored, and
the same notification gave three different answers depending on where it broke.

Names come from the body first now, where Interac states them as fields. The
subject stays as a fallback and stops at the clause rather than the full stop.

## Identity, and why a forward is not a second payment

A notification is stored once. Two things make that hold.

A real `Message-ID` is the bank's own guarantee that one email is one event. It
folds onto the next line in both Outlook and SES, so requiring the `<` on the
same line threw that guarantee away and fell back to hashing the text.

And a forwarded email carries two identities — its own, and the original's in
`In-Reply-To`. The original is the one belonging to the money, so the same
transfer is one payment whether it is forwarded by hand, forwarded twice, or
read straight out of a mailbox once a poller exists. Without that, the changeover
to a poller would have doubled everything in flight.

## One order, one payment

Two payments could once point at the same order, and the damage did not appear
at the moment it was done. The flag only flips when the order was not already
paid, so the second payment recorded that it had changed nothing — and unlinking
the *first* then set the order back to unpaid while the second still stood
against it.

> [!WARNING] That is the worst shape a bug here can take
> An order with money linked to it, sitting in the chase list, and a customer
> being nudged for a transfer that had already arrived.

A partial unique index enforces it now, and linking is refused with a sentence
naming the payment in the way. A genuine second transfer for one order stays
unclaimed, which is where money nobody has accounted for belongs.

## Known limits

- **One payment links to one order.** A single transfer covering two orders is
  linked to one; the other is marked paid by hand.
- **A notification with no `Message-ID`** is identified by a hash of its text, so
  two transfers identical in every visible character — same sender, same cent,
  same message, no timestamp — read as a duplicate and the second is refused.
- **The mailbox is read on a timer, not watched.** `server/mailbox.js` polls
  every five minutes, so a transfer can be that late showing up. It is off
  entirely unless `IMAP_HOST` is set, and the paste box never goes away. A poll
  that reads nothing logs nothing, by design — so silence means the timer is
  healthy *or* nothing is reaching the inbox, and only `npm run poll -- --dry`
  tells the two apart.
- **A forwarded notification cannot be proved genuine.** The forward strips the
  original's DMARC result, so `IMAP_ALLOW_FROM` is a filter for what is worth
  reading rather than evidence. The reference-and-exact-total rule is what
  actually stands between a forged notification and a wrong `paid` — a high bar
  for a stranger and a low one for the customer who was shown both.

The first three fail in the safe direction — not marking something paid that was
not. **The fourth does not**, and it is the one to know about: an email reaching
the poller's inbox that carries a valid order reference *and* the exact total
will settle that order as paid with nobody tapping anything. `paid` can now be
set by an email rather than only by Derek. That bar is high for a stranger and
low for the customer who was shown both numbers — and a customer who forges a
deposit to avoid paying for dinner has done something a person notices at the
door, which is why this is accepted rather than solved in code.

## Chasing what has not arrived

The screen also shows the other half of the question — who said they would send
a transfer and has not.

That list is deliberately narrower than the one you can link against. Nudging
someone who is paying cash at the door about a missing e-transfer is worse than
not nudging, so the chase list is only the customers who said e-transfer. The
link-by-hand list is everyone still owing, whatever they said, because somebody
who picked Cash and then sent a transfer anyway is a normal Tuesday.

That is the module's own premise applied to its own screen: the declared method
is intent, and intent and money are different things.
