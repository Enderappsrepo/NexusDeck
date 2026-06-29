/**
 * Permissive Tauri mock for the local design preview (NOT shipped).
 *
 * Installs `window.__TAURI_INTERNALS__` with an `invoke` that returns sensible
 * defaults for every backend command so the real app boots to a usable,
 * signed-in, in-game state in a plain browser. Lets us verify Steam Deck layout
 * / touch / controller-focus work at 1280×800 without a real device.
 */

const now = Date.now();

const user = {
  user_id: 1,
  name: "DeckUser",
  is_premium: true,
  is_supporter: true,
};

const profile = {
  id: "profile-1",
  game_domain: "fallout4",
  name: "Fallout 4",
  game_path: "/home/deck/.steam/steam/steamapps/common/Fallout 4",
  staging_path: "/home/deck/.local/share/nexusdeck/staging/fallout4",
  proton_prefix_path: null,
  mod_manager: null,
  created_at: now,
};

const supportedGames = [
  { domain: "fallout4", display_name: "Fallout 4", script_extender_label: "F4SE" },
  { domain: "skyrimspecialedition", display_name: "Skyrim Special Edition", script_extender_label: "SKSE64" },
];

const gameSummaries = [
  { id: 1151, name: "Fallout 4", domain_name: "fallout4", mod_count: 72000, genre: "RPG" },
  { id: 1704, name: "Skyrim Special Edition", domain_name: "skyrimspecialedition", mod_count: 98000, genre: "RPG" },
  { id: 110, name: "Skyrim", domain_name: "skyrim", mod_count: 68000, genre: "RPG" },
  { id: 130, name: "Fallout New Vegas", domain_name: "newvegas", mod_count: 30000, genre: "RPG" },
];

function mod(id: number, name: string, author: string, summary: string) {
  return {
    mod_id: id,
    name,
    summary,
    picture_url: null,
    author,
    endorsements: 1000 + id * 7,
    mod_downloads: 50000 + id * 137,
    updated_timestamp: Math.floor(now / 1000) - id * 3600,
    version: "1." + (id % 9) + ".0",
    adult_content: false,
  };
}

const mods = [
  mod(1, "Unofficial Fallout 4 Patch", "Arthmoor", "A comprehensive bugfixing mod for Fallout 4."),
  mod(2, "Sim Settlements 2", "kinggath", "Build settlements that build themselves — a full questline."),
  mod(3, "Full Dialogue Interface", "shadwar", "See the full dialogue text before you pick a line."),
  mod(4, "Looks Menu", "Expired", "Extended character creation with overlays and presets."),
  mod(5, "Armor and Weapon Keywords", "Valdacil", "Community resource framework for crafting and sorting."),
  mod(6, "Vivid Fallout - All in One", "Hein84", "High-resolution landscape and architecture textures."),
  mod(7, "Start Me Up", "Twisted", "Alternate start and character customization for the intro."),
  mod(8, "Everyone's Best Friend", "Valdacil", "Use Dogmeat and a human companion at the same time."),
  mod(9, "Mod Configuration Menu", "Neanka", "Adds an MCM settings menu used by many mods."),
  mod(10, "Place Everywhere", "TheLich", "Advanced object placement in workshop mode."),
];

const categories = [
  { category_id: 1, name: "Gameplay" },
  { category_id: 2, name: "Textures" },
  { category_id: 3, name: "Characters" },
  { category_id: 4, name: "Patches" },
  { category_id: 5, name: "User Interface" },
];

function installedMod(i: number, name: string, enabled: boolean, plugins: string[]) {
  return {
    id: "mod-" + i,
    profile_id: profile.id,
    nexus_mod_id: i,
    nexus_file_id: i,
    name,
    version: "1.0",
    enabled,
    sort_order: i,
    installed_files_json: "[]",
    installed_at: now,
    category: "Gameplay",
    plugins_json: JSON.stringify(plugins),
  };
}

const installedMods = [
  installedMod(1, "Unofficial Fallout 4 Patch", true, ["Unofficial Fallout 4 Patch.esp"]),
  installedMod(2, "Sim Settlements 2", true, ["SS2.esm"]),
  installedMod(3, "Full Dialogue Interface", true, []),
  installedMod(4, "Looks Menu", true, ["LooksMenu.esp"]),
  installedMod(5, "Vivid Fallout - All in One", false, []),
  installedMod(6, "Mod Configuration Menu", true, ["MCM.esp"]),
];

const loadOrderState = {
  mods: installedMods.map((m) => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled,
    sort_order: m.sort_order ?? 0,
    plugins: JSON.parse(m.plugins_json ?? "[]"),
  })),
  plugins: [
    { name: "Fallout4.esm", kind: "master", enabled: true, mod_id: null, mod_name: "Base game" },
    { name: "Unofficial Fallout 4 Patch.esp", kind: "esp", enabled: true, mod_id: "mod-1", mod_name: "Unofficial Fallout 4 Patch" },
    { name: "SS2.esm", kind: "esm", enabled: true, mod_id: "mod-2", mod_name: "Sim Settlements 2" },
    { name: "LooksMenu.esp", kind: "esp", enabled: true, mod_id: "mod-4", mod_name: "Looks Menu" },
    { name: "MCM.esp", kind: "esp", enabled: true, mod_id: "mod-6", mod_name: "Mod Configuration Menu" },
  ],
  plugins_txt_path: "/home/deck/plugins.txt",
  plugins_txt_ready: true,
  active_plugin_count: 5,
  message: "Load order looks healthy.",
  loot_issues: [],
};

const INSTALL_PLAN = {
  strategy: "auto",
  source_subpath: null,
  target: "/home/deck/.steam/steam/steamapps/common/Fallout 4/Data",
  requires_confirmation: false,
  description: "Install loose files into the game's Data folder.",
};

const INSTALL_OPTION_GROUPS = [
  {
    id: "g1",
    name: "Texture resolution",
    selection_type: "select_one",
    options: [
      { id: "o1", label: "2K textures", description: "Balanced quality — recommended for Steam Deck.", folder_prefixes: [], default: true },
      { id: "o2", label: "4K textures", description: "Sharper, but heavier on VRAM and storage.", folder_prefixes: [], default: false },
      { id: "o3", label: "1K textures", description: "Best performance and smallest size.", folder_prefixes: [], default: false },
    ],
  },
  {
    id: "g2",
    name: "Optional add-ons",
    selection_type: "select_any",
    options: [
      { id: "e1", label: "Compatibility patch", description: "For users running the Unofficial Patch.", folder_prefixes: [], default: false },
      { id: "e2", label: "Alternate textures", description: "A different visual style.", folder_prefixes: [], default: false },
    ],
  },
];

const INSTALL_PREVIEW = {
  entries: Array.from({ length: 6 }, (_, i) => ({ path: `Data/Textures/tex${i}.dds`, is_dir: false })),
  deploy_files: Array.from({ length: 42 }, (_, i) => `Data/Textures/texture_${i}.dds`),
  plan: INSTALL_PLAN,
  conflicts: [],
  file_count: 42,
  skipped_existing: 0,
  strategies: [
    { id: "auto", label: "Automatic (recommended)", description: "Let NexusDeck pick the best layout." },
    { id: "merge_loose_to_data", label: "Loose files → Data", description: "Copy files straight into Data/." },
  ],
  archive_folders: [],
  option_groups: INSTALL_OPTION_GROUPS,
  default_selections: [{ group_id: "g1", option_ids: ["o1"] }],
  install_wizard_required: false,
  install_wizard: null,
  option_file_counts: {},
};

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  // Mod install flow (lets the preview render ModInstallDialog meaningfully)
  resolve_mod_archive_path: () => ({ path: "/home/deck/staging/test.7z", matched: true }),
  prepare_mod_install: () => ({
    prepared_extract_dir: "/tmp/nd-extract",
    option_groups: INSTALL_OPTION_GROUPS,
    default_selections: [{ group_id: "g1", option_ids: ["o1"] }],
    entry_count: 42,
    archive_folders: [],
    install_wizard: null,
  }),
  preview_mod_install: () => INSTALL_PREVIEW,
  get_install_strategies: () => INSTALL_PREVIEW.strategies,
  install_mod_from_archive: () => ({
    mod: installedMods[1],
    plan: INSTALL_PLAN,
    conflicts: [],
    files_installed: 42,
    files_planned: 42,
    dry_run: false,
    log_path: null,
  }),
  // Auth / boot
  check_has_api_key: () => true,
  load_stored_api_key: () => user,
  validate_and_store_api_key: () => user,
  is_onboarding_complete: () => true,
  get_platform_info: () => ({
    os: "linux",
    is_linux: true,
    is_steam_deck: true,
    is_flatpak: true,
    steamos_version: "3.5",
    app_version: "1.1.26",
  }),
  get_sevenzip_info: () => ({ available: true, source: "bundled", path: "/app/7z", message: "Bundled 7-Zip" }),
  check_app_update: () => ({
    current_version: "1.1.26",
    latest_version: "1.1.26",
    minimum_version: null,
    update_available: false,
    update_required: false,
    message: "Up to date",
    release_url: "",
    release_notes: null,
  }),
  get_app_prefs: () => ({ hardware_acceleration: "on" }),

  // Profiles / games
  list_profiles: () => [profile],
  get_profile: () => profile,
  list_supported_games: () => supportedGames,
  list_nexus_games: () => ({ games: gameSummaries, total_count: gameSummaries.length }),
  detect_steam_install: () => ({ steam_path: "/home/deck/.steam/steam", library_folders: [] }),

  // Mod detail
  get_mod_detail: () => ({
    mod_id: 2,
    name: "Sim Settlements 2",
    summary: "Build settlements that build themselves — a full questline.",
    description_html: "<p>Sim Settlements 2 is a city-building overhaul with a full quest line.</p>",
    author: "kinggath",
    uploader: "kinggath",
    category: "Gameplay",
    endorsements: 52000,
    mod_downloads: 2_100_000,
    updated_timestamp: Math.floor(now / 1000),
    picture_url: null,
    hero_image_url: null,
    tags: ["Gameplay", "Settlements"],
    screenshots: [],
    adult_content: false,
    game_id: 1151,
    game_domain: "fallout4",
    viewer_endorsed: false,
    viewer_tracked: false,
  }),
  get_mod_files: () => [
    { file_id: 1, name: "Sim Settlements 2 Main", file_name: "SS2.7z", version: "2.0", category_name: "Main", is_primary: true, size_kb: 520000 },
  ],

  // Mods / browse
  search_mods: () => mods,
  search_mods_filtered: (_args?: { sort?: string }) => ({ mods, total_count: mods.length }),
  get_trending_mods: () => mods.slice(0, 6),
  list_mod_categories: () => categories,
  get_updated_mods_feed: () => [],

  // Library / load order
  list_installed_mods: () => installedMods,
  get_load_order_state: () => loadOrderState,
  check_profile_updates: () => [],
  analyze_deck_profile: () => [],
  reconcile_mod_library: () => ({ restored: 0, mirrored: installedMods.length, message: "Library in sync." }),
  rescan_library_from_disk: () => ({ mods_added: 0, plugins_found: 5, message: "No new mods found." }),
  refresh_mod_metadata: () => installedMods,
  check_deploy_mode: () => "hardlink",
  get_user_endorsements: () => [],
  list_tracked_mods: () => [],

  // Downloads
  list_downloads: () => [],
  get_download_settings: () => ({
    max_concurrent: 2,
    speed_limit_kbps: 0,
    auto_install_after_download: true,
    pause_on_battery: false,
    bandwidth_saver: false,
  }),

  // Dashboard panels (object-shaped)
  get_body_setup_status: () => ({
    bodyslide_installed: false,
    presets_built: false,
    can_one_click_install: false,
    can_one_click_cbbe: false,
    steps: [],
  }),
  get_sevenzip_status: () => ({ available: true, source: "bundled", path: "/app/7z", message: "" }),
  detect_script_extender: () => ({ installed: true, version: "0.6.23", message: "F4SE installed" }),
  detect_f4se: () => ({ installed: true, version: "0.6.23", message: "F4SE installed" }),

  // Launch
  get_game_running_state: () => ({ running: false }),
  get_launch_settings: () => ({}),
  get_playtime_stats: () => ({}),

  // Remote PC↔Deck (Phase 1 connection)
  get_remote_receiver_status: () => ({ running: false, pair_code: "", http_port: 8731, paired: false }),
  start_remote_receiver: () => ({ running: true, pair_code: "482917", http_port: 8731, paired: false }),
  stop_remote_receiver: () => ({ running: false, pair_code: "", http_port: 8731, paired: false }),
  discover_decks: () => [
    { name: "Steam Deck", host: "192.168.1.42", http_port: 8731, version: "1.1.29" },
  ],
  pair_with_deck: () => "preview-token-abc123",
  ping_deck: () => ({ name: "Steam Deck", host: "192.168.1.42", http_port: 8731, version: "1.1.29" }),
  send_mod_to_deck: () => ({
    ok: true,
    message: "Preview: mod sent to Deck.",
    mod_id: "mod-remote-1",
    files_sent: 1,
  }),
  send_presets_to_deck: () => ({
    ok: true,
    message: "Preview: 12 BodySlide preset files sent to Deck.",
    files_sent: 12,
  }),
  send_load_order_to_deck: () => ({
    ok: true,
    message: "Preview: load order synced to Deck.",
    files_sent: 8,
  }),

  // Tauri event plugin (no-op)
  "plugin:event|listen": () => 1,
  "plugin:event|unlisten": () => undefined,
  "plugin:event|emit": () => undefined,
  "plugin:event|emit_to": () => undefined,
  log_startup_event: () => undefined,
};

// Universal safe default for any un-mocked command: a value that behaves as an
// empty array (.find/.map/.length/iteration all work) AND returns another empty
// array for any property access, so object-shaped reads like `r.conflicts.length`
// or `r.steps.find(...)` never throw. Good enough to render every screen for a
// visual/layout preview; commands whose real shape matters are mocked above.
function emptyResult(): unknown {
  return new Proxy([] as unknown[], {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      return [];
    },
  });
}

function defaultFor(cmd: string): unknown {
  void cmd;
  return emptyResult();
}

export function installPreviewMock() {
  const invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
    const handler = handlers[cmd];
    if (handler) return handler(args);
    return defaultFor(cmd);
  };

  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb: unknown) => {
      const id = Math.floor(Math.random() * 1e9);
      (window as unknown as Record<string, unknown>)["_" + id] = cb;
      return id;
    },
    convertFileSrc: (p: string) => p,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
}
