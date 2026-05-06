//! Хранение секретов в OS keychain через keyring-rs.
//!
//! - Windows: Credential Manager
//! - macOS:   Keychain
//! - Linux:   Secret Service (libsecret)
//!
//! Используем для refresh-токена в фазе 1. Никогда не коммитить «упрощения» вида
//! «храним в plaintext в localStorage» — это крест на смысле desktop-клиента.

use keyring::Entry;
use serde::Serialize;
use thiserror::Error;

const SERVICE: &str = "quorum.desktop";

#[derive(Debug, Error)]
pub enum KeychainError {
    #[error("keychain not available: {0}")]
    Unavailable(String),
    #[error("entry not found")]
    NotFound,
    #[error("keychain error: {0}")]
    Other(String),
}

#[derive(Serialize)]
pub struct KeychainErrorPayload {
    code: String,
    message: String,
}

impl From<&KeychainError> for KeychainErrorPayload {
    fn from(err: &KeychainError) -> Self {
        let code = match err {
            KeychainError::Unavailable(_) => "unavailable",
            KeychainError::NotFound => "not_found",
            KeychainError::Other(_) => "other",
        };
        Self { code: code.into(), message: err.to_string() }
    }
}

impl serde::Serialize for KeychainError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        KeychainErrorPayload::from(self).serialize(ser)
    }
}

fn make_entry(key: &str) -> Result<Entry, KeychainError> {
    Entry::new(SERVICE, key).map_err(|e| KeychainError::Unavailable(e.to_string()))
}

#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<(), KeychainError> {
    let entry = make_entry(&key)?;
    entry
        .set_password(&value)
        .map_err(|e| KeychainError::Other(e.to_string()))
}

#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, KeychainError> {
    let entry = make_entry(&key)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(KeychainError::Other(e.to_string())),
    }
}

#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), KeychainError> {
    let entry = make_entry(&key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(KeychainError::Other(e.to_string())),
    }
}
