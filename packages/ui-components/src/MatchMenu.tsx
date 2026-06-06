import type { Match } from "@prbar/shared-types";

export interface MenuMatch extends Match {
  /** Display name of the owning query, shown as a bracketed label. */
  queryName: string;
}

export interface MatchMenuProps {
  matches: MenuMatch[];
  onOpen: (match: MenuMatch) => void;
}

/**
 * The left-click menu content: a flat list of matching pull requests
 * grouped visually by query name, with a total count footer.
 */
export function MatchMenu({ matches, onOpen }: MatchMenuProps) {
  return (
    <div className="match-menu">
      <h1 className="app-title">PRBar</h1>
      <hr />
      {matches.length === 0 ? (
        <p className="empty">No matching pull requests.</p>
      ) : (
        <ul>
          {matches.map((match) => (
            <li key={`${match.queryId}:${match.pullRequestId}`}>
              <button
                type="button"
                className="match-item"
                onClick={() => onOpen(match)}
              >
                <span className="match-label">[{match.queryName}]</span>
                <span className="match-title">{match.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <hr />
      <footer className="match-count">
        {matches.length} Matching Pull Request
        {matches.length === 1 ? "" : "s"}
      </footer>
    </div>
  );
}
