import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NotebookMoveOption } from "@/lib/app-helpers";
import type { EdgeEverRepository } from "@/lib/repository";
import { EditorTagPicker } from "@/components/EditorTagPicker";
import { MobileNotebookSelectSheet } from "@/components/editor/EditorPaneChrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MemoEditorMetadataRowProps = {
  contentMarkdown: string;
  disabled: boolean;
  mobileNotebookPickerOpen: boolean;
  notebookOptions: NotebookMoveOption[];
  notebookUpdatePending: boolean;
  repository: Pick<EdgeEverRepository, "listTags">;
  selectedNotebookId: string;
  tagsText: string;
  title: string;
  trailingActions?: ReactNode;
  onMobileNotebookPickerOpenChange: (open: boolean) => void;
  onNotebookChange: (notebookId: string) => void;
  onTagsChange: (tagsText: string) => void;
};

export const MemoEditorMetadataRow = ({
  contentMarkdown,
  disabled,
  mobileNotebookPickerOpen,
  notebookOptions,
  notebookUpdatePending,
  repository,
  selectedNotebookId,
  tagsText,
  title,
  trailingActions,
  onMobileNotebookPickerOpenChange,
  onNotebookChange,
  onTagsChange,
}: MemoEditorMetadataRowProps) => {
  const { t } = useTranslation();
  const currentNotebookLabel = notebookOptions.find((notebook) => notebook.id === selectedNotebookId)?.name
    ?? t("editor.notebookFallback");

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          className="flex h-7 min-w-0 max-w-full items-center gap-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-slate-600 outline-none transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:opacity-50 sm:hidden"
          type="button"
          disabled={disabled || notebookUpdatePending}
          aria-label={t("editor.currentNotebookAria", { name: currentNotebookLabel })}
          onClick={() => onMobileNotebookPickerOpenChange(true)}
        >
          <span className="min-w-0 truncate">{currentNotebookLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
        <div className="hidden min-w-[9rem] max-w-[18rem] sm:block">
          <Select
            value={selectedNotebookId}
            disabled={disabled || notebookUpdatePending}
            onValueChange={onNotebookChange}
          >
            <SelectTrigger className="h-8 min-w-0 whitespace-nowrap border-transparent bg-transparent px-2 text-sm font-medium text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900">
              <SelectValue placeholder={t("editor.notebookPlaceholder")}>{currentNotebookLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-60 rounded-md border border-slate-200 bg-card py-1 shadow-md">
              {notebookOptions.map((notebook) => (
                <SelectItem key={notebook.id} value={notebook.id}>
                  {notebook.selectLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <EditorTagPicker
          contentMarkdown={contentMarkdown}
          disabled={disabled}
          loadTags={() => repository.listTags()}
          title={title}
          value={tagsText}
          onChange={onTagsChange}
        />
        {trailingActions}
      </div>

      {mobileNotebookPickerOpen ? (
        <MobileNotebookSelectSheet
          isUpdating={notebookUpdatePending}
          options={notebookOptions}
          selectedNotebookId={selectedNotebookId}
          onClose={() => onMobileNotebookPickerOpenChange(false)}
          onSelect={onNotebookChange}
        />
      ) : null}
    </>
  );
};
