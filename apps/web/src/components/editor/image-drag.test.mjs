import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { ImageGallery, createImageGalleryCleanupPlugin } from "@edgeever/shared";
import { createImageDragPlugin, imageDragKey, moveImage } from "./image-drag";

const schema = getSchema([StarterKit, Image.extend({ addAttributes() {
  return { ...this.parent(), width: { default: null }, alignment: { default: null } };
} }), ImageGallery]);
const image = (src) => schema.nodes.image.create({ src, alt: `alt ${src}`, title: `title ${src}`, width: 42, alignment: "right" });
const paragraph = (text) => schema.nodes.paragraph.create(null, schema.text(text));
const gallery = (...names) => schema.nodes.edgeeverImageGallery.create({ layout: "3", fit: "height" }, names.map(image));
const state = (...nodes) => EditorState.create({ doc: schema.nodes.doc.create(null, nodes), plugins: [history(), createImageDragPlugin()] });
const move = (before, from, to) => {
  const tr = moveImage(before, from, to);
  expect(tr).not.toBeNull();
  const next = before.applyTransaction(tr).state;
  next.doc.check();
  return next;
};
const sources = (doc) => { const result = []; doc.descendants((node) => { if (node.type.name === "image") result.push(node.attrs.src); }); return result; };

describe("existing image dragging (#708)", () => {
  test("moves between paragraphs in either direction without changing image attributes", () => {
    const before = state(paragraph("a"), image("/resources/original"), paragraph("b"));
    const after = move(before, 3, 0);
    expect(after.doc.firstChild).toBe(before.doc.child(1));
    expect(after.doc.toJSON()).toEqual(schema.nodes.doc.create(null, [image("/resources/original"), paragraph("a"), paragraph("b")]).toJSON());
    expect(move(after, 0, after.doc.content.size).doc.lastChild).toBe(before.doc.child(1));
  });
  test("reorders A,B to B,A in a gallery and preserves gallery presentation", () => {
    const before = state(gallery("A", "B"));
    const after = move(before, 1, 3);
    expect(sources(after.doc)).toEqual(["B", "A"]);
    expect(after.doc.firstChild.attrs).toEqual(before.doc.firstChild.attrs);
    expect(after.doc.firstChild.lastChild).toBe(before.doc.firstChild.firstChild);
    expect(move(after, 2, 1).doc.toJSON()).toEqual(before.doc.toJSON());
  });
  test("moving the only gallery image out removes the empty shell", () => {
    const before = state(gallery("A"), paragraph("text"));
    const after = move(before, 1, before.doc.content.size);
    expect(after.doc.toJSON()).toEqual(schema.nodes.doc.create(null, [paragraph("text"), image("A")]).toJSON());
  });
  test("moves into and between galleries without placeholders or duplicates", () => {
    let next = move(state(gallery("A"), gallery("B", "C")), 1, 5);
    expect(next.doc.childCount).toBe(1);
    expect(sources(next.doc)).toEqual(["B", "A", "C"]);
    next = move(state(image("A"), gallery("B", "C")), 0, 3);
    expect(next.doc.childCount).toBe(1);
    expect(sources(next.doc)).toEqual(["B", "A", "C"]);
  });
  test("moving one image out of a two-image gallery leaves the other standalone (#728)", () => {
    // The editor runs the gallery cleanup plugin alongside dragging.
    const before = EditorState.create({
      doc: schema.nodes.doc.create(null, [gallery("A", "B"), paragraph("text")]),
      plugins: [history(), createImageDragPlugin(), createImageGalleryCleanupPlugin()],
    });
    let next = move(before, 2, before.doc.content.size);
    const moved = next.doc.toJSON();
    expect(moved).toEqual(schema.nodes.doc.create(null, [image("A"), paragraph("text"), image("B")]).toJSON());
    expect(next.doc.firstChild).toBe(before.doc.firstChild.firstChild);
    expect(next.selection.node.attrs.src).toBe("B");
    expect(undo(next, (tr) => { next = next.applyTransaction(tr).state; })).toBe(true);
    expect(next.doc.toJSON()).toEqual(before.doc.toJSON());
    expect(redo(next, (tr) => { next = next.applyTransaction(tr).state; })).toBe(true);
    expect(next.doc.toJSON()).toEqual(moved);
  });
  test("one undo restores the original document; redo repeats the move", () => {
    const before = state(gallery("A"), paragraph("text"), gallery("B", "C"));
    let next = move(before, 1, 11);
    const moved = next.doc.toJSON();
    expect(undo(next, (tr) => { next = next.applyTransaction(tr).state; })).toBe(true);
    expect(next.doc.toJSON()).toEqual(before.doc.toJSON());
    expect(redo(next, (tr) => { next = next.applyTransaction(tr).state; })).toBe(true);
    expect(next.doc.toJSON()).toEqual(moved);
  });
  test("rejects self drops, adjacent no-ops, text positions and invalid positions", () => {
    const before = state(image("A"), paragraph("text"));
    for (const to of [-1, 0, 1, 3, 999]) expect(moveImage(before, 0, to)).toBeNull();
    expect(moveImage(before, 1, 0)).toBeNull();
    expect(moveImage(before, -1, 0)).toBeNull();
    expect(moveImage(before, 999, 0)).toBeNull();
  });
  test("undoing a move does not undo the text typed immediately before it", () => {
    let next = state(paragraph("a"), image("A"));
    next = next.apply(next.tr.insertText(" typed", 2));
    const beforeMove = next.doc.toJSON();
    next = move(next, next.doc.firstChild.nodeSize, 0);
    expect(undo(next, (tr) => { next = next.applyTransaction(tr).state; })).toBe(true);
    expect(next.doc.toJSON()).toEqual(beforeMove);
    expect(next.doc.textContent).toBe("a typed");
  });
  test("leaves external file drops and readonly views to their existing handlers", () => {
    const plugin = createImageDragPlugin();
    let next = state(image("A"), paragraph("text"));
    next = next.apply(next.tr.setMeta(imageDragKey, 0));
    const external = { editable: true, state: next, dragging: null };
    expect(plugin.props.handleDrop(external, {}, null, true)).toBe(false);
    const readonly = { ...external, editable: false, dragging: { slice: next.selection.content(), move: true } };
    expect(plugin.props.handleDrop(readonly, {}, null, true)).toBe(false);
  });
  test("maps the drag source through other edits and cancels if the source is deleted", () => {
    let next = state(paragraph("a"), image("A"));
    next = next.apply(next.tr.setMeta(imageDragKey, 3));
    next = next.apply(next.tr.insertText("hello", 1));
    expect(imageDragKey.getState(next)).toBe(8);
    next = next.apply(next.tr.delete(8, 9));
    expect(imageDragKey.getState(next)).toBeNull();
  });
});

describe("dragging out of a two-image gallery (#728)", () => {
  for (const from of [1, 2]) {
    test(`moving image ${from} preserves attributes, selection and one-step undo`, () => {
      const before = EditorState.create({
        doc: schema.nodes.doc.create(null, [gallery("A", "B"), paragraph("text")]),
        plugins: [history(), createImageDragPlugin(), createImageGalleryCleanupPlugin()],
      });
      const moved = before.doc.nodeAt(from);
      const survivor = before.doc.firstChild.child(from === 1 ? 1 : 0);
      let next = move(before, from, before.doc.content.size);
      expect(next.doc.firstChild).toBe(survivor);
      expect(next.doc.lastChild).toBe(moved);
      expect(next.selection.node).toBe(moved);
      const after = next.doc;
      expect(undo(next, tr => { next = next.applyTransaction(tr).state; })).toBe(true);
      expect(next.doc.eq(before.doc)).toBe(true);
      expect(redo(next, tr => { next = next.applyTransaction(tr).state; })).toBe(true);
      expect(next.doc.eq(after)).toBe(true);
    });
  }
});
