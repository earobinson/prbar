use tauri::State;

use crate::models::{GitHubAccount, Match, NewAccount, Query};
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
    secrets::store_token(&created.id, &token).map_err(to_str)?;
    state.db.insert_account(&created).map_err(to_str)?;
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
    secrets::store_token(&id, &token).map_err(to_str)
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    secrets::delete_token(&id).map_err(to_str)?;
    state.db.delete_account(&id).map_err(to_str)
}

#[tauri::command]
pub fn validate_account(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    // Confirm the account exists before hitting the network.
    if state.db.get_account(&id).map_err(to_str)?.is_none() {
        return Ok(false);
    }
    let token = secrets::get_token(&id)
        .map_err(|e| format!("could not read token from the keychain: {e}"))?;
    // Run the blocking GitHub client on a dedicated thread so it never
    // executes inside the Tauri async runtime context (which makes
    // reqwest's blocking client error out). Real errors are propagated so
    // the UI can show why validation failed instead of masking a network
    // problem as an invalid token.
    std::thread::spawn(move || GitHubClient::new(token).validate())
        .join()
        .map_err(|_| "validation thread panicked".to_string())?
        .map_err(to_str)
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
    // inside the Tauri async runtime context.
    let db = state.db.clone();
    std::thread::spawn(move || poller::poll_all(&app, &db))
        .join()
        .map_err(|_| "refresh thread panicked".to_string())
}

#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(to_str)
}
