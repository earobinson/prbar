import { describe, it, expect } from "vitest";
import type { PullRequest } from "@prbar/provider-core";
import type { Match } from "@prbar/shared-types";
import {
  aggregateMatchCount,
  diffMatches,
  mapToMatches,
} from "./match-detection";

function match(id: number, updatedAt: string, repo = "myorg/webapp"): Match {
  return {
    queryId: "q1",
    pullRequestId: id,
    repository: repo,
    title: `PR ${id}`,
    url: `https://github.com/${repo}/pull/${id}`,
    updatedAt,
  };
}

describe("mapToMatches", () => {
  it("maps provider pull requests onto Match records", () => {
    const prs: PullRequest[] = [
      {
        id: 5,
        repository: "a/b",
        title: "t",
        url: "u",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    expect(mapToMatches("q9", prs)).toEqual([
      {
        queryId: "q9",
        pullRequestId: 5,
        repository: "a/b",
        title: "t",
        url: "u",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });
});

describe("diffMatches", () => {
  it("detects added matches", () => {
    const diff = diffMatches([], [match(1, "t1")]);
    expect(diff.added.map((m) => m.pullRequestId)).toEqual([1]);
    expect(diff.updated).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects updated matches by changed updatedAt", () => {
    const diff = diffMatches([match(1, "t1")], [match(1, "t2")]);
    expect(diff.updated.map((m) => m.pullRequestId)).toEqual([1]);
    expect(diff.added).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("detects unchanged matches", () => {
    const diff = diffMatches([match(1, "t1")], [match(1, "t1")]);
    expect(diff.unchanged.map((m) => m.pullRequestId)).toEqual([1]);
    expect(diff.updated).toHaveLength(0);
  });

  it("detects removed matches", () => {
    const diff = diffMatches(
      [match(1, "t1"), match(2, "t1")],
      [match(1, "t1")],
    );
    expect(diff.removed.map((m) => m.pullRequestId)).toEqual([2]);
  });

  it("handles a mix of all categories", () => {
    const previous = [match(1, "t1"), match(2, "t1"), match(3, "t1")];
    const current = [match(1, "t1"), match(2, "t2"), match(4, "t1")];
    const diff = diffMatches(previous, current);
    expect(diff.unchanged.map((m) => m.pullRequestId)).toEqual([1]);
    expect(diff.updated.map((m) => m.pullRequestId)).toEqual([2]);
    expect(diff.added.map((m) => m.pullRequestId)).toEqual([4]);
    expect(diff.removed.map((m) => m.pullRequestId)).toEqual([3]);
  });
});

describe("aggregateMatchCount", () => {
  it("counts unique pull requests across queries", () => {
    const q1 = [match(1, "t1"), match(2, "t1")];
    const q2 = [match(2, "t1"), match(3, "t1", "other/repo")];
    expect(aggregateMatchCount([q1, q2])).toBe(3);
  });

  it("returns 0 for no matches", () => {
    expect(aggregateMatchCount([])).toBe(0);
  });

  it("distinguishes same id across different repositories", () => {
    const a = [match(1, "t1", "org/a")];
    const b = [match(1, "t1", "org/b")];
    expect(aggregateMatchCount([a, b])).toBe(2);
  });
});
