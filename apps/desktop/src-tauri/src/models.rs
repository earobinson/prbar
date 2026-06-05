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

/// Severity of a log entry. Variants are ordered from least to most severe so
/// that `Ord` can express "store everything at or above this level": with a
/// minimum of `Info`, `Debug` (lower) is dropped while `Info`/`Warning`/`Error`
/// (>= Info) are kept.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize,
)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            LogLevel::Debug => "debug",
            LogLevel::Info => "info",
            LogLevel::Warning => "warning",
            LogLevel::Error => "error",
        }
    }

    /// Parse a stored level string back into a `LogLevel`.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "debug" => Some(LogLevel::Debug),
            "info" => Some(LogLevel::Info),
            "warning" => Some(LogLevel::Warning),
            "error" => Some(LogLevel::Error),
            _ => None,
        }
    }
}

/// A single stored log line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: i64,
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

/// User-configurable logging behaviour: the minimum level to persist and how
/// many days of history to keep.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LogSettings {
    /// Minimum level to store. `Debug` keeps everything; `Error` keeps only
    /// errors.
    pub level: LogLevel,
    #[serde(rename = "retentionDays")]
    pub retention_days: i64,
}

impl Default for LogSettings {
    fn default() -> Self {
        LogSettings {
            level: LogLevel::Info,
            retention_days: 3,
        }
    }
}

/// Where account tokens are persisted. `Keychain` uses the OS credential store
/// (most secure, but can prompt for the login password). `Database` stores the
/// token in the app's SQLite file — convenient for development where repeated
/// keychain prompts are disruptive, at the cost of weaker at-rest protection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenStorage {
    Keychain,
    Database,
}

impl TokenStorage {
    pub fn as_str(self) -> &'static str {
        match self {
            TokenStorage::Keychain => "keychain",
            TokenStorage::Database => "database",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "keychain" => Some(TokenStorage::Keychain),
            "database" => Some(TokenStorage::Database),
            _ => None,
        }
    }
}

/// Developer-oriented settings.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DevSettings {
    #[serde(rename = "tokenStorage")]
    pub token_storage: TokenStorage,
}

impl Default for DevSettings {
    fn default() -> Self {
        DevSettings {
            token_storage: TokenStorage::Keychain,
        }
    }
}
