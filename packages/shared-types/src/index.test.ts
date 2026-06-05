import { describe, it, expect } from "vitest";
import { clampPollInterval, POLL_INTERVAL } from "./index";

describe("POLL_INTERVAL", () => {
  it("exposes the documented bounds", () => {
    expect(POLL_INTERVAL.default).toBe(60);
    expect(POLL_INTERVAL.min).toBe(30);
    expect(POLL_INTERVAL.max).toBe(3600);
  });
});

describe("clampPollInterval", () => {
  it("returns the default for NaN", () => {
    expect(clampPollInterval(Number.NaN)).toBe(POLL_INTERVAL.default);
  });

  it("clamps values below the minimum up to the minimum", () => {
    expect(clampPollInterval(1)).toBe(POLL_INTERVAL.min);
    expect(clampPollInterval(0)).toBe(POLL_INTERVAL.min);
    expect(clampPollInterval(-100)).toBe(POLL_INTERVAL.min);
  });

  it("clamps values above the maximum down to the maximum", () => {
    expect(clampPollInterval(10_000)).toBe(POLL_INTERVAL.max);
  });

  it("passes through values within range", () => {
    expect(clampPollInterval(60)).toBe(60);
    expect(clampPollInterval(30)).toBe(30);
    expect(clampPollInterval(3600)).toBe(3600);
  });
});
