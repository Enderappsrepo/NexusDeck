//! Helpers for normalizing Nexus collection mod lists.

use std::collections::HashMap;

use crate::services::nexus_client::CollectionModEntry;
use crate::services::profile_insights::CollectionModInput;

/// Nexus collection revisions can list the same mod multiple times (optional
/// file variants, duplicate revision rows). Install/browse should treat each mod
/// once — required beats optional, then prefer an entry with a concrete file id.
fn prefer_mod_entry(existing_optional: bool, existing_file: Option<u64>, candidate_optional: bool, candidate_file: Option<u64>) -> bool {
    if existing_optional && !candidate_optional {
        return true;
    }
    if !existing_optional && candidate_optional {
        return false;
    }
    match (existing_file, candidate_file) {
        (None, Some(_)) => true,
        (Some(_), None) => false,
        _ => false,
    }
}

pub fn dedupe_collection_mods(mods: Vec<CollectionModEntry>) -> Vec<CollectionModEntry> {
    if mods.len() <= 1 {
        return mods;
    }

    let mut first_index: HashMap<u64, usize> = HashMap::new();
    let mut best: HashMap<u64, CollectionModEntry> = HashMap::new();

    for (i, entry) in mods.iter().enumerate() {
        first_index.entry(entry.mod_id).or_insert(i);
        best.entry(entry.mod_id)
            .and_modify(|existing| {
                if prefer_mod_entry(
                    existing.optional,
                    existing.file_id,
                    entry.optional,
                    entry.file_id,
                ) {
                    *existing = entry.clone();
                }
            })
            .or_insert_with(|| entry.clone());
    }

    let mut ids: Vec<u64> = best.keys().copied().collect();
    ids.sort_by_key(|id| first_index[id]);
    ids.into_iter()
        .filter_map(|id| best.remove(&id))
        .collect()
}

pub fn dedupe_collection_mod_inputs(mods: Vec<CollectionModInput>) -> Vec<CollectionModInput> {
    if mods.len() <= 1 {
        return mods;
    }

    let mut first_index: HashMap<u64, usize> = HashMap::new();
    let mut best: HashMap<u64, CollectionModInput> = HashMap::new();

    for (i, entry) in mods.iter().enumerate() {
        first_index.entry(entry.mod_id).or_insert(i);
        best.entry(entry.mod_id)
            .and_modify(|existing| {
                if prefer_mod_entry(
                    existing.optional,
                    existing.file_id,
                    entry.optional,
                    entry.file_id,
                ) {
                    *existing = entry.clone();
                }
            })
            .or_insert_with(|| entry.clone());
    }

    let mut ids: Vec<u64> = best.keys().copied().collect();
    ids.sort_by_key(|id| first_index[id]);
    ids.into_iter()
        .filter_map(|id| best.remove(&id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(mod_id: u64, file_id: Option<u64>, optional: bool) -> CollectionModEntry {
        CollectionModEntry {
            mod_id,
            file_id,
            name: format!("Mod {mod_id}"),
            optional,
            version: "1.0".into(),
        }
    }

    #[test]
    fn dedupes_same_mod_keeps_required_over_optional() {
        let mods = vec![
            entry(42, Some(100), true),
            entry(42, Some(200), false),
            entry(99, Some(1), false),
        ];
        let out = dedupe_collection_mods(mods);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].mod_id, 42);
        assert_eq!(out[0].file_id, Some(200));
        assert!(!out[0].optional);
        assert_eq!(out[1].mod_id, 99);
    }

    #[test]
    fn dedupes_preserves_first_seen_order() {
        let mods = vec![entry(3, None, false), entry(1, None, false), entry(3, Some(5), false)];
        let out = dedupe_collection_mods(mods);
        assert_eq!(out.iter().map(|m| m.mod_id).collect::<Vec<_>>(), vec![3, 1]);
        assert_eq!(out[0].file_id, Some(5));
    }
}
