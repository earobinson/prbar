import type { DevSettings, TokenStorage } from "@prbar/shared-types";

export interface DevPanelProps {
  settings: DevSettings;
  onChangeSettings: (settings: DevSettings) => void;
}

const STORAGE_OPTIONS: { value: TokenStorage; label: string; hint: string }[] =
  [
    {
      value: "keychain",
      label: "OS keychain",
      hint: "Most secure. Uses the platform credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service). May prompt for your login password.",
    },
    {
      value: "database",
      label: "Encrypted database",
      hint: "Stores tokens AES-256-GCM encrypted in the app's local database. Avoids repeated keychain prompts during development; the encryption key is kept in a separate owner-only file.",
    },
  ];

/**
 * Developer settings panel. Currently exposes where account tokens are stored:
 * the OS keychain, or encrypted in the local database to avoid frequent
 * keychain password prompts.
 */
export function DevPanel({ settings, onChangeSettings }: DevPanelProps) {
  return (
    <section className="dev-panel">
      <header className="section-header">
        <h2>Development</h2>
      </header>

      <fieldset className="dev-fieldset">
        <legend>Token storage</legend>
        {STORAGE_OPTIONS.map((option) => (
          <label key={option.value} className="dev-option">
            <input
              type="radio"
              name="token-storage"
              value={option.value}
              checked={settings.tokenStorage === option.value}
              onChange={() =>
                onChangeSettings({ ...settings, tokenStorage: option.value })
              }
            />
            <span className="dev-option-body">
              <span className="dev-option-label">{option.label}</span>
              <span className="dev-option-hint">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
