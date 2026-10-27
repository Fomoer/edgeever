import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_IMAGE_WIDTH_PERCENT,
  NEW_IMAGE_WIDTH_PERCENT,
  IMAGE_WIDTH_PRESETS,
  PHONE_IMAGE_FILL_CSS,
  PHONE_IMAGE_FILL_MAX_WIDTH_PX,
  clampImageWidth,
  parseImageWidth,
} from "./image-display.ts";

const readRepoFile = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("shared image display widths", () => {
  test("keeps the four editor presets stable across clients", () => {
    expect(DEFAULT_IMAGE_WIDTH_PERCENT).toBe(72);
    expect(NEW_IMAGE_WIDTH_PERCENT).toBe(IMAGE_WIDTH_PRESETS.find((preset) => preset.id === "large").width);
    expect(NEW_IMAGE_WIDTH_PERCENT).toBe(DEFAULT_IMAGE_WIDTH_PERCENT);
    expect(IMAGE_WIDTH_PRESETS.map(({ id, width }) => [id, width])).toEqual([
      ["small", 35],
      ["medium", 50],
      ["large", 72],
      ["full", 100],
    ]);
  });

  test("parses persisted widths and clamps arbitrary resize values", () => {
    expect(parseImageWidth("width: 50%")).toBe(50);
    expect(parseImageWidth("120")).toBe(100);
    expect(parseImageWidth(null)).toBeNull();
    expect(clampImageWidth(24.6)).toBe(25);
    expect(clampImageWidth(71.6)).toBe(72);
  });

  test("fills the phone column without changing the stored desktop percent", () => {
    expect(PHONE_IMAGE_FILL_MAX_WIDTH_PX).toBe(640);
    expect(PHONE_IMAGE_FILL_CSS).toContain("@media screen and (max-width: 640px)");
    expect(PHONE_IMAGE_FILL_CSS).toContain("width: 100% !important");
    expect(PHONE_IMAGE_FILL_CSS).toContain("max-width: 100% !important");
    expect(PHONE_IMAGE_FILL_CSS).toContain(".edgeever-image-node");
    expect(PHONE_IMAGE_FILL_CSS).toContain(".ProseMirror img[data-width]");
    expect(PHONE_IMAGE_FILL_CSS).toContain(":not(.edgeever-image-card *)");
    expect(readRepoFile("../../../apps/mobile/src/components/LocalTiptapEditor.tsx")).toContain("${PHONE_IMAGE_FILL_CSS}");
    expect(readRepoFile("../../../apps/ios/EditorSource/src/main.ts")).toContain("installPhoneImageFillStyle(");
    expect(readRepoFile("../../../apps/web/src/main.tsx")).toContain("installPhoneImageFillStyle(");
    expect(readRepoFile("../../../apps/web/src/mobile-edit.tsx")).toContain("installPhoneImageFillStyle(");
  });
});
