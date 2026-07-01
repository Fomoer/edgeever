import {
  lazy,
  Suspense,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Home, Search, UserRound, Plus, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MemoListPane, MemoSelectionActionBar } from "./MemoListPane";
import { AppConfirmDialog, MemoDeleteConfirmDialog, NotebookNameDialog } from "./dialogs/ConfirmDialogs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Notebook, AuthUser, MemoSummary, MemoDetail } from "@edgeever/shared";
import type {
  Pane,
  MemoView,
  MemoDeleteConfirmation,
  NotebookNameDialogState,
  AppNoticeDialogState,
  MobileBottomNavItem,
  NotebookNode,
  NotebookDropPosition,
  NotebookMoveOption,
  MemoTemplate,
} from "@/lib/app-helpers";
import {
  DEFAULT_MEMO_TITLE,
  MIN_MEMO_LIST_WIDTH_PX,
  MAX_MEMO_LIST_WIDTH_PX,
  DEFAULT_MEMO_LIST_WIDTH_PX,
  isTextEntryTarget,
  readImageCompressionPreference,
  writeImageCompressionPreference,
  readMemoListWidthPreference,
  writeMemoListWidthPreference,
  clampMemoListWidth,
  toggleMemoSelection,
  getNotebookDropSortOrder,
  buildNotebookTree,
  notebookTreeContainsId,
  getNotebookAncestorIds,
  getExpandableNotebookIds,
  filterNotebookTree,
  getNotebookMoveOptions,
} from "@/lib/app-helpers";
import { useBrowserBackLayer } from "@/lib/app-hooks";
import type { SyncQueueSummary } from "@/lib/sync-queue";

const isDesktopViewport = () => window.matchMedia("(min-width: 1024px)").matches;
const PULL_TO_REFRESH_TRIGGER_PX = 72;
const PULL_TO_REFRESH_MAX_PX = 96;

const isStandaloneApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const getVerticalScrollContainer = (target: EventTarget | null) => {
  let element = target instanceof HTMLElement ? target : null;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScroll = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;

    if (canScroll) {
      return element;
    }

    element = element.parentElement;
  }

  return null;
};

const EditorPane = lazy(() => import("./EditorPane").then((module) => ({ default: module.EditorPane })));
const AssetsPane = lazy(() => import("./AssetsPane").then((module) => ({ default: module.AssetsPane })));
const SettingsPane = lazy(() => import("./SettingsPane").then((module) => ({ default: module.SettingsPane })));
const NotebookPane = lazy(() => import("./NotebookPane").then((module) => ({ default: module.NotebookPane })));
const EvernoteImportGuidePane = lazy(() =>
  import("./EvernoteImportGuidePane").then((module) => ({ default: module.EvernoteImportGuidePane }))
);
const TagsDialog = lazy(() => import("./dialogs/TagsDialog").then((module) => ({ default: module.TagsDialog })));
const TemplatesDialog = lazy(() => import("./dialogs/TemplatesDialog").then((module) => ({ default: module.TemplatesDialog })));

const SETTINGS_PATH = "/settings";

const emptySyncQueueSummary = (): SyncQueueSummary => ({
  total: 0,
  pending: 0,
  syncing: 0,
  conflict: 0,
  error: 0,
});

const PaneLoadingFallback = ({ label = "正在加载" }: { label?: string }) => (
  <div className="flex h-full min-h-0 items-center justify-center bg-white text-sm font-medium text-slate-400" role="status">
    {label}
  </div>
);

const memoDetailQueryKey = (memoId: string, view: MemoView) => ["memo", memoId, view] as const;

const memoToSummary = (memo: MemoDetail): MemoSummary => ({
  id: memo.id,
  notebookId: memo.notebookId,
  title: memo.title,
  excerpt: memo.excerpt,
  tags: memo.tags,
  isPinned: memo.isPinned,
  isArchived: memo.isArchived,
  isDeleted: memo.isDeleted,
  revision: memo.revision,
  createdAt: memo.createdAt,
  updatedAt: memo.updatedAt,
  deletedAt: memo.deletedAt,
});

const cacheMemoDetail = (queryClient: QueryClient, memo: MemoDetail, view: MemoView = memo.isDeleted ? "trash" : "notebook") => {
  queryClient.setQueryData(memoDetailQueryKey(memo.id, view), { memo });
};

const prependMemoSummaryToList = (queryClient: QueryClient, queryKey: readonly unknown[], memo: MemoDetail) => {
  const summary = memoToSummary(memo);

  queryClient.setQueryData<{ memos: MemoSummary[] }>(queryKey, (current) => ({
    memos: [summary, ...(current?.memos ?? []).filter((item) => item.id !== memo.id)],
  }));
};

const MobileBottomNavButton = ({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    className={cn(
      "flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium transition-all duration-200",
      active ? "text-slate-950" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
    )}
    type="button"
    aria-current={active ? "page" : undefined}
    aria-label={label}
    onClick={onClick}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const MobileBottomNav = ({
  activeItem,
  canCreateMemo,
  isCreating,
  onCreateMemo,
  onHome,
  onOpenSettings,
}: {
  activeItem: MobileBottomNavItem;
  canCreateMemo: boolean;
  isCreating: boolean;
  onCreateMemo: () => void;
  onHome: () => void;
  onOpenSettings: () => void;
}) => (
  <nav
    className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-5 pb-[max(0.125rem,env(safe-area-inset-bottom))] pt-0 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    aria-label="移动端主导航"
  >
    <div className="relative grid h-12 grid-cols-3 items-center">
      <MobileBottomNavButton active={activeItem === "home"} icon={<Home className="h-5 w-5" />} label="首页" onClick={onHome} />
      <div aria-hidden="true" />
      <MobileBottomNavButton active={activeItem === "settings"} icon={<UserRound className="h-5 w-5" />} label="我的" onClick={onOpenSettings} />
      <button
        className="absolute left-1/2 top-[-0.8rem] flex h-[3.25rem] w-[3.25rem] -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-white bg-emerald-500 text-white shadow-[0_12px_26px_rgb(var(--brand-green-rgb)/0.32)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:opacity-70 disabled:hover:bg-emerald-200"
        type="button"
        title={!canCreateMemo ? "当前视图不可新建笔记" : isCreating ? "正在创建" : "新建笔记"}
        aria-label={!canCreateMemo ? "当前视图不可新建笔记" : isCreating ? "正在创建" : "新建笔记"}
        disabled={!canCreateMemo || isCreating}
        onClick={onCreateMemo}
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  </nav>
);

const MobileNotebookPicker = ({
  currentLabel,
  notebooks,
  selectedNotebookId,
  onClose,
  onSelectAll,
  onSelect,
}: {
  currentLabel?: string;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  onClose: () => void;
  onSelectAll: () => void;
  onSelect: (notebookId: string) => void;
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [notebookSearch, setNotebookSearch] = useState("");
  const tree = useMemo(() => buildNotebookTree(notebooks), [notebooks]);
  const filteredTree = useMemo(() => filterNotebookTree(tree, notebookSearch), [notebookSearch, tree]);
  const selectedAncestorIds = useMemo(
    () => (selectedNotebookId ? getNotebookAncestorIds(tree, selectedNotebookId) : []),
    [selectedNotebookId, tree]
  );
  const expandableNotebookIds = useMemo(() => getExpandableNotebookIds(tree), [tree]);
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(() => new Set(selectedAncestorIds));
  const allSelected = !currentLabel && selectedNotebookId === null;
  const selectedNotebookName =
    currentLabel ?? (allSelected ? "全部笔记" : notebooks.find((item) => item.id === selectedNotebookId)?.name ?? "笔记本");
  const searchQuery = notebookSearch.trim();
  const searchActive = Boolean(searchQuery);
  const allNotebookBranchesExpanded =
    expandableNotebookIds.length > 0 && expandableNotebookIds.every((notebookId) => expandedNotebookIds.has(notebookId));

  useEffect(() => {
    if (selectedAncestorIds.length === 0) {
      return;
    }
    setExpandedNotebookIds((current) => {
      const next = new Set(current);
      for (const notebookId of selectedAncestorIds) {
        next.add(notebookId);
      }
      return next;
    });
  }, [selectedAncestorIds]);

  useEffect(() => {
    if (searchActive) {
      return;
    }
    window.setTimeout(() => {
      const listNode = listRef.current;
      const targetNotebookId = selectedNotebookId ?? "__all__";
      const selectedNode = listNode?.querySelector<HTMLElement>(`[data-mobile-notebook-id="${CSS.escape(targetNotebookId)}"]`);
      selectedNode?.scrollIntoView({ block: "center" });
    }, 0);
  }, [searchActive, selectedNotebookId]);

  const handleToggleNotebookExpanded = (notebookId: string) => {
    setExpandedNotebookIds((current) => {
      const next = new Set(current);
      if (next.has(notebookId)) {
        next.delete(notebookId);
      } else {
        next.add(notebookId);
      }
      return next;
    });
  };

  const handleToggleAllNotebookBranches = () => {
    setExpandedNotebookIds(allNotebookBranchesExpanded ? new Set() : new Set(expandableNotebookIds));
  };

  return (
    <Drawer open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="inset-x-0 max-h-[82dvh] overflow-hidden border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <DrawerHeader className="min-w-0 p-0">
            <DrawerTitle className="text-base">切换笔记本</DrawerTitle>
            <DrawerDescription className="truncate">当前：{selectedNotebookName}</DrawerDescription>
          </DrawerHeader>
          <Button size="icon" variant="ghost" title="关闭" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="border-b border-slate-100 px-4 py-2">
          <div className="flex h-9 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm text-slate-500">
            <Search className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
              value={notebookSearch}
              placeholder="搜索笔记本"
              aria-label="搜索笔记本"
              onChange={(event) => setNotebookSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && notebookSearch) {
                  event.preventDefault();
                  setNotebookSearch("");
                }
              }}
            />
            {notebookSearch && (
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
                type="button"
                title="清空搜索"
                aria-label="清空搜索"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setNotebookSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div ref={listRef} className="max-h-[calc(82dvh_-_8.25rem_-_env(safe-area-inset-bottom))] overflow-y-auto p-2">
          <button
            className={cn(
              "mb-1 flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition",
              allSelected ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-800 hover:bg-slate-50"
            )}
            type="button"
            data-mobile-notebook-id="__all__"
            aria-label={allSelected ? "当前：全部笔记" : "切换到全部笔记"}
            aria-current={allSelected ? "page" : undefined}
            onClick={onSelectAll}
          >
            <span className="min-w-0 flex-1 truncate text-base">全部笔记</span>
          </button>
          {filteredTree.length > 0 ? (
            <>
              <div className="mb-1 flex h-8 items-center justify-between px-3 text-xs font-semibold text-slate-400">
                <span>{searchActive ? "匹配的笔记本" : "笔记本"}</span>
                {!searchActive && expandableNotebookIds.length > 0 && (
                  <button
                    className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    type="button"
                    aria-label={allNotebookBranchesExpanded ? "收起全部笔记本" : "展开全部笔记本"}
                    aria-pressed={allNotebookBranchesExpanded}
                    onClick={handleToggleAllNotebookBranches}
                  >
                    {allNotebookBranchesExpanded ? "收起全部" : "展开全部"}
                  </button>
                )}
              </div>
              {filteredTree.map((node) => (
                <MobileNotebookPickerItem
                  key={node.id}
                  node={node}
                  depth={0}
                  expandedNotebookIds={expandedNotebookIds}
                  searchActive={searchActive}
                  selectedNotebookId={selectedNotebookId}
                  onSelect={onSelect}
                  onToggleExpanded={handleToggleNotebookExpanded}
                />
              ))}
            </>
          ) : (
            <div className="px-3 py-8 text-center">
              <div className="text-sm font-medium text-slate-700">
                {searchQuery ? `没有找到「${searchQuery}」` : "没有找到笔记本"}
              </div>
              {searchQuery && (
                <button
                  className="mt-3 text-sm font-semibold text-slate-600"
                  type="button"
                  onClick={() => setNotebookSearch("")}
                >
                  显示全部笔记本
                </button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

const MobileNotebookPickerItem = ({
  node,
  depth,
  expandedNotebookIds,
  searchActive,
  selectedNotebookId,
  onSelect,
  onToggleExpanded,
}: {
  node: NotebookNode;
  depth: number;
  expandedNotebookIds: Set<string>;
  searchActive: boolean;
  selectedNotebookId: string | null;
  onSelect: (notebookId: string) => void;
  onToggleExpanded: (notebookId: string) => void;
}) => {
  const selected = node.id === selectedNotebookId;
  const hasChildren = node.children.length > 0;
  const hasSelectedDescendant = selectedNotebookId ? notebookTreeContainsId(node.children, selectedNotebookId) : false;
  const expanded = searchActive || expandedNotebookIds.has(node.id);

  return (
    <div>
      <div
        data-mobile-notebook-id={node.id}
        className={cn(
          "flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition",
          selected
            ? "bg-slate-100 font-semibold text-slate-950"
            : hasSelectedDescendant
              ? "bg-slate-50 text-slate-900 hover:bg-slate-100"
              : "text-slate-800 hover:bg-slate-50"
        )}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition",
              searchActive ? "cursor-default" : "hover:bg-slate-100 hover:text-slate-700"
            )}
            type="button"
            disabled={searchActive}
            aria-label={expanded ? `收起 ${node.name}` : `展开 ${node.name}`}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded(node.id);
            }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        )}
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          type="button"
          aria-label={selected ? `当前：${node.name}` : `切换到 ${node.name}`}
          aria-current={selected ? "page" : undefined}
          onClick={() => onSelect(node.id)}
        >
          <span className="min-w-0 flex-1 truncate text-base">{node.name}</span>
        </button>
      </div>
      {hasChildren && expanded ? (
        <div className="mt-1 border-l border-slate-100 pl-1">
          {node.children.map((child) => (
            <MobileNotebookPickerItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNotebookIds={expandedNotebookIds}
              searchActive={searchActive}
              selectedNotebookId={selectedNotebookId}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const WorkspaceApp = ({
  authRequired,
  user,
  isLoggingOut,
  onLogout,
}: {
  authRequired: boolean;
  user: AuthUser | null;
  isLoggingOut: boolean;
  onLogout: () => void;
}) => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const isInitialSettingsRoute = location.pathname === SETTINGS_PATH;
  const [activePane, setActivePane] = useState<Pane>(() => (isInitialSettingsRoute ? "editor" : "memos"));
  const [memoView, setMemoView] = useState<MemoView>("notebook");
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [createdMemoEditId, setCreatedMemoEditId] = useState<string | null>(null);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(new Set());
  const [memoSelectionMode, setMemoSelectionMode] = useState(false);
  const [selectionMoveTargetNotebookId, setSelectionMoveTargetNotebookId] = useState("");
  const [memoDeleteConfirmation, setMemoDeleteConfirmation] = useState<MemoDeleteConfirmation | null>(null);
  const [emptyTrashConfirmationOpen, setEmptyTrashConfirmationOpen] = useState(false);
  const [notebookNameDialog, setNotebookNameDialog] = useState<NotebookNameDialogState | null>(null);
  const [notebookDeleteConfirmation, setNotebookDeleteConfirmation] = useState<Notebook | null>(null);
  const [appNoticeDialog, setAppNoticeDialog] = useState<AppNoticeDialogState | null>(null);
  const [multiSelectKeyDown, setMultiSelectKeyDown] = useState(false);
  const [imageCompressionEnabled, setImageCompressionEnabled] = useState(readImageCompressionPreference);
  const [rightView, setRightView] = useState<"editor" | "settings" | "assets" | "evernote-migration">(() =>
    isInitialSettingsRoute ? "settings" : "editor"
  );
  const [tagsOpen, setTagsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [mobileNotebookPickerOpen, setMobileNotebookPickerOpen] = useState(false);
  const [mobileBottomNavActive, setMobileBottomNavActive] = useState<MobileBottomNavItem>(() =>
    isInitialSettingsRoute ? "settings" : "home"
  );
  const [mobileSearchFocusToken, setMobileSearchFocusToken] = useState(0);
  const [noteSearchFocusToken, setNoteSearchFocusToken] = useState(0);
  const [noteReplaceFocusToken, setNoteReplaceFocusToken] = useState(0);
  const [memoListWidth, setMemoListWidth] = useState(readMemoListWidthPreference);
  const [search, setSearch] = useState("");
  const [syncSummary, setSyncSummary] = useState<SyncQueueSummary>(emptySyncQueueSummary);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [isDesktop, setIsDesktop] = useState(isDesktopViewport);
  const [isSyncingQueuedChanges, setIsSyncingQueuedChanges] = useState(false);
  const [isStandaloneRuntime] = useState(isStandaloneApp);
  const [pullToRefreshDistance, setPullToRefreshDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const isPullRefreshingRef = useRef(false);
  const skipNextHomeRouteSyncRef = useRef(false);

  const [mobileListActionsOpen, setMobileListActionsOpen] = useState(false);
  const [mobileMoveOpen, setMobileMoveOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);
  const [desktopSortOpen, setDesktopSortOpen] = useState(false);
  const [desktopActionsOpen, setDesktopActionsOpen] = useState(false);

  const navigateWorkspaceHome = () => {
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const navigateWorkspaceSettings = () => {
    if (location.pathname !== SETTINGS_PATH) {
      navigate(SETTINGS_PATH);
    }
  };

  const runQueuedSync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      return;
    }

    setIsSyncingQueuedChanges(true);

    try {
      const { syncQueuedChanges } = await import("@/lib/sync-queue");
      await syncQueuedChanges({
        onSynced: async (memo) => {
          cacheMemoDetail(queryClient, memo);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["memos"] }),
            queryClient.invalidateQueries({ queryKey: ["memo", memo.id] }),
          ]);
        },
      });
    } finally {
      setIsSyncingQueuedChanges(false);
    }
  }, [queryClient]);

  const refreshLatestMemos = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      setPullToRefreshDistance(0);
      return;
    }

    setIsPullRefreshing(true);

    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
    } finally {
      setIsPullRefreshing(false);
      setPullToRefreshDistance(0);
    }
  }, [queryClient]);

  const notebooksQuery = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => api.listNotebooks(),
  });

  const notebooks = notebooksQuery.data?.notebooks ?? [];
  const defaultMemoNotebookId =
    notebooks.find((notebook) => notebook.slug === "inbox")?.id ?? selectedNotebookId ?? notebooks[0]?.id ?? null;
  const canCreateMemo = Boolean(defaultMemoNotebookId && memoView !== "trash");
  const memoSelectionModeActive = memoSelectionMode || selectedMemoIds.size > 0;
  const mobileSearchActive = mobileBottomNavActive === "search";
  const workspaceBackTargetActive = Boolean(
    appNoticeDialog ||
      notebookDeleteConfirmation ||
	      notebookNameDialog ||
	      memoDeleteConfirmation ||
      emptyTrashConfirmationOpen ||
	      mobileNotebookPickerOpen ||
	      mobileListActionsOpen ||
	      mobileMoveOpen ||
	      mobileMoreOpen ||
	      mobileSearchActive ||
      templatesOpen ||
      rightView !== "editor" ||
      tagsOpen ||
      memoSelectionModeActive ||
      activePane === "editor" ||
      activePane === "notebooks"
  );
  const mobilePullToRefreshActive = Boolean(
    !isDesktop &&
      activePane === "memos" &&
      !appNoticeDialog &&
      !notebookDeleteConfirmation &&
      !notebookNameDialog &&
      !memoDeleteConfirmation &&
      !emptyTrashConfirmationOpen &&
      !mobileNotebookPickerOpen &&
      !mobileListActionsOpen &&
      !mobileMoveOpen &&
      !mobileMoreOpen &&
      !tagsOpen &&
      !templatesOpen
  );

  const clearMemoSelection = useCallback(() => {
    setSelectedMemoIds(new Set());
    setMemoSelectionMode(false);
  }, []);

  const replaceMemoSelection = useCallback((memoIds: string[]) => {
    setSelectedMemoIds(new Set(memoIds));
    setMemoSelectionMode(true);
  }, []);

  const enterMemoSelectionMode = useCallback(() => {
    setMemoSelectionMode(true);
    setActivePane("memos");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMultiSelectKeyDown(false);
        return;
      }

      if (isTextEntryTarget(event.target)) {
        setMultiSelectKeyDown(false);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.key === "Control" || event.key === "Meta") {
        setMultiSelectKeyDown(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        setMultiSelectKeyDown(false);
        return;
      }
      setMultiSelectKeyDown(event.ctrlKey || event.metaKey);
    };

    const handleBlur = () => setMultiSelectKeyDown(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    writeImageCompressionPreference(imageCompressionEnabled);
  }, [imageCompressionEnabled]);

  useEffect(() => {
    if (location.pathname === SETTINGS_PATH) {
      skipNextHomeRouteSyncRef.current = false;
      setRightView("settings");
      setMobileBottomNavActive("settings");
      setActivePane("editor");
      return;
    }

    if (skipNextHomeRouteSyncRef.current) {
      skipNextHomeRouteSyncRef.current = false;
      return;
    }

    setRightView("editor");
    setMobileBottomNavActive("home");
  }, [location.pathname]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    void import("@/lib/sync-queue").then(({ observeSyncQueue }) => {
      if (!active) {
        return;
      }
      unsubscribe = observeSyncQueue(setSyncSummary);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateDesktopState = () => setIsDesktop(mediaQuery.matches);

    updateDesktopState();
    mediaQuery.addEventListener("change", updateDesktopState);

    return () => mediaQuery.removeEventListener("change", updateDesktopState);
  }, []);

  useEffect(() => {
    isPullRefreshingRef.current = isPullRefreshing;
  }, [isPullRefreshing]);

  useEffect(() => {
    if (!mobilePullToRefreshActive) {
      setPullToRefreshDistance(0);
      return;
    }

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let currentDistance = 0;
    let scrollContainer: HTMLElement | null = null;

    const reset = () => {
      tracking = false;
      startX = 0;
      startY = 0;
      currentDistance = 0;
      scrollContainer = null;
      setPullToRefreshDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || isPullRefreshingRef.current || isTextEntryTarget(event.target)) {
        return;
      }

      scrollContainer = getVerticalScrollContainer(event.target);

      if ((scrollContainer && scrollContainer.scrollTop > 0) || (!scrollContainer && window.scrollY > 0)) {
        return;
      }

      const touch = event.touches[0];
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) {
        return;
      }

      if ((scrollContainer && scrollContainer.scrollTop > 0) || (!scrollContainer && window.scrollY > 0)) {
        reset();
        return;
      }

      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = Math.abs(touch.clientX - startX);

      if (deltaY <= 0 || deltaX > deltaY) {
        reset();
        return;
      }

      currentDistance = Math.min(PULL_TO_REFRESH_MAX_PX, deltaY * 0.55);

      if (currentDistance > 8) {
        event.preventDefault();
        setPullToRefreshDistance(currentDistance);
      }
    };

    const handleTouchEnd = () => {
      if (!tracking) {
        return;
      }

      const shouldRefresh = currentDistance >= PULL_TO_REFRESH_TRIGGER_PX;
      reset();

      if (shouldRefresh) {
        setPullToRefreshDistance(PULL_TO_REFRESH_TRIGGER_PX);
        if (isStandaloneRuntime) {
          void refreshLatestMemos();
          return;
        }

        setIsPullRefreshing(true);
        window.location.reload();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, [isStandaloneRuntime, mobilePullToRefreshActive, refreshLatestMemos]);

  useEffect(() => {
    const updateOnlineState = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        void runQueuedSync();
      }
    };

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    updateOnlineState();

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [runQueuedSync]);

  useEffect(() => {
    if (!isStandaloneRuntime) {
      return;
    }

    const refreshWorkspaceQueries = () => {
      if (document.visibilityState === "hidden" || (typeof navigator !== "undefined" && !navigator.onLine)) {
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
    };

    window.addEventListener("pageshow", refreshWorkspaceQueries);
    document.addEventListener("visibilitychange", refreshWorkspaceQueries);

    return () => {
      window.removeEventListener("pageshow", refreshWorkspaceQueries);
      document.removeEventListener("visibilitychange", refreshWorkspaceQueries);
    };
  }, [isStandaloneRuntime, queryClient]);

  useEffect(() => {
    if (syncSummary.total === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void runQueuedSync();
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [runQueuedSync, syncSummary.total]);

  const memosQuery = useQuery({
    queryKey: ["memos", memoView, selectedNotebookId, search],
    queryFn: () =>
      api.listMemos({
        notebookId: memoView === "notebook" ? selectedNotebookId : null,
        q: search,
        trash: memoView === "trash",
      }),
  });

  const memos = memosQuery.data?.memos ?? [];
  const selectedMemoIndex = selectedMemoId ? memos.findIndex((memo) => memo.id === selectedMemoId) : -1;
  const previousMemoId = selectedMemoIndex > 0 ? memos[selectedMemoIndex - 1]?.id : null;
  const nextMemoId =
    selectedMemoIndex >= 0 && selectedMemoIndex < memos.length - 1 ? memos[selectedMemoIndex + 1]?.id : null;

  useEffect(() => {
    if (memos.length === 0) {
      setSelectedMemoId(null);
      return;
    }

    if (!selectedMemoId || !memos.some((memo) => memo.id === selectedMemoId)) {
      setSelectedMemoId(memos[0].id);
    }
  }, [memos, selectedMemoId]);

  const memoQuery = useQuery({
    queryKey: selectedMemoId ? memoDetailQueryKey(selectedMemoId, memoView) : ["memo", selectedMemoId, memoView],
    queryFn: () => api.getMemo(selectedMemoId as string, { includeDeleted: memoView === "trash" }),
    enabled: Boolean(selectedMemoId),
  });

  const createNotebookMutation = useMutation({
    mutationFn: api.createNotebook,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setSelectedNotebookId(data.notebook.id);
      setActivePane("memos");
    },
  });

  const updateNotebookMutation = useMutation({
    mutationFn: ({
      notebookId,
      payload,
    }: {
      notebookId: string;
      payload: { name?: string; parentId?: string | null; sortOrder?: number };
    }) => api.updateNotebook(notebookId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    },
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: api.deleteNotebook,
    onSuccess: async (_data, notebookId) => {
      if (selectedNotebookId === notebookId) {
        setSelectedNotebookId(null);
        setSelectedMemoId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
    },
  });

  const createMemoMutation = useMutation({
    mutationFn: api.createMemo,
    onSuccess: (data) => {
      const targetNotebookId =
        selectedNotebookId && selectedNotebookId !== data.memo.notebookId ? data.memo.notebookId : selectedNotebookId;

      setMemoView("notebook");
      setSearch("");
      if (targetNotebookId !== selectedNotebookId) {
        setSelectedNotebookId(targetNotebookId);
      }
      cacheMemoDetail(queryClient, data.memo, "notebook");
      prependMemoSummaryToList(queryClient, ["memos", "notebook", targetNotebookId, ""], data.memo);
      if (targetNotebookId !== null) {
        prependMemoSummaryToList(queryClient, ["memos", "notebook", null, ""], data.memo);
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
      navigateWorkspaceHome();
      setRightView("editor");
      setCreatedMemoEditId(data.memo.id);
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const mergeMutation = useMutation({
    mutationFn: api.mergeMemos,
    onSuccess: async (data) => {
      clearMemoSelection();
      cacheMemoDetail(queryClient, data.memo, "notebook");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
      navigateWorkspaceHome();
      setRightView("editor");
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const moveMemosMutation = useMutation({
    mutationFn: api.moveMemos,
    onSuccess: async () => {
      clearMemoSelection();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
    },
  });

  const pinMemosMutation = useMutation({
    mutationFn: async ({ memoIds, isPinned }: { memoIds: string[]; isPinned: boolean }) =>
      Promise.all(memoIds.map((memoId) => api.updateMemo(memoId, { isPinned }))),
    onMutate: async ({ memoIds, isPinned }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["memos"] }),
        queryClient.cancelQueries({ queryKey: ["memo"] }),
      ]);

      const memoIdSet = new Set(memoIds);
      const previousMemoQueries = queryClient.getQueriesData<{ memos: MemoSummary[] }>({ queryKey: ["memos"] });
      const previousMemoDetailQueries = queryClient.getQueriesData<{ memo: MemoDetail }>({ queryKey: ["memo"] });

      queryClient.setQueriesData<{ memos: MemoSummary[] }>({ queryKey: ["memos"] }, (current) =>
        current
          ? {
              memos: current.memos.map((memo) => (memoIdSet.has(memo.id) ? { ...memo, isPinned } : memo)),
            }
          : current
      );
      queryClient.setQueriesData<{ memo: MemoDetail }>({ queryKey: ["memo"] }, (current) =>
        current && memoIdSet.has(current.memo.id)
          ? {
              memo: { ...current.memo, isPinned },
            }
          : current
      );

      return { previousMemoQueries, previousMemoDetailQueries };
    },
    onError: (_error, _variables, context) => {
      context?.previousMemoQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      context?.previousMemoDetailQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
    },
  });

  const deleteMemosMutation = useMutation({
    mutationFn: api.deleteMemos,
    onSuccess: async (_, variables) => {
      const deletedMemoIds = new Set(variables.memoIds);
      clearMemoSelection();

      if (selectedMemoId && deletedMemoIds.has(selectedMemoId)) {
        setSelectedMemoId(null);
        setActivePane("memos");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
      ]);
    },
  });

  const deleteMemoMutation = useMutation({
    mutationFn: ({ memoId, permanent }: { memoId: string; permanent?: boolean }) =>
      api.deleteMemo(memoId, { permanent }),
    onSuccess: async (_data, variables) => {
      if (selectedMemoId === variables.memoId) {
        setSelectedMemoId(null);
        setActivePane("memos");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: api.emptyTrash,
    onSuccess: async () => {
      setEmptyTrashConfirmationOpen(false);
      clearMemoSelection();
      setSelectedMemoId(null);
      setActivePane("memos");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["memo"] }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
      ]);
    },
  });

  const restoreMemoMutation = useMutation({
    mutationFn: api.restoreMemo,
    onSuccess: (data) => {
      setMemoView("notebook");
      cacheMemoDetail(queryClient, data.memo, "notebook");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
      ]);
      setSelectedNotebookId(data.memo.notebookId);
      navigateWorkspaceHome();
      setRightView("editor");
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const selectedNotebook = notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null;
  const selectedMemo = memoQuery.data?.memo ?? null;
  const selectionMoveNotebookOptions = useMemo(() => getNotebookMoveOptions(notebooks), [notebooks]);
  const selectedMemosInCurrentList = useMemo(
    () => memos.filter((memo) => selectedMemoIds.has(memo.id)),
    [memos, selectedMemoIds]
  );

  useEffect(() => {
    if (selectedNotebook?.id) {
      setSelectionMoveTargetNotebookId(selectedNotebook.id);
      return;
    }

    if (!selectionMoveTargetNotebookId && selectionMoveNotebookOptions[0]?.id) {
      setSelectionMoveTargetNotebookId(selectionMoveNotebookOptions[0].id);
    }
  }, [selectedNotebook?.id, selectionMoveNotebookOptions, selectionMoveTargetNotebookId]);

  const handleCreateNotebook = (parentId?: string | null) => {
    setNotebookNameDialog({ mode: "create", parentId: parentId ?? null });
  };

  const handleRenameNotebook = (notebook: Notebook) => {
    setNotebookNameDialog({ mode: "rename", notebook });
  };

  const handleSubmitNotebookName = (name: string) => {
    if (!notebookNameDialog) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    if (notebookNameDialog.mode === "create") {
      createNotebookMutation.mutate(
        { name: trimmedName, parentId: notebookNameDialog.parentId },
        { onSuccess: () => setNotebookNameDialog(null) }
      );
      return;
    }

    if (trimmedName === notebookNameDialog.notebook.name) {
      setNotebookNameDialog(null);
      return;
    }

    updateNotebookMutation.mutate(
      { notebookId: notebookNameDialog.notebook.id, payload: { name: trimmedName } },
      { onSuccess: () => setNotebookNameDialog(null) }
    );
  };

  const handleDeleteNotebook = (notebook: Notebook) => {
    if (notebook.slug === "inbox") {
      setAppNoticeDialog({
        title: "等待分类不能删除",
        description: "等待分类是默认笔记本，用来保证新笔记始终有归属。",
      });
      return;
    }
    setNotebookDeleteConfirmation(notebook);
  };

  const handleCreateMemo = (template?: MemoTemplate) => {
    if (!defaultMemoNotebookId || memoView === "trash") {
      return;
    }

    setTemplatesOpen(false);
    setMobileBottomNavActive("home");
    createMemoMutation.mutate({
      notebookId: defaultMemoNotebookId,
      title: template?.title ?? DEFAULT_MEMO_TITLE,
      contentMarkdown: template?.contentMarkdown ?? "",
      tags: template?.tags ?? [],
    });
  };

  const handleMobileDefaultEditConsumed = useCallback(() => {
    setCreatedMemoEditId(null);
  }, []);

  const handleMoveNotebook = (
    notebookId: string,
    targetNotebookId: string,
    position: NotebookDropPosition
  ) => {
    if (notebookId === targetNotebookId) {
      return;
    }

    const target = notebooks.find((notebook) => notebook.id === targetNotebookId);
    if (!target) {
      return;
    }

    updateNotebookMutation.mutate({
      notebookId,
      payload: {
        parentId: position === "inside" ? target.id : target.parentId,
        sortOrder: position === "inside" ? Date.now() : getNotebookDropSortOrder(notebooks, target, position),
      },
    });
  };

  const getMemoIdsNeedingMove = (memoIds: string[], targetNotebookId: string) => {
    const memoNotebookMap = new Map(memos.map((memo) => [memo.id, memo.notebookId]));
    return Array.from(new Set(memoIds.filter(Boolean))).filter((memoId) => memoNotebookMap.get(memoId) !== targetNotebookId);
  };

  const handleMoveSelectedMemos = (targetNotebookId: string) => {
    if (selectedMemoIds.size === 0 || memoView === "trash") {
      return;
    }

    const memoIds = getMemoIdsNeedingMove(Array.from(selectedMemoIds), targetNotebookId);
    if (memoIds.length === 0) {
      return;
    }

    moveMemosMutation.mutate({
      memoIds,
      notebookId: targetNotebookId,
    });
  };

  const handleMoveDraggedMemos = (memoIds: string[], targetNotebookId: string) => {
    if (memoView === "trash" || moveMemosMutation.isPending) {
      return;
    }

    const movableMemoIds = getMemoIdsNeedingMove(memoIds, targetNotebookId);
    if (movableMemoIds.length === 0) {
      return;
    }

    moveMemosMutation.mutate({
      memoIds: movableMemoIds,
      notebookId: targetNotebookId,
    });
  };

  const handleMoveMemoFromList = (memoId: string, targetNotebookId: string) => {
    if (memoView === "trash") {
      return;
    }

    const memoIds = getMemoIdsNeedingMove([memoId], targetNotebookId);
    if (memoIds.length === 0) {
      return;
    }

    moveMemosMutation.mutate({
      memoIds,
      notebookId: targetNotebookId,
    });
  };

  const handleToggleMemoPinned = (memo: MemoSummary) => {
    if (memoView === "trash") {
      return;
    }

    pinMemosMutation.mutate({
      memoIds: [memo.id],
      isPinned: !memo.isPinned,
    });
  };

  const handlePinSelectedMemos = (isPinned: boolean) => {
    if (selectedMemoIds.size === 0 || memoView === "trash") {
      return;
    }

    pinMemosMutation.mutate(
      {
        memoIds: Array.from(selectedMemoIds),
        isPinned,
      },
      {
        onSuccess: clearMemoSelection,
      }
    );
  };

  const handleMerge = () => {
    if (selectedMemoIds.size < 2 || memoView === "trash") {
      return;
    }

    mergeMutation.mutate({
      memoIds: Array.from(selectedMemoIds),
      notebookId: selectedNotebookId ?? undefined,
    });
  };

  const handleDeleteSelectedMemos = () => {
    if (selectedMemoIds.size === 0) {
      return;
    }

    if (memoView !== "trash") {
      deleteMemosMutation.mutate({
        memoIds: Array.from(selectedMemoIds),
        permanent: false,
      });
      return;
    }

    setMemoDeleteConfirmation({
      kind: "bulk",
      memoIds: Array.from(selectedMemoIds),
      permanent: true,
    });
  };

  const allSelectedMemosPinned =
    selectedMemosInCurrentList.length > 0 && selectedMemosInCurrentList.every((memo) => memo.isPinned);
  const selectedPinTarget = !allSelectedMemosPinned;
  const selectionPinLabel = allSelectedMemosPinned ? "取消置顶" : "置顶";
  const selectionPinTitle =
    selectedMemoIds.size === 0
      ? "请选择笔记"
      : memoView === "trash"
        ? "回收站内不可置顶"
        : pinMemosMutation.isPending
          ? "正在更新置顶"
          : selectionPinLabel;
  const selectionMoveTitle =
    selectedMemoIds.size === 0
      ? "请选择笔记"
      : memoView === "trash"
        ? "回收站内不可移动"
        : notebooks.length === 0
          ? "没有可移动的笔记本"
          : moveMemosMutation.isPending
            ? "正在移动"
            : "移动";
  const selectionMergeTitle =
    selectedMemoIds.size < 2
      ? "至少选择 2 条笔记"
      : memoView === "trash"
        ? "回收站内不可合并"
        : mergeMutation.isPending
          ? "正在合并"
          : "合并笔记";
  const selectionDeleteTitle =
    selectedMemoIds.size === 0
      ? "请选择笔记"
      : deleteMemosMutation.isPending || deleteMemoMutation.isPending
        ? "正在删除"
        : memoView === "trash"
          ? "永久删除"
          : "删除";
  const memoSelectionActionBar = memoSelectionModeActive ? (
    <MemoSelectionActionBar
      deleteTitle={selectionDeleteTitle}
      isDeleting={deleteMemosMutation.isPending || deleteMemoMutation.isPending}
      isMerging={mergeMutation.isPending}
      isMoving={moveMemosMutation.isPending}
      isPinning={pinMemosMutation.isPending}
      isTrashView={memoView === "trash"}
      mergeTitle={selectionMergeTitle}
      moveNotebookOptions={selectionMoveNotebookOptions}
      moveTargetNotebookId={selectionMoveTargetNotebookId}
      moveTitle={selectionMoveTitle}
      onClearSelection={clearMemoSelection}
      onDelete={handleDeleteSelectedMemos}
      onMerge={handleMerge}
      onMove={() => handleMoveSelectedMemos(selectionMoveTargetNotebookId)}
      onMoveTargetChange={setSelectionMoveTargetNotebookId}
      onPin={() => handlePinSelectedMemos(selectedPinTarget)}
      pinLabel={selectionPinLabel}
      pinTarget={selectedPinTarget}
      pinTitle={selectionPinTitle}
      selectedCount={selectedMemoIds.size}
    />
  ) : null;

  const handleDeleteMemoFromList = (memoId: string) => {
    if (memoView !== "trash") {
      deleteMemoMutation.mutate({ memoId, permanent: false });
      return;
    }
    setMemoDeleteConfirmation({ kind: "single", memoIds: [memoId], permanent: true });
  };

  const handleConfirmMemoDeletion = () => {
    if (!memoDeleteConfirmation) {
      return;
    }

    const { kind, memoIds, permanent } = memoDeleteConfirmation;
    setMemoDeleteConfirmation(null);

    if (kind === "bulk") {
      deleteMemosMutation.mutate({ memoIds, permanent });
      return;
    }

    const [memoId] = memoIds;
    if (memoId) {
      deleteMemoMutation.mutate({ memoId, permanent });
    }
  };

  const handleRestoreMemoFromList = (memoId: string) => {
    restoreMemoMutation.mutate(memoId);
  };

  const handleEmptyTrash = () => {
    setEmptyTrashConfirmationOpen(true);
  };

  const handleConfirmEmptyTrash = () => {
    emptyTrashMutation.mutate();
  };

  const handleSelectNotebook = (notebookId: string) => {
    navigateWorkspaceHome();
    setMemoView("notebook");
    setSelectedNotebookId(notebookId);
    setMobileBottomNavActive("home");
    clearMemoSelection();
    setMobileNotebookPickerOpen(false);
    setActivePane("memos");
  };

  const handleSelectAllMemos = () => {
    navigateWorkspaceHome();
    setMemoView("notebook");
    setSelectedNotebookId(null);
    setMobileBottomNavActive("home");
    clearMemoSelection();
    setMobileNotebookPickerOpen(false);
    setActivePane("memos");
  };

  const handleMobileHome = () => {
    navigateWorkspaceHome();
    if (memoView === "trash") {
      setMemoView("notebook");
    }
    setMobileBottomNavActive("home");
    setSelectedNotebookId(null);
    setSearch("");
    clearMemoSelection();
    setActivePane("memos");
  };

  const handleMobileSearch = () => {
    setMobileBottomNavActive("search");
    setActivePane("memos");
    setMobileSearchFocusToken((value) => value + 1);
  };

  const handleCancelMobileSearch = () => {
    setSearch("");
    setMobileBottomNavActive("home");
    clearMemoSelection();
    setActivePane("memos");
  };

  const clearHiddenMobileSearch = () => {
    if (!isDesktopViewport()) {
      setSearch("");
    }
  };

  const handleOpenAssets = () => {
    clearHiddenMobileSearch();
    skipNextHomeRouteSyncRef.current = location.pathname !== "/";
    navigateWorkspaceHome();
    setRightView("assets");
    setActivePane("editor");
  };

  const handleOpenTags = () => {
    clearHiddenMobileSearch();
    setTagsOpen(true);
  };

  const handleOpenTemplates = () => {
    clearHiddenMobileSearch();
    setMobileBottomNavActive("templates");
    setTemplatesOpen(true);
  };

  const handleOpenSettings = () => {
    clearHiddenMobileSearch();
    navigateWorkspaceSettings();
    setRightView("settings");
    setMobileBottomNavActive("settings");
    setActivePane("editor");
  };

  const handleCloseAssets = () => {
    navigateWorkspaceHome();
    setRightView("editor");
    setMobileBottomNavActive("home");
  };

  const handleCloseTemplates = () => {
    setTemplatesOpen(false);
    setMobileBottomNavActive("home");
  };

  const handleCloseSettings = () => {
    navigateWorkspaceHome();
    setRightView("editor");
    setMobileBottomNavActive("home");
    if (!isDesktopViewport()) {
      setActivePane("memos");
    }
  };

  const handleWorkspaceBackRequest = useCallback(() => {
    if (appNoticeDialog) {
      setAppNoticeDialog(null);
      return true;
    }

    if (notebookDeleteConfirmation) {
      if (!deleteNotebookMutation.isPending) {
        setNotebookDeleteConfirmation(null);
      }
      return true;
    }

    if (notebookNameDialog) {
      if (!createNotebookMutation.isPending && !updateNotebookMutation.isPending) {
        setNotebookNameDialog(null);
      }
      return true;
    }

    if (memoDeleteConfirmation) {
      if (!deleteMemosMutation.isPending && !deleteMemoMutation.isPending) {
        setMemoDeleteConfirmation(null);
      }
      return true;
    }

    if (emptyTrashConfirmationOpen) {
      if (!emptyTrashMutation.isPending) {
        setEmptyTrashConfirmationOpen(false);
      }
      return true;
    }

	    if (mobileNotebookPickerOpen) {
	      setMobileNotebookPickerOpen(false);
	      return true;
	    }

	    if (mobileListActionsOpen) {
	      setMobileListActionsOpen(false);
	      return true;
	    }

	    if (mobileMoveOpen) {
	      setMobileMoveOpen(false);
	      return true;
	    }

	    if (mobileMoreOpen) {
	      setMobileMoreOpen(false);
	      return true;
	    }

	    if (mobileSearchActive) {
	      handleCancelMobileSearch();
      return true;
    }

    if (templatesOpen) {
      handleCloseTemplates();
      return true;
    }

    if (rightView === "settings") {
      handleCloseSettings();
      return true;
    }

    if (tagsOpen) {
      setTagsOpen(false);
      return true;
    }

    if (rightView === "assets") {
      handleCloseAssets();
      return true;
    }

    if (memoSelectionModeActive) {
      clearMemoSelection();
      return true;
    }

    if (activePane === "editor" || activePane === "notebooks") {
      setActivePane("memos");
      return true;
    }

    return false;
  }, [
    activePane,
    appNoticeDialog,
    rightView,
    clearMemoSelection,
    createNotebookMutation.isPending,
    deleteMemoMutation.isPending,
    deleteMemosMutation.isPending,
    deleteNotebookMutation.isPending,
    emptyTrashConfirmationOpen,
    emptyTrashMutation.isPending,
    handleCloseAssets,
    handleCloseSettings,
    handleCloseTemplates,
    handleCancelMobileSearch,
	    memoDeleteConfirmation,
	    memoSelectionModeActive,
	    mobileListActionsOpen,
	    mobileNotebookPickerOpen,
	    mobileMoveOpen,
	    mobileMoreOpen,
	    mobileSearchActive,
    notebookDeleteConfirmation,
    notebookNameDialog,
    tagsOpen,
    templatesOpen,
    updateNotebookMutation.isPending,
  ]);

  useBrowserBackLayer(workspaceBackTargetActive, handleWorkspaceBackRequest);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isBackShortcut =
        event.key === "Escape" ||
        event.key === "BrowserBack" ||
        (!event.ctrlKey && !event.metaKey && event.altKey && event.key === "ArrowLeft");

      if (!isBackShortcut || event.defaultPrevented || isTextEntryTarget(event.target)) {
        return;
      }

      if (!handleWorkspaceBackRequest()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleWorkspaceBackRequest]);

  useEffect(() => {
    const handleWorkspaceShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "h" && key !== "n") {
        return;
      }

      const targetElement = event.target instanceof Element ? event.target : null;
      const isEditorTextTarget = Boolean(targetElement?.closest(".ProseMirror"));

      if ((key === "f" || key === "h") && isTextEntryTarget(event.target) && !isEditorTextTarget) {
        return;
      }

      const transientLayerOpen = Boolean(
        appNoticeDialog ||
          rightView !== "editor" ||
          memoDeleteConfirmation ||
          emptyTrashConfirmationOpen ||
          mobileNotebookPickerOpen ||
          notebookDeleteConfirmation ||
          notebookNameDialog ||
          tagsOpen ||
          templatesOpen
      );

      if (transientLayerOpen) {
        return;
      }

      if (key === "f") {
        event.preventDefault();
        if (event.shiftKey || !selectedMemoId || !isDesktopViewport()) {
          if (event.shiftKey) {
            setSearch("");
          }
          clearMemoSelection();
          handleMobileSearch();
          return;
        }

        setNoteSearchFocusToken((value) => value + 1);
        return;
      }

      if (key === "h") {
        if (!selectedMemoId || memoView === "trash" || !isDesktopViewport()) {
          return;
        }

        event.preventDefault();
        setNoteReplaceFocusToken((value) => value + 1);
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        if (!createNotebookMutation.isPending) {
          handleCreateNotebook(null);
        }
        return;
      }

      if (canCreateMemo && !createMemoMutation.isPending) {
        handleCreateMemo();
      }
    };

    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [
    rightView,
    appNoticeDialog,
    canCreateMemo,
    clearMemoSelection,
    createNotebookMutation.isPending,
    createMemoMutation.isPending,
    handleCreateNotebook,
    handleCreateMemo,
    handleMobileSearch,
    emptyTrashConfirmationOpen,
    memoDeleteConfirmation,
    memoView,
    mobileNotebookPickerOpen,
    notebookDeleteConfirmation,
    notebookNameDialog,
    selectedMemoId,
    tagsOpen,
    templatesOpen,
  ]);

  const handleMemoListResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDesktopViewport()) {
      return;
    }

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const startX = event.clientX;
    const startWidth = memoListWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampMemoListWidth(startWidth + moveEvent.clientX - startX);
      setMemoListWidth(nextWidth);
      writeMemoListWidthPreference(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleResetMemoListWidth = () => {
    setMemoListWidth(DEFAULT_MEMO_LIST_WIDTH_PX);
    writeMemoListWidthPreference(DEFAULT_MEMO_LIST_WIDTH_PX);
  };

  const updateMemoListWidth = (width: number) => {
    const nextWidth = clampMemoListWidth(width);
    setMemoListWidth(nextWidth);
    writeMemoListWidthPreference(nextWidth);
  };

  const handleMemoListResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isDesktopViewport()) {
      return;
    }

    const step = event.shiftKey ? 48 : 16;
    let nextWidth: number | null = null;

    if (event.key === "ArrowLeft") {
      nextWidth = memoListWidth - step;
    } else if (event.key === "ArrowRight") {
      nextWidth = memoListWidth + step;
    } else if (event.key === "Home") {
      nextWidth = MIN_MEMO_LIST_WIDTH_PX;
    } else if (event.key === "End") {
      nextWidth = MAX_MEMO_LIST_WIDTH_PX;
    } else if (event.key === "Enter" || event.key === " ") {
      nextWidth = DEFAULT_MEMO_LIST_WIDTH_PX;
    }

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateMemoListWidth(nextWidth);
  };

  const shouldRenderRightPane = isDesktop || activePane === "editor";
  const rightPaneLoadingLabel =
    rightView === "settings" ? "正在加载个人中心" : rightView === "assets" ? "正在加载资源库" : rightView === "evernote-migration" ? "正在加载迁移指引" : "正在加载编辑器";
  const pullToRefreshVisible = pullToRefreshDistance > 0 || isPullRefreshing;
  const pullToRefreshReady = pullToRefreshDistance >= PULL_TO_REFRESH_TRIGGER_PX;
  const pullToRefreshLabel = isPullRefreshing
    ? isStandaloneRuntime
      ? "正在拉取最新笔记"
      : "正在刷新网页"
    : pullToRefreshReady
      ? isStandaloneRuntime
        ? "松开刷新"
        : "松开刷新网页"
      : isStandaloneRuntime
        ? "下拉刷新"
        : "下拉刷新网页";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 text-slate-950">
      {pullToRefreshVisible && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center lg:hidden"
          style={{ transform: `translateY(${Math.max(0, pullToRefreshDistance - 24)}px)` }}
          aria-hidden="true"
        >
          <div className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 text-xs font-semibold text-slate-600 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur">
            <RefreshCw className={cn("h-4 w-4 text-slate-500", (isPullRefreshing || pullToRefreshReady) && "animate-spin")} />
            <span>{pullToRefreshLabel}</span>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <main
          className={cn(
            "grid h-[100dvh] min-h-0 grid-cols-[minmax(0,1fr)]",
            rightView === "editor"
              ? "lg:grid-cols-[260px_var(--memo-list-width)_minmax(0,1fr)]"
              : "lg:grid-cols-[260px_1fr]"
          )}
          style={{ "--memo-list-width": `${memoListWidth}px` } as CSSProperties}
        >
          <aside
            className={cn(
              "min-h-0 border-r border-slate-200 bg-white/75 backdrop-blur-lg lg:block",
              activePane === "notebooks" ? "block" : "hidden"
            )}
          >
            {(isDesktop || activePane === "notebooks") && (
              <Suspense fallback={<PaneLoadingFallback label="正在加载笔记本" />}>
                <NotebookPane
                  authRequired={authRequired}
                  user={user}
                  selectedNotebookId={selectedNotebookId}
                  view={memoView}
                  canCreateMemo={canCreateMemo}
                  isCreatingMemo={createMemoMutation.isPending}
                  onSelect={(notebookId) => {
                    navigateWorkspaceHome();
                    setMemoView("notebook");
                    setSelectedNotebookId(notebookId);
                    clearMemoSelection();
                    setRightView("editor");
                    setActivePane("memos");
                  }}
                  onCreateMemo={handleCreateMemo}
                  onCreateNotebook={handleCreateNotebook}
                  onRenameNotebook={handleRenameNotebook}
                  onDeleteNotebook={handleDeleteNotebook}
                  onMoveNotebook={handleMoveNotebook}
                  onMoveMemos={handleMoveDraggedMemos}
                  onBackToList={() => {
                    navigateWorkspaceHome();
                    if (memoView === "trash") {
                      setMemoView("notebook");
                    }
                    setSelectedNotebookId(null);
                    clearMemoSelection();
                    setRightView("editor");
                    setActivePane("memos");
                  }}
                  onLogout={onLogout}
                  isLoggingOut={isLoggingOut}
                  imageCompressionEnabled={imageCompressionEnabled}
                  onImageCompressionChange={setImageCompressionEnabled}
                  syncSummary={syncSummary}
                  isOnline={isOnline}
                  isSyncingQueuedChanges={isSyncingQueuedChanges}
                  onSyncQueuedChanges={() => void runQueuedSync()}
                  onOpenAssets={handleOpenAssets}
                  onOpenTags={handleOpenTags}
                  onOpenSettings={handleOpenSettings}
                  onOpenTrash={() => {
                    navigateWorkspaceHome();
                    setMemoView("trash");
                    setSelectedNotebookId(null);
                    setMobileBottomNavActive("home");
                    clearMemoSelection();
                    setSelectedMemoId(null);
                    setActivePane("memos");
                  }}
                  onEmptyTrash={handleEmptyTrash}
                />
              </Suspense>
            )}
          </aside>

          <section
            className={cn(
              "relative min-w-0 overflow-hidden border-r border-slate-200 bg-slate-50",
              rightView === "editor"
                ? (activePane === "memos" ? "block lg:block lg:bg-white/75 lg:backdrop-blur-lg" : "hidden lg:block lg:bg-white/75 lg:backdrop-blur-lg")
                : (activePane === "memos" ? "block lg:hidden" : "hidden lg:hidden")
            )}
          >
            <MemoListPane
              notebook={selectedNotebook}
              notebooks={notebooks}
              view={memoView}
              memos={memos}
              selectedMemoId={selectedMemoId}
              selectedMemoIds={selectedMemoIds}
              selectionMode={memoSelectionModeActive}
              search={search}
              mobileSearchActive={mobileSearchActive}
              searchFocusToken={mobileSearchFocusToken}
              canCreateMemo={canCreateMemo}
              isLoading={memosQuery.isLoading}
              isRefreshing={memosQuery.isFetching}
              isError={memosQuery.isError}
              isCreating={createMemoMutation.isPending}
              isMerging={mergeMutation.isPending}
              isMoving={moveMemosMutation.isPending}
              isPinning={pinMemosMutation.isPending}
              isDeleting={deleteMemosMutation.isPending || deleteMemoMutation.isPending}
              multiSelectKeyDown={multiSelectKeyDown}
              onRetry={() => void memosQuery.refetch()}
              onOpenNotebookPicker={() => setMobileNotebookPickerOpen(true)}
              onSearch={setSearch}
              onCancelMobileSearch={handleCancelMobileSearch}
              onCreateMemo={handleCreateMemo}
              onClearSelection={clearMemoSelection}
              onEnterSelectionMode={enterMemoSelectionMode}
              onReplaceSelection={replaceMemoSelection}
              onOpenAssets={handleOpenAssets}
              onOpenTags={handleOpenTags}
              onOpenSettings={handleOpenSettings}
              onOpenTrash={() => {
                navigateWorkspaceHome();
                setMemoView("trash");
                setSelectedNotebookId(null);
                setMobileBottomNavActive("home");
                clearMemoSelection();
                setCreatedMemoEditId(null);
                setSelectedMemoId(null);
                setActivePane("memos");
              }}
              onOpenMemo={(memoId) => {
                navigateWorkspaceHome();
                setRightView("editor");
                setCreatedMemoEditId(null);
                setSelectedMemoId(memoId);
                setActivePane("editor");
              }}
              onToggleMemo={(memoId, rangeMemoIds) => {
                setMemoSelectionMode(true);
                setSelectedMemoIds((current) => {
                  if (!rangeMemoIds?.length) {
                    return toggleMemoSelection(current, memoId);
                  }
                  const next = new Set(current);
                  for (const rangeMemoId of rangeMemoIds) {
                    next.add(rangeMemoId);
                  }
                  return next;
                });
              }}
              onMerge={handleMerge}
              onDeleteMemo={handleDeleteMemoFromList}
              onEmptyTrash={handleEmptyTrash}
              onRestoreMemo={handleRestoreMemoFromList}
              onMoveMemo={handleMoveMemoFromList}
              onTogglePinMemo={handleToggleMemoPinned}
              onPinSelectedMemos={handlePinSelectedMemos}
              onDeleteSelectedMemos={handleDeleteSelectedMemos}
              onMoveSelectedMemos={handleMoveSelectedMemos}
              mobileListActionsOpen={mobileListActionsOpen}
              setMobileListActionsOpen={setMobileListActionsOpen}
              mobileMoveOpen={mobileMoveOpen}
              setMobileMoveOpen={setMobileMoveOpen}
              mobileMoreOpen={mobileMoreOpen}
              setMobileMoreOpen={setMobileMoreOpen}
              desktopFilterOpen={desktopFilterOpen}
              setDesktopFilterOpen={setDesktopFilterOpen}
              desktopSortOpen={desktopSortOpen}
              setDesktopSortOpen={setDesktopSortOpen}
              desktopActionsOpen={desktopActionsOpen}
              setDesktopActionsOpen={setDesktopActionsOpen}
            />
            <div
              className="absolute inset-y-0 right-[-3px] z-20 hidden w-1.5 cursor-col-resize transition hover:bg-slate-300/70 focus-visible:bg-slate-400/80 focus-visible:outline-none lg:block"
              role="separator"
              aria-orientation="vertical"
              aria-valuemin={MIN_MEMO_LIST_WIDTH_PX}
              aria-valuemax={MAX_MEMO_LIST_WIDTH_PX}
              aria-valuenow={memoListWidth}
              aria-label="调整笔记列表宽度"
              tabIndex={0}
              title="拖拽调整列表栏宽度，双击恢复默认，方向键微调"
              onDoubleClick={handleResetMemoListWidth}
              onKeyDown={handleMemoListResizeKeyDown}
              onPointerDown={handleMemoListResizePointerDown}
            />
          </section>

          <section className={cn("min-h-0 min-w-0 bg-white lg:block", activePane === "editor" ? "block" : "hidden")}>
            {shouldRenderRightPane && (
              <Suspense fallback={<PaneLoadingFallback label={rightPaneLoadingLabel} />}>
                {rightView === "settings" ? (
                  <SettingsPane
                    user={user}
                    onClose={handleCloseSettings}
                    imageCompressionEnabled={imageCompressionEnabled}
                    onImageCompressionChange={setImageCompressionEnabled}
                    onLogout={onLogout}
                    isLoggingOut={isLoggingOut}
                    authRequired={authRequired}
                    onShowGuide={() => setRightView("evernote-migration")}
                  />
                ) : rightView === "assets" ? (
                  <AssetsPane onClose={handleCloseAssets} activeMemo={selectedMemo} />
                ) : rightView === "evernote-migration" ? (
                  <EvernoteImportGuidePane onClose={() => setRightView("settings")} />
                ) : (
                  <EditorPane
                    memo={selectedMemo}
                    mobileDefaultEditMemoId={createdMemoEditId}
                    isTrashView={memoView === "trash"}
                    notebooks={notebooks}
                    isLoading={memoQuery.isLoading}
                    searchFocusToken={noteSearchFocusToken}
                    replaceFocusToken={noteReplaceFocusToken}
                    imageCompressionEnabled={imageCompressionEnabled}
                    selectionActionBar={memoSelectionActionBar}
                    hasNextMemo={Boolean(nextMemoId)}
                    hasPreviousMemo={Boolean(previousMemoId)}
                    onBackToList={() => setActivePane("memos")}
                    onOpenNextMemo={() => {
                      if (nextMemoId) {
                        setCreatedMemoEditId(null);
                        setSelectedMemoId(nextMemoId);
                      }
                    }}
                    onOpenPreviousMemo={() => {
                      if (previousMemoId) {
                        setCreatedMemoEditId(null);
                        setSelectedMemoId(previousMemoId);
                      }
                    }}
                    onSaved={async (memo) => {
                      cacheMemoDetail(queryClient, memo, memoView);
                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["memos"] }),
                        queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
                      ]);
                    }}
                    onDeleted={async (memoId) => {
                      deleteMemoMutation.mutate({ memoId, permanent: false });
                    }}
                    onPermanentDeleted={async (memoId) => {
                      setMemoDeleteConfirmation({ kind: "single", memoIds: [memoId], permanent: true });
                    }}
                    onRestored={async (memoId) => {
                      await restoreMemoMutation.mutateAsync(memoId);
                    }}
                    onMobileDefaultEditConsumed={handleMobileDefaultEditConsumed}
                  />
                )}
              </Suspense>
            )}
          </section>
        </main>
      </div>

      {tagsOpen && (
        <Suspense fallback={null}>
          <TagsDialog onClose={() => setTagsOpen(false)} />
        </Suspense>
      )}
      {templatesOpen && (
        <Suspense fallback={null}>
          <TemplatesDialog
            canCreateMemo={canCreateMemo}
            isCreating={createMemoMutation.isPending}
            onClose={handleCloseTemplates}
            onCreateMemo={handleCreateMemo}
          />
        </Suspense>
      )}
      {memoDeleteConfirmation && (
        <MemoDeleteConfirmDialog
          confirmation={memoDeleteConfirmation}
          isDeleting={deleteMemosMutation.isPending || deleteMemoMutation.isPending}
          onCancel={() => setMemoDeleteConfirmation(null)}
          onConfirm={handleConfirmMemoDeletion}
        />
      )}
      {emptyTrashConfirmationOpen && (
        <AppConfirmDialog
          title="清空回收站"
          description="回收站中的全部笔记和仍关联的附件都会删除，这个操作不可恢复。"
          confirmLabel="清空回收站"
          closeOnBrowserBack={false}
          isWorking={emptyTrashMutation.isPending}
          tone="danger"
          onCancel={() => setEmptyTrashConfirmationOpen(false)}
          onConfirm={handleConfirmEmptyTrash}
        />
      )}
      {notebookNameDialog && (
        <NotebookNameDialog
          dialog={notebookNameDialog}
          isSaving={createNotebookMutation.isPending || updateNotebookMutation.isPending}
          onCancel={() => setNotebookNameDialog(null)}
          onSubmit={handleSubmitNotebookName}
        />
      )}
      {notebookDeleteConfirmation && (
        <AppConfirmDialog
          title={`删除笔记本「${notebookDeleteConfirmation.name}」`}
          description="请先清空其中的笔记和子笔记本。删除后无法从这里恢复。"
          confirmLabel="删除"
          closeOnBrowserBack={false}
          isWorking={deleteNotebookMutation.isPending}
          tone="danger"
          onCancel={() => setNotebookDeleteConfirmation(null)}
          onConfirm={() => {
            deleteNotebookMutation.mutate(notebookDeleteConfirmation.id, {
              onSuccess: () => setNotebookDeleteConfirmation(null),
            });
          }}
        />
      )}
      {appNoticeDialog && (
        <AppConfirmDialog
          title={appNoticeDialog.title}
          description={appNoticeDialog.description}
          confirmLabel="知道了"
          closeOnBrowserBack={false}
          hideCancel
          tone="neutral"
          onCancel={() => setAppNoticeDialog(null)}
          onConfirm={() => setAppNoticeDialog(null)}
        />
      )}
      {activePane !== "editor" && !memoSelectionModeActive && (
        <MobileBottomNav
          activeItem={mobileBottomNavActive}
          canCreateMemo={canCreateMemo && memoView !== "trash"}
          isCreating={createMemoMutation.isPending}
          onCreateMemo={handleCreateMemo}
          onHome={handleMobileHome}
          onOpenSettings={handleOpenSettings}
        />
      )}
      {mobileNotebookPickerOpen && (
        <MobileNotebookPicker
          currentLabel={memoView === "trash" ? "回收站" : undefined}
          notebooks={notebooks}
          selectedNotebookId={selectedNotebookId}
          onClose={() => setMobileNotebookPickerOpen(false)}
          onSelectAll={handleSelectAllMemos}
          onSelect={handleSelectNotebook}
        />
      )}
    </div>
  );
};
export default WorkspaceApp;
