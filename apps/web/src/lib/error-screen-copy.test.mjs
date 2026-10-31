import { describe, expect, test } from "bun:test";
import { createInstance } from "i18next";
import { enUS } from "@edgeever/shared/i18n/en-US";
import { pl } from "@edgeever/shared/i18n/pl";
import { errorScreenText } from "./error-screen-copy.ts";

describe("error screen text", () => {
  test("uses English before the app language is ready", () => {
    expect(errorScreenText("noteTitle", createInstance())).toBe(enUS.errorScreens.noteTitle);
  });

  test("follows the app language and falls back to English for a missing text", async () => {
    const instance = createInstance();
    await instance.init({
      lng: "pl",
      fallbackLng: false,
      resources: { pl: { translation: { errorScreens: { ...pl.errorScreens, retry: undefined } } } },
    });
    expect(errorScreenText("noteTitle", instance)).toBe(pl.errorScreens.noteTitle);
    expect(errorScreenText("retry", instance)).toBe(enUS.errorScreens.retry);
  });
});
