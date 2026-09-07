import type { DiagramDocument } from "@edgeever/shared";

// Ordinary node dimensions are computed by the renderer, including font metrics.
// Only boundaries have authored dimensions. Display changes must not create edits.
export const diagramEditorSnapshot = (title: string, document: DiagramDocument) => JSON.stringify({
  title,
  document: {
    schemaVersion: document.schemaVersion,
    kind: document.kind,
    theme: document.theme ?? "brand",
    nodes: document.nodes.map((node) => ({
      id: node.id, label: node.label, x: node.x, y: node.y, shape: node.shape,
      parentId: node.parentId, resourceIcon: node.resourceIcon,
      ...(node.shape === "boundary" ? { width: node.width, height: node.height } : {}),
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id, source: edge.source, target: edge.target,
      label: edge.label, kind: edge.kind, bidirectional: edge.bidirectional,
    })),
  },
});
