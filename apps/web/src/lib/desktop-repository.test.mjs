import { afterAll, describe, expect, test } from "bun:test";

let lastRequest = null;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

// Must be installed before importing modules that read `window` at load time.
globalThis.window = {
  location: { hostname: "notes.example.com", origin: "https://notes.example.com" },
  dispatchEvent: () => true,
  edgeeverDesktop: {
    isAvailable: true,
    sidecarRequest: async (method, params) => {
      lastRequest = { method, params };
      if (method === "memo.update") {
        return { memo: { ...params, id: params.memoId, contentHash: "next-hash" } };
      }
      return { memos: [], totalCount: 0, nextCursor: null };
    },
  },
};

afterAll(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete globalThis.window;
  }
});

const { createDesktopRepository } = await import("./desktop-repository.ts");

describe("desktop repository notebook filters", () => {
  test("uses the notebook subtree without also restricting results to the parent", async () => {
    await createDesktopRepository().listMemos({
      notebookId: "parent",
      notebookIds: ["parent", "child"],
    });

    expect(lastRequest).toEqual({
      method: "memo.list",
      params: {
        notebookId: null,
        notebookIds: ["parent", "child"],
      },
    });
  });

  test("forwards the selected tag to the sidecar list query", async () => {
    await createDesktopRepository().listMemos({ tag: "AI-RSS" });

    expect(lastRequest).toEqual({
      method: "memo.list",
      params: {
        notebookId: null,
        tag: "AI-RSS",
      },
    });
  });
});

describe("desktop repository memo saves", () => {
  test("serializes rich content to Markdown before sending it to the sidecar", async () => {
    await createDesktopRepository().updateMemo(
      { id: "memo-1", revision: 2, contentHash: "base-hash" },
      {
        title: "Rich note",
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "富文本正文" }] }] },
        tags: [],
      },
    );

    expect(lastRequest.method).toBe("memo.update");
    expect(lastRequest.params.contentMarkdown).toContain("富文本正文");
  });
});
