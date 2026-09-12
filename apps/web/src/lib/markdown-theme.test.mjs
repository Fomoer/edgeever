import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  getStoredMarkdownTheme,
  isMarkdownLightTheme,
  MARKDOWN_LIGHT_THEME_NAMES,
  MARKDOWN_THEME_NAMES,
  MARKDOWN_THEME_PREFERENCES,
  resolveMarkdownTheme,
} from "../components/ThemeProvider";
import { CODE_MIRROR_THEME_MAP } from "../components/editor/MarkdownSourceEditor";
import { lightMarkdownHighlightStyles } from "./markdown-source-highlight";

describe("markdown theme contracts", () => {
  test("automatic Markdown themes follow the resolved appearance", () => {
    expect(resolveMarkdownTheme("auto", "light")).toBe("github-light");
    expect(resolveMarkdownTheme("auto", "dark")).toBe("tokyo-night");
    expect(resolveMarkdownTheme("dracula", "light")).toBe("dracula");
    expect(resolveMarkdownTheme("nord", "dark")).toBe("nord");
    expect(resolveMarkdownTheme("tokyo-night", "light")).toBe("tokyo-night");
  });

  test("unset Markdown theme preference follows appearance instead of a dark-only default", () => {
    expect(getStoredMarkdownTheme()).toBe("auto");
    expect(MARKDOWN_THEME_PREFERENCES[0]).toBe("auto");
  });

  test("all markdown theme preferences are correctly defined", () => {
    expect(MARKDOWN_THEME_PREFERENCES[0]).toBe("auto");
    for (const theme of MARKDOWN_THEME_NAMES) {
      expect(MARKDOWN_THEME_PREFERENCES).toContain(theme);
    }
  });

  test("every supported markdown theme has a CodeMirror extension mapped", () => {
    for (const theme of MARKDOWN_THEME_NAMES) {
      const extension = CODE_MIRROR_THEME_MAP[theme];
      expect(extension).toBeDefined();
    }
  });

  test("light markdown themes receive an extra syntax highlight layer", () => {
    const editorSource = readFileSync(new URL("../components/editor/MarkdownSourceEditor.tsx", import.meta.url), "utf8");
    expect(lightMarkdownHighlightStyles.length).toBeGreaterThan(0);
    expect(editorSource).toContain("lightMarkdownHighlightStyles");
    for (const theme of MARKDOWN_LIGHT_THEME_NAMES) {
      expect(MARKDOWN_THEME_NAMES).toContain(theme);
      expect(isMarkdownLightTheme(theme)).toBe(true);
      expect(CODE_MIRROR_THEME_MAP[theme]).toBeDefined();
      expect(editorSource).toContain(`"${theme}":`);
    }
    expect(isMarkdownLightTheme("tokyo-night")).toBe(false);
    expect(editorSource).toContain("githubLightInit({ styles: lightMarkdownHighlightStyles })");
    expect(editorSource).toContain("xcodeLightInit({ styles: lightMarkdownHighlightStyles })");
  });

  test("the editor toolbar can switch Markdown source themes", () => {
    const toolbar = readFileSync(new URL("../components/EditorToolbar.tsx", import.meta.url), "utf8");
    expect(toolbar).toContain("useMarkdownTheme");
    expect(toolbar).toContain("MARKDOWN_THEME_PREFERENCES");
    expect(toolbar).toContain("markdownThemePreference");
    expect(toolbar).toContain('t("editorToolbar.markdownTheme")');
    expect(toolbar).not.toContain('t("editorToolbar.markdownSource")');
  });
});
