# Deploying Dinner By Derek

Taking the app from a laptop to `https://dinnerbyderek.ca`, on a rented
Ubuntu server with Cloudflare in front. Written against Hostinger and Hetzner;
only [step 1](#1-rent-the-server) differs between them, and any other VPS
works the same way.

Read it once before starting. Most of it is copy-and-paste, but four steps
have a trap in them and each one is called out where it happens.

---

## Contents

- [What you are building](#what-you-are-building)
- [Testing first, without a server](#testing-first-without-a-server)
- [Before you start](#before-you-start)
- [1. Rent the server](#1-rent-the-server)
- [2. First login and lock the door](#2-first-login-and-lock-the-door)
- [3. Node and the build tools](#3-node-and-the-build-tools)
- [4. The code](#4-the-code)
- [5. Where the data lives](#5-where-the-data-lives)
- [6. The .env file](#6-the-env-file)
- [7. Keep it running: systemd](#7-keep-it-running-systemd)
- [8. Point the domain at the server](#8-point-the-domain-at-the-server)
- [9. nginx and the certificate](#9-nginx-and-the-certificate)
- [10. Turn BASE_URL on](#10-turn-base_url-on)
- [11. Check it](#11-check-it)
- [Backups](#backups)
- [Deploying a change later](#deploying-a-change-later)
- [A staging copy on the same server](#a-staging-copy-on-the-same-server)
- [Optional: the orange cloud](#optional-the-orange-cloud)
- [Optional: email](#optional-email)
- [When something is wrong](#when-something-is-wrong)

---

## What you are building

```
  customer's phone
        |
        |  https://dinnerbyderek.ca
        v
  Cloudflare  ......  DNS only, to begin with. Answers "where is
        |             dinnerbyderek.ca" with the server's IP address.
        v
  the server (the VPS)
        |
        +-- nginx        :443  holds the TLS certificate, forwards to :3000
        |                :80   redirects to https
        |
        +-- the app      :3000 node, kept alive by systemd
        |
        +-- /var/lib/dinnerbyderek/
                         the database, the photos, the generated graphics
```

Three separate things, and they fail separately. If the site is down, the
question is always *which one* — see [When something is wrong](#when-something-is-wrong).

The data directory lives **outside** the code directory on purpose. Deploying
a change replaces the code; anything inside that folder would go with it, and
the photos exist nowhere else.

---

## Testing first, without a server

You do not need the server to see the app on a real https address, on a real
phone. **Cloudflare Tunnel** runs a small program on the laptop, makes an
outbound connection to Cloudflare, and Cloudflare serves the laptop's
`localhost:3000` at a public address. No VPS, no firewall holes, no port
forwarding, and it costs nothing on the plan the domain already sits on.

This is for looking at the thing — checking the install prompt on a phone,
showing someone the ordering flow. It is **not** a way to run the real site:
it is up only while the laptop is awake and the command is running.

### Two rules before you open a tunnel

**1. Point the app at a copy of the database.** You will be clicking around
the dashboard while people are looking, and a demo that edits the real menu is
a demo you have to undo afterwards.

```powershell
Copy-Item data\dinnerbyderek.db data\demo.db
```

**2. Make sure the password is hashed, not plaintext.** A tunnel puts `/admin`
on the open internet for as long as it runs. The password and the login rate
limiter are the only things in front of it. If `ADMIN_PASSWORD_HASH` is empty
in `.env`, run `npm run password` and fill it in first — the app warns about
this at boot, and here it actually matters.

Then stop the tunnel when you are done. It is not a thing to leave running.

### The quick version — a throwaway address

No account, no DNS, nothing to configure. Install `cloudflared` once:

```powershell
winget install --id Cloudflare.cloudflared
```

Start the app against the copy, in one terminal:

```powershell
$env:DB_PATH="data\demo.db"; npm start
```

And the tunnel in a second terminal:

```powershell
cloudflared tunnel --url http://localhost:3000
```

It prints a random `https://something-random.trycloudflare.com` address that
works from anywhere until you press Ctrl-C. Open it on a phone.

> **Set `BASE_URL` to that address** if you are testing anything that depends
> on it — the home-screen install, the secure cookie, a QR code. Stop the app,
> then start it again with both variables:
>
> ```powershell
> $env:DB_PATH="data\demo.db"; $env:BASE_URL="https://the-address-it-printed.trycloudflare.com"; npm start
> ```
>
> Shell variables win over `.env`, so this changes nothing on disk and lasts
> only as long as the terminal. The address is different every run, which is
> the main reason to graduate to the named version below.

### The stable version — `test.dinnerbyderek.ca`

Worth the extra ten minutes if you are going to do this more than twice.

```powershell
cloudflared tunnel login
```

A browser opens; pick `dinnerbyderek.ca` and authorise. Then create the tunnel
and give it the name:

```powershell
cloudflared tunnel create dinnerbyderek-test
```

```powershell
cloudflared tunnel route dns dinnerbyderek-test test.dinnerbyderek.ca
```

That second command writes the DNS record in Cloudflare for you — there is
nothing to add by hand. Run it:

```powershell
cloudflared tunnel run --url http://localhost:3000 dinnerbyderek-test
```

`https://test.dinnerbyderek.ca` is now the laptop, with a real certificate,
for as long as that command runs. The name persists, so `BASE_URL` can go in a
second env file and stay put.

When you are finished with it for good:

```powershell
cloudflared tunnel delete dinnerbyderek-test
```

Which also cleans up the DNS record.

> **This does not replace the server.** The tunnel is the laptop. Close the
> lid and the site is gone. Once real people are ordering, the app needs to
> live somewhere that stays awake — which is the rest of this document. A
> permanent test address alongside the real one is
> [a separate thing](#a-staging-copy-on-the-same-server) and comes later.

---

## Before you start

You need:

- **An account with a VPS provider.** A Hostinger account already covers this
  — a VPS is a separate purchase from web hosting, but the same login. On
  Hetzner (<https://console.hetzner.cloud>) signup asks for a card and may
  hold new accounts for a manual identity check for an hour or two, so start
  that first if you are going that way and in a hurry.
- **`dinnerbyderek.ca` in Cloudflare**, which you have.
- **An SSH key.** If `cat ~/.ssh/id_ed25519.pub` prints something, you have
  one. If not:

  ```bash
  ssh-keygen -t ed25519 -C "dinnerbyderek"
  ```

  Press enter through the prompts. A passphrase is worth setting — it is what
  stops a stolen laptop being a stolen server.
- **Access to the GitHub repo** `A-Theme/dinner-by-derek`.

Set aside about an hour. Nothing here is hard, but step 9 waits on DNS and DNS
does what it likes.

---

## 1. Rent the server

Any VPS running Ubuntu will do. **Only this step differs between providers** —
from step 2 onward the machine is just Ubuntu with root on it, and the
commands are identical.

Whatever you pick, it must have:

| | | Why |
|---|---|---|
| **2 GB RAM minimum** | 4 GB is comfortable | The app resizes phone photos with `sharp`, holding the whole image in memory. [server/index.js](../server/index.js) caps an upload at 26 MB, and the comment there measures concurrent uploads moving the process 232 MB. A 512 MB box is the cheapest plan on most hosts and the kernel will kill it the first time Derek uploads three photos in a row. |
| **20 GB disk minimum** | 40 GB is plenty | Photos accumulate. Nothing else here is large. |
| **Ubuntu 24.04** | no control panel | LTS, supported to 2029. Every command below assumes it. |
| **A North American location** | east coast for Ontario/Quebec | European datacentres are cheaper and add roughly 100ms to every page load. |
| **Root access over SSH** | | Any real VPS has this. Shared hosting does not, which is why shared hosting cannot run this app. |

> **Do not pick an OS template that bundles a control panel** — hPanel,
> CyberPanel, cPanel, Plesk. They install their own web server and will fight
> nginx and certbot for port 80 in [step 9](#9-nginx-and-the-certificate).
> Untangling that is worse than never having had it. Plain Ubuntu.

### On Hostinger

**VPS → Buy new VPS → KVM 1** (1 vCPU, 4 GB RAM, 50 GB NVMe). During setup
choose **Ubuntu 24.04 with no panel**, and paste your **public** SSH key
(`id_ed25519.pub` — never the private one) when it offers.

Hostinger's headline price needs a 24-month prepayment and roughly doubles at
renewal. The 12-month term costs a little more per month and commits you to
one year instead of two.

### On Hetzner

**New project** → name it `dinner-by-derek` → **Add server**. Location
**Ashburn, VA** (or Hillsboro, OR out west), image **Ubuntu 24.04**, type
**shared vCPU** — `CPX11` is the smallest that clears 2 GB. Enable IPv4 **and**
IPv6; some phone networks are IPv6-only. Paste your **public** SSH key, which
also turns off password login. Leave volumes, firewalls and placement groups
alone.

Note that Hetzner's cheap European plans — `CX22` and friends, 4 GB for less
money — are not sold in the US locations, and the US prices rose sharply in
June 2026. Compare the actual Ashburn price against Hostinger before assuming
Hetzner is cheaper; as of writing they are within about a dollar a month.

---

Whichever you chose, the provider now shows you an IP address. Everything
below calls it `SERVER_IP`.

---

## 2. First login and lock the door

```bash
ssh root@SERVER_IP
```

It asks once whether you trust the fingerprint. Say yes.

### A user that is not root

```bash
adduser derek
```

```bash
usermod -aG sudo derek && rsync --archive --chown=derek:derek ~/.ssh /home/derek
```

`adduser` asks for a password — pick a real one and save it in your password
manager. It is only for `sudo`, not for logging in, but you will type it.

### The firewall

**This step is not optional.** The app calls `app.listen(port)` with no host
argument ([server/index.js](../server/index.js)), so it binds every interface
— port 3000 is reachable from the open internet the moment it starts, without
TLS and without nginx's limits in front. The firewall is what makes that
untrue.

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable && ufw status
```

`ufw status` should list 22, 80 and 443, and nothing else. Port 3000 must not
appear.

### Patches, without you

```bash
apt update && apt upgrade -y && apt install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
```

That is the whole of the maintenance burden a VPS adds, and it is now
automatic. Security updates install themselves overnight.

### A little swap

2 GB of RAM with no swap means a memory spike is an instant kill rather than a
slow second. 2 GB of swap file costs nothing but disk:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Now log out and back in as the new user. **The rest of this document runs as
`derek`, not as root.**

```bash
exit
```

```bash
ssh derek@SERVER_IP
```

---

## 3. Node and the build tools

The app needs Node 20 or newer ([package.json](../package.json) says so).
Ubuntu's own package is older, so use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs git nginx && node -v
```

`node -v` should print `v22.x`.

`better-sqlite3` and `sharp` ship precompiled binaries for this platform and
should need no compiler. If `npm ci` later fails with a wall of C++ errors, it
fell back to building from source and needs the toolchain:

```bash
sudo apt install -y build-essential python3
```

---

## 4. The code

The repository is private, so the server needs its own read-only key rather
than your GitHub password.

**On the server:**

```bash
ssh-keygen -t ed25519 -C "dinnerbyderek-server" -f ~/.ssh/github -N "" && cat ~/.ssh/github.pub
```

**In a browser:** GitHub → the `dinner-by-derek` repo → **Settings** → **Deploy
keys** → **Add deploy key**. Paste it, title it `dinnerbyderek server`, and
**leave "Allow write access" unticked**. A read-only key that leaks costs you
a copy of the source; a write key costs you the repository.

**Back on the server**, teach ssh to use it, then clone:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n' >> ~/.ssh/config
```

```bash
sudo mkdir -p /srv && sudo chown derek:derek /srv && git clone git@github.com:A-Theme/dinner-by-derek.git /srv/dinner-by-derek
```

```bash
cd /srv/dinner-by-derek && npm ci --omit=dev
```

`npm ci` takes a few minutes — `sharp` and `better-sqlite3` are downloading
binaries.

---

## 5. Where the data lives

Three directories must survive a deploy: the database, the uploaded photos,
and the generated graphics. All three are made from a phone and exist nowhere
else — [server/graphics.js](../server/graphics.js) says as much.

```bash
sudo mkdir -p /var/lib/dinnerbyderek/uploads /var/lib/dinnerbyderek/graphics && sudo chown -R derek:derek /var/lib/dinnerbyderek && chmod 750 /var/lib/dinnerbyderek
```

`data/` is in [.gitignore](../.gitignore), so nothing was cloned into the app
directory and there is nothing to move aside. Bringing the laptop's existing
data up instead is covered in [Backups](#backups).

---

## 6. The .env file

```bash
cd /srv/dinner-by-derek && cp .env.example .env
```

First make the password hash. It asks twice, shows nothing as you type, and
prints one line to paste:

```bash
npm run password
```

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Now open `.env` with `nano .env` and set these. Every other line can stay as
it came.

```ini
ADMIN_PASSWORD_HASH=<the line npm run password printed>
ADMIN_PASSWORD=
SESSION_SECRET=<the line node just printed>

PORT=3000
BASE_URL=http://localhost:3000

DB_PATH=/var/lib/dinnerbyderek/dinnerbyderek.db
UPLOAD_DIR=/var/lib/dinnerbyderek/uploads
GRAPHICS_DIR=/var/lib/dinnerbyderek/graphics

NODE_ENV=production
TRUST_PROXY=1
```

Then lock the file — it holds the password hash and the cookie secret:

```bash
chmod 600 .env
```

> **`BASE_URL` stays on localhost for now.** It becomes the real domain in
> [step 10](#10-turn-base_url-on), after the certificate exists. Set it to
> `https://dinnerbyderek.ca` before there is any https and the app sends HSTS
> and secure cookies over a connection that cannot carry them — you get to
> debug a login that silently never logs in.

> **`ADMIN_PASSWORD=` is left deliberately empty.** With the hash present, a
> plaintext copy sitting next to it is the one that leaks, and the app says so
> at boot ([server/index.js](../server/index.js)).

---

## 7. Keep it running: systemd

Create the unit file:

```bash
sudo nano /etc/systemd/system/dinnerbyderek.service
```

Paste:

```ini
[Unit]
Description=Dinner By Derek
After=network.target

[Service]
Type=simple
User=derek
WorkingDirectory=/srv/dinner-by-derek
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

# The app reads .env itself, so NODE_ENV and TRUST_PROXY live there and not
# here. One file to change, one place to look.

[Install]
WantedBy=multi-user.target
```

Then start it and have it start on boot:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dinnerbyderek && systemctl status dinnerbyderek
```

`status` should say `active (running)`. To see what the app said at boot —
including its own warnings about anything still set up like a laptop:

```bash
journalctl -u dinnerbyderek -n 40 --no-pager
```

Check it is actually answering, from the server itself:

```bash
curl -sI http://127.0.0.1:3000/ | head -1
```

`HTTP/1.1 200 OK`. If not, stop here and read the journal — nginx cannot fix
an app that is not running.

---

## 8. Point the domain at the server

In the Cloudflare dashboard for `dinnerbyderek.ca` → **DNS** → **Records**.
Delete any placeholder records the registrar left behind, then add:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| `A` | `@` | `SERVER_IP` | **DNS only** (grey cloud) |
| `AAAA` | `@` | the IPv6 address | **DNS only** (grey cloud) |
| `CNAME` | `www` | `dinnerbyderek.ca` | **DNS only** (grey cloud) |

> **Grey cloud, not orange.** The orange cloud proxies traffic through
> Cloudflare, and it changes two things that will bite you mid-setup: it
> interferes with the certificate challenge in the next step, and it adds a
> hop that breaks the login rate limiter unless the app is told about it. Get
> the site working plain first. [Turning it on
> afterwards](#optional-the-orange-cloud) is a five-minute job, written up at
> the end.

If the domain is registered somewhere other than Cloudflare, its nameservers
must point at the pair Cloudflare shows on the **Overview** page, or none of
these records are consulted at all.

Wait for it to take. From your laptop:

```bash
dig +short dinnerbyderek.ca
```

When that prints `SERVER_IP`, continue. Usually a minute or two on a fresh
domain; occasionally an hour. Do not start step 9 until it does — the
certificate authority resolves the name the same way you just did, and failed
attempts count against a weekly rate limit.

---

## 9. nginx and the certificate

This is [the config from the README](../README.md) with the domain filled in
and the certificate lines left out — certbot adds those itself.

```bash
sudo nano /etc/nginx/sites-available/dinnerbyderek
```

Paste:

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name dinnerbyderek.ca www.dinnerbyderek.ca;

  client_max_body_size 30M;   # phone photos are large

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

Enable it, drop nginx's default site, and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/dinnerbyderek /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
```

> **`client_max_body_size 30M` is the trap.** Leave it at nginx's 1 MB default
> and photo uploads fail with an error that never mentions nginx, which is a
> miserable thing to debug. The app's own limit is 26 MB
> ([server/index.js](../server/index.js)); nginx must be the looser of the
> two, so that the app is the one doing the refusing, with a message that
> makes sense.

`http://dinnerbyderek.ca` should now load the site, unencrypted. Then:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d dinnerbyderek.ca -d www.dinnerbyderek.ca
```

It asks for an email (renewal warnings — use a real one) and whether to
redirect http to https. **Say yes to the redirect.** Certbot rewrites the
nginx config to add the 443 block, the certificate paths, and the redirect.

Renewal is automatic; the package installs a timer. Confirm both:

```bash
sudo systemctl list-timers | grep certbot
```

```bash
sudo certbot renew --dry-run
```

---

## 10. Turn BASE_URL on

https exists now, so the app can be told its real address. This is the line
that lights up the QR codes, the email links, and the secure cookie.

```bash
cd /srv/dinner-by-derek && sed -i 's|^BASE_URL=.*|BASE_URL=https://dinnerbyderek.ca|' .env && sudo systemctl restart dinnerbyderek && journalctl -u dinnerbyderek -n 20 --no-pager
```

The boot output should now print the real domain and, ideally, no "worth
fixing before this is public" list at all.

**Then regenerate the printed graphics.** The business card and the sticker
carry a QR code pointing at `BASE_URL`, and any generated before this moment
point at a placeholder — the dashboard says so on the Graphics page
([server/routes/admin3.js](../server/routes/admin3.js)). In the dashboard:
**Settings → Graphics → regenerate**. Do this before anything goes to a
printer.

---

## 11. Check it

- <https://dinnerbyderek.ca> loads, with a padlock.
- `http://dinnerbyderek.ca` redirects to https.
- <https://dinnerbyderek.ca/admin> takes the password.
- **Upload a photo to an item.** This is the one test that exercises
  `client_max_body_size`, `sharp`, and the uploads directory all at once —
  take it from a phone, not a laptop screenshot, so it is actually large.
- On a phone, the browser offers to add the site to the home screen. If it
  does not, the certificate or `BASE_URL` is wrong; installability requires
  real https.
- Reboot (`sudo reboot`) and confirm the site comes back on its own. That is
  what proves `systemctl enable` took.

The test suites run on the server too, and take a couple of minutes:

```bash
npm test
```

---

## Backups

Two things need saving, and the dashboard only makes one of them.

**From the dashboard** — Settings → Backup → *Download a backup* gives a JSON
file with every week, item, order, location, delivery area and setting. It
never contains the Facebook token, so it is safe to email yourself.

**Photos are files on disk** and are not in that JSON. A complete backup is
the JSON **plus** `/var/lib/dinnerbyderek/uploads`.

The blunt version, from your laptop, which catches everything at once:

```bash
rsync -av derek@SERVER_IP:/var/lib/dinnerbyderek/ ~/dinnerbyderek-backup/
```

Worth running before every deploy, and worth a calendar reminder monthly
otherwise. Both providers also sell whole-machine snapshots — Hetzner as a
paid add-on at 20% of the server price, Hostinger with weekly snapshots
included on most VPS plans. Turn that on. It is a coarser and different thing
from the JSON export: the snapshot restores the whole server after you break
it, the JSON restores the menu after Derek deletes the wrong week. Have both.

**Moving the laptop's data up**, if there is anything in it worth keeping.
On the server:

```bash
sudo systemctl stop dinnerbyderek
```

From the laptop:

```bash
scp data/dinnerbyderek.db derek@SERVER_IP:/var/lib/dinnerbyderek/
```

```bash
rsync -av data/uploads/ derek@SERVER_IP:/var/lib/dinnerbyderek/uploads/
```

Back on the server:

```bash
sudo systemctl start dinnerbyderek
```

Stop the app first. Copying a SQLite file out from under a running process is
how you get a database that opens fine and is quietly missing the last thing
anyone did.

---

## Deploying a change later

```bash
cd /srv/dinner-by-derek && git pull && npm ci --omit=dev && sudo systemctl restart dinnerbyderek && journalctl -u dinnerbyderek -n 20 --no-pager
```

A few seconds of downtime. For a supper club that is nothing — but do it in
the morning rather than during Friday's cutoff.

`npm ci` is only needed when dependencies changed. Running it every time is
cheaper than remembering when.

---

## A staging copy on the same server

A second instance at `test.dinnerbyderek.ca`, so a menu change or a new
feature can be tried against real-looking data before customers see it. It
costs nothing extra — same server, second copy — and takes about ten minutes.

Everything the app writes is set by an environment variable, so two instances
coexist happily as long as **all five** differ: `PORT`, `DB_PATH`,
`UPLOAD_DIR`, `GRAPHICS_DIR`, and the directory the code sits in.

> **The danger here is not technical.** A staging site is a working ordering
> system. If someone finds it, they can place an order that nobody will ever
> cook. Leave the `SMTP_*` block **empty** in the staging `.env` — orders are
> still recorded, but the app cannot email Derek about them, so a stray test
> order cannot be mistaken for a real one. Leave the Facebook variables empty
> too, or the scheduled publisher on staging will happily post to the real
> Page.

### The second copy

```bash
git clone git@github.com:A-Theme/dinner-by-derek.git /srv/dinner-by-derek-staging
```

```bash
cd /srv/dinner-by-derek-staging && npm ci --omit=dev
```

```bash
sudo mkdir -p /var/lib/dinnerbyderek-staging/uploads /var/lib/dinnerbyderek-staging/graphics && sudo chown -R derek:derek /var/lib/dinnerbyderek-staging && chmod 750 /var/lib/dinnerbyderek-staging
```

### Its own .env

```bash
cd /srv/dinner-by-derek-staging && cp .env.example .env && chmod 600 .env
```

Set these, and **leave every `SMTP_` and `FB_` line blank**:

```ini
ADMIN_PASSWORD_HASH=<run npm run password again — a different password>
ADMIN_PASSWORD=
SESSION_SECRET=<a different one, so a staging cookie is meaningless on the real site>

PORT=3001
BASE_URL=https://test.dinnerbyderek.ca

DB_PATH=/var/lib/dinnerbyderek-staging/dinnerbyderek.db
UPLOAD_DIR=/var/lib/dinnerbyderek-staging/uploads
GRAPHICS_DIR=/var/lib/dinnerbyderek-staging/graphics

NODE_ENV=production
TRUST_PROXY=1
```

A different admin password is worth the small annoyance. It is what stops a
tired evening from editing the real menu while believing it is the test one.

### Its own service

```bash
sudo nano /etc/systemd/system/dinnerbyderek-staging.service
```

The same unit as [step 7](#7-keep-it-running-systemd), with two lines changed:

```ini
[Unit]
Description=Dinner By Derek (staging)
After=network.target

[Service]
Type=simple
User=derek
WorkingDirectory=/srv/dinner-by-derek-staging
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dinnerbyderek-staging && systemctl status dinnerbyderek-staging
```

### Its own address

Add an `A` record in Cloudflare — `test` → `SERVER_IP`, **DNS only** — then:

```bash
sudo nano /etc/nginx/sites-available/dinnerbyderek-staging
```

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name test.dinnerbyderek.ca;

  client_max_body_size 30M;

  location / {
    proxy_pass         http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

Note `3001`, not `3000`. That one digit is the whole difference, and getting
it wrong means the test site quietly serves the real one.

```bash
sudo ln -sf /etc/nginx/sites-available/dinnerbyderek-staging /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d test.dinnerbyderek.ca
```

### Filling it with something to look at

Staging starts empty, which makes it useless for judging a layout change.
Copy production's data across — with production stopped, for the reason in
[Backups](#backups):

```bash
sudo systemctl stop dinnerbyderek
```

```bash
cp /var/lib/dinnerbyderek/dinnerbyderek.db /var/lib/dinnerbyderek-staging/ && cp -r /var/lib/dinnerbyderek/uploads/. /var/lib/dinnerbyderek-staging/uploads/
```

```bash
sudo systemctl start dinnerbyderek && sudo systemctl restart dinnerbyderek-staging
```

Worth redoing every month or so, and always before testing anything that
touches orders. The copy goes one way only — **never** copy staging back over
production.

### Trying a change

```bash
cd /srv/dinner-by-derek-staging && git fetch && git checkout the-branch && npm ci --omit=dev && sudo systemctl restart dinnerbyderek-staging
```

Look at it on `test.dinnerbyderek.ca`. When it is right, merge the branch and
run the ordinary [deploy](#deploying-a-change-later) against production.

---

## Optional: the orange cloud

Once the site is up and settled, switching the DNS records to **Proxied**
(orange cloud) puts Cloudflare in front: it caches, absorbs traffic spikes,
and hides the server's real IP.

Two settings must change at the same time, or you break things quietly.

**1. In Cloudflare: SSL/TLS → Overview → set the mode to `Full (strict)`.**
Some accounts default to `Flexible`, which means Cloudflare talks https to the
customer and **plain http to your server** — the padlock is a lie, and the
app's http-to-https redirect turns it into an infinite loop. `Full (strict)`
uses the certificate certbot already installed.

**2. On the server: `TRUST_PROXY=1` becomes `TRUST_PROXY=2`.**

This one is subtle and it matters. `TRUST_PROXY` tells the app how many
proxies stand in front of it, and so how far back to believe
`X-Forwarded-For` ([server/config.js](../server/config.js)). With nginx alone
there is one hop and the header holds one address — the customer's. Add
Cloudflare and there are two, and the header holds `customer, cloudflare-edge`.
Left at `1`, the app reads the Cloudflare edge as the visitor, every visitor
looks like the same handful of addresses, and the login rate limiter starts
locking Derek out because someone else in the world guessed a password wrong.

```bash
cd /srv/dinner-by-derek && sed -i 's|^TRUST_PROXY=.*|TRUST_PROXY=2|' .env && sudo systemctl restart dinnerbyderek
```

Getting this wrong in the other direction — set too high — is worse: it lets a
caller name a fresh address on every request and never reach the limit at all.
The number must match the reality. One proxy, `1`. Two, `2`.

**Worth knowing:** the free plan refuses request bodies over 100 MB. The app
caps uploads at 26 MB, so it never bites, but it is the kind of limit that
surprises people later.

---

## Optional: email

Nothing above turns email on, and the app is fully functional without it —
orders are saved and appear in the dashboard either way. See **Turning email
on later** in [the README](../README.md) for the whole picture.

The short version: sending needs a real SMTP provider (Resend, Postmark and
Fastmail all have small or free tiers). Fill in the `SMTP_*` block in `.env`
and restart. Put `SMTP_FROM` on the domain — `orders@dinnerbyderek.ca` — not
on a personal Gmail, or the mail lands in spam.

Receiving is separate, and free: Cloudflare → **Email** → **Email Routing**
forwards `derek@dinnerbyderek.ca` to whatever inbox is already being read.

---

## When something is wrong

Work from the inside out. Three layers, three questions.

**Is the app running?**

```bash
systemctl status dinnerbyderek && journalctl -u dinnerbyderek -n 50 --no-pager
```

```bash
curl -sI http://127.0.0.1:3000/ | head -1
```

**Is nginx running, and does its config parse?**

```bash
sudo nginx -t && systemctl status nginx && sudo tail -50 /var/log/nginx/error.log
```

**Is DNS pointing where you think?**

```bash
dig +short dinnerbyderek.ca
```

The common ones:

| What you see | Usually |
|---|---|
| `502 Bad Gateway` | The app is not running. nginx is fine; read the journal. |
| Photo upload fails, no useful error | `client_max_body_size` missing from nginx. |
| Login takes the password, then returns to the login page | `BASE_URL` is not https, so the secure cookie is set and never sent back. |
| "Too many attempts" for Derek, from a normal phone | `TRUST_PROXY` does not match the number of proxies. See [the orange cloud](#optional-the-orange-cloud). |
| Padlock, but an endless redirect | Cloudflare SSL mode is `Flexible`. Set `Full (strict)`. |
| Loads on the laptop, not the phone | DNS has reached one resolver and not the other. Wait. |
| App dies during photo processing | Out of memory. Check the swap from step 2 is on: `free -h`. |
| QR code goes somewhere wrong | Generated before `BASE_URL` was set. Regenerate in Settings → Graphics. |
| `test.` shows the real site | The staging nginx block is proxying to `3000` instead of `3001`. |
| Staging and production seem to share a menu | Two instances pointed at one `DB_PATH`. Check both `.env` files. |
| Tunnel address loads, but login bounces back | `BASE_URL` is still `localhost`, so the secure cookie is never returned. Restart the app with `BASE_URL` set to the tunnel address. |
