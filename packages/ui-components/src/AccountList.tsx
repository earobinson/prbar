import type { GitHubAccount } from "@prbar/shared-types";

export interface AccountListProps {
  accounts: GitHubAccount[];
  onAdd: () => void;
  onRename: (account: GitHubAccount) => void;
  onRemove: (account: GitHubAccount) => void;
  onValidate: (account: GitHubAccount) => void;
  onUpdateToken: (account: GitHubAccount) => void;
  /** Per-account validation status messages, keyed by account id. */
  statuses?: Record<string, string>;
}

/**
 * Settings panel listing configured GitHub accounts with management
 * actions: add, rename, remove and validate token.
 */
export function AccountList({
  accounts,
  onAdd,
  onRename,
  onRemove,
  onValidate,
  onUpdateToken,
  statuses = {},
}: AccountListProps) {
  return (
    <section className="account-list">
      <header className="section-header">
        <h2>Accounts</h2>
        <button type="button" onClick={onAdd}>
          Add Account
        </button>
      </header>
      {accounts.length === 0 ? (
        <p className="empty">No accounts configured.</p>
      ) : (
        <ul>
          {accounts.map((account) => (
            <li key={account.id} className="account-row">
              <div className="account-meta">
                <span className="account-name">{account.name}</span>
                <span className="account-username">
                  @{account.githubUsername}
                </span>
                {statuses[account.id] && (
                  <span className="account-status">
                    {statuses[account.id]}
                  </span>
                )}
              </div>
              <div className="account-actions">
                <button type="button" onClick={() => onValidate(account)}>
                  Validate Token
                </button>
                <button type="button" onClick={() => onUpdateToken(account)}>
                  Update Token
                </button>
                <button type="button" onClick={() => onRename(account)}>
                  Rename
                </button>
                <button type="button" onClick={() => onRemove(account)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
