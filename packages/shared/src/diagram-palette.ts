import type { DiagramTheme } from "./diagram";
import { resolveDiagramTheme } from "./diagram";

type DiagramAppearance = "light" | "dark";

export type DiagramColorStrip = {
  id: Exclude<ReturnType<typeof resolveDiagramTheme>, never>;
  group: "vivid" | "classic";
  colors: readonly [string, string, string, string, string, string];
};

export const DIAGRAM_COLOR_STRIPS: Record<
  "brand" | "mint" | "wa" | "island" | "rose" | "sun" | "cosmos" | "tea" | "macaron" | "naive",
  DiagramColorStrip
> = {
  brand: { id: "brand", group: "classic", colors: ["#E7F6EF", "#9FDBC4", "#16A06E", "#12845B", "#0F5C42", "#173B2E"] },
  sun: { id: "sun", group: "vivid", colors: ["#F7E27A", "#C6F07A", "#FFFFFF", "#C084FC", "#60A5FA", "#1F2937"] },
  wa: { id: "wa", group: "vivid", colors: ["#FFFFFF", "#FFB4A2", "#FF8A4C", "#7DD3FC", "#3B82F6", "#1E3A8A"] },
  island: { id: "island", group: "classic", colors: ["#F3D5C4", "#D4A276", "#B08968", "#A3A882", "#7D8B69", "#4A5D4E"] },
  rose: { id: "rose", group: "vivid", colors: ["#FDE8EF", "#F8C1D4", "#F48FB1", "#EC407A", "#C2185B", "#7A1040"] },
  mint: { id: "mint", group: "vivid", colors: ["#FFFFFF", "#A5F3FC", "#5EEAD4", "#2DD4BF", "#0F9B8E", "#115E59"] },
  cosmos: { id: "cosmos", group: "classic", colors: ["#D6DCE5", "#8BBAD4", "#4D86B0", "#1E4E7A", "#163A5F", "#0B1F33"] },
  tea: { id: "tea", group: "classic", colors: ["#D8E2C8", "#B4C49A", "#7A9A58", "#4F7A3C", "#2F5D32", "#1A3C24"] },
  naive: { id: "naive", group: "vivid", colors: ["#F8C8D4", "#E45A7C", "#8BB4F0", "#4F6FCF", "#F5EED8", "#2D2A32"] },
  macaron: { id: "macaron", group: "vivid", colors: ["#D4B896", "#F5B89A", "#B8D4C8", "#F0EDE4", "#F2E39A", "#4A4A4A"] },
};

export const DIAGRAM_THEME_GROUPS = {
  vivid: ["sun", "wa", "rose", "mint", "naive", "macaron"],
  classic: ["brand", "island", "tea", "cosmos"],
} as const;

const hexToRgb = (hex: string) => {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)] as const;
};

const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0")).join("")}`;

const mix = (from: string, to: string, amount: number) => {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex(
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  );
};

const channel = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};

const readableText = (fill: string) => (luminance(fill) > 0.32 ? "#1C1917" : "#FFFCF8");

export const diagramThemeSwatches = (theme?: DiagramTheme) =>
  DIAGRAM_COLOR_STRIPS[resolveDiagramTheme(theme)].colors;

export const diagramThemeUsesBranchColors = (theme?: DiagramTheme) => resolveDiagramTheme(theme) !== "brand";

export const buildDiagramBranchTints = (theme: DiagramTheme | undefined, appearance: DiagramAppearance) => {
  const colors = diagramThemeSwatches(theme);
  return colors.map((color) => {
    const fill = appearance === "dark" ? mix(color, "#101418", 0.55) : mix(color, "#FFFFFF", luminance(color) > 0.82 ? 0.08 : 0.72);
    return {
      fill,
      stroke: appearance === "dark" ? mix(color, "#FFFFFF", 0.18) : mix(color, "#1C1917", 0.22),
      text: readableText(fill),
      edge: color === "#FFFFFF" ? colors[2] : color,
    };
  });
};

export const buildDiagramPalette = (theme: DiagramTheme | undefined, appearance: DiagramAppearance) => {
  const resolved = resolveDiagramTheme(theme);
  const strip = DIAGRAM_COLOR_STRIPS[resolved];
  const colors = strip.colors;
  const accent = colors.find((color) => luminance(color) < 0.55 && luminance(color) > 0.08) ?? colors[2];
  const deepest = colors[colors.length - 1];
  const lightest = colors[0];
  if (resolved === "brand") {
    if (appearance === "dark") {
      return {
        topicFill: "#16A06E",
        topicText: "#F4FFF9",
        nodeFill: "#18211D",
        nodeText: "#E8F2ED",
        nodeStroke: "#3B5248",
        topicStroke: "#58CDA4",
        mindMapEdge: "#4DB58B",
        flowEdge: "#72B99B",
        canvas: "#101311",
      };
    }
    return {
      topicFill: "#16A06E",
      topicText: "#FFFFFF",
      nodeFill: "#F0F8F4",
      nodeText: "#173B2E",
      nodeStroke: "#B8DFD0",
      topicStroke: "#12845B",
      mindMapEdge: "#55B891",
      flowEdge: "#408A6D",
      canvas: "#F8FAF9",
    };
  }
  if (appearance === "dark") {
    return {
      topicFill: mix(deepest, "#0B0D0C", 0.2),
      topicText: "#F8FAFC",
      nodeFill: mix(deepest, "#101418", 0.45),
      nodeText: "#E8EEF2",
      nodeStroke: mix(accent, "#101418", 0.55),
      topicStroke: mix(accent, "#FFFFFF", 0.28),
      mindMapEdge: accent,
      flowEdge: mix(accent, "#FFFFFF", 0.12),
      canvas: "#101311",
    };
  }
  return {
    topicFill: accent,
    topicText: readableText(accent),
    nodeFill: mix(lightest, "#FFFFFF", luminance(lightest) > 0.9 ? 0.2 : 0.55),
    nodeText: mix(deepest, "#1C1917", 0.15),
    nodeStroke: mix(accent, "#FFFFFF", 0.62),
    topicStroke: mix(accent, "#1C1917", 0.18),
    mindMapEdge: accent,
    flowEdge: mix(accent, "#1C1917", 0.12),
    canvas: mix(lightest, "#FFFFFF", 0.72),
  };
};
