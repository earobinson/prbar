import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatchMenu, type MenuMatch } from "./MatchMenu";

function menuMatch(id: number, queryName: string): MenuMatch {
  return {
    queryId: "q1",
    pullRequestId: id,
    repository: "myorg/webapp",
    title: `PR ${id}`,
    url: `https://github.com/myorg/webapp/pull/${id}`,
    updatedAt: "2026-01-01T00:00:00Z",
    queryName,
  };
}

describe("MatchMenu", () => {
  it("shows the empty state and a zero plural count", () => {
    render(<MatchMenu matches={[]} onOpen={vi.fn()} />);
    expect(screen.getByText("No matching pull requests.")).toBeInTheDocument();
    expect(screen.getByText("0 Matching Pull Requests")).toBeInTheDocument();
  });

  it("uses the singular form for exactly one match", () => {
    render(
      <MatchMenu matches={[menuMatch(1, "My Reviews")]} onOpen={vi.fn()} />,
    );
    expect(screen.getByText("1 Matching Pull Request")).toBeInTheDocument();
  });

  it("renders the query label and title and opens on click", () => {
    const onOpen = vi.fn();
    const match = menuMatch(1, "My Reviews");
    render(<MatchMenu matches={[match]} onOpen={onOpen} />);
    expect(screen.getByText("[My Reviews]")).toBeInTheDocument();
    fireEvent.click(screen.getByText("PR 1"));
    expect(onOpen).toHaveBeenCalledWith(match);
  });

  it("renders the plural form for multiple matches", () => {
    render(
      <MatchMenu
        matches={[menuMatch(1, "A"), menuMatch(2, "B")]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("2 Matching Pull Requests")).toBeInTheDocument();
  });
});
