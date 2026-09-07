import { describe, expect, test } from "bun:test";
import { MCP_TOOLS } from "./mcp-tools";

describe("MCP tool catalog", () => {
  test("keeps tool names unique and schemas object-shaped", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
    expect(MCP_TOOLS.length).toBeGreaterThan(20);
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema).toEqual({ type: "object" });
      expect(tool.annotations.openWorldHint).toBe(false);
    }
  });

  test("marks reads and destructive writes consistently", () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

    expect(byName.get("get_memo")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(byName.get("trash_memos")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(byName.get("move_memos")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(byName.get("create_diagram_memo")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(byName.get("create_diagram_memo")?.inputSchema).toMatchObject({
      required: ["notebookId", "kind", "nodes"],
      properties: {
        kind: { enum: ["mind-map", "flowchart", "architecture"] },
        nodes: {
          minItems: 1,
          maxItems: 200,
          items: { required: ["id", "label"] },
        },
        edges: { maxItems: 400 },
        layout: { properties: { direction: { enum: ["left-to-right", "top-to-bottom"] } } },
      },
    });
    expect(byName.get("create_diagram_memo")?.inputSchema.properties.nodes.items.properties.x).toBeUndefined();
    expect(byName.get("create_diagram_memo")?.inputSchema.properties.nodes.items.properties.width).toBeUndefined();
    expect(byName.get("get_diagram")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(byName.get("get_diagram")?.inputSchema).toMatchObject({
      required: ["memoId"],
      properties: { includeLayout: { type: "boolean" } },
    });
    expect(byName.get("update_diagram")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(byName.get("update_diagram")?.inputSchema).toMatchObject({
      required: ["memoId", "expectedRevision", "operations"],
      properties: { operations: { minItems: 1, maxItems: 100 } },
    });
    expect(byName.get("rename_notebook")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(byName.get("rename_notebook")?.inputSchema).toMatchObject({
      required: ["notebookId", "name"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
      },
    });
    expect(byName.get("list_note_templates")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(byName.get("delete_note_template")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.get("restore_default_ai_instructions")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });
});
