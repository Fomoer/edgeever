import type { TiptapDoc, TiptapNode, TiptapTextNode } from "./content";
import type { PublicNoteProse } from "./note-prose";
import { parseMemoLinkHref } from "./note-links";

export type MemoShare = {
  memoId: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  passwordProtected: boolean;
  /** Plaintext is returned only immediately after the owner enables or regenerates a password. */
  password?: string;
};

export type ManagedMemoShare = MemoShare & {
  memoTitle: string | null;
  notebookId: string;
  notebookName: string | null;
};

export const PUBLISHED_NOTE_BODY_FONTS = [
  "wenkai",
  "wenkai-screen",
  "zhuque",
  "source-han-serif",
  "neo-zhi-song",
  "source-han-sans",
  "source-serif",
] as const;

export type PublishedNoteBodyFont = (typeof PUBLISHED_NOTE_BODY_FONTS)[number];

export const parsePublishedNoteBodyFont = (value: unknown): PublishedNoteBodyFont | null =>
  typeof value === "string" && (PUBLISHED_NOTE_BODY_FONTS as readonly string[]).includes(value)
    ? value as PublishedNoteBodyFont
    : null;

export type PublicMemoShare = {
  title: string | null;
  contentJson: TiptapDoc;
  contentMarkdown: string;
  tags: string[];
  updatedAt: string;
  memoShareTokens: Record<string, string>;
  /** Built-in face chosen by the author. Null keeps the system font and downloads nothing. */
  bodyFont: PublishedNoteBodyFont | null;
  /** Account reading settings for the article body. Column width stays on the author's editor. */
  prose: PublicNoteProse;
};

const RESOURCE_URL_PATTERN = /^\/api\/v1\/resources\/([^/?#]+)\/blob(?:[?#].*)?$/;

const rewriteAttributeValue = (
  value: unknown,
  token: string,
  memoShareTokens: Readonly<Record<string, string>>,
) => {
  if (typeof value !== "string") return value;
  const match = value.match(RESOURCE_URL_PATTERN);
  if (match) {
    return `/api/public/shares/${encodeURIComponent(token)}/resources/${encodeURIComponent(match[1])}/blob`;
  }

  const memoId = parseMemoLinkHref(value);
  const shareToken = memoId ? memoShareTokens[memoId] : null;
  return shareToken ? `/share/${encodeURIComponent(shareToken)}` : value;
};

/** Rewrites EdgeEver-owned resources and publicly shared memo links for anonymous viewers. */
export const rewriteMemoResourcesForShare = (
  doc: TiptapDoc,
  token: string,
  memoShareTokens: Readonly<Record<string, string>> = {},
): TiptapDoc => {
  const visit = (node: TiptapNode | TiptapTextNode): TiptapNode | TiptapTextNode => {
    const attrs = "attrs" in node && node.attrs
      ? Object.fromEntries(Object.entries(node.attrs).map(([key, value]) => [key, rewriteAttributeValue(value, token, memoShareTokens)]))
      : undefined;
    const marks = "marks" in node && node.marks
      ? node.marks.map((mark) => ({
          ...mark,
          attrs: mark.attrs
            ? Object.fromEntries(Object.entries(mark.attrs).map(([key, value]) => [key, rewriteAttributeValue(value, token, memoShareTokens)]))
            : undefined,
        }))
      : undefined;

    return {
      ...node,
      ...(attrs ? { attrs } : {}),
      ...(marks ? { marks } : {}),
      ...("content" in node && node.content ? { content: node.content.map(visit) } : {}),
    } as TiptapNode | TiptapTextNode;
  };

  return visit(doc) as TiptapDoc;
};
