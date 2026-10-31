import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile, symlink, chmod, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BackupManager } from "./backup-manager.mjs";

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "edgeever-backup-manager-"));
  const workers = [];
  const manager = new BackupManager({
    userData: join(root, "private"), defaultDirectory: join(root, "backups"),
    secureStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`sealed:${s}`), decryptString: (b) => b.toString().slice(7), isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (s) => Buffer.from(`sealed:${s}`), decryptStringAsync: async (b) => ({ result: b.toString().slice(7), shouldReEncrypt: false }) },
    workerFactory: (data) => { const worker = new EventEmitter(); worker.data = data; worker.postMessage = (message) => { if (message.type === "cancel") worker.emit("message", { type: "error", error: { code: "backup_cancelled", message: "Cancelled" } }); }; workers.push(worker); return worker; },
  });
  await manager.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
  return { root, manager, workers, cleanup: async () => { await manager.close(); await rm(root, { recursive: true, force: true }); } };
};
const complete = async (f) => { const worker = f.workers.at(-1); await writeFile(worker.data.path, "complete archive"); worker.emit("message", { type: "done", result: { size: 16, manifest: { counts: { memos: 1 } } } }); await f.manager.waitForIdle(); };

test("publishes only completed jobs, retains registered files and isolates account changes", async () => {
  const f = await fixture();
  try {
    let status = f.manager.status();
    expect(status.config.enabled).toBe(false); expect(status.config.retention).toBe(1);
    await f.manager.save({ ...status.config, retention: 3 });
    for (let i = 0; i < 4; i++) { await f.manager.run(); await complete(f); }
    status = f.manager.status(); expect(status.history).toHaveLength(3);
    const folder = status.actualDirectory;
    await writeFile(join(folder, "manual.zip"), "keep");
    await f.manager.run(); const late = f.workers.at(-1);
    await f.manager.setContext({ baseUrl: "http://localhost:2222", accountId: "b", token: "session-b" });
    late.emit("message", { type: "done", result: { size: 16 } });
    expect(f.manager.status().history).toHaveLength(0);
    expect(await readFile(join(folder, "manual.zip"), "utf8")).toBe("keep");
    expect((await readdir(folder)).filter((n) => n.endsWith(".zip"))).toHaveLength(4);
    expect(f.manager.status().lastSuccessAt).toBeNull();
  } finally { await f.cleanup(); }
});

test("default retention keeps the latest successful archive through failures and reloads", async () => {
  const f = await fixture();
  try {
    await f.manager.run(); await complete(f);
    const first = f.manager.status().history[0];
    await f.manager.run();
    f.workers.at(-1).emit("message", { type: "error", error: { code: "backup_source_changed", message: "Changed" } });
    await f.manager.waitForIdle();
    expect(f.manager.status().history).toEqual([first]);
    expect(await readFile(join(f.manager.status().actualDirectory, first.name), "utf8")).toBe("complete archive");
    await f.manager.run(); await complete(f);
    const status = f.manager.status();
    expect(status.history).toHaveLength(1);
    expect(status.history[0].name).not.toBe(first.name);
    expect((await readdir(status.actualDirectory)).filter((name) => name.endsWith(".zip"))).toEqual([status.history[0].name]);
    await f.manager.setContext(null);
    await f.manager.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(f.manager.status().config.retention).toBe(1);
    expect(f.manager.status().history).toEqual(status.history);
  } finally { await f.cleanup(); }
});

test("loading an existing configuration preserves the previous default of five copies", async () => {
  const f = await fixture();
  try {
    const record = JSON.parse(await readFile(f.manager.statePath(), "utf8"));
    record.config.retention = 5;
    await writeFile(f.manager.statePath(), JSON.stringify(record));
    await f.manager.setContext(null);
    await f.manager.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(f.manager.status().config).toEqual(record.config);
    expect(f.manager.status().error).toBeNull();
  } finally { await f.cleanup(); }
});

test("failure and cancellation preserve success and never rotate; credentials stay out of config", async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, encrypted: true, retention: 3 }, "  密码  ");
    await f.manager.run(); expect(f.workers.at(-1).data.password).toBe("  密码  "); await complete(f);
    const successful = f.manager.status().lastSuccessAt;
    await f.manager.run();
    await expect(f.manager.save(f.manager.status().config)).rejects.toThrow();
    f.workers.at(-1).emit("message", { type: "error", error: { code: "backup_source_changed", message: "Changed" } });
    await f.manager.waitForIdle();
    expect(f.manager.status().lastSuccessAt).toBe(successful);
    expect(f.manager.status().history).toHaveLength(1);
    await f.manager.run(); await f.manager.cancel();
    expect(f.manager.status().history).toHaveLength(1);
    const state = await readFile(f.manager.statePath(), "utf8");
    expect(state).not.toContain("密码"); expect(state).not.toContain("session-a");
    expect(f.manager.status().passwordSet).toBe(true);
    const external = join(f.root, "external"); await writeFile(external, "keep");
    const oldest = f.manager.status().history[0]; await rm(join(f.manager.status().actualDirectory, oldest.name));
    await symlink(external, join(f.manager.status().actualDirectory, oldest.name));
    for (let i = 0; i < 3; i++) { await f.manager.run(); await complete(f); }
    expect(await readFile(external, "utf8")).toBe("keep");
    expect(f.manager.status().warning?.code).toBe("backup_cleanup_failed");
  } finally { await f.cleanup(); }
});

test("basic_text cannot persist a password and a one-time encrypted run never downgrades", async () => {
  const f = await fixture();
  try {
    f.manager.platform = "linux";
    f.manager.secureStorage.getSelectedStorageBackend = () => "basic_text";
    await expect(f.manager.save({ ...f.manager.status().config, encrypted: true }, "secret")).rejects.toThrow();
    await f.manager.save({ ...f.manager.status().config, encrypted: true });
    await expect(f.manager.run()).rejects.toThrow();
    await f.manager.run("once only"); expect(f.workers.at(-1).data.password).toBe("once only");
    await f.manager.cancel(); expect(f.manager.status().passwordSet).toBe(false);
  } finally { await f.cleanup(); }
});

test("scheduled failures wait one hour while manual retries remain immediate", async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, enabled: true });
    await f.manager.tick(); expect(f.workers).toHaveLength(1);
    const attempt = Date.parse(f.manager.status().lastAttemptAt);
    f.workers[0].emit("message", { type: "error", error: { code: "backup_source_changed", message: "Changed" } }); await f.manager.waitForIdle();
    await f.manager.tick(attempt + 3599999); expect(f.workers).toHaveLength(1);
    await f.manager.run(); expect(f.workers).toHaveLength(2); await f.manager.cancel();
    await f.manager.tick(Date.parse(f.manager.status().lastAttemptAt) + 3600001); expect(f.workers).toHaveLength(3); await complete(f);
    expect(f.manager.status().nextDueAt).not.toBeNull();
  } finally { await f.cleanup(); }
});

test("interrupted publication is verified before success and only registered staging is cleaned", async () => {
  const f = await fixture(); let recovered;
  try {
    await f.manager.run(); await complete(f);
    const state = JSON.parse(await readFile(f.manager.statePath(), "utf8"));
    const entry = state.history.pop(); state.lastSuccessAt = null; state.pending = entry;
    const path = f.manager.statePath(); await f.manager.close(); await writeFile(path, JSON.stringify(state));
    recovered = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await recovered.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(recovered.status().lastSuccessAt).toBeNull(); expect(f.workers.at(-1).data.operation).toBe("verify");
    f.workers.at(-1).emit("message", { type: "done", result: {} }); await recovered.waitForIdle();
    expect(recovered.status().history).toHaveLength(1); expect(recovered.status().lastSuccessAt).toBe(entry.completedAt);
  } finally { await recovered?.close(); await f.cleanup(); }
});

test("a context switch while preparing a job cannot launch it with the old credentials", async () => {
  const f = await fixture(); let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.manager.password = async () => { entered(); await gate; return undefined; };
  try {
    const run = f.manager.run(); await started;
    const switched = f.manager.setContext({ baseUrl: "http://localhost:2222", accountId: "b", token: "session-b" });
    release();
    const result = await run.then(() => "launched", error => error.code);
    await switched;
    expect(result).toBe("backup_cancelled"); expect(f.workers).toHaveLength(0);
    expect(f.manager.status().target.accountId).toBe("b");
  } finally { release(); await f.cleanup(); }
});

test("the existing local workspace can back up when instance authentication is disabled", async () => {
  const f = await fixture();
  try {
    await f.manager.setContext({ baseUrl: "http://localhost:3333", accountId: "local", token: "" });
    expect(f.manager.status()?.target.accountId).toBe("local");
    await f.manager.run(); expect(f.workers.at(-1).data.context.token).toBe(""); await complete(f);
  } finally { await f.cleanup(); }
});

test("temporarily unavailable secure storage pauses encrypted work without plaintext fallback", async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, encrypted: true }, "saved password");
    f.manager.secureStorage.isAsyncEncryptionAvailable = async () => false;
    const result = await f.manager.run().then(() => "launched", error => error.code);
    expect(result).toBe("backup_secure_storage_unavailable"); expect(f.workers).toHaveLength(0);
    expect(f.manager.status().secureStorageAvailable).toBe(false);
    await f.manager.run("one-time password"); expect(f.workers.at(-1).data.password).toBe("one-time password"); await f.manager.cancel();
  } finally { await f.cleanup(); }
});

test("unreadable backup settings do not block account readiness or overwrite recovery records", async () => {
  const f = await fixture(); let next;
  try {
    const path = f.manager.statePath(); await writeFile(path, "incomplete JSON"); await f.manager.close();
    next = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await next.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(next.status().blocked).toBe(true); expect(next.status().error.code).toBe("backup_configuration_unavailable");
    await expect(next.run()).rejects.toThrow(); expect(await readFile(path, "utf8")).toBe("incomplete JSON");
  } finally { await next?.close(); await f.cleanup(); }
});

test("a missing renderer cannot fail or strand the background job", async () => {
  const f = await fixture();
  try { f.manager.onChange = () => { throw new Error("Renderer unavailable"); }; await f.manager.run(); await complete(f); expect(f.manager.status().history).toHaveLength(1); }
  finally { await f.cleanup(); }
});

test("the default backup set survives restart before the first backup", async () => {
  const f = await fixture(); let next;
  try {
    const id = f.manager.status().backupSetId; await f.manager.close();
    next = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await next.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(next.status().backupSetId).toBe(id); expect(next.status().config.enabled).toBe(false);
  } finally { await next?.close(); await f.cleanup(); }
});

test("a failed completion journal preserves the previous success and leaves a recoverable publication", async () => {
  const f = await fixture();
  try {
    await f.manager.run(); await complete(f); const previous = f.manager.status().lastSuccessAt;
    const persist = f.manager.persist.bind(f.manager); let failed = false;
    f.manager.persist = async () => { if (!failed && f.manager.record.history.length === 2 && !f.manager.record.pending) { failed = true; throw Object.assign(new Error("Disk full"), { code: "ENOSPC" }); } await persist(); };
    await f.manager.run(); await complete(f);
    expect(f.manager.status().lastSuccessAt).toBe(previous); expect(f.manager.status().history).toHaveLength(1);
    expect(f.manager.record.pending).toBeDefined(); expect(f.manager.status().error.code).toBe("ENOSPC");
    expect((await readdir(f.manager.status().actualDirectory)).filter(name => name.endsWith(".zip"))).toHaveLength(2);
  } finally { await f.cleanup(); }
});


test("an account transition rejects queued actions from the previous ready context", async () => {
  const f = await fixture();
  try {
    const oldSet = f.manager.status().backupSetId;
    await f.manager.run();
    const switching = f.manager.setContext({ baseUrl: "http://localhost:2222", accountId: "b", token: "session-b" });
    const queued = f.manager.run(undefined, oldSet).then(() => "started", error => error.code);
    await switching;
    expect(await queued).toBe("backup_account_changed");
    expect(f.workers).toHaveLength(1);
    expect(f.manager.status().history).toEqual([]);
    expect(f.manager.status().target.accountId).toBe("b");
  } finally { await f.cleanup(); }
});

test("a successfully disabled schedule cannot start a queued automatic run", async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, enabled: true });
    f.manager.record.nextDueAt = "old-timezone-result";
    const persist = f.manager.persist.bind(f.manager); let release; let enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let first = true;
    f.manager.persist = async () => { if (first) { first = false; enter(); await gate; } await persist(); };
    const tick = f.manager.tick(); await entered;
    const disable = f.manager.save({ ...f.manager.status().config, enabled: false });
    release(); await disable; await tick;
    expect(f.manager.status().config.enabled).toBe(false);
    expect(f.workers).toHaveLength(0);
    await f.manager.run(); expect(f.workers).toHaveLength(1);
  } finally { await f.cleanup(); }
});

for (const saved of [true, false]) test(`pending encrypted publication accepts its original password (${saved ? "rotated saved password" : "unsaved one-time password"})`, async () => {
  const f = await fixture();
  try {
    if (!saved) { f.manager.platform = "linux"; f.manager.secureStorage.getSelectedStorageBackend = () => "basic_text"; }
    await f.manager.save({ ...f.manager.status().config, encrypted: true }, saved ? "original" : undefined);
    const persist = f.manager.persist.bind(f.manager); let failed = false;
    f.manager.persist = async () => { if (!failed && f.manager.record.history.length === 1 && !f.manager.record.pending) { failed = true; throw Object.assign(new Error("Disk full"), { code: "ENOSPC" }); } await persist(); };
    await f.manager.run(saved ? undefined : "original"); await complete(f);
    const pendingTime = f.manager.record.pending.completedAt;
    if (saved) await f.manager.save(f.manager.status().config, "replacement");
    await f.manager.run("original");
    const verify = f.workers.at(-1);
    expect(verify.data.operation).toBe("verify"); expect(verify.data.password).toBe("original");
    verify.emit("message", { type: "done", result: {} }); await f.manager.waitForIdle();
    expect(f.manager.status().pendingPublication).toBeNull();
    expect(f.manager.status().lastSuccessAt).toBe(pendingTime);
    expect(f.manager.status().passwordSet).toBe(saved);
    await f.manager.run(saved ? undefined : "next one-time");
    expect(f.workers.at(-1).data.password).toBe(saved ? "replacement" : "next one-time");
  } finally { await f.cleanup(); }
});

test.skipIf(process.platform === "win32")("failed private staging cleanup keeps its registration until cleanup succeeds", async () => {
  const f = await fixture(); let staging;
  try {
    const archive = join(f.root, "input.zip"); await writeFile(archive, "PK fixture");
    f.manager.record.warning = { code: "backup_cleanup_failed" };
    const file = await f.manager.selectImport(archive); await f.manager.prepareImport(file.id);
    staging = f.workers.at(-1).data.stagingDirectory;
    const id = f.manager.record.stagingId;
    await writeFile(join(staging, "verified.zip"), "private plaintext"); await chmod(staging, 0o500);
    await f.manager.cancel();
    expect(f.manager.status().importWarning.code).toBe("backup_staging_cleanup_failed");
    expect(f.manager.status().warning).toEqual({ code: "backup_cleanup_failed" });
    await expect(f.manager.prepareImport(file.id)).rejects.toMatchObject({ code: "backup_staging_cleanup_failed" });
    expect(f.manager.record.stagingId).toBe(id);
    await chmod(staging, 0o700);
    await f.manager.prepareImport(file.id);
    expect(f.manager.record.stagingId).not.toBe(id);
    expect(f.manager.status().importWarning).toBeNull();
    expect(f.manager.status().warning).toEqual({ code: "backup_cleanup_failed" });
    expect(await readdir(staging).catch(error => error.code)).toBe("ENOENT");
  } finally { if (staging) await chmod(staging, 0o700).catch(() => {}); await f.cleanup(); }
});

test("startup restores the saved backup account without a renderer", async () => {
  const f = await fixture(); let next;
  try {
    await f.manager.save({ ...f.manager.status().config, enabled: true }); await f.manager.close();
    next = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    let authRequests = 0;
    await next.restoreContext({ baseUrl: "http://localhost:1111", token: "session-a" }, async (url, init) => { authRequests++; expect(url).toBe("http://localhost:1111/api/v1/auth/session"); expect(init.headers.Authorization).toBe("Bearer session-a"); return Response.json({ authenticated: true, user: { id: "a" } }); });
    await next.tick();
    expect(authRequests).toBe(1); expect(next.status().target.accountId).toBe("a");
    expect(f.workers.at(-1).data.context.accountId).toBe("a");
  } finally { await next?.close(); await f.cleanup(); }
});

test("logout cancels an unresolved startup session without restoring its account later", async () => {
  const f = await fixture(); let next;
  try {
    next = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    let release; let signal;
    const restoring = next.restoreContext({ baseUrl: "http://localhost:1111", token: "session-a" }, async (_url, init) => { signal = init.signal; return new Promise(resolve => { release = () => resolve(Response.json({ authenticated: true, user: { id: "a" } })); }); });
    await next.setContext(null); release(); await restoring;
    expect(signal.aborted).toBe(true); expect(next.status()).toBeNull();
  } finally { await next?.close(); await f.cleanup(); }
});


test.skipIf(process.platform === "win32")("failed part cleanup cannot be overwritten by the next backup", async () => {
  const f = await fixture(); let folder;
  try {
    await f.manager.run(); const part = f.manager.record.activePart;
    folder = f.manager.status().actualDirectory;
    await writeFile(f.workers.at(-1).data.path, "unfinished"); await chmod(folder, 0o500);
    await f.manager.cancel();
    expect(f.manager.status().warning.code).toBe("backup_part_cleanup_failed");
    await expect(f.manager.run()).rejects.toMatchObject({ code: "backup_part_cleanup_failed" });
    expect(f.manager.record.activePart).toEqual(part);
    await chmod(folder, 0o700); await f.manager.run();
    expect(f.manager.record.activePart.name).not.toBe(part.name);
    expect(await readFile(join(folder, part.name)).catch(error => error.code)).toBe("ENOENT");
  } finally { if (folder) await chmod(folder, 0o700).catch(() => {}); await f.cleanup(); }
});

test.skipIf(process.platform === "win32")("part cleanup never follows a replaced backup root", async () => {
  const f = await fixture(); let moved;
  try {
    await f.manager.run(); const status = f.manager.status(); const part = f.manager.record.activePart;
    moved = `${status.config.directory}-original`;
    await rename(status.config.directory, moved);
    const external = join(f.root, "external"); const externalSet = join(external, status.backupSetId);
    await mkdir(externalSet, { recursive: true }); await writeFile(join(externalSet, part.name), "external file");
    await symlink(external, status.config.directory, "dir");
    await f.manager.cancel();
    expect(await readFile(join(externalSet, part.name), "utf8")).toBe("external file");
    expect(f.manager.record.activePart).toEqual(part);
    expect(f.manager.status().warning.code).toBe("backup_part_cleanup_failed");
  } finally {
    if (moved) { await rm(f.manager.defaultDirectory, { force: true }); await rename(moved, f.manager.defaultDirectory); }
    await f.cleanup();
  }
});

test.skipIf(process.platform === "win32")("pending verification preserves external parts when its root was replaced", async () => {
  const f = await fixture(); let moved;
  try {
    const status = f.manager.status(); const name = "interrupted.zip";
    await mkdir(status.actualDirectory, { recursive: true });
    f.manager.record.pending = { name, directory: status.config.directory, completedAt: new Date().toISOString(), size: 16, encrypted: false };
    moved = `${status.config.directory}-original`; await rename(status.config.directory, moved);
    const external = join(f.root, "external"); const externalSet = join(external, status.backupSetId);
    await mkdir(externalSet, { recursive: true }); await writeFile(join(externalSet, `${name}.part`), "external file");
    await symlink(external, status.config.directory, "dir");
    await f.manager.run();
    expect(await readFile(join(externalSet, `${name}.part`), "utf8")).toBe("external file");
    expect(f.manager.record.pending.name).toBe(name);
    expect(f.manager.status().error.code).toBe("backup_publication_unverified");
  } finally {
    if (moved) { await rm(f.manager.defaultDirectory, { force: true }); await rename(moved, f.manager.defaultDirectory); }
    await f.cleanup();
  }
});

test.skipIf(process.platform === "win32")("publication cannot rename an external part through a replaced backup root", async () => {
  const f = await fixture(); let moved;
  try {
    await f.manager.run(); const status = f.manager.status(); const worker = f.workers.at(-1); const part = f.manager.record.activePart;
    await writeFile(worker.data.path, "complete archive");
    moved = `${status.config.directory}-original`; await rename(status.config.directory, moved);
    const external = join(f.root, "external"); const externalSet = join(external, status.backupSetId);
    await mkdir(externalSet, { recursive: true }); await writeFile(join(externalSet, part.name), "external file");
    await symlink(external, status.config.directory, "dir");
    worker.emit("message", { type: "done", result: { size: 16, manifest: { counts: { memos: 1 } } } }); await f.manager.waitForIdle();
    expect(await readFile(join(externalSet, part.name), "utf8")).toBe("external file");
    expect(f.manager.status().lastSuccessAt).toBeNull(); expect(f.manager.status().history).toEqual([]);
    expect(f.manager.record.pending).toBeDefined();
  } finally {
    if (moved) { await rm(f.manager.defaultDirectory, { force: true }); await rename(moved, f.manager.defaultDirectory); }
    await f.cleanup();
  }
});

test("import failure and successful retry preserve automatic-backup errors and history", async () => {
  const f = await fixture();
  try {
    await f.manager.run(); await complete(f);
    f.manager.record.error = { code: "backup_source_changed", message: "Backup source changed" };
    f.manager.record.warning = { code: "backup_cleanup_failed" };
    const backupFields = () => {
      const { error, warning, lastAttemptAt, lastSuccessAt, history } = f.manager.status();
      return { error, warning, lastAttemptAt, lastSuccessAt, history };
    };
    const before = backupFields();
    const archive = join(f.root, "input.edgeever.enc"); await writeFile(archive, "EDGB fixture");
    const file = await f.manager.selectImport(archive);
    await f.manager.prepareImport(file.id, "wrong");
    expect(backupFields()).toEqual(before);
    f.workers.at(-1).emit("message", { type: "error", error: { code: "backup_decrypt_failed" } });
    await f.manager.waitForIdle();
    expect(f.manager.status().importError).toEqual({ code: "backup_decrypt_failed", message: "Backup failed" });
    expect(backupFields()).toEqual(before);
    expect(f.manager.status().lastRestoreAt).toBeNull();
    await f.manager.prepareImport(file.id, "correct");
    expect(f.manager.status().importError).toBeNull();
    const worker = f.workers.at(-1);
    worker.emit("message", { type: "ready", result: { manifest: { counts: { memos: 1 } } } });
    f.manager.confirmImport();
    worker.emit("message", { type: "done", result: {} }); await f.manager.waitForIdle();
    expect(f.manager.status().lastRestoreAt).not.toBeNull();
    expect(f.manager.status().importError).toBeNull();
    expect(backupFields()).toEqual(before);
    const persisted = JSON.parse(await readFile(f.manager.statePath(), "utf8"));
    expect(persisted.error).toEqual(before.error); expect(persisted.importError).toBeNull();
  } finally { await f.cleanup(); }
});

for (const pending of [false, true]) test(`legacy decryption errors belong to ${pending ? "pending backup verification" : "import"}`, async () => {
  const f = await fixture(); let next;
  try {
    await f.manager.run(); await complete(f);
    const state = JSON.parse(await readFile(f.manager.statePath(), "utf8"));
    state.error = { code: "backup_decrypt_failed", message: "Incorrect password" };
    if (pending) { state.pending = state.history.pop(); state.lastSuccessAt = null; }
    const path = f.manager.statePath(); await f.manager.close(); await writeFile(path, JSON.stringify(state));
    next = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await next.setContext({ baseUrl: "http://localhost:1111", accountId: "a", token: "session-a" });
    expect(next.status().error).toEqual(pending ? state.error : null);
    expect(next.status().importError).toEqual(pending ? null : state.error);
    expect(next.status().lastSuccessAt).toBe(state.lastSuccessAt);
    expect(next.status().history).toEqual(state.history);
  } finally { await next?.close(); await f.cleanup(); }
});

test("preserves HTTP status and emits only redacted request diagnostics without affecting failure handling", async () => {
  const f = await fixture();
  try {
    const archive = join(f.root, "input.zip"); await writeFile(archive, "PK fixture");
    const file = await f.manager.selectImport(archive); await f.manager.prepareImport(file.id);
    const worker = f.workers.at(-1);
    worker.emit("message", { type: "progress", result: { stage: "restoring", completed: 2, total: 3 } });
    const events = [];
    f.manager.onDiagnostic = (event, data) => events.push({ event, ...data });
    const diagnostic = { method: "POST", path: "/api/v1/restores/json/resources/res_fixture/uploads?token=private-query", status: 503, code: "object_storage_unavailable", message: "Storage unavailable; token=private-token; Authorization: Bearer private-bearer", headers: { Authorization: "private-header" }, body: "private-note-content", password: "private-password" };
    worker.emit("message", { type: "request-error", result: diagnostic });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "backup.request-failed", kind: "import", phase: "restoring", method: "POST", path: "/api/v1/restores/json/resources/res_fixture/uploads", status: 503, code: "object_storage_unavailable" });
    expect(events[0].message).toContain("[redacted]");
    for (const secret of ["private-query", "private-token", "private-bearer", "private-header", "private-note-content", "private-password"]) expect(JSON.stringify(events)).not.toContain(secret);
    f.manager.onDiagnostic = () => { throw new Error("Diagnostic destination unavailable"); };
    expect(() => worker.emit("message", { type: "request-error", result: diagnostic })).not.toThrow();
    worker.emit("message", { type: "error", error: { status: 503, code: "object_storage_unavailable", message: "Target storage unavailable" } });
    await f.manager.waitForIdle();
    expect(f.manager.status().importError).toEqual({ status: 503, code: "object_storage_unavailable", message: "Target storage unavailable" });
    expect(f.manager.status().error).toBeNull(); expect(f.manager.status().lastRestoreAt).toBeNull();
    expect(JSON.parse(await readFile(f.manager.statePath(), "utf8")).importError.status).toBe(503);
    worker.emit("message", { type: "request-error", result: diagnostic });
    expect(events).toHaveLength(1);
  } finally { await f.cleanup(); }
});

test("records bounded transport cause codes without changing the backup failure", async () => {
  const f = await fixture();
  try {
    await f.manager.run();
    const worker = f.workers.at(-1);
    const events = [];
    f.manager.onDiagnostic = (event, details) => events.push({ event, ...details });
    worker.emit("message", { type: "request-error", result: {
      method: "GET", path: "/api/v1/resources/res_fixture/blob?token=private-query",
      code: "backup_network_failed", message: "Backup network request failed.",
      causeCodes: ["UND_ERR_SOCKET", "ECONNRESET", "token=private-token", null, "https://private.example.com"], elapsedMs: 123,
      headers: { Authorization: "private-header" }, stack: "private-stack",
    } });
    expect(events).toEqual([{
      event: "backup.request-failed", kind: "export", phase: "exporting", method: "GET",
      path: "/api/v1/resources/res_fixture/blob", code: "backup_network_failed", message: "Backup network request failed.",
      causeCodes: ["UND_ERR_SOCKET", "ECONNRESET"], elapsedMs: 123,
    }]);
    worker.emit("message", { type: "error", error: { code: "backup_failed", message: "fetch failed" } });
    await f.manager.waitForIdle();
    expect(f.manager.status().error).toEqual({ code: "backup_failed", message: "fetch failed" });
    expect(f.manager.status().history).toEqual([]);
  } finally { await f.cleanup(); }
});

const sourceState = { identity: 'instance-a', workspaceId: 'workspace-a', backupRevision: '8' };
const finishSnapshot = async (f, result = {}) => {
  const worker = f.workers.at(-1);
  if (!result.skipped) await writeFile(worker.data.path, 'complete archive');
  worker.emit('message', { type: 'done', result: { size: 16, sourceState, ...result } });
  await f.manager.waitForIdle();
};

test('named manual backups preserve formats/settings and never overwrite a collision', async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, retention: 5 });
    await f.manager.save({ ...f.manager.status().config, encrypted: true }, 'saved');
    const id = f.manager.status().backupSetId;
    await f.manager.run(undefined, id, undefined, { name: '  Travel.zip  ', encrypted: false });
    expect(f.workers.at(-1).data.password).toBeUndefined();
    await finishSnapshot(f);
    expect(f.manager.status().history[0].name).toBe('Travel.zip');
    expect(f.manager.status().config.encrypted).toBe(true);
    expect(f.manager.status().history[0].encrypted).toBe(false);
    await expect(f.manager.run(undefined, id, undefined, { name: 'Travel', encrypted: false })).rejects.toMatchObject({ code: 'backup_name_exists' });
    for (const name of ['', '../escape', 'a/b', 'a\\b', 'CON', 'a:', '.', 'file.']) {
      await expect(f.manager.run(undefined, id, undefined, { name, encrypted: false })).rejects.toMatchObject({ code: 'backup_name_invalid' });
    }
    await f.manager.run('once', id, undefined, { name: 'Encrypted.zip', encrypted: true });
    expect(f.workers.at(-1).data.password).toBe('once');
    await finishSnapshot(f);
    expect(f.manager.status().history.at(-1).name).toBe('Encrypted.edgeever.enc');
    await f.manager.run(undefined, id, undefined, { name: 'Raced', encrypted: false });
    const final = join(f.manager.status().actualDirectory, 'Raced.zip');
    await writeFile(final, 'external file');
    await finishSnapshot(f);
    expect(await readFile(final, 'utf8')).toBe('external file');
    expect(f.manager.status().error.code).toBe('backup_name_exists');
    expect(f.manager.status().pendingPublication).toBeNull();
    expect(f.manager.status().history).toHaveLength(2);
  } finally { await f.cleanup(); }
});

test('history restore/delete are scoped, reject replacements and remove only the selected file', async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, retention: 5 });
    await f.manager.run(); await complete(f);
    await f.manager.run(); await complete(f);
    const s = f.manager.status(); const [first, second] = s.history;
    const selected = await f.manager.selectHistory(first.name, s.backupSetId);
    expect(selected.name).toBe(first.name); expect(selected.encrypted).toBe(false);
    expect(f.manager.selection.path).toBe(join(s.actualDirectory, first.name));
    await expect(f.manager.deleteHistory(first.name, 'other-set')).rejects.toMatchObject({ code: 'backup_account_changed' });
    await expect(f.manager.deleteHistory('../elsewhere.zip', s.backupSetId)).rejects.toMatchObject({ code: 'backup_file_required' });
    await expect(f.manager.selectHistory('unknown.zip', s.backupSetId)).rejects.toMatchObject({ code: 'backup_file_required' });
    const external = join(f.root, 'keep'); await writeFile(external, 'preserve');
    await rm(join(s.actualDirectory, first.name)); await symlink(external, join(s.actualDirectory, first.name));
    await expect(f.manager.deleteHistory(first.name, s.backupSetId)).rejects.toMatchObject({ code: 'backup_file_replaced' });
    await expect(f.manager.selectHistory(first.name, s.backupSetId)).rejects.toMatchObject({ code: 'backup_file_replaced' });
    expect(f.manager.status().history).toHaveLength(2);
    expect(await readFile(external, 'utf8')).toBe('preserve');
    await rm(join(s.actualDirectory, first.name));
    await f.manager.deleteHistory(first.name, s.backupSetId);
    expect(f.manager.status().history.map(x => x.name)).toEqual([second.name]);
    await f.manager.deleteHistory(second.name, s.backupSetId);
    expect(f.manager.status().history).toEqual([]);
    expect(await readdir(s.actualDirectory)).toEqual([]);
  } finally { await f.cleanup(); }
});

test('automatic no-change advances checks, not archive time/retention, and invalidates its baseline correctly', async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, retention: 5 });
    await f.manager.save({ ...f.manager.status().config, enabled: true, interval: 'daily' });
    await f.manager.run(); await finishSnapshot(f);
    const first = f.manager.status(); const due = Date.parse(first.nextDueAt);
    await f.manager.tick(due + 1);
    expect(f.workers.at(-1).data.previousState).toEqual(sourceState);
    await finishSnapshot(f, { skipped: true });
    let status = f.manager.status();
    expect(status.lastSuccessAt).toBe(first.lastSuccessAt);
    expect(status.lastCheck.result).toBe('unchanged');
    expect(status.history).toHaveLength(1);
    expect(Date.parse(status.nextDueAt)).toBeGreaterThan(due);
    const count = f.workers.length; await f.manager.tick(due + 3600001); expect(f.workers).toHaveLength(count);
    await f.manager.run(); expect(f.workers.at(-1).data.previousState).toBeUndefined(); await finishSnapshot(f);
    await rm(join(status.actualDirectory, status.history[0].name));
    await f.manager.save({ ...status.config, retention: 3 });
    await f.manager.tick(Date.parse(f.manager.status().nextDueAt) + 1);
    expect(f.workers.at(-1).data.previousState).toBeUndefined(); await finishSnapshot(f);
    status = f.manager.status(); await rm(join(status.actualDirectory, status.history.at(-1).name));
    await f.manager.tick(Date.parse(status.nextDueAt) + 1);
    expect(f.workers.at(-1).data.previousState).toBeUndefined();
    await f.manager.cancel(); expect(f.manager.status().lastCheck.result).toBe('cancelled');
  } finally { await f.cleanup(); }
});

test('restart retains the unchanged schedule and resolves an interrupted running check', async () => {
  const f = await fixture(); let recovered;
  const restart = async () => {
    recovered = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await recovered.setContext({ baseUrl: 'http://localhost:1111', accountId: 'a', token: 'session-a' });
  };
  try {
    await f.manager.save({ ...f.manager.status().config, enabled: true });
    await f.manager.run(); await finishSnapshot(f);
    await f.manager.tick(Date.parse(f.manager.status().nextDueAt) + 1); await finishSnapshot(f, { skipped: true });
    const status = f.manager.status(); await f.manager.close(); await restart();
    expect(recovered.status().lastSuccessAt).toBe(status.lastSuccessAt);
    expect(recovered.status().lastCheck).toEqual(status.lastCheck);
    expect(recovered.status().nextDueAt).toBe(status.nextDueAt);
    await recovered.close(); recovered = null;
    const record = JSON.parse(await readFile(f.manager.statePath(), 'utf8'));
    record.lastCheck.result = 'running'; await writeFile(f.manager.statePath(), JSON.stringify(record));
    await restart(); expect(recovered.status().lastCheck.result).toBe('cancelled');
    expect(recovered.status().lastSuccessAt).toBe(status.lastSuccessAt);
  } finally { await recovered?.close(); await f.cleanup(); }
});

for (const replaced of [false, true]) test(`named publication recovery verifies the owned file (${replaced ? 'replacement rejected' : 'owned archive recovered'})`, async () => {
  const f = await fixture(); let recovered;
  try {
    const persist = f.manager.persist.bind(f.manager); let failed = false;
    f.manager.persist = async () => { if (!failed && f.manager.record.history.length === 1 && !f.manager.record.pending) { failed = true; throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); } await persist(); };
    await f.manager.run(undefined, f.manager.status().backupSetId, undefined, { name: 'Interrupted', encrypted: false }); await finishSnapshot(f);
    const pending = f.manager.record.pending; expect(pending.publicationIdentity).toBeDefined();
    const path = join(f.manager.status().actualDirectory, pending.name);
    if (replaced) { await rename(path, `${path}.original`); await writeFile(path, 'complete archive'); }
    const count = f.workers.length; await f.manager.close();
    recovered = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await recovered.setContext({ baseUrl: 'http://localhost:1111', accountId: 'a', token: 'session-a' });
    if (replaced) {
      expect(f.workers).toHaveLength(count); expect(recovered.status().error.code).toBe('backup_publication_unverified'); expect(recovered.status().history).toHaveLength(0);
    } else {
      expect(f.workers.at(-1).data.operation).toBe('verify'); f.workers.at(-1).emit('message', { type: 'done', result: {} }); await recovered.waitForIdle();
      expect(recovered.status().history[0].name).toBe('Interrupted.zip'); expect(recovered.status().lastCheck.result).toBe('success');
    }
    expect(await readFile(path, 'utf8')).toBe('complete archive');
  } finally { await recovered?.close(); await f.cleanup(); }
});

for (const reusedName of ['A', 'a']) test(`retention preserves a newly published archive when a missing filename is reused as ${reusedName}`, async () => {
  const f = await fixture();
  try {
    await f.manager.save({ ...f.manager.status().config, retention: 3 });
    const id = f.manager.status().backupSetId;
    await f.manager.run(undefined, id, undefined, { name: 'A', encrypted: false }); await finishSnapshot(f);
    await rm(join(f.manager.status().actualDirectory, 'A.zip'));
    for (const name of ['B', 'C', reusedName]) {
      await f.manager.run(undefined, id, undefined, { name, encrypted: false }); await finishSnapshot(f);
    }
    const status = f.manager.status();
    expect(status.history.map(entry => entry.name)).toEqual(['B.zip', 'C.zip', `${reusedName}.zip`]);
    expect(await readFile(join(status.actualDirectory, `${reusedName}.zip`), 'utf8')).toBe('complete archive');
    expect(status.lastCheck.result).toBe('success'); expect(status.warning).toBeNull();
  } finally { await f.cleanup(); }
});

test('a failed password/configuration commit preserves legacy credentials across restart and a later change invalidates the baseline', async () => {
  const f = await fixture(); let recovered;
  try {
    await f.manager.save({ ...f.manager.status().config, encrypted: true, enabled: true }, 'old password');
    // Existing installations have a single .secret file even when passwordVersion is present.
    const legacyPath = join(f.manager.userData, 'scheduled-backups', `${f.manager.scope}.secret`);
    if (f.manager.secretPath() !== legacyPath) await rename(f.manager.secretPath(), legacyPath);
    delete f.manager.record.passwordId; await f.manager.persist();
    await f.manager.run(); await finishSnapshot(f);
    const previous = structuredClone(f.manager.record);
    const persist = f.manager.persist.bind(f.manager);
    f.manager.persist = async () => { throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); };
    await expect(f.manager.save({ ...previous.config, interval: 'daily' }, 'new password')).rejects.toMatchObject({ code: 'ENOSPC' });
    f.manager.persist = persist;
    expect(f.manager.record).toEqual(previous);
    expect(await f.manager.password()).toBe('old password');
    expect((await readdir(join(f.manager.userData, 'scheduled-backups'))).filter(name => name.endsWith('.secret'))).toHaveLength(1);
    await f.manager.close();
    recovered = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage, workerFactory: f.manager.workerFactory });
    await recovered.setContext({ baseUrl: 'http://localhost:1111', accountId: 'a', token: 'session-a' });
    const due = Date.parse(recovered.status().nextDueAt) + 1;
    await recovered.tick(due);
    expect(f.workers.at(-1).data.password).toBe('old password');
    expect(f.workers.at(-1).data.previousState).toEqual(sourceState);
    await recovered.cancel();
    await recovered.save(recovered.status().config, 'new password');
    expect(recovered.record.passwordVersion).toBe(previous.passwordVersion + 1);
    expect(recovered.record.passwordId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(readFile(legacyPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await recovered.tick(due + 3600001);
    expect(f.workers.at(-1).data.password).toBe('new password');
    expect(f.workers.at(-1).data.previousState).toBeUndefined();
    await recovered.cancel();
  } finally { await recovered?.close(); await f.cleanup(); }
});

test('a credential reference cannot escape the account private directory', async () => {
  const f = await fixture(); let recovered;
  try {
    const path = f.manager.statePath(); const record = JSON.parse(await readFile(path, 'utf8'));
    record.passwordId = '../../outside'; await f.manager.close(); await writeFile(path, JSON.stringify(record));
    recovered = new BackupManager({ userData: f.manager.userData, defaultDirectory: f.manager.defaultDirectory, secureStorage: f.manager.secureStorage });
    await recovered.setContext({ baseUrl: 'http://localhost:1111', accountId: 'a', token: 'session-a' });
    expect(recovered.status().blocked).toBe(true);
    expect(recovered.status().error.code).toBe('backup_configuration_unavailable');
  } finally { await recovered?.close(); await f.cleanup(); }
});
