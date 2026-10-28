import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { registerBackupRoutes } from "./backup-routes.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { createMemoRecord, getMemoDetail, mapMemoDetail } from "./memo-service.ts";
import { restoreJsonMemos, restoreJsonNotebooks } from "./backup-service.ts";
import { sha256Bytes } from "./hash-utils.ts";

const cleanups = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
const auth = { kind: "user", actorType: "user", actorId: "backup-test-user", username: "owner", displayName: "Owner", scopes: [], workspaceId: "ws_default", role: "owner" };

const installation = async () => {
  const sqlite = new Database(":memory:");
  const migrations = globSync("migrations/*.sql").sort();
  // Start with the existing schema and data, then upgrade it in place.
  for (const file of migrations.filter((file) => !file.endsWith("0080_backup_revision.sql"))) sqlite.exec(readFileSync(file, "utf8"));
  const directory = mkdtempSync(join(tmpdir(), "edgeever-backup-protocol-"));
  cleanups.push(() => { sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  const storage = createSelfHostedStorageAdapter(sqlite, directory);
  const inbox = sqlite.query("SELECT id FROM notebooks WHERE workspace_id = 'ws_default' AND slug = 'inbox'").get().id;
  const note = await createMemoRecord(storage.db, "ws_default", { notebookId: inbox, title: "Before upgrade", contentMarkdown: "original body", tags: ["backup"] }, auth, "owner");
  sqlite.exec(readFileSync("migrations/0080_backup_revision.sql", "utf8"));
  let activeAuth = auth;
  const app = new Hono();
  app.use("/api/v1/*", async (c, next) => { c.set("auth", activeAuth); await next(); });
  registerBackupRoutes(app, { clampNumber: (v, min, max) => Math.min(Math.max(Number.isFinite(v) ? v : min, min), max), getMemoDetail, mapMemoDetail, restoreJsonMemos, restoreJsonNotebooks, sha256Bytes, initiateResourceRestoreUpload: async () => { throw new Error("unused"); } });
  return {
    sqlite, storage, note, inbox,
    revision: (workspace = "ws_default") => String(sqlite.query("SELECT backup_revision FROM workspaces WHERE id = ?").get(workspace).backup_revision),
    request: (path) => app.request(path, {}, { storage }),
    setAuth: (value) => { activeAuth = value; },
  };
};

const pageUrl = (state, kind = "memos", after = "") => `/api/v1/backups/data?${new URLSearchParams({ kind, identity: state.identity, revision: state.backupRevision, after, limit: "1" })}`;

describe("consistent backup reads across a real schema upgrade", () => {
  test("keeps existing data and old export callers usable, with a separate revision", async () => {
    const db = await installation();
    expect(db.revision()).toBe("0");
    expect((await db.request("/api/v1/backups/json")).status).toBe(200);
    const response = await db.request("/api/v1/backups/state");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const state = await response.json();
    expect(state).toMatchObject({ protocolVersion: 1, userId: auth.actorId, workspaceId: "ws_default", backupRevision: "0" });
    expect(state.counts.memos).toBeGreaterThan(0);
    const page = await (await db.request(pageUrl(state))).json();
    expect(page.memos).toHaveLength(1);
    expect(typeof page.nextCursor).toBe("string");
    const ids = page.memos.map((memo) => memo.id);
    let cursor = page.nextCursor;
    while (cursor !== null) {
      const next = await (await db.request(pageUrl(state, "memos", cursor))).json();
      ids.push(...next.memos.map((memo) => memo.id));
      cursor = next.nextCursor;
    }
    expect(new Set(ids).size).toBe(state.counts.memos);
    expect(ids).toContain(db.note.id);
  });

  test("rejects stale pages after deletion instead of silently skipping notes", async () => {
    const db = await installation();
    const state = await (await db.request("/api/v1/backups/state")).json();
    expect((await db.request(pageUrl(state))).status).toBe(200);
    db.sqlite.query("UPDATE memos SET is_deleted = 1 WHERE id = ?").run(db.note.id);
    const stale = await db.request(pageUrl(state));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "backup_source_changed" } });
    expect((await db.request("/api/v1/backups/json")).status).toBe(200);
  });

  test("covers content, revisions, resources, prompts and deletions in their transaction", async () => {
    const db = await installation();
    const changes = [
      () => db.sqlite.query("UPDATE memo_contents SET content_markdown = 'changed' WHERE memo_id = ?").run(db.note.id),
      () => db.sqlite.query("INSERT INTO memo_revisions (id,memo_id,revision,content_json,content_hash,created_by) VALUES ('backup-revision',?,1,'{\"type\":\"doc\",\"content\":[]}','test','user')").run(db.note.id),
      () => db.sqlite.exec("DELETE FROM memo_revisions WHERE id = 'backup-revision'"),
      () => db.sqlite.query("INSERT INTO resources (id,memo_id,object_key,kind,byte_size) VALUES ('backup-resource',?,'backup-object','attachment',4)").run(db.note.id),
      () => db.sqlite.exec("UPDATE resources SET filename = 'changed.txt' WHERE id = 'backup-resource'"),
      () => db.sqlite.exec("DELETE FROM resources WHERE id = 'backup-resource'"),
      () => db.sqlite.exec("UPDATE ai_prompt_templates SET description = 'changed' WHERE workspace_id = 'ws_default'"),
      () => db.sqlite.query("UPDATE notebooks SET name = 'Changed inbox' WHERE id = ?").run(db.inbox),
    ];
    for (const mutate of changes) {
      const before = BigInt(db.revision());
      mutate();
      expect(BigInt(db.revision())).toBeGreaterThan(before);
    }
    const before = db.revision();
    expect(() => db.sqlite.transaction(() => { changes[0](); throw new Error("rollback"); })()).toThrow("rollback");
    expect(db.revision()).toBe(before);
    const restored = await restoreJsonMemos(db.storage.db, "ws_default", [{ memo: db.note, revisions: [], resources: [] }]);
    expect(restored).toBeUndefined();
    expect(BigInt(db.revision())).toBeGreaterThan(BigInt(before));
  });

  test("keeps workspace counters isolated and invalidates both sides of a move", async () => {
    const db = await installation();
    db.sqlite.exec("INSERT INTO workspaces (id,name) VALUES ('ws_other','Other'); INSERT INTO notebooks (id,name,workspace_id) VALUES ('nb_move','Move','ws_default');");
    expect(db.revision("ws_other")).toBe("0");
    const before = db.revision();
    db.sqlite.exec("UPDATE notebooks SET workspace_id = 'ws_other' WHERE id = 'nb_move'");
    expect(BigInt(db.revision())).toBeGreaterThan(BigInt(before));
    expect(BigInt(db.revision("ws_other"))).toBeGreaterThan(0n);
    db.setAuth({ ...auth, workspaceId: "ws_other", actorId: "other-user" });
    const state = await (await db.request("/api/v1/backups/state")).json();
    const page = await (await db.request(pageUrl(state, "notebooks"))).json();
    expect(page.notebooks.map((n) => n.id)).toEqual(["nb_move"]);
  });

  test("retains prompt and notebook permissions and rejects missing consistency context", async () => {
    const db = await installation();
    const state = await (await db.request("/api/v1/backups/state")).json();
    expect((await db.request("/api/v1/backups/data?kind=memos")).status).toBe(400);
    db.setAuth({ ...auth, kind: "agent", scopes: ["read:memos", "read:resources"] });
    expect((await db.request(pageUrl(state, "prompts"))).status).toBe(403);
    expect((await db.request(pageUrl(state, "notebooks"))).status).toBe(403);
    expect((await db.request("/api/v1/backups/json")).status).toBe(200);
  });
});
