use tauri::State;

use crate::models::{
    DevSettings, GitHubAccount, LogEntry, LogSettings, Match, NewAccount, Query,
};
use crate::poller;
use crate::{github::GitHubClient, secrets, AppState};

/// Map any error to a string for transport across the Tauri IPC boundary.
fn to_str<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<GitHubAccount>, String> {
    state.db.list_accounts().map_err(to_str)
}

#[tauri::command]
pub fn add_account(
    state: State<'_, AppState>,
    account: NewAccount,
    token: String,
) -> Result<GitHubAccount, String> {
    let created = GitHubAccount {
        id: uuid::Uuid::new_v4().to_string(),
        name: account.name,
        github_username: account.github_username,
    };
    secrets::store_token(&state.db, &created.id, &token).map_err(to_str)?;
    state.db.insert_account(&created).map_err(to_str)?;
    crate::logging::info(format!("Added account '{}'", created.name));
    Ok(created)
}

#[tauri::command]
pub fn rename_account(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    state.db.rename_account(&id, &name).map_err(to_str)
}

/// Store (or replace) the token for an existing account. Used to repair
/// accounts whose token is missing from the keychain without recreating the
/// account (which would orphan its queries).
#[tauri::command]
pub fn set_account_token(
    state: State<'_, AppState>,
    id: String,
    token: String,
) -> Result<(), String> {
    if state.db.get_account(&id).map_err(to_str)?.is_none() {
        return Err("account not found".to_string());
    }
    secrets::store_token(&state.db, &id, &token).map_err(to_str)
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    secrets::delete_token(&state.db, &id).map_err(to_str)?;
    state.db.delete_account(&id).map_err(to_str)
}

#[tauri::command]
pub fn validate_account(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    // Confirm the account exists before hitting the network.
    if state.db.get_account(&id).map_err(to_str)?.is_none() {
        return Ok(false);
    }
    let token = secrets::get_token(&state.db, &id)
        .map_err(|e| format!("could not read token: {e}"))?;
    // Run the blocking GitHub client on a dedicated thread so it never
    // executes inside the Tauri async runtime context (which makes
    // reqwest's blocking client error out). Real errors are propagated so
    // the UI can show why validation failed instead of masking a network
    // problem as an invalid token.
    let valid = std::thread::spawn(move || GitHubClient::new(token).validate())
        .join()
        .map_err(|_| "validation thread panicked".to_string())?
        .map_err(to_str)?;
    if valid {
        crate::logging::info(format!("Validated account {id}: token is valid"));
    } else {
        crate::logging::warning(format!(
            "Validated account {id}: token is invalid"
        ));
    }
    Ok(valid)
}

#[tauri::command]
pub fn list_queries(state: State<'_, AppState>) -> Result<Vec<Query>, String> {
    state.db.list_queries().map_err(to_str)
}

#[tauri::command]
pub fn save_query(state: State<'_, AppState>, query: Query) -> Result<Query, String> {
    state.db.upsert_query(&query).map_err(to_str)?;
    Ok(query)
}

#[tauri::command]
pub fn delete_query(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_query(&id).map_err(to_str)
}

#[tauri::command]
pub fn list_matches(state: State<'_, AppState>) -> Result<Vec<Match>, String> {
    state.db.menu_matches().map_err(to_str)
}

#[tauri::command]
pub fn refresh_now(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Poll on a dedicated thread so the blocking GitHub client does not run
    // inside the Tauri async runtime context. Per-query failures are surfaced
    // so the user sees *why* nothing appeared (e.g. a missing token) instead
    // of an empty list with no explanation.
    let db = state.db.clone();
    crate::logging::info("Manual refresh requested");
    let errors = std::thread::spawn(move || poller::poll_all(&app, &db))
        .join()
        .map_err(|_| "refresh thread panicked".to_string())?;

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(to_str)
}

// Logs -----------------------------------------------------------------------

#[tauri::command]
pub fn list_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    state.db.list_logs(500).map_err(to_str)
}

#[tauri::command]
pub fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_logs().map_err(to_str)
}

#[tauri::command]
pub fn get_log_settings(state: State<'_, AppState>) -> Result<LogSettings, String> {
    state.db.get_log_settings().map_err(to_str)
}

/// Persist new logging settings and immediately enforce the retention window
/// so a reduced "days to keep" takes effect right away.
#[tauri::command]
pub fn set_log_settings(
    state: State<'_, AppState>,
    settings: LogSettings,
) -> Result<LogSettings, String> {
    state.db.set_log_settings(&settings).map_err(to_str)?;
    state
        .db
        .prune_logs(settings.retention_days)
        .map_err(to_str)?;
    crate::logging::info(format!(
        "Log settings updated: level={}, retentionDays={}",
        settings.level.as_str(),
        settings.retention_days
    ));
    Ok(settings)
}

// Developer settings ---------------------------------------------------------

#[tauri::command]
pub fn get_dev_settings(state: State<'_, AppState>) -> Result<DevSettings, String> {
    state.db.get_dev_settings().map_err(to_str)
}

/// Change where account tokens are stored. Existing tokens are migrated from
/// the previous backend to the new one so accounts keep working across the
/// switch. The keychain backend uses the OS credential store; the database
/// backend keeps tokens AES-256-GCM encrypted inside the app's SQLite file.
#[tauri::command]
pub fn set_dev_settings(
    state: State<'_, AppState>,
    settings: DevSettings,
) -> Result<DevSettings, String> {
    let current = state.db.get_dev_settings().map_err(to_str)?;
    if current.token_storage != settings.token_storage {
        let account_ids: Vec<String> = state
            .db
            .list_accounts()
            .map_err(to_str)?
            .into_iter()
            .map(|a| a.id)
            .collect();
        secrets::migrate(
            &state.db,
            current.token_storage,
            settings.token_storage,
            &account_ids,
        )
        .map_err(to_str)?;
        state.db.set_dev_settings(&settings).map_err(to_str)?;
        crate::logging::info(format!(
            "Token storage switched to {}",
            settings.token_storage.as_str()
        ));
    }
    Ok(settings)
}
