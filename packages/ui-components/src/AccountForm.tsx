import { useState } from "react";

export interface AccountFormValues {
  name: string;
  githubUsername: string;
  token: string;
}

/**
 * Attributes that stop the webview from "helpfully" auto-capitalizing,
 * autocorrecting, or spellchecking free-text fields. GitHub usernames and
 * search queries are case- and spelling-sensitive, so these corrections only
 * corrupt input (e.g. turning "edward-beacon" into "Edward-beacon").
 */
const NO_AUTO_FIX = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;

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
            {...NO_AUTO_FIX}
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
            required={!requireToken}
            {...NO_AUTO_FIX}
          />
        </label>
      )}
      {!tokenOnly && requireToken && (
        <span className="field-hint">
          Username is optional — leave it blank to detect it automatically from
          the token.
        </span>
      )}

      {showToken && (
        <label>
          Personal Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Fine-grained token with Pull requests: Read access"
            required
            autoComplete="off"
            {...NO_AUTO_FIX}
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
          Create a fine-grained token →
        </a>
      )}
      {showToken && (
        <p className="token-hint">
          Use a <strong>fine-grained</strong> personal access token with{" "}
          <code>Pull requests</code> set to <code>Read</code>. Grant it access to
          every organization and repository whose pull requests you want to
          track, otherwise queries like <code>review-requested:@me</code> miss
          pull requests you can't see.
        </p>
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
