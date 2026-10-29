import { afterAll, afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { execFile, execFileSync, fork } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchEdgeEverApp } from "../../../api/src/index.ts";
import { createSelfHostedStorageAdapter } from "../../../api/src/self-hosted-storage-adapter.ts";
import { BackupManager } from "../main/backup-manager.mjs";
import { createEdgeEverClient } from "../../../../packages/client/src/index.ts";

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const directory = async () => { const path = await mkdtemp(join(tmpdir(), "edgeever-backup-e2e-")); cleanups.push(() => rm(path, { recursive: true, force: true })); return path; };
const instance = async ({ intercept } = {}) => {
  const directoryPath = await directory();
  const db = new Database(join(directoryPath, "db.sqlite"));
  for (const file of (await readdir("migrations")).filter((name) => name.endsWith(".sql")).sort()) db.exec(await readFile(join("migrations", file), "utf8"));
  const env = { storage: createSelfHostedStorageAdapter(db, join(directoryPath, "resources")), EDGE_EVER_ALLOW_UNAUTHENTICATED: "true", EDGE_EVER_RUNTIME: "self-hosted-bun" };
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const response = await intercept?.(request);
    return response ?? fetchEdgeEverApp(request, env, { waitUntil() {}, passThroughOnException() {} });
  } });
  cleanups.push(() => { server.stop(true); db.close(); });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  return { db, server, baseUrl, client: createEdgeEverClient({ baseUrl }) };
};

let bundle;
let bundleDirectory;
afterAll(async () => { if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true }); });
const nodeBinary = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
const prepareBundle = async () => {
  if (!bundle) {
    bundleDirectory = await mkdtemp(join(tmpdir(), "edgeever-backup-e2e-bundle-"));
    const build = await Bun.build({ entrypoints: ["apps/desktop/src/backup/worker.ts", "apps/desktop/src/backup/tests/restore-sink-rejection.mjs"], target: "node", format: "esm", outdir: bundleDirectory, naming: "[name].mjs" });
    if (!build.success) throw new Error(build.logs.join("\n"));
    bundle = join(bundleDirectory, "worker.mjs");
  }
};
const launch = async (data) => {
  await prepareBundle();
  // Bun's Worker emulation is not Electron's Node runtime. Exercise actual Node.
  const child = fork(new URL("./tests/node-worker-runner.mjs", import.meta.url), [bundle], { execPath: nodeBinary, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.send(data);
  const worker = { postMessage: (message) => child.send(message), terminate: () => child.kill("SIGTERM") };
  cleanups.push(() => worker.terminate());
  const messages = [];
  let notify;
  child.on("message", (message) => { messages.push(message); notify?.(); });
  child.on("error", (error) => { messages.push({ type: "error", error: { message: error.message } }); notify?.(); });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const next = async (type) => {
    while (true) {
      const error = messages.find((value) => value.type === "error");
      if (error) throw Object.assign(new Error(error.error.message), error.error);
      const index = messages.findIndex((value) => value.type === type);
      if (index !== -1) return messages.splice(index, 1)[0];
      await new Promise((resolve) => { notify = resolve; });
    }
  };
  return { worker, next, exited, messages };
};

test("fast upload initialization failures reach the restore handler without terminating Node", async () => {
  await prepareBundle();
  const { stdout } = await promisify(execFile)(nodeBinary, [join(bundleDirectory, "restore-sink-rejection.mjs")]);
  expect(JSON.parse(stdout)).toEqual({ status: 503, code: "object_storage_unavailable", message: "Target storage unavailable" });
});

test("failed workers cancel unfinished sibling requests and exit", async () => {
  let release;
  const promptsStarted = new Promise((resolve) => { release = resolve; });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/state")) return Response.json({ protocolVersion: 1, userId: null, workspaceId: "ws_default", identity: "fixture", backupRevision: "0", counts: { notebooks: 0, memos: 0, revisions: 0, resources: 0, prompts: 0 } });
    if (url.searchParams.get("kind") === "prompts") { release(); return new Promise(() => {}); }
    await promptsStarted;
    return Response.json({ error: { code: "fixture_read_failed", message: "Source read failed" } }, { status: 500 });
  } });
  // stop() resolves only after active requests finish. This fixture never responds.
  cleanups.push(() => { server.stop(true); });
  const job = await launch({ operation: "export", context: { baseUrl: `http://127.0.0.1:${server.port}`, accountId: null, token: "" }, path: join(await directory(), "pending.zip.part"), version: { edgeeverVersion: "2.2.0", buildId: "failure" } });
  await expect(job.next("done")).rejects.toMatchObject({ code: "fixture_read_failed" });
  let timer;
  try {
    expect(await Promise.race([job.exited.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), 2000); })])).toBe(true);
  } finally { clearTimeout(timer); }
}, 10000);

test("real Node background workers export encrypted and plain archives and restore without the original server", async () => {
  for (const encrypted of [false, true]) {
    const source = await instance();
    const { notebook } = await source.client.createNotebook({ name: "Backup hierarchy" });
    const { memo } = await source.client.createMemo({ notebookId: notebook.id, title: "Disaster recovery", contentMarkdown: "**portable note**", tags: ["backup"] });
    const bytes = new Uint8Array(2 * 1024 * 1024 + 11).fill(42);
    const { resource } = await source.client.uploadMemoResource(memo.id, new File([bytes], "payload.bin", { type: "application/octet-stream" }));
    const sourceState = await (await fetch(`${source.baseUrl}/api/v1/backups/state`)).json();
    const root = await directory(); const archive = join(root, encrypted ? "backup.edgeever.enc" : "backup.zip");
    const job = await launch({ operation: "export", context: { baseUrl: source.baseUrl, accountId: null, token: "", locale: "en-US" }, path: archive, password: encrypted ? "  备份 password  " : undefined, version: { edgeeverVersion: "2.2.0", buildId: "e2e" } });
    const done = await job.next("done");
    expect(done.result.manifest.counts).toEqual(sourceState.counts);
    source.server.stop(true);
    const target = await instance();
    if (!encrypted) {
      const wrong = await launch({ operation: "import", context: { baseUrl: target.baseUrl, accountId: "another-account", token: "" }, path: archive, stagingDirectory: await directory() });
      await expect(wrong.next("ready")).rejects.toMatchObject({ code: "backup_account_changed" });
      expect(target.db.query("SELECT id FROM memos WHERE id = ?").get(memo.id)).toBeNull();
      const cancelledDirectory = await directory();
      const cancelled = await launch({ operation: "import", context: { baseUrl: target.baseUrl, accountId: null, token: "" }, path: archive, stagingDirectory: cancelledDirectory });
      await cancelled.next("ready"); cancelled.worker.postMessage({ type: "cancel" });
      await expect(cancelled.next("done")).rejects.toMatchObject({ code: "backup_cancelled" });
      expect(await readdir(cancelledDirectory)).toEqual([]);
      expect(target.db.query("SELECT id FROM memos WHERE id = ?").get(memo.id)).toBeNull();
    }
    const restore = await launch({ operation: "import", context: { baseUrl: target.baseUrl, accountId: null, token: "" }, path: archive, password: encrypted ? "  备份 password  " : undefined, stagingDirectory: await directory() });
    const ready = await restore.next("ready");
    expect(ready.result.manifest.counts).toEqual(sourceState.counts);
    expect(target.db.query("SELECT id FROM memos WHERE id = ?").get(memo.id)).toBeNull();
    restore.worker.postMessage({ type: "confirm" });
    await restore.next("done");
    const restored = await target.client.getMemo(memo.id);
    expect(restored.memo.contentMarkdown).toBe("**portable note**");
    const response = await target.client.getResourceResponse(`/api/v1/resources/${resource.id}/blob`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  }
}, 30000);

for (const jsonError of [true, false]) test(`preserves and diagnoses a third-resource HTTP 503 (${jsonError ? "API JSON" : "non-JSON response"})`, async () => {
  const source = await instance();
  const { notebook } = await source.client.createNotebook({ name: "Restore HTTP errors" });
  const { memo } = await source.client.createMemo({ notebookId: notebook.id, contentMarkdown: "Three attachments" });
  const resourceIds = [];
  for (let i = 0; i < 3; i++) {
    const { resource } = await source.client.uploadMemoResource(memo.id, new File([new Uint8Array(32 + i).fill(i)], `file-${i}.bin`, { type: "application/octet-stream" }));
    resourceIds.push(resource.id);
  }
  const archive = join(await directory(), "backup.edgeever.enc");
  const exported = await launch({ operation: "export", context: { baseUrl: source.baseUrl, accountId: null, token: "" }, path: archive, password: "fixture password", version: { edgeeverVersion: "2.2.0", buildId: "http-error" } });
  await exported.next("done");
  const initializations = [];
  let failedPath;
  const target = await instance({ intercept(request) {
    const path = new URL(request.url).pathname;
    const resourceId = /^\/api\/v1\/restores\/json\/resources\/([^/]+)\/uploads$/.exec(path)?.[1];
    if (request.method === "POST" && resourceIds.includes(resourceId)) initializations.push(resourceId);
    if (request.method === "POST" && resourceIds.includes(resourceId) && initializations.length === 3) {
      failedPath = path;
      return jsonError
        ? Response.json({ error: { code: "object_storage_unavailable", message: "Target storage initialization unavailable", details: { token: "private-response-token", note: "private-note-content" } } }, { status: 503 })
        : new Response("<html>private proxy response</html>", { status: 503, statusText: "Service Unavailable" });
    }
  } });
  const staging = await directory();
  const restore = await launch({ operation: "import", context: { baseUrl: target.baseUrl, accountId: null, token: "private-request-token" }, path: archive, password: "fixture password", stagingDirectory: staging });
  await restore.next("ready"); restore.worker.postMessage({ type: "confirm" });
  const failure = await restore.next("done").catch(error => error);
  expect(failure).toMatchObject({ status: 503, code: jsonError ? "object_storage_unavailable" : "backup_request_failed", message: jsonError ? "Target storage initialization unavailable" : "Service Unavailable" });
  expect(initializations).toHaveLength(3);
  for (const id of initializations.slice(0, 2)) expect(target.db.query("SELECT id FROM resources WHERE id = ?").get(id)).toEqual({ id });
  expect(target.db.query("SELECT id FROM resources WHERE id = ?").get(initializations[2])).toBeNull();
  expect(await readdir(staging)).toEqual([]);
  const diagnostic = restore.messages.find(message => message.type === "request-error")?.result;
  expect(diagnostic).toEqual({ method: "POST", path: failedPath, status: 503, code: jsonError ? "object_storage_unavailable" : "backup_request_failed", message: jsonError ? "Target storage initialization unavailable" : "Service Unavailable" });
  for (const secret of ["private-response-token", "private-request-token", "private-note-content", "private proxy response", "fixture password"]) expect(JSON.stringify(diagnostic)).not.toContain(secret);
}, 10000);

test('unchanged scheduled sources read only state and changed sources produce an archive', async () => {
  const requests = [];
  const source = await instance({ intercept(request) { requests.push(new URL(request.url).pathname); } });
  await source.client.listNotebooks();
  const state = await (await fetch(`${source.baseUrl}/api/v1/backups/state`)).json();
  const previousState = { identity: state.identity, workspaceId: state.workspaceId, backupRevision: state.backupRevision };
  requests.length = 0;
  const root = await directory();
  const input = { operation: 'export', context: { baseUrl: source.baseUrl, accountId: null, token: '' }, path: join(root, 'new.zip.part'), previousState, version: { edgeeverVersion: '2.2.0', buildId: 'skip' } };
  const unchanged = await launch(input);
  expect((await unchanged.next('done')).result).toMatchObject({ skipped: true, sourceState: previousState });
  expect(await readdir(root)).toEqual([]);
  expect(requests).toEqual(['/api/v1/backups/state']);
  await source.client.createNotebook({ name: 'Changed' });
  const changed = await launch(input);
  const result = (await changed.next('done')).result;
  expect(result.skipped).not.toBe(true);
  expect(result.sourceState.backupRevision).not.toBe(previousState.backupRevision);
  expect(result.size).toBeGreaterThan(0);
}, 10000);


test("manager creates named files, restores from history and deletes only the selected archive", async () => {
  await prepareBundle();
  const source = await instance();
  const { notebook } = await source.client.createNotebook({ name: "Named backups" });
  const { memo } = await source.client.createMemo({ notebookId: notebook.id, title: "Original", contentMarkdown: "Restorable content" });
  const bytes = new Uint8Array(65539).fill(73);
  const { resource } = await source.client.uploadMemoResource(memo.id, new File([bytes], "named.bin", { type: "application/octet-stream" }));
  const root = await directory();
  const manager = new BackupManager({
    userData: join(root, "private"), defaultDirectory: join(root, "backups"),
    secureStorage: { isEncryptionAvailable: () => true, isAsyncEncryptionAvailable: async () => true },
    version: { edgeeverVersion: "2.2.0", buildId: "named-e2e" },
    workerFactory(data) {
      const child = fork(new URL("./tests/node-worker-runner.mjs", import.meta.url), [bundle], { execPath: nodeBinary, stdio: ["ignore", "ignore", "inherit", "ipc"] });
      child.send(data);
      return { on: child.on.bind(child), postMessage: child.send.bind(child), terminate: () => child.kill("SIGTERM") };
    },
  });
  cleanups.push(() => manager.close());
  await manager.setContext({ baseUrl: source.baseUrl, accountId: "local", token: "" });
  await manager.save({ ...manager.status().config, retention: 3 });
  const id = manager.status().backupSetId;
  for (const encrypted of [false, true]) {
    await manager.run(encrypted ? "fixture password" : undefined, id, undefined, { name: encrypted ? "Encrypted snapshot.zip" : "Plain snapshot", encrypted });
    await manager.waitForIdle(); expect(manager.status().error).toBeNull();
  }
  const status = manager.status();
  expect(status.history.map(entry => entry.name)).toEqual(["Plain snapshot.zip", "Encrypted snapshot.edgeever.enc"]);
  expect(status.config.encrypted).toBe(false); expect(status.passwordSet).toBe(false);
  expect((await readdir(status.actualDirectory)).sort()).toEqual(["Encrypted snapshot.edgeever.enc", "Plain snapshot.zip"]);
  const selection = await manager.selectHistory("Encrypted snapshot.edgeever.enc", id);
  expect(selection.encrypted).toBe(true);
  await source.client.deleteMemo(memo.id);
  let ready;
  const checked = new Promise(resolve => { ready = resolve; });
  manager.onChange = (value) => { if (value?.task?.phase === "ready") ready(); };
  await manager.prepareImport(selection.id, "fixture password"); await checked;
  manager.confirmImport(); await manager.waitForIdle();
  expect(manager.status().importError).toBeNull();
  expect((await source.client.getMemo(memo.id)).memo.contentMarkdown).toBe("Restorable content");
  const response = await source.client.getResourceResponse(`/api/v1/resources/${resource.id}/blob`);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  await manager.deleteHistory("Plain snapshot.zip", id);
  expect(await readdir(status.actualDirectory)).toEqual(["Encrypted snapshot.edgeever.enc"]);
  expect(manager.status().history.map(entry => entry.name)).toEqual(["Encrypted snapshot.edgeever.enc"]);
}, 15000);
