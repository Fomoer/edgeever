import { visualTextUnits, compactFlowchartNodeSize, flowchartNodePresentation } from "./diagram-node-presentation";
export { compactFlowchartNodeSize, flowchartNodePresentation } from "./diagram-node-presentation";
import { graphlib, layout as runDagreLayout } from "@dagrejs/dagre";
import {
  ARCHITECTURE_DIAGRAM_SCHEMA_VERSION,
  DIAGRAM_SCHEMA_VERSION,
  type ArchitectureResourceIcon,
  type DiagramDocument,
  type DiagramEdgeKind,
  type DiagramKind,
  type DiagramNodeShape,
  type DiagramTheme,
} from "./diagram";

export type DiagramLayoutPositions = Record<string, { x: number; y: number }>;

export type DiagramLayoutNodeGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagramLayoutViewport = {
  anchor: "root" | "leftmost" | "center";
  maxScale: number;
  minScale?: number;
};

export type DiagramLayoutResult = {
  nodes: Record<string, DiagramLayoutNodeGeometry>;
  nodeOrder: string[];
  viewport: DiagramLayoutViewport;
};

export type DiagramLayoutOptions = {
  insertedNodeId?: string;
  insertAfterNodeId?: string;
  direction?: "left-to-right" | "top-to-bottom";
};

export type DiagramIrNodeType =
  | "topic"
  | "process"
  | "decision"
  | "start"
  | "end"
  | "terminator"
  | "client"
  | "frontend"
  | "service"
  | "database"
  | "storage"
  | "queue"
  | "security"
  | "external"
  | "boundary";

export type DiagramIr = {
  kind: DiagramKind;
  theme?: DiagramTheme;
  layout?: { direction?: "left-to-right" | "top-to-bottom" };
  nodes: Array<{
    id: string;
    label: string;
    type?: DiagramIrNodeType;
    parentId?: string;
    resourceIcon?: ArchitectureResourceIcon;
  }>;
  edges?: Array<{
    source: string;
    target: string;
    label?: string;
    type?: DiagramEdgeKind;
    bidirectional?: boolean;
  }>;
};

const MIND_MAP_HORIZONTAL_GAP = 72;
const MIND_MAP_VERTICAL_GAP = 16;
const MIND_MAP_TWO_SIDED_THRESHOLD = 5;
const FLOWCHART_DETACHED_GAP = 72;
const FLOWCHART_DETACHED_ROW_GAP = 24;
const FLOWCHART_DETACHED_ROW_WIDTH = 960;
const ARCHITECTURE_LAYOUT_ROW_WIDTH = 1480;
const ARCHITECTURE_GROUP_HORIZONTAL_GAP = 72;
const ARCHITECTURE_GROUP_VERTICAL_GAP = 88;

export const compactMindMapNodeSize = (label: string, isRoot: boolean) => ({
  width: Math.round(Math.min(isRoot ? 168 : 156, Math.max(isRoot ? 112 : 92, visualTextUnits(label) * 13 + 28))),
  height: isRoot ? 42 : 36,
});

export const compactArchitectureNodeSize = (
  shape: DiagramNodeShape,
  authored?: { width: number; height: number },
) => {
  if (shape === "boundary") return authored ?? { width: 560, height: 320 };
  if (shape === "database") return { width: 150, height: 72 };
  if (shape === "queue") return { width: 156, height: 60 };
  if (shape === "security") return { width: 148, height: 68 };
  return { width: 156, height: 64 };
};

const computeMindMapLayout = (
  document: DiagramDocument,
  options: DiagramLayoutOptions,
): DiagramLayoutPositions => {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, string[]>();
  for (const node of document.nodes) {
    if (!node.parentId || !nodeById.has(node.parentId)) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parentId, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort((leftId, rightId) => {
      const left = nodeById.get(leftId)!;
      const right = nodeById.get(rightId)!;
      return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id);
    });
  }

  if (options.insertedNodeId && options.insertAfterNodeId) {
    const inserted = nodeById.get(options.insertedNodeId);
    const target = nodeById.get(options.insertAfterNodeId);
    if (inserted?.parentId && inserted.parentId === target?.parentId) {
      const siblings = childrenByParent.get(inserted.parentId);
      if (siblings) {
        const withoutInserted = siblings.filter((id) => id !== inserted.id);
        const targetIndex = withoutInserted.indexOf(target.id);
        withoutInserted.splice(targetIndex < 0 ? withoutInserted.length : targetIndex + 1, 0, inserted.id);
        childrenByParent.set(inserted.parentId, withoutInserted);
      }
    }
  }

  const subtreeHeights = new Map<string, number>();
  const measureSubtree = (nodeId: string, ancestors: Set<string>): number => {
    const cached = subtreeHeights.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodeById.get(nodeId);
    if (!node || ancestors.has(nodeId)) return 0;
    const nextAncestors = new Set(ancestors).add(nodeId);
    const childHeights = (childrenByParent.get(nodeId) ?? [])
      .map((childId) => measureSubtree(childId, nextAncestors))
      .filter((height) => height > 0);
    const childrenHeight = childHeights.reduce((total, height) => total + height, 0)
      + Math.max(0, childHeights.length - 1) * MIND_MAP_VERTICAL_GAP;
    const height = Math.max(node.height, childrenHeight);
    subtreeHeights.set(nodeId, height);
    return height;
  };

  const positions: DiagramLayoutPositions = Object.fromEntries(
    document.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
  const placeChildren = (
    nodeId: string,
    subtreeTop: number,
    ancestors: Set<string>,
    direction: 1 | -1,
  ) => {
    const node = nodeById.get(nodeId);
    if (!node || ancestors.has(nodeId)) return;
    const nextAncestors = new Set(ancestors).add(nodeId);
    const childIds = (childrenByParent.get(nodeId) ?? []).filter((childId) => !nextAncestors.has(childId));
    const childHeights = childIds.map((childId) => measureSubtree(childId, nextAncestors));
    const childrenHeight = childHeights.reduce((total, height) => total + height, 0)
      + Math.max(0, childHeights.length - 1) * MIND_MAP_VERTICAL_GAP;
    let cursor = subtreeTop + (measureSubtree(nodeId, ancestors) - childrenHeight) / 2;
    for (let index = 0; index < childIds.length; index += 1) {
      const childId = childIds[index];
      const child = nodeById.get(childId)!;
      const childSubtreeHeight = childHeights[index];
      positions[childId] = {
        x: direction === 1
          ? positions[nodeId].x + node.width + MIND_MAP_HORIZONTAL_GAP
          : positions[nodeId].x - MIND_MAP_HORIZONTAL_GAP - child.width,
        y: Math.round(cursor + (childSubtreeHeight - child.height) / 2),
      };
      placeChildren(childId, cursor, nextAncestors, direction);
      cursor += childSubtreeHeight + MIND_MAP_VERTICAL_GAP;
    }
  };

  const placeRootSide = (rootId: string, childIds: string[], direction: 1 | -1) => {
    const root = nodeById.get(rootId);
    if (!root || childIds.length === 0) return;
    const childHeights = childIds.map((childId) => measureSubtree(childId, new Set([rootId])));
    const sideHeight = childHeights.reduce((total, height) => total + height, 0)
      + Math.max(0, childHeights.length - 1) * MIND_MAP_VERTICAL_GAP;
    let cursor = root.y + root.height / 2 - sideHeight / 2;
    for (let index = 0; index < childIds.length; index += 1) {
      const child = nodeById.get(childIds[index])!;
      const childSubtreeHeight = childHeights[index];
      positions[child.id] = {
        x: direction === 1
          ? root.x + root.width + MIND_MAP_HORIZONTAL_GAP
          : root.x - MIND_MAP_HORIZONTAL_GAP - child.width,
        y: Math.round(cursor + (childSubtreeHeight - child.height) / 2),
      };
      placeChildren(child.id, cursor, new Set([rootId]), direction);
      cursor += childSubtreeHeight + MIND_MAP_VERTICAL_GAP;
    }
  };

  const roots = document.nodes
    .filter((node) => !node.parentId || !nodeById.has(node.parentId))
    .sort((left, right) => left.y - right.y || left.id.localeCompare(right.id));
  for (const root of roots) {
    const childIds = (childrenByParent.get(root.id) ?? []).filter((childId) => childId !== root.id);
    if (childIds.length < MIND_MAP_TWO_SIDED_THRESHOLD) {
      placeRootSide(root.id, childIds, 1);
      continue;
    }
    const sides: Record<"left" | "right", { ids: string[]; height: number }> = {
      left: { ids: [], height: 0 },
      right: { ids: [], height: 0 },
    };
    for (const childId of childIds) {
      const side = sides.right.height <= sides.left.height ? sides.right : sides.left;
      side.ids.push(childId);
      side.height += measureSubtree(childId, new Set([root.id])) + MIND_MAP_VERTICAL_GAP;
    }
    placeRootSide(root.id, sides.left.ids, -1);
    placeRootSide(root.id, sides.right.ids, 1);
  }
  return positions;
};

const wrapArchitectureGroups = (
  document: DiagramDocument,
  positions: DiagramLayoutPositions,
) => {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const topLevelBoundaryId = (nodeId: string) => {
    let current = nodeById.get(nodeId);
    let boundaryId: string | undefined;
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = nodeById.get(current.parentId);
      if (!parent) break;
      if (parent.shape === "boundary") boundaryId = parent.id;
      current = parent;
    }
    return boundaryId;
  };

  const topLevelBoundaries = document.nodes.filter((node) => (
    node.shape === "boundary" && (!node.parentId || nodeById.get(node.parentId)?.shape !== "boundary")
  ));
  if (topLevelBoundaries.length < 2) return positions;

  const groups = topLevelBoundaries.flatMap((boundary) => {
    const members = document.nodes.filter((node) => (
      node.shape !== "boundary" && topLevelBoundaryId(node.id) === boundary.id && positions[node.id]
    ));
    if (members.length === 0) return [];
    const left = Math.min(...members.map((node) => positions[node.id].x));
    const top = Math.min(...members.map((node) => positions[node.id].y));
    const right = Math.max(...members.map((node) => positions[node.id].x + node.width));
    const bottom = Math.max(...members.map((node) => positions[node.id].y + node.height));
    return [{
      boundary,
      members: document.nodes.filter((node) => node.id === boundary.id || topLevelBoundaryId(node.id) === boundary.id),
      left,
      top,
      width: Math.max(260, right - left + 72),
      height: Math.max(180, bottom - top + 92),
    }];
  }).sort((left, right) => left.left - right.left || left.top - right.top || left.boundary.id.localeCompare(right.boundary.id));
  if (groups.length < 2) return positions;

  const contentLeft = Math.min(...groups.map((group) => group.left - 36));
  const contentRight = Math.max(...groups.map((group) => group.left - 36 + group.width));
  if (contentRight - contentLeft <= ARCHITECTURE_LAYOUT_ROW_WIDTH) return positions;

  let cursorX = 32;
  let cursorY = 32;
  let rowHeight = 0;
  for (const group of groups) {
    if (cursorX > 32 && cursorX + group.width > 32 + ARCHITECTURE_LAYOUT_ROW_WIDTH) {
      cursorX = 32;
      cursorY += rowHeight + ARCHITECTURE_GROUP_VERTICAL_GAP;
      rowHeight = 0;
    }
    const deltaX = cursorX + 36 - group.left;
    const deltaY = cursorY + 56 - group.top;
    for (const node of group.members) {
      const position = positions[node.id] ?? { x: node.x, y: node.y };
      positions[node.id] = { x: position.x + deltaX, y: position.y + deltaY };
    }
    cursorX += group.width + ARCHITECTURE_GROUP_HORIZONTAL_GAP;
    rowHeight = Math.max(rowHeight, group.height);
  }
  return positions;
};

const computeDagreLayout = (
  document: DiagramDocument,
  options: DiagramLayoutOptions,
  excludeBoundaries: boolean,
  spacing: { rank: number; node: number } = { rank: 96, node: 40 },
): DiagramLayoutPositions => {
  const layoutGraph = new graphlib.Graph();
  layoutGraph.setGraph({
    rankdir: options.direction === "top-to-bottom" ? "TB" : "LR",
    ranksep: spacing.rank,
    nodesep: spacing.node,
    marginx: 32,
    marginy: 32,
  });
  layoutGraph.setDefaultEdgeLabel(() => ({}));

  const layoutNodes = excludeBoundaries
    ? document.nodes.filter((node) => node.shape !== "boundary")
    : document.nodes;
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  for (const node of layoutNodes) layoutGraph.setNode(node.id, { width: node.width, height: node.height });
  for (const edge of document.edges) {
    if (layoutNodeIds.has(edge.source) && layoutNodeIds.has(edge.target)) layoutGraph.setEdge(edge.source, edge.target);
  }

  runDagreLayout(layoutGraph);
  const positions = Object.fromEntries(document.nodes.flatMap((node) => {
    if (node.shape === "boundary") return [[node.id, { x: node.x, y: node.y }]];
    const position = layoutGraph.node(node.id) as { x: number; y: number } | undefined;
    if (!position) return [];
    return [[node.id, {
      x: Math.round(position.x - node.width / 2),
      y: Math.round(position.y - node.height / 2),
    }]];
  }));
  return positions;
};

const placeDetachedFlowchartNodes = (
  document: DiagramDocument,
  positions: DiagramLayoutPositions,
) => {
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  const connectedIds = new Set<string>();
  for (const edge of document.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }
  const connected = document.nodes.filter((node) => connectedIds.has(node.id));
  const detached = document.nodes
    .filter((node) => !connectedIds.has(node.id))
    .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
  if (connected.length === 0 || detached.length === 0) return positions;

  const contentLeft = Math.min(...connected.map((node) => positions[node.id].x));
  const contentBottom = Math.max(...connected.map((node) => positions[node.id].y + node.height));
  let cursorX = contentLeft;
  let cursorY = contentBottom + FLOWCHART_DETACHED_GAP;
  let rowHeight = 0;
  for (const node of detached) {
    if (cursorX > contentLeft && cursorX + node.width > contentLeft + FLOWCHART_DETACHED_ROW_WIDTH) {
      cursorX = contentLeft;
      cursorY += rowHeight + FLOWCHART_DETACHED_ROW_GAP;
      rowHeight = 0;
    }
    positions[node.id] = { x: cursorX, y: cursorY };
    cursorX += node.width + 40;
    rowHeight = Math.max(rowHeight, node.height);
  }
  return positions;
};

const computeFlowchartLayout = (document: DiagramDocument, options: DiagramLayoutOptions) => (
  placeDetachedFlowchartNodes(
    document,
    computeDagreLayout(
      document,
      { ...options, direction: options.direction ?? "top-to-bottom" },
      false,
      { rank: 80, node: 48 },
    ),
  )
);

const computeArchitectureLayout = (document: DiagramDocument, options: DiagramLayoutOptions) => (
  wrapArchitectureGroups(
    document,
    computeDagreLayout(document, { ...options, direction: options.direction ?? "left-to-right" }, true),
  )
);

const irNodeShape = (kind: DiagramKind, type: DiagramIrNodeType | undefined): DiagramNodeShape => {
  if (kind === "mind-map") return "topic";
  if (kind === "flowchart") return type === "decision" ? "decision" : type === "start" || type === "end" || type === "terminator" ? "terminator" : "process";
  return (type ?? "service") as DiagramNodeShape;
};

const finalizeArchitectureLayout = (document: DiagramDocument) => {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const boundaryDepth = (nodeId: string) => {
    let depth = 0;
    let current = nodeById.get(nodeId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      depth += 1;
      current = nodeById.get(current.parentId);
    }
    return depth;
  };
  const boundaries = document.nodes
    .filter((node) => node.shape === "boundary")
    .sort((left, right) => boundaryDepth(right.id) - boundaryDepth(left.id));
  for (const boundary of boundaries) {
    const children = document.nodes.filter((node) => node.parentId === boundary.id);
    if (children.length === 0) continue;
    const left = Math.min(...children.map((node) => node.x)) - 36;
    const top = Math.min(...children.map((node) => node.y)) - 56;
    const right = Math.max(...children.map((node) => node.x + node.width)) + 36;
    const bottom = Math.max(...children.map((node) => node.y + node.height)) + 36;
    boundary.x = left;
    boundary.y = top;
    boundary.width = Math.max(260, right - left);
    boundary.height = Math.max(180, bottom - top);
  }

  const topLevelBoundaries = boundaries
    .filter((boundary) => !boundary.parentId)
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const placed: typeof topLevelBoundaries = [];
  const shiftGroup = (boundaryId: string, deltaY: number) => {
    for (const node of document.nodes) {
      let current = node;
      const visited = new Set<string>();
      while (current.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        if (current.parentId === boundaryId) {
          node.y += deltaY;
          break;
        }
        const parent = nodeById.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
    }
    nodeById.get(boundaryId)!.y += deltaY;
  };
  for (const boundary of topLevelBoundaries) {
    const overlappingBottom = placed
      .filter((other) => boundary.x < other.x + other.width + 40 && boundary.x + boundary.width + 40 > other.x)
      .reduce((bottom, other) => Math.max(bottom, other.y + other.height), Number.NEGATIVE_INFINITY);
    if (Number.isFinite(overlappingBottom) && boundary.y < overlappingBottom + 40) {
      shiftGroup(boundary.id, overlappingBottom + 40 - boundary.y);
    }
    placed.push(boundary);
  }
};

export type DiagramLayoutStrategy = {
  kind: DiagramKind;
  layout: (document: DiagramDocument, options: DiagramLayoutOptions) => DiagramLayoutPositions;
  finalize?: (document: DiagramDocument) => void;
  viewport: DiagramLayoutViewport;
};

const DIAGRAM_LAYOUT_STRATEGIES: Record<DiagramKind, DiagramLayoutStrategy> = {
  "mind-map": {
    kind: "mind-map",
    layout: computeMindMapLayout,
    viewport: { anchor: "root", maxScale: 1 },
  },
  flowchart: {
    kind: "flowchart",
    layout: computeFlowchartLayout,
    viewport: { anchor: "center", maxScale: 0.9 },
  },
  architecture: {
    kind: "architecture",
    layout: computeArchitectureLayout,
    finalize: finalizeArchitectureLayout,
    viewport: { anchor: "leftmost", maxScale: 0.84, minScale: 0.64 },
  },
};

export const getDiagramLayoutViewport = (kind: DiagramKind): DiagramLayoutViewport => ({
  ...DIAGRAM_LAYOUT_STRATEGIES[kind].viewport,
});

export const computeDiagramLayoutResult = (
  document: DiagramDocument,
  options: DiagramLayoutOptions = {},
): DiagramLayoutResult => {
  const strategy = DIAGRAM_LAYOUT_STRATEGIES[document.kind];
  const layoutDocument: DiagramDocument = {
    ...document,
    nodes: document.nodes.map((node) => ({ ...node })),
    edges: document.edges.map((edge) => ({ ...edge })),
  };
  const positions = strategy.layout(layoutDocument, options);
  for (const node of layoutDocument.nodes) {
    const position = positions[node.id];
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      node.x = position.x;
      node.y = position.y;
    }
  }
  strategy.finalize?.(layoutDocument);
  const nodeById = new Map(layoutDocument.nodes.map((node) => [node.id, node]));
  const nodeDepth = (nodeId: string) => {
    let depth = 0;
    let current = nodeById.get(nodeId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      const parent = nodeById.get(current.parentId);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  };
  return {
    nodes: Object.fromEntries(layoutDocument.nodes.map((node) => [node.id, {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    }])),
    nodeOrder: layoutDocument.nodes
      .map((node) => node.id)
      .sort((left, right) => nodeDepth(left) - nodeDepth(right)),
    viewport: getDiagramLayoutViewport(document.kind),
  };
};

export const computeDiagramLayout = (
  document: DiagramDocument,
  options: DiagramLayoutOptions = {},
): DiagramLayoutPositions => DIAGRAM_LAYOUT_STRATEGIES[document.kind].layout(document, options);

export const compileDiagramIr = (ir: DiagramIr): DiagramDocument => {
  const nodes = ir.nodes.map((node, index) => {
    const shape = irNodeShape(ir.kind, node.type);
    const size = ir.kind === "mind-map"
      ? compactMindMapNodeSize(node.label, !node.parentId)
      : ir.kind === "architecture"
        ? compactArchitectureNodeSize(shape)
        : flowchartNodePresentation(shape, node.label);
    return {
      id: node.id,
      label: node.label,
      x: 72,
      y: 64 + index * 80,
      width: size.width,
      height: size.height,
      shape,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(node.resourceIcon ? { resourceIcon: node.resourceIcon } : {}),
    };
  });
  const edges = (ir.edges ?? []).map((edge, index) => ({
    id: `edge-${index + 1}`,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.type ? { kind: edge.type } : {}),
    ...(edge.bidirectional !== undefined ? { bidirectional: edge.bidirectional } : {}),
  }));
  if (ir.kind === "mind-map") {
    const pairs = new Set(edges.map((edge) => `${edge.source}\0${edge.target}`));
    for (const node of nodes) {
      if (!node.parentId || pairs.has(`${node.parentId}\0${node.id}`)) continue;
      edges.push({ id: `edge-${edges.length + 1}`, source: node.parentId, target: node.id });
    }
  }
  const document: DiagramDocument = {
    schemaVersion: ir.kind === "architecture" ? ARCHITECTURE_DIAGRAM_SCHEMA_VERSION : DIAGRAM_SCHEMA_VERSION,
    kind: ir.kind,
    ...(ir.theme ? { theme: ir.theme } : {}),
    nodes,
    edges,
  };
  const layout = computeDiagramLayoutResult(document, {
    direction: ir.layout?.direction ?? (ir.kind === "flowchart" ? "top-to-bottom" : "left-to-right"),
  });
  for (const node of document.nodes) {
    const geometry = layout.nodes[node.id];
    if (geometry) Object.assign(node, geometry);
  }
  return document;
};
