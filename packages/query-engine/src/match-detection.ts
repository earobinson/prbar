import type { PullRequest } from "@prbar/provider-core";
import type { Match } from "@prbar/shared-types";

/**
 * The result of comparing a fresh set of matches against the cached set
 * for a single query.
 */
export interface MatchDiff {
  /** Matches present now but not in the cache. */
  added: Match[];
  /** Matches present in both whose `updatedAt` changed. */
  updated: Match[];
  /** Matches present in the cache but no longer returned. */
  removed: Match[];
  /** Matches present in both and unchanged. */
  unchanged: Match[];
}

/**
 * Map provider pull requests to {@link Match} records for a given query.
 */
export function mapToMatches(
  queryId: string,
  pullRequests: PullRequest[],
): Match[] {
  return pullRequests.map((pr) => ({
    queryId,
    pullRequestId: pr.id,
    repository: pr.repository,
    title: pr.title,
    url: pr.url,
    updatedAt: pr.updatedAt,
  }));
}

/**
 * Compare the previously cached matches with the current matches and
 * classify each into added / updated / removed / unchanged.
 *
 * Identity is the pull request id. A match is "updated" when its
 * `updatedAt` timestamp differs from the cached value.
 */
export function diffMatches(previous: Match[], current: Match[]): MatchDiff {
  const previousById = new Map<number, Match>();
  for (const match of previous) {
    previousById.set(match.pullRequestId, match);
  }

  const currentIds = new Set<number>();
  const diff: MatchDiff = {
    added: [],
    updated: [],
    removed: [],
    unchanged: [],
  };

  for (const match of current) {
    currentIds.add(match.pullRequestId);
    const prior = previousById.get(match.pullRequestId);
    if (!prior) {
      diff.added.push(match);
    } else if (prior.updatedAt !== match.updatedAt) {
      diff.updated.push(match);
    } else {
      diff.unchanged.push(match);
    }
  }

  for (const match of previous) {
    if (!currentIds.has(match.pullRequestId)) {
      diff.removed.push(match);
    }
  }

  return diff;
}

/**
 * Total number of currently-matching pull requests across many queries,
 * used to drive the menu bar indicator. Duplicate pull requests (same id
 * in the same repository) returned by multiple queries are counted once.
 */
export function aggregateMatchCount(matchesByQuery: Iterable<Match[]>): number {
  const unique = new Set<string>();
  for (const matches of matchesByQuery) {
    for (const match of matches) {
      unique.add(`${match.repository}#${match.pullRequestId}`);
    }
  }
  return unique.size;
}
