import {
  AiPromptTemplateCreateSchema,
  AiPromptTemplateUpdateSchema,
  ARCHITECTURE_RESOURCE_ICONS,
  TemplateCreateSchema,
  TemplateUpdateSchema,
  docToText,
  markdownToDoc,
  parseDiagramDocument,
  serializeDiagramDocument,
  stripDiagramDocumentMarker,
  type DiagramDocument,
  type DiagramNodeShape,
  type MemoDetail,
  type MemoSummary,
  type MemoUpdateInput,
} from "@edgeever/shared";
import type { DiagramIr, DiagramIrNodeType } from "@edgeever/shared/diagram-layout";
import { audit, auditStatement } from "./audit";
import type { AppContext, AuditActor, AuthContext, Bindings } from "./api-context";
import { AppError } from "./app-error";
import { isDemoModeEnabled } from "./demo-mode";
import { createId, isoNow } from "./entity-utils";
import {
  decodeBase64Data,
  escapeMarkdownImageAlt,
  escapeMarkdownLinkLabel,
  getOptionalString,
  getOptionalStringArray,
  getRequiredString,
  getRequiredStringArray,
} from "./mcp-json-rpc";
import {
    getMemoRevisionRow as getMemoRevisionRowService,
    listMemoRevisions as listMemoRevisionsService,
    mapMemoRevision as mapMemoRevisionService,
    restoreMemoRevision as restoreMemoRevisionService,
  type MemoRevisionSourceRow,
} from "./memo-revision-service";
import {
  createNotebookRecord,
  findNotebooks,
  getNotebook,
  listNotebooks,
  resolveNotebookPath,
  updateNotebookRecord,
} from "./notebook-service";
import {
    createAttachmentResource,
    createImageResource,
    inferImageExtension,
    listResourcesForMcp,
    listResourcesForMemo,
    normalizeFilename,
  } from "./resource-service";
import { assertScope, getActorLabel, getAuditActor } from "./request-auth";
import { restoreMissingDefaultAiPrompts } from "./ai-prompt-seed";
import {
  getAiPromptTemplateRow,
  listAiPromptTemplates,
  mapAiPromptTemplateRow,
} from "./ai-prompt-service";
import { getMemoTemplate, listMemoTemplates } from "./template-routes";
import {
  listTagSummaries,
  previewTagRename,
  updateTagAcrossMemos,
  updateTagsForMemos,
} from "./tag-service";
  import type { DatabaseAdapter } from "./storage-contract";
  import { getWorkspaceStats } from "./workspace-stats-service";

type MemoUpdateResult =
  | { memo: MemoDetail; error?: never; message?: never; status?: never; details?: never }
  | { error: string; message: string; status?: number; details?: Record<string, unknown> };

export type McpToolDependencies = {
  clampNumber: (value: number, min: number, max: number) => number;
  createMemoRecord: (
    database: DatabaseAdapter,
    workspaceId: string,
    input: { notebookId: string; title?: string; contentMarkdown?: string; tags?: string[]; createdAt?: string; updatedAt?: string },
    actor: AuditActor,
    actorLabel: string,
  ) => Promise<MemoDetail>;
  deleteMemosRecord: (
    environment: Bindings,
    workspaceId: string,
    memoIds: string[],
    permanent: boolean,
    actor: AuditActor,
  ) => Promise<number>;
  getCurrentWorkspaceIdentity: (database: DatabaseAdapter, auth: AuthContext) => Promise<unknown>;
  getMemoDetail: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoId: string,
    includeDeleted?: boolean,
  ) => Promise<MemoDetail | null>;
  getMemoDetailRow: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoId: string,
  ) => Promise<MemoRevisionSourceRow | null>;
  getMemosForBulkAction: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoIds: string[],
    deletedState: 0 | 1,
  ) => Promise<unknown[]>;
  importMemosRecord: (
    database: DatabaseAdapter,
    workspaceId: string,
    input: {
      source: string;
      notebookId: string;
      items: unknown;
      dryRun: boolean;
      actor: AuditActor;
      actorLabel: string;
    },
  ) => Promise<unknown>;
  listMemosForMcp: (
    database: DatabaseAdapter,
    options: {
      workspaceId: string;
      notebookId?: string | null;
      limit: number;
      offset: number;
      includeContent: boolean;
      includeDeleted: boolean;
    },
  ) => Promise<unknown>;
  mergeMemosRecord: (
    database: DatabaseAdapter,
    workspaceId: string,
    input: { memoIds: string[]; notebookId?: string; title?: string },
    actor: AuditActor,
    actorLabel: string,
  ) => Promise<MemoDetail>;
  moveMemosToNotebook: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoIds: string[],
    notebookId: string,
    actor: AuditActor,
    actorLabel: string,
  ) => Promise<number>;
  restoreMemosRecord: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoIds: string[],
    actor: AuditActor,
  ) => Promise<number>;
  searchMemoSummaries: (
    database: DatabaseAdapter,
    options: {
      workspaceId: string;
      query?: string | null;
      notebookId?: string | null;
      tags?: string[];
      createdAfter?: string | null;
      createdBefore?: string | null;
      updatedAfter?: string | null;
      updatedBefore?: string | null;
      isPinned?: boolean | null;
      hasResources?: boolean | null;
      limit: number;
    },
  ) => Promise<MemoSummary[]>;
  updateMemoRecord: (
    database: DatabaseAdapter,
    workspaceId: string,
    memoId: string,
    input: MemoUpdateInput,
    actor: AuditActor,
    actorLabel: string,
    requireEditSession?: boolean,
  ) => Promise<MemoUpdateResult>;
};

type McpInputSchema<T> = {
  safeParse: (input: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
};

const parseMcpInput = <T>(schema: McpInputSchema<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
    .join("; ");
  throw new AppError("invalid_params", message, 400);
};

const assertMcpMutationAllowed = (environment: Bindings) => {
  if (isDemoModeEnabled(environment.EDGE_EVER_DEMO_MODE)) {
    throw new AppError("forbidden", "Templates and AI instructions cannot be changed in demo mode.", 403);
  }
};

const DIAGRAM_IR_NODE_TYPES = new Set<DiagramIrNodeType>([
  "topic", "process", "decision", "start", "end", "terminator", "client", "frontend", "service", "database", "storage",
  "queue", "security", "external", "boundary",
]);
const DIAGRAM_EDGE_KINDS = new Set(["dependency", "request", "async", "data"]);
const DIAGRAM_MEMO_KEYS = new Set(["notebookId", "title", "kind", "theme", "layout", "tags", "nodes", "edges"]);
const DIAGRAM_NODE_KEYS = new Set(["id", "label", "type", "parentId", "resourceIcon"]);
const DIAGRAM_EDGE_KEYS = new Set(["source", "target", "label", "type", "bidirectional"]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertAllowedKeys = (value: Record<string, unknown>, allowed: Set<string>, path: string) => {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new AppError("invalid_params", `${path}.${unexpected} is not supported`, 400);
};

const parseDiagramNode = (value: unknown, index: number) => {
  const path = `nodes.${index}`;
  if (!isPlainRecord(value)) throw new AppError("invalid_params", `${path} must be an object`, 400);
  assertAllowedKeys(value, DIAGRAM_NODE_KEYS, path);
  const id = getRequiredString(value.id, `${path}.id`);
  if (id.length > 100) throw new AppError("invalid_params", `${path}.id must be at most 100 characters`, 400);
  if (typeof value.label !== "string" || value.label.length > 500) {
    throw new AppError("invalid_params", `${path}.label must be a string with at most 500 characters`, 400);
  }
  if (value.type !== undefined && (
    typeof value.type !== "string" || !DIAGRAM_IR_NODE_TYPES.has(value.type as DiagramIrNodeType)
  )) {
    throw new AppError("invalid_params", `${path}.type is not supported`, 400);
  }
  if (value.parentId !== undefined && (typeof value.parentId !== "string" || !value.parentId.trim() || value.parentId.length > 100)) {
    throw new AppError("invalid_params", `${path}.parentId must be a non-empty string with at most 100 characters`, 400);
  }
  if (value.resourceIcon !== undefined && (
    typeof value.resourceIcon !== "string"
    || !ARCHITECTURE_RESOURCE_ICONS.includes(value.resourceIcon as typeof ARCHITECTURE_RESOURCE_ICONS[number])
  )) {
    throw new AppError("invalid_params", `${path}.resourceIcon is not supported`, 400);
  }
  return { ...value, id } as DiagramIr["nodes"][number];
};

const parseDiagramEdge = (value: unknown, index: number) => {
  const path = `edges.${index}`;
  if (!isPlainRecord(value)) throw new AppError("invalid_params", `${path} must be an object`, 400);
  assertAllowedKeys(value, DIAGRAM_EDGE_KEYS, path);
  const source = getRequiredString(value.source, `${path}.source`);
  const target = getRequiredString(value.target, `${path}.target`);
  if ([source, target].some((item) => item.length > 100)) {
    throw new AppError("invalid_params", `${path} node IDs must be at most 100 characters`, 400);
  }
  if (value.label !== undefined && (typeof value.label !== "string" || value.label.length > 500)) {
    throw new AppError("invalid_params", `${path}.label must be a string with at most 500 characters`, 400);
  }
  if (value.type !== undefined && (typeof value.type !== "string" || !DIAGRAM_EDGE_KINDS.has(value.type))) {
    throw new AppError("invalid_params", `${path}.type is not supported`, 400);
  }
  if (value.bidirectional !== undefined && typeof value.bidirectional !== "boolean") {
    throw new AppError("invalid_params", `${path}.bidirectional must be a boolean`, 400);
  }
  return { ...value, source, target } as NonNullable<DiagramIr["edges"]>[number];
};

const parseDiagramMemoIr = (args: Record<string, unknown>): DiagramIr => {
  assertAllowedKeys(args, DIAGRAM_MEMO_KEYS, "arguments");
  const kind = getRequiredString(args.kind, "kind");
  if (!(["mind-map", "flowchart", "architecture"] as const).includes(kind as DiagramIr["kind"])) {
    throw new AppError("invalid_params", "kind must be mind-map, flowchart, or architecture", 400);
  }
  if (!Array.isArray(args.nodes) || args.nodes.length < 1 || args.nodes.length > 200) {
    throw new AppError("invalid_params", "nodes must include between 1 and 200 items", 400);
  }
  if (args.edges !== undefined && (!Array.isArray(args.edges) || args.edges.length > 400)) {
    throw new AppError("invalid_params", "edges must be an array with at most 400 items", 400);
  }
  if (args.theme !== undefined && !["brand", "ocean", "ink"].includes(String(args.theme))) {
    throw new AppError("invalid_params", "theme must be brand, ocean, or ink", 400);
  }
  if (args.title !== undefined && (typeof args.title !== "string" || args.title.length > 160)) {
    throw new AppError("invalid_params", "title must be a string with at most 160 characters", 400);
  }
  if (args.tags !== undefined && (
    !Array.isArray(args.tags) || args.tags.length > 100 || args.tags.some((tag) => typeof tag !== "string")
  )) {
    throw new AppError("invalid_params", "tags must be an array of at most 100 strings", 400);
  }
  if (args.layout !== undefined && (
    !isPlainRecord(args.layout)
    || Object.keys(args.layout).some((key) => key !== "direction")
    || (args.layout.direction !== undefined && !["left-to-right", "top-to-bottom"].includes(String(args.layout.direction)))
  )) {
    throw new AppError("invalid_params", "layout may only specify direction as left-to-right or top-to-bottom", 400);
  }

  const ir: DiagramIr = {
    kind: kind as DiagramIr["kind"],
    ...(args.theme === undefined ? {} : { theme: args.theme as DiagramIr["theme"] }),
    ...(args.layout === undefined ? {} : { layout: args.layout as DiagramIr["layout"] }),
    nodes: args.nodes.map(parseDiagramNode),
    edges: (args.edges as unknown[] | undefined)?.map(parseDiagramEdge),
  };
  const nodeIds = new Set(ir.nodes.map((node) => node.id));
  if (nodeIds.size !== ir.nodes.length) throw new AppError("invalid_params", "node IDs must be unique", 400);
  for (const node of ir.nodes) {
    const allowedTypes = ir.kind === "mind-map"
      ? new Set([undefined, "topic"])
      : ir.kind === "flowchart"
        ? new Set([undefined, "process", "decision", "start", "end", "terminator"])
        : new Set([undefined, "client", "frontend", "service", "database", "storage", "queue", "security", "external", "boundary"]);
    if (!allowedTypes.has(node.type)) {
      throw new AppError("invalid_params", `${node.type} is not a valid node type for ${ir.kind}`, 400);
    }
    if (ir.kind === "flowchart" && node.parentId) {
      throw new AppError("invalid_params", "flowchart nodes cannot use parentId", 400);
    }
    if (ir.kind !== "architecture" && node.resourceIcon) {
      throw new AppError("invalid_params", "resourceIcon is only available for architecture nodes", 400);
    }
    if (node.parentId && !nodeIds.has(node.parentId)) {
      throw new AppError("invalid_params", `${node.id}.parentId must reference an existing node`, 400);
    }
    if (ir.kind === "architecture" && node.parentId && ir.nodes.find((candidate) => candidate.id === node.parentId)?.type !== "boundary") {
      throw new AppError("invalid_params", `${node.id}.parentId must reference an architecture boundary`, 400);
    }
  }
  for (const edge of ir.edges ?? []) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new AppError("invalid_params", "every edge endpoint must reference an existing node", 400);
    }
    if (ir.kind === "architecture" && ir.nodes.some((node) => (node.id === edge.source || node.id === edge.target) && node.type === "boundary")) {
      throw new AppError("invalid_params", "architecture boundaries cannot be edge endpoints", 400);
    }
  }
  const parentByNodeId = new Map(ir.nodes.flatMap((node) => node.parentId ? [[node.id, node.parentId]] : []));
  for (const node of ir.nodes) {
    const ancestors = new Set<string>();
    let currentId: string | undefined = node.id;
    while (currentId) {
      if (ancestors.has(currentId)) {
        throw new AppError("invalid_params", "diagram parent relationships must not contain cycles", 400);
      }
      ancestors.add(currentId);
      currentId = parentByNodeId.get(currentId);
    }
  }
  return ir;
};

const diagramNodeType = (shape: DiagramNodeShape): DiagramIrNodeType => shape;

const diagramSemanticGraph = (document: DiagramDocument, includeLayout = false) => ({
  kind: document.kind,
  ...(document.theme ? { theme: document.theme } : {}),
  nodes: document.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: diagramNodeType(node.shape),
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(node.resourceIcon ? { resourceIcon: node.resourceIcon } : {}),
    ...(includeLayout ? { layout: { x: node.x, y: node.y, width: node.width, height: node.height } } : {}),
  })),
  edges: document.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.kind ? { type: edge.kind } : {}),
    ...(edge.bidirectional !== undefined ? { bidirectional: edge.bidirectional } : {}),
  })),
});

const memoWithoutDiagramPayload = (memo: MemoDetail) => {
  const contentMarkdown = stripDiagramDocumentMarker(memo.contentMarkdown);
  const contentJson = markdownToDoc(contentMarkdown);
  return { ...memo, contentMarkdown, contentJson, contentText: docToText(contentJson) };
};

type MutableDiagramEdge = ReturnType<typeof diagramSemanticGraph>["edges"][number];

const applyDiagramOperations = async (
  args: Record<string, unknown>,
  current: DiagramDocument,
) => {
  assertAllowedKeys(args, new Set(["memoId", "expectedRevision", "operations", "dryRun", "reflow"]), "arguments");
  if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 100) {
    throw new AppError("invalid_params", "operations must include between 1 and 100 items", 400);
  }
  if (args.reflow !== undefined && args.reflow !== "preserve" && args.reflow !== "all") {
    throw new AppError("invalid_params", "reflow must be preserve or all", 400);
  }

  let nodes: DiagramIr["nodes"] = current.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: diagramNodeType(node.shape),
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(node.resourceIcon ? { resourceIcon: node.resourceIcon } : {}),
  }));
  let edges: MutableDiagramEdge[] = diagramSemanticGraph(current).edges;
  const resizedNodeIds = new Set<string>();
  const repositionedNodeIds = new Set<string>();
  const affectedBoundaryIds = new Set<string>();
  const counts = { addedNodes: 0, updatedNodes: 0, removedNodes: 0, addedEdges: 0, updatedEdges: 0, removedEdges: 0 };

  const requireOperation = (value: unknown, index: number) => {
    if (!isPlainRecord(value) || typeof value.op !== "string") {
      throw new AppError("invalid_params", `operations.${index} must be an object with an op`, 400);
    }
    return value;
  };
  const findNodeIndex = (nodeId: string) => {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) throw new AppError("invalid_params", `diagram node ${nodeId} does not exist`, 400);
    return index;
  };
  const findEdgeIndex = (edgeId: string) => {
    const index = edges.findIndex((edge) => edge.id === edgeId);
    if (index < 0) throw new AppError("invalid_params", `diagram edge ${edgeId} does not exist`, 400);
    return index;
  };

  for (let operationIndex = 0; operationIndex < args.operations.length; operationIndex += 1) {
    const operation = requireOperation(args.operations[operationIndex], operationIndex);
    const path = `operations.${operationIndex}`;
    if (operation.op === "add_node") {
      assertAllowedKeys(operation, new Set(["op", "node"]), path);
      const node = parseDiagramNode(operation.node, operationIndex);
      if (nodes.some((candidate) => candidate.id === node.id)) {
        throw new AppError("invalid_params", `diagram node ${node.id} already exists`, 400);
      }
      nodes.push(node);
      if (node.parentId) affectedBoundaryIds.add(node.parentId);
      counts.addedNodes += 1;
      continue;
    }
    if (operation.op === "update_node") {
      assertAllowedKeys(operation, new Set(["op", "nodeId", "changes"]), path);
      const nodeId = getRequiredString(operation.nodeId, `${path}.nodeId`);
      if (!isPlainRecord(operation.changes) || Object.keys(operation.changes).length === 0) {
        throw new AppError("invalid_params", `${path}.changes must be a non-empty object`, 400);
      }
      assertAllowedKeys(operation.changes, new Set(["label", "type", "parentId", "resourceIcon"]), `${path}.changes`);
      const index = findNodeIndex(nodeId);
      const previous = nodes[index];
      const candidate: Record<string, unknown> = { ...previous, ...operation.changes, id: nodeId };
      if (operation.changes.parentId === null) delete candidate.parentId;
      if (operation.changes.resourceIcon === null) delete candidate.resourceIcon;
      const next = parseDiagramNode(candidate, operationIndex);
      nodes[index] = next;
      if (operation.changes.label !== undefined || operation.changes.type !== undefined) resizedNodeIds.add(nodeId);
      if (operation.changes.parentId !== undefined && previous.parentId !== next.parentId) {
        repositionedNodeIds.add(nodeId);
        if (previous.parentId) affectedBoundaryIds.add(previous.parentId);
        if (next.parentId) affectedBoundaryIds.add(next.parentId);
      }
      counts.updatedNodes += 1;
      continue;
    }
    if (operation.op === "remove_node") {
      assertAllowedKeys(operation, new Set(["op", "nodeId", "cascade"]), path);
      const nodeId = getRequiredString(operation.nodeId, `${path}.nodeId`);
      findNodeIndex(nodeId);
      const removalIds = new Set([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of nodes) {
          if (node.parentId && removalIds.has(node.parentId) && !removalIds.has(node.id)) {
            if (operation.cascade !== true) {
              throw new AppError("invalid_params", `${nodeId} contains child nodes; set cascade to true to remove them`, 400);
            }
            removalIds.add(node.id);
            changed = true;
          }
        }
      }
      for (const node of nodes) if (removalIds.has(node.id) && node.parentId) affectedBoundaryIds.add(node.parentId);
      const priorEdgeCount = edges.length;
      nodes = nodes.filter((node) => !removalIds.has(node.id));
      edges = edges.filter((edge) => !removalIds.has(edge.source) && !removalIds.has(edge.target));
      counts.removedNodes += removalIds.size;
      counts.removedEdges += priorEdgeCount - edges.length;
      continue;
    }
    if (operation.op === "add_edge") {
      assertAllowedKeys(operation, new Set(["op", "edge"]), path);
      if (!isPlainRecord(operation.edge)) throw new AppError("invalid_params", `${path}.edge must be an object`, 400);
      assertAllowedKeys(operation.edge, new Set([...DIAGRAM_EDGE_KEYS, "id"]), `${path}.edge`);
      const { id: requestedId, ...edgeInput } = operation.edge;
      const parsed = parseDiagramEdge(edgeInput, operationIndex);
      const id = requestedId === undefined ? createId("edge") : getRequiredString(requestedId, `${path}.edge.id`);
      if (id.length > 100 || edges.some((edge) => edge.id === id)) {
        throw new AppError("invalid_params", `diagram edge ID ${id} is invalid or already exists`, 400);
      }
      edges.push({ id, ...parsed });
      counts.addedEdges += 1;
      continue;
    }
    if (operation.op === "update_edge") {
      assertAllowedKeys(operation, new Set(["op", "edgeId", "changes"]), path);
      const edgeId = getRequiredString(operation.edgeId, `${path}.edgeId`);
      if (!isPlainRecord(operation.changes) || Object.keys(operation.changes).length === 0) {
        throw new AppError("invalid_params", `${path}.changes must be a non-empty object`, 400);
      }
      assertAllowedKeys(operation.changes, DIAGRAM_EDGE_KEYS, `${path}.changes`);
      const index = findEdgeIndex(edgeId);
      const candidate: Record<string, unknown> = { ...edges[index], ...operation.changes };
      delete candidate.id;
      if (operation.changes.label === null) delete candidate.label;
      if (operation.changes.type === null) delete candidate.type;
      if (operation.changes.bidirectional === null) delete candidate.bidirectional;
      edges[index] = { id: edgeId, ...parseDiagramEdge(candidate, operationIndex) };
      counts.updatedEdges += 1;
      continue;
    }
    if (operation.op === "remove_edge") {
      assertAllowedKeys(operation, new Set(["op", "edgeId"]), path);
      const edgeId = getRequiredString(operation.edgeId, `${path}.edgeId`);
      edges.splice(findEdgeIndex(edgeId), 1);
      counts.removedEdges += 1;
      continue;
    }
    throw new AppError("invalid_params", `${path}.op is not supported`, 400);
  }

  if (nodes.length < 1) throw new AppError("invalid_params", "a diagram must contain at least one node", 400);
  if (current.kind === "mind-map") {
    const priorEdgeCount = edges.length;
    edges = edges.filter((edge) => !repositionedNodeIds.has(edge.target)
      || nodes.find((node) => node.id === edge.target)?.parentId === edge.source);
    counts.removedEdges += priorEdgeCount - edges.length;
    for (const node of nodes) {
      if (!node.parentId || edges.some((edge) => edge.source === node.parentId && edge.target === node.id)) continue;
      edges.push({ id: createId("edge"), source: node.parentId, target: node.id });
      counts.addedEdges += 1;
    }
  }
  const validatedIr = parseDiagramMemoIr({
    kind: current.kind,
    ...(current.theme ? { theme: current.theme } : {}),
    nodes,
    edges: edges.map(({ id: _id, ...edge }) => edge),
  });
  const { compileDiagramIr } = await import("@edgeever/shared/diagram-layout");
  const next = compileDiagramIr(validatedIr);
  next.edges = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.type ? { kind: edge.type } : {}),
    ...(edge.bidirectional !== undefined ? { bidirectional: edge.bidirectional } : {}),
  }));

  if (args.reflow !== "all") {
    const currentById = new Map(current.nodes.map((node) => [node.id, node]));
    for (const node of next.nodes) {
      const previous = currentById.get(node.id);
      if (!previous) continue;
      const boundaryNeedsLayout = node.shape === "boundary" && affectedBoundaryIds.has(node.id);
      if (repositionedNodeIds.has(node.id) || boundaryNeedsLayout) continue;
      node.x = previous.x;
      node.y = previous.y;
      if (!resizedNodeIds.has(node.id)) {
        node.width = previous.width;
        node.height = previous.height;
      }
    }
    if (current.kind === "architecture" && affectedBoundaryIds.size > 0) {
      const nodeById = new Map(next.nodes.map((node) => [node.id, node]));
      for (const boundaryId of [...affectedBoundaryIds]) {
        let parentId = nodeById.get(boundaryId)?.parentId;
        while (parentId) {
          affectedBoundaryIds.add(parentId);
          parentId = nodeById.get(parentId)?.parentId;
        }
      }
      const depth = (nodeId: string) => {
        let result = 0;
        let node = nodeById.get(nodeId);
        while (node?.parentId) {
          result += 1;
          node = nodeById.get(node.parentId);
        }
        return result;
      };
      for (const boundaryId of [...affectedBoundaryIds].sort((left, right) => depth(right) - depth(left))) {
        const boundary = nodeById.get(boundaryId);
        const children = next.nodes.filter((node) => node.parentId === boundaryId);
        if (!boundary || boundary.shape !== "boundary" || children.length === 0) continue;
        const left = Math.min(...children.map((node) => node.x)) - 36;
        const top = Math.min(...children.map((node) => node.y)) - 56;
        const right = Math.max(...children.map((node) => node.x + node.width)) + 36;
        const bottom = Math.max(...children.map((node) => node.y + node.height)) + 36;
        boundary.x = left;
        boundary.y = top;
        boundary.width = Math.max(260, right - left);
        boundary.height = Math.max(180, bottom - top);
      }
    }
  }

  const contentMarkdown = serializeDiagramDocument(next);
  if (!parseDiagramDocument(contentMarkdown)) {
    throw new AppError("invalid_params", "The diagram operations produced an invalid document", 400);
  }
  return { document: next, contentMarkdown, changes: counts };
};

export const callMcpTool = async (
  c: AppContext,
  auth: AuthContext,
  name: string,
  args: Record<string, unknown>,
  dependencies: McpToolDependencies,
) => {
  const {
    clampNumber,
    createMemoRecord,
    deleteMemosRecord,
    getCurrentWorkspaceIdentity,
    getMemoDetail,
    getMemoDetailRow,
    getMemosForBulkAction,
    importMemosRecord,
    listMemosForMcp,
    mergeMemosRecord,
    moveMemosToNotebook,
    restoreMemosRecord,
    searchMemoSummaries,
    updateMemoRecord,
  } = dependencies;

  switch (name) {
    case "get_current_user": {
      return await getCurrentWorkspaceIdentity(c.env.storage.db, auth);
    }
    case "search_memos": {
      assertScope(auth, "read:memos");
      return {
        memos: await searchMemoSummaries(c.env.storage.db, {
          workspaceId: auth.workspaceId,
          query: getOptionalString(args.query),
          notebookId: getOptionalString(args.notebookId),
          tags: getOptionalStringArray(args.tags),
          createdAfter: getOptionalString(args.createdAfter),
          createdBefore: getOptionalString(args.createdBefore),
          updatedAfter: getOptionalString(args.updatedAfter),
          updatedBefore: getOptionalString(args.updatedBefore),
          isPinned: typeof args.isPinned === "boolean" ? args.isPinned : null,
          hasResources: typeof args.hasResources === "boolean" ? args.hasResources : null,
          limit: clampNumber(Number(args.limit ?? 20), 1, 50),
        }),
      };
    }
    case "list_memos": {
      assertScope(auth, "read:memos");
      return await listMemosForMcp(c.env.storage.db, {
        workspaceId: auth.workspaceId,
        notebookId: getOptionalString(args.notebookId),
        limit: clampNumber(Number(args.limit ?? 50), 1, 100),
        offset: clampNumber(Number(args.offset ?? 0), 0, 100_000),
        includeContent: args.includeContent === true,
        includeDeleted: args.includeDeleted === true,
      });
    }
    case "get_memo": {
      assertScope(auth, "read:memos");
      const memoId = getRequiredString(args.memoId, "memoId");
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId, args.includeDeleted === true);

      if (!memo) {
        throw new Error("Memo not found");
      }

      const diagram = parseDiagramDocument(memo.contentMarkdown);
      return diagram
        ? { memo: memoWithoutDiagramPayload(memo), diagram: diagramSemanticGraph(diagram) }
        : { memo };
    }
    case "create_memo": {
      assertScope(auth, "write:memos");
      const notebookId = getRequiredString(args.notebookId, "notebookId");
      const actor = getAuditActor(c);
      const actorLabel = getActorLabel(c);
      const memo = await createMemoRecord(c.env.storage.db, auth.workspaceId, {
        notebookId,
        title: getOptionalString(args.title) ?? undefined,
        contentMarkdown: getOptionalString(args.contentMarkdown) ?? "",
        tags: getOptionalStringArray(args.tags),
        createdAt: getOptionalString(args.createdAt) ?? undefined,
        updatedAt: getOptionalString(args.updatedAt) ?? undefined,
      }, actor, actorLabel);

      return { memo };
    }
    case "create_diagram_memo": {
      assertScope(auth, "write:memos");
      const notebookId = getRequiredString(args.notebookId, "notebookId");
      const ir = parseDiagramMemoIr(args);
      const { compileDiagramIr } = await import("@edgeever/shared/diagram-layout");
      const document = compileDiagramIr(ir);
      const contentMarkdown = serializeDiagramDocument(document);
      if (!parseDiagramDocument(contentMarkdown)) {
        throw new AppError("invalid_params", "The diagram graph could not be compiled", 400);
      }
      const memo = await createMemoRecord(c.env.storage.db, auth.workspaceId, {
        notebookId,
        title: getOptionalString(args.title) ?? undefined,
        contentMarkdown,
        tags: getOptionalStringArray(args.tags),
      }, getAuditActor(c), getActorLabel(c));

      return {
        memo: memoWithoutDiagramPayload(memo),
        diagramKind: document.kind,
        diagram: diagramSemanticGraph(document),
      };
    }
    case "get_diagram": {
      assertScope(auth, "read:memos");
      const memoId = getRequiredString(args.memoId, "memoId");
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId);
      if (!memo) throw new AppError("not_found", "Memo not found", 404);
      const document = parseDiagramDocument(memo.contentMarkdown);
      if (!document) throw new AppError("not_diagram", "Memo is not an editable diagram", 400);
      return {
        memo: { id: memo.id, title: memo.title, revision: memo.revision, updatedAt: memo.updatedAt },
        diagram: diagramSemanticGraph(document, args.includeLayout === true),
      };
    }
    case "update_diagram": {
      assertScope(auth, "write:memos");
      const memoId = getRequiredString(args.memoId, "memoId");
      if (typeof args.expectedRevision !== "number" || !Number.isInteger(args.expectedRevision) || args.expectedRevision < 0) {
        throw new AppError("invalid_params", "expectedRevision must be a non-negative integer", 400);
      }
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId);
      if (!memo) throw new AppError("not_found", "Memo not found", 404);
      if (memo.revision !== args.expectedRevision) {
        throw new AppError("revision_conflict", "Diagram was updated elsewhere. Read it again before applying operations.", 409);
      }
      const current = parseDiagramDocument(memo.contentMarkdown);
      if (!current) throw new AppError("not_diagram", "Memo is not an editable diagram", 400);
      const mutation = await applyDiagramOperations(args, current);
      if (args.dryRun === true) {
        return {
          dryRun: true,
          memo: { id: memo.id, title: memo.title, revision: memo.revision, updatedAt: memo.updatedAt },
          changes: mutation.changes,
          diagram: diagramSemanticGraph(mutation.document),
        };
      }
      const result = await updateMemoRecord(c.env.storage.db, auth.workspaceId, memoId, {
        expectedRevision: args.expectedRevision,
        contentMarkdown: mutation.contentMarkdown,
      }, getAuditActor(c), getActorLabel(c));
      if (result.error !== undefined) {
        throw new AppError(result.error, result.message, result.status ?? 400);
      }
      return {
        memo: { id: result.memo.id, title: result.memo.title, revision: result.memo.revision, updatedAt: result.memo.updatedAt },
        changes: mutation.changes,
        diagram: diagramSemanticGraph(mutation.document),
      };
    }
    case "import_memos": {
      assertScope(auth, "write:memos");
      return await importMemosRecord(c.env.storage.db, auth.workspaceId, {
        source: getRequiredString(args.source, "source"),
        notebookId: getRequiredString(args.notebookId, "notebookId"),
        items: args.items,
        dryRun: args.dryRun === true,
        actor: getAuditActor(c),
        actorLabel: getActorLabel(c),
      });
    }
    case "update_memo": {
      assertScope(auth, "write:memos");
      const memoId = getRequiredString(args.memoId, "memoId");
      if (args.contentMarkdown !== undefined) {
        const existing = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId);
        if (existing && parseDiagramDocument(existing.contentMarkdown)) {
          throw new AppError(
            "diagram_update_required",
            "Diagram content cannot be replaced through update_memo. Use update_diagram for semantic changes.",
            400,
          );
        }
      }
      const actor = getAuditActor(c);
      const actorLabel = getActorLabel(c);
      const result = await updateMemoRecord(
        c.env.storage.db,
        auth.workspaceId,
        memoId,
        {
          expectedRevision:
            typeof args.expectedRevision === "number" && Number.isInteger(args.expectedRevision)
              ? args.expectedRevision
              : undefined,
          notebookId: getOptionalString(args.notebookId) ?? undefined,
          title: getOptionalString(args.title) ?? undefined,
          isPinned: typeof args.isPinned === "boolean" ? args.isPinned : undefined,
          contentMarkdown: getOptionalString(args.contentMarkdown) ?? undefined,
          tags: Array.isArray(args.tags) ? getOptionalStringArray(args.tags) : undefined,
          createdAt: getOptionalString(args.createdAt) ?? undefined,
          updatedAt: getOptionalString(args.updatedAt) ?? undefined,
        },
        actor,
        actorLabel
      );

      if ("error" in result) {
        throw new Error(result.message);
      }

      return { memo: result.memo };
    }
    case "trash_memos": {
      assertScope(auth, "write:memos");
      const memoIds = getRequiredStringArray(args.memoIds, "memoIds");

      if (args.dryRun === true) {
        return { dryRun: true, memos: await getMemosForBulkAction(c.env.storage.db, auth.workspaceId, memoIds, 0) };
      }

      const deleted = await deleteMemosRecord(c.env, auth.workspaceId, memoIds, false, getAuditActor(c));
      return { ok: true, deleted };
    }
    case "restore_memos": {
      assertScope(auth, "write:memos");
      const memoIds = getRequiredStringArray(args.memoIds, "memoIds");

      if (args.dryRun === true) {
        return { dryRun: true, memos: await getMemosForBulkAction(c.env.storage.db, auth.workspaceId, memoIds, 1) };
      }

      const restored = await restoreMemosRecord(c.env.storage.db, auth.workspaceId, memoIds, getAuditActor(c));
      return { ok: true, restored };
    }
    case "upload_memo_image": {
      assertScope(auth, "write:resources");
      const memoId = getRequiredString(args.memoId, "memoId");
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId);

      if (!memo) {
        throw new AppError("not_found", "Memo not found", 404);
      }

      const mimeType = getRequiredString(args.mimeType, "mimeType");
      const filename = getOptionalString(args.filename) ?? `image${inferImageExtension("", mimeType)}`;
      const bytes = await decodeBase64Data(getRequiredString(args.dataBase64, "dataBase64"));
      const resource = await createImageResource(c, {
        memoId,
        filename,
        mimeType,
        bytes,
        actor: getAuditActor(c),
        source: "mcp",
      });
      const alt = getOptionalString(args.alt) ?? normalizeFilename(filename) ?? "image";

      return {
        resource,
        markdownImage: `![${escapeMarkdownImageAlt(alt)}](${resource.url})`,
      };
    }
    case "move_memos": {
      assertScope(auth, "write:memos");
      const notebookId = getRequiredString(args.notebookId, "notebookId");
      const memoIds = getRequiredStringArray(args.memoIds, "memoIds");
      const target = await getNotebook(c.env.storage.db, auth.workspaceId, notebookId);

      if (!target) {
        throw new AppError("not_found", "Target notebook not found", 404);
      }

      if (args.dryRun === true) {
        return { dryRun: true, targetNotebook: target, memos: await getMemosForBulkAction(c.env.storage.db, auth.workspaceId, memoIds, 0) };
      }

      const actor = getAuditActor(c);
      const actorLabel = getActorLabel(c);
      const moved = await moveMemosToNotebook(c.env.storage.db, auth.workspaceId, memoIds, notebookId, actor, actorLabel);

      return { ok: true, moved };
    }
    case "add_tags_to_memos": {
      assertScope(auth, "write:tags");
      return await updateTagsForMemos(c.env.storage.db, {
        workspaceId: auth.workspaceId,
        memoIds: getRequiredStringArray(args.memoIds, "memoIds"),
        tags: getRequiredStringArray(args.tags, "tags"),
        mode: "add",
        dryRun: args.dryRun === true,
        actor: getAuditActor(c),
        actorLabel: getActorLabel(c),
      });
    }
    case "remove_tags_from_memos": {
      assertScope(auth, "write:tags");
      return await updateTagsForMemos(c.env.storage.db, {
        workspaceId: auth.workspaceId,
        memoIds: getRequiredStringArray(args.memoIds, "memoIds"),
        tags: getRequiredStringArray(args.tags, "tags"),
        mode: "remove",
        dryRun: args.dryRun === true,
        actor: getAuditActor(c),
        actorLabel: getActorLabel(c),
      });
    }
    case "rename_tag": {
      assertScope(auth, "write:tags");
      const from = getRequiredString(args.from, "from");
      const to = getRequiredString(args.to, "to");

      if (args.dryRun === true) {
        return await previewTagRename(c.env.storage.db, auth.workspaceId, from, to);
      }

      const updated = await updateTagAcrossMemos(c.env.storage.db, auth.workspaceId, from, to, getAuditActor(c), getActorLabel(c));
      return { ok: true, updated };
    }
    case "delete_tag": {
      assertScope(auth, "write:tags");
      const tag = getRequiredString(args.tag, "tag");

      if (args.dryRun === true) {
        return await previewTagRename(c.env.storage.db, auth.workspaceId, tag, null);
      }

      const updated = await updateTagAcrossMemos(c.env.storage.db, auth.workspaceId, tag, null, getAuditActor(c), getActorLabel(c));
      return { ok: true, updated };
    }
    case "merge_memos": {
      assertScope(auth, "write:memos");
      const actor = getAuditActor(c);
      const actorLabel = getActorLabel(c);
      const memo = await mergeMemosRecord(
        c.env.storage.db,
        auth.workspaceId,
        {
          memoIds: getRequiredStringArray(args.memoIds, "memoIds"),
          notebookId: getOptionalString(args.notebookId) ?? undefined,
          title: getOptionalString(args.title) ?? undefined,
        },
        actor,
        actorLabel
      );

      return { memo };
    }
    case "upload_memo_attachment": {
      assertScope(auth, "write:resources");
      const memoId = getRequiredString(args.memoId, "memoId");
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId);

      if (!memo) {
        throw new AppError("not_found", "Memo not found", 404);
      }

      const filename = getRequiredString(args.filename, "filename");
      const bytes = await decodeBase64Data(getRequiredString(args.dataBase64, "dataBase64"));
      const resource = await createAttachmentResource(c, {
        memoId,
        filename,
        mimeType: getRequiredString(args.mimeType, "mimeType"),
        bytes,
        actor: getAuditActor(c),
      });
      const label = getOptionalString(args.label) ?? normalizeFilename(filename) ?? "attachment";

      return {
        resource,
        markdownLink: `[${escapeMarkdownLinkLabel(label)}](${resource.url})`,
      };
    }
    case "list_memo_resources": {
      assertScope(auth, "read:resources");
      const memoId = getRequiredString(args.memoId, "memoId");
      const memo = await getMemoDetail(c.env.storage.db, auth.workspaceId, memoId, true);

      if (!memo) {
        throw new AppError("not_found", "Memo not found", 404);
      }

      return { resources: await listResourcesForMemo(c.env.storage.db, auth.workspaceId, memoId) };
    }
    case "list_resources": {
      assertScope(auth, "read:resources");
      return await listResourcesForMcp(c.env.storage.db, auth.workspaceId, clampNumber(Number(args.limit ?? 100), 1, 500));
    }
    case "list_memo_revisions": {
      assertScope(auth, "read:memos");
      return {
        revisions: await listMemoRevisionsService(
          c.env.storage.db,
          auth.workspaceId,
          getRequiredString(args.memoId, "memoId"),
          clampNumber(Number(args.limit ?? 50), 1, 100),
          getMemoDetail,
        ),
      };
    }
    case "restore_memo_revision": {
      assertScope(auth, "write:memos");
      const memoId = getRequiredString(args.memoId, "memoId");
      const revisionId = getRequiredString(args.revisionId, "revisionId");
      const revision = await getMemoRevisionRowService(c.env.storage.db, auth.workspaceId, memoId, revisionId);

      if (!revision) {
        throw new AppError("not_found", "Memo revision not found", 404);
      }

      if (args.dryRun === true) {
        return { dryRun: true, revision: mapMemoRevisionService(revision) };
      }

      return {
        memo: await restoreMemoRevisionService(
          c.env.storage.db,
          auth.workspaceId,
          memoId,
          revisionId,
          getAuditActor(c),
          getActorLabel(c),
          { getMemoDetail, getMemoDetailRow },
        ),
      };
    }
    case "move_notebook": {
      assertScope(auth, "write:notebooks");
      const actor = getAuditActor(c);
      const notebook = await updateNotebookRecord(
        c.env.storage.db,
        auth.workspaceId,
        getRequiredString(args.notebookId, "notebookId"),
        {
          parentId: args.parentId === null ? null : getOptionalString(args.parentId) ?? undefined,
          sortOrder: typeof args.sortOrder === "number" && Number.isInteger(args.sortOrder) ? args.sortOrder : undefined,
        },
        actor
      );

      return { notebook };
    }
    case "create_notebook": {
      assertScope(auth, "write:notebooks");
      const actor = getAuditActor(c);
      const name = getRequiredString(args.name, "name");

      if (name.length > 80) {
        throw new AppError("invalid_params", "name must be at most 80 characters", 400);
      }

      const notebook = await createNotebookRecord(
        c.env.storage.db,
        auth.workspaceId,
        {
          name,
          parentId: args.parentId === null ? null : getOptionalString(args.parentId) ?? undefined,
          sortOrder: typeof args.sortOrder === "number" && Number.isInteger(args.sortOrder) ? args.sortOrder : undefined,
        },
        actor
      );

      return { notebook };
    }
    case "rename_notebook": {
      assertScope(auth, "write:notebooks");
      const name = getRequiredString(args.name, "name");

      if (name.length > 80) {
        throw new AppError("invalid_params", "name must be at most 80 characters", 400);
      }

      const notebook = await updateNotebookRecord(
        c.env.storage.db,
        auth.workspaceId,
        getRequiredString(args.notebookId, "notebookId"),
        { name },
        getAuditActor(c)
      );

      return { notebook };
    }
    case "get_notebook": {
      assertScope(auth, "read:notebooks");
      const notebook = await getNotebook(c.env.storage.db, auth.workspaceId, getRequiredString(args.notebookId, "notebookId"));
      if (!notebook) {
        throw new AppError("not_found", "Notebook not found in the authenticated user's workspace.", 404);
      }
      return { notebook };
    }
    case "find_notebooks": {
      assertScope(auth, "read:notebooks");
      return {
        notebooks: await findNotebooks(c.env.storage.db, auth.workspaceId, {
          name: getRequiredString(args.name, "name"),
          parentId: Object.hasOwn(args, "parentId")
            ? args.parentId === null
              ? null
              : getRequiredString(args.parentId, "parentId")
            : undefined,
          exact: args.exact === true,
          limit: clampNumber(Number(args.limit ?? 20), 1, 50),
        }),
      };
    }
    case "resolve_notebook_path": {
      assertScope(auth, "read:notebooks");
      return await resolveNotebookPath(c.env.storage.db, auth.workspaceId, getRequiredString(args.path, "path"));
    }
    case "list_notebooks": {
      assertScope(auth, "read:notebooks");
      return { notebooks: await listNotebooks(c.env.storage.db, auth.workspaceId) };
    }
    case "list_tags": {
      assertScope(auth, "read:tags");
      return { tags: await listTagSummaries(c.env.storage.db, auth.workspaceId) };
    }
    case "get_workspace_stats": {
      assertScope(auth, "read:memos");
      return await getWorkspaceStats(c.env.storage.db, auth.workspaceId);
    }
    case "list_note_templates": {
      assertScope(auth, "read:memos");
      return { templates: await listMemoTemplates(c.env.storage.db, auth.workspaceId) };
    }
    case "get_note_template": {
      assertScope(auth, "read:memos");
      const template = await getMemoTemplate(
        c.env.storage.db,
        auth.workspaceId,
        getRequiredString(args.templateId, "templateId"),
      );
      if (!template) throw new AppError("not_found", "Template not found", 404);
      return { template };
    }
    case "create_note_template": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const input = parseMcpInput(TemplateCreateSchema, args);
      const memo = input.memoId
        ? await getMemoDetail(c.env.storage.db, auth.workspaceId, input.memoId)
        : null;
      if (input.memoId && !memo) throw new AppError("not_found", "Memo not found", 404);

      const id = createId("template");
      const now = isoNow();
      const title = memo?.title ?? (input.title?.trim() || null);
      const contentMarkdown = memo?.contentMarkdown ?? input.contentMarkdown ?? "";
      const tags = memo?.tags ?? input.tags ?? [];
      const contentJson = memo?.contentJson ?? markdownToDoc(contentMarkdown);
      await c.env.storage.db.prepare(
        `INSERT INTO memo_templates (
           id, workspace_id, name, description, title, content_json, content_markdown, tags_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        auth.workspaceId,
        input.name.trim(),
        input.description?.trim() || null,
        title,
        JSON.stringify(contentJson),
        contentMarkdown,
        JSON.stringify(tags),
        now,
        now,
      ).run();
      const actor = getAuditActor(c);
      await audit(c.env.storage.db, actor.actorType, actor.actorId, "template.create", "template", id, {
        memoId: input.memoId ?? null,
      });
      return { template: await getMemoTemplate(c.env.storage.db, auth.workspaceId, id) };
    }
    case "update_note_template": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const templateId = getRequiredString(args.templateId, "templateId");
      const input = parseMcpInput(TemplateUpdateSchema, args);
      if (Object.keys(input).length === 0) {
        throw new AppError("invalid_params", "At least one template field is required.", 400);
      }
      const current = await getMemoTemplate(c.env.storage.db, auth.workspaceId, templateId);
      if (!current) throw new AppError("not_found", "Template not found", 404);

      const contentMarkdown = input.contentMarkdown ?? current.contentMarkdown;
      const contentJson = input.contentMarkdown !== undefined
        ? markdownToDoc(contentMarkdown)
        : current.contentJson;
      const now = isoNow();
      await c.env.storage.db.prepare(
        `UPDATE memo_templates
         SET name = ?, description = ?, title = ?, content_json = ?, content_markdown = ?, tags_json = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).bind(
        input.name ?? current.name,
        input.description !== undefined ? input.description?.trim() || null : current.description,
        input.title !== undefined ? input.title?.trim() || null : current.title,
        JSON.stringify(contentJson),
        contentMarkdown,
        JSON.stringify(input.tags ?? current.tags),
        now,
        templateId,
        auth.workspaceId,
      ).run();
      const actor = getAuditActor(c);
      await audit(c.env.storage.db, actor.actorType, actor.actorId, "template.update", "template", templateId, {});
      return { template: await getMemoTemplate(c.env.storage.db, auth.workspaceId, templateId) };
    }
    case "delete_note_template": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const templateId = getRequiredString(args.templateId, "templateId");
      const current = await getMemoTemplate(c.env.storage.db, auth.workspaceId, templateId);
      if (!current) throw new AppError("not_found", "Template not found", 404);
      await c.env.storage.db.prepare(
        `DELETE FROM memo_templates WHERE id = ? AND workspace_id = ?`,
      ).bind(templateId, auth.workspaceId).run();
      const actor = getAuditActor(c);
      await audit(c.env.storage.db, actor.actorType, actor.actorId, "template.delete", "template", templateId, {});
      return { ok: true };
    }
    case "use_note_template": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const templateId = getRequiredString(args.templateId, "templateId");
      const template = await getMemoTemplate(c.env.storage.db, auth.workspaceId, templateId);
      if (!template) throw new AppError("not_found", "Template not found", 404);
      const memo = await createMemoRecord(c.env.storage.db, auth.workspaceId, {
        notebookId: getRequiredString(args.notebookId, "notebookId"),
        title: template.title ?? undefined,
        contentMarkdown: template.contentMarkdown,
        tags: template.tags,
      }, getAuditActor(c), getActorLabel(c));
      const actor = getAuditActor(c);
      await audit(c.env.storage.db, actor.actorType, actor.actorId, "template.use", "template", templateId, { memoId: memo.id });
      return { memo };
    }
    case "list_ai_instructions": {
      assertScope(auth, "read:memos");
      return {
        instructions: await listAiPromptTemplates(
          c.env.storage.db,
          auth.workspaceId,
          getOptionalString(args.locale),
        ),
      };
    }
    case "get_ai_instruction": {
      assertScope(auth, "read:memos");
      const row = await getAiPromptTemplateRow(
        c.env.storage.db,
        auth.workspaceId,
        getRequiredString(args.instructionId, "instructionId"),
      );
      if (!row) throw new AppError("not_found", "AI instruction not found", 404);
      return { instruction: mapAiPromptTemplateRow(row, getOptionalString(args.locale)) };
    }
    case "create_ai_instruction": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const input = parseMcpInput(AiPromptTemplateCreateSchema, args);
      const id = createId("aiprompt");
      const now = isoNow();
      const actor = getAuditActor(c);
      await c.env.storage.db.batch([
        c.env.storage.db.prepare(
          `INSERT INTO ai_prompt_templates (
             id, workspace_id, seed_key, action, parameter_kind, result_mode,
             name, description, instruction,
             name_customized, description_customized, instruction_customized,
             created_at, updated_at
           ) VALUES (?, ?, NULL, 'custom', ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
        ).bind(
          id,
          auth.workspaceId,
          input.parameterKind,
          input.resultMode,
          input.name.trim(),
          input.description?.trim() || null,
          input.instruction.trim(),
          now,
          now,
        ),
        auditStatement(c.env.storage.db, actor.actorType, actor.actorId, "ai_prompt.create", "ai_prompt", id, {}),
      ]);
      const row = await getAiPromptTemplateRow(c.env.storage.db, auth.workspaceId, id);
      return { instruction: mapAiPromptTemplateRow(row!, getOptionalString(args.locale)) };
    }
    case "update_ai_instruction": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const instructionId = getRequiredString(args.instructionId, "instructionId");
      const input = parseMcpInput(AiPromptTemplateUpdateSchema, args);
      const current = await getAiPromptTemplateRow(c.env.storage.db, auth.workspaceId, instructionId);
      if (!current) throw new AppError("not_found", "AI instruction not found", 404);

      const now = isoNow();
      const actor = getAuditActor(c);
      await c.env.storage.db.batch([
        c.env.storage.db.prepare(
          `UPDATE ai_prompt_templates
           SET name = ?, description = ?, instruction = ?,
               parameter_kind = ?, result_mode = ?,
               name_customized = ?, description_customized = ?, instruction_customized = ?,
               updated_at = ?
           WHERE id = ? AND workspace_id = ?`,
        ).bind(
          input.name?.trim() ?? current.name,
          input.description !== undefined ? input.description?.trim() || null : current.description,
          input.instruction?.trim() ?? current.instruction,
          input.parameterKind ?? current.parameter_kind,
          input.resultMode ?? current.result_mode,
          input.name !== undefined ? 1 : current.name_customized,
          input.description !== undefined ? 1 : current.description_customized,
          input.instruction !== undefined ? 1 : current.instruction_customized,
          now,
          instructionId,
          auth.workspaceId,
        ),
        auditStatement(c.env.storage.db, actor.actorType, actor.actorId, "ai_prompt.update", "ai_prompt", instructionId, {}),
      ]);
      const row = await getAiPromptTemplateRow(c.env.storage.db, auth.workspaceId, instructionId);
      return { instruction: mapAiPromptTemplateRow(row!, getOptionalString(args.locale)) };
    }
    case "delete_ai_instruction": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const instructionId = getRequiredString(args.instructionId, "instructionId");
      const current = await getAiPromptTemplateRow(c.env.storage.db, auth.workspaceId, instructionId);
      if (!current) throw new AppError("not_found", "AI instruction not found", 404);
      const actor = getAuditActor(c);
      await c.env.storage.db.batch([
        c.env.storage.db.prepare(
          `DELETE FROM ai_prompt_templates WHERE id = ? AND workspace_id = ?`,
        ).bind(instructionId, auth.workspaceId),
        auditStatement(c.env.storage.db, actor.actorType, actor.actorId, "ai_prompt.delete", "ai_prompt", instructionId, {}),
      ]);
      return { ok: true };
    }
    case "restore_default_ai_instructions": {
      assertScope(auth, "write:memos");
      assertMcpMutationAllowed(c.env);
      const result = await restoreMissingDefaultAiPrompts(c.env.storage.db, auth.workspaceId);
      if (result.restoredCount > 0) {
        const actor = getAuditActor(c);
        await audit(c.env.storage.db, actor.actorType, actor.actorId, "ai_prompt.restore_defaults", "workspace", auth.workspaceId, result);
      }
      return {
        ...result,
        instructions: await listAiPromptTemplates(
          c.env.storage.db,
          auth.workspaceId,
          getOptionalString(args.locale),
        ),
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
