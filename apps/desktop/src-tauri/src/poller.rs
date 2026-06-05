use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::db::Db;
use crate::engine::{diff_matches, notifications_for, MatchDiff};
use crate::github::GitHubClient;
use crate::logging;
use crate::models::{Match, Query};
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
        let _ = poll_all(&app, &db);

        loop {
            std::thread::sleep(Duration::from_secs(1));
            let queries = match db.list_queries() {
                Ok(q) => q,
                Err(_) => continue,
            };

            // Enforce the log retention window once per wake so old lines are
            // pruned even while the app stays open for days.
            if let Ok(settings) = db.get_log_settings() {
                let _ = db.prune_logs(settings.retention_days);
            }

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
                    if let Err(err) = poll_query(&app, &db, query) {
                        logging::error(err);
                    }
                    tray::update_indicator(&app);
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
/// Returns a human-readable error per failing query so the caller can show
/// the user *why* nothing appeared instead of silently swallowing failures.
pub fn poll_all(app: &AppHandle, db: &Db) -> Vec<String> {
    let queries = match db.list_queries() {
        Ok(q) => q,
        Err(e) => return vec![format!("could not read queries: {e}")],
    };

    let mut errors = Vec::new();
    for query in queries.iter().filter(|q| q.enabled) {
        if let Err(err) = poll_query(app, db, query) {
            logging::error(err.clone());
            errors.push(err);
        }
    }
    tray::update_indicator(app);
    errors
}

fn poll_query(app: &AppHandle, db: &Db, query: &Query) -> Result<(), String> {
    let (matches, diff) = sync_query(db, query)?;
    logging::debug(format!(
        "{}: fetched {} matching pull request(s)",
        query.name,
        matches.len()
    ));

    for notification in notifications_for(query, &diff) {
        let _ = app
            .notification()
            .builder()
            .title(notification.title)
            .body(notification.body)
            .show();
    }

    Ok(())
}

/// Fetch a query's matches, refresh the cache, and return the diff. Kept free
/// of any `AppHandle`/tray/notification concerns so it is unit-testable and so
/// every failure mode yields an actionable message instead of a silent no-op.
fn sync_query(db: &Db, query: &Query) -> Result<(Vec<Match>, MatchDiff), String> {
    let token = secrets::get_token(db, &query.account_id).map_err(|e| {
        format!(
            "{}: no token found ({e}). Open Settings → Accounts and use \"Update Token\".",
            query.name
        )
    })?;

    let client = GitHubClient::new(token);
    let matches = client
        .search_pull_requests(&query.id, &query.search_query)
        .map_err(|e| format!("{}: GitHub search failed: {e}", query.name))?;

    let previous = db.cached_matches(&query.id).unwrap_or_default();
    let diff = diff_matches(&previous, &matches);

    db.replace_matches(&query.id, &matches)
        .map_err(|e| format!("{}: failed to store matches: {e}", query.name))?;

    Ok((matches, diff))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Query;

    fn enabled_query(account_id: &str) -> Query {
        Query {
            id: "q-test".to_string(),
            account_id: account_id.to_string(),
            name: "Review Requests".to_string(),
            search_query: "is:pr review-requested:@me".to_string(),
            enabled: true,
            poll_interval_seconds: 60,
            show_in_menu: true,
            desktop_notifications: true,
            notify_on_new_matches: true,
            notify_on_updates: false,
        }
    }

    #[test]
    fn sync_query_surfaces_missing_token_with_actionable_message() {
        let db = Db::open_in_memory().unwrap();
        // Account id that has no keychain entry: token retrieval must fail and
        // the failure must be surfaced (not swallowed) with a fix hint.
        let query = enabled_query("nonexistent-account-id-prbar-test");

        let err = sync_query(&db, &query).expect_err("missing token should error");

        assert!(err.contains("Review Requests"), "names the query: {err}");
        assert!(err.contains("Update Token"), "tells the user how to fix: {err}");
    }
}
