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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            db::init_db()?;

            process_monitor.set_app_handle(app.handle().clone());
            process_monitor.start_polling();

            if let Ok(entry) = keyring::Entry::new("com.nexusdeck.app", "nexus_api_key") {
                if let Ok(key) = entry.get_password() {
                    nexus_client.set_api_key(Some(key));
                }
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
            analyze_archive,
            check_mod_conflicts,
            preview_mod_install,
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
            update_mod_safe,
            get_updated_mods_feed,
            endorse_mod,
            abstain_mod,
            get_user_endorsements,
            track_mod,
            list_tracked_mods,
            analyze_deck_profile,
            export_modlist,
            list_launch_configs,
            save_launch_config,
            delete_launch_config,
            get_recent_launch_configs,
            validate_launch,
            launch_game,
            get_game_running_state,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
