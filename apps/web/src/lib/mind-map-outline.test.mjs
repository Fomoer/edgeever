import { describe, expect, test } from "bun:test";
import { createDefaultDiagramDocument } from "@edgeever/shared";
import { formatMindMapOutline, projectMindMapOutline, updateMindMapOutlineDraft } from "./mind-map-outline.ts";

const project = (document, draft) => {
  let next = 0;
  return projectMindMapOutline(document, draft, () => `new-${++next}`);
};

describe("mind map outline", () => {
  test("round trips existing labels, hierarchy, and node identities", () => {
    const document = createDefaultDiagramDocument("mind-map");
    document.nodes[0].label = "- Root\\name\nsecond line\tend ";
    const draft = formatMindMapOutline(document);
    expect(draft).not.toBeNull();
    expect(draft.text).toStartWith("# \\- Root\\\\name\\nsecond line\\tend ");
    expect(draft.text).toContain("\n- 采集想法\n  - 快速记录");
    expect(draft.text).not.toContain("\t");
    const result = project(document, draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structureChanged).toBe(false);
    expect(result.document.nodes.find((node) => node.id === "topic-root")?.label).toBe(document.nodes[0].label);
    expect(result.document.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
  });

  test("typing a label retains its node and labeled branch", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const branch = document.edges.find((edge) => edge.target === "topic-1-a");
    branch.label = "context";
    const initial = formatMindMapOutline(document);
    const edited = updateMindMapOutlineDraft(initial, initial.text.replace("快速记录", "快速记录 2"));
    const result = project(document, edited);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structureChanged).toBe(false);
    expect(result.document.nodes.find((node) => node.id === "topic-1-a")?.label).toBe("快速记录 2");
    expect(result.document.edges.find((edge) => edge.id === branch.id)).toEqual(branch);
  });

  test("pasting a renamed topic and a new topic keeps the renamed topic metadata", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const existing = document.nodes.find((node) => node.id === "topic-1-a");
    existing.width = 180;
    const initial = formatMindMapOutline(document);
    const edited = initial.text.replace("快速记录", "快速记录与整理").concat("\n- 新增主题");
    const result = project(document, updateMindMapOutlineDraft(initial, edited));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.find((node) => node.label === "快速记录与整理")).toMatchObject({
      id: "topic-1-a", width: 180,
    });
    expect(result.document.nodes.find((node) => node.label === "新增主题")?.id).toStartWith("new-");
  });

  test("pasting and reparenting topics preserves existing IDs and edge labels", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const branch = document.edges.find((edge) => edge.target === "topic-1-a");
    branch.label = "context";
    const initial = formatMindMapOutline(document);
    const lines = initial.text.split("\n");
    const moved = lines.splice(lines.findIndex((line) => line.endsWith("快速记录")), 1)[0];
    lines.splice(lines.findIndex((line) => line.endsWith("笔记本")) + 1, 0, moved, "  - 新主题");
    const result = project(document, updateMindMapOutlineDraft(initial, lines.join("\n")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structureChanged).toBe(true);
    expect(result.document.nodes.find((node) => node.id === "topic-1-a")?.parentId).toBe("topic-2");
    expect(result.document.edges.find((edge) => edge.id === branch.id)).toMatchObject({
      source: "topic-2", target: "topic-1-a", label: "context",
    });
    expect(result.document.nodes.find((node) => node.label === "新主题")?.id).toStartWith("new-");
  });

  test("rejects malformed hierarchy without changing the source", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    for (const [text, reason] of [
      ["", "empty"],
      ["# Root\n# Sibling", "root"],
      ["# Root\n  - Skipped", "depth"],
      ["# Root\n - Child", "indent"],
      ["# Root\n- X" + "x".repeat(500), "label"],
    ]) {
      const result = project(document, updateMindMapOutlineDraft(initial, text));
      expect(result).toMatchObject({ ok: false, error: { reason } });
    }
    expect(document.nodes).toHaveLength(8);
  });

  test("ignores an empty list item without changing the diagram", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    const edited = initial.text.replace("  - 跨设备同步", "  - \n  - 跨设备同步");
    const result = project(document, updateMindMapOutlineDraft(initial, edited));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structureChanged).toBe(false);
    expect(result.document.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
  });

  test("omits an emptied topic and promotes its nonempty children", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    const edited = initial.text.replace("- 采集想法", "- ");
    const result = project(document, updateMindMapOutlineDraft(initial, edited));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.some((node) => node.id === "topic-1")).toBe(false);
    expect(result.document.nodes.find((node) => node.id === "topic-1-a")?.parentId).toBe("topic-root");
    expect(result.document.nodes.find((node) => node.id === "topic-1-b")?.parentId).toBe("topic-root");
  });

  test("keeps the last valid map while the root is empty", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    const result = project(document, updateMindMapOutlineDraft(initial, initial.text.replace("# 核心主题", "# ")));
    expect(result).toMatchObject({ ok: false, error: { reason: "empty" } });
    expect(document.nodes).toHaveLength(8);
  });

  test("restores identities after an invalid intermediate paste", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const original = formatMindMapOutline(document);
    const invalid = updateMindMapOutlineDraft(original, "核心主题\n第二根");
    expect(project(document, invalid).ok).toBe(false);
    const restored = updateMindMapOutlineDraft(invalid, original.text);
    const result = project(document, restored);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
    expect(result.structureChanged).toBe(false);
  });

  test("a wholesale replacement does not silently inherit old topic identities", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    const replacement = initial.text.split("\n").map((line, index) =>
      `${line.match(/^(?:# | *- )/)?.[0] ?? ""}Replacement ${index}`,
    ).join("\n");
    const result = project(document, updateMindMapOutlineDraft(initial, replacement));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.every((node) => node.id.startsWith("new-"))).toBe(true);
  });

  test("accepts pasted Markdown lists and preserves unrelated edges", () => {
    const document = createDefaultDiagramDocument("mind-map");
    document.edges.push({ id: "extra", source: "topic-1-a", target: "topic-3-a", label: "see also" });
    const initial = formatMindMapOutline(document);
    const draft = updateMindMapOutlineDraft(initial, "# 核心主题\r\n- 采集想法\r\n  - 快速记录\r\n  - 跨设备同步\r\n- 整理结构\r\n  - 笔记本\r\n- 输出分享\r\n  - 公开链接");
    const result = project(document, draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
    expect(result.document.edges.find((edge) => edge.id === "extra")).toMatchObject({ label: "see also" });
  });

  test("still accepts the earlier plain indented outline", () => {
    const document = createDefaultDiagramDocument("mind-map");
    const initial = formatMindMapOutline(document);
    const plain = "核心主题\n\t采集想法\n\t\t快速记录\n\t\t跨设备同步\n\t整理结构\n\t\t笔记本\n\t输出分享\n\t\t公开链接";
    const result = project(document, updateMindMapOutlineDraft(initial, plain));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.map((node) => node.id).sort()).toEqual(document.nodes.map((node) => node.id).sort());
  });
});
