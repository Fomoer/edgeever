import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { AppError } from "./app-error.ts";
import { createMemoRecord } from "./memo-service.ts";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";

const opened = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));

const setup = () => {
  const sqlite = new Database(":memory:");
  opened.push(sqlite);
  for (const file of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(file, "utf8"));
  sqlite.exec(`INSERT INTO workspaces(id, name) VALUES ('paw', 'Paw');
    INSERT INTO notebooks(id, workspace_id, name) VALUES ('inbox', 'paw', 'Inbox');`);
  return { sqlite, db: createSelfHostedStorageAdapter(sqlite, "/tmp/memo-notebook-unused").db };
};

const actor = { actorType: "user", actorId: "user" };

test("a missing notebook is a 404 and leaves no memo rows", async () => {
  const { sqlite, db } = setup();
  const memosBefore = sqlite.query("SELECT COUNT(*) AS count FROM memos").get().count;
  const contentsBefore = sqlite.query("SELECT COUNT(*) AS count FROM memo_contents").get().count;
  const error = await createMemoRecord(
    db,
    "paw",
    { notebookId: "\u0001\u0005token1", title: "Video", contentMarkdown: "hello" },
    actor,
    "user",
  ).then(() => null, (caught) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error.status).toBe(404);
  expect(error.message).toBe("Notebook not found");
  expect(sqlite.query("SELECT COUNT(*) AS count FROM memos").get().count).toBe(memosBefore);
  expect(sqlite.query("SELECT COUNT(*) AS count FROM memo_contents").get().count).toBe(contentsBefore);
});

test("a live notebook still creates the memo", async () => {
  const { db } = setup();
  const memo = await createMemoRecord(
    db,
    "paw",
    { notebookId: "inbox", title: "Video", contentMarkdown: "hello" },
    actor,
    "user",
  );
  expect(memo.notebookId).toBe("inbox");
  expect(memo.title).toBe("Video");
});
