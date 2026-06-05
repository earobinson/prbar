use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db::Db;
use crate::engine::{diff_matches, notifications_for};
use crate::github::GitHubClient;
use crate::models::Query;
use crate::secrets;
use crate::tray;

/// Spawn the background polling loop on a dedicated thread. The loop wakes
/// roughly once per second but only polls a query when its own interval has
/// elapsed, keeping CPU near zero while idle.
pub fn spawn(app: AppHandle, db: Arc<Db>) {
    std::thread::spawn(move || {
        let mut last_polled: std::collections::HashMap<String, Instant> =
            std::collections::HashMap::new();

        // Initial poll on startup so the tray is populated immediately.
        poll_all(&app, &db);

        loop {
            std::thread::sleep(Duration::from_secs(1));
            let queries = match db.list_queries() {
                Ok(q) => q,
                Err(_) => continue,
            };

            let now = Instant::now();
            for query in queries.iter().filter(|q| q.enabled) {
                let interval = Duration::from_secs(clamp_interval(
                    query.poll_interval_seconds,
                ));
                let due = last_polled
                    .get(&query.id)
                    .map(|t| now.duration_since(*t) >= interval)
                    .unwrap_or(true);
                if due {
                    poll_query(&app, &db, query);
                    last_polled.insert(query.id.clone(), Instant::now());
                }
            }
        }
    });
}

fn clamp_interval(seconds: i64) -> u64 {
    seconds.clamp(30, 3600) as u64
}

/// Poll every enabled query once, immediately (used by "Refresh Now").
pub fn poll_all(app: &AppHandle, db: &Db) {
    let queries = match db.list_queries() {
        Ok(q) => q,
        Err(_) => return,
    };
    for query in queries.iter().filter(|q| q.enabled) {
        poll_query(app, db, query);
    }
    tray::update_indicator(app, db);
}

fn poll_query(app: &AppHandle, db: &Db, query: &Query) {
    let token = match secrets::get_token(&query.account_id) {
        Ok(token) => token,
        Err(_) => return,
    };

    let client = GitHubClient::new(token);
    let matches = match client.search_pull_requests(&query.id, &query.search_query) {
        Ok(matches) => matches,
        Err(_) => return,
    };

    let previous = db.cached_matches(&query.id).unwrap_or_default();
    let diff = diff_matches(&previous, &matches);

    for notification in notifications_for(query, &diff) {
        let _ = app
            .notification()
            .builder()
            .title(notification.title)
            .body(notification.body)
            .show();
    }

    let _ = db.replace_matches(&query.id, &matches);
    tray::update_indicator(app, db);
}
