use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::models::{CachedMatch, GitHubAccount, Match, Query};

/// Thread-safe SQLite store. Tokens are NEVER stored here; only account
/// metadata, queries and cached match identities live in SQLite.
pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let db = Db {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Db {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
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

            CREATE TABLE IF NOT EXISTS cached_matches (
              query_id TEXT NOT NULL,
              pull_request_id INTEGER NOT NULL,
              repository TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL,
              PRIMARY KEY(query_id, pull_request_id)
            );
            ",
        )?;
        Ok(())
    }

    // Accounts ---------------------------------------------------------------

    pub fn insert_account(&self, account: &GitHubAccount) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO accounts (id, name, github_username) VALUES (?1, ?2, ?3)",
            params![account.id, account.name, account.github_username],
        )?;
        Ok(())
    }

    pub fn rename_account(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE accounts SET name = ?2 WHERE id = ?1",
            params![id, name],
        )?;
        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        conn.execute("DELETE FROM queries WHERE account_id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_accounts(&self) -> rusqlite::Result<Vec<GitHubAccount>> {
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
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
                query.account_id,
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
        Ok(())
    }

    pub fn delete_query(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM queries WHERE id = ?1", params![id])?;
        conn.execute(
            "DELETE FROM cached_matches WHERE query_id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn list_queries(&self) -> rusqlite::Result<Vec<Query>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, account_id, name, search_query, enabled, show_in_menu,
                    desktop_notifications, notify_on_new_matches,
                    notify_on_updates, poll_interval_seconds
             FROM queries ORDER BY name",
        )?;
        let rows = stmt.query_map([], Self::map_query)?;
        rows.collect()
    }

    fn map_query(row: &rusqlite::Row<'_>) -> rusqlite::Result<Query> {
        Ok(Query {
            id: row.get(0)?,
            account_id: row.get(1)?,
            name: row.get(2)?,
            search_query: row.get(3)?,
            enabled: row.get::<_, i64>(4)? != 0,
            show_in_menu: row.get::<_, i64>(5)? != 0,
            desktop_notifications: row.get::<_, i64>(6)? != 0,
            notify_on_new_matches: row.get::<_, i64>(7)? != 0,
            notify_on_updates: row.get::<_, i64>(8)? != 0,
            poll_interval_seconds: row.get(9)?,
        })
    }

    // Cached matches ---------------------------------------------------------

    pub fn cached_matches(&self, query_id: &str) -> rusqlite::Result<Vec<CachedMatch>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT pull_request_id, updated_at FROM cached_matches WHERE query_id = ?1",
        )?;
        let rows = stmt.query_map(params![query_id], |row| {
            Ok(CachedMatch {
                pull_request_id: row.get(0)?,
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
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM cached_matches WHERE query_id = ?1",
            params![query_id],
        )?;
        for m in matches {
            tx.execute(
                "INSERT INTO cached_matches
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
        let conn = self.conn.lock().unwrap();
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GitHubAccount, Match, Query};

    fn sample_query(id: &str, account_id: &str) -> Query {
        Query {
            id: id.to_string(),
            account_id: account_id.to_string(),
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

        db.rename_account("a1", "Work GitHub").unwrap();
        assert_eq!(db.get_account("a1").unwrap().unwrap().name, "Work GitHub");

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
        db.upsert_query(&sample_query("q1", "a1")).unwrap();
        db.delete_account("a1").unwrap();
        assert!(db.list_queries().unwrap().is_empty());
    }

    #[test]
    fn queries_upsert_and_delete() {
        let db = Db::open_in_memory().unwrap();
        let mut q = sample_query("q1", "a1");
        db.upsert_query(&q).unwrap();
        q.name = "Renamed".into();
        q.enabled = false;
        db.upsert_query(&q).unwrap();

        let stored = db.list_queries().unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].name, "Renamed");
        assert!(!stored[0].enabled);

        db.delete_query("q1").unwrap();
        assert!(db.list_queries().unwrap().is_empty());
    }

    #[test]
    fn cached_matches_replace_and_read() {
        let db = Db::open_in_memory().unwrap();
        db.upsert_query(&sample_query("q1", "a1")).unwrap();
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
    fn menu_matches_respects_visibility_flags() {
        let db = Db::open_in_memory().unwrap();

        let mut shown = sample_query("q1", "a1");
        shown.show_in_menu = true;
        db.upsert_query(&shown).unwrap();
        db.replace_matches("q1", &[sample_match("q1", 1, "t1")])
            .unwrap();

        let mut hidden = sample_query("q2", "a1");
        hidden.show_in_menu = false;
        db.upsert_query(&hidden).unwrap();
        db.replace_matches("q2", &[sample_match("q2", 2, "t1")])
            .unwrap();

        let menu = db.menu_matches().unwrap();
        assert_eq!(menu.len(), 1);
        assert_eq!(menu[0].pull_request_id, 1);
    }
}
