import { buildDiagramPalette, DIAGRAM_SELECTABLE_THEMES, resolveDiagramTheme, type DiagramTheme } from "@edgeever/shared";

export type DiagramAppearance = "light" | "dark";

export type DiagramPalette = {
  topicFill: string;
  topicText: string;
  nodeFill: string;
  nodeText: string;
  nodeStroke: string;
  topicStroke: string;
  mindMapEdge: string;
  flowEdge: string;
  canvas: string;
  grid: string;
  gridStrong: string;
};

const withGrid = (palette: ReturnType<typeof buildDiagramPalette>, appearance: DiagramAppearance): DiagramPalette => ({
  ...palette,
  grid: appearance === "dark" ? "#1D2722" : "#E6EEE9",
  gridStrong: appearance === "dark" ? "#2B3A33" : "#CFDDD5",
});

export const DIAGRAM_THEME_PALETTES = Object.fromEntries(
  DIAGRAM_SELECTABLE_THEMES.map((theme) => [theme, {
    light: withGrid(buildDiagramPalette(theme, "light"), "light"),
    dark: withGrid(buildDiagramPalette(theme, "dark"), "dark"),
  }]),
) as Record<typeof DIAGRAM_SELECTABLE_THEMES[number], Record<DiagramAppearance, DiagramPalette>>;

export const resolveDiagramPalette = (theme: DiagramTheme, appearance: DiagramAppearance) =>
  withGrid(buildDiagramPalette(resolveDiagramTheme(theme), appearance), appearance);
