import { useEffect, useRef } from "react";
import { Graph } from "@antv/x6";
import {
  attachDiagramReader,
  DIAGRAM_CANVAS_DARK,
  DIAGRAM_CANVAS_LIGHT,
  diagramDocumentToX6Cells,
  MIND_MAP_CONNECTOR_NAME,
  mindMapConnector,
  type DiagramDocument,
} from "@edgeever/shared";

Graph.registerConnector(MIND_MAP_CONNECTOR_NAME, mindMapConnector, true);

const diagramTitle = (diagram: DiagramDocument, locale: "zh-CN" | "en-US" | "ja" | "pl") => {
  if (locale === "en-US") {
    return diagram.kind === "mind-map" ? "Mind map" : diagram.kind === "architecture" ? "Architecture diagram" : "Flowchart";
  }
  if (locale === "pl") {
    return diagram.kind === "mind-map" ? "Mapa myśli" : diagram.kind === "architecture" ? "Diagram architektury" : "Schemat blokowy";
  }
  return diagram.kind === "mind-map" ? "思维导图" : diagram.kind === "architecture" ? "架构图" : "流程图";
};

export const ReadOnlyX6Diagram = ({
  diagram,
  locale,
  theme,
}: {
  diagram: DiagramDocument;
  locale: "zh-CN" | "en-US" | "ja" | "pl";
  theme: "light" | "dark";
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parent = container.parentElement;
    const measureWidth = () => {
      if (!parent) return Math.max(1, container.clientWidth);
      const style = getComputedStyle(parent);
      const containerStyle = getComputedStyle(container);
      const horizontalPadding = Number.parseFloat(style.paddingLeft || "0")
        + Number.parseFloat(style.paddingRight || "0");
      const horizontalMargin = Number.parseFloat(containerStyle.marginLeft || "0")
        + Number.parseFloat(containerStyle.marginRight || "0");
      return Math.max(1, parent.clientWidth - horizontalPadding - horizontalMargin);
    };
    const cells = diagramDocumentToX6Cells(diagram, theme);
    const graph = new Graph({
      container,
      width: measureWidth(),
      height: Math.max(1, container.clientHeight),
      grid: (diagram.kind === "architecture" || diagram.kind === "flowchart") ? {
        size: 20,
        visible: true,
        type: "dot",
        args: {
          color: theme === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.08)",
          thickness: 1.2,
        },
      } : false,
      interacting: false,
      panning: { enabled: true },
      mousewheel: { enabled: true, minScale: 0.1, maxScale: 2.5 },
    });
    graph.addNodes(cells.nodes);
    graph.addEdges(cells.edges);
    const sized = {
      ...diagram,
      nodes: diagram.nodes.map((node, index) => ({
        ...node,
        width: cells.nodes[index].width,
        height: cells.nodes[index].height,
      })),
    };
    const reader = attachDiagramReader(graph, container, sized, locale, theme === "dark");
    const fit = () => reader.resize(measureWidth(), Math.max(1, container.clientHeight));
    const frame = window.requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(parent ?? container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      reader.dispose();
      graph.dispose();
    };
  }, [diagram, locale, theme]);

  return (
    <section className="edgeever-x6-document">
      <style>{`
        .edgeever-x6-document, .edgeever-diagram-reader-host {
          display: flex;
          flex-direction: column;
          min-height: min(78vh, 760px);
          height: min(78vh, 760px);
          padding: 8px 12px 16px;
        }
        .edgeever-diagram-reader-controls { flex: 0 0 auto; }
        .edgeever-x6-diagram {
          flex: 1 1 auto;
          width: 100%;
          height: auto;
          min-height: 240px;
          overflow: hidden;
          border: 1px solid ${theme === "dark" ? "#26382f" : "#e3ece7"};
          border-radius: 14px;
          background: ${theme === "dark" ? DIAGRAM_CANVAS_DARK : DIAGRAM_CANVAS_LIGHT};
          touch-action: none;
        }
        .edgeever-x6-diagram .x6-graph-svg { overflow: hidden; }
        .edgeever-x6-diagram .x6-node { cursor: pointer; }
      `}</style>
      <div
        aria-label={diagramTitle(diagram, locale)}
        className="edgeever-x6-diagram"
        data-diagram-kind={diagram.kind}
        key={diagram.kind}
        ref={containerRef}
        role="img"
      />
    </section>
  );
};

export default ReadOnlyX6Diagram;
