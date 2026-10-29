import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { ImageGallery, createImageGalleryCleanupPlugin, TRANSIENT_IMAGE_UPLOAD_PREFIX } from "./image-gallery";
import { docToMarkdown, markdownToDoc } from "./content";

const schema = getSchema([StarterKit, Image, ImageGallery]);
const image = (src) => schema.nodes.image.create({ src });
const paragraph = (text) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const gallery = (...sources) => schema.nodes.edgeeverImageGallery.create({ layout: "3", fit: "height" }, sources.map(image));
const editor = (nodes) => {
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, nodes), plugins: [history(), createImageGalleryCleanupPlugin()] });
  return {
    get state() { return state; },
    dispatch(transaction) {
      state = state.applyTransaction(transaction).state;
      state.doc.check();
    },
  };
};

// NodeView.deleteNode() uses deleteRange(), which dispatches tr.delete(from,to).
const deleteImage = (editor, position) => editor.dispatch(editor.state.tr.delete(position, position + 1));

describe("live gallery deletion (#707)", () => {
  test("deleting both images leaves editable empty content and empty Markdown", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg")]);
    deleteImage(e, 1);
    expect(e.state.doc.firstChild.firstChild.attrs.src).toBe("/two.jpg");
    expect(e.state.doc.firstChild.attrs).toMatchObject({ layout: "3", fit: "height" });
    deleteImage(e, 1);
    expect(e.state.doc.toJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(docToMarkdown(e.state.doc.toJSON())).toBe("");
    expect(markdownToDoc(docToMarkdown(e.state.doc.toJSON()))).toEqual(e.state.doc.toJSON());
    e.dispatch(e.state.tr.insertText("still editable"));
    expect(e.state.doc.textContent).toBe("still editable");
  });

  test("last-image deletion and cleanup undo and redo as one edit", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg")]);
    deleteImage(e, 1);
    e.dispatch(closeHistory(e.state.tr));
    const before = e.state.doc.toJSON();
    deleteImage(e, 1);
    expect(undo(e.state, e.dispatch)).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(before);
    expect(redo(e.state, e.dispatch)).toBe(true);
    expect(docToMarkdown(e.state.doc.toJSON())).toBe("");
  });

  test("keyboard node-selection deletion preserves neighboring prose", () => {
    const e = editor([paragraph("before"), gallery("/one.jpg"), paragraph("after")]);
    const position = e.state.doc.firstChild.nodeSize + 1;
    e.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, position)));
    e.dispatch(e.state.tr.deleteSelection());
    expect(e.state.doc.toJSON()).toEqual(schema.nodes.doc.create(null, [paragraph("before"), paragraph("after")]).toJSON());
  });

  test("range deletion of all gallery children removes the shell", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg")]);
    e.dispatch(e.state.tr.delete(1, 3));
    expect(e.state.doc.firstChild.type.name).toBe("paragraph");
    expect(docToMarkdown(e.state.doc.toJSON())).toBe("");
  });

  test("nested gallery deletion leaves its container editable", () => {
    const e = editor([schema.nodes.blockquote.create(null, gallery("/one.jpg")), paragraph("outside")]);
    deleteImage(e, 2);
    expect(e.state.doc.firstChild.type.name).toBe("blockquote");
    expect(e.state.doc.firstChild.firstChild.type.name).toBe("paragraph");
    expect(e.state.doc.lastChild.textContent).toBe("outside");
  });

  test("multiple emptied galleries are removed without shifting other deletions", () => {
    const e = editor([gallery("/one.jpg"), paragraph("keep"), gallery("/two.jpg")]);
    const secondPosition = e.state.doc.child(0).nodeSize + e.state.doc.child(1).nodeSize + 1;
    e.dispatch(e.state.tr.delete(secondPosition, secondPosition + 1).delete(1, 2));
    expect(e.state.doc.toJSON()).toEqual(schema.nodes.doc.create(null, paragraph("keep")).toJSON());
  });

  test("pending upload sources survive removal of another image", () => {
    const pending = `${TRANSIENT_IMAGE_UPLOAD_PREFIX}pending`;
    const e = editor([gallery("/one.jpg", pending)]);
    deleteImage(e, 1);
    expect(e.state.doc.firstChild.type.name).toBe("edgeeverImageGallery");
    expect(e.state.doc.firstChild.firstChild.attrs.src).toBe(pending);
  });

  test("standalone image deletion keeps its normal behavior", () => {
    const e = editor([image("/one.jpg")]);
    deleteImage(e, 0);
    expect(e.state.doc.toJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});
