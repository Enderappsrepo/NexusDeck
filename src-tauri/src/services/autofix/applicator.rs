use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{self, Profile};
use crate::error::{NexusDeckError, Result};
use crate::games::GameRegistry;
use crate::services::autofix::rules;
use crate::services::autofix::{ApplyFixesResult, FixResult};
use crate::services::game_settings;
use crate::services::plugins_txt;
use crate::services::prefix_manager;
use crate::services::proton_deps;
use crate::services::script_extender;

pub fn apply_remedy(profile_id: &str, remedy_id: &str) -> Result<ApplyFixesResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;

    let fix_type = rules::remedy_fix_type(remedy_id).ok_or_else(|| {
        NexusDeckError::Other(format!("Unknown remedy: {remedy_id}"))
    })?;

    let backup_dir = create_backup_gate(&profile)?;
    let backup_path = backup_dir.as_ref().map(|p| p.display().to_string());

    let result = match fix_type.as_str() {
        "enable_archive_invalidation" => apply_archive_invalidation(&profile, remedy_id, backup_path.clone()),
        "sync_plugins_txt" => apply_plugins_sync(&profile, remedy_id, backup_path.clone()),
        "install_proton_deps" => apply_proton_deps(&profile, remedy_id, backup_path.clone()),
        "fix_permissions" => apply_permissions(&profile, remedy_id, backup_path.clone()),
        "apply_deck_ini_preset" => apply_deck_ini(&profile, remedy_id, backup_path.clone()),
        "reinstall_skse" | "reinstall_script_extender" => {
            apply_reinstall_extender(&profile, remedy_id, backup_path.clone())
        }
        other if other.ends_with("_guidance") => {
            crate::services::mo2::apply_guidance_fix(&fix_type, remedy_id)
        }
        _ => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: true,
            message: format!("Fix type '{fix_type}' is not automated yet."),
            backup_path,
        },
    };

    Ok(ApplyFixesResult {
        results: vec![result],
        backup_dir: backup_dir.map(|p| p.display().to_string()),
    })
}

fn create_backup_gate(profile: &Profile) -> Result<Option<PathBuf>> {
    let dir = PathBuf::from(&profile.staging_path)
        .join("backups")
        .join(chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string());
    fs::create_dir_all(&dir)?;
    Ok(Some(dir))
}

fn apply_archive_invalidation(
    profile: &db::Profile,
    remedy_id: &str,
    backup_path: Option<String>,
) -> FixResult {
    match game_settings::ensure_archive_invalidation(profile) {
        Ok(true) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: true,
            skipped: false,
            message: "Archive invalidation enabled in Custom.ini.".to_string(),
            backup_path,
        },
        Ok(false) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: true,
            message: "Archive invalidation not applicable yet (prefix may not exist).".to_string(),
            backup_path,
        },
        Err(e) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: false,
            message: e.to_string(),
            backup_path,
        },
    }
}

fn apply_plugins_sync(
    profile: &db::Profile,
    remedy_id: &str,
    backup_path: Option<String>,
) -> FixResult {
    match plugins_txt::sync_plugins_txt(profile) {
        Ok(result) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: true,
            skipped: false,
            message: format!(
                "plugins.txt synced ({} plugins) to {}",
                result.plugin_count, result.path
            ),
            backup_path,
        },
        Err(e) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: false,
            message: e.to_string(),
            backup_path,
        },
    }
}

fn apply_proton_deps(
    profile: &db::Profile,
    remedy_id: &str,
    backup_path: Option<String>,
) -> FixResult {
    match proton_deps::install_game_deps(&profile.game_domain, false) {
        Ok(r) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: r.success,
            skipped: false,
            message: r.message,
            backup_path,
        },
        Err(e) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: false,
            message: e.to_string(),
            backup_path,
        },
    }
}

fn apply_permissions(
    profile: &db::Profile,
    remedy_id: &str,
    backup_path: Option<String>,
) -> FixResult {
    let Some(ref prefix) = profile.proton_prefix_path else {
        return FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: true,
            message: "No Proton prefix configured.".to_string(),
            backup_path,
        };
    };

    #[cfg(unix)]
    {
        let status = std::process::Command::new("chmod")
            .args(["-R", "u+rwX", prefix])
            .status();
        match status {
            Ok(s) if s.success() => FixResult {
                remedy_id: remedy_id.to_string(),
                applied: true,
                skipped: false,
                message: "Prefix permissions updated (user read/write).".to_string(),
                backup_path,
            },
            Ok(s) => FixResult {
                remedy_id: remedy_id.to_string(),
                applied: false,
                skipped: false,
                message: format!("chmod exited with {s}"),
                backup_path,
            },
            Err(e) => FixResult {
                remedy_id: remedy_id.to_string(),
                applied: false,
                skipped: false,
                message: e.to_string(),
                backup_path,
            },
        }
    }

    #[cfg(not(unix))]
    {
        let _ = prefix;
        FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: true,
            message: "Permission fix is Linux-only.".to_string(),
            backup_path,
        }
    }
}

fn apply_deck_ini(profile: &db::Profile, remedy_id: &str, backup_path: Option<String>) -> FixResult {
    let preset = match profile.game_domain.as_str() {
        "skyrimspecialedition" => "deck_balanced",
        "fallout4" => "deck",
        _ => "deck",
    };
    match game_settings::apply_game_settings_preset(&profile.id, preset) {
        Ok(r) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: true,
            skipped: false,
            message: format!(
                "Applied Deck INI preset. Backup at {}",
                r.backup_dir
            ),
            backup_path,
        },
        Err(e) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: false,
            message: e.to_string(),
            backup_path,
        },
    }
}

fn apply_reinstall_extender(
    profile: &db::Profile,
    remedy_id: &str,
    backup_path: Option<String>,
) -> FixResult {
    let game_root = Path::new(&profile.game_path);
    match script_extender::install(&profile.game_domain, game_root, true) {
        Ok(status) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: status.installed,
            skipped: false,
            message: status.message,
            backup_path,
        },
        Err(e) => FixResult {
            remedy_id: remedy_id.to_string(),
            applied: false,
            skipped: false,
            message: e.to_string(),
            backup_path,
        },
    }
}

pub fn backup_prefix_to(profile_id: &str, dest_zip: &str) -> Result<prefix_manager::PrefixBackupResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let prefix = profile
        .proton_prefix_path
        .ok_or_else(|| NexusDeckError::Other("No Proton prefix on profile".into()))?;
    prefix_manager::backup_prefix(&prefix, dest_zip)
}

pub fn restore_prefix_from(profile_id: &str, src_zip: &str) -> Result<String> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let prefix = profile
        .proton_prefix_path
        .ok_or_else(|| NexusDeckError::Other("No Proton prefix on profile".into()))?;
    prefix_manager::restore_prefix(&prefix, src_zip)
}

pub fn export_diagnostic_markdown(profile_id: &str) -> Result<String> {
    let scan = crate::services::autofix::run_scan(profile_id)?;
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| NexusDeckError::NotFound("Profile not found".into()))?;
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let se = plugin.detect_script_extender(Path::new(&profile.game_path));
    let logs = crate::services::log_parser::read_recent_log_lines(&profile, 50);

    let mut md = String::new();
    md.push_str("# NexusDeck / DeckModFix Diagnostic Report\n\n");
    md.push_str(&format!("- **Game**: {}\n", plugin.display_name()));
    md.push_str(&format!("- **Profile**: {}\n", profile.name));
    md.push_str(&format!("- **Scanned**: {}\n", scan.scanned_at));
    md.push_str(&format!("- **Game path**: `{}`\n", profile.game_path));
    if let Some(ref p) = profile.proton_prefix_path {
        md.push_str(&format!("- **Proton prefix**: `{}`\n", p));
    }
    md.push_str(&format!("- **Script extender**: {}\n\n", se.message));

    md.push_str("## Findings\n\n");
    for f in &scan.findings {
        md.push_str(&format!("### [{}] {}\n", f.severity.to_uppercase(), f.id));
        md.push_str(&format!("{}\n", f.message));
        if let Some(ref tip) = f.deck_tip {
            md.push_str(&format!("*Deck tip: {tip}*\n"));
        }
        md.push('\n');
    }

    if !logs.is_empty() {
        md.push_str("## Recent log lines\n\n```\n");
        for line in logs {
            md.push_str(&line);
            md.push('\n');
        }
        md.push_str("```\n");
    }

    Ok(md)
}
