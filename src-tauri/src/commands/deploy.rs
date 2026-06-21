use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db::{self, InstalledMod};
use crate::error::Result;
use crate::games;
use crate::services::archive::list_archive_entries;
use crate::services::deploy::{
    archive_top_level_folders, compute_deploy_paths, filter_deploy_paths,
    resolve_install_overwrite,
};
use crate::services::load_order::plugins_json_from_manifest;
use crate::services::mod_state::{apply_mod_enabled_state, backup_installed_files};
use crate::services::plugins_txt;
use crate::services::update_checker;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptions {
    pub strategy: String,
    pub enable_mod: bool,
    pub overwrite_files: bool,
    #[serde(default)]
    pub selected_options: Vec<crate::services::install_options::SelectedInstallOption>,
    #[serde(default)]
    pub prepared_extract_dir: Option<String>,
    #[serde(default)]
    pub wizard_hash: Option<String>,
    #[serde(default)]
    pub dry_run: bool,
}

impl Default for InstallOptions {
    fn default() -> Self {
        Self {
            strategy: "auto".to_string(),
            enable_mod: true,
            overwrite_files: false,
            selected_options: Vec::new(),
            prepared_extract_dir: None,
            wizard_hash: None,
            dry_run: false,
        }
    }
}

impl InstallOptions {
    /// Strip ephemeral paths before persisting to the database.
    pub fn for_storage(&self) -> Self {
        let mut stored = self.clone();
        stored.prepared_extract_dir = None;
        stored
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FomodWizardState {
    pub wizard: crate::services::install_options::InstallWizard,
    pub active_flags: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallPreview {
    pub entries: Vec<crate::services::archive::ArchiveEntry>,
    pub deploy_files: Vec<String>,
    pub plan: games::DeployPlan,
    pub conflicts: Vec<crate::services::conflict::FileConflict>,
    pub file_count: usize,
    pub skipped_existing: usize,
    pub strategies: Vec<StrategyOption>,
    pub archive_folders: Vec<String>,
    pub option_groups: Vec<crate::services::install_options::InstallOptionGroup>,
    pub default_selections: Vec<crate::services::install_options::SelectedInstallOption>,
    pub install_wizard_required: bool,
    pub install_wizard: Option<crate::services::install_options::InstallWizard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallPrepareResult {
    pub prepared_extract_dir: String,
    pub option_groups: Vec<crate::services::install_options::InstallOptionGroup>,
    pub default_selections: Vec<crate::services::install_options::SelectedInstallOption>,
    pub entry_count: usize,
    pub archive_folders: Vec<String>,
    pub install_wizard: Option<crate::services::install_options::InstallWizard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyOption {
    pub id: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub profile_id: String,
    pub mod_name: String,
    pub phase: String,
    pub stage: String,
    pub message: String,
    pub files_done: u32,
    pub files_total: u32,
    pub current_file: Option<String>,
}

fn basic_plan_for_profile(profile: &db::Profile, strategy: &str) -> Result<games::DeployPlan> {
    games::build_plan_for_strategy(
        &profile.game_domain,
        PathBuf::from(&profile.game_path).as_path(),
        &[],
        strategy,
    )
}

fn emit_install_progress(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("install:progress", &progress);
}

fn install_progress(
    app: &AppHandle,
    profile_id: &str,
    mod_name: &str,
    stage: &str,
    message: &str,
) -> InstallProgress {
    let progress = InstallProgress {
        profile_id: profile_id.to_string(),
        mod_name: mod_name.to_string(),
        phase: "install".into(),
        stage: stage.to_string(),
        message: message.to_string(),
        files_done: 0,
        files_total: 0,
        current_file: None,
    };
    emit_install_progress(app, progress.clone());
    progress
}

fn preview_progress(
    app: &AppHandle,
    profile_id: &str,
    mod_name: &str,
    stage: &str,
    message: &str,
    files_total: u32,
) {
    emit_install_progress(
        app,
        InstallProgress {
            profile_id: profile_id.to_string(),
            mod_name: mod_name.to_string(),
            phase: "preview".into(),
            stage: stage.to_string(),
            message: message.to_string(),
            files_done: 0,
            files_total,
            current_file: None,
        },
    );
}

fn install_progress_detailed(
    app: &AppHandle,
    profile_id: &str,
    mod_name: &str,
    stage: &str,
    message: &str,
    files_done: u32,
    files_total: u32,
    current_file: Option<String>,
) {
    emit_install_progress(
        app,
        InstallProgress {
            profile_id: profile_id.to_string(),
            mod_name: mod_name.to_string(),
            phase: "install".into(),
            stage: stage.to_string(),
            message: message.to_string(),
            files_done,
            files_total,
            current_file,
        },
    );
}

fn extract_progress_message(
    percent: u8,
    files_done: u32,
    files_total: u32,
    using_native_7z: bool,
) -> String {
    if percent >= 99 {
        return "Finishing extraction…".to_string();
    }
    if percent >= 90 {
        return if files_total > 0 {
            format!(
                "Almost done — extracting ({percent}% · {files_done} / {files_total} files)"
            )
        } else {
            format!("Almost done — extracting archive ({percent}%)")
        };
    }
    if percent >= 1 {
        return if files_total > 0 {
            format!("Extracting archive… {percent}% ({files_done} / {files_total} files)")
        } else {
            format!("Extracting archive… {percent}%")
        };
    }
    if files_total > 0 && percent == 0 && files_done == 0 {
        if using_native_7z {
            return format!("Starting extraction… ({files_total} files in archive)");
        }
        return format!(
            "Extracting with built-in decompressor ({files_total} files) — install 7-Zip for faster extraction"
        );
    }
    if files_total > 0 && percent == 0 && files_done > 0 {
        return format!(
            "Decompressing archive… {files_done} / {files_total} files processed"
        );
    }
    if files_total > 0 {
        format!("Starting extraction… ({files_total} files in archive)")
    } else {
        "Starting extraction…".to_string()
    }
}

fn extract_progress_reporter(
    app: AppHandle,
    profile_id: String,
    mod_name: String,
    using_native_7z: bool,
) -> crate::services::archive_options::ExtractProgressFn {
    let last_emit = Arc::new(Mutex::new(Instant::now()));
    Arc::new(move |event| {
        let mut last = last_emit.lock().unwrap();
        let should_emit = event.percent >= 100
            || last.elapsed() >= Duration::from_millis(150);
        if !should_emit {
            return;
        }
        *last = Instant::now();
        let message = extract_progress_message(
            event.percent,
            event.files_done,
            event.files_total,
            using_native_7z,
        );
        emit_install_progress(
            &app,
            InstallProgress {
                profile_id: profile_id.clone(),
                mod_name: mod_name.clone(),
                phase: "install".into(),
                stage: "extracting".into(),
                message,
                files_done: event.files_done,
                files_total: event.files_total,
                current_file: event.current_file,
            },
        );
    })
}

fn merge_progress_reporter(
    app: AppHandle,
    profile_id: String,
    mod_name: String,
) -> crate::services::archive_options::MergeProgressFn {
    let last_emit = Arc::new(Mutex::new(Instant::now()));
    Arc::new(move |event| {
        let mut last = last_emit.lock().unwrap();
        let should_emit = event.files_done >= event.files_total
            || last.elapsed() >= Duration::from_millis(200);
        if !should_emit {
            return;
        }
        *last = Instant::now();
        emit_install_progress(
            &app,
            InstallProgress {
                profile_id: profile_id.clone(),
                mod_name: mod_name.clone(),
                phase: "install".into(),
                stage: "deploying".into(),
                message: format!(
                    "Copying files to game folder ({}/{})…",
                    event.files_done, event.files_total
                ),
                files_done: event.files_done as u32,
                files_total: event.files_total as u32,
                current_file: Some(event.current_file.clone()),
            },
        );
    })
}

fn available_strategies() -> Vec<StrategyOption> {
    vec![
        StrategyOption {
            id: "auto".into(),
            label: "Automatic (recommended)".into(),
            description: "Detect the best layout from archive structure".into(),
        },
        StrategyOption {
            id: "merge_data".into(),
            label: "Merge into Data/".into(),
            description: "Copy archive Data/ folder into the game Data/ directory".into(),
        },
        StrategyOption {
            id: "copy_loose_to_data".into(),
            label: "Copy loose files to Data/".into(),
            description: "Copy .esp, .ba2, and related files into Data/".into(),
        },
        StrategyOption {
            id: "merge_root".into(),
            label: "Install to game root".into(),
            description: "Copy files to the Fallout 4 root folder (DLLs, loaders)".into(),
        },
        StrategyOption {
            id: "staging_only".into(),
            label: "Extract to staging only".into(),
            description: "Do not modify game files — keep a copy in your staging folder".into(),
        },
    ]
}

fn preview_conflicts(
    profile_id: &str,
    deploy_files: &[String],
    mod_name: &str,
) -> Result<Vec<crate::services::conflict::FileConflict>> {
    let existing: Vec<(String, Vec<String>)> = db::list_installed_mods(profile_id)?
        .into_iter()
        .map(|m| {
            let files: Vec<String> =
                serde_json::from_str(&m.installed_files_json).unwrap_or_default();
            (m.name, files)
        })
        .collect();

    Ok(crate::services::conflict::detect_conflicts(
        &existing,
        deploy_files,
        mod_name,
    ))
}

fn fomod_wizard_plan(profile: &db::Profile) -> Result<games::DeployPlan> {
    let mut plan = basic_plan_for_profile(profile, "auto")?;
    plan.requires_confirmation = false;
    plan.description =
        "This mod uses FOMOD. Extract the archive to choose install components before deploying."
            .to_string();
    Ok(plan)
}

#[tauri::command]
pub async fn preview_mod_install(
    app: AppHandle,
    profile_id: String,
    archive_path: String,
    mod_name: String,
    strategy: String,
    selected_options: Option<Vec<crate::services::install_options::SelectedInstallOption>>,
    prepared_extract_dir: Option<String>,
) -> Result<InstallPreview> {
    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&archive_path);
    let extract_dir = prepared_extract_dir.as_ref().map(PathBuf::from);

    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "reading_archive",
        if extract_dir.is_some() {
            "Reading extracted files…"
        } else {
            "Reading archive contents…"
        },
        0,
    );

    let all_entries = if let Some(ref dir) = extract_dir {
        let dir = dir.clone();
        tokio::task::spawn_blocking(move || crate::services::archive::list_extracted_entries(&dir))
            .await
            .map_err(|e| {
                crate::error::NexusDeckError::Other(format!("Extract analysis failed: {e}"))
            })??
    } else {
        let archive_for_list = archive.clone();
        tokio::task::spawn_blocking(move || list_archive_entries(&archive_for_list))
            .await
            .map_err(|e| crate::error::NexusDeckError::Other(format!("Archive analysis failed: {e}")))??
    };

    let entry_count = all_entries.len() as u32;
    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "reading_archive",
        &format!("Found {entry_count} file(s)"),
        entry_count,
    );

    let install_wizard_required = if extract_dir.is_some() {
        false
    } else if !crate::services::install_options::archive_has_fomod_config(&all_entries) {
        false
    } else if crate::services::install_options::should_defer_fomod_detection(&archive, &all_entries)
    {
        true
    } else {
        false
    };

    if install_wizard_required {
        let archive_folders = archive_top_level_folders(&all_entries);
        preview_progress(
            &app,
            &profile_id,
            &mod_name,
            "complete",
            "FOMOD installer — extract to configure options",
            entry_count,
        );
        return Ok(InstallPreview {
            file_count: all_entries.len(),
            skipped_existing: 0,
            deploy_files: Vec::new(),
            entries: all_entries.into_iter().take(100).collect(),
            plan: fomod_wizard_plan(&profile)?,
            conflicts: Vec::new(),
            strategies: available_strategies(),
            archive_folders,
            option_groups: Vec::new(),
            default_selections: Vec::new(),
            install_wizard_required: true,
            install_wizard: None,
        });
    }

    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "install_options",
        "Checking for install options…",
        entry_count,
    );

    let (option_groups, install_wizard) = if let Some(ref dir) = extract_dir {
        let dir = dir.clone();
        let archive_for_wizard = archive.clone();
        let entries_for_options = all_entries.clone();
        let wizard = tokio::task::spawn_blocking(move || {
            crate::services::install_options::detect_install_wizard_from_dir(
                &archive_for_wizard,
                &dir,
                &entries_for_options,
            )
        })
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Install option analysis failed: {e}"))
        })?;
        let groups = wizard.flattened_groups();
        let wizard =
            if crate::services::install_options::wizard_has_install_rules(&wizard) {
                Some(wizard)
            } else {
                None
            };
        (groups, wizard)
    } else {
        let archive_for_options = archive.clone();
        let entries_for_options = all_entries.clone();
        let (groups, wizard) = tokio::task::spawn_blocking(move || {
            let wizard = crate::services::install_options::detect_fomod_wizard(
                &archive_for_options,
                &entries_for_options,
            );
            let groups = if let Some(ref w) = wizard {
                w.flattened_groups()
            } else {
                crate::services::install_options::detect_install_option_groups(
                    &archive_for_options,
                    &entries_for_options,
                )
            };
            (groups, wizard)
        })
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Install option analysis failed: {e}"))
        })?;
        (groups, wizard)
    };

    let options_message = if option_groups.is_empty() {
        "No optional install components found".to_string()
    } else {
        format!("Found {} install option group(s)", option_groups.len())
    };
    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "install_options",
        &options_message,
        entry_count,
    );

    let default_selections =
        crate::services::install_options::default_selections(&option_groups);
    let selections = selected_options.unwrap_or(default_selections.clone());
    let entries = crate::services::install_options::apply_install_selections(
        &all_entries,
        &option_groups,
        &selections,
        install_wizard.as_ref(),
    );

    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "deploy_plan",
        "Planning deployment…",
        entry_count,
    );

    let game_path = PathBuf::from(&profile.game_path);
    let plan = games::build_plan_for_strategy(
        &profile.game_domain,
        game_path.as_path(),
        &entries,
        &strategy,
    )?;

    let deploy_files = compute_deploy_paths(&plan, &entries, game_path.as_path());
    let (planned, skipped_existing) = filter_deploy_paths(&deploy_files, false);

    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "deploy_plan",
        &format!("{} file(s) will be deployed", planned.len()),
        planned.len() as u32,
    );

    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "conflicts",
        "Checking for conflicts…",
        planned.len() as u32,
    );
    let conflicts = preview_conflicts(&profile.id, &planned, &mod_name)?;
    let archive_folders = archive_top_level_folders(&entries);

    let complete_message = if conflicts.is_empty() {
        "Ready to install".to_string()
    } else {
        format!("{} potential conflict(s) found", conflicts.len())
    };
    preview_progress(
        &app,
        &profile_id,
        &mod_name,
        "complete",
        &complete_message,
        planned.len() as u32,
    );

    Ok(InstallPreview {
        file_count: planned.len(),
        skipped_existing,
        deploy_files: planned,
        entries: entries.into_iter().take(100).collect(),
        plan,
        conflicts,
        strategies: available_strategies(),
        archive_folders,
        option_groups,
        default_selections,
        install_wizard_required: false,
        install_wizard,
    })
}

#[tauri::command]
pub async fn prepare_mod_install(
    app: AppHandle,
    profile_id: String,
    archive_path: String,
    mod_name: String,
) -> Result<InstallPrepareResult> {
    use uuid::Uuid;

    use crate::services::archive::{extract_archive_fast_with_progress, list_archive_entries};
    use crate::services::paths::install_work_dir;

    let _profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&archive_path);
    let archive_for_count = archive.clone();
    let entry_count = tokio::task::spawn_blocking(move || list_archive_entries(&archive_for_count))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Archive analysis failed: {e}")))??
        .len() as u32;

    let using_native_7z = crate::services::archive::has_7z_executable();
    install_progress_detailed(
        &app,
        &profile_id,
        &mod_name,
        "extracting",
        &extract_progress_message(0, 0, entry_count, using_native_7z),
        0,
        entry_count,
        None,
    );

    let temp_extract = install_work_dir()?.join(format!("nexusdeck-prepare-{}", Uuid::new_v4()));
    let archive_for_extract = archive.clone();
    let extract_dir = temp_extract.clone();
    let progress =
        extract_progress_reporter(app.clone(), profile_id.clone(), mod_name.clone(), using_native_7z);
    tokio::task::spawn_blocking(move || {
        extract_archive_fast_with_progress(
            &archive_for_extract,
            &extract_dir,
            entry_count,
            Some(progress),
        )
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Extract failed: {e}")))??;

    install_progress_detailed(
        &app,
        &profile_id,
        &mod_name,
        "extracting",
        "Reading install options…",
        entry_count,
        entry_count,
        None,
    );

    let extract_dir_for_list = temp_extract.clone();
    let entries = tokio::task::spawn_blocking(move || {
        crate::services::archive::list_extracted_entries(&extract_dir_for_list)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Extract analysis failed: {e}")))??;

    let archive_for_wizard = archive.clone();
    let extract_dir_for_options = temp_extract.clone();
    let entries_for_options = entries.clone();
    let install_wizard = tokio::task::spawn_blocking(move || {
        crate::services::install_options::detect_install_wizard_from_dir(
            &archive_for_wizard,
            &extract_dir_for_options,
            &entries_for_options,
        )
    })
    .await
    .map_err(|e| {
        crate::error::NexusDeckError::Other(format!("Install option analysis failed: {e}"))
    })?;
    let option_groups = install_wizard.flattened_groups();
    let install_wizard =
        if crate::services::install_options::wizard_has_install_rules(&install_wizard) {
            Some(install_wizard)
        } else {
            None
        };

    let default_selections =
        crate::services::install_options::default_selections(&option_groups);
    let archive_folders = archive_top_level_folders(&entries);

    emit_install_progress(
        &app,
        InstallProgress {
            profile_id: profile_id.clone(),
            mod_name: mod_name.clone(),
            phase: "install".into(),
            stage: "complete".into(),
            message: format!(
                "Extracted {} file(s) — configure install options",
                entries.len()
            ),
            files_done: entries.len() as u32,
            files_total: entries.len() as u32,
            current_file: None,
        },
    );

    Ok(InstallPrepareResult {
        prepared_extract_dir: temp_extract.display().to_string(),
        option_groups,
        default_selections,
        entry_count: entries.len(),
        archive_folders,
        install_wizard,
    })
}

#[tauri::command]
pub async fn install_mod_from_archive(
    app: AppHandle,
    profile_id: String,
    mod_name: String,
    nexus_mod_id: i64,
    nexus_file_id: i64,
    archive_path: String,
    options: InstallOptions,
    category: Option<String>,
    tags: Option<Vec<String>>,
    file_version: Option<String>,
    replace_mod_id: Option<String>,
) -> Result<serde_json::Value> {
    use uuid::Uuid;

    use crate::services::archive::{extract_archive_fast_with_progress, extract_nested_archives, list_extracted_entries};
    use crate::services::install_rollback::{deploy_with_rollback, ensure_deploy_not_empty};
    use crate::services::install_session::InstallSession;
    use crate::services::install_validate::validate_fallout4_install;
    use crate::services::paths::install_work_dir;
    use crate::services::MergeOptions;

    install_progress(
        &app,
        &profile_id,
        &mod_name,
        "preparing",
        "Preparing install…",
    );

    let profile = db::get_profile(&profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&archive_path);
    let mut session = InstallSession::new(
        Some(app.clone()),
        mod_name.clone(),
        nexus_mod_id,
        nexus_file_id,
        archive.clone(),
        profile.clone(),
    )?;

    let mut options = options;
    session.info("preparing", "Resolving install options…");

    let explicit_replace = replace_mod_id.clone();
    let matching_mods: Vec<_> = db::list_installed_mods(&profile_id)?
        .into_iter()
        .filter(|m| m.nexus_mod_id == nexus_mod_id)
        .collect();
    let replace_mod_id = explicit_replace.clone().or_else(|| {
        matching_mods.first().map(|m| m.id.clone())
    });

    if let Some(ref target_id) = replace_mod_id {
        for dup in matching_mods.iter().filter(|m| m.id != *target_id) {
            let _ = db::delete_installed_mod(&dup.id);
        }
    }

    if replace_mod_id.is_some() && explicit_replace.is_none() {
        if let Some(ref existing_id) = replace_mod_id {
            if let Some(existing) = db::get_installed_mod(existing_id)? {
                crate::services::mod_uninstall::remove_mod_files_for_update(&profile, &existing)?;
            }
        }
    }

    let using_prepared = options.prepared_extract_dir.is_some();
    let temp_extract = if let Some(ref prepared) = options.prepared_extract_dir {
        PathBuf::from(prepared)
    } else {
        install_work_dir()?.join(format!("nexusdeck-install-{}", Uuid::new_v4()))
    };

    let mut all_entries = if using_prepared {
        let extract_dir = temp_extract.clone();
        tokio::task::spawn_blocking(move || list_extracted_entries(&extract_dir))
            .await
            .map_err(|e| crate::error::NexusDeckError::Other(format!("Extract analysis failed: {e}")))??
    } else {
        let archive_for_list = archive.clone();
        tokio::task::spawn_blocking(move || list_archive_entries(&archive_for_list))
            .await
            .map_err(|e| crate::error::NexusDeckError::Other(format!("Archive analysis failed: {e}")))??
    };

    let (option_groups, fomod_wizard) = if using_prepared {
        let extract_dir = temp_extract.clone();
        let archive_for_options = archive.clone();
        let entries_for_options = all_entries.clone();
        tokio::task::spawn_blocking(move || {
            let wizard = crate::services::install_options::detect_install_wizard_from_dir(
                &archive_for_options,
                &extract_dir,
                &entries_for_options,
            );
            let groups = wizard.flattened_groups();
            (groups, Some(wizard))
        })
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Install option analysis failed: {e}"))
        })?
    } else {
        let archive_for_options = archive.clone();
        let entries_for_options = all_entries.clone();
        tokio::task::spawn_blocking(move || {
            let wizard = crate::services::install_options::detect_fomod_wizard(
                &archive_for_options,
                &entries_for_options,
            );
            let groups = if let Some(ref w) = wizard {
                w.flattened_groups()
            } else {
                crate::services::install_options::detect_install_option_groups(
                    &archive_for_options,
                    &entries_for_options,
                )
            };
            (groups, wizard)
        })
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Install option analysis failed: {e}"))
        })?
    };

    let selections = if options.selected_options.is_empty() {
        crate::services::install_options::default_selections(&option_groups)
    } else {
        options.selected_options.clone()
    };
    let entries = crate::services::install_options::apply_install_selections(
        &all_entries,
        &option_groups,
        &selections,
        fomod_wizard.as_ref(),
    );

    if !option_groups.is_empty() {
        crate::services::install_options::validate_fomod_selection_deploy(
            &option_groups,
            &selections,
            &entries,
            fomod_wizard.as_ref(),
        )?;
    }

    let plan = games::build_plan_for_strategy(
        &profile.game_domain,
        PathBuf::from(&profile.game_path).as_path(),
        &entries,
        &options.strategy,
    )?;

    if !using_prepared {
        let entry_count = all_entries.len() as u32;
        let using_native_7z = crate::services::archive::has_7z_executable();
        install_progress_detailed(
            &app,
            &profile_id,
            &mod_name,
            "extracting",
            &extract_progress_message(0, 0, entry_count, using_native_7z),
            0,
            entry_count,
            None,
        );
        let archive_for_extract = archive.clone();
        let extract_dir = temp_extract.clone();
        let progress = extract_progress_reporter(
            app.clone(),
            profile_id.clone(),
            mod_name.clone(),
            using_native_7z,
        );
        tokio::task::spawn_blocking(move || {
            extract_archive_fast_with_progress(
                &archive_for_extract,
                &extract_dir,
                entry_count,
                Some(progress),
            )
        })
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Extract failed: {e}")))??;
    }

    let extract_dir_for_nested = temp_extract.clone();
    let nested_count = tokio::task::spawn_blocking(move || {
        extract_nested_archives(&extract_dir_for_nested, 2)
    })
    .await
    .map_err(|e| crate::error::NexusDeckError::Other(format!("Nested extract failed: {e}")))??;
    if nested_count > 0 {
        session.info(
            "extract",
            &format!("Extracted {nested_count} nested archive(s)"),
        );
        let extract_dir_refresh = temp_extract.clone();
        all_entries = tokio::task::spawn_blocking(move || {
            list_extracted_entries(&extract_dir_refresh)
        })
        .await
        .map_err(|e| {
            crate::error::NexusDeckError::Other(format!("Extract analysis failed: {e}"))
        })??;
    }

    crate::services::install_options::prune_extract_dir(&temp_extract, &all_entries, &entries)?;

    install_progress(
        &app,
        &profile_id,
        &mod_name,
        "deploying",
        "Copying files to game folder…",
    );

    let game_path = PathBuf::from(&profile.game_path);
    let overwrite = resolve_install_overwrite(
        options.overwrite_files,
        replace_mod_id.is_some(),
        &plan,
        &entries,
        game_path.as_path(),
    );

    session.set_phase("deploy");
    session.info(
        "plan",
        &format!(
            "Deploy strategy: {} — {}",
            plan.strategy, plan.description
        ),
    );

    let mod_id = replace_mod_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let deploy_paths = compute_deploy_paths(&plan, &entries, game_path.as_path());
    let (planned_paths, _) = filter_deploy_paths(&deploy_paths, overwrite);

    let merge_options = MergeOptions {
        overwrite,
        dry_run: options.dry_run,
        on_progress: Some(merge_progress_reporter(
            app.clone(),
            profile_id.clone(),
            mod_name.clone(),
        )),
    };

    let domain = profile.game_domain.clone();
    let profile_for_deploy = profile.clone();
    let temp_extract_deploy = temp_extract.clone();
    let entries_deploy = entries.clone();
    let plan_for_deploy = plan.clone();
    let merge_options_deploy = merge_options.clone();
    let mod_name_deploy = mod_name.clone();

    let deploy_result = deploy_with_rollback(
        &mut session,
        &profile,
        &mod_id,
        &planned_paths,
        || {
            games::deploy_mod(
                &domain,
                &profile_for_deploy,
                &temp_extract_deploy,
                &entries_deploy,
                Some(&plan_for_deploy),
                merge_options_deploy,
                &mod_name_deploy,
            )
        },
    );

    let (manifest_files, plan, conflicts) = match deploy_result {
        Ok(result) => result,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_extract);
            session.log_error_with_path("deploy", &e);
            return Err(crate::error::NexusDeckError::Other(format!(
                "{e}\n\nFull log: {}",
                session.log_path.display()
            )));
        }
    };

    if let Err(e) = ensure_deploy_not_empty(
        &manifest_files,
        option_groups.len(),
        fomod_wizard.is_some(),
    ) {
        let _ = std::fs::remove_dir_all(&temp_extract);
        session.error("deploy", &e.to_string());
        return Err(crate::error::NexusDeckError::Other(format!(
            "{e}\n\nFull log: {}",
            session.log_path.display()
        )));
    }

    if options.dry_run {
        session.info("deploy", "Dry-run complete — no files written");
        let _ = std::fs::remove_dir_all(&temp_extract);
        return Ok(serde_json::json!({
            "dry_run": true,
            "files_planned": manifest_files.len(),
            "plan": plan,
            "conflicts": conflicts,
            "log_path": session.log_path.display().to_string(),
        }));
    }

    install_progress(
        &app,
        &profile_id,
        &mod_name,
        "backing_up",
        "Backing up installed files…",
    );

    backup_installed_files(&profile, &mod_id, &manifest_files)?;

    install_progress(
        &app,
        &profile_id,
        &mod_name,
        "finalizing",
        "Updating mod library…",
    );

    let sort_order = if let Some(ref existing_id) = replace_mod_id {
        db::get_installed_mod(existing_id)?
            .map(|m| m.sort_order)
            .unwrap_or_else(|| db::next_sort_order(&profile.id).unwrap_or(0))
    } else {
        db::next_sort_order(&profile.id)?
    };

    let installed_at = if let Some(ref existing_id) = replace_mod_id {
        db::get_installed_mod(existing_id)?
            .map(|m| m.installed_at)
            .unwrap_or_else(|| chrono::Utc::now().timestamp())
    } else {
        chrono::Utc::now().timestamp()
    };

    let (saved_category, saved_tags_json) = if let Some(ref existing_id) = replace_mod_id {
        db::get_installed_mod(existing_id)?
            .map(|m| (m.category, m.tags_json))
            .unwrap_or_default()
    } else {
        (String::new(), "[]".to_string())
    };

    let category = category
        .filter(|c| !c.is_empty())
        .unwrap_or(saved_category);
    let tags_json = tags
        .map(|t| serde_json::to_string(&t).unwrap_or_else(|_| "[]".to_string()))
        .filter(|t| t != "[]")
        .unwrap_or(saved_tags_json);

    if let Some(ref wizard) = fomod_wizard {
        if crate::services::install_options::wizard_has_install_rules(wizard) {
            options.wizard_hash = Some(crate::services::install_options::wizard_structure_hash(
                wizard,
            ));
        }
    }

    let install_options_json = serde_json::to_string(&options.for_storage())?;

    let mut mod_record = InstalledMod {
        id: mod_id,
        profile_id: profile.id.clone(),
        nexus_mod_id,
        nexus_file_id: Some(nexus_file_id),
        name: mod_name.clone(),
        version: file_version,
        enabled: true,
        sort_order,
        installed_files_json: serde_json::to_string(&manifest_files)?,
        installed_at,
        category,
        tags_json,
        plugins_json: plugins_json_from_manifest(&manifest_files),
        install_options_json,
    };

    if !options.enable_mod {
        apply_mod_enabled_state(&profile, &mod_record, false)?;
        mod_record.enabled = false;
    }

    db::save_installed_mod(&mod_record)?;

    if profile.game_domain == "fallout4" {
        let _report = validate_fallout4_install(
            &manifest_files,
            game_path.as_path(),
            &session,
        );
    }

    session.set_phase("proton");
    let archive_invalidation = match crate::services::game_settings::ensure_archive_invalidation(&profile) {
        Ok(true) => {
            session.info("proton", "Archive invalidation enabled in prefix INI");
            true
        }
        Ok(false) => {
            session.warn("proton", "Archive invalidation not applied");
            false
        }
        Err(e) => {
            session.warn(
                "proton",
                &format!("Archive invalidation skipped: {e}"),
            );
            false
        }
    };

    if profile.proton_prefix_path.as_deref().unwrap_or("").is_empty() {
        session.warn(
            "proton",
            "No Proton prefix configured — plugins.txt and INI changes may require a vanilla launch first",
        );
    }

    let _ = std::fs::remove_dir_all(&temp_extract);

    session.info(
        "finalize",
        &format!("Install complete: {} file(s)", manifest_files.len()),
    );

    emit_install_progress(
        &app,
        InstallProgress {
            profile_id: profile_id.clone(),
            mod_name: mod_name.clone(),
            phase: "install".into(),
            stage: "complete".into(),
            message: format!("Installed {} file(s)", manifest_files.len()),
            files_done: manifest_files.len() as u32,
            files_total: manifest_files.len() as u32,
            current_file: None,
        },
    );

    Ok(serde_json::json!({
        "mod": mod_record,
        "plan": plan,
        "conflicts": conflicts,
        "files_installed": manifest_files.len(),
        "archive_invalidation": archive_invalidation,
        "log_path": session.log_path.display().to_string(),
        "session_id": session.id,
    }))
}

pub async fn finish_mod_update(
    app: &AppHandle,
    nexus: &crate::services::nexus_client::NexusClient,
    download_id: &str,
) -> Result<InstalledMod> {
    let download = db::get_download(download_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Download not found".into()))?;
    if download.update_target_mod_id.is_empty() {
        return Err(crate::error::NexusDeckError::Other(
            "Download is not linked to a mod update".into(),
        ));
    }

    let installed = db::get_installed_mod(&download.update_target_mod_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Installed mod not found".into()))?;

    update_checker::emit_update_progress(
        app,
        &installed.id,
        "installing",
        "Installing update…",
    );

    let mut options: InstallOptions = serde_json::from_str(&installed.install_options_json)
        .unwrap_or_default();
    options.prepared_extract_dir = None;

    let profile = db::get_profile(&download.profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let archive = PathBuf::from(&download.dest_path);
    if let Ok(entries) = list_archive_entries(&archive) {
        if let Some(wizard) =
            crate::services::install_options::detect_fomod_wizard(&archive, &entries)
        {
            if crate::services::install_options::wizard_has_install_rules(&wizard) {
                let new_hash =
                    crate::services::install_options::wizard_structure_hash(&wizard);
                if options.wizard_hash.as_deref() != Some(new_hash.as_str()) {
                    return Err(crate::error::NexusDeckError::Other(
                        "REWIZARD_REQUIRED: The mod's FOMOD installer changed. Run through the install wizard to choose options.".into(),
                    ));
                }
            }
        }
    }

    let file_version = nexus
        .get_mod_files(&profile.game_domain, installed.nexus_mod_id as u64)
        .await
        .ok()
        .and_then(|files| {
            files
                .iter()
                .find(|f| f.file_id == download.file_id as u64)
                .map(|f| f.version.clone())
        });

    let result = install_mod_from_archive(
        app.clone(),
        download.profile_id.clone(),
        installed.name.clone(),
        installed.nexus_mod_id,
        download.file_id,
        download.dest_path.clone(),
        options,
        None,
        None,
        file_version,
        Some(installed.id.clone()),
    )
    .await?;

    let mod_record: InstalledMod = serde_json::from_value(result["mod"].clone())?;

    let _ = plugins_txt::sync_plugins_txt(&profile);

    update_checker::emit_update_progress(
        app,
        &mod_record.id,
        "complete",
        "Update installed",
    );
    let _ = app.emit("mod-update-complete", &mod_record);

    Ok(mod_record)
}

#[tauri::command]
pub fn get_fomod_wizard_state(
    extract_dir: String,
    archive_path: String,
    selections: Vec<crate::services::install_options::SelectedInstallOption>,
) -> Result<FomodWizardState> {
    use crate::services::archive::list_extracted_entries;

    let extract = PathBuf::from(extract_dir);
    let archive = PathBuf::from(archive_path);
    let entries = list_extracted_entries(&extract)?;
    let wizard = crate::services::install_options::detect_install_wizard_from_dir(
        &archive,
        &extract,
        &entries,
    );
    let filtered =
        crate::services::install_options::filter_visible_wizard(&wizard, &selections);
    let active_flags =
        crate::services::install_options::active_fomod_flag_map(&wizard, &selections);
    Ok(FomodWizardState {
        wizard: filtered,
        active_flags,
    })
}

#[tauri::command]
pub fn cleanup_prepare_dir(extract_dir: String) -> Result<()> {
    let path = PathBuf::from(extract_dir);
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(&path);
    }
    Ok(())
}

#[tauri::command]
pub fn read_fomod_asset(
    extract_dir: String,
    relative_path: String,
) -> Result<Option<crate::services::install_options::FomodAssetPayload>> {
    crate::services::install_options::read_fomod_asset(
        PathBuf::from(extract_dir).as_path(),
        &relative_path,
    )
}

#[tauri::command]
pub fn list_installed_mods(profile_id: String) -> Result<Vec<InstalledMod>> {
    db::list_installed_mods(&profile_id)
}

#[tauri::command]
pub fn set_mod_enabled(mod_id: String, enabled: bool) -> Result<()> {
    let mod_record = db::get_installed_mod(&mod_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Mod not found".into()))?;

    if mod_record.enabled == enabled {
        return Ok(());
    }

    let profile = db::get_profile(&mod_record.profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    apply_mod_enabled_state(&profile, &mod_record, enabled)?;
    db::set_mod_enabled(&mod_id, enabled)
}

#[tauri::command]
pub fn reorder_mod(profile_id: String, mod_id: String, direction: String) -> Result<Vec<InstalledMod>> {
    db::reorder_mod(&profile_id, &mod_id, &direction)
}

#[tauri::command]
pub fn analyze_archive(
    archive_path: String,
    game_domain: String,
    game_path: String,
) -> Result<serde_json::Value> {
    let entries = list_archive_entries(PathBuf::from(&archive_path).as_path())?;
    let plan = games::build_plan_for_strategy(
        &game_domain,
        PathBuf::from(&game_path).as_path(),
        &entries,
        "auto",
    )?;
    Ok(serde_json::json!({
        "entries": entries,
        "plan": plan,
        "strategies": available_strategies(),
    }))
}

#[tauri::command]
pub fn check_mod_conflicts(
    profile_id: String,
    new_files: Vec<String>,
    mod_name: String,
) -> Result<Vec<crate::services::conflict::FileConflict>> {
    preview_conflicts(&profile_id, &new_files, &mod_name)
}

#[tauri::command]
pub fn get_install_strategies() -> Result<Vec<StrategyOption>> {
    Ok(available_strategies())
}

#[tauri::command]
pub async fn repair_deployment(
    profile_id: String,
) -> Result<crate::services::repair::RepairResult> {
    tokio::task::spawn_blocking(move || crate::services::repair::repair_deployment(&profile_id))
        .await
        .map_err(|e| crate::error::NexusDeckError::Other(format!("Repair failed: {e}")))?
}
