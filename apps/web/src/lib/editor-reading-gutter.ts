/** Desktop reading gutter at the `lg` breakpoint. Matches `6rem` in the editor row. */
export const EDITOR_DESKTOP_READING_GUTTER_PX = 96;

/** Compact gutter already used below `lg` and in the tight pane. Matches `1.75rem`. */
export const EDITOR_COMPACT_READING_GUTTER = "1.75rem";

/**
 * Hide the outline below this projected editor-column width.
 * Outline (300px) plus 6rem gutters would otherwise collapse the article.
 */
export const EDITOR_PANE_TIGHT_PX = 720;

/** Tailwind `gap-8` between the article and an in-flow outline. */
export const EDITOR_ARTICLE_ROW_GAP_PX = 32;

/** Focus mode caps the article row. Matches `max-w-[1400px]` on that row. */
export const EDITOR_FOCUS_ROW_MAX_PX = 1400;

export const editorColumnFitsDesktopReadingGutters = ({
  columnWidth,
  articleMaxWidth,
  reservedBesideArticle = 0,
}: {
  columnWidth: number;
  articleMaxWidth: number;
  reservedBesideArticle?: number;
}) =>
  columnWidth >= articleMaxWidth + reservedBesideArticle + EDITOR_DESKTOP_READING_GUTTER_PX * 2;

/**
 * Yield the 6rem gutters whenever the editor column cannot fit the article
 * and outline at their preferred widths. The floating AI launcher overlays
 * either surface; it must not require a dedicated strip beside the outline.
 */
export const shouldCompactEditorReadingGutter = ({
  desktopColumn,
  columnWidth,
  articleMaxWidth,
  reservedBesideArticle = 0,
  focusRow = false,
}: {
  desktopColumn: boolean;
  columnWidth: number;
  articleMaxWidth: number;
  reservedBesideArticle?: number;
  focusRow?: boolean;
}) => {
  if (!desktopColumn || columnWidth <= 0) return false;
  if (!Number.isFinite(articleMaxWidth) || articleMaxWidth <= 0) return false;
  const available = focusRow ? Math.min(columnWidth, EDITOR_FOCUS_ROW_MAX_PX) : columnWidth;
  return !editorColumnFitsDesktopReadingGutters({
    columnWidth: available,
    articleMaxWidth,
    reservedBesideArticle,
  });
};
