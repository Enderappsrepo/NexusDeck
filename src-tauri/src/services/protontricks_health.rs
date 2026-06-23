//! Detect and repair Steam `shortcuts.vdf` corruption that crashes Protontricks on startup.
//!
//! NexusDeck's text-based shortcut writer (and the Deck install script) can produce a
//! text VDF file. Protontricks reads binary VDF and crashes with `Unterminated cstring`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::host_command::{self, PROTONTRICKS_PROBE_TIMEOUT_SECS};
use crate::services::proton_deps::{self, PROTONTRICKS_FLATPAK_ID};
use crate::services::proton_log::ProtonLogger;

const BACKUP_SUFFIX: &str = "nexusdeck_backup";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksHealth {
    pub healthy: bool,
    pub shortcuts_path: Option<String>,
    /// True when shortcuts.vdf exists but is not valid binary VDF.
    pub shortcuts_corrupted: bool,
    pub backup_available: bool,
    pub protontricks_responds: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksFixResult {
    pub success: bool,
    /// restored_backup | removed_corrupted | already_ok | no_shortcuts_file
    pub action: String,
    pub message: String,
    pub shortcuts_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairStep {
    pub name: String,
    /// ok | skipped | failed
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksRepairResult {
    pub success: bool,
    pub steps: Vec<RepairStep>,
    /// Health re-checked after the repair sequence ran.
    pub health: ProtontricksHealth,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

fn ok_step(name: &str, detail: impl Into<String>) -> RepairStep {
    RepairStep { name: name.into(), status: "ok".into(), detail: detail.into() }
}

fn skipped_step(name: &str, detail: impl Into<String>) -> RepairStep {
    RepairStep { name: name.into(), status: "skipped".into(), detail: detail.into() }
}

fn failed_step(name: &str, detail: impl Into<String>) -> RepairStep {
    RepairStep { name: name.into(), status: "failed".into(), detail: detail.into() }
}

pub fn check_protontricks_health(logger: Option<&ProtonLogger>) -> Result<ProtontricksHealth> {
    if let Some(log) = logger {
        log.info("health", "Checking Protontricks health");
    }
    if cfg!(target_os = "windows") {
        return Ok(ProtontricksHealth {
            healthy: true,
            shortcuts_path: None,
            shortcuts_corrupted: false,
            backup_available: false,
            protontricks_responds: false,
            message: "Protontricks health checks are Linux-only.".into(),
        });
    }

    let shortcuts = resolve_shortcuts_path()?;
    if let Some(log) = logger {
        log.info(
            "shortcuts",
            &format!(
                "shortcuts.vdf: {}",
                shortcuts
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| "(not found)".into())
            ),
        );
    }
    let (corrupted, backup_available) = if let Some(ref path) = shortcuts {
        (is_shortcuts_corrupted(path)?, backup_path(path).map(|p| p.is_file()).unwrap_or(false))
    } else {
        (false, false)
    };

    let pt = proton_deps::detect_protontricks();
    if let Some(log) = logger {
        log.info(
            "protontricks",
            &format!(
                "available={} kind={} corrupted={} backup={}",
                pt.available, pt.kind, corrupted, backup_available
            ),
        );
    }
    let protontricks_responds = if pt.available && !corrupted {
        let responds = probe_protontricks(&pt, logger);
        if let Some(log) = logger {
            log.info("probe", &format!("Protontricks responds: {responds}"));
        }
        responds
    } else {
        false
    };

    let healthy = !corrupted && (protontricks_responds || !pt.available);
    let message = if corrupted {
        format!(
            "Steam shortcuts.vdf is corrupted (text or invalid binary). This makes Protontricks crash on startup.{}",
            if backup_available {
                " A backup from before NexusDeck edited the file was found — tap Fix to restore it."
            } else {
                " Tap Fix to quarantine the bad file — Steam will recreate it (non-Steam shortcuts may be lost)."
            }
        )
    } else if pt.available && !protontricks_responds {
        "Protontricks is installed but did not respond to a test command. Try Fix, then restart Steam.".into()
    } else if !pt.available {
        "Install Protontricks from Discover, then tap Check again.".into()
    } else {
        "Protontricks and Steam shortcuts look healthy.".into()
    };

    if let Some(log) = logger {
        log.info("health", &format!("healthy={healthy}: {message}"));
    }

    Ok(ProtontricksHealth {
        healthy,
        shortcuts_path: shortcuts.map(|p| p.display().to_string()),
        shortcuts_corrupted: corrupted,
        backup_available,
        protontricks_responds,
        message,
    })
}

/// Repair corrupted `shortcuts.vdf` before any Protontricks install/verify call.
/// NexusDeck's text shortcut writer (and the Deck installer) can corrupt binary VDF;
/// Protontricks then crashes with `Unterminated cstring` on every subsequent run.
pub fn ensure_shortcuts_for_protontricks(logger: Option<&ProtonLogger>) -> Result<()> {
    if cfg!(target_os = "windows") {
        return Ok(());
    }
    let Some(path) = resolve_shortcuts_path()? else {
        if let Some(log) = logger {
            log.info("shortcuts", "No shortcuts.vdf — Protontricks should be fine");
        }
        return Ok(());
    };
    if !is_shortcuts_corrupted(&path)? {
        if let Some(log) = logger {
            log.info("shortcuts", "shortcuts.vdf looks valid");
        }
        return Ok(());
    }
    if let Some(log) = logger {
        log.warn(
            "shortcuts",
            &format!(
                "Corrupted shortcuts.vdf at {} — repairing before Protontricks runs",
                path.display()
            ),
        );
    }
    let action = repair_shortcuts_on_host(&path)?;
    if let Some(log) = logger {
        log.info("shortcuts", &format!("Repaired shortcuts.vdf ({action})"));
    }
    Ok(())
}

pub fn fix_protontricks_shortcuts(logger: Option<&ProtonLogger>) -> Result<ProtontricksFixResult> {
    if let Some(log) = logger {
        log.info("fix", "Starting Protontricks shortcuts repair");
    }
    if cfg!(target_os = "windows") {
        return Ok(with_log_path(
            ProtontricksFixResult {
                success: true,
                action: "already_ok".into(),
                message: "Not applicable on Windows.".into(),
                shortcuts_path: None,
                log_path: None,
            },
            logger,
        ));
    }

    let _ = proton_deps::ensure_protontricks_flatpak_access();

    let Some(shortcuts) = resolve_shortcuts_path()? else {
        return Ok(with_log_path(
            ProtontricksFixResult {
                success: true,
                action: "no_shortcuts_file".into(),
                message: "No shortcuts.vdf found — nothing to fix. Launch Steam once if you use non-Steam games.".into(),
                shortcuts_path: None,
                log_path: None,
            },
            logger,
        ));
    };

    if !is_shortcuts_corrupted(&shortcuts)? {
        let pt = proton_deps::detect_protontricks();
        let responds = pt.available && probe_protontricks(&pt, logger);
        return Ok(with_log_path(
            ProtontricksFixResult {
                success: true,
                action: "already_ok".into(),
                message: if responds {
                    "shortcuts.vdf looks fine and Protontricks responded.".into()
                } else {
                    "shortcuts.vdf looks fine. If Protontricks still crashes, quit Steam completely and try again.".into()
                },
                shortcuts_path: Some(shortcuts.display().to_string()),
                log_path: None,
            },
            logger,
        ));
    }

    if let Some(log) = logger {
        log.warn("fix", &format!("Repairing corrupted shortcuts at {}", shortcuts.display()));
    }
    let action = repair_shortcuts_on_host(&shortcuts)?;
    if let Some(log) = logger {
        log.info("fix", &format!("Repair action: {action}"));
    }
    let pt = proton_deps::detect_protontricks();
    let responds = pt.available && probe_protontricks(&pt, logger);

    let message = match action.as_str() {
        "restored_backup" => {
            if responds {
                "Restored shortcuts.vdf from backup. Protontricks is working again — quit and reopen Steam if shortcuts look wrong.".into()
            } else {
                "Restored shortcuts.vdf from backup. Restart Steam, then tap Check again.".into()
            }
        }
        "removed_corrupted" => {
            if responds {
                "Moved corrupted shortcuts.vdf aside. Protontricks works again — Steam will recreate shortcuts as you add non-Steam games.".into()
            } else {
                "Moved corrupted shortcuts.vdf aside. Quit Steam fully, reopen it, then tap Check again.".into()
            }
        }
        _ => "Repair finished. Quit Steam completely, reopen it, then tap Check again.".into(),
    };

    Ok(with_log_path(
        ProtontricksFixResult {
            success: true,
            action,
            message,
            shortcuts_path: Some(shortcuts.display().to_string()),
            log_path: None,
        },
        logger,
    ))
}

fn with_log_path(mut result: ProtontricksFixResult, logger: Option<&ProtonLogger>) -> ProtontricksFixResult {
    if let Some(log) = logger {
        result.log_path = Some(log.log_path_string());
        log.info("result", &result.message);
    }
    result
}

/// Run a sequence of safe, reversible remediations for the common Protontricks failure
/// modes on Steam Deck, then re-probe and report what each step did. Best-effort: a failed
/// step is recorded, not fatal, so the rest still run.
pub fn repair_protontricks(logger: Option<&ProtonLogger>) -> Result<ProtontricksRepairResult> {
    if let Some(log) = logger {
        log.info("repair", "Starting Protontricks repair sequence");
    }
    if cfg!(target_os = "windows") {
        let health = check_protontricks_health(logger)?;
        return Ok(with_repair_log(
            ProtontricksRepairResult {
                success: true,
                steps: vec![skipped_step("Repair", "Protontricks repairs are Linux-only.")],
                health,
                message: "Not applicable on Windows.".into(),
                log_path: None,
            },
            logger,
        ));
    }

    let pt = proton_deps::detect_protontricks();
    if let Some(log) = logger {
        log.info("repair", &format!("Detected: available={} kind={}", pt.available, pt.kind));
    }

    let mut steps = Vec::new();
    // Narrate each step into the live log so the panel shows progress, not a silent spinner.
    let note = |phase: &str| {
        if let Some(log) = logger {
            log.info("repair", phase);
        }
    };

    // 1. Re-apply the Flatpak filesystem grants so Protontricks can reach the prefix /
    //    SD card / compatdata. Idempotent.
    note("Re-applying Flatpak filesystem permissions…");
    match proton_deps::ensure_protontricks_flatpak_access() {
        Ok(()) => steps.push(ok_step(
            "Filesystem permissions",
            "Re-applied Protontricks Flatpak access to home, /run/media and /mnt.",
        )),
        Err(e) => steps.push(failed_step("Filesystem permissions", e.to_string())),
    }

    // 2. Kill a hung Protontricks process. `flatpak kill` targets only the Protontricks app,
    //    never the running game's Proton/wineserver.
    note("Clearing any stuck Protontricks instance…");
    steps.push(clear_stuck_protontricks(&pt, logger));

    // 3. Repair a corrupted shortcuts.vdf (crashes Protontricks on startup); backs up first.
    note("Checking Steam shortcuts…");
    steps.push(repair_shortcuts_step());

    // 4. Remove stale winetricks lockfiles / partial downloads that wedge installs, leaving
    //    completed downloads intact so we don't force a re-download.
    note("Cleaning stale winetricks cache files…");
    steps.push(clean_winetricks_cache(logger));

    // 5. Re-probe so the UI reflects the post-repair reality.
    note("Re-checking Protontricks…");
    let health = check_protontricks_health(logger)?;

    let any_failed = steps.iter().any(|s| s.status == "failed");
    let now_ok = health.protontricks_responds && !health.shortcuts_corrupted;
    let success = now_ok && !any_failed;

    let message = if !pt.available {
        "Ran repairs, but Protontricks isn't installed. Install it from Discover (search \"Protontricks\"), then tap Check again.".into()
    } else if now_ok {
        "Protontricks repaired — it now responds and Steam shortcuts are valid.".into()
    } else if health.shortcuts_corrupted {
        "Repaired what we could, but Steam shortcuts still look corrupted. Fully quit Steam, reopen it, then run Repair again.".into()
    } else {
        "Ran all repairs, but Protontricks still didn't respond. Fully quit Steam (not just the window), reopen it, then try again.".into()
    };

    Ok(with_repair_log(
        ProtontricksRepairResult { success, steps, health, message, log_path: None },
        logger,
    ))
}

fn with_repair_log(
    mut result: ProtontricksRepairResult,
    logger: Option<&ProtonLogger>,
) -> ProtontricksRepairResult {
    if let Some(log) = logger {
        result.log_path = Some(log.log_path_string());
        for s in &result.steps {
            log.info("repair-step", &format!("{}: {} — {}", s.name, s.status, s.detail));
        }
        log.info("result", &result.message);
    }
    result
}

fn clear_stuck_protontricks(
    pt: &proton_deps::ProtontricksInfo,
    logger: Option<&ProtonLogger>,
) -> RepairStep {
    if pt.kind != "flatpak" {
        return skipped_step(
            "Clear stuck instance",
            "Native Protontricks — no Flatpak instance to clear.",
        );
    }
    // `flatpak kill` only signals the Protontricks app; a running game is unaffected.
    let script = format!("flatpak kill {PROTONTRICKS_FLATPAK_ID} >/dev/null 2>&1; exit 0");
    match run_host_bash(&script, PROTONTRICKS_PROBE_TIMEOUT_SECS) {
        Ok(_) => ok_step("Clear stuck instance", "Signalled any hung Protontricks process to exit."),
        Err(e) => {
            if let Some(log) = logger {
                log.warn("repair", &format!("flatpak kill failed: {e}"));
            }
            failed_step("Clear stuck instance", e.to_string())
        }
    }
}

fn clean_winetricks_cache(logger: Option<&ProtonLogger>) -> RepairStep {
    // Covers both the Protontricks Flatpak cache and a native winetricks cache.
    let script = r#"removed=0
for base in "$HOME/.var/app/com.github.Matoking.protontricks/cache/winetricks" "$HOME/.cache/winetricks"; do
  [ -d "$base" ] || continue
  n=$(find "$base" -type f \( -name '*.part' -o -name '*.tmp' -o -name '*.lock' \) 2>/dev/null | wc -l)
  find "$base" -type f \( -name '*.part' -o -name '*.tmp' -o -name '*.lock' \) -delete 2>/dev/null || true
  removed=$((removed + n))
done
echo "$removed""#;
    match run_host_bash(script, host_command::DEFAULT_HOST_TIMEOUT_SECS) {
        Ok(out) => {
            let count: u32 = String::from_utf8_lossy(&out.stdout).trim().parse().unwrap_or(0);
            if count > 0 {
                ok_step(
                    "Clean winetricks cache",
                    format!("Removed {count} stale lock/partial file(s)."),
                )
            } else {
                skipped_step("Clean winetricks cache", "No stale lock or partial files found.")
            }
        }
        Err(e) => {
            if let Some(log) = logger {
                log.warn("repair", &format!("cache clean failed: {e}"));
            }
            failed_step("Clean winetricks cache", e.to_string())
        }
    }
}

fn repair_shortcuts_step() -> RepairStep {
    match resolve_shortcuts_path() {
        Ok(Some(path)) => match is_shortcuts_corrupted(&path) {
            Ok(true) => match repair_shortcuts_on_host(&path) {
                Ok(action) => ok_step(
                    "Repair Steam shortcuts",
                    format!("shortcuts.vdf was corrupted ({action})."),
                ),
                Err(e) => failed_step("Repair Steam shortcuts", e.to_string()),
            },
            Ok(false) => skipped_step("Repair Steam shortcuts", "shortcuts.vdf is valid."),
            Err(e) => failed_step("Repair Steam shortcuts", e.to_string()),
        },
        Ok(None) => skipped_step("Repair Steam shortcuts", "No shortcuts.vdf found."),
        Err(e) => failed_step("Repair Steam shortcuts", e.to_string()),
    }
}

fn resolve_shortcuts_path() -> Result<Option<PathBuf>> {
    let script = r#"
for root in "$HOME/.steam/steam" "$HOME/.local/share/Steam" "$HOME/.var/app/com.valvesoftware.Steam/data/Steam"; do
  ud="$root/userdata"
  [ -d "$ud" ] || continue
  for entry in "$ud"/*; do
    cfg="$entry/config/shortcuts.vdf"
    if [ -f "$cfg" ]; then
      echo "$cfg"
      exit 0
    fi
  done
  for entry in "$ud"/*; do
    [ -d "$entry/config" ] || continue
    echo "$entry/config/shortcuts.vdf"
    exit 0
  done
done
exit 0
"#;
    let output = run_host_bash(script, host_command::DEFAULT_HOST_TIMEOUT_SECS)?;
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(line)))
    }
}

fn is_shortcuts_corrupted(path: &Path) -> Result<bool> {
    let path_s = path.display().to_string().replace('"', "\\\"");
    let script = format!(
        r#"p="{path_s}"
if [ ! -f "$p" ]; then echo ok; exit 0; fi
first=$(head -c 1 "$p" | od -An -t u1 | tr -d ' ')
if [ "$first" = "34" ]; then echo corrupted_text; exit 0; fi
hex=$(head -c 2 "$p" | xxd -p 2>/dev/null || echo "")
if [ -n "$hex" ] && [ "$hex" != "0001" ]; then echo corrupted_binary; exit 0; fi
echo ok"#
    );
    let output = run_host_bash(&script, host_command::DEFAULT_HOST_TIMEOUT_SECS)?;
    let status = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(status.starts_with("corrupted"))
}

fn backup_path(shortcuts: &Path) -> Option<PathBuf> {
    let name = shortcuts.file_name()?.to_str()?;
    let parent = shortcuts.parent()?;
    Some(parent.join(format!("{name}.{BACKUP_SUFFIX}")))
}

fn repair_shortcuts_on_host(shortcuts: &Path) -> Result<String> {
    let path_s = shortcuts.display().to_string().replace('"', "\\\"");
    let backup_s = backup_path(shortcuts)
        .map(|p| p.display().to_string().replace('"', "\\\""))
        .unwrap_or_default();
    let script = format!(
        r#"set -e
p="{path_s}"
backup="{backup_s}"
ts=$(date +%s)
backup_ok() {{
  [ -f "$1" ] || return 1
  first=$(head -c 1 "$1" | od -An -t u1 | tr -d ' ')
  [ "$first" != "34" ] || return 1
  hex=$(head -c 2 "$1" | xxd -p 2>/dev/null || echo "")
  [ -z "$hex" ] || [ "$hex" = "0001" ]
}}
if [ -f "$backup" ] && backup_ok "$backup"; then
  [ -f "$p" ] && cp "$p" "${{p}}.broken.$ts" || true
  cp "$backup" "$p"
  echo restored_backup
  exit 0
fi
if [ -f "$p" ]; then
  mv "$p" "${{p}}.broken.$ts"
  echo removed_corrupted
  exit 0
fi
echo already_ok"#
    );
    let output = run_host_bash(&script, host_command::DEFAULT_HOST_TIMEOUT_SECS)?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(NexusDeckError::Other(format!(
            "Could not repair shortcuts.vdf: {}",
            err.trim()
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn probe_protontricks(pt: &proton_deps::ProtontricksInfo, logger: Option<&ProtonLogger>) -> bool {
    let script = if pt.kind == "flatpak" {
        format!("flatpak run {PROTONTRICKS_FLATPAK_ID} --no-term -l 2>/dev/null | head -c 1")
    } else {
        let cmd = if pt.command.is_empty() {
            "protontricks".to_string()
        } else {
            pt.command.clone()
        };
        format!("{cmd} --no-term -l 2>/dev/null | head -c 1")
    };
    let result = run_host_bash(&script, PROTONTRICKS_PROBE_TIMEOUT_SECS)
        .map(|o| {
            let ok = o.status.success() && !o.stdout.is_empty();
            if let Some(log) = logger {
                log.log_command(
                    "probe",
                    &script,
                    &String::from_utf8_lossy(&o.stdout),
                    &String::from_utf8_lossy(&o.stderr),
                    ok,
                );
            }
            ok
        })
        .unwrap_or(false);
    result
}

fn run_host_bash(script: &str, timeout_secs: u64) -> Result<std::process::Output> {
    host_command::run_bash(script, timeout_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_path_suffix() {
        let p = PathBuf::from("/home/deck/.local/share/Steam/userdata/123/config/shortcuts.vdf");
        assert_eq!(
            backup_path(&p).unwrap(),
            PathBuf::from("/home/deck/.local/share/Steam/userdata/123/config/shortcuts.vdf.nexusdeck_backup")
        );
    }
}
