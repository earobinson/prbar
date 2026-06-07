const GITHUB_URL = "https://github.com/earobinson/prbar";
const LICENSE_URL = "https://github.com/earobinson/prbar/blob/main/LICENSE";

export interface AboutPanelProps {
  version?: string;
  build?: number;
  onOpenLink: (url: string) => void;
}

/**
 * Informational panel shown in the Settings sidebar. Displays a short blurb
 * about the app, the running version, and a link to the GitHub repository.
 * When a build number is supplied it is appended as the last part of the
 * version (e.g. `1.2.3.45`).
 */
export function AboutPanel({ version, build, onOpenLink }: AboutPanelProps) {
  return (
    <section className="about-panel">
      <header className="section-header">
        <h2>About</h2>
      </header>

      <div className="about-content">
        <p>
          <strong>PRBar</strong> is a macOS menu bar app that keeps your GitHub
          pull requests front and centre. It polls your saved searches and
          surfaces review requests, open PRs, and mentions right from the menu
          bar — no browser tab required.
        </p>

        {version && (
          <p className="about-version">
            Version {version}
            {build !== undefined ? `.${build}` : ""}
          </p>
        )}

        <p>
          <button
            type="button"
            className="about-link"
            onClick={() => onOpenLink(GITHUB_URL)}
          >
            View on GitHub ↗
          </button>
        </p>

        <p className="about-license">
          Open source under the{" "}
          <button
            type="button"
            className="about-link"
            onClick={() => onOpenLink(LICENSE_URL)}
          >
            MIT License ↗
          </button>
        </p>
      </div>
    </section>
  );
}
