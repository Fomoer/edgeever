import { describe, expect, test } from "bun:test";
import { shouldQuitAfterAllWindowsClosed } from "./window-lifecycle.mjs";

describe("desktop window lifecycle", () => {
  test("keeps the app alive while the renderer origin migration window closes", () => {
    expect(shouldQuitAfterAllWindowsClosed({
      platform: "linux",
      rendererOriginMigrationInProgress: true,
    })).toBe(false);
    expect(shouldQuitAfterAllWindowsClosed({
      platform: "win32",
      rendererOriginMigrationInProgress: true,
    })).toBe(false);
  });

  test("preserves normal platform window close behavior", () => {
    expect(shouldQuitAfterAllWindowsClosed({ platform: "linux" })).toBe(true);
    expect(shouldQuitAfterAllWindowsClosed({ platform: "win32" })).toBe(true);
    expect(shouldQuitAfterAllWindowsClosed({ platform: "darwin" })).toBe(false);
  });
});
