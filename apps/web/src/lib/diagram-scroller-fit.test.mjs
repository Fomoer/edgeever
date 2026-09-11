import { describe, expect, test } from "bun:test";
import {
  DIAGRAM_CANVAS_READY_MIN_SIZE,
  applyDiagramScrollerFitOptions,
  diagramCanvasIsReady,
  isUsableDiagramBounds,
} from "./diagram-scroller-fit.ts";

describe("diagram scroller fit options", () => {
  test("uses every node box so left-of-origin mind-map branches stay on the paper", () => {
    const options = applyDiagramScrollerFitOptions(
      { allowNewOrigin: "negative", contentArea: { x: 0, y: 0, width: 0, height: 0 } },
      { x: -420, y: 40, width: 960, height: 280 },
    );
    expect(options.contentArea).toEqual({ x: -420, y: 40, width: 960, height: 280 });
    expect(options.allowNewOrigin).toBe("negative");
  });

  test("does not collapse the paper to an empty rectangle when nodes are unavailable", () => {
    const options = applyDiagramScrollerFitOptions(
      { contentArea: { x: 0, y: 0, width: 0, height: 0 } },
      null,
    );
    expect(options.contentArea).toBeUndefined();
  });

  test("rejects non-finite or empty node bounds", () => {
    expect(isUsableDiagramBounds({ x: -10, y: 0, width: 0, height: 0 })).toBe(false);
    expect(isUsableDiagramBounds({ x: Number.NaN, y: 0, width: 80, height: 36 })).toBe(false);
    expect(isUsableDiagramBounds({ x: -10, y: 0, width: 80, height: 36 })).toBe(true);
  });

  test("waits for the canvas to have a real viewport before fitting a loaded diagram", () => {
    expect(diagramCanvasIsReady(null)).toBe(false);
    expect(diagramCanvasIsReady({ clientWidth: 0, clientHeight: 640 })).toBe(false);
    expect(diagramCanvasIsReady({ clientWidth: DIAGRAM_CANVAS_READY_MIN_SIZE - 1, clientHeight: 640 })).toBe(false);
    expect(diagramCanvasIsReady({ clientWidth: 960, clientHeight: 640 })).toBe(true);
  });
});
