use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAccount {
    pub id: String,
    pub name: String,
    #[serde(rename = "githubUsername")]
    pub github_username: String,
}

/// Account payload supplied by the frontend when adding an account
/// (no id yet; the backend assigns one).
#[derive(Debug, Clone, Deserialize)]
pub struct NewAccount {
    pub name: String,
    #[serde(rename = "githubUsername")]
    pub github_username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Query {
    pub id: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    pub name: String,
    #[serde(rename = "searchQuery")]
    pub search_query: String,
    pub enabled: bool,
    #[serde(rename = "pollIntervalSeconds")]
    pub poll_interval_seconds: i64,
    #[serde(rename = "showInMenu")]
    pub show_in_menu: bool,
    #[serde(rename = "desktopNotifications")]
    pub desktop_notifications: bool,
    #[serde(rename = "notifyOnNewMatches")]
    pub notify_on_new_matches: bool,
    #[serde(rename = "notifyOnUpdates")]
    pub notify_on_updates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Match {
    #[serde(rename = "queryId")]
    pub query_id: String,
    #[serde(rename = "pullRequestId")]
    pub pull_request_id: i64,
    pub repository: String,
    pub title: String,
    pub url: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// A cached match row (identity + timestamp) used for diffing.
#[derive(Debug, Clone)]
pub struct CachedMatch {
    pub pull_request_id: i64,
    pub updated_at: String,
}
