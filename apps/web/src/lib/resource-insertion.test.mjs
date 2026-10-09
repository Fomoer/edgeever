import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { FileAttachment, ImageGallery, IMAGE_GALLERY_NODE_TYPE } from "@edgeever/shared";
import { insertUploadedResources } from "./resource-insertion";
import { getResourceInsertionTarget } from "./resource-insertion-target";

const image = (src) => ({ type: "image", attrs: { src, alt: src, title: src } });
const paragraph = (text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const gallery = (layout = "3", sources = ["one", "two"]) => ({
  type: IMAGE_GALLERY_NODE_TYPE, attrs: { layout }, content: sources.map(image),
});
const makeEditor = (content) => new Editor({
  extensions: [StarterKit, Image, ImageGallery, FileAttachment], content: { type: "doc", content },
});
const insert = (editor, target, content, select = true) => {
  expect(editor.commands.command(insertUploadedResources(target, content, select))).toBe(true);
  editor.state.doc.check();
};

describe("uploaded resources beside an existing gallery", () => {
  test("inserts a Word attachment into an empty note", () => {
    const editor = makeEditor([paragraph()]);
    const attachment = {
      type: "paragraph",
      content: [{
        type: "edgeeverFileAttachment",
        attrs: {
          url: "edgeever-staged://stage_word_1",
          label: "附件：软件外包合同.docx",
          filename: "软件外包合同.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteSize: 42_559,
        },
      }],
    };

    insert(editor, { from: 1, to: 1 }, [attachment]);
    expect(editor.getJSON().content[0].content[0]).toMatchObject(attachment.content[0]);
    editor.destroy();
  });

  test("still extends a gallery after saving and reloading the note", () => {
    const original = makeEditor([gallery("2")]);
    const saved = JSON.parse(JSON.stringify(original.getJSON()));
    original.destroy();
    const editor = makeEditor(saved.content);
    editor.commands.setNodeSelection(2);
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("three")]);
    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.getJSON().content[0].attrs.layout).toBe("2");
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["one", "two", "three"]);
    editor.destroy();
  });

  test("a single upload beside a standalone image becomes one gallery", () => {
    const editor = makeEditor([image("old"), paragraph()]);
    editor.commands.setNodeSelection(0);
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("new")]);
    expect(editor.getJSON().content.map((node) => node.type)).toEqual([IMAGE_GALLERY_NODE_TYPE, "paragraph"]);
    expect(editor.getJSON().content[0].attrs.layout).toBe("auto");
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["old", "new"]);
    expect(editor.state.selection.node.attrs.src).toBe("new");
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("third")]);
    expect(editor.getJSON().content).toHaveLength(2);
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["old", "new", "third"]);
    editor.destroy();
  });

  test("undo restores the standalone image after an adjacent upload is grouped", () => {
    const editor = makeEditor([image("old"), paragraph()]);
    editor.view.updateState(editor.state.reconfigure({ plugins: [history()] }));
    const before = editor.getJSON();
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.setNodeSelection(0);
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("new")]);
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["old", "new"]);
    editor.destroy();
  });

  test("a single upload before a standalone image keeps upload order", () => {
    const editor = makeEditor([image("old"), paragraph("keep")]);
    insert(editor, 0, [image("new")]);
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["new", "old"]);
    expect(editor.getJSON().content[1].content[0].text).toBe("keep");
    editor.destroy();
  });

  test("a multi-image upload absorbs the adjacent standalone run and preserves its metadata", () => {
    const editor = makeEditor([image("old"), paragraph()]);
    editor.commands.setNodeSelection(0);
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("new-a"), image("new-b")]);
    const gallery = editor.getJSON().content[0];
    expect(gallery.attrs.layout).toBe("auto");
    expect(gallery.content.map((node) => node.attrs.src)).toEqual(["old", "new-a", "new-b"]);
    expect(gallery.content[1].attrs.title).toBe("new-a");
    editor.destroy();
  });

  test("uploading beside loose images joins the earlier gallery and keeps its layout", () => {
    const editor = makeEditor([gallery("3"), image("loose"), gallery("2", ["other-a", "other-b"])]);
    insert(editor, 5, [image("new")]);
    const content = editor.getJSON().content;
    expect(content.map((node) => node.type)).toEqual([IMAGE_GALLERY_NODE_TYPE, IMAGE_GALLERY_NODE_TYPE]);
    expect(content[0].attrs.layout).toBe("3");
    expect(content[0].content.map((node) => node.attrs.src)).toEqual(["one", "two", "loose", "new"]);
    expect(content[1].attrs.layout).toBe("2");
    expect(content[1].content.map((node) => node.attrs.src)).toEqual(["other-a", "other-b"]);
    editor.destroy();
  });

  test("preserves text replacement and does not cross the remaining paragraph", () => {
    const editor = makeEditor([gallery(), paragraph("replace keep")]);
    insert(editor, { from: 5, to: 12 }, [image("new")]);
    expect(editor.getJSON().content.map((node) => node.type)).toEqual([IMAGE_GALLERY_NODE_TYPE, "paragraph"]);
    expect(editor.getJSON().content[1].content[0].text).toBe(" keep");
    editor.destroy();
  });

  test("a separate later upload extends the first batch and preserves its layout and metadata", () => {
    const editor = makeEditor([paragraph()]);
    // Headless TipTap does not mount view plugins; install history explicitly.
    editor.view.updateState(editor.state.reconfigure({ plugins: [history()] }));
    insert(editor, 1, [image("one"), image("two")]);
    editor.commands.setNodeSelection(0);
    editor.commands.updateAttributes(IMAGE_GALLERY_NODE_TYPE, { layout: "3" });
    const before = editor.getJSON();
    editor.view.dispatch(closeHistory(editor.state.tr));
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("three")]);
    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.getJSON().content[0].attrs.layout).toBe("3");
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["one", "two", "three"]);
    expect(editor.getJSON().content[0].content[2].attrs.title).toBe("three");
    expect(undo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor.state, editor.view.dispatch)).toBe(true);
    expect(editor.getJSON().content[0].content).toHaveLength(3);
    editor.destroy();
  });

  test("uploading with a gallery child selected appends without nesting or replacing images", () => {
    const editor = makeEditor([gallery()]);
    editor.commands.setNodeSelection(1);
    expect(getResourceInsertionTarget(editor.state.selection)).toBe(4);
    insert(editor, getResourceInsertionTarget(editor.state.selection), [image("three"), image("four")]);
    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.getJSON().content[0].attrs.layout).toBe("3");
    expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual(["one", "two", "three", "four"]);
    editor.destroy();
  });

  for (const layout of ["auto", "1", "2", "3"]) {
    for (const sources of [["new"], ["new-a", "new-b"]]) {
      test(`prepends ${sources.length} images and keeps layout ${layout}`, () => {
        const editor = makeEditor([gallery(layout)]);
        insert(editor, 0, sources.map(image));
        expect(editor.getJSON().content).toHaveLength(1);
        expect(editor.getJSON().content[0].attrs.layout).toBe(layout);
        expect(editor.getJSON().content[0].content.map((node) => node.attrs.src)).toEqual([...sources, "one", "two"]);
        editor.destroy();
      });
    }
  }

  test("replaces a trailing empty insertion paragraph but never crosses other paragraphs", () => {
    for (const separator of [paragraph("keep"), paragraph()]) {
      const editor = makeEditor([gallery(), separator, paragraph()]);
      insert(editor, editor.state.doc.content.size - 1, [image("three")]);
      expect(editor.getJSON().content.map((node) => node.type)).toEqual([IMAGE_GALLERY_NODE_TYPE, "paragraph", "image"]);
      editor.destroy();
    }
    const editor = makeEditor([gallery(), paragraph()]);
    insert(editor, 5, [image("three")]);
    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.getJSON().content[0].content).toHaveLength(3);
    editor.destroy();
  });

  test("preserves mixed upload order and only merges the adjacent image run", () => {
    const editor = makeEditor([gallery()]);
    insert(editor, 4, [image("three"), paragraph("attachment"), image("four"), image("five")]);
    const content = editor.getJSON().content;
    expect(content.map((node) => node.type)).toEqual([IMAGE_GALLERY_NODE_TYPE, "paragraph", IMAGE_GALLERY_NODE_TYPE]);
    expect(content[0].content.map((node) => node.attrs.src)).toEqual(["one", "two", "three"]);
    expect(content[1].content[0].text).toBe("attachment");
    expect(content[2].content.map((node) => node.attrs.src)).toEqual(["four", "five"]);
    editor.destroy();
  });

  test("does not merge two existing galleries or unrelated occurrences of the same source", () => {
    const editor = makeEditor([gallery(), gallery("2", ["other-a", "other-b"]), image("three"), paragraph("keep")]);
    insert(editor, 4, [image("three")]);
    expect(editor.getJSON().content).toHaveLength(4);
    expect(editor.getJSON().content[0].content).toHaveLength(3);
    expect(editor.getJSON().content[1].attrs.layout).toBe("2");
    expect(editor.getJSON().content[1].content).toHaveLength(2);
    expect(editor.getJSON().content[2].attrs.src).toBe("three");
    editor.destroy();
  });

  test("preserves a newer selection inside an existing gallery when selection updates are disabled", () => {
    const editor = makeEditor([gallery()]);
    editor.commands.setNodeSelection(1);
    insert(editor, 4, [image("three")], false);
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.node.attrs.src).toBe("one");
    editor.destroy();
  });
});
