import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubAccount, Query } from "@prbar/shared-types";

vi.mock("./api", () => ({
  api: {
    listAccounts: vi.fn(),
    listQueries: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    fetchGithubLogin: vi.fn(),
    setAccountToken: vi.fn(),
    removeAccount: vi.fn(),
    saveQuery: vi.fn(),
    deleteQuery: vi.fn(),
    listLogs: vi.fn(),
    clearLogs: vi.fn(),
    getLogSettings: vi.fn(),
    setLogSettings: vi.fn(),
    getDevSettings: vi.fn(),
    setDevSettings: vi.fn(),
  },
}));

import { api } from "./api";
import { useAppStore } from "./store";

const mockApi = vi.mocked(api);

const account: GitHubAccount = {
  id: "a1",
  name: "Work",
  githubUsername: "octocat",
};

const query: Query = {
  id: "q1",
  accountIds: ["a1"],
  name: "My Reviews",
  searchQuery: "is:pr",
  enabled: true,
  pollIntervalSeconds: 60,
  showInMenu: true,
  desktopNotifications: true,
  notifyOnNewMatches: true,
  notifyOnUpdates: false,
};

const logEntry = {
  id: 1,
  timestamp: "2026-01-01 09:00:00",
  level: "info" as const,
  message: "hello",
};

const logSettings = { level: "info" as const, retentionDays: 3 };
const devSettings = { tokenStorage: "keychain" as const };

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    accounts: [],
    queries: [],
    logs: [],
    loading: false,
    error: null,
  });
  mockApi.listAccounts.mockResolvedValue([account]);
  mockApi.listQueries.mockResolvedValue([query]);
  mockApi.addAccount.mockResolvedValue(account);
  mockApi.updateAccount.mockResolvedValue(undefined);
  mockApi.setAccountToken.mockResolvedValue(undefined);
  mockApi.removeAccount.mockResolvedValue(undefined);
  mockApi.saveQuery.mockResolvedValue(query);
  mockApi.deleteQuery.mockResolvedValue(undefined);
  mockApi.listLogs.mockResolvedValue([logEntry]);
  mockApi.clearLogs.mockResolvedValue(undefined);
  mockApi.getLogSettings.mockResolvedValue(logSettings);
  mockApi.setLogSettings.mockResolvedValue(logSettings);
  mockApi.getDevSettings.mockResolvedValue(devSettings);
  mockApi.setDevSettings.mockResolvedValue(devSettings);
});

describe("useAppStore", () => {
  it("loadAll populates accounts and queries", async () => {
    await useAppStore.getState().loadAll();
    const state = useAppStore.getState();
    expect(state.accounts).toEqual([account]);
    expect(state.queries).toEqual([query]);
    expect(state.logs).toEqual([logEntry]);
    expect(state.logSettings).toEqual(logSettings);
    expect(state.devSettings).toEqual(devSettings);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("loadAll records an error on failure", async () => {
    mockApi.listAccounts.mockRejectedValue(new Error("offline"));
    await useAppStore.getState().loadAll();
    const state = useAppStore.getState();
    expect(state.error).toContain("offline");
    expect(state.loading).toBe(false);
  });

  it("addAccount delegates to the api then reloads", async () => {
    await useAppStore
      .getState()
      .addAccount({ name: "Work", githubUsername: "octocat" }, "tok");
    expect(mockApi.addAccount).toHaveBeenCalledWith(
      { name: "Work", githubUsername: "octocat" },
      "tok",
    );
    expect(mockApi.listAccounts).toHaveBeenCalled();
  });

  it("updateAccount delegates and reloads", async () => {
    await useAppStore.getState().updateAccount("a1", "New", "octocat");
    expect(mockApi.updateAccount).toHaveBeenCalledWith("a1", "New", "octocat");
    expect(mockApi.listAccounts).toHaveBeenCalled();
  });

  it("removeAccount delegates and reloads", async () => {
    await useAppStore.getState().removeAccount("a1");
    expect(mockApi.removeAccount).toHaveBeenCalledWith("a1");
    expect(mockApi.listAccounts).toHaveBeenCalled();
  });

  it("saveQuery delegates and reloads", async () => {
    await useAppStore.getState().saveQuery(query);
    expect(mockApi.saveQuery).toHaveBeenCalledWith(query);
    expect(mockApi.listQueries).toHaveBeenCalled();
  });

  it("deleteQuery delegates and reloads", async () => {
    await useAppStore.getState().deleteQuery("q1");
    expect(mockApi.deleteQuery).toHaveBeenCalledWith("q1");
    expect(mockApi.listQueries).toHaveBeenCalled();
  });

  it("setQueryEnabled saves the query with the new flag", async () => {
    await useAppStore.getState().setQueryEnabled(query, false);
    expect(mockApi.saveQuery).toHaveBeenCalledWith({
      ...query,
      enabled: false,
    });
  });

  it("setAccountToken delegates and reloads", async () => {
    await useAppStore.getState().setAccountToken("a1", "tok");
    expect(mockApi.setAccountToken).toHaveBeenCalledWith("a1", "tok");
    expect(mockApi.listAccounts).toHaveBeenCalled();
  });

  it("loadLogs refreshes only the logs", async () => {
    await useAppStore.getState().loadLogs();
    expect(mockApi.listLogs).toHaveBeenCalled();
    expect(useAppStore.getState().logs).toEqual([logEntry]);
  });

  it("saveLogSettings persists settings and reloads logs", async () => {
    const next = { level: "debug" as const, retentionDays: 7 };
    mockApi.setLogSettings.mockResolvedValue(next);
    await useAppStore.getState().saveLogSettings(next);
    expect(mockApi.setLogSettings).toHaveBeenCalledWith(next);
    expect(mockApi.listLogs).toHaveBeenCalled();
    expect(useAppStore.getState().logSettings).toEqual(next);
  });

  it("clearLogs empties the logs", async () => {
    useAppStore.setState({ logs: [logEntry] });
    await useAppStore.getState().clearLogs();
    expect(mockApi.clearLogs).toHaveBeenCalled();
    expect(useAppStore.getState().logs).toEqual([]);
  });

  it("saveDevSettings persists the storage backend", async () => {
    const next = { tokenStorage: "database" as const };
    mockApi.setDevSettings.mockResolvedValue(next);
    await useAppStore.getState().saveDevSettings(next);
    expect(mockApi.setDevSettings).toHaveBeenCalledWith(next);
    expect(useAppStore.getState().devSettings).toEqual(next);
  });
});
