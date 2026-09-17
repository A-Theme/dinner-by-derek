# Working in this repo

## Take a change all the way — but ask before the final push

Any session working in this folder is authorised to do the work without asking:
branch, commit, merge to `main`, and run the tests. Do not stop half-way to
request a go-ahead on work that is finished and green.

**Then stop and ask, once, before it leaves the laptop** — before
`git push origin main` and before the deploy. That is the checkpoint. Say what
is about to go out and wait for a yes.

**Why both halves.** Several Claude sessions work in this one directory at a
time. Work left uncommitted on a shared tree is waiting to be clobbered by
whoever edits that file next, so committing promptly is the safe move and needs
no permission. But pushing and deploying are the steps that reach a live
business and cannot be quietly undone, and Demian wants eyes on them — so the
last step is his, every time, however small the change looks.

**The sequence:**

```
git status            # the tree is shared — look before you stage
npm test              # both suites green
branch → commit → git checkout main → git merge --ff-only
                      # ── ask here ──
git push origin main
ssh -i ~/.ssh/id_dbd_deploy derek@51.222.111.144      # deploys origin/main
```

One ask covers the push and the deploy together when they go together. "Deploy
when done" or "push it" said in advance is that yes — do not re-ask for the
same change.

### What the authorisation does not excuse

- **Look at the tree before you stage.** Another session's uncommitted work is
  usually sitting in it. Stage explicit paths — never `git add -A` — and never
  commit `.claude/`, `video/`, or `other local media uploads/`.
- **Never commit someone else's work inside yours.** If a file you touched also
  holds another session's changes, stop and say so rather than guessing which
  hunks are whose.
- **A deploy ships everything on `origin/main`, not just your commit.** Read
  `git log <deployed>..origin/main` first. If it carries work another session
  is still mid-way through, that is a reason to wait and to say why.
- **Tests must be green first**, and a failure in a shared tree is not
  automatically about your change — check whether it fails without you before
  you "fix" it.
- **Say it out loud when a deploy writes to the database.** A seed change or a
  migration runs on restart against the live data. It usually still goes, but
  name the effect first; the dashboard's `/admin/export/backup.json` is the
  backup path, because the deploy key cannot take one.

### Two things about the deploy specifically

1. **Connecting with the deploy key *is* the deploy.** It runs one forced
   command and ignores whatever you type. There is no read-only way in with it,
   so you cannot check the server's state first — to look without changing
   anything, ask.
2. **Verify from outside, not from the deploy's output.** Its journal tail is
   captured mid-restart and ends on the *old* process's `SIGTERM`, so a crash
   and a clean start look identical. Load the live page and check an asset that
   changed. Give it a few seconds first — curling into the restart gap returns
   502 and means nothing.

A restart is a few seconds' downtime, or minutes when `package-lock.json` moved
and `npm ci` runs. Orders close at 22:00 Toronto; before that is fine.

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
