import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const editorPaneSource = readFileSync(new URL("./EditorPane.tsx", import.meta.url), "utf8");
const diagramEditorPaneSource = readFileSync(new URL("./DiagramEditorPane.tsx", import.meta.url), "utf8");
const topRowLeadingSource = readFileSync(new URL("./MemoEditorTopRowLeading.tsx", import.meta.url), "utf8");

const expectDiscoverableFocusModeEntry = (source) => {
  const normalizedSource = source.replace(/\s+/g, " ");
  expect(normalizedSource).toContain('size="sm" variant={desktopFocusMode ? "soft" : "ghost"}');
  expect(normalizedSource).toContain('<span>{focusModeLabel}</span>');
  expect(source).not.toContain('size="sm"\n                      variant="solid"');
};

describe("focus mode entry", () => {
  test("labels a restrained action in every desktop note editor instead of relying on an ambiguous icon", () => {
    expectDiscoverableFocusModeEntry(topRowLeadingSource);
    for (const source of [editorPaneSource, diagramEditorPaneSource]) {
      expect(source).toContain("<MemoEditorTopRowLeading");
      expect(source).toContain("desktopFocusMode={desktopFocusMode}");
      expect(source).toContain("onToggleDesktopFocusMode={onToggleDesktopFocusMode}");
    }
  });

  test("keeps the focus mode entry in the shared editor header instead of top-level navigation", () => {
    for (const source of [editorPaneSource, diagramEditorPaneSource]) {
      const focusModeEntryIndex = source.indexOf("<MemoEditorTopRowLeading");
      const headerActionsIndex = source.indexOf("<MemoEditorHeaderActions");
      expect(focusModeEntryIndex).toBeGreaterThan(-1);
      expect(headerActionsIndex).toBeGreaterThan(focusModeEntryIndex);
    }
  });
});
