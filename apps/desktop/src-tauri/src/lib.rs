mod commands;
mod crypto;
mod db;
mod engine;
mod github;
mod logging;
mod models;
mod poller;
mod secrets;
mod tray;

use std::sync::Arc;

use db::Db;
use tauri::Manager;

/// Shared application state available to all Tauri commands.
pub struct AppState {
    pub db: Arc<Db>,
}

/// Show or hide the macOS Dock icon. PRBar runs as an accessory (menu bar
/// only); the Dock icon is shown only while the settings window is open.
/// This is a no-op on other platforms.
pub fn set_dock_visible(app: &tauri::AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            // Closing the settings window should hide it, not quit the app.
            // PRBar only quits via the tray menu's "Quit" action.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    api.prevent_close();
                    let _ = window.hide();
                    // Drop the Dock icon again now that settings is closed.
                    set_dock_visible(window.app_handle(), false);
                }
            }
        })
        .setup(|app| {
            // PRBar lives in the menu bar / tray. Hide the Dock icon by
            // default; it is shown only while the settings window is open.
            set_dock_visible(app.handle(), false);

            let dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db = Arc::new(Db::open(&dir.join("prbar.sqlite3")).expect("open db"));

            // Wire logging to the database, then enforce the retention window
            // and prune anything older before the app gets going.
            logging::init(db.clone());
            let retention = db
                .get_log_settings()
                .map(|s| s.retention_days)
                .unwrap_or(3);
            let _ = db.prune_logs(retention);
            logging::info("PRBar started");

            app.manage(AppState { db: db.clone() });

            tray::build_tray(app.handle())?;
            poller::spawn(app.handle().clone(), db);

            // Hide the settings window on launch: PRBar runs from the tray.
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.hide();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_accounts,
            commands::add_account,
            commands::rename_account,
            commands::set_account_token,
            commands::remove_account,
            commands::validate_account,
            commands::list_queries,
            commands::save_query,
            commands::delete_query,
            commands::list_matches,
            commands::refresh_now,
            commands::open_url,
            commands::list_logs,
            commands::clear_logs,
            commands::get_log_settings,
            commands::set_log_settings,
            commands::get_dev_settings,
            commands::set_dev_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PRBar");
}
