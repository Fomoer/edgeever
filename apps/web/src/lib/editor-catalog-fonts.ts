import { FONT_CATALOG, isRemoteNoteImageFont } from "@edgeever/shared/font-catalog-data";
import type { BodyFontId } from "@edgeever/shared/font-loader";
import { createFontLoadState } from "./font-load-state";

/** Editor and interface requests have separate generations, feedback and retry handlers. */
const createFontWatcher = (ui = false) => {
  const state = createFontLoadState();
  let stop: (() => void) | undefined;
  let retryCurrent: (() => void) | undefined;
  return {
    state,
    retry: () => retryCurrent?.(),
    watch(font: BodyFontId | undefined) {
      stop?.();
      stop = undefined;
      retryCurrent = undefined;
      state.reset();
      if (!font || typeof MutationObserver === "undefined" || !document.body) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let active = true;
      let last = "";
      const refresh = () => {
        if (!active) return;
        const text = ui ? document.body.textContent ?? "" : Array.from(document.querySelectorAll<HTMLElement>(".edgeever-editor .ProseMirror, .edgeever-mobile-tiptap-content, .edgeever-editor textarea, .edgeever-editor .cm-content"))
          .map(node => node instanceof HTMLTextAreaElement ? node.value : node.textContent ?? "").join(" ");
        const characters = Array.from(new Set(Array.from(text))).sort().join("");
        if (characters === last && state.getSnapshot() !== "idle") return;
        last = characters;
        const name = isRemoteNoteImageFont(font) ? `${FONT_CATALOG[font].zh} ${FONT_CATALOG[font].en}` : "";
        void state.run(async () => {
          const { loadBodyFont } = await import("@edgeever/shared/font-loader");
          if (!active) return;
          return loadBodyFont(font, `${name} ${characters}`);
        }).catch(() => { /* Keep the local fallback; retry on reconnect or explicit request. */ });
      };
      const retry = () => { if (active) { last = ""; state.reset(); refresh(); } };
      retryCurrent = retry;
      const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 120); };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      document.addEventListener("input", schedule);
      window.addEventListener("online", retry);
      schedule();
      stop = () => {
        active = false;
        clearTimeout(timer);
        observer.disconnect();
        document.removeEventListener("input", schedule);
        window.removeEventListener("online", retry);
      };
    },
  };
};
const editor = createFontWatcher();
const ui = createFontWatcher(true);
export const editorFontLoadState = editor.state;
export const uiFontLoadState = ui.state;
export const retryEditorCatalogFont = editor.retry;
export const retryUiCatalogFont = ui.retry;
export const watchEditorCatalogFont = editor.watch;
export const watchUiCatalogFont = ui.watch;
