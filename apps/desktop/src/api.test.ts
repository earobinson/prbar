import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { api } from "./api";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

describe("api", () => {
  it("listAccounts calls the right command", async () => {
    invoke.mockResolvedValue([{ id: "a1" }]);
    await expect(api.listAccounts()).resolves.toEqual([{ id: "a1" }]);
    expect(invoke).toHaveBeenCalledWith("list_accounts");
  });

  it("addAccount forwards account and token", async () => {
    const account = { name: "Work", githubUsername: "octocat" };
    await api.addAccount(account, "tok");
    expect(invoke).toHaveBeenCalledWith("add_account", {
      account,
      token: "tok",
    });
  });

  it("renameAccount forwards id and name", async () => {
    await api.renameAccount("a1", "New");
    expect(invoke).toHaveBeenCalledWith("rename_account", {
      id: "a1",
      name: "New",
    });
  });

  it("removeAccount forwards id", async () => {
    await api.removeAccount("a1");
    expect(invoke).toHaveBeenCalledWith("remove_account", { id: "a1" });
  });

  it("validateAccount forwards id", async () => {
    invoke.mockResolvedValue(true);
    await expect(api.validateAccount("a1")).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("validate_account", { id: "a1" });
  });

  it("listQueries calls the right command", async () => {
    invoke.mockResolvedValue([]);
    await api.listQueries();
    expect(invoke).toHaveBeenCalledWith("list_queries");
  });

  it("saveQuery forwards the query", async () => {
    const query = { id: "q1" } as never;
    await api.saveQuery(query);
    expect(invoke).toHaveBeenCalledWith("save_query", { query });
  });

  it("deleteQuery forwards id", async () => {
    await api.deleteQuery("q1");
    expect(invoke).toHaveBeenCalledWith("delete_query", { id: "q1" });
  });

  it("listMatches calls the right command", async () => {
    invoke.mockResolvedValue([]);
    await api.listMatches();
    expect(invoke).toHaveBeenCalledWith("list_matches");
  });

  it("refreshNow calls the right command", async () => {
    await api.refreshNow();
    expect(invoke).toHaveBeenCalledWith("refresh_now");
  });

  it("openUrl forwards the url", async () => {
    await api.openUrl("https://example.com");
    expect(invoke).toHaveBeenCalledWith("open_url", {
      url: "https://example.com",
    });
  });
});
