import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { DEFAULT_MEMO_TITLE, emptyDoc } from "@edgeever/shared";
import { AppError } from "./app-error.ts";
import { registerBackupRoutes } from "./backup-routes.ts";
import { apiError } from "./http-errors.ts";
import { restoreJsonMemos, restoreJsonNotebooks } from "./backup-service.ts";
import { sha256, sha256Bytes } from "./hash-utils.ts";
import { createMemoRecord, getMemoDetail, mapMemoDetail } from "./memo-service.ts";
import { createImageResource } from "./resource-service.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";

// Backups are exported from one installation and restored into another, the
// way the ZIP backup in Settings does: notebooks first, then notes with their
// revisions, then each file.
const WORKSPACE_ID = "ws_default";
const userAuth = {
  kind: "user", actorType: "user", actorId: "usr_owner", username: "admin", displayName: "Admin",
  scopes: [], workspaceId: WORKSPACE_ID, role: "owner",
};
const actor = { actorType: "user", actorId: "usr_owner" };
const cleanups = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

const installation = () => {
  const sqlite = new Database(":memory:");
  for (const file of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(file, "utf8"));
  const resourcesDirectory = mkdtempSync(join(tmpdir(), "edgeever-backup-"));
  cleanups.push(() => {
    sqlite.close();
    rmSync(resourcesDirectory, { recursive: true, force: true });
  });
  const storage = createSelfHostedStorageAdapter(sqlite, resourcesDirectory);
  const app = new Hono();
  let auth = userAuth;
  app.use("/api/v1/*", async (context, next) => {
    context.set("auth", auth);
    await next();
  });
  // Mirrors the application's error handler in index.ts.
  app.onError((error, context) => {
    if (error instanceof AppError) return apiError(context, error.code, error.message, error.status);
    throw error;
  });
  registerBackupRoutes(app, {
    clampNumber: (value, min, max) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max),
    getMemoDetail,
    mapMemoDetail,
    restoreJsonMemos,
    restoreJsonNotebooks,
    sha256Bytes,
    initiateResourceRestoreUpload: async () => { throw new Error("not used"); },
  });
  const request = async (path, init = {}) => {
    const response = await app.request(path, init, { storage });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const postJson = (path, body) => request(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const storedFiles = () => readdirSync(resourcesDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();
  const readObject = async (objectKey) => {
    const object = await storage.resources.get(objectKey);
    return object ? new Uint8Array(await new Response(object.body).arrayBuffer()) : null;
  };
  const context = { env: { storage }, get: (key) => (key === "auth" ? auth : undefined) };
  return {
    sqlite, storage, context, request, postJson, storedFiles, readObject,
    setAuth: (next) => { auth = next; },
  };
};

const notebookBackups = (sqlite) => sqlite.query(
  `SELECT id, parent_id, name, slug, icon, color, text_color, color_target, is_bold, icon_inverted, row_inverted, sort_order, created_at, updated_at
   FROM notebooks WHERE workspace_id = ? AND is_deleted = 0 ORDER BY parent_id IS NOT NULL, sort_order, id`,
).all(WORKSPACE_ID).map((row) => ({
  id: row.id, parentId: row.parent_id, name: row.name, slug: row.slug, icon: row.icon, color: row.color, textColor: row.text_color, colorTarget: row.color_target, isBold: row.is_bold === 1, iconInverted: row.icon_inverted === 1, rowInverted: row.row_inverted === 1,
  sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at,
}));

// Reads every page of GET /api/v1/backups/json and groups it per note, like the client.
const exportBackup = async (source, pageSize = 2) => {
  const memos = [];
  let offset = 0;
  for (;;) {
    const page = await source.request(`/api/v1/backups/json?limit=${pageSize}&offset=${offset}`);
    expect(page.status).toBe(200);
    for (const memo of page.body.memos) {
      memos.push({
        memo,
        revisions: page.body.revisions.filter((revision) => revision.memoId === memo.id),
        resources: page.body.resources.filter((resource) => resource.memoId === memo.id)
          .map(({ url: _url, ...resource }) => ({ ...resource, archivePath: `resources/${resource.id}` })),
      });
    }
    if (page.body.nextOffset === null) break;
    offset = page.body.nextOffset;
  }
  const files = new Map();
  for (const { resources } of memos) {
    for (const resource of resources) {
      const row = source.sqlite.query("SELECT object_key FROM resources WHERE id = ?").get(resource.id);
      files.set(resource.id, await source.readObject(row.object_key));
    }
  }
  return { notebooks: notebookBackups(source.sqlite), memos, files };
};

const restoreResource = (target, resource, bytes, { id = resource.id } = {}) => {
  const form = new FormData();
  form.set("metadata", JSON.stringify(resource));
  form.set("file", new File([bytes], resource.filename ?? "file", { type: resource.mimeType ?? "application/octet-stream" }));
  return target.request(`/api/v1/restores/json/resources/${encodeURIComponent(id)}`, { method: "PUT", body: form });
};

const restoreBackup = async (target, backup) => {
  expect((await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks })).status).toBe(200);
  for (let index = 0; index < backup.memos.length; index += 2) {
    const response = await target.postJson("/api/v1/restores/json/memos", { memos: backup.memos.slice(index, index + 2) });
    expect(response.status).toBe(200);
  }
  for (const { resources } of backup.memos) {
    for (const resource of resources) {
      expect((await restoreResource(target, resource, backup.files.get(resource.id))).status).toBe(200);
    }
  }
};

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

// A workspace with a nested notebook, pinned and tagged notes, revision
// history and an image referenced from the content.
const populate = async (source) => {
  const { sqlite, storage, context } = source;
  const inbox = sqlite.query("SELECT id FROM notebooks WHERE workspace_id = ? AND slug = 'inbox'").get(WORKSPACE_ID).id;
  sqlite.query(
    `INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, icon, color, text_color, color_target, is_bold, icon_inverted, row_inverted, sort_order, created_at, updated_at)
     VALUES ('nb_trips', ?, ?, 'Trips', 'trips', 'plane', '#2563eb', '#dc2626', 'both', 1, 1, 1, 7, '2026-01-02T10:00:00.000Z', '2026-01-03T10:00:00.000Z')`,
  ).run(WORKSPACE_ID, inbox);
  const plan = await createMemoRecord(storage.db, WORKSPACE_ID, {
    notebookId: "nb_trips", title: "Trip plan", contentMarkdown: "Draft", tags: ["travel", "2026"],
    createdAt: "2026-02-01T08:00:00.000Z", updatedAt: "2026-02-02T08:00:00.000Z",
  }, actor, "admin");
  const image = await createImageResource(context, {
    memoId: plan.id, filename: "map.png", mimeType: "image/png", bytes: PNG, actor, source: "upload",
  });
  const markdown = `## Trip plan\n\n![map](/api/v1/resources/${image.id}/blob)\n\nBook the ferry.`;
  const json = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Trip plan" }] },
      { type: "image", attrs: { src: `/api/v1/resources/${image.id}/blob`, alt: "map" } },
      { type: "paragraph", content: [{ type: "text", text: "Book the ferry." }] },
    ],
  };
  sqlite.query(
    `UPDATE memo_contents SET content_markdown = ?, content_json = ?, content_text = 'Trip plan map Book the ferry.',
       content_hash = ?, revision = 3
     WHERE memo_id = ?`,
  ).run(markdown, JSON.stringify(json), await sha256(markdown + JSON.stringify(json)), plan.id);
  sqlite.query("UPDATE memos SET is_pinned = 1 WHERE id = ?").run(plan.id);
  for (const revision of [1, 2]) {
    sqlite.query(
      `INSERT INTO memo_revisions (id, memo_id, revision, title, content_json, content_markdown, content_hash, created_by, created_at, tags_json, content_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', ?, '["travel"]', ?)`,
    ).run(`rev_plan_${revision}`, plan.id, revision, `Trip plan v${revision}`,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Version ${revision}` }] }] }),
      `Version ${revision}`, `hash-${revision}`, `2026-02-0${revision}T09:00:00.000Z`, `Version ${revision}`);
  }
  const notes = [];
  for (let index = 0; index < 3; index += 1) {
    notes.push(await createMemoRecord(storage.db, WORKSPACE_ID, {
      notebookId: inbox, title: `Note ${index}`, contentMarkdown: `Body ${index} with **bold** text`, tags: [`tag-${index}`],
    }, actor, "admin"));
  }
  return { plan: await getMemoDetail(storage.db, WORKSPACE_ID, plan.id), image, notes };
};

const workspaceSnapshot = async (installationUnderTest) => {
  const { sqlite, storage } = installationUnderTest;
  const memoIds = sqlite.query("SELECT id FROM memos WHERE workspace_id = ? AND is_deleted = 0 ORDER BY id").all(WORKSPACE_ID).map((row) => row.id);
  const memos = [];
  for (const id of memoIds) {
    const memo = await getMemoDetail(storage.db, WORKSPACE_ID, id);
    memos.push({
      id: memo.id, notebookId: memo.notebookId, title: memo.title, tags: memo.tags, isPinned: memo.isPinned,
      isArchived: memo.isArchived, revision: memo.revision, createdAt: memo.createdAt, updatedAt: memo.updatedAt,
      contentJson: memo.contentJson, contentMarkdown: memo.contentMarkdown, contentText: memo.contentText, contentHash: memo.contentHash,
    });
  }
  return {
    notebooks: notebookBackups(sqlite),
    memos,
    revisions: sqlite.query("SELECT id, memo_id, revision, title, content_markdown, content_text, created_at, tags_json FROM memo_revisions ORDER BY id").all(),
    resources: sqlite.query("SELECT id, memo_id, kind, mime_type, filename, byte_size, sha256 FROM resources WHERE is_deleted = 0 ORDER BY id").all(),
  };
};

// Rows that already exist in the target (the default notebooks and welcome
// note every installation seeds) keep their own creation time.
const withoutSeededCreationTimes = (snapshot) => ({
  ...snapshot,
  notebooks: snapshot.notebooks.map((notebook) => notebook.id === "nb_trips" ? notebook : { ...notebook, createdAt: null }),
  memos: snapshot.memos.map((memo) => memo.id === "memo_welcome" ? { ...memo, createdAt: null } : memo),
});

describe("JSON backup and restore", () => {
  test("restores notebooks, notes, revisions and files into a new installation unchanged", async () => {
    const source = installation();
    const { plan, image } = await populate(source);
    const backup = await exportBackup(source);
    expect(backup.memos.length).toBeGreaterThan(2);

    const target = installation();
    await restoreBackup(target, backup);

    expect(withoutSeededCreationTimes(await workspaceSnapshot(target)))
      .toEqual(withoutSeededCreationTimes(await workspaceSnapshot(source)));
    const restoredImage = target.sqlite.query("SELECT object_key, original_memo_id FROM resources WHERE id = ?").get(image.id);
    expect(await target.readObject(restoredImage.object_key)).toEqual(PNG);
    const restoredPlan = await getMemoDetail(target.storage.db, WORKSPACE_ID, plan.id);
    expect(restoredPlan.contentMarkdown).toContain(`/api/v1/resources/${image.id}/blob`);
    expect(target.sqlite.query("SELECT memo_id FROM memos_fts WHERE memos_fts MATCH 'ferry'").all().map((row) => row.memo_id))
      .toEqual([plan.id]);
    expect(target.sqlite.query("SELECT name FROM memo_tags WHERE memo_id = ? ORDER BY name").all(plan.id).map((row) => row.name))
      .toEqual(["2026", "travel"]);
  });

  test("restoring the same backup twice changes nothing and keeps one copy of each file", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();

    await restoreBackup(target, backup);
    const once = { snapshot: await workspaceSnapshot(target), files: target.storedFiles().length };
    await restoreBackup(target, backup);

    expect(await workspaceSnapshot(target)).toEqual(once.snapshot);
    expect(target.storedFiles()).toHaveLength(once.files);
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM resources").get().count).toBe(once.snapshot.resources.length);
  });

  test("brings back notes and notebooks deleted after the backup and undoes later edits", async () => {
    const source = installation();
    const { plan, notes } = await populate(source);
    const backup = await exportBackup(source);
    const before = await workspaceSnapshot(source);

    source.sqlite.query("UPDATE memos SET is_deleted = 1, deleted_at = '2026-03-01T00:00:00.000Z' WHERE id = ?").run(notes[0].id);
    source.sqlite.query("UPDATE notebooks SET is_deleted = 1, deleted_at = '2026-03-01T00:00:00.000Z' WHERE id = 'nb_trips'").run();
    source.sqlite.query("UPDATE memo_contents SET content_markdown = 'Edited later', revision = 9 WHERE memo_id = ?").run(plan.id);
    source.sqlite.query("UPDATE memos SET title = 'Renamed later' WHERE id = ?").run(plan.id);
    await restoreBackup(source, backup);

    expect(await workspaceSnapshot(source)).toEqual(before);
  });

  test("falls back safely for damaged or minimal note content", async () => {
    const target = installation();
    const inbox = target.sqlite.query("SELECT id FROM notebooks WHERE workspace_id = ? AND slug = 'inbox'").get(WORKSPACE_ID).id;
    const memo = (id, fields) => ({
      memo: {
        id, notebookId: inbox, title: "Title", excerpt: "", tags: [], isPinned: false, isArchived: false, isDeleted: false,
        revision: 0, createdAt: "2026-04-01T00:00:00.000Z", updatedAt: "2026-04-01T00:00:00.000Z", deletedAt: null,
        contentJson: { type: "doc", content: [] }, contentMarkdown: "", contentText: "", contentHash: "",
        sourceMemoIds: [], mergeSourceCount: 0, mergedIntoMemoId: null, ...fields,
      },
      revisions: [],
      resources: [],
    });

    const response = await target.postJson("/api/v1/restores/json/memos", {
      memos: [
        memo("memo_damaged_json", { contentJson: "not a document", contentMarkdown: "Kept **markdown**" }),
        memo("memo_markdown_from_json", {
          contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Only JSON" }] }] },
          contentMarkdown: "",
        }),
        memo("memo_untitled", { title: "   ", tags: [" travel ", "travel", "", "Work"] }),
      ],
    });
    expect(response.status).toBe(200);

    const damaged = await getMemoDetail(target.storage.db, WORKSPACE_ID, "memo_damaged_json");
    expect(damaged.contentMarkdown).toBe("Kept **markdown**");
    expect(damaged.contentJson).toEqual(emptyDoc());
    expect((await getMemoDetail(target.storage.db, WORKSPACE_ID, "memo_markdown_from_json")).contentMarkdown).toBe("Only JSON");
    const untitled = await getMemoDetail(target.storage.db, WORKSPACE_ID, "memo_untitled");
    expect(untitled.title).toBe(DEFAULT_MEMO_TITLE);
    expect(untitled.tags).toEqual(["travel", "Work"]);
  });

  test("rejects a backup that would take over another user's notebooks or notes", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    target.sqlite.exec(`
      INSERT INTO workspaces (id, name, is_personal) VALUES ('ws_other', 'Other', 1);
      INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, sort_order) VALUES ('nb_trips', 'ws_other', NULL, 'Theirs', 'theirs', 0);
    `);

    const notebooks = await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks });
    expect(notebooks.status).toBe(409);
    expect(notebooks.body.error.code).toBe("cross_workspace_id_conflict");
    expect(target.sqlite.query("SELECT workspace_id, name FROM notebooks WHERE id = 'nb_trips'").get())
      .toEqual({ workspace_id: "ws_other", name: "Theirs" });

    const [first] = backup.memos;
    target.sqlite.query(
      `INSERT INTO memos (id, workspace_id, notebook_id, title, excerpt, tags_json, created_by, updated_by)
       VALUES (?, 'ws_other', 'nb_trips', 'Theirs', '', '[]', 'other', 'other')`,
    ).run(first.memo.id);
    const memos = await target.postJson("/api/v1/restores/json/memos", { memos: [first] });
    expect(memos.status).toBe(409);
    expect(target.sqlite.query("SELECT workspace_id, title FROM memos WHERE id = ?").get(first.memo.id))
      .toEqual({ workspace_id: "ws_other", title: "Theirs" });
  });

  test("rejects notes and notebooks that point outside the current workspace", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    const notesBefore = target.sqlite.query("SELECT COUNT(*) AS count FROM memos").get().count;

    const orphanNotebook = await target.postJson("/api/v1/restores/json/notebooks", {
      notebooks: [{ ...backup.notebooks.find((notebook) => notebook.id === "nb_trips"), parentId: "nb_missing" }],
    });
    expect(orphanNotebook.status).toBe(400);
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM notebooks WHERE id = 'nb_trips'").get().count).toBe(0);

    // nb_trips was not restored, so the trip plan has no notebook here.
    const plan = backup.memos.find(({ memo }) => memo.notebookId === "nb_trips");
    const orphanNote = await target.postJson("/api/v1/restores/json/memos", { memos: [plan] });
    expect(orphanNote.status).toBe(400);
    expect(orphanNote.body.error.code).toBe("invalid_backup_workspace");
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM memos").get().count).toBe(notesBefore);
  });

  test("rejects a revision that belongs to another note", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks });
    const plan = backup.memos.find(({ revisions }) => revisions.length > 0);

    const response = await target.postJson("/api/v1/restores/json/memos", {
      memos: [{ ...plan, revisions: [{ ...plan.revisions[0], memoId: "memo_someone_else" }] }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_backup");
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM memos WHERE id = ?").get(plan.memo.id).count).toBe(0);
  });

  test("writes nothing from a page in which any note has another note's revision", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks });
    const valid = backup.memos.find(({ memo, revisions }) => revisions.length === 0 && memo.id !== "memo_welcome");
    const plan = backup.memos.find(({ revisions }) => revisions.length > 0);

    const response = await target.postJson("/api/v1/restores/json/memos", {
      memos: [valid, { ...plan, revisions: [{ ...plan.revisions[0], memoId: valid.memo.id }] }],
    });

    expect(response.status).toBe(400);
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM memos WHERE id IN (?, ?)").get(valid.memo.id, plan.memo.id).count).toBe(0);
  });

  test("allows only signed-in users to restore", async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    target.setAuth({ ...userAuth, kind: "agent", actorType: "agent", actorId: "tok_1", scopes: ["write:memos", "write:resources"] });

    expect((await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks })).status).toBe(403);
    expect((await target.postJson("/api/v1/restores/json/memos", { memos: backup.memos })).status).toBe(403);
    const withFile = backup.memos.find(({ resources }) => resources.length > 0);
    expect((await restoreResource(target, withFile.resources[0], PNG)).status).toBe(403);
    expect(target.sqlite.query("SELECT COUNT(*) AS count FROM memos WHERE created_by = 'restore'").get().count).toBe(0);
  });
});

describe("restoring a file of a backup", () => {
  const prepared = async () => {
    const source = installation();
    await populate(source);
    const backup = await exportBackup(source);
    const target = installation();
    await target.postJson("/api/v1/restores/json/notebooks", { notebooks: backup.notebooks });
    await target.postJson("/api/v1/restores/json/memos", { memos: backup.memos });
    const resource = backup.memos.flatMap(({ resources }) => resources)[0];
    return { target, resource, bytes: backup.files.get(resource.id) };
  };

  test("replaces the stored object when the same file is restored again", async () => {
    const { target, resource, bytes } = await prepared();
    expect((await restoreResource(target, resource, bytes)).status).toBe(200);
    const first = target.sqlite.query("SELECT object_key FROM resources WHERE id = ?").get(resource.id).object_key;

    await Bun.sleep(2);
    expect((await restoreResource(target, resource, bytes)).status).toBe(200);
    const second = target.sqlite.query("SELECT object_key FROM resources WHERE id = ?").get(resource.id).object_key;

    expect(second).not.toBe(first);
    expect(await target.readObject(first)).toBeNull();
    expect(await target.readObject(second)).toEqual(bytes);
    expect(target.storedFiles()).toHaveLength(1);
  });

  test("rejects invalid metadata, a missing note, a bad size and another user's file id", async () => {
    const { target, resource, bytes } = await prepared();

    expect((await restoreResource(target, resource, bytes, { id: "res_other" })).status).toBe(400);
    expect((await restoreResource(target, { ...resource, memoId: "memo_missing" }, bytes)).status).toBe(404);
    expect((await restoreResource(target, resource, new Uint8Array())).status).toBe(413);

    target.sqlite.exec(`
      INSERT INTO workspaces (id, name, is_personal) VALUES ('ws_other', 'Other', 1);
      INSERT INTO notebooks (id, workspace_id, parent_id, name, slug, sort_order) VALUES ('nb_other', 'ws_other', NULL, 'Theirs', 'theirs', 0);
      INSERT INTO memos (id, workspace_id, notebook_id, title, excerpt, tags_json, created_by, updated_by)
        VALUES ('memo_other', 'ws_other', 'nb_other', 'Theirs', '', '[]', 'other', 'other');
    `);
    target.sqlite.query(
      `INSERT INTO resources (id, memo_id, object_key, kind, byte_size) VALUES ('res_theirs', 'memo_other', 'theirs/key', 'image', 1)`,
    ).run();
    const foreign = await restoreResource(target, { ...resource, id: "res_theirs" }, bytes);
    expect(foreign.status).toBe(409);
    expect(target.sqlite.query("SELECT memo_id, object_key FROM resources WHERE id = 'res_theirs'").get())
      .toEqual({ memo_id: "memo_other", object_key: "theirs/key" });
    expect(target.storedFiles()).toEqual([]);
  });
});
