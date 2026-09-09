export type DiagramFitBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isUsableDiagramBounds = (bounds: DiagramFitBounds | null | undefined): bounds is DiagramFitBounds => {
  if (!bounds) return false;
  return isFiniteNumber(bounds.x)
    && isFiniteNumber(bounds.y)
    && isFiniteNumber(bounds.width)
    && isFiniteNumber(bounds.height)
    && bounds.width >= 0
    && bounds.height >= 0
    && (bounds.width > 0 || bounds.height > 0);
};

const isEmptyContentArea = (area: unknown) => {
  if (!area || typeof area !== "object") return true;
  const box = area as { width?: unknown; height?: unknown };
  return (!isFiniteNumber(box.width) || box.width === 0)
    && (!isFiniteNumber(box.height) || box.height === 0);
};

// X6 Scroller.autoResize calls fitToContent. When autoResize is suspended it
// substitutes an empty rectangle, which shrinks the paper and clips nodes —
// especially mind-map branches left of the origin. Always prefer node geometry.
export const applyDiagramScrollerFitOptions = (
  options: Record<string, unknown>,
  nodeBounds: DiagramFitBounds | null | undefined,
): Record<string, unknown> => {
  if (isUsableDiagramBounds(nodeBounds)) {
    options.contentArea = {
      x: nodeBounds.x,
      y: nodeBounds.y,
      width: nodeBounds.width,
      height: nodeBounds.height,
    };
    return options;
  }
  if (isEmptyContentArea(options.contentArea)) {
    delete options.contentArea;
  }
  return options;
};
