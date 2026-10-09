import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildDocxPreviewHtml } from "./docx-preview-html";
import { DocxPreviewTooLargeError, loadDocxPreviewBytes } from "./docx-preview-source";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; html: string }
  | { status: "too-large" | "failed" };

export const DocxAttachmentPreview = ({ url, filename }: { url: string; filename: string }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    void loadDocxPreviewBytes(url, controller.signal)
      .then(async (bytes) => {
        if (!active) return;
        const { renderAsync } = await import("docx-preview");
        if (!active) return;
        const body = document.createElement("div");
        const styles = document.createElement("div");
        await renderAsync(bytes, body, styles, {
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
          useBase64URL: true,
        });
        body.querySelectorAll("a").forEach((link) => {
          link.removeAttribute("href");
          link.removeAttribute("target");
          link.setAttribute("tabindex", "-1");
        });
        if (active) setState({ status: "ready", html: buildDocxPreviewHtml(styles.innerHTML, body.innerHTML) });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: error instanceof DocxPreviewTooLargeError ? "too-large" : "failed" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);

  if (state.status === "ready") {
    return (
      <iframe
        aria-label={t("wordViewer.previewLabel", { filename })}
        sandbox=""
        srcDoc={state.html}
        className="block h-[min(72vh,52rem)] w-full border-0 bg-slate-100"
      />
    );
  }

  return (
    <span className="flex min-h-24 items-center justify-center gap-2 px-4 text-center text-sm text-slate-500" role="status">
      {state.status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
      {t(state.status === "loading" ? "wordViewer.loading" : state.status === "too-large" ? "wordViewer.previewTooLarge" : "wordViewer.unavailable")}
    </span>
  );
};
