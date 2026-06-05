import { useEffect, useState } from "react";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import {
  AccountForm,
  AccountList,
  QueryForm,
  QueryList,
  type AccountFormValues,
} from "@prbar/ui-components";
import { useAppStore } from "./store";
import { api } from "./api";

type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; query: Query };

type AccountEditing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "rename"; account: GitHubAccount };

/**
 * The Settings window. Normal operation is from the tray; this window is
 * opened on demand from the right-click menu's "Settings" action.
 */
export function App() {
  const {
    accounts,
    queries,
    loading,
    error,
    loadAll,
    addAccount,
    renameAccount,
    removeAccount,
    saveQuery,
    deleteQuery,
    setQueryEnabled,
  } = useAppStore();

  const [editing, setEditing] = useState<Editing>({ kind: "none" });
  const [accountEditing, setAccountEditing] = useState<AccountEditing>({
    kind: "none",
  });
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleAccountSubmit(values: AccountFormValues) {
    if (!values.name || !values.githubUsername) return;
    if (accountEditing.kind === "rename") {
      await renameAccount(accountEditing.account.id, values.name);
    } else {
      if (!values.token) return;
      await addAccount(
        { name: values.name, githubUsername: values.githubUsername },
        values.token,
      );
    }
    setAccountEditing({ kind: "none" });
  }

  async function handleValidate(account: GitHubAccount) {
    setStatuses((prev) => ({ ...prev, [account.id]: "Validating…" }));
    const ok = await api.validateAccount(account.id);
    setStatuses((prev) => ({
      ...prev,
      [account.id]: ok ? "Token is valid" : "Token is invalid",
    }));
  }

  function handleDuplicate(query: Query) {
    const { id: _id, ...rest } = query;
    setEditing({
      kind: "edit",
      query: { ...rest, id: "", name: `${query.name} (copy)` },
    });
  }

  async function handleSubmitQuery(value: Omit<Query, "id"> & { id?: string }) {
    const query: Query = {
      ...value,
      id: value.id && value.id.length > 0 ? value.id : crypto.randomUUID(),
    };
    await saveQuery(query);
    setEditing({ kind: "none" });
  }

  return (
    <main className="settings">
      <h1>PRBar Settings</h1>
      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">Loading…</p>}

      {accountEditing.kind === "none" ? (
        <AccountList
          accounts={accounts}
          statuses={statuses}
          onAdd={() => setAccountEditing({ kind: "new" })}
          onRename={(account) => setAccountEditing({ kind: "rename", account })}
          onRemove={(a) => removeAccount(a.id)}
          onValidate={handleValidate}
        />
      ) : (
        <AccountForm
          title={
            accountEditing.kind === "rename" ? "Rename Account" : "Add Account"
          }
          requireToken={accountEditing.kind === "new"}
          initial={
            accountEditing.kind === "rename"
              ? {
                  name: accountEditing.account.name,
                  githubUsername: accountEditing.account.githubUsername,
                }
              : undefined
          }
          onSubmit={handleAccountSubmit}
          onCancel={() => setAccountEditing({ kind: "none" })}
        />
      )}

      {editing.kind === "none" ? (
        <QueryList
          queries={queries}
          onCreate={() => setEditing({ kind: "new" })}
          onEdit={(query) => setEditing({ kind: "edit", query })}
          onDuplicate={handleDuplicate}
          onDelete={(query) => deleteQuery(query.id)}
          onToggleEnabled={(query, enabled) => setQueryEnabled(query, enabled)}
        />
      ) : (
        <QueryForm
          accounts={accounts}
          initial={editing.kind === "edit" ? editing.query : undefined}
          onSubmit={handleSubmitQuery}
          onCancel={() => setEditing({ kind: "none" })}
        />
      )}
    </main>
  );
}
