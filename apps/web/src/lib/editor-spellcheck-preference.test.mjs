import { afterEach, describe, expect, test } from "bun:test";
import {
  EDITOR_SPELLCHECK_STORAGE_KEY,
  readEditorSpellcheckPreference,
  resolveStoredEditorSpellcheckPreference,
  writeEditorSpellcheckPreference,
} from "./editor-spellcheck-preference.ts";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow !== undefined) globalThis.window = originalWindow;
});

const installWindow = () => {
  const values = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    dispatchEvent: (event) => {
      events.push(event);
      return true;
    },
  };
  return { events, values };
};

describe("editor spellcheck preference", () => {
  test("defaults to enabled unless explicitly disabled", () => {
    expect(resolveStoredEditorSpellcheckPreference(null)).toBe(true);
    expect(resolveStoredEditorSpellcheckPreference("unsupported")).toBe(true);
    expect(resolveStoredEditorSpellcheckPreference("true")).toBe(true);
    expect(resolveStoredEditorSpellcheckPreference("false")).toBe(false);
  });

  test("persists changes and notifies the current document", () => {
    const { events, values } = installWindow();
    expect(readEditorSpellcheckPreference()).toBe(true);

    writeEditorSpellcheckPreference(false);
    expect(values.get(EDITOR_SPELLCHECK_STORAGE_KEY)).toBe("false");
    expect(readEditorSpellcheckPreference()).toBe(false);
    expect(events.at(-1)?.detail).toBe(false);

    writeEditorSpellcheckPreference(true);
    expect(values.get(EDITOR_SPELLCHECK_STORAGE_KEY)).toBe("true");
    expect(readEditorSpellcheckPreference()).toBe(true);
    expect(events.at(-1)?.detail).toBe(true);
  });

  test("keeps an unsaved change in memory when local storage is unavailable", () => {
    const events = [];
    globalThis.window = {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      },
      dispatchEvent: (event) => {
        events.push(event);
        return true;
      },
    };

    expect(readEditorSpellcheckPreference()).toBe(true);
    expect(() => writeEditorSpellcheckPreference(false)).not.toThrow();
    expect(events.at(-1)?.detail).toBe(false);
    expect(readEditorSpellcheckPreference()).toBe(false);

    const { values } = installWindow();
    writeEditorSpellcheckPreference(true);
    expect(values.get(EDITOR_SPELLCHECK_STORAGE_KEY)).toBe("true");
    values.set(EDITOR_SPELLCHECK_STORAGE_KEY, "false");
    expect(readEditorSpellcheckPreference()).toBe(false);
  });
});
