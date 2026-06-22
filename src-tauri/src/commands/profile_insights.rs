use std::sync::Arc;

use tauri::State;

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::services::load_order;
use crate::services::loadouts::{self, ModLoadout};
use crate::services::nexus_client::NexusClient;
use crate::services::profile_insights::{
    self, CollectionDiffResult, CollectionModInput, DeployScanResult, ModSafetyReport,
    ProfileConflictSummary, TextureBudgetReport,
};

#[tauri::command]
pub fn diff_collection_install(
    profile_id: String,
    collection_mods: Vec<CollectionModInput>,
) -> Result<CollectionDiffResult> {
    profile_insights::diff_collection(&profile_id, &collection_mods)
}

#[tauri::command]
pub fn assess_mod_safety(
    profile_id: String,
    installed_mod_id: String,
    action: String,
) -> Result<ModSafetyReport> {
    profile_insights::assess_mod_change(&profile_id, &installed_mod_id, &action)
}

#[tauri::command]
pub fn scan_deploy_footprint(profile_id: String) -> Result<DeployScanResult> {
    profile_insights::scan_deploy_footprint(&profile_id)
}

#[tauri::command]
pub fn scan_profile_conflicts(profile_id: String) -> Result<ProfileConflictSummary> {
    profile_insights::scan_profile_conflicts(&profile_id)
}

#[tauri::command]
pub fn analyze_texture_budget(profile_id: String) -> Result<TextureBudgetReport> {
    profile_insights::analyze_texture_budget(&profile_id)
}

#[tauri::command]
pub fn list_mod_loadouts(profile_id: String) -> Result<Vec<ModLoadout>> {
    loadouts::list_loadouts(&profile_id)
}

#[tauri::command]
pub fn save_mod_loadout(profile_id: String, name: String) -> Result<ModLoadout> {
    loadouts::save_loadout(&profile_id, &name)
}

#[tauri::command]
pub fn apply_mod_loadout(profile_id: String, loadout_id: String) -> Result<()> {
    loadouts::apply_loadout(&profile_id, &loadout_id)
}

#[tauri::command]
pub fn delete_mod_loadout(profile_id: String, loadout_id: String) -> Result<()> {
    loadouts::delete_loadout(&profile_id, &loadout_id)
}

#[tauri::command]
pub fn export_sync_bundle(profile_id: String) -> Result<String> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = db::list_installed_mods(&profile_id)?;
    let load_order = load_order::get_load_order_state(&profile_id).ok();
    let loadouts = loadouts::list_loadouts(&profile_id).unwrap_or_default();

    Ok(serde_json::to_string_pretty(&serde_json::json!({
        "kind": "nexusdeck_sync_bundle",
        "version": 1,
        "profile": profile,
        "mods": mods,
        "load_order": load_order,
        "loadouts": loadouts,
        "exported_at": chrono::Utc::now().to_rfc3339(),
    }))?)
}

#[tauri::command]
pub fn export_steam_input_guide() -> Result<String> {
    Ok(serde_json::to_string_pretty(&serde_json::json!({
        "title": "NexusDeck Steam Input (recommended)",
        "notes": "Import as a Steam Input profile or map manually in Gaming Mode.",
        "bindings": [
            { "input": "Left stick", "action": "Navigate focus (via gamepad router)" },
            { "input": "A / Cross", "action": "Confirm / activate focused control" },
            { "input": "B / Circle", "action": "Back (dialog → page → sidebar)" },
            { "input": "X / Square", "action": "Context action (install, toggle, etc.)" },
            { "input": "Y / Triangle", "action": "Secondary action / menu" },
            { "input": "L1 / R1", "action": "Previous / next tab" },
            { "input": "L2 / R2", "action": "Reorder mods (library) / scroll pane" },
            { "input": "Start", "action": "Command palette" },
            { "input": "D-pad", "action": "Directional focus navigation" }
        ]
    }))?)
}

#[tauri::command]
pub async fn get_mod_update_changelog(
    game_domain: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<String> {
    let detail = nexus.get_mod_detail(&game_domain, mod_id).await?;
    if !detail.description_html.is_empty() {
        return Ok(truncate_changelog(&strip_html(&detail.description_html), 1200));
    }
    Ok("No changelog text available from Nexus.".into())
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_changelog(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    format!("{}…", &text[..max])
}

#[tauri::command]
pub fn parse_modlist_import(content: String, format: String) -> Result<Vec<serde_json::Value>> {
    let lines: Vec<&str> = content.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let mut mods = Vec::new();

    match format.as_str() {
        "mo2" | "txt" => {
            for line in lines {
                if line.starts_with('#') || line.starts_with(';') {
                    continue;
                }
                let name = line.trim_start_matches('+').trim_start_matches('-').trim();
                if !name.is_empty() {
                    mods.push(serde_json::json!({ "name": name, "source": "mo2" }));
                }
            }
        }
        "wabbajack" => {
            for line in lines {
                mods.push(serde_json::json!({ "name": line, "source": "wabbajack" }));
            }
        }
        _ => {
            return Err(NexusDeckError::Other(format!("Unknown import format: {format}")));
        }
    }

    Ok(mods)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String> {
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<()> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, content)?;
    Ok(())
}
