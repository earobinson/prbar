use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

const KEY_FILE: &str = "token.key";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("could not gather randomness")]
    Random,
    #[error("token encryption failed")]
    Encrypt,
    #[error("token decryption failed (the encryption key may have changed)")]
    Decrypt,
    #[error("stored token is malformed")]
    Malformed,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// The symmetric key used to encrypt database-stored tokens. It is held in
/// memory and persisted to a `0600` file separate from the SQLite database so
/// that the database file alone never reveals tokens.
#[derive(Clone)]
pub struct TokenKey([u8; KEY_LEN]);

impl TokenKey {
    /// Generate a fresh random key (used for in-memory/test databases that have
    /// no on-disk home).
    pub fn random() -> Result<Self, CryptoError> {
        let mut bytes = [0u8; KEY_LEN];
        getrandom::getrandom(&mut bytes).map_err(|_| CryptoError::Random)?;
        Ok(TokenKey(bytes))
    }

    /// Load the key that sits beside the database file, creating it on first
    /// run. The file is written with owner-only permissions where the platform
    /// supports it.
    pub fn load_or_create(db_path: &Path) -> Result<Self, CryptoError> {
        let path = key_path(db_path);
        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.len() == KEY_LEN {
                let mut key = [0u8; KEY_LEN];
                key.copy_from_slice(&bytes);
                return Ok(TokenKey(key));
            }
            // Wrong length: treat as corrupt and regenerate below.
        }

        let key = Self::random()?;
        write_key_file(&path, &key.0)?;
        Ok(key)
    }

    /// Encrypt `plaintext`, returning a base64 string of `nonce || ciphertext`.
    pub fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));
        let mut nonce_bytes = [0u8; NONCE_LEN];
        getrandom::getrandom(&mut nonce_bytes).map_err(|_| CryptoError::Random)?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| CryptoError::Encrypt)?;

        let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ciphertext);
        Ok(STANDARD.encode(blob))
    }

    /// Decrypt a base64 `nonce || ciphertext` blob produced by [`encrypt`].
    pub fn decrypt(&self, blob: &str) -> Result<String, CryptoError> {
        let bytes = STANDARD
            .decode(blob.as_bytes())
            .map_err(|_| CryptoError::Malformed)?;
        if bytes.len() <= NONCE_LEN {
            return Err(CryptoError::Malformed);
        }
        let (nonce_bytes, ciphertext) = bytes.split_at(NONCE_LEN);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.0));
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|_| CryptoError::Decrypt)?;
        String::from_utf8(plaintext).map_err(|_| CryptoError::Malformed)
    }
}

fn key_path(db_path: &Path) -> PathBuf {
    match db_path.parent() {
        Some(dir) => dir.join(KEY_FILE),
        None => PathBuf::from(KEY_FILE),
    }
}

fn write_key_file(path: &Path, key: &[u8; KEY_LEN]) -> Result<(), CryptoError> {
    std::fs::write(path, key)?;
    set_owner_only(path)?;
    Ok(())
}

#[cfg(unix)]
fn set_owner_only(path: &Path) -> Result<(), CryptoError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_owner_only(_path: &Path) -> Result<(), CryptoError> {
    // On Windows the file inherits the user profile's ACL; no extra step here.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_plaintext() {
        let key = TokenKey::random().unwrap();
        let blob = key.encrypt("github_pat_secret").unwrap();
        // Ciphertext must not contain the plaintext.
        assert!(!blob.contains("github_pat_secret"));
        assert_eq!(key.decrypt(&blob).unwrap(), "github_pat_secret");
    }

    #[test]
    fn nonce_makes_ciphertext_non_deterministic() {
        let key = TokenKey::random().unwrap();
        let a = key.encrypt("same").unwrap();
        let b = key.encrypt("same").unwrap();
        assert_ne!(a, b, "fresh nonce per encryption");
        assert_eq!(key.decrypt(&a).unwrap(), "same");
        assert_eq!(key.decrypt(&b).unwrap(), "same");
    }

    #[test]
    fn wrong_key_cannot_decrypt() {
        let blob = TokenKey::random().unwrap().encrypt("secret").unwrap();
        let other = TokenKey::random().unwrap();
        assert!(matches!(
            other.decrypt(&blob).unwrap_err(),
            CryptoError::Decrypt
        ));
    }

    #[test]
    fn malformed_blob_is_rejected() {
        let key = TokenKey::random().unwrap();
        assert!(matches!(
            key.decrypt("not-base64!!").unwrap_err(),
            CryptoError::Malformed
        ));
        assert!(matches!(
            key.decrypt("c2hvcnQ=").unwrap_err(),
            CryptoError::Malformed
        ));
    }

    #[test]
    fn key_persists_across_loads() {
        let dir = std::env::temp_dir().join(format!("prbar-key-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("prbar.sqlite3");

        let key1 = TokenKey::load_or_create(&db_path).unwrap();
        let blob = key1.encrypt("persisted").unwrap();
        let key2 = TokenKey::load_or_create(&db_path).unwrap();
        assert_eq!(key2.decrypt(&blob).unwrap(), "persisted");

        std::fs::remove_dir_all(&dir).ok();
    }
}
