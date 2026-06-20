use std::collections::HashMap;
use std::path::{Path, PathBuf};

use libloot::GameType;
use serde::Deserialize;

use crate::db::{self, InstalledMod, Profile};
use crate::error::{NexusDeckError, Result};
use crate::services::mod_metadata::{earliest_plugin_sort_key, extract_plugins_from_paths};
use crate::services::mod_state::installed_file_paths;
use crate::services::plugins_txt;

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
    let _ = plugins_txt::sync_plugins_txt(&profile);
    Ok(updated)
}

fn load_rules(game_domain: &str) -> LoadOrderRules {
    let embedded = match game_domain {
        "fallout4" => include_str!("../games/rules/fallout4_load_order.json"),
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
