use std::path::Path;

pub fn is_plugin_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let lower = e.to_lowercase();
            lower == "esp" || lower == "esm" || lower == "esl"
        })
        .unwrap_or(false)
}

pub fn extract_plugins_from_paths(files: &[String]) -> Vec<String> {
    let mut plugins = Vec::new();
    for file in files {
        let path = Path::new(file);
        if is_plugin_file(path) {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                plugins.push(name.to_string());
            }
        }
    }
    plugins.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    plugins.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    plugins
}

pub fn plugin_sort_key(plugin: &str) -> u8 {
    let lower = plugin.to_lowercase();
    if lower.ends_with(".esm") {
        0
    } else if lower.ends_with(".esl") {
        1
    } else {
        2
    }
}

pub async fn refresh_profile_metadata(
    nexus: &crate::services::nexus_client::NexusClient,
    profile_id: &str,
) -> crate::error::Result<Vec<crate::db::InstalledMod>> {
    use crate::db;
    use crate::error::NexusDeckError;

    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let mods = db::list_installed_mods(profile_id)?;

    for mut mod_record in mods {
        if !mod_record.category.is_empty() && mod_record.tags_json != "[]" {
            continue;
        }
        if let Ok(detail) = nexus
            .get_mod_detail(&profile.game_domain, mod_record.nexus_mod_id as u64)
            .await
        {
            if mod_record.category.is_empty() {
                mod_record.category = detail.category.clone();
            }
            if mod_record.tags_json == "[]" {
                mod_record.tags_json =
                    serde_json::to_string(&detail.tags).unwrap_or_else(|_| "[]".to_string());
            }
            db::save_installed_mod(&mod_record)?;
        }
    }

    db::list_installed_mods(profile_id)
}

pub fn earliest_plugin_sort_key(plugins: &[String]) -> u8 {
    plugins
        .iter()
        .map(|p| plugin_sort_key(p))
        .min()
        .unwrap_or(3)
}
