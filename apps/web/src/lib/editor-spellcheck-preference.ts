import { useEffect, useState } from "react";

export const EDITOR_SPELLCHECK_STORAGE_KEY = "edgeever.editor.spellcheckEnabled";

export const EDITOR_SPELLCHECK_CHANGED_EVENT = "edgeever:editor-spellcheck-changed";

// Holds the latest choice when localStorage rejects the write, so the setting
// stays consistent for the rest of the session instead of reverting on remount.
let unsavedEditorSpellcheckPreference: boolean | null = null;

export const resolveStoredEditorSpellcheckPreference = (stored: string | null): boolean =>
  stored !== "false";

export const readEditorSpellcheckPreference = (): boolean => {
  if (unsavedEditorSpellcheckPreference !== null) return unsavedEditorSpellcheckPreference;
  if (typeof window === "undefined") return true;
  try {
    return resolveStoredEditorSpellcheckPreference(
      window.localStorage?.getItem(EDITOR_SPELLCHECK_STORAGE_KEY) ?? null,
    );
  } catch {
    return true;
  }
};

export const writeEditorSpellcheckPreference = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(EDITOR_SPELLCHECK_STORAGE_KEY, enabled ? "true" : "false");
    unsavedEditorSpellcheckPreference = null;
  } catch {
    // Private mode / blocked storage — keep the preference in memory for this session.
    unsavedEditorSpellcheckPreference = enabled;
  }
  window.dispatchEvent(
    new CustomEvent(EDITOR_SPELLCHECK_CHANGED_EVENT, { detail: enabled }),
  );
};

export const useEditorSpellcheckPreference = (): boolean => {
  const [enabled, setEnabled] = useState(readEditorSpellcheckPreference);

  useEffect(() => {
    const syncPreference = () => setEnabled(readEditorSpellcheckPreference());
    const handlePreferenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") {
        setEnabled(detail);
        return;
      }
      syncPreference();
    };
    window.addEventListener(EDITOR_SPELLCHECK_CHANGED_EVENT, handlePreferenceChanged);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(EDITOR_SPELLCHECK_CHANGED_EVENT, handlePreferenceChanged);
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  return enabled;
};
