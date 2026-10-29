import { getTextSerializersFromSchema, type TextSerializer } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorProps } from "@tiptap/pm/view";

/** Container nodes (quotes, lists, items) must not each add a blank line. */
export const serializeEditorTextRange = (doc: Node, from: number, to: number): string => {
  const serializers: Partial<Record<string, TextSerializer>> = getTextSerializersFromSchema(doc.type.schema);
  let text = "";
  let firstBlock = true;
  doc.nodesBetween(from, to, (node, pos, parent, index) => {
    const serializer = serializers[node.type.name];
    if (node.isBlock && (node.isTextblock || serializer || (node.isLeaf && node.type.spec.leafText))) {
      if (!firstBlock) text += "\n";
      firstBlock = false;
    }
    if (serializer && parent) {
      text += serializer({ node, pos, parent, index, range: { from, to } });
      return false;
    }
    if (node.isText) {
      text += node.text!.slice(Math.max(from, pos) - pos, to - pos);
    } else if (node.isLeaf && node.type.spec.leafText) {
      text += node.type.spec.leafText(node);
    }
  });
  return text;
};

export const editorClipboardTextSerializer: NonNullable<EditorProps["clipboardTextSerializer"]> = (_slice, view) => {
  const { doc, selection } = view.state;
  // Cell selections expose disjoint ranges: do not include the cells between them.
  return [...selection.ranges]
    .sort((a, b) => a.$from.pos - b.$from.pos)
    .map(({ $from, $to }) => serializeEditorTextRange(doc, $from.pos, $to.pos))
    .join("\n");
};
