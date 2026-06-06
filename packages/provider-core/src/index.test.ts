import { describe, it, expect } from "vitest";
import { ProviderError } from "./index";

describe("ProviderError", () => {
  it("carries a message and an undefined status by default", () => {
    const error = new ProviderError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProviderError");
    expect(error.message).toBe("boom");
    expect(error.status).toBeUndefined();
  });

  it("carries an explicit status when provided", () => {
    const error = new ProviderError("unauthorized", 401);
    expect(error.status).toBe(401);
  });
});
