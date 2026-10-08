import { describe, expect, test } from "bun:test";
import { companionLocale } from "./companion-locale.ts";

describe("companion locale", () => {
  test("maps Chinese and Japanese families and falls back to English", () => {
    expect(companionLocale("zh-CN")).toBe("zh-CN");
    expect(companionLocale("zh-TW")).toBe("zh-CN");
    expect(companionLocale("ja-JP")).toBe("ja");
    expect(companionLocale("pl-PL")).toBe("pl");
    expect(companionLocale("en-GB")).toBe("en-US");
    expect(companionLocale()).toBe("en-US");
  });
});
