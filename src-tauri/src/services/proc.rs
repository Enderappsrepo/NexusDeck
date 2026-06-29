//! Cross-platform process spawn helpers.
//!
//! On Windows, a GUI app that spawns a console subprocess (7-Zip, the game
//! launcher, etc.) flashes a `cmd`/console window for each spawn unless the
//! `CREATE_NO_WINDOW` flag is set. NexusDeck shells out to 7-Zip constantly
//! (every archive scan/list/extract), so without this a window pops up over and
//! over. `hide_console` applies the flag on Windows and is a no-op elsewhere.

use std::process::Command;

/// Windows `CREATE_NO_WINDOW` — run the child without allocating a console.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the console window for a spawned subprocess on Windows. No-op on
/// other platforms. Call before `.output()` / `.spawn()` / `.status()`.
pub fn hide_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
