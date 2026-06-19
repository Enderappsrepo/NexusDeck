use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NexusDeckError, Result};
use crate::services::archive::{self, ArchiveEntry};
use crate::services::paths::{ensure_dir, preview_cache_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Vec<PreviewNode>,
    pub previewable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewFileResult {
    pub path: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

fn is_previewable(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".dds")
}

pub fn build_file_tree(entries: &[ArchiveEntry]) -> Vec<PreviewNode> {
    let mut root = BTreeMap::<String, PreviewNode>::new();

    for entry in entries {
        let parts: Vec<&str> = entry.path.split('/').filter(|p| !p.is_empty()).collect();
        if parts.is_empty() {
            continue;
        }

        let mut current_path = String::new();
        for (idx, part) in parts.iter().enumerate() {
            let is_last = idx == parts.len() - 1;
            if !current_path.is_empty() {
                current_path.push('/');
            }
            current_path.push_str(part);

            let node = root.entry(current_path.clone()).or_insert_with(|| PreviewNode {
                name: part.to_string(),
                path: current_path.clone(),
                is_dir: !is_last || entry.is_dir,
                size: if is_last && !entry.is_dir {
                    entry.size
                } else {
                    0
                },
                children: Vec::new(),
                previewable: is_previewable(&current_path),
            });

            if is_last && !entry.is_dir {
                node.is_dir = false;
                node.size = entry.size;
                node.previewable = is_previewable(&current_path);
            }
        }
    }

    let mut nodes: Vec<PreviewNode> = root.into_values().collect();
    nodes.sort_by(|a, b| a.path.cmp(&b.path));

    let mut tree: Vec<PreviewNode> = Vec::new();
    let mut lookup: BTreeMap<String, PreviewNode> = BTreeMap::new();

    for node in nodes {
        if let Some((parent, _)) = node.path.rsplit_once('/') {
            if let Some(parent_node) = lookup.get_mut(parent) {
                parent_node.children.push(node.clone());
                lookup.insert(node.path.clone(), node);
                continue;
            }
        }
        lookup.insert(node.path.clone(), node.clone());
        tree.push(node);
    }

    tree
}

pub fn extract_preview_file(archive: &Path, inner_path: &str) -> Result<PathBuf> {
    let temp = preview_cache_dir()?;
    ensure_dir(&temp)?;
    archive::extract_single_file(archive, inner_path, &temp)?;
    Ok(temp.join(inner_path))
}

pub fn read_preview_bytes(path: &Path) -> Result<PreviewFileResult> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (mime, bytes) = match ext.as_str() {
        "png" | "jpg" | "jpeg" => {
            let data = std::fs::read(path)?;
            let mime = if ext == "png" {
                "image/png"
            } else {
                "image/jpeg"
            };
            (mime, data)
        }
        "dds" => {
            return Err(NexusDeckError::Other(
                "DDS preview unavailable — open on desktop".into(),
            ))
        }
        other => {
            return Err(NexusDeckError::Other(format!(
                "Preview not supported for .{other}"
            )))
        }
    };

    Ok(PreviewFileResult {
        path: path.display().to_string(),
        mime_type: mime.to_string(),
        data: bytes,
    })
}
