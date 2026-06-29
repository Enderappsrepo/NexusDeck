# Changelog

All notable changes to NexusDeck are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.37] - 2026-06-29

### Added
- **Companion PWA** — web manifest, service worker, and install-to-home-screen prompt.
- **LAN device discovery** — scan network from the companion without typing an IP; QR scan and auto-detect when opened at `http://device:8731/app/`.
- **Full companion browse** — discovery shelves (featured, endorsed, trending, etc.) via `/browse/discovery`.
- **Companion library** — remote enable/disable and uninstall via `/library/*` API.
- **Game essentials** — one-click essential mod setup for Skyrim SE and Fallout 4 (app + companion card).
- **GitHub Pages landing** — redesigned install page with feature overview and companion link.

### Changed
- **README** — full rewrite with quick install, companion section, architecture, and usage tables.
- **Remote receiver `/ping`** — exposes `lan_hosts`, `companion_urls`, and `companion_api` version.
- **Settings → Receive** — shows companion URLs for phone pairing.
- **Install GUI** — relative asset paths for GitHub Pages subdirectory hosting.

### Fixed
- **Pages sync script** — no longer overwrites hand-maintained `docs/index.html` landing page.
- **Companion browse fallback** — graceful degradation when receiver lacks discovery API.

## [1.1.36] - 2026-06-29

### Fixed
- **Flatpak CI verify step** — companion-web tarball check accepts `./index.html` paths from `tar`.

## [1.1.35] - 2026-06-29

### Fixed
- **Flatpak release build** — bundle companion web as `companion-web.tar.gz` so `/app/` static files install correctly on Steam Deck.

## [1.1.34] - 2026-06-29

### Added
- **Companion mod browser** — Featured + Latest shelves, mod detail with file picker, and full install flow at `http://<device-ip>:8731/app/` (bundled in Flatpak/Linux builds).
- **Remote install sessions** — Deck downloads on-device, runs FOMOD/options wizard, then installs after phone confirmation via `/install/session/`.
- **Download progress on phone** — install session exposes bytes done/total, percent, and ETA while the Deck download runs.
- **Pull to refresh** — pull down on browse shelves to reload Featured and Latest.
- **Remember last game** — companion restores your last selected game from local storage.
- **Haptic feedback** — short vibration on successful send and install complete (Android).

### Changed
- **Creation Club companion UI** — dark + gold theme, hero mod detail, horizontal Featured shelf, stacked Latest tiles.
- **Browse API on receiver** — `/games/list`, `/browse/trending`, `/browse/latest`, `/mods/detail`, deck-proxied search/files.

### Fixed
- **Triple file display** — dedupe mod files by ID; group main vs optional downloads.
- **Companion white page on Deck** — Flatpak and release builds bundle `companion-web` under `/app/share/nexusdeck/`.
- **Mod browse stale results** — clear mods list while loading a new search/filter.

## [1.1.33] - 2026-06-29

### Added
- **On-network companion** — open `http://<device-ip>:8731/app/` on your phone (same Wi‑Fi) to avoid GitHub Pages HTTPS connection issues.
- **Deck-proxied Nexus search** — after pairing, the companion searches and sends mods using the Nexus API key already saved on your Deck/PC; no key required on the phone.

### Changed
- **Companion UI overhaul** — 3-step connect/pair/send flow, clearer IP help, 15s connection timeout, and optional phone-side API key fallback.

## [1.1.32] - 2026-06-29

### Added
- **Mobile companion web app** — static sender at GitHub Pages `/companion/` and `NexusDeck_*_companion_web.zip` on releases; pair from your phone and queue Nexus installs on the Deck.
- **Install by Nexus ID** — remote sender can tell the Deck to download + install without uploading archives.
- **In-app companion mode** — `/companion` route in the desktop/Deck app for the same sender flow.

### Fixed
- **Remote receiver toggle** — turning Receive off/on no longer leaves ports in use.

## [1.1.31] - 2026-06-29

### Added
- **PC→Deck remote install** — pair over Wi-Fi (UDP discovery + manual IP fallback), then push mods, BodySlide presets, and load order from the PC to a paired Deck.
- **Send to Deck** actions on mod detail, library, load order, and BodySlide panels (PC side, after pairing in Settings).

### Fixed
- **Windows console flashing** — subprocess spawns (7-Zip, Steam launch, taskkill) use `CREATE_NO_WINDOW` so the PC app no longer opens command prompts constantly.

### Changed
- Mod browse coverflow/grid polish, mod detail Send-to-Deck bar, and browse position persistence refinements.

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
