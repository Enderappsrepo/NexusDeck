use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{NexusDeckError, Result};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::games::ScriptExtenderStatus;
use crate::services::archive::merge_directory;
use crate::services::MergeOptions;

pub fn detect_status(meta: &ScriptExtenderMeta, game_root: &Path) -> ScriptExtenderStatus {
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

    if loader.exists() || dll_found {
        ScriptExtenderStatus {
            installed: true,
            version: Some(format!("{} installed", meta.label)),
            loader_path: Some(loader.display().to_string()),
            message: format!("{} is installed and ready.", meta.label),
        }
    } else {
        ScriptExtenderStatus {
            installed: false,
            version: None,
            loader_path: None,
            message: format!("{} not detected.", meta.label),
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

    let download_url = resolve_download_url(meta)?;

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

    if configure_steam_launcher {
        if let Some(launcher) = meta.launcher_exe {
            patch_steam_launcher(game_root, meta.loader, launcher)?;
        }
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    Ok(detect_status(meta, game_root))
}

fn resolve_download_url(meta: &ScriptExtenderMeta) -> Result<String> {
    if let Some(url) = meta.download_url {
        return Ok(url.to_string());
    }

    if let (Some(repo), Some(prefix)) = (meta.github_repo, meta.github_asset_prefix) {
        return fetch_github_release_asset(repo, prefix);
    }

    Err(NexusDeckError::Other(format!(
        "{} must be installed manually. Download from {} and use Install from file.",
        meta.label, meta.website_url
    )))
}

fn fetch_github_release_asset(repo: &str, asset_prefix: &str) -> Result<String> {
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
