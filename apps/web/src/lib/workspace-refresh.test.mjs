import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BACKGROUND_WORKSPACE_REFRESH_INTERVAL_MS,
  claimBackgroundRefreshLease,
  createRefreshSingleFlight,
  releaseBackgroundRefreshLease,
  refreshWorkspaceData,
  resolveCreatedMemoSelection,
  resolveSyncedMemoId,
  shouldNavigateHomeWhenOpeningMemo,
} from "./workspace-refresh.ts";

describe("refreshWorkspaceData", () => {
  it("uses a shared 30-second background refresh interval", () => {
    assert.equal(BACKGROUND_WORKSPACE_REFRESH_INTERVAL_MS, 30_000);
  });

  it("allows only one tab to own a live background refresh lease", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };

    assert.equal(claimBackgroundRefreshLease({ storage, key: "sync", ownerId: "tab-a", now: 1_000, leaseMs: 500 }), true);
    assert.equal(claimBackgroundRefreshLease({ storage, key: "sync", ownerId: "tab-b", now: 1_100, leaseMs: 500 }), false);
    releaseBackgroundRefreshLease({ storage, key: "sync", ownerId: "tab-b" });
    assert.equal(claimBackgroundRefreshLease({ storage, key: "sync", ownerId: "tab-b", now: 1_501, leaseMs: 500 }), true);
  });

  it("coalesces concurrent and immediately repeated background refreshes", async () => {
    let now = 1_000;
    let calls = 0;
    let finish;
    const run = createRefreshSingleFlight({
      now: () => now,
      coalesceMs: 100,
      refresh: () => new Promise((resolve) => {
        calls += 1;
        finish = resolve;
      }),
    });

    const first = run();
    const concurrent = run();
    assert.equal(first, concurrent);
    assert.equal(calls, 1);
    finish("done");
    assert.equal(await first, "done");
    assert.equal(await run(), null);
    now += 101;
    finish = undefined;
    const next = run();
    assert.equal(calls, 2);
    finish("again");
    assert.equal(await next, "again");
  });

  it("keeps the trash route when opening a deleted memo", () => {
    assert.equal(shouldNavigateHomeWhenOpeningMemo("trash"), false);
    assert.equal(shouldNavigateHomeWhenOpeningMemo("notebook"), true);
  });

  it("keeps the active memo attached when desktop sync replaces a temporary id", () => {
    const mappings = new Map([["memo_local_1", "memo_remote_1"]]);

    assert.equal(resolveSyncedMemoId(mappings, "memo_local_1"), "memo_remote_1");
    assert.equal(resolveSyncedMemoId(mappings, "memo_existing"), "memo_existing");
    assert.equal(resolveSyncedMemoId(mappings, null), null);
  });

  it("remaps a created memo selection without closing over the selected memo state", () => {
    assert.equal(resolveCreatedMemoSelection("memo_local_1", null, "memo_local_1", "memo_remote_1"), "memo_remote_1");
    assert.equal(resolveCreatedMemoSelection("memo_other", "memo_local_1", "memo_local_1", "memo_remote_1"), "memo_remote_1");
    assert.equal(resolveCreatedMemoSelection("memo_other", null, "memo_local_1", "memo_remote_1"), "memo_other");
  });

  it("pushes local changes before pulling and invalidating during a manual refresh", async () => {
    const calls = [];
    const result = await refreshWorkspaceData({
      mode: "manual",
      hasPendingLocalChanges: true,
      pushLocalChanges: async () => calls.push("push"),
      pullRemoteChanges: async () => {
        calls.push("pull");
        return { changed: 2 };
      },
      invalidateWorkspaceQueries: async () => calls.push("invalidate"),
    });

    assert.deepEqual(calls, ["push", "pull", "invalidate"]);
    assert.deepEqual(result, { changed: 2, skipped: false });
  });

  it("skips a background pull while local changes are pending", async () => {
    const calls = [];
    const result = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: true,
      pushLocalChanges: async () => calls.push("push"),
      pullRemoteChanges: async () => {
        calls.push("pull");
        return { changed: 1 };
      },
      invalidateWorkspaceQueries: async () => calls.push("invalidate"),
    });

    assert.deepEqual(calls, []);
    assert.deepEqual(result, { changed: 0, skipped: true });
  });

  it("invalidates background queries only when remote changes exist", async () => {
    let invalidations = 0;
    const unchanged = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: false,
      pushLocalChanges: async () => undefined,
      pullRemoteChanges: async () => ({ changed: 0 }),
      invalidateWorkspaceQueries: async () => { invalidations += 1; },
    });
    const changed = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: false,
      pushLocalChanges: async () => undefined,
      pullRemoteChanges: async () => ({ changed: 3 }),
      invalidateWorkspaceQueries: async () => { invalidations += 1; },
    });

    assert.equal(invalidations, 1);
    assert.deepEqual(unchanged, { changed: 0, skipped: false });
    assert.deepEqual(changed, { changed: 3, skipped: false });
  });
});
