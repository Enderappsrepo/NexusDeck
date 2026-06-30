//! Parse `vortex_override_instructions.json` shipped by mod authors (Vortex 1.14+).
//! Lets NexusDeck honor explicit copy / mod-type hints before heuristic detection.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::games::DeployPlan;
use crate::services::archive::{read_archive_text, ArchiveEntry};
use crate::services::deploy::{
    infer_content_prefix, normalized_relative_paths, strip_archive_prefix,
};

const OVERRIDE_FILE: &str = "vortex_override_instructions.json";

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum VortexInstruction {
    Copy {
        source: String,
        destination: String,
    },
    Setmodtype {
        value: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CopyRule {
    pub source: String,
    pub destination: String,
}

pub fn find_vortex_override_path(entries: &[ArchiveEntry]) -> Option<String> {
    entries.iter().find_map(|entry| {
        if entry.is_dir {
            return None;
        }
        let lower = entry.path.replace('\\', "/").to_lowercase();
        if lower.ends_with(OVERRIDE_FILE) {
            Some(entry.path.clone())
        } else {
            None
        }
    })
}

pub fn find_vortex_override_on_disk(extract_dir: &Path) -> Option<PathBuf> {
    let content_root = crate::services::deploy::resolve_extract_root(extract_dir);
    let direct = content_root.join(OVERRIDE_FILE);
    if direct.is_file() {
        return Some(direct);
    }
    walkdir::WalkDir::new(&content_root)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .find(|e| {
            e.file_type().is_file()
                && e.file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(OVERRIDE_FILE)
        })
        .map(|e| e.path().to_path_buf())
}

pub fn read_vortex_override_json(
    archive_path: Option<&Path>,
    extract_dir: Option<&Path>,
    entries: &[ArchiveEntry],
) -> Option<String> {
    if let Some(dir) = extract_dir {
        if let Some(path) = find_vortex_override_on_disk(dir) {
            return std::fs::read_to_string(path).ok();
        }
    }
    let inner = find_vortex_override_path(entries)?;
    archive_path.and_then(|archive| read_archive_text(archive, &inner).ok())
}

pub fn plan_from_vortex_override(
    domain: &str,
    game_path: &Path,
    entries: &[ArchiveEntry],
    json: &str,
) -> Option<DeployPlan> {
    let instructions: Vec<VortexInstruction> = serde_json::from_str(json).ok()?;
    if instructions.is_empty() {
        return None;
    }

    let mut mod_type: Option<String> = None;
    let mut copies: Vec<(String, String)> = Vec::new();

    for instruction in instructions {
        match instruction {
            VortexInstruction::Setmodtype { value } => mod_type = Some(value),
            VortexInstruction::Copy {
                source,
                destination,
            } => copies.push((source, destination)),
            VortexInstruction::Other => {}
        }
    }

    if copies.is_empty() {
        return mod_type.map(|t| plan_from_mod_type(domain, game_path, &t));
    }

    let base = vortex_mod_type_base(game_path, domain, mod_type.as_deref());
    let prefix = infer_content_prefix(entries);
    let mut rules: Vec<CopyRule> = Vec::new();
    let mut source_index: HashMap<String, String> = HashMap::new();

    for entry in entries.iter().filter(|e| !e.is_dir) {
        let rel = strip_archive_prefix(&entry.path.replace('\\', "/"), prefix.as_deref());
        source_index.insert(normalize_rel(&rel), rel);
    }

    for (source, destination) in copies {
        let norm_source = normalize_rel(&source);
        let resolved_source = source_index
            .get(&norm_source)
            .cloned()
            .unwrap_or_else(|| source.replace('\\', "/"));
        let dest = base.join(destination.replace('\\', "/"));
        rules.push(CopyRule {
            source: resolved_source,
            destination: dest.display().to_string(),
        });
    }

    if rules.is_empty() {
        return None;
    }

    let target = base.display().to_string();
    Some(DeployPlan {
        strategy: "custom_copy".to_string(),
        source_subpath: None,
        target,
        requires_confirmation: false,
        description:
            "Mod author install instructions detected (Vortex override). Files will be placed as specified."
                .to_string(),
        copy_rules: Some(rules),
    })
}

pub fn try_vortex_override_plan(
    domain: &str,
    game_path: &Path,
    entries: &[ArchiveEntry],
    archive_path: Option<&Path>,
    extract_dir: Option<&Path>,
) -> Option<DeployPlan> {
    let json = read_vortex_override_json(archive_path, extract_dir, entries)?;
    plan_from_vortex_override(domain, game_path, entries, &json)
}

fn plan_from_mod_type(domain: &str, game_path: &Path, mod_type: &str) -> DeployPlan {
    let lower = mod_type.to_lowercase();
    match lower.as_str() {
        "dinput" | "enbinjector" | "enbroot" | "root" => DeployPlan {
            strategy: "merge_root".to_string(),
            source_subpath: None,
            target: game_path.display().to_string(),
            requires_confirmation: false,
            description:
                "Mod author marked this as a game-root install (Vortex engine-injector type)."
                    .to_string(),
            copy_rules: None,
        },
        "f4se" | "f4seplugin" if domain == "fallout4" => DeployPlan {
            strategy: "merge_loose_to_data".to_string(),
            source_subpath: Some("F4SE/Plugins".to_string()),
            target: game_path
                .join("Data")
                .join("F4SE")
                .join("Plugins")
                .display()
                .to_string(),
            requires_confirmation: false,
            description:
                "Mod author marked this as an F4SE plugin (Vortex override). Files install to Data/F4SE/Plugins/."
                    .to_string(),
            copy_rules: None,
        },
        "skse" | "skse64" | "skseplugin" if domain == "skyrimspecialedition" => DeployPlan {
            strategy: "merge_loose_to_data".to_string(),
            source_subpath: Some("SKSE/Plugins".to_string()),
            target: game_path
                .join("Data")
                .join("SKSE")
                .join("Plugins")
                .display()
                .to_string(),
            requires_confirmation: false,
            description:
                "Mod author marked this as an SKSE plugin (Vortex override). Files install to Data/SKSE/Plugins/."
                    .to_string(),
            copy_rules: None,
        },
        _ => DeployPlan {
            strategy: "merge_loose_to_data".to_string(),
            source_subpath: None,
            target: game_path.join("Data").display().to_string(),
            requires_confirmation: false,
            description:
                "Mod author marked this as a Data-folder install (Vortex override).".to_string(),
            copy_rules: None,
        },
    }
}

fn vortex_mod_type_base(game_path: &Path, domain: &str, mod_type: Option<&str>) -> PathBuf {
    match mod_type.map(|s| s.to_lowercase()).as_deref() {
        Some("dinput") | Some("enbinjector") | Some("enbroot") | Some("root") => {
            game_path.to_path_buf()
        }
        Some("f4se") | Some("f4seplugin") if domain == "fallout4" => game_path
            .join("Data")
            .join("F4SE")
            .join("Plugins"),
        Some("skse") | Some("skse64") | Some("skseplugin") if domain == "skyrimspecialedition" => {
            game_path.join("Data").join("SKSE").join("Plugins")
        }
        _ => game_path.join("Data"),
    }
}

fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches("./").to_lowercase()
}

pub fn is_vortex_override_metadata(path: &str) -> bool {
    normalize_rel(path).ends_with("vortex_override_instructions.json")
}

/// Resolve a deploy target for `custom_copy` plans.
pub fn custom_copy_target(plan: &DeployPlan, rel: &str) -> Option<PathBuf> {
    let rules = plan.copy_rules.as_ref()?;
    let norm = normalize_rel(rel);
    rules.iter().find_map(|rule| {
        if normalize_rel(&rule.source) == norm {
            Some(PathBuf::from(&rule.destination))
        } else {
            None
        }
    })
}

pub fn quick_install_eligible(
    plan: &DeployPlan,
    install_wizard_required: bool,
    option_group_count: usize,
    has_wizard_steps: bool,
    conflict_count: usize,
) -> bool {
    !install_wizard_required
        && option_group_count == 0
        && !has_wizard_steps
        && !plan.requires_confirmation
        && conflict_count == 0
        && plan.strategy != "staging_only"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::archive::ArchiveEntry;

    fn entry(path: &str) -> ArchiveEntry {
        ArchiveEntry {
            path: path.to_string(),
            size: 1,
            is_dir: false,
        }
    }

    #[test]
    fn copy_override_builds_custom_plan() {
        let game = std::env::temp_dir().join(format!("nexusdeck-vortex-{}", std::process::id()));
        let json = r#"[
            {"type": "setmodtype", "value": "dinput"},
            {"type": "copy", "source": "version-1-10-130-0.bin", "destination": "Data/F4SE/Plugins/version-1-10-130-0.bin"}
        ]"#;
        let entries = vec![entry("version-1-10-130-0.bin")];
        let plan = plan_from_vortex_override("fallout4", &game, &entries, json).unwrap();
        assert_eq!(plan.strategy, "custom_copy");
        assert!(!plan.requires_confirmation);
        let rules = plan.copy_rules.unwrap();
        assert_eq!(rules.len(), 1);
        assert!(rules[0].destination.contains("F4SE"));
    }

    #[test]
    fn setmodtype_only_maps_f4se_plugin_folder() {
        let game = std::env::temp_dir().join(format!("nexusdeck-vortex-type-{}", std::process::id()));
        let json = r#"[{"type": "setmodtype", "value": "f4se"}]"#;
        let plan = plan_from_vortex_override("fallout4", &game, &[], json).unwrap();
        assert_eq!(plan.strategy, "merge_loose_to_data");
        assert!(plan.target.contains("F4SE"));
    }
}
