//! Epistemics desktop shell. The React SPA from `apps/web` runs inside the webview; this crate
//! provides what the browser build cannot: native SQLite, the OS keychain, native file dialogs,
//! and the `llm_fetch` command that keeps API keys out of JavaScript.

pub mod llm;
pub mod migrations;
pub mod policy;
pub mod secrets;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// Reveal the directory that holds `epistemics.db` in the system file manager.
/// `tauri-plugin-sql` resolves `sqlite:<name>` relative to the app config directory.
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_config_dir().map_err(|e| format!("app config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let path = dir.to_string_lossy().to_string();
    app.opener().open_path(path.clone(), None::<&str>).map_err(|e| format!("open {path}: {e}"))?;
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().add_migrations(migrations::DB_URL, migrations::all()).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(llm::HttpState::new())
        .invoke_handler(tauri::generate_handler![
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            llm::llm_fetch,
            open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Epistemics");
}
