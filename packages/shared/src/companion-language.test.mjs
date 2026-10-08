import { describe, expect, test } from "bun:test";
import { conversationLanguage } from "./companion.ts";

const locale = (message, recent, fallback) => conversationLanguage(message, recent, fallback);

describe("companion conversation language", () => {
  test("reads Polish typed without diacritics when the interface is Polish", () => {
    expect(locale("Napisz plan na jutro", [], "pl")).toEqual({ locale: "pl", source: "current request" });
    expect(locale("Podsumuj te notatki", [], "pl")).toEqual({ locale: "pl", source: "current request" });
  });

  test("still recognizes English requests with a Polish interface", () => {
    expect(locale("Write a plan for tomorrow", [], "pl")).toEqual({ locale: "en-US", source: "current request" });
    expect(locale("Please summarize this note", [], "pl")).toEqual({ locale: "en-US", source: "current request" });
    expect(locale("Make a plan", [], "pl")).toEqual({ locale: "en-US", source: "current request" });
  });

  test("falls back to recent messages, then the Polish interface, when Latin text is ambiguous", () => {
    expect(locale("Kubernetes", ["Przygotuj listę zadań"], "pl")).toEqual({ locale: "pl", source: "recent conversation" });
    expect(locale("Kubernetes", ["Please write a summary"], "pl")).toEqual({ locale: "en-US", source: "recent conversation" });
    expect(locale("Kubernetes", [], "pl")).toEqual({ locale: "pl", source: "interface" });
  });

  test("uses diacritics and other scripts regardless of the interface", () => {
    expect(locale("Zrób listę zakupów", [], "en-US")).toEqual({ locale: "pl", source: "current request" });
    expect(locale("帮我总结这篇笔记", [], "pl")).toEqual({ locale: "zh-CN", source: "current request" });
    expect(locale("このメモを要約して", [], "pl")).toEqual({ locale: "ja", source: "current request" });
  });

  test("keeps treating Latin text as English for other interfaces", () => {
    expect(locale("Napisz plan na jutro", [], "en-US")).toEqual({ locale: "en-US", source: "current request" });
    expect(locale("Kubernetes", [], "zh-CN")).toEqual({ locale: "en-US", source: "current request" });
    expect(locale("12345", [], "ja")).toEqual({ locale: "ja", source: "interface" });
  });

  test("ignores the wording of localized translation actions", () => {
    expect(locale("Przetłumacz poniższy fragment:\nHello world", ["Napisz plan na jutro"], "en-US"))
      .toEqual({ locale: "en-US", source: "recent conversation" });
    expect(locale("Przetłumacz to, na co patrzę", [], "pl")).toEqual({ locale: "pl", source: "interface" });
  });
});
