/**
 * Provider-agnostic representation of a pull request returned by a
 * provider search. This is the raw shape providers must produce; the
 * query engine maps it to a {@link Match}.
 */
export interface PullRequest {
  /** Numeric provider-side identifier (e.g. GitHub issue/PR number). */
  id: number;
  /** Repository in "owner/name" form. */
  repository: string;
  title: string;
  url: string;
  /** ISO-8601 timestamp of the last update. */
  updatedAt: string;
}

/**
 * Credentials handed to a provider. The token is read from the OS
 * credential store at runtime and never persisted by the provider.
 */
export interface ProviderCredentials {
  token: string;
}

/**
 * A source-control provider that can run searches and validate
 * credentials. The application is provider-agnostic internally; the
 * initial implementation is GitHubProvider.
 */
export interface Provider {
  searchPullRequests(query: string): Promise<PullRequest[]>;
  validateCredentials(): Promise<boolean>;
}

/**
 * Error thrown by providers when an API call fails. Carries the HTTP
 * status when available so callers can react (e.g. 401 -> invalid token).
 */
export class ProviderError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}
