use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

use std::panic::{catch_unwind, AssertUnwindSafe};

use crate::AppState;

const TRAY_ID: &str = "prbar-tray";

/// Monochrome pull-request glyph used as the menu-bar icon. It is a macOS
/// template image (opaque shape on a transparent canvas) so the system tints
/// it to match the menu bar instead of showing the default filled square.
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray@2x.png");

/// Build the tray icon and its initial menu.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let icon = Image::from_bytes(TRAY_ICON)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("PRBar")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}

/// Rebuild the menu and refresh the indicator (count) on the tray.
///
/// The tray icon and menu are backed by AppKit (`NSStatusItem`/`NSMenu`) on
/// macOS, which may only be mutated on the main thread. Polling runs on
/// background threads, so the actual UI update is marshalled back onto the
/// main thread; otherwise the fetched matches are stored but never rendered
/// (the symptom: "I click refresh and nothing shows up").
pub fn update_indicator(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };

        let matches = state.db.menu_matches().ok().unwrap_or_default();
        let queries = state.db.list_queries().ok().unwrap_or_default();
        let count = matches.len();

        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            // Title/tooltip can be updated freely — they don't dismiss an open
            // menu. Always refresh them so the badge stays accurate.
            let _ = tray.set_title(Some(if count == 0 {
                String::new()
            } else {
                count.to_string()
            }));
            let _ = tray.set_tooltip(Some(format!("PRBar — {count} matching")));

            // Rebuilding the menu replaces the underlying NSMenu, which closes
            // it if the user has it open — the "flickers away on refresh" bug.
            // Only rebuild when the visible content actually changed.
            let signature = menu_signature(&matches, &queries);
            let mut current = match state.menu_signature.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            if current.as_deref() != Some(signature.as_str()) {
                if let Ok(menu) = build_menu(&app) {
                    let _ = tray.set_menu(Some(menu));
                }
                *current = Some(signature);
            }
        }
    });
}

/// A stable string describing exactly what the tray menu renders, so two polls
/// that produce identical menus compare equal and we can skip rebuilding (which
/// would dismiss an open menu). Includes the per-match label and the ordering.
fn menu_signature(matches: &[crate::models::Match], queries: &[crate::models::Query]) -> String {
    let mut signature = String::new();
    for m in matches {
        let name = queries
            .iter()
            .find(|q| q.id == m.query_id)
            .map(|q| q.name.as_str())
            .unwrap_or("");
        signature.push_str(name);
        signature.push('\u{1f}');
        signature.push_str(&m.title);
        signature.push('\u{1f}');
        signature.push_str(&m.url);
        signature.push('\u{1e}');
    }
    signature
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
    let _ = catch_unwind(AssertUnwindSafe(|| {
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
                    // Show the Dock icon while the settings window is visible.
                    crate::set_dock_visible(app, true);
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        }
    }));
}

#[cfg(test)]
mod tests {
    use super::menu_signature;
    use crate::models::{Match, Query};

    fn query(id: &str, name: &str) -> Query {
        Query {
            id: id.to_string(),
            account_ids: vec!["a1".to_string()],
            name: name.to_string(),
            search_query: "is:pr".to_string(),
            enabled: true,
            poll_interval_seconds: 60,
            show_in_menu: true,
            desktop_notifications: true,
            notify_on_new_matches: true,
            notify_on_updates: false,
        }
    }

    fn match_(query_id: &str, title: &str, url: &str, updated: &str) -> Match {
        Match {
            query_id: query_id.to_string(),
            pull_request_id: 1,
            repository: "org/repo".to_string(),
            title: title.to_string(),
            url: url.to_string(),
            updated_at: updated.to_string(),
        }
    }

    #[test]
    fn signature_is_stable_for_identical_content() {
        let queries = vec![query("q1", "Reviews")];
        let a = vec![match_("q1", "Fix bug", "https://x/1", "t1")];
        let b = vec![match_("q1", "Fix bug", "https://x/1", "t2")];
        // Same visible content (title/url/query) even though updated_at differs
        // -> same signature, so the menu is not rebuilt.
        assert_eq!(menu_signature(&a, &queries), menu_signature(&b, &queries));
    }

    #[test]
    fn signature_changes_when_matches_change() {
        let queries = vec![query("q1", "Reviews")];
        let a = vec![match_("q1", "Fix bug", "https://x/1", "t1")];
        let b = vec![match_("q1", "New PR", "https://x/2", "t1")];
        assert_ne!(menu_signature(&a, &queries), menu_signature(&b, &queries));
    }

    #[test]
    fn signature_reflects_query_name() {
        let a = vec![match_("q1", "Fix bug", "https://x/1", "t1")];
        let with_name = vec![query("q1", "Reviews")];
        let renamed = vec![query("q1", "Assigned")];
        assert_ne!(
            menu_signature(&a, &with_name),
            menu_signature(&a, &renamed)
        );
    }
}
