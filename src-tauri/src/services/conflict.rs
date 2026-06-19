use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub path: String,
    pub existing_mod: String,
    pub new_mod: String,
}

pub fn detect_conflicts(
    existing_manifests: &[(String, Vec<String>)],
    new_files: &[String],
    new_mod_name: &str,
) -> Vec<FileConflict> {
    let mut file_to_mod: HashMap<String, String> = HashMap::new();

    for (mod_name, files) in existing_manifests {
        for file in files {
            let normalized = normalize_path(file);
            file_to_mod.insert(normalized, mod_name.clone());
        }
    }

    let mut conflicts = Vec::new();
    let mut seen = HashSet::new();

    for file in new_files {
        let normalized = normalize_path(file);
        if seen.contains(&normalized) {
            continue;
        }
        seen.insert(normalized.clone());

        if let Some(existing_mod) = file_to_mod.get(&normalized) {
            if existing_mod != new_mod_name {
                conflicts.push(FileConflict {
                    path: normalized,
                    existing_mod: existing_mod.clone(),
                    new_mod: new_mod_name.to_string(),
                });
            }
        }
    }

    conflicts
}

fn normalize_path(path: &str) -> String {
    Path::new(path)
        .display()
        .to_string()
        .replace('\\', "/")
        .to_lowercase()
}
