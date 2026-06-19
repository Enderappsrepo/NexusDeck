// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexusdeck_lib::prepare_linux_webview();
    nexusdeck_lib::run()
}
