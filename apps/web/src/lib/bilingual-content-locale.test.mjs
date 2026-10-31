import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bilingualContentLocale, prefersChineseContent } from "./bilingual-content-locale.ts";

describe("bilingual content locale", () => {
  test("reads Chinese content only for Chinese UI locales", () => {
    expect(bilingualContentLocale("zh-CN")).toBe("zh-CN");
    expect(bilingualContentLocale("zh")).toBe("zh-CN");
    expect(bilingualContentLocale("zh-TW")).toBe("zh-CN");
    expect(prefersChineseContent("zh-CN")).toBe(true);
  });

  test("routes every other UI locale to the English variant", () => {
    for (const locale of ["en-US", "en", "ja", "pl", "ru", "de", "", null, undefined]) {
      expect(bilingualContentLocale(locale)).toBe("en-US");
      expect(prefersChineseContent(locale)).toBe(false);
    }
  });

  test("Evernote guide and demo notebook fall back to English, not Chinese, for ja/pl/ru", () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
    expect(read("../components/EvernoteImportGuidePane.tsx"))
      .toContain("prefersChineseContent(i18n.resolvedLanguage) ? migrationGuideMarkdown : migrationGuideEnglishMarkdown");
    expect(read("../components/WorkspaceApp.tsx"))
      .toContain("const demoNotebook = prefersChineseContent(i18n.resolvedLanguage)");
  });
});
