import { useState, type ReactNode } from "react";
import { Info, MoonStar, MoreHorizontal, Search, SunMedium } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExecutionCenterButton } from "@/components/execution/ExecutionCenterButton";
import { GitHubRepositoryLink } from "@/components/GitHubRepositoryLink";
import { SystemInfoDialog } from "@/components/SystemInfoDialog";
import { useAppearanceTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeployedUpdateNotice } from "@/hooks/useDeployedUpdateNotice";
import { cn } from "@/lib/utils";

export const MemoEditorHeaderActions = ({
  moreButtonClassName,
  moreMenuClassName,
  moreMenuItems,
  onOpenExecutionCenter,
  onSearch,
  onSystemInfoOpenChange,
  textNoteActions,
  textNoteMenuItems,
}: {
  moreButtonClassName?: string;
  moreMenuClassName?: string;
  moreMenuItems: ReactNode;
  onOpenExecutionCenter: () => void;
  onSearch: () => void;
  onSystemInfoOpenChange?: (open: boolean) => void;
  textNoteActions?: ReactNode;
  textNoteMenuItems?: ReactNode;
}) => {
  const { t } = useTranslation();
  const [systemInfoOpen, setSystemInfoOpen] = useState(false);
  const { unseen: deployedUpdateUnseen } = useDeployedUpdateNotice();
  const { resolvedTheme, setPreference } = useAppearanceTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const themeLabel = nextTheme === "dark" ? t("settings.themeToggleToDark") : t("settings.themeToggleToLight");
  const handleSystemInfoOpenChange = (open: boolean) => {
    setSystemInfoOpen(open);
    onSystemInfoOpenChange?.(open);
  };

  return (
    <>
      {textNoteActions}
      <ExecutionCenterButton className="h-8 w-8" onClick={onOpenExecutionCenter} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn("relative", moreButtonClassName)}
            size="icon"
            variant="ghost"
            title={t("editor.more")}
            aria-label={t("editor.moreAria")}
          >
            <MoreHorizontal className="h-4 w-4" />
            {deployedUpdateUnseen ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn("border border-slate-200 bg-card py-1 shadow-md", moreMenuClassName)}
        >
          {textNoteMenuItems}
          <DropdownMenuItem
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
            onClick={onSearch}
          >
            <Search className="h-4 w-4 text-slate-500" />
            {t("editor.searchCurrentMemo")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
            onClick={() => setPreference(nextTheme)}
          >
            {resolvedTheme === "dark" ? <SunMedium className="h-4 w-4 text-slate-500" /> : <MoonStar className="h-4 w-4 text-slate-500" />}
            {themeLabel}
          </DropdownMenuItem>
          <GitHubRepositoryLink
            showTooltip={false}
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-slate-700 outline-none hover:bg-slate-50"
            iconClassName="h-4 w-4 text-slate-500"
          >
            {t("common.githubRepository")}
          </GitHubRepositoryLink>
          {moreMenuItems}
          <DropdownMenuItem
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
            onClick={() => handleSystemInfoOpenChange(true)}
          >
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <Info className="h-4 w-4 text-slate-500" />
              {deployedUpdateUnseen ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" /> : null}
            </span>
            {t("systemInfo.title")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SystemInfoDialog open={systemInfoOpen} onOpenChange={handleSystemInfoOpenChange} />
    </>
  );
};
