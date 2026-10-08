import { describe, expect, test } from "bun:test";
import type { Notebook } from "@edgeever/shared";
import {
  filterCollapsedNotebookOptions,
  formatMemoDetailDate,
  flattenNotebooks,
  getNotebookAncestorIds,
  getNotebookParentIdSet,
  getResolvedMobileLocale,
  getTextSearchMatches,
  isEnglishMobileLocale,
  markdownToLocalText,
  parseTags,
} from "./workspace-utils";

const notebook = (id: string, parentId: string | null, sortOrder: number): Notebook => ({
  id,
  parentId,
  name: id,
  slug: id,
  icon: null,
  color: null,
  sortOrder,
  memoCount: 0,
  lastMemoUpdatedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

describe("mobile workspace utilities", () => {
  test("flattens, sorts, and collapses notebook trees", () => {
    const notebooks = [notebook("child", "root", 20), notebook("root", null, 10), notebook("sibling", null, 30)];
    const options = flattenNotebooks(notebooks);

    expect(options.map(({ notebook: item, depth }) => [item.id, depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["sibling", 0],
    ]);
    expect(filterCollapsedNotebookOptions(options, new Set(["root"])).map(({ notebook: item }) => item.id)).toEqual([
      "root",
      "sibling",
    ]);
    expect(getNotebookParentIdSet(notebooks)).toEqual(new Set(["root"]));
    expect(getNotebookAncestorIds(notebooks, "child")).toEqual(new Set(["root"]));
  });

  test("normalizes tags, markdown preview text, and search matches", () => {
    expect(parseTags(" one，two, one\nthree ")).toEqual(["one", "two", "three"]);
    expect(markdownToLocalText("## Hello [EdgeEver](https://edgeever.org) ![logo](logo.png)")).toBe("Hello EdgeEver");
    expect(getTextSearchMatches("One one none", "one")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 9, end: 12 },
    ]);
  });

  test("formats historical memo details with a year and handles invalid timestamps", () => {
    expect(formatMemoDetailDate("2010-08-30T12:34:00.000Z", "en-US")).toContain("2010");
    expect(formatMemoDetailDate("not-a-date", "zh-CN")).toBe("");
  });

  test("treats explicit locale preferences as the resolved UI locale", () => {
    expect(getResolvedMobileLocale("zh-CN")).toBe("zh-CN");
    expect(getResolvedMobileLocale("en-US")).toBe("en-US");
    expect(getResolvedMobileLocale("pl")).toBe("pl");
    expect(isEnglishMobileLocale("zh-CN")).toBe(false);
    expect(isEnglishMobileLocale("en-US")).toBe(true);
  });

  test("resolves Japanese and Polish system languages to themselves and unmatched languages to English", () => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    const withLocale = (locale: string) => {
      Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
        return { ...original.call(this), locale };
      };
    };
    try {
      withLocale("ja-JP");
      expect(getResolvedMobileLocale("system")).toBe("ja");
      expect(isEnglishMobileLocale("system")).toBe(true);
      withLocale("pl-PL");
      expect(getResolvedMobileLocale("system")).toBe("pl");
      expect(isEnglishMobileLocale("system")).toBe(true);
      withLocale("pl");
      expect(getResolvedMobileLocale("system")).toBe("pl");
      withLocale("fr-FR");
      expect(getResolvedMobileLocale("system")).toBe("en-US");
      expect(isEnglishMobileLocale("system")).toBe(true);
    } finally {
      Intl.DateTimeFormat.prototype.resolvedOptions = original;
    }
  });
});
