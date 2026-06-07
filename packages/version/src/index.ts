import versionData from "./version.json";

/**
 * The four components of the application version. This package is the single
 * source of truth; the `sync-version` script propagates these numbers to every
 * workspace manifest (`package.json`, `Cargo.toml`, `tauri.conf.json`).
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  build: number;
}

export const version: Version = {
  major: versionData.major,
  minor: versionData.minor,
  patch: versionData.patch,
  build: versionData.build,
};

/**
 * Semantic version core (`MAJOR.MINOR.PATCH`). This is the value written to
 * every package and app manifest, so all workspace members share it.
 */
export const versionString = `${version.major}.${version.minor}.${version.patch}`;

/**
 * Human-readable version including the build number, suitable for an
 * about/diagnostics screen, e.g. `"1.2.3 (build 7)"`. The build number is
 * omitted when it is zero.
 */
export const displayVersion =
  version.build > 0
    ? `${versionString} (build ${version.build})`
    : versionString;
