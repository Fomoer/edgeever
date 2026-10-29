import { InputRule, PasteRule } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
// Registers \ce{...} and \pu{...} (chemical formulas, equations and units) on
// the KaTeX instance the math nodes render with, on every client.
import "katex/contrib/mhchem";
import {
  edgeEverBlockMathMarkdownTokenizer,
  edgeEverInlineMathMarkdownTokenizer,
  findInlineMathSpans,
  matchBlockMathText,
  matchInlineMathSuffix,
} from "./mathematics-markdown";

export {
  BLOCK_MATH_NODE_TYPE,
  INLINE_MATH_NODE_TYPE,
} from "./mathematics-markdown";

export type EdgeEverMathematicsClickHandler = (node: ProseMirrorNode, pos: number) => void;

export type CreateEdgeEverMathematicsOptions = {
  onInlineClick?: EdgeEverMathematicsClickHandler;
  onBlockClick?: EdgeEverMathematicsClickHandler;
};

const textAt = (doc: ProseMirrorNode, from: number, to: number) => {
  if (from < 0 || to > doc.content.size || from >= to) return "";
  return doc.textBetween(from, to);
};

const placeCaretAfterBlock = (tr: Transaction, posAfterBlock: number) => {
  const $after = tr.doc.resolve(posAfterBlock);
  const paragraph = $after.nodeAfter?.type.name === "paragraph"
    ? null
    : tr.doc.type.schema.nodes.paragraph?.create();
  if (paragraph) tr.insert(posAfterBlock, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, posAfterBlock + 1));
};

const EdgeEverInlineMath = InlineMath.extend({
  markdownTokenizer: edgeEverInlineMathMarkdownTokenizer,

  // Stored notes use `$latex$`. TipTap's own rule treats `$$latex$$` as inline math.
  addInputRules() {
    return [
      new InputRule({
        find: (text) => {
          const span = matchInlineMathSuffix(text);
          if (!span) return null;
          return { index: span.index, text: span.raw, data: { latex: span.latex } };
        },
        handler: ({ state, range, match }) => {
          const latex = match.data?.latex;
          if (typeof latex !== "string" || !latex) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: (text) => findInlineMathSpans(text).map((span) => ({
          index: span.index,
          text: span.raw,
          data: { latex: span.latex },
        })),
        handler: ({ state, range, match }) => {
          const latex = match.data?.latex;
          if (typeof latex !== "string" || !latex || range.from >= range.to) return;
          if (textAt(state.doc, range.from, range.to) !== match[0]) return;

          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.spec.code || $from.marks().some((mark) => mark.type.spec.code)) return;
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
});

const EdgeEverBlockMath = BlockMath.extend({
  markdownTokenizer: edgeEverBlockMathMarkdownTokenizer,

  // A display formula is a paragraph of `$$latex$$`. TipTap's own rule expects `$$$latex$$$`.
  addInputRules() {
    return [
      new InputRule({
        find: (text) => {
          const block = matchBlockMathText(text);
          if (!block) return null;
          return { index: 0, text, data: { latex: block.latex } };
        },
        handler: ({ state, range, match }) => {
          const latex = match.data?.latex;
          if (typeof latex !== "string" || !latex) return null;

          const $from = state.doc.resolve(range.from);
          const replacesParagraph = $from.parent.isTextblock
            && range.from === $from.start()
            && range.to === $from.end();
          if (!replacesParagraph || $from.depth < 1) return null;
          if (!$from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type)) return null;

          const { tr } = state;
          tr.replaceWith($from.before(), $from.after(), this.type.create({ latex }));
          placeCaretAfterBlock(tr, tr.mapping.map($from.after()));
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: (text) => {
          const block = matchBlockMathText(text);
          if (!block) return null;
          const trimmed = text.trim();
          const index = text.indexOf(trimmed);
          return [{ index, text: trimmed, data: { latex: block.latex } }];
        },
        handler: ({ state, range, match }) => {
          const latex = match.data?.latex;
          if (typeof latex !== "string" || !latex || range.from >= range.to) return;

          const $from = state.doc.resolve(range.from);
          if (!$from.parent.isTextblock || $from.parent.type.spec.code) return;
          if ($from.parent.textContent.trim() !== match[0]) return;
          if ($from.depth < 1) return;
          if (!$from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type)) return;

          const { tr } = state;
          const blockStart = $from.before();
          const blockEnd = $from.after();
          tr.replaceWith(blockStart, blockEnd, this.type.create({ latex }));
          const posAfter = tr.mapping.map(blockEnd);
          const { from, to } = tr.selection;
          if (from >= tr.mapping.map(blockStart) && to <= posAfter) {
            placeCaretAfterBlock(tr, posAfter);
          }
        },
      }),
    ];
  },
});

const katexOptions = {
  throwOnError: false,
  strict: "warn" as const,
  trust: false,
};

/** Fresh extension instances for each TipTap editor or Markdown manager. */
export const createEdgeEverMathematics = (options: CreateEdgeEverMathematicsOptions = {}) => [
  EdgeEverBlockMath.configure({ katexOptions, onClick: options.onBlockClick }),
  EdgeEverInlineMath.configure({ katexOptions, onClick: options.onInlineClick }),
];
