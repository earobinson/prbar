use std::sync::{Arc, OnceLock};

use crate::db::Db;
use crate::models::LogLevel;

/// Global handle to the database used as the log sink. Set once during app
/// setup; logging before initialisation is a silent no-op so library/unit
/// code can call the helpers freely.
static LOGGER: OnceLock<Arc<Db>> = OnceLock::new();

/// Wire the logger to the application database. Subsequent `log` calls persist
/// entries (subject to the user's configured minimum level).
pub fn init(db: Arc<Db>) {
    let _ = LOGGER.set(db);
}

/// Whether an entry at `level` should be stored given a `minimum` threshold.
/// Levels are ordered Debug < Info < Warning < Error, so `Debug` minimum keeps
/// everything while `Error` minimum keeps only errors.
pub fn passes_filter(level: LogLevel, minimum: LogLevel) -> bool {
    level >= minimum
}

/// Persist a log line if the logger is initialised and the level meets the
/// user's configured threshold. Never panics or surfaces errors: logging must
/// not be able to break application flow.
pub fn log(level: LogLevel, message: impl Into<String>) {
    let Some(db) = LOGGER.get() else { return };
    let minimum = db
        .get_log_settings()
        .map(|s| s.level)
        .unwrap_or(LogLevel::Info);
    if passes_filter(level, minimum) {
        let _ = db.insert_log(level, &message.into());
    }
}

pub fn debug(message: impl Into<String>) {
    log(LogLevel::Debug, message);
}

pub fn info(message: impl Into<String>) {
    log(LogLevel::Info, message);
}

pub fn warning(message: impl Into<String>) {
    log(LogLevel::Warning, message);
}

pub fn error(message: impl Into<String>) {
    log(LogLevel::Error, message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_keeps_at_or_above_minimum() {
        // Minimum = Info: debug dropped, info/warning/error kept.
        assert!(!passes_filter(LogLevel::Debug, LogLevel::Info));
        assert!(passes_filter(LogLevel::Info, LogLevel::Info));
        assert!(passes_filter(LogLevel::Warning, LogLevel::Info));
        assert!(passes_filter(LogLevel::Error, LogLevel::Info));
    }

    #[test]
    fn filter_debug_minimum_keeps_everything() {
        for level in [
            LogLevel::Debug,
            LogLevel::Info,
            LogLevel::Warning,
            LogLevel::Error,
        ] {
            assert!(passes_filter(level, LogLevel::Debug));
        }
    }

    #[test]
    fn filter_error_minimum_keeps_only_errors() {
        assert!(!passes_filter(LogLevel::Debug, LogLevel::Error));
        assert!(!passes_filter(LogLevel::Info, LogLevel::Error));
        assert!(!passes_filter(LogLevel::Warning, LogLevel::Error));
        assert!(passes_filter(LogLevel::Error, LogLevel::Error));
    }
}
