import type { DiagramDocument, DiagramNode } from "@edgeever/shared";

export type MindMapOutlineDraft = {
  text: string;
  lineIds: Array<string | null>;
  lastValidText: string;
  lastValidLineIds: Array<string | null>;
};

export type MindMapOutlineError = {
  line: number;
  reason: "empty" | "indent" | "root" | "depth" | "label";
};

type OutlineResult =
  | { ok: true; document: DiagramDocument; draft: MindMapOutlineDraft; structureChanged: boolean }
  | { ok: false; error: MindMapOutlineError };

const escapeLabel = (label: string) => label
  .replaceAll("\\", "\\\\")
  .replaceAll("\r", "\\r")
  .replaceAll("\n", "\\n")
  .replaceAll("\t", "\\t")
  .replace(/^([-*+] )/, "\\$1");

const unescapeLabel = (label: string) => label.replace(/\\(\\|r|n|t|[-*+] )/g, (_match, value: string) => (
  value === "n" ? "\n" : value === "t" ? "\t" : value === "r" ? "\r" : value
));

const listMarker = /^(?:[-*+]|\d+[.)]) /;
const headingMarker = /^#{1,6} /;

const outlineLabel = (line: string) => {
  const content = line.replace(/^[\t ]*/, "");
  return content.replace(headingMarker.test(content) ? headingMarker : listMarker, "").trim();
};

export const formatMindMapOutline = (document: DiagramDocument): MindMapOutlineDraft | null => {
  if (document.kind !== "mind-map" || document.nodes.length === 0) return null;
  const roots = document.nodes.filter((node) => !node.parentId);
  if (roots.length !== 1 || document.nodes.some((node) => node.shape !== "topic")) return null;
  const children = new Map<string, DiagramNode[]>();
  for (const node of document.nodes) {
    if (!node.parentId) continue;
    const group = children.get(node.parentId) ?? [];
    group.push(node);
    children.set(node.parentId, group);
  }
  for (const group of children.values()) {
    group.sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
  }
  const lines: string[] = [];
  const lineIds: string[] = [];
  const visited = new Set<string>();
  const visit = (node: DiagramNode, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    lines.push(depth === 0
      ? `# ${escapeLabel(node.label)}`
      : `${"  ".repeat(depth - 1)}- ${escapeLabel(node.label)}`);
    lineIds.push(node.id);
    for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
  };
  visit(roots[0], 0);
  if (visited.size !== document.nodes.length) return null;
  const text = lines.join("\n");
  return { text, lineIds, lastValidText: text, lastValidLineIds: [...lineIds] };
};

/** Keep identities through typing, indentation, and moving unchanged lines. */
export const updateMindMapOutlineDraft = (draft: MindMapOutlineDraft, text: string): MindMapOutlineDraft => {
  text = text.replace(/\r\n?/g, "\n");
  const previous = draft.text.split("\n");
  const next = text.split("\n");
  const lineIds: Array<string | null> = Array(next.length).fill(null);
  const used = new Set<number>();
  const previousLabels = previous.map(outlineLabel);
  const nextLabels = next.map(outlineLabel);
  const previousByLabel = new Map<string, number[]>();
  const nextCounts = new Map<string, number>();
  previousLabels.forEach((label, index) => {
    if (!label) return;
    const matches = previousByLabel.get(label) ?? [];
    matches.push(index);
    previousByLabel.set(label, matches);
  });
  nextLabels.forEach((label) => {
    if (label) nextCounts.set(label, (nextCounts.get(label) ?? 0) + 1);
  });
  // Match unique labels first, including lines moved to a different branch.
  for (let index = 0; index < next.length; index += 1) {
    const label = nextLabels[index];
    if (!label) continue;
    const candidates = previousByLabel.get(label) ?? [];
    if (candidates.length !== 1 || nextCounts.get(label) !== 1) continue;
    lineIds[index] = draft.lineIds[candidates[0]] ?? null;
    used.add(candidates[0]);
  }
  // Pair unchanged duplicate labels in their existing order.
  for (let index = 0; index < next.length; index += 1) {
    if (lineIds[index] || !nextLabels[index]) continue;
    const oldIndex = previousLabels.findIndex((label, candidate) =>
      !used.has(candidate) && label === nextLabels[index] && draft.lineIds[candidate]);
    if (oldIndex < 0) continue;
    lineIds[index] = draft.lineIds[oldIndex];
    used.add(oldIndex);
  }
  // Invalid intermediate text must not forget the last committed tree. This
  // restores IDs when a user pastes the original outline back in one action.
  const validLabels = draft.lastValidText.split("\n").map(outlineLabel);
  const assigned = new Set(lineIds.filter((id): id is string => Boolean(id)));
  for (let index = 0; index < next.length; index += 1) {
    if (lineIds[index] || !nextLabels[index]) continue;
    const oldIndex = validLabels.findIndex((label, candidate) => {
      const id = draft.lastValidLineIds[candidate];
      return label === nextLabels[index] && Boolean(id) && !assigned.has(id!);
    });
    if (oldIndex < 0) continue;
    const id = draft.lastValidLineIds[oldIndex];
    lineIds[index] = id;
    if (id) assigned.add(id);
  }
  // Within an unchanged pair of neighboring topics, a one-for-one replacement
  // is an edited label. Insertions and removals leave unequal gaps and do not
  // inherit metadata from a different topic.
  const anchors: Array<{ previousIndex: number; nextIndex: number }> = [];
  for (let nextIndex = 0; nextIndex < lineIds.length; nextIndex += 1) {
    const id = lineIds[nextIndex];
    const previousIndex = id ? draft.lineIds.indexOf(id) : -1;
    if (previousIndex < 0) continue;
    used.add(previousIndex);
    if (previousIndex > (anchors.at(-1)?.previousIndex ?? -1)) anchors.push({ previousIndex, nextIndex });
  }
  const boundaries = [{ previousIndex: -1, nextIndex: -1 }, ...anchors, { previousIndex: previous.length, nextIndex: next.length }];
  for (let boundary = 1; boundary < boundaries.length; boundary += 1) {
    const before = boundaries[boundary - 1];
    const after = boundaries[boundary];
    const oldGap = previous.flatMap((_line, index) => index > before.previousIndex && index < after.previousIndex
      && !used.has(index) && draft.lineIds[index] ? [index] : []);
    const newGap = next.flatMap((_line, index) => index > before.nextIndex && index < after.nextIndex
      && !lineIds[index] && nextLabels[index] ? [index] : []);
    if (oldGap.length !== 1 || newGap.length !== 1) continue;
    lineIds[newGap[0]] = draft.lineIds[oldGap[0]];
    used.add(oldGap[0]);
  }
  // A single edited line keeps its identity. Bulk replacement remains conservative.
  const unmatchedOld = previous.flatMap((_line, index) => !used.has(index) && draft.lineIds[index] ? [index] : []);
  const unmatchedNext = next.flatMap((_line, index) => !lineIds[index] && nextLabels[index] ? [index] : []);
  if (unmatchedOld.length === 1 && unmatchedNext.length === 1) {
    lineIds[unmatchedNext[0]] = draft.lineIds[unmatchedOld[0]];
  }
  return { ...draft, text, lineIds };
};

export const projectMindMapOutline = (
  source: DiagramDocument,
  draft: MindMapOutlineDraft,
  createId: () => string,
): OutlineResult => {
  if (source.kind !== "mind-map") return { ok: false, error: { line: 1, reason: "root" } };
  const oldNodes = new Map(source.nodes.map((node) => [node.id, node]));
  const lines = draft.text.replaceAll("\r\n", "\n").split("\n");
  const nodes: DiagramNode[] = [];
  const stack: Array<string | null> = [];
  const lineIds = [...draft.lineIds];
  const assignedIds = new Set<string>();
  let previousDepth = -1;
  let rootStyle: "heading" | "list" | "plain" | null = null;
  let entriesSeen = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^[\t ]*/)?.[0] ?? "";
    const spaceCount = (indent.match(/ /g) ?? []).length;
    if (spaceCount % 2 !== 0) return { ok: false, error: { line: index + 1, reason: "indent" } };
    const indentDepth = (indent.match(/\t/g) ?? []).length + spaceCount / 2;
    const content = line.slice(indent.length);
    const isHeading = headingMarker.test(content);
    const isListItem = listMarker.test(content);
    if (rootStyle === null) rootStyle = isHeading ? "heading" : isListItem ? "list" : "plain";
    const depth = entriesSeen === 0 ? indentDepth
      : isHeading ? 0
        : isListItem && rootStyle === "heading" ? indentDepth + 1
          : isListItem && rootStyle === "plain" && indentDepth === 0 ? 1
            : !isListItem && rootStyle === "heading" ? indentDepth + 1
              : indentDepth;
    if (entriesSeen === 0 && depth !== 0) return { ok: false, error: { line: index + 1, reason: "root" } };
    if (nodes.length > 0 && depth === 0) return { ok: false, error: { line: index + 1, reason: "root" } };
    if (depth > previousDepth + 1) return { ok: false, error: { line: index + 1, reason: "depth" } };
    const raw = content.replace(isHeading ? headingMarker : listMarker, "");
    const label = unescapeLabel(raw);
    entriesSeen += 1;
    previousDepth = depth;
    if (!label.trim()) {
      stack[depth] = null;
      stack.length = depth + 1;
      continue;
    }
    if (label.length > 500) return { ok: false, error: { line: index + 1, reason: "label" } };
    let parentId: string | undefined;
    for (let parentDepth = depth - 1; parentDepth >= 0; parentDepth -= 1) {
      if (stack[parentDepth]) { parentId = stack[parentDepth] ?? undefined; break; }
    }
    if (depth > 0 && !parentId) return { ok: false, error: { line: index + 1, reason: "empty" } };
    const originalId = lineIds[index];
    const id = originalId && oldNodes.has(originalId) && !assignedIds.has(originalId) ? originalId : createId();
    lineIds[index] = id;
    assignedIds.add(id);
    const oldNode = oldNodes.get(id);
    nodes.push({
      ...(oldNode ?? { id, x: 72, y: 64 + nodes.length * 80, width: 96, height: 36, shape: "topic" as const }),
      label,
      ...(parentId ? { parentId } : {}),
      ...(!parentId && oldNode?.parentId ? { parentId: undefined } : {}),
    });
    stack[depth] = id;
    stack.length = depth + 1;
  }
  if (nodes.length === 0) return { ok: false, error: { line: 1, reason: "empty" } };

  const nextIds = new Set(nodes.map((node) => node.id));
  const hierarchyEdgeIds = new Set(source.edges.filter((edge) => {
    const oldNode = oldNodes.get(edge.target);
    return oldNode?.parentId === edge.source;
  }).map((edge) => edge.id));
  const edges = source.edges.filter((edge) =>
    !hierarchyEdgeIds.has(edge.id) && nextIds.has(edge.source) && nextIds.has(edge.target));
  for (const node of nodes) {
    if (!node.parentId) continue;
    const oldNode = oldNodes.get(node.id);
    const previousEdge = source.edges.find((edge) => edge.target === node.id && edge.source === oldNode?.parentId);
    edges.push(previousEdge
      ? { ...previousEdge, source: node.parentId }
      : { id: createId(), source: node.parentId, target: node.id });
  }
  const originalOutline = formatMindMapOutline(source);
  const structureChanged = !originalOutline
    || nodes.length !== source.nodes.length
    || nodes.some((node, index) => node.parentId !== oldNodes.get(node.id)?.parentId || node.id !== originalOutline.lineIds[index]);
  return {
    ok: true,
    document: { ...source, nodes, edges },
    draft: { text: draft.text, lineIds, lastValidText: draft.text, lastValidLineIds: [...lineIds] },
    structureChanged,
  };
};
