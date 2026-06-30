# Changelog

All notable changes to NexusDeck are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2026-06-30

### Added
- **Companion FOMOD images** — install wizard shows module splash and option images via new `GET /install/session/:id/fomod-asset` API (companion API v6).
- **Companion browse shelves** — Rising stars and Community favorites discovery sections; See all on Top rated, Top downloaded, Trending, and Featured.
- **Installed pill in browse** — green Installed badge on mod tiles, hero cards, and list rows for mods already on your device.

### Changed
- **Companion filter sheet** — uses scrollable sheet layout with sticky Apply/Cancel footer so filters scroll properly on mobile.
- **Companion library sync** — installed mod list loads on connect so browse and mod detail show correct installed state without visiting Library first.
- **Top rated label** — Most endorsed shelf renamed to Top rated.

### Fixed
- **Companion install queue on HTTP** — queue add works over `http://DEVICE_IP:8731/app/` (fallback ID when `crypto.randomUUID` is unavailable outside secure contexts).
- **FOMOD selection empty errors** — backend sanitizes default and confirmed selections to drop options with no matching archive files; clearer error message in companion install screen.

## [2.3.0] - 2026-06-30

### Added
- **Companion install queue** — queue mods from browse/mod pages or entire collections; install one at a time on the device with a queue sheet and progress bar.
- **Companion browse filters** — category, tags, endorsements, adult content, recency, and author filters with an active-filter bar and filter sheet.
- **Companion API v5** — paginated shelf browse, library mod reposition/update-all/rescan, and expanded search filter params.
- **Quick install** — straightforward mods (no FOMOD, no conflicts, confident layout) install automatically without stopping on the review screen.
- **Vortex override support** — reads `vortex_override_instructions.json` from mod archives for author-specified install paths (same format as Vortex 1.14+).
- **Address Library auto-detection** — All-in-One `version-*.bin` packs route to `Data/F4SE/Plugins/` (Skyrim → `Data/SKSE/Plugins/`).
- **Main-app install queue nav** — shared install queue content in the app shell with a nav button.

### Changed
- **Companion UI refresh** — updated browse, library, load order, collections, mod detail, and settings screens; service worker cache bumped to v4.
- **Remote install sessions** — companion receives detected deploy plan and quick-install eligibility from the backend.

### Fixed
- **Address Library install path** — no longer mis-detected as game-root install with an “unusual layout” warning.

## [2.2.1] - 2026-06-29

### Added
- **Companion install progress** — unified progress bar across download, extract, and deploy with stage labels, file counts, current file name, and shimmer animation so installs no longer look frozen.
- **Install status on device** — companion connected overlay uses the same multi-phase progress from the backend.
- **Download progress notifications** — companion can notify on download progress when that preference is enabled.

### Fixed
- **Nexus `.bin` downloads** — detect obfuscated `.bin` mod archives by magic bytes, rename to the correct extension, and match them in staging even when the API filename differs.
- **Loose `.bin` mod assets** — `.bin` files inside archives route into `Data/` with other game assets instead of the game root.

## [2.2.0] - 2026-06-29

### Added
- **Companion API v3** — load order state, LOOT sort, plugins.txt sync, download queue, library updates, Nexus Collections browse/install, device settings snapshot, BodySlide path sync, and conflict preview on remote installs.
- **Companion UI overhaul** — tabbed screens with bottom nav (Browse, Library, Load Order, Collections, Settings), download queue bar, conflict preview, and screen-based routing for mod detail and install flows.
- **Companion settings & themes** — appearance presets (NexusDeck, Midnight, Ember, Creation, Light, High contrast), haptics, notifications, compact UI, default game, and device sync actions.
- **Companion load order tab** — mods/plugins view, LOOT issues panel, sort and sync from your phone.
- **Main app appearance settings** — same theme presets in Settings → Appearance.
- **Companion pairing QR** — scan or display QR codes from Settings → Receive and the companion connect screen.
- **Install wizard UI** — refreshed graphical installer styling on GitHub Pages and Desktop Mode setup.

### Fixed
- **Companion toggle mod** — enabling/disabling a mod from the phone now syncs `plugins.txt` on the device.

## [2.1.0] - 2026-06-29

### Added
- **Companion discovery shelves** — featured, most endorsed, most downloaded, trending, newly added, recently updated, and hot-this-week feeds load automatically when you pick a game (no search required).
- **Companion library tab** — view installed mods, enable/disable, reorder load order, and uninstall remotely from your phone.
- **Companion heartbeat** — phone sends keepalive pings so the device knows the connection is live; offline state is shown when the link drops.
- **Companion connected overlay** — NexusDeck shows when a phone is paired, with active install progress and quick launch/manage shortcuts.
- **Install-from-phone gating** — while a companion is connected, device install buttons prompt you to install from the phone instead.

### Fixed
- **F4SE/SKSE loader installs** — archives with loader files at the archive root (plus a bundled `Data/` folder) now deploy with `merge_root` so loader `.exe`/`.dll` files are not dropped when only `Data/` was copied.

## [2.0.0] - 2026-06-29

### Added
- **MCM in one-click essentials** — Mod Configuration Menu included for Skyrim SE and Fallout 4 essentials batches.
- **Rich companion mod detail** — endorsements, downloads, version, category, tags, expandable description, Nexus link, and installed-on-device badge.

### Changed
- **F4SE/SKSE mod detection** — improved archive analysis for script-extender plugin packs, MCM folders, and SKSE/F4SE root loaders.
- **Essentials install flow** — auto-confirms FOMOD wizards (USSEP, SkyUI, MCM, etc.) so the install queue no longer stalls on wizard screens.

### Fixed
- **Install Essentials freeze** — essentials queue jobs with FOMOD installers now auto-install with default selections instead of blocking on the wizard dialog.
- **Setup progress desync** — essentials setup step marks complete reliably after Proton/F4SE fixes finish.

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

[2.2.0]: https://github.com/Enderappsrepo/NexusDeck/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Enderappsrepo/NexusDeck/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.37...v2.0.0
[1.1.37]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.36...v1.1.37
[1.1.29]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.28...v1.1.29
[1.1.28]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.27...v1.1.28
[1.1.27]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.26...v1.1.27
[1.1.26]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.25...v1.1.26
[1.1.25]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.24...v1.1.25
[1.1.24]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.23...v1.1.24
[1.1.23]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/Enderappsrepo/NexusDeck/compare/v1.1.21...v1.1.22
