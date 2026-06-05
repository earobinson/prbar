import { useState } from "react";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import { POLL_INTERVAL, clampPollInterval } from "@prbar/shared-types";

/**
 * Attributes that stop the webview from auto-capitalizing, autocorrecting, or
 * spellchecking free-text fields. Search queries are case- and
 * spelling-sensitive, so these "corrections" only corrupt the input.
 */
const NO_AUTO_FIX = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;

export interface QueryFormProps {
  accounts: GitHubAccount[];
  initial?: Query;
  onSubmit: (query: Omit<Query, "id"> & { id?: string }) => void;
  onCancel: () => void;
}

function defaultQuery(accountId: string): Omit<Query, "id"> {
  return {
    accountId,
    name: "",
    searchQuery: "",
    enabled: true,
    pollIntervalSeconds: POLL_INTERVAL.default,
    showInMenu: true,
    desktopNotifications: true,
    notifyOnNewMatches: true,
    notifyOnUpdates: false,
  };
}

/**
 * Form used to create or edit a {@link Query}. Exposes every field from
 * the Query Configuration section of the requirements.
 */
export function QueryForm({
  accounts,
  initial,
  onSubmit,
  onCancel,
}: QueryFormProps) {
  const [draft, setDraft] = useState<Omit<Query, "id">>(
    initial ?? defaultQuery(accounts[0]?.id ?? ""),
  );

  function update<K extends keyof Omit<Query, "id">>(
    key: K,
    value: Omit<Query, "id">[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      ...draft,
      pollIntervalSeconds: clampPollInterval(draft.pollIntervalSeconds),
      ...(initial ? { id: initial.id } : {}),
    });
  }

  return (
    <form className="query-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input
          value={draft.name}
          onChange={(e) => update("name", e.target.value)}
          required
          {...NO_AUTO_FIX}
        />
      </label>

      <label>
        GitHub Account
        <select
          value={draft.accountId}
          onChange={(e) => update("accountId", e.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Search Query
        <input
          value={draft.searchQuery}
          onChange={(e) => update("searchQuery", e.target.value)}
          placeholder="is:pr review-requested:@me state:open"
          required
          {...NO_AUTO_FIX}
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.showInMenu}
          onChange={(e) => update("showInMenu", e.target.checked)}
        />
        Show In Menu
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.desktopNotifications}
          onChange={(e) => update("desktopNotifications", e.target.checked)}
        />
        Desktop Notifications
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.notifyOnNewMatches}
          onChange={(e) => update("notifyOnNewMatches", e.target.checked)}
        />
        Notify On New Matches
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.notifyOnUpdates}
          onChange={(e) => update("notifyOnUpdates", e.target.checked)}
        />
        Notify On Updates
      </label>

      <label>
        Poll Interval (seconds)
        <input
          type="number"
          min={POLL_INTERVAL.min}
          max={POLL_INTERVAL.max}
          value={draft.pollIntervalSeconds}
          onChange={(e) =>
            update("pollIntervalSeconds", Number(e.target.value))
          }
        />
      </label>

      <div className="form-actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
