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

  test("keeps scroller paper bounds on every node so left-side mind-map branches are not clipped", () => {
    expect(source).toContain("bindDiagramScrollerFit(graph)");
    expect(source).toContain("applyDiagramScrollerFitOptions(");
    expect(source).toContain("ensureDiagramPaperContainsNodes(graph)");
    expect(source).toContain("node.getPosition()");
    expect(source).toContain("node.getSize()");
    expect(source).toContain("scroller?.disableAutoResize()");
    expect(source).toContain("scroller?.enableAutoResize()");
    expect(source).toContain("graph.transform.fitToContent({");
    expect(source).not.toContain("visibleNodes.length !== graph.getNodes().length");
  });

  test("does not let scroller auto-fit flash a detached node while inserting", () => {
    expect(source).toContain("disableAutoResize()");
    expect(source).toContain("enableAutoResize()");
    expect(source).toContain("scroller.updateScroller()");
    const settleHelper = source.slice(
      source.indexOf("const suspendScrollerAutoResize"),
      source.indexOf("const nodeEditorState"),
    );
    expect(settleHelper).not.toContain("graph.centerPoint");
    expect(settleHelper).toContain("anchorAfter.left - anchorBefore.left");
    expect(settleHelper).toContain("anchorAfter.top - anchorBefore.top");
    expect(settleHelper).toContain("scroller.setScrollbarPosition(");
    expect(settleHelper).toContain("requestAnimationFrame(restoreAnchor)");
    expect(source).toContain("SCROLLER_AUTORESIZE_SETTLE_MS");
    expect(source).toContain("graph.localToClient");
    expect(source).toContain("canvasSurfaceRef.current");
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
  test("shows native horizontal and vertical scrollbars for oversized diagrams", () => {
    expect(source).toContain("new Scroller({");
    expect(source).toContain("panning: false");
    expect(source).toContain('className: "edgeever-diagram-scroller"');
    expect(source).toContain('pannable: { enabled: true, eventTypes: ["leftMouseDown", "rightMouseDown"] }');
    expect(source).not.toContain("attachDiagramScroll");
    expect(globalStyles).toContain(".edgeever-diagram-scroller");
    expect(globalStyles).toContain("scrollbar-gutter: stable");
    expect(globalStyles).toContain('data-panning="true"');
    expect(globalStyles).toContain("cursor: grabbing !important");
  });

  test("supports modeless canvas navigation with blank-drag pan and shift rubberband selection", () => {
    expect(source).toContain('modifiers: "shift"');
    expect(source).toContain('multipleSelectionModifiers: ["ctrl", "meta", "shift"]');
    expect(source).toContain("interacting: () => !readOnly && !spacePanActiveRef.current");
    expect(source).toContain('data-space-pan={spacePanActive ? "active" : undefined}');
    expect(source).toContain('data-shift-select={shiftSelectActive ? "active" : undefined}');
    expect(source).toContain('t("diagram.navHintPan")');
    expect(source).toContain('t("diagram.navHintHoldShift")');
    expect(source).toContain('t("diagram.navHintBoxSelect")');
    expect(globalStyles).toContain('data-shift-select="active"');
    expect(globalStyles).toContain("cursor: crosshair");
    expect(source).not.toContain("activeCanvasMode");
    expect(source).not.toContain("data-canvas-mode");
  });

  test("keeps toolbar clean without mode toggles while retaining spacebar pan", () => {
    expect(toolbarSource).not.toContain("canvasMode");
    expect(toolbarSource).not.toContain("onCanvasModeChange");
    expect(source).not.toContain('key === "v" || key === "h"');
    expect(source).toContain('event.code !== "Space"');
    expect(source).toContain("setSpacePanActive(true)");
    expect(source).toContain("setSpacePanActive(false)");
  });

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
    expect(toolbarSource).toContain("DIAGRAM_THEME_GROUPS");
    expect(toolbarSource).toContain("DIAGRAM_STRUCTURE_GROUPS");
    expect(toolbarSource).toContain("diagramThemeSwatches");
    expect(toolbarSource).toContain("<StructureThumb");
    expect(toolbarSource).toContain('t("diagram.structure")');
    expect(toolbarSource).toContain("diagram.structureGroupMap");
    expect(toolbarSource).toContain("structureGroupLabelKey");
    expect(toolbarSource).toContain('structure === "org"');
    expect(toolbarSource).toContain('structure === "timeline"');
    expect(toolbarSource).toContain('structure === "fishbone"');
    expect(toolbarSource).toContain("diagram.themeGroupVivid");
    expect(toolbarSource).toContain('<TooltipContent>{t("diagram.theme")}</TooltipContent>');
    expect(toolbarSource).not.toContain('value="ocean"');
    expect(toolbarSource).not.toContain('value="ink"');
    expect(source).toContain("Graph.registerConnector(MIND_MAP_CONNECTOR_NAME, mindMapConnector, true)");
    expect(source).toContain("name: MIND_MAP_CONNECTOR_NAME, args: { sourceWidth: mindEdge?.sourceWidth, targetWidth: mindEdge?.targetWidth, structure }");
    expect(source).toContain('{ fill: "none" }');
    expect(source).toContain('if (kind !== "mind-map") edge.attr("line/fill", "none")');
    expect(source).toContain("FLOWCHART_EDGE_ROUTER");
    expect(source).toContain("applyFlowchartEdgePorts(graph)");
    expect(source).toContain("flowchartEdgeIsStraight");
    expect(source).toContain('showTheme={document.kind !== "architecture"}');
    expect(source).toContain('themeCatalog={document.kind === "flowchart" ? "flowchart" : "mind-map"}');
    expect(toolbarSource).toContain("showTheme = true");
    expect(toolbarSource).toContain("themeCatalog = \"mind-map\"");
    expect(toolbarSource).toContain("FLOWCHART_THEME_GROUPS");
    expect(toolbarSource).toContain("flowchartThemeSwatches");
    expect(source).toContain("maxScale: policy.maxScale");
    expect(source).not.toContain("minScale: policy.minScale");
    expect(source).toContain("centerDiagramContent(graph)");
    expect(source).toContain("scroller.centerContent()");
    expect(source).not.toContain("desiredLeft - contentLeft");
    expect(source).not.toContain("visibleNodes.length !== graph.getNodes().length");
    expect(source).toContain("bindDiagramScrollerFit(graph)");
    expect(source).toContain("applyDiagramScrollerFitOptions(");
    expect(source).toContain("diagramNodeBounds(graph)");
    expect(source).toContain("graph.scale().sx < policy.minScale");
    expect(source).toContain("readFlowchart(graph, document, container)");
    expect(source).toContain("scroller.positionPoint({ x: box.x + box.width / 2, y: box.y }, \"50%\", 48)");
    expect(source).toContain("fitDiagramRect(graph, bounds, { padding, maxScale: policy.maxScale })");
    expect(source).toContain("scroller.zoomToRect(bounds, options)");
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
    expect(source).toContain("architectureNodeVisual");
    expect(source).toContain("architectureEdgeVisual");
    expect(source).toContain("resolveArchitectureSurface");
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
    expect(source).toContain('architectureNodeVisual(node.shape, appearance, size, node.resourceIcon)');
    expect(source).toContain('inferArchitectureResourceIcon(node.label, t)');
    expect(source).not.toContain('.render({}, null).props.iconNode');
    expect(source).not.toContain('className="line-clamp-2"');
  });

  test("places architecture resources at an explicit canvas position", () => {
    expect(source).toContain('const ARCHITECTURE_LIBRARY_DRAG_TYPE = "application/x-edgeever-architecture-resource"');
    expect(source).toContain('<DropdownMenu modal={false}');
    expect(source).toContain("draggable");
    expect(source).toContain("event.dataTransfer.setData(ARCHITECTURE_LIBRARY_DRAG_TYPE");
    expect(source).toContain('event.dataTransfer.setData("text/plain", icon)');
    expect(source).toContain("if (!nextOpen && draggingRef.current) return");
    expect(source).toContain("onPointerDownOutside={(event) => {");
    expect(source).toContain("onDragOver={handleArchitectureDragOver}");
    expect(source).toContain("onDrop={handleArchitectureDrop}");
    expect(source).toContain("placeArchitectureItem(item, diagramClientToLocalPoint(graph, dropPoint))");
    expect(source).toContain("placeArchitectureItem(pendingArchitectureItem, diagramClientToLocalPoint(graph, placementPoint))");
    expect(source).toContain("point.y - clientBounds.top");
    expect(source).toContain("scroller.clientToLocalPoint(point.x - bounds.left, point.y - bounds.top)");
    expect(source).toContain("clampArchitectureDropClientPoint(");
    expect(source).toContain("ARCHITECTURE_DROP_VIEWPORT_PADDING");
    expect(source).toContain("position: { x: number; y: number }");
    expect(source).toContain("x: options.position.x - authoredSize.width / 2");
    expect(source).toContain("onPick={setPendingArchitectureItem}");
    expect(source).toContain("onPointerDownCapture={handlePendingArchitecturePlacement}");
    expect(source).toContain("ref={canvasSurfaceRef}");
    expect(source).toContain('t("diagram.placeShapeHint"');
  });

  test("does not rebuild the visible diagram after its own autosave", () => {
    expect(source).toContain("incomingSnapshot !== canvasSnapshot");
    expect(source).toContain("setGraphReloadVersion((current) => current + 1)");
    expect(source).toContain("graphReloadVersion, memo.id, readOnly");
    expect(source).not.toContain("dismissFlowQuickCreate, memo.contentHash, memo.id, readOnly");
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
    expect(source).toContain("applyGraphPalette(graph, themeRef.current, document.kind, resolvedTheme, structureRef.current);");
    expect(source).toContain("data-diagram-appearance={resolvedTheme}");
    expect(source).toContain("<MemoEditorHeaderActions");
  });
});
