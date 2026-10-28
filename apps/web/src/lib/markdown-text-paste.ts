import { markdownToDoc } from "@edgeever/shared";
import { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

const HEADING_LINE = /^#{1,6}\s+\S/;
const BLOCK_MARKDOWN_LINES = [
  HEADING_LINE,
  /^\s*(?:```|~~~)/,
  /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/,
  /^\s*>/,
  /^\s*\|.*\|\s*$/,
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/,
];
// GFM table delimiter row, with or without outer pipes: `--- | :---:`.
const TABLE_DELIMITER_LINE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

/** A delimiter row directly under a header row that contains a pipe. */
const hasTableWithoutOuterPipes = (lines: string[]) =>
  lines.some((line, index) => index > 0 && TABLE_DELIMITER_LINE.test(line) && lines[index - 1]!.includes("|"));

/**
 * Plain text whose lines carry Markdown block structure. A single line keeps
 * the existing inline paste rules unless it is a heading.
 */
export const isBlockMarkdownText = (text: string) => {
  const allLines = text.replace(/\r\n?/g, "\n").split("\n");
  if (hasTableWithoutOuterPipes(allLines)) return true;
  const lines = allLines.filter((line) => line.trim());
  if (lines.length === 0) return false;
  if (lines.length === 1) return HEADING_LINE.test(lines[0]!);
  return lines.some((line) => BLOCK_MARKDOWN_LINES.some((pattern) => pattern.test(line)));
};

const VSCODE_TEXT_MODES = new Set(["markdown", "plaintext"]);

/**
 * VS Code puts styled HTML next to the source text; that HTML carries no Markdown
 * structure. Copies from other languages stay with the code block paste handler.
 */
const isPlainMarkdownSource = (data: DataTransfer) => {
  const vscode = data.getData("vscode-editor-data");
  if (vscode) {
    try {
      const mode = (JSON.parse(vscode) as { mode?: unknown }).mode;
      return typeof mode !== "string" || VSCODE_TEXT_MODES.has(mode);
    } catch {
      return false;
    }
  }
  return !data.getData("text/html");
};

/**
 * Pastes Markdown copied from a plain-text source as rich content, matching what
 * pasting the same text in source mode and switching back produces.
 */
export const pasteBlockMarkdown = (
  view: { state: EditorState; dispatch: (transaction: Transaction) => void },
  data: DataTransfer | null,
) => {
  // Match ProseMirror's plain-text paste check: Shift+Insert (45) is a normal
  // paste, while Cmd/Ctrl+Shift+V keeps the literal text.
  const input = (view as { input?: { shiftKey?: boolean; lastKeyCode?: number | null } }).input;
  if (input?.shiftKey && input.lastKeyCode !== 45) return false;
  if (!data || !isPlainMarkdownSource(data)) return false;
  const { $from } = view.state.selection;
  if ($from.parent.type.spec.code) return false;
  const text = data.getData("text/plain");
  if (!isBlockMarkdownText(text)) return false;

  let doc: ProseMirrorNode;
  try {
    doc = ProseMirrorNode.fromJSON(view.state.schema, markdownToDoc(text));
  } catch {
    return false;
  }
  // Only leading or trailing paragraphs join the surrounding text; headings,
  // lists and other blocks keep their type.
  const isParagraph = (node: ProseMirrorNode | null) => node?.type.name === "paragraph";
  const slice = new Slice(doc.content, isParagraph(doc.firstChild) ? 1 : 0, isParagraph(doc.lastChild) ? 1 : 0);
  // No `uiEvent: "paste"`: Tiptap paste rules would parse the already parsed
  // text again and turn escaped `\*` or `` \` `` back into marks.
  view.dispatch(view.state.tr
    .replaceSelection(slice)
    .scrollIntoView()
    .setMeta("paste", true));
  return true;
};
