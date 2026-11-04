#!/usr/bin/env bash
# Run any command inside an unlocked-keyring D-Bus session, so the `buy` CLI can
# reach the OS keychain (system backend) on a headless server. The long-running
# app uses start-with-keyring.sh; this is for one-off commands, e.g.:
#   deploy/with-keyring.sh npm run preflight
#   deploy/with-keyring.sh npm run register-8004 -- --confirm
#   deploy/with-keyring.sh buy whoami
set -euo pipefail
cd "$(dirname "$0")/.."

KEYRING_PW="$(grep '^KEYRING_PW=' .env | cut -d= -f2-)"
if [ -z "${KEYRING_PW:-}" ]; then
  echo "with-keyring: KEYRING_PW missing from .env" >&2
  exit 1
fi

if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  eval "$(dbus-launch --sh-syntax)"
fi
export DBUS_SESSION_BUS_ADDRESS

eval "$(printf '%s' "$KEYRING_PW" | gnome-keyring-daemon --unlock --components=secrets)"
export GNOME_KEYRING_CONTROL SSH_AUTH_SOCK

exec "$@"
