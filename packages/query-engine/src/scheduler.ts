import type { Provider } from "@prbar/provider-core";
import type { Match, Query } from "@prbar/shared-types";
import { clampPollInterval } from "@prbar/shared-types";
import { diffMatches, mapToMatches, type MatchDiff } from "./match-detection";

/**
 * Outcome of a single poll cycle for one query.
 */
export interface PollResult {
  query: Query;
  matches: Match[];
  diff: MatchDiff;
  error?: Error;
}

/**
 * Execute one polling cycle for a single query:
 *  1. Execute the GitHub search query via the provider
 *  2. Retrieve matching PRs
 *  3. Compare against the supplied cache (previous matches)
 *
 * The caller is responsible for generating notifications and persisting
 * the updated cache, using the returned diff and matches.
 */
export async function runPollCycle(
  provider: Provider,
  query: Query,
  previousMatches: Match[],
): Promise<PollResult> {
  try {
    const pullRequests = await provider.searchPullRequests(query.searchQuery);
    const matches = mapToMatches(query.id, pullRequests);
    const diff = diffMatches(previousMatches, matches);
    return { query, matches, diff };
  } catch (error) {
    return {
      query,
      matches: previousMatches,
      diff: { added: [], updated: [], removed: [], unchanged: previousMatches },
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface SchedulerDeps {
  /** Resolve the provider for a query's account. */
  getProvider: (query: Query) => Provider;
  /** Load previously cached matches for a query. */
  loadCache: (queryId: string) => Match[] | Promise<Match[]>;
  /** Persist the result of a completed poll cycle. */
  onResult: (result: PollResult) => void | Promise<void>;
  /** Injectable timer functions (defaults to global timers). */
  setTimeoutFn?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
}

/**
 * Schedules independent polling for each enabled query. Each query polls
 * on its own clamped interval. Disabled queries are never polled.
 */
export class PollScheduler {
  private readonly deps: Required<SchedulerDeps>;
  private readonly handles = new Map<string, TimerHandle>();

  constructor(deps: SchedulerDeps) {
    this.deps = {
      setTimeoutFn: globalThis.setTimeout,
      clearTimeoutFn: globalThis.clearTimeout,
      ...deps,
    };
  }

  /** Replace the full set of scheduled queries (e.g. after settings change). */
  setQueries(queries: Query[]): void {
    const enabledIds = new Set(
      queries.filter((q) => q.enabled).map((q) => q.id),
    );

    for (const [id, handle] of this.handles) {
      if (!enabledIds.has(id)) {
        this.deps.clearTimeoutFn(handle);
        this.handles.delete(id);
      }
    }

    for (const query of queries) {
      if (query.enabled && !this.handles.has(query.id)) {
        this.scheduleNext(query);
      }
    }
  }

  /** Immediately poll a single query once, outside its normal schedule. */
  async pollOnce(query: Query): Promise<PollResult> {
    const provider = this.deps.getProvider(query);
    const previous = await this.deps.loadCache(query.id);
    const result = await runPollCycle(provider, query, previous);
    await this.deps.onResult(result);
    return result;
  }

  /** Stop all scheduled polling. */
  stop(): void {
    for (const handle of this.handles.values()) {
      this.deps.clearTimeoutFn(handle);
    }
    this.handles.clear();
  }

  /** Number of queries currently scheduled. */
  get scheduledCount(): number {
    return this.handles.size;
  }

  private scheduleNext(query: Query): void {
    const intervalMs = clampPollInterval(query.pollIntervalSeconds) * 1000;
    const handle = this.deps.setTimeoutFn(() => {
      void this.pollOnce(query).finally(() => {
        // Reschedule only if this query is still active.
        if (this.handles.has(query.id)) {
          this.scheduleNext(query);
        }
      });
    }, intervalMs);
    this.handles.set(query.id, handle);
  }
}
