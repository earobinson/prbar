import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubAccount, Query } from "@prbar/shared-types";

vi.mock("./api", () => ({
  api: {
    listAccounts: vi.fn(),
    listQueries: vi.fn(),
    addAccount: vi.fn(),
    renameAccount: vi.fn(),
    removeAccount: vi.fn(),
    saveQuery: vi.fn(),
    deleteQuery: vi.fn(),
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
  accountId: "a1",
  name: "My Reviews",
  searchQuery: "is:pr",
  enabled: true,
  pollIntervalSeconds: 60,
  showInMenu: true,
  desktopNotifications: true,
  notifyOnNewMatches: true,
  notifyOnUpdates: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    accounts: [],
    queries: [],
    loading: false,
    error: null,
  });
  mockApi.listAccounts.mockResolvedValue([account]);
  mockApi.listQueries.mockResolvedValue([query]);
  mockApi.addAccount.mockResolvedValue(account);
  mockApi.renameAccount.mockResolvedValue(undefined);
  mockApi.removeAccount.mockResolvedValue(undefined);
  mockApi.saveQuery.mockResolvedValue(query);
  mockApi.deleteQuery.mockResolvedValue(undefined);
});

describe("useAppStore", () => {
  it("loadAll populates accounts and queries", async () => {
    await useAppStore.getState().loadAll();
    const state = useAppStore.getState();
    expect(state.accounts).toEqual([account]);
    expect(state.queries).toEqual([query]);
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

  it("renameAccount delegates and reloads", async () => {
    await useAppStore.getState().renameAccount("a1", "New");
    expect(mockApi.renameAccount).toHaveBeenCalledWith("a1", "New");
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
});
