import {
  hasDiagramDocumentMarker,
  markdownToDoc,
  parseDiagramDocument,
  resolveMemoContentDoc,
  rewriteMemoResourcesForShare,
  stripDiagramDocumentMarker,
  type DiagramDocument,
  type PublicMemoShare,
  type TiptapDoc,
} from "@edgeever/shared";

export type PublicShareBody =
  | { type: "diagram"; diagram: DiagramDocument }
  | { type: "rich-text"; content: TiptapDoc };

/** Visual diagram notes share through IR → X6. Ordinary notes, including embedded Mermaid fences, stay on TipTap. */
export const resolvePublicShareBody = (share: PublicMemoShare, token: string): PublicShareBody => {
  const diagram = parseDiagramDocument(share.contentMarkdown);
  if (diagram) return { type: "diagram", diagram };
  const richText = hasDiagramDocumentMarker(share.contentMarkdown)
    ? markdownToDoc(stripDiagramDocumentMarker(share.contentMarkdown))
    : resolveMemoContentDoc(share.contentJson, share.contentMarkdown);
  return {
    type: "rich-text",
    content: rewriteMemoResourcesForShare(richText, token, share.memoShareTokens),
  };
};
