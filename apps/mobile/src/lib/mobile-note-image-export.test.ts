import { describe, expect, test } from "bun:test";
import { planMobileNoteImageRender } from "./mobile-note-image-export";

describe("planMobileNoteImageRender", () => {
  test("keeps a short card at full quality", () => {
    expect(planMobileNoteImageRender(680, 1_000)).toEqual({
      pixelRatio: 2,
      sourceHeight: 1_000,
      sourceScale: 1,
      sourceWidth: 680,
    });
  });

  test("fits a long digest within the mobile image budget", () => {
    const plan = planMobileNoteImageRender(680, 20_000);
    expect(plan.sourceScale).toBe(0.75);
    expect(plan.sourceHeight).toBeLessThanOrEqual(15_000);
    expect(plan.sourceHeight * plan.pixelRatio).toBeLessThanOrEqual(15_000);
    expect(plan.sourceWidth * plan.sourceHeight * plan.pixelRatio ** 2).toBeLessThanOrEqual(12_000_000);
  });

  test("rejects a card that would be unreadable as one image", () => {
    expect(() => planMobileNoteImageRender(680, 40_000)).toThrow("NOTE_IMAGE_TOO_LONG");
  });
});
