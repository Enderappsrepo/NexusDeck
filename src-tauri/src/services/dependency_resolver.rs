use std::collections::{HashSet, VecDeque};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::{self, Profile};
use crate::error::Result;
use crate::services::nexus_client::{NexusClient, RawRequirement};

const MAX_DEPTH: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModRequirement {
    pub mod_id: u64,
    pub name: String,
    pub game_domain: String,
    pub optional: bool,
    pub installed: bool,
    pub downloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyNode {
    pub mod_id: u64,
    pub parent_mod_id: Option<u64>,
    pub depth: u32,
    pub installed: bool,
    pub downloaded: bool,
    pub requirements: Vec<RawRequirement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyGraph {
    pub root_mod_id: u64,
    pub nodes: Vec<DependencyNode>,
    pub missing_required: Vec<ModRequirement>,
    pub cycles: Vec<Vec<u64>>,
}

pub async fn resolve_dependencies(
    nexus: &NexusClient,
    profile: &Profile,
    root_mod_id: u64,
) -> Result<DependencyGraph> {
    let installed: HashSet<u64> = db::list_installed_mods(&profile.id)?
        .into_iter()
        .map(|m| m.nexus_mod_id as u64)
        .collect();

    let mut nodes: Vec<DependencyNode> = Vec::new();
    let mut missing_required: Vec<ModRequirement> = Vec::new();
    let mut cycles: Vec<Vec<u64>> = Vec::new();
    let mut visited: HashSet<u64> = HashSet::new();
    let mut queue: VecDeque<(u64, u32, Option<u64>)> = VecDeque::new();

    queue.push_back((root_mod_id, 0, None));

    while let Some((mod_id, depth, parent)) = queue.pop_front() {
        if depth > MAX_DEPTH {
            continue;
        }
        if !visited.insert(mod_id) {
            cycles.push(vec![mod_id]);
            continue;
        }

        let reqs = nexus
            .get_mod_requirements(&profile.game_domain, mod_id)
            .await?;
        let installed_flag = installed.contains(&mod_id);
        let downloaded_flag = staging_has_mod(&profile.staging_path, mod_id);

        nodes.push(DependencyNode {
            mod_id,
            parent_mod_id: parent,
            depth,
            installed: installed_flag,
            downloaded: downloaded_flag,
            requirements: reqs.clone(),
        });

        for req in reqs {
            if req.optional {
                continue;
            }
            if !installed.contains(&req.mod_id) {
                missing_required.push(ModRequirement {
                    mod_id: req.mod_id,
                    name: req.name,
                    game_domain: req.game_domain.clone(),
                    optional: false,
                    installed: false,
                    downloaded: staging_has_mod(&profile.staging_path, req.mod_id),
                });
            }
            queue.push_back((req.mod_id, depth + 1, Some(mod_id)));
        }
    }

    Ok(DependencyGraph {
        root_mod_id,
        nodes,
        missing_required: dedupe_requirements(missing_required),
        cycles,
    })
}

fn dedupe_requirements(reqs: Vec<ModRequirement>) -> Vec<ModRequirement> {
    let mut seen = HashSet::new();
    reqs.into_iter()
        .filter(|r| seen.insert(r.mod_id))
        .collect()
}

fn staging_has_mod(staging_path: &str, mod_id: u64) -> bool {
    let staging = Path::new(staging_path);
    if !staging.is_dir() {
        return false;
    }
    let needle = mod_id.to_string();
    if let Ok(entries) = std::fs::read_dir(staging) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains(&needle) {
                return true;
            }
        }
    }
    false
}
