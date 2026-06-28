# NexusDeck

A lightweight, controller-friendly Nexus Mods client for **Steam Deck** and **Windows**, with **DeckModFix** automation for Skyrim SE modding.

NexusDeck lets you browse, download, and install mods with a console-like UI optimized for handheld PCs. **Skyrim Special Edition** and **Fallout 4** are fully supported with DeckModFix troubleshooting, Proton automation, and MO2 integration.

## Features

### Core
- Cross-platform: Windows (NSIS + portable) and Linux (Flatpak for Steam Deck / SteamOS)
- Controller & gamepad navigation (D-pad, A/B, L1/R1 tabs, shoulder buttons)
- Nexus Mods API integration (GraphQL v2 browse + REST v1 downloads)
- Secure API key storage via OS keyring
- Steam library auto-detection (`libraryfolders.vdf`)
- Fallout 4 Setup Wizard (path, staging, F4SE, profile, test deploy)
- **Skyrim SE DeckModFix** — extended setup (Proton prefix, protontricks, SKSE, MO2 vs direct)
- **Troubleshoot hub** — diagnostic scan, one-click safe fixes, Markdown export
- **MO2 integration** — rockerbacon Linux installer wrapper + instance paths
- Skyrim SE Deck INI presets (Lite / Balanced / Quality)
- Advanced mod search with category, tag, trending, and endorsement filters
- Download queue with resume, cancel, retry, concurrency limit, and speed cap
- Auto-install prompt after download completes
- Basic install/deploy to game Data folder with conflict preview
- Installed mod library with enable/disable, compare, and update detection
- NXM protocol handler (`nxm://` links)
- Profile backup/restore and diagnostics export

### Advanced
- **Mod Comparison** — side-by-side overlap and conflict matrix
- **Dependency Resolver** — visual graph + queue missing requirements
- **Mod Previewer** — archive file tree + PNG/JPG texture preview
- **Collections Installer** — browse and batch-download Nexus Collections
- **Auto-Update** — safe backup before patching installed mods
- **Endorsement & Tracking** — endorse/abstain and track mods in-app
- **Deck Performance Advisor** — FO4-specific Proton/VRAM guidance
- **Modlist Export** — LOOT, Mod Organizer 2, Vortex JSON, Markdown
- **Community Hub Lite** — comment links and issue reporting
- **Battery Mode** — reduced concurrency and animations on Deck

## Prerequisites

### All platforms
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Linux / Steam Deck
- **Flatpak** is the only supported Linux install (bundles WebKitGTK for SteamOS)
- For local Flatpak builds: `flatpak`, `flatpak-builder`, Flathub remote
- **DeckModFix host tools** (not bundled in Flatpak): `protontricks` or Flatpak `com.github.Matoking.protontricks`, `git` (MO2 installer)

## Development

```bash
cd nexusdeck
npm install
npm run tauri dev
```

## Build

### Windows
```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/ and portable exe
```

### Linux (Flatpak — Steam Deck recommended)
```bash
npm run tauri build -- --no-bundle
# CI packages src-tauri/target/release/nexusdeck into a Flatpak bundle
flatpak-builder --force-clean build-dir flatpak/com.nexusdeck.app.yml
```

## Steam Deck Install

**Recommended — graphical installer** (Desktop Mode → Konsole):

```bash
curl -fsSL https://YOUR_USER.github.io/NexusDeck/i.sh -o install.sh
bash install.sh --gui
```

This opens a setup wizard in your browser with progress steps, install options, and a one-click finish.

**One-line terminal install** (after GitHub Pages is enabled — see below):

```bash
curl -fsSL https://YOUR_USER.github.io/NexusDeck/i.sh | bash
```

Or force the GUI from a pipe:

```bash
curl -fsSL https://YOUR_USER.github.io/NexusDeck/i.sh | NEXUSDECK_GUI=1 bash
```

Run `npm run install:url` to print your exact URLs after the repo is on GitHub.

**Release download** (works immediately after first release, no Pages needed):

```bash
curl -fsSL https://github.com/YOUR_USER/NexusDeck/releases/latest/download/i.sh | bash
```

**Enable the short URL** (one-time): GitHub repo → **Settings → Pages → Build from branch `main` / folder `/docs`**, or push to `main` and let the **Pages** workflow deploy automatically.

The installer will:
1. Download the latest NexusDeck Flatpak bundle
2. Install `com.nexusdeck.app` for your user
3. Register `nxm://` mod links
4. Remove any legacy AppImage install
5. Optionally add NexusDeck to your Steam library for Gaming Mode
6. Launch the app for first-time setup (API key + game wizard)

**Optional custom domain** (shortest): add `docs/CNAME` with e.g. `get.nexusdeck.app`, point DNS at GitHub Pages, then:

```bash
curl -fsSL https://get.nexusdeck.app/i.sh | bash
```

**Local install** (if you built the Flatpak yourself):

```bash
NEXUSDECK_FLATPAK_PATH=/path/to/NexusDeck_0.3.0.flatpak ./install-steamdeck.sh
```

**Override GitHub repo** (forks / pre-release):

```bash
NEXUSDECK_GITHUB_REPO=your-org/NexusDeck ./install-steamdeck.sh
```

**Uninstall:**

```bash
curl -fsSL https://YOUR_USER.github.io/NexusDeck/u.sh | bash
```

Release asset alternative: `https://github.com/YOUR_USER/NexusDeck/releases/latest/download/u.sh`

After install, complete the in-app setup wizard to connect your Nexus API key and configure Fallout 4.

## Releasing to GitHub

### One-time setup

1. Install [GitHub CLI](https://cli.github.com/) and run `gh auth login`
2. Create the remote repo and push:

```bash
npm run setup:github
```

Or manually:

```bash
gh repo create NexusDeck --public --source=. --remote=origin --push
```

### Automatic releases

Every version tag triggers the **Release** workflow, which builds Linux Flatpak + Windows installers and publishes them to GitHub Releases.

**From your machine (recommended):**

```bash
npm run release 0.3.0
```

This will:
1. Sync version in `package.json`, `tauri.conf.json`, and `Cargo.toml`
2. Commit, tag `v0.3.0`, and push to GitHub
3. Trigger CI to build and upload:
   - `NexusDeck_0.3.0.flatpak`
   - `NexusDeck_0.3.0_windows-setup.exe`
   - `NexusDeck_0.3.0_windows-portable.exe`
   - `install-steamdeck.sh` / `i.sh` and `uninstall-steamdeck.sh` / `u.sh`
   - `SHA256SUMS.txt`

**From GitHub UI (no local tag):**

Go to **Actions → Release → Run workflow**, enter a version (e.g. `0.1.0`), and run.

**Manual tag:**

```bash
git tag v0.1.0
git push origin v0.1.0
```

### CI on every push

The **CI** workflow builds Linux Flatpak and Windows NSIS on every push/PR to `main`, `master`, or `overhaul` to catch breakages before release.

## First Launch

1. Enter your [Nexus Mods API key](https://www.nexusmods.com/users/myaccount?tab=api+access)
2. NexusDeck auto-detects Steam and Fallout 4 if installed
3. Run the Setup Wizard for Fallout 4
4. Browse mods from the game dashboard

## Usage Guide

### Mod Browser
- Use **category chips** and **tag filters** to narrow results
- Sort by endorsements, downloads, recently updated, or trending
- Tap a mod for detail, dependencies, endorse/track, and download

### Download Queue
- Open the queue panel at the bottom of the screen
- **Cancel** or **Retry** individual downloads
- Configure max concurrent downloads and speed limit in **Settings**
- Downloads resume automatically after app restart (`.nexusdeck.part` files)

### Library
- Enable/disable mods, check for updates, export modlist
- Select two mods and tap **Compare** for overlap analysis
- Use **Backup & Update** when a new version is available

### Collections
- Browse collections from the game dashboard
- Preview bundle contents before batch download

### Controller
- **D-pad / Left stick** — navigate focusable elements
- **A** — activate / click
- **B** — go back
- **X** — secondary action (toggle mod, browse, quick launch)
- **Y** — context menu / endorse / quick launch
- **L1/R1** — switch tabs (dashboard, mod detail, discover, sidebar)
- **L2/R2** — scroll lists / gallery / reorder load order in library
- **Menu** — search focus or command palette
- **View** — toggle controller hint bar

See [docs/steam-input.md](docs/steam-input.md) for the full Steam Input profile.

## Steam Deck Tips

- **Flatpak** is required on SteamOS — run `flatpak run com.nexusdeck.app` or use the Steam shortcut from the installer
- If mod install fails with “read-only file system”, reinstall the Flatpak (v0.3.2+) so SD card libraries are writable
- Enable **Battery Mode** in Settings to limit download concurrency
- In Desktop Mode, Steam Input may intercept controllers — launch from Gaming Mode or disable Steam Input for NexusDeck
- Add NexusDeck as a non-Steam game for Gaming Mode access
- Review **Deck Advisor** warnings before heavy texture overhauls

## Manual Verification Checklist

1. **Filters** — Apply a category filter; result count updates
2. **Download queue** — Queue 3 downloads; only 2 run concurrently
3. **Resume** — Kill app mid-download; relaunch and confirm progress continues
4. **Compare** — Compare two installed mods; overlap list appears
5. **Dependencies** — Open mod with requirements; queue missing deps
6. **Collections** — Open a collection; batch download enqueues
7. **Updates** — Library shows update badge when mod has new version
8. **Endorse** — Endorse a mod from detail page
9. **Export** — Export modlist as LOOT format from library
10. **Controller-only** — Run `npx tsx scripts/controller-e2e-checklist.ts` and verify each item without mouse

## API Compliance

NexusDeck sends required headers on every request:
- `Application-Name: NexusDeck`
- `Application-Version: {version}`
- `apikey: {user key}`

Client-side throttling respects Nexus rate limits. **Register with Nexus Mods support** before public release ([Acceptable Use Policy](https://help.nexusmods.com/article/114-api-acceptable-use-policy)).

## Architecture

```
React/TypeScript UI  →  Tauri IPC  →  Rust services
                                      ├── NexusClient (GraphQL + REST)
                                      ├── DownloadManager (queue, resume)
                                      ├── DependencyResolver
                                      ├── Compare / Preview / Collections
                                      ├── DeckAdvisor (FO4 rules)
                                      ├── GamePlugin registry (FO4)
                                      ├── SQLite (profiles, mods, downloads)
                                      └── keyring (API key)
```

## Project Structure

- `src/` — React frontend (routes, stores, components)
- `src-tauri/src/` — Rust backend (commands, services, games)
- `src-tauri/src/games/rules/` — per-game Deck advisor rules
- `flatpak/` — Flatpak manifest, desktop entry, and AppStream metadata
- `.github/workflows/` — CI build pipelines

## License

MIT
