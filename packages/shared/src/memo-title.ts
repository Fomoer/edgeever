/** Kept free of imports so server entry points loaded by Node can use it. */

export const DEFAULT_MEMO_TITLE = "无标题笔记";

/**
 * Title to show for a note. Untitled notes are stored with the zh-CN default
 * title, so it is replaced by the reader's localized label like an empty one.
 */
export const getMemoDisplayTitle = (title: string | null | undefined, untitledLabel: string) => {
  const trimmed = title?.trim() ?? "";
  return trimmed && trimmed !== DEFAULT_MEMO_TITLE ? trimmed : untitledLabel;
};
