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

/// Fetch a query's matches across all of its accounts, refresh the cache, and
/// return the diff. Kept free of any `AppHandle`/tray/notification concerns so
/// it is unit-testable and so every failure mode yields an actionable message
/// instead of a silent no-op.
///
/// Each account is fetched independently. A per-account failure is "soft": it is
/// recorded but does not abort the others, so one revoked token can't hide PRs
/// from the remaining accounts. A hard error is only returned when *every*
/// account failed (or the query targets no accounts), preserving the behaviour
/// of surfacing *why* nothing appeared.
fn sync_query(db: &Db, query: &Query) -> Result<(Vec<Match>, MatchDiff), String> {
    if query.account_ids.is_empty() {
        return Err(format!(
            "{}: no accounts selected. Open Settings → Queries and choose at least one account.",
            query.name
        ));
    }

    let mut aggregated: Vec<Match> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut errors: Vec<String> = Vec::new();
    let mut any_succeeded = false;

    for account_id in &query.account_ids {
        let token = match secrets::get_token(db, account_id) {
            Ok(token) => token,
            Err(e) => {
                errors.push(format!(
                    "{}: no token found for account ({e}). Open Settings → Accounts and use \"Update Token\".",
                    query.name
                ));
                continue;
            }
        };

        let client = GitHubClient::new(token);
        match client.search_pull_requests(&query.id, &query.search_query) {
            Ok(matches) => {
                any_succeeded = true;
                for m in matches {
                    // The same PR can be returned for multiple accounts; the URL
                    // uniquely identifies it, so dedupe on it.
                    if seen.insert(m.url.clone()) {
                        aggregated.push(m);
                    }
                }
            }
            Err(e) => {
                errors.push(format!("{}: GitHub search failed: {e}", query.name));
            }
        }
    }

    // Every account failed: surface the combined reason rather than caching an
    // empty result that would look like "no PRs".
    if !any_succeeded {
        return Err(errors.join("; "));
    }

    // Some accounts succeeded but others failed: keep going (we still have
    // partial results) but record the failures in the log.
    for err in &errors {
        logging::warning(err.clone());
    }

    let previous = db.cached_matches(&query.id).unwrap_or_default();
    let diff = diff_matches(&previous, &aggregated);

    db.replace_matches(&query.id, &aggregated)
        .map_err(|e| format!("{}: failed to store matches: {e}", query.name))?;

    Ok((aggregated, diff))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Query;

    fn enabled_query(account_id: &str) -> Query {
        Query {
            id: "q-test".to_string(),
            account_ids: vec![account_id.to_string()],
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

    #[test]
    fn sync_query_with_no_accounts_is_actionable() {
        let db = Db::open_in_memory().unwrap();
        let mut query = enabled_query("ignored");
        query.account_ids.clear();

        let err = sync_query(&db, &query).expect_err("no accounts should error");

        assert!(err.contains("Review Requests"), "names the query: {err}");
        assert!(
            err.contains("no accounts selected"),
            "explains the problem: {err}"
        );
    }
}
