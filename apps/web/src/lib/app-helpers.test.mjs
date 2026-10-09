import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SHORTCUT_SETTINGS,
  DESKTOP_FOCUS_MODE_STORAGE_KEY,
  DESKTOP_READING_PROTECTION_STORAGE_KEY,
  NOTEBOOK_SIDEBAR_COLLAPSED_STORAGE_KEY,
  EDITOR_OUTLINE_COLLAPSED_STORAGE_KEY,
  EDITOR_CONTENT_ALIGNMENT_STORAGE_KEY,
  EDITOR_TOOLBAR_EXPANDED_STORAGE_KEY,
  EDITOR_PHONE_PREVIEW_STORAGE_KEY,
  EDITOR_PHONE_PREVIEW_FOLLOW_STORAGE_KEY,
  NOTEBOOK_SORT_STORAGE_KEY,
  NOTEBOOK_TREE_COLLAPSED_IDS_STORAGE_KEY,
  SHORTCUT_SETTINGS_STORAGE_KEY,
  getSearchShortcutScope,
  getCreateMemoNotebookId,
  getShortcutActionForEvent,
  canToggleNotebookSidebar,
  getNotebookSortComparator,
  readEditorContentAlignmentPreference,
  readNotebookSortPreference,
  readNotebookTreeCollapsedIdsPreference,
  readDesktopFocusModePreference,
  readDesktopReadingProtectionPreference,
  readNotebookSidebarCollapsedPreference,
  readEditorOutlineCollapsedPreference,
  readEditorToolbarExpandedPreference,
  readEditorPhonePreviewPreference,
  readEditorPhonePreviewFollowPreference,
  readShortcutSettingsPreference,
  writeEditorContentAlignmentPreference,
  writeNotebookSortPreference,
  writeNotebookTreeCollapsedIdsPreference,
  writeDesktopFocusModePreference,
  writeDesktopReadingProtectionPreference,
  writeNotebookSidebarCollapsedPreference,
  writeEditorOutlineCollapsedPreference,
  writeEditorToolbarExpandedPreference,
  writeEditorPhonePreviewPreference,
  writeEditorPhonePreviewFollowPreference,
  resolveSelectionMoveTargetNotebookId,
  getMemoIdsNeedingMove,
  getActiveBlockValue,
  parseHeadingBlockValue,
} from "./app-helpers.ts";

const originalWindow = globalThis.window;

test("a stale selected notebook cannot send a new note to the inbox", () => {
  const notebooks = [{ id: "nb_inbox" }, { id: "nb_remote" }];
  expect(getCreateMemoNotebookId("nb_local", notebooks, "nb_inbox")).toBeNull();
  expect(getCreateMemoNotebookId("nb_remote", notebooks, "nb_inbox")).toBe("nb_remote");
  expect(getCreateMemoNotebookId(null, notebooks, "nb_inbox")).toBe("nb_inbox");
});

const installLocalStorage = (initialValue = null) => {
  const values = new Map();
  if (initialValue !== null) {
    values.set(DESKTOP_FOCUS_MODE_STORAGE_KEY, initialValue);
  }

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };

  return values;
};

afterEach(() => {
  if (originalWindow !== undefined) globalThis.window = originalWindow;
});

describe("search shortcut scope", () => {
  test("keeps Ctrl/Command+F within an open note regardless of viewport layout", () => {
    expect(getSearchShortcutScope("memo-1")).toBe("note");
  });

  test("uses memo-list search when no note is open", () => {
    expect(getSearchShortcutScope(null)).toBe("memo-list");
  });
});

describe("desktop focus mode preference", () => {
  test("defaults to disabled and only accepts an explicit true value", () => {
    installLocalStorage();
    expect(readDesktopFocusModePreference()).toBe(false);

    installLocalStorage("false");
    expect(readDesktopFocusModePreference()).toBe(false);

    installLocalStorage("true");
    expect(readDesktopFocusModePreference()).toBe(true);
  });

  test("persists enabled and disabled values", () => {
    const values = installLocalStorage();

    writeDesktopFocusModePreference(true);
    expect(values.get(DESKTOP_FOCUS_MODE_STORAGE_KEY)).toBe("true");

    writeDesktopFocusModePreference(false);
    expect(values.get(DESKTOP_FOCUS_MODE_STORAGE_KEY)).toBe("false");
  });

  test("fails closed when local storage is unavailable", () => {
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

    expect(readDesktopFocusModePreference()).toBe(false);
    expect(() => writeDesktopFocusModePreference(true)).not.toThrow();
  });
});

describe("notebook sidebar collapsed preference", () => {
  test("defaults to expanded and only accepts an explicit true value", () => {
    installLocalStorage();
    expect(readNotebookSidebarCollapsedPreference()).toBe(false);

    const values = installLocalStorage();
    values.set(NOTEBOOK_SIDEBAR_COLLAPSED_STORAGE_KEY, "false");
    expect(readNotebookSidebarCollapsedPreference()).toBe(false);

    values.set(NOTEBOOK_SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    expect(readNotebookSidebarCollapsedPreference()).toBe(true);
  });

  test("persists collapsed and expanded values", () => {
    const values = installLocalStorage();

    writeNotebookSidebarCollapsedPreference(true);
    expect(values.get(NOTEBOOK_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    writeNotebookSidebarCollapsedPreference(false);
    expect(values.get(NOTEBOOK_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
  });

  test("fails closed when local storage is unavailable", () => {
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

    expect(readNotebookSidebarCollapsedPreference()).toBe(false);
    expect(() => writeNotebookSidebarCollapsedPreference(true)).not.toThrow();
  });
});

describe("editor toolbar expanded preference", () => {
  test("defaults to collapsed and only accepts an explicit true value", () => {
    const values = installLocalStorage();
    expect(readEditorToolbarExpandedPreference()).toBe(false);

    values.set(EDITOR_TOOLBAR_EXPANDED_STORAGE_KEY, "false");
    expect(readEditorToolbarExpandedPreference()).toBe(false);

    values.set(EDITOR_TOOLBAR_EXPANDED_STORAGE_KEY, "true");
    expect(readEditorToolbarExpandedPreference()).toBe(true);
  });

  test("persists expanded and collapsed values", () => {
    const values = installLocalStorage();

    writeEditorToolbarExpandedPreference(true);
    expect(values.get(EDITOR_TOOLBAR_EXPANDED_STORAGE_KEY)).toBe("true");

    writeEditorToolbarExpandedPreference(false);
    expect(values.get(EDITOR_TOOLBAR_EXPANDED_STORAGE_KEY)).toBe("false");
  });
});

describe("editor phone preview preference", () => {
  test("defaults to hidden and only accepts an explicit true value", () => {
    const values = installLocalStorage();
    expect(readEditorPhonePreviewPreference()).toBe(false);

    values.set(EDITOR_PHONE_PREVIEW_STORAGE_KEY, "false");
    expect(readEditorPhonePreviewPreference()).toBe(false);

    values.set(EDITOR_PHONE_PREVIEW_STORAGE_KEY, "true");
    expect(readEditorPhonePreviewPreference()).toBe(true);
  });

  test("persists phone preview visibility", () => {
    const values = installLocalStorage();

    writeEditorPhonePreviewPreference(true);
    expect(values.get(EDITOR_PHONE_PREVIEW_STORAGE_KEY)).toBe("true");

    writeEditorPhonePreviewPreference(false);
    expect(values.get(EDITOR_PHONE_PREVIEW_STORAGE_KEY)).toBe("false");
  });

  test("defaults phone preview scroll following to on", () => {
    const values = installLocalStorage();
    expect(readEditorPhonePreviewFollowPreference()).toBe(true);

    values.set(EDITOR_PHONE_PREVIEW_FOLLOW_STORAGE_KEY, "false");
    expect(readEditorPhonePreviewFollowPreference()).toBe(false);

    values.set(EDITOR_PHONE_PREVIEW_FOLLOW_STORAGE_KEY, "true");
    expect(readEditorPhonePreviewFollowPreference()).toBe(true);
  });

  test("persists phone preview scroll following", () => {
    const values = installLocalStorage();

    writeEditorPhonePreviewFollowPreference(false);
    expect(values.get(EDITOR_PHONE_PREVIEW_FOLLOW_STORAGE_KEY)).toBe("false");

    writeEditorPhonePreviewFollowPreference(true);
    expect(values.get(EDITOR_PHONE_PREVIEW_FOLLOW_STORAGE_KEY)).toBe("true");
  });
});

describe("desktop reading protection preference", () => {
  test("defaults to editing and only accepts an explicit true value", () => {
    const values = installLocalStorage();
    expect(readDesktopReadingProtectionPreference()).toBe(false);

    values.set(DESKTOP_READING_PROTECTION_STORAGE_KEY, "false");
    expect(readDesktopReadingProtectionPreference()).toBe(false);

    values.set(DESKTOP_READING_PROTECTION_STORAGE_KEY, "true");
    expect(readDesktopReadingProtectionPreference()).toBe(true);
  });

  test("persists protected and editable modes", () => {
    const values = installLocalStorage();

    writeDesktopReadingProtectionPreference(true);
    expect(values.get(DESKTOP_READING_PROTECTION_STORAGE_KEY)).toBe("true");

    writeDesktopReadingProtectionPreference(false);
    expect(values.get(DESKTOP_READING_PROTECTION_STORAGE_KEY)).toBe("false");
  });

  test("fails open when local storage is unavailable", () => {
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

    expect(readDesktopReadingProtectionPreference()).toBe(false);
    expect(() => writeDesktopReadingProtectionPreference(true)).not.toThrow();
  });
});

describe("editor outline preference", () => {
  test("defaults to collapsed and only expands for an explicit false value", () => {
    const values = installLocalStorage();
    expect(readEditorOutlineCollapsedPreference()).toBe(true);
    expect(readEditorOutlineCollapsedPreference({ defaultCollapsed: false })).toBe(false);
    expect(readEditorOutlineCollapsedPreference({ defaultCollapsed: true })).toBe(true);

    values.set(EDITOR_OUTLINE_COLLAPSED_STORAGE_KEY, "true");
    expect(readEditorOutlineCollapsedPreference()).toBe(true);
    expect(readEditorOutlineCollapsedPreference({ defaultCollapsed: false })).toBe(true);

    values.set(EDITOR_OUTLINE_COLLAPSED_STORAGE_KEY, "false");
    expect(readEditorOutlineCollapsedPreference()).toBe(false);
    expect(readEditorOutlineCollapsedPreference({ defaultCollapsed: true })).toBe(false);
  });

  test("persists collapsed and expanded states", () => {
    const values = installLocalStorage();

    writeEditorOutlineCollapsedPreference(false);
    expect(values.get(EDITOR_OUTLINE_COLLAPSED_STORAGE_KEY)).toBe("false");

    writeEditorOutlineCollapsedPreference(true);
    expect(values.get(EDITOR_OUTLINE_COLLAPSED_STORAGE_KEY)).toBe("true");
  });

  test("falls back to collapsed when local storage is unavailable", () => {
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

    expect(readEditorOutlineCollapsedPreference()).toBe(true);
    expect(() => writeEditorOutlineCollapsedPreference(false)).not.toThrow();
  });
});

describe("editor content alignment preference", () => {
  test("defaults to left aligned and persists both supported alignments", () => {
    const values = installLocalStorage();
    expect(readEditorContentAlignmentPreference()).toBe("start");

    writeEditorContentAlignmentPreference("start");
    expect(values.get(EDITOR_CONTENT_ALIGNMENT_STORAGE_KEY)).toBe("start");
    expect(readEditorContentAlignmentPreference()).toBe("start");

    writeEditorContentAlignmentPreference("center");
    expect(values.get(EDITOR_CONTENT_ALIGNMENT_STORAGE_KEY)).toBe("center");
    expect(readEditorContentAlignmentPreference()).toBe("center");
  });

  test("falls back to left aligned for unknown or unavailable storage", () => {
    const values = installLocalStorage();
    values.set(EDITOR_CONTENT_ALIGNMENT_STORAGE_KEY, "unexpected");
    expect(readEditorContentAlignmentPreference()).toBe("start");

    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readEditorContentAlignmentPreference()).toBe("start");
  });
});

describe("custom notebook sorting", () => {
  test("persists the custom sort mode", () => {
    const values = installLocalStorage();
    writeNotebookSortPreference("custom");
    expect(values.get(NOTEBOOK_SORT_STORAGE_KEY)).toBe("custom");
    expect(readNotebookSortPreference()).toBe("custom");
  });

  test("orders notebooks by persisted sort order with a stable name fallback", () => {
    const compare = getNotebookSortComparator("custom");
    const base = {
      parentId: null,
      slug: null,
      icon: null,
      color: null,
      memoCount: 0,
      lastMemoUpdatedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const notebooks = [
      { ...base, id: "third", name: "C", sortOrder: 30 },
      { ...base, id: "second", name: "B", sortOrder: 20 },
      { ...base, id: "first", name: "A", sortOrder: 20 },
    ];

    expect(notebooks.sort(compare).map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});

describe("notebook tree collapsed preference", () => {
  test("round-trips the user's collapsed notebook branches", () => {
    const values = installLocalStorage();

    writeNotebookTreeCollapsedIdsPreference(["notebook-2", "notebook-1", "notebook-2"]);

    expect(values.get(NOTEBOOK_TREE_COLLAPSED_IDS_STORAGE_KEY)).toBe('["notebook-2","notebook-1"]');
    expect(readNotebookTreeCollapsedIdsPreference()).toEqual(new Set(["notebook-2", "notebook-1"]));
  });

  test("ignores malformed and invalid stored values", () => {
    const values = installLocalStorage();

    values.set(NOTEBOOK_TREE_COLLAPSED_IDS_STORAGE_KEY, "{");
    expect(readNotebookTreeCollapsedIdsPreference()).toEqual(new Set());

    values.set(NOTEBOOK_TREE_COLLAPSED_IDS_STORAGE_KEY, JSON.stringify(["notebook-1", "", null, 2]));
    expect(readNotebookTreeCollapsedIdsPreference()).toEqual(new Set(["notebook-1"]));
  });

  test("falls back to expanded when local storage is unavailable", () => {
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

    expect(readNotebookTreeCollapsedIdsPreference()).toEqual(new Set());
    expect(() => writeNotebookTreeCollapsedIdsPreference(["notebook-1"])).not.toThrow();
  });
});

describe("workspace shortcut preferences", () => {
  test("provides navigation, AI, save, reading protection, and editor mode defaults", () => {
    expect(DEFAULT_SHORTCUT_SETTINGS.focusGlobalSearch).toEqual({
      key: "f",
      ctrlOrMeta: true,
      shift: true,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.openQuickSwitcher).toEqual({
      key: "o",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.openPreviousMemo.key).toBe("[");
    expect(DEFAULT_SHORTCUT_SETTINGS.openNextMemo.key).toBe("]");
    expect(DEFAULT_SHORTCUT_SETTINGS.openAiAssistant).toEqual({
      key: "j",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.saveAndSync).toEqual({
      key: "s",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.toggleEditorMode).toEqual({
      key: "/",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.toggleReadingProtection).toEqual({
      key: "e",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.toggleOutline).toEqual({
      key: "1",
      ctrlOrMeta: true,
      shift: true,
      alt: false,
    });
    expect(DEFAULT_SHORTCUT_SETTINGS.toggleSidebar).toEqual({
      key: "\\",
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
  });

  test("migrates the unreleased reading protection shortcut without replacing custom bindings", () => {
    const values = installLocalStorage();
    values.set(SHORTCUT_SETTINGS_STORAGE_KEY, JSON.stringify({
      toggleReadingProtection: { key: "l", ctrlOrMeta: true, shift: true, alt: false },
    }));
    expect(readShortcutSettingsPreference().toggleReadingProtection).toEqual(
      DEFAULT_SHORTCUT_SETTINGS.toggleReadingProtection,
    );

    values.set(SHORTCUT_SETTINGS_STORAGE_KEY, JSON.stringify({
      toggleReadingProtection: { key: "r", ctrlOrMeta: true, shift: true, alt: false },
    }));
    expect(readShortcutSettingsPreference().toggleReadingProtection).toEqual({
      key: "r",
      ctrlOrMeta: true,
      shift: true,
      alt: false,
    });
  });

  test("fills new shortcut actions into legacy stored settings", () => {
    const values = installLocalStorage();
    values.set(SHORTCUT_SETTINGS_STORAGE_KEY, JSON.stringify({
      createMemo: { key: "m", ctrlOrMeta: true, shift: false, alt: false },
    }));

    const settings = readShortcutSettingsPreference();
    expect(settings.createMemo.key).toBe("m");
    expect(settings.openAiAssistant).toEqual(DEFAULT_SHORTCUT_SETTINGS.openAiAssistant);
    expect(settings.focusGlobalSearch).toEqual(DEFAULT_SHORTCUT_SETTINGS.focusGlobalSearch);
    expect(settings.openQuickSwitcher).toEqual(DEFAULT_SHORTCUT_SETTINGS.openQuickSwitcher);
    expect(settings.openPreviousMemo).toEqual(DEFAULT_SHORTCUT_SETTINGS.openPreviousMemo);
    expect(settings.openNextMemo).toEqual(DEFAULT_SHORTCUT_SETTINGS.openNextMemo);
    expect(settings.saveAndSync).toEqual(DEFAULT_SHORTCUT_SETTINGS.saveAndSync);
    expect(settings.toggleReadingProtection).toEqual(DEFAULT_SHORTCUT_SETTINGS.toggleReadingProtection);
    expect(settings.toggleEditorMode).toEqual(DEFAULT_SHORTCUT_SETTINGS.toggleEditorMode);
    expect(settings.toggleOutline).toEqual(DEFAULT_SHORTCUT_SETTINGS.toggleOutline);
  });

  test("recognizes Ctrl and Command variants for the new actions", () => {
    const keyboardEvent = (key, modifiers = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...modifiers,
    });

    expect(getShortcutActionForEvent(
      keyboardEvent("f", { metaKey: true, shiftKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("focusGlobalSearch");
    expect(getShortcutActionForEvent(
      keyboardEvent("o", { ctrlKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("openQuickSwitcher");
    expect(getShortcutActionForEvent(
      keyboardEvent("[", { metaKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("openPreviousMemo");
    expect(getShortcutActionForEvent(
      keyboardEvent("]", { ctrlKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("openNextMemo");
    expect(getShortcutActionForEvent(
      keyboardEvent("j", { metaKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("openAiAssistant");
    expect(getShortcutActionForEvent(
      keyboardEvent("s", { ctrlKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("saveAndSync");
    expect(getShortcutActionForEvent(
      keyboardEvent("e", { ctrlKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("toggleReadingProtection");
    expect(getShortcutActionForEvent(
      keyboardEvent("/", { metaKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("toggleEditorMode");
    expect(getShortcutActionForEvent(
      keyboardEvent("!", { code: "Digit1", ctrlKey: true, shiftKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("toggleOutline");
    expect(getShortcutActionForEvent(
      keyboardEvent("\\", { metaKey: true }),
      DEFAULT_SHORTCUT_SETTINGS,
    )).toBe("toggleSidebar");
  });

  test("toggles the sidebar only when it is visible", () => {
    expect(canToggleNotebookSidebar({ isDesktop: true, focusModeActive: false })).toBe(true);
    // Focus Mode hides the sidebar, so the shortcut must not change its saved state.
    expect(canToggleNotebookSidebar({ isDesktop: true, focusModeActive: true })).toBe(false);
    expect(canToggleNotebookSidebar({ isDesktop: false, focusModeActive: false })).toBe(false);
    expect(canToggleNotebookSidebar({ isDesktop: false, focusModeActive: true })).toBe(false);
    // The workspace checks the same flag that hides the sidebar in its layout.
    const workspaceSource = readFileSync(new URL("../components/WorkspaceApp.tsx", import.meta.url), "utf8");
    expect(workspaceSource).toContain("canToggleNotebookSidebar({ isDesktop, focusModeActive: desktopFocusModeActive })");
  });
});

describe("selection move target", () => {
  test("keeps a valid user-chosen notebook instead of snapping back to the current notebook", () => {
    expect(resolveSelectionMoveTargetNotebookId("target-2", ["inbox", "target-2"], "inbox")).toBe("target-2");
  });

  test("falls back to the current notebook only when the stored target is missing or invalid", () => {
    expect(resolveSelectionMoveTargetNotebookId("", ["inbox", "archive"], "inbox")).toBe("inbox");
    expect(resolveSelectionMoveTargetNotebookId("deleted", ["inbox", "archive"], "inbox")).toBe("inbox");
    expect(resolveSelectionMoveTargetNotebookId("", ["inbox", "archive"], null)).toBe("inbox");
  });

  test("moves only notes that are not already in the target notebook", () => {
    const memos = [
      { id: "memo-1", notebookId: "inbox" },
      { id: "memo-2", notebookId: "archive" },
      { id: "memo-3", notebookId: "inbox" },
    ];

    expect(getMemoIdsNeedingMove(memos, ["memo-1", "memo-2", "memo-3"], "archive")).toEqual(["memo-1", "memo-3"]);
    expect(getMemoIdsNeedingMove(memos, ["memo-2"], "archive")).toEqual([]);
    expect(getMemoIdsNeedingMove(memos, ["memo-1"], "")).toEqual([]);
  });
});

describe("editor heading block value", () => {
  test("parses heading-1 through heading-6 and rejects other values", () => {
    expect(parseHeadingBlockValue("heading-1")).toBe(1);
    expect(parseHeadingBlockValue("heading-6")).toBe(6);
    expect(parseHeadingBlockValue("heading-7")).toBe(null);
    expect(parseHeadingBlockValue("paragraph")).toBe(null);
  });

  test("reports the active heading level including 4 through 6", () => {
    const editor = {
      isDestroyed: false,
      extensionManager: {},
      isActive: (name, attrs) => name === "heading" && attrs.level === 5,
    };

    expect(getActiveBlockValue(editor)).toBe("heading-5");
    expect(getActiveBlockValue({
      isDestroyed: false,
      extensionManager: {},
      isActive: (name, attrs) => name === "heading" && attrs.level === 3,
    })).toBe("heading-3");
    expect(getActiveBlockValue({
      isDestroyed: false,
      extensionManager: {},
      isActive: () => false,
    })).toBe("paragraph");
  });
});
