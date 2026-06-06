import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GitHubAccount, Query } from "@prbar/shared-types";
import { QueryForm } from "./QueryForm";

const accounts: GitHubAccount[] = [
  { id: "a1", name: "Work", githubUsername: "octocat" },
  { id: "a2", name: "Personal", githubUsername: "octofriend" },
];

const existing: Query = {
  id: "q1",
  accountIds: ["a1"],
  name: "My Reviews",
  searchQuery: "is:pr review-requested:@me",
  enabled: true,
  pollIntervalSeconds: 120,
  showInMenu: true,
  desktopNotifications: true,
  notifyOnNewMatches: true,
  notifyOnUpdates: false,
};

describe("QueryForm", () => {
  it("submits a new query without an id and with defaults", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm accounts={accounts} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New Query" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr author:@me" },
    });
    fireEvent.click(screen.getByText("Save"));

    expect(onSubmit).toHaveBeenCalledOnce();
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.id).toBeUndefined();
    expect(payload.name).toBe("New Query");
    expect(payload.accountIds).toEqual(["a1"]);
    expect(payload.pollIntervalSeconds).toBe(60);
  });

  it("preserves the id when editing an existing query", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm
        accounts={accounts}
        initial={existing}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit.mock.calls[0][0].id).toBe("q1");
  });

  it("passes the poll interval through on submit", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm accounts={accounts} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr" },
    });
    fireEvent.change(screen.getByLabelText("Poll Interval (seconds)"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit.mock.calls[0][0].pollIntervalSeconds).toBe(90);
  });

  it("adds and removes target accounts", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm accounts={accounts} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr" },
    });
    // "Work" (a1) is selected by default; add "Personal" (a2) as well.
    fireEvent.click(screen.getByLabelText("Personal"));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit.mock.calls[0][0].accountIds).toEqual(["a1", "a2"]);
  });

  it("can target a single account by deselecting the default", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm accounts={accounts} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr" },
    });
    fireEvent.click(screen.getByLabelText("Personal"));
    fireEvent.click(screen.getByLabelText("Work"));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit.mock.calls[0][0].accountIds).toEqual(["a2"]);
  });

  it("toggles each boolean option", () => {
    const onSubmit = vi.fn();
    render(
      <QueryForm
        accounts={accounts}
        initial={existing}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Show In Menu"));
    fireEvent.click(screen.getByLabelText("Desktop Notifications"));
    fireEvent.click(screen.getByLabelText("Notify On New Matches"));
    fireEvent.click(screen.getByLabelText("Notify On Updates"));
    fireEvent.click(screen.getByText("Save"));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.showInMenu).toBe(false);
    expect(payload.desktopNotifications).toBe(false);
    expect(payload.notifyOnNewMatches).toBe(false);
    expect(payload.notifyOnUpdates).toBe(true);
  });

  it("invokes onCancel", () => {
    const onCancel = vi.fn();
    render(
      <QueryForm accounts={accounts} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("starts with no target accounts when none exist", () => {
    const onSubmit = vi.fn();
    render(<QueryForm accounts={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Search Query"), {
      target: { value: "is:pr" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit.mock.calls[0][0].accountIds).toEqual([]);
  });
});
