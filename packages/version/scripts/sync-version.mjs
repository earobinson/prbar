#!/usr/bin/env node
// @ts-check
/**
 * Single source of truth: packages/version/src/version.json.
 *
 * This script reads (and optionally updates) that file, then writes the
 * resulting MAJOR.MINOR.PATCH version into every workspace manifest so all
 * packages and apps stay in lock-step:
 *
 *   - the root package.json
 *   - every packages/<name>/package.json and apps/<name>/package.json
 *   - apps/desktop/src-tauri/tauri.conf.json
 *   - apps/desktop/src-tauri/Cargo.toml
 *
 * Usage:
 *   node scripts/sync-version.mjs                 # sync manifests to version.json
 *   node scripts/sync-version.mjs 1.2.3           # set major.minor.patch, then sync
 *   node scripts/sync-version.mjs 1.2.3.45        # also set the build number
 *   node scripts/sync-version.mjs --build 45      # set only the build number
 *   node scripts/sync-version.mjs --bump patch    # bump major|minor|patch|build
 *   node scripts/sync-version.mjs --check         # fail if anything is out of sync
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const versionFile = join(
  repoRoot,
  "packages",
  "version",
  "src",
  "version.json",
);

/** @typedef {{ major: number, minor: number, patch: number, build: number }} Version */

/** @returns {Version} */
function readVersion() {
  /** @type {Version} */
  const v = JSON.parse(readFileSync(versionFile, "utf8"));
  for (const key of /** @type {const} */ ([
    "major",
    "minor",
    "patch",
    "build",
  ])) {
    if (typeof v[key] !== "number" || !Number.isInteger(v[key]) || v[key] < 0) {
      throw new Error(`version.json: "${key}" must be a non-negative integer`);
    }
  }
  return v;
}

/** @param {Version} v */
function writeVersion(v) {
  writeFileSync(versionFile, JSON.stringify(v, null, 2) + "\n");
}

/** @param {string[]} parts */
function toNumbers(parts) {
  return parts.map((p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`Invalid version component: "${p}"`);
    }
    return n;
  });
}

/**
 * Apply CLI arguments to the current version and return the result.
 * @param {Version} current
 * @param {string[]} argv
 * @returns {{ version: Version, check: boolean }}
 */
function applyArgs(current, argv) {
  const next = { ...current };
  let check = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--build") {
      [next.build] = toNumbers([argv[++i]]);
    } else if (arg === "--bump") {
      const part = argv[++i];
      if (part === "major") {
        next.major += 1;
        next.minor = 0;
        next.patch = 0;
      } else if (part === "minor") {
        next.minor += 1;
        next.patch = 0;
      } else if (part === "patch") {
        next.patch += 1;
      } else if (part === "build") {
        next.build += 1;
      } else {
        throw new Error(
          `--bump expects major|minor|patch|build, got "${part}"`,
        );
      }
    } else if (/^\d+\.\d+\.\d+(\.\d+)?$/.test(arg)) {
      const [major, minor, patch, build] = toNumbers(arg.split("."));
      next.major = major;
      next.minor = minor;
      next.patch = patch;
      if (build !== undefined) next.build = build;
    } else {
      throw new Error(`Unrecognized argument: "${arg}"`);
    }
  }

  return { version: next, check };
}

/** Collect every package.json that should track the shared version. */
function manifestPaths() {
  const paths = [join(repoRoot, "package.json")];
  for (const group of ["packages", "apps"]) {
    const dir = join(repoRoot, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkg = join(dir, entry.name, "package.json");
      if (existsSync(pkg)) paths.push(pkg);
    }
  }
  return paths;
}

/**
 * @param {string} label
 * @param {string} current
 * @param {string} next
 * @param {boolean} check
 * @param {() => void} write
 * @param {{ changed: boolean, drift: string[] }} state
 */
function reconcile(label, current, next, check, write, state) {
  if (current === next) return;
  if (check) {
    state.drift.push(`${label}: ${current} → ${next}`);
    return;
  }
  write();
  state.changed = true;
  console.log(`  ${label}: ${current} → ${next}`);
}

function main() {
  const argv = process.argv.slice(2);
  const current = readVersion();
  const { version: next, check } = applyArgs(current, argv);
  const versionString = `${next.major}.${next.minor}.${next.patch}`;

  /** @type {{ changed: boolean, drift: string[] }} */
  const state = { changed: false, drift: [] };

  // 1. Persist the source of truth.
  reconcile(
    "packages/version/src/version.json",
    `${current.major}.${current.minor}.${current.patch}.${current.build}`,
    `${next.major}.${next.minor}.${next.patch}.${next.build}`,
    check,
    () => writeVersion(next),
    state,
  );

  // 2. package.json manifests.
  for (const path of manifestPaths()) {
    const raw = readFileSync(path, "utf8");
    /** @type {{ version?: string }} */
    const pkg = JSON.parse(raw);
    const label = path.slice(repoRoot.length + 1);
    reconcile(
      label,
      pkg.version ?? "(none)",
      versionString,
      check,
      () => {
        pkg.version = versionString;
        writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
      },
      state,
    );
  }

  // 3. tauri.conf.json.
  const tauriConf = join(
    repoRoot,
    "apps",
    "desktop",
    "src-tauri",
    "tauri.conf.json",
  );
  if (existsSync(tauriConf)) {
    const raw = readFileSync(tauriConf, "utf8");
    /** @type {{ version?: string }} */
    const conf = JSON.parse(raw);
    reconcile(
      "apps/desktop/src-tauri/tauri.conf.json",
      conf.version ?? "(none)",
      versionString,
      check,
      () => {
        conf.version = versionString;
        writeFileSync(tauriConf, JSON.stringify(conf, null, 2) + "\n");
      },
      state,
    );
  }

  // 4. Cargo.toml ([package] version, the first top-level version key).
  const cargoToml = join(
    repoRoot,
    "apps",
    "desktop",
    "src-tauri",
    "Cargo.toml",
  );
  if (existsSync(cargoToml)) {
    const raw = readFileSync(cargoToml, "utf8");
    const match = raw.match(/^version\s*=\s*"([^"]*)"/m);
    const cargoVersion = match ? match[1] : "(none)";
    reconcile(
      "apps/desktop/src-tauri/Cargo.toml",
      cargoVersion,
      versionString,
      check,
      () => {
        const updated = raw.replace(
          /^version\s*=\s*"[^"]*"/m,
          `version = "${versionString}"`,
        );
        writeFileSync(cargoToml, updated);
      },
      state,
    );
  }

  if (check) {
    if (state.drift.length > 0) {
      console.error("Version drift detected:");
      for (const line of state.drift) console.error(`  ${line}`);
      console.error('\nRun "pnpm version:sync" to fix.');
      process.exit(1);
    }
    console.log(`All manifests are in sync at ${versionString}.`);
    return;
  }

  if (!state.changed) {
    console.log(`Already in sync at ${versionString}.`);
  } else {
    console.log(
      `\nSynced workspace to ${versionString}` +
      (next.build > 0 ? ` (build ${next.build}).` : "."),
    );
  }
}

main();
