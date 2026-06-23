use std::fmt::Write as _;
use std::path::Path;

use crate::db;
use crate::error::Result;
use crate::services::platform::is_flatpak_sandbox;
use crate::services::{game_settings, prefix_manager, proton_deps, tools};

/// Build a copyable plain-text diagnostics report for the Proton mod system.
/// Aggregates protontricks detection, prefix state, dependency verification, and
/// BodySlide status so users on hardware we can't see can paste back the real
/// state when the deps install or BodySlide misbehaves.
pub fn collect_proton_diagnostics(profile_id: &str) -> Result<String> {
    let profile = db::get_profile(profile_id)?
        .ok_or_else(|| crate::error::NexusDeckError::NotFound("Profile not found".into()))?;

    let mut out = String::new();
    let _ = writeln!(out, "NexusDeck diagnostics");
    let _ = writeln!(out, "=====================");
    let _ = writeln!(out, "app_version: {}", env!("CARGO_PKG_VERSION"));
    let _ = writeln!(out, "os: {}", std::env::consts::OS);
    let _ = writeln!(out, "flatpak_sandbox: {}", is_flatpak_sandbox());

    let _ = writeln!(out, "\n[Profile]");
    let _ = writeln!(out, "game_domain: {}", profile.game_domain);
    let _ = writeln!(out, "game_path: {}", profile.game_path);
    let _ = writeln!(
        out,
        "game_path_exists: {}",
        Path::new(&profile.game_path).exists()
    );
    let _ = writeln!(
        out,
        "proton_prefix_path: {}",
        profile.proton_prefix_path.as_deref().unwrap_or("(none)")
    );

    let pt = proton_deps::detect_protontricks();
    let _ = writeln!(out, "\n[Protontricks]");
    let _ = writeln!(out, "available: {}", pt.available);
    let _ = writeln!(out, "kind: {}", pt.kind);
    let _ = writeln!(out, "command: {}", pt.command);
    let _ = writeln!(out, "message: {}", pt.message);

    let my_games = game_settings::resolve_my_games_dir(&profile)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "(unresolved)".into());
    let prefix = prefix_manager::prefix_status(profile.proton_prefix_path.as_deref(), &my_games);
    let _ = writeln!(out, "\n[Prefix]");
    let _ = writeln!(out, "my_games_dir: {my_games}");
    let _ = writeln!(out, "prefix_exists: {}", prefix.exists);
    let _ = writeln!(out, "my_games_exists: {}", prefix.my_games_exists);
    let _ = writeln!(
        out,
        "prefix_path: {}",
        prefix.prefix_path.as_deref().unwrap_or("(none)")
    );
    let _ = writeln!(out, "prefix_size_mb: {}", prefix.size_mb);
    let _ = writeln!(out, "prefix_writable: {}", prefix.writable);

    let _ = writeln!(out, "\n[Proton dependencies]");
    match proton_deps::verify_deps_for_profile(&profile) {
        Ok(v) => {
            let _ = writeln!(out, "satisfied: {}", v.satisfied);
            let _ = writeln!(out, "checked_against_prefix: {}", v.checked_against_prefix);
            let _ = writeln!(out, "protontricks_available: {}", v.protontricks_available);
            let _ = writeln!(out, "present: {}", join_or_none(&v.present));
            let _ = writeln!(out, "missing: {}", join_or_none(&v.missing));
        }
        Err(e) => {
            let _ = writeln!(out, "error: {e}");
        }
    }

    // A dry-run surfaces resolution + setup guidance (e.g. prefix not created yet)
    // without changing anything.
    let _ = writeln!(out, "\n[Proton dependencies dry-run]");
    match proton_deps::install_game_deps_for_profile(&profile, true) {
        Ok(r) => {
            let _ = writeln!(out, "{}", r.message.trim());
        }
        Err(e) => {
            let _ = writeln!(out, "error: {e}");
        }
    }

    let _ = writeln!(out, "\n[BodySlide]");
    match tools::get_body_setup_status(profile_id) {
        Ok(b) if !b.applicable => {
            let _ = writeln!(out, "applicable: false (not a body-mod game)");
        }
        Ok(b) => {
            let _ = writeln!(out, "installed: {}", b.bodyslide_installed);
            let _ = writeln!(out, "exe: {}", b.bodyslide_exe.as_deref().unwrap_or("(none)"));
            let _ = writeln!(out, "config_ready: {}", b.bodyslide_config_ready);
            let _ = writeln!(out, "uses_z_drive: {}", b.bodyslide_uses_z_drive);
            let _ = writeln!(
                out,
                "game_data_path: {}",
                b.bodyslide_game_data_path.as_deref().unwrap_or("(none)")
            );
            let _ = writeln!(out, "preset_file_count: {}", b.bodyslide_preset_file_count);
            let _ = writeln!(
                out,
                "path_warning: {}",
                b.bodyslide_path_warning.as_deref().unwrap_or("(none)")
            );
            let _ = writeln!(out, "presets_built: {}", b.presets_built);
        }
        Err(e) => {
            let _ = writeln!(out, "error: {e}");
        }
    }

    Ok(out)
}

fn join_or_none(items: &[String]) -> String {
    if items.is_empty() {
        "(none)".to_string()
    } else {
        items.join(", ")
    }
}
