use std::path::Path;

use crate::error::{NexusDeckError, Result};

/// Read the product/file version from a Windows PE executable (works on Linux/Deck too).
pub fn read_pe_version(path: &Path) -> Result<String> {
    let data = std::fs::read(path).map_err(|e| {
        NexusDeckError::Other(format!("Could not read {}: {e}", path.display()))
    })?;
    let pe = pelite::PeFile::from_bytes(&data)
        .map_err(|e| NexusDeckError::Other(format!("Not a valid PE executable: {e}")))?;
    let resources = pe
        .resources()
        .map_err(|e| NexusDeckError::Other(format!("No PE resources in {}: {e}", path.display())))?;
    let version = resources
        .version_info()
        .map_err(|e| NexusDeckError::Other(format!("No version info in {}: {e}", path.display())))?;

    let mut found = None;
    for lang in version.translation() {
        version.strings(*lang, |key, value| {
            if found.is_some() {
                return;
            }
            if key == "ProductVersion" || key == "FileVersion" {
                let normalized = normalize_version_string(value);
                if !normalized.is_empty() {
                    found = Some(normalized);
                }
            }
        });
        if found.is_some() {
            break;
        }
    }
    if let Some(v) = found {
        return Ok(v);
    }

    if let Some(fixed) = version.fixed() {
        let fv = &fixed.dwFileVersion;
        return Ok(normalize_version_string(&format!(
            "{}.{}.{}.{}",
            fv.Major, fv.Minor, fv.Patch, fv.Build
        )));
    }

    Err(NexusDeckError::Other(format!(
        "Could not read version from {}",
        path.display()
    )))
}

pub fn normalize_version_string(raw: &str) -> String {
    let parts: Vec<&str> = raw
        .split(|c| c == '.' || c == ',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    match parts.len() {
        0 => String::new(),
        1 => parts[0].to_string(),
        2 => format!("{}.{}", parts[0], parts[1]),
        _ => format!("{}.{}.{}", parts[0], parts[1], parts[2]),
    }
}

pub fn read_game_executable_version(game_root: &Path, executable: &str) -> Result<String> {
    read_pe_version(&game_root.join(executable))
}

/// Parse `f4se_1_10_984.dll` → `1.10.984`
pub fn parse_extender_dll_version(filename: &str, dll_prefix: &str) -> Option<String> {
    let lower = filename.to_lowercase();
    let prefix = dll_prefix.to_lowercase();
    if !lower.starts_with(&prefix) || !lower.ends_with(".dll") {
        return None;
    }
    let core = &lower[prefix.len()..lower.len() - 4];
    if core.is_empty() {
        return None;
    }
    Some(core.replace('_', "."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_comma_separated_versions() {
        assert_eq!(normalize_version_string("1,10,984,0"), "1.10.984");
        assert_eq!(normalize_version_string("1.6.1170.0"), "1.6.1170");
    }

    #[test]
    fn parses_f4se_dll_name() {
        assert_eq!(
            parse_extender_dll_version("f4se_1_10_984.dll", "f4se_"),
            Some("1.10.984".into())
        );
    }
}
