import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { clipNotebookId } from "./src/extension.ts";

const notebooks = [
  { id: "nb_video", slug: "video" },
  { id: "ws_1_inbox", slug: "inbox" },
];

test("keeps a saved notebook that still exists", () => {
  expect(clipNotebookId("nb_video", notebooks)).toBe("nb_video");
});

test("uses 等待分类 when the saved id is empty or damaged", () => {
  expect(clipNotebookId("", notebooks)).toBe("ws_1_inbox");
  expect(clipNotebookId("   ", notebooks)).toBe("ws_1_inbox");
  expect(clipNotebookId("nb_deleted", notebooks)).toBe("ws_1_inbox");
  expect(clipNotebookId("\u0001\u0005token1", notebooks)).toBe("ws_1_inbox");
  expect(clipNotebookId("", [{ id: "nb_later" }, { id: "nb_inbox" }])).toBe("nb_inbox");
  expect(clipNotebookId("", [{ id: "nb_later" }, { id: "ws_inbox" }])).toBe("ws_inbox");
});

test("reports no notebook when 等待分类 is missing", () => {
  expect(clipNotebookId("nb_video", [])).toBe("");
  expect(clipNotebookId("", [{ id: "nb_video" }])).toBe("");
  expect(clipNotebookId("nb_video", [{ id: "  " }])).toBe("");
});

test("tweet and the other direct clips resolve a notebook the account still has", () => {
  const background = readFileSync(new URL("./src/background.ts", import.meta.url), "utf8");
  expect(background).not.toContain("notebookId: settings.notebookId");
  for (const marker of [
    "await saveCapturedTweetNote",
    "await saveCapturedImageNote",
    "await saveCapturedXhsNote",
    "await saveCapturedZhihuNote",
    "await saveCapturedRedditPost",
  ]) {
    const call = background.slice(background.indexOf(marker), background.indexOf(marker) + 280);
    expect(call).toContain("notebookForClip(settings)");
  }
});
