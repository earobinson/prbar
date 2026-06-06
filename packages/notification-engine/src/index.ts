import type { MatchDiff } from "@prbar/query-engine";
import type { Match, Query } from "@prbar/shared-types";

/**
 * Reason a notification was generated.
 */
export type NotificationReason = "new" | "update";

/**
 * A desktop notification ready to be shown by the host application.
 * Clicking a notification should open {@link DesktopNotification.url}.
 */
export interface DesktopNotification {
  title: string;
  body: string;
  url: string;
  queryId: string;
  pullRequestId: number;
  reason: NotificationReason;
}

function bodyFor(match: Match): string {
  return `${match.title}\n${match.repository}`;
}

/**
 * Generate the desktop notifications for a single query's poll diff,
 * honouring that query's notification settings:
 *
 *  - Notifications are skipped entirely when `desktopNotifications` is off.
 *  - New matches produce notifications only when `notifyOnNewMatches` is on.
 *  - Updated matches produce notifications only when `notifyOnUpdates` is on.
 *
 * Removed and unchanged matches never produce notifications.
 */
export function generateNotifications(
  query: Query,
  diff: MatchDiff,
): DesktopNotification[] {
  if (!query.desktopNotifications) {
    return [];
  }

  const notifications: DesktopNotification[] = [];

  if (query.notifyOnNewMatches) {
    for (const match of diff.added) {
      notifications.push({
        title: query.name,
        body: bodyFor(match),
        url: match.url,
        queryId: query.id,
        pullRequestId: match.pullRequestId,
        reason: "new",
      });
    }
  }

  if (query.notifyOnUpdates) {
    for (const match of diff.updated) {
      notifications.push({
        title: query.name,
        body: bodyFor(match),
        url: match.url,
        queryId: query.id,
        pullRequestId: match.pullRequestId,
        reason: "update",
      });
    }
  }

  return notifications;
}
