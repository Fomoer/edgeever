import { describe, expect, test } from "bun:test";
import type { MemoDetail } from "@edgeever/shared";
import { createOptimisticMemo, memoMatchesListQuery } from "./workspace-memo-cache";

const memo: MemoDetail = {
  id: "memo_1",
  notebookId: "notebook_1",
  title: "Original",
  excerpt: "Original body",
  contentJson: { type: "doc", content: [] },
  contentMarkdown: "Original body",
  contentText: "Original body",
  tags: [],
  isPinned: false,
  isArchived: false,
  isDeleted: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  deletedAt: null,
  revision: 1,
  sourceMemoIds: [],
  mergeSourceCount: 0,
  mergedIntoMemoId: null,
  contentHash: "hash_1",
};

describe("mobile workspace memo cache", () => {
  test("builds a complete optimistic memo without mutating the source", () => {
    const optimistic = createOptimisticMemo(memo, {
      contentMarkdown: "# Updated\n\nBody",
      isPinned: true,
      tags: ["updated"],
      title: "Updated",
    });

    expect(optimistic).toMatchObject({
      title: "Updated",
      contentText: "Updated Body",
      excerpt: "Updated Body",
      isPinned: true,
      tags: ["updated"],
    });
    expect(memo.title).toBe("Original");
  });

  test("matches the active list view, notebook, and filter contract", () => {
    expect(memoMatchesListQuery(memo, ["mobile", "memos", "notebook", "all", "all", "updated-desc", []])).toBe(true);
    expect(memoMatchesListQuery(memo, ["mobile", "memos", "trash", "all", "all", "updated-desc", []])).toBe(false);
    expect(memoMatchesListQuery(memo, ["mobile", "memos", "notebook", "notebook_2", "all", "updated-desc", ["notebook_2"]])).toBe(false);
    expect(memoMatchesListQuery(memo, ["mobile", "memos", "notebook", "all", "tagged", "updated-desc", []])).toBe(false);
  });

  test("matches one exact tag without depending on case", () => {
    const taggedMemo = { ...memo, tags: ["Project Alpha", "Work"] };
    const query = (tag: string) => ["mobile", "memos", "notebook", "all", "all", "updated-desc", [], tag];

    expect(memoMatchesListQuery(taggedMemo, query("project alpha"))).toBe(true);
    expect(memoMatchesListQuery(taggedMemo, query("project"))).toBe(false);
    expect(memoMatchesListQuery(taggedMemo, query("homework"))).toBe(false);
  });
});
