import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubAccount,
  Query,
  Match,
  LogEntry,
  LogSettings,
  DevSettings,
} from "@prbar/shared-types";

/**
 * Thin typed wrapper around the Tauri command layer. All persistence
 * (SQLite) and credential storage (OS keychain) happens in the Rust
 * backend; the frontend only ever talks through these commands.
 */
export const api = {
  // Accounts ---------------------------------------------------------------
  listAccounts(): Promise<GitHubAccount[]> {
    return invoke("list_accounts");
  },
  addAccount(
    account: Omit<GitHubAccount, "id">,
    token: string,
  ): Promise<GitHubAccount> {
    return invoke("add_account", { account, token });
  },
  updateAccount(
    id: string,
    name: string,
    githubUsername: string,
  ): Promise<void> {
    return invoke("update_account", { id, name, githubUsername });
  },
  fetchGithubLogin(token: string): Promise<string> {
    return invoke("fetch_github_login", { token });
  },
  setAccountToken(id: string, token: string): Promise<void> {
    return invoke("set_account_token", { id, token });
  },
  removeAccount(id: string): Promise<void> {
    return invoke("remove_account", { id });
  },
  validateAccount(id: string): Promise<boolean> {
    return invoke("validate_account", { id });
  },

  // Queries ----------------------------------------------------------------
  listQueries(): Promise<Query[]> {
    return invoke("list_queries");
  },
  saveQuery(query: Query): Promise<Query> {
    return invoke("save_query", { query });
  },
  deleteQuery(id: string): Promise<void> {
    return invoke("delete_query", { id });
  },

  // Matches ----------------------------------------------------------------
  listMatches(): Promise<Match[]> {
    return invoke("list_matches");
  },
  refreshNow(): Promise<void> {
    return invoke("refresh_now");
  },

  openUrl(url: string): Promise<void> {
    return invoke("open_url", { url });
  },

  // Logs -------------------------------------------------------------------
  listLogs(): Promise<LogEntry[]> {
    return invoke("list_logs");
  },
  clearLogs(): Promise<void> {
    return invoke("clear_logs");
  },
  getLogSettings(): Promise<LogSettings> {
    return invoke("get_log_settings");
  },
  setLogSettings(settings: LogSettings): Promise<LogSettings> {
    return invoke("set_log_settings", { settings });
  },

  // Developer settings -----------------------------------------------------
  getDevSettings(): Promise<DevSettings> {
    return invoke("get_dev_settings");
  },
  setDevSettings(settings: DevSettings): Promise<DevSettings> {
    return invoke("set_dev_settings", { settings });
  },
};
