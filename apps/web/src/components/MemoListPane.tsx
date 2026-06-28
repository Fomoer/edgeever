import {
  lazy,
  Suspense,
  useState,
  useMemo,
  useRef,
  useEffect,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  MoreHorizontal,
  Tags,
  Archive,
  Trash2,
  KeyRound,
  CheckSquare,
  ArrowDownWideNarrow,
  LayoutList,
  List,
  FileText as FileIcon,
  Star,
  RotateCcw,
  Folder,
  Merge,
  FilePlus2,
  Compass,
  Layers,
  Settings,
  MoreVertical,
  RefreshCw,
  CheckCircle2,
  TagX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubRepositoryLink } from "@/components/GitHubRepositoryLink";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MemoCard } from "./MemoCard";
import { cn } from "@/lib/utils";
import type { Notebook, AuthUser, MemoSummary } from "@edgeever/shared";
import type {
  MemoFilterMode,
  MemoSortMode,
  MemoListDensity,
  MemoContextMenuState,
  MemoSelectionContextMenuState,
} from "@/lib/app-helpers";
import type { SyncQueueSummary } from "@/lib/sync-queue";
import {
  MEMO_FILTER_OPTIONS,
  MEMO_SORT_OPTIONS,
  filterMemos,
  sortMemos,
  groupMemos,
  getNotebookMoveOptions,
  readMemoListDensityPreference,
  writeMemoListDensityPreference,
} from "@/lib/app-helpers";

const isDesktopViewport = () => window.matchMedia("(min-width: 1024px)").matches;

const MobileListActionsSheet = lazy(() =>
  import("./MemoListMobileSheets").then((module) => ({ default: module.MobileListActionsSheet }))
);
const MobileMoveSheet = lazy(() =>
  import("./MemoListMobileSheets").then((module) => ({ default: module.MobileMoveSheet }))
);
const MobileSelectionMoreSheet = lazy(() =>
  import("./MemoListMobileSheets").then((module) => ({ default: module.MobileSelectionMoreSheet }))
);

const getSelectionCountLabel = (count: number) => (count > 0 ? `已选择 ${count} 条` : "选择笔记");

const getMobileFilterIcon = (filterMode: MemoFilterMode) => {
  if (filterMode === "tagged") {
    return <Tags className="h-4 w-4" />;
  }
  if (filterMode === "untagged") {
    return <TagX className="h-4 w-4" />;
  }
  if (filterMode === "pinned") {
    return <Star className="h-4 w-4" />;
  }
  return <LayoutList className="h-4 w-4" />;
};

const MobileSelectionActionButton = ({
  disabled = false,
  icon,
  label,
  title = label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
}) => (
  <button
    className="flex h-12 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-100 disabled:hover:bg-transparent"
    type="button"
    disabled={disabled}
    title={title}
    aria-label={title}
    onClick={onClick}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const MobileSelectionActionBar = ({
  canDelete,
  canMove,
  deleteTitle,
  isTrashView,
  moveTitle,
  onDelete,
  onOpenMore,
  onOpenMove,
}: {
  canDelete: boolean;
  canMove: boolean;
  deleteTitle: string;
  isTrashView: boolean;
  moveTitle: string;
  onDelete: () => void;
  onOpenMore: () => void;
  onOpenMove: () => void;
}) => (
  <nav
    className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    aria-label="批量操作"
  >
    <div className="grid h-14 grid-cols-3 items-center">
      <MobileSelectionActionButton
        disabled={!canMove}
        icon={<Folder className="h-5 w-5" />}
        label="移动"
        title={moveTitle}
        onClick={onOpenMove}
      />
      <MobileSelectionActionButton
        disabled={!canDelete}
        icon={<Trash2 className="h-5 w-5" />}
        label={isTrashView ? "永久删除" : "删除"}
        title={deleteTitle}
        onClick={onDelete}
      />
      <MobileSelectionActionButton icon={<MoreVertical className="h-5 w-5" />} label="更多" onClick={onOpenMore} />
    </div>
  </nav>
);

const CheckCircleCheck = ({ className }: { className?: string }) => (
  <svg
    className={cn("h-4 w-4 fill-current", className)}
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

const MobileHomeHeader = ({
  user,
  isOnline,
  isSyncingQueuedChanges,
  onSyncQueuedChanges,
}: {
  user: AuthUser | null;
  isOnline: boolean;
  isSyncingQueuedChanges: boolean;
  onSyncQueuedChanges: () => void;
}) => (
  <div className="mb-2 flex h-7 items-center justify-between lg:hidden">
    <div className="flex items-center gap-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
        {user?.username?.[0]?.toUpperCase() ?? "E"}
      </span>
      <span className="text-sm font-semibold text-slate-900">EdgeEver</span>
    </div>
    <div className="flex items-center gap-1">
      <button
        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        type="button"
        title="立即同步"
        disabled={!isOnline || isSyncingQueuedChanges}
        onClick={onSyncQueuedChanges}
      >
        <RefreshCw className={cn("h-4 w-4", isSyncingQueuedChanges && "animate-spin")} />
      </button>
      <GitHubRepositoryLink className="flex h-7 w-7 justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70" iconClassName="h-4 w-4" />
    </div>
  </div>
);

export const MemoListPane = ({
  user,
  notebooks,
  notebook,
  memos,
  selectedMemoId,
  selectedMemoIds,
  selectionMode,
  isCreating,
  canCreateMemo,
  isPinning,
  isMoving,
  isMerging,
  isDeleting,
  view,
  search,
  searchFocusToken,
  mobileSearchActive,
  isOnline,
  isSyncingQueuedChanges,
  onOpenMemo,
  onDeleteMemo,
  onRestoreMemo,
  onTogglePinMemo,
  onMoveMemo,
  onMoveSelectedMemos,
  onPinSelectedMemos,
  onDeleteSelectedMemos,
  onEmptyTrash,
  onMerge,
  onEnterSelectionMode,
  onClearSelection,
  onToggleMemo,
  onReplaceSelection,
  onSearch,
  onCancelMobileSearch,
  onOpenNotebookPicker,
  onOpenTags,
  onOpenAssets,
  onOpenTrash,
  onOpenSettings,
  onCreateMemo,
  onSyncQueuedChanges,
  mobileListActionsOpen,
  setMobileListActionsOpen,
  mobileMoveOpen,
  setMobileMoveOpen,
  mobileMoreOpen,
  setMobileMoreOpen,
  desktopFilterOpen,
  setDesktopFilterOpen,
  desktopSortOpen,
  setDesktopSortOpen,
  desktopActionsOpen,
  setDesktopActionsOpen,
  isLoading,
  multiSelectKeyDown,
}: {
  isLoading: boolean;
  multiSelectKeyDown: boolean;
  user: AuthUser | null;
  notebooks: Notebook[];
  notebook: Notebook | null;
  memos: MemoSummary[];
  selectedMemoId: string | null;
  selectedMemoIds: Set<string>;
  selectionMode: boolean;
  isCreating: boolean;
  canCreateMemo: boolean;
  isPinning: boolean;
  isMoving: boolean;
  isMerging: boolean;
  isDeleting: boolean;
  view: string;
  search: string;
  searchFocusToken: number;
  mobileSearchActive: boolean;
  isOnline: boolean;
  isSyncingQueuedChanges: boolean;
  onOpenMemo: (memoId: string) => void;
  onDeleteMemo: (memoId: string) => void;
  onRestoreMemo: (memoId: string) => void;
  onTogglePinMemo: (memo: MemoSummary) => void;
  onMoveMemo: (memoId: string, notebookId: string) => void;
  onMoveSelectedMemos: (notebookId: string) => void;
  onPinSelectedMemos: (pinned: boolean) => void;
  onDeleteSelectedMemos: () => void;
  onEmptyTrash: () => void;
  onMerge: () => void;
  onEnterSelectionMode: () => void;
  onClearSelection: () => void;
  onToggleMemo: (memoId: string, rangeIds?: string[]) => void;
  onReplaceSelection: (memoIds: string[]) => void;
  onSearch: (query: string) => void;
  onCancelMobileSearch: () => void;
  onOpenNotebookPicker: () => void;
  onOpenTags: () => void;
  onOpenAssets: () => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
  onCreateMemo: () => void;
  onSyncQueuedChanges: () => void;
  mobileListActionsOpen: boolean;
  setMobileListActionsOpen: (open: boolean) => void;
  mobileMoveOpen: boolean;
  setMobileMoveOpen: (open: boolean) => void;
  mobileMoreOpen: boolean;
  setMobileMoreOpen: (open: boolean) => void;
  desktopFilterOpen: boolean;
  setDesktopFilterOpen: (open: boolean) => void;
  desktopSortOpen: boolean;
  setDesktopSortOpen: (open: boolean) => void;
  desktopActionsOpen: boolean;
  setDesktopActionsOpen: (open: boolean) => void;
}) => {
  const [memoContextMenu, setMemoContextMenu] = useState<MemoContextMenuState | null>(null);
  const [selectionContextMenu, setSelectionContextMenu] = useState<MemoSelectionContextMenuState | null>(null);
  const [contextMoveOpen, setContextMoveOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<MemoFilterMode>("all");
  const [sortMode, setSortMode] = useState<MemoSortMode>("updated-desc");
  const [listDensity, setListDensity] = useState<MemoListDensity>(() => readMemoListDensityPreference());
  const [lastSelectedMemoId, setLastSelectedMemoId] = useState<string | null>(null);
  const [moveTargetNotebookId, setMoveTargetNotebookId] = useState("");

  const filterOptions = MEMO_FILTER_OPTIONS;
  const mobileFilterOptions = useMemo(() => filterOptions.filter((option: any) => option.value !== "all"), [filterOptions]);
  const filteredMemos = useMemo(() => filterMemos(memos, filterMode), [filterMode, memos]);
  const sortedMemos = useMemo(() => sortMemos(filteredMemos, sortMode, view !== "trash"), [filteredMemos, sortMode, view]);
  const visibleMemoIds = useMemo(() => sortedMemos.map((memo) => memo.id), [sortedMemos]);
  const memoGroups = useMemo(() => groupMemos(sortedMemos, sortMode), [sortedMemos, sortMode]);
  const moveNotebookOptions = useMemo(() => getNotebookMoveOptions(notebooks), [notebooks]);
  const selectedMemosInList = useMemo(() => memos.filter((memo) => selectedMemoIds.has(memo.id)), [memos, selectedMemoIds]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const moveTargetSelectRef = useRef<HTMLSelectElement | null>(null);
  const previousSelectionModeRef = useRef(selectionMode);
  const skipSelectedMemoAutoScrollRef = useRef(false);

  const canEnterSelectionMode = visibleMemoIds.length > 0;
  const selectedVisibleMemoCount = visibleMemoIds.filter((memoId) => selectedMemoIds.has(memoId)).length;
  const allVisibleMemosSelected = visibleMemoIds.length > 0 && selectedVisibleMemoCount === visibleMemoIds.length;
  const canToggleVisibleMemoSelection = visibleMemoIds.length > 0;
  const visibleSelectionToggleLabel = allVisibleMemosSelected ? "全不选当前列表" : "全选当前列表";

  const listTitle = view === "trash" ? "回收站" : notebook?.name ?? "全部笔记";
  const listContextLabel = view === "trash" ? "已删除笔记" : notebook ? "当前笔记本" : "所有笔记本";
  const listCountLabel = `${filteredMemos.length}${filterMode !== "all" ? ` / ${memos.length}` : ""} ${
    view === "trash" ? "条已删除" : "条笔记"
  }`;
  const selectionCountLabel = getSelectionCountLabel(selectedMemoIds.size);

  const selectionMoveTitle =
    selectedMemoIds.size === 0
      ? "请选择笔记"
      : view === "trash"
        ? "回收站内不可移动"
        : notebooks.length === 0
          ? "没有可移动的笔记本"
          : isMoving
            ? "正在移动"
            : "移动";
  const selectionDeleteTitle =
    selectedMemoIds.size === 0 ? "请选择笔记" : isDeleting ? "正在删除" : view === "trash" ? "永久删除" : "删除";
  const selectionMergeTitle =
    selectedMemoIds.size < 2 ? "至少选择 2 条笔记" : view === "trash" ? "回收站内不可合并" : isMerging ? "正在合并" : "合并笔记";
  const allSelectedMemosPinned = selectedMemosInList.length > 0 && selectedMemosInList.every((memo) => memo.isPinned);
  const selectedPinTarget = !allSelectedMemosPinned;
  const selectionPinLabel = allSelectedMemosPinned ? "取消置顶" : "置顶";
  const selectionPinTitle =
    selectedMemoIds.size === 0
      ? "请选择笔记"
      : view === "trash"
        ? "回收站内不可置顶"
        : isPinning
          ? "正在更新置顶"
          : selectionPinLabel;
  const selectionToggleTitle = canToggleVisibleMemoSelection ? visibleSelectionToggleLabel : "当前列表没有可选择的笔记";
  const moveTargetTitle =
    view === "trash" ? "回收站内不可移动" : notebooks.length === 0 ? "没有可移动的笔记本" : isMoving ? "正在移动" : "移动到笔记本";
  const hasListConstraint = Boolean(search.trim()) || filterMode !== "all";
  const activeFilterLabel = filterOptions.find((option) => option.value === filterMode)?.label ?? "全部";
  const activeSortLabel = MEMO_SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? "最近更新";

  useEffect(() => {
    if (notebook?.id) {
      setMoveTargetNotebookId(notebook.id);
      return;
    }

    if (!moveTargetNotebookId && moveNotebookOptions[0]?.id) {
      setMoveTargetNotebookId(moveNotebookOptions[0].id);
    }
  }, [moveNotebookOptions, moveTargetNotebookId, notebook?.id]);

  useEffect(() => {
    if (searchFocusToken === 0) {
      return;
    }

    if (mobileSearchActive && !isDesktopViewport()) {
      mobileSearchInputRef.current?.focus();
      return;
    }

    searchInputRef.current?.focus();
  }, [mobileSearchActive, searchFocusToken]);

  useEffect(() => {
    if (!filterOptions.some((option) => option.value === filterMode)) {
      setFilterMode("all");
    }
  }, [filterMode, filterOptions]);

  useEffect(() => {
    const scrollContainer = listScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    skipSelectedMemoAutoScrollRef.current = true;
    scrollContainer.scrollTo({ top: 0, behavior: "auto" });

    const resetSkipTimer = window.setTimeout(() => {
      skipSelectedMemoAutoScrollRef.current = false;
    }, 0);

    return () => window.clearTimeout(resetSkipTimer);
  }, [filterMode, notebook?.id, search, sortMode, view]);

  useEffect(() => {
    if (!selectionMode || selectedMemoIds.size === 0) {
      return;
    }

    const visibleMemoIdSet = new Set(visibleMemoIds);
    const nextSelectedMemoIds = Array.from(selectedMemoIds).filter((memoId) => visibleMemoIdSet.has(memoId));

    if (nextSelectedMemoIds.length === selectedMemoIds.size) {
      return;
    }

    if (nextSelectedMemoIds.length === 0) {
      onClearSelection();
      return;
    }

    onReplaceSelection(nextSelectedMemoIds);
  }, [onClearSelection, onReplaceSelection, selectedMemoIds, selectionMode, visibleMemoIds]);

  useEffect(() => {
    if (!selectedMemoId || !visibleMemoIds.includes(selectedMemoId) || !isDesktopViewport()) {
      return;
    }

    if (skipSelectedMemoAutoScrollRef.current) {
      skipSelectedMemoAutoScrollRef.current = false;
      return;
    }

    const scrollContainer = listScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const escapedMemoId = CSS.escape(selectedMemoId);
    const selectedNode = scrollContainer.querySelector<HTMLElement>(`[data-memo-id="${escapedMemoId}"]`);

    if (!selectedNode) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const selectedRect = selectedNode.getBoundingClientRect();
    const stickyHeaderOffset = 40;

    if (selectedRect.top < containerRect.top + stickyHeaderOffset) {
      scrollContainer.scrollTop -= containerRect.top + stickyHeaderOffset - selectedRect.top;
      return;
    }

    if (selectedRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += selectedRect.bottom - containerRect.bottom;
    }
  }, [selectedMemoId, visibleMemoIds]);

  useEffect(() => {
    const wasSelectionMode = previousSelectionModeRef.current;
    previousSelectionModeRef.current = selectionMode;

    if (!wasSelectionMode || selectionMode || !isDesktopViewport()) {
      return;
    }

    const activeElement = document.activeElement;
    const listRoot = listRootRef.current;
    const shouldRestoreFocus =
      !activeElement ||
      activeElement === document.body ||
      (activeElement instanceof HTMLElement && Boolean(listRoot?.contains(activeElement)));

    if (!shouldRestoreFocus) {
      return;
    }

    const memoIdToFocus = lastSelectedMemoId ?? selectedMemoId ?? visibleMemoIds[0];

    if (!memoIdToFocus) {
      return;
    }

    window.setTimeout(() => {
      const scrollContainer = listScrollRef.current;
      if (!scrollContainer) {
        return;
      }

      const escapedMemoId = CSS.escape(memoIdToFocus);
      const memoButton = scrollContainer.querySelector<HTMLButtonElement>(
        `[data-memo-id="${escapedMemoId}"] button[title^="Ctrl/Cmd"]`
      );
      memoButton?.focus({ preventScroll: true });
    }, 0);
  }, [lastSelectedMemoId, selectedMemoId, selectionMode, visibleMemoIds]);

  useEffect(() => {
    if (!selectionMode) {
      setMobileMoveOpen(false);
      setMobileMoreOpen(false);
      return;
    }

    setDesktopActionsOpen(false);
    setDesktopFilterOpen(false);
    setDesktopSortOpen(false);
    setContextMoveOpen(false);
    setMemoContextMenu(null);
    setSelectionContextMenu(null);
    setMobileListActionsOpen(false);
    setMobileMoveOpen(false);
    setMobileMoreOpen(false);
  }, [selectionMode, setDesktopActionsOpen, setDesktopFilterOpen, setDesktopSortOpen, setMobileListActionsOpen, setMobileMoreOpen, setMobileMoveOpen]);

  const handleToggleMemo = (memoId: string, event?: MouseEvent<HTMLElement>) => {
    const currentIndex = visibleMemoIds.indexOf(memoId);
    const anchorIndex = lastSelectedMemoId ? visibleMemoIds.indexOf(lastSelectedMemoId) : -1;

    if (event?.shiftKey && currentIndex >= 0 && anchorIndex >= 0) {
      const start = Math.min(currentIndex, anchorIndex);
      const end = Math.max(currentIndex, anchorIndex);
      onToggleMemo(memoId, visibleMemoIds.slice(start, end + 1));
    } else {
      onToggleMemo(memoId);
    }

    setLastSelectedMemoId(memoId);
  };

  const handleSelectAllVisibleMemos = () => {
    if (visibleMemoIds.length === 0) {
      return;
    }

    onReplaceSelection(visibleMemoIds);
    setLastSelectedMemoId(visibleMemoIds.at(-1) ?? visibleMemoIds[0]);
  };

  const handleClearVisibleMemos = () => {
    const nextSelectedMemoIds = Array.from(selectedMemoIds).filter((memoId) => !visibleMemoIds.includes(memoId));
    onReplaceSelection(nextSelectedMemoIds);
    setLastSelectedMemoId(null);
  };

  const openMemoContextMenuAt = (memo: MemoSummary, clientX: number, clientY: number) => {
    const menuWidth = 224;
    const menuHeight = view === "trash" ? 160 : 260;
    const x = Math.min(clientX, Math.max(12, window.innerWidth - menuWidth - 12));
    const y = Math.min(clientY, Math.max(12, window.innerHeight - menuHeight - 12));

    setContextMoveOpen(false);
    setSelectionContextMenu(null);
    setMemoContextMenu({ memo, x, y });
  };

  const openSelectionContextMenuAt = (clientX: number, clientY: number) => {
    const menuWidth = 224;
    const menuHeight = view === "trash" ? 128 : 272;
    const x = Math.min(clientX, Math.max(12, window.innerWidth - menuWidth - 12));
    const y = Math.min(clientY, Math.max(12, window.innerHeight - menuHeight - 12));

    setContextMoveOpen(false);
    setMemoContextMenu(null);
    setSelectionContextMenu({ x, y });
  };

  const handleOpenMemoContextMenu = (memo: MemoSummary, event: MouseEvent<HTMLElement>) => {
    openMemoContextMenuAt(memo, event.clientX, event.clientY);
  };

  const handleOpenSelectionContextMenu = (memo: MemoSummary, event: MouseEvent<HTMLElement>) => {
    if (!isDesktopViewport()) {
      return;
    }

    if (!selectedMemoIds.has(memo.id)) {
      handleToggleMemo(memo.id, event);
    }

    openSelectionContextMenuAt(event.clientX, event.clientY);
  };

  const handleOpenSelectionKeyboardContextMenu = (memo: MemoSummary, target: HTMLElement) => {
    if (!isDesktopViewport()) {
      return;
    }

    if (!selectedMemoIds.has(memo.id)) {
      handleToggleMemo(memo.id);
    }

    const rect = target.getBoundingClientRect();
    openSelectionContextMenuAt(rect.left + Math.min(rect.width, 224), rect.top + Math.min(rect.height, 96));
  };

  const handleOpenMemoKeyboardContextMenu = (memo: MemoSummary, target: HTMLElement) => {
    if (!isDesktopViewport()) {
      return;
    }

    const rect = target.getBoundingClientRect();
    openMemoContextMenuAt(memo, rect.left + Math.min(rect.width, 224), rect.top + Math.min(rect.height, 96));
  };

  const focusSearchInput = () => {
    if (mobileSearchActive && !isDesktopViewport()) {
      mobileSearchInputRef.current?.focus();
      return;
    }

    searchInputRef.current?.focus();
  };

  const handleClearSearch = () => {
    onClearSelection();
    onSearch("");
    focusSearchInput();
  };

  const handleSearchChange = (value: string) => {
    if (value !== search) {
      onClearSelection();
    }
    onSearch(value);
  };

  const handleResetListConstraints = () => {
    onClearSelection();
    setFilterMode("all");
    onSearch("");
    focusSearchInput();
  };

  const handleFilterModeChange = (value: MemoFilterMode) => {
    onClearSelection();
    setFilterMode(value);
  };

  const handleListDensityChange = (value: MemoListDensity) => {
    setListDensity(value);
    writeMemoListDensityPreference(value);
  };

  const handleMoveTargetSelectKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      listRootRef.current?.focus();
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    if (selectedMemoIds.size === 0 || !moveTargetNotebookId || isMoving || view === "trash") {
      return;
    }

    event.preventDefault();
    onMoveSelectedMemos(moveTargetNotebookId);
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isDesktopViewport()) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;

    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    if (event.key === "Escape" && selectionMode) {
      event.preventDefault();
      event.stopPropagation();
      setMemoContextMenu(null);
      setSelectionContextMenu(null);
      onClearSelection();
      setLastSelectedMemoId(null);
      return;
    }

    if (!event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      if (visibleMemoIds.length === 0) {
        return;
      }
      event.preventDefault();
      setMemoContextMenu(null);
      setSelectionContextMenu(null);
      handleSelectAllVisibleMemos();
      return;
    }

    if (!event.altKey && (event.ctrlKey || event.metaKey) && (event.key === "Delete" || event.key === "Backspace")) {
      if (selectionMode && selectedMemoIds.size > 0) {
        event.preventDefault();
        setMemoContextMenu(null);
        setSelectionContextMenu(null);
        onDeleteSelectedMemos();
        return;
      }

      if (!selectedMemoId || !visibleMemoIds.includes(selectedMemoId)) {
        return;
      }

      event.preventDefault();
      setMemoContextMenu(null);
      setSelectionContextMenu(null);
      onDeleteMemo(selectedMemoId);
      return;
    }
  };

  return (
    <div
      ref={listRootRef}
      className="relative flex h-full min-h-0 flex-col outline-none"
      tabIndex={0}
      onKeyDown={handleListKeyDown}
    >
      <header className="border-b border-slate-200 bg-emerald-50 px-4 pb-2 pt-[max(0.375rem,env(safe-area-inset-bottom))] lg:bg-white lg:py-3 lg:pt-3">
        {selectionMode ? (
          <div className="mb-3 flex h-10 min-w-0 items-center gap-3 lg:hidden">
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              type="button"
              title="取消选择"
              aria-label="取消选择"
              onClick={onClearSelection}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 truncate text-lg font-semibold text-slate-900">{selectionCountLabel}</div>
          </div>
        ) : mobileSearchActive ? (
          <div className="mb-3 flex h-10 min-w-0 items-center gap-2 lg:hidden">
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              type="button"
              title="退出搜索"
              aria-label="退出搜索"
              onClick={onCancelMobileSearch}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 text-sm text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
              <Search className="h-4 w-4 shrink-0" />
              <input
                ref={mobileSearchInputRef}
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") {
                    return;
                  }

                  event.preventDefault();
                  if (search) {
                    handleClearSearch();
                    return;
                  }
                  onCancelMobileSearch();
                }}
                className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="搜索笔记"
              />
              {search && (
                <button
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  type="button"
                  title="清空搜索"
                  aria-label="清空搜索"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleClearSearch}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              className="h-9 shrink-0 rounded-md px-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-900"
              type="button"
              onClick={onCancelMobileSearch}
            >
              取消
            </button>
          </div>
        ) : (
          <MobileHomeHeader
            isOnline={isOnline}
            isSyncingQueuedChanges={isSyncingQueuedChanges}
            user={user}
            onSyncQueuedChanges={onSyncQueuedChanges}
          />
        )}

        {!mobileSearchActive && (
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <button
                className="flex min-w-0 items-center gap-1 rounded-md px-1 py-1 text-left transition hover:bg-slate-100 lg:hidden"
                type="button"
                title="切换笔记本"
                aria-label="切换笔记本"
                onClick={onOpenNotebookPicker}
              >
                <span className="max-w-[190px] truncate text-lg font-semibold text-slate-950">{listTitle}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            </div>
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              type="button"
              title={selectionMode ? "批量操作" : "列表选项"}
              aria-label={selectionMode ? "批量操作" : "列表选项"}
              aria-expanded={selectionMode ? mobileMoreOpen : mobileListActionsOpen}
              onClick={() => {
                if (selectionMode) {
                  setMobileMoreOpen(true);
                  return;
                }
                setMobileListActionsOpen(true);
              }}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="mb-3 hidden min-w-0 lg:block">
          <div className="truncate text-lg font-semibold leading-6 text-slate-950">{listTitle}</div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {listContextLabel} · {listCountLabel}
          </div>
        </div>

        <div className="mb-3 hidden items-center justify-between gap-2 lg:flex">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              title="选择笔记"
              aria-label="选择笔记"
              onClick={onEnterSelectionMode}
              disabled={!canEnterSelectionMode}
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium transition-all duration-200 outline-none",
                    filterMode === "all"
                      ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  )}
                  title={`筛选：${activeFilterLabel}`}
                >
                  {getMobileFilterIcon(filterMode)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44 bg-white border border-slate-200 rounded-md py-1 shadow-md">
                {filterOptions.map((option: any) => (
                  <DropdownMenuItem
                    key={option.value}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 px-3 text-left text-sm cursor-pointer outline-none",
                      filterMode === option.value ? "text-emerald-700 bg-emerald-50/50" : "text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => handleFilterModeChange(option.value)}
                  >
                    {getMobileFilterIcon(option.value)}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 outline-none"
                  title={`排序：${activeSortLabel}`}
                >
                  <ArrowDownWideNarrow className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44 bg-white border border-slate-200 rounded-md py-1 shadow-md">
                {MEMO_SORT_OPTIONS.map((option: any) => (
                  <DropdownMenuItem
                    key={option.value}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 px-3 text-left text-sm cursor-pointer outline-none",
                      sortMode === option.value ? "text-emerald-700 bg-emerald-50/50" : "text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => setSortMode(option.value)}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <ToggleGroup
              className="h-8 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white"
              type="single"
              value={listDensity}
              onValueChange={(value) => {
                if (value) {
                  handleListDensityChange(value as MemoListDensity);
                }
              }}
            >
              <ToggleGroupItem
                className="rounded-none border-0"
                size="icon"
                title="预览列表"
                value="preview"
                aria-label="预览列表"
              >
                <LayoutList className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                className="rounded-none border-0 border-l border-slate-200"
                size="icon"
                title="紧凑列表"
                value="compact"
                aria-label="紧凑列表"
              >
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {view === "trash" && (
              <Button
                size="sm"
                variant="danger"
                title="物理删除回收站中的全部笔记"
                onClick={onEmptyTrash}
              >
                <Trash2 className="h-4 w-4" />
                清空
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  title="更多"
                  aria-label="列表更多操作"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-white border border-slate-200 rounded-md py-1 shadow-md">
                <DropdownMenuItem
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                  onClick={onOpenTags}
                >
                  <Tags className="h-4 w-4 text-emerald-700" />
                  标签
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                  onClick={onOpenAssets}
                >
                  <Archive className="h-4 w-4 text-emerald-700" />
                  附件
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                  onClick={view === "trash" ? onEmptyTrash : onOpenTrash}
                >
                  <Trash2 className="h-4 w-4 text-rose-700" />
                  {view === "trash" ? "清空回收站" : "回收站"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                  onClick={onOpenSettings}
                >
                  <KeyRound className="h-4 w-4 text-emerald-700" />
                  MCP Token
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className={cn("items-center gap-2", mobileSearchActive ? "hidden lg:flex" : "flex")}>
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent bg-slate-100 px-3 text-sm text-slate-500 transition focus-within:border-emerald-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/15 lg:rounded-md lg:border-slate-200 lg:bg-slate-50">
            <Search className="h-4 w-4" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && search) {
                  event.preventDefault();
                  handleClearSearch();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="搜索笔记"
            />
            {search && (
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
                type="button"
                title="清空搜索"
                aria-label="清空搜索"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleClearSearch}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            {mobileFilterOptions.map((option: any) => (
              <button
                key={option.value}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border transition",
                  filterMode === option.value
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_rgb(var(--brand-green-rgb)/0.22)]"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}
                type="button"
                title={filterMode === option.value ? `取消${option.label}` : option.label}
                aria-label={filterMode === option.value ? `取消${option.label}` : option.label}
                aria-pressed={filterMode === option.value}
                onClick={() => handleFilterModeChange(filterMode === option.value ? "all" : option.value)}
              >
                {getMobileFilterIcon(option.value)}
              </button>
            ))}
          </div>
        </div>

        {hasListConstraint && (
          <div className="mt-3 flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            <span className="min-w-0 flex-1 truncate">
              {search.trim() ? `搜索「${search.trim()}」` : `筛选：${activeFilterLabel}`} · {filteredMemos.length} 条
            </span>
            <button
              className="shrink-0 font-semibold text-emerald-700 transition hover:text-emerald-900"
              type="button"
              onClick={handleResetListConstraints}
            >
              重置
            </button>
          </div>
        )}
      </header>

      <div
        ref={listScrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-3"
      >
        {selectionMode && (
          <div className="sticky top-0 z-10 mb-3 hidden flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-panel lg:flex">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckSquare className="h-4 w-4 text-emerald-500" />
              {selectionCountLabel}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                title={selectionToggleTitle}
                onClick={allVisibleMemosSelected ? handleClearVisibleMemos : handleSelectAllVisibleMemos}
                disabled={!canToggleVisibleMemoSelection}
              >
                <CheckSquare className="h-4 w-4" />
                {allVisibleMemosSelected ? "全不选" : "全选"}
              </Button>
              <Button size="sm" variant="ghost" title="取消选择" onClick={onClearSelection}>
                <X className="h-4 w-4" />
                取消
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={selectionPinTitle}
                onClick={() => onPinSelectedMemos(selectedPinTarget)}
                disabled={selectedMemoIds.size === 0 || isPinning || view === "trash"}
              >
                <Star className="h-4 w-4" />
                {selectionPinLabel}
              </Button>
              {view !== "trash" && notebooks.length > 0 && (
                <Select
                  value={moveTargetNotebookId}
                  disabled={isMoving}
                  onValueChange={(value) => setMoveTargetNotebookId(value)}
                >
                  <SelectTrigger className="h-8 max-w-40 text-xs text-slate-700 border-slate-200">
                    <SelectValue placeholder="选择笔记本" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-white border border-slate-200 rounded-md py-1 shadow-md">
                    {moveNotebookOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id} disabled={item.id === notebook?.id}>
                        {item.selectLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                variant="soft"
                title={selectionMoveTitle}
                onClick={() => onMoveSelectedMemos(moveTargetNotebookId)}
                disabled={selectedMemoIds.size === 0 || !moveTargetNotebookId || isMoving || view === "trash"}
              >
                <Folder className="h-4 w-4" />
                移动
              </Button>
              <Button
                size="sm"
                variant="solid"
                title={selectionMergeTitle}
                onClick={onMerge}
                disabled={selectedMemoIds.size < 2 || isMerging || view === "trash"}
              >
                <Merge className="h-4 w-4" />
                合并
              </Button>
              <Button
                size="sm"
                variant="danger"
                title={selectionDeleteTitle}
                onClick={onDeleteSelectedMemos}
                disabled={selectedMemoIds.size === 0 || isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                {view === "trash" ? "永久删除" : "删除"}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="px-2 py-4 text-sm text-slate-500">加载中</div>
        ) : filteredMemos.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-9 text-center">
            <div className="text-sm font-semibold text-slate-800">
              {memos.length === 0 ? (view === "trash" ? "回收站为空" : "暂无笔记") : "没有符合筛选的笔记"}
            </div>
            <div className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-slate-500">
              {memos.length === 0
                ? view === "trash"
                  ? "删除的笔记会显示在这里。"
                  : "先创建一条笔记，之后可以在这里快速预览、搜索和批量整理。"
                : "试试切换筛选条件，或调整搜索关键词。"}
            </div>
            {memos.length === 0 && canCreateMemo && view !== "trash" && (
              <Button className="mt-4 justify-center" size="sm" variant="solid" onClick={onCreateMemo} disabled={isCreating}>
                <FilePlus2 className="h-4 w-4" />
                新建笔记
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 lg:space-y-0 lg:overflow-hidden lg:rounded-sm lg:border-y lg:border-slate-200 lg:bg-white">
            {memoGroups.map((group) => (
              <section key={group.key}>
                <div className="sticky top-0 z-[4] flex h-7 items-center justify-between bg-emerald-50/90 px-1 text-xs font-medium text-slate-300 backdrop-blur lg:h-9 lg:border-b lg:border-slate-200 lg:bg-white/95 lg:px-4 lg:text-sm lg:font-semibold lg:text-slate-500">
                  <span>{group.label}</span>
                  <span className="text-[11px] font-medium text-slate-300 lg:text-sm lg:font-semibold lg:text-slate-500">{group.items.length}</span>
                </div>
                <div className="space-y-3 lg:space-y-0">
                  {group.items.map((memo) => (
                    <MemoCard
                      key={memo.id}
                      memo={memo}
                      selected={memo.id === selectedMemoId}
                      checked={selectedMemoIds.has(memo.id)}
                      dragMemoIds={selectedMemoIds.has(memo.id) ? Array.from(selectedMemoIds) : [memo.id]}
                      isTrashView={view === "trash"}
                      selectionMode={selectionMode}
                      listDensity={listDensity}
                      multiSelectKeyDown={multiSelectKeyDown}
                      onOpen={() => onOpenMemo(memo.id)}
                      onDelete={() => onDeleteMemo(memo.id)}
                      onRestore={() => onRestoreMemo(memo.id)}
                      onOpenContextMenu={(event) => handleOpenMemoContextMenu(memo, event)}
                      onOpenSelectionContextMenu={(event) => handleOpenSelectionContextMenu(memo, event)}
                      onOpenSelectionKeyboardContextMenu={(target) => handleOpenSelectionKeyboardContextMenu(memo, target)}
                      onOpenKeyboardContextMenu={(target) => handleOpenMemoKeyboardContextMenu(memo, target)}
                      onToggle={(event) => handleToggleMemo(memo.id, event)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Controlled Right Click context menu for single note on Desktop using absolute placement */}
      {memoContextMenu && (
        <div style={{ position: "fixed", left: memoContextMenu.x, top: memoContextMenu.y, zIndex: 100 }}>
          <DropdownMenu open={true} onOpenChange={(open) => { if (!open) setMemoContextMenu(null); }}>
            <DropdownMenuTrigger asChild>
              <span className="sr-only" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-white border border-slate-200 rounded-md py-1 shadow-md">
              <DropdownMenuItem
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                onClick={() => {
                  const { memo } = memoContextMenu;
                  setMemoContextMenu(null);
                  onOpenMemo(memo.id);
                }}
              >
                <FileIcon className="h-4 w-4" />
                打开笔记
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                onClick={() => {
                  const { memo } = memoContextMenu;
                  setMemoContextMenu(null);
                  handleToggleMemo(memo.id);
                }}
              >
                <CheckSquare className="h-4 w-4" />
                选择笔记
              </DropdownMenuItem>
              {view !== "trash" && (
                <DropdownMenuItem
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                  disabled={isPinning}
                  onClick={() => {
                    const { memo } = memoContextMenu;
                    setMemoContextMenu(null);
                    onTogglePinMemo(memo);
                  }}
                >
                  <Star className={cn("h-4 w-4", memoContextMenu.memo.isPinned && "fill-current text-emerald-600")} />
                  {memoContextMenu.memo.isPinned ? "取消置顶" : "置顶笔记"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="my-1 h-px bg-slate-100" />
              {view === "trash" ? (
                <>
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                    onClick={() => {
                      const { memo } = memoContextMenu;
                      setMemoContextMenu(null);
                      onRestoreMemo(memo.id);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    恢复笔记
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-rose-700 hover:bg-rose-50 cursor-pointer outline-none"
                    onClick={() => {
                      const { memo } = memoContextMenu;
                      setMemoContextMenu(null);
                      onDeleteMemo(memo.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    永久删除
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                    disabled={moveNotebookOptions.length === 0}
                    onClick={() => setContextMoveOpen((value) => !value)}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">移动到笔记本</span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", contextMoveOpen && "rotate-90")} />
                  </DropdownMenuItem>
                  {contextMoveOpen && (
                    <div className="max-h-52 overflow-y-auto border-y border-slate-100 bg-slate-50/60 py-1">
                      {moveNotebookOptions.map((option: any) => (
                        <button
                          key={option.id}
                          className={cn(
                            "flex h-9 w-full items-center gap-2 px-3 text-left text-sm transition hover:bg-white",
                            option.id === memoContextMenu.memo.notebookId ? "font-semibold text-emerald-700" : "text-slate-700"
                          )}
                          style={{ paddingLeft: `${12 + option.depth * 14}px` }}
                          type="button"
                          disabled={option.id === memoContextMenu.memo.notebookId}
                          onClick={() => {
                            const { memo } = memoContextMenu;
                            setContextMoveOpen(false);
                            setMemoContextMenu(null);
                            onMoveMemo(memo.id, option.id);
                          }}
                        >
                          <NotebookIcon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-rose-700 hover:bg-rose-50 cursor-pointer outline-none"
                    onClick={() => {
                      const { memo } = memoContextMenu;
                      setMemoContextMenu(null);
                      onDeleteMemo(memo.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除笔记
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Controlled Right Click context menu for bulk selection on Desktop using absolute placement */}
      {selectionContextMenu && selectedMemoIds.size > 0 && (
        <div style={{ position: "fixed", left: selectionContextMenu.x, top: selectionContextMenu.y, zIndex: 100 }}>
          <DropdownMenu open={true} onOpenChange={(open) => { if (!open) setSelectionContextMenu(null); }}>
            <DropdownMenuTrigger asChild>
              <span className="sr-only" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-white border border-slate-200 rounded-md py-1 shadow-md">
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">{selectionCountLabel}</div>
              {view !== "trash" ? (
                <>
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                    disabled={moveNotebookOptions.length === 0 || isMoving}
                    onClick={() => setContextMoveOpen((value) => !value)}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">移动到笔记本</span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", contextMoveOpen && "rotate-90")} />
                  </DropdownMenuItem>
                  {contextMoveOpen && (
                    <div className="max-h-52 overflow-y-auto border-y border-slate-100 bg-slate-50/60 py-1">
                      {moveNotebookOptions.map((option: any) => (
                        <button
                          key={option.id}
                          className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 transition hover:bg-white"
                          style={{ paddingLeft: `${12 + option.depth * 14}px` }}
                          type="button"
                          disabled={isMoving}
                          onClick={() => {
                            setContextMoveOpen(false);
                            setSelectionContextMenu(null);
                            onMoveSelectedMemos(option.id);
                          }}
                        >
                          <NotebookIcon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                    disabled={selectedMemoIds.size === 0 || isPinning}
                    onClick={() => {
                      setSelectionContextMenu(null);
                      onPinSelectedMemos(selectedPinTarget);
                    }}
                  >
                    <Star className={cn("h-4 w-4", !selectedPinTarget && "fill-current text-emerald-500")} />
                    {selectionPinLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                    disabled={selectedMemoIds.size < 2 || isMerging}
                    onClick={() => {
                      setSelectionContextMenu(null);
                      onMerge();
                    }}
                  >
                    <Merge className="h-4 w-4" />
                    合并笔记
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 h-px bg-slate-100" />
                </>
              ) : null}
              <DropdownMenuItem
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-rose-700 hover:bg-rose-50 cursor-pointer outline-none"
                disabled={selectedMemoIds.size === 0 || isDeleting}
                onClick={() => {
                  setSelectionContextMenu(null);
                  onDeleteSelectedMemos();
                }}
              >
                <Trash2 className="h-4 w-4" />
                {view === "trash" ? "永久删除" : "删除"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 h-px bg-slate-100" />
              <DropdownMenuItem
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
                onClick={() => {
                  setSelectionContextMenu(null);
                  onClearSelection();
                }}
              >
                <X className="h-4 w-4" />
                取消选择
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {selectionMode && (
        <MobileSelectionActionBar
          canDelete={selectedMemoIds.size > 0 && !isDeleting}
          canMove={selectedMemoIds.size > 0 && view !== "trash" && notebooks.length > 0 && !isMoving}
          deleteTitle={selectionDeleteTitle}
          isTrashView={view === "trash"}
          moveTitle={selectionMoveTitle}
          onDelete={onDeleteSelectedMemos}
          onOpenMore={() => setMobileMoreOpen(true)}
          onOpenMove={() => setMobileMoveOpen(true)}
        />
      )}

      {mobileListActionsOpen && (
        <Suspense fallback={null}>
          <MobileListActionsSheet
            canSelectMemos={canEnterSelectionMode}
            isSelectionMode={selectionMode}
            listDescription={listCountLabel}
            listDensity={listDensity}
            listTitle={listTitle}
            sortMode={sortMode}
            view={view}
            onClose={() => setMobileListActionsOpen(false)}
            onEmptyTrash={() => {
              setMobileListActionsOpen(false);
              onEmptyTrash();
            }}
            onEnterSelectionMode={() => {
              setMobileListActionsOpen(false);
              onEnterSelectionMode();
            }}
            onOpenAssets={() => {
              setMobileListActionsOpen(false);
              onOpenAssets();
            }}
            onOpenSettings={() => {
              setMobileListActionsOpen(false);
              onOpenSettings();
            }}
            onOpenTags={() => {
              setMobileListActionsOpen(false);
              onOpenTags();
            }}
            onOpenTrash={() => {
              setMobileListActionsOpen(false);
              onOpenTrash();
            }}
            onListDensityChange={(value) => {
              handleListDensityChange(value);
            }}
            onSortModeChange={(value) => {
              setSortMode(value);
            }}
          />
        </Suspense>
      )}

      {mobileMoveOpen && (
        <Suspense fallback={null}>
          <MobileMoveSheet
            isMoving={isMoving}
            notebooks={notebooks}
            selectedCount={selectedMemoIds.size}
            selectedNotebookId={moveTargetNotebookId}
            onClose={() => setMobileMoveOpen(false)}
            onMove={(notebookId) => {
              setMoveTargetNotebookId(notebookId);
              onMoveSelectedMemos(notebookId);
              setMobileMoveOpen(false);
            }}
          />
        </Suspense>
      )}

      {mobileMoreOpen && (
        <Suspense fallback={null}>
          <MobileSelectionMoreSheet
            canMerge={selectedMemoIds.size >= 2 && view !== "trash" && !isMerging}
            canPin={selectedMemoIds.size > 0 && view !== "trash" && !isPinning}
            canToggleVisibleSelection={canToggleVisibleMemoSelection}
            mergeTitle={selectionMergeTitle}
            pinLabel={selectionPinLabel}
            pinTitle={selectionPinTitle}
            selectedCount={selectedMemoIds.size}
            selectionToggleLabel={visibleSelectionToggleLabel}
            selectionToggleTitle={selectionToggleTitle}
            onToggleVisibleSelection={() => {
              setMobileMoreOpen(false);
              if (allVisibleMemosSelected) {
                handleClearVisibleMemos();
                return;
              }
              handleSelectAllVisibleMemos();
            }}
            onClearSelection={() => {
              setMobileMoreOpen(false);
              onClearSelection();
            }}
            onClose={() => setMobileMoreOpen(false)}
            onMerge={() => {
              setMobileMoreOpen(false);
              onMerge();
            }}
            onPin={() => {
              setMobileMoreOpen(false);
              onPinSelectedMemos(selectedPinTarget);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

const NotebookIcon = ({ className }: { className?: string }) => (
  <svg
    className={cn("h-4 w-4", className)}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
);
