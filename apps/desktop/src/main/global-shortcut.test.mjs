import { describe, expect, test } from "bun:test";
import {
  globalShortcutAccelerator,
  normalizeGlobalShortcutBinding,
  replaceGlobalShortcut,
  toggleMainWindow,
} from "./global-shortcut.mjs";

const oldBinding = { key: "w", ctrl: true, meta: false, alt: true, shift: false };
const newBinding = { key: "r", ctrl: true, meta: false, alt: true, shift: false };

describe("desktop global shortcut", () => {
  test("accepts safe key combinations and rejects single modifiers or unsupported keys", () => {
    expect(normalizeGlobalShortcutBinding(oldBinding, "win32")).toEqual(oldBinding);
    expect(globalShortcutAccelerator(oldBinding)).toBe("Control+Alt+W");
    expect(normalizeGlobalShortcutBinding({ ...oldBinding, alt: false }, "win32")).toBeUndefined();
    expect(normalizeGlobalShortcutBinding({ ...oldBinding, key: "escape" }, "win32")).toBeUndefined();
    expect(normalizeGlobalShortcutBinding({ ...oldBinding, meta: true }, "linux")).toBeUndefined();
    expect(normalizeGlobalShortcutBinding(null, "win32")).toBeNull();
  });

  test("shows a background window and hides only a focused window", () => {
    const calls = [];
    const window = {
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      isFocused: () => false,
      hide: () => calls.push("hide"),
    };
    const showWindow = () => calls.push("show");
    toggleMainWindow({ window, showWindow });
    expect(calls).toEqual(["show"]);
    window.isFocused = () => true;
    toggleMainWindow({ window, showWindow });
    expect(calls).toEqual(["show", "hide"]);
  });

  test("keeps the old shortcut when registration or persistence fails", async () => {
    const calls = [];
    let canRegister = false;
    let canSave = true;
    const globalShortcut = {
      register: (accelerator) => { calls.push(`register:${accelerator}`); return canRegister; },
      unregister: (accelerator) => calls.push(`unregister:${accelerator}`),
    };
    const replace = () => replaceGlobalShortcut({
      globalShortcut,
      previous: oldBinding,
      next: newBinding,
      callback: () => {},
      persist: async () => { if (!canSave) throw new Error("disk full"); },
    });
    expect(await replace()).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toEqual(["register:Control+Alt+R"]);
    canRegister = true;
    canSave = false;
    expect(await replace()).toEqual({ ok: false, reason: "saveFailed" });
    expect(calls).toEqual([
      "register:Control+Alt+R",
      "register:Control+Alt+R",
      "unregister:Control+Alt+R",
    ]);
    canSave = true;
    expect(await replace()).toEqual({ ok: true });
    expect(calls.slice(-2)).toEqual(["register:Control+Alt+R", "unregister:Control+Alt+W"]);
  });
});
