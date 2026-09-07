import { describe, expect, test } from "bun:test";
import { globSync, readFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { callMcpTool } from "./index.ts";
import { parseDiagramDocument } from "@edgeever/shared";

class SqliteD1PreparedStatement {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteD1PreparedStatement(this.db, this.sql, bindings);
  }

  async all() {
    return { results: this.db.query(this.sql).all(...this.bindings), success: true, meta: {} };
  }

  async first() {
    return this.db.query(this.sql).get(...this.bindings) ?? null;
  }

  async run() {
    this.db.query(this.sql).run(...this.bindings);
    return { success: true, meta: {} };
  }
}

class SqliteD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.db, sql);
  }

  async batch(statements) {
    return this.db.transaction(() => statements.map((statement) =>
      this.db.query(statement.sql).run(...statement.bindings)))();
  }
}

const createFixture = (scopes = ["read:memos", "write:memos"]) => {
  const sqlite = new Database(":memory:");
  for (const migration of globSync("migrations/*.sql").sort()) {
    sqlite.exec(readFileSync(migration, "utf8"));
  }
  sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)")
    .run("ws_mcp", "MCP workspace");
  sqlite.query("INSERT INTO workspaces (id, name, is_personal) VALUES (?, ?, 1)")
    .run("ws_other", "Other workspace");

  const auth = {
    kind: "agent",
    actorType: "agent",
    actorId: "tok_mcp",
    username: "mcp-agent",
    displayName: null,
    scopes,
    workspaceId: "ws_mcp",
    role: "member",
  };
  const context = {
    env: { storage: { db: new SqliteD1Database(sqlite), resources: {} } },
    get: (key) => key === "auth" ? auth : undefined,
  };
  return { sqlite, auth, context };
};

describe("MCP template and AI instruction management", () => {
  test.each([
    ["mind-map", [
      { id: "root", label: "Root" },
      { id: "branch", label: "Branch", parentId: "root" },
    ], []],
    ["flowchart", [
      { id: "start", label: "Start", type: "start" },
      { id: "pay", label: "Pay", type: "process" },
    ], [{ source: "start", target: "pay", label: "Continue" }]],
    ["architecture", [
      { id: "system", label: "System", type: "boundary" },
      { id: "api", label: "API", type: "service", parentId: "system" },
    ], []],
  ])("creates editable %s diagram memos from structured graphs", async (kind, nodes, edges) => {
    const { sqlite, auth, context } = createFixture();
    sqlite.query("INSERT INTO notebooks (id, workspace_id, name) VALUES (?, ?, ?)")
      .run("nb_diagrams", "ws_mcp", "Diagrams");

    const created = await callMcpTool(context, auth, "create_diagram_memo", {
      notebookId: "nb_diagrams",
      title: "Generated diagram",
      kind,
      theme: "brand",
      tags: ["design"],
      nodes,
      edges,
    });

    expect(created).toMatchObject({ diagramKind: kind, memo: { title: "Generated diagram", tags: ["design"] } });
    expect(JSON.stringify(created.memo)).not.toContain("edgeever-diagram-v1");
    expect(created.diagram.nodes[0].layout).toBeUndefined();
    const stored = sqlite.query("SELECT content_markdown FROM memo_contents WHERE memo_id = ?").get(created.memo.id);
    const diagram = parseDiagramDocument(stored.content_markdown);
    expect(diagram).toMatchObject({ kind, theme: "brand" });
    expect(diagram.nodes.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
    expect(diagram.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBeTrue();
    expect(diagram.nodes.every((node) => node.width > 0 && node.height > 0)).toBeTrue();
    if (kind === "mind-map") expect(diagram.edges).toHaveLength(1);
    if (kind === "flowchart") {
      expect(diagram.edges).toMatchObject([{ id: "edge-1", source: "start", target: "pay" }]);
      expect(diagram.nodes.find((node) => node.id === "start").y)
        .toBeLessThan(diagram.nodes.find((node) => node.id === "pay").y);
    }
    if (kind === "architecture") {
      const boundary = diagram.nodes.find((node) => node.id === "system");
      const api = diagram.nodes.find((node) => node.id === "api");
      expect(boundary.x).toBeLessThan(api.x);
      expect(boundary.y).toBeLessThan(api.y);
      expect(boundary.x + boundary.width).toBeGreaterThan(api.x + api.width);
    }
  });

  test("rejects invalid diagram graphs before creating a memo", async () => {
    const { auth, context } = createFixture();
    await expect(callMcpTool(context, auth, "create_diagram_memo", {
      notebookId: "nb_diagrams",
      kind: "mind-map",
      nodes: [{ id: "root", label: "Root", type: "database" }],
      edges: [],
    })).rejects.toMatchObject({ code: "invalid_params" });
  });

  test("reads semantic diagrams without layout by default and applies revision-safe operations", async () => {
    const { sqlite, auth, context } = createFixture();
    sqlite.query("INSERT INTO notebooks (id, workspace_id, name) VALUES (?, ?, ?)")
      .run("nb_diagrams", "ws_mcp", "Diagrams");
    const created = await callMcpTool(context, auth, "create_diagram_memo", {
      notebookId: "nb_diagrams",
      title: "Architecture",
      kind: "architecture",
      nodes: [
        { id: "system", label: "System", type: "boundary" },
        { id: "api", label: "API", type: "service", parentId: "system" },
        { id: "database", label: "Database", type: "database", parentId: "system" },
      ],
      edges: [{ source: "api", target: "database", type: "data" }],
    });

    const semantic = await callMcpTool(context, auth, "get_diagram", { memoId: created.memo.id });
    expect(semantic.diagram.nodes[0].layout).toBeUndefined();
    expect(JSON.stringify(semantic)).not.toContain("edgeever-diagram-v1");
    const genericMemo = await callMcpTool(context, auth, "get_memo", { memoId: created.memo.id });
    expect(genericMemo.diagram.nodes[0].layout).toBeUndefined();
    expect(JSON.stringify(genericMemo)).not.toContain("edgeever-diagram-v1");
    const withLayout = await callMcpTool(context, auth, "get_diagram", { memoId: created.memo.id, includeLayout: true });
    const apiLayout = withLayout.diagram.nodes.find((node) => node.id === "api").layout;
    expect(apiLayout).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) });

    const operations = [
      { op: "add_node", node: { id: "redis", label: "Redis", type: "database", parentId: "system", resourceIcon: "cache" } },
      { op: "add_edge", edge: { source: "api", target: "redis", type: "data", label: "cache" } },
    ];
    const preview = await callMcpTool(context, auth, "update_diagram", {
      memoId: created.memo.id,
      expectedRevision: semantic.memo.revision,
      operations,
      dryRun: true,
    });
    expect(preview).toMatchObject({ dryRun: true, changes: { addedNodes: 1, addedEdges: 1 } });
    expect((await callMcpTool(context, auth, "get_diagram", { memoId: created.memo.id })).diagram.nodes)
      .toHaveLength(3);

    const updated = await callMcpTool(context, auth, "update_diagram", {
      memoId: created.memo.id,
      expectedRevision: semantic.memo.revision,
      operations,
    });
    expect(updated.memo.revision).toBe(semantic.memo.revision + 1);
    expect(updated.diagram.nodes.find((node) => node.id === "redis")).toMatchObject({ type: "database", parentId: "system" });
    const afterLayout = await callMcpTool(context, auth, "get_diagram", { memoId: created.memo.id, includeLayout: true });
    expect(afterLayout.diagram.nodes.find((node) => node.id === "api").layout).toEqual(apiLayout);

    await expect(callMcpTool(context, auth, "update_diagram", {
      memoId: created.memo.id,
      expectedRevision: semantic.memo.revision,
      operations: [{ op: "remove_node", nodeId: "redis" }],
    })).rejects.toMatchObject({ code: "revision_conflict", status: 409 });
    await expect(callMcpTool(context, auth, "update_memo", {
      memoId: created.memo.id,
      contentMarkdown: "plain text",
    })).rejects.toMatchObject({ code: "diagram_update_required" });

    const stored = sqlite.query("SELECT content_markdown FROM memo_contents WHERE memo_id = ?").get(created.memo.id);
    expect(parseDiagramDocument(stored.content_markdown).nodes.map((node) => node.id)).toContain("redis");
  });

  test("keeps mind-map hierarchy edges consistent when a node is reparented", async () => {
    const { sqlite, auth, context } = createFixture();
    sqlite.query("INSERT INTO notebooks (id, workspace_id, name) VALUES (?, ?, ?)")
      .run("nb_diagrams", "ws_mcp", "Diagrams");
    const created = await callMcpTool(context, auth, "create_diagram_memo", {
      notebookId: "nb_diagrams",
      kind: "mind-map",
      nodes: [
        { id: "root", label: "Root" },
        { id: "left", label: "Left", parentId: "root" },
        { id: "leaf", label: "Leaf", parentId: "left" },
      ],
    });
    const updated = await callMcpTool(context, auth, "update_diagram", {
      memoId: created.memo.id,
      expectedRevision: created.memo.revision,
      operations: [{ op: "update_node", nodeId: "leaf", changes: { parentId: "root" } }],
    });
    expect(updated.diagram.nodes.find((node) => node.id === "leaf").parentId).toBe("root");
    expect(updated.diagram.edges.filter((edge) => edge.target === "leaf")).toMatchObject([
      { source: "root", target: "leaf" },
    ]);
  });

  test("manages note templates within the authenticated workspace", async () => {
    const { sqlite, auth, context } = createFixture();

    const created = await callMcpTool(context, auth, "create_note_template", {
      name: "Weekly review",
      description: "Reusable weekly structure",
      title: "Week of",
      contentMarkdown: "## Progress\n\n- ",
      tags: ["weekly"],
    });
    expect(created.template).toMatchObject({
      name: "Weekly review",
      contentMarkdown: "## Progress\n\n- ",
      tags: ["weekly"],
    });

    sqlite.query(
      `INSERT INTO memo_templates (
         id, workspace_id, name, description, title, content_json, content_markdown, tags_json, created_at, updated_at
       ) VALUES ('template_other', 'ws_other', 'Hidden', NULL, NULL, '{"type":"doc","content":[]}', '', '[]', ?, ?)`,
    ).run(new Date().toISOString(), new Date().toISOString());

    const listed = await callMcpTool(context, auth, "list_note_templates", {});
    expect(listed.templates.map((template) => template.id)).toEqual([created.template.id]);

    const updated = await callMcpTool(context, auth, "update_note_template", {
      templateId: created.template.id,
      name: "Updated weekly review",
      contentMarkdown: "## Outcomes",
    });
    expect(updated.template).toMatchObject({ name: "Updated weekly review", contentMarkdown: "## Outcomes" });

    await expect(callMcpTool(context, auth, "get_note_template", { templateId: "template_other" }))
      .rejects.toMatchObject({ code: "not_found" });
    await expect(callMcpTool(context, auth, "update_note_template", { templateId: created.template.id }))
      .rejects.toMatchObject({ code: "invalid_params" });

    expect(await callMcpTool(context, auth, "delete_note_template", { templateId: created.template.id }))
      .toEqual({ ok: true });
    expect((await callMcpTool(context, auth, "list_note_templates", {})).templates).toEqual([]);
  });

  test("manages custom AI instructions and restores built-ins", async () => {
    const { auth, context } = createFixture();

    const created = await callMcpTool(context, auth, "create_ai_instruction", {
      name: "Decision log",
      description: "Extract decisions",
      instruction: "Return decisions and owners as a Markdown list.",
      resultMode: "append",
    });
    expect(created.instruction).toMatchObject({
      origin: "custom",
      name: "Decision log",
      parameterKind: "none",
      resultMode: "append",
    });

    const updated = await callMcpTool(context, auth, "update_ai_instruction", {
      instructionId: created.instruction.id,
      instruction: "Return decisions, owners, and due dates.",
      parameterKind: "tone",
    });
    expect(updated.instruction).toMatchObject({
      instruction: "Return decisions, owners, and due dates.",
      parameterKind: "tone",
    });

    const restored = await callMcpTool(context, auth, "restore_default_ai_instructions", { locale: "zh-CN" });
    expect(restored.restoredCount).toBeGreaterThan(0);
    expect(restored.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: "default" }),
      expect.objectContaining({ id: created.instruction.id }),
    ]));

    expect(await callMcpTool(context, auth, "delete_ai_instruction", { instructionId: created.instruction.id }))
      .toEqual({ ok: true });
    await expect(callMcpTool(context, auth, "get_ai_instruction", { instructionId: created.instruction.id }))
      .rejects.toMatchObject({ code: "not_found" });
  });

  test("enforces memo scopes and demo-mode mutation protection", async () => {
    const readOnly = createFixture(["read:memos"]);
    await expect(callMcpTool(readOnly.context, readOnly.auth, "create_note_template", {
      name: "Denied",
      contentMarkdown: "No",
    })).rejects.toMatchObject({ code: "forbidden" });

    const writeOnly = createFixture(["write:memos"]);
    await expect(callMcpTool(writeOnly.context, writeOnly.auth, "list_ai_instructions", {}))
      .rejects.toMatchObject({ code: "forbidden" });

    const demo = createFixture();
    demo.context.env.EDGE_EVER_DEMO_MODE = "true";
    await expect(callMcpTool(demo.context, demo.auth, "create_ai_instruction", {
      name: "Denied",
      instruction: "No",
    })).rejects.toMatchObject({ code: "forbidden" });
  });
});
