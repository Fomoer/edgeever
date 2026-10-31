import { afterEach, describe, expect, test } from "bun:test";
import { getNoteWindowMemoId, noteWindowSyncCompletedDetail, noteWindowSyncUpdate } from "./desktop-note-windows.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
});

const memo = (id, revision) => ({ id, revision, title: id, contentMarkdown: "", isDeleted: false });

describe("desktop note windows", () => {
  test("only a desktop renderer with a valid note id is a note window", () => {
    delete globalThis.window;
    expect(getNoteWindowMemoId("?noteWindow=memo_1")).toBeNull();
    globalThis.window = { edgeeverDesktop: { isAvailable: true }, location: { search: "" } };
    expect(getNoteWindowMemoId("?noteWindow=memo_1")).toBe("memo_1");
    expect(getNoteWindowMemoId("?noteWindow=../x")).toBeNull();
    expect(getNoteWindowMemoId("")).toBeNull();
    globalThis.window = { location: { search: "" } };
    expect(getNoteWindowMemoId("?noteWindow=memo_1")).toBeNull();
  });

  test("a sync result passes each note window its counts and its own acknowledged note", () => {
    const detail = { failed: 1, conflicted: 2, syncedMemos: new Map([["memo_a", memo("memo_a", 4)], ["memo_b", memo("memo_b", 9)]]) };
    expect(noteWindowSyncUpdate(detail, "memo_a")).toEqual({ failed: 1, conflicted: 2, memo: memo("memo_a", 4) });
    expect(noteWindowSyncUpdate(detail, "memo_c")).toEqual({ failed: 1, conflicted: 2, memo: null });
    // Discarding conflicts has no sync result; the window still reloads its note.
    expect(noteWindowSyncUpdate(null, "memo_a")).toEqual({ failed: 0, conflicted: 0, memo: null });
  });

  test("the note window rebuilds the event detail its editor reads", () => {
    const rebuilt = noteWindowSyncCompletedDetail("memo_a", { failed: 0, conflicted: 1, memo: memo("memo_a", 5) });
    expect(rebuilt.failed).toBe(0);
    expect(rebuilt.conflicted).toBe(1);
    expect(rebuilt.syncedMemos.get("memo_a")).toEqual(memo("memo_a", 5));
    // A note that is not this window's is ignored.
    expect(noteWindowSyncCompletedDetail("memo_a", { failed: 0, conflicted: 0, memo: memo("memo_b", 1) }).syncedMemos.size).toBe(0);
  });

  test("the update survives the structured clone used by Electron IPC", () => {
    const update = noteWindowSyncUpdate({ failed: 0, conflicted: 0, syncedMemos: new Map([["memo_a", memo("memo_a", 2)]]) }, "memo_a");
    expect(structuredClone(update)).toEqual(update);
  });
});
