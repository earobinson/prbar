import type { Query } from "@prbar/shared-types";

export interface QueryListProps {
  queries: Query[];
  onCreate: () => void;
  onEdit: (query: Query) => void;
  onDuplicate: (query: Query) => void;
  onDelete: (query: Query) => void;
  onToggleEnabled: (query: Query, enabled: boolean) => void;
}

/**
 * Settings panel listing saved queries with management actions: create,
 * edit, duplicate, delete, enable and disable.
 */
export function QueryList({
  queries,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleEnabled,
}: QueryListProps) {
  return (
    <section className="query-list">
      <header className="section-header">
        <h2>Queries</h2>
        <button type="button" onClick={onCreate}>
          Create Query
        </button>
      </header>
      {queries.length === 0 ? (
        <p className="empty">No queries yet.</p>
      ) : (
        <ul>
          {queries.map((query) => (
            <li key={query.id} className="query-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={query.enabled}
                  onChange={(e) => onToggleEnabled(query, e.target.checked)}
                />
                <span className="query-name">{query.name}</span>
              </label>
              <code className="query-search">{query.searchQuery}</code>
              <div className="query-actions">
                <button type="button" onClick={() => onEdit(query)}>
                  Edit
                </button>
                <button type="button" onClick={() => onDuplicate(query)}>
                  Duplicate
                </button>
                <button type="button" onClick={() => onDelete(query)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
