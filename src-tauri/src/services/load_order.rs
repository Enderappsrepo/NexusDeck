use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use libloot::GameType;
use serde::{Deserialize, Serialize};

use crate::db::{self, InstalledMod, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::mod_metadata::{earliest_plugin_sort_key, extract_plugins_from_paths};
use crate::services::mod_state::installed_file_paths;
use crate::services::plugins_txt::{self, base_game_plugins};
use crate::games::GameRegistry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadOrderModEntry {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub sort_order: i32,
    pub plugins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadOrderPluginEntry {
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub mod_id: Option<String>,
    pub mod_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadOrderState {
    pub mods: Vec<LoadOrderModEntry>,
    pub plugins: Vec<LoadOrderPluginEntry>,
    pub plugins_txt_path: Option<String>,
    pub plugins_txt_ready: bool,
    pub active_plugin_count: usize,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct LoadOrderRules {
    category_tiers: HashMap<String, i32>,
    tag_adjustments: HashMap<String, i32>,
    default_tier: i32,
}

#[derive(Debug, Clone)]
struct ModSortKey {
    mod_id: String,
    loot_rank: usize,
    plugin_tier: u8,
    category_tier: i32,
    name: String,
}

pub fn auto_sort_load_order(profile_id: &str) -> Result<Vec<InstalledMod>> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = db::list_installed_mods(profile_id)?;
    if mods.is_empty() {
        return Ok(mods);
    }

    let rules = load_rules(&profile.game_domain);
    let loot_ranks = loot_plugin_ranks(&profile, &mods)?;
    let keys: Vec<ModSortKey> = mods
        .iter()
        .map(|m| {
            let plugins: Vec<String> = serde_json::from_str(&m.plugins_json).unwrap_or_default();
            let plugin_tier = earliest_plugin_sort_key(&plugins);
            let category_tier = category_tier_for_mod(m, &rules);
            let loot_rank = plugins
                .iter()
                .filter_map(|p| loot_ranks.get(&p.to_lowercase()))
                .min()
                .copied()
                .unwrap_or(usize::MAX / 2);
            ModSortKey {
                mod_id: m.id.clone(),
                loot_rank,
                plugin_tier,
                category_tier,
                name: m.name.clone(),
            }
        })
        .collect();

    let mut sorted = keys;
    sorted.sort_by(|a, b| {
        a.loot_rank
            .cmp(&b.loot_rank)
            .then(a.plugin_tier.cmp(&b.plugin_tier))
            .then(a.category_tier.cmp(&b.category_tier))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let ordered_ids: Vec<String> = sorted.iter().map(|k| k.mod_id.clone()).collect();
    let updated = db::set_mod_sort_orders(profile_id, &ordered_ids)?;
    plugins_txt::sync_plugins_txt(&profile)?;
    Ok(updated)
}

pub fn get_load_order_state(profile_id: &str) -> Result<LoadOrderState> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let plugins_txt_path = plugin.plugins_txt_path(&profile).map(|p| p.display().to_string());
    let plugins_txt_ready = plugins_txt_path.is_some();

    let mods = db::list_installed_mods(profile_id)?;
    let plugin_to_mod = build_plugin_mod_map(&mods)?;

    let mut mod_entries = Vec::new();
    for (idx, m) in mods.iter().enumerate() {
        let plugins: Vec<String> = serde_json::from_str(&m.plugins_json).unwrap_or_default();
        mod_entries.push(LoadOrderModEntry {
            id: m.id.clone(),
            name: m.name.clone(),
            enabled: m.enabled,
            sort_order: idx as i32,
            plugins,
        });
    }

    let launch_plugins = plugins_txt::collect_plugins_for_launch(&profile).unwrap_or_default();
    let active_set: HashMap<String, bool> = launch_plugins
        .iter()
        .map(|p| (p.to_lowercase(), true))
        .collect();

    let mut plugin_entries = Vec::new();
    for name in base_game_plugins(&profile.game_domain, &profile.game_path) {
        plugin_entries.push(LoadOrderPluginEntry {
            name: name.clone(),
            kind: if name.to_lowercase().starts_with("dlc") || name.contains("Update") {
                "dlc".into()
            } else {
                "vanilla".into()
            },
            enabled: active_set.contains_key(&name.to_lowercase()),
            mod_id: None,
            mod_name: None,
        });
    }

    let data_dir = Path::new(&profile.game_path).join("Data");
    if data_dir.is_dir() {
        for entry in std::fs::read_dir(&data_dir)?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if (lower.starts_with("cc") || lower.starts_with("creationclub"))
                && (lower.ends_with(".esl") || lower.ends_with(".esp") || lower.ends_with(".esm"))
                && !plugin_entries.iter().any(|p| p.name.eq_ignore_ascii_case(&name))
            {
                plugin_entries.push(LoadOrderPluginEntry {
                    name: name.clone(),
                    kind: "creation_club".into(),
                    enabled: active_set.contains_key(&lower),
                    mod_id: None,
                    mod_name: None,
                });
            }
        }
    }

    for name in &launch_plugins {
        if plugin_entries.iter().any(|p| p.name.eq_ignore_ascii_case(name)) {
            continue;
        }
        let meta = plugin_to_mod.get(&name.to_lowercase());
        plugin_entries.push(LoadOrderPluginEntry {
            name: name.clone(),
            kind: "mod".into(),
            enabled: true,
            mod_id: meta.map(|(id, _)| id.clone()),
            mod_name: meta.map(|(_, n)| n.clone()),
        });
    }

    for m in mods.iter().filter(|m| m.enabled) {
        let plugins: Vec<String> = serde_json::from_str(&m.plugins_json).unwrap_or_default();
        for name in plugins {
            if plugin_entries.iter().any(|p| p.name.eq_ignore_ascii_case(&name)) {
                continue;
            }
            plugin_entries.push(LoadOrderPluginEntry {
                name: name.clone(),
                kind: "mod".into(),
                enabled: false,
                mod_id: Some(m.id.clone()),
                mod_name: Some(m.name.clone()),
            });
        }
    }

    let active_plugin_count = plugin_entries.iter().filter(|p| p.enabled).count();
    let message = if !plugins_txt_ready {
        "Proton prefix not configured — plugins.txt cannot be written until Setup is complete.".into()
    } else if active_plugin_count == 0 {
        "No plugins active. Enable mods and sync before launching.".into()
    } else {
        format!(
            "{active_plugin_count} plugin(s) will load at launch (vanilla, Creation Club, and enabled mods)."
        )
    };

    Ok(LoadOrderState {
        mods: mod_entries,
        plugins: plugin_entries,
        plugins_txt_path,
        plugins_txt_ready,
        active_plugin_count,
        message,
    })
}

fn build_plugin_mod_map(mods: &[InstalledMod]) -> Result<HashMap<String, (String, String)>> {
    let mut map = HashMap::new();
    for m in mods {
        for file in installed_file_paths(m)? {
            let path = Path::new(&file);
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !is_plugin_ext(&ext) {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                map.insert(name.to_lowercase(), (m.id.clone(), m.name.clone()));
            }
        }
    }
    Ok(map)
}

fn is_plugin_ext(ext: &str) -> bool {
    ext == "esp" || ext == "esm" || ext == "esl"
}

/// LOOT-sorted plugin names from enabled mods only (excludes vanilla/CC).
pub fn loot_sorted_mod_plugins(profile: &Profile) -> Result<Vec<String>> {
    let mods = db::list_installed_mods(&profile.id)?;
    let loot_ranks = loot_plugin_ranks(profile, &mods)?;
    let mut plugins: Vec<(String, usize)> = Vec::new();
    let mut seen = HashSet::new();

    for mod_record in mods.iter().filter(|m| m.enabled) {
        for file in installed_file_paths(mod_record)? {
            let path = PathBuf::from(&file);
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !is_plugin_ext(&ext) {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if !seen.insert(name.to_lowercase()) {
                continue;
            }
            let rank = loot_ranks
                .get(&name.to_lowercase())
                .copied()
                .unwrap_or(usize::MAX / 2);
            plugins.push((name, rank));
        }
    }

    plugins.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.to_lowercase().cmp(&b.0.to_lowercase())));
    Ok(plugins.into_iter().map(|(n, _)| n).collect())
}

fn load_rules(game_domain: &str) -> LoadOrderRules {
    let embedded = match game_domain {
        "fallout4" => include_str!("../games/rules/fallout4_load_order.json"),
        "skyrimspecialedition" => include_str!("../games/rules/skyrimspecialedition_load_order.json"),
        _ => {
            return LoadOrderRules {
                category_tiers: HashMap::new(),
                tag_adjustments: HashMap::new(),
                default_tier: 60,
            }
        }
    };
    serde_json::from_str(embedded).unwrap_or(LoadOrderRules {
        category_tiers: HashMap::new(),
        tag_adjustments: HashMap::new(),
        default_tier: 60,
    })
}

fn category_tier_for_mod(mod_record: &InstalledMod, rules: &LoadOrderRules) -> i32 {
    let mut tier = rules
        .category_tiers
        .get(&mod_record.category)
        .copied()
        .unwrap_or(rules.default_tier);

    if let Ok(tags) = serde_json::from_str::<Vec<String>>(&mod_record.tags_json) {
        for tag in tags {
            if let Some(adj) = rules.tag_adjustments.get(&tag) {
                tier += adj;
            }
        }
    }

    tier
}

fn loot_plugin_ranks(
    profile: &Profile,
    mods: &[InstalledMod],
) -> Result<HashMap<String, usize>> {
    let game_type = match profile.game_domain.as_str() {
        "fallout4" => GameType::Fallout4,
        "skyrimspecialedition" => GameType::SkyrimSE,
        "skyrim" => GameType::Skyrim,
        "fallout3" => GameType::Fallout3,
        "falloutnv" => GameType::FalloutNV,
        _ => return Ok(HashMap::new()),
    };

    let game_path = PathBuf::from(&profile.game_path);
    let data_dir = game_path.join("Data");
    if !data_dir.is_dir() {
        return Ok(HashMap::new());
    }

    let local_path = resolve_local_data_path(profile);
    let mut game = if local_path.is_dir() {
        libloot::Game::with_local_path(game_type, &game_path, &local_path)
    } else {
        libloot::Game::new(game_type, &game_path)
    }
    .map_err(|e| NexusDeckError::Other(format!("LOOT init failed: {e}")))?;

    let mut plugin_paths: Vec<PathBuf> = Vec::new();
    let mut plugin_names: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for mod_record in mods.iter().filter(|m| m.enabled) {
        for file in installed_file_paths(mod_record)? {
            let path = PathBuf::from(&file);
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext != "esp" && ext != "esm" && ext != "esl" {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if seen.insert(name.to_lowercase()) {
                plugin_names.push(name);
                plugin_paths.push(path);
            }
        }
    }

    if plugin_names.is_empty() {
        return Ok(HashMap::new());
    }

    let path_refs: Vec<&Path> = plugin_paths.iter().map(|p| p.as_path()).collect();
    game.load_plugins(&path_refs)
        .map_err(|e| NexusDeckError::Other(format!("LOOT plugin load failed: {e}")))?;

    if let Err(e) = try_load_masterlist(&mut game, profile) {
        log::warn!("Could not load LOOT masterlist: {e}");
    }

    let name_refs: Vec<&str> = plugin_names.iter().map(|s| s.as_str()).collect();
    let sorted = game
        .sort_plugins(&name_refs)
        .map_err(|e| NexusDeckError::Other(format!("LOOT sort failed: {e}")))?;

    let mut ranks = HashMap::new();
    for (idx, name) in sorted.iter().enumerate() {
        ranks.insert(name.to_lowercase(), idx);
    }
    Ok(ranks)
}

fn try_load_masterlist(game: &mut libloot::Game, profile: &Profile) -> Result<()> {
    let cache_dir = PathBuf::from(&profile.staging_path).join("loot_cache");
    std::fs::create_dir_all(&cache_dir)?;
    let masterlist_path = cache_dir.join(format!("{}_masterlist.yaml", profile.game_domain));

    if !masterlist_path.is_file() {
        fetch_masterlist(&profile.game_domain, &masterlist_path)?;
    }

    if masterlist_path.is_file() {
        let database = game.database();
        let mut database = database.write().map_err(|_| {
            NexusDeckError::Other("LOOT database lock poisoned".into())
        })?;
        database
            .load_masterlist(&masterlist_path)
            .map_err(|e| NexusDeckError::Other(format!("Masterlist load failed: {e}")))?;
    }
    Ok(())
}

fn fetch_masterlist(game_domain: &str, dest: &Path) -> Result<()> {
    let repo = match game_domain {
        "fallout4" => "loot/fallout4",
        "skyrimspecialedition" => "loot/skyrimse",
        "skyrim" => "loot/skyrim",
        "fallout3" => "loot/fallout3",
        "falloutnv" => "loot/falloutnv",
        _ => return Ok(()),
    };
    let url = format!("https://raw.githubusercontent.com/{repo}/master/masterlist.yaml");
    let response = reqwest::blocking::get(&url)
        .map_err(|e| NexusDeckError::Other(format!("Masterlist fetch failed: {e}")))?;
    if !response.status().is_success() {
        return Err(NexusDeckError::Other(format!(
            "Masterlist fetch HTTP {}",
            response.status()
        )));
    }
    let body = response
        .text()
        .map_err(|e| NexusDeckError::Other(format!("Masterlist read failed: {e}")))?;
    std::fs::write(dest, body)?;
    Ok(())
}

fn resolve_local_data_path(profile: &Profile) -> PathBuf {
    let folder = crate::games::GameRegistry::get(&profile.game_domain)
        .ok()
        .and_then(|p| p.my_games_folder().map(|s| s.to_string()))
        .unwrap_or_else(|| "Fallout4".to_string());

    if cfg!(target_os = "windows") {
        dirs::document_dir()
            .map(|d| d.join("My Games").join(&folder))
            .unwrap_or_else(|| PathBuf::from(&profile.game_path).join("My Games").join(folder))
    } else if let Some(ref prefix) = profile.proton_prefix_path {
        PathBuf::from(prefix)
            .join("drive_c")
            .join("users")
            .join("steamuser")
            .join("Documents")
            .join("My Games")
            .join(folder)
    } else {
        PathBuf::from(&profile.game_path).join("My Games").join(folder)
    }
}

pub fn plugins_json_from_manifest(files: &[String]) -> String {
    serde_json::to_string(&extract_plugins_from_paths(files)).unwrap_or_else(|_| "[]".to_string())
}
