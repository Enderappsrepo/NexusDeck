use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::{NexusDeckError, Result};
use crate::services::archive::{read_archive_text, ArchiveEntry};
use crate::services::deploy::{infer_content_prefix, strip_archive_prefix};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallOptionSelectionType {
    SelectOne,
    SelectAtMostOne,
    SelectAny,
    SelectAtLeastOne,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptionChoice {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub folder_prefixes: Vec<String>,
    #[serde(default)]
    pub image_path: Option<String>,
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallWizardStep {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub groups: Vec<InstallOptionGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallWizard {
    pub module_name: Option<String>,
    pub module_image_path: Option<String>,
    pub steps: Vec<InstallWizardStep>,
}

impl InstallWizard {
    pub fn flattened_groups(&self) -> Vec<InstallOptionGroup> {
        self.steps
            .iter()
            .flat_map(|step| step.groups.clone())
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptionGroup {
    pub id: String,
    pub name: String,
    pub selection_type: InstallOptionSelectionType,
    pub options: Vec<InstallOptionChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SelectedInstallOption {
    pub group_id: String,
    pub option_ids: Vec<String>,
}

pub fn detect_install_option_groups(
    archive_path: &Path,
    entries: &[ArchiveEntry],
) -> Vec<InstallOptionGroup> {
    if let Some(mut groups) = detect_fomod_option_groups(archive_path, entries) {
        if !groups.is_empty() {
            align_install_option_groups(&mut groups, entries);
            return groups;
        }
    }
    detect_heuristic_groups(entries)
}

pub fn detect_install_option_groups_from_dir(
    extract_dir: &Path,
    entries: &[ArchiveEntry],
    archive_path: Option<&Path>,
) -> Vec<InstallOptionGroup> {
    if let Some(archive) = archive_path {
        if let Some(mut wizard) = detect_fomod_wizard_from_dir(archive, extract_dir) {
            if !wizard.steps.is_empty() {
                let mut groups = wizard.flattened_groups();
                align_install_option_groups(&mut groups, entries);
                return groups;
            }
        }
    } else if let Some(wizard) = detect_fomod_wizard_from_dir_raw(extract_dir) {
        if !wizard.steps.is_empty() {
            return wizard.flattened_groups();
        }
    }
    detect_heuristic_groups(entries)
}

pub fn detect_install_wizard_from_dir(
    archive_path: &Path,
    extract_dir: &Path,
    entries: &[ArchiveEntry],
) -> InstallWizard {
    if let Some(mut wizard) = detect_fomod_wizard_from_dir(archive_path, extract_dir) {
        if !wizard.steps.is_empty() {
            for step in wizard.steps.iter_mut() {
                align_install_option_groups(&mut step.groups, entries);
            }
            return wizard;
        }
    }
    let groups = detect_heuristic_groups(entries);
    if groups.is_empty() {
        return InstallWizard::default();
    }
    InstallWizard {
        module_name: None,
        module_image_path: None,
        steps: vec![InstallWizardStep {
            id: "step-0".into(),
            name: "Install options".into(),
            description: None,
            groups,
        }],
    }
}

pub fn archive_has_fomod_config(entries: &[ArchiveEntry]) -> bool {
    find_fomod_config(entries).is_some()
}

const FOMOD_DEFER_FILE_THRESHOLD: usize = 500;

pub fn should_defer_fomod_detection(archive_path: &Path, entries: &[ArchiveEntry]) -> bool {
    if entries.len() <= FOMOD_DEFER_FILE_THRESHOLD {
        return false;
    }
    if !archive_has_fomod_config(entries) {
        return false;
    }
    load_cached_fomod_groups(archive_path).ok().flatten().is_none()
}

pub fn detect_fomod_option_groups(
    archive_path: &Path,
    entries: &[ArchiveEntry],
) -> Option<Vec<InstallOptionGroup>> {
    detect_fomod_wizard(archive_path, entries).map(|w| w.flattened_groups())
}

pub fn detect_fomod_wizard(
    archive_path: &Path,
    entries: &[ArchiveEntry],
) -> Option<InstallWizard> {
    if let Ok(Some(cached)) = load_cached_fomod_groups(archive_path) {
        return Some(cached);
    }
    let wizard = detect_fomod_wizard_raw(archive_path, entries)?;
    if !wizard.steps.is_empty() {
        let _ = save_cached_fomod_groups(archive_path, &wizard);
    }
    Some(wizard)
}

pub fn detect_fomod_wizard_from_dir(
    archive_path: &Path,
    extract_dir: &Path,
) -> Option<InstallWizard> {
    if let Ok(Some(cached)) = load_cached_fomod_groups(archive_path) {
        return Some(cached);
    }
    let wizard = detect_fomod_wizard_from_dir_raw(extract_dir)?;
    if !wizard.steps.is_empty() {
        let _ = save_cached_fomod_groups(archive_path, &wizard);
    }
    Some(wizard)
}

pub fn detect_fomod_option_groups_from_dir(
    archive_path: &Path,
    extract_dir: &Path,
) -> Option<Vec<InstallOptionGroup>> {
    detect_fomod_wizard_from_dir(archive_path, extract_dir).map(|w| w.flattened_groups())
}

fn fomod_cache_dir() -> Result<PathBuf> {
    let dir = crate::services::paths::data_dir().join("fomod_cache");
    crate::services::paths::ensure_dir(&dir)?;
    Ok(dir)
}

fn fomod_cache_key(archive_path: &Path) -> Result<String> {
    let meta = std::fs::metadata(archive_path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(format!(
        "{}-{}-{}",
        archive_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        meta.len(),
        modified
    ))
}

fn load_cached_fomod_groups(archive_path: &Path) -> Result<Option<InstallWizard>> {
    let path = fomod_cache_dir()?.join(format!("{}.json", fomod_cache_key(archive_path)?));
    if !path.is_file() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)?;
    if let Ok(wizard) = serde_json::from_str::<InstallWizard>(&raw) {
        return Ok(Some(wizard));
    }
    // Legacy cache: flat groups only
    let groups: Vec<InstallOptionGroup> = serde_json::from_str(&raw)?;
    Ok(Some(InstallWizard {
        module_name: None,
        module_image_path: None,
        steps: vec![InstallWizardStep {
            id: "step-0".into(),
            name: "Install options".into(),
            description: None,
            groups,
        }],
    }))
}

fn save_cached_fomod_groups(archive_path: &Path, wizard: &InstallWizard) -> Result<()> {
    let path = fomod_cache_dir()?.join(format!("{}.json", fomod_cache_key(archive_path)?));
    std::fs::write(path, serde_json::to_string(wizard)?)?;
    Ok(())
}

pub fn default_selections(groups: &[InstallOptionGroup]) -> Vec<SelectedInstallOption> {
    groups
        .iter()
        .map(|group| {
            let option_ids: Vec<String> = group
                .options
                .iter()
                .filter(|o| o.default)
                .map(|o| o.id.clone())
                .collect();
            let option_ids = if option_ids.is_empty() && !group.options.is_empty() {
                match group.selection_type {
                    InstallOptionSelectionType::SelectOne
                    | InstallOptionSelectionType::SelectAtLeastOne => {
                        vec![group.options[0].id.clone()]
                    }
                    InstallOptionSelectionType::SelectAtMostOne
                    | InstallOptionSelectionType::SelectAny => Vec::new(),
                }
            } else {
                option_ids
            };
            SelectedInstallOption {
                group_id: group.id.clone(),
                option_ids,
            }
        })
        .collect()
}

pub fn validate_fomod_selection_deploy(
    groups: &[InstallOptionGroup],
    selections: &[SelectedInstallOption],
    kept_entries: &[ArchiveEntry],
) -> Result<()> {
    if groups.is_empty() {
        return Ok(());
    }

    let prefix = infer_content_prefix(kept_entries);
    let included = included_rel_paths(groups, selections);
    if included.is_empty() {
        return Ok(());
    }

    let mut missing_labels = Vec::new();
    let selection_map: HashMap<&str, &[String]> = selections
        .iter()
        .map(|s| (s.group_id.as_str(), s.option_ids.as_slice()))
        .collect();

    for group in groups {
        let selected_ids = selection_map
            .get(group.id.as_str())
            .copied()
            .unwrap_or(&[]);
        for option in &group.options {
            if !selected_ids.contains(&option.id) {
                continue;
            }
            let has_files = kept_entries.iter().any(|entry| {
                let rel = normalize_entry_path(&entry.path, prefix.as_deref());
                option.folder_prefixes.iter().any(|folder| {
                    let norm = normalize_prefix(folder).trim_end_matches('/').to_string();
                    rel == norm || rel.starts_with(&format!("{norm}/"))
                })
            });
            if !has_files {
                missing_labels.push(option.label.clone());
            }
        }
    }

    if missing_labels.is_empty() {
        return Ok(());
    }

    Err(NexusDeckError::Other(format!(
        "FOMOD selections did not match any files to deploy: {}. Try different options or check the archive layout.",
        missing_labels.join(", ")
    )))
}

pub fn align_install_option_groups(groups: &mut [InstallOptionGroup], entries: &[ArchiveEntry]) {
    let prefix = infer_content_prefix(entries);
    for group in groups.iter_mut() {
        for option in group.options.iter_mut() {
            option.folder_prefixes =
                resolve_folder_prefixes(&option.folder_prefixes, entries, prefix.as_deref());
        }
    }
}

fn resolve_folder_prefixes(
    folders: &[String],
    entries: &[ArchiveEntry],
    content_prefix: Option<&str>,
) -> Vec<String> {
    folders
        .iter()
        .map(|folder| resolve_single_folder_prefix(folder, entries, content_prefix))
        .collect()
}

fn resolve_single_folder_prefix(
    folder: &str,
    entries: &[ArchiveEntry],
    content_prefix: Option<&str>,
) -> String {
    let normalized = folder.replace('\\', "/").trim_matches('/').to_string();
    if folder_prefix_matches_entries(&normalized, entries, content_prefix) {
        return normalized;
    }

    let mut best: Option<String> = None;
    for entry in entries {
        let rel = normalize_entry_path(&entry.path, content_prefix);
        if rel == normalized || rel.starts_with(&format!("{normalized}/")) {
            return normalized;
        }
        if let Some(idx) = rel.find(&normalized) {
            if idx == 0 || rel.as_bytes().get(idx.saturating_sub(1)) == Some(&b'/') {
                let candidate = rel[..idx + normalized.len()].to_string();
                if best
                    .as_ref()
                    .map(|b| candidate.len() < b.len())
                    .unwrap_or(true)
                {
                    best = Some(candidate);
                }
            }
        }
    }

    best.unwrap_or(normalized)
}

fn folder_prefix_matches_entries(
    normalized: &str,
    entries: &[ArchiveEntry],
    content_prefix: Option<&str>,
) -> bool {
    entries.iter().any(|entry| {
        let rel = normalize_entry_path(&entry.path, content_prefix);
        rel == normalized || rel.starts_with(&format!("{normalized}/"))
    })
}

pub fn apply_install_selections(
    entries: &[ArchiveEntry],
    groups: &[InstallOptionGroup],
    selections: &[SelectedInstallOption],
) -> Vec<ArchiveEntry> {
    if groups.is_empty() {
        return entries.to_vec();
    }

    let prefix = infer_content_prefix(entries);
    let included = included_rel_paths(groups, selections);
    let optional_prefixes = optional_folder_prefixes(groups);

    entries
        .iter()
        .filter(|entry| {
            let rel = normalize_entry_path(&entry.path, prefix.as_deref());
            if !path_matches_any_prefix(&rel, &optional_prefixes) {
                return true;
            }
            included.iter().any(|p| rel.starts_with(p))
        })
        .cloned()
        .collect()
}

pub fn prune_extract_dir(
    extract_dir: &Path,
    entries: &[ArchiveEntry],
    kept_entries: &[ArchiveEntry],
) -> Result<()> {
    let kept: HashSet<String> = kept_entries
        .iter()
        .map(|e| e.path.replace('\\', "/"))
        .collect();

    for entry in entries {
        if kept.contains(&entry.path.replace('\\', "/")) {
            continue;
        }
        let disk = crate::services::deploy::resolve_extract_root(extract_dir)
            .join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if disk.is_file() {
            let _ = std::fs::remove_file(&disk);
        }
    }
    Ok(())
}

fn detect_fomod_wizard_raw(archive_path: &Path, entries: &[ArchiveEntry]) -> Option<InstallWizard> {
    let config_path = find_fomod_config(entries)?;
    let xml = read_archive_text(archive_path, &config_path).ok()?;
    parse_fomod_wizard(&xml)
}

fn detect_fomod_wizard_from_dir_raw(extract_dir: &Path) -> Option<InstallWizard> {
    let config_path = find_fomod_config_on_disk(extract_dir)?;
    let xml = std::fs::read_to_string(&config_path).ok()?;
    parse_fomod_wizard(&xml)
}

fn find_fomod_config_on_disk(extract_dir: &Path) -> Option<PathBuf> {
    for entry in WalkDir::new(extract_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(extract_dir)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/")
            .to_lowercase();
        if rel.ends_with("moduleconfig.xml") && rel.contains("fomod") {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

fn find_fomod_config(entries: &[ArchiveEntry]) -> Option<String> {
    entries.iter().find_map(|e| {
        let lower = e.path.replace('\\', "/").to_lowercase();
        if lower.ends_with("moduleconfig.xml") && lower.contains("fomod") {
            Some(e.path.clone())
        } else {
            None
        }
    })
}

fn read_fomod_files_folder(e: &quick_xml::events::BytesStart<'_>, folders: &mut Vec<String>) {
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
        if key == "folder" || key == "source" {
            let folder = attr.unescape_value().unwrap_or_default().to_string();
            if !folder.is_empty() {
                folders.push(folder.replace('\\', "/"));
            }
        }
    }
}

fn read_fomod_image_path(e: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
        if key == "path" {
            let path = attr.unescape_value().unwrap_or_default().to_string();
            if !path.is_empty() {
                return Some(path.replace('\\', "/"));
            }
        }
    }
    None
}

fn push_fomod_option(
    options: &mut Vec<InstallOptionChoice>,
    group_index: usize,
    name: &str,
    description: &str,
    image_path: Option<String>,
    folders: &[String],
    default_name: &str,
) {
    if !name.is_empty() && !folders.is_empty() {
        let slug = slugify(name);
        let id = if slug.is_empty() {
            format!("fomod-g{group_index}-o{}", options.len())
        } else {
            format!("fomod-g{group_index}-{slug}")
        };
        options.push(InstallOptionChoice {
            id,
            label: name.to_string(),
            description: if description.is_empty() {
                None
            } else {
                Some(description.to_string())
            },
            folder_prefixes: folders.to_vec(),
            image_path,
            default: default_name.eq_ignore_ascii_case(name),
        });
    }
}

fn finalize_group(
    groups: &mut Vec<InstallOptionGroup>,
    group_index: &mut usize,
    name: &str,
    selection_type: InstallOptionSelectionType,
    options: &mut Vec<InstallOptionChoice>,
) {
    if options.is_empty() {
        return;
    }
    if options.iter().all(|o| !o.default) && matches!(selection_type, InstallOptionSelectionType::SelectOne) {
        options[0].default = true;
    }
    groups.push(InstallOptionGroup {
        id: format!("fomod-{group_index}"),
        name: if name.is_empty() {
            "Install options".to_string()
        } else {
            name.to_string()
        },
        selection_type,
        options: options.clone(),
    });
    *group_index += 1;
}

fn parse_fomod_group_type(raw: &str) -> InstallOptionSelectionType {
    let lower = raw.to_lowercase().replace([' ', '_'], "");
    if lower.contains("exactlyone") {
        InstallOptionSelectionType::SelectOne
    } else if lower.contains("atmostone") {
        InstallOptionSelectionType::SelectAtMostOne
    } else if lower.contains("atleastone") {
        InstallOptionSelectionType::SelectAtLeastOne
    } else if lower.contains("selectany") || lower.contains("selectall") {
        InstallOptionSelectionType::SelectAny
    } else {
        InstallOptionSelectionType::SelectOne
    }
}

fn find_extracted_asset(extract_dir: &Path, relative_path: &str) -> Option<PathBuf> {
    let rel = relative_path.replace('\\', "/");
    let direct = extract_dir.join(&rel);
    if direct.is_file() {
        return Some(direct);
    }

    let rel_lower = rel.trim_start_matches('/').to_lowercase();
    for entry in WalkDir::new(extract_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let norm = entry
            .path()
            .strip_prefix(extract_dir)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/")
            .to_lowercase();
        if norm == rel_lower || norm.ends_with(&format!("/{rel_lower}")) {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FomodAssetPayload {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

pub fn read_fomod_asset(extract_dir: &Path, relative_path: &str) -> Result<Option<FomodAssetPayload>> {
    let Some(path) = find_extracted_asset(extract_dir, relative_path) else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path)?;
    Ok(Some(FomodAssetPayload {
        mime_type: mime_type_for_path(&path).to_string(),
        bytes,
    }))
}

fn parse_fomod_wizard(xml: &str) -> Option<InstallWizard> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut wizard = InstallWizard::default();
    let mut buf = Vec::new();

    let mut in_module_name = false;
    let mut in_install_step = false;
    let mut in_optional_groups = false;
    let mut in_group = false;
    let mut in_option = false;
    let mut in_description = false;

    let mut in_files = false;

    let mut current_step_name = String::new();
    let mut current_step_description = String::new();
    let mut current_step_groups: Vec<InstallOptionGroup> = Vec::new();
    let mut step_index = 0usize;

    let mut current_group_name = String::new();
    let mut current_group_type = InstallOptionSelectionType::SelectOne;
    let mut current_group_default = String::new();
    let mut current_option_name = String::new();
    let mut current_option_description = String::new();
    let mut current_option_image: Option<String> = None;
    let mut current_option_folders: Vec<String> = Vec::new();
    let mut group_options: Vec<InstallOptionChoice> = Vec::new();
    let mut group_index = 0usize;

    let mut legacy_groups: Vec<InstallOptionGroup> = Vec::new();
    let mut saw_install_steps = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                match name.as_str() {
                    "modulename" => in_module_name = true,
                    "moduleimage" => {
                        wizard.module_image_path = read_fomod_image_path(&e);
                    }
                    "installstep" => {
                        in_install_step = true;
                        saw_install_steps = true;
                        current_step_name.clear();
                        current_step_description.clear();
                        current_step_groups.clear();
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
                            if key == "name" {
                                current_step_name =
                                    attr.unescape_value().unwrap_or_default().to_string();
                            }
                        }
                    }
                    "optionalfilegroups" => in_optional_groups = true,
                    "group" if in_optional_groups => {
                        in_group = true;
                        current_group_name.clear();
                        current_group_default.clear();
                        current_group_type = InstallOptionSelectionType::SelectOne;
                        group_options.clear();
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
                            let val = attr.unescape_value().unwrap_or_default().to_string();
                            match key.as_str() {
                                "name" => current_group_name = val,
                                "defaultoption" => current_group_default = val,
                                "type" => {
                                    current_group_type = parse_fomod_group_type(&val);
                                }
                                _ => {}
                            }
                        }
                    }
                    "option" | "plugin" if in_group => {
                        in_option = true;
                        current_option_name.clear();
                        current_option_description.clear();
                        current_option_image = None;
                        current_option_folders.clear();
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
                            if key == "name" {
                                current_option_name =
                                    attr.unescape_value().unwrap_or_default().to_string();
                            }
                        }
                    }
                    "description" if in_option || in_install_step => in_description = true,
                    "image" if in_option => {
                        current_option_image = read_fomod_image_path(&e);
                    }
                    "files" if in_option => {
                        in_files = true;
                        read_fomod_files_folder(&e, &mut current_option_folders);
                    }
                    "folder" if in_files && in_option => {
                        read_fomod_files_folder(&e, &mut current_option_folders);
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                match name.as_str() {
                    "moduleimage" => {
                        wizard.module_image_path = read_fomod_image_path(&e);
                    }
                    "image" if in_option => {
                        current_option_image = read_fomod_image_path(&e);
                    }
                    "files" if in_option => {
                        in_files = true;
                        read_fomod_files_folder(&e, &mut current_option_folders);
                    }
                    "folder" if in_files && in_option => {
                        read_fomod_files_folder(&e, &mut current_option_folders);
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) if in_description => {
                let text = t.unescape().unwrap_or_default().to_string();
                if in_option {
                    current_option_description.push_str(&text);
                } else if in_install_step {
                    current_step_description.push_str(&text);
                }
            }
            Ok(Event::Text(t)) if in_module_name => {
                let text = t.unescape().unwrap_or_default().trim().to_string();
                if !text.is_empty() {
                    wizard.module_name = Some(text);
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                match name.as_str() {
                    "modulename" => in_module_name = false,
                    "description" if in_description => in_description = false,
                    "files" if in_files => in_files = false,
                    "option" | "plugin" if in_option => {
                        in_option = false;
                        push_fomod_option(
                            &mut group_options,
                            group_index,
                            &current_option_name,
                            &current_option_description,
                            current_option_image.clone(),
                            &current_option_folders,
                            &current_group_default,
                        );
                    }
                    "group" if in_group => {
                        in_group = false;
                        if in_install_step {
                            finalize_group(
                                &mut current_step_groups,
                                &mut group_index,
                                &current_group_name,
                                current_group_type.clone(),
                                &mut group_options,
                            );
                        } else {
                            finalize_group(
                                &mut legacy_groups,
                                &mut group_index,
                                &current_group_name,
                                current_group_type.clone(),
                                &mut group_options,
                            );
                        }
                    }
                    "installstep" if in_install_step => {
                        in_install_step = false;
                        if !current_step_groups.is_empty() {
                            wizard.steps.push(InstallWizardStep {
                                id: format!("step-{step_index}"),
                                name: if current_step_name.is_empty() {
                                    format!("Step {}", step_index + 1)
                                } else {
                                    current_step_name.clone()
                                },
                                description: if current_step_description.is_empty() {
                                    None
                                } else {
                                    Some(current_step_description.clone())
                                },
                                groups: current_step_groups.clone(),
                            });
                            step_index += 1;
                        }
                    }
                    "optionalfilegroups" => in_optional_groups = false,
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                log::warn!("FOMOD parse error: {e}");
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    if wizard.steps.is_empty() && !legacy_groups.is_empty() {
        wizard.steps.push(InstallWizardStep {
            id: "step-0".into(),
            name: "Install options".into(),
            description: None,
            groups: legacy_groups,
        });
    }

    if wizard.steps.is_empty() && !saw_install_steps {
        return None;
    }

    if wizard.steps.is_empty() {
        None
    } else {
        Some(wizard)
    }
}

fn parse_fomod_module_config(xml: &str) -> Option<Vec<InstallOptionGroup>> {
    parse_fomod_wizard(xml).map(|w| w.flattened_groups())
}

fn detect_heuristic_groups(entries: &[ArchiveEntry]) -> Vec<InstallOptionGroup> {
    let prefix = infer_content_prefix(entries);
    let top_folders = collect_top_level_directories(entries, prefix.as_deref());

    if top_folders.len() < 2 {
        return Vec::new();
    }

    let mut body_options = Vec::new();
    let mut compat_options = Vec::new();
    let mut texture_options = Vec::new();
    let mut misc_options = Vec::new();

    for folder in &top_folders {
        let lower = folder.to_lowercase();
        if is_body_folder(&lower) {
            body_options.push(folder_choice(folder, true));
        } else if is_compat_folder(&lower) {
            compat_options.push(folder_choice(folder, false));
        } else if is_texture_folder(&lower) {
            texture_options.push(folder_choice(folder, false));
        } else if is_optional_folder(&lower) {
            misc_options.push(folder_choice(folder, false));
        }
    }

    let mut groups = Vec::new();
    if body_options.len() >= 2 {
        body_options[0].default = true;
        groups.push(InstallOptionGroup {
            id: "body-type".into(),
            name: "Body type".into(),
            selection_type: InstallOptionSelectionType::SelectOne,
            options: body_options,
        });
    }
    if texture_options.len() >= 2 {
        texture_options[0].default = true;
        groups.push(InstallOptionGroup {
            id: "texture-quality".into(),
            name: "Texture quality".into(),
            selection_type: InstallOptionSelectionType::SelectOne,
            options: texture_options,
        });
    }
    if !compat_options.is_empty() {
        groups.push(InstallOptionGroup {
            id: "compatibility".into(),
            name: "Compatibility patches".into(),
            selection_type: InstallOptionSelectionType::SelectAny,
            options: compat_options,
        });
    }
    if !misc_options.is_empty() {
        groups.push(InstallOptionGroup {
            id: "optional".into(),
            name: "Optional components".into(),
            selection_type: InstallOptionSelectionType::SelectAny,
            options: misc_options,
        });
    }

    groups
}

fn collect_top_level_directories(entries: &[ArchiveEntry], content_prefix: Option<&str>) -> Vec<String> {
    let mut folders: Vec<String> = entries
        .iter()
        .filter_map(|entry| {
            let rel = normalize_entry_path(&entry.path, content_prefix);
            let (segment, rest) = rel.split_once('/')?;
            if segment.is_empty() || rest.is_empty() {
                return None;
            }
            if looks_like_file_name(segment) {
                return None;
            }
            Some(segment.to_string())
        })
        .collect();
    folders.sort();
    folders.dedup();
    folders
}

fn looks_like_file_name(segment: &str) -> bool {
    const EXTENSIONS: &[&str] = &[
        "esp", "esm", "esl", "bsa", "ba2", "ini", "txt", "html", "htm", "modgroups", "dll", "exe",
    ];

    segment
        .rsplit_once('.')
        .is_some_and(|(_, ext)| EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

fn folder_choice(folder: &str, default: bool) -> InstallOptionChoice {
    InstallOptionChoice {
        id: slugify(folder),
        label: folder.to_string(),
        description: None,
        folder_prefixes: vec![format!("{folder}/")],
        image_path: None,
        default,
    }
}

fn is_body_folder(lower: &str) -> bool {
    ["cbbe", "unp", "3ba", "hdt", "body", "bodies", "bodyslide"].iter().any(|k| lower.contains(k))
}

fn is_compat_folder(lower: &str) -> bool {
    ["compat", "compatibility", "patches", "fixes", "requir"]
        .iter()
        .any(|k| lower.contains(k))
        || lower == "patch"
        || lower.starts_with("patch ")
        || lower.ends_with(" patch")
        || lower.ends_with(" patches")
}

fn is_texture_folder(lower: &str) -> bool {
    ["1k", "2k", "4k", "8k", "hd", "sd", "lite", "quality", "textures"]
        .iter()
        .any(|k| lower.contains(k))
}

fn is_optional_folder(lower: &str) -> bool {
    ["optional", "option", "choices", "variant", "variants", "outfit", "armor", "armour", "skin", "replacer"]
        .iter()
        .any(|k| lower.contains(k))
}

fn optional_folder_prefixes(groups: &[InstallOptionGroup]) -> Vec<String> {
    groups
        .iter()
        .flat_map(|g| g.options.iter().flat_map(|o| o.folder_prefixes.clone()))
        .map(|p| normalize_prefix(&p))
        .collect()
}

fn included_rel_paths(
    groups: &[InstallOptionGroup],
    selections: &[SelectedInstallOption],
) -> HashSet<String> {
    let selection_map: HashMap<&str, &[String]> = selections
        .iter()
        .map(|s| (s.group_id.as_str(), s.option_ids.as_slice()))
        .collect();

    let mut included = HashSet::new();
    for group in groups {
        let selected_ids = selection_map
            .get(group.id.as_str())
            .copied()
            .unwrap_or(&[]);
        for option in &group.options {
            if selected_ids.contains(&option.id) {
                for prefix in &option.folder_prefixes {
                    included.insert(normalize_prefix(prefix));
                }
            }
        }
    }
    included
}

fn normalize_entry_path(path: &str, content_prefix: Option<&str>) -> String {
    strip_archive_prefix(&path.replace('\\', "/"), content_prefix)
}

fn normalize_prefix(prefix: &str) -> String {
    prefix.replace('\\', "/").trim_end_matches('/').to_string() + "/"
}

fn path_matches_any_prefix(path: &str, prefixes: &[String]) -> bool {
    prefixes.iter().any(|pfx| {
        let norm = pfx.trim_end_matches('/');
        path == norm || path.starts_with(&format!("{norm}/"))
    })
}

fn slugify(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::archive::ArchiveEntry;

    fn entry(path: &str) -> ArchiveEntry {
        ArchiveEntry {
            path: path.into(),
            is_dir: false,
            size: 1,
        }
    }

    #[test]
    fn parses_fomod_plugins_with_images() {
        let xml = r#"
        <config>
          <moduleName>CBBE</moduleName>
          <moduleImage path="fomod/splash.png"/>
          <installSteps>
            <installStep name="Body">
              <optionalFileGroups>
                <group name="Body type" type="SelectExactlyOne" defaultOption="CBBE">
                  <plugins>
                    <plugin name="CBBE">
                      <description>CBBE body</description>
                      <image path="fomod/cbbe.png"/>
                      <files><folder source="CBBE Body"/></files>
                    </plugin>
                  </plugins>
                </group>
              </optionalFileGroups>
            </installStep>
          </installSteps>
        </config>"#;
        let wizard = parse_fomod_wizard(xml).unwrap();
        assert_eq!(wizard.module_name.as_deref(), Some("CBBE"));
        assert_eq!(wizard.module_image_path.as_deref(), Some("fomod/splash.png"));
        assert_eq!(wizard.steps.len(), 1);
        assert_eq!(wizard.steps[0].groups[0].options[0].image_path.as_deref(), Some("fomod/cbbe.png"));
        assert_eq!(wizard.steps[0].groups[0].options[0].description.as_deref(), Some("CBBE body"));
    }

    #[test]
    fn parses_simple_fomod() {
        let xml = r#"
        <config>
          <installSteps>
            <installStep name="Main">
              <optionalFileGroups>
                <group name="Body" type="SelectExactlyOne" defaultOption="CBBE">
                  <option name="CBBE"><files folder="CBBE Body"/></option>
                  <option name="UNP"><files folder="UNP Body"/></option>
                </group>
              </optionalFileGroups>
            </installStep>
          </installSteps>
        </config>"#;
        let groups = parse_fomod_module_config(xml).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].options.len(), 2);
    }

    #[test]
    fn skips_heuristic_options_for_loose_ussep_style_archive() {
        let entries = vec![
            entry("unofficial skyrim special edition patch.esp"),
            entry("unofficial skyrim special edition patch.bsa"),
            entry("unofficial skyrim special edition patch - textures.bsa"),
            entry("BashTags/unofficial skyrim special edition patch.txt"),
            entry("Docs/Unofficial Skyrim Special Edition Patch Readme.html"),
        ];

        let groups = detect_heuristic_groups(&entries);
        assert!(groups.is_empty());
    }

    #[test]
    fn detects_real_optional_directories() {
        let entries = vec![
            entry("CBBE Body/meshes/a.nif"),
            entry("UNP Body/meshes/b.nif"),
            entry("Compatibility Patches/foo.esp"),
            entry("Core/mod.esp"),
        ];

        let groups = detect_heuristic_groups(&entries);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].name, "Body type");
        assert_eq!(groups[1].name, "Compatibility patches");
    }
}
