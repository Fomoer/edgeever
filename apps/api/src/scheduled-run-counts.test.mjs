import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { registerScheduledTaskRoutes } from "./scheduled-task-routes.ts";

const databases = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
const upgradeFixture = () => {
  const db = new Database(":memory:"); databases.push(db);
  for (const file of globSync("migrations/*.sql").sort().filter((file) => file < "migrations/0084_scheduled_run_counts.sql")) db.exec(readFileSync(file, "utf8"));
  db.exec("INSERT INTO workspaces (id,name) VALUES ('ws_a','A'),('ws_b','B');");
  const now = new Date().toISOString();
  for (const [id, workspace] of [["task_a", "ws_a"], ["task_a2", "ws_a"], ["task_b", "ws_b"]]) db.query(
    `INSERT INTO scheduled_tasks (id,workspace_id,name,task_type,task_payload_json,cron_expression,timezone,executor_device_id,created_at,updated_at)
     VALUES (?,?,?,'plugin-command','{"pluginId":"fixture","commandId":"run"}','* * * * *','UTC','desktop-device-1234567890',?,?)`,
  ).run(id, workspace, id, now, now);
  let sequence = 0;
  const insert = (id, task = "task_a", workspace = "ws_a", started = now) => db.query(
    "INSERT INTO scheduled_task_runs (id,task_id,workspace_id,scheduled_for,executor_device_id,status,started_at) VALUES (?,?,?,?,?,'running',?)",
  ).run(id, task, workspace, new Date(Date.now() + ++sequence * 1000).toISOString(), "desktop-device-1234567890", started);
  insert("run_a"); insert("run_a2"); insert("run_a3", "task_a2"); insert("run_b", "task_b", "ws_b");
  const before = db.query("SELECT * FROM scheduled_task_runs ORDER BY id").all();
  db.exec(readFileSync("migrations/0084_scheduled_run_counts.sql", "utf8"));
  const assertCounts = () => {
    for (const row of db.query("SELECT id,scheduled_run_count FROM workspaces").all()) expect(row.scheduled_run_count).toBe(db.query("SELECT COUNT(*) AS n FROM scheduled_task_runs WHERE workspace_id = ?").get(row.id).n);
    for (const row of db.query("SELECT id,workspace_id,run_count FROM scheduled_tasks").all()) expect(row.run_count).toBe(db.query("SELECT COUNT(*) AS n FROM scheduled_task_runs WHERE task_id = ? AND workspace_id = ?").get(row.id, row.workspace_id).n);
  };
  return { db, insert, before, assertCounts };
};

test("upgrades existing task history without changing records and maintains exact transactional counts", () => {
  const { db, insert, before, assertCounts } = upgradeFixture();
  expect(db.query("SELECT * FROM scheduled_task_runs ORDER BY id").all()).toEqual(before);
  assertCounts();
  insert("run_new"); assertCounts();
  db.exec("UPDATE scheduled_task_runs SET status = 'succeeded' WHERE id = 'run_new'"); assertCounts();
  db.exec("UPDATE scheduled_task_runs SET task_id = 'task_a2' WHERE id = 'run_new'"); assertCounts();
  db.exec("UPDATE scheduled_task_runs SET workspace_id = 'ws_b', task_id = 'task_b' WHERE id = 'run_new'"); assertCounts();
  expect(() => db.transaction(() => { insert("rolled_back"); throw new Error("rollback"); })()).toThrow("rollback"); assertCounts();
  db.exec("DELETE FROM scheduled_task_runs WHERE id = 'run_a'"); assertCounts();
  db.exec("DELETE FROM scheduled_tasks WHERE id = 'task_a2'"); assertCounts();
  db.exec("UPDATE scheduled_tasks SET id = 'renamed_task' WHERE id = 'task_a'"); assertCounts();
  db.exec("UPDATE workspaces SET id = 'renamed_workspace' WHERE id = 'ws_a'"); assertCounts();
  db.exec("DELETE FROM workspaces WHERE id = 'ws_b'"); assertCounts();
});

test("ignored claims and mismatched historical scopes do not corrupt task totals", () => {
  const { db, insert, assertCounts } = upgradeFixture();
  db.exec("INSERT OR IGNORE INTO scheduled_task_runs SELECT * FROM scheduled_task_runs WHERE id = 'run_a'"); assertCounts();
  insert("scope_mismatch", "task_a", "ws_b"); assertCounts();
  db.exec("UPDATE scheduled_tasks SET workspace_id = 'ws_b' WHERE id = 'task_a'"); assertCounts();
  db.exec("UPDATE scheduled_tasks SET workspace_id = 'ws_a' WHERE id = 'task_a'"); assertCounts();
  db.exec("DELETE FROM scheduled_task_runs WHERE id = 'scope_mismatch'"); assertCounts();
});

test("history polling uses primary-key totals and indexed retention cleanup after a real schema upgrade", async () => {
  const { db, insert, assertCounts } = upgradeFixture();
  insert("expired", "task_a", "ws_a", new Date(Date.now() - 31 * 86400000).toISOString());
  const storage = createSelfHostedStorageAdapter(db, "/private/tmp/edgeever-count-unused");
  const queries = []; const prepare = storage.db.prepare.bind(storage.db);
  storage.db.prepare = (sql) => { queries.push(sql); return prepare(sql); };
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("auth", { kind: "user", actorId: "owner", workspaceId: "ws_a", scopes: [], role: "owner" }); await next(); });
  registerScheduledTaskRoutes(app);
  const history = await app.request("/api/v1/scheduled-task-runs?limit=1", {}, { storage });
  expect(history.status).toBe(200);
  expect(await history.json()).toMatchObject({ totalCount: 3, nextOffset: 1 });
  const task = await app.request("/api/v1/scheduled-tasks/task_a/runs?limit=1", {}, { storage });
  expect(task.status).toBe(200);
  expect(await task.json()).toMatchObject({ totalCount: 2, nextOffset: 1 });
  expect(queries.some((sql) => /COUNT\s*\(/i.test(sql))).toBe(false);
  expect(db.query("EXPLAIN QUERY PLAN DELETE FROM scheduled_task_runs WHERE workspace_id = ? AND started_at < ?").all("ws_a", new Date().toISOString()).some((row) => row.detail.includes("idx_scheduled_task_runs_workspace_started"))).toBe(true);
  assertCounts();
});
