import { Marked, type marked } from "marked";

/** EdgeEver uses double tildes for strike; single tildes belong to prose. */
// TipTap types the injected instance as its callable singleton, but uses the
// Marked class's Lexer/use API. Each consumer owns its tokenizer registrations.
export const createEdgeEverMarked = () => new Marked({
  gfm: true,
  tokenizer: {
    del(src: string) {
      // undefined rejects this token; false delegates to marked's tokenizer.
      if (/^~(?!~)/.test(src)) return undefined;
      return false;
    },
  },
  hooks: {
    emStrongMask(src: string) {
      // Only change marked's scan copy, keeping offsets and original text intact.
      // Otherwise a lone tilde inside ~~a~b~~ can hide its real closing delimiter.
      return src.replace(/(?<!~)~(?!~)/g, "a");
    },
  },
}) as unknown as typeof marked;
