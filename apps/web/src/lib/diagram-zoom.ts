export const DIAGRAM_ZOOM_SCALE_MIN = 0.3;
export const DIAGRAM_ZOOM_SCALE_MAX = 2.5;
export const DIAGRAM_ZOOM_PERCENT_MIN = Math.round(DIAGRAM_ZOOM_SCALE_MIN * 100);
export const DIAGRAM_ZOOM_PERCENT_MAX = Math.round(DIAGRAM_ZOOM_SCALE_MAX * 100);

export const clampDiagramZoomPercent = (percent: number) => (
  Math.min(DIAGRAM_ZOOM_PERCENT_MAX, Math.max(DIAGRAM_ZOOM_PERCENT_MIN, Math.round(percent)))
);

export const parseDiagramZoomPercent = (raw: string) => {
  const matched = raw.trim().replace(/%/g, "").trim();
  if (!matched) return null;
  const value = Number.parseFloat(matched);
  if (!Number.isFinite(value)) return null;
  return clampDiagramZoomPercent(value);
};
