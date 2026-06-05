use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

use crate::db::Db;
use crate::AppState;

const TRAY_ID: &str = "prbar-tray";

/// Build the tray icon and its initial menu.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("default icon"))
        .icon_as_template(true)
        .tooltip("PRBar")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}

/// Rebuild the menu and refresh the indicator (count) on the tray.
pub fn update_indicator(app: &AppHandle, db: &Db) {
    let count = db.menu_matches().map(|m| m.len()).unwrap_or(0);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        // Title acts as the badge/indicator where supported.
        let _ = tray.set_title(Some(if count == 0 {
            String::new()
        } else {
            count.to_string()
        }));
        let _ = tray.set_tooltip(Some(format!("PRBar — {count} matching")));
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// Construct the tray menu: a list of matching pull requests followed by
/// the application actions (Refresh Now, Settings, Quit).
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;

    let matches = app
        .try_state::<AppState>()
        .and_then(|state| state.db.menu_matches().ok())
        .unwrap_or_default();

    let queries = app
        .try_state::<AppState>()
        .and_then(|state| state.db.list_queries().ok())
        .unwrap_or_default();

    for m in &matches {
        let label = queries
            .iter()
            .find(|q| q.id == m.query_id)
            .map(|q| format!("[{}] {}", q.name, m.title))
            .unwrap_or_else(|| m.title.clone());
        // Encode the URL in the menu item id so the click handler can open it.
        let item = MenuItem::with_id(
            app,
            format!("open::{}", m.url),
            label,
            true,
            None::<&str>,
        )?;
        menu.append(&item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let count_label = MenuItem::with_id(
        app,
        "count",
        format!("{} Matching Pull Requests", matches.len()),
        false,
        None::<&str>,
    )?;
    menu.append(&count_label)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    menu.append(&MenuItem::with_id(
        app,
        "refresh",
        "Refresh Now",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "settings",
        "Settings",
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;

    Ok(menu)
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();

    if let Some(url) = id.strip_prefix("open::") {
        let _ = app.opener().open_url(url.to_string(), None::<&str>);
        return;
    }

    match id {
        "refresh" => {
            if let Some(state) = app.try_state::<AppState>() {
                let app = app.clone();
                let db = state.db.clone();
                std::thread::spawn(move || crate::poller::poll_all(&app, &db));
            }
        }
        "settings" => {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
}
