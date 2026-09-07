import { expect, test } from 'bun:test';
import { createDefaultDiagramDocument, getDiagramSummary, serializeDiagramDocument } from '../../../../packages/shared/src/diagram.ts';

test('list preview uses primary topics, keeps counts and does not change the document', () => {
  const diagram = createDefaultDiagramDocument('mind-map');
  const before = JSON.stringify(diagram);
  const result = getDiagramSummary(serializeDiagramDocument(diagram));
  expect(result.diagramKind).toBe('mind-map');
  expect(result.diagramPreview.nodeCount).toBe(diagram.nodes.length);
  expect(result.diagramPreview.edgeCount).toBe(diagram.edges.length);
  const roots = new Set(diagram.nodes.filter(n => !n.parentId).map(n => n.id));
  expect(result.diagramPreview.labels).toEqual([...new Set(diagram.nodes.filter(n => roots.has(n.parentId)).map(n => n.label))].slice(0, 4));
  expect(JSON.stringify(diagram)).toBe(before);
});

test('ordinary or malformed notes safely omit optional diagram metadata', () => {
  expect(getDiagramSummary('ordinary text')).toEqual({ diagramKind: null });
  expect(getDiagramSummary(null)).toEqual({ diagramKind: null });
  expect(getDiagramSummary('<!-- edgeever-diagram-v1:broken -->')).toEqual({ diagramKind: null });
});

test('preview payload is bounded and prioritizes architecture boundaries', () => {
  const diagram = createDefaultDiagramDocument('architecture');
  for (const node of diagram.nodes) node.label = '示例主题'.repeat(100);
  const preview = getDiagramSummary(serializeDiagramDocument(diagram)).diagramPreview;
  expect(preview.labels.length).toBeLessThanOrEqual(4);
  expect(preview.labels.every(label => Array.from(label).length <= 48)).toBe(true);
  expect(preview.nodeCount).toBe(diagram.nodes.length);
});
