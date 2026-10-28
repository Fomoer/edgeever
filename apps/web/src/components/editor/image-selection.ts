import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

// ProseMirror may select the first image while creating a document. Keep the
// user's explicit image selection separate from that required default selection.
export const imageSelectionKey = new PluginKey<number | null>("explicitImageSelection");

export const createImageSelectionPlugin = () => new Plugin<number | null>({
  key: imageSelectionKey,
  state: {
    init: () => null,
    apply(transaction, previous) {
      const requested = transaction.getMeta(imageSelectionKey) as number | null | undefined;
      const position = requested !== undefined ? requested : (previous === null ? null : transaction.mapping.map(previous));
      const selection = transaction.selection;
      return position !== null && selection instanceof NodeSelection &&
        selection.node.type.name === "image" && selection.from === position
        ? position
        : null;
    },
  },
});
