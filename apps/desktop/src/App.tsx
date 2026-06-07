import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { version as versionInfo } from "@prbar/version";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import {
  AboutPanel,
  AccountForm,
  AccountList,
  QueryForm,
  QueryList,
  LogsPanel,
  DevPanel,
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
  | { kind: "edit"; account: GitHubAccount }
  | { kind: "token"; account: GitHubAccount };

type Tab = "accounts" | "queries" | "logs" | "development" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "accounts", label: "Accounts" },
  { id: "queries", label: "Queries" },
  { id: "logs", label: "Logs" },
  { id: "development", label: "Development" },
  { id: "about", label: "About" },
];

/**
 * The Settings window. Normal operation is from the tray; this window is
 * opened on demand from the right-click menu's "Settings" action.
 */
export function App() {
  const {
    accounts,
    queries,
    logs,
    logSettings,
    devSettings,
    loading,
    error,
    loadAll,
    addAccount,
    updateAccount,
    setAccountToken,
    removeAccount,
    saveQuery,
    deleteQuery,
    setQueryEnabled,
    loadLogs,
    saveLogSettings,
    clearLogs,
    saveDevSettings,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>("accounts");
  const [editing, setEditing] = useState<Editing>({ kind: "none" });
  const [accountEditing, setAccountEditing] = useState<AccountEditing>({
    kind: "none",
  });
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [appVersion, setAppVersion] = useState<string | undefined>();

  useEffect(() => {
    void loadAll();
    void getVersion()
      .then(setAppVersion)
      .catch(() => undefined);
  }, [loadAll]);

  async function handleAccountSubmit(values: AccountFormValues) {
    if (accountEditing.kind === "edit") {
      if (!values.name || !values.githubUsername) return;
      await updateAccount(
        accountEditing.account.id,
        values.name,
        values.githubUsername,
      );
    } else if (accountEditing.kind === "token") {
      if (!values.token) return;
      await setAccountToken(accountEditing.account.id, values.token);
      setStatuses((prev) => ({
        ...prev,
        [accountEditing.account.id]: "Token saved",
      }));
    } else {
      // Adding: the username may be left blank and detected from the token.
      if (!values.name || !values.token) return;
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

      <div className="settings-layout">
        <nav className="sidebar" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sidebar-tab${tab === t.id ? " active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {tab === "accounts" &&
            (accountEditing.kind === "none" ? (
              <AccountList
                accounts={accounts}
                statuses={statuses}
                onAdd={() => setAccountEditing({ kind: "new" })}
                onEdit={(account) =>
                  setAccountEditing({ kind: "edit", account })
                }
                onUpdateToken={(account) =>
                  setAccountEditing({ kind: "token", account })
                }
                onRemove={(a) => removeAccount(a.id)}
                onValidate={handleValidate}
              />
            ) : (
              <AccountForm
                title={
                  accountEditing.kind === "edit"
                    ? "Edit Account"
                    : accountEditing.kind === "token"
                      ? "Update Token"
                      : "Add Account"
                }
                requireToken={accountEditing.kind === "new"}
                tokenOnly={accountEditing.kind === "token"}
                initial={
                  accountEditing.kind === "edit"
                    ? {
                        name: accountEditing.account.name,
                        githubUsername: accountEditing.account.githubUsername,
                      }
                    : undefined
                }
                onSubmit={handleAccountSubmit}
                onCancel={() => setAccountEditing({ kind: "none" })}
              />
            ))}

          {tab === "queries" &&
            (editing.kind === "none" ? (
              <QueryList
                queries={queries}
                onCreate={() => setEditing({ kind: "new" })}
                onEdit={(query) => setEditing({ kind: "edit", query })}
                onDuplicate={handleDuplicate}
                onDelete={(query) => deleteQuery(query.id)}
                onToggleEnabled={(query, enabled) =>
                  setQueryEnabled(query, enabled)
                }
              />
            ) : (
              <QueryForm
                accounts={accounts}
                initial={editing.kind === "edit" ? editing.query : undefined}
                onSubmit={handleSubmitQuery}
                onCancel={() => setEditing({ kind: "none" })}
              />
            ))}

          {tab === "logs" && (
            <LogsPanel
              logs={logs}
              settings={logSettings}
              onChangeSettings={saveLogSettings}
              onRefresh={loadLogs}
              onClear={clearLogs}
            />
          )}

          {tab === "development" && (
            <DevPanel
              settings={devSettings}
              onChangeSettings={saveDevSettings}
            />
          )}

          {tab === "about" && (
            <AboutPanel
              version={appVersion}
              build={versionInfo.build}
              onOpenLink={api.openUrl}
            />
          )}
        </div>
      </div>
    </main>
  );
}
