import type { LogEntry, LogLevel, LogSettings } from "@prbar/shared-types";
import { LOG_LEVELS, LOG_RETENTION, clampRetentionDays } from "@prbar/shared-types";

export interface LogsPanelProps {
  logs: LogEntry[];
  settings: LogSettings;
  onChangeSettings: (settings: LogSettings) => void;
  onRefresh: () => void;
  onClear: () => void;
}

/**
 * Settings panel showing the persisted application logs plus controls for the
 * minimum level to store and how many days of history to keep.
 */
export function LogsPanel({
  logs,
  settings,
  onChangeSettings,
  onRefresh,
  onClear,
}: LogsPanelProps) {
  return (
    <section className="logs-panel">
      <header className="section-header">
        <h2>Logs</h2>
        <div className="logs-actions">
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
          <button type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </header>

      <div className="logs-settings">
        <label>
          Minimum level
          <select
            value={settings.level}
            onChange={(e) =>
              onChangeSettings({
                ...settings,
                level: e.target.value as LogLevel,
              })
            }
          >
            {LOG_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label>
          Days to keep
          <input
            type="number"
            min={LOG_RETENTION.min}
            max={LOG_RETENTION.max}
            value={settings.retentionDays}
            onChange={(e) =>
              onChangeSettings({
                ...settings,
                retentionDays: clampRetentionDays(Number(e.target.value)),
              })
            }
          />
        </label>
      </div>

      {logs.length === 0 ? (
        <p className="empty">No logs recorded.</p>
      ) : (
        <ul className="log-list">
          {logs.map((entry) => (
            <li key={entry.id} className="log-row">
              <span className="log-time">{entry.timestamp}</span>
              <span className={`log-level log-level-${entry.level}`}>
                {entry.level}
              </span>
              <span className="log-message">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
