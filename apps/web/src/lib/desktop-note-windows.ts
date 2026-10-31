import { useEffect, useState } from "react";
import type { MemoDetail } from "@edgeever/shared";

export const NOTE_WINDOW_QUERY_PARAM = "noteWindow";
const MEMO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The note shown by this renderer when it is a desktop note window. */
export const getNoteWindowMemoId = (search = typeof window === "undefined" ? "" : window.location.search) => {
  if (typeof window === "undefined" || !window.edgeeverDesktop?.isAvailable) return null;
  const memoId = new URLSearchParams(search).get(NOTE_WINDOW_QUERY_PARAM);
  return memoId && MEMO_ID_PATTERN.test(memoId) ? memoId : null;
};

export const canOpenNoteWindows = () =>
  typeof window !== "undefined" && Boolean(window.edgeeverDesktop?.openNoteWindow) && !getNoteWindowMemoId();

/** Notes currently shown in their own desktop windows, as reported by the main process. */
export const useDetachedMemoIds = () => {
  const [memoIds, setMemoIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const bridge = window.edgeeverDesktop;
    if (!bridge?.noteWindows || !bridge.onNoteWindowsChanged || getNoteWindowMemoId()) return;
    let active = true;
    const unsubscribe = bridge.onNoteWindowsChanged((ids) => setMemoIds(new Set(ids)));
    void bridge.noteWindows().then((ids) => {
      if (active) setMemoIds(new Set(ids));
    }, () => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return [memoIds, setMemoIds] as const;
};

/** The `edgeever:sync-completed` event detail that EditorPane reads. */
export type NoteWindowSyncCompletedDetail = {
  failed?: number;
  conflicted?: number;
  syncedMemos?: ReadonlyMap<string, MemoDetail>;
};

/**
 * Sync runs in the main window. This picks the part of a sync result that the
 * window showing `memoId` needs: failure and conflict counts, and the note as
 * acknowledged when this sync included it.
 */
export const noteWindowSyncUpdate = (
  detail: NoteWindowSyncCompletedDetail | null | undefined,
  memoId: string,
): DesktopNoteWindowSyncUpdate => ({
  failed: detail?.failed ?? 0,
  conflicted: detail?.conflicted ?? 0,
  memo: detail?.syncedMemos?.get(memoId) ?? null,
});

/** Rebuilds, inside the note window, the sync event its editor listens for. */
export const noteWindowSyncCompletedDetail = (
  memoId: string,
  update: DesktopNoteWindowSyncUpdate,
): NoteWindowSyncCompletedDetail => ({
  failed: update.failed,
  conflicted: update.conflicted,
  syncedMemos: new Map(update.memo?.id === memoId ? [[memoId, update.memo]] : []),
});
