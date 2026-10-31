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

  test("counts the source only for snapshots, never for each backup page", async () => {
    const db = await installation();
    const queries = [];
    const prepare = db.storage.db.prepare.bind(db.storage.db);
    db.storage.db.prepare = (sql) => { queries.push(sql); return prepare(sql); };
    const state = await (await db.request("/api/v1/backups/state")).json();
    const isFullCount = (sql) => /COUNT\s*\(/i.test(sql) && /backup_revision/.test(sql);
    expect(queries.filter(isFullCount)).toHaveLength(1);
    queries.length = 0;
    for (const kind of ["memos", "notebooks", "prompts"]) {
      let after = "";
      let count = 0;
      do {
        const response = await db.request(pageUrl(state, kind, after));
        expect(response.status).toBe(200);
        const page = await response.json();
        count += page[kind].length;
        after = page.nextCursor;
      } while (after !== null);
      expect(count).toBe(state.counts[kind]);
    }
    expect(queries.filter(isFullCount)).toHaveLength(0);
    const final = await (await db.request("/api/v1/backups/state")).json();
    expect(final).toEqual(state);
    expect(queries.filter(isFullCount)).toHaveLength(1);
  });

  for (const endpoint of ["backups/json", "exports/markdown"]) test(`${endpoint} can traverse continuation pages without recounting or leaking lookahead resources`, async () => {
    const db = await installation();
    const memos = db.sqlite.query("SELECT id FROM memos WHERE workspace_id = 'ws_default' AND is_deleted = 0 ORDER BY created_at, id").all();
    for (const [index, memo] of memos.entries()) {
      db.sqlite.query("INSERT INTO resources (id,memo_id,object_key,kind,byte_size) VALUES (?,?,?,'attachment',4)").run(`resource-${index}`, memo.id, `object-${index}`);
    }
    const queries = [];
    const prepare = db.storage.db.prepare.bind(db.storage.db);
    db.storage.db.prepare = (sql) => { queries.push(sql); return prepare(sql); };
    let offset = 0;
    const ids = [];
    const resourceIds = [];
    do {
      const response = await db.request(`/api/v1/${endpoint}?limit=1&offset=${offset}&includeTotal=0`);
      expect(response.status).toBe(200);
      const page = await response.json();
      if (offset === 0) expect(page.totalCount).toBe(memos.length);
      else expect(page.totalCount).toBeUndefined();
      expect(page.memos).toHaveLength(1);
      expect(page.resources.every((resource) => resource.memoId === page.memos[0].id)).toBe(true);
      ids.push(...page.memos.map((memo) => memo.id));
      resourceIds.push(...page.resources.map((resource) => resource.id));
      offset = page.nextOffset;
    } while (offset !== null);
    expect(ids).toEqual(memos.map((memo) => memo.id));
    expect(new Set(resourceIds).size).toBe(memos.length);
    expect(queries.filter((sql) => /COUNT\s*\(/i.test(sql))).toHaveLength(1);
    const legacy = await (await db.request(`/api/v1/${endpoint}?limit=1&offset=1`)).json();
    expect(legacy.totalCount).toBe(memos.length);
  });

  for (const change of ["revision", "identity"]) test(`rejects a ${change} change while assembling a page`, async () => {
    const db = await installation();
    const state = await (await db.request("/api/v1/backups/state")).json();
    const prepare = db.storage.db.prepare.bind(db.storage.db);
    let checks = 0;
    db.storage.db.prepare = (sql) => {
      const statement = prepare(sql);
      if (!/FROM workspaces/.test(sql)) return statement;
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values);
        const first = bound.first.bind(bound);
        bound.first = async (...args) => {
          if (++checks === 2) {
            if (change === "revision") db.sqlite.query("UPDATE memo_contents SET content_markdown = 'Changed during read' WHERE memo_id = ?").run(db.note.id);
            else db.sqlite.exec("UPDATE workspaces SET created_at = 'replacement-instance' WHERE id = 'ws_default'");
          }
          return first(...args);
        };
        return bound;
      };
      return statement;
    };
    const response = await db.request(pageUrl(state));
    expect(checks).toBe(2);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "backup_source_changed" } });
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
