import type { DiagramNodeShape, DiagramTheme } from "./diagram";

export const FLOWCHART_LABEL_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const FLOWCHART_EDGE_ROUTER = {
  name: "manhattan" as const,
  args: { padding: 8, step: 8, excludeEnds: true },
};

export type FlowchartPortName = "top" | "right" | "bottom" | "left";

export type FlowchartBox = { x: number; y: number; width: number; height: number };

export const flowchartEdgePorts = (
  source: FlowchartBox,
  target: FlowchartBox,
): { source: FlowchartPortName; target: FlowchartPortName } => {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (dy < -source.height) return { source: "left", target: "left" };
  if (dx < -source.width) return { source: "top", target: "top" };
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0
      ? { source: "bottom", target: "top" }
      : { source: "top", target: "bottom" };
  }
  return dx >= 0
    ? { source: "right", target: "left" }
    : { source: "left", target: "right" };
};

export const flowchartEdgeIsStraight = (source: FlowchartBox, target: FlowchartBox) => {
  const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
  const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
  if (dy < -source.height || dx < -source.width) return false;
  return (Math.abs(dx) <= 1 && Math.abs(dy) > 8) || (Math.abs(dy) <= 1 && Math.abs(dx) > 8);
};

export const FLOWCHART_LAYOUT_SPACING = { rank: 56, node: 36 };

// Tall flows should stay at reading size. Shrinking the whole graph into the
// viewport makes 12-step notes unreadable; show the start and let the canvas scroll.
export const FLOWCHART_READABLE_MIN_SCALE = 0.85;

export const flowchartFitsReadableViewport = (
  bounds: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 32,
  minScale = FLOWCHART_READABLE_MIN_SCALE,
  maxScale = 1,
) => {
  const availableWidth = Math.max(viewport.width - padding * 2, 1);
  const availableHeight = Math.max(viewport.height - padding * 2, 1);
  const fitScale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
    maxScale,
  );
  return fitScale + 1e-6 >= minScale;
};

export type FlowchartAppearance = "light" | "dark";
export const FLOWCHART_SELECTABLE_THEMES = [
  "brand", "ink", "paper", "island", "tea", "cosmos", "sun", "wa", "rose", "mint",
] as const;
export type FlowchartTheme = (typeof FLOWCHART_SELECTABLE_THEMES)[number];
export const FLOWCHART_THEME_GROUPS = {
  classic: ["brand", "ink", "paper", "island", "tea", "cosmos"],
  vivid: ["sun", "wa", "rose", "mint"],
} as const;

export type FlowchartShapePaint = {
  fill: string;
  stroke: string;
  text: string;
};

export type FlowchartSurface = {
  canvas: string;
  edge: string;
  process: FlowchartShapePaint;
  decision: FlowchartShapePaint;
  terminator: FlowchartShapePaint;
};

const FLOWCHART_THEME_ALIASES: Partial<Record<DiagramTheme, FlowchartTheme>> = {
  ocean: "brand",
  slate: "ink",
  mono: "ink",
  classic: "paper",
  sand: "island",
  sky: "cosmos",
  sunset: "sun",
  violet: "rose",
  aurora: "mint",
};

export const resolveFlowchartTheme = (theme?: DiagramTheme): FlowchartTheme => {
  if (theme && (FLOWCHART_SELECTABLE_THEMES as readonly string[]).includes(theme)) return theme as FlowchartTheme;
  return FLOWCHART_THEME_ALIASES[theme ?? "brand"] ?? "brand";
};

export const FLOWCHART_SURFACES: Record<FlowchartTheme, Record<FlowchartAppearance, FlowchartSurface>> = {
  brand: {
    light: {
      canvas: "#F5F8F6",
      edge: "#4A8A6C",
      process: { fill: "#FFFFFF", stroke: "#6F9B88", text: "#1C3D31" },
      decision: { fill: "#FFF6E5", stroke: "#D4A24A", text: "#7A4A12" },
      terminator: { fill: "#E7F6EF", stroke: "#16A06E", text: "#145C40" },
    },
    dark: {
      canvas: "#101311",
      edge: "#7BB89A",
      process: { fill: "#1B2420", stroke: "#5B7569", text: "#E8F2ED" },
      decision: { fill: "#2A2316", stroke: "#E0B35C", text: "#F8E4B8" },
      terminator: { fill: "#1A3329", stroke: "#4DB58B", text: "#D8F3E6" },
    },
  },
  ink: {
    light: {
      canvas: "#F3F5F7",
      edge: "#5C6774",
      process: { fill: "#FFFFFF", stroke: "#7D8794", text: "#1C232C" },
      decision: { fill: "#E8EDF3", stroke: "#6E7C8F", text: "#243044" },
      terminator: { fill: "#E6EAEF", stroke: "#3A4656", text: "#1A222C" },
    },
    dark: {
      canvas: "#101214",
      edge: "#9AA3AE",
      process: { fill: "#1B1E23", stroke: "#6B7380", text: "#E8ECF1" },
      decision: { fill: "#222830", stroke: "#8B9BB0", text: "#D5DDE8" },
      terminator: { fill: "#1A2028", stroke: "#A8B4C4", text: "#E8EEF4" },
    },
  },
  paper: {
    light: {
      canvas: "#F6F1E8",
      edge: "#8B7355",
      process: { fill: "#FFFCF6", stroke: "#C4B396", text: "#3A3126" },
      decision: { fill: "#F4E4CC", stroke: "#C08A48", text: "#6A3F14" },
      terminator: { fill: "#F0E4D0", stroke: "#7A5230", text: "#3F2A16" },
    },
    dark: {
      canvas: "#161310",
      edge: "#C4A882",
      process: { fill: "#221E19", stroke: "#7A6A56", text: "#F3EBE0" },
      decision: { fill: "#2C2418", stroke: "#D4A06A", text: "#F6E2C4" },
      terminator: { fill: "#2A2118", stroke: "#C4A07A", text: "#F0E4D4" },
    },
  },
  island: {
    light: {
      canvas: "#F6EEE8",
      edge: "#8A6550",
      process: { fill: "#FFF8F3", stroke: "#C4A090", text: "#3A2A22" },
      decision: { fill: "#F3D8C8", stroke: "#C46A48", text: "#6A3220" },
      terminator: { fill: "#EBD0C0", stroke: "#8B4A32", text: "#3F2418" },
    },
    dark: {
      canvas: "#161210",
      edge: "#C4A082",
      process: { fill: "#231C18", stroke: "#8A6A56", text: "#F3E8E0" },
      decision: { fill: "#2C2018", stroke: "#D49070", text: "#F6D8C4" },
      terminator: { fill: "#281A16", stroke: "#C48868", text: "#F0D8CC" },
    },
  },
  tea: {
    light: {
      canvas: "#F4F6EE",
      edge: "#6A7A52",
      process: { fill: "#FFFFFF", stroke: "#8A9A72", text: "#2A3420" },
      decision: { fill: "#E8EED4", stroke: "#8A9A48", text: "#3F4A18" },
      terminator: { fill: "#DCE6C8", stroke: "#4F6A32", text: "#243018" },
    },
    dark: {
      canvas: "#121410",
      edge: "#A0B07A",
      process: { fill: "#1C2018", stroke: "#6A7A56", text: "#E8F0DC" },
      decision: { fill: "#222618", stroke: "#B8C46A", text: "#E8F0C4" },
      terminator: { fill: "#1A2418", stroke: "#8AAA5A", text: "#D8E8C4" },
    },
  },
  cosmos: {
    light: {
      canvas: "#F2F5F8",
      edge: "#4D6F8A",
      process: { fill: "#FFFFFF", stroke: "#7A94A8", text: "#1C2A38" },
      decision: { fill: "#E4EEF5", stroke: "#5A82A0", text: "#1E3A52" },
      terminator: { fill: "#D8E6F0", stroke: "#2A5470", text: "#163044" },
    },
    dark: {
      canvas: "#101218",
      edge: "#7AA0C0",
      process: { fill: "#181E26", stroke: "#5A7088", text: "#E0E8F0" },
      decision: { fill: "#1C2834", stroke: "#7AA0C0", text: "#D0E4F4" },
      terminator: { fill: "#162028", stroke: "#8AB4D0", text: "#D8E8F4" },
    },
  },
  sun: {
    light: {
      canvas: "#F8F6EC",
      edge: "#C4A030",
      process: { fill: "#FFFEF6", stroke: "#D4C47A", text: "#3A3418" },
      decision: { fill: "#FFF0C4", stroke: "#E0B040", text: "#6A4A08" },
      terminator: { fill: "#F8E8B0", stroke: "#C09020", text: "#4A3808" },
    },
    dark: {
      canvas: "#16140C",
      edge: "#E0C060",
      process: { fill: "#242018", stroke: "#8A7A48", text: "#F6F0D8" },
      decision: { fill: "#2C2410", stroke: "#E0B848", text: "#F8E8B8" },
      terminator: { fill: "#28240C", stroke: "#D4B040", text: "#F4E8C0" },
    },
  },
  wa: {
    light: {
      canvas: "#F4F7F9",
      edge: "#4A7AA0",
      process: { fill: "#FFFFFF", stroke: "#8AA8C0", text: "#1C2C3A" },
      decision: { fill: "#FCE8DC", stroke: "#E09070", text: "#7A3A24" },
      terminator: { fill: "#DCE8F4", stroke: "#2A5A88", text: "#1A3858" },
    },
    dark: {
      canvas: "#101418",
      edge: "#7AA8C8",
      process: { fill: "#182028", stroke: "#5A7088", text: "#E0E8F0" },
      decision: { fill: "#2C2018", stroke: "#E0A080", text: "#F8DCC8" },
      terminator: { fill: "#162030", stroke: "#6A98C0", text: "#D4E4F4" },
    },
  },
  rose: {
    light: {
      canvas: "#F8F3F5",
      edge: "#A06078",
      process: { fill: "#FFFFFF", stroke: "#C49AAC", text: "#3A2430" },
      decision: { fill: "#F8E4EC", stroke: "#D0809A", text: "#7A3048" },
      terminator: { fill: "#F0D8E2", stroke: "#A04060", text: "#4A2030" },
    },
    dark: {
      canvas: "#161014",
      edge: "#D0809A",
      process: { fill: "#24181C", stroke: "#8A5A6A", text: "#F4E4EA" },
      decision: { fill: "#2C1A22", stroke: "#E090A8", text: "#F8D8E4" },
      terminator: { fill: "#28141C", stroke: "#E07090", text: "#F4D0DC" },
    },
  },
  mint: {
    light: {
      canvas: "#F2F8F7",
      edge: "#3A8A82",
      process: { fill: "#FFFFFF", stroke: "#7AB0A8", text: "#1C3A38" },
      decision: { fill: "#E4F4F0", stroke: "#4AA89A", text: "#1A5A52" },
      terminator: { fill: "#D4EEE8", stroke: "#1A7A70", text: "#145048" },
    },
    dark: {
      canvas: "#101614",
      edge: "#6AB8AC",
      process: { fill: "#182422", stroke: "#4A786E", text: "#DCF0EC" },
      decision: { fill: "#1A2C28", stroke: "#6AC4B4", text: "#D0F0E8" },
      terminator: { fill: "#162824", stroke: "#5AB8A8", text: "#D0EEE6" },
    },
  },
};

export const resolveFlowchartSurface = (
  appearance: FlowchartAppearance = "light",
  theme?: DiagramTheme,
) => FLOWCHART_SURFACES[resolveFlowchartTheme(theme)][appearance];

export const flowchartThemeSwatches = (theme?: DiagramTheme) => {
  const surface = resolveFlowchartSurface("light", theme);
  return [surface.process.fill, surface.decision.fill, surface.terminator.stroke] as const;
};

export const flowchartMermaidClassName = (shape: DiagramNodeShape) =>
  shape === "decision" ? "flowDecision" : shape === "terminator" ? "flowTerminator" : "flowProcess";

export const flowchartMermaidClassDefs = (
  theme?: DiagramTheme,
  appearance: FlowchartAppearance = "light",
) => {
  const surface = resolveFlowchartSurface(appearance, theme);
  return (["process", "decision", "terminator"] as const).map((role) => {
    const paint = surface[role];
    const className = role === "process" ? "flowProcess" : role === "decision" ? "flowDecision" : "flowTerminator";
    return `  classDef ${className} fill:${paint.fill},stroke:${paint.stroke},color:${paint.text},stroke-width:1.5px`;
  });
};

export const flowchartShapePaint = (
  shape: DiagramNodeShape,
  appearance: FlowchartAppearance,
  theme?: DiagramTheme,
) => {
  const surface = resolveFlowchartSurface(appearance, theme);
  if (shape === "decision") return surface.decision;
  if (shape === "terminator") return surface.terminator;
  return surface.process;
};

export const flowchartNodeVisual = (
  shape: DiagramNodeShape,
  appearance: FlowchartAppearance,
  size: { width: number; height: number },
  theme?: DiagramTheme,
) => {
  const paint = flowchartShapePaint(shape, appearance, theme);
  const terminator = shape === "terminator";
  const decision = shape === "decision";
  return {
    body: {
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: 1.5,
      rx: terminator ? Math.round(size.height / 2) : 10,
      ry: terminator ? Math.round(size.height / 2) : 10,
      ...(decision ? { refPoints: "0,10 10,0 20,10 10,20" } : {}),
    },
    label: {
      fill: paint.text,
      fontSize: 13,
      fontWeight: terminator ? 650 : decision ? 600 : 500,
      fontFamily: FLOWCHART_LABEL_FONT,
      lineHeight: 18,
    },
  };
};
