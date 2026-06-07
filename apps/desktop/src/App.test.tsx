import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GitHubAccount, Query } from "@prbar/shared-types";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.1.0"),
}));

vi.mock("@prbar/version", () => ({
  version: { major: 0, minor: 1, patch: 0, build: 7 },
}));

const actions = {
  loadAll: vi.fn(),
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  setAccountToken: vi.fn(),
  removeAccount: vi.fn(),
  saveQuery: vi.fn(),
  deleteQuery: vi.fn(),
  setQueryEnabled: vi.fn(),
  loadLogs: vi.fn(),
  saveLogSettings: vi.fn(),
  clearLogs: vi.fn(),
  saveDevSettings: vi.fn(),
};

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

let storeState: Record<string, unknown>;

vi.mock("./store", () => ({
  useAppStore: () => storeState,
}));

const validateAccount = vi.fn();
vi.mock("./api", () => ({
  api: { validateAccount: (...a: unknown[]) => validateAccount(...a) },
}));

import { App } from "./App";

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    accounts: [account],
    queries: [query],
    logs: [
      {
        id: 1,
        timestamp: "2026-01-01 09:00:00",
        level: "info",
        message: "PRBar started",
      },
    ],
    logSettings: { level: "info", retentionDays: 3 },
    devSettings: { tokenStorage: "keychain" },
    loading: false,
    error: null,
    ...actions,
    ...overrides,
  };
}

/** Switch the settings sidebar to the named tab. */
function openTab(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = makeState();
  vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
});

describe("App", () => {
  it("loads data on mount and renders accounts", () => {
    render(<App />);
    expect(actions.loadAll).toHaveBeenCalled();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("shows queries on the Queries tab", () => {
    render(<App />);
    openTab("Queries");
    expect(screen.getByText("My Reviews")).toBeInTheDocument();
  });

  it("renders loading and error states", () => {
    storeState = makeState({ loading: true, error: "boom" });
    render(<App />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("adds an account through the in-app form", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Add Account"));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Personal" },
    });
    fireEvent.change(screen.getByLabelText("GitHub Username"), {
      target: { value: "octofriend" },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: "token-123" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.addAccount).toHaveBeenCalledWith(
        { name: "Personal", githubUsername: "octofriend" },
        "token-123",
      ),
    );
  });

  it("aborts adding an account when cancelled", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Add Account"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(actions.addAccount).not.toHaveBeenCalled();
    expect(screen.getByText("Add Account")).toBeInTheDocument();
  });

  it("edits an account through the in-app form", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Edit"));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Work");
    fireEvent.change(nameInput, { target: { value: "Renamed" } });
    const usernameInput = screen.getByLabelText(
      "GitHub Username",
    ) as HTMLInputElement;
    expect(usernameInput.value).toBe("octocat");
    fireEvent.change(usernameInput, { target: { value: "octocat-new" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.updateAccount).toHaveBeenCalledWith(
        "a1",
        "Renamed",
        "octocat-new",
      ),
    );
  });

  it("shows an inline status when a token is valid", async () => {
    validateAccount.mockResolvedValue(true);
    render(<App />);
    fireEvent.click(screen.getByText("Validate Token"));
    await waitFor(() =>
      expect(screen.getByText("Token is valid")).toBeInTheDocument(),
    );
  });

  it("shows an inline status when a token is invalid", async () => {
    validateAccount.mockResolvedValue(false);
    render(<App />);
    fireEvent.click(screen.getByText("Validate Token"));
    await waitFor(() =>
      expect(screen.getByText("Token is invalid")).toBeInTheDocument(),
    );
  });

  it("updates the token for an existing account", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Update Token"));
    // Only the token field is shown in token-only mode.
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("GitHub Username")).toBeNull();
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: "fresh-token" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.setAccountToken).toHaveBeenCalledWith("a1", "fresh-token"),
    );
    await waitFor(() =>
      expect(screen.getByText("Token saved")).toBeInTheDocument(),
    );
  });

  it("shows the failure reason when validation errors", async () => {
    validateAccount.mockRejectedValue("github returned status 500");
    render(<App />);
    fireEvent.click(screen.getByText("Validate Token"));
    await waitFor(() =>
      expect(
        screen.getByText("Validation failed: github returned status 500"),
      ).toBeInTheDocument(),
    );
  });

  it("removes an account", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Remove"));
    expect(actions.removeAccount).toHaveBeenCalledWith("a1");
  });

  it("deletes a query", () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByText("Delete"));
    expect(actions.deleteQuery).toHaveBeenCalledWith("q1");
  });

  it("toggles a query's enabled flag", () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(actions.setQueryEnabled).toHaveBeenCalledWith(query, false);
  });

  it("opens the create form and cancels back to the list", () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByText("Create Query"));
    expect(screen.getByText("Save")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Create Query")).toBeInTheDocument();
  });

  it("creates a new query with a generated id", async () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByText("Create Query"));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.saveQuery).toHaveBeenCalledWith(
        expect.objectContaining({ id: "generated-id", name: "New" }),
      ),
    );
  });

  it("edits an existing query preserving its id", async () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.saveQuery).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q1" }),
      ),
    );
  });

  it("duplicates a query into the form and saves a new copy", async () => {
    render(<App />);
    openTab("Queries");
    fireEvent.click(screen.getByText("Duplicate"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "My Reviews (copy)",
    );
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.saveQuery).toHaveBeenCalledWith(
        expect.objectContaining({ id: "generated-id" }),
      ),
    );
  });

  it("shows logs and saves a changed log level", () => {
    render(<App />);
    openTab("Logs");
    expect(screen.getByText("PRBar started")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minimum level"), {
      target: { value: "debug" },
    });
    expect(actions.saveLogSettings).toHaveBeenCalledWith({
      level: "debug",
      retentionDays: 3,
    });
  });

  it("refreshes and clears logs", () => {
    render(<App />);
    openTab("Logs");
    fireEvent.click(screen.getByText("Refresh"));
    fireEvent.click(screen.getByText("Clear"));
    expect(actions.loadLogs).toHaveBeenCalled();
    expect(actions.clearLogs).toHaveBeenCalled();
  });

  it("toggles the token storage backend on the Development tab", () => {
    render(<App />);
    openTab("Development");
    fireEvent.click(screen.getByLabelText(/Encrypted database/));
    expect(actions.saveDevSettings).toHaveBeenCalledWith({
      tokenStorage: "database",
    });
  });

  it("shows the About tab with version and GitHub link", async () => {
    render(<App />);
    openTab("About");
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Version 0.1.0.7")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /GitHub/i })).toBeInTheDocument();
  });
});
