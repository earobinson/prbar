import { useEffect, useState } from "react";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import { AccountList, QueryForm, QueryList } from "@prbar/ui-components";
import { useAppStore } from "./store";
import { api } from "./api";

type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; query: Query };

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

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleAddAccount() {
    const name = window.prompt("Account name (e.g. Work GitHub)")?.trim();
    if (!name) return;
    const githubUsername = window.prompt("GitHub username")?.trim();
    if (!githubUsername) return;
    const token = window.prompt("Personal access token (repo, read:org)");
    if (!token) return;
    await addAccount({ name, githubUsername }, token);
  }

  async function handleRename(account: GitHubAccount) {
    const name = window.prompt("New account name", account.name)?.trim();
    if (name) await renameAccount(account.id, name);
  }

  async function handleValidate(account: GitHubAccount) {
    const ok = await api.validateAccount(account.id);
    window.alert(ok ? "Token is valid." : "Token is invalid.");
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

      <AccountList
        accounts={accounts}
        onAdd={handleAddAccount}
        onRename={handleRename}
        onRemove={(a) => removeAccount(a.id)}
        onValidate={handleValidate}
      />

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
