# PRBar

PRBar is a lightweight, cross-platform desktop application that lives in the
macOS menu bar or the Windows/Linux system tray and monitors pull requests
across one or more GitHub accounts.

You define saved search queries using native GitHub search syntax. PRBar polls
GitHub on a per-query interval and surfaces matches as tray menu items and
desktop notifications. No backend service is required and authentication
tokens are stored only in the operating system credential store.

## Features

- Cross-platform (macOS, Windows, Linux) via Tauri v2
- Multiple GitHub accounts
- Unlimited saved search queries (passed verbatim to GitHub)
- Per-query menu visibility and notification settings
- Desktop notifications for new and updated matches
- Tray indicator showing the aggregate match count
- Secure credential storage (Keychain / Credential Manager / Secret Service)
- Low idle CPU and memory usage

## Tech stack

| Layer           | Technology                        |
| --------------- | --------------------------------- |
| Desktop shell   | Tauri v2 (Rust)                   |
| Frontend        | React + TypeScript + Vite         |
| State           | Zustand                           |
| Data fetching   | TanStack Query                    |
| Local storage   | SQLite (`rusqlite`)               |
| Credentials     | OS credential store (`keyring`)   |
| Package manager | pnpm (workspaces)                 |
| Tests           | Vitest (TS) + `cargo test` (Rust) |

## Repository layout

```
prbar/
├── apps/
│   └── desktop/             # Tauri app: React frontend + Rust backend
│       ├── src/             # React UI (settings window + tray bridge)
│       └── src-tauri/       # Rust: SQLite, keychain, GitHub polling, tray
├── packages/
│   ├── version/             # Single source of truth for the app version
│   ├── shared-types/        # Core interfaces (Account, Query, Match)
│   ├── provider-core/       # Provider interface + PullRequest type
│   ├── github-provider/     # GitHub implementation of Provider
│   ├── query-engine/        # Match detection, diffing, poll scheduler
│   ├── notification-engine/ # Notification generation from diffs
│   └── ui-components/        # Reusable React components
└── .github/workflows/        # CI + multi-platform release builds
```

The polling/diffing/notification logic exists in both TypeScript (for the
shared engine packages and their tests) and Rust (the backend that actually
runs the background poller). Both are covered by unit tests.

## Prerequisites

- Node.js 22 LTS
- pnpm >= 10
- Rust stable toolchain (for the desktop backend)
- Platform Tauri dependencies — see the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Getting started

```bash
pnpm install

# Run all checks
pnpm typecheck
pnpm lint
pnpm test            # or: pnpm coverage

# Run the desktop app in development
pnpm dev             # Vite dev server only
pnpm tauri dev       # full Tauri app (requires Rust)
```

### GitHub token

Each account uses a GitHub **fine-grained** personal access token. Under
**Repository access**, select the repositories whose pull requests you want to
track.

PRBar only calls the `GET /search/issues` and `GET /user` endpoints, neither of
which requires a permission scope — the automatic **Metadata: Read** that comes
with any repository access is enough. You do **not** need to grant `Contents`,
`Pull requests`, or any other permission; what matters is that the token can
_access_ the repositories.

To track pull requests in an organization you don't personally own, set the
token's **Resource owner** to that organization and grant it access to the
relevant repositories. A fine-grained token can only target a single owner, so
add a separate PRBar account (each with its own token) per organization. The
organization may also require an admin to approve the token before
`review-requested:@me` returns its pull requests.

Tokens are written to the OS credential store and never persisted in SQLite.

## Testing

`pnpm test` runs the full Vitest suite (engine packages **and** the React
UI/desktop frontend) in a jsdom environment.

```bash
pnpm test                                 # all TypeScript/React tests
pnpm coverage                             # enforces 80%+ branch coverage
cd apps/desktop/src-tauri && cargo test   # Rust backend
```

Coverage thresholds (80% lines/branches/functions/statements) are enforced
for every package and the desktop frontend via `vitest.config.ts`.

## Building

Build release binaries with the workspace script:

```bash
pnpm build:release
```

This command compiles the desktop app and creates platform-specific installers
and bundles under:

```text
apps/desktop/src-tauri/target/release/bundle/
```

You can pass additional Tauri build flags through the pnpm script. For example:

```bash
pnpm build:release -- --bundles dmg
```

Release artifacts for macOS (Apple Silicon & Intel), Windows x64, and Linux x64
are produced automatically by the `Release` GitHub Actions workflow on tag push.

The release build regenerates the desktop icon assets from
`apps/desktop/src-tauri/app-icon.svg` before bundling.

## Versioning

The whole workspace shares one version. The single source of truth is the
`@prbar/version` package, which stores the **major**, **minor**, **patch**, and
**build** numbers in `packages/version/src/version.json`:

```json
{
  "major": 0,
  "minor": 1,
  "patch": 0,
  "build": 0
}
```

Import it anywhere in the TypeScript code:

```ts
import { version, versionString, displayVersion } from "@prbar/version";

versionString; // "0.1.0"          (MAJOR.MINOR.PATCH)
displayVersion; // "0.1.0"         (adds " (build N)" when build > 0)
version.build; // 0
```

### Setting the version

Use the `version:sync` script to set the numbers and propagate the
`MAJOR.MINOR.PATCH` version to **every** package and app manifest at once
(the root `package.json`, all workspace `package.json` files,
`apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`).

```bash
# Set major.minor.patch (build is kept)
pnpm version:sync 1.2.3

# Set major.minor.patch and the build number
pnpm version:sync 1.2.3.45

# Set only the build number
pnpm version:sync --build 45

# Bump a single component (major|minor|patch|build)
pnpm version:sync --bump patch

# Re-apply version.json to every manifest (e.g. after editing it by hand)
pnpm version:sync
```

Editing `packages/version/src/version.json` directly and then running
`pnpm version:sync` (with no arguments) achieves the same result.

### Checking for drift

`version:check` verifies that every manifest matches `version.json` without
writing anything. It exits non-zero on a mismatch, which makes it suitable for
CI:

```bash
pnpm version:check
```

## License

Released under the [MIT License](./LICENSE).
