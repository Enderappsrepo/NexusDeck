# Changelog

All notable changes to NexusDeck are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[1.1.27]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.26...v1.1.27
[1.1.26]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.25...v1.1.26
[1.1.25]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.24...v1.1.25
[1.1.24]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.23...v1.1.24
[1.1.23]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.21...v1.1.22
