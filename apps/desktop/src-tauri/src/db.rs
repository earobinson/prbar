use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::crypto::TokenKey;
use crate::models::{
    CachedMatch, DevSettings, GitHubAccount, LogEntry, LogLevel, LogSettings, Match, Query,
    TokenStorage,
};

/// Thread-safe SQLite store. Account metadata, queries and cached match
/// identities live here. Tokens are only stored here when the developer setting
/// selects the database backend, and then only AES-256-GCM encrypted with a key
/// held outside the database (see [`crate::crypto`]).
pub struct Db {
    conn: Mutex<Connection>,
    token_key: TokenKey,
}

impl Db {
    fn conn_guard(&self) -> std::sync::MutexGuard<'_, Connection> {
        match self.conn.lock() {
            Ok(guard) => guard,
            // If another thread panicked while holding the DB mutex, continue
            // with the inner connection instead of crashing the whole app.
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let token_key = TokenKey::load_or_create(path)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let db = Db {
            conn: Mutex::new(conn),
            token_key,
        };
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let token_key = TokenKey::random()
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let db = Db {
            conn: Mutex::new(conn),
            token_key,
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              github_username TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS queries (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              name TEXT NOT NULL,
              search_query TEXT NOT NULL,
              enabled INTEGER NOT NULL,
              show_in_menu INTEGER NOT NULL,
              desktop_notifications INTEGER NOT NULL,
              notify_on_new_matches INTEGER NOT NULL,
              notify_on_updates INTEGER NOT NULL,
              poll_interval_seconds INTEGER NOT NULL
            );

            -- A query can target many accounts; this join table is the source
            -- of truth. The legacy queries.account_id column is retained only
            -- to satisfy its NOT NULL constraint on pre-existing databases and
            -- mirrors the first targeted account.
            CREATE TABLE IF NOT EXISTS query_accounts (
              query_id TEXT NOT NULL,
              account_id TEXT NOT NULL,
              PRIMARY KEY (query_id, account_id)
            );

            CREATE TABLE IF NOT EXISTS cached_matches (
              query_id TEXT NOT NULL,
              pull_request_id INTEGER NOT NULL,
              repository TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL,
              PRIMARY KEY(query_id, url)
            );

            CREATE TABLE IF NOT EXISTS logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              level TEXT NOT NULL,
              message TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);

            CREATE TABLE IF NOT EXISTS log_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              level TEXT NOT NULL,
              retention_days INTEGER NOT NULL
            );

            INSERT OR IGNORE INTO log_settings (id, level, retention_days)
              VALUES (1, 'info', 3);

            CREATE TABLE IF NOT EXISTS tokens (
              account_id TEXT PRIMARY KEY,
              token TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dev_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              token_storage TEXT NOT NULL
            );

            INSERT OR IGNORE INTO dev_settings (id, token_storage)
              VALUES (1, 'keychain');
            ",
        )?;

        // Pre-existing databases created cached_matches with a (query_id,
        // pull_request_id) primary key, which collides when one query spans
        // repositories/accounts that reuse PR numbers. cached_matches is a
        // disposable cache, so rebuild it with the URL-based key when an old
        // schema is detected (the next poll repopulates it).
        let pk_cols: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT name FROM pragma_table_info('cached_matches')
                 WHERE pk > 0 ORDER BY pk",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        if pk_cols != ["query_id", "url"] {
            conn.execute_batch(
                "DROP TABLE IF EXISTS cached_matches;
                 CREATE TABLE cached_matches (
                   query_id TEXT NOT NULL,
                   pull_request_id INTEGER NOT NULL,
                   repository TEXT NOT NULL DEFAULT '',
                   title TEXT NOT NULL DEFAULT '',
                   url TEXT NOT NULL DEFAULT '',
                   updated_at TEXT NOT NULL,
                   PRIMARY KEY(query_id, url)
                 );",
            )?;
        }

        // One-time migration of single-account queries into query_accounts.
        // Guarded by user_version so it never re-adds an account that was later
        // removed through the UI.
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version < 1 {
            conn.execute(
                "INSERT OR IGNORE INTO query_accounts (query_id, account_id)
                 SELECT id, account_id FROM queries WHERE account_id <> ''",
                [],
            )?;
            conn.execute_batch("PRAGMA user_version = 1;")?;
        }

        Ok(())
    }

    // Accounts ---------------------------------------------------------------

    pub fn insert_account(&self, account: &GitHubAccount) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO accounts (id, name, github_username) VALUES (?1, ?2, ?3)",
            params![account.id, account.name, account.github_username],
        )?;
        Ok(())
    }

    /// Update an account's display name and GitHub username.
    pub fn update_account(
        &self,
        id: &str,
        name: &str,
        github_username: &str,
    ) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "UPDATE accounts SET name = ?2, github_username = ?3 WHERE id = ?1",
            params![id, name, github_username],
        )?;
        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> rusqlite::Result<()> {
        let mut conn = self.conn_guard();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        tx.execute("DELETE FROM tokens WHERE account_id = ?1", params![id])?;

        // Find the queries that referenced this account before detaching it.
        let affected: Vec<String> = {
            let mut stmt =
                tx.prepare("SELECT query_id FROM query_accounts WHERE account_id = ?1")?;
            let rows = stmt.query_map(params![id], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        tx.execute(
            "DELETE FROM query_accounts WHERE account_id = ?1",
            params![id],
        )?;

        // A query left with no accounts can no longer run; remove it and its
        // cached matches. Only queries orphaned by *this* deletion are touched.
        for query_id in affected {
            let remaining: i64 = tx.query_row(
                "SELECT COUNT(*) FROM query_accounts WHERE query_id = ?1",
                params![query_id],
                |row| row.get(0),
            )?;
            if remaining == 0 {
                tx.execute(
                    "DELETE FROM cached_matches WHERE query_id = ?1",
                    params![query_id],
                )?;
                tx.execute("DELETE FROM queries WHERE id = ?1", params![query_id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn list_accounts(&self) -> rusqlite::Result<Vec<GitHubAccount>> {
        let conn = self.conn_guard();
        let mut stmt =
            conn.prepare("SELECT id, name, github_username FROM accounts ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(GitHubAccount {
                id: row.get(0)?,
                name: row.get(1)?,
                github_username: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_account(&self, id: &str) -> rusqlite::Result<Option<GitHubAccount>> {
        let conn = self.conn_guard();
        let mut stmt = conn
            .prepare("SELECT id, name, github_username FROM accounts WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(GitHubAccount {
                id: row.get(0)?,
                name: row.get(1)?,
                github_username: row.get(2)?,
            })
        })?;
        match rows.next() {
            Some(account) => Ok(Some(account?)),
            None => Ok(None),
        }
    }

    // Queries ----------------------------------------------------------------

    pub fn upsert_query(&self, query: &Query) -> rusqlite::Result<()> {
        let mut conn = self.conn_guard();
        let tx = conn.transaction()?;
        // The legacy account_id column only exists to satisfy NOT NULL on old
        // databases; mirror the first targeted account (or empty).
        let legacy_account = query.account_ids.first().cloned().unwrap_or_default();
        tx.execute(
            "INSERT INTO queries (
                id, account_id, name, search_query, enabled, show_in_menu,
                desktop_notifications, notify_on_new_matches, notify_on_updates,
                poll_interval_seconds
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id,
                name = excluded.name,
                search_query = excluded.search_query,
                enabled = excluded.enabled,
                show_in_menu = excluded.show_in_menu,
                desktop_notifications = excluded.desktop_notifications,
                notify_on_new_matches = excluded.notify_on_new_matches,
                notify_on_updates = excluded.notify_on_updates,
                poll_interval_seconds = excluded.poll_interval_seconds",
            params![
                query.id,
                legacy_account,
                query.name,
                query.search_query,
                query.enabled as i64,
                query.show_in_menu as i64,
                query.desktop_notifications as i64,
                query.notify_on_new_matches as i64,
                query.notify_on_updates as i64,
                query.poll_interval_seconds,
            ],
        )?;
        // Replace the account associations with the supplied set.
        tx.execute(
            "DELETE FROM query_accounts WHERE query_id = ?1",
            params![query.id],
        )?;
        for account_id in &query.account_ids {
            tx.execute(
                "INSERT OR IGNORE INTO query_accounts (query_id, account_id)
                 VALUES (?1, ?2)",
                params![query.id, account_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete_query(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute("DELETE FROM queries WHERE id = ?1", params![id])?;
        conn.execute(
            "DELETE FROM query_accounts WHERE query_id = ?1",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM cached_matches WHERE query_id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn list_queries(&self) -> rusqlite::Result<Vec<Query>> {
        let conn = self.conn_guard();

        // Load account associations once, grouped by query (preserving insert
        // order so the primary/first account stays first).
        let mut account_ids: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = conn.prepare(
                "SELECT query_id, account_id FROM query_accounts ORDER BY rowid",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            for row in rows {
                let (query_id, account_id) = row?;
                account_ids.entry(query_id).or_default().push(account_id);
            }
        }

        let mut stmt = conn.prepare(
            "SELECT id, account_id, name, search_query, enabled, show_in_menu,
                    desktop_notifications, notify_on_new_matches,
                    notify_on_updates, poll_interval_seconds
             FROM queries ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let legacy_account: String = row.get(1)?;
            let ids = account_ids.get(&id).cloned().unwrap_or_else(|| {
                if legacy_account.is_empty() {
                    Vec::new()
                } else {
                    vec![legacy_account]
                }
            });
            Ok(Query {
                id,
                account_ids: ids,
                name: row.get(2)?,
                search_query: row.get(3)?,
                enabled: row.get::<_, i64>(4)? != 0,
                show_in_menu: row.get::<_, i64>(5)? != 0,
                desktop_notifications: row.get::<_, i64>(6)? != 0,
                notify_on_new_matches: row.get::<_, i64>(7)? != 0,
                notify_on_updates: row.get::<_, i64>(8)? != 0,
                poll_interval_seconds: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    // Cached matches ---------------------------------------------------------

    pub fn cached_matches(&self, query_id: &str) -> rusqlite::Result<Vec<CachedMatch>> {
        let conn = self.conn_guard();
        let mut stmt = conn.prepare(
            "SELECT url, updated_at FROM cached_matches WHERE query_id = ?1",
        )?;
        let rows = stmt.query_map(params![query_id], |row| {
            Ok(CachedMatch {
                url: row.get(0)?,
                updated_at: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    /// Replace the cached matches for a query with the supplied set.
    pub fn replace_matches(
        &self,
        query_id: &str,
        matches: &[Match],
    ) -> rusqlite::Result<()> {
        let mut conn = self.conn_guard();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM cached_matches WHERE query_id = ?1",
            params![query_id],
        )?;
        for m in matches {
            tx.execute(
                "INSERT OR REPLACE INTO cached_matches
                   (query_id, pull_request_id, repository, title, url, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    query_id,
                    m.pull_request_id,
                    m.repository,
                    m.title,
                    m.url,
                    m.updated_at
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// All cached matches for queries that are enabled and shown in menu.
    pub fn menu_matches(&self) -> rusqlite::Result<Vec<Match>> {
        let conn = self.conn_guard();
        let mut stmt = conn.prepare(
            "SELECT c.query_id, c.pull_request_id, c.repository, c.title, c.url,
                    c.updated_at
             FROM cached_matches c
             JOIN queries q ON q.id = c.query_id
             WHERE q.enabled = 1 AND q.show_in_menu = 1
             ORDER BY c.updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Match {
                query_id: row.get(0)?,
                pull_request_id: row.get(1)?,
                repository: row.get(2)?,
                title: row.get(3)?,
                url: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    // Logs -------------------------------------------------------------------

    /// Append a log line, timestamped with the current UTC time (via SQLite so
    /// no date crate is needed). Callers are expected to have already applied
    /// the level filter; this method always inserts.
    pub fn insert_log(&self, level: LogLevel, message: &str) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO logs (timestamp, level, message)
             VALUES (datetime('now'), ?1, ?2)",
            params![level.as_str(), message],
        )?;
        Ok(())
    }

    /// Most recent log lines first, capped at `limit`.
    pub fn list_logs(&self, limit: i64) -> rusqlite::Result<Vec<LogEntry>> {
        let conn = self.conn_guard();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, level, message
             FROM logs ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            let level: String = row.get(2)?;
            Ok(LogEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                level: LogLevel::parse(&level).unwrap_or(LogLevel::Info),
                message: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn clear_logs(&self) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute("DELETE FROM logs", [])?;
        Ok(())
    }

    /// Delete log lines older than `retention_days`. A non-positive retention
    /// clears all history.
    pub fn prune_logs(&self, retention_days: i64) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        if retention_days <= 0 {
            conn.execute("DELETE FROM logs", [])?;
            return Ok(());
        }
        let cutoff = format!("-{retention_days} days");
        conn.execute(
            "DELETE FROM logs WHERE timestamp < datetime('now', ?1)",
            params![cutoff],
        )?;
        Ok(())
    }

    pub fn get_log_settings(&self) -> rusqlite::Result<LogSettings> {
        let conn = self.conn_guard();
        let mut stmt = conn
            .prepare("SELECT level, retention_days FROM log_settings WHERE id = 1")?;
        let mut rows = stmt.query_map([], |row| {
            let level: String = row.get(0)?;
            Ok(LogSettings {
                level: LogLevel::parse(&level).unwrap_or(LogLevel::Info),
                retention_days: row.get(1)?,
            })
        })?;
        match rows.next() {
            Some(settings) => settings,
            None => Ok(LogSettings::default()),
        }
    }

    pub fn set_log_settings(&self, settings: &LogSettings) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO log_settings (id, level, retention_days)
             VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET
                level = excluded.level,
                retention_days = excluded.retention_days",
            params![settings.level.as_str(), settings.retention_days],
        )?;
        Ok(())
    }

    /// Insert a log line with an explicit timestamp. Test-only helper used to
    /// exercise retention pruning without waiting for real time to pass.
    #[cfg(test)]
    pub fn insert_log_at(
        &self,
        timestamp: &str,
        level: LogLevel,
        message: &str,
    ) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO logs (timestamp, level, message) VALUES (?1, ?2, ?3)",
            params![timestamp, level.as_str(), message],
        )?;
        Ok(())
    }

    // Token storage (database backend) ---------------------------------------

    /// Store an AES-256-GCM-encrypted token row in SQLite. Only used when the
    /// developer setting selects the database backend; the keychain backend
    /// never touches this table. The plaintext token never hits disk.
    pub fn store_db_token(&self, account_id: &str, token: &str) -> rusqlite::Result<()> {
        let encrypted = self
            .token_key
            .encrypt(token)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO tokens (account_id, token) VALUES (?1, ?2)
             ON CONFLICT(account_id) DO UPDATE SET token = excluded.token",
            params![account_id, encrypted],
        )?;
        Ok(())
    }

    /// Read and decrypt a token from SQLite. `Ok(None)` means no row exists.
    pub fn get_db_token(&self, account_id: &str) -> rusqlite::Result<Option<String>> {
        let encrypted: Option<String> = {
            let conn = self.conn_guard();
            let mut stmt =
                conn.prepare("SELECT token FROM tokens WHERE account_id = ?1")?;
            let mut rows =
                stmt.query_map(params![account_id], |row| row.get::<_, String>(0))?;
            match rows.next() {
                Some(token) => Some(token?),
                None => None,
            }
        };
        match encrypted {
            Some(blob) => {
                let plaintext = self
                    .token_key
                    .decrypt(&blob)
                    .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    ))?;
                Ok(Some(plaintext))
            }
            None => Ok(None),
        }
    }

    pub fn delete_db_token(&self, account_id: &str) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "DELETE FROM tokens WHERE account_id = ?1",
            params![account_id],
        )?;
        Ok(())
    }

    /// Read the raw (still-encrypted) token cell. Test-only helper used to prove
    /// the value persisted to disk is ciphertext, not plaintext.
    #[cfg(test)]
    pub fn raw_db_token(&self, account_id: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn_guard();
        let mut stmt =
            conn.prepare("SELECT token FROM tokens WHERE account_id = ?1")?;
        let mut rows =
            stmt.query_map(params![account_id], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(token) => Ok(Some(token?)),
            None => Ok(None),
        }
    }

    // Developer settings -----------------------------------------------------

    pub fn get_dev_settings(&self) -> rusqlite::Result<DevSettings> {
        let conn = self.conn_guard();
        let mut stmt =
            conn.prepare("SELECT token_storage FROM dev_settings WHERE id = 1")?;
        let mut rows = stmt.query_map([], |row| {
            let storage: String = row.get(0)?;
            Ok(DevSettings {
                token_storage: TokenStorage::parse(&storage)
                    .unwrap_or(TokenStorage::Keychain),
            })
        })?;
        match rows.next() {
            Some(settings) => settings,
            None => Ok(DevSettings::default()),
        }
    }

    pub fn set_dev_settings(&self, settings: &DevSettings) -> rusqlite::Result<()> {
        let conn = self.conn_guard();
        conn.execute(
            "INSERT INTO dev_settings (id, token_storage) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET token_storage = excluded.token_storage",
            params![settings.token_storage.as_str()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        DevSettings, GitHubAccount, LogLevel, LogSettings, Match, Query, TokenStorage,
    };

    fn sample_query(id: &str, account_ids: &[&str]) -> Query {
        Query {
            id: id.to_string(),
            account_ids: account_ids.iter().map(|s| s.to_string()).collect(),
            name: format!("Query {id}"),
            search_query: "is:pr state:open".to_string(),
            enabled: true,
            poll_interval_seconds: 60,
            show_in_menu: true,
            desktop_notifications: true,
            notify_on_new_matches: true,
            notify_on_updates: false,
        }
    }

    fn sample_match(query_id: &str, pr: i64, updated: &str) -> Match {
        Match {
            query_id: query_id.to_string(),
            pull_request_id: pr,
            repository: "org/repo".to_string(),
            title: format!("PR {pr}"),
            url: format!("https://example.com/{pr}"),
            updated_at: updated.to_string(),
        }
    }

    #[test]
    fn accounts_crud() {
        let db = Db::open_in_memory().unwrap();
        let account = GitHubAccount {
            id: "a1".into(),
            name: "Work".into(),
            github_username: "octocat".into(),
        };
        db.insert_account(&account).unwrap();
        assert_eq!(db.list_accounts().unwrap().len(), 1);
        assert!(db.get_account("a1").unwrap().is_some());

        db.update_account("a1", "Work GitHub", "octocat-new").unwrap();
        let updated = db.get_account("a1").unwrap().unwrap();
        assert_eq!(updated.name, "Work GitHub");
        assert_eq!(updated.github_username, "octocat-new");

        db.delete_account("a1").unwrap();
        assert!(db.get_account("a1").unwrap().is_none());
    }

    #[test]
    fn deleting_account_removes_its_queries() {
        let db = Db::open_in_memory().unwrap();
        db.insert_account(&GitHubAccount {
            id: "a1".into(),
            name: "Work".into(),
            github_username: "octocat".into(),
        })
        .unwrap();
        db.upsert_query(&sample_query("q1", &["a1"])).unwrap();
        db.delete_account("a1").unwrap();
        assert!(db.list_queries().unwrap().is_empty());
    }

    #[test]
    fn deleting_one_account_keeps_multi_account_query() {
        let db = Db::open_in_memory().unwrap();
        for id in ["a1", "a2"] {
            db.insert_account(&GitHubAccount {
                id: id.into(),
                name: id.into(),
                github_username: id.into(),
            })
            .unwrap();
        }
        db.upsert_query(&sample_query("q1", &["a1", "a2"])).unwrap();

        db.delete_account("a1").unwrap();
        let stored = db.list_queries().unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].account_ids, vec!["a2".to_string()]);

        db.delete_account("a2").unwrap();
        assert!(db.list_queries().unwrap().is_empty());
    }

    #[test]
    fn queries_upsert_and_delete() {
        let db = Db::open_in_memory().unwrap();
        let mut q = sample_query("q1", &["a1", "a2"]);
        db.upsert_query(&q).unwrap();
        q.name = "Renamed".into();
        q.enabled = false;
        q.account_ids = vec!["a2".into()];
        db.upsert_query(&q).unwrap();

        let stored = db.list_queries().unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].name, "Renamed");
        assert!(!stored[0].enabled);
        assert_eq!(stored[0].account_ids, vec!["a2".to_string()]);

        db.delete_query("q1").unwrap();
        assert!(db.list_queries().unwrap().is_empty());
    }

    #[test]
    fn cached_matches_replace_and_read() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_query(&sample_query("q1", &["a1"])).unwrap();
        db.replace_matches(
            "q1",
            &[
                sample_match("q1", 1, "t1"),
                sample_match("q1", 2, "t1"),
            ],
        )
        .unwrap();
        assert_eq!(db.cached_matches("q1").unwrap().len(), 2);

        db.replace_matches("q1", &[sample_match("q1", 1, "t2")])
            .unwrap();
        let cached = db.cached_matches("q1").unwrap();
        assert_eq!(cached.len(), 1);
        assert_eq!(cached[0].updated_at, "t2");
    }

    #[test]
    fn cached_matches_distinguish_same_pr_number_across_repos() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_query(&sample_query("q1", &["a1"])).unwrap();
        let mut a = sample_match("q1", 7, "t1");
        a.repository = "org/alpha".into();
        a.url = "https://example.com/org/alpha/7".into();
        let mut b = sample_match("q1", 7, "t1");
        b.repository = "org/beta".into();
        b.url = "https://example.com/org/beta/7".into();
        db.replace_matches("q1", &[a, b]).unwrap();
        // Same PR number, different repos -> two distinct cached rows.
        assert_eq!(db.cached_matches("q1").unwrap().len(), 2);
    }

    #[test]
    fn menu_matches_respects_visibility_flags() {
        let db = Db::open_in_memory().unwrap();

        let mut shown = sample_query("q1", &["a1"]);
        shown.show_in_menu = true;
        db.upsert_query(&shown).unwrap();
        db.replace_matches("q1", &[sample_match("q1", 1, "t1")])
            .unwrap();

        let mut hidden = sample_query("q2", &["a1"]);
        hidden.show_in_menu = false;
        db.upsert_query(&hidden).unwrap();
        db.replace_matches("q2", &[sample_match("q2", 2, "t1")])
            .unwrap();

        let menu = db.menu_matches().unwrap();
        assert_eq!(menu.len(), 1);
        assert_eq!(menu[0].pull_request_id, 1);
    }

    #[test]
    fn log_settings_default_then_update() {
        let db = Db::open_in_memory().unwrap();
        // Migration seeds the default row: info / 3 days.
        let settings = db.get_log_settings().unwrap();
        assert_eq!(settings.level, LogLevel::Info);
        assert_eq!(settings.retention_days, 3);

        db.set_log_settings(&LogSettings {
            level: LogLevel::Debug,
            retention_days: 7,
        })
        .unwrap();
        let updated = db.get_log_settings().unwrap();
        assert_eq!(updated.level, LogLevel::Debug);
        assert_eq!(updated.retention_days, 7);
    }

    #[test]
    fn logs_insert_list_and_clear() {
        let db = Db::open_in_memory().unwrap();
        db.insert_log(LogLevel::Info, "first").unwrap();
        db.insert_log(LogLevel::Error, "second").unwrap();

        let logs = db.list_logs(10).unwrap();
        assert_eq!(logs.len(), 2);
        // Most recent first.
        assert_eq!(logs[0].message, "second");
        assert_eq!(logs[0].level, LogLevel::Error);
        assert_eq!(logs[1].message, "first");

        db.clear_logs().unwrap();
        assert!(db.list_logs(10).unwrap().is_empty());
    }

    #[test]
    fn list_logs_respects_limit() {
        let db = Db::open_in_memory().unwrap();
        for i in 0..5 {
            db.insert_log(LogLevel::Info, &format!("m{i}")).unwrap();
        }
        assert_eq!(db.list_logs(2).unwrap().len(), 2);
    }

    #[test]
    fn prune_logs_removes_entries_older_than_retention() {
        let db = Db::open_in_memory().unwrap();
        // One clearly-old entry and one recent entry.
        db.insert_log_at("2000-01-01 00:00:00", LogLevel::Info, "ancient")
            .unwrap();
        db.insert_log(LogLevel::Info, "recent").unwrap();

        db.prune_logs(3).unwrap();

        let logs = db.list_logs(10).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].message, "recent");
    }

    #[test]
    fn prune_logs_with_zero_retention_clears_all() {
        let db = Db::open_in_memory().unwrap();
        db.insert_log(LogLevel::Error, "boom").unwrap();
        db.prune_logs(0).unwrap();
        assert!(db.list_logs(10).unwrap().is_empty());
    }

    #[test]
    fn dev_settings_default_then_update() {
        let db = Db::open_in_memory().unwrap();
        // Migration seeds the keychain default.
        assert_eq!(
            db.get_dev_settings().unwrap().token_storage,
            TokenStorage::Keychain
        );

        db.set_dev_settings(&DevSettings {
            token_storage: TokenStorage::Database,
        })
        .unwrap();
        assert_eq!(
            db.get_dev_settings().unwrap().token_storage,
            TokenStorage::Database
        );
    }

    #[test]
    fn db_tokens_store_get_update_and_delete() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_db_token("a1").unwrap().is_none());

        db.store_db_token("a1", "secret-1").unwrap();
        assert_eq!(db.get_db_token("a1").unwrap().as_deref(), Some("secret-1"));

        // The value persisted to disk must be ciphertext, never the plaintext.
        let raw = db.raw_db_token("a1").unwrap().unwrap();
        assert_ne!(raw, "secret-1");
        assert!(!raw.contains("secret-1"));

        // Upsert replaces the existing token.
        db.store_db_token("a1", "secret-2").unwrap();
        assert_eq!(db.get_db_token("a1").unwrap().as_deref(), Some("secret-2"));

        db.delete_db_token("a1").unwrap();
        assert!(db.get_db_token("a1").unwrap().is_none());
    }
}
