use tauri::{AppHandle, Emitter};

use crate::error::Result;
use crate::services::startup_log;

/// Gamescope treats windows with STEAM_GAME=769 as the primary application window.
pub const GAMESCOPE_MAIN_STEAM_GAME: u32 = 769;

pub fn is_gamescope_session() -> bool {
    #[cfg(not(target_os = "linux"))]
    {
        return false;
    }
    #[cfg(target_os = "linux")]
    {
        if std::env::var("GAMESCOPE_SESSION").is_ok() {
            return true;
        }
        if std::env::var("GAMESCOPE_WAYLAND_DISPLAY").is_ok() {
            return true;
        }
        if std::env::var("SteamGameId").is_ok() || std::env::var("STEAM_GAME").is_ok() {
            return true;
        }
        if let Ok(content) = std::fs::read_to_string("/proc/self/environ") {
            let lower = content.to_lowercase();
            if lower.contains("gamescope") {
                return true;
            }
        }
        false
    }
}

#[cfg(target_os = "linux")]
fn find_nexusdeck_window_id() -> Option<String> {
    use crate::services::host_command;

    let script = r#"
for title in "NexusDeck" "nexusdeck"; do
  id=$(xdotool search --name "$title" 2>/dev/null | head -n1)
  if [ -n "$id" ]; then
    echo "$id"
    exit 0
  fi
done
exit 1
"#;
    let output = host_command::run_bash(script, 8).ok()?;
    if !output.status.success() {
        return None;
    }
    let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

#[cfg(target_os = "linux")]
fn set_steam_game_property(window_id: &str, value: Option<u32>) -> Result<()> {
    use crate::services::host_command;

    let script = match value {
        Some(v) => format!(
            "xprop -id {window_id} -f STEAM_GAME 32c -set STEAM_GAME {v}"
        ),
        None => format!("xprop -id {window_id} -remove STEAM_GAME 2>/dev/null || true"),
    };
    let output = host_command::run_bash(&script, 8)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::NexusDeckError::Other(format!(
            "xprop STEAM_GAME failed: {stderr}"
        )));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn claim_gamescope_focus_for_window() -> Result<()> {
    if !is_gamescope_session() {
        return Ok(());
    }
    let Some(window_id) = find_nexusdeck_window_id() else {
        startup_log::log_step("gamescope", "claim focus: window id not found");
        return Ok(());
    };
    set_steam_game_property(&window_id, Some(GAMESCOPE_MAIN_STEAM_GAME))?;
    startup_log::log_step(
        "gamescope",
        &format!("claimed STEAM_GAME={} on window {window_id}", GAMESCOPE_MAIN_STEAM_GAME),
    );
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn claim_gamescope_focus_for_window() -> Result<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn handoff_to_steam_game(_app: &AppHandle, steam_app_id: u32) -> Result<()> {
    if !is_gamescope_session() {
        return Ok(());
    }
    if let Some(window_id) = find_nexusdeck_window_id() {
        set_steam_game_property(&window_id, Some(0))?;
        startup_log::log_step(
            "gamescope",
            &format!("handoff STEAM_GAME=0 before steam app {steam_app_id}"),
        );
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn handoff_to_steam_game(_app: &AppHandle, _steam_app_id: u32) -> Result<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn claim_gamescope_focus_if_needed(app: &AppHandle) -> Result<()> {
    let _ = app;
    claim_gamescope_focus_for_window()
}

#[cfg(not(target_os = "linux"))]
pub fn claim_gamescope_focus_if_needed(_app: &AppHandle) -> Result<()> {
    Ok(())
}

pub fn prepare_for_game_launch(
    app: &AppHandle,
    settings: &crate::services::launch_config::LaunchSettings,
    steam_app_id: u32,
) -> Result<()> {
    if !settings.hide_on_launch {
        return Ok(());
    }

    crate::services::window_lifecycle::hide_for_game_launch(app)?;

    if settings.gamescope_handoff {
        handoff_to_steam_game(app, steam_app_id)?;
    }

    // Frontend pauses gamepad polling on handoff (always, even without gamescope).
    let _ = app.emit(
        "launch:handoff",
        serde_json::json!({ "steam_app_id": steam_app_id }),
    );

    Ok(())
}

pub fn restore_after_game_session(app: &AppHandle) -> Result<()> {
    crate::services::window_lifecycle::restore_after_game(app)?;
    claim_gamescope_focus_for_window()?;
    let _ = app.emit("launch:restored", ());
    Ok(())
}
