import { attachDiagramScroll } from "./diagram-scroll";
import type { DiagramDocument, DiagramKind } from "./diagram";
import { DIAGRAM_READABLE_MIN_SCALE } from "./diagram-flowchart-style";

type ReaderBox = { x: number; y: number; width: number; height: number };
type ReaderNode = {
  getBBox?: () => ReaderBox;
};

type ReaderGraph = {
  resize: (width: number, height: number) => unknown;
  scale: () => { sx: number; sy: number };
  zoomTo: (scale: number, options?: { center?: { x: number; y: number }; minScale?: number; maxScale?: number }) => unknown;
  zoomToFit: (options: { maxScale: number; padding: number }) => unknown;
  centerContent: () => unknown;
  translate: { (): { tx: number; ty: number }; (x: number, y: number): unknown };
  on: (event: string, callback: (args?: { node?: ReaderNode }) => void) => unknown;
  off: (event: string, callback: (args?: { node?: ReaderNode }) => void) => unknown;
  disablePanning?: () => unknown;
  enablePanning?: () => unknown;
};

export const DIAGRAM_READER_MIN_SCALE = DIAGRAM_READABLE_MIN_SCALE;
export const DIAGRAM_READER_MAX_SCALE = 2.5;
export const DIAGRAM_READER_FIT_PADDING = 28;

export const diagramReaderOpeningMode = (fitScale: number, minScale = DIAGRAM_READER_MIN_SCALE) => (
  fitScale + 1e-6 >= minScale ? "fit" : "read"
);

export const diagramReaderFocusNode = (diagram: DiagramDocument) => {
  if (!diagram.nodes.length) return undefined;
  if (diagram.kind === "flowchart") {
    const incoming = new Set(diagram.edges.map((edge) => edge.target));
    return diagram.nodes.find((node) => !incoming.has(node.id)) ?? diagram.nodes[0];
  }
  if (diagram.kind === "architecture") {
    const content = diagram.nodes.filter((node) => node.shape !== "boundary");
    return [...(content.length ? content : diagram.nodes)]
      .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id))[0];
  }
  return diagram.nodes.find((node) => !node.parentId) ?? diagram.nodes[0];
};

export const diagramReaderFocusTranslate = (
  node: ReaderBox,
  viewport: { width: number; height: number },
  kind: DiagramKind,
  scale = 1,
) => {
  const cx = node.x + node.width / 2;
  const cy = kind === "flowchart" ? node.y : node.y + node.height / 2;
  return {
    tx: viewport.width / 2 - cx * scale,
    ty: (kind === "flowchart" ? 32 : viewport.height / 2) - cy * scale,
  };
};

export const diagramReaderPinchScale = (
  startScale: number,
  startDistance: number,
  currentDistance: number,
  minScale = 0.1,
  maxScale = DIAGRAM_READER_MAX_SCALE,
) => {
  if (startDistance < 8) return startScale;
  return Math.min(maxScale, Math.max(minScale, startScale * (currentDistance / startDistance)));
};

const touchDistance = (left: Touch, right: Touch) => Math.hypot(left.clientX - right.clientX, left.clientY - right.clientY);

const touchCenter = (left: Touch, right: Touch, bounds: DOMRect) => ({
  x: (left.clientX + right.clientX) / 2 - bounds.left,
  y: (left.clientY + right.clientY) / 2 - bounds.top,
});

/** Touch pan / pinch / tap-to-focus for Android and iOS WebViews. No document writes. */
export const attachDiagramReader = (
  graph: ReaderGraph, container: HTMLElement, diagram: DiagramDocument,
  _locale: string, _dark: boolean,
) => {
  const detachScroll = attachDiagramScroll(container, graph);
  const host = container.parentElement;
  host?.classList.add("edgeever-diagram-reader-host");
  const fit = () => {
    graph.zoomToFit({ maxScale: 1, padding: DIAGRAM_READER_FIT_PADDING });
    graph.centerContent();
  };
  const applyFocus = (node: ReaderBox, scale = 1) => {
    graph.zoomTo(scale);
    const next = diagramReaderFocusTranslate(node, { width, height }, diagram.kind, scale);
    graph.translate(next.tx, next.ty);
  };
  const read = () => {
    const start = diagramReaderFocusNode(diagram);
    if (!start) return;
    applyFocus(start, 1);
  };
  const update = () => { container.dataset.scale = `${Math.round(graph.scale().sx * 100)}`; };
  graph.on("scale", update);
  const onNodeFocus = (args?: { node?: ReaderNode }) => {
    const box = args?.node?.getBBox?.();
    if (!box) return;
    applyFocus(box, Math.max(1, graph.scale().sx));
  };
  graph.on("node:click", onNodeFocus);
  let pinch: { distance: number; scale: number } | null = null;
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      pinch = { distance: touchDistance(event.touches[0], event.touches[1]), scale: graph.scale().sx };
      graph.disablePanning?.();
    }
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = diagramReaderPinchScale(pinch.scale, pinch.distance, touchDistance(event.touches[0], event.touches[1]));
    graph.zoomTo(scale, { center: touchCenter(event.touches[0], event.touches[1], container.getBoundingClientRect()) });
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      pinch = null;
      graph.enablePanning?.();
    }
  };
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
  container.addEventListener("touchend", onTouchEnd);
  container.addEventListener("touchcancel", onTouchEnd);
  let width = 0;
  let height = 0;
  return {
    resize(nextWidth: number, nextHeight: number) {
      if (nextWidth === width && nextHeight === height) return;
      const first = width === 0;
      const previous = graph.translate();
      const dx = (nextWidth - width) / 2;
      const dy = (nextHeight - height) / 2;
      const relayout = first || (height < 80 && nextHeight >= 160);
      width = nextWidth; height = nextHeight;
      graph.resize(width, height);
      if (relayout) {
        fit();
        if (diagramReaderOpeningMode(graph.scale().sx) === "read") read();
      } else graph.translate(previous.tx + dx, previous.ty + dy);
      update();
    },
    dispose() {
      detachScroll();
      graph.off("scale", update);
      graph.off("node:click", onNodeFocus);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove, true);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      graph.enablePanning?.();
      host?.classList.remove("edgeever-diagram-reader-host");
      delete container.dataset.scale;
    },
  };
};
