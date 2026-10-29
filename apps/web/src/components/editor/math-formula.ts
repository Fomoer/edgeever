import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  BLOCK_MATH_NODE_TYPE,
  INLINE_MATH_NODE_TYPE,
} from "@edgeever/shared/mathematics";

export type MathFormulaKind = "inline" | "block";

export type MathFormulaTarget = {
  kind: MathFormulaKind;
  latex: string;
  pos: number;
};

export type MathFormulaDraft = {
  kind: MathFormulaKind;
  latex: string;
  pos?: number;
  from?: number;
  to?: number;
};

export const selectedTextAsLatex = (editor: Editor) =>
  editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ").trim();

export const resolveMathFormulaTarget = (editor: Editor, pos?: number): MathFormulaTarget | null => {
  const documentPos = pos ?? editor.state.selection.from;
  const node = editor.state.doc.nodeAt(documentPos);
  if (!node) return null;
  if (node.type.name === INLINE_MATH_NODE_TYPE) {
    return { kind: "inline", pos: documentPos, latex: String(node.attrs.latex ?? "") };
  }
  if (node.type.name === BLOCK_MATH_NODE_TYPE) {
    return { kind: "block", pos: documentPos, latex: String(node.attrs.latex ?? "") };
  }
  return null;
};

/**
 * Puts the caret right after the formula at `formulaPos`, so the next key
 * continues the text instead of landing in front of it or replacing it. A
 * display formula continues in an empty paragraph after it, so typing does not
 * join the following text either.
 */
const placeCaretAfterFormula = (tr: Transaction, formulaPos: number) => {
  const node = tr.doc.nodeAt(formulaPos);
  if (!node) return;
  const after = formulaPos + node.nodeSize;
  if (node.type.name !== BLOCK_MATH_NODE_TYPE) {
    tr.setSelection(TextSelection.create(tr.doc, after));
    return;
  }
  const next = tr.doc.resolve(after).nodeAfter;
  if (next?.type.name !== "paragraph" || next.content.size > 0) {
    tr.insert(after, tr.doc.type.schema.nodes.paragraph!.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
};

export const applyMathFormula = (editor: Editor, draft: MathFormulaDraft) => {
  const latex = draft.latex.trim();
  if (!latex) return false;

  if (typeof draft.pos === "number") {
    const pos = draft.pos;
    const chain = editor.chain();
    return (draft.kind === "inline" ? chain.updateInlineMath({ latex, pos }) : chain.updateBlockMath({ latex, pos }))
      .command(({ tr }) => {
        placeCaretAfterFormula(tr, tr.mapping.map(pos));
        return true;
      })
      .run();
  }

  const from = draft.from ?? editor.state.selection.from;
  const to = draft.to ?? from;
  const content = draft.kind === "inline"
    ? { type: INLINE_MATH_NODE_TYPE, attrs: { latex } }
    : { type: BLOCK_MATH_NODE_TYPE, attrs: { latex } };

  return editor.chain()
    .insertContentAt(from === to ? from : { from, to }, content)
    .command(({ tr }) => {
      // An inline formula already leaves the caret after it; a display formula
      // is left selected as a node.
      const { selection } = tr;
      if (selection instanceof NodeSelection && selection.node.type.name === BLOCK_MATH_NODE_TYPE) {
        placeCaretAfterFormula(tr, selection.from);
      }
      return true;
    })
    .run();
};

export const deleteMathFormula = (editor: Editor, target: Pick<MathFormulaTarget, "kind" | "pos">) => {
  return target.kind === "inline"
    ? editor.commands.deleteInlineMath({ pos: target.pos })
    : editor.commands.deleteBlockMath({ pos: target.pos });
};
