import { describe, it, expect } from "vitest";
import type { MatchDiff } from "@prbar/query-engine";
import type { Match, Query } from "@prbar/shared-types";
import { generateNotifications } from "./index";

function makeQuery(overrides: Partial<Query> = {}): Query {
  return {
    id: "q1",
    accountIds: ["a1"],
    name: "Review Requested",
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

function match(id: number, title: string): Match {
  return {
    queryId: "q1",
    pullRequestId: id,
    repository: "myorg/webapp",
    title,
    url: `https://github.com/myorg/webapp/pull/${id}`,
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function diff(overrides: Partial<MatchDiff> = {}): MatchDiff {
  return {
    added: [],
    updated: [],
    removed: [],
    unchanged: [],
    ...overrides,
  };
}

describe("generateNotifications", () => {
  it("returns nothing when desktop notifications are disabled", () => {
    const query = makeQuery({ desktopNotifications: false });
    const result = generateNotifications(
      query,
      diff({ added: [match(1, "New PR")] }),
    );
    expect(result).toEqual([]);
  });

  it("notifies on new matches with the expected shape", () => {
    const query = makeQuery();
    const result = generateNotifications(
      query,
      diff({ added: [match(1, "Fix OAuth callback bug")] }),
    );
    expect(result).toEqual([
      {
        title: "Review Requested",
        body: "Fix OAuth callback bug\nmyorg/webapp",
        url: "https://github.com/myorg/webapp/pull/1",
        queryId: "q1",
        pullRequestId: 1,
        reason: "new",
      },
    ]);
  });

  it("does not notify on new matches when notifyOnNewMatches is off", () => {
    const query = makeQuery({ notifyOnNewMatches: false });
    const result = generateNotifications(
      query,
      diff({ added: [match(1, "New PR")] }),
    );
    expect(result).toEqual([]);
  });

  it("notifies on updates when notifyOnUpdates is on", () => {
    const query = makeQuery();
    const result = generateNotifications(
      query,
      diff({ updated: [match(2, "Updated PR")] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("update");
  });

  it("does not notify on updates when notifyOnUpdates is off", () => {
    const query = makeQuery({ notifyOnUpdates: false });
    const result = generateNotifications(
      query,
      diff({ updated: [match(2, "Updated PR")] }),
    );
    expect(result).toEqual([]);
  });

  it("ignores removed and unchanged matches", () => {
    const query = makeQuery();
    const result = generateNotifications(
      query,
      diff({ removed: [match(3, "Gone")], unchanged: [match(4, "Same")] }),
    );
    expect(result).toEqual([]);
  });

  it("emits both new and updated notifications together", () => {
    const query = makeQuery();
    const result = generateNotifications(
      query,
      diff({ added: [match(1, "A")], updated: [match(2, "B")] }),
    );
    expect(result.map((n) => n.reason)).toEqual(["new", "update"]);
  });
});
