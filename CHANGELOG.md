# Changelog

All notable changes to NexusDeck are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.30] - 2026-06-28

### Added
- **Mod browse views** — coverflow carousel and paged grid on the mods index for faster Deck scanning.

### Changed
- **Graphical installer UI** — install presets (Full Deck / Desktop / Update), grouped options, local Flatpak path, nxm:// and legacy cleanup toggles, live install summary, system status chips, and dynamic done checklist.
- **Mod Details** — layout and focus navigation refinements for Deck.

## [1.1.29] - 2026-06-28

### Fixed
- **Installer bootstrap** — `install-common.sh` download no longer points at missing `main` branch; tries release asset, GitHub Pages, then `overhaul`/`main`.
- Steam Input template URL in install script uses `overhaul` branch (matches default repo branch).

## [1.1.28] - 2026-06-28

### Added
- **Graphical installer** — Desktop Mode setup wizard (`bash install.sh --gui`) with progress steps, install options, and NexusDeck-themed UI.
- **Safe Steam shortcuts** — binary `shortcuts.vdf` read/write via `steam_shortcuts_util` (CRC32 app IDs, backup before write, surgical removal).
- **Repair Steam shortcuts** — Settings action to restore corrupted shortcuts from backup.
- **Mod Details (Deck)** — single-column layout, fixed Install bar, large touch targets, `A: Install` gamepad hint, L2/R2 gallery.
- **Deck Action Bar** — context actions above bottom nav in Gaming Mode.
- **Game Hub (Deck)** — single-scroll dashboard replacing multi-tab layout on compact screens.
- **Virtual mod browse** — virtualized list and shelf carousels; `A` quick-install, `X` download on browse.
- **Essential fixes panel** — one-tap orchestrated fixes for Fallout 4 / Skyrim setup.
- **Launch handoff** — hide window + gamescope focus release on game launch; restore on exit.
- **Suspend/resume** — pause downloads on sleep, WAL checkpoint, WebView reload after resume.

### Changed
- **Add to Steam panel** — Install controller template and Repair shortcuts buttons; clearer copy.
- **Steam Input** — `A: Install` hint on mod detail; template linked with standard app ID algorithm.
- **Install scripts** — shared `install-common.sh`; release bundles GUI assets alongside `i.sh`.

### Fixed
- **Collection install duplicates** — dedupe by mod id; skip mods already downloading or queued.
- **Add to Steam corruption** — no more text append into binary VDF; errors propagate instead of silent failure.
- Per-game shortcut app ID now matches the executable written to `shortcuts.vdf`.

## [1.1.27] - 2026-06-26

### Added
- **D-pad hold-to-repeat** — holding the D-pad scrolls through long lists and grids (matches stick auto-repeat).
- **Library Tools panel** — load-order sort, repair, compare, export, and diagnostics live in a collapsible Tools section so the mod list starts higher on Deck.
- **FOMOD step visibility** — install wizards now honor `<visible>` flag dependencies (e.g. clean vs dirty skin follow-up steps only show when relevant).

### Changed
- **Gamepad focus navigation** — band-aligned picking stops the focus ring from jumping diagonally when moving up/down or left/right.
- **Gamepad pad selection** — prefers whichever connected pad has input (fixes missed presses when Steam enumerates multiple controllers).
- **Mod install dialog** — Cancel / Back / Install pinned to a sticky footer on short screens.
- **Install queue panel** — no longer duplicates the job currently open in the install dialog.
- **Load order page** — compact header copy on Deck / touch layouts.
- **Touch density** — smaller page titles and tighter vertical rhythm on Deck and coarse-pointer devices.

### Fixed
- FOMOD caches invalidated (`.v2`) so step visibility fixes apply to previously cached wizards.

## [1.1.26] - 2026-06-26

### Added
- **Author filter** — browse mods by author from the filter dialog or mod detail page (“More mods by …”).
- **Filter dialogs** — full filter panel and search open in dialogs on Deck / narrow screens.
- **Quick filter chips** — Popular, Recent, and Hide adult one-tap presets.
- **Active filter pills** — removable chips for every active search/filter.

### Changed
- **Mod browser layout** — slim action row replaces the large sticky toolbar; controls scroll away with the page.
- **Results header** — moved above browse controls so the mod list starts sooner.

## [1.1.25] - 2026-06-26

### Added
- **Settings: Install Steam Input template** — re-apply the bundled controller layout from Settings.
- **Mirrored-key suppression** — blocks duplicate navigation when Steam Input mirrors gamepad as keyboard.

### Changed
- **Steam Input VDF** — fixed preset and physical D-pad group bindings.
- **Steam Input install** — writes to all Steam roots; host sync via Flatpak spawn.
- **Touch targets** — larger tap areas on Deck (`data-touch`).

### Fixed
- Mod search toolbar no longer uses sticky positioning (initial pass).

## [1.1.24] - 2026-06-26

### Added
- **Collapsible mod search** — search collapses to a chip on Deck / narrow viewports.
- **Bundled Steam Input** — NexusDeck controller config shipped with the app.
- **Compact mod list rows** — one mod per row on Deck.

## [1.1.23] - 2026-06-26

### Fixed
- **Fallout 4 launch** — route through Steam instead of direct Proton on Deck.

## [1.1.22] - 2026-06-26

### Added
- **Gaming Mode launch** — improved Steam launch path on Deck.
- **Auto gamepad INI** — applies controller-friendly INI presets on setup.

### Fixed
- Proton prefix auto-heal and hardened dependency install.

[1.1.29]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.28...v1.1.29
[1.1.28]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.27...v1.1.28
[1.1.27]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.26...v1.1.27
[1.1.26]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.25...v1.1.26
[1.1.25]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.24...v1.1.25
[1.1.24]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.23...v1.1.24
[1.1.23]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.21...v1.1.22
