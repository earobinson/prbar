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
