import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Archive, CheckSquare, FileDown, Folder as NotebookIcon, KeyRound, LayoutList, List, Merge, Star, Tags, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getMemoSortOptions, getNotebookMoveOptions } from "@/lib/app-helpers";
import type { MemoListDensity, MemoSortMode } from "@/lib/app-helpers";
import type { Notebook } from "@edgeever/shared";

const CheckCircleCheck = ({ className }: { className?: string }) => (
  <svg className={cn("h-4 w-4 fill-current", className)} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

const MobileListActionButton = ({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
    type="button"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="text-slate-500">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
);

export const MobileListActionsSheet = ({
  canSelectMemos,
  isSelectionMode,
  listDescription,
  listDensity,
  listTitle,
  sortMode,
  view,
  onClose,
  onEnterSelectionMode,
  onEmptyTrash,
  onOpenAssets,
  onOpenSettings,
  onOpenTags,
  onOpenTrash,
  onListDensityChange,
  onSortModeChange,
}: {
  canSelectMemos: boolean;
  isSelectionMode: boolean;
  listDescription: string;
  listDensity: MemoListDensity;
  listTitle: string;
  sortMode: MemoSortMode;
  view: string;
  onClose: () => void;
  onEnterSelectionMode: () => void;
  onEmptyTrash: () => void;
  onOpenAssets: () => void;
  onOpenSettings: () => void;
  onOpenTags: () => void;
  onOpenTrash: () => void;
  onListDensityChange: (value: MemoListDensity) => void;
  onSortModeChange: (value: MemoSortMode) => void;
}) => {
  const { t } = useTranslation();
  const memoListDensityOptions = useMemo(
    () => [
      { value: "preview" as const, label: t("options.memoDensity.preview"), icon: <LayoutList className="h-4 w-4" /> },
      { value: "compact" as const, label: t("options.memoDensity.compact"), icon: <List className="h-4 w-4" /> },
    ],
    [t]
  );
  const mobileSortOptions = useMemo(() => getMemoSortOptions(t), [t]);

  return (
    <Drawer open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh_-_6.75rem_-_env(safe-area-inset-bottom))] overflow-hidden rounded-mobile-sheet lg:hidden">
        <header className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
          <DrawerHeader className="min-w-0 p-0">
            <DrawerTitle className="truncate">{t("mobileSheets.listOptions")}</DrawerTitle>
            <DrawerDescription className="truncate">
              {listTitle} · {listDescription}
            </DrawerDescription>
          </DrawerHeader>
          <Button size="icon" variant="ghost" title={t("common.close")} aria-label={t("common.close")} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="max-h-[calc(100dvh_-_10.25rem_-_env(safe-area-inset-bottom))] overflow-y-auto p-2">
          {!isSelectionMode && (
            <>
              <MobileListActionButton
                disabled={!canSelectMemos}
                icon={<CheckSquare className="h-4 w-4" />}
                label={t("mobileSheets.selectMemo")}
                onClick={onEnterSelectionMode}
              />
              <div className="my-2 h-px bg-slate-100" />
            </>
          )}

          <div className="px-3 py-2 text-xs font-semibold text-slate-400">{t("mobileSheets.displayMode")}</div>
          <ToggleGroup
            className="flex-col items-stretch"
            type="single"
            value={listDensity}
            onValueChange={(value) => {
              if (value) {
                onListDensityChange(value as MemoListDensity);
              }
            }}
          >
            {memoListDensityOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                className="h-11 w-full justify-start gap-3 rounded-md px-3 text-left text-sm data-[state=on]:bg-emerald-50 data-[state=on]:text-emerald-700"
                size="default"
                value={option.value}
                aria-label={option.label}
              >
                <span className={listDensity === option.value ? "text-emerald-500" : "text-slate-500"}>{option.icon}</span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <CheckCircleCheck className={cn("h-4 w-4 shrink-0", listDensity === option.value ? "text-emerald-500" : "text-transparent")} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="my-2 h-px bg-slate-100" />
          <div className="px-3 py-2 text-xs font-semibold text-slate-400">{t("mobileSheets.sortMode")}</div>
          {mobileSortOptions.map((option) => (
            <button
              key={option.value}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                sortMode === option.value ? "bg-emerald-50 text-emerald-700" : "text-slate-800 hover:bg-slate-50"
              )}
              type="button"
              aria-pressed={sortMode === option.value}
              onClick={() => onSortModeChange(option.value)}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <CheckCircleCheck className={cn("h-4 w-4 shrink-0", sortMode === option.value ? "text-emerald-500" : "text-transparent")} />
            </button>
          ))}

          <div className="my-2 h-px bg-slate-100" />
          <MobileListActionButton icon={<Tags className="h-4 w-4" />} label={t("mobileSheets.tags")} onClick={onOpenTags} />
          <MobileListActionButton icon={<Archive className="h-4 w-4" />} label={t("mobileSheets.assets")} onClick={onOpenAssets} />
          {view === "trash" ? (
            <MobileListActionButton icon={<Trash2 className="h-4 w-4" />} label={t("mobileSheets.emptyTrash")} onClick={onEmptyTrash} />
          ) : (
            <MobileListActionButton icon={<Trash2 className="h-4 w-4" />} label={t("mobileSheets.trash")} onClick={onOpenTrash} />
          )}
          <MobileListActionButton icon={<KeyRound className="h-4 w-4" />} label="MCP Token" onClick={onOpenSettings} />
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export const MobileMoveSheet = ({
  isMoving,
  notebooks,
  selectedCount,
  selectedNotebookId,
  onClose,
  onMove,
}: {
  isMoving: boolean;
  notebooks: Notebook[];
  selectedCount: number;
  selectedNotebookId: string;
  onClose: () => void;
  onMove: (notebookId: string) => void;
}) => {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => getNotebookMoveOptions(notebooks), [notebooks]);
  const selectedCountLabel = selectedCount > 0 ? t("mobileSheets.selectionCount", { count: selectedCount }) : t("mobileSheets.selectMemo");

  useEffect(() => {
    window.setTimeout(() => {
      const selectedNode = listRef.current?.querySelector<HTMLElement>(
        `[data-mobile-move-notebook-id="${CSS.escape(selectedNotebookId)}"]`
      );
      selectedNode?.scrollIntoView({ block: "center" });
    }, 0);
  }, [selectedNotebookId]);

  return (
    <Drawer open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh_-_6.75rem_-_env(safe-area-inset-bottom))] overflow-hidden rounded-mobile-sheet lg:hidden">
        <header className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
          <DrawerHeader className="min-w-0 p-0">
            <DrawerTitle className="truncate">{t("mobileSheets.moveToNotebook")}</DrawerTitle>
            <DrawerDescription className="truncate">{selectedCountLabel}</DrawerDescription>
          </DrawerHeader>
          <Button size="icon" variant="ghost" title={t("common.close")} aria-label={t("common.close")} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <Command className="min-h-0 flex-1">
          <CommandInput placeholder={t("mobileSheets.searchNotebook")} />
          <CommandList ref={listRef} className="max-h-[calc(100dvh_-_13.75rem_-_env(safe-area-inset-bottom))] p-2">
            <CommandEmpty>{t("mobileSheets.noNotebookFound")}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const selected = option.id === selectedNotebookId;
                return (
                  <CommandItem
                    key={option.id}
                    className={cn(
                      "h-11 gap-2 px-3",
                      selected ? "bg-emerald-50 font-semibold text-emerald-700 data-[selected=true]:bg-emerald-50" : "text-slate-700"
                    )}
                    style={{ paddingLeft: `${12 + option.depth * 18}px` }}
                    value={option.id}
                    keywords={[option.name, option.selectLabel, option.slug ?? ""]}
                    data-mobile-move-notebook-id={option.id}
                    aria-label={selected ? t("mobileSheets.currentTarget", { name: option.name }) : t("mobileSheets.moveTo", { name: option.name })}
                    aria-current={selected ? "page" : undefined}
                    disabled={isMoving}
                    onSelect={() => onMove(option.id)}
                  >
                    <NotebookIcon className={cn("h-4 w-4 shrink-0", selected ? "text-emerald-500" : "text-slate-600")} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    {selected ? <CheckCircleCheck className="h-4 w-4 shrink-0 text-emerald-500" /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DrawerContent>
    </Drawer>
  );
};

export const MobileSelectionMoreSheet = ({
  canExport,
  canMerge,
  canPin,
  canToggleVisibleSelection,
  exportTitle,
  mergeTitle,
  pinLabel,
  pinTitle,
  selectedCount,
  selectionToggleLabel,
  selectionToggleTitle,
  onClearSelection,
  onClose,
  onExport,
  onMerge,
  onPin,
  onToggleVisibleSelection,
}: {
  canExport: boolean;
  canMerge: boolean;
  canPin: boolean;
  canToggleVisibleSelection: boolean;
  exportTitle: string;
  mergeTitle: string;
  pinLabel: string;
  pinTitle: string;
  selectedCount: number;
  selectionToggleLabel: string;
  selectionToggleTitle: string;
  onClearSelection: () => void;
  onClose: () => void;
  onExport: () => void;
  onMerge: () => void;
  onPin: () => void;
  onToggleVisibleSelection: () => void;
}) => {
  const { t } = useTranslation();
  const selectedCountLabel = selectedCount > 0 ? t("mobileSheets.selectionCount", { count: selectedCount }) : t("mobileSheets.selectMemo");

  return (
    <Drawer open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DrawerContent className="bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh_-_6.75rem_-_env(safe-area-inset-bottom))] overflow-hidden rounded-mobile-sheet lg:hidden">
      <header className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
        <DrawerHeader className="min-w-0 p-0">
          <DrawerTitle className="truncate">{t("mobileSheets.bulkActions")}</DrawerTitle>
          <DrawerDescription className="truncate">{selectedCountLabel}</DrawerDescription>
        </DrawerHeader>
        <Button size="icon" variant="ghost" title={t("common.close")} aria-label={t("common.close")} onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <button
        className="flex h-12 w-full items-center gap-3 border-b border-slate-100 px-4 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-100 disabled:hover:bg-transparent"
        type="button"
        disabled={!canToggleVisibleSelection}
        title={selectionToggleTitle}
        onClick={onToggleVisibleSelection}
      >
        <CheckSquare className="h-4 w-4" />
        {selectionToggleLabel}
      </button>
      <button
        className="flex h-12 w-full items-center gap-3 border-b border-slate-100 px-4 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-100 disabled:hover:bg-transparent"
        type="button"
        disabled={!canMerge}
        title={mergeTitle}
        onClick={onMerge}
      >
        <Merge className="h-4 w-4" />
        {t("mobileSheets.mergeMemos")}
      </button>
      <button
        className="flex h-12 w-full items-center gap-3 border-b border-slate-100 px-4 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-100 disabled:hover:bg-transparent"
        type="button"
        disabled={!canPin}
        title={pinTitle}
        onClick={onPin}
      >
        <Star className="h-4 w-4" />
        {pinLabel}
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full border-b border-slate-100">
            <button
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-100 disabled:hover:bg-transparent"
              type="button"
              disabled={!canExport}
              aria-label={exportTitle}
              onClick={onExport}
            >
              <FileDown className="h-4 w-4" />
              {t("mobileSheets.exportMarkdown")}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{exportTitle}</TooltipContent>
      </Tooltip>
      <button
        className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50"
        type="button"
        title={t("mobileSheets.clearSelection")}
        aria-label={t("mobileSheets.clearSelection")}
        onClick={onClearSelection}
      >
        <X className="h-4 w-4" />
        {t("mobileSheets.clearSelection")}
      </button>
    </DrawerContent>
    </Drawer>
  );
};
