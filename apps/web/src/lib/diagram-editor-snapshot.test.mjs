import { expect, test } from "bun:test";
import { diagramEditorSnapshot } from "./diagram-editor-snapshot";

const document = {
  schemaVersion: 2, kind: "architecture",
  nodes: [
    { id: "group", label: "Group", shape: "boundary", x: 0, y: 0, width: 600, height: 300 },
    { id: "node", label: "Long node label", shape: "service", parentId: "group", x: 40, y: 50, width: 220, height: 64 },
  ],
  edges: [],
};
const snapshot = (value) => diagramEditorSnapshot("Title", value);

test("font wrapping and compact rendering do not create a content edit", () => {
  const rendered = structuredClone(document);
  rendered.theme = "brand";
  rendered.nodes[1].width = 156;
  rendered.nodes[1].height = 88;
  expect(snapshot(rendered)).toBe(snapshot(document));
});

test("authored geometry, text, connections and theme remain editable", () => {
  for (const change of [
    (d) => { d.nodes[0].width += 10; },
    (d) => { d.nodes[1].x += 10; },
    (d) => { d.nodes[1].label = "Edited"; },
    (d) => { d.edges.push({ id: "edge", source: "group", target: "node" }); },
    (d) => { d.theme = "neutral"; },
  ]) {
    const edited = structuredClone(document);
    change(edited);
    expect(snapshot(edited)).not.toBe(snapshot(document));
  }
});
