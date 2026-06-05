use std::collections::{HashMap, HashSet};

use crate::models::{CachedMatch, Match, Query};

/// Classification of a poll's matches relative to the cache.
#[derive(Debug, Default)]
pub struct MatchDiff {
    pub added: Vec<Match>,
    pub updated: Vec<Match>,
    pub removed_ids: Vec<i64>,
}

/// Compare cached matches with the freshly fetched matches for a query.
pub fn diff_matches(previous: &[CachedMatch], current: &[Match]) -> MatchDiff {
    let prior: HashMap<i64, &CachedMatch> = previous
        .iter()
        .map(|m| (m.pull_request_id, m))
        .collect();

    let mut current_ids: HashSet<i64> = HashSet::new();
    let mut diff = MatchDiff::default();

    for m in current {
        current_ids.insert(m.pull_request_id);
        match prior.get(&m.pull_request_id) {
            None => diff.added.push(m.clone()),
            Some(prev) if prev.updated_at != m.updated_at => diff.updated.push(m.clone()),
            Some(_) => {}
        }
    }

    for m in previous {
        if !current_ids.contains(&m.pull_request_id) {
            diff.removed_ids.push(m.pull_request_id);
        }
    }

    diff
}

/// A desktop notification ready to be shown. Clicking opens `url`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub title: String,
    pub body: String,
    pub url: String,
}

fn body_for(m: &Match) -> String {
    format!("{}\n{}", m.title, m.repository)
}

/// Generate notifications for a query's diff, honouring the query's
/// per-query notification settings.
pub fn notifications_for(query: &Query, diff: &MatchDiff) -> Vec<Notification> {
    if !query.desktop_notifications {
        return Vec::new();
    }

    let mut out = Vec::new();

    if query.notify_on_new_matches {
        for m in &diff.added {
            out.push(Notification {
                title: query.name.clone(),
                body: body_for(m),
                url: m.url.clone(),
            });
        }
    }

    if query.notify_on_updates {
        for m in &diff.updated {
            out.push(Notification {
                title: query.name.clone(),
                body: body_for(m),
                url: m.url.clone(),
            });
        }
    }

    out
}

/// Count unique pull requests (repository + id) across many match sets to
/// drive the tray indicator when aggregating multiple queries.
#[allow(dead_code)]
pub fn aggregate_count<'a>(sets: impl IntoIterator<Item = &'a [Match]>) -> usize {
    let mut unique: HashSet<String> = HashSet::new();
    for set in sets {
        for m in set {
            unique.insert(format!("{}#{}", m.repository, m.pull_request_id));
        }
    }
    unique.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cached(id: i64, updated: &str) -> CachedMatch {
        CachedMatch {
            pull_request_id: id,
            updated_at: updated.to_string(),
        }
    }

    fn m(id: i64, updated: &str, repo: &str) -> Match {
        Match {
            query_id: "q1".into(),
            pull_request_id: id,
            repository: repo.into(),
            title: format!("PR {id}"),
            url: format!("https://example.com/{id}"),
            updated_at: updated.into(),
        }
    }

    fn query() -> Query {
        Query {
            id: "q1".into(),
            account_id: "a1".into(),
            name: "Review Requested".into(),
            search_query: "is:pr".into(),
            enabled: true,
            poll_interval_seconds: 60,
            show_in_menu: true,
            desktop_notifications: true,
            notify_on_new_matches: true,
            notify_on_updates: true,
        }
    }

    #[test]
    fn diff_classifies_added_updated_removed() {
        let previous = vec![cached(1, "t1"), cached(2, "t1"), cached(3, "t1")];
        let current = vec![
            m(1, "t1", "o/r"),
            m(2, "t2", "o/r"),
            m(4, "t1", "o/r"),
        ];
        let diff = diff_matches(&previous, &current);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].pull_request_id, 4);
        assert_eq!(diff.updated.len(), 1);
        assert_eq!(diff.updated[0].pull_request_id, 2);
        assert_eq!(diff.removed_ids, vec![3]);
    }

    #[test]
    fn notifications_respect_settings() {
        let diff = MatchDiff {
            added: vec![m(1, "t1", "o/r")],
            updated: vec![m(2, "t2", "o/r")],
            removed_ids: vec![],
        };

        let mut q = query();
        assert_eq!(notifications_for(&q, &diff).len(), 2);

        q.notify_on_updates = false;
        assert_eq!(notifications_for(&q, &diff).len(), 1);

        q.desktop_notifications = false;
        assert!(notifications_for(&q, &diff).is_empty());
    }

    #[test]
    fn notification_body_format() {
        let diff = MatchDiff {
            added: vec![m(1, "t1", "myorg/webapp")],
            updated: vec![],
            removed_ids: vec![],
        };
        let n = &notifications_for(&query(), &diff)[0];
        assert_eq!(n.title, "Review Requested");
        assert_eq!(n.body, "PR 1\nmyorg/webapp");
    }

    #[test]
    fn aggregate_counts_unique_prs() {
        let a = vec![m(1, "t", "o/a"), m(2, "t", "o/a")];
        let b = vec![m(2, "t", "o/a"), m(1, "t", "o/b")];
        let count = aggregate_count([a.as_slice(), b.as_slice()]);
        assert_eq!(count, 3);
    }
}
