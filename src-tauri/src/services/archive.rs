use std::collections::HashSet;
use std::fs::File;
use std::io::{copy, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use sevenz_rust::{Archive, BlockDecoder, Password, SevenZReader};
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
    for ext in ["7z", "zip", "rar", "bin"] {
        push(staging_dir.join(format!("{file_name}.{ext}")));
    }
    // Nexus CDN may rename downloads to .bin while the API still reports the original name.
    if !file_name.to_lowercase().ends_with(".bin") {
        let stem = Path::new(file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(file_name);
        push(staging_dir.join(format!("{stem}.bin")));
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
        .replace(".bin", "")
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Nexus sometimes serves mod downloads as `.bin` (CDN obfuscation). Detect by magic bytes.
fn is_obfuscated_download_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("bin"))
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
    if name.ends_with(".bin") {
        return match read_magic(path)? {
            ArchiveMagic::SevenZ => Ok(ArchiveFormat::SevenZ),
            ArchiveMagic::Zip => Ok(ArchiveFormat::Zip),
            ArchiveMagic::Rar => Ok(ArchiveFormat::Rar),
            ArchiveMagic::Unknown => Err(NexusDeckError::Archive(format!(
                "{} looks like a Nexus .bin download but is not a supported archive (expected .7z or .zip inside).",
                path.file_name().unwrap_or_default().to_string_lossy()
            ))),
        };
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
        ArchiveMagic::Unknown => {
            if is_obfuscated_download_extension(path) {
                return Err(NexusDeckError::Archive(format!(
                    "{} is not a valid mod archive — Nexus .bin downloads must be a .7z or .zip inside.",
                    path.file_name().unwrap_or_default().to_string_lossy()
                )));
            }
            return Ok(path.to_path_buf());
        }
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

pub fn read_archive_text(archive_path: &Path, inner_path: &str) -> Result<String> {
    let normalized = inner_path.replace('\\', "/");
    match detect_archive_format(archive_path)? {
        ArchiveFormat::Zip => read_zip_text(archive_path, &normalized),
        ArchiveFormat::SevenZ => read_7z_text(archive_path, &normalized),
        ArchiveFormat::Rar => {
            let temp = std::env::temp_dir().join(format!("nexusdeck-read-{}", uuid::Uuid::new_v4()));
            let extracted = extract_single_file(archive_path, &normalized, &temp)?;
            let content = std::fs::read_to_string(&extracted)?;
            let _ = std::fs::remove_dir_all(&temp);
            Ok(content)
        }
    }
}

fn sevenz_err(e: sevenz_rust::Error) -> NexusDeckError {
    NexusDeckError::Archive(e.to_string())
}

fn sevenz_io_err(e: std::io::Error) -> sevenz_rust::Error {
    sevenz_rust::Error::io(e)
}

fn read_7z_text(archive_path: &Path, inner_path: &str) -> Result<String> {
    let bytes = read_7z_bytes(archive_path, inner_path)?;
    String::from_utf8(bytes).map_err(|e| {
        NexusDeckError::Archive(format!("Invalid UTF-8 in {inner_path}: {e}"))
    })
}

fn read_7z_bytes(archive_path: &Path, inner_path: &str) -> Result<Vec<u8>> {
    use std::cell::Cell;
    use std::io::copy;

    let target = inner_path.replace('\\', "/");
    let mut file = File::open(archive_path)?;
    let len = file.metadata()?.len();
    let password = Password::empty();
    let archive = Archive::read(&mut file, len, password.as_slice()).map_err(sevenz_err)?;

    for folder_index in 0..archive.folders.len() {
        let start = archive.stream_map.folder_first_file_index[folder_index];
        let count = archive.folders[folder_index].num_unpack_sub_streams;
        let contains_target = archive.files[start..start + count]
            .iter()
            .any(|entry| entry.name().replace('\\', "/") == target);
        if !contains_target {
            continue;
        }

        let found = Cell::new(None::<Vec<u8>>);
        let folder_decoder =
            BlockDecoder::new(folder_index, &archive, password.as_slice(), &mut file);
        let _ = folder_decoder.for_each_entries(&mut |entry, reader| {
            let entry_path = entry.name().replace('\\', "/");
            if entry_path != target {
                copy(reader, &mut std::io::sink()).map_err(sevenz_io_err)?;
                return Ok(true);
            }
            let mut bytes = Vec::new();
            copy(reader, &mut bytes).map_err(sevenz_io_err)?;
            found.set(Some(bytes));
            Ok(false)
        });

        if let Some(bytes) = found.into_inner() {
            return Ok(bytes);
        }
    }

    Err(NexusDeckError::NotFound(format!(
        "File {inner_path} not found in archive"
    )))
}

fn read_zip_text(archive_path: &Path, inner_path: &str) -> Result<String> {
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
        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        return Ok(content);
    }

    Err(NexusDeckError::NotFound(format!(
        "File {inner_path} not found in archive"
    )))
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
    use std::cell::Cell;
    use std::io::copy;

    let normalized = inner_path.replace('\\', "/");
    let scratch = dest.join(format!("_partial_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&scratch)?;
    let found = Cell::new(false);

    let mut file = File::open(archive_path)?;
    let len = file.metadata()?.len();
    let password = Password::empty();
    let archive = Archive::read(&mut file, len, password.as_slice()).map_err(sevenz_err)?;

    for folder_index in 0..archive.folders.len() {
        let start = archive.stream_map.folder_first_file_index[folder_index];
        let count = archive.folders[folder_index].num_unpack_sub_streams;
        let contains_target = archive.files[start..start + count]
            .iter()
            .any(|entry| entry.name().replace('\\', "/") == normalized);
        if !contains_target {
            continue;
        }

        let folder_decoder =
            BlockDecoder::new(folder_index, &archive, password.as_slice(), &mut file);
        let _ = folder_decoder.for_each_entries(&mut |entry, reader| {
            if entry.is_directory() {
                return Ok(true);
            }
            let entry_path = entry.name().replace('\\', "/");
            if entry_path != normalized {
                copy(reader, &mut std::io::sink()).map_err(sevenz_io_err)?;
                return Ok(true);
            }
            let dest_path = scratch.join(entry.name().replace('/', std::path::MAIN_SEPARATOR_STR));
            sevenz_rust::default_entry_extract_fn(entry, reader, &dest_path)?;
            found.set(true);
            Ok(false)
        });
        if found.get() {
            break;
        }
    }

    if !found.get() {
        let _ = std::fs::remove_dir_all(&scratch);
        return Err(NexusDeckError::NotFound(format!(
            "File {inner_path} not found in archive"
        )));
    }

    let extracted = scratch.join(inner_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let outpath = dest.join(inner_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = outpath.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&extracted, &outpath)?;
    let _ = std::fs::remove_dir_all(&scratch);
    Ok(outpath)
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

pub fn has_7z_executable() -> bool {
    crate::services::sevenzip::has_7z_executable()
}

fn extract_with_7z_cli(archive_path: &Path, dest: &Path) -> Result<()> {
    extract_with_7z_cli_progress(archive_path, dest, 0, None, None)
}

struct SevenZipParseState {
    percent: u8,
    files_done: u32,
    current_file: Option<String>,
}

fn parse_7z_output_chunk(chunk: &str, state: &mut SevenZipParseState) {
    for token in chunk.split(|c| c == '\r' || c == '\n') {
        let s = token.trim();
        if s.is_empty() {
            continue;
        }
        if let Some(pct_str) = s.strip_suffix('%') {
            if let Ok(p) = pct_str.trim().parse::<u8>() {
                state.percent = p.min(100);
            }
            continue;
        }
        if let Some(file) = s
            .strip_prefix('-')
            .or_else(|| s.strip_prefix('+'))
            .map(str::trim)
        {
            if !file.is_empty()
                && !file.contains('%')
                && !file.starts_with("7-Zip")
                && !file.starts_with("Scanning")
                && !file.eq_ignore_ascii_case("Everything is Ok")
            {
                state.files_done = state.files_done.saturating_add(1);
                state.current_file = Some(file.to_string());
            }
        }
    }
}

fn extract_with_7z_cli_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<()> {
    std::fs::create_dir_all(dest)?;

    let mut child = crate::services::sevenzip::spawn_7z([
        "x",
        "-y",
        "-bsp1",
        "-bb1",
        &format!("-o{}", dest.display()),
        &archive_path.display().to_string(),
    ])
    .map_err(|e| NexusDeckError::Archive(format!("Failed to run 7-Zip: {e}")))?
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| NexusDeckError::Archive(format!("Failed to run 7-Zip: {e}")))?;

    let child_wrap = Arc::new(Mutex::new(Some(child)));
    if let Some(check) = cancel_check.clone() {
        let child_for_kill = child_wrap.clone();
        thread::spawn(move || {
            loop {
                if check().is_err() {
                    if let Some(mut child) = child_for_kill.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                    break;
                }
                thread::sleep(std::time::Duration::from_millis(200));
            }
        });
    }

    let (stdout, stderr) = {
        let mut guard = child_wrap.lock().unwrap();
        let child = guard
            .as_mut()
            .ok_or_else(|| NexusDeckError::Archive("7-Zip process unavailable".into()))?;
        (child.stdout.take(), child.stderr.take())
    };

    let parse_state = Arc::new(Mutex::new(SevenZipParseState {
        percent: 0,
        files_done: 0,
        current_file: None,
    }));
    let last_emit = Arc::new(Mutex::new(Instant::now()));

    let emit_from_state = |force: bool| {
        let Some(ref callback) = on_progress else {
            return;
        };
        let state = parse_state.lock().unwrap();
        let files_done = if files_total > 0 {
            ((state.percent as u32).saturating_mul(files_total) / 100).max(state.files_done)
        } else {
            state.files_done
        };
        let mut last = last_emit.lock().unwrap();
        let should_emit =
            force || state.percent >= 100 || last.elapsed() >= std::time::Duration::from_millis(150);
        if !should_emit {
            return;
        }
        *last = Instant::now();
        callback(crate::services::archive_options::ExtractProgressEvent {
            percent: state.percent,
            files_done,
            files_total,
            current_file: state.current_file.clone(),
        });
    };

    let mut readers = Vec::new();
    if let Some(stdout) = stdout {
        let state = parse_state.clone();
        let emit_state = parse_state.clone();
        let emit_last = last_emit.clone();
        let progress = on_progress.clone();
        readers.push(thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        {
                            let mut state = state.lock().unwrap();
                            parse_7z_output_chunk(&chunk, &mut state);
                        }
                        if progress.is_some() {
                            let state = emit_state.lock().unwrap();
                            let files_done = if files_total > 0 {
                                ((state.percent as u32).saturating_mul(files_total) / 100)
                                    .max(state.files_done)
                            } else {
                                state.files_done
                            };
                            let mut last = emit_last.lock().unwrap();
                            let should_emit = state.percent >= 100
                                || last.elapsed() >= std::time::Duration::from_millis(150);
                            if should_emit {
                                *last = Instant::now();
                                if let Some(ref callback) = progress {
                                    callback(crate::services::archive_options::ExtractProgressEvent {
                                        percent: state.percent,
                                        files_done,
                                        files_total,
                                        current_file: state.current_file.clone(),
                                    });
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        }));
    }
    if let Some(stderr) = stderr {
        let state = parse_state.clone();
        let emit_state = parse_state.clone();
        let emit_last = last_emit.clone();
        let progress = on_progress.clone();
        readers.push(thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        {
                            let mut state = state.lock().unwrap();
                            parse_7z_output_chunk(&chunk, &mut state);
                        }
                        if progress.is_some() {
                            let state = emit_state.lock().unwrap();
                            let files_done = if files_total > 0 {
                                ((state.percent as u32).saturating_mul(files_total) / 100)
                                    .max(state.files_done)
                            } else {
                                state.files_done
                            };
                            let mut last = emit_last.lock().unwrap();
                            let should_emit = state.percent >= 100
                                || last.elapsed() >= std::time::Duration::from_millis(150);
                            if should_emit {
                                *last = Instant::now();
                                if let Some(ref callback) = progress {
                                    callback(crate::services::archive_options::ExtractProgressEvent {
                                        percent: state.percent,
                                        files_done,
                                        files_total,
                                        current_file: state.current_file.clone(),
                                    });
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        }));
    }

    for handle in readers {
        let _ = handle.join();
    }

    let status = child_wrap
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| NexusDeckError::Archive("7-Zip process unavailable".into()))?
        .wait()
        .map_err(|e| NexusDeckError::Archive(format!("Failed to wait for 7-Zip: {e}")))?;

    if let Some(check) = cancel_check {
        check()?;
    }

    emit_from_state(true);

    if !status.success() {
        return Err(NexusDeckError::Archive(
            "7-Zip extraction failed".into(),
        ));
    }

    Ok(())
}

/// Prefer the native 7-Zip binary (same approach as Vortex) for large solid archives.
pub fn extract_archive_fast(archive_path: &Path, dest: &Path) -> Result<Vec<String>> {
    extract_archive_fast_with_progress(archive_path, dest, 0, None, None)
}

pub fn extract_archive_fast_with_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<Vec<String>> {
    if crate::services::sevenzip::has_7z_executable() {
        if let Ok(()) = extract_with_7z_cli_progress(
            archive_path,
            dest,
            files_total,
            on_progress.clone(),
            cancel_check.clone(),
        ) {
            return collect_extracted_files(dest);
        }
    }
    extract_archive_with_progress(archive_path, dest, files_total, on_progress, cancel_check)
}

fn extract_archive_with_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<Vec<String>> {
    std::fs::create_dir_all(dest)?;
    match detect_archive_format(archive_path)? {
        ArchiveFormat::Zip => {
            extract_zip_with_progress(archive_path, dest, files_total, on_progress, cancel_check)
        }
        ArchiveFormat::SevenZ => {
            extract_7z_with_progress(archive_path, dest, files_total, on_progress, cancel_check)
        }
        ArchiveFormat::Rar => {
            extract_rar_with_progress(archive_path, dest, files_total, on_progress, cancel_check)
        }
    }
}

fn extract_zip_with_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<Vec<String>> {
    let file = File::open(archive_path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let total = archive.len().max(1);
    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        if let Some(ref check) = cancel_check {
            check()?;
        }
        let mut file = archive
            .by_index(i)
            .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
        let outpath = dest.join(file.name());
        let current_file = file.name().to_string();

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

        if let Some(ref callback) = on_progress {
            let done = i + 1;
            let percent = ((done as u64).saturating_mul(100) / total as u64) as u8;
            callback(crate::services::archive_options::ExtractProgressEvent {
                percent,
                files_done: done as u32,
                files_total: files_total.max(total as u32),
                current_file: Some(current_file),
            });
        }
    }
    Ok(extracted)
}

fn extract_rar_with_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<Vec<String>> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?;
    let mut extracted = Vec::new();
    let mut done = 0u32;

    while let Some(header) = archive
        .read_header()
        .map_err(|e| NexusDeckError::Archive(e.to_string()))?
    {
        if let Some(ref check) = cancel_check {
            check()?;
        }
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
                done += 1;
                if let Some(ref callback) = on_progress {
                    let total = files_total.max(done);
                    let percent = ((done as u64).saturating_mul(100) / total as u64) as u8;
                    callback(crate::services::archive_options::ExtractProgressEvent {
                        percent,
                        files_done: done,
                        files_total: total,
                        current_file: Some(filename.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }

    Ok(extracted)
}

fn collect_extracted_files(dest: &Path) -> Result<Vec<String>> {
    let mut extracted = Vec::new();
    for entry in WalkDir::new(dest).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            extracted.push(entry.path().display().to_string());
        }
    }
    Ok(extracted)
}

pub fn list_extracted_entries(extract_dir: &Path) -> Result<Vec<ArchiveEntry>> {
    let mut entries = Vec::new();
    for entry in WalkDir::new(extract_dir).into_iter().filter_map(|e| e.ok()) {
        let rel = entry
            .path()
            .strip_prefix(extract_dir)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if rel.is_empty() {
            continue;
        }
        let size = if entry.file_type().is_file() {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        entries.push(ArchiveEntry {
            path: rel,
            is_dir: entry.file_type().is_dir(),
            size,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
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

fn extract_7z_with_progress(
    archive_path: &Path,
    dest: &Path,
    files_total: u32,
    on_progress: Option<crate::services::archive_options::ExtractProgressFn>,
    cancel_check: Option<crate::services::archive_options::CancelCheckFn>,
) -> Result<Vec<String>> {
    use sevenz_rust::decompress_file_with_extract_fn;

    std::fs::create_dir_all(dest)?;
    let progress = on_progress.clone();
    let cancel = cancel_check.clone();
    let mut done = 0u32;

    decompress_file_with_extract_fn(archive_path, dest, move |entry, reader, path| {
        if let Some(ref check) = cancel {
            if check().is_err() {
                return Err(sevenz_rust::Error::other("Install cancelled"));
            }
        }
        let result = sevenz_rust::default_entry_extract_fn(entry, reader, path);
        if !entry.is_directory() {
            done += 1;
            if let Some(ref callback) = progress {
                let total = files_total.max(done);
                let percent = ((done as u64).saturating_mul(100) / total as u64) as u8;
                callback(crate::services::archive_options::ExtractProgressEvent {
                    percent,
                    files_done: done,
                    files_total: total,
                    current_file: Some(entry.name().replace('\\', "/")),
                });
            }
        }
        result
    })
    .map_err(sevenz_err)?;

    collect_extracted_files(dest)
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

/// Extract nested .zip/.7z/.rar archives found inside an extract directory (depth-limited).
pub fn extract_nested_archives(extract_dir: &Path, max_depth: u32) -> Result<u32> {
    let mut extracted_count = 0u32;
    extract_nested_inner(extract_dir, 0, max_depth, &mut extracted_count)?;
    Ok(extracted_count)
}

fn extract_nested_inner(
    dir: &Path,
    depth: u32,
    max_depth: u32,
    count: &mut u32,
) -> Result<()> {
    if depth >= max_depth {
        return Ok(());
    }

    let nested: Vec<PathBuf> = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| is_supported_archive(e.path()))
        .map(|e| e.path().to_path_buf())
        .collect();

    for archive in nested {
        let parent = archive.parent().unwrap_or(dir);
        let stem = archive
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("nested");
        let dest = parent.join(format!("{stem}_nested"));
        if let Err(e) = std::fs::create_dir_all(&dest) {
            log::warn!(
                "Skipping nested archive {} (could not create extract dir): {e}",
                archive.display()
            );
            continue;
        }
        match extract_archive_fast(&archive, &dest) {
            Ok(_) => {
                let _ = std::fs::remove_file(&archive);
                *count += 1;
                extract_nested_inner(dir, depth + 1, max_depth, count)?;
            }
            Err(e) => {
                log::warn!(
                    "Skipping nested archive {} (extract failed): {e}",
                    archive.display()
                );
                let _ = std::fs::remove_dir_all(&dest);
            }
        }
    }

    Ok(())
}

use crate::services::archive_options::{MergeOptions, MergeProgressEvent};

pub fn merge_directory(
    src: &Path,
    dest: &Path,
    options: MergeOptions,
) -> Result<Vec<String>> {
    let mut deployed = Vec::new();
    let file_entries: Vec<_> = WalkDir::new(src)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();
    let total = file_entries.len();
    let resolve_case = std::env::consts::OS == "linux";
    let mut case_cache = crate::services::deploy::CaseCache::new();

    for (index, entry) in file_entries.iter().enumerate() {
        if let Some(ref check) = options.on_cancel {
            check()?;
        }
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = if resolve_case {
            crate::services::deploy::resolve_deploy_target(dest, rel, &mut case_cache)
        } else {
            dest.join(rel)
        };
        if target.exists() && !options.overwrite {
            continue;
        }
        if options.dry_run {
            deployed.push(target.display().to_string());
        } else {
            crate::services::deploy::deploy_file(entry.path(), &target)?;
            deployed.push(target.display().to_string());
        }

        if let Some(ref on_progress) = options.on_progress {
            on_progress(MergeProgressEvent {
                files_done: index + 1,
                files_total: total,
                current_file: rel.display().to_string(),
            });
        }
    }
    Ok(deployed)
}
