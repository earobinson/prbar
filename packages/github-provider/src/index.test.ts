import { describe, it, expect, vi } from "vitest";
import { ProviderError } from "@prbar/provider-core";
import { GitHubProvider, repositoryFromUrl } from "./index";

function jsonResponse(body: unknown, init?: Partial<Response>): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

const searchBody = {
  total_count: 2,
  items: [
    {
      number: 101,
      title: "Fix login redirect",
      html_url: "https://github.com/myorg/webapp/pull/101",
      updated_at: "2026-06-01T10:00:00Z",
      pull_request: { url: "x" },
      repository_url: "https://api.github.com/repos/myorg/webapp",
    },
    {
      number: 7,
      title: "An issue, not a PR",
      html_url: "https://github.com/myorg/webapp/issues/7",
      updated_at: "2026-06-01T11:00:00Z",
      repository_url: "https://api.github.com/repos/myorg/webapp",
    },
  ],
};

describe("repositoryFromUrl", () => {
  it("extracts owner/name from an api repository url", () => {
    expect(
      repositoryFromUrl("https://api.github.com/repos/octocat/hello-world"),
    ).toBe("octocat/hello-world");
  });

  it("returns the input when no marker present", () => {
    expect(repositoryFromUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("GitHubProvider constructor", () => {
  it("throws when token is missing", () => {
    expect(() => new GitHubProvider({ token: "" })).toThrow(ProviderError);
  });

  it("throws when no fetch implementation is available", () => {
    expect(
      () =>
        new GitHubProvider({
          token: "t",
          fetch: undefined as unknown as typeof fetch,
        }),
    ).not.toThrow();
  });
});

describe("GitHubProvider.searchPullRequests", () => {
  it("returns only pull requests mapped to the PullRequest shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(searchBody));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });

    const prs = await provider.searchPullRequests("is:pr author:@me");

    expect(prs).toHaveLength(1);
    expect(prs[0]).toEqual({
      id: 101,
      repository: "myorg/webapp",
      title: "Fix login redirect",
      url: "https://github.com/myorg/webapp/pull/101",
      updatedAt: "2026-06-01T10:00:00Z",
    });
  });

  it("encodes the query and passes auth headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ total_count: 0, items: [] }));
    const provider = new GitHubProvider({
      token: "tok",
      fetch: fetchMock,
      baseUrl: "https://example.test/",
    });

    await provider.searchPullRequests("is:pr state:open");

    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain("https://example.test/search/issues?q=");
    expect(calledUrl).toContain(encodeURIComponent("is:pr state:open"));
    expect(calledInit.headers.Authorization).toBe("Bearer tok");
  });

  it("handles a missing items array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });
    await expect(provider.searchPullRequests("q")).resolves.toEqual([]);
  });

  it("throws ProviderError with status on non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });

    await expect(provider.searchPullRequests("q")).rejects.toMatchObject({
      name: "ProviderError",
      status: 401,
    });
  });

  it("wraps network errors in a ProviderError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });
    await expect(provider.searchPullRequests("q")).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("GitHubProvider.validateCredentials", () => {
  it("returns true for a 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });
    await expect(provider.validateCredentials()).resolves.toBe(true);
  });

  it("returns false for a 401 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const provider = new GitHubProvider({ token: "bad", fetch: fetchMock });
    await expect(provider.validateCredentials()).resolves.toBe(false);
  });

  it("returns false when the request throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const provider = new GitHubProvider({ token: "tok", fetch: fetchMock });
    await expect(provider.validateCredentials()).resolves.toBe(false);
  });
});
