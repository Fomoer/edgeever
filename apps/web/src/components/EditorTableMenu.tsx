import { useEditorState, type Editor } from "@tiptap/react";
import { Table } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type EditorTableMenuProps = {
  editor: Editor | null;
  readOnly: boolean;
};

export const EditorTableMenu = ({ editor, readOnly }: EditorTableMenuProps) => {
  const { t } = useTranslation();
  const ready = Boolean(editor && !editor.isDestroyed);
  const tableActiveState = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) =>
      (activeEditor?.isActive("table") ? 1 : 0)
      | (activeEditor?.isActive("tableHeader") ? 2 : 0),
  });
  const inTable = Boolean((tableActiveState ?? 0) & 1);
  const inTableHeader = Boolean((tableActiveState ?? 0) & 2);
  const disabled = readOnly || !ready;

  const run = (command: (activeEditor: Editor) => void) => {
    if (!editor || editor.isDestroyed || readOnly) {
      return;
    }

    command(editor);
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition disabled:pointer-events-none disabled:opacity-40",
                inTable
                  ? "bg-slate-200/80 text-slate-900"
                  : "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              )}
              type="button"
              aria-label={t("editorToolbar.table")}
              aria-pressed={inTable || undefined}
              disabled={disabled}
            >
              <Table aria-hidden="true" className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("editorToolbar.table")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          disabled={inTable}
          onSelect={() => run((activeEditor) => activeEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        >
          {t("editorToolbar.insertTable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!inTable} onSelect={() => run((activeEditor) => activeEditor.chain().focus().addRowAfter().run())}>
          {t("editorToolbar.addTableRow")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!inTable || inTableHeader}
          onSelect={() => run((activeEditor) => {
            if (!activeEditor.isActive("tableHeader")) {
              activeEditor.chain().focus().deleteRow().run();
            }
          })}
        >
          {t("editorToolbar.deleteTableRow")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => run((activeEditor) => activeEditor.chain().focus().addColumnAfter().run())}>
          {t("editorToolbar.addTableColumn")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => run((activeEditor) => activeEditor.chain().focus().deleteColumn().run())}>
          {t("editorToolbar.deleteTableColumn")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => run((activeEditor) => activeEditor.chain().focus().toggleHeaderRow().run())}>
          {t("editorToolbar.toggleTableHeader")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-rose-700 focus:text-rose-800"
          disabled={!inTable}
          onSelect={() => run((activeEditor) => activeEditor.chain().focus().deleteTable().run())}
        >
          {t("editorToolbar.deleteTable")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
