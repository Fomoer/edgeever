import { describe, expect, test } from "bun:test";
import {
  clampImageTranslation,
  extractImagesFromTiptapDoc,
  fitPreviewImage,
  previewResizeMultiplier,
  resolveNextPreviewIndex,
  resolveSwipeDirection,
  zoomImageTranslation,
} from "./mobile-image-zoom";

describe("fullscreen image geometry", () => {
  const viewport = { width: 400, height: 800 };
  test("long images remain fully visible initially and can fill the width after zoom", () => {
    const fitted = fitPreviewImage({ width: 1000, height: 20000 }, viewport);
    expect(fitted).toEqual({ width: 40, height: 800 });
    expect(clampImageTranslation(100, fitted.width, viewport.width, 10)).toBe(0);
    expect(clampImageTranslation(5000, fitted.height, viewport.height, 10)).toBe(3600);
  });
  test("pan cannot expose empty space past any image edge", () => {
    expect(clampImageTranslation(999, 400, 400, 3)).toBe(400);
    expect(clampImageTranslation(-999, 400, 400, 3)).toBe(-400);
    expect(clampImageTranslation(100, 200, 800, 3)).toBe(0);
    expect(clampImageTranslation(400, 400, 400, 1)).toBe(0);
  });
  test("zoom preserves the image point beneath the fingers", () => {
    const translated = zoomImageTranslation(25, 100, 2, 5);
    expect((100 - translated) / 5).toBe((100 - 25) / 2);
    expect(zoomImageTranslation(translated, 100, 5, 2)).toBe(25);
  });
  test("decode requests aim for screen-width detail and cap pixel count and longest edge", () => {
    for (const fitted of [{ width: 400, height: 800 }, { width: 40, height: 800 }, { width: 400, height: 200 }]) {
      const multiplier = previewResizeMultiplier(fitted, viewport, 3);
      expect(Math.max(fitted.width, fitted.height) * 3 * multiplier).toBeLessThanOrEqual(8192);
      expect(fitted.width * fitted.height * 9 * multiplier ** 2).toBeLessThanOrEqual(8_000_001);
      expect(multiplier).toBeGreaterThanOrEqual(1);
    }
  });
  test("unknown dimensions are safe during image loading", () => {
    expect(fitPreviewImage({ width: 0, height: 0 }, viewport)).toEqual(viewport);
    expect(previewResizeMultiplier({ width: 0, height: 0 }, viewport, 3)).toBe(1);
  });
});

describe("swipe direction and navigation resolution", () => {
  test("resolves horizontal swipe directions based on distance", () => {
    expect(resolveSwipeDirection(-70, 10, 0, 0, 60)).toBe("next");
    expect(resolveSwipeDirection(70, -10, 0, 0, 60)).toBe("prev");
    expect(resolveSwipeDirection(30, 10, 0, 0, 60)).toBeNull();
  });

  test("resolves horizontal swipe directions based on velocity", () => {
    expect(resolveSwipeDirection(-20, 0, -600, 0, 60, 500)).toBe("next");
    expect(resolveSwipeDirection(20, 0, 600, 0, 60, 500)).toBe("prev");
  });

  test("resolves vertical swipe directions based on distance", () => {
    expect(resolveSwipeDirection(10, -80, 0, 0, 60)).toBe("next");
    expect(resolveSwipeDirection(-10, 80, 0, 0, 60)).toBe("prev");
    expect(resolveSwipeDirection(0, 30, 0, 0, 60)).toBeNull();
  });

  test("resolves vertical swipe directions based on velocity", () => {
    expect(resolveSwipeDirection(0, -20, 0, -700, 60, 500)).toBe("next");
    expect(resolveSwipeDirection(0, 20, 0, 700, 60, 500)).toBe("prev");
  });

  test("calculates clamped next/prev preview index", () => {
    expect(resolveNextPreviewIndex(0, 3, "prev")).toBe(0);
    expect(resolveNextPreviewIndex(0, 3, "next")).toBe(1);
    expect(resolveNextPreviewIndex(1, 3, "next")).toBe(2);
    expect(resolveNextPreviewIndex(2, 3, "next")).toBe(2);
    expect(resolveNextPreviewIndex(2, 3, "prev")).toBe(1);
    expect(resolveNextPreviewIndex(1, 3, null)).toBe(1);
  });
});

describe("extractImagesFromTiptapDoc", () => {
  test("handles empty and non-object documents", () => {
    expect(extractImagesFromTiptapDoc(null)).toEqual([]);
    expect(extractImagesFromTiptapDoc(undefined)).toEqual([]);
    expect(extractImagesFromTiptapDoc({})).toEqual([]);
    expect(extractImagesFromTiptapDoc({ type: "doc", content: [] })).toEqual([]);
  });

  test("extracts standalone, gallery, and nested images in order", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Intro note" }],
        },
        {
          type: "image",
          attrs: { src: "blob:image-1", alt: "First image" },
        },
        {
          type: "edgeeverImageGallery",
          attrs: { layout: "2" },
          content: [
            {
              type: "image",
              attrs: { src: "blob:image-2", alt: "Second image" },
            },
            {
              type: "image",
              attrs: { src: "blob:image-3", alt: "" },
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "image",
                      attrs: { src: "blob:image-4", alt: "Table image" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractImagesFromTiptapDoc(doc)).toEqual([
      { alt: "First image", source: "blob:image-1" },
      { alt: "Second image", source: "blob:image-2" },
      { alt: "", source: "blob:image-3" },
      { alt: "Table image", source: "blob:image-4" },
    ]);
  });
});
