import { describe, expect, test } from "bun:test";
import {
  CURRENT_RENDERER_URL_PREFIX,
  LEGACY_RENDERER_URL_PREFIX,
  isCurrentReleaseRendererUrl,
  isPreviousReleaseRendererUrl,
} from "./verify-desktop-cross-version-startup.mjs";

describe("desktop cross-version startup origins", () => {
  test("accepts both the legacy file origin and the current app origin for the previous native", () => {
    expect(isPreviousReleaseRendererUrl(`${LEGACY_RENDERER_URL_PREFIX}/Applications/EdgeEver.app/Contents/Resources/web/index.html`)).toBe(true);
    expect(isPreviousReleaseRendererUrl(`${CURRENT_RENDERER_URL_PREFIX}index.html`)).toBe(true);
    expect(isPreviousReleaseRendererUrl("https://demo.edgeever.org/")).toBe(false);
    expect(isPreviousReleaseRendererUrl("")).toBe(false);
  });

  test("requires the current custom protocol after the upgrade", () => {
    expect(isCurrentReleaseRendererUrl(`${CURRENT_RENDERER_URL_PREFIX}index.html`)).toBe(true);
    expect(isCurrentReleaseRendererUrl(`${LEGACY_RENDERER_URL_PREFIX}/Applications/EdgeEver.app/Contents/Resources/web/index.html`)).toBe(false);
    expect(isCurrentReleaseRendererUrl("edgeever-app://other/index.html")).toBe(false);
  });
});
