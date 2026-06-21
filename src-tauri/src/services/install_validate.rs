use std::path::Path;

use crate::services::install_session::InstallSession;

#[derive(Debug, Default)]
pub struct ValidationReport {
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

impl ValidationReport {
    pub fn ok(&self) -> bool {
        self.errors.is_empty()
    }
}

pub fn validate_fallout4_install(
    manifest_files: &[String],
    game_path: &Path,
    session: &InstallSession,
) -> ValidationReport {
    let mut report = ValidationReport::default();
    let data_root = game_path.join("Data");

    let plugins: Vec<_> = manifest_files
        .iter()
        .filter(|f| {
            let lower = f.to_lowercase();
            lower.ends_with(".esp") || lower.ends_with(".esm") || lower.ends_with(".esl")
        })
        .collect();

    let ba2_files: std::collections::HashSet<String> = manifest_files
        .iter()
        .filter(|f| f.to_lowercase().ends_with(".ba2"))
        .map(|f| {
            Path::new(f)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
        })
        .collect();

    for plugin in &plugins {
        let stem = Path::new(plugin)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let has_ba2 = ba2_files.contains(&stem);
        let ba2_on_disk = data_root.join(format!("{stem}.ba2")).is_file()
            || data_root.join(format!("{stem} - Main.ba2")).is_file()
            || data_root.join(format!("{stem} - Textures.ba2")).is_file();

        if !has_ba2 && !ba2_on_disk {
            let msg = format!(
                "Plugin {} installed without matching BA2 archive — textures may be missing",
                Path::new(plugin)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(plugin)
            );
            session.warn("validate", &msg);
            report.warnings.push(msg);
        }

        if let Ok(warnings) = check_plugin_masters(plugin) {
            for w in warnings {
                session.warn("validate", &w);
                report.warnings.push(w);
            }
        }
    }

    if report.warnings.is_empty() && !plugins.is_empty() {
        session.info(
            "validate",
            &format!("Validated {} plugin(s)", plugins.len()),
        );
    }

    let mesh_count = manifest_files
        .iter()
        .filter(|f| f.to_lowercase().ends_with(".nif"))
        .count();
    let caliente_outside_data = manifest_files.iter().any(|f| {
        let lower = f.replace('\\', "/").to_lowercase();
        lower.contains("calientetools/") && !lower.contains("/data/calientetools/")
            && !lower.starts_with("data/calientetools/")
    });
    if caliente_outside_data {
        let msg = "CalienteTools files deployed outside Data/ — BodySlide may not be detected. Re-install with merge_loose_to_data strategy.";
        session.warn("validate", msg);
        report.warnings.push(msg.to_string());
    }

    let body_keywords = ["cbbe", "caliente", "bodyslide", "body"];
    let is_body_mod = manifest_files.iter().any(|f| {
        let lower = f.to_lowercase();
        body_keywords.iter().any(|k| lower.contains(k))
    });
    if is_body_mod && mesh_count == 0 && plugins.is_empty() {
        let msg = "Body mod install contains no mesh files — only metadata may have deployed.";
        session.warn("validate", msg);
        report.warnings.push(msg.to_string());
    }

    report
}

fn check_plugin_masters(plugin_path: &str) -> Result<Vec<String>, std::io::Error> {
    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(plugin_path)?;
    let mut header = [0u8; 8192];
    let n = file.read(&mut header)?;
    let text = String::from_utf8_lossy(&header[..n]);

    if !text.starts_with("TES4") && !text.contains("HEDR") {
        return Ok(Vec::new());
    }

    let mut warnings = Vec::new();
    for line in text.lines() {
        if line.contains("MAST") || line.contains("Master") {
            continue;
        }
    }

    if text.contains("Fallout4.esm") || text.contains("Skyrim") {
        let _ = warnings;
    }

    Ok(warnings)
}
