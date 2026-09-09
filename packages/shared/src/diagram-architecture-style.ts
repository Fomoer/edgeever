import type { ArchitectureResourceIcon, DiagramEdgeKind, DiagramNodeShape } from "./diagram";
import {
  ARCHITECTURE_RESOURCE_ICON_ELEMENTS,
  type ArchitectureIconElement,
} from "./diagram-architecture-icons";

export type { ArchitectureIconElement };

export const ARCHITECTURE_LABEL_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const ARCHITECTURE_ICON_SIZE = 24;
export const ARCHITECTURE_ICON_FRAME = 34;
export const ARCHITECTURE_ICON_INSET = 10;

export type ArchitectureAppearance = "light" | "dark";

export type ArchitectureComponentShape = Exclude<
  DiagramNodeShape,
  "topic" | "process" | "decision" | "terminator" | "boundary"
>;

export const ARCHITECTURE_COMPONENT_SHAPES: ArchitectureComponentShape[] = [
  "client", "frontend", "service", "database", "storage", "queue", "security", "external",
];

export const isArchitectureNodeShape = (shape: DiagramNodeShape) =>
  shape === "boundary" || ARCHITECTURE_COMPONENT_SHAPES.includes(shape as ArchitectureComponentShape);

export const ARCHITECTURE_ACCENTS: Record<ArchitectureComponentShape, string> = {
  client: "#0891B2",
  frontend: "#2563EB",
  service: "#16A06E",
  database: "#7C3AED",
  storage: "#D97706",
  queue: "#EA580C",
  security: "#E11D48",
  external: "#64748B",
};

const ARCHITECTURE_SHAPE_RESOURCE: Record<ArchitectureComponentShape, ArchitectureResourceIcon> = {
  client: "client",
  frontend: "webApp",
  service: "service",
  database: "relationalDatabase",
  storage: "objectStorage",
  queue: "messageQueue",
  security: "waf",
  external: "saas",
};

export type ArchitectureShapePaint = {
  fill: string;
  stroke: string;
  text: string;
  accent: string;
  iconFrame: string;
};

export type ArchitectureEdgePaint = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerWidth: number;
  markerHeight: number;
};

export type ArchitectureSurface = {
  canvas: string;
  boundaryStroke: string;
  boundaryText: string;
  nodes: Record<ArchitectureComponentShape, ArchitectureShapePaint>;
  edges: Record<Exclude<DiagramEdgeKind, never>, ArchitectureEdgePaint>;
};

export const ARCHITECTURE_SURFACES: Record<ArchitectureAppearance, ArchitectureSurface> = {
  light: {
    canvas: "#F5F8F6",
    boundaryStroke: "#7B8F86",
    boundaryText: "#1C3D31",
    nodes: {
      client: { fill: "#E1F2F6", stroke: "#0A87A6", text: "#134F5D", accent: "#0891B2", iconFrame: "#CEE9F0" },
      frontend: { fill: "#E5ECFD", stroke: "#245DDA", text: "#203A76", accent: "#2563EB", iconFrame: "#D3E0FB" },
      service: { fill: "#E3F4EE", stroke: "#169567", text: "#19563E", accent: "#16A06E", iconFrame: "#D0ECE2" },
      database: { fill: "#EFE7FD", stroke: "#7437DC", text: "#472877", accent: "#7C3AED", iconFrame: "#E5D8FB" },
      storage: { fill: "#FAEFE1", stroke: "#CA6F07", text: "#71430F", accent: "#D97706", iconFrame: "#F7E4CD" },
      queue: { fill: "#FCEBE2", stroke: "#DA530D", text: "#793512", accent: "#EA580C", iconFrame: "#FBDECE" },
      security: { fill: "#FBE4E9", stroke: "#D11D44", text: "#751B2D", accent: "#E11D48", iconFrame: "#F9D2DA" },
      external: { fill: "#ECEEF1", stroke: "#5E6D82", text: "#3C424B", accent: "#64748B", iconFrame: "#E0E3E8" },
    },
    edges: {
      dependency: { stroke: "#64748B", strokeWidth: 1.2, markerWidth: 7, markerHeight: 5 },
      request: { stroke: "#0F8A5C", strokeWidth: 1.6, markerWidth: 8, markerHeight: 6 },
      data: { stroke: "#7C3AED", strokeWidth: 1.6, markerWidth: 8, markerHeight: 6 },
      async: { stroke: "#EA580C", strokeWidth: 1.5, strokeDasharray: "7 5", markerWidth: 8, markerHeight: 6 },
    },
  },
  dark: {
    canvas: "#101311",
    boundaryStroke: "#5B6F66",
    boundaryText: "#D7F4E8",
    nodes: {
      client: { fill: "#0E363E", stroke: "#3EA9C3", text: "#D3EBF1", accent: "#3EA9C3", iconFrame: "#0C4F5E" },
      frontend: { fill: "#16294E", stroke: "#5585EF", text: "#D8E3FB", accent: "#5585EF", iconFrame: "#1A397A" },
      service: { fill: "#123A2B", stroke: "#49B58E", text: "#D5EEE5", accent: "#49B58E", iconFrame: "#13573E" },
      database: { fill: "#2E1E4F", stroke: "#9965F1", text: "#E7DCFC", accent: "#9965F1", iconFrame: "#44267B" },
      storage: { fill: "#482F0E", stroke: "#E1953D", text: "#F8E7D2", accent: "#E1953D", iconFrame: "#70430C" },
      queue: { fill: "#4D2610", stroke: "#EF7D41", text: "#FBE1D3", accent: "#EF7D41", iconFrame: "#79340F" },
      security: { fill: "#4B1620", stroke: "#E84F70", text: "#FAD6DE", accent: "#E84F70", iconFrame: "#74182B" },
      external: { fill: "#282E33", stroke: "#8693A5", text: "#E3E6EA", accent: "#8693A5", iconFrame: "#38424C" },
    },
    edges: {
      dependency: { stroke: "#94A3B8", strokeWidth: 1.2, markerWidth: 7, markerHeight: 5 },
      request: { stroke: "#4DB58B", strokeWidth: 1.6, markerWidth: 8, markerHeight: 6 },
      data: { stroke: "#A78BFA", strokeWidth: 1.6, markerWidth: 8, markerHeight: 6 },
      async: { stroke: "#FB923C", strokeWidth: 1.5, strokeDasharray: "7 5", markerWidth: 8, markerHeight: 6 },
    },
  },
};

export const resolveArchitectureSurface = (appearance: ArchitectureAppearance = "light") =>
  ARCHITECTURE_SURFACES[appearance];

export const architectureShapePaint = (shape: DiagramNodeShape, appearance: ArchitectureAppearance) => {
  const surface = resolveArchitectureSurface(appearance);
  if (shape === "boundary") {
    return {
      fill: "transparent",
      stroke: surface.boundaryStroke,
      text: surface.boundaryText,
      accent: surface.boundaryStroke,
      iconFrame: "transparent",
    } satisfies ArchitectureShapePaint;
  }
  if (ARCHITECTURE_COMPONENT_SHAPES.includes(shape as ArchitectureComponentShape)) {
    return surface.nodes[shape as ArchitectureComponentShape];
  }
  return surface.nodes.service;
};

const architectureBodyRadius = (shape: DiagramNodeShape, height: number) => {
  if (shape === "database" || shape === "queue" || shape === "external") return Math.round(height / 2);
  if (shape === "security") return 16;
  if (shape === "frontend") return 10;
  if (shape === "service") return 8;
  if (shape === "client" || shape === "storage") return 6;
  return 11;
};

const architectureIconFrameRadius = (shape: DiagramNodeShape) => {
  if (shape === "database" || shape === "external") return 17;
  if (shape === "security") return 12;
  if (shape === "queue") return 10;
  return 8;
};

export const architectureIconOffset = (height: number) =>
  Math.round((height - ARCHITECTURE_ICON_FRAME) / 2);

export const architectureIconElements = (
  resourceIcon: ArchitectureResourceIcon | undefined,
  shape: DiagramNodeShape,
): ArchitectureIconElement[] => {
  const resolved = resourceIcon
    ?? (ARCHITECTURE_COMPONENT_SHAPES.includes(shape as ArchitectureComponentShape)
      ? ARCHITECTURE_SHAPE_RESOURCE[shape as ArchitectureComponentShape]
      : "service");
  return ARCHITECTURE_RESOURCE_ICON_ELEMENTS[resolved] ?? ARCHITECTURE_RESOURCE_ICON_ELEMENTS.service;
};

export const architectureNodeMarkup = (
  resourceIcon: ArchitectureResourceIcon | undefined,
  shape: DiagramNodeShape,
) => {
  if (shape === "boundary") {
    return [
      { tagName: "rect", selector: "body" },
      { tagName: "text", selector: "label" },
    ];
  }
  const icons = architectureIconElements(resourceIcon, shape);
  return [
    { tagName: "rect", selector: "body" },
    { tagName: "rect", selector: "iconFrame" },
    ...icons.map((icon, index) => ({ tagName: icon.tagName, selector: `architectureIcon${index}` })),
    { tagName: "text", selector: "label" },
  ];
};

export const architectureNodeVisual = (
  shape: DiagramNodeShape,
  appearance: ArchitectureAppearance,
  size: { width: number; height: number },
  resourceIcon?: ArchitectureResourceIcon,
) => {
  const paint = architectureShapePaint(shape, appearance);
  const boundary = shape === "boundary";
  const radius = architectureBodyRadius(shape, size.height);
  const iconY = architectureIconOffset(size.height);
  const icons = boundary ? [] : architectureIconElements(resourceIcon, shape);
  const iconAttrs = Object.fromEntries(icons.map((icon, index) => [`architectureIcon${index}`, {
    ...icon.attrs,
    transform: `translate(15 ${iconY + 5})`,
    fill: "none",
    stroke: paint.accent,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pointerEvents: "none",
  }]));
  return {
    markup: architectureNodeMarkup(resourceIcon, shape),
    body: {
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: 1.5,
      strokeDasharray: boundary || shape === "external" ? "7 5" : undefined,
      rx: radius,
      ry: radius,
    },
    label: {
      fill: paint.text,
      fontSize: boundary ? 12 : 13,
      fontWeight: boundary ? 650 : 600,
      fontFamily: ARCHITECTURE_LABEL_FONT,
      lineHeight: 18,
      ...(boundary
        ? { refX: 18, refY: 22, textAnchor: "start" as const, textVerticalAnchor: "middle" as const }
        : { refX: 54, refY: "50%", textAnchor: "start" as const, textVerticalAnchor: "middle" as const }),
    },
    attrs: boundary ? {} : {
      iconFrame: {
        x: ARCHITECTURE_ICON_INSET,
        y: iconY,
        width: ARCHITECTURE_ICON_FRAME,
        height: ARCHITECTURE_ICON_FRAME,
        rx: architectureIconFrameRadius(shape),
        ry: architectureIconFrameRadius(shape),
        fill: paint.iconFrame,
        stroke: "none",
        pointerEvents: "none",
      },
      ...iconAttrs,
    },
  };
};

export const architectureEdgeVisual = (
  kind: DiagramEdgeKind | undefined,
  appearance: ArchitectureAppearance,
  bidirectional = false,
) => {
  const paint = resolveArchitectureSurface(appearance).edges[kind ?? "dependency"];
  const marker = { name: "block" as const, width: paint.markerWidth, height: paint.markerHeight };
  return {
    stroke: paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeDasharray: paint.strokeDasharray,
    sourceMarker: bidirectional ? marker : null,
    targetMarker: marker,
    fill: "none" as const,
  };
};

const mermaidClassName: Record<ArchitectureComponentShape, string> = {
  client: "archClient",
  frontend: "archFrontend",
  service: "archService",
  database: "archDatabase",
  storage: "archStorage",
  queue: "archQueue",
  security: "archSecurity",
  external: "archExternal",
};

export const architectureMermaidClassName = (shape: DiagramNodeShape) =>
  mermaidClassName[shape as ArchitectureComponentShape];

export const architectureMermaidClassDefs = (appearance: ArchitectureAppearance = "light") => {
  const surface = resolveArchitectureSurface(appearance);
  return ARCHITECTURE_COMPONENT_SHAPES.map((shape) => {
    const paint = surface.nodes[shape];
    const dashed = shape === "external" ? ",stroke-dasharray:6 4" : "";
    return `  classDef ${mermaidClassName[shape]} fill:${paint.fill},stroke:${paint.stroke},color:${paint.text},stroke-width:1.5px${dashed}`;
  });
};

export const architectureMermaidBoundaryStyle = (appearance: ArchitectureAppearance = "light") => {
  const surface = resolveArchitectureSurface(appearance);
  return `fill:transparent,stroke:${surface.boundaryStroke},stroke-width:1.5px,stroke-dasharray:7 5`;
};
