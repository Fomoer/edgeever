import { afterEach, expect, test } from "bun:test";
import "fake-indexeddb/auto";
const { localDb } = await import("./local-db.ts");
const { api } = await import("./api.ts");
const { createLocalNotebook, createLocalMemo, getLocalMemo } = await import("./local-mirror.ts");
const { queueLocalAction, queueMemoCreate, syncQueuedChanges } = await import("./sync-queue.ts");
const { acknowledgeNotebookId, notebookRemapTables, repairQueuedNotebookReferences } = await import("./notebook-id-remap.ts");
const scope = "notebook-remap-test";
const original = { createNotebook: api.createNotebook, createMemo: api.createMemo };
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(async () => {
  Object.assign(api, original);
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete globalThis.navigator;
  await Promise.all(localDb.tables.map((table) => table.clear()));
});
const online = () => Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
const enqueueNotebook = async (name, parentId) => {
  const notebook = await createLocalNotebook(scope, { name, parentId });
  await queueLocalAction(scope, "notebook.create", notebook.id, { name, parentId, temporaryId: notebook.id });
  return notebook;
};
const enqueueMemo = async (notebookId) => {
  const memo = await createLocalMemo(scope, { notebookId, title: "Keep my note" });
  await queueMemoCreate(scope, { temporaryId: memo.id, notebookId, title: memo.title, tags: [], createdAt: memo.createdAt, updatedAt: memo.updatedAt });
  return memo;
};

test("slow notebook creation remaps existing and in-flight child writes without a UI callback", async () => {
  online();
  const parent = await enqueueNotebook("parent");
  const child = await enqueueNotebook("child", parent.id);
  const memo = await enqueueMemo(child.id);
  let lateMemo;
  const sent = [];
  api.createNotebook = async (input) => {
    sent.push(input);
    if (input.name === "parent") {
      // User keeps writing while the parent's network request is in flight.
      lateMemo = await enqueueMemo(parent.id);
      return { notebook: { ...parent, id: "nb_parent" } };
    }
    expect(input.parentId).toBe("nb_parent");
    return { notebook: { ...child, id: "nb_child", parentId: "nb_parent" } };
  };
  api.createMemo = async (input) => {
    expect(["nb_parent", "nb_child"]).toContain(input.notebookId);
    return { memo: { ...memo, ...input, id: `memo_${input.notebookId}`, revision: 1, contentHash: "hash" } };
  };
  // Equal timestamps can put children before parents; subsequent runs must settle.
  for (let index = 0; index < 4; index++) await syncQueuedChanges({ scope });
  expect(await localDb.syncQueue.count()).toBe(0);
  expect(sent).toHaveLength(2);
  expect((await getLocalMemo(scope, memo.id)).notebookId).toBe("nb_child");
  expect((await getLocalMemo(scope, lateMemo.id)).notebookId).toBe("nb_parent");
  expect(await localDb.notebooks.get([scope, parent.id])).toBeUndefined();
  expect((await localDb.notebooks.get([scope, "nb_child"])).parentId).toBe("nb_parent");
});

test("failed parents and unmapped legacy orphans stay local without invalid API requests", async () => {
  online();
  const parent = await enqueueNotebook("parent");
  const memo = await enqueueMemo(parent.id);
  await enqueueNotebook("child", parent.id);
  await enqueueMemo("local_legacy_parent_without_mapping");
  api.createNotebook = async () => { throw new Error("offline"); };
  api.createMemo = async () => { throw new Error("must not send a temporary notebook id"); };
  const result = await syncQueuedChanges({ scope });
  expect(result).toMatchObject({ attempted: 1, failed: 1 });
  expect((await localDb.syncQueue.get(`memo.create:${memo.id}`)).attemptCount).toBe(0);
  expect((await getLocalMemo(scope, memo.id)).title).toBe("Keep my note");
});

test("persisted mappings repair delayed errors, batch targets and stale-tab writes after reopening", async () => {
  const parent = await createLocalNotebook(scope, { name: "parent" });
  await localDb.transaction("rw", notebookRemapTables, () => acknowledgeNotebookId(scope, parent.id, { ...parent, id: "nb_parent" }));
  localDb.close();
  await localDb.open();
  const kinds = ["memo.create", "memo.moveBatch", "memo.merge", "notebook.create", "notebook.update", "notebook.delete"];
  for (const kind of kinds) {
    await queueLocalAction(scope, kind, parent.id, {
      notebookId: parent.id, parentId: parent.id, notebookIds: [parent.id, "nb_other"],
    });
  }
  await queueLocalAction("another-account", "memo.moveBatch", "other", { notebookId: parent.id });
  await localDb.syncQueue.toCollection().modify({ status: "error", lastError: "Notebook not found", nextAttemptAt: "2099-01-01T00:00:00Z" });
  await repairQueuedNotebookReferences(scope);
  const repaired = (await localDb.syncQueue.toArray()).filter((item) => item.scope === scope);
  expect(repaired).toHaveLength(kinds.length);
  for (const item of repaired) {
    expect(item).toMatchObject({ status: "pending", nextAttemptAt: null, lastError: null });
    expect(item.payload).toMatchObject({ notebookId: "nb_parent", parentId: "nb_parent", notebookIds: ["nb_parent", "nb_other"] });
    if (item.kind === "notebook.update" || item.kind === "notebook.delete") expect(item.memoId).toBe("nb_parent");
  }
  expect((await localDb.syncQueue.toArray()).find((item) => item.scope === "another-account").payload.notebookId).toBe(parent.id);
});

test("acknowledgement failure rolls back notebook mapping, local relationships and queue rewrites", async () => {
  online();
  const parent = await enqueueNotebook("parent");
  const memo = await enqueueMemo(parent.id);
  const child = await enqueueNotebook("child", parent.id);
  api.createNotebook = async () => ({ notebook: { ...parent, id: "nb_parent" } });
  const failDelete = () => { throw new Error("injected acknowledgement failure"); };
  localDb.syncQueue.hook("deleting", failDelete);
  try {
    expect(await syncQueuedChanges({ scope })).toMatchObject({ synced: 0, failed: 1 });
  } finally {
    localDb.syncQueue.hook("deleting").unsubscribe(failDelete);
  }
  expect(await localDb.syncMeta.count()).toBe(0);
  expect(await localDb.notebooks.get([scope, "nb_parent"])).toBeUndefined();
  expect(await localDb.notebooks.get([scope, parent.id])).toBeDefined();
  expect((await localDb.notebooks.get([scope, child.id])).parentId).toBe(parent.id);
  expect((await getLocalMemo(scope, memo.id)).notebookId).toBe(parent.id);
  expect((await localDb.syncQueue.get(`memo.create:${memo.id}`)).payload.notebookId).toBe(parent.id);
});

test("remapping preserves drafts, conflicts, in-flight claims and content containing the temporary id", async () => {
  const parent = await createLocalNotebook(scope, { name: "parent" });
  const memo = await enqueueMemo(parent.id);
  const draft = { memoId: memo.id, title: "Latest unsaved edit", contentJson: { type: "doc", content: [] }, tagsText: "", updatedAt: new Date().toISOString() };
  await localDb.drafts.put(draft);
  await queueLocalAction(scope, "notebook.update", parent.id, { notebookId: parent.id, name: parent.id });
  const conflict = (await localDb.syncQueue.toArray()).find((item) => item.kind === "notebook.update");
  await localDb.syncQueue.update(conflict.id, { status: "conflict", lastError: "Keep this conflict" });
  await queueLocalAction(scope, "memo.moveBatch", "claimed", { notebookId: parent.id });
  const claimed = (await localDb.syncQueue.toArray()).find((item) => item.kind === "memo.moveBatch");
  await localDb.syncQueue.update(claimed.id, { status: "syncing", claimId: "another-tab" });
  await localDb.transaction("rw", notebookRemapTables, () => acknowledgeNotebookId(scope, parent.id, { ...parent, id: "nb_parent" }));
  expect(await localDb.drafts.get(memo.id)).toEqual(draft);
  expect(await localDb.syncQueue.get(conflict.id)).toMatchObject({ status: "conflict", lastError: "Keep this conflict", payload: { notebookId: "nb_parent", name: parent.id } });
  expect(await localDb.syncQueue.get(claimed.id)).toMatchObject({ status: "syncing", claimId: "another-tab", payload: { notebookId: parent.id } });
});
