import { createHash } from "node:crypto";
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { buildWelcomeMemoContent, WELCOME_MEMO_REPAIRED_CONTENT_HASH } from "../packages/shared/src/default-workspace-seeds";
import { createSelfHostedStorageAdapter } from "../apps/api/src/self-hosted-storage-adapter";
import { ensureUserWorkspace } from "../apps/api/src/workspace-provisioning";
import { createLocalDevelopmentSession } from "../scripts/local-dev-auth.mjs";

const repairPath = "migrations/0071_fix_welcome_memo_markdown.sql";
const repair = readFileSync(repairPath, "utf8");
const migrations = globSync("migrations/*.sql").sort();
const databases: Database[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const open = (path = ":memory:") => {
  const db = new Database(path);
  databases.push(db);
  return db;
};
const legacy = () => {
  const db = open();
  for (const path of migrations.filter((path) => path < repairPath)) db.exec(readFileSync(path, "utf8"));
  return db;
};
const content = (db: Database) => db.query("SELECT * FROM memo_contents WHERE memo_id = 'memo_welcome'").get() as {
  content_markdown: string; content_json: string; content_hash: string; revision: number; updated_at: string;
};
const memo = (db: Database) => db.query("SELECT * FROM memos WHERE id = 'memo_welcome'").get();
const changes = (db: Database) => db.query("SELECT * FROM mobile_sync_changes ORDER BY id").all();
const assertRepaired = (db: Database) => {
  const row = content(db);
  expect(row.content_markdown).toBe(buildWelcomeMemoContent("zh-CN").contentMarkdown);
  expect(row.content_markdown).not.toContain("\\n");
  expect(row.content_markdown.split("\n\n")).toHaveLength(3);
  expect(row.content_hash).toBe(createHash("sha256").update(row.content_markdown + row.content_json).digest("hex"));
  expect(row.content_hash).toBe(WELCOME_MEMO_REPAIRED_CONTENT_HASH);
  expect(row.revision).toBe(1);
};

describe("welcome Markdown repair", () => {
  test("initializes correctly through local development auto-login without normal sign-in", async () => {
    const db = open();
    for (const path of migrations) db.exec(readFileSync(path, "utf8"));
    await createLocalDevelopmentSession(db);
    assertRepaired(db);
  });

  test("upgrades a persisted old database and announces the change exactly once", () => {
    const directory = mkdtempSync(join(tmpdir(), "edgeever-welcome-upgrade-"));
    directories.push(directory);
    const path = join(directory, "old.sqlite");
    const old = new Database(path);
    try {
      // Build the persisted fixture without an fsync for every seed statement.
      old.exec("PRAGMA foreign_keys = ON");
      old.transaction(() => {
        for (const migration of migrations.filter((file) => file < repairPath)) old.exec(readFileSync(migration, "utf8"));
        old.exec("UPDATE memos SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = 'memo_welcome'");
      })();
      expect(content(old).content_markdown).toContain("\\n\\n");
    } finally {
      old.close();
    }
    const db = open(path);
    const before = changes(db);
    db.transaction(() => db.exec(repair))();
    assertRepaired(db);
    expect(changes(db)).toHaveLength(before.length + 1);
    expect(changes(db).at(-1)).toMatchObject({ workspace_id: "ws_default", entity_type: "memo", entity_id: "memo_welcome", operation: "upsert" });
    expect(db.query("SELECT updated_at FROM memos WHERE id = 'memo_welcome'").get()).toEqual({ updated_at: content(db).updated_at });
    expect(content(db).updated_at).not.toBe("2020-01-01T00:00:00.000Z");
    const repaired = { memo: memo(db), content: content(db), changes: changes(db) };
    db.exec(repair);
    expect({ memo: memo(db), content: content(db), changes: changes(db) }).toEqual(repaired);
  });

  test.each([
    ["title", "UPDATE memos SET title = 'Custom title'"],
    ["actor", "UPDATE memos SET updated_by = 'user'"],
    ["creator", "UPDATE memos SET created_by = 'user'"],
    ["deleted", "UPDATE memos SET is_deleted = 1"],
    ["revision", "UPDATE memo_contents SET revision = 4"],
    ["hash", "UPDATE memo_contents SET content_hash = 'custom'"],
    ["Markdown with literal escapes", "UPDATE memo_contents SET content_markdown = 'user\\ntext'"],
    ["JSON", "UPDATE memo_contents SET content_json = '{}'"],
    ["plain text", "UPDATE memo_contents SET content_text = 'Custom text'"],
  ])("preserves a seed with a changed %s", (_name, edit) => {
    const db = legacy();
    db.exec(edit);
    const before = { memo: memo(db), content: content(db), changes: changes(db) };
    db.exec(repair);
    expect({ memo: memo(db), content: content(db), changes: changes(db) }).toEqual(before);
  });

  test.each([false, true])("localizes at first sign-in with repair applied: %s", async (applyRepair) => {
    const sqlite = legacy();
    if (applyRepair) sqlite.exec(repair);
    sqlite.exec("INSERT INTO users (id, username, password_hash, display_name) VALUES ('owner', 'owner', 'unused', 'Owner')");
    const db = createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-welcome-unused").db;
    await ensureUserWorkspace(db, "owner", "owner", "en-US");
    expect(content(sqlite).content_markdown).toBe(buildWelcomeMemoContent("en-US").contentMarkdown);
    expect(content(sqlite).revision).toBe(applyRepair ? 2 : 1);
    expect(memo(sqlite)).toMatchObject({ title: "Welcome to EdgeEver" });
    const before = { memo: memo(sqlite), content: content(sqlite), changes: changes(sqlite) };
    sqlite.exec(repair);
    expect({ memo: memo(sqlite), content: content(sqlite), changes: changes(sqlite) }).toEqual(before);
  });

  test("preserves a note with revision history even if its current content matches the seed", () => {
    const db = legacy();
    db.exec(`INSERT INTO memo_revisions (id, memo_id, revision, title, content_json, content_markdown, content_hash, created_by)
      SELECT 'rev_old', memo_id, 0, 'Previous title', content_json, content_markdown, content_hash, 'user'
      FROM memo_contents WHERE memo_id = 'memo_welcome'`);
    const before = { memo: memo(db), content: content(db), changes: changes(db) };
    db.exec(repair);
    expect({ memo: memo(db), content: content(db), changes: changes(db) }).toEqual(before);
  });

  test("preserves other notes containing the exact same content", () => {
    const db = legacy();
    db.exec(`INSERT INTO memos (id, notebook_id, title, created_by, updated_by)
      VALUES ('memo_user', 'nb_inbox', '欢迎来到 EdgeEver', 'system', 'system');
      INSERT INTO memo_contents (memo_id, content_json, content_markdown, content_text, content_hash)
      SELECT 'memo_user', content_json, content_markdown, content_text, content_hash
      FROM memo_contents WHERE memo_id = 'memo_welcome'`);
    const before = db.query("SELECT * FROM memo_contents WHERE memo_id = 'memo_user'").get();
    db.exec(repair);
    expect(db.query("SELECT * FROM memo_contents WHERE memo_id = 'memo_user'").get()).toEqual(before);
    assertRepaired(db);
  });

  test("does not announce or recreate a missing welcome note", () => {
    const db = legacy();
    db.exec("DELETE FROM memo_contents WHERE memo_id = 'memo_welcome'; DELETE FROM memos WHERE id = 'memo_welcome'");
    const before = changes(db);
    db.exec(repair);
    expect(memo(db)).toBeNull();
    expect(changes(db)).toEqual(before);
  });
});
