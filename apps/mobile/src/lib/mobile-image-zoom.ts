export type ImageSize = { width: number; height: number };

export type PreviewImageItem = {
  alt: string;
  source: string;
};

export type SwipeDirection = "prev" | "next" | null;

export const fitPreviewImage = (image: ImageSize, viewport: ImageSize): ImageSize => {
  if (image.width <= 0 || image.height <= 0) return viewport;
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
};

export const clampImageTranslation = (value: number, imageLength: number, viewportLength: number, scale: number) => {
  "worklet";
  const limit = Math.max(0, (imageLength * scale - viewportLength) / 2);
  return Math.max(-limit, Math.min(limit, value));
};

export const zoomImageTranslation = (translation: number, focal: number, oldScale: number, newScale: number) => {
  "worklet";
  return focal - (focal - translation) * newScale / oldScale;
};

// Aim for readable screen-width detail, while limiting requested decode dimensions.
// Fresco may round sampling sizes; these are request limits, not a strict heap bound.
export const previewResizeMultiplier = (fitted: ImageSize, viewport: ImageSize, density: number) => {
  if (fitted.width <= 0 || fitted.height <= 0 || density <= 0) return 1;
  return Math.max(1, Math.min(
    viewport.width * 2 / fitted.width,
    8192 / (Math.max(fitted.width, fitted.height) * density),
    Math.sqrt(8_000_000 / (fitted.width * fitted.height * density * density)),
  ));
};

/**
 * Resolves swipe direction from pan gesture deltas and velocities.
 * Supports both horizontal (left/right) and vertical (up/down) swipe transitions.
 */
export const resolveSwipeDirection = (
  deltaX: number,
  deltaY: number,
  velocityX = 0,
  velocityY = 0,
  threshold = 60,
  velocityThreshold = 500,
): SwipeDirection => {
  "worklet";
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX >= absY) {
    if (deltaX < -threshold || velocityX < -velocityThreshold) {
      return "next";
    }
    if (deltaX > threshold || velocityX > velocityThreshold) {
      return "prev";
    }
  } else {
    if (deltaY < -threshold || velocityY < -velocityThreshold) {
      return "next";
    }
    if (deltaY > threshold || velocityY > velocityThreshold) {
      return "prev";
    }
  }

  return null;
};

/**
 * Calculates next image index clamped to [0, total - 1].
 */
export const resolveNextPreviewIndex = (
  currentIndex: number,
  total: number,
  direction: SwipeDirection,
): number => {
  "worklet";
  if (direction === "next" && currentIndex < total - 1) {
    return currentIndex + 1;
  }
  if (direction === "prev" && currentIndex > 0) {
    return currentIndex - 1;
  }
  return currentIndex;
};

/**
 * Extracts all image source/alt pairs from a Tiptap document tree.
 * Handles top-level images, image galleries, and nested structures (tables, blocks).
 */
export const extractImagesFromTiptapDoc = (node: unknown): PreviewImageItem[] => {
  if (!node || typeof node !== "object") return [];
  const results: PreviewImageItem[] = [];

  const traverse = (curr: unknown) => {
    if (!curr || typeof curr !== "object") return;
    const typed = curr as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };
    if (
      typed.type === "image" &&
      typed.attrs &&
      typeof typed.attrs.src === "string" &&
      typed.attrs.src.trim()
    ) {
      results.push({
        alt: typeof typed.attrs.alt === "string" ? typed.attrs.alt : "",
        source: typed.attrs.src.trim(),
      });
    }
    if (Array.isArray(typed.content)) {
      for (const child of typed.content) {
        traverse(child);
      }
    }
  };

  traverse(node);
  return results;
};
