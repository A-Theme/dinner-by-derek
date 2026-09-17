# Working in this repo

## Keep the training module in step with the dashboard

`server/training/` is a complete practice copy of the admin dashboard, served at
`/admin-training` and running on an in-memory sandbox. Derek learns the app on
it. A training screen that no longer matches the real one is worse than no
training screen at all: it teaches a gesture that will not work, and the person
only finds out on a live menu.

**So: a change to an admin screen is not finished until the training copy
matches it.** This is part of the change, not a follow-up ticket.

### What mirrors what

| Real | Training |
|---|---|
| `server/routes/admin.js`, `admin2.js`, `admin3.js`, `routes/recipes.js` | `server/training/index.js` |
| `server/views/admin.js`, `admin-week.js`, `admin-paste.js`, `recipe.js` | `server/training/views/*.js` |
| `public/admin.js` (client behaviour) | `server/training/assets/training.js` |
| `public/admin.css` | shared — training loads the real stylesheet |
| Nav in `server/views/admin.js` | `server/training/sections.js` |

### When the rule applies

Any change a person can see or press: a new control, a moved one, a changed
confirmation, different wording on a refusal, a new validation rule, a new
section. Copy the behaviour **and the sentences** — the wording is most of what
is being taught.

It does not apply to internals with no user-facing surface: a query rewritten,
a helper extracted, a performance fix.

### Three things that catch people out

1. **Training copies vocabulary rather than importing it.** `server/training/
   constants.js` holds its own copy of the allergen list, weekday names, dish
   kinds, subcategories and slot counts, because importing `allergens.js` or
   `menu.js` would open the real database at require time. Add an allergen or a
   dish kind to the real app and it must be copied here too.

2. **Nothing under `server/training/` may require `db.js`, `mailer.js`,
   `facebook.js`, `images.js`, `publish.js` or `payments.js`.** That is the
   whole safety argument — these routes cannot write to the database or send an
   email because they never load the code that does. Mirror the *behaviour*
   against the sandbox; never reach for the real module to save time.

3. **A new control usually needs a walkthrough step.** `server/training/
   coach.js` holds the guided tour, keyed by `data-coach` attributes in the
   training views. A control with no step is invisible to the tour.

### Payments is written and switched off

One boolean in `server/training/sections.js`. It is complete and works; it is
dark until the real Payments screen settles. **Still update it** when the real
one changes — switching it on later should not mean rewriting it.

### Checking

`npm test` covers the real dashboard, not the training copy. After changing
training, load `/admin-training` behind the admin password and walk the screen
you touched. `docs/HANDOFF.md` has the module's design notes and the reasoning
behind the auth mount.
