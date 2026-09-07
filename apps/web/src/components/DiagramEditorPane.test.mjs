import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DiagramEditorPane.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(new URL("./DiagramToolbar.tsx", import.meta.url), "utf8");
const topRowLeadingSource = readFileSync(new URL("./MemoEditorTopRowLeading.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");

describe("diagram editor keyboard workflow", () => {
  test("supports direct node editing without routing keystrokes through the side panel", () => {
    expect(source).toContain('graph.on("node:dblclick"');
    expect(source).toContain('aria-label={t("diagram.editNode")}');
    expect(source).toContain('event.key === "Escape"');
  });

  test("keeps the standard mind-map sibling and child shortcuts", () => {
    expect(source).toContain('graph.bindKey("enter"');
    expect(source).toContain('insertNodeRef.current("sibling"');
    expect(source).toContain('graph.bindKey("tab"');
    expect(source).toContain('insertNodeRef.current("child"');
    expect(source).toContain("graph.cleanSelection();\n    graph.select(node);");
  });

  test("supports a complete flowchart keyboard workflow", () => {
    expect(source).toContain('openFlowQuickCreateRef.current = openFlowQuickCreate');
    expect(source).toContain('graph.bindKey("tab"');
    expect(source).toContain('graph.bindKey(["meta+d", "ctrl+d"]');
    expect(source).toContain('graph.startBatch("duplicate")');
    expect(source).toContain('graph.bindKey(["up", "down", "left", "right"');
    expect(source).toContain('graph.bindKey("0"');
    expect(source).toContain('graph.bindKey("1"');
    expect(source).toContain('"1": "process", "2": "decision", "3": "terminator"');
    expect(source).toContain('t("diagram.quickCreateShortcuts")');
  });

  test("continues from text editing into the flowchart node picker", () => {
    expect(source).toContain('else if (document.kind === "flowchart") openFlowQuickCreateRef.current(editedNode)');
  });
});

describe("diagram editor canvas surface", () => {
  test("uses the common note header and capability-aware more menu", () => {
    expect(source).toContain("<MemoEditorTopRowLeading");
    expect(topRowLeadingSource).toContain('<span className="hidden truncate text-xs text-slate-400 sm:inline">{updatedLabel}</span>');
    expect(source).not.toContain('t("editor.updatedAt", { time: updatedLabel })');
    expect(source).toContain("onToggleDesktopFocusMode");
    expect(source).not.toContain("onOpenPreviousMemo");
    expect(source).not.toContain("onOpenNextMemo");
    expect(source).toContain("<MemoEditorHeaderActions");
    expect(source).toContain("onSearch={openSearch}");
    expect(source).toContain("<EditorNoteSearchBar");
    expect(source).toContain('t("editor.versionHistory")');
    expect(source).toContain('"sharing.afterSync" : "sharing.action"');
    expect(source).toContain('t("templates.saveAsTemplate")');
    expect(source).toContain("<RevisionHistoryDialog");
    expect(source).toContain("<ShareMemoDialog");
    expect(source).not.toContain('>{kindLabel}</div>');
    expect(source).toContain('placeholder={kindLabel}');
    expect(source).toContain('aria-label={t("diagram.canvas", { type: kindLabel })}');
  });

  test("autosaves diagram changes without a persistent save button", () => {
    expect(source).toContain("EDITOR_LOCAL_SAVE_DELAY_MS");
    expect(source).toContain("window.setTimeout(() => saveRef.current(), EDITOR_LOCAL_SAVE_DELAY_MS)");
    expect(source).toContain("nodeEditor !== null");
    expect(source).toContain("[dirtyVersion, editSessionReady, editorDirty, nodeEditor, readOnly, saveFailed, saving]");
    expect(source).toContain("tags: nextTags");
    expect(source).toContain("setTagsDirty(hasNewTagChanges)");
    expect(source).toContain("!readOnly && saveFailed");
    expect(source).toContain('t("diagram.retrySave")');
    expect(source).not.toContain('<Save className="h-4 w-4" />');
    expect(source).toContain('t("editor.saveState.unsaved")');
    expect(source).toContain('"bg-slate-100 text-slate-500"');
    expect(source).toContain("{...statusSettleMotion}");
    expect(source).toContain('saveStatus === "unsaved" ? (');
    expect(source).not.toContain('t("diagram.saved")');
  });

  test("uses a clean grid-free canvas for both diagram types", () => {
    expect(source).toContain("grid: false");
    expect(source).toContain("graph.clearGrid();");
    expect(source).not.toContain("diagramGrid");
    expect(source).not.toContain("graph.drawGrid");
  });

  test("uses restrained rounded edges and fits the complete diagram without clipping", () => {
    expect(source).toContain('connector: { name: kind === "mind-map" ? "smooth" : "rounded"');
    expect(source).toContain('name: "manhattan"');
    expect(source).toContain("maxScale: policy.maxScale");
    expect(source).not.toContain("minScale: policy.minScale");
    expect(source).toContain("graph.centerContent()");
    expect(source).not.toContain("desiredLeft - contentLeft");
    expect(source).toContain("getDiagramLayoutViewport(document.kind)");
    expect(source).toContain("fitDiagramContent(graph, document, containerRef.current);");
  });

  test("labels auto layout directly instead of relying on an ambiguous icon", () => {
    expect(toolbarSource).toContain('<WandSparkles className="h-4 w-4" />');
    expect(toolbarSource).toContain('<span>{t("diagram.autoLayout")}</span>');
    expect(toolbarSource).toContain('<TooltipContent>{t("diagram.autoLayoutTooltip")}</TooltipContent>');
    expect(toolbarSource).not.toContain('<Button size="icon" variant="ghost" aria-label={t("diagram.autoLayout")}');
  });

  test("exposes view recovery separately from document layout", () => {
    expect(toolbarSource).toContain("onFit");
    expect(toolbarSource).toContain('t("diagram.fit")');
    expect(source).toContain("onFit={() =>");
    expect(source).toContain("fitDiagramContent(graph, document, containerRef.current, 40, layout.viewport);");
  });

  test("delegates every diagram kind to one shared toolbar shell", () => {
    expect(source).toContain("<DiagramToolbar");
    expect(source).toContain("leading={!readOnly ? (");
    expect(toolbarSource).toContain('role="toolbar"');
    expect(toolbarSource).toContain("{leading ? <>{leading}<MemoEditorToolbarDivider /></> : null}");
    expect(toolbarSource).toContain("{selectionEditor}");
  });

  test("keeps the mind-map canvas flush with the shared toolbar", () => {
    expect(source).not.toContain('t("diagram.branchView")');
    expect(source).not.toContain("MindMapFocusReader");
  });

  test("reuses the architecture shape-library trigger across every diagram kind", () => {
    expect(toolbarSource).toContain("export const DiagramToolbarAddTrigger");
    expect(toolbarSource).toContain("<DropdownMenuTrigger asChild>");
    expect(toolbarSource).toContain('<Button size="sm" variant="soft" onPointerEnter={onPointerEnter}>');
    expect(toolbarSource).toContain('<Boxes className="h-4 w-4" />');
    expect(toolbarSource).toContain('{t("diagram.componentLibrary")}');
    expect(source.match(/<DiagramToolbarAddTrigger onPointerEnter=/g)).toHaveLength(2);
  });

  test("exposes connection handles on flowcharts and architecture components with safe connection rules", () => {
    expect(source).toContain("const hasPorts = isConnectableDiagram(kind) && node.shape !== \"boundary\"");
    expect(source).toContain("const FLOW_PORT_HIT_RADIUS = 14");
    expect(source).toContain("const FLOW_PORT_DOT_RADIUS = 7");
    expect(source).toContain('selector: "hitArea"');
    expect(source).toContain('className: "edgeever-flow-port-hit-area"');
    expect(source).toContain('className: "edgeever-flow-port-dot"');
    expect(source).toContain('pointerEvents: "all"');
    expect(source).toContain('pointerEvents: "none"');
    expect(globalStyles).toContain('[data-diagram-kind="flowchart"] .x6-widget-selection-box-node');
    expect(globalStyles).toContain("pointer-events: none !important");
    expect(source).toContain("allowPort: isConnectableDiagram(document.kind)");
    expect(source).toContain('allowBlank: document.kind === "flowchart"');
    expect(source).toContain("allowNode: false");
    expect(source).toContain("allowLoop: false");
    expect(source).toContain("allowMulti: false");
    expect(source).toContain("sourceCell.id !== targetCell.id");
    expect(source).toContain("data-diagram-kind={document.kind}");
  });

  test("provides architecture components, boundaries, semantic edges, and editable labels", () => {
    expect(source).toContain('document.kind === "architecture"');
    expect(source).not.toContain('onClick={() => addNode("service")}');
    expect(source).toContain('{ shape: "database", icon: Database');
    expect(source).toContain('{ shape: "boundary", icon: Box');
    expect(source).not.toContain('t("diagram.architectureConnectHint")');
    expect(source).not.toContain('t("diagram.connectHint")');
    expect(source).not.toContain("fitArchitectureBoundaries(graph)");
    expect(source).toContain("computeDiagramLayoutResult");
    expect(source).toContain("parent.addChild(node)");
    expect(source).toContain("updateSelectedEdgeLabel");
    expect(source).toContain('t("diagram.edgeText")');
    expect(source).toContain("ARCHITECTURE_NODE_ICONS");
    expect(source).toContain('{ tagName: "path", selector: "architectureIcon" }');
    expect(source).toContain('shape === "external" ? "7 5"');
    expect(globalStyles).toContain('[data-diagram-kind="architecture"] .x6-port-body');
  });

  test("organizes architecture resources in a searchable category library", () => {
    expect(source).toContain("ARCHITECTURE_LIBRARY_CATEGORIES");
    expect(source).toContain('onPointerEnter={() => setOpen(true)}');
    expect(source).toContain('t("diagram.componentSearch")');
    expect(source).toContain('labelKey: "diagram.componentCategoryExperience"');
    expect(source).toContain('labelKey: "diagram.componentCategoryServices"');
    expect(source).toContain('labelKey: "diagram.componentCategoryDatabases"');
    expect(source).toContain('labelKey: "diagram.componentCategoryStorage"');
    expect(source).toContain('labelKey: "diagram.componentCategoryMiddleware"');
    expect(source).toContain('labelKey: "diagram.componentCategoryNetwork"');
    expect(source).toContain('labelKey: "diagram.componentCategorySecurity"');
    expect(source).toContain('labelKey: "diagram.componentCategoryObservability"');
    expect(source).toContain('labelKey: "diagram.componentCategoryExternal"');
    expect(source).toContain("<Collapsible key={category.id} defaultOpen>");
    expect(source).toContain("category.items.filter");
    expect(source).toContain('className="grid grid-cols-7 gap-1 px-1 pb-2"');
    expect(source).toContain('text-xs font-semibold');
    expect(source).not.toContain('{category.items.length}</span>');
    expect(source).toContain('<TooltipContent side="top"');
    expect(source).toContain('aria-label={label}');
    expect(source).toContain('options.label ??');
    expect(source).toContain('resourceIcon: architectureResourceIcon(item)');
    expect(source).toContain('...(data?.resourceIcon ? { resourceIcon: data.resourceIcon } : {})');
    expect(source).toContain('architectureNodeVisuals(node.shape, size, appearance, node.resourceIcon)');
    expect(source).toContain('inferArchitectureResourceIcon(node.label, t)');
    expect(source).toContain('.render({}, null).props.iconNode');
    expect(source).not.toContain('className="line-clamp-2"');
  });

  test("places architecture resources at an explicit canvas position", () => {
    expect(source).toContain('const ARCHITECTURE_LIBRARY_DRAG_TYPE = "application/x-edgeever-architecture-resource"');
    expect(source).toContain('<DropdownMenu modal={false}');
    expect(source).toContain("draggable");
    expect(source).toContain("event.dataTransfer.setData(ARCHITECTURE_LIBRARY_DRAG_TYPE");
    expect(source).toContain("onDragOver={handleArchitectureDragOver}");
    expect(source).toContain("onDrop={handleArchitectureDrop}");
    expect(source).toContain("graph.clientToLocal({ x: event.clientX, y: event.clientY })");
    expect(source).toContain("position: { x: number; y: number }");
    expect(source).toContain("x: options.position.x - authoredSize.width / 2");
    expect(source).toContain("onPick={setPendingArchitectureItem}");
    expect(source).toContain("onPointerDownCapture={handlePendingArchitecturePlacement}");
    expect(source).toContain('t("diagram.placeShapeHint"');
  });

  test("opens every diagram insertion library immediately on pointer hover", () => {
    expect(source).toContain("const DiagramInsertMenu = ({");
    expect(source.match(/onPointerEnter=\{\(\) => setOpen\(true\)\}/g)?.length).toBe(2);
    expect(source).toContain('label: t("diagram.addTopic")');
    expect(source).toContain('label: t("diagram.addSiblingTopic")');
    expect(source).toContain('label: t("diagram.addStep")');
    expect(source).toContain('label: t("diagram.addDecision")');
    expect(source).toContain('label: t("diagram.addTerminator")');
  });

  test("shows connection handles only on selected flowchart nodes", () => {
    expect(globalStyles).toContain('.x6-node.edgeever-flow-node-active .edgeever-flow-port-dot');
    expect(globalStyles).toContain('.x6-port-body:hover .edgeever-flow-port-dot');
    expect(globalStyles).not.toContain('.x6-node.x6-node-selected .x6-port-body');
    expect(source).toContain('graph.on("node:selected"');
    expect(source).toContain('setFlowNodePortsActive(graph, node, true)');
    expect(source).toContain('graph.on("node:unselected"');
    expect(source).toContain('setFlowNodePortsActive(graph, node, false)');
    expect(source).toContain('port.style.setProperty("opacity", active ? "1" : "0", "important")');
    expect(source).toContain('port.style.setProperty("pointer-events", active ? "auto" : "none", "important")');
    expect(source).toContain('port.querySelector<SVGElement>(".edgeever-flow-port-dot") ?? port');
    expect(source).toContain('setOnlyFlowNodePortsActive(graph, node)');
    expect(source).toContain('graph.on("blank:click"');
    expect(source).toContain('setOnlyFlowNodePortsActive(graph);');
    expect(globalStyles).toContain("fill: var(--brand-green) !important");
    expect(globalStyles).toContain("pointer-events: none");
    expect(globalStyles).toContain("pointer-events: auto");
    expect(globalStyles).not.toContain('.edgeever-diagram-canvas[data-diagram-kind="flowchart"] .x6-node:hover .x6-port-body');
  });

  test("turns a connection dropped on blank canvas into a connected-node picker", () => {
    expect(source).toContain('graph.on("edge:connected"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain("const FLOW_QUICK_CREATE_WIDTH = 330");
    expect(source).toContain('w-[330px] max-w-[calc(100%-24px)]');
    expect(source).toContain('min-w-0 flex-col gap-1 whitespace-nowrap px-2 text-xs');
    expect(source).toContain('t("diagram.quickCreateTitle")');
    expect(source).toContain('createConnectedFlowNode("process")');
    expect(source).toContain('createConnectedFlowNode("decision")');
    expect(source).toContain('createConnectedFlowNode("terminator")');
    expect(source).toContain("draftEdgeId: edge.id");
    expect(source).toContain("removeFlowDraftEdge");
    expect(source).toContain('addEventListener("pointerdown", handleFlowPointerDown, true)');
    expect(source).toContain('addEventListener("pointerup", handleFlowPointerUp, true)');
    expect(source).toContain("graph.clientToLocal(clientPoint)");
    expect(source).toContain('graph.startBatch("quick-create")');
  });

  test("keeps the desktop header compact without shrinking mobile controls", () => {
    expect(source).toContain("MEMO_EDITOR_TOP_ROW_CLASS_NAME");
    expect(source).toContain("MEMO_EDITOR_TITLE_REGION_CLASS_NAME");
    expect(toolbarSource).toContain("<MemoEditorToolbarRow");
  });

  test("repaints the graph when the application appearance changes", () => {
    expect(source).toContain("const { resolvedTheme } = useAppearanceTheme();");
    expect(source).toContain("applyGraphPalette(graph, themeRef.current, document.kind, resolvedTheme);");
    expect(source).toContain("data-diagram-appearance={resolvedTheme}");
    expect(source).toContain("<MemoEditorHeaderActions");
  });
});
