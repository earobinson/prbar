import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Query } from "@prbar/shared-types";
import { QueryList } from "./QueryList";

const query: Query = {
  id: "q1",
  accountIds: ["a1"],
  name: "My Reviews",
  searchQuery: "is:pr review-requested:@me",
  enabled: true,
  pollIntervalSeconds: 60,
  showInMenu: true,
  desktopNotifications: true,
  notifyOnNewMatches: true,
  notifyOnUpdates: false,
};

function setup(queries: Query[]) {
  const handlers = {
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onToggleEnabled: vi.fn(),
  };
  render(<QueryList queries={queries} {...handlers} />);
  return handlers;
}

describe("QueryList", () => {
  it("shows the empty state when there are no queries", () => {
    setup([]);
    expect(screen.getByText("No queries yet.")).toBeInTheDocument();
  });

  it("renders the query name and search", () => {
    setup([query]);
    expect(screen.getByText("My Reviews")).toBeInTheDocument();
    expect(screen.getByText("is:pr review-requested:@me")).toBeInTheDocument();
  });

  it("invokes create, edit, duplicate and delete", () => {
    const handlers = setup([query]);
    fireEvent.click(screen.getByText("Create Query"));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Duplicate"));
    fireEvent.click(screen.getByText("Delete"));
    expect(handlers.onCreate).toHaveBeenCalledOnce();
    expect(handlers.onEdit).toHaveBeenCalledWith(query);
    expect(handlers.onDuplicate).toHaveBeenCalledWith(query);
    expect(handlers.onDelete).toHaveBeenCalledWith(query);
  });

  it("toggles enabled state via the checkbox", () => {
    const handlers = setup([query]);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(query, false);
  });
});
