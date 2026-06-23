use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use serde::{Deserialize, Serialize};

use crate::db::Profile;
use crate::error::{NexusDeckError, Result};
use crate::services::platform;
use crate::services::proton_log::ProtonLogger;

pub const PROTONTRICKS_FLATPAK_ID: &str = "com.github.Matoking.protontricks";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtontricksInfo {
    pub available: bool,
    pub command: String,
    pub message: String,
    /// "native", "flatpak", or "none"
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonDepsResult {
    pub success: bool,
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<String>,
    pub message: String,
    /// Per-package stderr/stdout snippets when a verb fails.
    pub failure_details: Vec<(String, String)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DepsConfig {
    app_id: u32,
    packages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtonDepProgress {
    pub package: String,
    pub index: usize,
    pub total: usize,
    /// "installing" | "done" | "failed"
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepsVerification {
    pub satisfied: bool,
    pub present: Vec<String>,
    pub missing: Vec<String>,
    pub protontricks_available: bool,
    /// True when we actually queried the prefix; false means we fell back to the marker file.
    pub checked_against_prefix: bool,
}

#[derive(Debug, Clone)]
enum ProtontricksRunner {
    Native(String),
    Flatpak,
}

pub fn detect_protontricks() -> ProtontricksInfo {
    if cfg!(target_os = "windows") {
        return ProtontricksInfo {
            available: false,
            command: String::new(),
            message: "protontricks is Linux-only (Proton prefixes).".to_string(),
            kind: "none".into(),
        };
    }

    if platform::is_flatpak_sandbox() {
        detect_protontricks_host().unwrap_or_else(protontricks_missing)
    } else {
        detect_protontricks_local()
    }
}

fn protontricks_missing() -> ProtontricksInfo {
    ProtontricksInfo {
        available: false,
        command: String::new(),
        message: "Install Protontricks from Discover (search \"Protontricks\") or run: flatpak install flathub com.github.Matoking.protontricks".into(),
        kind: "none".into(),
    }
}

fn detect_protontricks_local() -> ProtontricksInfo {
    if which::which("protontricks").is_ok() {
        return ProtontricksInfo {
            available: true,
            command: "protontricks".to_string(),
            message: "Protontricks found on PATH.".to_string(),
            kind: "native".into(),
        };
    }

    if flatpak_app_installed(PROTONTRICKS_FLATPAK_ID) {
        return ProtontricksInfo {
            available: true,
            command: format!("flatpak run {PROTONTRICKS_FLATPAK_ID}"),
            message: "Protontricks Flatpak detected.".to_string(),
            kind: "flatpak".into(),
        };
    }

    protontricks_missing()
}

fn detect_protontricks_host() -> Option<ProtontricksInfo> {
    let script = format!(
        r#"set -e
if command -v protontricks >/dev/null 2>&1; then
  echo "native|$(command -v protontricks)"
  exit 0
fi
if flatpak info {PROTONTRICKS_FLATPAK_ID} >/dev/null 2>&1; then
  echo "flatpak|{PROTONTRICKS_FLATPAK_ID}"
  exit 0
fi
if flatpak list --app --columns=application 2>/dev/null | grep -qx '{PROTONTRICKS_FLATPAK_ID}'; then
  echo "flatpak|{PROTONTRICKS_FLATPAK_ID}"
  exit 0
fi
exit 1"#
    );
    let output = run_host_bash(&script).ok()?;
    if !output.status.success() {
        return None;
    }
    parse_protontricks_detection(&output)
}

fn parse_protontricks_detection(output: &Output) -> Option<ProtontricksInfo> {
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let (kind, detail) = line.split_once('|')?;
    match kind {
        "native" if !detail.is_empty() => Some(ProtontricksInfo {
            available: true,
            command: detail.to_string(),
            message: format!("Protontricks found on the host at {detail}."),
            kind: "native".into(),
        }),
        "flatpak" => Some(ProtontricksInfo {
            available: true,
            command: format!("flatpak run {PROTONTRICKS_FLATPAK_ID}"),
            message: "Protontricks Flatpak detected on the host.".to_string(),
            kind: "flatpak".into(),
        }),
        _ => None,
    }
}

fn flatpak_app_installed(app_id: &str) -> bool {
    Command::new("flatpak")
        .args(["info", app_id])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn run_host_bash(script: &str) -> Result<Output> {
    Command::new("flatpak-spawn")
        .args(["--host", "bash", "-lc", script])
        .output()
        .map_err(|e| NexusDeckError::Other(format!("Host command failed: {e}")))
}

fn run_on_host(program: &str, args: &[&str], env: &[(&str, &str)]) -> Result<Output> {
    let output = if platform::is_flatpak_sandbox() {
        let mut cmd = Command::new("flatpak-spawn");
        cmd.arg("--host");
        for (key, value) in env {
            cmd.arg(format!("--env={key}={value}"));
        }
        cmd.arg(program).args(args);
        cmd.output()
    } else {
        let mut cmd = Command::new(program);
        for (key, value) in env {
            cmd.env(key, value);
        }
        cmd.args(args).output()
    }
    .map_err(|e| NexusDeckError::Other(format!("Failed to run {program}: {e}")))?;
    Ok(output)
}

pub fn list_game_deps(game_domain: &str) -> Result<Vec<String>> {
    let config = load_deps_config(game_domain)?;
    Ok(config.packages)
}

pub fn install_game_deps_for_profile(profile: &Profile, dry_run: bool) -> Result<ProtonDepsResult> {
    let config = load_deps_config(&profile.game_domain)?;
    install_packages_with_context(
        config.app_id,
        &config.packages,
        profile.proton_prefix_path.as_deref(),
        dry_run,
        None,
        None,
    )
}

pub fn install_game_deps_for_profile_with_progress(
    profile: &Profile,
    dry_run: bool,
    on_progress: &dyn Fn(ProtonDepProgress),
    logger: Option<&ProtonLogger>,
) -> Result<ProtonDepsResult> {
    let config = load_deps_config(&profile.game_domain)?;
    install_packages_with_context(
        config.app_id,
        &config.packages,
        profile.proton_prefix_path.as_deref(),
        dry_run,
        Some(on_progress),
        logger,
    )
}

pub fn install_packages_for_app(
    app_id: u32,
    packages: &[&str],
    logger: Option<&ProtonLogger>,
) -> Result<ProtonDepsResult> {
    install_packages_with_context(app_id, packages, None, false, None, logger)
}

pub fn install_game_deps(game_domain: &str, dry_run: bool) -> Result<ProtonDepsResult> {
    let config = load_deps_config(game_domain)?;
    install_packages_with_context(config.app_id, &config.packages, None, dry_run, None, None)
}

pub fn install_game_deps_with_progress(
    game_domain: &str,
    dry_run: bool,
    on_progress: &dyn Fn(ProtonDepProgress),
    logger: Option<&ProtonLogger>,
) -> Result<ProtonDepsResult> {
    let config = load_deps_config(game_domain)?;
    install_packages_with_context(
        config.app_id,
        &config.packages,
        None,
        dry_run,
        Some(on_progress),
        logger,
    )
}

fn finish_deps_result(mut result: ProtonDepsResult, logger: Option<&ProtonLogger>) -> ProtonDepsResult {
    if let Some(log) = logger {
        result.log_path = Some(log.log_path_string());
        let level = if result.success {
            crate::services::install_log::LogLevel::Info
        } else {
            crate::services::install_log::LogLevel::Warn
        };
        log.log(level, "result", &result.message);
    }
    result
}

fn install_packages_with_context(
    app_id: u32,
    packages: &[impl AsRef<str>],
    prefix_hint: Option<&str>,
    dry_run: bool,
    on_progress: Option<&dyn Fn(ProtonDepProgress)>,
    logger: Option<&ProtonLogger>,
) -> Result<ProtonDepsResult> {
    if let Some(log) = logger {
        log.info(
            "setup",
            &format!(
                "Installing {} packages for Steam app {app_id} (dry_run={dry_run})",
                packages.len()
            ),
        );
    }

    if cfg!(target_os = "windows") {
        return Ok(finish_deps_result(
            ProtonDepsResult {
                success: true,
                installed: vec![],
                skipped: packages.iter().map(|p| p.as_ref().to_string()).collect(),
                failed: vec![],
                message: "Proton dependencies are not required on Windows.".to_string(),
                failure_details: vec![],
                log_path: None,
            },
            logger,
        ));
    }

    let pt = detect_protontricks();
    if let Some(log) = logger {
        log.info(
            "protontricks",
            &format!("Detected: available={} kind={} cmd={}", pt.available, pt.kind, pt.command),
        );
    }
    if !pt.available {
        return Ok(finish_deps_result(
            ProtonDepsResult {
                success: false,
                installed: vec![],
                skipped: vec![],
                failed: packages.iter().map(|p| p.as_ref().to_string()).collect(),
                message: pt.message,
                failure_details: vec![],
                log_path: None,
            },
            logger,
        ));
    }

    if dry_run {
        return Ok(finish_deps_result(
            ProtonDepsResult {
                success: true,
                installed: vec![],
                skipped: packages.iter().map(|p| p.as_ref().to_string()).collect(),
                failed: vec![],
                message: format!(
                    "Would install {} packages via protontricks for app {app_id}.",
                    packages.len()
                ),
                failure_details: vec![],
                log_path: None,
            },
            logger,
        ));
    }

    let compatdata = resolve_compatdata_path(app_id, prefix_hint);
    if compatdata.is_none() {
        if let Some(log) = logger {
            log.warn("prefix", &prefix_missing_message(app_id));
        }
        return Ok(finish_deps_result(
            ProtonDepsResult {
                success: false,
                installed: vec![],
                skipped: vec![],
                failed: packages.iter().map(|p| p.as_ref().to_string()).collect(),
                message: prefix_missing_message(app_id),
                failure_details: vec![],
                log_path: None,
            },
            logger,
        ));
    }
    let compatdata = compatdata.unwrap();
    if let Some(log) = logger {
        log.info(
            "prefix",
            &format!("Using compatdata at {}", compatdata.display()),
        );
    }

    if let Some(cb) = on_progress {
        cb(ProtonDepProgress {
            package: String::new(),
            index: 0,
            total: packages.len(),
            status: "preparing".into(),
        });
    }

    let _ = ensure_protontricks_flatpak_access();
    if let Some(log) = logger {
        log.info("setup", "Ensured Protontricks Flatpak filesystem access");
    }

    let package_names: Vec<String> = packages.iter().map(|p| p.as_ref().to_string()).collect();
    let total = package_names.len();
    let mut installed = Vec::new();
    let mut failed = Vec::new();
    let mut failure_details = Vec::new();

    // Install per-package so the UI can report live progress (which one, x of n)
    // instead of one long blocking call that looks hung for several minutes.
    for (idx, pkg) in package_names.iter().enumerate() {
        if let Some(log) = logger {
            log.info("package", &format!("Installing {pkg} ({}/{total})", idx + 1));
        }
        if let Some(cb) = on_progress {
            cb(ProtonDepProgress {
                package: pkg.clone(),
                index: idx + 1,
                total,
                status: "installing".into(),
            });
        }
        // .NET needs Wine's bundled mono removed first or the installer aborts.
        if pkg == "dotnet48" {
            let _ = run_protontricks_verbs(app_id, &compatdata, &["remove_mono"], &pt, logger);
        }
        match run_protontricks_verbs(app_id, &compatdata, std::slice::from_ref(pkg), &pt, logger) {
            Ok(()) => {
                installed.push(pkg.clone());
                if let Some(log) = logger {
                    log.info("package", &format!("Installed {pkg}"));
                }
                if let Some(cb) = on_progress {
                    cb(ProtonDepProgress {
                        package: pkg.clone(),
                        index: idx + 1,
                        total,
                        status: "done".into(),
                    });
                }
            }
            Err(e) => {
                let detail = e.to_string();
                log::warn!("protontricks {pkg} failed: {detail}");
                if let Some(log) = logger {
                    log.warn("package", &format!("Failed {pkg}: {detail}"));
                }
                failed.push(pkg.clone());
                failure_details.push((pkg.clone(), detail));
                if let Some(cb) = on_progress {
                    cb(ProtonDepProgress {
                        package: pkg.clone(),
                        index: idx + 1,
                        total,
                        status: "failed".into(),
                    });
                }
            }
        }
    }

    // Only mark the prefix "ready" when every dependency installed. A partial
    // install (e.g. vcrun ok but dotnet48 failed) must not report deps as done —
    // otherwise the UI shows a green check while BodySlide still launches empty.
    if failed.is_empty() && !installed.is_empty() {
        let _ = mark_deps_installed(app_id, &compatdata);
        if let Some(log) = logger {
            log.info("marker", "Marked deps as installed on prefix");
        }
    }

    let success = failed.is_empty();
    let message = format_deps_message(&installed, &[], &failed, &failure_details);
    Ok(finish_deps_result(
        ProtonDepsResult {
            success,
            installed,
            skipped: vec![],
            failed,
            message,
            failure_details,
            log_path: None,
        },
        logger,
    ))
}

fn load_deps_config(game_domain: &str) -> Result<DepsConfig> {
    let raw = match game_domain {
        "skyrimspecialedition" => {
            include_str!("../games/rules/skyrimspecialedition_proton_deps.json")
        }
        "fallout4" => {
            r#"{"app_id":377160,"packages":["vcrun2019","dotnet48","d3dx9_43","xact","xact_64","xinput"]}"#
        }
        other => {
            return Err(NexusDeckError::Other(format!(
                "No Proton dependency list for {other}"
            )));
        }
    };
    serde_json::from_str(raw).map_err(|e| NexusDeckError::Other(e.to_string()))
}

fn runners_for(pt: &ProtontricksInfo) -> Vec<ProtontricksRunner> {
    let mut runners = Vec::new();
    match pt.kind.as_str() {
        "native" => {
            let cmd = if pt.command.is_empty() {
                "protontricks".to_string()
            } else {
                pt.command.clone()
            };
            runners.push(ProtontricksRunner::Native(cmd));
            runners.push(ProtontricksRunner::Flatpak);
        }
        "flatpak" => {
            runners.push(ProtontricksRunner::Flatpak);
            if !pt.command.is_empty() && pt.command.contains("protontricks") && !pt.command.contains("flatpak run") {
                runners.push(ProtontricksRunner::Native(pt.command.clone()));
            }
        }
        _ => {}
    }
    runners
}

fn run_protontricks_verbs(
    app_id: u32,
    compatdata: &Path,
    packages: &[impl AsRef<str>],
    pt: &ProtontricksInfo,
    logger: Option<&ProtonLogger>,
) -> Result<()> {
    let app_id_str = app_id.to_string();
    let package_names: Vec<String> = packages.iter().map(|p| p.as_ref().to_string()).collect();
    let env = [("STEAM_COMPAT_DATA_PATH", compatdata.to_string_lossy().into_owned())];
    let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let mut last_error = String::new();
    for runner in runners_for(pt) {
        let (command_label, output) = match runner {
            ProtontricksRunner::Native(ref cmd) => {
                let mut args = vec!["--no-term", app_id_str.as_str(), "-q"];
                args.extend(package_names.iter().map(String::as_str));
                let label = format!("{cmd} {}", args.join(" "));
                (label, run_on_host(cmd, &args, &env_refs))
            }
            ProtontricksRunner::Flatpak => {
                let mut args = vec![
                    "run",
                    PROTONTRICKS_FLATPAK_ID,
                    "--no-term",
                    app_id_str.as_str(),
                    "-q",
                ];
                args.extend(package_names.iter().map(String::as_str));
                let label = format!("flatpak {}", args.join(" "));
                (label, run_on_host("flatpak", &args, &env_refs))
            }
        };

        match output {
            Ok(out) if out.status.success() => {
                if let Some(log) = logger {
                    log.log_command(
                        "protontricks",
                        &command_label,
                        &String::from_utf8_lossy(&out.stdout),
                        &String::from_utf8_lossy(&out.stderr),
                        true,
                    );
                }
                return Ok(());
            }
            Ok(out) => {
                last_error = format_command_error(&package_names, &out);
                if let Some(log) = logger {
                    log.log_command(
                        "protontricks",
                        &command_label,
                        &String::from_utf8_lossy(&out.stdout),
                        &String::from_utf8_lossy(&out.stderr),
                        false,
                    );
                }
                log::warn!("protontricks runner {:?} failed: {last_error}", runner);
            }
            Err(e) => {
                last_error = e.to_string();
                if let Some(log) = logger {
                    log.warn("protontricks", &format!("Runner {:?} error: {last_error}", runner));
                }
                log::warn!("protontricks runner {:?} error: {last_error}", runner);
            }
        }
    }

    Err(NexusDeckError::Other(if last_error.is_empty() {
        format!("protontricks failed for {}", package_names.join(", "))
    } else {
        last_error
    }))
}

fn format_command_error(packages: &[String], output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim().to_string()
    } else {
        stderr.trim().to_string()
    };
    format!("protontricks {}: {detail}", packages.join(", "))
}

/// List the winetricks verbs actually installed in the prefix via
/// `protontricks <appid> list-installed`, so we can verify deps against reality
/// instead of trusting the marker file.
fn installed_verbs(app_id: u32, compatdata: &Path, pt: &ProtontricksInfo) -> Result<Vec<String>> {
    let app_id_str = app_id.to_string();
    let env = [(
        "STEAM_COMPAT_DATA_PATH",
        compatdata.to_string_lossy().into_owned(),
    )];
    let env_refs: Vec<(&str, &str)> = env.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let mut last_error = String::new();
    for runner in runners_for(pt) {
        let output = match runner {
            ProtontricksRunner::Native(ref cmd) => run_on_host(
                cmd,
                &["--no-term", app_id_str.as_str(), "list-installed"],
                &env_refs,
            ),
            ProtontricksRunner::Flatpak => run_on_host(
                "flatpak",
                &[
                    "run",
                    PROTONTRICKS_FLATPAK_ID,
                    "--no-term",
                    app_id_str.as_str(),
                    "list-installed",
                ],
                &env_refs,
            ),
        };
        match output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                // winetricks prints one verb per line; ignore protontricks log noise
                // (lines with spaces) and blanks.
                let verbs = text
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.contains(char::is_whitespace))
                    .map(|l| l.to_string())
                    .collect();
                return Ok(verbs);
            }
            Ok(out) => last_error = format_command_error(&["list-installed".to_string()], &out),
            Err(e) => last_error = e.to_string(),
        }
    }

    Err(NexusDeckError::Other(if last_error.is_empty() {
        "protontricks list-installed failed".to_string()
    } else {
        last_error
    }))
}

pub fn ensure_protontricks_flatpak_access() -> Result<()> {
    if cfg!(target_os = "windows") {
        return Ok(());
    }
    let script = format!(
        r#"flatpak info {PROTONTRICKS_FLATPAK_ID} >/dev/null 2>&1 || exit 0
flatpak override --user {PROTONTRICKS_FLATPAK_ID} \
  --filesystem=home \
  --filesystem=/run/media \
  --filesystem=/var/mnt \
  --filesystem=/mnt \
  >/dev/null 2>&1 || true"#
    );
    if platform::is_flatpak_sandbox() {
        let _ = run_host_bash(&script);
    } else {
        let _ = Command::new("bash").args(["-lc", &script]).output();
    }
    Ok(())
}

fn resolve_compatdata_path(app_id: u32, prefix_hint: Option<&str>) -> Option<PathBuf> {
    if let Some(hint) = prefix_hint.filter(|s| !s.is_empty()) {
        if let Some(path) = compatdata_from_hint(hint) {
            return Some(path);
        }
    }

    if let Some(path) = resolve_compatdata_local(app_id) {
        return Some(path);
    }

    resolve_compatdata_on_host(app_id)
}

fn compatdata_from_hint(hint: &str) -> Option<PathBuf> {
    let path = PathBuf::from(hint);
    if path.join("user.reg").is_file() {
        return path.parent().map(Path::to_path_buf);
    }
    if path.join("pfx/user.reg").is_file() {
        return Some(path);
    }
    if path.ends_with("pfx") {
        return path.parent().map(Path::to_path_buf);
    }
    if path.join("pfx").is_dir() {
        return Some(path);
    }
    None
}

fn resolve_compatdata_local(app_id: u32) -> Option<PathBuf> {
    if let Ok(steam) = steamlocate::SteamDir::locate() {
        if let Ok(libraries) = steam.libraries() {
            for lib in libraries.filter_map(|l| l.ok()) {
                let compat = lib
                    .path()
                    .join("steamapps")
                    .join("compatdata")
                    .join(app_id.to_string());
                if compat.join("pfx/user.reg").is_file() {
                    return Some(compat);
                }
            }
        }
    }

    let fallback = dirs::home_dir()
        .unwrap_or_default()
        .join(".local/share/Steam/steamapps/compatdata")
        .join(app_id.to_string());
    fallback.join("pfx/user.reg").is_file().then_some(fallback)
}

fn resolve_compatdata_on_host(app_id: u32) -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        return None;
    }
    let script = format!(
        r#"APP_ID={app_id}
for reg in \
  "$HOME/.local/share/Steam/steamapps/compatdata/$APP_ID/pfx/user.reg" \
  "$HOME/.steam/steam/steamapps/compatdata/$APP_ID/pfx/user.reg" \
  "$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/compatdata/$APP_ID/pfx/user.reg" \
  /run/media/*/*/steamapps/compatdata/$APP_ID/pfx/user.reg \
  /var/mnt/*/*/steamapps/compatdata/$APP_ID/pfx/user.reg \
  /mnt/*/*/steamapps/compatdata/$APP_ID/pfx/user.reg
do
  if [ -f "$reg" ]; then
    dirname "$(dirname "$reg")"
    exit 0
  fi
done
exit 1"#
    );

    let output = if platform::is_flatpak_sandbox() {
        run_host_bash(&script).ok()?
    } else {
        Command::new("bash")
            .args(["-lc", &script])
            .output()
            .ok()?
    };

    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if line.is_empty() {
        return None;
    }
    let compat = PathBuf::from(line);
    compat.join("pfx/user.reg").is_file().then_some(compat)
}

fn prefix_missing_message(app_id: u32) -> String {
    format!(
        "Proton prefix not found for Steam app {app_id}. Launch the game once from Steam to create the prefix, then try again."
    )
}

fn format_deps_message(
    installed: &[String],
    skipped: &[String],
    failed: &[String],
    failure_details: &[(String, String)],
) -> String {
    if failed.is_empty() {
        return format!(
            "Installed {} Proton dependencies ({} skipped). This can take several minutes — leave NexusDeck open.",
            installed.len(),
            skipped.len()
        );
    }

    let mut message = format!(
        "Some dependencies failed: {}. Installed: {}, skipped: {}.",
        failed.join(", "),
        installed.len(),
        skipped.len()
    );

    if let Some((pkg, detail)) = failure_details.first() {
        let snippet: String = detail.chars().take(320).collect();
        message.push_str(&format!("\nFirst error ({pkg}): {snippet}"));
    }

    if failed.iter().any(|p| p == "dotnet48") {
        message.push_str(
            "\nTip: .NET 4.8 often needs Proton Experimental. Switch Proton version in Steam, then retry.",
        );
    }

    if failure_details
        .iter()
        .any(|(_, d)| d.contains("Unknown option") || d.contains("not found"))
    {
        message.push_str(
            "\nTip: Update Protontricks from Discover/Flathub, then tap Check again in Settings.",
        );
    }

    if failure_details
        .iter()
        .any(|(_, d)| d.contains("No such file") || d.contains("prefix"))
    {
        message.push_str(
            "\nTip: If the game is on an SD card, launch it once from Steam so the prefix exists.",
        );
    }

    message
}

fn default_prefix_path(app_id: u32) -> PathBuf {
    resolve_compatdata_path(app_id, None)
        .map(|compat| compat.join("pfx"))
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_default()
                .join(".local/share/Steam/steamapps/compatdata")
                .join(app_id.to_string())
                .join("pfx")
        })
}

/// True when the Proton-dependency marker exists in the game's prefix (written
/// after a successful dependency install). Used to warn before launching tools
/// like BodySlide that need .NET/DirectX in the prefix to function.
pub fn deps_marker_present(app_id: u32, prefix_hint: Option<&str>) -> bool {
    resolve_compatdata_path(app_id, prefix_hint)
        .map(|compat| compat.join("pfx").join(".deckmodfix_deps").is_file())
        .unwrap_or(false)
}

pub fn deps_installed_for_profile(profile: &Profile) -> bool {
    let Ok(config) = load_deps_config(&profile.game_domain) else {
        return false;
    };
    deps_marker_present(config.app_id, profile.proton_prefix_path.as_deref())
}

/// True when we ship a Proton dependency list for this game (so a missing-deps
/// warning is meaningful rather than just "unsupported game").
pub fn game_has_deps_list(game_domain: &str) -> bool {
    load_deps_config(game_domain).is_ok()
}

fn marker_verification(
    app_id: u32,
    hint: Option<&str>,
    required: &[String],
    available: bool,
) -> DepsVerification {
    let marker = deps_marker_present(app_id, hint);
    DepsVerification {
        satisfied: marker,
        present: if marker { required.to_vec() } else { Vec::new() },
        missing: if marker { Vec::new() } else { required.to_vec() },
        protontricks_available: available,
        checked_against_prefix: false,
    }
}

/// Verify the required deps against the actual prefix (via `list-installed`) and
/// reconcile the fast-path marker with reality, so a prefix reset, Proton upgrade,
/// or partial install can't leave the UI reporting a stale "installed" state.
/// Falls back to the marker file when protontricks can't be queried.
pub fn verify_deps_for_profile(profile: &Profile) -> Result<DepsVerification> {
    verify_deps_for_domain_with_hint(&profile.game_domain, profile.proton_prefix_path.as_deref())
}

pub fn verify_deps_for_domain(game_domain: &str, prefix_hint: Option<&str>) -> Result<DepsVerification> {
    verify_deps_for_domain_with_hint(game_domain, prefix_hint)
}

fn verify_deps_for_domain_with_hint(
    game_domain: &str,
    prefix_hint: Option<&str>,
) -> Result<DepsVerification> {
    let config = load_deps_config(game_domain)?;
    let required = config.packages.clone();
    let pt = detect_protontricks();

    if !pt.available {
        return Ok(marker_verification(config.app_id, prefix_hint, &required, false));
    }

    let compatdata = match resolve_compatdata_path(config.app_id, prefix_hint) {
        Some(c) => c,
        None => {
            return Ok(DepsVerification {
                satisfied: false,
                present: Vec::new(),
                missing: required,
                protontricks_available: true,
                checked_against_prefix: false,
            })
        }
    };

    let verbs = match installed_verbs(config.app_id, &compatdata, &pt) {
        Ok(v) => v,
        Err(_) => return Ok(marker_verification(config.app_id, prefix_hint, &required, true)),
    };

    let verb_set: std::collections::HashSet<&str> = verbs.iter().map(|s| s.as_str()).collect();
    let mut present = Vec::new();
    let mut missing = Vec::new();
    for pkg in &required {
        if verb_set.contains(pkg.as_str()) {
            present.push(pkg.clone());
        } else {
            missing.push(pkg.clone());
        }
    }
    let satisfied = missing.is_empty();

    if satisfied {
        let _ = mark_deps_installed(config.app_id, &compatdata);
    } else {
        let _ = clear_deps_marker(config.app_id, &compatdata);
    }

    Ok(DepsVerification {
        satisfied,
        present,
        missing,
        protontricks_available: true,
        checked_against_prefix: true,
    })
}

pub fn mark_deps_installed(app_id: u32, compatdata: &Path) -> Result<()> {
    let marker = compatdata.join("pfx").join(".deckmodfix_deps");
    if let Some(parent) = marker.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&marker, chrono::Utc::now().to_rfc3339())?;
    let _ = app_id;
    Ok(())
}

pub fn clear_deps_marker(app_id: u32, compatdata: &Path) -> Result<()> {
    let marker = compatdata.join("pfx").join(".deckmodfix_deps");
    if marker.exists() {
        std::fs::remove_file(&marker)?;
    }
    let _ = app_id;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flatpak_pt() -> ProtontricksInfo {
        ProtontricksInfo {
            available: true,
            command: format!("flatpak run {PROTONTRICKS_FLATPAK_ID}"),
            message: "test".into(),
            kind: "flatpak".into(),
        }
    }

    fn native_pt() -> ProtontricksInfo {
        ProtontricksInfo {
            available: true,
            command: "protontricks".into(),
            message: "test".into(),
            kind: "native".into(),
        }
    }

    #[test]
    fn flatpak_runner_uses_no_term_not_invalid_flatpak_flag() {
        let runners = runners_for(&flatpak_pt());
        assert!(matches!(runners.first(), Some(ProtontricksRunner::Flatpak)));
    }

    #[test]
    fn native_runner_is_primary_when_detected() {
        let runners = runners_for(&native_pt());
        assert!(matches!(runners.first(), Some(ProtontricksRunner::Native(_))));
    }

    #[test]
    fn compatdata_from_pfx_hint() {
        let hint = "/home/deck/.local/share/Steam/steamapps/compatdata/489830/pfx";
        let compat = compatdata_from_hint(hint);
        assert_eq!(
            compat.map(|p| p.display().to_string()),
            Some("/home/deck/.local/share/Steam/steamapps/compatdata/489830".into())
        );
    }

    #[test]
    fn failure_message_includes_first_error_snippet() {
        let msg = format_deps_message(
            &[],
            &[],
            &["vcrun2019".into()],
            &[(
                "vcrun2019".into(),
                "protontricks vcrun2019: cabextract failed".into(),
            )],
        );
        assert!(msg.contains("Some dependencies failed"));
        assert!(msg.contains("First error (vcrun2019)"));
    }
}
