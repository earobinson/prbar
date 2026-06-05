mod commands;
mod db;
mod engine;
mod github;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db = Arc::new(Db::open(&dir.join("prbar.sqlite3")).expect("open db"));

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
            commands::remove_account,
            commands::validate_account,
            commands::list_queries,
            commands::save_query,
            commands::delete_query,
            commands::list_matches,
            commands::refresh_now,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PRBar");
}
