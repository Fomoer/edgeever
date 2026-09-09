import { type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { MemoDetail, MemoSummary, Notebook, TiptapDoc } from "@edgeever/shared";
import { listLocalMemos } from "../lib/local-mirror";
import { markdownToLocalText, sortMemoSummaries } from "./workspace-utils";

const ALL_NOTES_ID = "all";

export type MobileMemoUpdatePayload = {
  title?: string;
  contentJson?: TiptapDoc;
  contentMarkdown?: string;
  isPinned?: boolean;
  notebookId?: string;
  tags?: string[];
};

export const createOptimisticMemo = (
  memo: MemoDetail,
  payload: MobileMemoUpdatePayload
): MemoDetail => {
  const contentMarkdown = payload.contentMarkdown ?? memo.contentMarkdown;
  const contentText = markdownToLocalText(contentMarkdown);

  return {
    ...memo,
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.isPinned !== undefined ? { isPinned: payload.isPinned } : {}),
    ...(payload.notebookId !== undefined ? { notebookId: payload.notebookId } : {}),
    ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    ...(payload.contentJson !== undefined ? { contentJson: payload.contentJson } : {}),
    ...(payload.contentMarkdown !== undefined
      ? {
          contentMarkdown,
          contentText,
          excerpt: contentText.slice(0, 180),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
};

export const memoMatchesListQuery = (memo: MemoSummary, queryKey: readonly unknown[]) => {
  const view = queryKey[2];
  const notebookId = queryKey[3];
  const filter = queryKey[4];
  const notebookIds = Array.isArray(queryKey[6]) ? queryKey[6] : [];
  const tag = typeof queryKey[7] === "string" ? queryKey[7].trim().toLocaleLowerCase() : "";

  if ((view === "trash") !== memo.isDeleted) {
    return false;
  }
  if (notebookId !== ALL_NOTES_ID && !notebookIds.includes(memo.notebookId)) {
    return false;
  }
  if (tag && !memo.tags.some((memoTag) => memoTag.toLocaleLowerCase() === tag)) {
    return false;
  }
  if (filter === "tagged" && memo.tags.length === 0) {
    return false;
  }
  if (filter === "untagged" && memo.tags.length > 0) {
    return false;
  }
  if (filter === "pinned" && !memo.isPinned) {
    return false;
  }

  return true;
};

export const applyOptimisticMemoToCache = (queryClient: QueryClient, previousMemo: MemoDetail, nextMemo: MemoDetail) => {
  const detailQueries = queryClient.getQueryCache().findAll({ queryKey: ["mobile", "memo"] });

  for (const query of detailQueries) {
    const data = query.state.data as { memo?: MemoDetail } | undefined;
    if (data?.memo?.id === nextMemo.id || data?.memo?.id === previousMemo.id) {
      queryClient.setQueryData(query.queryKey, { ...data, memo: nextMemo });
    }
  }

  const listQueries = queryClient.getQueryCache().findAll({ queryKey: ["mobile", "memos"] });

  for (const query of listQueries) {
    const data = query.state.data as InfiniteData<Awaited<ReturnType<typeof listLocalMemos>>, number> | undefined;
    if (!Array.isArray(data?.pages) || data.pages.length === 0) {
      continue;
    }

    const previouslyMatched = memoMatchesListQuery(previousMemo, query.queryKey);
    const nextMatches = memoMatchesListQuery(nextMemo, query.queryKey);
    const flattened = data.pages.flatMap((page) => page.memos);
    const withoutMemo = flattened.filter((memo) => memo.id !== nextMemo.id && memo.id !== previousMemo.id);
    const nextMemos = nextMatches ? sortMemoSummaries([nextMemo, ...withoutMemo], query.queryKey[5]) : withoutMemo;
    const totalCount = Math.max(0, data.pages[0].totalCount + (nextMatches ? 1 : 0) - (previouslyMatched ? 1 : 0));
    let cursor = 0;
    const pages = data.pages.map((page, index) => {
      const pageSize = index === data.pages.length - 1 ? Math.min(page.memos.length, Math.max(0, nextMemos.length - cursor)) : page.memos.length;
      const memos = nextMemos.slice(cursor, cursor + pageSize);
      cursor += pageSize;
      return { ...page, memos, totalCount };
    });

    queryClient.setQueryData(query.queryKey, { ...data, pages });
  }

  const searchQueries = queryClient.getQueryCache().findAll({ queryKey: ["mobile", "search"] });
  for (const query of searchQueries) {
    const data = query.state.data as InfiniteData<Awaited<ReturnType<typeof listLocalMemos>>, number> | undefined;
    if (Array.isArray(data?.pages) && data.pages.some((page) => page.memos.some((memo) => memo.id === nextMemo.id || memo.id === previousMemo.id))) {
      queryClient.setQueryData(query.queryKey, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          memos: page.memos.map((memo) => (memo.id === nextMemo.id || memo.id === previousMemo.id ? nextMemo : memo)),
        })),
      });
    }
  }

  if (previousMemo.notebookId !== nextMemo.notebookId) {
    queryClient.setQueriesData<{ notebooks: Notebook[] }>({ queryKey: ["mobile", "notebooks"] }, (data) => {
      if (!data) {
        return data;
      }

      return {
        ...data,
        notebooks: data.notebooks.map((notebook) => {
          if (notebook.id === previousMemo.notebookId) {
            return { ...notebook, memoCount: Math.max(0, notebook.memoCount - 1) };
          }
          if (notebook.id === nextMemo.notebookId) {
            return { ...notebook, memoCount: notebook.memoCount + 1, lastMemoUpdatedAt: nextMemo.updatedAt };
          }
          return notebook;
        }),
      };
    });
  }
};

export const findCachedMemoDetail = (queryClient: QueryClient, memoId: string) => {
  const detailQueries = queryClient.getQueryCache().findAll({ queryKey: ["mobile", "memo"] });

  for (const query of detailQueries) {
    const data = query.state.data as { memo?: MemoDetail } | undefined;
    if (data?.memo?.id === memoId) {
      return data.memo;
    }
  }

  return null;
};
