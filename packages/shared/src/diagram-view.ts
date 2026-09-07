import { flowchartNodePresentation } from "./diagram-node-presentation";
import type { ArchitectureResourceIcon, DiagramDocument, DiagramNodeShape, DiagramTheme } from "./diagram";

export type DiagramAppearance = "light" | "dark";

export type DiagramPalette = {
  topicFill: string;
  topicText: string;
  nodeFill: string;
  nodeText: string;
  nodeStroke: string;
  topicStroke: string;
  mindMapEdge: string;
  flowEdge: string;
  canvas: string;
};

const BRAND_GREEN = "#16A06E";

const PALETTES: Record<DiagramTheme, Record<DiagramAppearance, DiagramPalette>> = {
  brand: {
    light: { topicFill: BRAND_GREEN, topicText: "#FFFFFF", nodeFill: "#F0F8F4", nodeText: "#173B2E", nodeStroke: "#B8DFD0", topicStroke: "#12845B", mindMapEdge: "#55B891", flowEdge: "#408A6D", canvas: "#F8FAF9" },
    dark: { topicFill: BRAND_GREEN, topicText: "#F4FFF9", nodeFill: "#18211D", nodeText: "#E8F2ED", nodeStroke: "#3B5248", topicStroke: "#58CDA4", mindMapEdge: "#4DB58B", flowEdge: "#72B99B", canvas: "#101311" },
  },
  ocean: {
    light: { topicFill: "#DEF1E9", topicText: "#0F4432", nodeFill: "#FFFEFA", nodeText: "#26352E", nodeStroke: "#D5E3DB", topicStroke: BRAND_GREEN, mindMapEdge: "#8ACCB2", flowEdge: "#6B9281", canvas: "#FBFCFA" },
    dark: { topicFill: "#244D3D", topicText: "#DFF7ED", nodeFill: "#17201C", nodeText: "#E6F0EB", nodeStroke: "#3B554A", topicStroke: "#65C9A4", mindMapEdge: "#55B992", flowEdge: "#77AD97", canvas: "#111713" },
  },
  ink: {
    light: { topicFill: BRAND_GREEN, topicText: "#F5FBF8", nodeFill: "#19261F", nodeText: "#E5EEE9", nodeStroke: "#3C594A", topicStroke: "#68D6B0", mindMapEdge: "#58BA94", flowEdge: "#68A78D", canvas: "#101512" },
    dark: { topicFill: BRAND_GREEN, topicText: "#F5FBF8", nodeFill: "#151D19", nodeText: "#E7F0EB", nodeStroke: "#3C594A", topicStroke: "#68D6B0", mindMapEdge: "#58BA94", flowEdge: "#72B296", canvas: "#0B0F0D" },
  },
};

export const resolvePortableDiagramPalette = (
  theme: DiagramTheme = "brand",
  appearance: DiagramAppearance = "light",
) => PALETTES[theme][appearance];

const architectureAccent: Partial<Record<DiagramNodeShape, string>> = {
  client: "#0891B2",
  frontend: "#2563EB",
  service: BRAND_GREEN,
  database: "#7C3AED",
  storage: "#D97706",
  queue: "#EA580C",
  security: "#E11D48",
  external: "#64748B",
};

// Native X6 viewers do not bundle React icon components. These compact,
// monochrome glyphs preserve each resource's visual identity in that portable
// projection while the Web editor renders the matching Lucide pictogram.
const architectureResourceGlyphs: Record<ArchitectureResourceIcon, string> = {
  client: "▣", webApp: "▤", mobileApp: "▯", website: "◎", apiClient: "</>",
  service: "▤", virtualMachine: "⚙", container: "⬡", kubernetes: "⌘", serverless: "ƒ",
  relationalDatabase: "◉", noSqlDatabase: "ϟ", cache: "▱", dataWarehouse: "▥", searchEngine: "⌕",
  objectStorage: "☁", fileStorage: "▧", blockStorage: "▰", backup: "↶", cdn: "⇧",
  messageQueue: "≡", eventBus: "⑂", streamProcessing: "≋", webhook: "⌁", serviceMesh: "⋮",
  apiGateway: "⇄", loadBalancer: "↔", dns: "◎", vpc: "◇", subnet: "⊞", vpn: "⌁",
  identity: "◆", firewall: "▦", waf: "✓", secretManager: "⌑", certificate: "◈", systemBoundary: "□",
  monitoring: "◴", logging: "▤", metrics: "↗", tracing: "∿", alerting: "!",
  saas: "☁", externalApi: "⌁", thirdPartyService: "ϟ",
};

const architectureShapeGlyphs: Partial<Record<DiagramNodeShape, string>> = {
  client: "▣",
  frontend: "▤",
  service: "▥",
  database: "◉",
  storage: "▰",
  queue: "≡",
  security: "✓",
  external: "☁",
};

/** Plain X6 metadata shared by native WebView viewers. */
export const diagramDocumentToX6Cells = (
  document: DiagramDocument,
  appearance: DiagramAppearance,
) => {
  const palette = resolvePortableDiagramPalette(document.theme ?? "brand", appearance);
  const nodes = document.nodes.map((node) => {
    const presentation = document.kind === "flowchart" ? flowchartNodePresentation(node.shape, node.label) : { width: node.width, height: node.height, text: node.label };
    const isRootTopic = node.shape === "topic" && !node.parentId;
    const isTerminator = node.shape === "terminator";
    const isBoundary = node.shape === "boundary";
    const accent = architectureAccent[node.shape];
    const emphasized = isRootTopic || isTerminator;
    const fill = isBoundary
      ? "transparent"
      : accent
        ? (appearance === "dark" ? palette.nodeFill : `${accent}12`)
        : emphasized ? palette.topicFill : palette.nodeFill;
    const stroke = isBoundary ? palette.nodeStroke : accent ?? (emphasized ? palette.topicStroke : palette.nodeStroke);
    const usesArchitectureIcon = document.kind === "architecture" && !isBoundary;
    const iconGlyph = node.resourceIcon
      ? architectureResourceGlyphs[node.resourceIcon]
      : architectureShapeGlyphs[node.shape];
    return {
      id: node.id,
      shape: node.shape === "decision" ? "polygon" : "rect",
      x: node.x,
      y: node.y,
      width: presentation.width,
      height: presentation.height,
      zIndex: isBoundary ? 0 : 2,
      ...(usesArchitectureIcon ? { markup: [
        { tagName: "rect", selector: "body" },
        { tagName: "rect", selector: "iconFrame" },
        { tagName: "text", selector: "resourceIcon" },
        { tagName: "text", selector: "label" },
      ] } : {}),
      attrs: {
        body: {
          fill,
          stroke,
          strokeWidth: isBoundary || emphasized || accent ? 1.5 : 1,
          strokeDasharray: isBoundary || node.shape === "external" ? "7 5" : undefined,
          rx: isTerminator ? 24 : node.shape === "database" ? 24 : 11,
          ry: isTerminator ? 24 : node.shape === "database" ? 24 : 11,
          ...(node.shape === "decision" ? { refPoints: "0,10 10,0 20,10 10,20" } : {}),
        },
        label: {
          text: presentation.text,
          lineHeight: 18,
          fill: emphasized ? palette.topicText : palette.nodeText,
          fontSize: node.shape === "topic" ? 14 : isBoundary ? 12 : 13,
          fontWeight: emphasized || isBoundary || accent ? 650 : 500,
          ...(isBoundary ? { refX: 18, refY: 22, textAnchor: "start", textVerticalAnchor: "middle" } : {}),
          ...(usesArchitectureIcon ? { refX: 54, refY: "50%", textAnchor: "start", textVerticalAnchor: "middle" } : {}),
        },
        ...(usesArchitectureIcon ? {
          iconFrame: {
            x: 10,
            y: Math.round((node.height - 34) / 2),
            width: 34,
            height: 34,
            rx: node.shape === "database" ? 17 : node.shape === "security" ? 12 : 8,
            ry: node.shape === "database" ? 17 : node.shape === "security" ? 12 : 8,
            fill: appearance === "dark" ? `${accent}30` : `${accent}18`,
            stroke: "none",
          },
          resourceIcon: {
            text: iconGlyph,
            x: 27,
            y: node.height / 2,
            fill: accent,
            fontSize: iconGlyph === "</>" ? 10 : 17,
            fontWeight: 700,
            textAnchor: "middle",
            textVerticalAnchor: "middle",
          },
        } : {}),
      },
    };
  });
  const edges = document.edges.map((edge) => {
    const edgeKind = edge.kind ?? (document.kind === "architecture" ? "dependency" : undefined);
    const stroke = edgeKind === "data" ? "#7C3AED" : edgeKind === "async" ? "#EA580C" : document.kind === "mind-map" ? palette.mindMapEdge : palette.flowEdge;
    return {
      id: edge.id,
      source: { cell: edge.source },
      target: { cell: edge.target },
      router: document.kind === "flowchart" ? { name: "manhattan", args: { padding: 28, step: 10 } } : undefined,
      connector: { name: document.kind === "mind-map" ? "smooth" : "rounded", args: { radius: 10 } },
      attrs: { line: {
        stroke,
        strokeWidth: document.kind === "mind-map" ? 2 : 1.5,
        strokeDasharray: edgeKind === "async" ? "7 5" : undefined,
        sourceMarker: edge.bidirectional ? { name: "block", width: 8, height: 6 } : null,
        targetMarker: document.kind === "mind-map" ? null : { name: "block", width: 8, height: 6 },
      } },
      labels: edge.label ? [{ attrs: {
        label: { text: edge.label, fill: palette.nodeText, fontSize: 12, lineHeight: 16, textWrap: { width: 140, height: 512 } },
        body: { ref: "label", refWidth: 1, refHeight: 1, refWidth2: 12, refHeight2: 8, refX: -6, refY: -4, fill: palette.canvas, stroke: palette.nodeStroke, strokeWidth: 1, rx: 5, ry: 5 },
      } }] : undefined,
    };
  });
  return { canvas: palette.canvas, edges, nodes };
};
