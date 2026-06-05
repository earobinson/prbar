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
  | { kind: "rename"; account: GitHubAccount }
  | { kind: "token"; account: GitHubAccount };

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
    setAccountToken,
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
    if (accountEditing.kind === "rename") {
      if (!values.name) return;
      await renameAccount(accountEditing.account.id, values.name);
    } else if (accountEditing.kind === "token") {
      if (!values.token) return;
      await setAccountToken(accountEditing.account.id, values.token);
      setStatuses((prev) => ({
        ...prev,
        [accountEditing.account.id]: "Token saved",
      }));
    } else {
      if (!values.name || !values.githubUsername || !values.token) return;
      await addAccount(
        { name: values.name, githubUsername: values.githubUsername },
        values.token,
      );
    }
    setAccountEditing({ kind: "none" });
  }

  async function handleValidate(account: GitHubAccount) {
    setStatuses((prev) => ({ ...prev, [account.id]: "Validating…" }));
    try {
      const ok = await api.validateAccount(account.id);
      setStatuses((prev) => ({
        ...prev,
        [account.id]: ok ? "Token is valid" : "Token is invalid",
      }));
    } catch (err) {
      setStatuses((prev) => ({
        ...prev,
        [account.id]: `Validation failed: ${String(err)}`,
      }));
    }
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
          onUpdateToken={(account) =>
            setAccountEditing({ kind: "token", account })
          }
          onRemove={(a) => removeAccount(a.id)}
          onValidate={handleValidate}
        />
      ) : (
        <AccountForm
          title={
            accountEditing.kind === "rename"
              ? "Rename Account"
              : accountEditing.kind === "token"
                ? "Update Token"
                : "Add Account"
          }
          requireToken={accountEditing.kind === "new"}
          tokenOnly={accountEditing.kind === "token"}
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
