use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{NexusDeckError, Result};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::games::ScriptExtenderStatus;
use crate::services::archive::merge_directory;
use crate::services::script_extender_version::{
    resolve_build_for_game, resolve_download_url_for_game,
};
use crate::services::MergeOptions;

pub fn required_script_present(meta: &ScriptExtenderMeta, game_root: &Path) -> bool {
    let Some(script_name) = meta.required_script else {
        return true;
    };

    let data = game_root.join("Data");
    if !data.is_dir() {
        return false;
    }

    for scripts_dir in ["Scripts", "scripts"] {
        let path = data.join(scripts_dir).join(script_name);
        if path.is_file() {
            return true;
        }
    }

    if let Ok(entries) = std::fs::read_dir(&data) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_lowercase();
            if dir_name != "scripts" {
                continue;
            }
            let direct = entry.path().join(script_name);
            if direct.is_file() {
                return true;
            }
            if let Ok(files) = std::fs::read_dir(entry.path()) {
                for file in files.flatten() {
                    if file
                        .file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(script_name)
                    {
                        return true;
                    }
                }
            }
        }
    }

    false
}

pub fn detect_status(meta: &ScriptExtenderMeta, game_root: &Path) -> ScriptExtenderStatus {
    let _ = ensure_loot_scripts_alias(game_root);

    let loader = game_root.join(meta.loader);
    let dll_found = meta.dll_prefix.is_some_and(|prefix| {
        std::fs::read_dir(game_root)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(prefix)
                    && e.path().extension().is_some_and(|ext| ext == "dll")
            })
    });

    let version_report = resolve_build_for_game(meta.domain, game_root).ok();
    let recommended_extender = version_report
        .as_ref()
        .and_then(|r| r.recommended.as_ref())
        .map(|b| b.extender_version.clone());
    let game_version = version_report.as_ref().and_then(|r| r.game_version.clone());
    let extender_game_version = version_report
        .as_ref()
        .and_then(|r| r.installed_extender_game_version.clone());
    let version_compatible = version_report.as_ref().and_then(|r| r.compatible);
    let scripts_installed = meta
        .required_script
        .map(|_| required_script_present(meta, game_root));

    if loader.exists() || dll_found {
        let mut message = format!("{} is installed and ready.", meta.label);
        if scripts_installed == Some(false) {
            message = format!(
                "{meta_label} loader is present but Data/Scripts/{script} is missing. \
                 Re-install {meta_label} from the game hub — extract the full archive including the Data folder.",
                meta_label = meta.label,
                script = meta.required_script.unwrap_or("script.pex")
            );
        } else if version_compatible == Some(false) {
            if let (Some(gv), Some(ev)) = (&game_version, &extender_game_version) {
                message = format!(
                    "{meta_label} is installed for game {ev}, but your game is {gv}. \
                     Re-install {meta_label} to match your game version.",
                    meta_label = meta.label
                );
            }
        } else if let Some(rec) = &recommended_extender {
            message = format!("{} {} installed for game {}.", meta.label, rec, game_version.as_deref().unwrap_or("?"));
        }

        ScriptExtenderStatus {
            installed: true,
            version: recommended_extender.clone().or_else(|| Some(format!("{} installed", meta.label))),
            loader_path: Some(loader.display().to_string()),
            message,
            game_version,
            extender_game_version,
            recommended_extender_version: recommended_extender,
            version_compatible,
            scripts_installed,
        }
    } else {
        let mut message = format!("{} not detected.", meta.label);
        if let (Some(gv), Some(rec)) = (&game_version, &recommended_extender) {
            message = format!(
                "{meta_label} not detected. Your game is {gv} — install {meta_label} {rec}.",
                meta_label = meta.label
            );
        }

        ScriptExtenderStatus {
            installed: false,
            version: None,
            loader_path: None,
            message,
            game_version,
            extender_game_version,
            recommended_extender_version: recommended_extender,
            version_compatible,
            scripts_installed,
        }
    }
}

pub fn install(
    domain: &str,
    game_root: &Path,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    let meta = ScriptExtenderMeta::get(domain)
        .ok_or_else(|| NexusDeckError::GameNotFound(domain.to_string()))?;

    let download_url = resolve_download_url_for_game(meta, game_root)?;

    let temp_dir = std::env::temp_dir().join(format!(
        "nexusdeck-{}-{}",
        meta.label.to_lowercase(),
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&temp_dir)?;
    let archive_path = temp_dir.join("script_extender.archive");

    download_archive(&download_url, &archive_path)?;

    let result = install_from_archive_meta(meta, game_root, &archive_path, configure_steam_launcher);
    let _ = std::fs::remove_dir_all(&temp_dir);
    result
}

pub fn install_from_archive(
    domain: &str,
    game_root: &Path,
    archive_path: &Path,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    let meta = ScriptExtenderMeta::get(domain)
        .ok_or_else(|| NexusDeckError::GameNotFound(domain.to_string()))?;
    install_from_archive_meta(meta, game_root, archive_path, configure_steam_launcher)
}

fn install_from_archive_meta(
    meta: &ScriptExtenderMeta,
    game_root: &Path,
    archive_path: &Path,
    configure_steam_launcher: bool,
) -> Result<ScriptExtenderStatus> {
    if !archive_path.exists() {
        return Err(NexusDeckError::NotFound(format!(
            "Archive not found: {}",
            archive_path.display()
        )));
    }

    let temp_dir = std::env::temp_dir().join(format!(
        "nexusdeck-{}-{}",
        meta.label.to_lowercase(),
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&temp_dir)?;
    let extract_dir = temp_dir.join("extract");

    crate::services::archive::extract_archive(archive_path, &extract_dir)?;
    let extender_root = resolve_extract_root(extract_dir, meta.loader)?;

    merge_directory(
        &extender_root,
        game_root,
        MergeOptions {
            overwrite: true,
            dry_run: false,
            on_progress: None,
        },
    )?;

    ensure_loot_scripts_alias(game_root)?;

    if configure_steam_launcher {
        if let Some(launcher) = meta.launcher_exe {
            patch_steam_launcher(game_root, meta.loader, launcher)?;
        }
    }

    let status = detect_status(meta, game_root);
    if status.scripts_installed == Some(false) {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(NexusDeckError::Other(format!(
            "{} loader files were copied but Data/Scripts/{} is still missing. \
             Download the full {} archive from {} and use Install from file.",
            meta.label,
            meta.required_script.unwrap_or("script.pex"),
            meta.label,
            meta.website_url
        )));
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    Ok(status)
}

/// LOOT on Linux checks `Data/scripts/` (lowercase) while extenders install to `Data/Scripts/`.
#[cfg(unix)]
pub fn ensure_loot_scripts_alias(game_root: &Path) -> Result<()> {
    let data = game_root.join("Data");
    let scripts = data.join("Scripts");
    let scripts_lower = data.join("scripts");

    if !scripts.is_dir() {
        return Ok(());
    }

    if scripts_lower.exists() {
        return Ok(());
    }

    std::os::unix::fs::symlink("Scripts", &scripts_lower).map_err(|e| {
        NexusDeckError::Other(format!(
            "Could not create Data/scripts symlink for LOOT compatibility: {e}"
        ))
    })
}

#[cfg(not(unix))]
pub fn ensure_loot_scripts_alias(_game_root: &Path) -> Result<()> {
    Ok(())
}


pub fn fetch_github_release_asset(repo: &str, asset_prefix: &str) -> Result<String> {
    let api_url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent("NexusDeck/1.0")
        .build()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let response = client
        .get(&api_url)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("GitHub release lookup failed: {e}")))?;

    if !response.status().is_success() {
        return Err(NexusDeckError::Other(format!(
            "GitHub release lookup failed: HTTP {}",
            response.status()
        )));
    }

    let json: serde_json::Value = response
        .json()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let assets = json
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or_else(|| NexusDeckError::Other("No release assets found on GitHub".into()))?;

    for asset in assets {
        let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
        if name.starts_with(asset_prefix)
            && (name.ends_with(".7z") || name.ends_with(".zip"))
        {
            if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
                return Ok(url.to_string());
            }
        }
    }

    Err(NexusDeckError::Other(format!(
        "No matching archive found in latest {repo} release"
    )))
}

fn download_archive(url: &str, dest: &Path) -> Result<()> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent("NexusDeck/1.0")
        .build()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;

    let response = client
        .get(url)
        .send()
        .map_err(|e| NexusDeckError::Other(format!("Download failed: {e}")))?;

    if !response.status().is_success() {
        return Err(NexusDeckError::Other(format!(
            "Download failed: HTTP {}. Use Install from file instead.",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .map_err(|e| NexusDeckError::Other(e.to_string()))?;
    std::fs::write(dest, &bytes)?;
    Ok(())
}

fn resolve_extract_root(extract_dir: PathBuf, loader_name: &str) -> Result<PathBuf> {
    if extract_dir.join(loader_name).exists() {
        return Ok(extract_dir);
    }

    for entry in WalkDir::new(&extract_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(loader_name)
        {
            return Ok(entry.path().parent().unwrap().to_path_buf());
        }
    }

    let top_level: Vec<_> = std::fs::read_dir(&extract_dir)?
        .filter_map(|e| e.ok())
        .collect();
    if top_level.len() == 1 && top_level[0].path().is_dir() {
        let sub = top_level[0].path();
        if sub.join(loader_name).exists() {
            return Ok(sub);
        }
    }

    Err(NexusDeckError::Other(format!(
        "Could not find {loader_name} in the archive. Check you downloaded the correct build for your game version."
    )))
}

fn patch_steam_launcher(
    game_root: &Path,
    loader_name: &str,
    launcher_name: &str,
) -> Result<()> {
    let launcher = game_root.join(launcher_name);
    let loader = game_root.join(loader_name);
    let backup = game_root.join(format!("{launcher_name}.nexusdeck_backup"));

    if !loader.exists() {
        return Err(NexusDeckError::Other(format!(
            "{loader_name} not found after install"
        )));
    }

    if launcher.exists() && !backup.exists() {
        std::fs::rename(&launcher, &backup)?;
    }

    if launcher.exists() {
        std::fs::remove_file(&launcher)?;
    }

    std::fs::copy(&loader, &launcher)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::games::script_extender_meta::ScriptExtenderMeta;
    use std::fs;

    #[test]
    fn detects_missing_f4se_scripts() {
        let root = std::env::temp_dir().join(format!("nexusdeck-f4se-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("f4se_loader.exe"), b"x").unwrap();
        let meta = ScriptExtenderMeta::FALLOUT4;
        assert!(!required_script_present(&meta, &root));
        let status = detect_status(&meta, &root);
        assert_eq!(status.scripts_installed, Some(false));
        assert!(status.message.contains("F4SE.pex"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn detects_present_f4se_scripts() {
        let root = std::env::temp_dir().join(format!("nexusdeck-f4se-test-{}", uuid::Uuid::new_v4()));
        let scripts = root.join("Data").join("Scripts");
        fs::create_dir_all(&scripts).unwrap();
        fs::write(root.join("f4se_loader.exe"), b"x").unwrap();
        fs::write(scripts.join("F4SE.pex"), b"pex").unwrap();
        let meta = ScriptExtenderMeta::FALLOUT4;
        assert!(required_script_present(&meta, &root));
        let status = detect_status(&meta, &root);
        assert_eq!(status.scripts_installed, Some(true));
        let _ = fs::remove_dir_all(&root);
    }
}
