#!/usr/bin/env bash
# Launch the NexusDeck graphical installer in your default browser.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd python3

if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo "No graphical session detected. Run in Desktop Mode, or use:" >&2
  echo "  NEXUSDECK_CLI=1 ${INSTALL_DIR}/install-steamdeck.sh" >&2
  exit 1
fi

PORT="${NEXUSDECK_INSTALLER_PORT:-0}"
SERVER_LOG="$(mktemp "${TMPDIR:-/tmp}/nexusdeck-installer-XXXXXX.log")"

python3 "${SCRIPT_DIR}/server.py" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" 2>/dev/null || true
  rm -f "${SERVER_LOG}"
}
trap cleanup EXIT INT TERM

URL=""
for _ in $(seq 1 50); do
  if [[ -s "${SERVER_LOG}" ]]; then
    URL="$(head -n1 "${SERVER_LOG}" | tr -d '\r\n')"
    if [[ "${URL}" == http://* ]]; then
      break
    fi
  fi
  sleep 0.1
done

[[ -n "${URL}" ]] || {
  echo "Installer UI failed to start." >&2
  cat "${SERVER_LOG}" >&2 || true
  exit 1
}

open_url() {
  local target="$1"
  # Prefer a clean window on Steam Deck Desktop Mode
  if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "${target}" >/dev/null 2>&1 &
    return 0
  fi
  if command -v chromium >/dev/null 2>&1; then
    chromium --app="${target}" >/dev/null 2>&1 &
    return 0
  fi
  if command -v google-chrome >/dev/null 2>&1; then
    google-chrome --app="${target}" >/dev/null 2>&1 &
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${target}" >/dev/null 2>&1 &
    return 0
  fi
  if command -v gio >/dev/null 2>&1; then
    gio open "${target}" >/dev/null 2>&1 &
    return 0
  fi
  return 1
}

echo ""
echo "  NexusDeck Setup"
echo "  ─────────────────────────────────"
echo "  Opening installer in your browser."
echo "  Keep this window open until setup finishes."
echo ""
echo "  URL: ${URL}"
echo ""

if open_url "${URL}"; then
  wait "${SERVER_PID}"
else
  echo "Could not open a browser automatically."
  echo "Open this URL manually: ${URL}"
  wait "${SERVER_PID}"
fi
