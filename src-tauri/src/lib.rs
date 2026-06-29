mod commands;
mod db;
mod error;
mod games;
mod services;

use std::sync::Arc;

use tauri::{async_runtime::spawn, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use commands::*;
use services::download_manager::DownloadManager;
use services::install_manager::InstallManager;
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
    let hw_accel = crate::services::app_prefs::hardware_acceleration_enabled();
    // Prefer X11 on Steam Deck — Wayland + WebKitGTK still has edge-case input bugs.
    force_env("GDK_BACKEND", "x11");
    force_env("WINIT_UNIX_BACKEND", "x11");
    if !hw_accel {
        // Compatibility path for blank-window / corrupt rendering on older WebKit builds.
        force_env("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        force_env("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
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
                let hw_accel = crate::services::app_prefs::hardware_acceleration_enabled();
                if hw_accel {
                    settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::OnDemand);
                } else {
                    settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never);
                    settings.set_enable_webgl(false);
                }
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
    let install_manager = Arc::new(InstallManager::new());
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
        .manage(install_manager.clone())
        .manage(process_monitor.clone())
        .setup(move |app| {
            let log_path = startup_log::init()?;
            startup_log::log_step("setup", &format!("log at {}", log_path.display()));

            db::init_db()?;

            if let Ok(resource_dir) = app.path().resource_dir() {
                let bundled =
                    crate::services::sevenzip::discover_bundled_in_resource_dir(&resource_dir);
                crate::services::sevenzip::init_bundled_path(bundled);
            }
            crate::services::sevenzip::probe_host_7z();
            startup_log::log_step(
                "sevenzip",
                &crate::services::sevenzip::get_info().message,
            );

            #[cfg(target_os = "linux")]
            {
                configure_linux_webview(app.handle())?;
                let hw = crate::services::app_prefs::hardware_acceleration_enabled();
                startup_log::log_step(
                    "linux_webview",
                    if hw {
                        "hardware acceleration enabled (OnDemand)"
                    } else {
                        "hardware acceleration disabled (compatibility mode)"
                    },
                );
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

            #[cfg(target_os = "linux")]
            {
                let _ = crate::services::gamescope::claim_gamescope_focus_if_needed(app.handle());
                crate::services::power_lifecycle::start_monitor(
                    app.handle().clone(),
                    download_manager.clone(),
                    nexus_client.clone(),
                );
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_prefs,
            set_hardware_acceleration,
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
            restart_onboarding,
            get_platform_info,
            get_sevenzip_info,
            search_mods,
            get_mod_detail,
            get_mod_files,
            list_nexus_games,
            handle_nxm_url,
            start_mod_download,
            list_downloads,
            install_mod_from_archive,
            cancel_install,
            list_installed_mods,
            reconcile_mod_library,
            set_mod_enabled,
            reorder_mod,
            analyze_archive,
            check_mod_conflicts,
            preview_mod_install,
            prepare_mod_install,
            repair_deployment,
            check_deploy_mode,
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
            rescan_library_from_disk,
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
            is_steam_running,
            quit_steam_client,
            add_nexusdeck_to_steam_when_ready,
            install_nexusdeck_steam_input_layout,
            repair_steam_shortcuts,
            get_game_settings_schema,
            get_game_settings_values,
            apply_game_settings,
            apply_game_settings_preset,
            pick_launch_executable,
            batch_launch_tools,
            detect_bodyslide,
            get_body_setup_status,
            launch_bodyslide,
            configure_bodyslide_paths,
            launch_outfit_studio,
            queue_bodyslide_install,
            queue_cbbe_install,
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
            check_protontricks_health,
            fix_protontricks_error,
            repair_protontricks,
            install_proton_deps,
            verify_proton_deps,
            collect_proton_diagnostics,
            get_bethesda_audio_status,
            fix_bethesda_audio,
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
            reset_app,
            uninstall_nexusdeck,
            exit_app,
            check_app_update,
            get_logs_dir,
            list_recent_install_logs,
            read_install_log,
            get_verbose_logging,
            set_verbose_logging,
            export_install_logs,
            export_install_logs_to,
            get_install_log_path_for_session,
            list_proton_logs,
            read_proton_log,
            get_proton_master_log_path,
            acquire_wake_lock,
            release_wake_lock,
            is_wake_lock_active,
            diff_collection_install,
            assess_mod_safety,
            scan_deploy_footprint,
            scan_profile_conflicts,
            analyze_texture_budget,
            list_mod_loadouts,
            save_mod_loadout,
            apply_mod_loadout,
            delete_mod_loadout,
            export_sync_bundle,
            export_steam_input_guide,
            get_mod_update_changelog,
            parse_modlist_import,
            read_text_file,
            write_text_file,
            get_decky_host_status,
            install_decky_host_plugin,
            restore_window_after_game,
            reload_webview,
            claim_gamescope_focus,
            get_essential_fixes_manifest,
            apply_essential_fixes,
            start_remote_receiver,
            stop_remote_receiver,
            get_remote_receiver_status,
            discover_decks,
            pair_with_deck,
            ping_deck,
            send_mod_to_deck,
            send_presets_to_deck,
            send_load_order_to_deck,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
