//! Safe read/write for Steam `shortcuts.vdf` using binary KeyValues format.
//!
//! Steam stores non-Steam game shortcuts as binary VDF (`0x00 0x01` header).
//! Text-based writes corrupt the file and break Protontricks — this module
//! always round-trips through `steam_shortcuts_util`.

use std::path::{Path, PathBuf};

use steam_shortcuts_util::app_id_generator::calculate_app_id;
use steam_shortcuts_util::parse_shortcuts;
use steam_shortcuts_util::shortcut::Shortcut;
use steam_shortcuts_util::shortcuts_to_bytes;

use crate::error::{NexusDeckError, Result};
use crate::services::host_shell::run_host_bash;
use crate::services::platform;

pub const BACKUP_SUFFIX: &str = "nexusdeck_backup";

#[derive(Debug, Clone)]
pub struct OwnedShortcut {
    pub order: String,
    pub app_id: u32,
    pub app_name: String,
    pub exe: String,
    pub start_dir: String,
    pub icon: String,
    pub shortcut_path: String,
    pub launch_options: String,
    pub is_hidden: bool,
    pub allow_desktop_config: bool,
    pub allow_overlay: bool,
    pub open_vr: u32,
    pub dev_kit: u32,
    pub dev_kit_game_id: String,
    pub dev_kit_overrite_app_id: u32,
    pub last_play_time: u32,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ShortcutUpsert {
    pub app_name: String,
    pub exe: String,
    pub start_dir: String,
    pub launch_options: String,
}

impl OwnedShortcut {
    fn from_parsed(s: &Shortcut<'_>) -> Self {
        Self {
            order: s.order.to_string(),
            app_id: s.app_id,
            app_name: s.app_name.to_string(),
            exe: s.exe.to_string(),
            start_dir: s.start_dir.to_string(),
            icon: s.icon.to_string(),
            shortcut_path: s.shortcut_path.to_string(),
            launch_options: s.launch_options.to_string(),
            is_hidden: s.is_hidden,
            allow_desktop_config: s.allow_desktop_config,
            allow_overlay: s.allow_overlay,
            open_vr: s.open_vr,
            dev_kit: s.dev_kit,
            dev_kit_game_id: s.dev_kit_game_id.to_string(),
            dev_kit_overrite_app_id: s.dev_kit_overrite_app_id,
            last_play_time: s.last_play_time,
            tags: s.tags.iter().map(|t| t.to_string()).collect(),
        }
    }

    fn as_borrowed(&self) -> Shortcut<'_> {
        Shortcut {
            order: &self.order,
            app_id: self.app_id,
            app_name: &self.app_name,
            exe: &self.exe,
            start_dir: &self.start_dir,
            icon: &self.icon,
            shortcut_path: &self.shortcut_path,
            launch_options: &self.launch_options,
            is_hidden: self.is_hidden,
            allow_desktop_config: self.allow_desktop_config,
            allow_overlay: self.allow_overlay,
            open_vr: self.open_vr,
            dev_kit: self.dev_kit,
            dev_kit_game_id: &self.dev_kit_game_id,
            dev_kit_overrite_app_id: self.dev_kit_overrite_app_id,
            last_play_time: self.last_play_time,
            tags: self.tags.iter().map(String::as_str).collect(),
        }
    }
}

impl ShortcutUpsert {
    pub fn to_owned_shortcut(&self, order: usize) -> OwnedShortcut {
        let app_id = calculate_app_id(&self.exe, &self.app_name);
        OwnedShortcut {
            order: order.to_string(),
            app_id,
            app_name: self.app_name.clone(),
            exe: self.exe.clone(),
            start_dir: self.start_dir.clone(),
            icon: String::new(),
            shortcut_path: String::new(),
            launch_options: self.launch_options.clone(),
            is_hidden: false,
            allow_desktop_config: true,
            allow_overlay: true,
            open_vr: 0,
            dev_kit: 0,
            dev_kit_game_id: String::new(),
            dev_kit_overrite_app_id: 0,
            last_play_time: 0,
            tags: Vec::new(),
        }
    }
}

pub fn backup_path(shortcuts: &Path) -> PathBuf {
    PathBuf::from(format!("{}.{}", shortcuts.display(), BACKUP_SUFFIX))
}

pub fn is_binary_vdf(data: &[u8]) -> bool {
    data.len() >= 2 && data[0] == 0 && data[1] == 1
}

pub fn is_text_vdf(data: &[u8]) -> bool {
    matches!(data.first(), Some(b'"'))
}

/// Steam's standard non-Steam app ID (CRC32 of name+exe+null, high bit set).
pub fn generate_shortcut_app_id(name: &str, exe_path: &str) -> u32 {
    calculate_app_id(exe_path, name)
}

pub fn ensure_backup(shortcuts: &Path) -> Result<()> {
    let backup = backup_path(shortcuts);
    if backup.is_file() {
        return Ok(());
    }
    if !shortcuts.is_file() {
        return Ok(());
    }
    let data = read_file_on_host(shortcuts)?;
    write_file_on_host(&backup, &data)?;
    Ok(())
}

pub fn load_shortcuts(shortcuts: &Path) -> Result<Vec<OwnedShortcut>> {
    if !shortcuts.is_file() && !host_file_exists(shortcuts)? {
        return Ok(Vec::new());
    }

    let data = read_file_on_host(shortcuts)?;
    if data.is_empty() {
        return Ok(Vec::new());
    }
    if is_text_vdf(&data) {
        return Err(NexusDeckError::Other(
            "Steam shortcuts.vdf is in text format (corrupted). Quit Steam, then use \
             Settings → Repair Steam Shortcuts to restore from backup."
                .into(),
        ));
    }
    if !is_binary_vdf(&data) {
        return Err(NexusDeckError::Other(
            "Steam shortcuts.vdf has an unknown format. Quit Steam and use Repair Steam Shortcuts."
                .into(),
        ));
    }

    let parsed = parse_shortcuts(&data).map_err(|e| {
        NexusDeckError::Other(format!(
            "Could not parse shortcuts.vdf: {e}. Try Repair Steam Shortcuts in Settings."
        ))
    })?;
    Ok(parsed.iter().map(OwnedShortcut::from_parsed).collect())
}

pub fn write_shortcuts(shortcuts: &Path, entries: &[OwnedShortcut]) -> Result<()> {
    ensure_backup(shortcuts)?;
    let borrowed: Vec<Shortcut<'_>> = entries.iter().map(OwnedShortcut::as_borrowed).collect();
    let bytes = shortcuts_to_bytes(&borrowed);
    if let Some(parent) = shortcuts.parent() {
        ensure_dir_on_host(parent)?;
    }
    write_file_on_host(shortcuts, &bytes)
}

pub fn shortcut_exists(entries: &[OwnedShortcut], upsert: &ShortcutUpsert) -> bool {
    entries.iter().any(|s| shortcut_matches(s, upsert))
}

fn shortcut_matches(existing: &OwnedShortcut, upsert: &ShortcutUpsert) -> bool {
    existing.exe == upsert.exe
        || existing.app_name == upsert.app_name
        || (!upsert.launch_options.is_empty() && existing.launch_options == upsert.launch_options)
        || existing.launch_options.contains("com.nexusdeck.app")
        || (upsert.launch_options.contains("com.nexusdeck.app") && existing.exe.contains("flatpak"))
}

/// Insert or skip if a matching shortcut already exists. Returns `true` if already present.
pub fn upsert_shortcut(shortcuts: &Path, upsert: &ShortcutUpsert) -> Result<bool> {
    let exists_on_host = host_file_exists(shortcuts)?;
    let mut entries = if exists_on_host {
        load_shortcuts(shortcuts)?
    } else {
        Vec::new()
    };

    if shortcut_exists(&entries, upsert) {
        return Ok(true);
    }

    let next_order = entries.len();
    entries.push(upsert.to_owned_shortcut(next_order));
    write_shortcuts(shortcuts, &entries)?;
    Ok(false)
}

pub fn remove_shortcuts_matching(shortcuts: &Path, needles: &[&str]) -> Result<bool> {
    if !shortcuts.is_file() && !host_file_exists(shortcuts)? {
        return Ok(false);
    }

    let data = read_file_on_host(shortcuts)?;
    if is_text_vdf(&data) {
        return remove_shortcuts_text_legacy(shortcuts, needles);
    }

    let mut entries = load_shortcuts(shortcuts)?;
    let before = entries.len();
    entries.retain(|s| {
        let blob = format!(
            "{} {} {} {}",
            s.app_name, s.exe, s.launch_options, s.start_dir
        );
        !needles.iter().any(|n| !n.is_empty() && blob.contains(n))
    });
    if entries.len() == before {
        return Ok(false);
    }
    for (i, entry) in entries.iter_mut().enumerate() {
        entry.order = i.to_string();
    }
    write_shortcuts(shortcuts, &entries)?;
    Ok(true)
}

fn remove_shortcuts_text_legacy(shortcuts: &Path, needles: &[&str]) -> Result<bool> {
    let text = String::from_utf8_lossy(&read_file_on_host(shortcuts)?).into_owned();
    if !text.contains("\"Shortcuts\"") {
        return Ok(false);
    }
    let lines: Vec<&str> = text.lines().collect();
    let mut result: Vec<String> = Vec::new();
    let mut removed = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if line.trim().starts_with("\"AppName\"") {
            let mut block = vec![line.to_string()];
            let mut j = i + 1;
            while j < lines.len() {
                if lines[j].trim().starts_with("\"AppName\"") {
                    break;
                }
                block.push(lines[j].to_string());
                if lines[j].trim() == "}" && j > i {
                    break;
                }
                j += 1;
            }
            let block_text = block.join("\n");
            if needles.iter().any(|n| !n.is_empty() && block_text.contains(n)) {
                removed = true;
                i = j + 1;
                continue;
            }
            result.extend(block);
            i = j + 1;
            continue;
        }
        result.push(line.to_string());
        i += 1;
    }
    if removed {
        write_file_on_host(shortcuts, result.join("\n").as_bytes())?;
    }
    Ok(removed)
}

pub fn host_file_exists(path: &Path) -> Result<bool> {
    if !platform::is_flatpak_sandbox() && path.is_file() {
        return Ok(true);
    }
    let path_s = shell_escape(path.display().to_string());
    let script = format!(r#"[ -f {path_s} ] && echo yes || echo no"#);
    let output = run_host_bash(&script)?;
    Ok(String::from_utf8_lossy(&output.stdout).contains("yes"))
}

fn ensure_dir_on_host(path: &Path) -> Result<()> {
    if !platform::is_flatpak_sandbox() {
        std::fs::create_dir_all(path).map_err(|e| NexusDeckError::Other(e.to_string()))?;
        return Ok(());
    }
    let path_s = shell_escape(path.display().to_string());
    let script = format!(r#"mkdir -p {path_s}"#);
    let _ = run_host_bash(&script)?;
    Ok(())
}

pub fn read_file_on_host(path: &Path) -> Result<Vec<u8>> {
    if !platform::is_flatpak_sandbox() {
        return std::fs::read(path).map_err(|e| NexusDeckError::Other(e.to_string()));
    }
    let path_s = shell_escape(path.display().to_string());
    let script = format!(
        r#"if [ ! -f {path_s} ]; then exit 2; fi
python3 - <<'PY'
import base64, pathlib, sys
p = pathlib.Path({path_s})
sys.stdout.write(base64.b64encode(p.read_bytes()).decode())
PY"#
    );
    let output = run_host_bash(&script)?;
    if output.status.code() == Some(2) {
        return Err(NexusDeckError::NotFound(format!(
            "File not found: {}",
            path.display()
        )));
    }
    if !output.status.success() {
        return Err(NexusDeckError::Other(format!(
            "Could not read {} on host",
            path.display()
        )));
    }
    decode_base64(String::from_utf8_lossy(&output.stdout).trim())
}

pub fn write_file_on_host(path: &Path, data: &[u8]) -> Result<()> {
    if !platform::is_flatpak_sandbox() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| NexusDeckError::Other(e.to_string()))?;
        }
        std::fs::write(path, data).map_err(|e| NexusDeckError::Other(e.to_string()))?;
        return Ok(());
    }
    let path_s = shell_escape(path.display().to_string());
    let b64 = encode_base64(data);
    let script = format!(
        r#"python3 - <<'PY'
import base64, pathlib
path = pathlib.Path({path_s})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(base64.b64decode("{b64}"))
PY"#
    );
    let output = run_host_bash(&script)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(NexusDeckError::Other(format!(
            "Could not write {} on host: {stderr}",
            path.display()
        )));
    }
    Ok(())
}

fn shell_escape(value: String) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn decode_base64(input: &str) -> Result<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let bytes: Vec<u8> = input.bytes().filter(|b| *b != b'\n' && *b != b'\r').collect();
    for chunk in bytes.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let vals: Vec<u8> = chunk
            .iter()
            .map(|b| match b {
                b'A'..=b'Z' => b - b'A',
                b'a'..=b'z' => b - b'a' + 26,
                b'0'..=b'9' => b - b'0' + 52,
                b'+' => 62,
                b'/' => 63,
                b'=' => 0,
                _ => 0,
            })
            .collect();
        let n = ((vals[0] as u32) << 18) | ((vals[1] as u32) << 12) | ((vals[2] as u32) << 6) | (vals[3] as u32);
        out.push((n >> 16) as u8);
        if chunk[2] != b'=' {
            out.push(((n >> 8) & 0xff) as u8);
        }
        if chunk[3] != b'=' {
            out.push((n & 0xff) as u8);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_id_uses_steam_crc32() {
        let id = generate_shortcut_app_id("NexusDeck", "/usr/bin/flatpak");
        assert_ne!(id & 0x80000000, 0);
    }

    #[test]
    fn round_trip_empty_shortcuts() {
        let dir = std::env::temp_dir().join(format!(
            "nd-shortcuts-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("shortcuts.vdf");
        let upsert = ShortcutUpsert {
            app_name: "Test App".into(),
            exe: "/usr/bin/flatpak".into(),
            start_dir: "/home/deck".into(),
            launch_options: "run com.example.app".into(),
        };
        upsert_shortcut(&path, &upsert).unwrap();
        let loaded = load_shortcuts(&path).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].app_name, "Test App");
        assert!(is_binary_vdf(&std::fs::read(&path).unwrap()));
        let _ = std::fs::remove_dir_all(dir);
    }
}
