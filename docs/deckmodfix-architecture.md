# DeckModFix Architecture

DeckModFix is a subsystem inside NexusDeck that automates Skyrim SE (and extensible Bethesda game) modding on Steam Deck and Windows.

## Modules

| Module | Path | Role |
|--------|------|------|
| SkyrimSpecialEditionPlugin | `src-tauri/src/games/skyrimspecialedition.rs` | Dedicated game plugin + wizard steps |
| Auto-fix engine | `src-tauri/src/services/autofix/` | Scan, apply remedies, export reports |
| Knowledge base | `src-tauri/src/knowledge/` | JSON remedies per game |
| Proton deps | `src-tauri/src/services/proton_deps.rs` | protontricks wrapper |
| Prefix manager | `src-tauri/src/services/prefix_manager.rs` | Bootstrap, backup, restore |
| MO2 | `src-tauri/src/services/mo2/` | Linux installer + instance config |
| Log parser | `src-tauri/src/services/log_parser.rs` | SKSE / crash log analysis |
| Game manifest | `src-tauri/src/services/game_manifest.rs` | Per-game routing config |

## User flows

1. **Setup wizard** (`/games/skyrimspecialedition/setup`) — Proton prefix, deps, SKSE, mod manager choice
2. **Troubleshoot hub** (`/games/skyrimspecialedition/troubleshoot`) — Scan, fix, export
3. **MO2 panel** (`/games/skyrimspecialedition/mo2`) — Optional MO2 lifecycle

## Safety

- Backups under `{staging}/backups/{timestamp}/` before mutating fixes
- Destructive remedies require explicit user action
- `apply_safe_autofixes` only runs non-destructive remedies

## Host dependencies (Linux / Deck)

- `protontricks` (native or Flatpak `com.github.Matoking.protontricks`)
- `git` (for MO2 Linux installer clone)
- Steam / Flatpak Steam for vanilla bootstrap launch
