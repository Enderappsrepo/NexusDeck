use std::path::Path;

use serde::Deserialize;

use crate::error::{NexusDeckError, Result};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::services::game_executable_version::{
    normalize_version_string, parse_extender_dll_version, read_game_executable_version,
};

#[derive(Debug, Clone, Deserialize)]
struct BuildEntry {
    game_version: String,
    extender_version: String,
    download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GameBuildCatalog {
    executable: String,
    dll_prefix: String,
    archive_prefix: String,
    builds: Vec<BuildEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct BuildCatalogFile {
    #[serde(flatten)]
    games: std::collections::HashMap<String, GameBuildCatalog>,
}

#[derive(Debug, Clone)]
pub struct ResolvedScriptExtenderBuild {
    pub game_version: String,
    pub extender_version: String,
    pub download_url: String,
}

#[derive(Debug, Clone)]
pub struct ScriptExtenderVersionReport {
    pub game_version: Option<String>,
    pub installed_extender_game_version: Option<String>,
    pub recommended: Option<ResolvedScriptExtenderBuild>,
    pub compatible: Option<bool>,
}

fn load_catalog() -> BuildCatalogFile {
    serde_json::from_str(include_str!("../games/rules/script_extender_builds.json"))
        .expect("script_extender_builds.json must be valid")
}

fn catalog_for(domain: &str) -> Option<GameBuildCatalog> {
    load_catalog().games.get(domain).cloned()
}

fn version_key(version: &str) -> Vec<u32> {
    version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect()
}

fn versions_compatible(game: &str, target: &str) -> bool {
    let g = version_key(game);
    let t = version_key(target);
    if g.is_empty() || t.is_empty() {
        return false;
    }
    let len = g.len().min(t.len()).max(3).min(g.len()).min(t.len());
    g.iter().zip(t.iter()).take(len).all(|(a, b)| a == b)
}

pub fn detect_installed_extender_game_version(
    game_root: &Path,
    dll_prefix: &str,
) -> Option<String> {
    let prefix = dll_prefix.to_lowercase();
    let entries = std::fs::read_dir(game_root).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.to_lowercase().starts_with(&prefix) && name.to_lowercase().ends_with(".dll") {
            if let Some(v) = parse_extender_dll_version(&name, dll_prefix) {
                return Some(normalize_version_string(&v));
            }
        }
    }
    None
}

pub fn resolve_build_for_game(
    domain: &str,
    game_root: &Path,
) -> Result<ScriptExtenderVersionReport> {
    let Some(catalog) = catalog_for(domain) else {
        return Ok(ScriptExtenderVersionReport {
            game_version: None,
            installed_extender_game_version: detect_installed_extender_game_version(
                game_root,
                ScriptExtenderMeta::get(domain)
                    .and_then(|m| m.dll_prefix)
                    .unwrap_or(""),
            ),
            recommended: None,
            compatible: None,
        });
    };

    let game_version = read_game_executable_version(game_root, &catalog.executable).ok();
    let installed_extender_game_version =
        detect_installed_extender_game_version(game_root, &catalog.dll_prefix);

    let recommended = game_version
        .as_ref()
        .and_then(|gv| pick_build(&catalog, gv));

    let compatible = match (&game_version, &installed_extender_game_version) {
        (Some(g), Some(i)) => Some(versions_compatible(g, i)),
        _ => None,
    };

    Ok(ScriptExtenderVersionReport {
        game_version,
        installed_extender_game_version,
        recommended,
        compatible,
    })
}

fn pick_build(catalog: &GameBuildCatalog, game_version: &str) -> Option<ResolvedScriptExtenderBuild> {
    let normalized = normalize_version_string(game_version);
    if let Some(exact) = catalog
        .builds
        .iter()
        .find(|b| versions_compatible(&normalized, &b.game_version))
    {
        return Some(ResolvedScriptExtenderBuild {
            game_version: exact.game_version.clone(),
            extender_version: exact.extender_version.clone(),
            download_url: exact.download_url.clone(),
        });
    }

    // Fall back to the closest lower build within the same major.minor family.
    let gv = version_key(&normalized);
    catalog
        .builds
        .iter()
        .filter(|b| {
            let bv = version_key(&b.game_version);
            !bv.is_empty()
                && bv[0] == gv.first().copied().unwrap_or(0)
                && (bv.len() < 2 || bv[1] == gv.get(1).copied().unwrap_or(bv[1]))
                && bv <= gv
        })
        .max_by(|a, b| version_key(&a.game_version).cmp(&version_key(&b.game_version)))
        .map(|b| ResolvedScriptExtenderBuild {
            game_version: b.game_version.clone(),
            extender_version: b.extender_version.clone(),
            download_url: b.download_url.clone(),
        })
}

pub fn resolve_download_url_for_game(
    meta: &ScriptExtenderMeta,
    game_root: &Path,
) -> Result<String> {
    if let Some(report) = resolve_build_for_game(meta.domain, game_root)?.recommended {
        return Ok(report.download_url);
    }

    if let Some(url) = meta.download_url {
        return Ok(url.to_string());
    }

    if let (Some(repo), Some(prefix)) = (meta.github_repo, meta.github_asset_prefix) {
        return crate::services::script_extender::fetch_github_release_asset(repo, prefix);
    }

    Err(NexusDeckError::Other(format!(
        "Could not determine the correct {} build for your game version. \
         Check {} and use Install from file.",
        meta.label, meta.website_url
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_exact_f4se_build() {
        let catalog = catalog_for("fallout4").unwrap();
        let build = pick_build(&catalog, "1.10.984.0").unwrap();
        assert_eq!(build.extender_version, "0.7.2");
        assert!(build.download_url.contains("f4se_0_07_02"));
    }

    #[test]
    fn picks_skse_ae_build() {
        let catalog = catalog_for("skyrimspecialedition").unwrap();
        let build = pick_build(&catalog, "1.6.1170").unwrap();
        assert_eq!(build.extender_version, "2.2.6");
    }
}
