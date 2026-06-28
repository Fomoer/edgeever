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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Home, Search, UserRound, Plus, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MemoListPane } from "./MemoListPane";
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

const EditorPane = lazy(() => import("./EditorPane").then((module) => ({ default: module.EditorPane })));
const AssetsPane = lazy(() => import("./AssetsPane").then((module) => ({ default: module.AssetsPane })));
const SettingsPane = lazy(() => import("./SettingsPane").then((module) => ({ default: module.SettingsPane })));
const NotebookPane = lazy(() => import("./NotebookPane").then((module) => ({ default: module.NotebookPane })));
const TagsDialog = lazy(() => import("./dialogs/TagsDialog").then((module) => ({ default: module.TagsDialog })));
const TemplatesDialog = lazy(() => import("./dialogs/TemplatesDialog").then((module) => ({ default: module.TemplatesDialog })));

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
      "flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-all duration-200",
      active ? "text-emerald-500" : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-500"
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
    className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    aria-label="移动端主导航"
  >
    <div className="relative grid h-16 grid-cols-3 items-center">
      <MobileBottomNavButton active={activeItem === "home"} icon={<Home className="h-5 w-5" />} label="首页" onClick={onHome} />
      <div aria-hidden="true" />
      <MobileBottomNavButton active={activeItem === "settings"} icon={<UserRound className="h-5 w-5" />} label="我的" onClick={onOpenSettings} />
      <button
        className="absolute left-1/2 top-[-1.35rem] flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-[6px] border-white bg-emerald-500 text-white shadow-[0_12px_26px_rgb(var(--brand-green-rgb)/0.32)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:opacity-70 disabled:hover:bg-emerald-200"
        type="button"
        title={!canCreateMemo ? "当前视图不可新建笔记" : isCreating ? "正在创建" : "新建笔记"}
        aria-label={!canCreateMemo ? "当前视图不可新建笔记" : isCreating ? "正在创建" : "新建笔记"}
        disabled={!canCreateMemo || isCreating}
        onClick={onCreateMemo}
      >
        <Plus className="h-8 w-8" />
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
              allSelected ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-800 hover:bg-slate-50"
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
                    className="rounded-md px-2 py-1 text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-700"
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
                  className="mt-3 text-sm font-semibold text-emerald-500"
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
            ? "bg-emerald-50 font-semibold text-emerald-700"
            : hasSelectedDescendant
              ? "bg-emerald-50/70 text-emerald-700 hover:bg-emerald-50"
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
  const [activePane, setActivePane] = useState<Pane>("memos");
  const [memoView, setMemoView] = useState<MemoView>("notebook");
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(new Set());
  const [memoSelectionMode, setMemoSelectionMode] = useState(false);
  const [memoDeleteConfirmation, setMemoDeleteConfirmation] = useState<MemoDeleteConfirmation | null>(null);
  const [emptyTrashConfirmationOpen, setEmptyTrashConfirmationOpen] = useState(false);
  const [notebookNameDialog, setNotebookNameDialog] = useState<NotebookNameDialogState | null>(null);
  const [notebookDeleteConfirmation, setNotebookDeleteConfirmation] = useState<Notebook | null>(null);
  const [appNoticeDialog, setAppNoticeDialog] = useState<AppNoticeDialogState | null>(null);
  const [multiSelectKeyDown, setMultiSelectKeyDown] = useState(false);
  const [imageCompressionEnabled, setImageCompressionEnabled] = useState(readImageCompressionPreference);
  const [rightView, setRightView] = useState<"editor" | "settings" | "assets">("editor");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [mobileNotebookPickerOpen, setMobileNotebookPickerOpen] = useState(false);
  const [mobileBottomNavActive, setMobileBottomNavActive] = useState<MobileBottomNavItem>("home");
  const [mobileSearchFocusToken, setMobileSearchFocusToken] = useState(0);
  const [noteSearchFocusToken, setNoteSearchFocusToken] = useState(0);
  const [noteReplaceFocusToken, setNoteReplaceFocusToken] = useState(0);
  const [memoListWidth, setMemoListWidth] = useState(readMemoListWidthPreference);
  const [search, setSearch] = useState("");
  const [syncSummary, setSyncSummary] = useState<SyncQueueSummary>(emptySyncQueueSummary);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [isDesktop, setIsDesktop] = useState(isDesktopViewport);
  const [isSyncingQueuedChanges, setIsSyncingQueuedChanges] = useState(false);

  const [mobileListActionsOpen, setMobileListActionsOpen] = useState(false);
  const [mobileMoveOpen, setMobileMoveOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);
  const [desktopSortOpen, setDesktopSortOpen] = useState(false);
  const [desktopActionsOpen, setDesktopActionsOpen] = useState(false);

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
          queryClient.setQueryData(["memo", memo.id], { memo });
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
    queryKey: ["memo", selectedMemoId, memoView],
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
    onSuccess: async (data) => {
      setMemoView("notebook");
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.setQueryData(["memo", data.memo.id], { memo: data.memo });
      setRightView("editor");
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const mergeMutation = useMutation({
    mutationFn: api.mergeMemos,
    onSuccess: async (data) => {
      clearMemoSelection();
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.setQueryData(["memo", data.memo.id], { memo: data.memo });
      setRightView("editor");
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const moveMemosMutation = useMutation({
    mutationFn: api.moveMemos,
    onSuccess: async () => {
      clearMemoSelection();
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
      await queryClient.invalidateQueries({ queryKey: ["memo"] });
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
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
      await queryClient.invalidateQueries({ queryKey: ["memo"] });
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
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
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
    onSuccess: async (data) => {
      setMemoView("notebook");
      await queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.setQueryData(["memo", data.memo.id], { memo: data.memo });
      setSelectedNotebookId(data.memo.notebookId);
      setRightView("editor");
      setSelectedMemoId(data.memo.id);
      setActivePane("editor");
    },
  });

  const selectedNotebook = notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? null;
  const selectedMemo = memoQuery.data?.memo ?? null;

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
    if (memoView !== "trash") {
      return;
    }

    setEmptyTrashConfirmationOpen(true);
  };

  const handleConfirmEmptyTrash = () => {
    emptyTrashMutation.mutate();
  };

  const handleSelectNotebook = (notebookId: string) => {
    setMemoView("notebook");
    setSelectedNotebookId(notebookId);
    setMobileBottomNavActive("home");
    clearMemoSelection();
    setMobileNotebookPickerOpen(false);
    setActivePane("memos");
  };

  const handleSelectAllMemos = () => {
    setMemoView("notebook");
    setSelectedNotebookId(null);
    setMobileBottomNavActive("home");
    clearMemoSelection();
    setMobileNotebookPickerOpen(false);
    setActivePane("memos");
  };

  const handleMobileHome = () => {
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
    setRightView("settings");
    setActivePane("editor");
  };

  const handleCloseAssets = () => {
    setRightView("editor");
    setMobileBottomNavActive("home");
  };

  const handleCloseTemplates = () => {
    setTemplatesOpen(false);
    setMobileBottomNavActive("home");
  };

  const handleCloseSettings = () => {
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
    rightView === "settings" ? "正在加载个人中心" : rightView === "assets" ? "正在加载资源库" : "正在加载编辑器";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-emerald-50 text-slate-950">
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
                    setMemoView("trash");
                    setSelectedNotebookId(null);
                    setMobileBottomNavActive("home");
                    clearMemoSelection();
                    setSelectedMemoId(null);
                    setActivePane("memos");
                  }}
                />
              </Suspense>
            )}
          </aside>

          <section
            className={cn(
              "relative min-w-0 overflow-hidden border-r border-slate-200 bg-[#f8faf8]",
              rightView === "editor"
                ? (activePane === "memos" ? "block lg:block lg:bg-white/75 lg:backdrop-blur-lg" : "hidden lg:block lg:bg-white/75 lg:backdrop-blur-lg")
                : (activePane === "memos" ? "block lg:hidden" : "hidden lg:hidden")
            )}
          >
            <MemoListPane
              notebook={selectedNotebook}
              notebooks={notebooks}
              user={user}
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
              isCreating={createMemoMutation.isPending}
              isMerging={mergeMutation.isPending}
              isMoving={moveMemosMutation.isPending}
              isPinning={pinMemosMutation.isPending}
              isDeleting={deleteMemosMutation.isPending || deleteMemoMutation.isPending}
              isOnline={isOnline}
              isSyncingQueuedChanges={isSyncingQueuedChanges}
              multiSelectKeyDown={multiSelectKeyDown}
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
                setMemoView("trash");
                setSelectedNotebookId(null);
                setMobileBottomNavActive("home");
                clearMemoSelection();
                setSelectedMemoId(null);
                setActivePane("memos");
              }}
              onOpenMemo={(memoId) => {
                setRightView("editor");
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
              onSyncQueuedChanges={() => void runQueuedSync()}
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
              className="absolute inset-y-0 right-[-3px] z-20 hidden w-1.5 cursor-col-resize transition hover:bg-emerald-300/70 focus-visible:bg-emerald-400/80 focus-visible:outline-none lg:block"
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
                  />
                ) : rightView === "assets" ? (
                  <AssetsPane onClose={handleCloseAssets} />
                ) : (
                  <EditorPane
                    memo={selectedMemo}
                    isTrashView={memoView === "trash"}
                    notebooks={notebooks}
                    isLoading={memoQuery.isLoading}
                    searchFocusToken={noteSearchFocusToken}
                    replaceFocusToken={noteReplaceFocusToken}
                    imageCompressionEnabled={imageCompressionEnabled}
                    hasNextMemo={Boolean(nextMemoId)}
                    hasPreviousMemo={Boolean(previousMemoId)}
                    onBackToList={() => setActivePane("memos")}
                    onOpenNextMemo={() => {
                      if (nextMemoId) {
                        setSelectedMemoId(nextMemoId);
                      }
                    }}
                    onOpenPreviousMemo={() => {
                      if (previousMemoId) {
                        setSelectedMemoId(previousMemoId);
                      }
                    }}
                    onSaved={async (memo) => {
                      queryClient.setQueryData(["memo", memo.id], { memo });
                      await queryClient.invalidateQueries({ queryKey: ["memos"] });
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
          description="回收站中的全部笔记和仍关联的附件会被物理删除，这个操作不可恢复。"
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
