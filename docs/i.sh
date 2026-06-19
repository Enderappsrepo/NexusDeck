#!/usr/bin/env bash
# NexusDeck Steam Deck installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install/install-steamdeck.sh | bash
#   ./install-steamdeck.sh
#
# Environment overrides:
#   NEXUSDECK_GITHUB_REPO   GitHub owner/repo (default: Enderappsrepo/NexusDeck)
#   NEXUSDECK_VERSION       Release tag (default: latest)
#   NEXUSDECK_APPIMAGE_PATH Local AppImage path (skips download)
#   NEXUSDECK_INSTALL_DIR   Install directory (default: ~/.local/share/nexusdeck)
#   NEXUSDECK_NO_STEAM      Set to 1 to skip adding to Steam library

set -euo pipefail

APP_NAME="NexusDeck"
APP_ID="com.nexusdeck.app"
GITHUB_REPO="${NEXUSDECK_GITHUB_REPO:-Enderappsrepo/NexusDeck}"
VERSION="${NEXUSDECK_VERSION:-latest}"
INSTALL_DIR="${NEXUSDECK_INSTALL_DIR:-$HOME/.local/share/nexusdeck}"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
APPIMAGE_NAME="NexusDeck.AppImage"
APPIMAGE_PATH="${INSTALL_DIR}/${APPIMAGE_NAME}"
LAUNCHER_PATH="${INSTALL_DIR}/nexusdeck-launch.sh"

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

is_steam_deck() {
  [[ -n "${SteamOS:-}" || -n "${STEAMOS:-}" ]] && return 0
  [[ -d /home/deck ]] && return 0
  if [[ -f /etc/os-release ]]; then
    grep -qiE 'steamos|valve' /etc/os-release && return 0
  fi
  if [[ -f /usr/lib/os-release ]]; then
    grep -qiE 'steamos|valve' /usr/lib/os-release && return 0
  fi
  return 1
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

generate_shortcut_app_id() {
  local name="$1"
  local exe="$2"
  python3 - "$name" "$exe" <<'PY'
import sys
name, exe = sys.argv[1], sys.argv[2]
combined = f"{name}{exe}\0"
crc = 0
for byte in combined.encode("utf-8"):
    crc = ((crc << 8) ^ byte) & 0xFFFFFFFF
print(crc | 0x80000000)
PY
}

add_to_steam_shortcuts() {
  local steam_path="$1"
  local display_name="$2"
  local exe_path="$3"
  local start_dir="$4"

  local userdata
  userdata="$(find_steam_userdata "$steam_path")" || fail "Could not find Steam userdata folder"

  local shortcuts_path="${userdata}/config/shortcuts.vdf"
  local backup_path="${shortcuts_path}.nexusdeck_backup"

  if [[ -f "$shortcuts_path" && ! -f "$backup_path" ]]; then
    cp "$shortcuts_path" "$backup_path"
    ok "Backed up shortcuts.vdf"
  fi

  local app_id
  app_id="$(generate_shortcut_app_id "$display_name" "$exe_path")"

  local block
  block=$(
    cat <<EOF

"AppName"		"${display_name}"
"Exe"		"${exe_path}"
"StartDir"		"${start_dir}"
"LaunchOptions"		""
"icon"		""
"ShortcutPath"		""
"IsHidden"		"0"
"AllowDesktopConfig"		"1"
"AllowOverlay"		"1"
"OpenVR"		"0"
"Devkit"		"0"
"DevkitGameID"		""
"DevkitOverrideAppID"		"0"
"LastPlayTime"		"0"
"tags"		"{}"
"appid"		"${app_id}"
"Playtime"		"0"
"Playtime2wks"		"0"
"SortAs"		""
"UseLaunchOptions"		"1"
"LastUpdated"		"0"
"FlatpakAppID"		""
"GameID"		"${app_id}"
EOF
  )

  mkdir -p "$(dirname "$shortcuts_path")"
  if [[ -f "$shortcuts_path" ]]; then
    if grep -Fq "\"Exe\"		\"${exe_path}\"" "$shortcuts_path" 2>/dev/null; then
      warn "NexusDeck shortcut already exists in Steam"
      return 0
    fi
    if grep -q '"Shortcuts"' "$shortcuts_path"; then
      if tail -n1 "$shortcuts_path" | grep -q '^}$'; then
        tmp="${shortcuts_path}.tmp"
        head -n -1 "$shortcuts_path" >"$tmp"
        printf '%s\n}\n' "$block" >>"$tmp"
        mv "$tmp" "$shortcuts_path"
      else
        printf '%s\n' "$block" >>"$shortcuts_path"
      fi
    else
      printf '"Shortcuts"\n{\n%s\n}\n' "$block" >"$shortcuts_path"
    fi
  else
    printf '"Shortcuts"\n{\n%s\n}\n' "$block" >"$shortcuts_path"
  fi

  ok "Added \"${display_name}\" to Steam library"
}

download_latest_appimage() {
  require_cmd curl
  require_cmd python3

  local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/${VERSION}"
  info "Fetching release info from ${GITHUB_REPO} (${VERSION})..."

  local release_json
  release_json="$(curl -fsSL -H "Accept: application/vnd.github+json" "$api_url")" \
    || fail "Could not fetch release info. Set NEXUSDECK_APPIMAGE_PATH to install from a local file."

  local asset_url asset_name
  asset_url="$(python3 - <<'PY' "$release_json"
import json, sys
data = json.loads(sys.argv[1])
for asset in data.get("assets", []):
    name = asset.get("name", "")
    if name.endswith(".AppImage") and "nexusdeck" in name.lower():
        print(asset["browser_download_url"])
        break
PY
)" || true

  if [[ -z "$asset_url" ]]; then
    asset_url="$(python3 - <<'PY' "$release_json"
import json, sys
data = json.loads(sys.argv[1])
for asset in data.get("assets", []):
    if asset.get("name", "").endswith(".AppImage"):
        print(asset["browser_download_url"])
        break
PY
)"
  fi

  [[ -n "$asset_url" ]] || fail "No AppImage found in release. Build one locally or set NEXUSDECK_APPIMAGE_PATH."

  asset_name="$(basename "$asset_url")"
  info "Downloading ${asset_name}..."
  mkdir -p "$INSTALL_DIR"
  curl -fL --progress-bar "$asset_url" -o "${INSTALL_DIR}/${asset_name}"
  mv -f "${INSTALL_DIR}/${asset_name}" "$APPIMAGE_PATH"
  ok "Downloaded to ${APPIMAGE_PATH}"
}

install_appimage() {
  if [[ -n "${NEXUSDECK_APPIMAGE_PATH:-}" ]]; then
    [[ -f "$NEXUSDECK_APPIMAGE_PATH" ]] || fail "Local AppImage not found: $NEXUSDECK_APPIMAGE_PATH"
    mkdir -p "$INSTALL_DIR"
    cp -f "$NEXUSDECK_APPIMAGE_PATH" "$APPIMAGE_PATH"
    ok "Installed from ${NEXUSDECK_APPIMAGE_PATH}"
  else
    download_latest_appimage
  fi

  chmod +x "$APPIMAGE_PATH"
}

create_launcher() {
  cat >"$LAUNCHER_PATH" <<EOF
#!/usr/bin/env bash
# SteamOS WebKit workarounds for Ubuntu-built AppImages
export WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export WEBKIT_DISABLE_COMPOSITING_MODE="\${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"
export GDK_BACKEND="\${GDK_BACKEND:-x11}"
exec "${APPIMAGE_PATH}" "\$@"
EOF
  chmod +x "$LAUNCHER_PATH"
}

create_desktop_entry() {
  mkdir -p "$DESKTOP_DIR" "$BIN_DIR"
  local desktop_file="${DESKTOP_DIR}/nexusdeck.desktop"
  cat >"$desktop_file" <<EOF
[Desktop Entry]
Name=${APP_NAME}
Comment=Lightweight Nexus Mods client for Steam Deck
Exec=${LAUNCHER_PATH}
Icon=${APPIMAGE_PATH}
Terminal=false
Type=Application
Categories=Game;Utility;
StartupWMClass=nexusdeck
EOF
  ln -sf "$LAUNCHER_PATH" "${BIN_DIR}/nexusdeck"
  ok "Created desktop entry and ~/.local/bin/nexusdeck symlink"
}

print_header() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║       NexusDeck Steam Deck Setup     ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
  echo
}

main() {
  print_header

  if is_steam_deck; then
    ok "Steam Deck / SteamOS detected"
  else
    warn "Steam Deck not detected — installer will still work on other Linux systems"
  fi

  require_cmd python3

  echo
  info "This installer will:"
  echo "  1. Download (or copy) the NexusDeck AppImage"
  echo "  2. Install to ${INSTALL_DIR}"
  echo "  3. Create a desktop launcher"
  echo "  4. Optionally add NexusDeck to your Steam library"
  echo "  5. Launch NexusDeck for first-time setup"
  echo

  prompt_yes_no "Continue with installation?" y || exit 0

  install_appimage
  create_launcher
  create_desktop_entry

  local steam_path=""
  if [[ "${NEXUSDECK_NO_STEAM:-0}" != "1" ]] && steam_path="$(find_steam_path)"; then
    ok "Steam found at ${steam_path}"
    echo
    if prompt_yes_no "Add NexusDeck to Steam library for Gaming Mode?" y; then
      add_to_steam_shortcuts "$steam_path" "$APP_NAME" "$LAUNCHER_PATH" "$INSTALL_DIR"
      warn "Restart Steam for the shortcut to appear"
    fi
  else
    warn "Steam not found — skip Steam library step or add later from Settings"
  fi

  echo
  ok "Installation complete!"
  echo
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Launch NexusDeck (Desktop shortcut or: nexusdeck)"
  echo "  2. Enter your Nexus Mods API key"
  echo "  3. Run the Fallout 4 setup wizard"
  echo
  echo "  API key: https://www.nexusmods.com/users/myaccount?tab=api+access"
  echo

  if prompt_yes_no "Launch NexusDeck now for setup?" y; then
    info "Starting NexusDeck..."
    nohup "$LAUNCHER_PATH" >/dev/null 2>&1 &
    ok "NexusDeck launched — complete the in-app setup wizard"
  fi
}

main "$@"
