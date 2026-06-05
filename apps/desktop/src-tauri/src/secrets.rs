use keyring::Entry;

use crate::db::Db;
use crate::models::TokenStorage;

const SERVICE: &str = "com.prbar.app";

/// Error type spanning both token backends so callers get a single result
/// regardless of where the token lives.
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error(transparent)]
    Keychain(#[from] keyring::Error),
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error("No matching entry found in secure storage")]
    NotFound,
}

/// Build the keyring entry for an account's token. Tokens are stored in the OS
/// credential store (macOS Keychain, Windows Credential Manager, Linux Secret
/// Service) when the keychain backend is selected.
fn entry(account_id: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, account_id)
}

/// Store (or replace) a token using the currently selected backend. Tokens are
/// trimmed defensively so a pasted token's trailing whitespace/newline is never
/// persisted; an untrimmed token yields a malformed Authorization header and
/// GitHub reports a valid token as invalid.
pub fn store_token(db: &Db, account_id: &str, token: &str) -> Result<(), SecretError> {
    store_in(db.get_dev_settings()?.token_storage, db, account_id, token)
}

/// Read a token from the currently selected backend.
pub fn get_token(db: &Db, account_id: &str) -> Result<String, SecretError> {
    read_from(db.get_dev_settings()?.token_storage, db, account_id)
}

/// Delete a token from the currently selected backend.
pub fn delete_token(db: &Db, account_id: &str) -> Result<(), SecretError> {
    delete_from(db.get_dev_settings()?.token_storage, db, account_id)
}

/// Move every account's token from one backend to another, then remove it from
/// the source. Accounts without a token in the source backend are skipped so a
/// partial setup never aborts the switch. Used when the developer toggles where
/// tokens are stored.
pub fn migrate(
    db: &Db,
    from: TokenStorage,
    to: TokenStorage,
    account_ids: &[String],
) -> Result<(), SecretError> {
    if from == to {
        return Ok(());
    }
    for account_id in account_ids {
        let token = match read_from(from, db, account_id) {
            Ok(token) => token,
            // Nothing stored for this account in the old backend: skip it.
            Err(SecretError::NotFound) => continue,
            Err(SecretError::Keychain(keyring::Error::NoEntry)) => continue,
            Err(e) => return Err(e),
        };
        store_in(to, db, account_id, &token)?;
        let _ = delete_from(from, db, account_id);
    }
    Ok(())
}

fn store_in(
    backend: TokenStorage,
    db: &Db,
    account_id: &str,
    token: &str,
) -> Result<(), SecretError> {
    let trimmed = token.trim();
    match backend {
        TokenStorage::Keychain => {
            entry(account_id)?.set_password(trimmed)?;
        }
        TokenStorage::Database => {
            db.store_db_token(account_id, trimmed)?;
        }
    }
    Ok(())
}

fn read_from(
    backend: TokenStorage,
    db: &Db,
    account_id: &str,
) -> Result<String, SecretError> {
    match backend {
        TokenStorage::Keychain => Ok(entry(account_id)?.get_password()?),
        TokenStorage::Database => {
            db.get_db_token(account_id)?.ok_or(SecretError::NotFound)
        }
    }
}

fn delete_from(
    backend: TokenStorage,
    db: &Db,
    account_id: &str,
) -> Result<(), SecretError> {
    match backend {
        TokenStorage::Keychain => match entry(account_id)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        },
        TokenStorage::Database => {
            db.delete_db_token(account_id)?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DevSettings;

    #[test]
    fn database_backend_round_trips_through_sqlite() {
        let db = Db::open_in_memory().unwrap();
        db.set_dev_settings(&DevSettings {
            token_storage: TokenStorage::Database,
        })
        .unwrap();

        store_token(&db, "a1", "  tok-123\n").unwrap();
        // Stored trimmed.
        assert_eq!(get_token(&db, "a1").unwrap(), "tok-123");
        // Encrypted at rest: the raw cell is not the plaintext token.
        let raw = db.raw_db_token("a1").unwrap().unwrap();
        assert!(!raw.contains("tok-123"));

        delete_token(&db, "a1").unwrap();
        let err = get_token(&db, "a1").unwrap_err();
        assert!(matches!(err, SecretError::NotFound));
    }

    #[test]
    fn missing_database_token_reports_not_found() {
        let db = Db::open_in_memory().unwrap();
        db.set_dev_settings(&DevSettings {
            token_storage: TokenStorage::Database,
        })
        .unwrap();
        assert!(matches!(
            get_token(&db, "nope").unwrap_err(),
            SecretError::NotFound
        ));
    }

    #[test]
    fn same_backend_migration_is_a_noop() {
        let db = Db::open_in_memory().unwrap();
        db.store_db_token("a1", "from-db").unwrap();
        migrate(
            &db,
            TokenStorage::Database,
            TokenStorage::Database,
            &["a1".to_string()],
        )
        .unwrap();
        assert_eq!(db.get_db_token("a1").unwrap().as_deref(), Some("from-db"));
    }

    #[test]
    fn migrate_skips_accounts_without_a_source_token() {
        let db = Db::open_in_memory().unwrap();
        // No token stored for "ghost" in the database source: must not error.
        migrate(
            &db,
            TokenStorage::Database,
            TokenStorage::Keychain,
            &["ghost".to_string()],
        )
        .unwrap();
        assert!(db.get_db_token("ghost").unwrap().is_none());
    }
}
