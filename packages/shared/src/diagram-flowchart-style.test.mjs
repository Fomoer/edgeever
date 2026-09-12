import { describe, expect, test } from "bun:test";
import { flowchartNodePresentation } from "./diagram-node-presentation.ts";
import {
  DIAGRAM_READABLE_MIN_SCALE,
  FLOWCHART_SELECTABLE_THEMES,
  FLOWCHART_SURFACES,
  FLOWCHART_THEME_GROUPS,
  flowchartEdgeIsStraight,
  flowchartEdgePorts,
  flowchartFitsReadableViewport,
  flowchartNodeVisual,
  resolveFlowchartSurface,
  resolveFlowchartTheme,
} from "./diagram-flowchart-style.ts";

const channel = (value) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => channel(Number.parseInt(value, 16)));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

describe("flowchart semantic paint", () => {
  test("keeps process, decision, and terminator visually distinct", () => {
    for (const theme of FLOWCHART_SELECTABLE_THEMES) {
      for (const appearance of ["light", "dark"]) {
        const surface = resolveFlowchartSurface(appearance, theme);
        expect(surface.process.fill).not.toBe(surface.decision.fill);
        expect(surface.process.fill).not.toBe(surface.terminator.fill);
        expect(surface.decision.stroke).not.toBe(surface.process.stroke);
        expect(surface.terminator.fill).not.toBe("#16A06E");
      }
    }
  });

  test("keeps node labels readable on their fills", () => {
    for (const theme of FLOWCHART_SELECTABLE_THEMES) {
      for (const appearance of ["light", "dark"]) {
        const surface = FLOWCHART_SURFACES[theme][appearance];
        for (const paint of [surface.process, surface.decision, surface.terminator]) {
          expect(contrast(paint.text, paint.fill)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  test("uses outlined capsules and Inter for terminator labels", () => {
    const visual = flowchartNodeVisual("terminator", "light", { width: 116, height: 40 });
    expect(visual.body.rx).toBe(20);
    expect(visual.body.fill).toBe(FLOWCHART_SURFACES.brand.light.terminator.fill);
    expect(visual.label.fontFamily).toContain("Inter");
  });

  test("offers ten flowchart surfaces and maps leftover ids onto them", () => {
    expect(FLOWCHART_SELECTABLE_THEMES).toHaveLength(10);
    expect([...FLOWCHART_THEME_GROUPS.classic, ...FLOWCHART_THEME_GROUPS.vivid]).toEqual([...FLOWCHART_SELECTABLE_THEMES]);
    expect(resolveFlowchartTheme("mint")).toBe("mint");
    expect(resolveFlowchartTheme("classic")).toBe("paper");
    expect(resolveFlowchartTheme("naive")).toBe("brand");
    expect(FLOWCHART_SURFACES.brand.light.terminator.stroke).toBe("#16A06E");
    expect(new Set(FLOWCHART_SELECTABLE_THEMES.map((theme) => FLOWCHART_SURFACES[theme].light.terminator.stroke)).size).toBe(10);
    expect(resolveFlowchartSurface("light", "ink").terminator.stroke).toBe("#3A4656");
    expect(resolveFlowchartSurface("light", "paper").canvas).toBe("#F6F1E8");
    expect(resolveFlowchartSurface("light", "mint").terminator.stroke).toBe("#1A7A70");
  });

  test("keeps flowchart-only schemes instead of collapsing them onto mind-map brand", async () => {
    const { resolveDiagramTheme } = await import("./diagram.ts");
    for (const theme of ["ink", "paper", "island", "tea", "sun", "wa", "rose"]) {
      expect(resolveFlowchartTheme(theme)).toBe(theme);
    }
    expect(resolveDiagramTheme("ink")).toBe("brand");
    expect(resolveDiagramTheme("paper")).toBe("brand");
    expect(resolveDiagramTheme("island")).toBe("dune");
    expect(resolveDiagramTheme("tea")).toBe("slate");
    expect(resolveDiagramTheme("sun")).toBe("sunrise");
    expect(resolveDiagramTheme("wa")).toBe("marine");
    expect(resolveDiagramTheme("rose")).toBe("blossom");
  });
});

describe("flowchart node presentation", () => {
  test("keeps short decision questions on one line", () => {
    const presentation = flowchartNodePresentation("decision", "是结束标记EOS？");
    expect(presentation.text.split("\n")).toEqual(["是结束标记EOS？"]);
    expect(presentation.height).toBeLessThanOrEqual(80);
  });

  test("preserves every character while wrapping long process labels", () => {
    const label = "Transformer 前向计算\n因果注意力＋前馈网络以及更长的说明文字";
    const presentation = flowchartNodePresentation("process", label);
    expect(presentation.text.replaceAll("\n", "")).toBe(label.replaceAll("\n", ""));
    expect(presentation.width).toBe(176);
  });

  test("keeps every process node the same width regardless of label length", () => {
    const short = flowchartNodePresentation("process", "短");
    const long = flowchartNodePresentation("process", "Transformer 前向计算\n因果注意力＋前馈网络");
    expect(short.width).toBe(long.width);
    expect(short.width).toBe(176);
  });
});

describe("flowchart edge geometry", () => {
  const above = { x: 80, y: 40, width: 176, height: 56 };
  const below = { x: 80, y: 160, width: 176, height: 56 };

  test("routes a stacked pair through the top and bottom ports as a straight line", () => {
    expect(flowchartEdgePorts(above, below)).toEqual({ source: "bottom", target: "top" });
    expect(flowchartEdgeIsStraight(above, below)).toBe(true);
  });

  test("sends a returning loop around the left side", () => {
    const loop = { x: 80, y: 520, width: 176, height: 56 };
    expect(flowchartEdgePorts(loop, above)).toEqual({ source: "left", target: "left" });
    expect(flowchartEdgeIsStraight(loop, above)).toBe(false);
  });
});

describe("flowchart readable viewport", () => {
  const viewport = { width: 960, height: 720 };

  test("keeps compact flows inside the canvas at full size", () => {
    expect(flowchartFitsReadableViewport({ width: 180, height: 280 }, viewport)).toBe(true);
    expect(flowchartFitsReadableViewport({ width: 176, height: 240 }, viewport)).toBe(true);
    expect(flowchartFitsReadableViewport({ width: 460, height: 220 }, viewport)).toBe(true);
    expect(flowchartFitsReadableViewport({ width: 738, height: 330 }, viewport)).toBe(true);
  });

  test("refuses to shrink a tall map into a postage stamp", () => {
    expect(flowchartFitsReadableViewport({ width: 220, height: 1680 }, viewport)).toBe(false);
    expect(DIAGRAM_READABLE_MIN_SCALE).toBe(0.85);
  });
});


