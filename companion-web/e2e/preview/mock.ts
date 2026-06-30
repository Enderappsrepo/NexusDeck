/** Mock the Deck HTTP API so the companion renders in a browser with no device. */
const m = (id: number, name: string, author: string) => ({
  mod_id: id,
  name,
  author,
  summary: `${name} — a popular Fallout 4 mod.`,
  picture_url: null,
  endorsements: 1000 + id * 137,
  mod_downloads: 50000 + id * 911,
});

const mods = [
  m(1, "Unofficial Fallout 4 Patch", "Arthmoor"),
  m(2, "Sim Settlements 2", "kinggath"),
  m(3, "Full Dialogue Interface", "shadwar"),
  m(4, "Mod Configuration Menu", "Neanka"),
  m(5, "Looks Menu", "Expired"),
  m(6, "Armorsmith Extended", "Gambit77"),
  m(7, "Vivid Fallout", "Hein84"),
  m(8, "Place Everywhere", "TheLich"),
];

const games = [
  { domain: "fallout4", name: "Fallout 4", can_install: true },
  { domain: "skyrimspecialedition", name: "Skyrim Special Edition", can_install: true },
];

const categories = [
  { category_id: 1, name: "Gameplay" },
  { category_id: 2, name: "Weapons" },
  { category_id: 3, name: "Settlements" },
  { category_id: 4, name: "Visuals" },
];

const discovery = {
  featured: mods.slice(0, 6),
  top_endorsed: mods,
  most_downloaded: mods,
  trending: mods,
  newly_added: mods,
  recently_updated: mods,
  hot_this_week: mods,
};

const session = {
  session_id: "s1",
  status: "ready",
  message: "Downloaded — choose your options, then confirm.",
  prepare: {
    option_groups: [],
    default_selections: [],
    install_wizard: null,
    install_wizard_required: false,
    strategies: [
      { id: "auto", label: "Automatic (recommended)", description: "Let NexusDeck pick the best layout." },
      { id: "merge_data", label: "Data folder merge", description: "Archive has a Data/ folder — merge it in." },
      { id: "merge_loose_to_data", label: "Loose files → Data", description: "Copy all files into Data/." },
      { id: "copy_loose_to_data", label: "Plugins only → Data", description: "Copy just .esp/.ba2 into Data/." },
    ],
    detected: {
      strategy: "merge_data",
      label: "Data folder merge",
      description: "Standard mod layout detected. Files will be copied into your game's Data folder.",
      target: "Data folder",
    },
  },
};

let library = [
  { id: "lm1", nexus_mod_id: 1, name: "Unofficial Fallout 4 Patch", version: "2.2", enabled: true, sort_order: 0, installed_at: Date.now() },
  { id: "lm2", nexus_mod_id: 4, name: "Mod Configuration Menu", version: "1.11", enabled: true, sort_order: 1, installed_at: Date.now() },
  { id: "lm3", nexus_mod_id: 7, name: "Vivid Fallout", version: "1.6", enabled: false, sort_order: 2, installed_at: Date.now() },
];

function reorderLibrary(modId: string, direction: string) {
  const i = library.findIndex((m) => m.id === modId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= library.length) return;
  [library[i], library[j]] = [library[j], library[i]];
  library = library.map((m, idx) => ({ ...m, sort_order: idx }));
}

export function installFetchMock() {
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (url.includes("/ping"))
      return json({ name: "Steam Deck", version: "1.1.29", paired: true, companion_api: 5, games });
    if (url.includes("/pair")) return json({ token: "preview-token" });
    if (url.includes("/games/list")) return json(games);
    if (url.includes("/browse/discovery")) return json(discovery);
    if (url.includes("/browse/trending")) return json(mods);
    if (url.includes("/browse/latest")) return json(mods);
    if (url.includes("/search/mods")) {
      const u = new URL(url, "http://mock");
      const q = u.searchParams.get("q")?.toLowerCase() ?? "";
      const tagFilter = u.searchParams.get("tags")?.toLowerCase() ?? "";
      let results = mods;
      if (q) {
        results = results.filter(
          (mod) => mod.name.toLowerCase().includes(q) || mod.author.toLowerCase().includes(q)
        );
      }
      if (tagFilter) {
        const tags = tagFilter.split(",");
        results = results.filter((mod) =>
          tags.some((tag) => mod.name.toLowerCase().includes(tag.trim()))
        );
      }
      return json({ mods: results.slice(0, 4), total_count: results.length });
    }
    if (url.includes("/categories/list")) return json(categories);
    if (url.includes("/browse/shelf")) return json(mods);
    if (url.includes("/library/mod/update")) return json({ download_id: "d-up", installed_mod_id: "lm1" });
    if (url.includes("/library/updates/all")) return json({ queued: ["d-up"], skipped: [], errors: [] });
    if (url.includes("/library/mod/position")) return json(library);
    if (url.includes("/library/rescan")) return json({ mods_added: 0, plugins_found: 3, message: "ok" });
    if (url.includes("/downloads/cancel")) return json({ ok: true });
    if (url.includes("/downloads/retry")) return json({ ok: true });
    if (url.includes("/collections/list"))
      return json([
        {
          name: "Essential Mods",
          slug: "essential-mods",
          summary: "Core gameplay fixes and UI improvements.",
          mod_count: 12,
          author: "Nexus Community",
          revision_number: 3,
        },
      ]);
    if (url.includes("/collections/detail"))
      return json({
        detail: {
          name: "Essential Mods",
          slug: "essential-mods",
          author: "Nexus Community",
          mod_count: 2,
          mods: [
            { mod_id: 1, file_id: 1, name: "Unofficial Fallout 4 Patch", optional: false, version: "2.2" },
            { mod_id: 4, file_id: 1, name: "Mod Configuration Menu", optional: false, version: "1.11" },
          ],
        },
        diff: {
          installed_count: 1,
          total_count: 2,
          missing_count: 1,
          outdated_count: 0,
          wrong_file_count: 0,
          mods: [
            {
              mod_id: 1,
              name: "Unofficial Fallout 4 Patch",
              optional: false,
              status: "installed",
              collection_version: "2.2",
              installed_version: "2.2",
            },
            {
              mod_id: 4,
              name: "Mod Configuration Menu",
              optional: false,
              status: "missing",
              collection_version: "1.11",
            },
          ],
        },
      });
    if (url.includes("/collections/install/start")) return json([]);
    if (url.includes("/library/mod/reorder")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      reorderLibrary(body.mod_id, body.direction);
      return json(library);
    }
    if (url.includes("/library/mod/toggle")) return json({ ok: true });
    if (url.includes("/library/mods")) return json(library);
    if (url.includes("/library/updates")) return json([]);
    if (url.includes("/loadorder/state") || url.includes("/loadorder/sort"))
      return json({
        mods: library.map((m, i) => ({
          id: m.id,
          name: m.name,
          enabled: m.enabled,
          sort_order: i,
          plugins: [],
        })),
        plugins: [],
        plugins_txt_ready: false,
        active_plugin_count: 0,
        message: "",
        loot_issues: [],
      });
    if (url.includes("/mods/detail"))
      return json({ ...m(2, "Sim Settlements 2", "kinggath"), description_html: "<p>Build settlements that build themselves — a full questline overhaul.</p>", category: "Gameplay", version: "2.0", tags: ["Gameplay", "Settlements"] });
    if (url.includes("/mods/files"))
      return json([
        { file_id: 1, name: "Sim Settlements 2 Main", file_name: "SS2.7z", version: "2.0", is_primary: true, size_kb: 520000, category_name: "Main" },
        { file_id: 2, name: "Optional patch", file_name: "SS2patch.7z", version: "2.0", is_primary: false, size_kb: 4000, category_name: "Optional" },
      ]);
    if (url.includes("/essentials/manifest"))
      return json({ id: "fo4", domain: "fallout4", display_name: "Fallout 4", description: "One-click essentials", setup_steps: [], mods: [] });
    if (url.includes("/essentials/status")) return json([]);
    if (url.includes("/install/session")) return json(session);
    if (url.includes("/settings/device"))
      return json({
        app_version: "1.1.29",
        nexus_configured: true,
        receive_enabled: true,
        companion_api: 5,
        auto_sort_after_install: false,
        download_settings: { max_concurrent: 2, speed_limit_kbps: 0 },
      });
    if (url.includes("/downloads")) return json([]);
    return json({});
  }) as typeof fetch;
}
