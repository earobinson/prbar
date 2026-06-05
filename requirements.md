# PRBar

## Overview

PRBar is a lightweight cross-platform desktop application that runs in the menu bar (macOS) or system tray (Windows/Linux) and monitors pull requests across one or more GitHub accounts.

Users create one or more saved search queries using native GitHub search syntax. PRBar continuously polls GitHub and provides:

- Menu bar / system tray indicators
- Desktop notifications
- Quick access to matching pull requests
- Multiple GitHub account support
- Unlimited saved queries
- Low resource usage
- Secure credential storage

Repository name:

```text
prbar
```

Application name:

```text
PRBar
```

---

# Goals

## Primary Goals

- Cross-platform desktop application
- Native menu bar / system tray experience
- Multiple GitHub account support
- Unlimited search queries
- Desktop notifications
- Fast startup
- Minimal memory usage
- No backend services
- Secure credential storage

## Non-Goals

- Performing code reviews
- Editing pull requests
- Managing issues
- Team collaboration features
- Cloud-hosted backend
- User accounts

---

# Technology Stack

## Desktop Framework

- Tauri v2

## Frontend

- React
- TypeScript
- Vite

## State Management

- Zustand

## Data Fetching

- TanStack Query

## Package Manager

- pnpm

Required version:

```text
pnpm >= 10
```

## Runtime

```text
Node.js 22 LTS
```

## Database

- SQLite

## Credential Storage

Authentication tokens must never be stored in SQLite.

Supported credential stores:

- macOS Keychain
- Windows Credential Manager
- Linux Secret Service

---

# Repository Structure

```text
prbar/
│
├── apps/
│   └── desktop/
│       ├── src/
│       ├── src-tauri/
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── shared-types/
│   ├── provider-core/
│   ├── github-provider/
│   ├── query-engine/
│   ├── notification-engine/
│   └── ui-components/
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
└── .nvmrc
```

---

# Core Concepts

## GitHub Account

Users may configure multiple GitHub accounts.

Examples:

- Personal account
- Work account
- Consulting account

```typescript
interface GitHubAccount {
  id: string;
  name: string;
  githubUsername: string;
}
```

Authentication tokens are stored only in the operating system credential store.

---

## Query

A query belongs to exactly one account.

```typescript
interface Query {
  id: string;
  accountId: string;

  name: string;
  searchQuery: string;

  enabled: boolean;

  pollIntervalSeconds: number;

  showInMenu: boolean;
  desktopNotifications: boolean;

  notifyOnNewMatches: boolean;
  notifyOnUpdates: boolean;
}
```

Example queries:

```text
is:pr review-requested:@me state:open archived:false draft:false
```

```text
is:pr author:@me state:open
```

```text
is:pr team-review-requested:backend state:open
```

Users may create unlimited queries.

---

## Match

A Match is a pull request returned by a query.

```typescript
interface Match {
  queryId: string;

  pullRequestId: number;
  repository: string;

  title: string;
  url: string;

  updatedAt: string;
}
```

---

# User Experience

## Application Startup

PRBar launches automatically on login.

The application runs primarily from the menu bar or system tray.

No main application window remains open during normal operation.

---

# Menu Bar Behavior

## Left Click

Left-click displays all active pull requests matching enabled queries.

Example:

```text
PRBar

────────────────────

[My Reviews]
Fix login redirect

[My Reviews]
Add OAuth callback

[Backend Team]
Upgrade React

[My PRs]
Improve build pipeline

────────────────────

12 Matching Pull Requests
```

Each item is clickable.

Clicking a pull request:

- Opens the PR in the default browser
- Closes the menu

---

## Right Click

Right-click displays application actions.

Example:

```text
PRBar

Refresh Now

Settings

Quit
```

---

# Menu Bar Indicator

The icon reflects the aggregate state across all enabled queries.

Examples:

```text
0
```

```text
3
```

```text
12
```

If supported by the operating system:

- Badge count
- Highlighted icon
- Dot indicator

---

# Notifications

Notifications are configured independently for each query.

A query may:

- Show results in menu only
- Send notifications only
- Do both
- Do neither (disabled)

---

## Notification Example

```text
Review Requested

Fix OAuth callback bug
myorg/webapp
```

Clicking a notification opens the pull request.

---

# Settings

## Accounts

Users can:

- Add account
- Remove account
- Rename account
- Validate token

Example:

```text
Accounts

Work GitHub
Personal GitHub
Open Source GitHub
```

---

## Queries

Users can:

- Create query
- Edit query
- Duplicate query
- Delete query
- Enable query
- Disable query

---

## Query Configuration

```text
Name

GitHub Account

Search Query

Show In Menu

Desktop Notifications

Notify On New Matches

Notify On Updates

Poll Interval
```

---

# Polling

Each account is polled independently.

Workflow:

```text
Account
 ├── Query A
 ├── Query B
 ├── Query C
 └── Query N
```

Polling cycle:

1. Execute GitHub search query
2. Retrieve matching PRs
3. Compare against cache
4. Generate notifications
5. Update cache
6. Refresh menu state

Default interval:

```text
60 seconds
```

Minimum interval:

```text
30 seconds
```

Maximum interval:

```text
3600 seconds
```

---

# GitHub Integration

## Authentication

Supported:

- GitHub Personal Access Tokens

Required permissions:

```text
repo
read:org
```

## Search API

Primary endpoint:

```http
GET /search/issues
```

PRBar does not parse GitHub search syntax.

Queries are passed directly to GitHub.

---

# Local Storage

## SQLite

### accounts

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  github_username TEXT NOT NULL
);
```

### queries

```sql
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,

  name TEXT NOT NULL,
  search_query TEXT NOT NULL,

  enabled INTEGER NOT NULL,

  show_in_menu INTEGER NOT NULL,
  desktop_notifications INTEGER NOT NULL,

  notify_on_new_matches INTEGER NOT NULL,
  notify_on_updates INTEGER NOT NULL,

  poll_interval_seconds INTEGER NOT NULL
);
```

### cached_matches

```sql
CREATE TABLE cached_matches (
  query_id TEXT NOT NULL,
  pull_request_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,

  PRIMARY KEY(query_id, pull_request_id)
);
```

---

# Provider Architecture

The application should be provider-agnostic internally.

```typescript
interface Provider {
  searchPullRequests(
    query: string
  ): Promise<PullRequest[]>;

  validateCredentials(): Promise<boolean>;
}
```

Initial implementation:

```text
GitHubProvider
```

Future providers:

```text
GitLabProvider
BitbucketProvider
AzureDevOpsProvider
```

---

# Development Standards

## Package Manager

Use pnpm exclusively.

Required files:

```text
pnpm-lock.yaml
pnpm-workspace.yaml
```

npm, yarn, and bun are not supported.

---

## TypeScript

Strict mode is required.

```json
{
  "strict": true
}
```

---

## Code Quality

Required tooling:

- ESLint
- Prettier

---

# Testing

## Unit Tests

Framework:

```text
Vitest
```

Coverage target:

```text
80%+
```

Required coverage:

- Query engine
- Provider layer
- Notification engine
- Match detection

---

## Integration Tests

Required coverage:

- GitHub authentication
- Query execution
- Cache synchronization
- Notification generation

---

# Performance Requirements

Startup time:

```text
< 2 seconds
```

Idle memory usage:

```text
< 150 MB
```

Background CPU:

```text
Near 0% when not polling
```

---

# Release Targets

Supported platforms:

- macOS Apple Silicon
- macOS Intel
- Windows x64
- Linux x64

Builds are produced automatically using GitHub Actions.

---

# Success Criteria

A user can:

1. Install PRBar on macOS, Windows, or Linux
2. Add multiple GitHub accounts
3. Create unlimited saved queries
4. Configure notifications per query
5. Configure menu visibility per query
6. View all matching pull requests from the menu bar
7. Open pull requests directly from the menu
8. Receive notifications for new or updated matches
9. Run continuously with minimal CPU and memory usage
10. Use the application entirely without any backend service