import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { ImageGallery, createImageGalleryCleanupPlugin, normalizeImageGalleries, TRANSIENT_IMAGE_UPLOAD_PREFIX } from "./image-gallery";
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
    // The remaining image becomes standalone (#728).
    expect(e.state.doc.firstChild.type.name).toBe("image");
    expect(e.state.doc.firstChild.attrs.src).toBe("/two.jpg");
    deleteImage(e, 0);
    expect(e.state.doc.toJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(e.state.selection).toBeInstanceOf(TextSelection);
    expect(docToMarkdown(e.state.doc.toJSON())).toBe("");
    expect(markdownToDoc(docToMarkdown(e.state.doc.toJSON()))).toEqual(e.state.doc.toJSON());
    e.dispatch(e.state.tr.insertText("still editable"));
    expect(e.state.doc.textContent).toBe("still editable");
  });

  test("last-image deletion and cleanup undo and redo as one edit", () => {
    const e = editor([paragraph("before"), gallery("/one.jpg", "/two.jpg")]);
    const before = e.state.doc.toJSON();
    const start = e.state.doc.firstChild.nodeSize + 1;
    e.dispatch(e.state.tr.delete(start, start + 2));
    expect(e.state.doc.childCount).toBe(1);
    expect(undo(e.state, e.dispatch)).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(before);
    expect(redo(e.state, e.dispatch)).toBe(true);
    expect(docToMarkdown(e.state.doc.toJSON())).toBe("before");
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

  test("a gallery left with one image unwraps it with its attributes (#728)", () => {
    const e = editor([paragraph("before"), gallery("/one.jpg", "/two.jpg"), paragraph("after")]);
    const remaining = e.state.doc.child(1).lastChild;
    deleteImage(e, e.state.doc.firstChild.nodeSize + 1);
    expect(e.state.doc.childCount).toBe(3);
    expect(e.state.doc.child(1)).toBe(remaining);
    expect(e.state.doc.toJSON()).toEqual(normalizeImageGalleries(e.state.doc.toJSON()));
  });

  test("deletion and unwrapping undo and redo as one edit (#728)", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg")]);
    e.dispatch(closeHistory(e.state.tr));
    const before = e.state.doc.toJSON();
    deleteImage(e, 2);
    const after = e.state.doc.toJSON();
    expect(after).toEqual({ type: "doc", content: [image("/one.jpg").toJSON()] });
    expect(undo(e.state, e.dispatch)).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(before);
    expect(redo(e.state, e.dispatch)).toBe(true);
    expect(e.state.doc.toJSON()).toEqual(after);
  });

  test("keeps a selection on the remaining image when it is unwrapped (#728)", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg")]);
    e.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 1)));
    deleteImage(e, 2);
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    expect(e.state.selection.node.attrs.src).toBe("/one.jpg");
  });

  test("unwraps a nested gallery inside its container (#728)", () => {
    const e = editor([schema.nodes.blockquote.create(null, gallery("/one.jpg", "/two.jpg"))]);
    deleteImage(e, 2);
    expect(e.state.doc.firstChild.type.name).toBe("blockquote");
    expect(e.state.doc.firstChild.firstChild.type.name).toBe("image");
    expect(e.state.doc.firstChild.firstChild.attrs.src).toBe("/two.jpg");
  });

  test("a pending upload left alone stays in its gallery until it finishes", () => {
    const pending = `${TRANSIENT_IMAGE_UPLOAD_PREFIX}pending`;
    const e = editor([gallery("/one.jpg", pending)]);
    deleteImage(e, 1);
    expect(e.state.doc.firstChild.type.name).toBe("edgeeverImageGallery");
    e.dispatch(e.state.tr.setNodeMarkup(1, undefined, { ...e.state.doc.firstChild.firstChild.attrs, src: "/uploaded.jpg" }));
    expect(e.state.doc.firstChild.type.name).toBe("image");
    expect(e.state.doc.firstChild.attrs.src).toBe("/uploaded.jpg");
  });

  test("galleries with two or more images are left unchanged", () => {
    const e = editor([gallery("/one.jpg", "/two.jpg", "/three.jpg")]);
    deleteImage(e, 1);
    expect(e.state.doc.firstChild.type.name).toBe("edgeeverImageGallery");
    expect(e.state.doc.firstChild.childCount).toBe(2);
    expect(e.state.doc.firstChild.attrs).toMatchObject({ layout: "3", fit: "height" });
  });

  test("standalone image deletion keeps its normal behavior", () => {
    const e = editor([image("/one.jpg")]);
    deleteImage(e, 0);
    expect(e.state.doc.toJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("single-image gallery cleanup (#728)", () => {
  for (const [fit, removed] of [["width", 1], ["width", 2], ["height", 1], ["height", 2]]) {
    test(`${fit}: deleting image ${removed} unwraps the survivor and undo restores the gallery`, () => {
      const node = gallery("/one.jpg", "/two.jpg");
      const e = editor([node.type.create({ ...node.attrs, fit }, node.content)]);
      const before = e.state.doc;
      const survivor = before.firstChild.child(removed === 1 ? 1 : 0);
      deleteImage(e, removed);
      expect(e.state.doc.firstChild).toBe(survivor);
      const after = e.state.doc;
      expect(undo(e.state, e.dispatch)).toBe(true);
      expect(e.state.doc.eq(before)).toBe(true);
      expect(redo(e.state, e.dispatch)).toBe(true);
      expect(e.state.doc.eq(after)).toBe(true);
    });
  }

  test("three images becoming two retain their gallery settings", () => {
    const e = editor([gallery("A", "B", "C")]);
    deleteImage(e, 2);
    expect(e.state.doc.firstChild.type.name).toBe("edgeeverImageGallery");
    expect(e.state.doc.firstChild.childCount).toBe(2);
    expect(e.state.doc.firstChild.attrs).toMatchObject({ layout: "3", fit: "height" });
  });

  test("lifting a nested image preserves its selection and surrounding text", () => {
    const e = editor([schema.nodes.blockquote.create(null, gallery("A", "B")), paragraph("outside")]);
    e.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 2)));
    deleteImage(e, 3);
    expect(e.state.doc.firstChild.firstChild.attrs.src).toBe("A");
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    expect(e.state.selection.node.attrs.src).toBe("A");
    expect(e.state.doc.lastChild.textContent).toBe("outside");
  });

  test("multiple galleries unwrap in one edit without shifting other content", () => {
    const e = editor([gallery("A", "B"), paragraph("keep"), gallery("C", "D")]);
    const second = e.state.doc.child(0).nodeSize + e.state.doc.child(1).nodeSize;
    e.dispatch(e.state.tr.delete(second + 2, second + 3).delete(2, 3));
    expect(e.state.doc.toJSON()).toEqual(schema.nodes.doc.create(null, [image("A"), paragraph("keep"), image("C")]).toJSON());
  });
});
