import { describe, expect, test } from "bun:test";
import { getAiSlashCommandStart, saveAndSyncEditor, shouldOpenAiFromSpace } from "./editor-shortcuts.ts";

describe("editor shortcut actions", () => {
  test("recognizes /ai only at a text boundary", () => {
    expect(getAiSlashCommandStart({ caretPosition: 2, insertedText: "i", textBefore: "/a" })).toBe(0);
    expect(getAiSlashCommandStart({ caretPosition: 8, insertedText: "I", textBefore: "hello /a" })).toBe(6);
    expect(getAiSlashCommandStart({ caretPosition: 5, insertedText: "i", textBefore: "x/a" })).toBeNull();
    expect(getAiSlashCommandStart({ caretPosition: 2, insertedText: "x", textBefore: "/a" })).toBeNull();
  });

  test("opens AI from Space only in an empty paragraph outside IME composition", () => {
    const base = {
      altKey: false,
      ctrlKey: false,
      isComposing: false,
      isEmptyParagraph: true,
      key: " ",
      keyCode: 32,
      metaKey: false,
      repeat: false,
      selectionEmpty: true,
      shiftKey: false,
    };

    expect(shouldOpenAiFromSpace(base)).toBe(true);
    expect(shouldOpenAiFromSpace({ ...base, isEmptyParagraph: false })).toBe(false);
    expect(shouldOpenAiFromSpace({ ...base, selectionEmpty: false })).toBe(false);
    expect(shouldOpenAiFromSpace({ ...base, isComposing: true })).toBe(false);
    expect(shouldOpenAiFromSpace({ ...base, keyCode: 229 })).toBe(false);
    expect(shouldOpenAiFromSpace({ ...base, ctrlKey: true })).toBe(false);
    expect(shouldOpenAiFromSpace({ ...base, key: "Enter" })).toBe(false);
  });

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
