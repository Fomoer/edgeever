import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconTooltip } from "@/components/editor/EditorPaneChrome";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MemoEditorUpdatedLabel = ({ updatedLabel }: { updatedLabel: string }) => (
  <span className="hidden truncate text-xs text-slate-400 sm:inline">{updatedLabel}</span>
);

export const MemoEditorFocusModeButton = ({
  desktopFocusMode,
  onToggleDesktopFocusMode,
}: {
  desktopFocusMode: boolean;
  onToggleDesktopFocusMode: () => void;
}) => {
  const { t } = useTranslation();
  const focusModeLabel = t(desktopFocusMode ? "editor.exitFocusMode" : "editor.enterFocusMode");

  return (
    <div className="hidden shrink-0 items-center lg:flex">
      <IconTooltip label={focusModeLabel}>
        <Button
          className="h-8 w-8 text-slate-500"
          size="icon"
          variant={desktopFocusMode ? "soft" : "ghost"}
          aria-label={focusModeLabel}
          aria-pressed={desktopFocusMode}
          onClick={onToggleDesktopFocusMode}
        >
          {desktopFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </IconTooltip>
    </div>
  );
};

export const MemoEditorTopRowLeading = ({
  className,
  mobileBackButton,
  titleInput,
}: {
  className?: string;
  mobileBackButton?: ReactNode;
  titleInput?: ReactNode;
}) => (
  <div className={cn("flex min-w-0 flex-1 items-center gap-2 text-sm", className)}>
    {mobileBackButton}
    {titleInput && <div className="min-w-0 flex-1">{titleInput}</div>}
  </div>
);
