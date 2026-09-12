import { describe, expect, test } from "bun:test";
import { isClientAheadOfInstance, isVersionOutdated } from "./version";

describe("release version comparison", () => {
  test("compares semantic release components and ignores build metadata", () => {
    expect(isVersionOutdated("1.6.49+12", "1.6.50")).toBe(true);
    expect(isVersionOutdated("1.6.50+3", "1.6.50")).toBe(false);
    expect(isVersionOutdated("1.6.50-beta.2", "1.6.50-beta.10")).toBe(true);
    expect(isVersionOutdated("1.6.50-beta.10", "1.6.50")).toBe(true);
    expect(isVersionOutdated("1.6.50", "1.6.50-beta.10")).toBe(false);
  });

  test("treats the client as ahead only when it is newer than a known instance", () => {
    expect(isClientAheadOfInstance("1.66.0", "1.65.1")).toBe(true);
    expect(isClientAheadOfInstance("v1.66.0", "v1.65.1")).toBe(true);
    expect(isClientAheadOfInstance("1.65.1+4", "1.65.1")).toBe(false);
    expect(isClientAheadOfInstance("1.65.1", "1.65.1")).toBe(false);
    expect(isClientAheadOfInstance("1.64.0", "1.65.1")).toBe(false);
    expect(isClientAheadOfInstance("1.66.0", null)).toBe(false);
    expect(isClientAheadOfInstance("1.66.0", "")).toBe(false);
    expect(isClientAheadOfInstance("1.66.0", "local")).toBe(false);
    expect(isClientAheadOfInstance(null, "1.65.1")).toBe(false);
  });
});
