import { expect, test } from "bun:test";
import type { MemoDetail } from "@edgeever/shared";
import { filterLocalMemosByExactTag, memoHasExactTag, summarizeMobileTags } from "./mobile-tags";

const memo = (id: string, tags: string[], updatedAt: string, isDeleted = false) => ({
  id,
  tags,
  updatedAt,
  isDeleted,
} as MemoDetail);

test("matches one exact tag without depending on case or overlapping names", () => {
  expect(memoHasExactTag(["Project Alpha", "Work"], "project alpha")).toBe(true);
  expect(memoHasExactTag(["Project Alpha", "Work"], " project alpha ")).toBe(true);
  expect(memoHasExactTag(["Project Alpha", "Work"], "project")).toBe(false);
  expect(memoHasExactTag(["Homework"], "work")).toBe(false);
  expect(memoHasExactTag(["demo-extra"], "demo")).toBe(false);
});

test("filters a memo list to one exact tag before pagination", () => {
  const memos = [
    { id: "exact", tags: ["Project Alpha", "Work"] },
    { id: "substring", tags: ["Project"] },
    { id: "untagged", tags: [] },
  ];

  expect(filterLocalMemosByExactTag(memos, "project alpha").map((memo) => memo.id)).toEqual(["exact"]);
  expect(filterLocalMemosByExactTag(memos, "").map((memo) => memo.id)).toEqual(["exact", "substring", "untagged"]);
});

test("summarizes active memo tags for the offline picker", () => {
  expect(summarizeMobileTags([
    memo("1", ["work", "shared", "work"], "2026-08-13T00:00:00.000Z"),
    memo("2", ["shared", "ideas"], "2026-08-14T00:00:00.000Z"),
    memo("3", ["hidden"], "2026-08-15T00:00:00.000Z", true),
  ])).toEqual([
    { name: "ideas", memoCount: 1, updatedAt: "2026-08-14T00:00:00.000Z" },
    { name: "shared", memoCount: 2, updatedAt: "2026-08-14T00:00:00.000Z" },
    { name: "work", memoCount: 1, updatedAt: "2026-08-13T00:00:00.000Z" },
  ]);
});
