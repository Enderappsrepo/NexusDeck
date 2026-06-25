use crate::error::Result;
use crate::services::prefix_manager;
use crate::services::proton_audio;
use crate::services::proton_deps;
use crate::services::proton_log::ProtonLogger;
use crate::services::protontricks_health;

fn load_profile(profile_id: &str) -> Result<crate::db::Profile> {
    crate::db::get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))
}

fn try_load_profile(profile_id: &str) -> Option<crate::db::Profile> {
    crate::db::get_profile(profile_id).ok().flatten()
}

fn new_proton_logger(category: &str, app: &tauri::AppHandle) -> Option<ProtonLogger> {
    ProtonLogger::new(category, Some(app.clone())).ok()
}

#[tauri::command]
pub fn get_protontricks_info() -> proton_deps::ProtontricksInfo {
    proton_deps::detect_protontricks()
}

#[tauri::command]
pub fn check_prefix_status(
    profile_id: Option<String>,
    proton_prefix_path: Option<String>,
    my_games_folder: String,
) -> prefix_manager::PrefixStatus {
    let resolved_path = if let Some(id) = profile_id {
        if let Ok(Some(profile)) = crate::db::get_profile(&id) {
            prefix_manager::ensure_proton_prefix(&profile)
                .ok()
                .and_then(|p| p.proton_prefix_path)
        } else {
            None
        }
    } else {
        None
    };
    let effective = resolved_path
        .as_deref()
        .or(proton_prefix_path.as_deref().filter(|s| !s.is_empty()));
    prefix_manager::prefix_status(effective, &my_games_folder)
}

#[tauri::command]
pub fn bootstrap_vanilla_launch(app_id: u32) -> Result<prefix_manager::BootstrapResult> {
    prefix_manager::bootstrap_vanilla_launch(app_id)
}

#[tauri::command]
pub fn check_proton_version(app_id: u32) -> Result<prefix_manager::ProtonVersionInfo> {
    prefix_manager::check_proton_version(app_id)
}

#[tauri::command]
pub fn backup_proton_prefix(proton_prefix: String, dest_zip: String) -> Result<prefix_manager::PrefixBackupResult> {
    prefix_manager::backup_prefix(&proton_prefix, &dest_zip)
}

#[tauri::command]
pub fn restore_proton_prefix(proton_prefix: String, src_zip: String) -> Result<String> {
    prefix_manager::restore_prefix(&proton_prefix, &src_zip)
}

#[tauri::command]
pub async fn detect_protontricks() -> proton_deps::ProtontricksInfo {
    tokio::task::spawn_blocking(proton_deps::detect_protontricks)
        .await
        .unwrap_or_else(|_| proton_deps::ProtontricksInfo {
            available: false,
            command: String::new(),
            message: "Protontricks detection failed.".into(),
            kind: "none".into(),
        })
}

#[tauri::command]
pub async fn check_protontricks_health(
    app: tauri::AppHandle,
) -> Result<protontricks_health::ProtontricksHealth> {
    tokio::task::spawn_blocking(move || {
        let logger = new_proton_logger("health", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header("Protontricks health check", "");
        }
        protontricks_health::check_protontricks_health(logger.as_ref())
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Health check failed: {e}")))?
}

#[tauri::command]
pub async fn fix_protontricks_error(app: tauri::AppHandle) -> Result<protontricks_health::ProtontricksFixResult> {
    tokio::task::spawn_blocking(move || {
        let logger = new_proton_logger("health", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header("Protontricks crash fix", "");
        }
        protontricks_health::fix_protontricks_shortcuts(logger.as_ref())
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Protontricks fix failed: {e}")))?
}

#[tauri::command]
pub async fn repair_protontricks(app: tauri::AppHandle) -> Result<protontricks_health::ProtontricksRepairResult> {
    tokio::task::spawn_blocking(move || {
        let logger = new_proton_logger("health", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header("Protontricks repair", "");
        }
        protontricks_health::repair_protontricks(logger.as_ref())
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Protontricks repair failed: {e}")))?
}

#[tauri::command]
pub async fn install_proton_deps(
    app: tauri::AppHandle,
    game_domain: String,
    dry_run: bool,
    profile_id: Option<String>,
    proton_prefix_path: Option<String>,
) -> Result<proton_deps::ProtonDepsResult> {
    tokio::task::spawn_blocking(move || {
        let profile = profile_id.as_deref().and_then(try_load_profile).map(|p| {
            prefix_manager::ensure_proton_prefix(&p).unwrap_or(p)
        });
        let effective_prefix = profile
            .as_ref()
            .and_then(|p| p.proton_prefix_path.as_deref())
            .filter(|s| !s.is_empty())
            .or(proton_prefix_path.as_deref().filter(|s| !s.is_empty()));

        let logger = new_proton_logger("deps", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header(
                "Proton dependency install",
                &format!(
                    "game_domain={game_domain} dry_run={dry_run} profile_id={} prefix_path={}",
                    profile_id.as_deref().unwrap_or("(none)"),
                    effective_prefix.unwrap_or("(auto-detect)")
                ),
            );
        }
        let emit = |p: proton_deps::ProtonDepProgress| {
            use tauri::Emitter;
            if let Some(ref log) = logger {
                log.info(
                    "progress",
                    &format!(
                        "{} {}/{} — {}{}",
                        p.package,
                        p.index,
                        p.total,
                        p.status,
                        p.detail
                            .as_ref()
                            .map(|d| format!(" ({d})"))
                            .unwrap_or_default()
                    ),
                );
            }
            let _ = app.emit("proton-deps:progress", p);
        };
        if let Some(profile) = profile {
            return proton_deps::install_game_deps_for_profile_with_progress(
                &profile, dry_run, &emit, logger.as_ref(),
            );
        }
        if let Some(id) = profile_id {
            if let Some(ref log) = logger {
                log.warn(
                    "profile",
                    &format!("Profile id {id} not in database — installing for {game_domain} without profile hint"),
                );
            }
        }
        let hint = proton_prefix_path.as_deref();
        proton_deps::install_game_deps_with_progress_hint(
            &game_domain,
            dry_run,
            hint,
            &emit,
            logger.as_ref(),
        )
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Proton deps install failed: {e}")))?
}

#[tauri::command]
pub async fn verify_proton_deps(
    app: tauri::AppHandle,
    profile_id: Option<String>,
    game_domain: Option<String>,
) -> Result<proton_deps::DepsVerification> {
    tokio::task::spawn_blocking(move || {
        let logger = new_proton_logger("verify", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header(
                "Proton dependency verification",
                &format!(
                    "profile_id={} game_domain={}",
                    profile_id.as_deref().unwrap_or("(none)"),
                    game_domain.as_deref().unwrap_or("(none)")
                ),
            );
        }
        let result = (|| {
            if let Some(id) = profile_id {
                if let Some(profile) = try_load_profile(&id) {
                    let profile = prefix_manager::ensure_proton_prefix(&profile).unwrap_or(profile);
                    return proton_deps::verify_deps_for_profile(&profile);
                }
            }
            let domain = game_domain.ok_or_else(|| {
                crate::error::NexusDeckError::NotFound(
                    "No profile or game selected for dependency check.".into(),
                )
            })?;
            proton_deps::verify_deps_for_domain(&domain, None)
        })();
        if let Some(ref log) = logger {
            match &result {
                Ok(v) => log.info(
                    "verify",
                    &format!(
                        "satisfied={} present={} missing={}",
                        v.satisfied,
                        v.present.join(","),
                        v.missing.join(",")
                    ),
                ),
                Err(e) => log.error("verify", &e.to_string()),
            }
        }
        result
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Deps verification failed: {e}")))?
}

#[tauri::command]
pub async fn collect_proton_diagnostics(app: tauri::AppHandle, profile_id: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let logger = new_proton_logger("diagnostics", &app);
        if let Some(ref log) = logger {
            let _ = log.write_header("Proton diagnostics collection", &format!("profile_id={profile_id}"));
        }
        let result = crate::services::diagnostics::collect_proton_diagnostics(&profile_id);
        if let Some(ref log) = logger {
            match &result {
                Ok(report) => {
                    log.info("diagnostics", &format!("Report generated ({} bytes)", report.len()));
                    log.debug("diagnostics", report);
                }
                Err(e) => log.error("diagnostics", &e.to_string()),
            }
        }
        result
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Diagnostics failed: {e}")))?
}

#[tauri::command]
pub async fn get_bethesda_audio_status(profile_id: String) -> Result<proton_audio::BethesdaAudioStatus> {
    let profile_id = profile_id;
    tokio::task::spawn_blocking(move || {
        let profile = load_profile(&profile_id)?;
        proton_audio::get_bethesda_audio_status(&profile)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Audio status failed: {e}")))?
}

#[tauri::command]
pub async fn fix_bethesda_audio(
    app: tauri::AppHandle,
    profile_id: String,
) -> Result<proton_audio::BethesdaAudioStatus> {
    tokio::task::spawn_blocking(move || {
        let profile = load_profile(&profile_id)?;
        let logger = new_proton_logger("audio", &app);
        proton_audio::ensure_bethesda_audio(&profile, logger.as_ref())
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Audio fix failed: {e}")))?
}

#[tauri::command]
pub fn backup_profile_prefix(profile_id: String, dest_zip: String) -> Result<prefix_manager::PrefixBackupResult> {
    crate::services::autofix::applicator::backup_prefix_to(&profile_id, &dest_zip)
}

#[tauri::command]
pub fn restore_profile_prefix(profile_id: String, src_zip: String) -> Result<String> {
    crate::services::autofix::applicator::restore_prefix_from(&profile_id, &src_zip)
}
