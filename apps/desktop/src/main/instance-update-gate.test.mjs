import { describe, expect, test } from "bun:test";
import { instanceReleaseVersionFromPayload, shouldHoldAutoRestartUpdate } from "./instance-update-gate.mjs";

describe("desktop auto-restart update gate", () => {
  test("holds only when the GitHub release is newer than the connected instance", () => {
    expect(shouldHoldAutoRestartUpdate("1.64.0", "1.63.2")).toBe(true);
    expect(shouldHoldAutoRestartUpdate("v1.64.0", "v1.64.0")).toBe(false);
    expect(shouldHoldAutoRestartUpdate("1.63.2", "1.64.0")).toBe(false);
    expect(shouldHoldAutoRestartUpdate("1.64.0+12", "1.64.0")).toBe(false);
  });

  test("does not hold when the instance version is unknown", () => {
    expect(shouldHoldAutoRestartUpdate("1.64.0", null)).toBe(false);
    expect(shouldHoldAutoRestartUpdate("1.64.0", "")).toBe(false);
    expect(shouldHoldAutoRestartUpdate("1.64.0", "local")).toBe(false);
    expect(shouldHoldAutoRestartUpdate("", "1.63.2")).toBe(false);
  });

  test("reads the public instance release payload", () => {
    expect(instanceReleaseVersionFromPayload({ version: "1.63.2+4" })).toBe("1.63.2+4");
    expect(instanceReleaseVersionFromPayload({ version: "  v1.64.0  " })).toBe("v1.64.0");
    expect(instanceReleaseVersionFromPayload({})).toBeNull();
    expect(instanceReleaseVersionFromPayload(null)).toBeNull();
  });
});
