#!/usr/bin/env bash
# NexusDeck Steam Deck / Linux installer (Flatpak)
# Usage:
#   curl -fsSL .../i.sh -o install.sh && bash install.sh --gui   # graphical (recommended)
#   curl -fsSL .../i.sh | bash                                   # terminal
#   ./install-steamdeck.sh              # auto GUI in Desktop Mode
#   ./install-steamdeck.sh --cli        # force terminal prompts
#   ./install-steamdeck.sh --gui        # force graphical installer

set -euo pipefail

APP_NAME="NexusDeck"
APP_ID="com.nexusdeck.app"
GITHUB_REPO="${NEXUSDECK_GITHUB_REPO:-Enderappsrepo/NexusDeck}"

resolve_script_dir() {
  local src="${BASH_SOURCE[0]}"
  if [[ "$src" == "bash" || "$src" == "/bin/bash" || "$src" == "sh" || "$src" == "/bin/sh" ]]; then
    printf '%s\n' "${NEXUSDECK_INSTALLER_DIR:-}"
    return 0
  fi
  cd "$(dirname "$src")" && pwd
}

bootstrap_installer_files() {
  local dir="$1"
  mkdir -p "${dir}/gui"
  local base="https://raw.githubusercontent.com/${GITHUB_REPO}/main/install"
  if [[ ! -f "${dir}/install-common.sh" ]]; then
    curl -fsSL "${base}/install-common.sh" -o "${dir}/install-common.sh" \
      || { echo "Could not download install-common.sh" >&2; exit 1; }
  fi
  if [[ ! -f "${dir}/gui/server.py" ]]; then
    curl -fsSL "${base}/gui/server.py" -o "${dir}/gui/server.py" || true
    curl -fsSL "${base}/gui/launch-gui.sh" -o "${dir}/gui/launch-gui.sh" || true
    curl -fsSL "${base}/gui/index.html" -o "${dir}/gui/index.html" || true
    curl -fsSL "${base}/gui/styles.css" -o "${dir}/gui/styles.css" || true
    curl -fsSL "${base}/gui/app.js" -o "${dir}/gui/app.js" || true
    chmod +x "${dir}/gui/launch-gui.sh" 2>/dev/null || true
  fi
}

SCRIPT_DIR="$(resolve_script_dir || true)"
if [[ -z "$SCRIPT_DIR" || ! -f "${SCRIPT_DIR}/install-common.sh" ]]; then
  SCRIPT_DIR="${NEXUSDECK_INSTALLER_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/nexusdeck-install-XXXXXX")}"
  export NEXUSDECK_INSTALLER_DIR="$SCRIPT_DIR"
  bootstrap_installer_files "$SCRIPT_DIR"
fi

# shellcheck source=install-common.sh
source "${SCRIPT_DIR}/install-common.sh"

has_gui_support() {
  [[ -f "${SCRIPT_DIR}/gui/server.py" && -f "${SCRIPT_DIR}/gui/launch-gui.sh" ]] || return 1
  [[ -n "${DISPLAY:-${WAYLAND_DISPLAY:-}}" ]] || return 1
  command -v python3 >/dev/null 2>&1
}

should_use_gui() {
  [[ "${NEXUSDECK_CLI:-}" == "1" ]] && return 1
  [[ "${1:-}" == "--cli" ]] && return 1
  [[ "${NEXUSDECK_GUI:-}" == "1" || "${1:-}" == "--gui" ]] && has_gui_support && return 0
  [[ "${BASH_SOURCE[0]}" == "bash" || "${BASH_SOURCE[0]}" == "/bin/bash" ]] && return 1
  [[ -t 0 ]] || return 1
  has_gui_support
}

print_header() {
  echo
  echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   NexusDeck Flatpak Setup (SteamOS)  ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
  echo
}

run_cli_install() {
  print_header

  if is_steam_deck; then
    ok "Steam Deck / SteamOS detected"
  else
    warn "Steam Deck not detected — Flatpak install still works on other Linux systems"
  fi

  if has_gui_support; then
    echo
    info "Tip: run ${BOLD}bash install.sh --gui${NC} for the visual installer"
    echo
  elif [[ -n "${DISPLAY:-${WAYLAND_DISPLAY:-}}" ]]; then
    echo
    info "Tip: ${BOLD}NEXUSDECK_GUI=1 bash install.sh${NC} to download and open the graphical installer"
    echo
  fi

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

  if [[ "${NEXUSDECK_NO_STEAM:-0}" != "1" ]] && find_steam_path >/dev/null 2>&1; then
    if ! prompt_yes_no "Add NexusDeck to Steam library for Gaming Mode?" y; then
      export NEXUSDECK_ADD_STEAM=0
      export NEXUSDECK_ADD_CONTROLLER=0
    fi
  fi

  if ! prompt_yes_no "Launch NexusDeck when finished?" y; then
    export NEXUSDECK_LAUNCH_AFTER=0
  fi

  run_install_pipeline

  echo
  ok "Installation complete!"
  echo
  echo -e "${BOLD}Launch:${NC} ${FLATPAK_CMD}"
  echo
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Launch NexusDeck (command above or Steam shortcut)"
  echo "  2. Enter your Nexus Mods API key"
  echo "  3. Run the game setup wizard"
  echo
  echo "  API key: https://www.nexusmods.com/users/myaccount?tab=api+access"
  echo
  echo -e "${BOLD}To uninstall later:${NC}"
  echo "  curl -fsSL https://enderappsrepo.github.io/NexusDeck/u.sh | bash"
  echo
}

main() {
  case "${1:-}" in
    --run-pipeline)
      run_install_pipeline
      exit 0
      ;;
    --help|-h)
      cat <<EOF
NexusDeck installer

  bash install.sh --gui     Visual installer (Desktop Mode — recommended)
  bash install.sh --cli     Terminal prompts
  curl ... | bash           Terminal install (one-liner)

Environment: NEXUSDECK_FLATPAK_PATH, NEXUSDECK_NO_STEAM, NEXUSDECK_GITHUB_REPO
EOF
      exit 0
      ;;
  esac

  if should_use_gui "${1:-}"; then
    exec bash "${SCRIPT_DIR}/gui/launch-gui.sh"
  fi

  run_cli_install
}

main "$@"
