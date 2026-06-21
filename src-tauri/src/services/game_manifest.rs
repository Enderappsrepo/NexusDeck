use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameManifestEntry {
    pub domain: String,
    pub display_name: String,
    pub steam_app_id: u32,
    pub knowledge_pack: String,
    pub proton_deps: String,
    pub deck_rules: String,
    pub load_order_rules: String,
    pub ini_presets: Option<String>,
    pub mod_managers: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ManifestRoot {
    games: Vec<GameManifestEntry>,
}

pub fn load_manifest() -> Result<Vec<GameManifestEntry>> {
    let root: ManifestRoot = serde_json::from_str(include_str!("../knowledge/index.json"))?;
    Ok(root.games)
}

pub fn get_game_manifest(domain: &str) -> Result<GameManifestEntry> {
    load_manifest()?
        .into_iter()
        .find(|g| g.domain == domain)
        .ok_or_else(|| crate::error::NexusDeckError::GameNotFound(domain.to_string()))
}

pub fn knowledge_remedy_ids(domain: &str) -> Result<Vec<String>> {
    #[derive(Deserialize)]
    struct Index {
        games: Vec<IndexGame>,
    }
    #[derive(Deserialize)]
    struct IndexGame {
        domain: String,
        remedies: Vec<String>,
    }

    let index: Index = serde_json::from_str(include_str!("../knowledge/index.json"))?;
    index
        .games
        .into_iter()
        .find(|g| g.domain == domain)
        .map(|g| g.remedies)
        .ok_or_else(|| crate::error::NexusDeckError::GameNotFound(domain.to_string()))
}
