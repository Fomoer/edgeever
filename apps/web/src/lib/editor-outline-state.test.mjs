import { describe, expect, test } from "bun:test";
import { Schema } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { mapCollapsedOutlinePositions, readOutlineSnapshot, restoreOutlinePositions, writeOutlineSnapshot } from "./editor-outline-state";

const schema = new Schema({ nodes: {
  doc: { content: "block+" },
  heading: { group: "block", content: "text*", attrs: { level: { default: 1 } } },
  paragraph: { group: "block", content: "text*" },
  text: {},
} });
const heading = (text, level = 1) => schema.node("heading", { level }, schema.text(text));
const outline = (doc) => {
  const items = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") items.push({ pos, level: node.attrs.level, text: node.textContent.trim() });
  });
  return items;
};

describe("outline identity during editing", () => {
  test("tracks renamed duplicate headings and shifts caused by preceding edits", () => {
    const doc = schema.node("doc", null, [heading("Same"), heading("Child", 2), heading("Same"), heading("Child", 2)]);
    const items = outline(doc);
    const pos = items[2].pos;
    const tr = new Transform(doc).insert(0, schema.node("paragraph", null, schema.text("Inserted body")));
    const shifted = tr.mapping.map(pos);
    tr.insert(shifted + 2, schema.text(" renamed"));
    const result = mapCollapsedOutlinePositions(new Set([pos]), tr.mapping, outline(tr.doc));
    expect([...result]).toEqual([shifted]);
    expect(outline(tr.doc).find((item) => item.pos === shifted).text).toContain("renamed");
  });

  test("does not transfer state to an inserted replacement at the same position", () => {
    const doc = schema.node("doc", null, [heading("Deleted"), heading("Survivor")]);
    const tr = new Transform(doc).replaceWith(0, doc.child(0).nodeSize, heading("Replacement"));
    expect([...mapCollapsedOutlinePositions(new Set([0]), tr.mapping, outline(tr.doc))]).toEqual([]);
  });

  test("keeps identity while clearing a title and retyping it in separate transactions", () => {
    const doc = schema.node("doc", null, [heading("Before"), heading("Child", 2)]);
    const cleared = new Transform(doc).delete(1, 7);
    const collapsed = mapCollapsedOutlinePositions(new Set([0]), cleared.mapping, outline(cleared.doc));
    const retyped = new Transform(cleared.doc).insert(1, schema.text("After"));
    expect([...mapCollapsedOutlinePositions(collapsed, retyped.mapping, outline(retyped.doc))]).toEqual([0]);
  });

  test("keeps folding when changing heading level", () => {
    const doc = schema.node("doc", null, [heading("Title"), heading("Child", 3)]);
    const tr = new Transform(doc).setNodeMarkup(0, undefined, { level: 2 });
    expect([...mapCollapsedOutlinePositions(new Set([0]), tr.mapping, outline(tr.doc))]).toEqual([0]);
  });

  test("retains state when replacing all text inside a heading", () => {
    const doc = schema.node("doc", null, [heading("Before"), heading("Child", 2)]);
    const tr = new Transform(doc).replaceWith(1, 7, schema.text("After"));
    expect([...mapCollapsedOutlinePositions(new Set([0]), tr.mapping, outline(tr.doc))]).toEqual([0]);
  });
});

describe("outline restoration", () => {
  test("restores saved renamed titles after reopening with changed body positions", () => {
    const items = [{ pos: 0, level: 1, text: "Renamed" }, { pos: 10, level: 2, text: "Child" }];
    expect([...restoreOutlinePositions({ items, collapsed: [0] }, items.map((item) => ({ ...item, pos: item.pos + 20 })))]).toEqual([20]);
  });

  test("restores unique headings after external changes, leaving new and ambiguous headings open", () => {
    const old = outline(schema.node("doc", null, [heading("Same"), heading("Same"), heading("Unique")]));
    const next = outline(schema.node("doc", null, [heading("New"), heading("Same"), heading("Same"), heading("Unique")]));
    expect([...restoreOutlinePositions({ items: old, collapsed: old.map((item) => item.pos) }, next)]).toEqual([next[3].pos]);
  });

  test("keeps each note independent and tolerates malformed or unavailable storage", () => {
    const previousWindow = globalThis.window;
    const storage = new Map();
    globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
    try {
      const snapshot = { items: [{ pos: 0, level: 1, text: "Title" }], collapsed: [0] };
      writeOutlineSnapshot("note-a", snapshot);
      writeOutlineSnapshot("note-b", { ...snapshot, collapsed: [] });
      expect(readOutlineSnapshot("note-a")).toEqual(snapshot);
      expect(readOutlineSnapshot("note-b").collapsed).toEqual([]);
      storage.set("edgeever.editor.outline.v1.bad", '{"items":[null],"collapsed":[]}');
      expect(readOutlineSnapshot("bad")).toBeNull();
      window.localStorage.setItem = () => { throw new Error("quota"); };
      writeOutlineSnapshot("unavailable", snapshot);
      expect(readOutlineSnapshot("unavailable")).toEqual(snapshot);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
});
