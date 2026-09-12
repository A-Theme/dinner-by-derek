# Strategy

## What is actually being launched

Not a business. Dinner By Derek has been cooking and selling supper in
Kitchener–Waterloo for about three years, with a Facebook post for a menu and a
comment thread for an order form. That works. It is not broken and the campaign
must not imply that it is.

What is new is **a way to order**: an installable web app at
`dinnerbyderek.ca` that shows the whole week, takes an order in about a minute,
knows whether an address is in the delivery area, refuses same-day orders on its
own, and emails a confirmation with the reference to put in the e-transfer.

So the launch is one new thing offered to two audiences who need to hear about
it in two different registers.

## The number that shapes everything

Read from the live database on 2026-09-09 and recorded in
[docs/GOING-LIVE.md](../docs/GOING-LIVE.md):

> The `orders` table is **empty, and empty since the site went up on 29 August.**
> Not "none this week". Nobody has ever placed an order through the app.

The site has been publicly reachable for a fortnight and the regulars have kept
ordering the way they always have. That is not a failure of the app — it is the
entirely predictable behaviour of people who already have a way to buy supper
that works. Nobody changes a habit that is not costing them anything.

Two conclusions follow, and the whole plan rests on them.

**One: the ordering path is untested by real people.** It passes its own flow
suite end to end, which proves the code works, not that a stranger on a bus can
finish it. The first people down it should be regulars, who will forgive a
confusing screen and tell you about it. Strangers will not; they will leave.

**Two: nobody is waiting for this.** There is no pent-up demand to release. A
campaign that behaves like there is — countdowns, "we're live!", exclamation
marks — will read as a small kitchen making a large noise, and the audience it
is addressed to is the one that has been loyal for three years.

## The two audiences

### The regulars

They comment on the post, or they phone. They know Derek, they know roughly what
Wednesday costs, and several of them have been doing this longer than the
Facebook page has existed.

**They do not have a problem.** The app solves problems they have quietly
absorbed: scrolling back through a comment thread to remember what they ordered,
waiting on a reply to know it was seen, not being sure whether the soup is
still on. None of those is bad enough to complain about, and none of them is a
reason to go looking for a website.

So the entire migration argument is: *the link is there, it is faster, nothing
you already do stops working.* Anything stronger than that is a cost — it spends
goodwill built over three years to move somebody from one working channel to
another working channel, for the kitchen's convenience rather than theirs.

**The one benefit that is genuinely theirs** is the confirmation email. It
arrives with what they ordered, what it costs, when to collect it, and the
reference to put in the e-transfer message. A comment gives them none of that.
Lead with it, once, and then stop.

### The new customers

People in the 15 KW postal codes who have never heard of this. They are not
choosing between Dinner By Derek and a comment thread; they are choosing between
Dinner By Derek and a grocery shop, a chain, or resignation.

They need, in this order:

1. **What is this?** — not a restaurant, not a meal kit, not a subscription. One
   person cooks a small menu, a few days a week, and you collect it or it comes
   to you.
2. **Is it for me?** — do you come to my postal code, what does it cost, can I
   pay the way I pay.
3. **Is it safe?** — a stranger cooking food, sold from a website, taking a bank
   transfer. This is the objection nobody says out loud.
4. **What do I do?** — pick a day, order by ten the night before, collect between
   four and seven.

Point 3 is where this business has something unusually good to say, and it is
covered below.

## Positioning

**For new customers.**

> Dinner By Derek is a supper club in Kitchener and Waterloo. One kitchen, a
> small menu that changes every week, cooked the day you collect it. Order by
> ten the night before; pick it up between four and seven, or have it brought to
> your door if you are in the area.

Three words to keep saying, because each one is doing a job: **supper club**
(not a restaurant, and it explains the small menu and the fixed days),
**Kitchener and Waterloo** (the whole market, and it is a boast rather than a
limitation), **this week** (the menu is not a permanent list, so looking again
next week is the point).

**For regulars.**

> Same menu. Same Derek. There's a link now if you want it.

## What makes this trustworthy, and why it is a marketing asset

The app will not publish a week containing a dish whose allergens have not been
reviewed. Not a warning — a refusal. Every dish, every week, including one that
ran last week, because a review is about a dish on a specific menu. The
dictionary behind it holds 479 terms.

That is the single most persuasive true thing available, and almost nobody else
in this market can say it. It is also the honest answer to the unspoken fear in
audience point 3, and it answers it with a mechanism rather than a promise. A
restaurant says "please tell us about allergies". This says "the menu could not
go up until somebody had read every dish on it".

Say it plainly, once per cycle, and never dress it up. The strength of the claim
is that it is boring and checkable.

> **Do not overstate it.** The app enforces that a human reviewed the dish. It
> cannot certify a kitchen, it is not a shared-facility declaration, and "safe
> for allergies" is not a claim this or any small kitchen should make in
> writing. Say what the mechanism does. See [Never say](#never-say).

## The collision problem

One Facebook Page. One audience on it, made mostly of regulars. Everything
posted to attract strangers is also posted at the people we have promised not to
push.

Post the acquisition campaign at its natural volume — twice a week — on the
Page, and the regulars receive a fortnight of being sold something they already
buy. That is the exact pressure the brief said to avoid, arriving by accident
rather than by intent.

**The resolution is that the two campaigns mostly run in different places.**

```
                  Derek's Page          Local groups        Print / in person
  Regulars        ███████████            ·                   ██  (the bag)
  New customers   ██                     ███████████         ███████████
```

- **The Page** stays the regulars' room. The weekly menu post goes out as it
  always has, with two extra lines at the bottom. Three campaign posts in six
  weeks, and that is the entire migration effort on this channel.
- **Local groups** are where acquisition lives. Different rooms, different
  people, and a regular scrolling a buy-and-sell group is not being marketed at
  by their supper club — they are seeing it recommended in public, which is the
  better version of the same post.
- **Print** reaches both, but in different places: the card goes in the bag
  (regulars, at the moment they are most pleased), the flyer and stickers go
  where strangers are.

Two acquisition posts a week land on the Page only in weeks 3 and 5, once each,
and both are written to read as interesting rather than as a pitch.

## Capacity is the real risk

One person cooks. The likeliest bad outcome of this campaign is not that it
fails — it is that it works in one week, forty strangers order at once, and the
first impression a new market gets is a late, thin, apologetic service.

That is unrecoverable in a way that a quiet fortnight is not.

**Set a daily cap before the first acquisition post.** Dashboard → This Week,
per day. The app sells out cleanly against it, and a day that reads "sold out"
to a new customer is a far better advertisement than a day that oversells. Raise
it deliberately, one week at a time, when a week has been comfortable.

The campaign is designed to be **interruptible at any point**: nothing is
scheduled, nothing is booked, no money is committed, and every post is a paste.
If a week gets away from you, skip that week. Nothing downstream breaks.

## Sequencing

The two campaigns start a fortnight apart, and the reason is the second
conclusion at the top of this file: the ordering path has never carried a real
customer.

| | Weeks 1–2 | Weeks 3–6 |
|---|---|---|
| The Quiet Move | Runs | Runs |
| Room at the Table | **Holds** | Runs |

**The gate between them is five real orders**, placed by regulars, through the
app, arriving correctly. Not five a week — five in total, ever. That is enough
to have seen the confirmation email land in someone else's inbox, to have had at
least one person tell you something on the form was confusing, and to have
matched an e-transfer to an order that a customer referenced by hand.

If week 2 ends with fewer than five, hold the acquisition campaign and keep
running the quiet one. The cost of waiting a week is nothing. The cost of a
stranger's only experience being a half-finished order form is the market.

## Voice

The app's own writing is the style guide, and it is good: plain, specific,
short, and it gives the reason next to the instruction. The marketing should
sound like the same person, because it is.

**Do**

- Name the thing. "Wednesday's dish is pork schnitzel" beats "midweek comfort".
- Use real numbers. Ten at night, four to seven, fifteen postal codes, three
  years, 479 terms.
- Let the food be the interesting part. It is.
- Write the sentence you would say out loud to a neighbour.

**Don't**

- No exclamation marks. One, ever, if something genuinely warrants it.
- No emoji strings. The app uses one emoji per section heading in its own docs
  and that is the ceiling.
- No "delicious", "mouth-watering", "artisanal", "elevated", "curated",
  "passion", "journey". The palette guide says artisanal; the copy never does.
- No urgency that is not real. The 22:00 cutoff is real urgency and it is
  enough. Do not invent scarcity on top of it.
- No stock photography. Ever. A real photograph of an actual portion, taken on a
  phone in the kitchen, beats anything licensed — and the app already takes dish
  photos, so they exist.

### Never say

| Don't | Because | Say instead |
|---|---|---|
| "Safe for allergies" | Not a claim a small kitchen can stand behind, and not what the app does | "Every dish is allergen-reviewed before the menu can go up" |
| "Order online now!" to regulars | It is the push the brief ruled out | "Or here, if it's easier: dinnerbyderek.ca" |
| "Download the app" | There is nothing to download and no app store; sending someone to look for one is a dead end | "It's a website. You can add it to your home screen if you like" |
| "Sign up" / "Create an account" | There are no accounts. It would be a lie and it would cost you the order | "No account, no password" |
| "We're live!" | Nobody was waiting | "There's a website now" |
| "Fresh, local, healthy" | Says nothing, and every kitchen in Waterloo Region says it | Name the dish |

## What success looks like

Set now, so nobody redefines it in week 7 to match whatever happened. Full
method in [MEASUREMENT.md](MEASUREMENT.md).

| By end of | The Quiet Move | Room at the Table |
|---|---|---|
| Week 2 | **5 orders through the app, ever.** This is the gate | Not started |
| Week 4 | A third of the week's orders arrive through the app | First order from a postal code with no prior orders |
| Week 6 | Half. Comments still open and still answered | 8–10 first-time customers, and two postal codes that are new |

**The single most important number is the first one.** Everything else in this
folder is contingent on somebody, once, ordering supper from a website instead
of from a comment box.
