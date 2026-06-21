use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemedyDefinition {
    pub id: String,
    pub title: String,
    pub description: String,
    pub symptoms: Vec<String>,
    pub deck_tip: Option<String>,
    pub destructive: bool,
    pub safe_auto: bool,
}

#[derive(Debug, Deserialize)]
struct KnowledgeIndex {
    games: Vec<KnowledgeGameEntry>,
}

#[derive(Debug, Deserialize)]
struct KnowledgeGameEntry {
    domain: String,
    remedies: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RemedyFile {
    id: String,
    title: String,
    description: String,
    #[serde(default)]
    symptoms: Vec<String>,
    deck_tip: Option<String>,
    fix: RemedyFix,
}

#[derive(Debug, Deserialize)]
struct RemedyFix {
    #[serde(rename = "type")]
    fix_type: String,
    #[serde(default)]
    backup: bool,
    #[serde(default)]
    destructive: bool,
    #[serde(default)]
    confirm: bool,
}

pub fn list_remedies(game_domain: &str) -> crate::error::Result<Vec<RemedyDefinition>> {
    let index: KnowledgeIndex = serde_json::from_str(include_str!("../../knowledge/index.json"))?;
    let entry = index
        .games
        .into_iter()
        .find(|g| g.domain == game_domain)
        .ok_or_else(|| {
            crate::error::NexusDeckError::Other(format!("No knowledge base for {game_domain}"))
        })?;

    let mut remedies = Vec::new();
    for name in entry.remedies {
        if let Some(r) = load_remedy_embedded(&name) {
            remedies.push(r);
        }
    }
    Ok(remedies)
}

pub fn get_remedy(remedy_id: &str) -> Option<RemedyDefinition> {
    for name in all_remedy_files() {
        if let Some(r) = load_remedy_embedded(name) {
            if r.id == remedy_id {
                return Some(r);
            }
        }
    }
    None
}

pub fn remedy_fix_type(remedy_id: &str) -> Option<String> {
    for name in all_remedy_files() {
        let raw = remedy_raw(name)?;
        let file: RemedyFile = serde_json::from_str(raw).ok()?;
        if file.id == remedy_id {
            return Some(file.fix.fix_type);
        }
    }
    None
}

pub fn is_destructive(remedy_id: &str) -> bool {
    for name in all_remedy_files() {
        let Some(raw) = remedy_raw(name) else { continue };
        let Ok(file) = serde_json::from_str::<RemedyFile>(raw) else { continue };
        if file.id == remedy_id {
            return file.fix.destructive || file.fix.confirm;
        }
    }
    false
}

pub fn is_safe_auto(remedy_id: &str) -> bool {
    for name in all_remedy_files() {
        let Some(raw) = remedy_raw(name) else { continue };
        let Ok(file) = serde_json::from_str::<RemedyFile>(raw) else { continue };
        if file.id == remedy_id {
            return !file.fix.destructive && !file.fix.confirm;
        }
    }
    false
}

fn load_remedy_embedded(name: &str) -> Option<RemedyDefinition> {
    let raw = remedy_raw(name)?;
    let file: RemedyFile = serde_json::from_str(raw).ok()?;
    Some(RemedyDefinition {
        id: file.id,
        title: file.title,
        description: file.description,
        symptoms: file.symptoms,
        deck_tip: file.deck_tip,
        destructive: file.fix.destructive || file.fix.confirm,
        safe_auto: !file.fix.destructive && !file.fix.confirm,
    })
}

fn remedy_raw(name: &str) -> Option<&'static str> {
    match name {
        "skyrim/skse_not_loading" => Some(include_str!("../../knowledge/skyrim/skse_not_loading.json")),
        "skyrim/mods_not_appearing" => Some(include_str!("../../knowledge/skyrim/mods_not_appearing.json")),
        "skyrim/ctd_launch" => Some(include_str!("../../knowledge/skyrim/ctd_launch.json")),
        "skyrim/prefix_bloat" => Some(include_str!("../../knowledge/skyrim/prefix_bloat.json")),
        "skyrim/plugins_txt_sync" => Some(include_str!("../../knowledge/skyrim/plugins_txt_sync.json")),
        "skyrim/archive_invalidation" => Some(include_str!("../../knowledge/skyrim/archive_invalidation.json")),
        "skyrim/proton_deps_missing" => Some(include_str!("../../knowledge/skyrim/proton_deps_missing.json")),
        "skyrim/permissions_fix" => Some(include_str!("../../knowledge/skyrim/permissions_fix.json")),
        "skyrim/ini_deck_preset" => Some(include_str!("../../knowledge/skyrim/ini_deck_preset.json")),
        "skyrim/sd_card_staging" => Some(include_str!("../../knowledge/skyrim/sd_card_staging.json")),
        "skyrim/wabbajack_checklist" => Some(include_str!("../../knowledge/skyrim/wabbajack_checklist.json")),
        "shared/proton_common" => Some(include_str!("../../knowledge/shared/proton_common.json")),
        "fallout4/f4se_not_loading" => Some(include_str!("../../knowledge/fallout4/f4se_not_loading.json")),
        "fallout4/proton_deps_missing" => Some(include_str!("../../knowledge/fallout4/proton_deps_missing.json")),
        "fallout4/archive_invalidation" => Some(include_str!("../../knowledge/fallout4/archive_invalidation.json")),
        "fallout4/plugins_txt_sync" => Some(include_str!("../../knowledge/fallout4/plugins_txt_sync.json")),
        "fallout4/ini_deck_preset" => Some(include_str!("../../knowledge/fallout4/ini_deck_preset.json")),
        _ => None,
    }
}

fn all_remedy_files() -> &'static [&'static str] {
    &[
        "skyrim/skse_not_loading",
        "skyrim/mods_not_appearing",
        "skyrim/ctd_launch",
        "skyrim/prefix_bloat",
        "skyrim/plugins_txt_sync",
        "skyrim/archive_invalidation",
        "skyrim/proton_deps_missing",
        "skyrim/permissions_fix",
        "skyrim/ini_deck_preset",
        "skyrim/sd_card_staging",
        "skyrim/wabbajack_checklist",
        "shared/proton_common",
        "fallout4/f4se_not_loading",
        "fallout4/proton_deps_missing",
        "fallout4/archive_invalidation",
        "fallout4/plugins_txt_sync",
        "fallout4/ini_deck_preset",
    ]
}
