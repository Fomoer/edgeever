import { describe, expect, test } from "bun:test";
import { findInlineFields, formatInlineFieldChip, languageFromLocale, rangesOverlap } from "./inline-fields.ts";

describe("inline fields", () => {
  test("finds Dataview bracket fields in a task line", () => {
    const text = "审阅面板 [priority:: highest] [scheduled:: 2026-09-10] [due:: 2026-09-10]";
    const fields = findInlineFields(text);
    expect(fields.map((field) => field.key)).toEqual(["priority", "scheduled", "due"]);
    expect(fields.map((field) => field.value)).toEqual(["highest", "2026-09-10", "2026-09-10"]);
    expect(text.slice(fields[0].from, fields[0].to)).toBe("[priority:: highest]");
  });

  test("formats quiet chips instead of raw syntax", () => {
    expect(formatInlineFieldChip("due", "2026-09-10", "zh")).toBe("截止 2026-09-10");
    expect(formatInlineFieldChip("priority", "highest", "zh")).toBe("优先级 最高");
    expect(formatInlineFieldChip("due", "2026-09-10", "en")).toBe("Due 2026-09-10");
    expect(languageFromLocale("zh-CN")).toBe("zh");
  });

  test("keeps the raw field editable when the caret is inside it", () => {
    expect(rangesOverlap(5, 27, 10)).toBe(true);
    expect(rangesOverlap(5, 27, 27)).toBe(true);
    expect(rangesOverlap(5, 27, 4)).toBe(false);
  });
});
