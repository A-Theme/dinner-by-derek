#!/usr/bin/env bash
#
# scripts/env-check.sh — say what the live .env actually contains.
#
# RUN THIS ON THE SERVER. It is not a laptop command: the file it reports on is
# the server's own .env, which is gitignored and has never been on the laptop.
#
# Read-only by construction. It opens .env, systemctl and git for reading and
# writes nothing, restarts nothing, and connects to no mailbox, so it is safe
# to run on a live box in the middle of service.
#
# It never prints the value of a secret. For SMTP_PASS and IMAP_PASS it prints
# a character count instead, which is the number that catches the failure that
# has already happened here once: a 16-character app password stored as 48,
# because it was pasted twice into a prompt that echoed nothing back.
#
# The distinction it exists to draw is MISSING versus EMPTY. `.env` is
# gitignored, so a deploy updates `.env.example` and leaves `.env` exactly as
# it was — which means the live file predates every setting added since it was
# written. `sed -i "s|^KEY=.*|...|"` then silently does nothing, because there
# is no line to substitute into, and reports success. A key that was never
# added and a key deliberately left blank look identical from the outside;
# they are not the same problem and they do not have the same fix. That is the
# whole reason this exists, and it is why the IMAP block appeared to be
# configured for a day when it was not.
#
# Usage, on the server:
#
#   bash /srv/dinner-by-derek/scripts/env-check.sh
#   bash scripts/env-check.sh [app-dir]
#
set -u

# Default to the checkout this script is part of, so it works from anywhere on
# the box without an argument. That guess is only taken when the directory
# actually looks like the app: the script is also useful copied somewhere on
# its own — which is how it first arrived on this server, scp'd to a home
# directory — and there the parent directory is not the app at all.
SCRIPT_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd) || SCRIPT_DIR=""
GUESS=""
[ -n "$SCRIPT_DIR" ] && GUESS=$(dirname "$SCRIPT_DIR")

if [ -n "${1:-}" ]; then
  APP_DIR="$1"
elif [ -n "$GUESS" ] && [ -f "$GUESS/.env.example" ]; then
  APP_DIR="$GUESS"
else
  APP_DIR="/srv/dinner-by-derek"
fi
ENV_FILE="$APP_DIR/.env"
EXAMPLE_FILE="$APP_DIR/.env.example"
SERVICE="dinnerbyderek"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env at $ENV_FILE"
  echo "Pass the app directory as an argument if it lives somewhere else."
  exit 1
fi

# A key whose value must never be printed. Matched by name, so a secret added
# later is covered without editing this list.
is_secret() {
  case "$1" in
    *PASS*|*SECRET*|*TOKEN*|*HASH*|*_KEY) return 0 ;;
    *) return 1 ;;
  esac
}

# How many times the key appears. More than once is the append-invisibly bug:
# the app reads the last one, so the file can look right and behave wrong.
#
# `grep -c` prints 0 AND exits non-zero when there is no match, so the obvious
# `grep -c ... || echo 0` prints "0" twice and every downstream `-eq` comparison
# dies on it. That failure is quiet in the worst way: the integer test errors,
# the MISSING branch is skipped, and a key that is not in the file at all gets
# reported as "empty" — inverting the one distinction this script exists to
# draw. Caught by running it against a .env with no IMAP block.
count_key() {
  n=$(grep -c "^$1=" "$ENV_FILE" 2>/dev/null)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  printf '%s' "$n"
}

# Everything after the FIRST '=' on the LAST matching line — which is the line
# the app itself uses. CR is stripped so a file that once passed through Windows
# does not report every value as one character too long.
last_value() { grep "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r'; }

# Prints one line per key. Nothing in here echoes a secret value.
report() {
  key="$1"
  n=$(count_key "$key")

  if [ "$n" -eq 0 ]; then
    printf '  %-18s MISSING   — no %s= line in the file at all\n' "$key" "$key"
    return
  fi

  v=$(last_value "$key")
  len=$(printf '%s' "$v" | wc -c | tr -d ' ')

  if [ -z "$v" ]; then
    printf '  %-18s empty     — line present, no value\n' "$key"
  elif is_secret "$key"; then
    printf '  %-18s SET       — %s characters\n' "$key" "$len"
  else
    printf '  %-18s SET       — %s\n' "$key" "$v"
  fi

  # Things that make a correct-looking value behave wrongly. Each is reported
  # by shape, never by content, so this stays safe for secrets.
  case "$v" in
    ' '*|'	'*) printf '  %-18s   ^ WARNING: leading whitespace\n' '' ;;
  esac
  case "$v" in
    *' '|*'	') printf '  %-18s   ^ WARNING: trailing whitespace\n' '' ;;
  esac
  case "$v" in
    '"'*'"'|"'"*"'") printf '  %-18s   ^ WARNING: wrapped in quotes (kept as part of the value)\n' '' ;;
  esac
  if [ "$n" -gt 1 ]; then
    printf '  %-18s   ^ WARNING: appears %s times — the app uses the LAST one\n' '' "$n"
  fi
}

echo
echo "=============================================================="
echo " Live .env — $ENV_FILE"
echo " $(date)"
echo "=============================================================="

# CRLF is a property of the whole file in practice — it means the file was
# written or edited from Windows — so it is checked once here rather than per
# key. Read straight off the file with `tr`, because piping through `grep`
# first is not portable: Git Bash's grep strips CR from its output while GNU
# grep on the server keeps it, so a per-line check silently passes on a laptop
# and only ever fires on the box.
#
# It matters because a trailing CR is part of the value. `IMAP_PORT=993` with a
# CR is the string "993\r", and the mailbox never connects.
if [ "$(tr -cd '\r' < "$ENV_FILE" | wc -c)" -gt 0 ]; then
  echo
  echo "  >> WARNING: this file contains CR (Windows) line endings."
  echo "     Every value on such a line carries a trailing CR as part of itself."
  echo "     Fix:  sed -i 's/\r$//' $ENV_FILE   (then restart the service)"
fi

echo
echo "Sending mail (SMTP)"
echo "-------------------"
for k in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM; do
  report "$k"
done

echo
echo "Reading the bank's mailbox (IMAP)"
echo "---------------------------------"
for k in IMAP_HOST IMAP_PORT IMAP_SECURE IMAP_USER IMAP_PASS IMAP_MAILBOX IMAP_ALLOW_FROM; do
  report "$k"
done

echo
echo "Also worth seeing"
echo "-----------------"
for k in BASE_URL DB_PATH NODE_ENV; do
  report "$k"
done

# The verdict, computed the same way the app computes it. Both features are
# switched on by the host variable alone — server/mailer.js:387 and
# server/mailbox.js `configured()` both read `!!host`. Every other setting in
# the block is inert until the host is filled in.
echo
echo "What the app will therefore do"
echo "------------------------------"
smtp_host=$(last_value SMTP_HOST)
imap_host=$(last_value IMAP_HOST)

if [ -n "$smtp_host" ]; then
  echo "  Email:    ON  — confirmations and alerts will be sent"
else
  echo "  Email:    OFF — orders still save, no mail leaves the box"
fi

if [ -n "$imap_host" ]; then
  echo "  Payments: ON  — mailbox polled every 5 minutes"
else
  echo "  Payments: OFF — paste-on-the-Payments-screen only"
fi

# Keys the code knows about that the file has never heard of. This is the
# specific way a deploy goes stale: .env is gitignored, so a deploy updates
# .env.example and leaves .env exactly as it was.
echo
echo "In .env.example but absent from .env"
echo "------------------------------------"
if [ -f "$EXAMPLE_FILE" ]; then
  missing=0
  for k in $(grep -oE '^[A-Z][A-Z0-9_]*=' "$EXAMPLE_FILE" | tr -d '='); do
    if [ "$(count_key "$k")" -eq 0 ]; then
      echo "  $k"
      missing=$((missing + 1))
    fi
  done
  [ "$missing" -eq 0 ] && echo "  (none — the file is current)"
else
  echo "  (no .env.example next to it)"
fi

# A setting can be right in the file and not yet in the running process: the
# service reads .env once, at start. If .env is newer than the service, the
# file and the behaviour disagree and a restart is what closes the gap.
echo
echo "Is the running service using this file?"
echo "--------------------------------------"
state=$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)
echo "  service:      $state"
started=$(systemctl show "$SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null)
echo "  started:      ${started:-unknown}"
echo "  .env changed: $(date -r "$ENV_FILE" 2>/dev/null || echo unknown)"
if [ -n "$started" ]; then
  s_epoch=$(date -d "$started" +%s 2>/dev/null || echo 0)
  e_epoch=$(date -r "$ENV_FILE" +%s 2>/dev/null || echo 0)
  if [ "$s_epoch" -gt 0 ] && [ "$e_epoch" -gt "$s_epoch" ]; then
    echo
    echo "  >> .env is NEWER than the running service."
    echo "     Edits made since it started are not in effect yet."
    echo "     'npm run poll' would see them; the app does not."
    echo "     sudo systemctl restart $SERVICE"
  else
    echo "  the service started after the last .env edit — it is current"
  fi
fi

echo
echo "Deployed code"
echo "-------------"
git -C "$APP_DIR" log --oneline -1 2>/dev/null || echo "  (not a git checkout)"
echo
echo "Nothing was changed by this script."
echo
