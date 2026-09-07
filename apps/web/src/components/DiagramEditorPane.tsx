import { diagramEditorSnapshot } from "@/lib/diagram-editor-snapshot";
import { MemoTitleInput } from "@/components/MemoTitleInput";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Dom, Export, Graph, History, Keyboard, Selection, type Edge, type Node } from "@antv/x6";
import * as m from "motion/react-m";
import {
  Activity,
  AppWindow,
  Blocks,
  Box,
  BrickWall,
  Cable,
  Check,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  Circle,
  CircleAlert,
  Cloud,
  CloudCog,
  CloudUpload,
  Code2,
  Container,
  Copy,
  Cpu,
  Diamond,
  Database,
  DatabaseZap,
  EthernetPort,
  FileCode2,
  FileClock,
  FileImage,
  FileStack,
  FolderArchive,
  Gauge,
  GitBranch,
  Globe2,
  HardDrive,
  History as HistoryIcon,
  KeyRound,
  Layers3,
  ListTree,
  Link2,
  LockKeyhole,
  LoaderCircle,
  MonitorSmartphone,
  Network,
  Pencil,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Router,
  Search,
  Server,
  ShieldCheck,
  ShieldEllipsis,
  Smartphone,
  SquareFunction,
  Trash2,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  attachDiagramScroll,
  ARCHITECTURE_DIAGRAM_SCHEMA_VERSION,
  DIAGRAM_SCHEMA_VERSION,
  diagramFallbackMarkdown,
  markdownToDoc,
  parseDiagramDocument,
  serializeDiagramDocument,
  type ArchitectureResourceIcon,
  type DiagramDocument,
  type DiagramEdgeKind,
  type DiagramNodeShape,
  type DiagramTheme,
  type MemoDetail,
  type MemoEditSession,
  type Notebook,
} from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppConfirmDialog } from "@/components/dialogs/ConfirmDialogs";
import { RevisionHistoryDialog } from "@/components/dialogs/RevisionHistoryDialog";
import { ShareMemoDialog } from "@/components/dialogs/ShareMemoDialog";
import { ClipboardCopyNotice } from "@/components/ClipboardCopyNotice";
import { DiagramToolbar, DiagramToolbarAddTrigger } from "@/components/DiagramToolbar";
import { MemoEditorHeaderActions } from "@/components/MemoEditorHeaderActions";
import { MemoEditorMetadataRow } from "@/components/MemoEditorMetadataRow";
import { MemoEditorTopRowLeading } from "@/components/MemoEditorTopRowLeading";
import {
  MEMO_EDITOR_TITLE_REGION_CLASS_NAME,
  MEMO_EDITOR_TOP_ROW_CLASS_NAME,
} from "@/components/MemoEditorChromeDensity";
import { EditorNoteSearchBar } from "@/components/editor/EditorNoteSearchBar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppearanceTheme } from "@/components/ThemeProvider";
import { api } from "@/lib/api";
import { EDITOR_LOCAL_SAVE_DELAY_MS, getNotebookMoveOptions } from "@/lib/app-helpers";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  compactArchitectureNodeSize,
  compactFlowchartNodeSize,
  flowchartNodePresentation,
  compactMindMapNodeSize,
  computeDiagramLayout,
  computeDiagramLayoutResult,
  getDiagramLayoutViewport,
  type DiagramLayoutViewport,
} from "@/lib/diagram-layout";
import { resolveDiagramPalette, type DiagramAppearance } from "@/lib/diagram-theme";
import { isLocalMemoId } from "@/lib/local-mirror";
import { isBrowserOffline } from "@/lib/network-status";
import { statusSettleMotion } from "@/lib/motion";
import type { EdgeEverRepository } from "@/lib/repository";
import { cn, formatDateTime, parseTagsText } from "@/lib/utils";

type DiagramEditorPaneProps = {
  memo: MemoDetail;
  notebooks: Notebook[];
  repository: EdgeEverRepository;
  readOnly: boolean;
  desktopFocusMode: boolean;
  onBackToList: () => void;
  onDeleted: (memoId: string) => Promise<void>;
  onPermanentDeleted: (memoId: string) => Promise<void>;
  onRestored: (memoId: string) => Promise<void>;
  onSaved: (memo: MemoDetail) => Promise<void>;
  onSaveAsTemplate: (memo: MemoDetail, name: string) => Promise<void>;
  onToggleDesktopFocusMode: () => void;
  onOpenExecutionCenter: () => void;
  companionDiscoveryHub?: ReactNode;
};

type NodeData = { label: string; shape: DiagramNodeShape; parentId?: string; resourceIcon?: ArchitectureResourceIcon };
type EdgeData = { kind?: DiagramEdgeKind; bidirectional?: boolean };
type MindMapInsertRelation = "child" | "sibling";
type FlowPort = "top" | "right" | "bottom" | "left";
type FlowQuickCreateState = {
  draftEdgeId: string;
  restoreHistory: boolean;
  sourceNodeId: string;
  sourcePort?: FlowPort;
  x: number;
  y: number;
  left: number;
  top: number;
};
type FlowPointerDragState = {
  sourceNodeId: string;
  sourcePort: FlowPort;
  startClientX: number;
  startClientY: number;
};
type NodeEditorState = {
  nodeId: string;
  originalValue: string;
  value: string;
  shape: DiagramNodeShape;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  background: string;
  borderColor: string;
};

type ArchitectureLibraryItem = {
  icon: LucideIcon;
  labelKey: `diagram.architectureResources.${ArchitectureResourceIcon}`;
  shape: DiagramNodeShape;
};

const ARCHITECTURE_LIBRARY_DRAG_TYPE = "application/x-edgeever-architecture-resource";

const ARCHITECTURE_LIBRARY_CATEGORIES: Array<{
  id: string;
  labelKey: string;
  tone: string;
  items: ArchitectureLibraryItem[];
}> = [
  {
    id: "applications",
    labelKey: "diagram.componentCategoryExperience",
    tone: "text-cyan-600",
    items: [
      { shape: "client", icon: MonitorSmartphone, labelKey: "diagram.architectureResources.client" },
      { shape: "frontend", icon: AppWindow, labelKey: "diagram.architectureResources.webApp" },
      { shape: "client", icon: Smartphone, labelKey: "diagram.architectureResources.mobileApp" },
      { shape: "frontend", icon: Globe2, labelKey: "diagram.architectureResources.website" },
      { shape: "client", icon: Code2, labelKey: "diagram.architectureResources.apiClient" },
    ],
  },
  {
    id: "compute",
    labelKey: "diagram.componentCategoryServices",
    tone: "text-emerald-600",
    items: [
      { shape: "service", icon: Server, labelKey: "diagram.architectureResources.service" },
      { shape: "service", icon: Cpu, labelKey: "diagram.architectureResources.virtualMachine" },
      { shape: "service", icon: Container, labelKey: "diagram.architectureResources.container" },
      { shape: "service", icon: Blocks, labelKey: "diagram.architectureResources.kubernetes" },
      { shape: "service", icon: SquareFunction, labelKey: "diagram.architectureResources.serverless" },
    ],
  },
  {
    id: "data",
    labelKey: "diagram.componentCategoryDatabases",
    tone: "text-violet-600",
    items: [
      { shape: "database", icon: Database, labelKey: "diagram.architectureResources.relationalDatabase" },
      { shape: "database", icon: DatabaseZap, labelKey: "diagram.architectureResources.noSqlDatabase" },
      { shape: "database", icon: Layers3, labelKey: "diagram.architectureResources.cache" },
      { shape: "database", icon: ChartNoAxesCombined, labelKey: "diagram.architectureResources.dataWarehouse" },
      { shape: "database", icon: Search, labelKey: "diagram.architectureResources.searchEngine" },
    ],
  },
  {
    id: "storage",
    labelKey: "diagram.componentCategoryStorage",
    tone: "text-lime-600",
    items: [
      { shape: "storage", icon: Cloud, labelKey: "diagram.architectureResources.objectStorage" },
      { shape: "storage", icon: FileStack, labelKey: "diagram.architectureResources.fileStorage" },
      { shape: "storage", icon: HardDrive, labelKey: "diagram.architectureResources.blockStorage" },
      { shape: "storage", icon: FolderArchive, labelKey: "diagram.architectureResources.backup" },
      { shape: "storage", icon: CloudUpload, labelKey: "diagram.architectureResources.cdn" },
    ],
  },
  {
    id: "middleware",
    labelKey: "diagram.componentCategoryMiddleware",
    tone: "text-orange-600",
    items: [
      { shape: "queue", icon: GitBranch, labelKey: "diagram.architectureResources.messageQueue" },
      { shape: "queue", icon: Workflow, labelKey: "diagram.architectureResources.eventBus" },
      { shape: "queue", icon: RadioTower, labelKey: "diagram.architectureResources.streamProcessing" },
      { shape: "service", icon: Webhook, labelKey: "diagram.architectureResources.webhook" },
      { shape: "service", icon: ListTree, labelKey: "diagram.architectureResources.serviceMesh" },
    ],
  },
  {
    id: "network",
    labelKey: "diagram.componentCategoryNetwork",
    tone: "text-blue-600",
    items: [
      { shape: "service", icon: Router, labelKey: "diagram.architectureResources.apiGateway" },
      { shape: "service", icon: Activity, labelKey: "diagram.architectureResources.loadBalancer" },
      { shape: "external", icon: Globe2, labelKey: "diagram.architectureResources.dns" },
      { shape: "boundary", icon: Network, labelKey: "diagram.architectureResources.vpc" },
      { shape: "boundary", icon: Cable, labelKey: "diagram.architectureResources.subnet" },
      { shape: "security", icon: EthernetPort, labelKey: "diagram.architectureResources.vpn" },
    ],
  },
  {
    id: "security",
    labelKey: "diagram.componentCategorySecurity",
    tone: "text-rose-600",
    items: [
      { shape: "security", icon: KeyRound, labelKey: "diagram.architectureResources.identity" },
      { shape: "security", icon: BrickWall, labelKey: "diagram.architectureResources.firewall" },
      { shape: "security", icon: ShieldCheck, labelKey: "diagram.architectureResources.waf" },
      { shape: "security", icon: LockKeyhole, labelKey: "diagram.architectureResources.secretManager" },
      { shape: "security", icon: ShieldEllipsis, labelKey: "diagram.architectureResources.certificate" },
      { shape: "boundary", icon: Box, labelKey: "diagram.architectureResources.systemBoundary" },
    ],
  },
  {
    id: "observability",
    labelKey: "diagram.componentCategoryObservability",
    tone: "text-teal-600",
    items: [
      { shape: "service", icon: Gauge, labelKey: "diagram.architectureResources.monitoring" },
      { shape: "service", icon: FileClock, labelKey: "diagram.architectureResources.logging" },
      { shape: "service", icon: ChartNoAxesCombined, labelKey: "diagram.architectureResources.metrics" },
      { shape: "service", icon: Activity, labelKey: "diagram.architectureResources.tracing" },
      { shape: "service", icon: CircleAlert, labelKey: "diagram.architectureResources.alerting" },
    ],
  },
  {
    id: "external",
    labelKey: "diagram.componentCategoryExternal",
    tone: "text-slate-600",
    items: [
      { shape: "external", icon: CloudCog, labelKey: "diagram.architectureResources.saas" },
      { shape: "external", icon: Webhook, labelKey: "diagram.architectureResources.externalApi" },
      { shape: "external", icon: Zap, labelKey: "diagram.architectureResources.thirdPartyService" },
    ],
  },
];

const architectureResourceIcon = (item: ArchitectureLibraryItem) =>
  item.labelKey.slice("diagram.architectureResources.".length) as ArchitectureResourceIcon;

const ARCHITECTURE_RESOURCE_ICON_COMPONENTS = Object.fromEntries(
  ARCHITECTURE_LIBRARY_CATEGORIES.flatMap((category) => category.items)
    .map((item) => [architectureResourceIcon(item), item.icon]),
) as Record<ArchitectureResourceIcon, LucideIcon>;

const ARCHITECTURE_LIBRARY_ITEMS = ARCHITECTURE_LIBRARY_CATEGORIES.flatMap((category) => category.items);

const inferArchitectureResourceIcon = (
  label: string,
  t: (key: string) => string,
) => {
  const item = ARCHITECTURE_LIBRARY_ITEMS.find((candidate) => t(candidate.labelKey) === label);
  return item ? architectureResourceIcon(item) : undefined;
};

const ArchitectureComponentLibrary = ({
  onPick,
  t,
}: {
  onPick: (item: ArchitectureLibraryItem) => void;
  t: (key: string) => string;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const categories = ARCHITECTURE_LIBRARY_CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter((item) => t(item.labelKey).toLocaleLowerCase().includes(normalizedQuery)),
  })).filter((category) => category.items.length > 0);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    }}>
      <DiagramToolbarAddTrigger onPointerEnter={() => setOpen(true)} />
      <DropdownMenuContent align="start" className="max-h-[min(36rem,calc(100vh-8rem))] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              className="h-9 pl-9"
              value={query}
              placeholder={t("diagram.componentSearch")}
              aria-label={t("diagram.componentSearch")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
        </div>
        <div className="p-1.5">
          {categories.length > 0 ? categories.map((category) => (
            <Collapsible key={category.id} defaultOpen>
              <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]">
                  <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=closed]:-rotate-90" />
                  {t(category.labelKey)}
                </CollapsibleTrigger>
              </DropdownMenuItem>
              <CollapsibleContent>
                <div className="grid grid-cols-7 gap-1 px-1 pb-2">
                  {category.items.map((item) => {
                    const Icon = item.icon;
                    const label = t(item.labelKey);
                    return (
                      <Tooltip key={item.labelKey}>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            aria-label={label}
                            className={cn("flex h-10 w-10 cursor-grab justify-center rounded-lg p-0 hover:bg-current/10 focus:bg-current/10 active:cursor-grabbing", category.tone)}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData(ARCHITECTURE_LIBRARY_DRAG_TYPE, architectureResourceIcon(item));
                            }}
                            onDragEnd={() => setOpen(false)}
                            onSelect={() => {
                              onPick(item);
                              setOpen(false);
                            }}
                          >
                            <Icon className="h-5 w-5" />
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-48">
                          <div>{label}</div>
                          <div className="text-[11px] text-slate-300">{t("diagram.placeShapeHelp")}</div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )) : (
            <div className="px-3 py-8 text-center text-sm text-slate-500">{t("diagram.noMatchingComponents")}</div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const DiagramInsertMenu = ({
  items,
}: {
  items: Array<{ icon: LucideIcon; label: string; onSelect: () => void }>;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DiagramToolbarAddTrigger onPointerEnter={() => setOpen(true)} />
      <DropdownMenuContent align="start">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
              <Icon className="h-4 w-4" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const FLOW_ACTIVE_NODE_CLASS = "edgeever-flow-node-active";
const FLOW_PORT_HIT_RADIUS = 14;
const FLOW_PORT_DOT_RADIUS = 7;
const FLOW_QUICK_CREATE_WIDTH = 330;
const FLOW_QUICK_CREATE_HEIGHT = 132;
const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const isConnectableDiagram = (kind: DiagramDocument["kind"]) => kind !== "mind-map";
const architectureNodeLabel = (shape: DiagramNodeShape, t: (key: string) => string) => {
  const labels: Partial<Record<DiagramNodeShape, string>> = {
    client: t("diagram.newClient"),
    frontend: t("diagram.newFrontend"),
    service: t("diagram.newService"),
    database: t("diagram.newDatabase"),
    storage: t("diagram.newStorage"),
    queue: t("diagram.newQueue"),
    security: t("diagram.newSecurity"),
    external: t("diagram.newExternal"),
    boundary: t("diagram.newBoundary"),
  };
  return labels[shape] ?? t("diagram.newService");
};
const oppositeFlowPort = (port?: FlowPort): FlowPort | undefined => port ? ({
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
} as const)[port] : undefined;

const removeFlowDraftEdge = (graph: Graph, edge: Edge, restoreHistory: boolean) => {
  if (graph.isHistoryEnabled()) graph.disableHistory();
  graph.removeCell(edge);
  if (restoreHistory) graph.enableHistory();
};

const setFlowNodePortsActive = (graph: Graph, node: Node, active: boolean) => {
  const apply = () => {
    const view = graph.findViewByCell(node);
    if (!view) return false;
    if (active) view.addClass(FLOW_ACTIVE_NODE_CLASS);
    else view.removeClass(FLOW_ACTIVE_NODE_CLASS);
    view.container.querySelectorAll<SVGElement>(".x6-port-body").forEach((port) => {
      port.style.setProperty("opacity", active ? "1" : "0", "important");
      port.style.setProperty("pointer-events", active ? "auto" : "none", "important");
      const dot = port.querySelector<SVGElement>(".edgeever-flow-port-dot") ?? port;
      if (active) {
        dot.style.setProperty("fill", "var(--brand-green)", "important");
        dot.style.setProperty("stroke", "var(--workspace-editor)", "important");
        dot.style.setProperty("stroke-width", "2px", "important");
        dot.style.setProperty("filter", "drop-shadow(0 1px 3px rgb(var(--brand-green-rgb) / 0.3))");
      } else {
        dot.style.removeProperty("fill");
        dot.style.removeProperty("stroke");
        dot.style.removeProperty("stroke-width");
        dot.style.removeProperty("filter");
      }
    });
    return true;
  };
  if (!apply()) window.requestAnimationFrame(apply);
};

const setOnlyFlowNodePortsActive = (graph: Graph, activeNode?: Node) => {
  graph.getNodes().forEach((node) => setFlowNodePortsActive(graph, node, node.id === activeNode?.id));
};

const applyDiagramSurface = (
  graph: Graph,
  theme: DiagramTheme,
  appearance: DiagramAppearance,
) => {
  graph.drawBackground({ color: resolveDiagramPalette(theme, appearance).canvas });
  graph.clearGrid();
};

const prepareExportSvg = (background: string) => (svg: SVGSVGElement) => {
  svg.querySelectorAll<SVGElement>(".x6-node, .x6-edge").forEach((element) => {
    element.removeAttribute("display");
    element.style.removeProperty("display");
  });
  svg.querySelectorAll(".x6-port").forEach((element) => element.remove());
  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) return;
  const [x, y, width, height] = viewBox;
  const rect = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", background);
  svg.insertBefore(rect, svg.firstChild);
};

const createLocalEditSession = (memo: MemoDetail): MemoEditSession => ({
  id: `local-edit:${memo.id}`,
  memoId: memo.id,
  baseRevision: memo.revision,
  baseContentHash: memo.contentHash,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

const nodeEditorState = (
  graph: Graph,
  node: Node,
  theme: DiagramTheme,
  appearance: DiagramAppearance,
): NodeEditorState => {
  const data = node.getData<NodeData>();
  const bbox = node.getBBox();
  const topLeft = graph.localToGraph({ x: bbox.x, y: bbox.y });
  const bottomRight = graph.localToGraph({ x: bbox.x + bbox.width, y: bbox.y + bbox.height });
  const isRootTopic = data?.shape === "topic" && !data.parentId;
  const attrs = nodeAttrs(data?.shape ?? "process", theme, appearance, isRootTopic);
  return {
    nodeId: node.id,
    originalValue: data?.label ?? "",
    value: data?.label ?? "",
    shape: data?.shape ?? "process",
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    fontSize: (data?.shape === "topic" ? 14 : 13) * graph.scale().sx,
    color: String(attrs.label.fill),
    background: String(attrs.body.fill),
    borderColor: String(attrs.body.stroke),
  };
};

const nodeAttrs = (
  shape: DiagramNodeShape,
  theme: DiagramTheme,
  appearance: DiagramAppearance,
  isRootTopic = false,
) => {
  const palette = resolveDiagramPalette(theme, appearance);
  const isTerminator = shape === "terminator";
  const isBoundary = shape === "boundary";
  const architectureAccent = ARCHITECTURE_NODE_ACCENTS[shape];
  const isAccent = isRootTopic || isTerminator;
  const architectureFill = appearance === "dark" ? palette.nodeFill : `${architectureAccent}12`;
  const architectureRadius: Partial<Record<DiagramNodeShape, number>> = {
    client: 6,
    frontend: 12,
    service: 8,
    database: 24,
    storage: 6,
    queue: 18,
    security: 16,
    external: 28,
  };
  return {
    body: {
      fill: isBoundary ? "transparent" : architectureAccent ? architectureFill : isAccent ? palette.topicFill : palette.nodeFill,
      stroke: isBoundary ? palette.nodeStroke : architectureAccent ?? (isAccent ? palette.topicStroke : palette.nodeStroke),
      strokeWidth: isBoundary ? 1.5 : isAccent || architectureAccent ? 1.5 : 1,
      strokeDasharray: isBoundary || shape === "external" ? "7 5" : undefined,
      rx: isTerminator ? 24 : architectureRadius[shape] ?? 11,
      ry: isTerminator ? 24 : architectureRadius[shape] ?? 11,
      ...(shape === "decision" ? { refPoints: "0,10 10,0 20,10 10,20" } : {}),
    },
    label: {
      fill: isAccent ? palette.topicText : palette.nodeText,
      fontSize: shape === "topic" ? 14 : isBoundary ? 12 : 13,
      fontWeight: isAccent || isBoundary || architectureAccent ? 650 : 500,
      ...(isBoundary ? { refX: 18, refY: 22, textAnchor: "start", textVerticalAnchor: "middle" } : {}),
    },
  };
};

const ARCHITECTURE_NODE_ACCENTS: Partial<Record<DiagramNodeShape, string>> = {
  client: "#0891B2",
  frontend: "#2563EB",
  service: "#16A06E",
  database: "#7C3AED",
  storage: "#D97706",
  queue: "#EA580C",
  security: "#E11D48",
  external: "#64748B",
};

// Simple 24px pictograms are embedded in the X6 SVG so exports remain self-contained.
const ARCHITECTURE_NODE_ICONS: Partial<Record<DiagramNodeShape, string>> = {
  client: "M3 4h18v13H3z M8 21h8 M12 17v4",
  frontend: "M3 4h18v16H3z M3 9h18 M7 6.5h.01 M10 6.5h.01",
  service: "M4 3h16v7H4z M4 14h16v7H4z M7 6.5h.01 M7 17.5h.01 M16 6.5h2 M16 17.5h2",
  database: "M20 6c0 2.2-3.6 4-8 4S4 8.2 4 6s3.6-4 8-4 8 1.8 8 4Z M4 6v6c0 2.2 3.6 4 8 4s8-1.8 8-4V6 M4 12v6c0 2.2 3.6 4 8 4s8-1.8 8-4v-6",
  storage: "M4 4h16l2 6v10H2V10z M2 10h20 M17 15h.01",
  queue: "M5 6h14 M5 12h14 M5 18h14 M3 6h.01 M3 12h.01 M3 18h.01",
  security: "M12 2 20 5v6c0 5.2-3.4 9.2-8 11-4.6-1.8-8-5.8-8-11V5z M9 12l2 2 4-5",
  external: "M16 16h3a4 4 0 0 0 .6-8A7 7 0 0 0 6.3 6.4 4.5 4.5 0 0 0 7.5 16H10 M14 4h6v6 M20 4l-8 8",
};

const architectureNodeVisuals = (
  shape: DiagramNodeShape,
  size: { width: number; height: number },
  appearance: DiagramAppearance,
  resourceIcon?: ArchitectureResourceIcon,
) => {
  const accent = ARCHITECTURE_NODE_ACCENTS[shape] ?? "#64748B";
  const iconY = Math.round((size.height - 34) / 2);
  const iconComponent = resourceIcon ? ARCHITECTURE_RESOURCE_ICON_COMPONENTS[resourceIcon] : undefined;
  const iconNodes = iconComponent
    ? (iconComponent as unknown as {
        render: (props: Record<string, never>, ref: null) => {
          props: { iconNode: Array<[string, Record<string, string>]> };
        };
      }).render({}, null).props.iconNode
    : null;
  const iconMarkup = iconNodes?.map(([tagName], index) => ({
    tagName,
    selector: `architectureIcon${index}`,
  })) ?? [{ tagName: "path", selector: "architectureIcon" }];
  const iconAttrs = iconNodes
    ? Object.fromEntries(iconNodes.map(([, sourceAttrs], index) => {
        const { key: _key, ...geometry } = sourceAttrs;
        return [`architectureIcon${index}`, {
          ...geometry,
          transform: `translate(15 ${iconY + 5})`,
          fill: "none",
          stroke: accent,
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          pointerEvents: "none",
        }];
      }))
    : {
        architectureIcon: {
          d: ARCHITECTURE_NODE_ICONS[shape],
          transform: `translate(15 ${iconY + 5})`,
          fill: "none",
          stroke: accent,
          strokeWidth: 1.8,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          pointerEvents: "none",
        },
      };
  return {
    markup: [
      { tagName: "rect", selector: "body" },
      { tagName: "rect", selector: "iconFrame" },
      ...iconMarkup,
      { tagName: "text", selector: "label" },
    ],
    attrs: {
      iconFrame: {
        x: 10,
        y: iconY,
        width: 34,
        height: 34,
        rx: shape === "database" ? 17 : shape === "security" ? 12 : 8,
        ry: shape === "database" ? 17 : shape === "security" ? 12 : 8,
        fill: appearance === "dark" ? `${accent}30` : `${accent}18`,
        stroke: "none",
        pointerEvents: "none",
      },
      ...iconAttrs,
    },
  };
};

// Reuse X6's measured text wrapping so on-screen labels and SVG/PNG exports agree.
const diagramNodePresentation = (
  node: DiagramDocument["nodes"][number],
  kind: DiagramDocument["kind"],
) => {
  if (kind === "flowchart") return flowchartNodePresentation(node.shape, node.label);
  const size = kind === "mind-map"
    ? compactMindMapNodeSize(node.label, !node.parentId)
    : kind === "architecture"
      ? compactArchitectureNodeSize(node.shape, node)
      : compactFlowchartNodeSize(node.shape);
  if (node.shape === "boundary") return { ...size, text: node.label };
  const fontSize = kind === "mind-map" ? 14 : 13;
  const lineHeight = 18;
  const text = Dom.breakText(node.label, { width: size.width - (kind === "architecture" ? 66 : 24), height: 10000 }, {
    fontSize, 'font-size': fontSize, 'font-weight': kind === "architecture" || !node.parentId ? 650 : 500,
    lineHeight,
  });
  return { ...size, height: Math.max(size.height, text.split("\n").length * lineHeight + 16), text };
};

const diagramNodeSize = (node: DiagramDocument["nodes"][number], kind: DiagramDocument["kind"]) => {
  const { width, height } = diagramNodePresentation(node, kind);
  return { width, height };
};

const refreshNodeLabel = (node: Node, label: string) => {
  const data = node.getData<NodeData>();
  const shape = data?.shape ?? "process";
  if (shape === "boundary") {
    node.attr("label/text", label);
    return;
  }
  const kind = shape === "topic" ? "mind-map" : ARCHITECTURE_NODE_ACCENTS[shape] ? "architecture" : "flowchart";
  const presentation = diagramNodePresentation({ id: node.id, ...node.getPosition(), ...node.getSize(), ...data, shape, label }, kind);
  const currentSize = node.getSize();
  if (currentSize.width !== presentation.width || currentSize.height !== presentation.height) {
    node.resize(presentation.width, presentation.height);
  }
  node.attr("label/text", presentation.text);
};

const flowPortGroup = (
  position: FlowPort,
  palette: ReturnType<typeof resolveDiagramPalette>,
) => ({
  position,
  markup: [
    { tagName: "circle", selector: "hitArea", className: "edgeever-flow-port-hit-area" },
    { tagName: "circle", selector: "circle", className: "edgeever-flow-port-dot" },
  ],
  attrs: {
    hitArea: {
      r: FLOW_PORT_HIT_RADIUS,
      magnet: true,
      fill: "transparent",
      stroke: "transparent",
      pointerEvents: "all",
    },
    circle: {
      r: FLOW_PORT_DOT_RADIUS,
      stroke: palette.topicStroke,
      fill: palette.canvas,
      strokeWidth: 2,
      pointerEvents: "none",
    },
  },
});

const nodeMetadata = (
  node: DiagramDocument["nodes"][number],
  theme: DiagramTheme,
  kind: DiagramDocument["kind"],
  appearance: DiagramAppearance,
) => {
  const isDecision = node.shape === "decision";
  const isRootTopic = node.shape === "topic" && !node.parentId;
  const visualAttrs = nodeAttrs(node.shape, theme, appearance, isRootTopic);
  const palette = resolveDiagramPalette(theme, appearance);
  const size = diagramNodeSize(node, kind);
  const hasPorts = isConnectableDiagram(kind) && node.shape !== "boundary";
  const architectureVisuals = kind === "architecture" && node.shape !== "boundary"
    ? architectureNodeVisuals(node.shape, size, appearance, node.resourceIcon)
    : null;
  return {
    id: node.id,
    shape: isDecision ? "polygon" : "rect",
    x: node.x,
    y: node.y,
    width: size.width,
    height: size.height,
    zIndex: node.shape === "boundary" ? 0 : 2,
    data: {
      label: node.label,
      shape: node.shape,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(node.resourceIcon ? { resourceIcon: node.resourceIcon } : {}),
    } satisfies NodeData,
    ...(architectureVisuals ? { markup: architectureVisuals.markup } : {}),
    attrs: {
      body: visualAttrs.body,
      label: {
        ...visualAttrs.label,
        text: diagramNodePresentation(node, kind).text,
        lineHeight: 18,
        ...(architectureVisuals ? { refX: 54, refY: "50%", textAnchor: "start", textVerticalAnchor: "middle" } : {}),
      },
      ...(architectureVisuals?.attrs ?? {}),
    },
    ...(hasPorts ? { ports: {
      groups: {
        top: flowPortGroup("top", palette),
        right: flowPortGroup("right", palette),
        bottom: flowPortGroup("bottom", palette),
        left: flowPortGroup("left", palette),
      },
      items: ["top", "right", "bottom", "left"].map((group) => ({ id: group, group })),
    } } : {}),
  };
};

const diagramEdgeLabel = (text: string, palette: ReturnType<typeof resolveDiagramPalette>, kind: DiagramDocument["kind"]) => ({
  position: { distance: 0.5, offset: kind === "architecture" ? { x: 0, y: -16 } : 0 },
  attrs: {
    label: { text, fill: palette.nodeText, fontSize: 12, lineHeight: 16, textWrap: { width: 140, height: 512 } },
    body: { ref: "label", refWidth: 1, refHeight: 1, refWidth2: 12, refHeight2: 8, refX: -6, refY: -4,
      fill: palette.canvas, stroke: palette.nodeStroke, strokeWidth: 1, rx: 4, ry: 4 },
  },
});

const edgeMetadata = (
  edge: DiagramDocument["edges"][number],
  kind: DiagramDocument["kind"],
  theme: DiagramTheme,
  appearance: DiagramAppearance,
) => {
  const palette = resolveDiagramPalette(theme, appearance);
  const edgeKind = edge.kind ?? (kind === "architecture" ? "dependency" : undefined);
  const edgeStroke = edgeKind === "data"
    ? "#7C3AED"
    : edgeKind === "async"
      ? "#EA580C"
      : kind === "mind-map" ? palette.mindMapEdge : palette.flowEdge;
  return {
    id: edge.id,
    source: { cell: edge.source },
    target: { cell: edge.target },
    router: kind === "flowchart" ? { name: "manhattan", args: { padding: 28, step: 10 } } : undefined,
    connector: { name: kind === "mind-map" ? "smooth" : "rounded", args: { radius: 10 } },
    data: { ...(edgeKind ? { kind: edgeKind } : {}), ...(edge.bidirectional ? { bidirectional: true } : {}) } satisfies EdgeData,
    attrs: {
      line: {
        stroke: edgeStroke,
        strokeWidth: kind === "mind-map" ? 2 : 1.5,
        strokeDasharray: edgeKind === "async" ? "7 5" : undefined,
        sourceMarker: edge.bidirectional ? { name: "block", width: 8, height: 6 } : null,
        targetMarker: kind === "mind-map" ? null : { name: "block", width: 8, height: 6 },
      },
    },
    labels: edge.label ? [diagramEdgeLabel(edge.label, palette, kind)] : undefined,
  };
};

const graphToDocument = (graph: Graph, kind: DiagramDocument["kind"], theme: DiagramTheme): DiagramDocument => ({
  schemaVersion: kind === "architecture" ? ARCHITECTURE_DIAGRAM_SCHEMA_VERSION : DIAGRAM_SCHEMA_VERSION,
  kind,
  theme,
  nodes: graph.getNodes().map((node) => {
    const data = node.getData<NodeData>();
    const position = node.getPosition();
    const size = node.getSize();
    return {
      id: node.id,
      label: data?.label ?? String(node.attr("label/text") ?? ""),
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.width),
      height: Math.round(size.height),
      shape: data?.shape ?? "process",
      ...(data?.parentId && graph.getCellById(data.parentId)?.isNode() ? { parentId: data.parentId } : {}),
      ...(data?.resourceIcon ? { resourceIcon: data.resourceIcon } : {}),
    };
  }),
  edges: graph.getEdges().flatMap((edge) => {
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target) return [];
    const label = edge.getLabels()[0]?.attrs?.label?.text;
    const data = edge.getData<EdgeData>();
    return [{
      id: edge.id,
      source,
      target,
      ...(typeof label === "string" && label ? { label } : {}),
      ...(data?.kind ? { kind: data.kind } : {}),
      ...(data?.bidirectional ? { bidirectional: true } : {}),
    }];
  }),
});

const removeGraphSelection = (graph: Graph) => {
  const selected = graph.getSelectedCells();
  if (selected.length === 0) return false;
  const removalIds = new Set(selected.map((cell) => cell.id));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of graph.getNodes()) {
      const parentId = node.getData<NodeData>()?.parentId;
      if (parentId && removalIds.has(parentId) && !removalIds.has(node.id)) {
        removalIds.add(node.id);
        expanded = true;
      }
    }
  }
  const cells = [...removalIds].map((id) => graph.getCellById(id)).filter((cell) => Boolean(cell));
  graph.startBatch("remove");
  for (const cell of cells) {
    if (cell.isNode()) graph.removeConnectedEdges(cell);
  }
  graph.removeCells(cells);
  graph.stopBatch("remove");
  return true;
};


const fitDiagramContent = (
  graph: Graph,
  document: DiagramDocument,
  container: HTMLElement | null,
  padding = 32,
  viewport?: DiagramLayoutViewport,
) => {
  const policy = viewport ?? getDiagramLayoutViewport(document.kind);
  const visibleNodes = graph.getNodes().filter((node) => node.isVisible());
  if (visibleNodes.length !== graph.getNodes().length) {
    const bounds = graph.getCellsBBox(visibleNodes);
    if (bounds) graph.zoomToRect(bounds, { padding, maxScale: policy.maxScale });
    return;
  }
  graph.zoomToFit({
    padding,
    maxScale: policy.maxScale,

  });
  // Fit the complete bounding box, including branches left of a mind-map root.
  // A minimum scale or a second anchor translation can crop existing content.
  graph.centerContent();
};

const readFlowchart = (graph: Graph, document: DiagramDocument, container: HTMLElement | null) => {
  if (!container || !document.nodes.length) return;
  const incoming = new Set(document.edges.map((edge) => edge.target));
  const start = document.nodes.find((node) => !incoming.has(node.id)) ?? document.nodes[0];
  const cell = graph.getCellById(start.id);
  if (!cell?.isNode()) return;
  graph.zoomTo(1);
  const bounds = cell.getBBox();
  graph.translate(container.clientWidth / 2 - bounds.center.x, 48 - bounds.y);
};

const applyMindMapHierarchy = (graph: Graph, theme: DiagramTheme, appearance: DiagramAppearance) => {
  const palette = resolveDiagramPalette(theme, appearance);
  const roots = new Set(graph.getNodes().filter((node) => !node.getData<NodeData>()?.parentId).map((node) => node.id));
  for (const node of graph.getNodes()) {
    const parentId = node.getData<NodeData>()?.parentId;
    const primary = Boolean(parentId && roots.has(parentId));
    node.attr("label/fontWeight", !parentId || primary ? 650 : 500);
    node.attr("body/strokeWidth", !parentId ? 2 : primary ? 1.5 : 1);
    if (primary) node.attr("body/stroke", palette.topicStroke);
  }
  for (const edge of graph.getEdges()) {
    edge.attr("line/strokeWidth", roots.has(edge.getSourceCellId()) ? 2.5 : 1.25);
  }
};

const applyGraphPalette = (
  graph: Graph,
  theme: DiagramTheme,
  kind: DiagramDocument["kind"],
  appearance: DiagramAppearance,
) => {
  const palette = resolveDiagramPalette(theme, appearance);
  const historyEnabled = graph.isHistoryEnabled();
  if (historyEnabled) graph.disableHistory();
  try {
    for (const node of graph.getNodes()) {
      const data = node.getData<NodeData>();
      const shape = data?.shape ?? "process";
      const attrs = nodeAttrs(shape, theme, appearance, shape === "topic" && !data?.parentId);
      node.attr("body", attrs.body);
      node.attr("label", attrs.label);
      refreshNodeLabel(node, data?.label ?? "");
      if (kind === "architecture" && shape !== "boundary") {
        const architectureVisuals = architectureNodeVisuals(shape, node.getSize(), appearance, data?.resourceIcon);
        for (const [selector, selectorAttrs] of Object.entries(architectureVisuals.attrs)) {
          node.attr(selector, selectorAttrs);
        }
      }
      for (const port of node.getPorts()) {
        if (!port.id) continue;
        node.portProp(port.id, "attrs/circle", {
          stroke: palette.topicStroke,
          fill: palette.canvas,
        });
      }
    }
    for (const edge of graph.getEdges()) {
      const edgeKind = edge.getData<EdgeData>()?.kind;
      edge.attr("line/stroke", edgeKind === "data" ? "#7C3AED" : edgeKind === "async" ? "#EA580C" : kind === "mind-map" ? palette.mindMapEdge : palette.flowEdge);
      if (edge.getLabels().length > 0) {
        edge.setLabels(edge.getLabels().map((label) => diagramEdgeLabel(String(label.attrs?.label?.text ?? ""), palette, kind)));
      }
    }
    if (kind === "mind-map") applyMindMapHierarchy(graph, theme, appearance);
    applyDiagramSurface(graph, theme, appearance);
  } finally {
    if (historyEnabled) graph.enableHistory();
  }
};

export const DiagramEditorPane = ({
  memo,
  notebooks,
  repository,
  readOnly,
  desktopFocusMode,
  onBackToList,
  onDeleted,
  onPermanentDeleted,
  onRestored,
  onSaved,
  onSaveAsTemplate,
  onToggleDesktopFocusMode,
  onOpenExecutionCenter,
  companionDiscoveryHub,
}: DiagramEditorPaneProps) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppearanceTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const insertNodeRef = useRef<(relation: MindMapInsertRelation, baseNodeId?: string) => void>(() => undefined);
  const openFlowQuickCreateRef = useRef<(node: Node) => void>(() => undefined);
  const memoRef = useRef(memo);
  const editSessionRef = useRef<MemoEditSession | null>(null);
  const saveRef = useRef<() => void>(() => undefined);
  const document = parseDiagramDocument(memo.contentMarkdown);
  const documentTheme = document?.theme ?? "brand";
  const [title, setTitle] = useState(memo.title ?? "");
  const [tagsText, setTagsText] = useState(memo.tags.join(", "));
  const [theme, setTheme] = useState<DiagramTheme>(documentTheme);
  const titleRef = useRef(title);
  const tagsRef = useRef(tagsText);
  const themeRef = useRef<DiagramTheme>(documentTheme);
  const appearanceRef = useRef<DiagramAppearance>(resolvedTheme);
  const savedSnapshotRef = useRef(document ? diagramEditorSnapshot(memo.title ?? "", document) : "");
  const viewOnlyRef = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedEdgeLabel, setSelectedEdgeLabel] = useState("");
  const [hasSelection, setHasSelection] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editSessionReady, setEditSessionReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [memoIdCopyNotice, setMemoIdCopyNotice] = useState<"copied" | "error" | null>(null);
  const memoIdCopyTimerRef = useRef<number | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [mobileNotebookSheetOpen, setMobileNotebookSheetOpen] = useState(false);
  const [notebookUpdatePending, setNotebookUpdatePending] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const [nodeEditor, setNodeEditor] = useState<NodeEditorState | null>(null);
  const [flowQuickCreate, setFlowQuickCreate] = useState<FlowQuickCreateState | null>(null);
  const [pendingArchitectureItem, setPendingArchitectureItem] = useState<ArchitectureLibraryItem | null>(null);
  const notebookOptions = useMemo(() => getNotebookMoveOptions(notebooks), [notebooks]);
  const flowQuickCreateRef = useRef<FlowQuickCreateState | null>(null);
  const flowPointerDragRef = useRef<FlowPointerDragState | null>(null);
  const nodeEditorRef = useRef<NodeEditorState | null>(null);
  const editorDirty = dirty || tagsDirty;

  useEffect(() => {
    setPendingArchitectureItem(null);
  }, [memo.id]);

  useEffect(() => {
    if (!pendingArchitectureItem) return;
    const cancelPlacement = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingArchitectureItem(null);
    };
    window.addEventListener("keydown", cancelPlacement);
    return () => window.removeEventListener("keydown", cancelPlacement);
  }, [pendingArchitectureItem]);

  const beginNodeEdit = useCallback((node: Node) => {
    const graph = graphRef.current;
    if (!graph || readOnly) return;
    const nextEditor = nodeEditorState(graph, node, themeRef.current, appearanceRef.current);
    nodeEditorRef.current = nextEditor;
    setNodeEditor(nextEditor);
  }, [readOnly]);

  const finishNodeEdit = useCallback((cancel = false) => {
    const graph = graphRef.current;
    const current = nodeEditorRef.current;
    nodeEditorRef.current = null;
    setNodeEditor(null);
    if (!graph || !current) return null;
    const cell = graph.getCellById(current.nodeId);
    if (!cell?.isNode()) return null;
    if (!cancel) {
      const label = current.value.trim() || current.originalValue;
      if (label !== current.originalValue) {
        graph.startBatch("edit-label");
        cell.setData({ ...cell.getData<NodeData>(), label });
        refreshNodeLabel(cell, label);
        graph.stopBatch("edit-label");
        setSelectedNodeLabel(label);
      }
    }
    containerRef.current?.focus({ preventScroll: true });
    return cell;
  }, []);

  const dismissFlowQuickCreate = useCallback(() => {
    const pending = flowQuickCreateRef.current;
    flowQuickCreateRef.current = null;
    setFlowQuickCreate(null);
    if (!pending) return;
    const graph = graphRef.current;
    const draftEdge = graph?.getCellById(pending.draftEdgeId);
    if (graph && draftEdge?.isEdge()) removeFlowDraftEdge(graph, draftEdge, pending.restoreHistory);
    if (graph && pending.restoreHistory) graph.enableHistory();
  }, []);

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedNodeLabel("");
    setSelectedEdgeId(null);
    setSelectedEdgeLabel("");
    setHasSelection(false);
    flowQuickCreateRef.current = null;
    setFlowQuickCreate(null);
    nodeEditorRef.current = null;
    setNodeEditor(null);
    setTheme(documentTheme);
    themeRef.current = documentTheme;
    setHistoryOpen(false);
    setShareOpen(false);
    setMemoIdCopyNotice(null);
  }, [documentTheme, memo.id]);

  useEffect(() => () => {
    if (memoIdCopyTimerRef.current !== null) window.clearTimeout(memoIdCopyTimerRef.current);
  }, []);

  useEffect(() => {
    memoRef.current = memo;
    setTitle(memo.title ?? "");
    titleRef.current = memo.title ?? "";
    setTagsText(memo.tags.join(", "));
    tagsRef.current = memo.tags.join(", ");
    savedSnapshotRef.current = document ? diagramEditorSnapshot(memo.title ?? "", document) : "";
    setDirty(false);
    setTagsDirty(false);
    setMobileNotebookSheetOpen(false);
    setSaveError(null);
    setSaveFailed(false);
    editSessionRef.current = null;
    setEditSessionReady(false);
    if (readOnly || isLocalMemoId(memo.id) || isBrowserOffline() || window.edgeeverDesktop?.isAvailable) {
      editSessionRef.current = createLocalEditSession(memo);
      setEditSessionReady(true);
      return;
    }
    let cancelled = false;
    void api.createMemoEditSession(memo.id).then(({ editSession }) => {
      if (!cancelled) {
        editSessionRef.current = editSession;
        setEditSessionReady(true);
      }
    }).catch(() => {
      if (!cancelled) setSaveError(t("diagram.editSessionError"));
    });
    return () => { cancelled = true; };
  }, [memo.id, memo.contentHash, memo.revision, readOnly, t]);

  useEffect(() => {
    appearanceRef.current = resolvedTheme;
    const graph = graphRef.current;
    if (!graph || !document) return;
    viewOnlyRef.current = true;
    try {
      applyGraphPalette(graph, themeRef.current, document.kind, resolvedTheme);
    } finally {
      viewOnlyRef.current = false;
    }
    const currentEditor = nodeEditorRef.current;
    if (!currentEditor) return;
    const node = graph.getCellById(currentEditor.nodeId);
    if (!node?.isNode()) return;
    const visualState = nodeEditorState(graph, node, themeRef.current, resolvedTheme);
    const nextEditor = {
      ...currentEditor,
      color: visualState.color,
      background: visualState.background,
      borderColor: visualState.borderColor,
    };
    nodeEditorRef.current = nextEditor;
    setNodeEditor(nextEditor);
  }, [resolvedTheme, document?.kind]);

  useEffect(() => {
    if (!containerRef.current || !document) return;
    const appearance = appearanceRef.current;
    const palette = resolveDiagramPalette(documentTheme, appearance);
    let graph!: Graph;
    graph = new Graph({
      container: containerRef.current,
      autoResize: true,
      async: true,
      background: { color: palette.canvas },
      grid: false,
      panning: { enabled: true, eventTypes: ["leftMouseDown"] },
      mousewheel: { enabled: true, modifiers: ["ctrl", "meta"], minScale: 0.3, maxScale: 2.5 },
      interacting: !readOnly,
      connecting: {
        allowBlank: document.kind === "flowchart",
        allowLoop: false,
        allowNode: false,
        allowEdge: false,
        allowPort: isConnectableDiagram(document.kind),
        allowMulti: false,
        highlight: isConnectableDiagram(document.kind),
        snap: { radius: 24 },
        router: document.kind === "flowchart" ? { name: "manhattan", args: { padding: 28, step: 10 } } : "normal",
        connector: document.kind === "mind-map" ? "smooth" : "rounded",
        validateConnection: ({ sourceCell, targetCell, sourcePort, targetPort }) => {
          if (!isConnectableDiagram(document.kind) || !sourceCell || !sourcePort) return false;
          if (!targetCell) return true;
          return Boolean(targetPort && sourceCell.id !== targetCell.id);
        },
        createEdge: (): Edge => {
          dismissFlowQuickCreate();
          const restoreHistory = graph.isHistoryEnabled();
          if (restoreHistory) graph.disableHistory();
          return graph.createEdge({
            ...edgeMetadata(
              { id: createId("edge"), source: "", target: "" },
              document.kind,
              themeRef.current,
              appearanceRef.current,
            ),
            data: { quickConnectDraft: true, restoreHistory },
          });
        },
      },
    });
    graph.use(new History({ enabled: !readOnly }));
    graph.use(new Export());
    graph.use(new Keyboard({
      enabled: !readOnly,
      global: false,
      guard: (event) => {
        const target = event.target;
        return !(target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)));
      },
    }));
    graph.use(new Selection({ enabled: true, multiple: true, rubberband: true, movable: !readOnly, showNodeSelectionBox: true, showEdgeSelectionBox: true }));
    const detachScroll = attachDiagramScroll(graph.container, graph);
    graph.addNodes(document.nodes.map((node) => {
      const inferredResourceIcon = document.kind === "architecture" && !node.resourceIcon
        ? inferArchitectureResourceIcon(node.label, t)
        : undefined;
      return nodeMetadata({
        ...node,
        ...(inferredResourceIcon ? { resourceIcon: inferredResourceIcon } : {}),
      }, documentTheme, document.kind, appearance);
    }));
    if (document.kind === "architecture") {
      for (const node of graph.getNodes()) {
        const parentId = node.getData<NodeData>()?.parentId;
        const parent = parentId ? graph.getCellById(parentId) : null;
        if (parent?.isNode()) parent.addChild(node);
      }
    }
    graph.addEdges(document.edges.map((edge) => edgeMetadata(edge, document.kind, documentTheme, appearance)));
    let viewportWidth = containerRef.current?.clientWidth ?? 0;
    let viewportHeight = containerRef.current?.clientHeight ?? 0;
    graph.on("resize", ({ width, height }) => {
      const translation = graph.translate();
      graph.translate(translation.tx + (width - viewportWidth) / 2, translation.ty + (height - viewportHeight) / 2);
      viewportWidth = width;
      viewportHeight = height;
    });
    graph.on("scale", () => setZoomPercent(Math.round(graph.scale().sx * 100)));
    graph.cleanHistory();
    fitDiagramContent(graph, document, containerRef.current);
    if (document.kind === "flowchart" && graph.scale().sx < 0.8) readFlowchart(graph, document, containerRef.current);

    const updateHistory = () => setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    const markDirty = () => {
      if (viewOnlyRef.current) return;
      if (!readOnly) {
        const currentDocument = graphToDocument(graph, document.kind, themeRef.current);
        const hasChanges = savedSnapshotRef.current !== diagramEditorSnapshot(titleRef.current, currentDocument);
        setDirty(hasChanges);
        if (hasChanges) setDirtyVersion((current) => current + 1);
      }
      updateHistory();
    };
    const clearSelectionAfterHistory = () => {
      applyGraphPalette(graph, themeRef.current, document.kind, appearanceRef.current);
      graph.cleanSelection();
      if (isConnectableDiagram(document.kind)) setOnlyFlowNodePortsActive(graph);
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(false);
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
    };
    graph.on("model:updated", markDirty);
    graph.on("history:change", updateHistory);
    graph.on("history:undo", clearSelectionAfterHistory);
    graph.on("history:redo", clearSelectionAfterHistory);
    graph.on("node:selected", ({ node }: { node: Node }) => {
      if (isConnectableDiagram(document.kind)) setFlowNodePortsActive(graph, node, true);
    });
    graph.on("node:unselected", ({ node }: { node: Node }) => {
      if (isConnectableDiagram(document.kind)) setFlowNodePortsActive(graph, node, false);
    });
    graph.on("node:click", ({ node }: { node: Node }) => {
      const data = node.getData<NodeData>();
      dismissFlowQuickCreate();
      if (isConnectableDiagram(document.kind)) setOnlyFlowNodePortsActive(graph, node);
      containerRef.current?.focus({ preventScroll: true });
      setSelectedNodeId(node.id);
      setSelectedNodeLabel(data?.label ?? "");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(true);
    });
    graph.on("node:dblclick", ({ node }: { node: Node }) => beginNodeEdit(node));
    graph.on("edge:click", ({ edge }: { edge: Edge }) => {
      dismissFlowQuickCreate();
      if (isConnectableDiagram(document.kind)) setOnlyFlowNodePortsActive(graph);
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(edge.id);
      setSelectedEdgeLabel(String(edge.getLabels()[0]?.attrs?.label?.text ?? ""));
      setHasSelection(true);
    });
    graph.on("blank:click", () => {
      dismissFlowQuickCreate();
      if (isConnectableDiagram(document.kind)) setOnlyFlowNodePortsActive(graph);
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(false);
    });
    graph.on("edge:removed", ({ edge }: { edge: Edge }) => {
      const draft = edge.getData<{ quickConnectDraft?: boolean; restoreHistory?: boolean }>();
      if (flowQuickCreateRef.current?.draftEdgeId === edge.id) {
        flowQuickCreateRef.current = null;
        setFlowQuickCreate(null);
      }
      if (draft?.quickConnectDraft && draft.restoreHistory) graph.enableHistory();
    });
    const showFlowQuickCreate = (
      edge: Edge,
      sourceNodeId: string,
      sourcePort: FlowPort | undefined,
      point: { x: number; y: number },
      restoreHistory: boolean,
    ) => {
      if (!containerRef.current) return;
      const overlayPoint = graph.localToGraph(point);
      const nextQuickCreate: FlowQuickCreateState = {
        draftEdgeId: edge.id,
        restoreHistory,
        sourceNodeId,
        sourcePort,
        x: point.x,
        y: point.y,
        left: Math.max(12, Math.min(overlayPoint.x + 12, containerRef.current.clientWidth - FLOW_QUICK_CREATE_WIDTH - 12)),
        top: Math.max(12, Math.min(overlayPoint.y + 12, containerRef.current.clientHeight - FLOW_QUICK_CREATE_HEIGHT - 12)),
      };
      flowQuickCreateRef.current = nextQuickCreate;
      setFlowQuickCreate(nextQuickCreate);
      if (restoreHistory) graph.enableHistory();
    };
    const openFlowQuickCreate = (sourceNode: Node) => {
      dismissFlowQuickCreate();
      const sourceBounds = sourceNode.getBBox();
      const nextSize = compactFlowchartNodeSize("process");
      const sourcePort: FlowPort = "right";
      const point = {
        x: sourceBounds.x + sourceBounds.width + 96 + nextSize.width / 2,
        y: sourceBounds.y + sourceBounds.height / 2,
      };
      const restoreHistory = graph.isHistoryEnabled();
      if (restoreHistory) graph.disableHistory();
      const draftEdge = graph.addEdge({
        ...edgeMetadata(
          { id: createId("edge"), source: sourceNode.id, target: "" },
          document.kind,
          themeRef.current,
          appearanceRef.current,
        ),
        source: { cell: sourceNode.id, port: sourcePort },
        target: point,
        data: { quickConnectDraft: true, restoreHistory },
      });
      showFlowQuickCreate(draftEdge, sourceNode.id, sourcePort, point, restoreHistory);
    };
    openFlowQuickCreateRef.current = openFlowQuickCreate;
    graph.on("edge:connected", ({ edge, isNew, type, currentCell, currentPort, currentPoint }) => {
      if (!isConnectableDiagram(document.kind) || !isNew || type !== "target") return;
      const sourceNodeId = edge.getSourceCellId();
      const source = edge.getSource();
      const draft = edge.getData<{ restoreHistory?: boolean }>();
      const removeDraft = () => {
        graph.removeCell(edge);
        if (draft?.restoreHistory) graph.enableHistory();
      };
      if (!sourceNodeId) {
        removeDraft();
        return;
      }
      if (currentCell?.isNode()) {
        removeDraft();
        graph.startBatch("connect");
        graph.addEdge({
          ...edgeMetadata(
            { id: edge.id, source: sourceNodeId, target: currentCell.id },
            document.kind,
            themeRef.current,
            appearanceRef.current,
          ),
          source,
          target: { cell: currentCell.id, ...(currentPort ? { port: currentPort } : {}) },
        });
        graph.stopBatch("connect");
        return;
      }
      if (!currentPoint || !containerRef.current) {
        removeDraft();
        return;
      }
      showFlowQuickCreate(
        edge,
        sourceNodeId,
        "port" in source && typeof source.port === "string" ? source.port as FlowPort : undefined,
        currentPoint,
        Boolean(draft?.restoreHistory),
      );
    });
    const handleFlowPointerDown = (event: PointerEvent) => {
      if (document.kind !== "flowchart" || readOnly || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const port = target?.closest(".x6-port-body");
      const node = target?.closest(".x6-node");
      const sourcePort = port?.getAttribute("port") as FlowPort | null;
      const sourceNodeId = node?.getAttribute("data-cell-id");
      if (!sourcePort || !sourceNodeId) return;
      flowPointerDragRef.current = {
        sourceNodeId,
        sourcePort,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
    };
    const handleFlowPointerUp = (event: PointerEvent) => {
      const pointerDrag = flowPointerDragRef.current;
      flowPointerDragRef.current = null;
      if (!pointerDrag || document.kind !== "flowchart" || readOnly) return;
      if (Math.hypot(event.clientX - pointerDrag.startClientX, event.clientY - pointerDrag.startClientY) < 8) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".x6-port-body") || target?.closest(".x6-node")) return;
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
      const clientPoint = { x: event.clientX, y: event.clientY };
      window.setTimeout(() => {
        if (graphRef.current !== graph || flowQuickCreateRef.current) return;
        const point = graph.clientToLocal(clientPoint);
        const existingDraft = graph.getEdges().find((candidate) => candidate.getData<{ quickConnectDraft?: boolean }>()?.quickConnectDraft);
        const restoreHistory = existingDraft
          ? Boolean(existingDraft.getData<{ restoreHistory?: boolean }>()?.restoreHistory)
          : graph.isHistoryEnabled();
        if (!existingDraft && restoreHistory) graph.disableHistory();
        const draftEdge = existingDraft ?? graph.addEdge({
          ...edgeMetadata(
            { id: createId("edge"), source: pointerDrag.sourceNodeId, target: "" },
            document.kind,
            themeRef.current,
            appearanceRef.current,
          ),
          source: { cell: pointerDrag.sourceNodeId, port: pointerDrag.sourcePort },
          target: point,
          data: { quickConnectDraft: true, restoreHistory },
        });
        showFlowQuickCreate(draftEdge, pointerDrag.sourceNodeId, pointerDrag.sourcePort, point, restoreHistory);
      }, 0);
    };
    containerRef.current.addEventListener("pointerdown", handleFlowPointerDown, true);
    window.addEventListener("pointerup", handleFlowPointerUp, true);
    graph.bindKey(["backspace", "delete"], (event) => {
      event.preventDefault();
      if (!removeGraphSelection(graph)) return;
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(false);
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
      setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    });
    graph.bindKey("enter", (event) => {
      event.preventDefault();
      const selected = graph.getSelectedCells().find((cell) => cell.isNode());
      if (document.kind === "mind-map") {
        insertNodeRef.current("sibling", selected?.id);
      } else if (selected?.isNode()) {
        beginNodeEdit(selected);
      }
    });
    graph.bindKey("tab", (event) => {
      event.preventDefault();
      const selected = graph.getSelectedCells().find((cell) => cell.isNode());
      if (document.kind === "mind-map") {
        insertNodeRef.current("child", selected?.id);
      } else if (document.kind === "flowchart" && selected?.isNode()) {
        openFlowQuickCreate(selected);
      }
    });
    if (isConnectableDiagram(document.kind)) {
      graph.bindKey(["meta+d", "ctrl+d"], (event) => {
        event.preventDefault();
        const selectedNodes = graph.getSelectedCells().filter((cell): cell is Node => cell.isNode());
        if (selectedNodes.length === 0) return;
        graph.startBatch("duplicate");
        const duplicates = selectedNodes.map((node) => {
          const data = node.getData<NodeData>();
          const position = node.getPosition();
          const duplicate = graph.addNode(nodeMetadata({
            id: createId("node"),
            label: data?.label ?? (document.kind === "architecture" ? t("diagram.newService") : t("diagram.newStep")),
            x: position.x + 24,
            y: position.y + 24,
            width: node.getSize().width,
            height: node.getSize().height,
            shape: data?.shape ?? "process",
            ...(data?.parentId ? { parentId: data.parentId } : {}),
            ...(data?.resourceIcon ? { resourceIcon: data.resourceIcon } : {}),
          }, themeRef.current, document.kind, appearanceRef.current));
          const parent = data?.parentId ? graph.getCellById(data.parentId) : null;
          if (parent?.isNode()) parent.addChild(duplicate);
          return duplicate;
        });
        graph.stopBatch("duplicate");
        graph.cleanSelection();
        duplicates.forEach((node) => graph.select(node));
        const lastNode = duplicates.at(-1);
        setSelectedNodeId(lastNode?.id ?? null);
        setSelectedNodeLabel(lastNode?.getData<NodeData>()?.label ?? "");
        setHasSelection(duplicates.length > 0);
      });
    }
    const nudgeSelection = (event: KeyboardEvent) => {
      const selectedNodes = graph.getSelectedCells().filter((cell): cell is Node => cell.isNode());
      if (selectedNodes.length === 0) return;
      event.preventDefault();
      const distance = event.shiftKey ? 10 : 1;
      const movement = {
        ArrowUp: { dx: 0, dy: -distance },
        ArrowDown: { dx: 0, dy: distance },
        ArrowLeft: { dx: -distance, dy: 0 },
        ArrowRight: { dx: distance, dy: 0 },
      }[event.key];
      if (!movement) return;
      graph.startBatch("nudge");
      selectedNodes.forEach((node) => node.translate(movement.dx, movement.dy));
      graph.stopBatch("nudge");
    };
    graph.bindKey(["up", "down", "left", "right", "shift+up", "shift+down", "shift+left", "shift+right"], nudgeSelection);
    graph.bindKey("0", (event) => {
      event.preventDefault();
      fitDiagramContent(graph, document, containerRef.current);
    });
    graph.bindKey("1", (event) => {
      event.preventDefault();
      graph.zoomTo(1);
      graph.centerContent();
    });
    graph.bindKey("esc", (event) => {
      if (!flowQuickCreateRef.current) return;
      event.preventDefault();
      dismissFlowQuickCreate();
    });
    graph.bindKey(["meta+z", "ctrl+z"], (event) => {
      event.preventDefault();
      graph.undo();
      applyGraphPalette(graph, themeRef.current, document.kind, appearanceRef.current);
      graph.cleanSelection();
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(false);
      setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
    });
    graph.bindKey(["meta+shift+z", "ctrl+shift+z", "ctrl+y"], (event) => {
      event.preventDefault();
      graph.redo();
      applyGraphPalette(graph, themeRef.current, document.kind, appearanceRef.current);
      graph.cleanSelection();
      setSelectedNodeId(null);
      setSelectedNodeLabel("");
      setSelectedEdgeId(null);
      setSelectedEdgeLabel("");
      setHasSelection(false);
      setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
    });
    graphRef.current = graph;
    return () => {
      containerRef.current?.removeEventListener("pointerdown", handleFlowPointerDown, true);
      window.removeEventListener("pointerup", handleFlowPointerUp, true);
      flowPointerDragRef.current = null;
      openFlowQuickCreateRef.current = () => undefined;
      nodeEditorRef.current = null;
      graphRef.current = null;
      detachScroll(); graph.dispose();
    };
  }, [beginNodeEdit, dismissFlowQuickCreate, memo.contentHash, memo.id, readOnly]);

  useEffect(() => {
    if (!editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorDirty]);

  useEffect(() => {
    if (readOnly) return;
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [readOnly]);

  const addNode = useCallback((
    shape: DiagramNodeShape = "process",
    options: {
      relation?: MindMapInsertRelation;
      baseNodeId?: string;
      beginEditing?: boolean;
      label?: string;
      position?: { x: number; y: number };
      resourceIcon?: ArchitectureResourceIcon;
    } = {},
  ) => {
    const graph = graphRef.current;
    if (!graph || !document || readOnly) return;
    const baseNodeId = options.baseNodeId ?? selectedNodeId;
    const selected = baseNodeId
      ? graph.getCellById(baseNodeId) as Node | undefined
      : document.kind === "mind-map"
        ? graph.getNodes()[0]
        : undefined;
    const selectedPosition = selected?.isNode() ? selected.getPosition() : { x: 120, y: 120 };
    const selectedSize = selected?.isNode() ? selected.getSize() : { width: 140, height: 52 };
    const isMindMap = document.kind === "mind-map";
    const isArchitecture = document.kind === "architecture";
    const selectedData = selected?.isNode() ? selected.getData<NodeData>() : undefined;
    const requestedSibling = isMindMap && options.relation === "sibling" && Boolean(selectedData?.parentId);
    const parent = requestedSibling
      ? graph.getCellById(selectedData?.parentId ?? "") as Node | undefined
      : selected;
    const siblings = requestedSibling
      ? graph.getNodes().filter((node) => node.getData<NodeData>()?.parentId === selectedData?.parentId)
      : [];
    const childNodes = isMindMap && selected?.isNode()
      ? graph.getNodes().filter((node) => node.getData<NodeData>()?.parentId === selected.id)
      : [];
    const authoredSize = isArchitecture
      ? compactArchitectureNodeSize(shape)
      : { width: shape === "decision" ? 132 : 140, height: shape === "decision" ? 84 : 52 };
    const dropBoundary = isArchitecture && shape !== "boundary" && options.position
      ? graph.getNodes()
        .filter((node) => node.getData<NodeData>()?.shape === "boundary")
        .filter((node) => {
          const bounds = node.getBBox();
          return options.position!.x >= bounds.x
            && options.position!.x <= bounds.x + bounds.width
            && options.position!.y >= bounds.y
            && options.position!.y <= bounds.y + bounds.height;
        })
        .sort((left, right) => {
          const leftBounds = left.getBBox();
          const rightBounds = right.getBBox();
          return leftBounds.width * leftBounds.height - rightBounds.width * rightBounds.height;
        })[0]
      : undefined;
    const requestedPosition = options.position
      ? {
          x: options.position.x - authoredSize.width / 2,
          y: options.position.y - authoredSize.height / 2,
        }
      : undefined;
    if (requestedPosition && dropBoundary) {
      const bounds = dropBoundary.getBBox();
      const horizontalPadding = 18;
      const topPadding = 40;
      const bottomPadding = 18;
      requestedPosition.x = Math.min(
        Math.max(requestedPosition.x, bounds.x + horizontalPadding),
        Math.max(bounds.x + horizontalPadding, bounds.x + bounds.width - authoredSize.width - horizontalPadding),
      );
      requestedPosition.y = Math.min(
        Math.max(requestedPosition.y, bounds.y + topPadding),
        Math.max(bounds.y + topPadding, bounds.y + bounds.height - authoredSize.height - bottomPadding),
      );
    }
    const nextPosition = requestedPosition ?? (requestedSibling
      ? {
          x: selectedPosition.x,
          y: Math.max(selectedPosition.y, ...siblings.map((node) => node.getPosition().y)) + 52,
        }
      : {
          x: selectedPosition.x + selectedSize.width + (isMindMap ? 72 : 110),
          y: childNodes.length > 0
            ? Math.max(...childNodes.map((node) => node.getPosition().y)) + 52
            : selectedPosition.y,
        });
    const id = createId(isMindMap ? "topic" : "node");
    const architectureParentId = isArchitecture && shape !== "boundary"
      ? dropBoundary?.id ?? (options.position ? undefined : selectedData?.shape === "boundary" ? selected?.id : selectedData?.parentId)
      : undefined;
    graph.startBatch("add");
    const node = graph.addNode(nodeMetadata({
      id,
      label: options.label ?? (isMindMap ? t("diagram.newTopic") : isArchitecture ? architectureNodeLabel(shape, t) : t("diagram.newStep")),
      x: nextPosition.x,
      y: nextPosition.y,
      width: authoredSize.width,
      height: authoredSize.height,
      shape: isMindMap ? "topic" : shape,
      ...(isMindMap && parent?.isNode() ? { parentId: parent.id } : {}),
      ...(architectureParentId ? { parentId: architectureParentId } : {}),
      ...(isArchitecture && options.resourceIcon ? { resourceIcon: options.resourceIcon } : {}),
    }, themeRef.current, document.kind, appearanceRef.current));
    if (architectureParentId) {
      const architectureParent = graph.getCellById(architectureParentId);
      if (architectureParent?.isNode()) architectureParent.addChild(node);
    }
    if (isMindMap && parent?.isNode()) {
      graph.addEdge(edgeMetadata(
        { id: createId("branch"), source: parent.id, target: id },
        document.kind,
        themeRef.current,
        appearanceRef.current,
      ));
    }
    if (isMindMap) {
      const positions = computeDiagramLayout(
        graphToDocument(graph, document.kind, themeRef.current),
        requestedSibling && selected?.isNode()
          ? { insertedNodeId: id, insertAfterNodeId: selected.id }
          : {},
      );
      for (const graphNode of graph.getNodes()) {
        const position = positions[graphNode.id];
        if (position) graphNode.position(position.x, position.y);
      }
    }
    graph.stopBatch("add");
    graph.cleanSelection();
    graph.select(node);
    setSelectedNodeId(id);
    setSelectedNodeLabel(node.getData<NodeData>().label);
    setSelectedEdgeId(null);
    setSelectedEdgeLabel("");
    setHasSelection(true);
    setDirty(true);
    setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    if (options.beginEditing) {
      requestAnimationFrame(() => beginNodeEdit(node));
    }
  }, [beginNodeEdit, document, readOnly, selectedNodeId, t]);

  const placeArchitectureItem = useCallback((
    item: ArchitectureLibraryItem,
    position: { x: number; y: number },
  ) => {
    addNode(item.shape, {
      label: t(item.labelKey),
      position,
      resourceIcon: architectureResourceIcon(item),
    });
    setPendingArchitectureItem(null);
    requestAnimationFrame(() => containerRef.current?.focus({ preventScroll: true }));
  }, [addNode, t]);

  const handleArchitectureDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (document?.kind !== "architecture" || readOnly || !Array.from(event.dataTransfer.types).includes(ARCHITECTURE_LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleArchitectureDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (document?.kind !== "architecture" || readOnly) return;
    const resourceIcon = event.dataTransfer.getData(ARCHITECTURE_LIBRARY_DRAG_TYPE) as ArchitectureResourceIcon;
    const item = ARCHITECTURE_LIBRARY_ITEMS.find((candidate) => architectureResourceIcon(candidate) === resourceIcon);
    const graph = graphRef.current;
    if (!item || !graph) return;
    event.preventDefault();
    event.stopPropagation();
    placeArchitectureItem(item, graph.clientToLocal({ x: event.clientX, y: event.clientY }));
  };

  const handlePendingArchitecturePlacement = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pendingArchitectureItem || document?.kind !== "architecture" || readOnly || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".x6-node, .x6-edge")) return;
    const graph = graphRef.current;
    if (!graph) return;
    event.preventDefault();
    event.stopPropagation();
    placeArchitectureItem(pendingArchitectureItem, graph.clientToLocal({ x: event.clientX, y: event.clientY }));
  };

  insertNodeRef.current = (relation, baseNodeId) => {
    addNode("topic", { relation, baseNodeId, beginEditing: true });
  };

  const updateSelectedLabel = (label: string) => {
    setSelectedNodeLabel(label);
    const node = selectedNodeId ? graphRef.current?.getCellById(selectedNodeId) : null;
    if (!node?.isNode() || readOnly) return;
    node.setData({ ...node.getData<NodeData>(), label });
    refreshNodeLabel(node, label);
  };

  const updateSelectedEdgeLabel = (label: string) => {
    setSelectedEdgeLabel(label);
    const edge = selectedEdgeId ? graphRef.current?.getCellById(selectedEdgeId) : null;
    if (!edge?.isEdge() || readOnly) return;
    if (!label) {
      edge.setLabels([]);
      return;
    }
    const palette = resolveDiagramPalette(themeRef.current, appearanceRef.current);
    edge.setLabels([diagramEdgeLabel(label, palette, document?.kind ?? "flowchart")]);
  };

  const createConnectedFlowNode = (shape: DiagramNodeShape) => {
    const graph = graphRef.current;
    const pending = flowQuickCreate;
    if (!graph || !document || document.kind !== "flowchart" || !pending || readOnly) return;
    if (!graph.getCellById(pending.sourceNodeId)?.isNode()) {
      dismissFlowQuickCreate();
      return;
    }
    const size = compactFlowchartNodeSize(shape);
    const id = createId("node");
    const label = shape === "decision"
      ? t("diagram.newDecision")
      : shape === "terminator"
        ? t("diagram.newTerminator")
        : t("diagram.newStep");
    const draftEdge = graph.getCellById(pending.draftEdgeId);
    if (draftEdge?.isEdge()) removeFlowDraftEdge(graph, draftEdge, pending.restoreHistory);
    if (pending.restoreHistory) graph.enableHistory();
    flowQuickCreateRef.current = null;
    setFlowQuickCreate(null);
    graph.startBatch("quick-create");
    const node = graph.addNode(nodeMetadata({
      id,
      label,
      x: Math.round(Math.max(0, pending.x - size.width / 2)),
      y: Math.round(Math.max(0, pending.y - size.height / 2)),
      width: size.width,
      height: size.height,
      shape,
    }, themeRef.current, document.kind, appearanceRef.current));
    graph.addEdge({
      ...edgeMetadata(
        { id: createId("edge"), source: pending.sourceNodeId, target: id },
        document.kind,
        themeRef.current,
        appearanceRef.current,
      ),
      source: { cell: pending.sourceNodeId, ...(pending.sourcePort ? { port: pending.sourcePort } : {}) },
      target: { cell: id, ...(oppositeFlowPort(pending.sourcePort) ? { port: oppositeFlowPort(pending.sourcePort) } : {}) },
    });
    graph.stopBatch("quick-create");
    graph.cleanSelection();
    graph.select(node);
    setSelectedNodeId(id);
    setSelectedNodeLabel(label);
    setHasSelection(true);
    setDirty(true);
    setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    requestAnimationFrame(() => beginNodeEdit(node));
  };

  const removeSelected = () => {
    const graph = graphRef.current;
    if (!graph || readOnly) return;
    if (!removeGraphSelection(graph)) return;
    setSelectedNodeId(null);
    setSelectedNodeLabel("");
    setSelectedEdgeId(null);
    setSelectedEdgeLabel("");
    setHasSelection(false);
    if (document) {
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
    }
    setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
  };

  const runHistoryAction = (action: "undo" | "redo") => {
    const graph = graphRef.current;
    if (!graph || readOnly) return;
    if (action === "undo") graph.undo();
    else graph.redo();
    applyGraphPalette(
      graph,
      themeRef.current,
      document?.kind ?? "flowchart",
      appearanceRef.current,
    );
    graph.cleanSelection();
    setSelectedNodeId(null);
    setSelectedNodeLabel("");
    setSelectedEdgeId(null);
    setSelectedEdgeLabel("");
    setHasSelection(false);
    setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    if (document) {
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
    }
  };

  const applyAutoLayout = () => {
    const graph = graphRef.current;
    if (!graph || !document || readOnly || graph.getNodes().length === 0) return;
    const layout = computeDiagramLayoutResult(graphToDocument(graph, document.kind, themeRef.current));
    graph.startBatch("layout");
    let changed = false;
    for (const nodeId of layout.nodeOrder) {
      const node = graph.getCellById(nodeId);
      const geometry = layout.nodes[nodeId];
      if (!node?.isNode()) continue;
      if (!geometry) continue;
      const currentPosition = node.getPosition();
      const currentSize = node.getSize();
      if (currentPosition.x !== geometry.x || currentPosition.y !== geometry.y) {
        changed = true;
        node.position(geometry.x, geometry.y);
      }
      if (currentSize.width !== geometry.width || currentSize.height !== geometry.height) {
        changed = true;
        node.resize(geometry.width, geometry.height);
      }
    }
    graph.stopBatch("layout");
    fitDiagramContent(graph, document, containerRef.current, 40, layout.viewport);
    if (changed) {
      setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      ));
      setHistoryState({ undo: graph.canUndo(), redo: graph.canRedo() });
    }
  };

  const applyTheme = (nextTheme: DiagramTheme) => {
    const graph = graphRef.current;
    if (nextTheme === theme) return;
    themeRef.current = nextTheme;
    setTheme(nextTheme);
    if (!graph || readOnly) return;
    applyGraphPalette(
      graph,
      nextTheme,
      document?.kind ?? "flowchart",
      appearanceRef.current,
    );
    setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
      titleRef.current,
      graphToDocument(graph, document?.kind ?? "flowchart", nextTheme),
    ));
  };

  const exportDiagram = (format: "png" | "svg") => {
    const graph = graphRef.current;
    if (!graph || !document) return;
    const fallbackName = document.kind === "mind-map" ? t("diagram.mindMap") : document.kind === "architecture" ? t("diagram.architecture") : t("diagram.flowchart");
    const fileName = (title.trim() || fallbackName).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
    setSaveError(null);
    try {
      const palette = resolveDiagramPalette(themeRef.current, appearanceRef.current);
      const beforeSerialize = prepareExportSvg(palette.canvas);
      const viewBox = graph.getCellsBBox(graph.getCells()) ?? undefined;
      if (format === "png") {
        graph.exportPNG(fileName, { backgroundColor: palette.canvas, padding: 32, ratio: 2, copyStyles: false, beforeSerialize, viewBox });
      } else {
        graph.exportSVG(fileName, { preserveDimensions: true, copyStyles: false, beforeSerialize, viewBox });
      }
    } catch {
      setSaveError(t("diagram.exportError"));
    }
  };

  const save = async () => {
    const graph = graphRef.current;
    const currentMemo = memoRef.current;
    const editSession = editSessionRef.current;
    if (!graph || !document || !editSession || readOnly || saving) return false;
    if (
      savedSnapshotRef.current === diagramEditorSnapshot(titleRef.current, graphToDocument(graph, document.kind, themeRef.current))
      && !tagsDirty
    ) {
      setDirty(false);
      return true;
    }
    setSaving(true);
    setSaveError(null);
    setSaveFailed(false);
    try {
      const nextDocument = graphToDocument(graph, document.kind, themeRef.current);
      const markdown = serializeDiagramDocument(nextDocument);
      const nextTitle = titleRef.current;
      const nextTags = parseTagsText(tagsRef.current);
      const nextSnapshot = diagramEditorSnapshot(nextTitle, nextDocument);
      const result = await repository.updateMemo(currentMemo, {
        expectedRevision: currentMemo.revision,
        expectedContentHash: currentMemo.contentHash,
        editSessionId: editSession.id,
        title: nextTitle,
        contentJson: markdownToDoc(diagramFallbackMarkdown(nextDocument)),
        contentMarkdown: markdown,
        tags: nextTags,
      });
      memoRef.current = result.memo;
      savedSnapshotRef.current = nextSnapshot;
      const currentSnapshot = diagramEditorSnapshot(
        titleRef.current,
        graphToDocument(graph, document.kind, themeRef.current),
      );
      const hasNewChanges = currentSnapshot !== nextSnapshot;
      const hasNewTagChanges = parseTagsText(tagsRef.current).join("\u0000") !== result.memo.tags.join("\u0000");
      setDirty(hasNewChanges);
      setTagsDirty(hasNewTagChanges);
      if (!hasNewTagChanges) {
        const savedTagsText = result.memo.tags.join(", ");
        tagsRef.current = savedTagsText;
        setTagsText(savedTagsText);
      }
      if (!hasNewChanges && !hasNewTagChanges) {
        graph.cleanHistory();
        setHistoryState({ undo: false, redo: false });
        await onSaved(result.memo);
      }
      return true;
    } catch (error) {
      setSaveFailed(true);
      setSaveError(error instanceof Error ? error.message : t("diagram.saveError"));
      return false;
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = () => { void save(); };

  useEffect(() => {
    if (readOnly || !editorDirty || nodeEditor !== null || saving || !editSessionReady || saveFailed) return;
    const timer = window.setTimeout(() => saveRef.current(), EDITOR_LOCAL_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dirtyVersion, editSessionReady, editorDirty, nodeEditor, readOnly, saveFailed, saving]);

  const handleCopyMemoId = async () => {
    if (isLocalMemoId(memo.id)) return;
    const copied = await copyTextToClipboard(memo.id);
    setMemoIdCopyNotice(copied ? "copied" : "error");
    if (memoIdCopyTimerRef.current !== null) window.clearTimeout(memoIdCopyTimerRef.current);
    memoIdCopyTimerRef.current = window.setTimeout(() => {
      setMemoIdCopyNotice(null);
      memoIdCopyTimerRef.current = null;
    }, copied ? 2200 : 3000);
  };

  const handleSaveAsTemplate = () => {
    if (!document || readOnly) return;
    const name = window.prompt(t("templates.templateNamePrompt"), titleRef.current);
    if (!name?.trim()) return;
    const currentDocument = graphRef.current
      ? graphToDocument(graphRef.current, document.kind, themeRef.current)
      : document;
    const markdown = serializeDiagramDocument(currentDocument);
    void onSaveAsTemplate({
      ...memoRef.current,
      title: titleRef.current,
      contentJson: markdownToDoc(diagramFallbackMarkdown(currentDocument)),
      contentMarkdown: markdown,
    }, name.trim());
  };

  const handleNotebookChange = (notebookId: string) => {
    const currentMemo = memoRef.current;
    if (readOnly || notebookUpdatePending || notebookId === currentMemo.notebookId) {
      setMobileNotebookSheetOpen(false);
      return;
    }

    setNotebookUpdatePending(true);
    setSaveError(null);
    void (async () => {
      if (editorDirty && !(await save())) return;
      const sourceMemo = memoRef.current;
      await repository.moveMemos({ memoIds: [sourceMemo.id], notebookId });
      const { memo: movedMemo } = await repository.getMemo(sourceMemo.id);
      memoRef.current = movedMemo;
      await onSaved(movedMemo);
    })()
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : t("diagram.saveError"));
      })
      .finally(() => {
        setNotebookUpdatePending(false);
        setMobileNotebookSheetOpen(false);
      });
  };

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!searchOpen || !query) return [];
    return (graphRef.current?.getNodes() ?? []).filter((node) =>
      (node.getData<NodeData>()?.label ?? "").toLocaleLowerCase().includes(query),
    );
  }, [dirtyVersion, memo.id, searchOpen, searchQuery]);

  const selectSearchMatch = useCallback((index: number) => {
    const graph = graphRef.current;
    const node = searchMatches[index];
    if (!graph || !node) return;
    graph.cleanSelection();
    graph.select(node);
    graph.centerCell(node);
    setSelectedNodeId(node.id);
    setSelectedNodeLabel(node.getData<NodeData>()?.label ?? "");
  }, [searchMatches]);

  const moveSearchMatch = useCallback((direction: -1 | 1) => {
    if (searchMatches.length === 0) return;
    setSearchIndex((current) => {
      const next = (current + direction + searchMatches.length) % searchMatches.length;
      selectSearchMatch(next);
      return next;
    });
  }, [searchMatches.length, selectSearchMatch]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    setSearchIndex(0);
    if (searchMatches[0]) selectSearchMatch(0);
  }, [searchMatches, selectSearchMatch]);

  if (!document) return null;
  const kindLabel = document.kind === "mind-map" ? t("diagram.mindMap") : document.kind === "architecture" ? t("diagram.architecture") : t("diagram.flowchart");
  const updatedLabel = formatDateTime(memo.updatedAt);
  const currentMarkdown = historyOpen && dirty
    ? serializeDiagramDocument(graphRef.current ? graphToDocument(graphRef.current, document.kind, themeRef.current) : document)
    : memo.contentMarkdown;
  const saveStatus = saveError ? "error" : saving || notebookUpdatePending ? "saving" : editorDirty ? "unsaved" : "saved";
  const saveLabel = saveStatus === "error"
    ? t("editor.saveState.error")
    : saveStatus === "saving"
      ? t("editor.saveState.saving")
      : saveStatus === "unsaved"
        ? t("editor.saveState.unsaved")
        : t("editor.saveState.saved");
  const saveStatusClassName = saveStatus === "error"
    ? "bg-rose-50 text-rose-700"
    : saveStatus === "saved"
      ? "bg-slate-100 text-slate-500"
      : "bg-emerald-50 text-emerald-700";

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className={MEMO_EDITOR_TOP_ROW_CLASS_NAME}>
          <MemoEditorTopRowLeading
            desktopFocusMode={desktopFocusMode}
            updatedLabel={updatedLabel}
            onToggleDesktopFocusMode={onToggleDesktopFocusMode}
            mobileBackButton={(
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="lg:hidden" size="icon" variant="ghost" aria-label={t("diagram.back")} onClick={() => editorDirty ? setConfirmDiscardOpen(true) : onBackToList()}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("diagram.back")}</TooltipContent>
              </Tooltip>
            )}
          />

          <div className="flex shrink-0 items-center gap-1">
            <m.span
              key={`mobile-${saveStatus}`}
              className={cn(
              "inline-flex max-w-[5.5rem] truncate rounded-full px-2 py-1 text-[11px] font-medium sm:hidden",
              saveStatusClassName,
            )}
              role="status"
              aria-live="polite"
              aria-label={saveError ? `${saveLabel}. ${saveError}` : undefined}
              {...statusSettleMotion}
            >
              {saveLabel}
            </m.span>
            <m.span
              key={saveStatus}
              className={cn(
              "hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium sm:inline-flex",
              saveStatusClassName,
            )}
              role="status"
              aria-live="polite"
              aria-label={saveError ? `${saveLabel}. ${saveError}` : undefined}
              {...statusSettleMotion}
            >
              {saveStatus === "error" ? (
                <CircleAlert className="h-3 w-3" aria-hidden="true" />
              ) : saveStatus === "saving" ? (
                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : saveStatus === "unsaved" ? (
                <Pencil className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Check className="h-3 w-3" aria-hidden="true" />
              )}
              {saveLabel}
            </m.span>
            {!readOnly && saveFailed && (
              <Button variant="soft" size="sm" disabled={saving || !editSessionReady} onClick={() => void save()}>
                <RefreshCw className="h-4 w-4" />
                {t("diagram.retrySave")}
              </Button>
            )}
            <MemoEditorHeaderActions
              companionDiscoveryHub={companionDiscoveryHub}
              moreMenuClassName="w-48"
              onOpenExecutionCenter={onOpenExecutionCenter}
              onSearch={openSearch}
              moreMenuItems={(
                <>
                <DropdownMenuItem disabled={isLocalMemoId(memo.id)} onClick={() => void handleCopyMemoId()}>
                  <Copy className="h-4 w-4 text-slate-500" />
                  {t(isLocalMemoId(memo.id) ? "editor.copyNoteIdAfterSync" : "editor.copyNoteId")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                  <HistoryIcon className="h-4 w-4 text-slate-500" />
                  {t("editor.versionHistory")}
                </DropdownMenuItem>
                {!readOnly && (
                  <DropdownMenuItem disabled={isLocalMemoId(memo.id)} onClick={() => setShareOpen(true)}>
                    <Link2 className="h-4 w-4 text-slate-500" />
                    {t(isLocalMemoId(memo.id) ? "sharing.afterSync" : "sharing.action")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportDiagram("png")}>
                  <FileImage className="h-4 w-4 text-slate-500" />
                  {t("diagram.exportPng")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportDiagram("svg")}>
                  <FileCode2 className="h-4 w-4 text-slate-500" />
                  {t("diagram.exportSvg")}
                </DropdownMenuItem>
                {!readOnly && (
                  <DropdownMenuItem onClick={handleSaveAsTemplate}>
                    <Pencil className="h-4 w-4 text-slate-500" />
                    {t("templates.saveAsTemplate")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {readOnly ? (
                  <>
                    <DropdownMenuItem onClick={() => void onRestored(memo.id)}>
                      <RotateCcw className="h-4 w-4 text-slate-500" />
                      {t("editor.restoreMemo")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onClick={() => void onPermanentDeleted(memo.id)}>
                      <Trash2 className="h-4 w-4" />
                      {t("editor.deleteForever")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onClick={() => void onDeleted(memo.id)}>
                    <Trash2 className="h-4 w-4" />
                    {t("editor.deleteMemo")}
                  </DropdownMenuItem>
                )}
                </>
              )}
            />
          </div>
        </div>

        <div className={MEMO_EDITOR_TITLE_REGION_CLASS_NAME}>
          <div className="min-w-0">
            <MemoTitleInput
              value={title}
              readOnly={readOnly}
              placeholder={kindLabel}
              ariaLabel={t("diagram.title")}
              onValueChange={(nextTitle) => {
                titleRef.current = nextTitle;
                setTitle(nextTitle);
                setDirtyVersion((current) => current + 1);
                const graph = graphRef.current;
                if (graph) {
                  setDirty(savedSnapshotRef.current !== diagramEditorSnapshot(
                    nextTitle,
                    graphToDocument(graph, document.kind, themeRef.current),
                  ));
                }
              }}
            />
          </div>
          <MemoEditorMetadataRow
            contentMarkdown={memo.contentMarkdown}
            disabled={readOnly}
            mobileNotebookPickerOpen={mobileNotebookSheetOpen}
            notebookOptions={notebookOptions}
            notebookUpdatePending={notebookUpdatePending || saving}
            repository={repository}
            selectedNotebookId={memoRef.current.notebookId}
            tagsText={tagsText}
            title={title}
            onMobileNotebookPickerOpenChange={setMobileNotebookSheetOpen}
            onNotebookChange={handleNotebookChange}
            onTagsChange={(nextTagsText) => {
              tagsRef.current = nextTagsText;
              setTagsText(nextTagsText);
              setTagsDirty(true);
              setDirtyVersion((current) => current + 1);
            }}
          />
        </div>
        {searchOpen ? (
          <EditorNoteSearchBar
            inputRef={searchInputRef}
            query={searchQuery}
            replacement=""
            replaceOpen={false}
            readOnly
            matchCount={searchMatches.length}
            matchLabel={searchQuery.trim() ? `${searchMatches.length > 0 ? searchIndex + 1 : 0}/${searchMatches.length}` : ""}
            onQueryChange={setSearchQuery}
            onReplacementChange={() => undefined}
            onMoveMatch={moveSearchMatch}
            onReplaceAll={() => undefined}
            onClose={() => setSearchOpen(false)}
          />
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <DiagramToolbar
          appearance={resolvedTheme}
          canRedo={historyState.redo}
          canUndo={historyState.undo}
          hasSelection={hasSelection}
          leading={!readOnly ? (
            document.kind === "mind-map" ? (
              <DiagramInsertMenu
                items={[
                  { icon: GitBranch, label: t("diagram.addTopic"), onSelect: () => addNode("topic", { relation: "child" }) },
                  { icon: ListTree, label: t("diagram.addSiblingTopic"), onSelect: () => addNode("topic", { relation: "sibling" }) },
                ]}
              />
            ) : document.kind === "architecture" ? (
              <ArchitectureComponentLibrary
                onPick={setPendingArchitectureItem}
                t={t}
              />
            ) : (
              <DiagramInsertMenu
                items={[
                  { icon: Box, label: t("diagram.addStep"), onSelect: () => addNode("process") },
                  { icon: Diamond, label: t("diagram.addDecision"), onSelect: () => addNode("decision") },
                  { icon: Circle, label: t("diagram.addTerminator"), onSelect: () => addNode("terminator") },
                ]}
              />
            )
          ) : undefined}
          onAutoLayout={applyAutoLayout}
          onDeleteSelection={removeSelected}
          onExport={exportDiagram}
          onRedo={() => runHistoryAction("redo")}
          onThemeChange={applyTheme}
          onUndo={() => runHistoryAction("undo")}
          zoomPercent={zoomPercent}
          onRead={document.kind === "flowchart" ? () => { if (graphRef.current) readFlowchart(graphRef.current, document, containerRef.current); } : undefined}
          onFit={() => { const graph = graphRef.current; if (graph) fitDiagramContent(graph, document, containerRef.current); }}
          onResetZoom={() => {
            const graph = graphRef.current;
            if (!graph) return;
            graph.zoomTo(1);
            const bounds = graph.getCellsBBox(graph.getNodes().filter((node) => node.isVisible()));
            if (bounds) graph.centerPoint(bounds.center.x, bounds.center.y);
          }}
          onZoomIn={() => graphRef.current?.zoom(0.1)}
          onZoomOut={() => graphRef.current?.zoom(-0.1)}
          readOnly={readOnly}
          selectionEditor={(
            <>
              {selectedNodeId && !readOnly && (
                <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-sm">
                  <span className="shrink-0 text-xs font-medium text-slate-500">{t("diagram.nodeText")}</span>
                  <Input value={selectedNodeLabel} maxLength={120} onChange={(event) => updateSelectedLabel(event.target.value)} />
                </div>
              )}
              {selectedEdgeId && !readOnly && (
                <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-sm">
                  <span className="shrink-0 text-xs font-medium text-slate-500">{t("diagram.edgeText")}</span>
                  <Input value={selectedEdgeLabel} maxLength={80} onChange={(event) => updateSelectedEdgeLabel(event.target.value)} />
                </div>
              )}
            </>
          )}
          theme={theme}
        />
        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            className={cn("edgeever-diagram-canvas absolute inset-0 touch-none outline-none", pendingArchitectureItem && "cursor-crosshair")}
            data-architecture-placement={pendingArchitectureItem ? "active" : undefined}
            data-diagram-appearance={resolvedTheme}
            data-diagram-kind={document.kind}
            data-diagram-theme={theme}
            tabIndex={0}
            aria-label={t("diagram.canvas", { type: kindLabel })}
            onDragOver={handleArchitectureDragOver}
            onDrop={handleArchitectureDrop}
            onPointerDownCapture={handlePendingArchitecturePlacement}
          />
          {pendingArchitectureItem ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm" role="status">
              {t("diagram.placeShapeHint", { shape: t(pendingArchitectureItem.labelKey) })}
            </div>
          ) : null}
          {flowQuickCreate ? (
            <div
              className="absolute z-30 w-[330px] max-w-[calc(100%-24px)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
              style={{ left: flowQuickCreate.left, top: flowQuickCreate.top }}
              role="dialog"
              aria-label={t("diagram.quickCreateTitle")}
              onKeyDown={(event) => {
                const shape = ({ "1": "process", "2": "decision", "3": "terminator" } as const)[event.key as "1" | "2" | "3"];
                if (shape) {
                  event.preventDefault();
                  createConnectedFlowNode(shape);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  dismissFlowQuickCreate();
                  containerRef.current?.focus({ preventScroll: true });
                }
              }}
            >
              <div className="whitespace-nowrap px-1.5 pb-1.5 text-xs font-medium text-slate-500">{t("diagram.quickCreateTitle")}</div>
              <div className="grid grid-cols-3 gap-1">
                <Button autoFocus className="relative h-16 min-w-0 flex-col gap-1 whitespace-nowrap px-2 text-xs" variant="ghost" aria-label={t("diagram.addStep")} onClick={() => createConnectedFlowNode("process")}>
                  <kbd className="absolute right-1.5 top-1 text-[10px] font-normal text-slate-400">1</kbd>
                  <Box className="h-6 w-6" />
                  {t("diagram.addStep")}
                </Button>
                <Button className="relative h-16 min-w-0 flex-col gap-1 whitespace-nowrap px-2 text-xs" variant="ghost" aria-label={t("diagram.addDecision")} onClick={() => createConnectedFlowNode("decision")}>
                  <kbd className="absolute right-1.5 top-1 text-[10px] font-normal text-slate-400">2</kbd>
                  <Diamond className="h-6 w-6" />
                  {t("diagram.addDecision")}
                </Button>
                <Button className="relative h-16 min-w-0 flex-col gap-1 whitespace-nowrap px-2 text-xs" variant="ghost" aria-label={t("diagram.addTerminator")} onClick={() => createConnectedFlowNode("terminator")}>
                  <kbd className="absolute right-1.5 top-1 text-[10px] font-normal text-slate-400">3</kbd>
                  <Circle className="h-6 w-6" />
                  {t("diagram.addTerminator")}
                </Button>
              </div>
              <div className="whitespace-nowrap px-1.5 pt-1 text-[11px] text-slate-400">{t("diagram.quickCreateShortcuts")}</div>
            </div>
          ) : null}
          {nodeEditor ? (
            <input
              autoFocus
              className="absolute z-20 px-3 text-center font-medium outline-none"
              style={{
                left: nodeEditor.left,
                top: nodeEditor.top,
                width: nodeEditor.width,
                height: nodeEditor.height,
                fontSize: nodeEditor.fontSize,
                color: nodeEditor.color,
                background: nodeEditor.background,
                border: `2px solid ${nodeEditor.borderColor}`,
                borderRadius: nodeEditor.shape === "terminator" ? 999 : 11,
                clipPath: nodeEditor.shape === "decision" ? "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" : undefined,
              }}
              value={nodeEditor.value}
              maxLength={120}
              aria-label={t("diagram.editNode")}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const nextEditor = { ...nodeEditor, value: event.target.value };
                nodeEditorRef.current = nextEditor;
                setNodeEditor(nextEditor);
              }}
              onBlur={() => { finishNodeEdit(); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  finishNodeEdit(true);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const editedNode = finishNodeEdit();
                  if (document.kind === "mind-map" && editedNode) {
                    requestAnimationFrame(() => insertNodeRef.current("sibling", editedNode.id));
                  }
                  return;
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  const editedNode = finishNodeEdit();
                  if (editedNode) {
                    requestAnimationFrame(() => {
                      if (document.kind === "mind-map") insertNodeRef.current("child", editedNode.id);
                      else if (document.kind === "flowchart") openFlowQuickCreateRef.current(editedNode);
                    });
                  }
                }
              }}
            />
          ) : null}
        </div>
      </div>
        {confirmDiscardOpen ? (
          <AppConfirmDialog
            title={t("diagram.discardTitle")}
            description={t("diagram.discardDescription")}
            confirmLabel={t("diagram.discard")}
            tone="danger"
            onCancel={() => setConfirmDiscardOpen(false)}
            onConfirm={onBackToList}
          />
        ) : null}
        {historyOpen ? (
          <RevisionHistoryDialog
            memo={memo}
            repository={repository}
            currentMarkdown={currentMarkdown}
            onClose={() => setHistoryOpen(false)}
            onRestored={async (restoredMemo) => {
              setHistoryOpen(false);
              await onSaved(restoredMemo);
            }}
          />
        ) : null}
        <ShareMemoDialog memoId={memo.id} open={shareOpen} onOpenChange={setShareOpen} />
        {memoIdCopyNotice ? (
          <ClipboardCopyNotice status={memoIdCopyNotice}>
            {t(memoIdCopyNotice === "copied" ? "editor.noteIdCopied" : "editor.noteIdCopyFailed", { id: memo.id })}
          </ClipboardCopyNotice>
        ) : null}
      </div>
    </TooltipProvider>
  );
};

export default DiagramEditorPane;
