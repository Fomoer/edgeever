import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { NoteProseFontSize, NoteProseLineHeight } from "@edgeever/shared";
import { NOTE_PROSE_CSS_PREVIEW_DARK_CLASS, previewNoteProseCss } from "@/lib/css-sandbox";

const previewBaseCss = `
:host { display: block; }
.edgeever-editor {
  background: #f8fafb;
  color: #27272a;
}
.${NOTE_PROSE_CSS_PREVIEW_DARK_CLASS} .edgeever-editor {
  background: #222325;
  color: #dedede;
}
.ProseMirror {
  margin: 0;
  padding: 12px 16px 14px;
  font-family: var(--editor-body-font-family, var(--edgeever-system-font-family, ui-sans-serif, system-ui, sans-serif));
  font-size: var(--preview-font-size, 16px);
  line-height: var(--preview-line-height, 1.65);
}
.ProseMirror h1 {
  margin: 0 0 0.85rem;
  font-size: 1.5em;
  font-weight: 650;
  line-height: 1.28;
  letter-spacing: -0.02em;
}
.ProseMirror p { margin: 0; }
.ProseMirror a { color: inherit; }
.ProseMirror code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}
.ProseMirror blockquote {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #f3f5f7;
}
.${NOTE_PROSE_CSS_PREVIEW_DARK_CLASS} .ProseMirror blockquote {
  background: #2a2e2c;
}
`;

export const NoteProseCssPreview = ({
  css,
  dark,
  fontSize,
  lineHeight,
}: {
  css: string;
  dark: boolean;
  fontSize: NoteProseFontSize;
  lineHeight: NoteProseLineHeight;
}) => {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const previewCss = useMemo(() => previewNoteProseCss(css), [css]);
  const heading = t("settings.editorBodyCssPreviewHeading");
  const before = t("settings.editorBodyCssPreviewBefore");
  const link = t("settings.editorBodyCssPreviewLink");
  const between = t("settings.editorBodyCssPreviewBetween");
  const code = t("settings.editorBodyCssPreviewCode");
  const after = t("settings.editorBodyCssPreviewAfter");
  const quote = t("settings.editorBodyCssPreviewQuote");

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${previewBaseCss}\n${previewCss}`;
    // Scoped dark rules are `.note-prose-css-preview-dark .edgeever-editor .ProseMirror …`.
    // The class has to wrap the editor, or those rules never match.
    const scope = document.createElement("div");
    if (dark) scope.className = NOTE_PROSE_CSS_PREVIEW_DARK_CLASS;
    const frame = document.createElement("div");
    frame.className = "edgeever-editor";
    frame.style.setProperty("--preview-font-size", `${fontSize}px`);
    frame.style.setProperty("--preview-line-height", String(lineHeight));
    const prose = document.createElement("div");
    prose.className = "ProseMirror";
    const title = document.createElement("h1");
    title.textContent = heading;
    const paragraph = document.createElement("p");
    const anchor = document.createElement("a");
    anchor.textContent = link;
    const codeElement = document.createElement("code");
    codeElement.textContent = code;
    // Root typecheck resolves ParentNode.append to the Workers stream helper.
    paragraph.appendChild(document.createTextNode(before));
    paragraph.appendChild(anchor);
    paragraph.appendChild(document.createTextNode(between));
    paragraph.appendChild(codeElement);
    paragraph.appendChild(document.createTextNode(after));
    const quotation = document.createElement("blockquote");
    const quotationText = document.createElement("p");
    quotationText.textContent = quote;
    quotation.appendChild(quotationText);
    prose.appendChild(title);
    prose.appendChild(paragraph);
    prose.appendChild(quotation);
    frame.appendChild(prose);
    scope.appendChild(frame);
    root.replaceChildren(style, scope);
  }, [after, before, between, code, dark, fontSize, heading, lineHeight, link, previewCss, quote]);

  return (
    <div
      ref={hostRef}
      role="region"
      aria-label={t("settings.editorBodyCssPreviewLabel")}
      className="max-h-52 overflow-y-auto"
    />
  );
};
