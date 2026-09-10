import type { MemoDetail, TagSummary } from "@edgeever/shared";

export const memoHasExactTag = (tags: readonly string[] | null | undefined, tag: string) => {
  const normalized = tag.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return (tags ?? []).some((value) => value.trim().toLocaleLowerCase() === normalized);
};

export const filterLocalMemosByExactTag = <T extends { tags: string[] }>(
  memos: T[],
  tag?: string | null
): T[] => {
  const normalized = tag?.trim() ?? "";
  if (!normalized) return memos;
  return memos.filter((memo) => memoHasExactTag(memo.tags, normalized));
};

export const summarizeMobileTags = (memos: MemoDetail[]): TagSummary[] => {
  const tags = new Map<string, { memoCount: number; updatedAt: string | null }>();

  for (const memo of memos) {
    if (memo.isDeleted) continue;
    for (const name of new Set(memo.tags.map((tag) => tag.trim()).filter(Boolean))) {
      const current = tags.get(name) ?? { memoCount: 0, updatedAt: null };
      current.memoCount += 1;
      if (!current.updatedAt || memo.updatedAt > current.updatedAt) current.updatedAt = memo.updatedAt;
      tags.set(name, current);
    }
  }

  return [...tags.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map(([name, summary]) => ({ name, ...summary }));
};
