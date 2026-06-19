use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::{
    DeployPlan, DeployTarget, GamePlugin, InstallManifest, LaunchTarget, ScriptExtenderStatus,
};
use crate::services::archive::{merge_directory, ArchiveEntry};
use crate::services::deploy::{
    archive_has_data_folder, has_loose_fallout4_data_folders, merge_game_data_directory,
    normalized_relative_paths, resolve_extract_root,
};
use crate::services::MergeOptions;
use crate::services::paths::default_staging_path;
use crate::services::steam::{find_game_by_app_id, find_game_in_path, GameCandidate};

pub struct Fallout4Plugin;

impl Fallout4Plugin {
    const APP_ID: u32 = 377160;
    const DOMAIN: &'static str = "fallout4";
    const EXECUTABLE: &'static str = "Fallout4.exe";
}

impl GamePlugin for Fallout4Plugin {
    fn domain(&self) -> &str {
        Self::DOMAIN
    }

    fn display_name(&self) -> &str {
        "Fallout 4"
    }

    fn steam_app_id(&self) -> Option<u32> {
        Some(Self::APP_ID)
    }

    fn detect_installation(&self) -> Result<Vec<GameCandidate>> {
        find_game_by_app_id(Self::APP_ID)
    }

    fn default_staging_path(&self) -> PathBuf {
        default_staging_path(Self::DOMAIN)
    }

    fn validate_game_root(&self, path: &Path) -> Result<()> {
        if !path.exists() {
            return Err(NexusDeckError::InvalidGamePath(
                "Path does not exist".into(),
            ));
        }
        if !find_game_in_path(path, Self::EXECUTABLE) {
            return Err(NexusDeckError::InvalidGamePath(format!(
                "{} not found in {}",
                Self::EXECUTABLE,
                path.display()
            )));
        }
        Ok(())
    }

    fn detect_script_extender(&self, game_root: &Path) -> ScriptExtenderStatus {
        crate::services::script_extender::detect_status(
            &crate::games::script_extender_meta::ScriptExtenderMeta::FALLOUT4,
            game_root,
        )
    }

    fn deployment_targets(&self, game_root: &Path) -> Vec<DeployTarget> {
        vec![
            DeployTarget {
                id: "data".to_string(),
                label: "Data folder (plugins, meshes, textures)".to_string(),
                path: game_root.join("Data").display().to_string(),
            },
            DeployTarget {
                id: "root".to_string(),
                label: "Game root (F4SE, DLL loaders)".to_string(),
                path: game_root.display().to_string(),
            },
        ]
    }

    fn analyze_archive(&self, game_root: &Path, entries: &[ArchiveEntry]) -> DeployPlan {
        let rel_paths: Vec<String> = normalized_relative_paths(entries);
        let data_target = game_root.join("Data").display().to_string();

        if archive_has_data_folder(entries) {
            DeployPlan {
                strategy: "merge_data".to_string(),
                source_subpath: Some("Data".to_string()),
                target: data_target,
                requires_confirmation: false,
                description:
                    "Standard mod layout detected. Files will be copied into your game's Data folder."
                        .to_string(),
            }
        } else if rel_paths.iter().any(|p| {
            let lower = p.to_lowercase();
            lower.ends_with(".esp") || lower.ends_with(".esm") || lower.ends_with(".esl")
        }) {
            DeployPlan {
                strategy: "copy_loose_to_data".to_string(),
                source_subpath: None,
                target: data_target,
                requires_confirmation: false,
                description:
                    "Plugin files detected (.esp/.esm). They will be installed into your Data folder."
                        .to_string(),
            }
        } else if has_loose_fallout4_data_folders(&rel_paths) {
            DeployPlan {
                strategy: "merge_loose_to_data".to_string(),
                source_subpath: None,
                target: data_target,
                requires_confirmation: false,
                description:
                    "Asset files detected (meshes, textures, etc.). They will be installed into your Data folder."
                        .to_string(),
            }
        } else {
            DeployPlan {
                strategy: "merge_root".to_string(),
                source_subpath: None,
                target: game_root.display().to_string(),
                requires_confirmation: true,
                description: "This archive doesn't match a usual Fallout 4 layout. Review the file list below, or pick a different install method if something looks wrong."
                    .to_string(),
            }
        }
    }

    fn deploy_extracted(
        &self,
        profile: &Profile,
        extract_dir: &Path,
        plan: &DeployPlan,
        merge_options: MergeOptions,
    ) -> Result<InstallManifest> {
        let game_root = Path::new(&profile.game_path);

        let files = match plan.strategy.as_str() {
            "staging_only" => {
                let staging_dest = Path::new(&profile.staging_path)
                    .join("installed")
                    .join(chrono::Utc::now().timestamp().to_string());
                merge_directory(extract_dir, &staging_dest, merge_options)?
            }
            "merge_data" => {
                let content_root = resolve_extract_root(extract_dir);
                let data_src = content_root.join("Data");
                let data_src = if data_src.exists() {
                    data_src
                } else {
                    content_root.join("data")
                };
                let data_dest = game_root.join("Data");
                if !merge_options.dry_run {
                    std::fs::create_dir_all(&data_dest)?;
                }
                merge_directory(&data_src, &data_dest, merge_options)?
            }
            "copy_loose_to_data" => {
                let data_src = resolve_extract_root(extract_dir);
                let data_dest = game_root.join("Data");
                if !merge_options.dry_run {
                    std::fs::create_dir_all(&data_dest)?;
                }
                merge_game_data_directory(&data_src, &data_dest, merge_options)?
            }
            "merge_loose_to_data" => {
                let content_root = resolve_extract_root(extract_dir);
                let data_dest = game_root.join("Data");
                if !merge_options.dry_run {
                    std::fs::create_dir_all(&data_dest)?;
                }
                merge_directory(&content_root, &data_dest, merge_options)?
            }
            _ => {
                let content_root = resolve_extract_root(extract_dir);
                merge_directory(&content_root, game_root, merge_options)?
            }
        };

        Ok(InstallManifest { files })
    }

    fn launch_targets(&self, game_root: &Path) -> Vec<LaunchTarget> {
        vec![
            LaunchTarget {
                id: "vanilla".to_string(),
                label: "Fallout 4".to_string(),
                executable: game_root.join(Self::EXECUTABLE).display().to_string(),
                is_f4se: false,
            },
            LaunchTarget {
                id: "f4se".to_string(),
                label: "F4SE".to_string(),
                executable: game_root.join("f4se_loader.exe").display().to_string(),
                is_f4se: true,
            },
        ]
    }

    fn process_names(&self) -> Vec<&str> {
        vec!["Fallout4.exe", "Fallout4Launcher.exe"]
    }

    fn plugins_txt_path(&self, profile: &Profile) -> Option<PathBuf> {
        Fallout4Plugin::resolve_plugins_txt_path(profile)
    }

    fn default_launch_args(&self) -> Vec<String> {
        vec![]
    }

    fn deck_performance_args(&self) -> Vec<String> {
        vec!["-high".to_string()]
    }

    fn my_games_folder(&self) -> Option<&str> {
        Some("Fallout4")
    }
}

impl Fallout4Plugin {
    pub fn install_f4se(game_root: &Path, configure_steam_launcher: bool) -> Result<ScriptExtenderStatus> {
        const F4SE_URL: &str = "https://f4se.silverlock.org/beta/f4se_0_06_23.7z";

        let temp_dir = std::env::temp_dir().join(format!("nexusdeck-f4se-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir)?;
        let archive_path = temp_dir.join("f4se.7z");

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| NexusDeckError::Other(e.to_string()))?;

        let response = client
            .get(F4SE_URL)
            .send()
            .map_err(|e| NexusDeckError::Other(format!("F4SE download failed: {e}")))?;

        if !response.status().is_success() {
            return Err(NexusDeckError::Other(format!(
                "F4SE download failed: HTTP {}. Download the archive from f4se.silverlock.org and use Install from file.",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .map_err(|e| NexusDeckError::Other(e.to_string()))?;
        std::fs::write(&archive_path, &bytes)?;

        let result = Self::install_f4se_from_archive(game_root, &archive_path, configure_steam_launcher);
        let _ = std::fs::remove_dir_all(&temp_dir);
        result
    }

    pub fn install_f4se_from_archive(
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

        let temp_dir = std::env::temp_dir().join(format!("nexusdeck-f4se-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir)?;
        let extract_dir = temp_dir.join("extract");

        crate::services::archive::extract_archive(archive_path, &extract_dir)?;
        let f4se_root = Self::resolve_f4se_extract_root(&extract_dir)?;

        merge_directory(
            &f4se_root,
            game_root,
            MergeOptions {
                overwrite: true,
                dry_run: false,
            },
        )?;

        if configure_steam_launcher {
            Self::configure_steam_launcher(game_root)?;
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
        Ok(Fallout4Plugin::detect_f4se_status(game_root))
    }

    fn resolve_f4se_extract_root(extract_dir: &Path) -> Result<PathBuf> {
        if extract_dir.join("f4se_loader.exe").exists() {
            return Ok(extract_dir.to_path_buf());
        }

        for entry in WalkDir::new(extract_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case("f4se_loader.exe")
            {
                return Ok(entry.path().parent().unwrap().to_path_buf());
            }
        }

        let top_level: Vec<_> = std::fs::read_dir(extract_dir)?
            .filter_map(|e| e.ok())
            .collect();
        if top_level.len() == 1 && top_level[0].path().is_dir() {
            let sub = top_level[0].path();
            if sub.join("f4se_loader.exe").exists() {
                return Ok(sub);
            }
        }

        Err(NexusDeckError::Other(
            "Could not find f4se_loader.exe in the archive. Download F4SE from f4se.silverlock.org for your game version.".into(),
        ))
    }

    fn configure_steam_launcher(game_root: &Path) -> Result<()> {
        let launcher = game_root.join("Fallout4Launcher.exe");
        let loader = game_root.join("f4se_loader.exe");
        let backup = game_root.join("Fallout4Launcher.exe.nexusdeck_backup");

        if !loader.exists() {
            return Err(NexusDeckError::Other(
                "f4se_loader.exe not found after install".into(),
            ));
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

    pub fn resolve_plugins_txt_path(profile: &Profile) -> Option<PathBuf> {
        if cfg!(target_os = "windows") {
            dirs::data_local_dir().map(|p| p.join("Fallout4").join("plugins.txt"))
        } else if let Some(ref prefix) = profile.proton_prefix_path {
            let prefix_path = PathBuf::from(prefix);
            for user in ["steamuser", "steam"] {
                let candidate = prefix_path
                    .join("drive_c")
                    .join("users")
                    .join(user)
                    .join("AppData")
                    .join("Local")
                    .join("Fallout4")
                    .join("plugins.txt");
                if candidate.parent().map(|p| p.exists()).unwrap_or(false) {
                    return Some(candidate);
                }
            }
            Some(
                prefix_path
                    .join("drive_c")
                    .join("users")
                    .join("steamuser")
                    .join("AppData")
                    .join("Local")
                    .join("Fallout4")
                    .join("plugins.txt"),
            )
        } else {
            None
        }
    }

    pub fn detect_f4se_status(game_root: &Path) -> ScriptExtenderStatus {
        let loader = game_root.join("f4se_loader.exe");
        let dll = std::fs::read_dir(game_root)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("f4se_")
                    && e.path().extension().is_some_and(|ext| ext == "dll")
            });

        if loader.exists() || dll {
            ScriptExtenderStatus {
                installed: true,
                version: Some("F4SE installed".to_string()),
                loader_path: Some(loader.display().to_string()),
                message: "F4SE is installed and ready.".to_string(),
            }
        } else {
            ScriptExtenderStatus {
                installed: false,
                version: None,
                loader_path: None,
                message: "F4SE not detected.".to_string(),
            }
        }
    }
}
