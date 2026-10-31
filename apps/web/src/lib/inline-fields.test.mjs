import { describe, expect, test } from "bun:test";
import { enUS } from "@edgeever/shared/i18n/en-US";
import { ja } from "@edgeever/shared/i18n/ja";
import { pl } from "@edgeever/shared/i18n/pl";
import { zhCN } from "@edgeever/shared/i18n/zh-CN";
import { findInlineFields, formatInlineFieldChip, rangesOverlap } from "./inline-fields.ts";

const translatorFor = (catalog) => (key) => key.split(".").reduce((node, part) => node?.[part], catalog) ?? key;

describe("inline fields", () => {
  test("finds Dataview bracket fields in a task line", () => {
    const text = "审阅面板 [priority:: highest] [scheduled:: 2026-09-10] [due:: 2026-09-10]";
    const fields = findInlineFields(text);
    expect(fields.map((field) => field.key)).toEqual(["priority", "scheduled", "due"]);
    expect(fields.map((field) => field.value)).toEqual(["highest", "2026-09-10", "2026-09-10"]);
    expect(text.slice(fields[0].from, fields[0].to)).toBe("[priority:: highest]");
  });

  test("formats quiet chips instead of raw syntax", () => {
    expect(formatInlineFieldChip("due", "2026-09-10", translatorFor(zhCN))).toBe("截止 2026-09-10");
    expect(formatInlineFieldChip("priority", "highest", translatorFor(zhCN))).toBe("优先级 最高");
    expect(formatInlineFieldChip("due", "2026-09-10", translatorFor(enUS))).toBe("Due 2026-09-10");
  });

  test("reads chip labels from the active locale catalog instead of falling back to English", () => {
    expect(formatInlineFieldChip("due", "2026-09-10", translatorFor(ja))).toBe("期限 2026-09-10");
    expect(formatInlineFieldChip("priority", "High", translatorFor(pl))).toBe("Priorytet Wysoki");
  });

  test("leaves unknown keys and priority values as authored", () => {
    expect(formatInlineFieldChip("custom", "value", translatorFor(enUS))).toBe("custom value");
    expect(formatInlineFieldChip("priority", "urgent", translatorFor(enUS))).toBe("Priority urgent");
  });

  test("keeps the raw field editable when the caret is inside it", () => {
    expect(rangesOverlap(5, 27, 10)).toBe(true);
    expect(rangesOverlap(5, 27, 27)).toBe(true);
    expect(rangesOverlap(5, 27, 4)).toBe(false);
  });
});
