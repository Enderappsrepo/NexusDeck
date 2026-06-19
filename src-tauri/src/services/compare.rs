use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::services::conflict::{detect_conflicts, FileConflict};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCompareSide {
    pub name: String,
    pub source: String,
    pub file_count: u64,
    pub plugin_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlapEntry {
    pub path: String,
    pub severity: String,
    pub is_plugin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCompareResult {
    pub mod_a: ModCompareSide,
    pub mod_b: ModCompareSide,
    pub overlapping_paths: Vec<OverlapEntry>,
    pub conflicts_with_installed: Vec<FileConflict>,
    pub unique_to_a: u64,
    pub unique_to_b: u64,
}

fn is_plugin(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".esp") || lower.ends_with(".esm") || lower.ends_with(".esl")
}

fn normalize(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

fn side_stats(name: &str, source: &str, files: &[String]) -> ModCompareSide {
    ModCompareSide {
        name: name.to_string(),
        source: source.to_string(),
        file_count: files.len() as u64,
        plugin_count: files.iter().filter(|f| is_plugin(f)).count() as u64,
    }
}

pub fn compare_file_lists(
    files_a: &[String],
    files_b: &[String],
    name_a: &str,
    name_b: &str,
    installed: &[(String, Vec<String>)],
) -> ModCompareResult {
    let set_a: HashSet<String> = files_a.iter().map(|f| normalize(f)).collect();
    let set_b: HashSet<String> = files_b.iter().map(|f| normalize(f)).collect();

    let overlapping_paths: Vec<OverlapEntry> = set_a
        .intersection(&set_b)
        .map(|path| {
            let plugin = is_plugin(path);
            let severity = if plugin {
                "plugin_conflict"
            } else if path.contains("textures/") {
                "texture_overlap"
            } else {
                "file_overlap"
            };
            OverlapEntry {
                path: path.clone(),
                severity: severity.to_string(),
                is_plugin: plugin,
            }
        })
        .collect();

    let unique_to_a = set_a.difference(&set_b).count() as u64;
    let unique_to_b = set_b.difference(&set_a).count() as u64;

    let mut conflicts_with_installed = detect_conflicts(installed, files_a, name_a);
    conflicts_with_installed.extend(detect_conflicts(installed, files_b, name_b));

    ModCompareResult {
        mod_a: side_stats(name_a, "staging", files_a),
        mod_b: side_stats(name_b, "staging", files_b),
        overlapping_paths,
        conflicts_with_installed,
        unique_to_a,
        unique_to_b,
    }
}
