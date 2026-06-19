use std::sync::Arc;

use tauri::State;

use crate::error::Result;
use crate::services::nexus_client::{ModCategory, ModDetail, ModFileInfo, ModSearchFilters, ModSearchResult, ModSummary, NexusClient};

#[tauri::command]
pub async fn search_mods(
    game_domain: String,
    query: String,
    sort: String,
    offset: u32,
    count: u32,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModSummary>> {
    nexus
        .search_mods(&game_domain, &query, &sort, offset, count)
        .await
}

#[tauri::command]
pub async fn search_mods_filtered(
    game_domain: String,
    query: String,
    sort: String,
    offset: u32,
    count: u32,
    filters: ModSearchFilters,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<ModSearchResult> {
    nexus
        .search_mods_with_filters(&game_domain, &query, &sort, offset, count, &filters)
        .await
}

#[tauri::command]
pub async fn list_mod_categories(
    game_domain: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModCategory>> {
    nexus.list_mod_categories(&game_domain).await
}

#[tauri::command]
pub async fn get_trending_mods(
    game_domain: String,
    count: u32,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModSummary>> {
    nexus.get_trending_mods(&game_domain, count).await
}

#[tauri::command]
pub async fn get_mod_detail(
    game_domain: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<ModDetail> {
    nexus.get_mod_detail(&game_domain, mod_id).await
}

#[tauri::command]
pub async fn get_mod_files(
    game_domain: String,
    mod_id: u64,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<ModFileInfo>> {
    nexus.get_mod_files(&game_domain, mod_id).await
}

#[tauri::command]
pub async fn list_nexus_games(
    query: String,
    count: u32,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<Vec<serde_json::Value>> {
    nexus.list_games(&query, count).await
}

#[tauri::command]
pub async fn handle_nxm_url(
    url: String,
    nexus: State<'_, Arc<NexusClient>>,
) -> Result<serde_json::Value> {
    let parsed = parse_nxm_url(&url)?;
    let files = nexus
        .get_mod_files(&parsed.game_domain, parsed.mod_id)
        .await?;
    Ok(serde_json::json!({
        "game_domain": parsed.game_domain,
        "mod_id": parsed.mod_id,
        "file_id": parsed.file_id,
        "files": files,
    }))
}

#[derive(Debug)]
struct NxmParsed {
    game_domain: String,
    mod_id: u64,
    file_id: u64,
}

fn parse_nxm_url(url: &str) -> Result<NxmParsed> {
    let stripped = url.trim().strip_prefix("nxm://").unwrap_or(url);
    let path = stripped.split('?').next().unwrap_or(stripped);
    let parts: Vec<&str> = path.trim_end_matches('/').split('/').collect();

    if parts.len() >= 5 && parts[1] == "mods" && parts[3] == "files" {
        Ok(NxmParsed {
            game_domain: parts[0].to_string(),
            mod_id: parts[2].parse().map_err(|_| {
                crate::error::NexusDeckError::Other("Invalid mod ID in NXM URL".into())
            })?,
            file_id: parts[4].parse().map_err(|_| {
                crate::error::NexusDeckError::Other("Invalid file ID in NXM URL".into())
            })?,
        })
    } else {
        Err(crate::error::NexusDeckError::Other(
            "Invalid NXM URL format".into(),
        ))
    }
}
