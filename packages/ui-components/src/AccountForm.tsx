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
  onSubmit,
  onCancel,
}: AccountFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [githubUsername, setGithubUsername] = useState(
    initial?.githubUsername ?? "",
  );
  const [token, setToken] = useState("");

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

      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Work GitHub"
          required
        />
      </label>

      <label>
        GitHub Username
        <input
          value={githubUsername}
          onChange={(e) => setGithubUsername(e.target.value)}
          placeholder="octocat"
          required
        />
      </label>

      {requireToken && (
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
      {requireToken && (
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
