import type { DiagramStructure, DiagramTheme } from "./diagram";
import { buildDiagramBranchTints, diagramThemeUsesBranchColors } from "./diagram-palette";
import { visualTextUnits } from "./diagram-node-presentation";

export type MindMapRole = "root" | "primary" | "nested";
export type MindMapAppearance = "light" | "dark";

export type MindMapPalette = {
  topicFill: string;
  topicText: string;
  nodeFill: string;
  nodeText: string;
  nodeStroke: string;
  topicStroke: string;
  mindMapEdge: string;
  canvas: string;
};

export type MindMapBranchTint = {
  fill: string;
  stroke: string;
  text: string;
  edge: string;
};

export type MindMapPoint = { x: number; y: number };
export type MindMapBox = { x: number; y: number; width: number; height: number };
export type MindMapIndexedNode = { id: string; parentId?: string; x?: number; y?: number };

export const MIND_MAP_CONNECTOR_NAME = "edgeever-mindmap";
export const MIND_MAP_HORIZONTAL_GAP = 72;
export const MIND_MAP_VERTICAL_GAP = 20;
export const MIND_MAP_LABEL_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const MIND_MAP_TOPIC_MARKUP = [
  { tagName: "rect", selector: "body" },
  { tagName: "path", selector: "underline" },
  { tagName: "text", selector: "label" },
];

export type MindMapTopicForm =
  | "rounded"
  | "rect"
  | "capsule"
  | "ellipse"
  | "circle"
  | "diamond"
  | "hexagon"
  | "cloud"
  | "underline";

export type MindMapLayoutFamily = "map" | "logic" | "brace" | "org" | "tree" | "timeline" | "fishbone";
export type MindMapSide = "left" | "right" | "top" | "bottom";

export const mindMapLayoutFamily = (structure?: DiagramStructure): MindMapLayoutFamily => {
  if (structure === "logic") return "logic";
  if (structure === "brace") return "brace";
  if (structure === "org") return "org";
  if (structure === "tree") return "tree";
  if (structure === "timeline") return "timeline";
  if (structure === "fishbone") return "fishbone";
  return "map";
};

export const mindMapIsOneSided = (structure?: DiagramStructure) => {
  const family = mindMapLayoutFamily(structure);
  return family === "logic" || family === "tree" || family === "brace";
};

export const mindMapUsesRibbon = (structure?: DiagramStructure) => {
  const family = mindMapLayoutFamily(structure);
  return family === "map" || family === "logic";
};

export const mindMapUsesUnderline = (role: MindMapRole, structure?: DiagramStructure) => {
  if (role === "root") return false;
  if (structure === "line" || structure === "brace") return true;
  if (
    structure === "map"
    || structure === "tree"
    || structure === "timeline"
    || structure === "fishbone"
    || !structure
  ) return role === "nested";
  return false;
};

export const mindMapTopicForm = (structure?: DiagramStructure, role: MindMapRole = "primary"): MindMapTopicForm => {
  if (mindMapUsesUnderline(role, structure)) return "underline";
  if (structure === "capsule") return "capsule";
  if (structure === "ellipse") return "ellipse";
  if (structure === "circle") return "circle";
  if (structure === "hexagon") return "hexagon";
  if (structure === "box" || structure === "logic" || structure === "org") return "rounded";
  if (role === "root") return "capsule";
  return "rounded";
};

export const mindMapTopicMarkup = (structure?: DiagramStructure, role: MindMapRole = "primary") => {
  const form = mindMapTopicForm(structure, role);
  const body = form === "ellipse" || form === "circle"
    ? { tagName: "ellipse", selector: "body" }
    : form === "diamond" || form === "hexagon"
      ? { tagName: "polygon", selector: "body" }
      : form === "cloud"
        ? { tagName: "path", selector: "body" }
        : { tagName: "rect", selector: "body" };
  return [body, { tagName: "path", selector: "underline" }, { tagName: "text", selector: "label" }];
};

export const MIND_MAP_BRANCH_TINTS: Record<MindMapAppearance, MindMapBranchTint[]> = {
  light: [
    { fill: "#E7F6EF", stroke: "#0F8A5C", text: "#145C40", edge: "#16A06E" },
    { fill: "#E7F0FE", stroke: "#2563EB", text: "#1E3A8A", edge: "#3B82F6" },
    { fill: "#F3E8FF", stroke: "#7C3AED", text: "#5B21B6", edge: "#8B5CF6" },
    { fill: "#FEF3C7", stroke: "#D97706", text: "#92400E", edge: "#F59E0B" },
    { fill: "#FCE7F3", stroke: "#DB2777", text: "#9D174D", edge: "#EC4899" },
    { fill: "#CFFAFE", stroke: "#0E7490", text: "#155E75", edge: "#06B6D4" },
  ],
  dark: [
    { fill: "#1A2A22", stroke: "#4DB58B", text: "#D7F4E8", edge: "#4DB58B" },
    { fill: "#1A2438", stroke: "#60A5FA", text: "#DBEAFE", edge: "#60A5FA" },
    { fill: "#251B38", stroke: "#A78BFA", text: "#EDE9FE", edge: "#A78BFA" },
    { fill: "#2A2114", stroke: "#FBBF24", text: "#FEF3C7", edge: "#FBBF24" },
    { fill: "#2A1520", stroke: "#F472B6", text: "#FCE7F3", edge: "#F472B6" },
    { fill: "#15252B", stroke: "#22D3EE", text: "#CFFAFE", edge: "#22D3EE" },
  ],
};

const wrapVisualText = (label: string, capacity: number) => label.split("\n").flatMap((paragraph) => {
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(paragraph)) {
    if (line && visualTextUnits(line + character) > capacity) {
      lines.push(line);
      line = "";
    }
    line += character;
  }
  lines.push(line);
  return lines;
});

const formatPoint = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

export const mindMapUsesBranchColors = (theme?: DiagramTheme) => diagramThemeUsesBranchColors(theme);

export const mindMapNodeRole = (
  nodes: MindMapIndexedNode[],
  nodeId: string,
): MindMapRole => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node?.parentId) return "root";
  const parent = byId.get(node.parentId);
  if (!parent?.parentId) return "primary";
  return "nested";
};

export const mindMapBranchTintIndex = (
  nodes: MindMapIndexedNode[],
  nodeId: string,
): number | null => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node?.parentId) return null;
  let firstLevel = node;
  let current = node;
  const visited = new Set<string>();
  while (current.parentId && byId.has(current.parentId) && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    if (!parent.parentId) {
      firstLevel = current;
      break;
    }
    current = parent;
    firstLevel = current;
  }
  const siblings = nodes
    .filter((item) => item.parentId === firstLevel.parentId)
    .sort((left, right) => (left.y ?? 0) - (right.y ?? 0) || (left.x ?? 0) - (right.x ?? 0) || left.id.localeCompare(right.id));
  const index = siblings.findIndex((item) => item.id === firstLevel.id);
  return index < 0 ? 0 : index;
};

export const mindMapBranchTint = (
  index: number | null,
  appearance: MindMapAppearance,
  theme?: DiagramTheme,
): MindMapBranchTint | undefined => {
  if (index == null) return undefined;
  const tints = theme ? buildDiagramBranchTints(theme, appearance) : MIND_MAP_BRANCH_TINTS[appearance];
  return tints[index % tints.length];
};

export const mindMapNodeSize = (label: string, role: MindMapRole = "primary", structure?: DiagramStructure) => {
  const isRoot = role === "root";
  const underline = mindMapUsesUnderline(role, structure);
  const form = mindMapTopicForm(structure, role);
  const padX = isRoot ? 36 : underline ? 22 : form === "diamond" || form === "hexagon" || form === "circle" ? 36 : 28;
  const width = Math.round(Math.min(
    isRoot ? 180 : form === "circle" ? 132 : 168,
    Math.max(isRoot ? 124 : underline ? 88 : form === "circle" ? 108 : 96, visualTextUnits(label) * 13 + padX),
  ));
  const height = isRoot ? 46 : underline ? 32 : form === "circle" ? Math.max(40, width - 24) : 36;
  return { width, height };
};

export const compactMindMapNodeSize = (label: string, isRoot: boolean) => (
  mindMapNodeSize(label, isRoot ? "root" : "primary")
);

export const mindMapNodePresentation = (label: string, role: MindMapRole, structure?: DiagramStructure) => {
  const size = mindMapNodeSize(label, role, structure);
  const underline = mindMapUsesUnderline(role, structure);
  const lineHeight = role === "root" ? 20 : 18;
  const padX = role === "root" ? 36 : underline ? 22 : 28;
  const lines = wrapVisualText(label, Math.max(4, (size.width - padX) / 13));
  return {
    ...size,
    height: Math.max(size.height, lines.length * lineHeight + (role === "root" ? 18 : underline ? 10 : 14)),
    text: lines.join("\n"),
    fontSize: role === "root" ? 15 : role === "primary" ? 14 : 13,
  };
};

export const mindMapRootRadius = (height: number) => Math.round(Math.max(1, height / 2));

export const mindMapUnderlinePath = (width: number, height: number) => (
  `M 1 ${formatPoint(Math.max(2, height - 2))} H ${formatPoint(Math.max(2, width - 1))}`
);

export const mindMapCloudPath = (width: number, height: number) => {
  const w = Math.max(width, 12);
  const h = Math.max(height, 12);
  return [
    `M ${formatPoint(w * 0.18)} ${formatPoint(h * 0.62)}`,
    `Q ${formatPoint(w * 0.06)} ${formatPoint(h * 0.60)} ${formatPoint(w * 0.08)} ${formatPoint(h * 0.44)}`,
    `Q ${formatPoint(w * 0.02)} ${formatPoint(h * 0.26)} ${formatPoint(w * 0.22)} ${formatPoint(h * 0.24)}`,
    `Q ${formatPoint(w * 0.30)} ${formatPoint(h * 0.06)} ${formatPoint(w * 0.48)} ${formatPoint(h * 0.14)}`,
    `Q ${formatPoint(w * 0.60)} ${formatPoint(h * 0.02)} ${formatPoint(w * 0.72)} ${formatPoint(h * 0.16)}`,
    `Q ${formatPoint(w * 0.96)} ${formatPoint(h * 0.14)} ${formatPoint(w * 0.92)} ${formatPoint(h * 0.40)}`,
    `Q ${formatPoint(w * 1.02)} ${formatPoint(h * 0.56)} ${formatPoint(w * 0.84)} ${formatPoint(h * 0.64)}`,
    `Q ${formatPoint(w * 0.80)} ${formatPoint(h * 0.84)} ${formatPoint(w * 0.58)} ${formatPoint(h * 0.78)}`,
    `Q ${formatPoint(w * 0.42)} ${formatPoint(h * 0.92)} ${formatPoint(w * 0.30)} ${formatPoint(h * 0.76)}`,
    `Q ${formatPoint(w * 0.12)} ${formatPoint(h * 0.82)} ${formatPoint(w * 0.18)} ${formatPoint(h * 0.62)}`,
    "Z",
  ].join(" ");
};

const mindMapBodyGeometry = (form: MindMapTopicForm, width: number, height: number, rx: number) => {
  if (form === "ellipse" || form === "circle") {
    return { refCx: "50%", refCy: "50%", refRx: "50%", refRy: "50%" };
  }
  if (form === "diamond") return { refPoints: "5,0 10,5 5,10 0,5" };
  if (form === "hexagon") return { refPoints: "2.5,0 7.5,0 10,5 7.5,10 2.5,10 0,5" };
  if (form === "cloud") return { d: mindMapCloudPath(width, height) };
  return { rx, ry: rx };
};

export const mindMapNodeVisual = (
  role: MindMapRole,
  palette: MindMapPalette,
  options: {
    tint?: MindMapBranchTint;
    underline?: boolean;
    structure?: DiagramStructure;
    width?: number;
    height?: number;
  } = {},
) => {
  const underline = options.underline ?? mindMapUsesUnderline(role, options.structure);
  const width = options.width ?? 96;
  const height = options.height ?? (role === "root" ? 46 : underline ? 32 : 36);
  const tint = options.tint;
  const form = mindMapTopicForm(options.structure, role);
  if (underline) {
    const color = tint?.edge ?? palette.mindMapEdge;
    return {
      body: {
        fill: "transparent",
        stroke: "none",
        strokeWidth: 0,
        rx: 0,
        ry: 0,
      },
      label: {
        fill: tint?.text ?? palette.nodeText,
        fontSize: role === "primary" ? 14 : 13,
        fontWeight: role === "primary" ? 650 : 500,
        fontFamily: MIND_MAP_LABEL_FONT,
        lineHeight: 18,
        refX: "50%",
        refY: height - 6,
        textAnchor: "middle" as const,
        textVerticalAnchor: "bottom" as const,
      },
      underline: {
        d: mindMapUnderlinePath(width, height),
        stroke: color,
        strokeWidth: 1.8,
        fill: "none",
        strokeLinecap: "round",
        pointerEvents: "none",
      },
    };
  }
  const isRoot = role === "root";
  const radius = form === "capsule" || (isRoot && form === "rounded")
    ? mindMapRootRadius(height)
    : form === "rect"
      ? 2
      : isRoot ? 12 : role === "nested" ? 8 : 10;
  return {
    body: {
      fill: isRoot ? palette.topicFill : tint?.fill ?? (role === "nested" ? palette.canvas : palette.nodeFill),
      stroke: isRoot ? palette.topicStroke : tint?.stroke ?? (role === "nested" ? palette.nodeStroke : palette.topicStroke),
      strokeWidth: role === "nested" && !isRoot ? 1 : 1.5,
      ...mindMapBodyGeometry(form, width, height, radius),
    },
    label: {
      fill: isRoot ? palette.topicText : tint?.text ?? palette.nodeText,
      fontSize: isRoot ? 15 : role === "primary" ? 14 : 13,
      fontWeight: isRoot || role === "primary" ? 650 : 500,
      fontFamily: MIND_MAP_LABEL_FONT,
      lineHeight: isRoot ? 20 : 18,
      refY: "50%",
      textAnchor: "middle" as const,
      textVerticalAnchor: "middle" as const,
    },
    underline: { d: "", stroke: "none", fill: "none" },
  };
};

export const resolveMindMapNodeStyle = (
  nodes: MindMapIndexedNode[],
  nodeId: string,
  palette: MindMapPalette,
  theme: DiagramTheme | undefined,
  appearance: MindMapAppearance,
  size: { width: number; height: number },
  structure?: DiagramStructure,
) => {
  const role = mindMapNodeRole(nodes, nodeId);
  const underline = mindMapUsesUnderline(role, structure);
  const tint = mindMapUsesBranchColors(theme)
    ? mindMapBranchTint(mindMapBranchTintIndex(nodes, nodeId), appearance, theme)
    : undefined;
  return {
    role,
    underline,
    tint,
    visual: mindMapNodeVisual(role, palette, { tint, underline, structure, width: size.width, height: size.height }),
  };
};

export const mindMapEdgeVisual = (
  sourceRole: MindMapRole,
  palette: MindMapPalette,
  tint?: MindMapBranchTint,
) => {
  const stroke = tint?.edge ?? palette.mindMapEdge;
  if (sourceRole === "root") return { stroke, sourceWidth: 3.1, targetWidth: 1.55 };
  if (sourceRole === "primary") return { stroke, sourceWidth: 1.85, targetWidth: 1.15 };
  return { stroke, sourceWidth: 1.25, targetWidth: 0.9 };
};

export const mindMapBranchSides = (
  source: MindMapBox,
  target: MindMapBox,
  structure?: DiagramStructure,
): { source: MindMapSide; target: MindMapSide } => {
  const family = mindMapLayoutFamily(structure);
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  const sourceMid = source.y + source.height / 2;
  const targetMid = target.y + target.height / 2;
  if (family === "org") return { source: "bottom", target: "top" };
  if (family === "fishbone") {
    if (targetCenter < sourceCenter - 8) return { source: "left", target: "right" };
    if (targetMid < sourceMid - 8) return { source: "top", target: "bottom" };
    if (targetMid > sourceMid + 8) return { source: "bottom", target: "top" };
    return { source: "left", target: "right" };
  }
  if (family === "timeline") {
    if (targetMid < sourceMid - 8) return { source: targetCenter >= sourceCenter ? "right" : "left", target: "bottom" };
    if (targetMid > sourceMid + 8) return { source: targetCenter >= sourceCenter ? "right" : "left", target: "top" };
    return targetCenter >= sourceCenter
      ? { source: "right", target: "left" }
      : { source: "left", target: "right" };
  }
  return targetCenter >= sourceCenter
    ? { source: "right", target: "left" }
    : { source: "left", target: "right" };
};

export const mindMapEdgeTerminal = (
  box: MindMapBox,
  role: MindMapRole,
  side: MindMapSide,
  structure?: DiagramStructure,
) => {
  const underline = mindMapUsesUnderline(role, structure);
  const dy = underline && (side === "left" || side === "right") ? box.height / 2 - 2 : 0;
  return {
    anchor: {
      name: side,
      ...(dy ? { args: { dy } } : {}),
    },
    connectionPoint: { name: underline ? "anchor" : "boundary" },
  };
};

export const mindMapSiblingSpan = (
  nodes: Array<{ id: string; parentId?: string; y: number; height: number }>,
  parentId: string,
) => {
  const children = nodes.filter((node) => node.parentId === parentId);
  if (children.length === 0) return null;
  const centers = children.map((node) => node.y + node.height / 2);
  return { top: Math.min(...centers), bottom: Math.max(...centers) };
};

export const mindMapEdgeLineAttrs = (structure: DiagramStructure | undefined, stroke: string) => (
  mindMapUsesRibbon(structure)
    ? { fill: stroke, strokeWidth: 0.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const }
    : { fill: "none", strokeWidth: 1.7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const }
);

const cubicPoint = (p0: MindMapPoint, p1: MindMapPoint, p2: MindMapPoint, p3: MindMapPoint, t: number) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

const cubicTangent = (p0: MindMapPoint, p1: MindMapPoint, p2: MindMapPoint, p3: MindMapPoint, t: number) => {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

export const mindMapConnectorPath = (
  sourcePoint: MindMapPoint,
  targetPoint: MindMapPoint,
  sourceWidth = 2.4,
  targetWidth = 1.15,
) => {
  const dx = targetPoint.x - sourcePoint.x;
  const dy = targetPoint.y - sourcePoint.y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return `M ${formatPoint(sourcePoint.x)} ${formatPoint(sourcePoint.y)} L ${formatPoint(targetPoint.x)} ${formatPoint(targetPoint.y)}`;
  }
  const controlX = (sourcePoint.x + targetPoint.x) / 2;
  const p0 = sourcePoint;
  const p1 = { x: controlX, y: sourcePoint.y };
  const p2 = { x: controlX, y: targetPoint.y };
  const p3 = targetPoint;
  const samples = 20;
  const left: MindMapPoint[] = [];
  const right: MindMapPoint[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangent(p0, p1, p2, p3, t);
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const half = ((1 - t) * sourceWidth + t * targetWidth) / 2;
    const nx = -tangent.y / length;
    const ny = tangent.x / length;
    left.push({ x: point.x + nx * half, y: point.y + ny * half });
    right.push({ x: point.x - nx * half, y: point.y - ny * half });
  }
  const start = left[0];
  const commands = [`M ${formatPoint(start.x)} ${formatPoint(start.y)}`];
  for (let index = 1; index < left.length; index += 1) {
    commands.push(`L ${formatPoint(left[index].x)} ${formatPoint(left[index].y)}`);
  }
  for (let index = right.length - 1; index >= 0; index -= 1) {
    commands.push(`L ${formatPoint(right[index].x)} ${formatPoint(right[index].y)}`);
  }
  commands.push("Z");
  return commands.join(" ");
};

const strokePoint = (point: MindMapPoint) => `${formatPoint(point.x)} ${formatPoint(point.y)}`;

const strokePolyline = (points: MindMapPoint[]) => (
  points.map((point, index) => `${index === 0 ? "M" : "L"} ${strokePoint(point)}`).join(" ")
);

const orthConnectorPath = (sourcePoint: MindMapPoint, targetPoint: MindMapPoint, axis: "x" | "y") => {
  if (Math.abs(sourcePoint.x - targetPoint.x) < 0.8 || Math.abs(sourcePoint.y - targetPoint.y) < 0.8) {
    return strokePolyline([sourcePoint, targetPoint]);
  }
  const mid = axis === "y"
    ? { x: sourcePoint.x, y: (sourcePoint.y + targetPoint.y) / 2 }
    : { x: (sourcePoint.x + targetPoint.x) / 2, y: sourcePoint.y };
  const joint = axis === "y"
    ? { x: targetPoint.x, y: mid.y }
    : { x: mid.x, y: targetPoint.y };
  return strokePolyline([sourcePoint, mid, joint, targetPoint]);
};

const hangingTreeConnectorPath = (sourcePoint: MindMapPoint, targetPoint: MindMapPoint) => {
  const busX = sourcePoint.x + Math.max(10, Math.min(28, Math.abs(targetPoint.x - sourcePoint.x) * 0.38));
  if (Math.abs(sourcePoint.y - targetPoint.y) < 0.8) return strokePolyline([sourcePoint, targetPoint]);
  return strokePolyline([
    sourcePoint,
    { x: busX, y: sourcePoint.y },
    { x: busX, y: targetPoint.y },
    targetPoint,
  ]);
};

const braceConnectorPath = (
  sourcePoint: MindMapPoint,
  targetPoint: MindMapPoint,
  braceTop?: number,
  braceBottom?: number,
) => {
  const top = Math.min(braceTop ?? sourcePoint.y, braceBottom ?? sourcePoint.y, sourcePoint.y, targetPoint.y);
  const bottom = Math.max(braceTop ?? sourcePoint.y, braceBottom ?? sourcePoint.y, sourcePoint.y, targetPoint.y);
  const span = Math.max(18, bottom - top);
  const startY = (top + bottom) / 2 - span / 2;
  const endY = startY + span;
  const midY = (startY + endY) / 2;
  const depth = 9;
  const column = sourcePoint.x + Math.max(18, Math.min(36, Math.abs(targetPoint.x - sourcePoint.x) * 0.42));
  return [
    strokePolyline([sourcePoint, { x: column - depth, y: sourcePoint.y }]),
    `M ${formatPoint(column - depth)} ${formatPoint(startY)}`,
    `C ${formatPoint(column)} ${formatPoint(startY)} ${formatPoint(column)} ${formatPoint(startY)} ${formatPoint(column)} ${formatPoint((startY + midY) / 2)}`,
    `C ${formatPoint(column)} ${formatPoint(midY)} ${formatPoint(column + depth)} ${formatPoint(midY)} ${formatPoint(column + depth)} ${formatPoint(midY)}`,
    `C ${formatPoint(column)} ${formatPoint(midY)} ${formatPoint(column)} ${formatPoint(midY)} ${formatPoint(column)} ${formatPoint((midY + endY) / 2)}`,
    `C ${formatPoint(column)} ${formatPoint(endY)} ${formatPoint(column)} ${formatPoint(endY)} ${formatPoint(column - depth)} ${formatPoint(endY)}`,
    strokePolyline([{ x: column, y: targetPoint.y }, targetPoint]),
  ].join(" ");
};

const timelineConnectorPath = (sourcePoint: MindMapPoint, targetPoint: MindMapPoint) => {
  if (Math.abs(sourcePoint.x - targetPoint.x) < 0.8 || Math.abs(sourcePoint.y - targetPoint.y) < 0.8) {
    return strokePolyline([sourcePoint, targetPoint]);
  }
  return strokePolyline([sourcePoint, { x: targetPoint.x, y: sourcePoint.y }, targetPoint]);
};

const fishboneConnectorPath = (sourcePoint: MindMapPoint, targetPoint: MindMapPoint) => {
  if (Math.abs(sourcePoint.y - targetPoint.y) < 0.8 || Math.abs(sourcePoint.x - targetPoint.x) < 0.8) {
    return strokePolyline([sourcePoint, targetPoint]);
  }
  const rise = Math.abs(targetPoint.y - sourcePoint.y);
  const towardHead = sourcePoint.x >= targetPoint.x ? 1 : -1;
  const joinX = targetPoint.x + towardHead * Math.max(18, rise / Math.sqrt(3));
  const spineJoin = {
    x: towardHead > 0 ? Math.min(sourcePoint.x, joinX) : Math.max(sourcePoint.x, joinX),
    y: sourcePoint.y,
  };
  return strokePolyline([sourcePoint, spineJoin, targetPoint]);
};

export type MindMapConnectorOptions = {
  sourceWidth?: number;
  targetWidth?: number;
  raw?: boolean;
  structure?: DiagramStructure;
  braceTop?: number;
  braceBottom?: number;
};

export const mindMapConnector = (
  sourcePoint: MindMapPoint,
  targetPoint: MindMapPoint,
  _routePoints?: MindMapPoint[],
  options: MindMapConnectorOptions = {},
) => {
  const family = mindMapLayoutFamily(options.structure);
  if (family === "org") return orthConnectorPath(sourcePoint, targetPoint, "y");
  if (family === "tree") return hangingTreeConnectorPath(sourcePoint, targetPoint);
  if (family === "brace") return braceConnectorPath(sourcePoint, targetPoint, options.braceTop, options.braceBottom);
  if (family === "timeline") return timelineConnectorPath(sourcePoint, targetPoint);
  if (family === "fishbone") return fishboneConnectorPath(sourcePoint, targetPoint);
  return mindMapConnectorPath(
    sourcePoint,
    targetPoint,
    options.sourceWidth,
    options.targetWidth,
  );
};
