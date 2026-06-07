import { describe, it, expect } from "vitest";
import { version, versionString, displayVersion } from "./index";

describe("version", () => {
  it("exposes the four version components as numbers", () => {
    for (const part of [
      version.major,
      version.minor,
      version.patch,
      version.build,
    ]) {
      expect(typeof part).toBe("number");
      expect(Number.isInteger(part)).toBe(true);
      expect(part).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("versionString", () => {
  it("is the MAJOR.MINOR.PATCH core", () => {
    expect(versionString).toBe(
      `${version.major}.${version.minor}.${version.patch}`,
    );
  });
});

describe("displayVersion", () => {
  it("matches the core when there is no build number", () => {
    if (version.build === 0) {
      expect(displayVersion).toBe(versionString);
    } else {
      expect(displayVersion).toBe(`${versionString} (build ${version.build})`);
    }
  });
});
