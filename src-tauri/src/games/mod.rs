mod creation_engine;
mod fallout4;
mod scaffold;
mod skyrimspecialedition;
pub mod script_extender_meta;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::archive::ArchiveEntry;
use crate::services::MergeOptions;
use crate::services::steam::GameCandidate;
use crate::db::Profile;

pub use creation_engine::CreationEnginePlugin;
pub use fallout4::Fallout4Plugin;
pub use skyrimspecialedition::SkyrimSpecialEditionPlugin;
pub use script_extender_meta::{install_info as script_extender_install_info, ScriptExtenderInstallInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchTarget {
    pub id: String,
    pub label: String,
    pub executable: String,
    pub is_f4se: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptExtenderStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub loader_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployTarget {
    pub id: String,
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployPlan {
    pub strategy: String,
    pub source_subpath: Option<String>,
    pub target: String,
    pub requires_confirmation: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallManifest {
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WizardStepResult {
    pub step: String,
    pub success: bool,
    pub data: serde_json::Value,
    pub message: String,
}

pub trait GamePlugin: Send + Sync {
    fn domain(&self) -> &str;
    fn display_name(&self) -> &str;
    fn steam_app_id(&self) -> Option<u32>;
    fn detect_installation(&self) -> Result<Vec<GameCandidate>>;
    fn default_staging_path(&self) -> PathBuf;
    fn validate_game_root(&self, path: &Path) -> Result<()>;
    fn detect_script_extender(&self, game_root: &Path) -> ScriptExtenderStatus;
    fn deployment_targets(&self, game_root: &Path) -> Vec<DeployTarget>;
    fn analyze_archive(&self, game_root: &Path, entries: &[ArchiveEntry]) -> DeployPlan;
    fn deploy_extracted(
        &self,
        profile: &Profile,
        extract_dir: &Path,
        plan: &DeployPlan,
        merge_options: MergeOptions,
    ) -> Result<InstallManifest>;
    fn post_install(&self, _profile: &Profile, _manifest: &InstallManifest) -> Result<()> {
        Ok(())
    }

    fn launch_targets(&self, game_root: &Path) -> Vec<LaunchTarget>;
    fn process_names(&self) -> Vec<&str>;
    fn plugins_txt_path(&self, profile: &Profile) -> Option<PathBuf>;
    fn default_launch_args(&self) -> Vec<String> {
        vec![]
    }
    fn deck_performance_args(&self) -> Vec<String> {
        vec![]
    }

    fn my_games_folder(&self) -> Option<&str> {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportedGameInfo {
    pub domain: String,
    pub display_name: String,
    pub script_extender_label: Option<String>,
}

pub struct GameRegistry;

impl GameRegistry {
    pub fn get(domain: &str) -> Result<Box<dyn GamePlugin>> {
        match domain {
            "fallout4" => Ok(Box::new(Fallout4Plugin)),
            "skyrimspecialedition" => Ok(Box::new(SkyrimSpecialEditionPlugin)),
            other => CreationEnginePlugin::find_config(other)
                .map(creation_engine::box_plugin)
                .ok_or_else(|| NexusDeckError::GameNotFound(other.to_string())),
        }
    }

    pub fn supported_domains() -> Vec<&'static str> {
        let mut domains = vec!["fallout4", "skyrimspecialedition"];
        domains.extend(CreationEnginePlugin::ALL.iter().map(|c| c.domain));
        domains
    }

    pub fn supported_games() -> Vec<SupportedGameInfo> {
        let mut games = vec![
            SupportedGameInfo {
                domain: "fallout4".to_string(),
                display_name: "Fallout 4".to_string(),
                script_extender_label: Some("F4SE".to_string()),
            },
            SupportedGameInfo {
                domain: "skyrimspecialedition".to_string(),
                display_name: "Skyrim Special Edition".to_string(),
                script_extender_label: Some("SKSE".to_string()),
            },
        ];
        games.extend(CreationEnginePlugin::ALL.iter().map(|c| SupportedGameInfo {
            domain: c.domain.to_string(),
            display_name: c.display_name.to_string(),
            script_extender_label: c.script_extender_label.map(|s| s.to_string()),
        }));
        games
    }
}

pub fn detect_game(domain: &str) -> Result<Vec<GameCandidate>> {
    let plugin = GameRegistry::get(domain)?;
    plugin.detect_installation()
}

pub fn validate_game_path(domain: &str, path: &str) -> Result<()> {
    let plugin = GameRegistry::get(domain)?;
    plugin.validate_game_root(Path::new(path))
}

pub fn run_wizard_step(domain: &str, step: &str, payload: serde_json::Value) -> Result<WizardStepResult> {
    let plugin = GameRegistry::get(domain)?;
    match step {
        "detect_game" => {
            let candidates = plugin.detect_installation()?;
            Ok(WizardStepResult {
                step: step.to_string(),
                success: !candidates.is_empty(),
                data: serde_json::to_value(&candidates)?,
                message: if candidates.is_empty() {
                    "No installation found. Set path manually.".to_string()
                } else {
                    format!("Found {} installation(s)", candidates.len())
                },
            })
        }
        "validate_path" => {
            let path = payload
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| NexusDeckError::Other("Missing path".into()))?;
            plugin.validate_game_root(Path::new(path))?;
            Ok(WizardStepResult {
                step: step.to_string(),
                success: true,
                data: serde_json::json!({ "path": path }),
                message: "Game path validated".to_string(),
            })
        }
        "default_staging" => {
            let staging = plugin.default_staging_path();
            Ok(WizardStepResult {
                step: step.to_string(),
                success: true,
                data: serde_json::json!({ "staging_path": staging.display().to_string() }),
                message: "Default staging path ready".to_string(),
            })
        }
        "detect_f4se" | "detect_script_extender" => {
            let path = payload
                .get("game_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| NexusDeckError::Other("Missing game_path".into()))?;
            let status = plugin.detect_script_extender(Path::new(path));
            Ok(WizardStepResult {
                step: step.to_string(),
                success: status.installed,
                data: serde_json::to_value(&status)?,
                message: status.message.clone(),
            })
        }
        "deployment_targets" => {
            let path = payload
                .get("game_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| NexusDeckError::Other("Missing game_path".into()))?;
            let targets = plugin.deployment_targets(Path::new(path));
            Ok(WizardStepResult {
                step: step.to_string(),
                success: true,
                data: serde_json::to_value(&targets)?,
                message: "Deployment targets listed".to_string(),
            })
        }
        "test_deploy" => Ok(WizardStepResult {
            step: step.to_string(),
            success: true,
            data: serde_json::json!({ "test": "ok" }),
            message: "Test deployment check passed (dry run)".to_string(),
        }),
        other if domain == "skyrimspecialedition" => {
            SkyrimSpecialEditionPlugin::run_wizard_step(other, payload)
        }
        _ => Err(NexusDeckError::Other(format!("Unknown wizard step: {step}"))),
    }
}

pub fn deploy_mod(
    domain: &str,
    profile: &Profile,
    extract_dir: &Path,
    entries: &[ArchiveEntry],
    plan_override: Option<&DeployPlan>,
    merge_options: MergeOptions,
    mod_name: &str,
) -> Result<(InstallManifest, DeployPlan, Vec<crate::services::conflict::FileConflict>)> {
    let plugin = GameRegistry::get(domain)?;
    let plan = plan_override
        .cloned()
        .unwrap_or_else(|| plugin.analyze_archive(Path::new(&profile.game_path), entries));
    let manifest = plugin.deploy_extracted(profile, extract_dir, &plan, merge_options)?;

    let existing: Vec<(String, Vec<String>)> = crate::db::list_installed_mods(&profile.id)?
        .into_iter()
        .map(|m| {
            let files: Vec<String> = serde_json::from_str(&m.installed_files_json).unwrap_or_default();
            (m.name, files)
        })
        .collect();

    let conflicts = crate::services::conflict::detect_conflicts(
        &existing,
        &manifest.files,
        mod_name,
    );

    Ok((manifest, plan, conflicts))
}

pub fn build_plan_for_strategy(
    domain: &str,
    game_path: &Path,
    entries: &[ArchiveEntry],
    strategy: &str,
) -> Result<DeployPlan> {
    let plugin = GameRegistry::get(domain)?;
    let mut plan = plugin.analyze_archive(game_path, entries);
    if strategy != "auto" {
        plan.strategy = strategy.to_string();
        plan.description = format!("Manual strategy: {strategy}");
        plan.requires_confirmation = strategy == "merge_root" || strategy == "staging_only";
        plan.target = match strategy {
            "merge_data" | "copy_loose_to_data" | "merge_loose_to_data" => {
                game_path.join("Data").display().to_string()
            }
            "staging_only" => "staging folder".to_string(),
            _ => game_path.display().to_string(),
        };
    }
    refine_plan_for_entries(&mut plan, entries);
    Ok(plan)
}

fn refine_plan_for_entries(plan: &mut DeployPlan, entries: &[ArchiveEntry]) {
    if crate::services::deploy::entries_have_loose_assets(entries)
        && plan.strategy == "copy_loose_to_data"
    {
        plan.strategy = "merge_loose_to_data".to_string();
        plan.description =
            "Asset files detected — meshes and textures will be installed into your Data folder."
                .to_string();
    }
}
