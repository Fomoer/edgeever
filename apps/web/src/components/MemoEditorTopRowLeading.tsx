import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/editor/EditorPaneChrome";
import { Button } from "@/components/ui/button";

export const MemoEditorTopRowLeading = ({
  desktopFocusMode,
  mobileBackButton,
  updatedLabel,
  onToggleDesktopFocusMode,
}: {
  desktopFocusMode: boolean;
  mobileBackButton: ReactNode;
  updatedLabel: string;
  onToggleDesktopFocusMode: () => void;
}) => {
  const { t } = useTranslation();
  const focusModeLabel = t(desktopFocusMode ? "editor.exitFocusMode" : "editor.focusMode");

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {mobileBackButton}
      <div className="hidden items-center lg:flex">
        <IconTooltip label={focusModeLabel}>
          <Button
            size="sm"
            variant={desktopFocusMode ? "soft" : "ghost"}
            aria-label={t(desktopFocusMode ? "editor.exitFocusMode" : "editor.enterFocusMode")}
            aria-pressed={desktopFocusMode}
            onClick={onToggleDesktopFocusMode}
          >
            {desktopFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span>{focusModeLabel}</span>
          </Button>
        </IconTooltip>
      </div>
      <span className="hidden truncate text-xs text-slate-400 sm:inline">{updatedLabel}</span>
    </div>
  );
};
