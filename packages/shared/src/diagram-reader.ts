import { attachDiagramScroll } from "./diagram-scroll";
import type { DiagramDocument } from './diagram';

type ReaderGraph = {
  resize: (width: number, height: number) => unknown;
  scale: () => { sx: number; sy: number };
  zoomTo: (scale: number) => unknown;
  zoomToFit: (options: { maxScale: number; padding: number }) => unknown;
  centerContent: () => unknown;
  translate: { (): { tx: number; ty: number }; (x: number, y: number): unknown };
  on: (event: string, callback: () => void) => unknown;
  off: (event: string, callback: () => void) => unknown;
};

/** Common touch-sized reading controls for Android and iOS WebViews. No document writes. */
export const attachDiagramReader = (
  graph: ReaderGraph, container: HTMLElement, diagram: DiagramDocument,
  locale: string, dark: boolean,
) => {
  const detachScroll = attachDiagramScroll(container, graph);
  const english = locale === 'en-US';
  const toolbar = document.createElement('div');
  toolbar.className = 'edgeever-diagram-reader-controls';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', english ? 'Diagram view' : '图表视图');
  toolbar.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;color:${dark ? '#E8F2ED' : '#173B2E'};`;
  const addButton = (label: string, action: () => void, aria = label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', aria);
    button.style.cssText = 'min-width:44px;min-height:44px;padding:8px;border:1px solid #7f9c8e;border-radius:8px;background:transparent;color:inherit;font:inherit;touch-action:manipulation;';
    button.onclick = action;
    toolbar.appendChild(button);
    return button;
  };
  const fit = () => { graph.zoomToFit({ maxScale: 1.05, padding: 28 }); graph.centerContent(); };
  const read = () => {
    const incoming = new Set(diagram.edges.map((edge) => edge.target));
    const start = diagram.nodes.find((node) => !incoming.has(node.id)) ?? diagram.nodes[0];
    if (!start) return;
    graph.zoomTo(1);
    graph.translate(width / 2 - start.x - start.width / 2, 32 - start.y);
  };
  addButton('−', () => graph.zoomTo(Math.max(0.1, graph.scale().sx / 1.25)), english ? 'Zoom out' : '缩小');
  const percent = addButton('100%', () => { graph.zoomTo(1); graph.centerContent(); }, english ? 'Reset zoom to 100%' : '恢复 100%');
  addButton('+', () => graph.zoomTo(Math.min(2.5, graph.scale().sx * 1.25)), english ? 'Zoom in' : '放大');
  addButton(english ? 'Fit' : '适应画布', fit);
  if (diagram.kind === 'flowchart') addButton(english ? 'Read from start' : '从起点阅读', read);
  const hint = document.createElement('div');
  hint.textContent = english ? 'Drag the diagram to explore. Use + / − to zoom.' : '拖动画布浏览，使用 ＋ / − 缩放';
  hint.style.cssText = 'flex-basis:100%;font-size:12px;opacity:.75;';
  toolbar.appendChild(hint);
  container.parentNode?.insertBefore(toolbar, container);
  const update = () => { percent.textContent = `${Math.round(graph.scale().sx * 100)}%`; };
  graph.on('scale', update);
  let width = 0;
  let height = 0;
  return {
    resize(nextWidth: number, nextHeight: number) {
      if (nextWidth === width && nextHeight === height) return;
      const first = width === 0;
      const previous = graph.translate();
      const dx = (nextWidth - width) / 2;
      const dy = (nextHeight - height) / 2;
      width = nextWidth; height = nextHeight;
      graph.resize(width, height);
      if (first) {
        fit();
        if (diagram.kind === 'flowchart' && graph.scale().sx < 0.8) read();
      } else graph.translate(previous.tx + dx, previous.ty + dy);
      update();
    },
    dispose() { detachScroll(); graph.off('scale', update); toolbar.remove(); },
  };
};
