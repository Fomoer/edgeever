import { createMemoLinkHref } from "@edgeever/shared";
import type { ComponentProps, ReactNode } from "react";
import { parseAssistantNoteLinkHref } from "@/lib/assistant-note-links";

const CODE_REGION = /(```[\s\S]*?```|```[\s\S]*$|~~~[\s\S]*?~~~|~~~[\s\S]*$|``[^`\n]*``|`[^`\n]*`)/g;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Use explicit inline math delimiters; keep dollar prices untouched. */
export const normalizeSidebarMathDelimiters = (markdown: string): string => markdown
  .split(CODE_REGION)
  .map((part, index) => index % 2 === 1 ? part : part
    .replace(/\$\\rightarrow\$/g, "→") // Existing assistant replies used single-dollar arrows.
    .replace(/(?<!\\)\\\(([^\n]+?)\\\)/g, (_match, latex: string) => `$$${latex}$$`))
  .join("");

const escapeText = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const escapeAttr = (value: string) => escapeText(value).replace(/"/g, "&quot;");

/**
 * Streamdown treats every markdown link as an external website and asks
 * before opening it in a new tab. Rewrite in-app note links so they stay
 * anchors the sidebar can open in the current workspace.
 */
export function rewriteSidebarNoteLinks(markdown: string): string {
  return markdown.split(CODE_REGION).map((part, index) => {
    if (index % 2 === 1) {
      // Local agents sometimes report a new note only as an inline-code ID.
      // Turn that exact ID into the same workspace link as a Markdown citation.
      const memoId = /^`(memo_[0-9a-f]{32})`$/i.exec(part)?.[1];
      return memoId ? `<edgeever-note data-memo-id="${memoId}">${memoId}</edgeever-note>` : part;
    }
    return part.replace(MARKDOWN_LINK, (match, label: string, href: string) => {
      const memoId = parseAssistantNoteLinkHref(href);
      if (!memoId) return match;
      return `<edgeever-note data-memo-id="${escapeAttr(memoId)}">${escapeAttr(label)}</edgeever-note>`;
    });
  }).join("");
}

// hast-util-sanitize matches property names, so this is `dataMemoId`, not the HTML attribute.
export const sidebarNoteLinkAllowedTags = { "edgeever-note": ["dataMemoId"] };

const memoIdFromProps = (props: Record<string, unknown>) => {
  const value = props["data-memo-id"] ?? props.dataMemoId;
  return typeof value === "string" ? value : "";
};

export function SidebarNoteLink({
  children,
  node: _node,
  ...props
}: { children?: ReactNode; node?: unknown } & Record<string, unknown>) {
  const memoId = memoIdFromProps(props);
  if (!memoId) return <>{children}</>;
  return (
    <a
      className="wrap-anywhere rounded-sm font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      data-streamdown="link"
      href={createMemoLinkHref(memoId)}
      onClick={(event) => event.preventDefault()}
    >
      {children}
    </a>
  );
}

export const sidebarNoteLinkComponents = {
  "edgeever-note": SidebarNoteLink,
} satisfies Record<string, (props: ComponentProps<typeof SidebarNoteLink>) => ReactNode>;

/** Read a clicked in-app note link. Other anchors stay untouched. */
export function memoIdFromSidebarLinkEvent(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}): string {
  const target = event.target;
  if (!(target instanceof Element)) return "";
  const link = target.closest("a");
  if (!(link instanceof HTMLAnchorElement)) return "";
  const linkedId = parseAssistantNoteLinkHref(link.getAttribute("href"))
    ?? parseAssistantNoteLinkHref(link.hash)
    ?? parseAssistantNoteLinkHref(link.href);
  if (!linkedId) return "";
  event.preventDefault();
  return linkedId;
}
