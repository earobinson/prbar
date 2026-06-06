import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountForm } from "./AccountForm";

describe("AccountForm", () => {
  it("submits trimmed values for a new account", () => {
    const onSubmit = vi.fn();
    render(
      <AccountForm title="Add Account" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "  Work  " },
    });
    fireEvent.change(screen.getByLabelText("GitHub Username"), {
      target: { value: " octocat " },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: " tok " },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Work",
      githubUsername: "octocat",
      token: "tok",
    });
  });

  it("hides the token field and prefills when editing", () => {
    const onSubmit = vi.fn();
    render(
      <AccountForm
        title="Edit Account"
        requireToken={false}
        initial={{ name: "Work", githubUsername: "octocat" }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Personal Access Token")).toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Work",
    );
    expect(
      (screen.getByLabelText("GitHub Username") as HTMLInputElement).value,
    ).toBe("octocat");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Work",
      githubUsername: "octocat",
      token: "",
    });
  });

  it("allows a blank username when adding for auto-detection", () => {
    const onSubmit = vi.fn();
    render(
      <AccountForm title="Add Account" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    const username = screen.getByLabelText(
      "GitHub Username",
    ) as HTMLInputElement;
    expect(username.required).toBe(false);
    expect(
      screen.getByText(/detect it automatically from the token/i),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Work" },
    });
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: "tok" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Work",
      githubUsername: "",
      token: "tok",
    });
  });

  it("links to a fine-grained token", () => {
    render(
      <AccountForm title="Add Account" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    const link = screen.getByRole("link", {
      name: /fine-grained token/i,
    }) as HTMLAnchorElement;
    expect(link.href).toContain(
      "github.com/settings/personal-access-tokens/new",
    );
    // Explains why a too-narrowly-scoped token misses cross-org review requests.
    expect(screen.getByText(/review-requested:@me/)).toBeInTheDocument();
  });

  it("explains how to access organization pull requests", () => {
    render(
      <AccountForm title="Add Account" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    // Org repos require the token's resource owner to be the organization.
    expect(screen.getByText(/Resource owner/)).toBeInTheDocument();
    expect(screen.getByText(/separate account/)).toBeInTheDocument();
  });

  it("calls onCancel when cancelled", () => {
    const onCancel = vi.fn();
    render(
      <AccountForm title="Add Account" onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows only the token field in tokenOnly mode", () => {
    const onSubmit = vi.fn();
    render(
      <AccountForm
        title="Update Token"
        tokenOnly
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("GitHub Username")).toBeNull();
    fireEvent.change(screen.getByLabelText("Personal Access Token"), {
      target: { value: " new-token " },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "",
      githubUsername: "",
      token: "new-token",
    });
  });
});
