mod commands;
mod db;
mod error;
mod games;
mod services;

use std::sync::Arc;

use tauri::{async_runtime::spawn, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;

use commands::*;
use services::download_manager::DownloadManager;
use services::nexus_client::NexusClient;
use services::process_monitor::ProcessMonitor;
use services::startup_log;

#[cfg(target_os = "linux")]
fn force_env(key: &str, value: &str) {
    // SAFETY: called on the main thread before worker threads or WebKit start.
    unsafe { std::env::set_var(key, value) };
}

/// Must run before Tauri/WebKit initialize. Safe to call from `main`.
#[cfg(target_os = "linux")]
pub fn prepare_linux_webview() {
    // Ubuntu CI AppImages often show a blank window on SteamOS until these are set.
    // Force values even if Steam/Wayland already exported conflicting defaults.
    // https://v2.tauri.app/develop/debug/linux-graphics/
    force_env("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    force_env("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    force_env("GDK_BACKEND", "x11");
    force_env("WINIT_UNIX_BACKEND", "x11");
}

#[cfg(not(target_os = "linux"))]
pub fn prepare_linux_webview() {}

#[cfg(target_os = "linux")]
fn configure_linux_webview(app: &tauri::AppHandle) -> crate::error::Result<()> {
    use tauri::Manager;
    use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| crate::error::NexusDeckError::Other("main window not found".into()))?;

    window
        .with_webview(|webview| {
            let wv = webview.inner();
            if let Some(settings) = wv.settings() {
                settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never);
                settings.set_enable_webgl(false);
            }
        })
        .map_err(|e| crate::error::NexusDeckError::Other(e.to_string()))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    prepare_linux_webview();

    env_logger::init();

    let nexus_client = Arc::new(NexusClient::new());
    let download_manager = Arc::new(DownloadManager::new());
    let process_monitor = Arc::new(ProcessMonitor::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("nxm://")) {
                let _ = app.emit("nxm-url", url.clone());
            }
        }))
        .manage(nexus_client.clone())
        .manage(download_manager.clone())
        .manage(process_monitor.clone())
        .setup(move |app| {
            let log_path = startup_log::init()?;
            startup_log::log_step("setup", &format!("log at {}", log_path.display()));

            db::init_db()?;

            #[cfg(target_os = "linux")]
            {
                configure_linux_webview(app.handle())?;
                startup_log::log_step("linux_webview", "hardware acceleration disabled");
            }

            process_monitor.set_app_handle(app.handle().clone());
            process_monitor.start_polling();

            if let Ok(Some(key)) = crate::services::credentials::retrieve_api_key() {
                nexus_client.set_api_key(Some(key));
            }

            let app_handle = app.handle().clone();
            let dm = download_manager.clone();
            let nc = nexus_client.clone();
            spawn(async move {
                dm.resume_incomplete_downloads(app_handle, nc);
            });

            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in urls {
                        let _ = app_handle.emit("nxm-url", url.to_string());
                    }
                }

                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let _ = app_handle.emit("nxm-url", url.to_string());
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            validate_and_store_api_key,
            load_stored_api_key,
            check_has_api_key,
            clear_api_key,
            detect_steam_install,
            find_steam_game,
            detect_game,
            validate_game_path,
            run_wizard_step,
            create_profile,
            list_supported_games,
            list_profiles,
            get_profile,
            is_onboarding_complete,
            complete_onboarding,
            get_platform_info,
            search_mods,
            get_mod_detail,
            get_mod_files,
            list_nexus_games,
            handle_nxm_url,
            start_mod_download,
            list_downloads,
            install_mod_from_archive,
            list_installed_mods,
            set_mod_enabled,
            reorder_mod,
            analyze_archive,
            check_mod_conflicts,
            preview_mod_install,
            prepare_mod_install,
            repair_deployment,
            read_fomod_asset,
            get_fomod_wizard_state,
            cleanup_prepare_dir,
            get_install_strategies,
            detect_f4se,
            detect_script_extender,
            install_f4se,
            install_script_extender,
            install_f4se_from_archive,
            install_script_extender_from_archive,
            get_f4se_install_info,
            get_script_extender_install_info,
            list_staging_archives,
            create_practice_mod,
            resolve_mod_archive_path,
            get_nexus_browser_urls,
            watch_staging_ready,
            start_staging_watcher,
            export_diagnostics,
            backup_profile,
            restore_profile,
            get_app_paths,
            search_mods_filtered,
            list_mod_categories,
            get_trending_mods,
            cancel_download,
            retry_download,
            clear_completed_downloads,
            dismiss_download,
            clear_failed_downloads,
            get_download_settings,
            set_download_settings,
            compare_staging_archives,
            compare_installed_mods,
            compare_mod_with_installed,
            resolve_mod_dependencies,
            queue_missing_dependencies,
            get_archive_file_tree,
            preview_archive_file,
            list_collections,
            get_collection_detail,
            check_profile_updates,
            start_mod_update,
            update_mod_safe,
            update_all_mods,
            complete_mod_update,
            uninstall_mod,
            auto_sort_load_order,
            get_load_order_state,
            refresh_mod_metadata,
            get_updated_mods_feed,
            endorse_mod,
            abstain_mod,
            get_user_endorsements,
            track_mod,
            list_tracked_mods,
            analyze_deck_profile,
            trigger_haptic,
            export_modlist,
            list_launch_configs,
            save_launch_config,
            delete_launch_config,
            get_recent_launch_configs,
            validate_launch,
            launch_game,
            get_game_running_state,
            clear_launch_tracking,
            stop_game,
            sync_plugins_txt,
            create_safe_launch_backup,
            get_launch_settings,
            set_launch_settings,
            get_playtime_stats,
            create_steam_shortcut,
            list_steam_shortcuts,
            delete_steam_shortcut,
            add_nexusdeck_to_steam,
            get_game_settings_schema,
            get_game_settings_values,
            apply_game_settings,
            apply_game_settings_preset,
            pick_launch_executable,
            batch_launch_tools,
            detect_bodyslide,
            get_body_setup_status,
            launch_bodyslide,
            log_startup_event,
            get_startup_diagnostics,
            get_startup_log_path,
            run_diagnostic_scan,
            apply_autofix,
            apply_safe_autofixes,
            list_autofix_remedies,
            export_diagnostic_markdown,
            get_game_manifest,
            list_game_manifests,
            get_wabbajack_checklist,
            check_prefix_status,
            bootstrap_vanilla_launch,
            check_proton_version,
            backup_proton_prefix,
            restore_proton_prefix,
            detect_protontricks,
            install_proton_deps,
            backup_profile_prefix,
            restore_profile_prefix,
            detect_mo2,
            get_mo2_status,
            install_mo2,
            configure_mo2_instance,
            get_mo2_skse_hint,
            detect_sseedit,
            launch_sseedit,
            reset_profile_mods,
            check_app_update,
            get_logs_dir,
            list_recent_install_logs,
            read_install_log,
            get_verbose_logging,
            set_verbose_logging,
            export_install_logs,
            export_install_logs_to,
            get_install_log_path_for_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
