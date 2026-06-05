use keyring::Entry;

const SERVICE: &str = "com.prbar.app";

/// Build the keyring entry for an account's token. Tokens are stored only
/// in the OS credential store (macOS Keychain, Windows Credential Manager,
/// Linux Secret Service) and never in SQLite.
fn entry(account_id: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, account_id)
}

pub fn store_token(account_id: &str, token: &str) -> keyring::Result<()> {
    // Trim defensively so a pasted token's trailing whitespace/newline is
    // never persisted; an untrimmed token yields a malformed Authorization
    // header and GitHub reports a valid token as invalid.
    entry(account_id)?.set_password(token.trim())
}

pub fn get_token(account_id: &str) -> keyring::Result<String> {
    entry(account_id)?.get_password()
}

pub fn delete_token(account_id: &str) -> keyring::Result<()> {
    match entry(account_id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}
