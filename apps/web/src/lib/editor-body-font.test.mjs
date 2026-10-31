import { FONT_IDS, FONT_CATALOG } from "@edgeever/shared/font-catalog";
import { afterEach, describe, expect, test } from "bun:test";
import {
  EDITOR_BODY_FONT_CUSTOM_STORAGE_KEY,
  EDITOR_BODY_FONT_STORAGE_KEY,
  applyEditorBodyFontPreference,
  getFontChoicePreviewStack,
  readEditorBodyFontPreference,
  resolveEditorBodyFontStack,
  sanitizeEditorBodyFontFamily,
  writeEditorBodyFontPreference,
} from "./editor-body-font.ts";

const installLocalStorage = () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  return values;
};

describe("editor body font preference", () => {
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  test("all catalog fonts survive saving and restoring while legacy choices remain readable", () => {
    const values = installLocalStorage();
    for (const id of FONT_IDS) {
      writeEditorBodyFontPreference({ choice: id, customFamily: "" });
      expect(readEditorBodyFontPreference().choice).toBe(id);
      expect(resolveEditorBodyFontStack({ choice: id, customFamily: "" })).toContain(FONT_CATALOG[id].family);
    }
    for (const id of ["system", "wenkai", "wenkai-screen", "zhuque", "source-han-serif", "neo-zhi-song", "source-han-sans", "source-serif", "custom"]) {
      values.set(EDITOR_BODY_FONT_STORAGE_KEY, id);
      expect(readEditorBodyFontPreference().choice).toBe(id);
    }
  });

  test("defaults to the system face and ignores unknown choices", () => {
    const values = installLocalStorage();
    expect(readEditorBodyFontPreference()).toEqual({ choice: "system", customFamily: "" });

    values.set(EDITOR_BODY_FONT_STORAGE_KEY, "comic-sans");
    expect(readEditorBodyFontPreference().choice).toBe("system");
  });

  test("persists a bundled face and a custom family", () => {
    const values = installLocalStorage();
    writeEditorBodyFontPreference({ choice: "wenkai", customFamily: "霞鹜文楷" });
    expect(values.get(EDITOR_BODY_FONT_STORAGE_KEY)).toBe("wenkai");
    expect(values.get(EDITOR_BODY_FONT_CUSTOM_STORAGE_KEY)).toBe("霞鹜文楷");
    expect(readEditorBodyFontPreference()).toEqual({ choice: "wenkai", customFamily: "霞鹜文楷" });
  });

  test("falls back when local storage is unavailable", () => {
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readEditorBodyFontPreference()).toEqual({ choice: "system", customFamily: "" });
    expect(() => writeEditorBodyFontPreference({ choice: "source-han-serif", customFamily: "" })).not.toThrow();
  });

  test("keeps installed font names and rejects style injection", () => {
    expect(sanitizeEditorBodyFontFamily("  LXGW WenKai  ")).toBe("LXGW WenKai");
    expect(sanitizeEditorBodyFontFamily('"Source Han Serif SC", Songti SC')).toBe('"Source Han Serif SC", Songti SC');
    expect(sanitizeEditorBodyFontFamily("霞鹜文楷")).toBe("霞鹜文楷");
    expect(sanitizeEditorBodyFontFamily("")).toBe("");
    expect(sanitizeEditorBodyFontFamily("WenKai; color: red")).toBe("");
    expect(sanitizeEditorBodyFontFamily("url(https://evil.example/font.woff2)")).toBe("");
    expect(sanitizeEditorBodyFontFamily("a".repeat(201))).toBe("");
  });

  test("resolves bundled stacks and appends a system fallback to custom names", () => {
    expect(resolveEditorBodyFontStack({ choice: "system", customFamily: "" })).toBeNull();
    expect(resolveEditorBodyFontStack({ choice: "wenkai", customFamily: "" })).toContain("EdgeEver Kai");
    expect(resolveEditorBodyFontStack({ choice: "wenkai-screen", customFamily: "" })).toContain("EdgeEver Kai Screen");
    expect(resolveEditorBodyFontStack({ choice: "zhuque", customFamily: "" })).toContain("EdgeEver Fangsong");
    expect(resolveEditorBodyFontStack({ choice: "source-han-serif", customFamily: "" })).toContain("EdgeEver Song");
    expect(resolveEditorBodyFontStack({ choice: "neo-zhi-song", customFamily: "" })).toContain("EdgeEver Zhi Song");
    expect(resolveEditorBodyFontStack({ choice: "source-han-serif", customFamily: "" })).toContain("Source Serif 4");
    expect(resolveEditorBodyFontStack({ choice: "source-han-sans", customFamily: "" })).toContain("EdgeEver Hei");
    expect(resolveEditorBodyFontStack({ choice: "source-serif", customFamily: "" })).toContain("Source Serif 4");
    expect(resolveEditorBodyFontStack({ choice: "custom", customFamily: "LXGW WenKai" })).toContain("LXGW WenKai");
    expect(resolveEditorBodyFontStack({ choice: "custom", customFamily: "LXGW WenKai" })).toContain("PingFang SC");
    expect(resolveEditorBodyFontStack({ choice: "custom", customFamily: "bad; family" })).toBeNull();
  });

  test("publishes the resolved stack on the document and clears it for the system face", () => {
    installLocalStorage();
    const style = new Map();
    const dataset = {};
    globalThis.document = {
      documentElement: {
        dataset,
        style: {
          setProperty: (key, value) => style.set(key, value),
          removeProperty: (key) => style.delete(key),
        },
      },
    };

    applyEditorBodyFontPreference({ choice: "source-han-sans", customFamily: "" });
    expect(dataset.editorBodyFont).toBe("source-han-sans");
    expect(style.get("--editor-body-font-family")).toContain("EdgeEver Hei");

    applyEditorBodyFontPreference({ choice: "system", customFamily: "" });
    expect(dataset.editorBodyFont).toBeUndefined();
    expect(style.has("--editor-body-font-family")).toBe(false);
  });

  test("only known monospace fonts follow the body choice into code, and switching restores the fallback", () => {
    const style = new Map();
    const dataset = {};
    globalThis.document = {
      documentElement: { dataset, style: {
        setProperty: (key, value) => style.set(key, value),
        removeProperty: key => style.delete(key),
      } },
    };
    for (const id of ["maple-mono-cn", "jetbrains"]) {
      applyEditorBodyFontPreference({ choice: id, customFamily: "" });
      expect(dataset.editorCodeFont).toBe(id);
      expect(style.get("--editor-code-font-family")).toContain(FONT_CATALOG[id].family);
      expect(style.get("--editor-code-font-family")).toEndWith("monospace");
      for (const next of ["wenkai", "source-han-serif", "heavy", "custom", "system"]) {
        applyEditorBodyFontPreference({ choice: next, customFamily: "Arial" });
        expect(dataset.editorCodeFont).toBeUndefined();
        expect(style.has("--editor-code-font-family")).toBe(false);
      }
    }
  });

  test("returns font preview stacks for bundled choices", () => {
    expect(getFontChoicePreviewStack("system")).toBeUndefined();
    expect(getFontChoicePreviewStack("custom")).toBeUndefined();
    expect(getFontChoicePreviewStack("wenkai")).toContain("EdgeEver Kai");
    expect(getFontChoicePreviewStack("zhuque")).toContain("EdgeEver Fangsong");
  });
});
