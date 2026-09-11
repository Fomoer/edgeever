import { describe, expect, test } from "bun:test";
import {
  DIAGRAM_ZOOM_PERCENT_MAX,
  DIAGRAM_ZOOM_PERCENT_MIN,
  parseDiagramZoomPercent,
} from "./diagram-zoom.ts";

describe("parseDiagramZoomPercent", () => {
  test("reads whole numbers and a trailing percent sign", () => {
    expect(parseDiagramZoomPercent("85")).toBe(85);
    expect(parseDiagramZoomPercent("85%")).toBe(85);
    expect(parseDiagramZoomPercent("  200 % ")).toBe(200);
  });

  test("rounds fractional values and clamps to the wheel zoom range", () => {
    expect(parseDiagramZoomPercent("85.6")).toBe(86);
    expect(parseDiagramZoomPercent("10")).toBe(DIAGRAM_ZOOM_PERCENT_MIN);
    expect(parseDiagramZoomPercent("400")).toBe(DIAGRAM_ZOOM_PERCENT_MAX);
  });

  test("rejects empty or non-numeric input", () => {
    expect(parseDiagramZoomPercent("")).toBeNull();
    expect(parseDiagramZoomPercent("%")).toBeNull();
    expect(parseDiagramZoomPercent("abc")).toBeNull();
  });
});
