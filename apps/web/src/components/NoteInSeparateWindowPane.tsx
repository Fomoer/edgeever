import { AppWindow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMemoDisplayTitle } from "@edgeever/shared";
import { Button } from "@/components/ui/button";

/** Shown in the main window while the selected note is open in its own window. */
export const NoteInSeparateWindowPane = ({ title, onShowWindow }: { title: string | null; onShowWindow: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-transparent px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center" data-testid="note-in-separate-window">
        <AppWindow className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">{getMemoDisplayTitle(title, t("common.untitledMemo"))}</p>
        <p className="text-sm leading-6 text-slate-500">{t("editor.noteInSeparateWindow")}</p>
        <Button variant="outline" size="sm" onClick={onShowWindow}>
          {t("editor.showNoteWindow")}
        </Button>
      </div>
    </div>
  );
};
