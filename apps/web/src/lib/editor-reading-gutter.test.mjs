import { describe, expect, test } from "bun:test";
import {
  EDITOR_ARTICLE_ROW_GAP_PX,
  EDITOR_DESKTOP_READING_GUTTER_PX,
  EDITOR_PANE_TIGHT_PX,
  shouldCompactEditorReadingGutter,
} from "./editor-reading-gutter.ts";

const outlineBesideArticle = 300 + EDITOR_ARTICLE_ROW_GAP_PX;
const standardReading = 880;
const comfortableWithOutline =
  standardReading + outlineBesideArticle + EDITOR_DESKTOP_READING_GUTTER_PX * 2;

describe("editor reading gutter", () => {
  test("returns narrow-window space to the article even with the assistant closed", () => {
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 920,
      articleMaxWidth: standardReading,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(true);
  });

  test("compacts when the column cannot fit the article, outline, and 6rem gutters", () => {
    expect(comfortableWithOutline).toBe(1404);
    expect(EDITOR_PANE_TIGHT_PX).toBe(720);
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 920,
      articleMaxWidth: standardReading,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(true);
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: comfortableWithOutline,
      articleMaxWidth: standardReading,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(false);
  });

  test("keeps the wide reading measure when that column still fits", () => {
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 1600,
      articleMaxWidth: 1040,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(false);
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 1563,
      articleMaxWidth: 1040,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(true);
  });

  test("leaves the narrower breakpoints and an unmeasured column alone", () => {
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: false,
      columnWidth: 800,
      articleMaxWidth: standardReading,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(false);
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 0,
      articleMaxWidth: standardReading,
      reservedBesideArticle: outlineBesideArticle,
    })).toBe(false);
  });

  test("uses the 1400px focus row when deciding", () => {
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 1800,
      articleMaxWidth: 960,
      reservedBesideArticle: outlineBesideArticle,
      focusRow: true,
    })).toBe(true);
    expect(shouldCompactEditorReadingGutter({
      desktopColumn: true,
      columnWidth: 1800,
      articleMaxWidth: 960,
      reservedBesideArticle: 0,
      focusRow: true,
    })).toBe(false);
  });
});
