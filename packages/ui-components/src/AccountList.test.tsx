import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GitHubAccount } from "@prbar/shared-types";
import { AccountList } from "./AccountList";

const accounts: GitHubAccount[] = [
  { id: "a1", name: "Work GitHub", githubUsername: "octocat" },
];

function setup(overrides: Partial<GitHubAccount>[] = []) {
  const handlers = {
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onValidate: vi.fn(),
    onUpdateToken: vi.fn(),
  };
  const data =
    overrides.length === 0
      ? accounts
      : overrides.map((o, i) => ({ ...accounts[0], id: `a${i}`, ...o }));
  render(<AccountList accounts={data} {...handlers} />);
  return handlers;
}

describe("AccountList", () => {
  it("shows the empty state when there are no accounts", () => {
    render(
      <AccountList
        accounts={[]}
        onAdd={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onValidate={vi.fn()}
        onUpdateToken={vi.fn()}
      />,
    );
    expect(screen.getByText("No accounts configured.")).toBeInTheDocument();
  });

  it("renders account name and username", () => {
    setup();
    expect(screen.getByText("Work GitHub")).toBeInTheDocument();
    expect(screen.getByText("@octocat")).toBeInTheDocument();
  });

  it("invokes onAdd", () => {
    const handlers = setup();
    fireEvent.click(screen.getByText("Add Account"));
    expect(handlers.onAdd).toHaveBeenCalledOnce();
  });

  it("invokes per-row actions with the account", () => {
    const handlers = setup();
    fireEvent.click(screen.getByText("Validate Token"));
    fireEvent.click(screen.getByText("Update Token"));
    fireEvent.click(screen.getByText("Rename"));
    fireEvent.click(screen.getByText("Remove"));
    expect(handlers.onValidate).toHaveBeenCalledWith(accounts[0]);
    expect(handlers.onUpdateToken).toHaveBeenCalledWith(accounts[0]);
    expect(handlers.onRename).toHaveBeenCalledWith(accounts[0]);
    expect(handlers.onRemove).toHaveBeenCalledWith(accounts[0]);
  });

  it("renders a validation status when provided", () => {
    render(
      <AccountList
        accounts={accounts}
        onAdd={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onValidate={vi.fn()}
        onUpdateToken={vi.fn()}
        statuses={{ a1: "Token is valid" }}
      />,
    );
    expect(screen.getByText("Token is valid")).toBeInTheDocument();
  });
});
