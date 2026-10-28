import { expect, test } from "bun:test";
import { posterElementFromObject, posterObject } from "./poster-canvas";

for (const type of ["rect", "ellipse", "path"]) {
  for (const zoom of [0.5, 1]) {
    test(`${type} rebuilds its thin shape cache during vertical scaling at ${zoom * 100}% zoom`, async () => {
      const element = {
        id: "thin-shape", type, x: 100, y: 100, width: 190, height: 1,
        rotation: 0, opacity: 1, fill: "#16a06e",
        ...(type === "path" ? { path: "M0 0 H190 V1 H0 Z" } : {}),
      };
      const object = await posterObject(element, async () => { throw new Error("No resources expected"); });
      // Supply only the drawing surface used by Fabric's cache sizing. Keep the
      // active transform set: testing after mouseup misses the stale-cache bug.
      object._cacheCanvas = { width: 256, height: 256 };
      object._cacheContext = {
        setTransform() {}, clearRect() {}, translate() {}, scale() {},
      };
      object.canvas = {
        getZoom: () => zoom, getRetinaScaling: () => 1,
        _currentTransform: { target: object, action: "scaleY" },
      };
      object.zoomX = zoom;
      object.zoomY = zoom;
      for (const height of [500, 8, 300, 1]) {
        object.set({ scaleY: height / object.height });
        expect(object._updateCacheCanvas()).toBe(true);
        expect(object.zoomY).toBeCloseTo(height / object.height * zoom);
        expect(posterElementFromObject(element, object)).toMatchObject({
          x: 100, y: 100, width: 190, height,
        });
      }
    });
  }
}
