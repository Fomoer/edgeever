import { describe, expect, test } from "bun:test";
import {
  compactMindMapNodeSize,
  mindMapBranchSides,
  mindMapBranchTint,
  mindMapBranchTintIndex,
  mindMapConnector,
  mindMapConnectorPath,
  mindMapEdgeLineAttrs,
  mindMapEdgeTerminal,
  mindMapEdgeVisual,
  mindMapLayoutFamily,
  mindMapNodePresentation,
  mindMapNodeRole,
  mindMapNodeVisual,
  mindMapRootRadius,
  mindMapCloudPath,
  mindMapTopicForm,
  mindMapUsesRibbon,
  mindMapUsesUnderline,
  resolveMindMapNodeStyle,
  MIND_MAP_CONNECTOR_NAME,
  MIND_MAP_VERTICAL_GAP,
} from "./diagram-mindmap-style.ts";

const palette = {
  topicFill: "#16A06E",
  topicText: "#FFFFFF",
  nodeFill: "#F0F8F4",
  nodeText: "#173B2E",
  nodeStroke: "#B8DFD0",
  topicStroke: "#12845B",
  mindMapEdge: "#55B891",
  canvas: "#F8FAF9",
};

describe("mind map presentation", () => {
  test("classifies root, first-level, and nested topics from parent links", () => {
    const nodes = [
      { id: "root" },
      { id: "one", parentId: "root" },
      { id: "one-a", parentId: "one" },
    ];
    expect(mindMapNodeRole(nodes, "root")).toBe("root");
    expect(mindMapNodeRole(nodes, "one")).toBe("primary");
    expect(mindMapNodeRole(nodes, "one-a")).toBe("nested");
  });

  test("keeps compact topic sizes while allowing longer labels to grow within a cap", () => {
    expect(compactMindMapNodeSize("分支主题", false)).toEqual({ width: 96, height: 36 });
    expect(compactMindMapNodeSize("核心主题", true)).toEqual({ width: 124, height: 46 });
    expect(compactMindMapNodeSize("A much longer topic label", false).width).toBeLessThanOrEqual(168);
    expect(mindMapNodePresentation("核心主题", "root").fontSize).toBe(15);
    expect(MIND_MAP_VERTICAL_GAP).toBe(20);
  });

  test("uses a capsule root, rounded first-level topics, and lighter nested topics", () => {
    const root = mindMapNodeVisual("root", palette);
    const primary = mindMapNodeVisual("primary", palette);
    const nested = mindMapNodeVisual("nested", palette);
    expect(root.body.fill).toBe(palette.topicFill);
    expect(root.body.rx).toBe(23);
    expect(primary.body.fill).toBe(palette.nodeFill);
    expect(primary.body.stroke).toBe(palette.topicStroke);
    expect(nested.body.fill).toBe("transparent");
    expect(nested.underline.stroke).toBe(palette.mindMapEdge);
    expect(nested.label.fontWeight).toBe(500);
    expect(mindMapRootRadius(46)).toBe(23);
  });

  test("tapers branches from the parent and anchors them to the nearer side", () => {
    const fromRoot = mindMapEdgeVisual("root", palette);
    const fromNested = mindMapEdgeVisual("nested", palette);
    expect(fromRoot.sourceWidth).toBeGreaterThan(fromRoot.targetWidth);
    expect(fromRoot.sourceWidth).toBeGreaterThan(fromNested.sourceWidth);
    expect(mindMapBranchSides(
      { x: 0, y: 0, width: 120, height: 46 },
      { x: 200, y: 0, width: 96, height: 36 },
    )).toEqual({ source: "right", target: "left" });
    expect(mindMapBranchSides(
      { x: 200, y: 0, width: 120, height: 46 },
      { x: 0, y: 0, width: 96, height: 36 },
    )).toEqual({ source: "left", target: "right" });
    expect(MIND_MAP_CONNECTOR_NAME).toBe("edgeever-mindmap");
  });

  test("underlines nested topics and keeps first-level topics boxed", () => {
    const nested = mindMapNodeVisual("nested", palette, { underline: true, width: 96, height: 32 });
    expect(mindMapUsesUnderline("nested")).toBe(true);
    expect(mindMapUsesUnderline("nested", "map")).toBe(true);
    expect(mindMapUsesUnderline("nested", "box")).toBe(false);
    expect(mindMapUsesUnderline("primary")).toBe(false);
    expect(mindMapUsesUnderline("primary", "line")).toBe(true);
    expect(mindMapUsesUnderline("nested", "line")).toBe(true);
    expect(mindMapUsesUnderline("root", "line")).toBe(false);
    expect(mindMapTopicForm("hexagon", "primary")).toBe("hexagon");
    expect(mindMapTopicForm("capsule", "root")).toBe("capsule");
    expect(mindMapTopicForm("logic", "primary")).toBe("rounded");
    expect(mindMapCloudPath(96, 36)).toContain("Z");
    expect(nested.body.fill).toBe("transparent");
    expect(nested.underline.stroke).toBe(palette.mindMapEdge);
    expect(nested.underline.d).toContain("H");
    expect(mindMapEdgeTerminal({ x: 0, y: 0, width: 96, height: 32 }, "nested", "left").connectionPoint.name).toBe("anchor");
    expect(mindMapEdgeTerminal({ x: 0, y: 0, width: 96, height: 32 }, "primary", "right").connectionPoint.name).toBe("boundary");
  });

  test("colors a classic branch family from the first-level sibling index", () => {
    const nodes = [
      { id: "root" },
      { id: "one", parentId: "root", y: 10 },
      { id: "two", parentId: "root", y: 80 },
      { id: "one-a", parentId: "one", y: 10 },
    ];
    expect(mindMapBranchTintIndex(nodes, "root")).toBeNull();
    expect(mindMapBranchTintIndex(nodes, "one")).toBe(0);
    expect(mindMapBranchTintIndex(nodes, "two")).toBe(1);
    expect(mindMapBranchTintIndex(nodes, "one-a")).toBe(0);
    const first = mindMapBranchTint(0, "light");
    const second = mindMapBranchTint(1, "light");
    expect(first.edge).not.toBe(second.edge);
    const styled = resolveMindMapNodeStyle(nodes, "one-a", palette, "sun", "light", { width: 96, height: 32 });
    expect(styled.underline).toBe(true);
    expect(styled.visual.underline.stroke).toBe(mindMapBranchTint(0, "light", "sun")?.edge);
    const brandNested = resolveMindMapNodeStyle(nodes, "one-a", palette, "brand", "light", { width: 96, height: 32 });
    expect(brandNested.visual.underline.stroke).toBe(palette.mindMapEdge);
  });

  test("builds a closed horizontal cubic ribbon that is thicker at the source", () => {
    const path = mindMapConnectorPath({ x: 0, y: 0 }, { x: 80, y: 0 }, 4, 1);
    expect(path.startsWith("M 0.00 2.00")).toBe(true);
    expect(path.includes("Z")).toBe(true);
    expect(path).toContain("L 0.00 -2.00");
    expect(path).toContain("L 80.00 0.50");
  });

  test("uses stroke connectors and distinct anchors for org, tree, brace, timeline, and fishbone", () => {
    expect(mindMapLayoutFamily("org")).toBe("org");
    expect(mindMapUsesRibbon("map")).toBe(true);
    expect(mindMapUsesRibbon("org")).toBe(false);
    expect(mindMapUsesRibbon("fishbone")).toBe(false);
    expect(mindMapEdgeLineAttrs("org", "#16A06E").fill).toBe("none");
    expect(mindMapEdgeLineAttrs("map", "#16A06E").fill).toBe("#16A06E");
    expect(mindMapBranchSides(
      { x: 0, y: 0, width: 120, height: 46 },
      { x: 40, y: 80, width: 96, height: 36 },
      "org",
    )).toEqual({ source: "bottom", target: "top" });
    expect(mindMapConnector(
      { x: 60, y: 46 },
      { x: 88, y: 102 },
      [],
      { structure: "org" },
    )).toContain("L 60.00 74.00");
    expect(mindMapConnector(
      { x: 20, y: 20 },
      { x: 80, y: 60 },
      [],
      { structure: "tree" },
    )).toContain("L 42.80 20.00");
    expect(mindMapConnector(
      { x: 20, y: 40 },
      { x: 90, y: 10 },
      [],
      { structure: "brace", braceTop: 10, braceBottom: 70 },
    )).not.toContain(" Z");
    expect(mindMapConnector(
      { x: 20, y: 40 },
      { x: 80, y: 10 },
      [],
      { structure: "timeline" },
    )).toBe("M 20.00 40.00 L 80.00 40.00 L 80.00 10.00");
    expect(mindMapConnector(
      { x: 200, y: 40 },
      { x: 80, y: 10 },
      [],
      { structure: "fishbone" },
    )).toContain("L 80.00 10.00");
  });
});
