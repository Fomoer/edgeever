import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createImageSelectionPlugin, imageSelectionKey } from "./image-selection";

const schema = getSchema([StarterKit, Image]);
const image = () => schema.nodes.image.create({ src: "photo.png" });
const createState = (content = [image()]) => EditorState.create({
  doc: schema.nodes.doc.create(null, content),
  plugins: [createImageSelectionPlugin()],
});
const clickImage = (state, position = 0) => state.apply(state.tr
  .setSelection(NodeSelection.create(state.doc, position))
  .setMeta(imageSelectionKey, position));

describe("explicit image selection", () => {
  test("dismisses controls without changing the note or the required node selection", () => {
    const selected = clickImage(createState());
    const dismissed = selected.apply(selected.tr.setMeta(imageSelectionKey, null));
    expect(imageSelectionKey.getState(dismissed)).toBeNull();
    expect(dismissed.doc).toBe(selected.doc);
    expect(dismissed.selection).toBeInstanceOf(NodeSelection);
    expect(imageSelectionKey.getState(clickImage(dismissed))).toBe(0);
  });
  test("opening an image-only or image-first note does not activate image controls", () => {
    for (const content of [[image()], [image(), schema.nodes.paragraph.create()]]) {
      const state = createState(content);
      expect(state.selection).toBeInstanceOf(NodeSelection);
      expect(imageSelectionKey.getState(state)).toBeNull();
      expect(imageSelectionKey.getState(state.apply(state.tr))).toBeNull();
    }
  });

  test("click activates an already default-selected image and survives size changes", () => {
    let state = clickImage(createState());
    expect(imageSelectionKey.getState(state)).toBe(0);
    state = state.apply(state.tr.setNodeMarkup(0, undefined, { src: "resized.png" }));
    expect(imageSelectionKey.getState(state)).toBe(0);
  });

  test("switching notes resets activation even when reusing identical content and plugins", () => {
    const state = clickImage(createState());
    const next = EditorState.create({ doc: state.doc, plugins: state.plugins });
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect(imageSelectionKey.getState(next)).toBeNull();
  });

  test("moving to text or another image requires clicking the image again", () => {
    let state = clickImage(createState([image(), image(), schema.nodes.paragraph.create()]));
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 1)));
    expect(imageSelectionKey.getState(state)).toBeNull();
    state = clickImage(state, 1);
    expect(imageSelectionKey.getState(state)).toBe(1);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    expect(imageSelectionKey.getState(state)).toBeNull();
  });
});
