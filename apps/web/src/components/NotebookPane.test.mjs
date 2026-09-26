import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./NotebookPane.tsx", import.meta.url), "utf8");

test("keeps proactive AI out of primary navigation", () => {
  const primaryNav = source.split('aria-label={t("notebookPane.entries")}>')[1]?.split("</nav>")[0];
  expect(primaryNav).toContain('label={t("notebookPane.allMemos")}');
  expect(primaryNav).not.toContain('label={t("companion.navTitle")}');
  expect(primaryNav).not.toContain("onClick={onOpenCompanion}");
});

test("keeps the desktop create-note control compact with one neutral outline", () => {
  const css = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");

  expect(source).toContain('rounded-2xl border border-slate-200/90');
  expect(source).toContain('className="group flex h-12 max-w-[calc(100%-2.25rem)]');
  expect(source).toContain('className="group relative flex h-12 min-w-9 flex-1');
  expect(source).toContain('before:inset-y-2.5');
  expect(source).toContain('data-[state=open]:bg-slate-100 data-[state=open]:text-slate-950');
  expect(source).toContain('t("diagram.moreTypes")');
  expect(source).toContain('group-data-[state=open]:rotate-180');
  expect(source).toContain("edgeever-create-memo-split__more-label");
  expect(css).toContain(".edgeever-create-memo-split__more-label");
  expect(css).toContain("@container (max-width: 11.749rem)");
  expect(source).not.toContain('focus-visible:ring-inset focus-visible:ring-emerald-500');
  expect(source).not.toContain('title={t("notebookPane.newMemo")}');
});

test("keeps the desktop sync status bar and sidebar chrome compact without shrinking primary controls", () => {
  const syncBar = source.split("const SyncStatusBar")[1]?.split("export const NotebookPane")[0];

  expect(syncBar).toContain("flex h-8 items-center gap-2 rounded-md border px-3");
  expect(syncBar).not.toContain("min-h-10");
  expect(syncBar).not.toContain("py-2");
  expect(syncBar).not.toContain("mb-3");
  expect(source).toContain('className="px-3 pt-1.5"');
  expect(source).toContain('className="hidden shrink-0 px-3 pb-2 pt-2 lg:block"');
  expect(source).toContain('className="group flex h-12 max-w-[calc(100%-2.25rem)]');
  expect(source).toContain("mb-1 hidden h-8 w-full items-center justify-start gap-2");
  expect(source).toContain('className="mb-1 space-y-1"');
  expect(source).not.toContain("mb-3 hidden h-8 w-full");
  expect(source).not.toContain('className="mb-3 space-y-1"');
  expect(source).not.toContain("mb-2 hidden h-8 w-full");
  expect(source).not.toContain('className="mb-2 space-y-1"');
});

test("lists diagram note types in the create menu without beta badges", () => {
  const createTypeMenu = source.split("const CreateMemoTypeItems")[1]?.split("const getSyncStatusLabel")[0];
  const diagramSection = createTypeMenu?.split('onCreateMemo("infographic")')[0];

  expect(createTypeMenu).toContain('onCreateMemo()');
  expect(createTypeMenu).toContain('onCreateMemo("mind-map")');
  expect(createTypeMenu).toContain('onCreateMemo("flowchart")');
  expect(createTypeMenu).toContain('onCreateMemo("architecture")');
  expect(createTypeMenu).toContain('onCreateMemo("table")');
  expect(diagramSection).not.toContain("DiagramBetaBadge");
  expect(diagramSection).not.toContain("Beta");
  expect(createTypeMenu).toContain("Beta");
});

describe("NotebookPane sidebar collapse", () => {
  test("places a desktop-only collapse control in the footer and keeps an expand control when collapsed", () => {
    const expandedFooter = source.split('pwa.sidebarDownloadsTitle')[1]?.split(") : (")[0] ?? source;
    const profileRow = expandedFooter.split('aria-label={t("notebookPane.profile")}')[1]?.split("</div>")[0];

    expect(source).toContain("SidebarCollapseButton");
    expect(source).toContain('t(collapsed ? "notebookPane.expandSidebar" : "notebookPane.collapseSidebar")');
    expect(source).toContain("aria-controls={NOTEBOOK_SIDEBAR_ID}");
    expect(source).toContain('className="hidden lg:inline-flex"');
    expect(source).toContain('collapsed && "hidden"');
    expect(source).toContain("<ChevronsLeft");
    expect(source).toContain("<ChevronsRight");
    expect(profileRow).toContain("<SidebarCollapseButton");
    expect(profileRow.indexOf('t("notebookPane.profile")')).toBeLessThan(profileRow.indexOf("<SidebarCollapseButton"));
  });

  test("renders an icon rail of primary destinations while the notebook tree is collapsed", () => {
    const rail = source.split('data-notebook-sidebar-rail')[1]?.split(") : (")[0];

    expect(rail).toContain('aria-label={t("notebookPane.newMemo")}');
    expect(rail).toContain("<LayoutGrid");
    expect(rail).toContain('label={t("notebookPane.allMemos")}');
    expect(rail).toContain('label={t("notebookPane.notebooks")}');
    expect(rail).toContain('label={t("mobileSheets.tags")}');
    expect(rail).toContain('label={t("notebookPane.trash")}');
    expect(rail).toContain("<SidebarCollapseButton collapsed");
    expect(rail).toContain('tooltipSide="right"');
  });

  test("wires the desktop workspace grid to a collapsed notebook column", () => {
    const workspace = readFileSync(new URL("./WorkspaceApp.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");

    expect(workspace).toContain("desktopNotebookSidebarCollapsed");
    expect(workspace).toContain("edgeever-workspace-grid--sidebar-collapsed");
    expect(workspace).toContain('id="edgeever-notebook-sidebar"');
    expect(workspace).toContain("collapsed={desktopNotebookSidebarCollapsed}");
    expect(css).toContain(".edgeever-workspace-grid--sidebar-collapsed");
    expect(css).toContain("var(--notebook-sidebar-width)");
    expect(css).toContain("--notebook-sidebar-width: 3.5rem;");
  });
});

describe("NotebookPane tree expansion persistence", () => {
  test("stores collapsed branches outside individual tree items", () => {
    const treeItemSource = readFileSync(new URL("./NotebookTreeItem.tsx", import.meta.url), "utf8");

    expect(source).toContain("readNotebookTreeCollapsedIdsPreference");
    expect(source).toContain("writeNotebookTreeCollapsedIdsPreference(collapsedNotebookIds)");
    expect(source).toContain("collapsedNotebookIds={collapsedNotebookIds}");
    expect(treeItemSource).toContain("const open = !collapsedNotebookIds.has(node.id)");
    expect(treeItemSource).not.toContain("const [open, setOpen] = useState(true)");
    expect(treeItemSource).not.toContain("if (hasSelectedDescendant) {");
  });
});

describe("NotebookPane client downloads", () => {
  test("keeps macOS, Windows, and Linux downloads visible in the desktop runtime", () => {
    expect(source).toContain('t("pwa.sidebarMac") || "macOS"');
    expect(source).toContain('t("pwa.sidebarWindows") || "Windows"');
    expect(source).toContain('t("pwa.sidebarLinux") || "Linux"');
    expect(source).not.toContain("!window.edgeeverDesktop?.isAvailable");
  });

  test("labels Windows and Linux by package format instead of a preview badge", () => {
    const downloads = source.split('pwa.sidebarDownloadsTitle')[1]?.split("</DropdownMenu>")[0];

    expect(downloads).toContain(">AppImage</span>");
    expect(downloads).toContain(">EXE</span>");
    expect(downloads).toContain('t("pwa.sidebarLinuxAvailability")');
    expect(downloads).toContain('t("pwa.sidebarWindowsAvailability")');
    expect(downloads).toContain("<Tooltip>");
    expect(downloads).not.toContain("sidebarLinuxBadge");
    expect(downloads).not.toContain("sidebarWindowsBadge");
    expect(downloads).not.toContain('|| "Preview"');
    expect(downloads).not.toContain("bg-amber-50");
  });

  test("renders platform icons inline so desktop protocols do not break them", () => {
    expect(source).toContain("<BrandIcon path={APPLE_ICON_PATH}");
    expect(source).toContain("<BrandIcon path={WINDOWS_ICON_PATH}");
    expect(source).toContain('<BrandIcon path={LINUX_ICON_PATH} className="h-4 w-4"');
    expect(source).toContain("<GooglePlayIcon />");
    expect(source).toContain("<AppStoreIcon />");
    expect(source).not.toContain('src="/icons/platforms/');
  });
});
