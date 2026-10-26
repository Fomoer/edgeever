import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

// Supply the binary and migrations from the PR's base revision, never a real profile.
const oldBinary = process.env.EDGE_EVER_LEGACY_SIDECAR_PATH;
const oldMigrations = process.env.EDGE_EVER_LEGACY_MIGRATIONS_PATH;
assert.ok(oldBinary && oldMigrations, "Set EDGE_EVER_LEGACY_SIDECAR_PATH and EDGE_EVER_LEGACY_MIGRATIONS_PATH");
const directory = await mkdtemp(join(tmpdir(), "edgeever-appearance-upgrade-"));
let active;
const bounded = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10000);
    })]);
  } finally { clearTimeout(timer); }
};
const start = async (binary, migrations) => {
  const child = spawn(binary, ["--data-dir", directory, "--migrations-dir", migrations], { stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let nextId = 0;
  const lines = createInterface({ input: child.stdout });
  let ready;
  const booted = new Promise((resolveReady, reject) => {
    ready = resolveReady;
    child.once("error", reject);
  });
  lines.on("line", line => {
    const message = JSON.parse(line);
    if (message.event === "ready") ready();
    const resolveResponse = pending.get(message.id);
    if (resolveResponse) { pending.delete(message.id); resolveResponse(message); }
  });
  const close = async () => {
    if (child.exitCode !== null) return;
    const closed = new Promise(resolveClosed => child.once("close", resolveClosed));
    child.stdin.end();
    await bounded(closed, "sidecar shutdown").catch(() => { child.kill(); return closed; });
  };
  active = { close };
  await bounded(booted, "sidecar startup");
  return {
    close,
    request: async (method, params = {}) => {
      const id = ++nextId;
      const response = new Promise(resolveResponse => pending.set(id, resolveResponse));
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      const message = await bounded(response, method);
      if (message.error) throw new Error(message.error.message);
      return message.result;
    },
  };
};
try {
  let host = await start(oldBinary, oldMigrations);
  const book = (await host.request("notebook.create", { name: "Keep notebook" })).notebook;
  const memo = (await host.request("memo.create", { notebookId: book.id, title: "Keep note", contentMarkdown: "Keep **content**", tags: ["keep"] })).memo;
  const oldQueue = (await host.request("sync.outbox.list", { limit: 1000 })).items;
  await host.close();
  const currentBinary = resolve("crates/desktop-sidecar/target/debug/edgeever-sidecar");
  host = await start(currentBinary, resolve("migrations"));
  const readBook = async () => (await host.request("notebook.list")).notebooks.find(item => item.id === book.id);
  const upgraded = await readBook();
  assert.equal(upgraded.name, book.name);
  for (const key of ["isBold", "iconInverted", "rowInverted"]) assert.equal(upgraded[key], false);
  assert.equal(upgraded.textColor, null);
  assert.deepEqual((await host.request("memo.get", { memoId: memo.id })).memo, memo);
  assert.deepEqual((await host.request("sync.outbox.list", { limit: 1000 })).items, oldQueue);
  const appearance = { icon: "alarm-clock", color: "#2563eb", textColor: "#dc2626", isBold: true, iconInverted: true, rowInverted: true };
  await host.request("notebook.update", { notebookId: book.id, ...appearance });
  await host.close();
  // Additive migrations also allow reopening the database with the old client.
  host = await start(oldBinary, oldMigrations);
  assert.equal((await host.request("memo.get", { memoId: memo.id })).memo.contentMarkdown, memo.contentMarkdown);
  await host.request("notebook.update", { notebookId: book.id, name: "Renamed with old client" });
  await host.close();
  host = await start(currentBinary, resolve("migrations"));
  const reopened = await readBook();
  assert.equal(reopened.name, "Renamed with old client");
  for (const [key, value] of Object.entries(appearance)) assert.equal(reopened[key], value);
  console.log("Notebook appearance upgrade, restart and rollback: passed; notes and pending sync preserved.");
} finally {
  await active?.close();
  await rm(directory, { recursive: true, force: true });
}
