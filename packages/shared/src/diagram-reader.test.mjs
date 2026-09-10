import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  DIAGRAM_READER_MIN_SCALE,
  diagramReaderFocusNode,
  diagramReaderFocusTranslate,
  diagramReaderOpeningMode,
  diagramReaderPinchScale,
} from "./diagram-reader.ts";

const mindMap = {
  kind: "mind-map",
  nodes: [
    { id: "root", label: "核心", x: 400, y: 300, width: 120, height: 46 },
    { id: "left", label: "左支", x: 40, y: 80, width: 96, height: 36, parentId: "root" },
    { id: "right", label: "右支", x: 760, y: 520, width: 96, height: 36, parentId: "root" },
  ],
  edges: [
    { id: "e1", source: "root", target: "left" },
    { id: "e2", source: "root", target: "right" },
  ],
};

const flowchart = {
  kind: "flowchart",
  nodes: [
    { id: "start", label: "开始", x: 80, y: 0, width: 100, height: 40, shape: "terminator" },
    { id: "end", label: "结束", x: 80, y: 1600, width: 100, height: 40, shape: "terminator" },
  ],
  edges: [{ id: "e", source: "start", target: "end" }],
};

const architecture = {
  kind: "architecture",
  nodes: [
    { id: "system", label: "系统", x: 0, y: 0, width: 500, height: 300, shape: "boundary" },
    { id: "api", label: "API", x: 240, y: 40, width: 156, height: 64, shape: "service" },
    { id: "web", label: "Web", x: 40, y: 40, width: 156, height: 64, shape: "frontend" },
  ],
  edges: [{ id: "e", source: "web", target: "api" }],
};

describe("diagram reader opening view", () => {
  test("keeps compact diagrams fitted and refuses to open large maps as postage stamps", () => {
    expect(diagramReaderOpeningMode(1)).toBe("fit");
    expect(diagramReaderOpeningMode(0.9)).toBe("fit");
    expect(diagramReaderOpeningMode(0.18)).toBe("read");
    expect(diagramReaderOpeningMode(DIAGRAM_READER_MIN_SCALE)).toBe("fit");
    expect(diagramReaderOpeningMode(DIAGRAM_READER_MIN_SCALE - 0.01)).toBe("read");
  });

  test("focuses the mind-map root, flowchart start, and leftmost architecture component", () => {
    expect(diagramReaderFocusNode(mindMap)?.id).toBe("root");
    expect(diagramReaderFocusNode(flowchart)?.id).toBe("start");
    expect(diagramReaderFocusNode(architecture)?.id).toBe("web");
  });

  test("centers a mind map on the root and pins a flowchart to the top of the canvas", () => {
    const viewport = { width: 390, height: 520 };
    const mind = diagramReaderFocusTranslate(mindMap.nodes[0], viewport, "mind-map", 1);
    expect(mind.tx).toBe(390 / 2 - (400 + 120 / 2));
    expect(mind.ty).toBe(520 / 2 - (300 + 46 / 2));
    const flow = diagramReaderFocusTranslate(flowchart.nodes[0], viewport, "flowchart", 1);
    expect(flow.tx).toBe(390 / 2 - (80 + 100 / 2));
    expect(flow.ty).toBe(32);
  });

  test("scales a pinch around the starting zoom without jumping past the clamps", () => {
    expect(diagramReaderPinchScale(1, 100, 200)).toBe(2);
    expect(diagramReaderPinchScale(1, 100, 50)).toBe(0.5);
    expect(diagramReaderPinchScale(1, 100, 800)).toBe(2.5);
    expect(diagramReaderPinchScale(0.2, 100, 10)).toBe(0.1);
    expect(diagramReaderPinchScale(1, 4, 40)).toBe(1);
  });

  test("opens large diagrams at reading size and keeps Fit as a true overview", () => {
    const source = readFileSync(new URL("./diagram-reader.ts", import.meta.url), "utf8");
    expect(source).toContain("if (diagramReaderOpeningMode(graph.scale().sx) === \"read\") read()");
    expect(source).toContain("graph.on(\"node:click\", onNodeFocus)");
    expect(source).not.toContain("edgeever-diagram-reader-controls");
    expect(source).not.toContain("适应画布");
    expect(source).not.toContain("从中心阅读");
    expect(source).not.toContain("if (diagram.kind === 'flowchart' && graph.scale().sx < FLOWCHART_READABLE_MIN_SCALE) read()");
  });
});
