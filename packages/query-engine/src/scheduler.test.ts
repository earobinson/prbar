import { describe, it, expect, vi } from "vitest";
import type { Provider, PullRequest } from "@prbar/provider-core";
import type { Match, Query } from "@prbar/shared-types";
import { PollScheduler, runPollCycle } from "./scheduler";

function makeQuery(overrides: Partial<Query> = {}): Query {
  return {
    id: "q1",
    accountId: "a1",
    name: "My Reviews",
    searchQuery: "is:pr review-requested:@me",
    enabled: true,
    pollIntervalSeconds: 60,
    showInMenu: true,
    desktopNotifications: true,
    notifyOnNewMatches: true,
    notifyOnUpdates: true,
    ...overrides,
  };
}

function pr(id: number, updatedAt = "2026-01-01T00:00:00Z"): PullRequest {
  return {
    id,
    repository: "myorg/webapp",
    title: `PR ${id}`,
    url: `https://github.com/myorg/webapp/pull/${id}`,
    updatedAt,
  };
}

function providerReturning(prs: PullRequest[]): Provider {
  return {
    searchPullRequests: vi.fn().mockResolvedValue(prs),
    validateCredentials: vi.fn().mockResolvedValue(true),
  };
}

describe("runPollCycle", () => {
  it("returns matches and a diff against the previous cache", async () => {
    const provider = providerReturning([pr(1), pr(2)]);
    const result = await runPollCycle(provider, makeQuery(), []);
    expect(result.error).toBeUndefined();
    expect(result.matches).toHaveLength(2);
    expect(result.diff.added).toHaveLength(2);
  });

  it("captures provider errors and preserves the previous cache", async () => {
    const provider: Provider = {
      searchPullRequests: vi.fn().mockRejectedValue(new Error("boom")),
      validateCredentials: vi.fn(),
    };
    const previous: Match[] = [
      {
        queryId: "q1",
        pullRequestId: 9,
        repository: "myorg/webapp",
        title: "old",
        url: "u",
        updatedAt: "t",
      },
    ];
    const result = await runPollCycle(provider, makeQuery(), previous);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.matches).toBe(previous);
    expect(result.diff.unchanged).toBe(previous);
  });

  it("wraps non-Error throws", async () => {
    const provider: Provider = {
      searchPullRequests: vi.fn().mockRejectedValue("string failure"),
      validateCredentials: vi.fn(),
    };
    const result = await runPollCycle(provider, makeQuery(), []);
    expect(result.error?.message).toContain("string failure");
  });
});

describe("PollScheduler", () => {
  it("pollOnce loads cache, runs the cycle and reports the result", async () => {
    const provider = providerReturning([pr(1)]);
    const onResult = vi.fn();
    const scheduler = new PollScheduler({
      getProvider: () => provider,
      loadCache: () => [],
      onResult,
    });

    const result = await scheduler.pollOnce(makeQuery());
    expect(result.matches).toHaveLength(1);
    expect(onResult).toHaveBeenCalledOnce();
  });

  it("schedules only enabled queries", () => {
    const setTimeoutFn = vi
      .fn()
      .mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
    const scheduler = new PollScheduler({
      getProvider: () => providerReturning([]),
      loadCache: () => [],
      onResult: vi.fn(),
      setTimeoutFn,
      clearTimeoutFn: vi.fn(),
    });

    scheduler.setQueries([
      makeQuery({ id: "enabled", enabled: true }),
      makeQuery({ id: "disabled", enabled: false }),
    ]);

    expect(scheduler.scheduledCount).toBe(1);
    expect(setTimeoutFn).toHaveBeenCalledOnce();
  });

  it("clears timers for queries that become disabled or removed", () => {
    let nextHandle = 1;
    const cleared: number[] = [];
    const setTimeoutFn = vi.fn(
      () => nextHandle++ as unknown as ReturnType<typeof setTimeout>,
    );
    const clearTimeoutFn = vi.fn((h: ReturnType<typeof setTimeout>) =>
      cleared.push(h as unknown as number),
    );
    const scheduler = new PollScheduler({
      getProvider: () => providerReturning([]),
      loadCache: () => [],
      onResult: vi.fn(),
      setTimeoutFn,
      clearTimeoutFn,
    });

    scheduler.setQueries([makeQuery({ id: "q1" })]);
    expect(scheduler.scheduledCount).toBe(1);
    scheduler.setQueries([]);
    expect(scheduler.scheduledCount).toBe(0);
    expect(clearTimeoutFn).toHaveBeenCalledOnce();
  });

  it("clamps the interval and reschedules after firing", async () => {
    vi.useFakeTimers();
    try {
      const provider = providerReturning([pr(1)]);
      const onResult = vi.fn();
      const scheduler = new PollScheduler({
        getProvider: () => provider,
        loadCache: () => [],
        onResult,
      });

      // Below the 30s minimum -> clamped to 30s.
      scheduler.setQueries([makeQuery({ pollIntervalSeconds: 1 })]);
      expect(scheduler.scheduledCount).toBe(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(provider.searchPullRequests).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(provider.searchPullRequests).toHaveBeenCalledTimes(2);

      scheduler.stop();
      expect(scheduler.scheduledCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not duplicate schedules for already-scheduled queries", () => {
    const setTimeoutFn = vi
      .fn()
      .mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
    const scheduler = new PollScheduler({
      getProvider: () => providerReturning([]),
      loadCache: () => [],
      onResult: vi.fn(),
      setTimeoutFn,
      clearTimeoutFn: vi.fn(),
    });
    const q = makeQuery({ id: "q1" });
    scheduler.setQueries([q]);
    scheduler.setQueries([q]);
    expect(setTimeoutFn).toHaveBeenCalledOnce();
  });
});
