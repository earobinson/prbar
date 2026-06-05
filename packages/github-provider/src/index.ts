import { Provider, ProviderError, PullRequest } from "@prbar/provider-core";

/**
 * Minimal shape of the GitHub `/search/issues` response items we rely on.
 */
interface GitHubSearchItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
  repository_url: string;
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubSearchItem[];
}

export interface GitHubProviderOptions {
  token: string;
  /** Override the API base URL (useful for GitHub Enterprise / tests). */
  baseUrl?: string;
  /** Injectable fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.github.com";

/**
 * Derive an "owner/name" repository string from a GitHub `repository_url`
 * such as "https://api.github.com/repos/octocat/hello-world".
 */
export function repositoryFromUrl(repositoryUrl: string): string {
  const marker = "/repos/";
  const index = repositoryUrl.indexOf(marker);
  if (index === -1) {
    return repositoryUrl;
  }
  return repositoryUrl.slice(index + marker.length);
}

/**
 * GitHub implementation of the {@link Provider} interface.
 *
 * PRBar does not parse GitHub search syntax; the user's query is passed
 * directly to the `/search/issues` endpoint.
 */
export class GitHubProvider implements Provider {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubProviderOptions) {
    if (!options.token) {
      throw new ProviderError("A GitHub token is required");
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new ProviderError("No fetch implementation available");
    }
  }

  private headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "PRBar",
    };
  }

  async searchPullRequests(query: string): Promise<PullRequest[]> {
    const url = `${this.baseUrl}/search/issues?q=${encodeURIComponent(
      query,
    )}&per_page=100`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: this.headers() });
    } catch (cause) {
      throw new ProviderError(
        `Network error while contacting GitHub: ${String(cause)}`,
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        `GitHub search failed with status ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as GitHubSearchResponse;
    const items = body.items ?? [];

    return items
      .filter((item) => item.pull_request !== undefined)
      .map((item) => ({
        id: item.number,
        repository: repositoryFromUrl(item.repository_url),
        title: item.title,
        url: item.html_url,
        updatedAt: item.updated_at,
      }));
  }

  async validateCredentials(): Promise<boolean> {
    const url = `${this.baseUrl}/user`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: this.headers() });
    } catch {
      return false;
    }
    return response.ok;
  }
}
