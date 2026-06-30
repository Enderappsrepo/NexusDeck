use std::path::{Path, PathBuf};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::games::{
    DeployPlan, DeployTarget, GamePlugin, InstallManifest, LaunchTarget, ScriptExtenderStatus,
};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::services::archive::{merge_directory, ArchiveEntry};
use crate::services::deploy::{
    archive_has_data_folder, has_loose_fallout4_data_folders, has_top_level_script_extender_files,
    merge_game_data_directory, normalized_relative_paths, resolve_extract_root,
};
use crate::services::MergeOptions;
use crate::services::paths::default_staging_path;
use crate::services::steam::{find_game_by_app_id, find_game_in_path, GameCandidate};

#[derive(Debug, Clone, Copy)]
pub struct CreationEngineConfig {
    pub domain: &'static str,
    pub display_name: &'static str,
    pub steam_app_id: u32,
    pub executable: &'static str,
    pub process_names: &'static [&'static str],
    pub script_extender_loader: Option<&'static str>,
    pub script_extender_dll_prefix: Option<&'static str>,
    pub script_extender_label: Option<&'static str>,
    pub my_games_folder: Option<&'static str>,
    pub deck_args: &'static [&'static str],
}

pub struct CreationEnginePlugin {
    config: &'static CreationEngineConfig,
}

impl CreationEnginePlugin {
    pub const SKYRIM_SE: CreationEngineConfig = CreationEngineConfig {
        domain: "skyrimspecialedition",
        display_name: "Skyrim Special Edition",
        steam_app_id: 489830,
        executable: "SkyrimSE.exe",
        process_names: &["SkyrimSE.exe", "SkyrimSELauncher.exe"],
        script_extender_loader: Some("skse64_loader.exe"),
        script_extender_dll_prefix: Some("skse64_"),
        script_extender_label: Some("SKSE"),
        my_games_folder: Some("Skyrim Special Edition"),
        deck_args: &[],
    };

    pub const SKYRIM_LE: CreationEngineConfig = CreationEngineConfig {
        domain: "skyrim",
        display_name: "Skyrim",
        steam_app_id: 72850,
        executable: "TESV.exe",
        process_names: &["TESV.exe", "Skyrim.exe", "SkyrimLauncher.exe"],
        script_extender_loader: Some("skse_loader.exe"),
        script_extender_dll_prefix: Some("skse_"),
        script_extender_label: Some("SKSE"),
        my_games_folder: Some("Skyrim"),
        deck_args: &[],
    };

    pub const FALLOUT_NV: CreationEngineConfig = CreationEngineConfig {
        domain: "falloutnv",
        display_name: "Fallout: New Vegas",
        steam_app_id: 22380,
        executable: "FalloutNV.exe",
        process_names: &["FalloutNV.exe", "FalloutNVLauncher.exe"],
        script_extender_loader: Some("nvse_loader.exe"),
        script_extender_dll_prefix: Some("nvse_"),
        script_extender_label: Some("xNVSE"),
        my_games_folder: Some("FalloutNV"),
        deck_args: &[],
    };

    pub const FALLOUT_3: CreationEngineConfig = CreationEngineConfig {
        domain: "fallout3",
        display_name: "Fallout 3",
        steam_app_id: 22300,
        executable: "Fallout3.exe",
        process_names: &["Fallout3.exe", "Fallout3Launcher.exe"],
        script_extender_loader: Some("fose_loader.exe"),
        script_extender_dll_prefix: Some("fose_"),
        script_extender_label: Some("FOSE"),
        my_games_folder: Some("Fallout3"),
        deck_args: &[],
    };

    pub const STARFIELD: CreationEngineConfig = CreationEngineConfig {
        domain: "starfield",
        display_name: "Starfield",
        steam_app_id: 1716740,
        executable: "Starfield.exe",
        process_names: &["Starfield.exe"],
        script_extender_loader: Some("sfse_loader.exe"),
        script_extender_dll_prefix: Some("sfse_"),
        script_extender_label: Some("SFSE"),
        my_games_folder: Some("Starfield"),
        deck_args: &[],
    };

    pub const OBLIVION: CreationEngineConfig = CreationEngineConfig {
        domain: "oblivion",
        display_name: "Oblivion",
        steam_app_id: 22330,
        executable: "Oblivion.exe",
        process_names: &["Oblivion.exe", "OblivionLauncher.exe"],
        script_extender_loader: Some("obse_loader.exe"),
        script_extender_dll_prefix: Some("obse_"),
        script_extender_label: Some("OBSE"),
        my_games_folder: Some("Oblivion"),
        deck_args: &[],
    };

    pub const ALL: &'static [CreationEngineConfig] = &[
        Self::SKYRIM_LE,
        Self::FALLOUT_NV,
        Self::FALLOUT_3,
        Self::STARFIELD,
        Self::OBLIVION,
    ];

    pub fn find_config(domain: &str) -> Option<&'static CreationEngineConfig> {
        Self::ALL.iter().find(|c| c.domain == domain)
    }

    pub fn new(config: &'static CreationEngineConfig) -> Self {
        Self { config }
    }

    pub fn detect_script_extender_status(&self, game_root: &Path) -> ScriptExtenderStatus {
        if let Some(meta) = ScriptExtenderMeta::get(self.config.domain) {
            return crate::services::script_extender::detect_status(meta, game_root);
        }

        let label = self
            .config
            .script_extender_label
            .unwrap_or("Script extender");
        ScriptExtenderStatus {
            installed: false,
            version: None,
            loader_path: None,
            message: format!("{label} is not configured for this game."),
            game_version: None,
            extender_game_version: None,
            recommended_extender_version: None,
            version_compatible: None,
            scripts_installed: None,
        }
    }

    pub fn resolve_plugins_txt_path(profile: &Profile, folder: &str) -> Option<PathBuf> {
        if cfg!(target_os = "windows") {
            return dirs::data_local_dir().map(|p| p.join(folder).join("plugins.txt"));
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
                .join(folder)
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
                .join(folder)
                .join("plugins.txt"),
        )
    }
}

impl GamePlugin for CreationEnginePlugin {
    fn domain(&self) -> &str {
        self.config.domain
    }

    fn display_name(&self) -> &str {
        self.config.display_name
    }

    fn steam_app_id(&self) -> Option<u32> {
        Some(self.config.steam_app_id)
    }

    fn detect_installation(&self) -> Result<Vec<GameCandidate>> {
        find_game_by_app_id(self.config.steam_app_id)
    }

    fn default_staging_path(&self) -> PathBuf {
        default_staging_path(self.config.domain)
    }

    fn validate_game_root(&self, path: &Path) -> Result<()> {
        if !path.exists() {
            return Err(NexusDeckError::InvalidGamePath(
                "Path does not exist".into(),
            ));
        }
        if !find_game_in_path(path, self.config.executable) {
            return Err(NexusDeckError::InvalidGamePath(format!(
                "{} not found in {}",
                self.config.executable,
                path.display()
            )));
        }
        Ok(())
    }

    fn detect_script_extender(&self, game_root: &Path) -> ScriptExtenderStatus {
        self.detect_script_extender_status(game_root)
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
                label: "Game root (loaders, DLLs)".to_string(),
                path: game_root.display().to_string(),
            },
        ]
    }

    fn analyze_archive(&self, game_root: &Path, entries: &[ArchiveEntry]) -> DeployPlan {
        let rel_paths: Vec<String> = normalized_relative_paths(entries);
        let data_target = game_root.join("Data").display().to_string();
        let game_name = self.config.display_name;

        if has_top_level_script_extender_files(&rel_paths) {
            // SKSE / ENB / proxy-DLL archives carry loader files at the root and
            // often bundle a Data/ folder too. Preserve the whole structure into
            // the game root so loaders land at the root and Data/ lands in Data/
            // (merge_data would copy only Data/ and drop the loader).
            DeployPlan {
                strategy: "merge_root".to_string(),
                source_subpath: None,
                target: game_root.display().to_string(),
                requires_confirmation: false,
                description: format!(
                    "Script extender or loader files detected at the archive root. Files install to the {game_name} folder (loaders at the root, Data/ into Data/)."
                ),
            }
        } else if archive_has_data_folder(entries) {
            DeployPlan {
                strategy: "merge_data".to_string(),
                source_subpath: Some("Data".to_string()),
                target: data_target,
                requires_confirmation: false,
                description: format!(
                    "Standard {game_name} mod layout detected. Files will be copied into your game's Data folder."
                ),
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
                target: data_target.clone(),
                requires_confirmation: false,
                description:
                    "Plugin files detected (.esp/.esm). They will be installed into your Data folder."
                        .to_string(),
            }
        } else {
            DeployPlan {
                strategy: "merge_root".to_string(),
                source_subpath: None,
                target: game_root.display().to_string(),
                requires_confirmation: true,
                description: format!(
                    "This archive doesn't match a usual {game_name} layout. Review the file list before installing."
                ),
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
        let mut targets = vec![LaunchTarget {
            id: "vanilla".to_string(),
            label: self.config.display_name.to_string(),
            executable: game_root
                .join(self.config.executable)
                .display()
                .to_string(),
            is_f4se: false,
        }];

        if let Some(loader) = self.config.script_extender_loader {
            targets.push(LaunchTarget {
                id: "script_extender".to_string(),
                label: self
                    .config
                    .script_extender_label
                    .unwrap_or("Script Extender")
                    .to_string(),
                executable: game_root.join(loader).display().to_string(),
                is_f4se: true,
            });
        }

        targets
    }

    fn process_names(&self) -> Vec<&str> {
        self.config.process_names.to_vec()
    }

    fn plugins_txt_path(&self, profile: &Profile) -> Option<PathBuf> {
        self.config
            .my_games_folder
            .and_then(|folder| CreationEnginePlugin::resolve_plugins_txt_path(profile, folder))
    }

    fn deck_performance_args(&self) -> Vec<String> {
        self.config.deck_args.iter().map(|s| s.to_string()).collect()
    }

    fn my_games_folder(&self) -> Option<&str> {
        self.config.my_games_folder
    }
}

pub fn box_plugin(config: &'static CreationEngineConfig) -> Box<dyn GamePlugin> {
    Box::new(CreationEnginePlugin::new(config))
}
