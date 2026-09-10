import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { deleteNotebookRecord, isInboxNotebook, updateNotebookRecord } from "./notebook-service.ts";
import { workspaceInboxId } from "./workspace-provisioning.ts";

const actor = { actorType: "user", actorId: "usr_1" };

const createFixture = () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE notebooks (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL,
      slug TEXT, icon TEXT, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE memos (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, notebook_id TEXT NOT NULL, title TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO notebooks (id, workspace_id, name, slug, is_deleted, created_at, updated_at) VALUES
      ('ws_1_inbox', 'ws_1', '等待分类', 'inbox', 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'),
      ('nb_notes', 'ws_1', 'Notes', 'notes', 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
  `);
  return { sqlite, db: createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-notebook-service-test-unused").db };
};

describe("notebook identity", () => {
  test("recognizes legacy, workspace-scoped, and slug inbox identities", () => {
    expect(isInboxNotebook({ id: "nb_inbox", slug: "notes" }, "ws_1")).toBe(true);
    expect(isInboxNotebook({ id: workspaceInboxId("ws_1"), slug: "shou-ji-xiang" }, "ws_1")).toBe(true);
    expect(isInboxNotebook({ id: "nb_other", slug: "inbox" }, "ws_1")).toBe(true);
    expect(isInboxNotebook({ id: "nb_notes", slug: "notes" }, "ws_1")).toBe(false);
  });

  test("keeps the inbox slug when the default notebook is renamed", async () => {
    const fixture = createFixture();
    try {
      const notebook = await updateNotebookRecord(
        fixture.db,
        "ws_1",
        "ws_1_inbox",
        { name: "收集箱" },
        actor,
      );
      expect(notebook).toMatchObject({ id: "ws_1_inbox", name: "收集箱", slug: "inbox" });
    } finally {
      fixture.sqlite.close();
    }
  });

  test("migration 0046 restores renamed, deleted, and missing inbox identities", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("PRAGMA foreign_keys = ON");
      for (const file of globSync("migrations/*.sql").sort().filter((file) => file.split("/").at(-1) < "0046")) {
        sqlite.exec(readFileSync(file, "utf8"));
      }
      sqlite.exec(`
        UPDATE notebooks SET name = '收集箱', slug = 'shou-ji-xiang' WHERE id = 'nb_inbox';
        INSERT INTO workspaces (id, name) VALUES ('ws_empty', 'Empty');
        INSERT INTO workspaces (id, name) VALUES ('ws_trashed', 'Trashed inbox');
        INSERT INTO notebooks (id, workspace_id, name, slug, is_deleted, deleted_at)
        VALUES ('ws_trashed_inbox', 'ws_trashed', '等待分类', 'inbox', 1, '2026-09-10T00:00:00.000Z');
      `);
      sqlite.exec(readFileSync("migrations/0046_restore_workspace_inbox_identity.sql", "utf8"));
      expect(sqlite.query("SELECT name, slug, is_deleted FROM notebooks WHERE id = 'nb_inbox'").get()).toEqual({
        name: "收集箱",
        slug: "inbox",
        is_deleted: 0,
      });
      expect(sqlite.query("SELECT slug, is_deleted FROM notebooks WHERE id = 'ws_trashed_inbox'").get()).toEqual({
        slug: "inbox",
        is_deleted: 0,
      });
      expect(sqlite.query("SELECT name, slug FROM notebooks WHERE id = 'ws_empty_inbox'").get()).toEqual({
        name: "等待分类",
        slug: "inbox",
      });
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("rejects deleting a workspace inbox after it was renamed", async () => {
    const fixture = createFixture();
    try {
      await updateNotebookRecord(fixture.db, "ws_1", "ws_1_inbox", { name: "收集箱" }, actor);
      await expect(deleteNotebookRecord(fixture.db, "ws_1", "ws_1_inbox", actor)).rejects.toMatchObject({
        code: "bad_request",
      });
      expect(
        fixture.sqlite.query("SELECT is_deleted, slug FROM notebooks WHERE id = 'ws_1_inbox'").get(),
      ).toEqual({ is_deleted: 0, slug: "inbox" });
    } finally {
      fixture.sqlite.close();
    }
  });
});
