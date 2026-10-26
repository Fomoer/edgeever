export const MOBILE_EDITOR_AUTOSAVE_DELAY_MS = 1200;

export type MobileEditorSaveChromeInput = {
  dirty: boolean;
  draftRestored: boolean;
  error: boolean;
  ready: boolean;
  saving: boolean;
  uploading: boolean;
};

export type MobileEditorSaveChrome = {
  /** Green pill. Routine autosave stays on the quiet gray chip. */
  emphasized: boolean;
  label: "保存失败" | "上传中" | "本地草稿" | "未保存" | "已保存" | "加载中";
};

/**
 * Status chip for an existing note.
 * A background save keeps the unsaved label, so the header does not cycle
 * through “保存中” and “已保存” on every pause. The Done button stays a label.
 */
export const getMobileEditorSaveChrome = ({
  dirty,
  draftRestored,
  error,
  ready,
  saving,
  uploading,
}: MobileEditorSaveChromeInput): MobileEditorSaveChrome => {
  if (error) return { emphasized: false, label: "保存失败" };
  if (uploading) return { emphasized: true, label: "上传中" };
  if (dirty || saving) return { emphasized: false, label: draftRestored ? "本地草稿" : "未保存" };
  if (ready) return { emphasized: false, label: "已保存" };
  return { emphasized: false, label: "加载中" };
};

export const shouldScheduleMobileEditorAutosave = ({
  active,
  closing,
  dirty,
  ready,
  saving,
  uploading,
}: {
  active: boolean;
  closing: boolean;
  dirty: boolean;
  ready: boolean;
  saving: boolean;
  uploading: boolean;
}) => active && dirty && ready && !saving && !uploading && !closing;
