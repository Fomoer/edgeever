import { describe, expect, test } from "bun:test";
import { ARCHITECTURE_RESOURCE_ICONS } from "./diagram.ts";
import { ARCHITECTURE_RESOURCE_ICON_ELEMENTS } from "./diagram-architecture-icons.ts";
import {
  ARCHITECTURE_COMPONENT_SHAPES,
  ARCHITECTURE_SURFACES,
  architectureEdgeVisual,
  architectureIconElements,
  architectureMermaidClassDefs,
  architectureNodeVisual,
  isArchitectureNodeShape,
  resolveArchitectureSurface,
} from "./diagram-architecture-style.ts";

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

describe("architecture semantic paint", () => {
  test("keeps every component fill distinct in light and dark", () => {
    for (const appearance of ["light", "dark"]) {
      const fills = ARCHITECTURE_COMPONENT_SHAPES.map((shape) => resolveArchitectureSurface(appearance).nodes[shape].fill);
      expect(new Set(fills).size).toBe(ARCHITECTURE_COMPONENT_SHAPES.length);
    }
  });

  test("keeps light fills pale instead of saturated chips", () => {
    const light = resolveArchitectureSurface("light");
    for (const shape of ARCHITECTURE_COMPONENT_SHAPES) {
      expect(luminance(light.nodes[shape].fill)).toBeGreaterThan(0.75);
      expect(luminance(light.nodes[shape].fill)).toBeLessThan(luminance("#FFFFFF"));
    }
  });

  test("preserves hue on dark cards instead of sharing one fill", () => {
    const dark = resolveArchitectureSurface("dark");
    const light = resolveArchitectureSurface("light");
    for (const shape of ARCHITECTURE_COMPONENT_SHAPES) {
      expect(dark.nodes[shape].fill).not.toBe(dark.canvas);
      expect(dark.nodes[shape].fill).not.toBe(light.nodes[shape].fill);
      expect(dark.nodes[shape].fill).toHaveLength(7);
      expect(light.nodes[shape].fill).toHaveLength(7);
    }
  });

  test("keeps node labels readable on their fills", () => {
    for (const appearance of ["light", "dark"]) {
      const surface = ARCHITECTURE_SURFACES[appearance];
      for (const shape of ARCHITECTURE_COMPONENT_SHAPES) {
        expect(contrast(surface.nodes[shape].text, surface.nodes[shape].fill)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(surface.boundaryText, surface.canvas)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("uses capsules for databases, queues, and external systems", () => {
    const database = architectureNodeVisual("database", "light", { width: 150, height: 72 });
    const queue = architectureNodeVisual("queue", "light", { width: 156, height: 60 });
    const external = architectureNodeVisual("external", "light", { width: 156, height: 64 });
    const service = architectureNodeVisual("service", "light", { width: 156, height: 64 });
    expect(database.body.rx).toBe(36);
    expect(queue.body.rx).toBe(30);
    expect(external.body.rx).toBe(32);
    expect(external.body.strokeDasharray).toBe("7 5");
    expect(service.body.rx).toBe(8);
    expect(service.body.strokeDasharray).toBeUndefined();
    expect(database.label.fontFamily).toContain("Inter");
  });

  test("distinguishes request, data, async, and dependency edges", () => {
    const request = architectureEdgeVisual("request", "light");
    const data = architectureEdgeVisual("data", "light");
    const asyncEdge = architectureEdgeVisual("async", "light");
    const dependency = architectureEdgeVisual("dependency", "light");
    expect(request.stroke).not.toBe(data.stroke);
    expect(request.stroke).not.toBe(dependency.stroke);
    expect(asyncEdge.strokeDasharray).toBe("7 5");
    expect(dependency.strokeWidth).toBeLessThan(request.strokeWidth);
    expect(request.targetMarker).toEqual({ name: "block", width: 8, height: 6 });
  });
});

describe("architecture portable icons", () => {
  test("embeds an SVG path for every resource instead of a unicode glyph", () => {
    expect(Object.keys(ARCHITECTURE_RESOURCE_ICON_ELEMENTS).sort()).toEqual([...ARCHITECTURE_RESOURCE_ICONS].sort());
    for (const icon of ARCHITECTURE_RESOURCE_ICONS) {
      const elements = architectureIconElements(icon, "service");
      expect(elements.length).toBeGreaterThan(0);
      expect(elements.some((element) => element.tagName === "path" || element.tagName === "rect" || element.tagName === "circle" || element.tagName === "ellipse")).toBe(true);
      expect(JSON.stringify(elements)).not.toMatch(/[▣▤⬡ϟ☁]/);
    }
    const container = architectureIconElements("container", "service");
    const database = architectureIconElements("noSqlDatabase", "database");
    expect(container).not.toEqual(database);
  });

  test("falls back to the shape pictogram when a resource icon is missing", () => {
    const fromShape = architectureIconElements(undefined, "database");
    const relational = architectureIconElements("relationalDatabase", "database");
    expect(fromShape).toEqual(relational);
    expect(isArchitectureNodeShape("client")).toBe(true);
    expect(isArchitectureNodeShape("process")).toBe(false);
  });

  test("emits mermaid classDefs from the same light surface", () => {
    const defs = architectureMermaidClassDefs("light").join("\n");
    expect(defs).toContain(`fill:${ARCHITECTURE_SURFACES.light.nodes.database.fill}`);
    expect(defs).toContain("classDef archExternal");
    expect(defs).toContain("stroke-dasharray:6 4");
  });
});
