//! Scaffold for adding future games to the launch system.
//! Copy this pattern when implementing Skyrim SE, Starfield, etc.

use std::path::{Path, PathBuf};

use crate::db::Profile;
use crate::error::Result;
use crate::games::{
    DeployPlan, DeployTarget, GamePlugin, InstallManifest, LaunchTarget, ScriptExtenderStatus,
};
use crate::services::archive::ArchiveEntry;
use crate::services::MergeOptions;

#[allow(dead_code)]
pub struct SkyrimSeScaffold;

#[allow(dead_code)]
impl GamePlugin for SkyrimSeScaffold {
    fn domain(&self) -> &str {
        "skyrimse"
    }

    fn display_name(&self) -> &str {
        "Skyrim Special Edition"
    }

    fn steam_app_id(&self) -> Option<u32> {
        Some(489830)
    }

    fn detect_installation(&self) -> Result<Vec<crate::services::steam::GameCandidate>> {
        crate::services::steam::find_game_by_app_id(489830)
    }

    fn default_staging_path(&self) -> PathBuf {
        crate::services::paths::default_staging_path("skyrimse")
    }

    fn validate_game_root(&self, path: &Path) -> Result<()> {
        if !path.join("SkyrimSE.exe").exists() {
            return Err(crate::error::NexusDeckError::InvalidGamePath(
                "SkyrimSE.exe not found".into(),
            ));
        }
        Ok(())
    }

    fn detect_script_extender(&self, _game_root: &Path) -> ScriptExtenderStatus {
        ScriptExtenderStatus {
            installed: false,
            version: None,
            loader_path: None,
            message: "SKSE detection not implemented".into(),
            game_version: None,
            extender_game_version: None,
            recommended_extender_version: None,
            version_compatible: None,
            scripts_installed: None,
        }
    }

    fn deployment_targets(&self, game_root: &Path) -> Vec<DeployTarget> {
        vec![DeployTarget {
            id: "data".into(),
            label: "Data folder".into(),
            path: game_root.join("Data").display().to_string(),
        }]
    }

    fn analyze_archive(&self, game_root: &Path, _entries: &[ArchiveEntry]) -> DeployPlan {
        DeployPlan {
            strategy: "merge_data".into(),
            source_subpath: Some("Data".into()),
            target: game_root.join("Data").display().to_string(),
            requires_confirmation: false,
            description: "Scaffold deploy plan".into(),
                copy_rules: None,
        }
    }

    fn deploy_extracted(
        &self,
        _profile: &Profile,
        _extract_dir: &Path,
        _plan: &DeployPlan,
        _merge_options: MergeOptions,
    ) -> Result<InstallManifest> {
        Ok(InstallManifest { files: vec![] })
    }

    fn launch_targets(&self, game_root: &Path) -> Vec<LaunchTarget> {
        vec![LaunchTarget {
            id: "vanilla".into(),
            label: "Skyrim SE".into(),
            executable: game_root.join("SkyrimSE.exe").display().to_string(),
            is_f4se: false,
        }]
    }

    fn process_names(&self) -> Vec<&str> {
        vec!["SkyrimSE.exe"]
    }

    fn plugins_txt_path(&self, _profile: &Profile) -> Option<PathBuf> {
        None
    }
}
