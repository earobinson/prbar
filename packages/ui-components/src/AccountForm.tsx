import { useState } from "react";

export interface AccountFormValues {
  name: string;
  githubUsername: string;
  token: string;
}

export interface AccountFormProps {
  /** Heading shown above the form. */
  title: string;
  initial?: { name: string; githubUsername: string };
  /** Whether the personal access token field is shown and required. */
  requireToken?: boolean;
  /** When true, only the token field is shown (repair an existing account). */
  tokenOnly?: boolean;
  onSubmit: (values: AccountFormValues) => void;
  onCancel: () => void;
}

/**
 * In-app form for adding or renaming a GitHub account. Tauri's webview does
 * not support `window.prompt`, so account input is collected here.
 */
export function AccountForm({
  title,
  initial,
  requireToken = true,
  tokenOnly = false,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [githubUsername, setGithubUsername] = useState(
    initial?.githubUsername ?? "",
  );
  const [token, setToken] = useState("");
  const showToken = requireToken || tokenOnly;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      githubUsername: githubUsername.trim(),
      token: token.trim(),
    });
  }

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <h3>{title}</h3>

      {!tokenOnly && (
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Work GitHub"
            required
          />
        </label>
      )}

      {!tokenOnly && (
        <label>
          GitHub Username
          <input
            value={githubUsername}
            onChange={(e) => setGithubUsername(e.target.value)}
            placeholder="octocat"
            required
          />
        </label>
      )}

      {showToken && (
        <label>
          Personal Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Pull requests: Read, Contents: Read"
            required
            autoComplete="off"
          />
        </label>
      )}
      {showToken && (
        <a
          className="token-help"
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
        >
          Create a fine-grained personal access token →
        </a>
      )}

      <div className="form-actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
