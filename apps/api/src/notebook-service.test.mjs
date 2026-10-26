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
      slug TEXT, icon TEXT, color TEXT, text_color TEXT, color_target TEXT NOT NULL DEFAULT 'icon', is_bold INTEGER NOT NULL DEFAULT 0, icon_inverted INTEGER NOT NULL DEFAULT 0, row_inverted INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
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

  test("migration 0053 collapses a second inbox created beside a historical slug inbox", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("PRAGMA foreign_keys = ON");
      for (const file of globSync("migrations/*.sql").sort().filter((file) => file.split("/").at(-1) < "0046")) {
        sqlite.exec(readFileSync(file, "utf8"));
      }
      sqlite.exec(`
        INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, sort_order)
        VALUES (
          'nb_7f802977e3cc4e8eb30ef3665955ed39',
          'ws_default',
          NULL,
          '等待分类',
          'inbox',
          'notebook',
          '#0f766e',
          10
        );
        UPDATE memos SET notebook_id = 'nb_7f802977e3cc4e8eb30ef3665955ed39' WHERE notebook_id = 'nb_inbox';
        DELETE FROM notebooks WHERE id = 'nb_inbox';
        INSERT INTO memos (id, workspace_id, notebook_id, title, excerpt)
        VALUES (
          'memo_historical_inbox',
          'ws_default',
          'nb_7f802977e3cc4e8eb30ef3665955ed39',
          'Kept',
          'kept'
        );
      `);
      sqlite.exec(readFileSync("migrations/0046_restore_workspace_inbox_identity.sql", "utf8"));
      expect(
        sqlite.query(`
          SELECT id, is_deleted FROM notebooks
          WHERE workspace_id = 'ws_default'
            AND (slug = 'inbox' OR id = 'nb_inbox' OR id = workspace_id || '_inbox')
          ORDER BY id
        `).all(),
      ).toEqual([
        { id: "nb_7f802977e3cc4e8eb30ef3665955ed39", is_deleted: 0 },
        { id: "ws_default_inbox", is_deleted: 0 },
      ]);

      sqlite.exec(readFileSync("migrations/0053_collapse_duplicate_inbox_notebooks.sql", "utf8"));
      sqlite.exec(readFileSync("migrations/0053_collapse_duplicate_inbox_notebooks.sql", "utf8"));

      expect(
        sqlite.query(`
          SELECT id, is_deleted FROM notebooks
          WHERE workspace_id = 'ws_default'
            AND (slug = 'inbox' OR id = 'nb_inbox' OR id = workspace_id || '_inbox')
          ORDER BY is_deleted, id
        `).all(),
      ).toEqual([
        { id: "nb_7f802977e3cc4e8eb30ef3665955ed39", is_deleted: 0 },
        { id: "ws_default_inbox", is_deleted: 1 },
      ]);
      expect(
        sqlite.query(`
          SELECT notebook_id, COUNT(*) AS count
          FROM memos
          WHERE workspace_id = 'ws_default' AND is_deleted = 0
          GROUP BY notebook_id
        `).all(),
      ).toEqual([
        { notebook_id: "nb_7f802977e3cc4e8eb30ef3665955ed39", count: 2 },
      ]);
      expect(sqlite.query("SELECT COUNT(*) AS count FROM notebooks WHERE is_deleted = 0 AND slug = 'inbox'").get()).toEqual({
        count: 1,
      });
      expect(
        sqlite.query(`
          SELECT name FROM sqlite_master
          WHERE type = 'index' AND name = 'idx_notebooks_one_active_inbox'
        `).get(),
      ).toEqual({ name: "idx_notebooks_one_active_inbox" });
      expect(() => sqlite.exec(`
        INSERT INTO notebooks (id, workspace_id, name, slug)
        VALUES ('nb_second_inbox', 'ws_default', '等待分类', 'inbox')
      `)).toThrow(/unique/i);
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("migration 0053 moves notes off the empty duplicate and keeps child notebooks", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("PRAGMA foreign_keys = ON");
      for (const file of globSync("migrations/*.sql").sort().filter((file) => file.split("/").at(-1) < "0053")) {
        sqlite.exec(readFileSync(file, "utf8"));
      }
      sqlite.exec(`
        INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, sort_order)
        VALUES
          ('ws_default_inbox', 'ws_default', NULL, '等待分类', 'inbox', 'notebook', '#0f766e', 10),
          ('nb_under_duplicate', 'ws_default', 'ws_default_inbox', 'Nested', 'nested', 'notebook', '#0f766e', 20);
        INSERT INTO memos (id, workspace_id, notebook_id, title, excerpt)
        VALUES
          ('memo_on_original', 'ws_default', 'nb_inbox', 'Keep me', 'keep'),
          ('memo_on_duplicate', 'ws_default', 'ws_default_inbox', 'Move me', 'move');
      `);
      sqlite.exec(readFileSync("migrations/0053_collapse_duplicate_inbox_notebooks.sql", "utf8"));

      expect(
        sqlite.query(`
          SELECT id FROM notebooks
          WHERE workspace_id = 'ws_default' AND is_deleted = 0
            AND (slug = 'inbox' OR id = 'nb_inbox' OR id = workspace_id || '_inbox')
        `).all(),
      ).toEqual([{ id: "nb_inbox" }]);
      expect(
        sqlite.query("SELECT notebook_id FROM memos WHERE id IN ('memo_on_duplicate', 'memo_on_original') ORDER BY id").all(),
      ).toEqual([
        { notebook_id: "nb_inbox" },
        { notebook_id: "nb_inbox" },
      ]);
      expect(sqlite.query("SELECT parent_id, is_deleted FROM notebooks WHERE id = 'nb_under_duplicate'").get()).toEqual({
        parent_id: "nb_inbox",
        is_deleted: 0,
      });
      expect(sqlite.query("SELECT is_deleted FROM notebooks WHERE id = 'ws_default_inbox'").get()).toEqual({
        is_deleted: 1,
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

  test("deletes an empty notebook together with its empty descendants", async () => {
    const fixture = createFixture();
    try {
      fixture.sqlite.exec(`
        UPDATE notebooks SET name = '注册考试', slug = NULL WHERE id = 'nb_notes';
        INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, is_deleted, created_at, updated_at) VALUES
          ('nb_law', 'ws_1', 'nb_notes', '法律法规', NULL, 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'),
          ('nb_history', 'ws_1', 'nb_notes', '建筑史', 'history', 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'),
          ('nb_outline', 'ws_1', 'nb_history', '大纲', 'outline', 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
        INSERT INTO memos (id, workspace_id, notebook_id, title, is_deleted, updated_at)
        VALUES ('memo_trashed', 'ws_1', 'nb_law', '已删除', 1, '2026-09-10T00:00:00.000Z');
      `);

      await deleteNotebookRecord(fixture.db, "ws_1", "nb_notes", actor);

      expect(
        fixture.sqlite.query("SELECT id FROM notebooks WHERE workspace_id = 'ws_1' AND is_deleted = 0 ORDER BY id").all(),
      ).toEqual([{ id: "ws_1_inbox" }]);
      await expect(deleteNotebookRecord(fixture.db, "ws_1", "nb_notes", actor)).resolves.toBeUndefined();
    } finally {
      fixture.sqlite.close();
    }
  });

  test("keeps the whole notebook tree when any descendant still has a note", async () => {
    const fixture = createFixture();
    try {
      fixture.sqlite.exec(`
        INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, is_deleted, created_at, updated_at) VALUES
          ('nb_child', 'ws_1', 'nb_notes', '子笔记本', 'child', 0, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z');
        INSERT INTO memos (id, workspace_id, notebook_id, title, is_deleted, updated_at)
        VALUES ('memo_keep', 'ws_1', 'nb_child', '还在', 0, '2026-09-10T00:00:00.000Z');
      `);

      await expect(deleteNotebookRecord(fixture.db, "ws_1", "nb_notes", actor)).rejects.toMatchObject({
        code: "notebook_not_empty",
        status: 409,
      });
      expect(
        fixture.sqlite.query("SELECT id FROM notebooks WHERE workspace_id = 'ws_1' AND is_deleted = 1").all(),
      ).toEqual([]);
    } finally {
      fixture.sqlite.close();
    }
  });
});

describe("notebook appearance", () => {
  test("persists appearance, preserves it during rename, and explicitly resets it", async () => {
    const { sqlite, db } = createFixture();
    try {
    const appearance = { icon: "network", color: "#2563eb", textColor: "#dc2626", isBold: true, iconInverted: true, rowInverted: true };
      expect(await updateNotebookRecord(db, "ws_1", "nb_notes", appearance, actor)).toMatchObject(appearance);
      expect(await updateNotebookRecord(db, "ws_1", "nb_notes", { name: "Heimnetz" }, actor)).toMatchObject({ ...appearance, name: "Heimnetz" });
    const reset = { icon: null, color: null, textColor: null, isBold: false, iconInverted: false, rowInverted: false };
      expect(await updateNotebookRecord(db, "ws_1", "nb_notes", reset, actor)).toMatchObject(reset);
      expect(sqlite.query("SELECT icon, color, color_target, is_bold FROM notebooks WHERE id = 'nb_notes'").get()).toEqual({ icon: null, color: null, color_target: "icon", is_bold: 0 });
      await expect(updateNotebookRecord(db, "other_workspace", "nb_notes", appearance, actor)).rejects.toThrow("Notebook not found");
    } finally { sqlite.close(); }
  });

  test("upgrades the previous complete schema without losing existing notebook data", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec("PRAGMA foreign_keys = ON");
      for (const file of globSync("migrations/*.sql").sort().filter(file => file.split("/").at(-1) < "0073")) {
        sqlite.exec(readFileSync(file, "utf8"));
      }
      sqlite.exec("UPDATE notebooks SET icon = 'network', color = '#2563eb' WHERE id = 'nb_inbox'");
      // query() caches the statement, so SELECT * prepared before ALTER TABLE
      // keeps the old columns. prepare() reads the schema after each migration.
      const notebookRows = () => sqlite.prepare("SELECT * FROM notebooks ORDER BY id").all();
      const before = notebookRows();
      const memoCount = sqlite.query("SELECT COUNT(*) AS count FROM memos").get();
      sqlite.exec(readFileSync("migrations/0073_notebook_appearance.sql", "utf8"));
      const after = notebookRows();
      expect(after).toEqual(before.map(row => ({ ...row, color_target: "icon" })));
      sqlite.exec(readFileSync("migrations/0074_notebook_bold.sql", "utf8"));
      expect(notebookRows()).toEqual(after.map(row => ({ ...row, is_bold: 0 })));
      sqlite.exec(readFileSync("migrations/0075_notebook_text_color.sql", "utf8"));
      const beforeInversion = notebookRows();
      sqlite.exec(readFileSync("migrations/0076_notebook_icon_inverted.sql", "utf8"));
      expect(notebookRows()).toEqual(beforeInversion.map(row => ({ ...row, icon_inverted: 0 })));
      const beforeRowInversion = notebookRows();
      sqlite.exec(readFileSync("migrations/0077_notebook_row_inverted.sql", "utf8"));
      expect(notebookRows()).toEqual(beforeRowInversion.map(row => ({ ...row, row_inverted: 0 })));
      expect(sqlite.query("SELECT COUNT(*) AS count FROM memos").get()).toEqual(memoCount);
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { sqlite.close(); }
  });
});
