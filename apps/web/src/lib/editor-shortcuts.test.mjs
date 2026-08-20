import { describe, expect, test } from "bun:test";
import { saveAndSyncEditor } from "./editor-shortcuts.ts";

describe("editor shortcut actions", () => {
  test("saves dirty editor content before starting sync", async () => {
    const calls = [];

    await saveAndSyncEditor({
      hasUnsavedChanges: true,
      save: async () => calls.push("save"),
      sync: async () => calls.push("sync"),
    });

    expect(calls).toEqual(["save", "sync"]);
  });

  test("syncs existing queued changes when the editor is already clean", async () => {
    const calls = [];

    await saveAndSyncEditor({
      hasUnsavedChanges: false,
      save: async () => calls.push("save"),
      sync: async () => calls.push("sync"),
    });

    expect(calls).toEqual(["sync"]);
  });

  test("does not sync when saving the current snapshot fails", async () => {
    const calls = [];

    await expect(saveAndSyncEditor({
      hasUnsavedChanges: true,
      save: async () => {
        calls.push("save");
        throw new Error("save failed");
      },
      sync: async () => calls.push("sync"),
    })).rejects.toThrow("save failed");

    expect(calls).toEqual(["save"]);
  });
});
