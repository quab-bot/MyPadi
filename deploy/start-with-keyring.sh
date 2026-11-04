#!/usr/bin/env bash
# Launch MyPadi with buy's OS keychain unlocked, for headless mainnet signing.
#
# Why this exists: @celo/buy@0.8.5's `file` keystore refuses mainnet (it is a
# development-only plaintext backend). The real wallet key therefore lives in
# the OS keychain (gnome-keyring) under the `system` backend. On a headless VPS
# that keyring must be unlocked inside THIS process's D-Bus session so the `buy`
# subprocess the app spawns can read the key. KEYRING_PW is read from .env
# (gitignored); it is the password that unlocks the login keyring created at
# key-import time. See docs/GO-LIVE-RUNBOOK.md and the project notes.
set -euo pipefail
cd "$(dirname "$0")/.."

KEYRING_PW="$(grep '^KEYRING_PW=' .env | cut -d= -f2-)"
if [ -z "${KEYRING_PW:-}" ]; then
  echo "start-with-keyring: KEYRING_PW missing from .env" >&2
  exit 1
fi

# A D-Bus session bus is required for the Secret Service (org.freedesktop.secrets).
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  eval "$(dbus-launch --sh-syntax)"
fi
export DBUS_SESSION_BUS_ADDRESS

# Unlock (or create) the login keyring; prints and we export its control vars.
eval "$(printf '%s' "$KEYRING_PW" | gnome-keyring-daemon --unlock --components=secrets)"
export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK

# Hand off to the app. The buy subprocess inherits the unlocked-keyring session.
exec npm run start
