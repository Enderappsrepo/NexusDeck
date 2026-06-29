use std::path::{Path, PathBuf};

use serde_json::json;

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::{
    DeployPlan, DeployTarget, GamePlugin, InstallManifest, LaunchTarget, ScriptExtenderStatus,
    WizardStepResult,
};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::services::archive::{merge_directory, ArchiveEntry};
use crate::services::deploy::{
    archive_has_data_folder, archive_is_script_extender_plugin_pack,
    has_loose_fallout4_data_folders, has_script_extender_plugin_paths,
    has_script_extender_root_files, merge_game_data_directory, normalized_relative_paths,
    resolve_extract_root,
};
use crate::services::MergeOptions;
use crate::services::paths::default_staging_path;
use crate::services::prefix_manager;
use crate::services::proton_deps;
use crate::services::steam::{find_game_by_app_id, find_game_in_path, GameCandidate};

pub struct SkyrimSpecialEditionPlugin;

impl SkyrimSpecialEditionPlugin {
    pub const APP_ID: u32 = 489830;
    pub const DOMAIN: &'static str = "skyrimspecialedition";
    const EXECUTABLE: &'static str = "SkyrimSE.exe";
    const MY_GAMES: &'static str = "Skyrim Special Edition";
}

impl GamePlugin for SkyrimSpecialEditionPlugin {
    fn domain(&self) -> &str {
        Self::DOMAIN
    }

    fn display_name(&self) -> &str {
        "Skyrim Special Edition"
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
            &ScriptExtenderMeta::SKYRIM_SE,
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
                label: "Game root (SKSE, DLL loaders)".to_string(),
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
                    "Standard Skyrim SE mod layout detected. Files will be copied into your game's Data folder."
                        .to_string(),
            }
        } else if has_loose_fallout4_data_folders(&rel_paths) {
            DeployPlan {
                strategy: "merge_loose_to_data".to_string(),
                source_subpath: None,
                target: data_target.clone(),
                requires_confirmation: false,
                description:
                    "Asset files detected (meshes, textures, etc.). They will be installed into your Data folder."
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
        } else if has_script_extender_root_files(&rel_paths) {
            DeployPlan {
                strategy: "merge_root".to_string(),
                source_subpath: None,
                target: game_root.display().to_string(),
                requires_confirmation: true,
                description:
                    "SKSE or loader files detected at archive root. These will be installed to the game folder."
                        .to_string(),
            }
        } else if has_script_extender_plugin_paths(&rel_paths)
            || archive_is_script_extender_plugin_pack(&rel_paths)
        {
            DeployPlan {
                strategy: "merge_loose_to_data".to_string(),
                source_subpath: None,
                target: data_target.clone(),
                requires_confirmation: false,
                description:
                    "SKSE plugin or MCM files detected. They will be installed into your Data folder."
                        .to_string(),
            }
        } else {
            DeployPlan {
                strategy: "merge_root".to_string(),
                source_subpath: None,
                target: game_root.display().to_string(),
                requires_confirmation: true,
                description:
                    "This archive doesn't match a usual Skyrim SE layout. Review the file list before installing."
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
                label: "Skyrim Special Edition".to_string(),
                executable: game_root.join(Self::EXECUTABLE).display().to_string(),
                is_f4se: false,
            },
            LaunchTarget {
                id: "skse".to_string(),
                label: "SKSE".to_string(),
                executable: game_root.join("skse64_loader.exe").display().to_string(),
                is_f4se: true,
            },
        ]
    }

    fn process_names(&self) -> Vec<&str> {
        vec![
            "SkyrimSE.exe",
            "SkyrimSELauncher.exe",
            "skse64_loader.exe",
        ]
    }

    fn plugins_txt_path(&self, profile: &Profile) -> Option<PathBuf> {
        Self::resolve_plugins_txt_path(profile)
    }

    fn deck_performance_args(&self) -> Vec<String> {
        vec![]
    }

    fn my_games_folder(&self) -> Option<&str> {
        Some(Self::MY_GAMES)
    }
}

impl SkyrimSpecialEditionPlugin {
    pub fn resolve_plugins_txt_path(profile: &Profile) -> Option<PathBuf> {
        if cfg!(target_os = "windows") {
            return dirs::data_local_dir().map(|p| {
                p.join("Skyrim Special Edition")
                    .join("plugins.txt")
            });
        }

        let prefix = profile.proton_prefix_path.as_ref()?;
        let prefix_path = PathBuf::from(prefix);
        for user in ["steamuser", "steam"] {
            let candidate = prefix_path
                .join("drive_c")
                .join("users")
                .join(user)
                .join("AppData")
                .join("Local")
                .join(Self::MY_GAMES)
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
                .join(Self::MY_GAMES)
                .join("plugins.txt"),
        )
    }

    pub fn run_wizard_step(step: &str, payload: serde_json::Value) -> Result<WizardStepResult> {
        match step {
            "verify_prefix" => {
                let prefix = payload
                    .get("proton_prefix_path")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                let status = prefix_manager::prefix_status(prefix.as_deref(), Self::MY_GAMES);
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: status.exists,
                    data: serde_json::to_value(&status)?,
                    message: status.message,
                })
            }
            "bootstrap_vanilla" => {
                let app_id = payload
                    .get("app_id")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(Self::APP_ID as u64) as u32;
                let result = prefix_manager::bootstrap_vanilla_launch(app_id)?;
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: result.launched || result.prefix_exists,
                    data: serde_json::to_value(&result)?,
                    message: result.message,
                })
            }
            "check_proton_version" => {
                let app_id = payload
                    .get("app_id")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(Self::APP_ID as u64) as u32;
                let info = prefix_manager::check_proton_version(app_id)?;
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: info.compatible,
                    data: serde_json::to_value(&info)?,
                    message: info.message,
                })
            }
            "install_proton_deps" => {
                let dry_run = payload
                    .get("dry_run")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let result = proton_deps::install_game_deps(Self::DOMAIN, dry_run)?;
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: result.success,
                    data: serde_json::to_value(&result)?,
                    message: result.message,
                })
            }
            "detect_skse" => {
                let path = payload
                    .get("game_path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| NexusDeckError::Other("Missing game_path".into()))?;
                let plugin = SkyrimSpecialEditionPlugin;
                let status = plugin.detect_script_extender(Path::new(path));
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: status.installed,
                    data: serde_json::to_value(&status)?,
                    message: status.message,
                })
            }
            "sd_card_warning" => {
                let library_path = payload
                    .get("library_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let on_sd = prefix_manager::is_likely_removable_drive(library_path);
                Ok(WizardStepResult {
                    step: step.to_string(),
                    success: true,
                    data: json!({ "on_removable": on_sd, "library_path": library_path }),
                    message: if on_sd {
                        "Game is on removable storage (SD card). Use staging folder on internal storage for best performance.".to_string()
                    } else {
                        "Game library looks fine for mod staging.".to_string()
                    },
                })
            }
            _ => Err(NexusDeckError::Other(format!(
                "Unknown Skyrim SE wizard step: {step}"
            ))),
        }
    }
}
