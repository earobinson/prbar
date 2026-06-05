/**
 * A configured GitHub (or future provider) account.
 * Authentication tokens are NEVER stored here; they live only in the
 * operating system credential store, keyed by the account id.
 */
export interface GitHubAccount {
  id: string;
  name: string;
  githubUsername: string;
}

/**
 * A saved search query. A query belongs to exactly one account.
 */
export interface Query {
  id: string;
  accountId: string;

  name: string;
  searchQuery: string;

  enabled: boolean;

  pollIntervalSeconds: number;

  showInMenu: boolean;
  desktopNotifications: boolean;

  notifyOnNewMatches: boolean;
  notifyOnUpdates: boolean;
}

/**
 * A Match is a pull request returned by a query.
 */
export interface Match {
  queryId: string;

  pullRequestId: number;
  repository: string;

  title: string;
  url: string;

  updatedAt: string;
}

/**
 * Polling interval bounds, in seconds.
 */
export const POLL_INTERVAL = {
  default: 60,
  min: 30,
  max: 3600,
} as const;

/**
 * Clamp a requested poll interval to the allowed range.
 */
export function clampPollInterval(seconds: number): number {
  if (Number.isNaN(seconds)) {
    return POLL_INTERVAL.default;
  }
  return Math.min(POLL_INTERVAL.max, Math.max(POLL_INTERVAL.min, seconds));
}

/**
 * Severity of a log entry. `debug` keeps everything; `error` keeps only
 * errors. Ordered least to most severe.
 */
export type LogLevel = "debug" | "info" | "warning" | "error";

export const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warning",
  "error",
] as const;

/**
 * A single stored log line.
 */
export interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
}

/**
 * User-configurable logging behaviour.
 */
export interface LogSettings {
  /** Minimum level to persist. */
  level: LogLevel;
  /** How many days of history to keep. */
  retentionDays: number;
}

/**
 * Retention bounds, in days.
 */
export const LOG_RETENTION = {
  default: 3,
  min: 1,
  max: 90,
} as const;

/**
 * Clamp a requested retention to the allowed range.
 */
export function clampRetentionDays(days: number): number {
  if (Number.isNaN(days)) {
    return LOG_RETENTION.default;
  }
  return Math.min(LOG_RETENTION.max, Math.max(LOG_RETENTION.min, Math.trunc(days)));
}

/**
 * Where account tokens are persisted. `keychain` uses the OS credential store;
 * `database` keeps tokens encrypted (AES-256-GCM) inside the app's SQLite file
 * to avoid repeated keychain prompts during development.
 */
export type TokenStorage = "keychain" | "database";

/**
 * Developer-oriented settings.
 */
export interface DevSettings {
  tokenStorage: TokenStorage;
}
