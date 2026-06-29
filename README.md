# NexusDeck

**A controller-friendly Nexus Mods client for Steam Deck, SteamOS, and Windows.**

Browse, download, install, and manage mods with a handheld-first UI, DeckModFix automation for Skyrim SE and Fallout 4, and a phone companion for remote installs.

| | |
|---|---|
| **Website** | [enderappsrepo.github.io/NexusDeck](https://enderappsrepo.github.io/NexusDeck/) |
| **Companion** | [enderappsrepo.github.io/NexusDeck/companion/](https://enderappsrepo.github.io/NexusDeck/companion/) |
| **Releases** | [github.com/Enderappsrepo/NexusDeck/releases](https://github.com/Enderappsrepo/NexusDeck/releases) |
| **License** | MIT |

---

## Why NexusDeck?

Most mod managers assume a mouse, keyboard, and full desktop. NexusDeck is built for **Gaming Mode**, **Proton**, and **small screens**:

- Navigate the entire app with a gamepad (D-pad tabs, shoulder shortcuts, focus rings).
- Run guided setup for Skyrim SE and Fallout 4 — Proton deps, script extenders, MO2 paths, INI presets.
- Queue Nexus downloads with resume, FOMOD installers, conflict preview, and a full installed-mod library.
- Pair your phone on the same Wi‑Fi and push installs from the **Companion** web app.

Supported games today: **Skyrim Special Edition** and **Fallout 4** (with game-specific DeckModFix tooling). The Nexus catalog browser works for other games when you add a profile.

---

## Quick install

### Steam Deck / Linux (Flatpak)

**Recommended — graphical installer** (Desktop Mode → Konsole):

```bash
curl -fsSL https://enderappsrepo.github.io/NexusDeck/i.sh -o install.sh
bash install.sh --gui
```

Or open the [setup wizard](https://enderappsrepo.github.io/NexusDeck/gui/) in your browser.

**One-line terminal install:**

```bash
curl -fsSL https://enderappsrepo.github.io/NexusDeck/i.sh | bash
```

**Direct from GitHub Releases** (works before GitHub Pages is enabled):

```bash
curl -fsSL https://github.com/Enderappsrepo/NexusDeck/releases/latest/download/i.sh | bash
```

The installer downloads the latest Flatpak, installs `com.nexusdeck.app`, registers `nxm://` mod links, removes legacy AppImage installs, and can add a Steam shortcut plus controller template.

<details>
<summary><strong>Install options &amp; overrides</strong></summary>

Force the GUI from a pipe:

```bash
curl -fsSL https://enderappsrepo.github.io/NexusDeck/i.sh | NEXUSDECK_GUI=1 bash
```

Local Flatpak bundle:

```bash
NEXUSDECK_FLATPAK_PATH=/path/to/NexusDeck.flatpak ./install-steamdeck.sh
```

Fork or pre-release repo:

```bash
NEXUSDECK_GITHUB_REPO=your-org/NexusDeck ./install-steamdeck.sh
```

Print your fork’s install URLs after pushing to GitHub:

```bash
npm run install:url
```

</details>

### Windows

Download **NSIS installer** or **portable exe** from [Releases](https://github.com/Enderappsrepo/NexusDeck/releases/latest).

Build locally:

```bash
npm install
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/ and portable exe
```

### Uninstall (Steam Deck / Linux)

```bash
curl -fsSL https://enderappsrepo.github.io/NexusDeck/u.sh | bash
```

Release asset: `https://github.com/Enderappsrepo/NexusDeck/releases/latest/download/u.sh`

---

## First launch

1. **Nexus API key** — [Generate one](https://www.nexusmods.com/users/myaccount?tab=api+access) and paste it in Settings. Stored in the OS keyring.
2. **Add your game** — Run the setup wizard (paths, staging folder, script extender, profile).
3. **Browse & install** — Discover mods from the game dashboard or search with filters.
4. **Optional: Remote** — Turn on **Receive** in Settings to pair the [Companion app](https://enderappsrepo.github.io/NexusDeck/companion/) or send mods from another PC on the same network.

Launch from Gaming Mode after install (restart Steam once if you added the shortcut during setup):

```bash
flatpak run com.nexusdeck.app
```

---

## NexusDeck Companion

A installable **Progressive Web App** for your phone — browse Nexus like Creation Club, queue installs on your Deck/PC, and manage your library remotely.

| Feature | Details |
|---------|---------|
| **Browse** | Featured shelves, trending, search, mod detail + file picker |
| **Install** | Full remote session: download on device → FOMOD wizard → confirm from phone |
| **Library** | Enable/disable and uninstall installed mods |
| **Pairing** | Scan your network (no IP typing), QR code, or open `http://DEVICE_IP:8731/app/` |

**Launch:** [companion/](https://enderappsrepo.github.io/NexusDeck/companion/) · **Best on-device URL:** `http://YOUR_PC_OR_DECK_IP:8731/app/` (same Wi‑Fi, Receive enabled)

Source lives in `companion-web/` and ships inside Flatpak/release builds.

---

## Features

### Modding workflow

- Nexus Mods **GraphQL browse** + **REST downloads** with rate-limit aware throttling
- Category, tag, trending, and endorsement filters; collections batch download
- Download queue — resume, cancel, retry, concurrency limit, speed cap, battery mode
- FOMOD / install options, deploy to game `Data/`, conflict preview
- Installed library — enable/disable, updates, compare, load order, modlist export (LOOT, MO2, Vortex, Markdown)
- Dependency resolver, mod previewer (archive tree + textures), auto-update with backup
- Endorse & track mods in-app · `nxm://` protocol handler

### Steam Deck & Proton

- **DeckModFix** — diagnostic scan, one-click safe fixes, Markdown export
- **Skyrim SE** — Proton prefix, protontricks, SKSE, MO2 vs direct deploy, Deck INI presets (Lite / Balanced / Quality)
- **Fallout 4** — setup wizard, F4SE, Deck performance advisor
- **MO2 integration** — Linux installer wrapper + instance paths
- Steam library auto-detection · Flatpak-only Linux install (bundled WebKitGTK)

### Remote & companion

- UDP LAN discovery + HTTP pairing on port **8731**
- PC → Deck: push mods, BodySlide presets, load order
- Phone companion API: browse, install sessions, library management

### Input

- Full gamepad navigation — see [Controller](#controller) and [docs/steam-input.md](docs/steam-input.md)
- Command palette, gamepad router contexts, endorse/quick actions on focused mods

---

## Usage

### Mod browser

Use **category chips** and **tags** to narrow results. Sort by endorsements, downloads, created date, or trending. Open a mod for detail, dependencies, endorse/track, and download. Switch between **coverflow** and **grid** browse on the mods index.

### Download queue

Open the queue panel at the bottom of the screen. Cancel or retry individual jobs. Configure concurrency and speed in **Settings**. Downloads resume after restart via `.nexusdeck.part` files.

### Library

Enable or disable mods, check for updates, compare two mods for file overlap, export load order, and run **Backup & Update** when a new file version is available.

### Collections

Browse Nexus Collections from the game dashboard and batch-enqueue downloads after previewing bundle contents.

### Remote install

On the **receiver** (Deck/PC): Settings → **Receive** → note pairing code and companion URL.

On the **sender** (PC or phone): pair, pick a mod, send install. The receiver downloads via your saved Nexus API key and runs the install pipeline locally.

---

## Controller

| Input | Action |
|-------|--------|
| **D-pad / left stick** | Move focus |
| **A** | Activate / confirm |
| **B** | Back |
| **X** | Secondary (toggle mod, browse action, quick launch) |
| **Y** | Context / endorse / quick launch |
| **L1 / R1** | Switch tabs |
| **L2 / R2** | Scroll lists · reorder load order in library |
| **Menu** | Search focus or command palette |
| **View** | Toggle controller hint bar |

Full Steam Input layout: [docs/steam-input.md](docs/steam-input.md)

---

## Steam Deck tips

- **Flatpak only** on SteamOS — do not use the AppImage; the installer removes legacy installs.
- If deploy fails with “read-only file system”, update to a recent Flatpak build (SD-card library fixes).
- Enable **Battery Mode** in Settings to reduce download concurrency and animations.
- Launch from **Gaming Mode** so Steam Input pass-through works; Desktop Mode may capture the controller.
- Review **Deck Advisor** before heavy texture overhauls (Fallout 4).

---

## Development

### Prerequisites

**All platforms**

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.77+
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

**Linux / Steam Deck builds**

- `flatpak`, `flatpak-builder`, Flathub remote (for packaging)
- Host tools not in Flatpak: [Protontricks](https://github.com/Matoking/protontricks) (`com.github.Matoking.protontricks` on Flathub), `git` (MO2 installer)

### Run locally

```bash
git clone https://github.com/Enderappsrepo/NexusDeck.git
cd NexusDeck
npm install
npm run tauri dev
```

### Build companion web

```bash
npm run build:companion
# → docs/companion/ (GitHub Pages)
# → src-tauri/resources/companion-web/ (bundled in app)
```

### Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run tauri build` | Production app bundle |
| `npm run build:companion` | Companion PWA static build |
| `npm run install:url` | Print GitHub Pages install URLs for your fork |
| `npm run release <version>` | Bump version, tag, push — triggers release CI |
| `npm run test:e2e` | Playwright tests |
| `npm run test:router` | Gamepad router unit tests |

### Linux Flatpak (local)

```bash
npm run tauri build -- --no-bundle
flatpak-builder --force-clean build-dir flatpak/com.nexusdeck.app.yml
```

---

## Releasing

### One-time GitHub setup

```bash
gh auth login
npm run setup:github
# or: gh repo create NexusDeck --public --source=. --remote=origin --push
```

### Publish a version

```bash
npm run release 1.2.0
```

This syncs version across `package.json`, `tauri.conf.json`, and `Cargo.toml`, tags `v1.2.0`, pushes, and triggers CI to upload:

- `NexusDeck_*_*.flatpak`
- Windows NSIS + portable
- `i.sh` / `u.sh` install scripts
- Companion web zip
- `SHA256SUMS.txt`

**Manual tag:** `git tag v1.2.0 && git push origin v1.2.0`

**GitHub UI:** Actions → Release → Run workflow.

CI also builds on every push/PR to `main`, `master`, and `overhaul`.

### GitHub Pages

Deploys from `/docs` on push (landing page, install scripts, companion). Enable: repo **Settings → Pages → Deploy from branch `main` / folder `/docs`**.

---

## Architecture

```
React / TypeScript UI
        │  Tauri IPC
        ▼
Rust services
├── NexusClient (GraphQL v2 + REST v1)
├── DownloadManager (queue, resume, parts)
├── Install pipeline (FOMOD, deploy, conflicts)
├── DependencyResolver · Compare · Collections
├── DeckAdvisor + game plugins (Skyrim SE, Fallout 4)
├── SQLite (profiles, mods, downloads)
├── keyring (API key)
└── remote_sync (HTTP receiver + companion API on :8731)
```

| Path | Contents |
|------|----------|
| `src/` | React frontend — routes, stores, components |
| `src-tauri/src/` | Rust commands and services |
| `src-tauri/src/games/` | Per-game plugins and Deck rules |
| `companion-web/` | Companion PWA source |
| `docs/` | GitHub Pages — landing, `i.sh`, companion build |
| `install/` | Steam Deck install scripts + GUI wizard |
| `flatpak/` | Flatpak manifest and metadata |
| `.github/workflows/` | CI, release, Pages |

---

## API compliance

Every Nexus request includes:

- `Application-Name: NexusDeck`
- `Application-Version: {version}`
- `apikey: {user key}`

Client-side throttling respects Nexus rate limits. Before a public distribution, **register with Nexus Mods support** per the [API Acceptable Use Policy](https://help.nexusmods.com/article/114-api-acceptable-use-policy).

---

## Verification checklist

Manual smoke tests worth running before a release:

1. Category filter updates result count
2. Queue three downloads — concurrency limit honored
3. Kill app mid-download — resume on relaunch
4. Compare two installed mods — overlap list shown
5. Mod with requirements — queue missing dependencies
6. Collection batch download enqueues
7. Library update badge when Nexus has new file
8. Endorse from mod detail
9. Export modlist as LOOT format
10. Controller-only pass: `npx tsx scripts/controller-e2e-checklist.ts`

---

## License

MIT
