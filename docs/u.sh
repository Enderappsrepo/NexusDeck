#!/usr/bin/env bash
# NexusDeck Steam Deck / Linux uninstaller (Flatpak)
# Usage:
#   curl -fsSL https://enderappsrepo.github.io/NexusDeck/u.sh | bash
#   ./uninstall-steamdeck.sh
#
# Environment overrides:
#   NEXUSDECK_KEEP_DATA     Set to 1 to keep settings/database in ~/.config/nexusdeck

set -euo pipefail

APP_NAME="NexusDeck"
APP_ID="com.nexusdeck.app"
FLATPAK_CMD="flatpak run ${APP_ID}"
LEGACY_INSTALL_DIR="${NEXUSDECK_INSTALL_DIR:-$HOME/.local/share/nexusdeck}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/nexusdeck"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
LEGACY_LAUNCHER="${LEGACY_INSTALL_DIR}/nexusdeck-launch.sh"
LEGACY_APPIMAGE="${LEGACY_INSTALL_DIR}/NexusDeck.AppImage"
DESKTOP_FILE="${DESKTOP_DIR}/nexusdeck.desktop"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

prompt_yes_no() {
  local question="$1"
  local default="${2:-y}"
  local hint="Y/n"
  [[ "$default" == "n" ]] && hint="y/N"
  read -r -p "$(echo -e "${BOLD}${question}${NC} [${hint}]: ")" reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

find_steam_path() {
  local candidates=(
    "${STEAM_COMPAT_CLIENT_INSTALL_PATH:-}"
    "${HOME}/.steam/steam"
    "${HOME}/.local/share/Steam"
    "/usr/share/steam"
    "/home/deck/.steam/steam"
  )
  for path in "${candidates[@]}"; do
    [[ -n "$path" && -d "$path" ]] && { echo "$path"; return 0; }
  done
  return 1
}

find_steam_userdata() {
  local steam_path="$1"
  local userdata="${steam_path}/userdata"
  [[ -d "$userdata" ]] || return 1
  local entry
  for entry in "$userdata"/*; do
    [[ -d "$entry/config" ]] && { echo "$entry"; return 0; }
  done
  return 1
}

remove_steam_shortcut() {
  local steam_path
  steam_path="$(find_steam_path)" || return 0

  local userdata
  userdata="$(find_steam_userdata "$steam_path")" || return 0

  local shortcuts_path="${userdata}/config/shortcuts.vdf"
  [[ -f "$shortcuts_path" ]] || return 0

  if [[ -f "${shortcuts_path}.nexusdeck_backup" ]]; then
    info "Restoring Steam shortcuts from pre-NexusDeck backup..."
    cp "${shortcuts_path}.nexusdeck_backup" "$shortcuts_path"
    ok "Removed NexusDeck from Steam library (restored backup)"
    return 0
  fi

  require_cmd python3
  local result
  result="$(python3 - "$shortcuts_path" "$APP_NAME" "$FLATPAK_CMD" "$LEGACY_LAUNCHER" "$LEGACY_APPIMAGE" "$LEGACY_INSTALL_DIR" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
needles = [n for n in sys.argv[2:] if n]
text = path.read_text(encoding="utf-8", errors="replace")
if '"Shortcuts"' not in text:
    print("missing")
    sys.exit(0)

lines = text.splitlines(keepends=True)
result = []
removed = False
i = 0

while i < len(lines):
    line = lines[i]
    if line.strip().startswith('"AppName"'):
        block = []
        j = i
        while j < len(lines):
            block.append(lines[j])
            if j > i and lines[j].strip().startswith('"AppName"'):
                block.pop()
                break
            if lines[j].strip() == "}" and j > i:
                break
            j += 1

        block_text = "".join(block)
        if any(needle in block_text for needle in needles):
            removed = True
            i = j
            continue

        result.extend(block)
        i = j
        continue

    result.append(line)
    i += 1

if removed:
    path.write_text("".join(result), encoding="utf-8")
    print("removed")
else:
    print("not_found")
PY
)"

  case "$result" in
    removed) ok "Removed NexusDeck from Steam shortcuts.vdf" ;;
    not_found) warn "No NexusDeck Steam shortcut found (or already removed)" ;;
    *) warn "Steam shortcuts file unchanged" ;;
  esac
}

stop_running_app() {
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "${APP_ID}" >/dev/null 2>&1 || true
    pkill -f "NexusDeck.AppImage" >/dev/null 2>&1 || true
    pkill -f "nexusdeck-launch.sh" >/dev/null 2>&1 || true
  fi
}

remove_flatpak() {
  if flatpak info --user "$APP_ID" >/dev/null 2>&1; then
    flatpak uninstall -y --user "$APP_ID" || flatpak uninstall -y --user "$APP_ID" --delete-data
    ok "Uninstalled Flatpak ${APP_ID}"
  else
    warn "Flatpak ${APP_ID} is not installed"
  fi
}

remove_legacy_files() {
  [[ -L "${BIN_DIR}/nexusdeck" || -f "${BIN_DIR}/nexusdeck" ]] && rm -f "${BIN_DIR}/nexusdeck" && ok "Removed ${BIN_DIR}/nexusdeck"
  [[ -f "$DESKTOP_FILE" ]] && rm -f "$DESKTOP_FILE" && ok "Removed legacy desktop entry"
  if [[ -d "$LEGACY_INSTALL_DIR" ]]; then
    rm -rf "$LEGACY_INSTALL_DIR"
    ok "Removed legacy install dir ${LEGACY_INSTALL_DIR}"
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
  fi
}

remove_config_dir() {
  if [[ -d "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
    ok "Removed settings and database in ${CONFIG_DIR}"
  else
    warn "Config directory not found: ${CONFIG_DIR}"
  fi
}

print_header() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     NexusDeck Steam Deck Uninstall   ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
  echo
}

main() {
  print_header

  warn "Steam's \"Uninstall\" / \"Manage add-on\" buttons do not remove non-Steam shortcuts."
  echo "This script removes NexusDeck Flatpak and any legacy AppImage install."
  echo

  echo -e "${BOLD}Will remove:${NC}"
  echo "  • Flatpak ${APP_ID}"
  echo "  • Legacy AppImage files (if present)"
  echo "  • Steam library shortcut (if present)"
  if [[ "${NEXUSDECK_KEEP_DATA:-0}" == "1" ]]; then
    echo "  • Keep settings in ${CONFIG_DIR}"
  else
    echo "  • Settings/database in ${CONFIG_DIR} (unless you opt out below)"
  fi
  echo

  prompt_yes_no "Uninstall NexusDeck?" y || exit 0

  stop_running_app
  remove_steam_shortcut
  remove_flatpak
  remove_legacy_files

  if [[ "${NEXUSDECK_KEEP_DATA:-0}" == "1" ]]; then
    ok "Kept user data in ${CONFIG_DIR}"
  elif prompt_yes_no "Also delete NexusDeck settings and database?" y; then
    remove_config_dir
  else
    ok "Kept user data in ${CONFIG_DIR}"
  fi

  echo
  ok "NexusDeck has been uninstalled."
  echo
  echo -e "${BOLD}If NexusDeck still appears in Steam:${NC}"
  echo "  1. Restart Steam"
  echo "  2. Desktop Mode: Steam → NexusDeck → gear icon → Remove from library"
  echo
}

main "$@"
