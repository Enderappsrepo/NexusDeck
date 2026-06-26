#!/usr/bin/env bash
# NexusDeck Steam Deck / Linux installer (Flatpak)
# Usage:
#   curl -fsSL https://github.com/Enderappsrepo/NexusDeck/releases/latest/download/i.sh | bash
#   ./install-steamdeck.sh
#
# Environment overrides:
#   NEXUSDECK_GITHUB_REPO   GitHub owner/repo (default: Enderappsrepo/NexusDeck)
#   NEXUSDECK_VERSION       Release tag (default: latest)
#   NEXUSDECK_FLATPAK_PATH  Local .flatpak path (skips download)
#   NEXUSDECK_NO_STEAM      Set to 1 to skip adding to Steam library

set -euo pipefail

APP_NAME="NexusDeck"
APP_ID="com.nexusdeck.app"
FLATPAK_CMD="flatpak run ${APP_ID}"
GITHUB_REPO="${NEXUSDECK_GITHUB_REPO:-Enderappsrepo/NexusDeck}"
VERSION="${NEXUSDECK_VERSION:-latest}"
LEGACY_INSTALL_DIR="${NEXUSDECK_INSTALL_DIR:-$HOME/.local/share/nexusdeck}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}→${NC} $*" >&2; }
ok()    { echo -e "${GREEN}✓${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}!${NC} $*" >&2; }
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

ensure_flatpak() {
  require_cmd flatpak
  if ! flatpak remote-list --columns=name | grep -qx flathub; then
    info "Adding Flathub remote..."
    flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  fi
  ok "Flatpak ready"
}

download_latest_flatpak() {
  require_cmd curl
  require_cmd python3

  local api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/${VERSION}"
  info "Fetching release info from ${GITHUB_REPO} (${VERSION})..."

  local release_json
  release_json="$(curl -fsSL -H "Accept: application/vnd.github+json" "$api_url")" \
    || fail "Could not fetch release info. Set NEXUSDECK_FLATPAK_PATH to install from a local file."

  local asset_url asset_name
  asset_url="$(python3 - <<'PY' "$release_json"
import json, sys
data = json.loads(sys.argv[1])
for asset in data.get("assets", []):
    name = asset.get("name", "")
    if name.endswith(".flatpak") and "nexusdeck" in name.lower():
        print(asset["browser_download_url"])
        break
else:
    for asset in data.get("assets", []):
        if asset.get("name", "").endswith(".flatpak"):
            print(asset["browser_download_url"])
            break
PY
)" || true

  [[ -n "$asset_url" ]] || fail "No Flatpak bundle found in release. Wait for CI to finish or set NEXUSDECK_FLATPAK_PATH."

  asset_name="$(basename "$asset_url")"
  local tmp_file
  tmp_file="$(mktemp "${TMPDIR:-/tmp}/nexusdeck-XXXXXX.flatpak")"
  info "Downloading ${asset_name}..."
  curl -fL --progress-bar "$asset_url" -o "$tmp_file"
  [[ -s "$tmp_file" ]] || fail "Download failed or empty file: ${asset_name}"
  ok "Downloaded ${asset_name}"
  printf '%s\n' "$tmp_file"
}

install_flatpak() {
  local bundle_path="$1"
  bundle_path="${bundle_path//$'\r'/}"
  bundle_path="${bundle_path//$'\n'/}"
  [[ -f "$bundle_path" ]] || fail "Flatpak bundle not found: ${bundle_path:-<empty>}"

  info "Installing ${APP_ID} from ${bundle_path}..."
  if flatpak info --user "$APP_ID" >/dev/null 2>&1; then
    flatpak install -y --user --reinstall "$bundle_path" \
      || fail "Flatpak reinstall failed. Try: flatpak install -y --user --reinstall ${bundle_path}"
  else
    flatpak install -y --user "$bundle_path" \
      || fail "Flatpak install failed. Try: flatpak install -y --user ${bundle_path}"
  fi
  ok "Installed ${APP_ID}"

  if [[ "$bundle_path" == "${TMPDIR:-/tmp}/"* || "$bundle_path" == /tmp/* ]]; then
    rm -f "$bundle_path"
  fi
}

register_nxm_handler() {
  if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default com.nexusdeck.app.desktop x-scheme-handler/nxm || true
    ok "Registered nxm:// link handler"
  else
    warn "xdg-mime not found — nxm:// links may need manual setup"
  fi
}

remove_legacy_appimage() {
  if [[ -d "$LEGACY_INSTALL_DIR" ]]; then
    warn "Removing legacy AppImage install at ${LEGACY_INSTALL_DIR}..."
    rm -rf "$LEGACY_INSTALL_DIR"
    rm -f "${HOME}/.local/bin/nexusdeck"
    rm -f "${HOME}/.local/share/applications/nexusdeck.desktop"
    ok "Removed legacy AppImage files"
  fi
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
  local launch_options="${5:-run ${APP_ID}}"

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
"LaunchOptions"		"${launch_options}"
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
"FlatpakAppID"		"${APP_ID}"
"GameID"		"${app_id}"
EOF
  )

  mkdir -p "$(dirname "$shortcuts_path")"
  if [[ -f "$shortcuts_path" ]]; then
    magic=$(head -c 2 "$shortcuts_path" | xxd -p 2>/dev/null || echo "")
    if [[ "$magic" == "0001" ]]; then
      warn "shortcuts.vdf is Steam binary format — skipping text shortcut write"
      warn "Launch NexusDeck with: flatpak run ${APP_ID}"
      return 0
    fi
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

install_steam_input_layout() {
  local steam_path="$1"
  local display_name="$2"
  local app_id="$3"
  local template_name="nexusdeck_controller_config.vdf"
  local template_dir="${steam_path}/controller_base/templates"
  local template_path="${template_dir}/${template_name}"
  local template_url="https://raw.githubusercontent.com/${GITHUB_REPO}/overhaul/nexusdeck/src-tauri/resources/steam-input/${template_name}"

  mkdir -p "$template_dir"
  if ! curl -fsSL "$template_url" -o "$template_path" 2>/dev/null; then
    warn "Could not download Steam Input template — install from Settings → Add to Steam in NexusDeck"
    return 0
  fi
  ok "Installed Steam Input template for NexusDeck"

  local userdata steam_user_id configset_path
  userdata="$(find_steam_userdata "$steam_path")" || return 0
  steam_user_id="$(basename "$userdata")"
  configset_path="${steam_path}/steamapps/common/Steam Controller Configs/${steam_user_id}/config/configset_controller_neptune.vdf"
  mkdir -p "$(dirname "$configset_path")"

  python3 - "$configset_path" "$display_name" "$app_id" "$template_name" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lookup_name = sys.argv[2].strip().lower()
app_id_key = sys.argv[3]
template = sys.argv[4]

def merge_key(content: str, key: str) -> str:
    needle = f'"{key}"'
    if needle in content:
        return content
    block = f'"{key}"\n\t{{\n\t\t"template"\t\t"{template}"\n\t}}\n'
    if '"configset"' in content:
        pos = content.rfind("}")
        if pos >= 0:
            return content[:pos] + block + content[pos:]
        return content + block
    return f'"configset"\n{{\n{block}}}\n'

if path.is_file():
    text = path.read_text(encoding="utf-8", errors="replace")
else:
    text = ""

text = merge_key(text, lookup_name)
if lookup_name != app_id_key:
    text = merge_key(text, app_id_key)
path.write_text(text, encoding="utf-8")
PY

  ok "Linked NexusDeck Steam Input layout (Gaming Mode → Controller settings if needed)"
}

print_header() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   NexusDeck Flatpak Setup (SteamOS)  ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
  echo
}

main() {
  print_header

  if is_steam_deck; then
    ok "Steam Deck / SteamOS detected"
  else
    warn "Steam Deck not detected — Flatpak install still works on other Linux systems"
  fi

  require_cmd python3
  ensure_flatpak

  echo
  info "This installer will:"
  echo "  1. Download (or copy) the NexusDeck Flatpak bundle"
  echo "  2. Install ${APP_ID} for your user"
  echo "  3. Register nxm:// mod links"
  echo "  4. Remove any legacy AppImage install"
  echo "  5. Optionally add NexusDeck to your Steam library"
  echo "  6. Launch NexusDeck for first-time setup"
  echo

  prompt_yes_no "Continue with installation?" y || exit 0

  local bundle_path=""
  if [[ -n "${NEXUSDECK_FLATPAK_PATH:-}" ]]; then
    [[ -f "$NEXUSDECK_FLATPAK_PATH" ]] || fail "Local Flatpak not found: $NEXUSDECK_FLATPAK_PATH"
    bundle_path="$NEXUSDECK_FLATPAK_PATH"
    ok "Using local bundle: ${bundle_path}"
  else
    bundle_path="$(download_latest_flatpak)"
  fi

  [[ -n "$bundle_path" ]] || fail "Could not resolve Flatpak bundle path after download."

  install_flatpak "$bundle_path"
  register_nxm_handler
  remove_legacy_appimage

  local steam_path=""
  if [[ "${NEXUSDECK_NO_STEAM:-0}" != "1" ]] && steam_path="$(find_steam_path)"; then
    ok "Steam found at ${steam_path}"
    echo
    if prompt_yes_no "Add NexusDeck to Steam library for Gaming Mode?" y; then
      local flatpak_exe="/usr/bin/flatpak"
      [[ -x "$flatpak_exe" ]] || flatpak_exe="flatpak"
      add_to_steam_shortcuts "$steam_path" "$APP_NAME" "$flatpak_exe" "$HOME" "run ${APP_ID}"
      app_id="$(generate_shortcut_app_id "$APP_NAME" "$flatpak_exe")"
      install_steam_input_layout "$steam_path" "$APP_NAME" "$app_id"
      warn "Restart Steam for the shortcut to appear"
      warn "Do not enable Proton on the NexusDeck shortcut — it is a native Linux app"
    fi
  else
    warn "Steam not found — skip Steam library step or add later from Settings"
  fi

  echo
  ok "Installation complete!"
  echo
  echo -e "${BOLD}Launch:${NC} ${FLATPAK_CMD}"
  echo
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Launch NexusDeck (command above or Steam shortcut)"
  echo "  2. Enter your Nexus Mods API key"
  echo "  3. Run the Fallout 4 setup wizard"
  echo
  echo "  API key: https://www.nexusmods.com/users/myaccount?tab=api+access"
  echo
  echo -e "${BOLD}To uninstall later:${NC}"
  echo "  curl -fsSL https://enderappsrepo.github.io/NexusDeck/u.sh | bash"
  echo "  (Steam's Uninstall button does not work for non-Steam shortcuts.)"
  echo

  if prompt_yes_no "Launch NexusDeck now for setup?" y; then
    info "Starting NexusDeck..."
    nohup $FLATPAK_CMD >/dev/null 2>&1 &
    ok "NexusDeck launched — complete the in-app setup wizard"
  fi
}

main "$@"
