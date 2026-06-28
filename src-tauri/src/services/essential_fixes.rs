use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::error::{NexusDeckError, Result};
use crate::games::script_extender_meta::ScriptExtenderMeta;
use crate::services::autofix;
use crate::services::proton_audio;
use crate::services::proton_deps;
use crate::services::script_extender;
use crate::services::wake_lock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EssentialFixStep {
    pub id: String,
    pub label: String,
    pub remedy_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EssentialFixesManifest {
    pub id: String,
    pub domain: String,
    pub display_name: String,
    pub steps: Vec<EssentialFixStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EssentialFixStepResult {
    pub id: String,
    pub label: String,
    pub success: bool,
    pub skipped: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EssentialFixesResult {
    pub steps: Vec<EssentialFixStepResult>,
}

fn load_manifest(domain: &str) -> Result<EssentialFixesManifest> {
    let raw = match domain {
        "fallout4" => include_str!("../knowledge/fallout4/essential_fixes.json"),
        "skyrimspecialedition" | "skyrimse" => {
            include_str!("../knowledge/skyrim/essential_fixes.json")
        }
        other => {
            return Err(NexusDeckError::GameNotFound(format!(
                "No essential fixes manifest for {other}"
            )));
        }
    };
    serde_json::from_str(raw).map_err(|e| NexusDeckError::Other(format!("Invalid manifest: {e}")))
}

fn emit_progress(app: &AppHandle, profile_id: &str, step: &str, message: &str) {
    let _ = app.emit(
        "essential-fixes:progress",
        serde_json::json!({
            "profile_id": profile_id,
            "step": step,
            "message": message,
        }),
    );
}

pub fn get_essential_fixes_manifest(domain: &str) -> Result<EssentialFixesManifest> {
    load_manifest(domain)
}

pub fn apply_essential_fixes(app: &AppHandle, profile_id: &str) -> Result<EssentialFixesResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let manifest = load_manifest(&profile.game_domain)?;
    let _ = wake_lock::acquire("NexusDeck essential fixes");

    let mut step_results = Vec::new();

    for step in &manifest.steps {
        emit_progress(app, profile_id, &step.id, &step.label);

        let result = match step.id.as_str() {
            "proton_deps" => run_proton_deps(app, profile_id, &step.label),
            "bethesda_audio" => run_bethesda_audio(app, profile_id, &profile.game_domain, &step.label),
            "script_extender" => run_script_extender(app, profile_id, &profile, &step.label),
            "archive_invalidation" | "plugins_sync" => {
                if let Some(ref remedy_id) = step.remedy_id {
                    match autofix::apply_fix(profile_id, remedy_id) {
                        Ok(r) => {
                            let msg = r
                                .results
                                .first()
                                .map(|x| x.message.clone())
                                .unwrap_or_else(|| "Applied".into());
                            let skipped = r.results.first().is_some_and(|x| x.skipped);
                            EssentialFixStepResult {
                                id: step.id.clone(),
                                label: step.label.clone(),
                                success: !skipped,
                                skipped,
                                message: msg,
                            }
                        }
                        Err(e) => EssentialFixStepResult {
                            id: step.id.clone(),
                            label: step.label.clone(),
                            success: false,
                            skipped: false,
                            message: e.to_string(),
                        },
                    }
                } else {
                    EssentialFixStepResult {
                        id: step.id.clone(),
                        label: step.label.clone(),
                        success: true,
                        skipped: true,
                        message: "No remedy configured".into(),
                    }
                }
            }
            _ => EssentialFixStepResult {
                id: step.id.clone(),
                label: step.label.clone(),
                success: true,
                skipped: true,
                message: "Unknown step".into(),
            },
        };

        step_results.push(result);
    }

    emit_progress(app, profile_id, "safe_autofixes", "Applying safe autofixes");
    match autofix::apply_safe_fixes(profile_id) {
        Ok(r) => {
            step_results.push(EssentialFixStepResult {
                id: "safe_autofixes".into(),
                label: "Safe autofixes".into(),
                success: true,
                skipped: r.results.is_empty(),
                message: if r.results.is_empty() {
                    "Nothing to fix".into()
                } else {
                    format!("Applied {} fixes", r.results.iter().filter(|x| x.applied).count())
                },
            });
        }
        Err(e) => {
            step_results.push(EssentialFixStepResult {
                id: "safe_autofixes".into(),
                label: "Safe autofixes".into(),
                success: false,
                skipped: false,
                message: e.to_string(),
            });
        }
    }

    let _ = wake_lock::release();
    let _ = app.emit(
        "essential-fixes:complete",
        serde_json::json!({ "profile_id": profile_id }),
    );

    Ok(EssentialFixesResult {
        steps: step_results,
    })
}

fn run_proton_deps(app: &AppHandle, profile_id: &str, label: &str) -> EssentialFixStepResult {
    let id = "proton_deps".to_string();
    let profile = match db::get_profile(profile_id) {
        Ok(Some(p)) => p,
        _ => {
            return EssentialFixStepResult {
                id,
                label: label.to_string(),
                success: false,
                skipped: false,
                message: "Profile not found".into(),
            };
        }
    };
    match proton_deps::verify_deps_for_profile(&profile) {
        Ok(v) if v.missing.is_empty() => EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: true,
            message: "Proton dependencies already installed".into(),
        },
        _ => match proton_deps::install_game_deps_for_profile(&profile, false) {
            Ok(_) => EssentialFixStepResult {
                id,
                label: label.to_string(),
                success: true,
                skipped: false,
                message: "Proton dependencies installed".into(),
            },
            Err(e) => {
                emit_progress(app, profile_id, "proton_deps", &e.to_string());
                EssentialFixStepResult {
                    id,
                    label: label.to_string(),
                    success: false,
                    skipped: false,
                    message: e.to_string(),
                }
            }
        },
    }
}

fn run_bethesda_audio(
    app: &AppHandle,
    profile_id: &str,
    domain: &str,
    label: &str,
) -> EssentialFixStepResult {
    let id = "bethesda_audio".to_string();
    if !proton_audio::is_bethesda_game(domain) {
        return EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: true,
            message: "Not a Bethesda title".into(),
        };
    }
    let profile = match db::get_profile(profile_id) {
        Ok(Some(p)) => p,
        _ => {
            return EssentialFixStepResult {
                id,
                label: label.to_string(),
                success: false,
                skipped: false,
                message: "Profile not found".into(),
            };
        }
    };
    match proton_audio::ensure_bethesda_audio(&profile, None) {
        Ok(st) if st.ready => EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: st.dll_override_applied && st.xact_installed,
            message: st.message.unwrap_or_else(|| "Bethesda audio ready".into()),
        },
        Ok(st) => EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: false,
            skipped: false,
            message: st
                .message
                .unwrap_or_else(|| "Bethesda audio fix incomplete".into()),
        },
        Err(e) => {
            emit_progress(app, profile_id, "bethesda_audio", &e.to_string());
            EssentialFixStepResult {
                id,
                label: label.to_string(),
                success: false,
                skipped: false,
                message: e.to_string(),
            }
        }
    }
}

fn run_script_extender(
    app: &AppHandle,
    profile_id: &str,
    profile: &db::Profile,
    label: &str,
) -> EssentialFixStepResult {
    let id = "script_extender".to_string();
    let Some(meta) = ScriptExtenderMeta::get(&profile.game_domain) else {
        return EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: true,
            message: "No script extender for this game".into(),
        };
    };

    let game_root = std::path::Path::new(&profile.game_path);
    let status = script_extender::detect_status(meta, game_root);
    if status.installed && status.version_compatible.unwrap_or(true) {
        return EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: true,
            message: format!("{} already installed", meta.label),
        };
    }

    match script_extender::install(&profile.game_domain, game_root, true) {
        Ok(st) if st.installed => EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: true,
            skipped: false,
            message: format!("{} installed", meta.label),
        },
        Ok(st) => EssentialFixStepResult {
            id,
            label: label.to_string(),
            success: false,
            skipped: false,
            message: st
                .version
                .map(|v| format!("Install incomplete (detected {v})"))
                .unwrap_or_else(|| "Install incomplete".into()),
        },
        Err(e) => {
            emit_progress(app, profile_id, "script_extender", &e.to_string());
            EssentialFixStepResult {
                id,
                label: label.to_string(),
                success: false,
                skipped: false,
                message: e.to_string(),
            }
        }
    }
}
