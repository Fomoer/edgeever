import { describe, expect, test } from "bun:test";
import { createDefaultDiagramDocument, diagramDocumentToMermaid, diagramFallbackMarkdown, hasDiagramDocumentMarker, parseDiagramDocument, serializeDiagramDocument, stripDiagramDocumentMarker } from "./diagram.ts";
import { diagramDocumentToX6Cells } from "./diagram-view.ts";
import { markdownToDoc } from "./content.ts";

describe("diagram document", () => {
  test("round-trips unicode labels through the Markdown compatibility envelope", () => {
    const document = createDefaultDiagramDocument("mind-map");
    document.nodes[0].label = "产品路线图 🚀";
    document.theme = "ocean";
    expect(parseDiagramDocument(serializeDiagramDocument(document))).toEqual(document);
  });

  test("parses the envelope without browser base64 and text codec globals", () => {
    const originalAtob = globalThis.atob;
    const originalBtoa = globalThis.btoa;
    const originalTextDecoder = globalThis.TextDecoder;
    const originalTextEncoder = globalThis.TextEncoder;
    try {
      globalThis.atob = undefined;
      globalThis.btoa = undefined;
      globalThis.TextDecoder = undefined;
      globalThis.TextEncoder = undefined;
      const document = createDefaultDiagramDocument("mind-map");
      document.nodes[0].label = "核心主题";
      expect(parseDiagramDocument(serializeDiagramDocument(document))).toEqual(document);
    } finally {
      globalThis.atob = originalAtob;
      globalThis.btoa = originalBtoa;
      globalThis.TextDecoder = originalTextDecoder;
      globalThis.TextEncoder = originalTextEncoder;
    }
  });

  test("accepts wrapped metadata and strips invalid envelopes from visible content", () => {
    const serialized = serializeDiagramDocument(createDefaultDiagramDocument("mind-map"));
    const wrapped = serialized.replace(
      /(edgeever-diagram-v1:)([A-Za-z0-9_-]+)/,
      (_match, prefix, payload) => `${prefix}${payload.match(/.{1,48}/g).join("\n")}`,
    );
    expect(parseDiagramDocument(wrapped)?.kind).toBe("mind-map");

    const invalid = `${diagramFallbackMarkdown(createDefaultDiagramDocument("flowchart"))}\n\n<!-- edgeever-diagram-v1:not-json -->`;
    expect(hasDiagramDocumentMarker(invalid)).toBe(true);
    expect(parseDiagramDocument(invalid)).toBeNull();
    expect(stripDiagramDocumentMarker(invalid)).not.toContain("edgeever-diagram-v1");
    expect(stripDiagramDocumentMarker(invalid)).toContain("```mermaid");
  });

  test("persists a Mermaid fallback that native app viewers can render", () => {
    const markdown = serializeDiagramDocument(createDefaultDiagramDocument("flowchart"));
    expect(markdown).toContain("# 流程图");
    expect(markdown).toContain("```mermaid\nflowchart TD");
    expect(markdown).toContain('n1["处理步骤"]');

    const doc = markdownToDoc(markdown);
    expect(doc.content?.some((node) => node.type === "codeBlock" && node.attrs?.language === "mermaid")).toBe(true);
  });

  test("projects native viewers into the same branded X6 palette", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const light = diagramDocumentToX6Cells(document, "light");
    expect(light.canvas).toBe("#F8FAF9");
    expect(light.nodes[0].attrs.body.fill).toBe("#16A06E");
    expect(light.nodes[1].attrs.body.fill).toBe("#F0F8F4");
    expect(light.edges[0].attrs.line.stroke).toBe("#55B891");
    expect(light.edges[0].attrs.line.targetMarker).toBeNull();

    const dark = diagramDocumentToX6Cells(document, "dark");
    expect(dark.canvas).toBe("#101311");
    expect(dark.nodes[1].attrs.body.fill).toBe("#18211D");
  });

  test("escapes labels and emits the mind-map hierarchy as a portable flowchart", () => {
    const document = createDefaultDiagramDocument("mind-map");
    document.nodes[0].label = '核心 <主题> "A&B"';
    const source = diagramDocumentToMermaid(document);
    expect(source).toContain("flowchart LR");
    expect(source).toContain("核心 &lt;主题&gt; &quot;A&amp;B&quot;");
    expect(source).toContain("n0 --> n1");
  });

  test("round-trips architecture components, boundaries, and semantic connections", () => {
    const document = createDefaultDiagramDocument("architecture");
    document.nodes.find((node) => node.id === "api").resourceIcon = "container";
    const parsed = parseDiagramDocument(serializeDiagramDocument(document));
    expect(parsed).toEqual(document);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.nodes.find((node) => node.id === "api").parentId).toBe("system");
    expect(parsed.edges.find((edge) => edge.id === "request").kind).toBe("request");
    expect(diagramFallbackMarkdown(document)).toContain("# 架构图");
    const fallback = diagramDocumentToMermaid(document);
    expect(fallback).toContain('subgraph n0["应用系统"]');
    expect(fallback).toContain('shape: display, label: "Web 客户端"');
    expect(fallback).toContain('shape: st-rect, label: "API 服务"');
    expect(fallback).toContain('shape: cyl, label: "数据库"');
    expect(fallback).toContain('shape: disk, label: "对象存储"');
    expect(fallback).toContain("classDef archDatabase");
  });

  test("keeps legacy architecture nodes valid and projects resource-specific icons", () => {
    const legacy = createDefaultDiagramDocument("architecture");
    expect(legacy.nodes.every((node) => node.resourceIcon === undefined)).toBe(true);
    expect(parseDiagramDocument(serializeDiagramDocument(legacy))).toEqual(legacy);

    const container = legacy.nodes.find((node) => node.id === "api");
    const database = legacy.nodes.find((node) => node.id === "database");
    container.resourceIcon = "container";
    database.resourceIcon = "noSqlDatabase";
    const projected = diagramDocumentToX6Cells(legacy, "light");
    const containerCell = projected.nodes.find((node) => node.id === "api");
    const databaseCell = projected.nodes.find((node) => node.id === "database");
    expect(containerCell.attrs.resourceIcon.text).toBe("⬡");
    expect(databaseCell.attrs.resourceIcon.text).toBe("ϟ");
    expect(containerCell.attrs.resourceIcon.text).not.toBe(databaseCell.attrs.resourceIcon.text);
  });

  test("rejects malformed and dangling graph data", () => {
    expect(parseDiagramDocument("ordinary note")).toBeNull();
    const document = createDefaultDiagramDocument("flowchart");
    document.nodes = document.nodes.slice(0, 1);
    expect(parseDiagramDocument(serializeDiagramDocument(document))).toBeNull();

    const mindMap = createDefaultDiagramDocument("mind-map");
    mindMap.nodes[1].parentId = "missing-parent";
    expect(parseDiagramDocument(serializeDiagramDocument(mindMap))).toBeNull();

    const invalidTheme = createDefaultDiagramDocument("mind-map");
    invalidTheme.theme = "neon";
    expect(parseDiagramDocument(serializeDiagramDocument(invalidTheme))).toBeNull();

    const architecture = createDefaultDiagramDocument("architecture");
    architecture.nodes.find((node) => node.id === "api").parentId = "database";
    expect(parseDiagramDocument(serializeDiagramDocument(architecture))).toBeNull();
  });
});

test('native flowchart projection shares label sizing and obstacle routing without mutating content', () => {
  const document = createDefaultDiagramDocument('flowchart');
  document.nodes[1].label = 'Transformer 前向计算\n因果注意力以及前馈网络'.repeat(4);
  const original = structuredClone(document);
  const projection = diagramDocumentToX6Cells(document, 'dark');
  expect(projection.nodes[1].height).toBeGreaterThan(document.nodes[1].height);
  expect(projection.nodes[1].attrs.label.text.replaceAll('\n', '')).toBe(document.nodes[1].label.replaceAll('\n', ''));
  expect(projection.edges[0].router.name).toBe('manhattan');
  expect(document).toEqual(original);
});
