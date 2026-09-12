import type { DiagramTheme } from "./diagram";
import { resolveDiagramTheme } from "./diagram";

type DiagramAppearance = "light" | "dark";

export type DiagramColorStrip = {
  id: Exclude<ReturnType<typeof resolveDiagramTheme>, never>;
  group: "vivid" | "classic";
  colors: readonly [string, string, string, string, string, string];
};

type DiagramThemeDefinition = {
  id: Exclude<ReturnType<typeof resolveDiagramTheme>, never>;
  group: "vivid" | "classic";
  colors: readonly [string, string, string, string, string, string];
  lightCanvas: string;
  darkCanvas: string;
  accent: string;
};

export const DIAGRAM_THEME_DEFINITIONS: Record<
  "brand" | "cosmos" | "dune" | "slate" | "prism" | "sunrise" | "marine" | "blossom" | "mint" | "macaron",
  DiagramThemeDefinition
> = {
  brand: {
    id: "brand",
    group: "classic",
    colors: ["#16A06E", "#059669", "#0D9488", "#10B981", "#047857", "#065F46"],
    lightCanvas: "#F8FAF9",
    darkCanvas: "#101311",
    accent: "#16A06E",
  },
  cosmos: {
    id: "cosmos",
    group: "classic",
    colors: ["#2563EB", "#0284C7", "#4F46E5", "#0D9488", "#3B82F6", "#1D4ED8"],
    lightCanvas: "#F8FAFC",
    darkCanvas: "#0F1318",
    accent: "#2563EB",
  },
  dune: {
    id: "dune",
    group: "classic",
    colors: ["#C2410C", "#D97706", "#B45309", "#A16207", "#78350F", "#9A3412"],
    lightCanvas: "#FAF8F5",
    darkCanvas: "#151311",
    accent: "#B45309",
  },
  slate: {
    id: "slate",
    group: "classic",
    colors: ["#475569", "#52525B", "#4B5563", "#334155", "#64748B", "#1E293B"],
    lightCanvas: "#F8F9FA",
    darkCanvas: "#121416",
    accent: "#475569",
  },
  prism: {
    id: "prism",
    group: "vivid",
    colors: ["#E11D48", "#EA580C", "#D97706", "#059669", "#2563EB", "#7C3AED"],
    lightCanvas: "#FAFAFA",
    darkCanvas: "#111215",
    accent: "#6366F1",
  },
  sunrise: {
    id: "sunrise",
    group: "vivid",
    colors: ["#E11D48", "#F97316", "#F59E0B", "#D97706", "#DC2626", "#EA580C"],
    lightCanvas: "#FFFDF7",
    darkCanvas: "#16130E",
    accent: "#EA580C",
  },
  marine: {
    id: "marine",
    group: "vivid",
    colors: ["#0284C7", "#06B6D4", "#0D9488", "#2563EB", "#0891B2", "#1D4ED8"],
    lightCanvas: "#F5FAFD",
    darkCanvas: "#0C1318",
    accent: "#0284C7",
  },
  blossom: {
    id: "blossom",
    group: "vivid",
    colors: ["#DB2777", "#C026D3", "#9333EA", "#E11D48", "#BE185D", "#7C3AED"],
    lightCanvas: "#FDF8FA",
    darkCanvas: "#160F14",
    accent: "#DB2777",
  },
  mint: {
    id: "mint",
    group: "vivid",
    colors: ["#0D9488", "#059669", "#10B981", "#0891B2", "#16A34A", "#047857"],
    lightCanvas: "#F5FAF8",
    darkCanvas: "#0D1512",
    accent: "#0D9488",
  },
  macaron: {
    id: "macaron",
    group: "vivid",
    colors: ["#EC4899", "#FB923C", "#EAB308", "#10B981", "#38BDF8", "#8B5CF6"],
    lightCanvas: "#FAF9F8",
    darkCanvas: "#131316",
    accent: "#EC4899",
  },
};

export const DIAGRAM_COLOR_STRIPS: Record<
  "brand" | "cosmos" | "dune" | "slate" | "prism" | "sunrise" | "marine" | "blossom" | "mint" | "macaron",
  DiagramColorStrip
> = Object.fromEntries(
  Object.entries(DIAGRAM_THEME_DEFINITIONS).map(([id, def]) => [
    id,
    { id: def.id, group: def.group, colors: def.colors },
  ]),
) as Record<
  "brand" | "cosmos" | "dune" | "slate" | "prism" | "sunrise" | "marine" | "blossom" | "mint" | "macaron",
  DiagramColorStrip
>;

export const DIAGRAM_THEME_GROUPS = {
  vivid: ["prism", "sunrise", "marine", "blossom", "mint", "macaron"],
  classic: ["brand", "cosmos", "dune", "slate"],
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

const readableText = (fill: string) => (luminance(fill) > 0.35 ? "#1C1917" : "#FFFCF8");

export const diagramThemeSwatches = (theme?: DiagramTheme) =>
  DIAGRAM_COLOR_STRIPS[resolveDiagramTheme(theme)].colors;

export const diagramThemeUsesBranchColors = (theme?: DiagramTheme) => resolveDiagramTheme(theme) !== "brand";

const resolveBranchEdge = (color: string, appearance: DiagramAppearance) => {
  const lum = luminance(color);
  if (appearance === "dark") {
    return lum < 0.22 ? mix(color, "#FFFFFF", Math.max(0.35, (0.30 - lum) * 1.6)) : color;
  }
  return lum > 0.26 ? mix(color, "#18181B", Math.max(0.24, (lum - 0.20) * 0.9)) : color;
};

export const buildDiagramBranchTints = (theme: DiagramTheme | undefined, appearance: DiagramAppearance) => {
  const colors = diagramThemeSwatches(theme);
  return colors.map((color) => {
    const edge = resolveBranchEdge(color, appearance);
    const fill = appearance === "dark" ? mix(color, "#121518", 0.72) : mix(color, "#FFFFFF", 0.84);
    return {
      fill,
      stroke: appearance === "dark" ? mix(edge, "#FFFFFF", 0.15) : mix(edge, "#1C1917", 0.12),
      text: readableText(fill),
      edge,
    };
  });
};

export const buildDiagramPalette = (theme: DiagramTheme | undefined, appearance: DiagramAppearance) => {
  const resolved = resolveDiagramTheme(theme);
  const def = DIAGRAM_THEME_DEFINITIONS[resolved];
  const accent = def.accent;
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
    const edge = resolveBranchEdge(accent, "dark");
    return {
      topicFill: accent,
      topicText: readableText(accent),
      nodeFill: mix(accent, "#101418", 0.78),
      nodeText: "#E8EEF2",
      nodeStroke: mix(edge, "#FFFFFF", 0.15),
      topicStroke: mix(accent, "#FFFFFF", 0.25),
      mindMapEdge: edge,
      flowEdge: mix(accent, "#FFFFFF", 0.15),
      canvas: def.darkCanvas,
    };
  }
  const edge = resolveBranchEdge(accent, "light");
  return {
    topicFill: accent,
    topicText: readableText(accent),
    nodeFill: mix(accent, "#FFFFFF", 0.88),
    nodeText: mix(def.colors[def.colors.length - 1], "#1C1917", 0.35),
    nodeStroke: mix(edge, "#FFFFFF", 0.50),
    topicStroke: mix(accent, "#1C1917", 0.15),
    mindMapEdge: edge,
    flowEdge: mix(accent, "#1C1917", 0.15),
    canvas: def.lightCanvas,
  };
};
