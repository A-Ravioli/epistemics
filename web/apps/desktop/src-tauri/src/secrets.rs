//! OS keychain access. Every entry lives under the service `dev.epistemics.app`
//! (macOS Keychain, Windows Credential Manager, Linux Secret Service via D-Bus).
//! Values never pass through the webview except when the UI explicitly writes or reads them;
//! `llm_fetch` reads the Anthropic key here directly.

use crate::policy::{keyring_entry_name, KEYRING_SERVICE};
use keyring::{Entry, Error as KeyringError};

fn entry(key: &str) -> Result<Entry, String> {
    let name = keyring_entry_name(key).map_err(|e| e.to_string())?;
    Entry::new(KEYRING_SERVICE, name).map_err(|e| format!("keyring: {e}"))
}

/// Blocking read. `Ok(None)` when no entry exists.
pub fn get(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring: {e}")),
    }
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?.set_password(value).map_err(|e| format!("keyring: {e}"))
}

/// Deleting a missing entry is not an error, so the UI can call it unconditionally.
pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring: {e}")),
    }
}

/// Keychain calls can block on a user prompt (macOS) or D-Bus round trips (Linux), so the
/// commands run them on the blocking pool rather than the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("keyring task failed: {e}"))?
}

#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, String> {
    blocking(move || get(&key)).await
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), String> {
    blocking(move || set(&key, &value)).await
}

#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), String> {
    blocking(move || delete(&key)).await
}
