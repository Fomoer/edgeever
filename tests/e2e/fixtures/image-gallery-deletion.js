import React from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { docToMarkdown } from "@edgeever/shared";
import { EditableImageGallery } from "/src/components/editor/ImageGallery.tsx";
import "/src/i18n/index.ts";

// Exercise Tiptap's actual node-view deleteNode callback used by the resource
// menu without deleting external resources or depending on a logged-in API.
const DeletableImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(({ node, deleteNode }) => React.createElement(
      NodeViewWrapper, null,
      React.createElement("span", null, node.attrs.src),
      React.createElement("button", { contentEditable: false, onClick: deleteNode }, "Delete image"),
    ));
  },
});

function Fixture() {
  const editor = useEditor({
    extensions: [StarterKit, DeletableImage, EditableImageGallery],
    content: { type: "doc", content: [{
      type: "edgeeverImageGallery", attrs: { layout: "2" },
      content: ["/one.jpg", "/two.jpg"].map((src) => ({ type: "image", attrs: { src } })),
    }] },
    onCreate: ({ editor }) => renderState(editor),
    onTransaction: ({ editor }) => renderState(editor),
  });
  React.useEffect(() => {
    if (!editor) return;
    document.querySelector("#undo").onclick = () => editor.commands.undo();
    document.querySelector("#redo").onclick = () => editor.commands.redo();
  }, [editor]);
  return React.createElement(EditorContent, { editor });
}
function renderState(editor) {
  document.querySelector("#document").textContent = JSON.stringify(editor.getJSON());
  document.querySelector("#markdown").textContent = docToMarkdown(editor.getJSON());
}
createRoot(document.querySelector("#editor")).render(React.createElement(Fixture));
