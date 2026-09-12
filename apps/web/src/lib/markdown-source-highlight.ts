import { tags as t } from "@lezer/highlight";

/**
 * Appended to light CodeMirror themes so Markdown source tokens stay
 * distinct. Later rules in the same HighlightStyle win, which is why these
 * go through `*Init({ styles })` instead of a second highlighter.
 */
export const lightMarkdownHighlightStyles = [
  { tag: t.heading1, color: "#0550ae", fontWeight: "700" },
  { tag: t.heading2, color: "#0550ae", fontWeight: "700" },
  { tag: t.heading3, color: "#0a3069", fontWeight: "700" },
  { tag: t.heading4, color: "#0f766e", fontWeight: "700" },
  { tag: t.heading5, color: "#0f766e", fontWeight: "700" },
  { tag: t.heading6, color: "#0f766e", fontWeight: "700" },
  { tag: t.heading, color: "#0550ae", fontWeight: "700" },
  { tag: t.processingInstruction, color: "#64748b" },
  { tag: t.meta, color: "#64748b" },
  { tag: t.comment, color: "#64748b" },
  { tag: t.strong, color: "#0f172a", fontWeight: "700" },
  { tag: t.emphasis, color: "#9f1239", fontStyle: "italic" },
  { tag: t.strikethrough, color: "#64748b", textDecoration: "line-through" },
  { tag: t.link, color: "#0969da" },
  { tag: t.url, color: "#0969da", textDecoration: "underline" },
  { tag: t.monospace, color: "#be185d" },
  { tag: t.quote, color: "#15803d" },
  { tag: t.atom, color: "#0f766e", fontWeight: "700" },
  { tag: t.contentSeparator, color: "#94a3b8" },
  { tag: t.labelName, color: "#7c3aed" },
  { tag: t.string, color: "#0f766e" },
  { tag: t.escape, color: "#b45309" },
  { tag: t.character, color: "#b45309" },
];
