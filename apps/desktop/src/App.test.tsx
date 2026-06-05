import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GitHubAccount, Query } from "@prbar/shared-types";

const actions = {
  loadAll: vi.fn(),
  addAccount: vi.fn(),
  renameAccount: vi.fn(),
  removeAccount: vi.fn(),
  saveQuery: vi.fn(),
  deleteQuery: vi.fn(),
  setQueryEnabled: vi.fn(),
};

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
    loading: false,
    error: null,
    ...actions,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = makeState();
  vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
});

describe("App", () => {
  it("loads data on mount and renders accounts and queries", () => {
    render(<App />);
    expect(actions.loadAll).toHaveBeenCalled();
    expect(screen.getByText("Work")).toBeInTheDocument();
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

  it("renames an account through the in-app form", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Rename"));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Work");
    fireEvent.change(nameInput, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(actions.renameAccount).toHaveBeenCalledWith("a1", "Renamed"),
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

  it("removes an account", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Remove"));
    expect(actions.removeAccount).toHaveBeenCalledWith("a1");
  });

  it("deletes a query", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Delete"));
    expect(actions.deleteQuery).toHaveBeenCalledWith("q1");
  });

  it("toggles a query's enabled flag", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(actions.setQueryEnabled).toHaveBeenCalledWith(query, false);
  });

  it("opens the create form and cancels back to the list", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Create Query"));
    expect(screen.getByText("Save")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Create Query")).toBeInTheDocument();
  });

  it("creates a new query with a generated id", async () => {
    render(<App />);
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
});
