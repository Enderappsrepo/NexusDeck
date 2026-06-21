use crate::db;
use crate::error::Result;
use crate::games::GameRegistry;
use crate::services::autofix::{DiagnosticFinding, DiagnosticScanResult};
use crate::services::game_settings;
use crate::services::log_parser;
use crate::services::prefix_manager;
use crate::services::proton_deps;

pub fn scan_profile(profile_id: &str) -> Result<DiagnosticScanResult> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;
    let plugin = GameRegistry::get(&profile.game_domain)?;
    let game_path = std::path::Path::new(&profile.game_path);

    let mut findings = Vec::new();

    if !game_path.exists() {
        findings.push(finding(
            "game_path_missing",
            "error",
            format!("Game path does not exist: {}", profile.game_path),
            None,
            false,
            None,
            serde_json::json!({}),
        ));
    } else if let Err(e) = plugin.validate_game_root(game_path) {
        findings.push(finding(
            "game_path_invalid",
            "error",
            e.to_string(),
            None,
            false,
            None,
            serde_json::json!({}),
        ));
    }

    let prefix_status = prefix_manager::prefix_status(
        profile.proton_prefix_path.as_deref(),
        plugin.my_games_folder().unwrap_or(""),
    );
    if !prefix_status.exists && cfg!(not(target_os = "windows")) {
        findings.push(finding(
            "prefix_missing",
            "error",
            &prefix_status.message,
            Some("bootstrap_vanilla".into()),
            false,
            Some("Launch Skyrim once from Steam to create the Proton prefix.".into()),
            serde_json::to_value(&prefix_status)?,
        ));
    } else if !prefix_status.my_games_exists && cfg!(not(target_os = "windows")) {
        findings.push(finding(
            "my_games_missing",
            "warning",
            &prefix_status.message,
            Some("bootstrap_vanilla".into()),
            false,
            Some("Vanilla launch generates My Games INI folders.".into()),
            serde_json::to_value(&prefix_status)?,
        ));
    }

    if !prefix_status.writable && prefix_status.exists {
        findings.push(finding(
            "prefix_not_writable",
            "error",
            "Proton prefix is not writable.",
            Some("fix_permissions".into()),
            true,
            Some("Check SD card mount options or run chmod on the prefix.".into()),
            serde_json::json!({ "prefix": prefix_status.prefix_path }),
        ));
    }

    if prefix_status.size_mb > 8192 {
        findings.push(finding(
            "prefix_bloat",
            "warning",
            format!("Proton prefix is {} MB — may affect performance.", prefix_status.size_mb),
            Some("prefix_bloat".into()),
            false,
            Some("Back up and consider prefix cleanup or recreation.".into()),
            serde_json::json!({ "size_mb": prefix_status.size_mb }),
        ));
    }

    let se_status = plugin.detect_script_extender(game_path);
    if !se_status.installed {
        let mods = db::list_installed_mods(profile_id)?;
        let needs_skse = mods.iter().any(|m| {
            let n = m.name.to_lowercase();
            n.contains("skse") || n.contains("skyui") || n.contains("address library")
        });
        if needs_skse || profile.game_domain == "skyrimspecialedition" {
            findings.push(finding(
                "skse_missing",
                if needs_skse { "error" } else { "info" },
                &se_status.message,
                Some("reinstall_skse".into()),
                false,
                Some("Match SKSE to your exact Skyrim.exe version.".into()),
                serde_json::to_value(&se_status)?,
            ));
        }
    } else if let Some(ref loader) = se_status.loader_path {
        let _ = loader;
    }

    if cfg!(not(target_os = "windows")) {
        let pt = proton_deps::detect_protontricks();
        if !pt.available {
            findings.push(finding(
                "protontricks_missing",
                "warning",
                &pt.message,
                None,
                false,
                Some("Install protontricks from Discover or Flathub.".into()),
                serde_json::json!({}),
            ));
        } else {
            let deps = proton_deps::install_game_deps(&profile.game_domain, true)?;
            if !deps.skipped.is_empty() && deps.installed.is_empty() {
                findings.push(finding(
                    "proton_deps_pending",
                    "info",
                    "Proton dependencies may need installation for SKSE plugins.",
                    Some("install_proton_deps".into()),
                    true,
                    Some("Runs vcrun2019, .NET, and DirectX redistributables in the prefix.".into()),
                    serde_json::to_value(&deps)?,
                ));
            }
        }

        if let Some(app_id) = plugin.steam_app_id() {
            let proton = prefix_manager::check_proton_version(app_id)?;
            if !proton.compatible {
                findings.push(finding(
                    "proton_version_unknown",
                    "warning",
                    &proton.message,
                    None,
                    false,
                    Some("Use Proton GE 9+ or Proton Experimental for best mod compatibility.".into()),
                    serde_json::to_value(&proton)?,
                ));
            }
        }
    }

    if !game_settings::is_archive_invalidation_enabled(&profile)? {
        findings.push(finding(
            "archive_invalidation",
            "warning",
            "Archive invalidation may not be enabled — loose-file mods won't load.",
            Some("enable_archive_invalidation".into()),
            true,
            Some("Required for textures and meshes deployed as loose files.".into()),
            serde_json::json!({}),
        ));
    }

    let staging = std::path::Path::new(&profile.staging_path);
    if staging.exists() {
        if prefix_manager::is_likely_removable_drive(&profile.staging_path) {
            findings.push(finding(
                "sd_card_staging",
                "warning",
                "Mod staging folder is on removable storage — slower installs and loads.",
                Some("sd_card_staging".into()),
                false,
                Some("Move staging to internal storage for better Deck performance.".into()),
                serde_json::json!({ "staging_path": profile.staging_path }),
            ));
        }
    }

    if let Ok(log_findings) = log_parser::scan_logs(&profile) {
        findings.extend(log_findings);
    }

    Ok(DiagnosticScanResult {
        profile_id: profile_id.to_string(),
        game_domain: profile.game_domain.clone(),
        findings,
        scanned_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn finding(
    id: &str,
    severity: &str,
    message: impl Into<String>,
    remedy_id: Option<String>,
    auto_fixable: bool,
    deck_tip: Option<&str>,
    context: serde_json::Value,
) -> DiagnosticFinding {
    DiagnosticFinding {
        id: id.to_string(),
        severity: severity.to_string(),
        message: message.into(),
        remedy_id,
        auto_fixable,
        deck_tip: deck_tip.map(str::to_string),
        context,
    }
}
