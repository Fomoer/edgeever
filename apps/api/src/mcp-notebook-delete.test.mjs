import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { callMcpTool } from "./index.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { MCP_TOOLS } from "./mcp-tools.ts";

const fixture = () => {
  const sqlite = new Database(":memory:");
  for (const path of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(path, "utf8"));
  sqlite.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws_delete', 'Delete test'), ('ws_other', 'Other');
    INSERT INTO notebooks (id, workspace_id, parent_id, name) VALUES
      ('parent', 'ws_delete', NULL, 'Imports'), ('child', 'ws_delete', 'parent', 'Flomo'),
      ('other', 'ws_other', NULL, 'Other'), ('ws_delete_inbox', 'ws_delete', NULL, 'Renamed inbox');
    UPDATE notebooks SET slug = 'inbox' WHERE id = 'ws_delete_inbox';
  `);
  const auth = { kind: "agent", actorType: "agent", actorId: "tok_delete", username: "agent",
    displayName: null, scopes: ["read:notebooks", "write:notebooks"], workspaceId: "ws_delete", role: "member" };
  const db = createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-mcp-delete-unused").db;
  const context = { env: { storage: { db } }, get: key => key === "auth" ? auth : undefined };
  const call = args => callMcpTool(context, auth, "delete_notebook", args);
  return { sqlite, auth, db, context, call };
};

const auditCount = sqlite => sqlite.query("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'notebook.delete'").get().count;
const insertNote = sqlite => sqlite.exec("INSERT INTO memos (id, workspace_id, notebook_id, title) VALUES ('note', 'ws_delete', 'child', 'Keep')");

describe("MCP empty notebook deletion", () => {
  test("advertises a destructive, idempotent tool with explicit ID and preview", () => {
    const tool = MCP_TOOLS.find(tool => tool.name === "delete_notebook");
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    expect(tool.inputSchema.required).toEqual(["notebookId"]);
    expect(tool.inputSchema.properties.dryRun.type).toBe("boolean");
  });

  test("resolves paths, previews without writes, deletes the empty subtree and retries safely", async () => {
    const f = fixture();
    try {
      const resolved = await callMcpTool(f.context, f.auth, "resolve_notebook_path", { path: "Imports" });
      const args = { notebookId: resolved.notebook.id };
      expect(await f.call({ ...args, dryRun: true })).toMatchObject({ dryRun: true, deleted: false, notebookCount: 2 });
      expect(auditCount(f.sqlite)).toBe(0);
      expect(f.sqlite.query("SELECT is_deleted FROM notebooks WHERE id = 'parent'").get().is_deleted).toBe(0);
      const result = await f.call(args);
      expect(result).toMatchObject({ deleted: true, dryRun: false, notebookCount: 2 });
      expect(result.notebookIds.sort()).toEqual(["child", "parent"]);
      expect(f.sqlite.query("SELECT id FROM notebooks WHERE workspace_id = 'ws_delete' AND is_deleted = 1 ORDER BY id").all()).toEqual([{ id: "child" }, { id: "parent" }]);
      expect(auditCount(f.sqlite)).toBe(1);
      expect(await f.call(args)).toMatchObject({ deleted: true, notebookCount: 0 });
      expect(auditCount(f.sqlite)).toBe(1);
    } finally { f.sqlite.close(); }
  });

  test("rejects notes anywhere in the subtree for preview and execution, but preserves trashed notes", async () => {
    const f = fixture();
    try {
      insertNote(f.sqlite);
      for (const dryRun of [true, false]) await expect(f.call({ notebookId: "parent", dryRun })).rejects.toMatchObject({ code: "notebook_not_empty" });
      expect(auditCount(f.sqlite)).toBe(0);
      f.sqlite.exec("UPDATE memos SET is_deleted = 1 WHERE id = 'note'");
      await f.call({ notebookId: "parent" });
      expect(f.sqlite.query("SELECT notebook_id, is_deleted FROM memos WHERE id = 'note'").get()).toEqual({ notebook_id: "child", is_deleted: 1 });
    } finally { f.sqlite.close(); }
  });

  test("protects inboxes, workspace isolation and write permissions", async () => {
    const f = fixture();
    try {
      for (const notebookId of ["other", "missing"]) await expect(f.call({ notebookId })).rejects.toMatchObject({ code: "not_found" });
      await expect(f.call({ notebookId: "ws_delete_inbox" })).rejects.toMatchObject({ code: "bad_request" });
      f.auth.scopes = ["read:notebooks"];
      for (const dryRun of [true, false]) await expect(f.call({ notebookId: "parent", dryRun })).rejects.toMatchObject({ code: "forbidden" });
      expect(auditCount(f.sqlite)).toBe(0);
    } finally { f.sqlite.close(); }
  });

  test("does not guess an ambiguous path or accept a truthy preview value", async () => {
    const f = fixture();
    try {
      f.sqlite.exec("INSERT INTO notebooks (id, workspace_id, name) VALUES ('duplicate', 'ws_delete', 'Imports')");
      expect(await callMcpTool(f.context, f.auth, "resolve_notebook_path", { path: "Imports" })).toMatchObject({ resolved: false, reason: "ambiguous" });
      await expect(f.call({ notebookId: "parent", dryRun: "true" })).rejects.toMatchObject({ code: "invalid_params" });
      await expect(f.call({ notebookId: "parent", recursive: true })).rejects.toMatchObject({ code: "invalid_params" });
      await expect(f.call({ notebookId: "" })).rejects.toMatchObject({ code: "invalid_params" });
      expect(auditCount(f.sqlite)).toBe(0);
    } finally { f.sqlite.close(); }
  });

  test.each(["note", "child", "move", "delete"])("rejects a concurrent %s change without partial deletion or audit", async change => {
    const f = fixture();
    try {
      f.context.env.storage.db = { prepare: sql => f.db.prepare(sql), batch: async statements => {
        if (change === "note") insertNote(f.sqlite);
        if (change === "child") f.sqlite.exec("INSERT INTO notebooks (id, workspace_id, parent_id, name) VALUES ('new', 'ws_delete', 'child', 'New')");
        if (change === "move") f.sqlite.exec("UPDATE notebooks SET parent_id = NULL WHERE id = 'child'");
        if (change === "delete") f.sqlite.exec("UPDATE notebooks SET is_deleted = 1 WHERE id = 'child'");
        return f.db.batch(statements);
      } };
      await expect(f.call({ notebookId: "parent" })).rejects.toMatchObject({ code: "notebook_changed" });
      expect(f.sqlite.query("SELECT is_deleted FROM notebooks WHERE id = 'parent'").get().is_deleted).toBe(0);
      expect(auditCount(f.sqlite)).toBe(0);
    } finally { f.sqlite.close(); }
  });

  test("deletes a large empty subtree without exceeding SQL binding limits", async () => {
    const f = fixture();
    try {
      const insert = f.sqlite.query("INSERT INTO notebooks (id, workspace_id, parent_id, name) VALUES (?, 'ws_delete', 'child', ?)");
      for (let i = 0; i < 150; i++) insert.run(`leaf_${i}`, `Leaf ${i}`);
      expect(await f.call({ notebookId: "parent" })).toMatchObject({ notebookCount: 152, deleted: true });
      expect(auditCount(f.sqlite)).toBe(1);
    } finally { f.sqlite.close(); }
  });

  test("rolls back the deletion if writing the audit fails", async () => {
    const f = fixture();
    try {
      f.sqlite.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
      await expect(f.call({ notebookId: "parent" })).rejects.toThrow("audit unavailable");
      expect(f.sqlite.query("SELECT COUNT(*) AS count FROM notebooks WHERE workspace_id = 'ws_delete' AND is_deleted = 1").get().count).toBe(0);
    } finally { f.sqlite.close(); }
  });
});
