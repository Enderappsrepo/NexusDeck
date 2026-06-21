use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use crate::db::Profile;
use crate::error::Result;
use crate::games::GameRegistry;
use crate::services::autofix::DiagnosticFinding;
use crate::services::game_settings;

pub fn scan_logs(profile: &Profile) -> Result<Vec<DiagnosticFinding>> {
    let mut findings = Vec::new();
    let lines = read_recent_log_lines(profile, 200);

    let combined = lines.join("\n").to_lowercase();

    if combined.contains("skse64") && combined.contains("version mismatch") {
        findings.push(finding(
            "log_skse_mismatch",
            "error",
            "SKSE log reports a version mismatch with Skyrim.exe.",
            Some("reinstall_skse".into()),
            false,
            Some("Reinstall SKSE matching your game version from skse.silverlock.org.".into()),
        ));
    }

    if combined.contains("failed to load") && combined.contains(".dll") {
        findings.push(finding(
            "log_dll_load_fail",
            "error",
            "Log shows DLL load failures — missing Proton dependencies or wrong SKSE plugin build.",
            Some("install_proton_deps".into()),
            true,
            Some("Run protontricks vcrun2019 and dotnet48, then verify plugin compatibility.".into()),
        ));
    }

    if combined.contains("crash") || combined.contains("access violation") {
        findings.push(finding(
            "log_crash_detected",
            "warning",
            "Recent crash signatures found in logs.",
            None,
            false,
            Some("Disable mods incrementally or check load order with LOOT.".into()),
        ));
    }

    Ok(findings)
}

pub fn read_recent_log_lines(profile: &Profile, max_lines: usize) -> Vec<String> {
    let mut all = Vec::new();
    for path in log_paths(profile) {
        if let Ok(lines) = tail_file(&path, max_lines) {
            all.extend(lines);
        }
    }
    all.truncate(max_lines);
    all
}

fn log_paths(profile: &Profile) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let plugin = GameRegistry::get(&profile.game_domain).ok();

    if let Ok(config_dir) = game_settings::resolve_my_games_dir(profile) {
        paths.push(config_dir.join("SKSE").join("skse64.log"));
        paths.push(config_dir.join("SKSE").join("skse.log"));
        paths.push(config_dir.join("Logs").join("Script").join("Papyrus.0.log"));
    }

    if let Some(ref prefix) = profile.proton_prefix_path {
        let p = PathBuf::from(prefix);
        if let Some(folder) = plugin.as_ref().and_then(|p| p.my_games_folder()) {
            paths.push(
                p.join("drive_c/users/steamuser/Documents/My Games")
                    .join(folder)
                    .join("SKSE/skse64.log"),
            );
        }
    }

    paths
}

fn tail_file(path: &std::path::Path, max_lines: usize) -> Result<Vec<String>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].to_vec())
}

fn finding(
    id: &str,
    severity: &str,
    message: impl Into<String>,
    remedy_id: Option<String>,
    auto_fixable: bool,
    deck_tip: Option<&str>,
) -> DiagnosticFinding {
    DiagnosticFinding {
        id: id.to_string(),
        severity: severity.to_string(),
        message: message.into(),
        remedy_id,
        auto_fixable,
        deck_tip: deck_tip.map(str::to_string),
        context: serde_json::json!({}),
    }
}
