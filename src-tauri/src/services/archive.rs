use std::collections::HashSet;
use std::fs::File;
use std::io::{copy, Read};
use std::path::{Path, PathBuf};

use sevenz_rust::{Password, SevenZReader};
use sevenz_rust::decompress_file;
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::error::{NexusDeckError, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum ArchiveFormat {
    Zip,
    SevenZ,
    Rar,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum ArchiveMagic {
    Zip,
    SevenZ,
    Rar,
    Unknown,
}

pub fn is_supported_archive(path: &Path) -> bool {
    path.is_file() && detect_archive_format(path).is_ok()
}

pub fn resolve_mod_archive(staging_dir: &Path, file_name: &str) -> Result<PathBuf> {
    let hint = normalize_file_hint(file_name);
    let installing_practice = is_practice_hint(&hint);

    for path in archive_candidates(staging_dir, file_name) {
        if !path.is_file() {
            continue;
        }
        if path.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
            continue;
        }
        if !installing_practice && is_practice_archive(&path) {
            continue;
        }
        if detect_archive_format(&path).is_ok() {
            return Ok(ensure_archive_extension(&path)?);
        }
    }

    let mut other_archives: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(staging_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_supported_archive(&path) {
                other_archives.push(path.file_name().unwrap_or_default().to_string_lossy().to_string());
            }
        }
    }

    let mut message = format!(
        "No matching archive found for \"{file_name}\" in {}.",
        staging_dir.display()
    );
    if other_archives.iter().any(|n| n.to_lowercase().contains("practice")) {
        message.push_str(" NexusDeck_Practice_Mod.zip is only for testing — download this mod from Nexus and save it to staging.");
    } else if !other_archives.is_empty() {
        message.push_str(&format!(" Found: {}.", other_archives.join(", ")));
    } else {
        message.push_str(" Download the mod file from Nexus and save it to your staging folder first.");
    }

    Err(NexusDeckError::NotFound(message))
}

fn is_practice_hint(hint: &str) -> bool {
    hint.contains("nexusdeck") && hint.contains("practice")
}

fn is_practice_archive(path: &Path) -> bool {
    let name = normalize_file_hint(
        &path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
    );
    name.contains("nexusdeck") && name.contains("practice")
}

fn archive_candidates(staging_dir: &Path, file_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    let mut push = |path: PathBuf| {
        if seen.insert(path.display().to_string()) {
            candidates.push(path);
        }
    };

    push(staging_dir.join(file_name));
    for ext in ["7z", "zip", "rar"] {
        push(staging_dir.join(format!("{file_name}.{ext}")));
    }

    let hint = normalize_file_hint(file_name);
    let mut scored: Vec<(u32, PathBuf)> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(staging_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || !is_supported_archive(&path) {
                continue;
            }
            let fname = normalize_file_hint(
                &path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy(),
            );
            let score = archive_match_score(&hint, &fname);
            if score > 0 {
                scored.push((score, path));
            }
        }
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in scored {
        push(path);
    }

    candidates
}

fn archive_match_score(hint: &str, candidate: &str) -> u32 {
    if hint.is_empty() || candidate.is_empty() {
        return 0;
    }
    if hint == candidate {
        return 10_000;
    }
    if candidate.contains(hint) || hint.contains(candidate) {
        return 5_000 + hint.len().min(candidate.len()) as u32;
    }
    if fuzzy_match(hint, candidate) {
        return 1_000 + hint.len().min(candidate.len()) as u32;
    }
    0
}

fn normalize_file_hint(value: &str) -> String {
    value
        .to_lowercase()
        .replace(".7z", "")
        .replace(".zip", "")
        .replace(".rar", "")
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn fuzzy_match(a: &str, b: &str) -> bool {
    let min_len = a.len().min(b.len()).max(12);
    a.len() >= min_len && b.len() >= min_len && a[..min_len] == b[..min_len]
}

fn detect_archive_format(path: &Path) -> Result<ArchiveFormat> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    if name.ends_with(".7z") {
        return Ok(ArchiveFormat::SevenZ);
    }
    if name.ends_with(".zip") {
        return Ok(ArchiveFormat::Zip);
    }
    if name.ends_with(".rar") {
        return Ok(ArchiveFormat::Rar);
    }

    match read_magic(path)? {
        ArchiveMagic::SevenZ => Ok(ArchiveFormat::SevenZ),
        ArchiveMagic::Zip => Ok(ArchiveFormat::Zip),
        ArchiveMagic::Rar => Ok(ArchiveFormat::Rar),
        ArchiveMagic::Unknown => Err(NexusDeckError::Archive(format!(
            "Unsupported archive format for {}. Expected a .7z or .zip file.",
            path.file_name().unwrap_or_default().to_string_lossy()
        ))),
    }
}

fn read_magic(path: &Path) -> Result<ArchiveMagic> {
    let mut file = File::open(path)?;
    let mut buf = [0u8; 8];
    let read = file.read(&mut buf)?;

    if read >= 6 && buf[..6] == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        return Ok(ArchiveMagic::SevenZ);
    }
    if read >= 4
        && (buf[..4] == [0x50, 0x4B, 0x03, 0x04]
            || buf[..4] == [0x50, 0x4B, 0x05, 0x06]
            || buf[..4] == [0x50, 0x4B, 0x07, 0x08])
    {
        return Ok(ArchiveMagic::Zip);
    }
    if read >= 4 && buf[..4] == *b"Rar!" {
        return Ok(ArchiveMagic::Rar);
    }

    Ok(ArchiveMagic::Unknown)
}

pub fn ensure_archive_extension(path: &Path) -> Result<PathBuf> {
    if has_archive_extension(path) {
        return Ok(path.to_path_buf());
    }

    let ext = match read_magic(path)? {
        ArchiveMagic::SevenZ => "7z",
        ArchiveMagic::Zip => "zip",
        ArchiveMagic::Rar => "rar",
        ArchiveMagic::Unknown => return Ok(path.to_path_buf()),
    };

    let new_path = path.with_extension(ext);
    if new_path == path {
        return Ok(path.to_path_buf());
    }
    if new_path.exists() {
        std::fs::remove_file(&new_path)?;
    }
    std::fs::rename(path, &new_path)?;
    Ok(new_path)
}

fn has_archive_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "7z" | "zip" | "rar"))
}

pub fn looks_like_archive(path: &Path) -> Result<bool> {
    Ok(matches!(
        read_magic(path)?,
        ArchiveMagic::Zip | ArchiveMagic::SevenZ | ArchiveMagic::Rar
    ))
}

pub fn list_archive_entries(archive_path: &Path) -> Result<Vec<ArchiveEntry>> {
    match detect_archive_format(archive_path)? {
        ArchiveFormat::Zip => list_zip_entries(archive_path),
        ArchiveFormat::SevenZ => list_7z_entries(archive_path),
        ArchiveFormat::Rar => list_rar_entries(archive_path),
    }
}

fn list_zip_entries(path: &Path) -> Result<Vec<ArchiveEntry>> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let mut entries = Vec::new();

    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        entries.push(ArchiveEntry {
            path: entry.name().to_string(),
            is_dir: entry.is_dir(),
            size: entry.size(),
        });
    }
    Ok(entries)
}

fn list_7z_entries(path: &Path) -> Result<Vec<ArchiveEntry>> {
    let file = File::open(path)?;
    let len = file.metadata()?.len();
    let reader = SevenZReader::new(file, len, Password::empty())
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;

    Ok(reader
        .archive()
        .files
        .iter()
        .map(|entry| ArchiveEntry {
            path: entry.name.replace('\\', "/"),
            is_dir: entry.is_directory,
            size: entry.size,
        })
        .collect())
}

pub fn extract_single_file(archive_path: &Path, inner_path: &str, dest: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(dest)?;
    let normalized = inner_path.replace('\\', "/");
    match detect_archive_format(archive_path)? {
        ArchiveFormat::Zip => extract_single_zip(archive_path, &normalized, dest),
        ArchiveFormat::SevenZ => extract_single_7z(archive_path, &normalized, dest),
        ArchiveFormat::Rar => extract_single_rar(archive_path, &normalized, dest),
    }
}

fn extract_single_zip(archive_path: &Path, inner_path: &str, dest: &Path) -> Result<PathBuf> {
    let file = File::open(archive_path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| NexusDeckError::Archive(e.to_string()))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        if entry.name().replace('\\', "/") != inner_path {
            continue;
        }
        let outpath = dest.join(inner_path);
        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut outfile = File::create(&outpath)?;
        copy(&mut entry, &mut outfile)?;
        return Ok(outpath);
    }

    Err(NexusDeckError::NotFound(format!(
        "File {inner_path} not found in archive"
    )))
}

fn extract_single_7z(archive_path: &Path, inner_path: &str, dest: &Path) -> Result<PathBuf> {
    let temp = dest.join(format!("_extract_{}", uuid::Uuid::new_v4()));
    extract_7z(archive_path, &temp)?;
    let extracted = temp.join(inner_path);
    if extracted.is_file() {
        let outpath = dest.join(inner_path);
        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&extracted, &outpath)?;
        let _ = std::fs::remove_dir_all(&temp);
        return Ok(outpath);
    }
    let _ = std::fs::remove_dir_all(&temp);
    Err(NexusDeckError::NotFound(format!(
        "File {inner_path} not found in archive"
    )))
}

fn extract_single_rar(archive_path: &Path, inner_path: &str, dest: &Path) -> Result<PathBuf> {
    let temp = dest.join(format!("_extract_{}", uuid::Uuid::new_v4()));
    extract_rar(archive_path, &temp)?;
    let extracted = temp.join(inner_path);
    if extracted.is_file() {
        let outpath = dest.join(inner_path);
        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&extracted, &outpath)?;
        let _ = std::fs::remove_dir_all(&temp);
        return Ok(outpath);
    }
    let _ = std::fs::remove_dir_all(&temp);
    Err(NexusDeckError::NotFound(format!(
        "File {inner_path} not found in archive"
    )))
}

pub fn extract_archive(archive_path: &Path, dest: &Path) -> Result<Vec<String>> {
    std::fs::create_dir_all(dest)?;
    match detect_archive_format(archive_path)? {
        ArchiveFormat::Zip => extract_zip(archive_path, dest),
        ArchiveFormat::SevenZ => extract_7z(archive_path, dest),
        ArchiveFormat::Rar => extract_rar(archive_path, dest),
    }
}

fn extract_zip(archive_path: &Path, dest: &Path) -> Result<Vec<String>> {
    let file = File::open(archive_path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        let outpath = dest.join(file.name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = File::create(&outpath)?;
            copy(&mut file, &mut outfile)?;
            extracted.push(outpath.display().to_string());
        }
    }
    Ok(extracted)
}

fn extract_7z(archive_path: &Path, dest: &Path) -> Result<Vec<String>> {
    decompress_file(archive_path, dest).map_err(|e| NexusDeckError::Archive(e.to_string()))?;

    let mut extracted = Vec::new();
    for entry in WalkDir::new(dest).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            extracted.push(entry.path().display().to_string());
        }
    }
    Ok(extracted)
}

fn list_rar_entries(path: &Path) -> Result<Vec<ArchiveEntry>> {
    let mut archive = unrar::Archive::new(path)
        .open_for_listing()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let mut entries = Vec::new();

    while let Some(header) = archive
        .read_header()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?
    {
        let entry = header.entry();
        entries.push(ArchiveEntry {
            path: entry.filename.to_string_lossy().replace('\\', "/"),
            is_dir: entry.is_directory(),
            size: entry.unpacked_size,
        });
        archive = header
            .skip()
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    }

    Ok(entries)
}

fn extract_rar(archive_path: &Path, dest: &Path) -> Result<Vec<String>> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let mut extracted = Vec::new();

    while let Some(header) = archive
        .read_header()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?
    {
        let entry = header.entry();
        let filename = entry.filename.clone();
        if entry.is_directory() {
            std::fs::create_dir_all(dest.join(&filename))?;
            archive = header
                .skip()
                .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        } else {
            archive = header
                .extract_with_base(dest)
                .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
            let outpath = dest.join(&filename);
            if outpath.is_file() {
                extracted.push(outpath.display().to_string());
            }
        }
    }

    Ok(extracted)
}

use crate::services::archive_options::MergeOptions;

pub fn merge_directory(
    src: &Path,
    dest: &Path,
    options: MergeOptions,
) -> Result<Vec<String>> {
    let mut deployed = Vec::new();
    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let rel = entry.path().strip_prefix(src).unwrap();
            let target = dest.join(rel);
            if target.exists() && !options.overwrite {
                continue;
            }
            if options.dry_run {
                deployed.push(target.display().to_string());
                continue;
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
            deployed.push(target.display().to_string());
        }
    }
    Ok(deployed)
}
