import { describe, expect, test } from "bun:test";
import {
  getMobileEditorSaveChrome,
  shouldScheduleMobileEditorAutosave,
} from "./mobile-editor-save-chrome";

const idle = {
  dirty: false,
  draftRestored: false,
  error: false,
  ready: true,
  saving: false,
  uploading: false,
};

describe("getMobileEditorSaveChrome", () => {
  test("keeps a saved note on the quiet chip", () => {
    expect(getMobileEditorSaveChrome(idle)).toEqual({ emphasized: false, label: "已保存" });
  });

  test("shows unsaved edits without a saving flash or green pill", () => {
    expect(getMobileEditorSaveChrome({ ...idle, dirty: true })).toEqual({
      emphasized: false,
      label: "未保存",
    });
    expect(getMobileEditorSaveChrome({ ...idle, dirty: true, saving: true })).toEqual({
      emphasized: false,
      label: "未保存",
    });
  });

  test("keeps a restored draft visible while its first save is in flight", () => {
    expect(getMobileEditorSaveChrome({ ...idle, dirty: true, draftRestored: true, saving: true })).toEqual({
      emphasized: false,
      label: "本地草稿",
    });
  });

  test("keeps upload and failure visible", () => {
    expect(getMobileEditorSaveChrome({ ...idle, uploading: true, dirty: true })).toEqual({
      emphasized: true,
      label: "上传中",
    });
    expect(getMobileEditorSaveChrome({ ...idle, error: true, saving: true })).toEqual({
      emphasized: false,
      label: "保存失败",
    });
  });

  test("shows a loading label before the editor is ready", () => {
    expect(getMobileEditorSaveChrome({ ...idle, ready: false }).label).toBe("加载中");
  });
});

describe("shouldScheduleMobileEditorAutosave", () => {
  const ready = {
    active: true,
    closing: false,
    dirty: true,
    ready: true,
    saving: false,
    uploading: false,
  };

  test("schedules after an edit settles", () => {
    expect(shouldScheduleMobileEditorAutosave(ready)).toBe(true);
  });

  test("waits out an in-flight save, upload, or close", () => {
    expect(shouldScheduleMobileEditorAutosave({ ...ready, saving: true })).toBe(false);
    expect(shouldScheduleMobileEditorAutosave({ ...ready, uploading: true })).toBe(false);
    expect(shouldScheduleMobileEditorAutosave({ ...ready, closing: true })).toBe(false);
    expect(shouldScheduleMobileEditorAutosave({ ...ready, dirty: false })).toBe(false);
    expect(shouldScheduleMobileEditorAutosave({ ...ready, active: false })).toBe(false);
  });
});
