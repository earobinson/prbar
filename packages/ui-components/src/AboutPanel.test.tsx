import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AboutPanel } from "./AboutPanel";

describe("AboutPanel", () => {
  it("renders the heading and app description", () => {
    render(<AboutPanel onOpenLink={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(screen.getByText(/PRBar/)).toBeInTheDocument();
  });

  it("shows the version when provided", () => {
    render(<AboutPanel version="1.2.3" onOpenLink={vi.fn()} />);
    expect(screen.getByText("Version 1.2.3")).toBeInTheDocument();
  });

  it("omits the version element when not provided", () => {
    render(<AboutPanel onOpenLink={vi.fn()} />);
    expect(screen.queryByText(/Version/)).toBeNull();
  });

  it("calls onOpenLink with the GitHub URL when the button is clicked", () => {
    const onOpenLink = vi.fn();
    render(<AboutPanel onOpenLink={onOpenLink} />);
    fireEvent.click(screen.getByRole("button", { name: /GitHub/i }));
    expect(onOpenLink).toHaveBeenCalledWith(
      "https://github.com/earobinson/prbar",
    );
  });
});
