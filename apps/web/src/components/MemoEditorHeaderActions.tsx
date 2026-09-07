import { useState, type ReactNode } from "react";
import { Info, MoreHorizontal, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExecutionCenterButton } from "@/components/execution/ExecutionCenterButton";
import { GitHubRepositoryLink } from "@/components/GitHubRepositoryLink";
import { SystemInfoDialog } from "@/components/SystemInfoDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeployedUpdateNotice } from "@/hooks/useDeployedUpdateNotice";
import { cn } from "@/lib/utils";
import { IconTooltip } from "./editor/EditorPaneChrome";

export const MemoEditorHeaderActions = ({
  companionDiscoveryHub,
  moreButtonClassName,
  moreMenuClassName,
  moreMenuItems,
  onOpenExecutionCenter,
  onSearch,
  onSystemInfoOpenChange,
  textNoteActions,
  textNoteMenuItems,
}: {
  companionDiscoveryHub?: ReactNode;
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
  const handleSystemInfoOpenChange = (open: boolean) => {
    setSystemInfoOpen(open);
    onSystemInfoOpenChange?.(open);
  };

  return (
    <>
      <IconTooltip label={t("editor.searchCurrentMemo")}>
        <Button
          className="hidden h-8 w-8 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300 sm:inline-flex"
          size="icon"
          variant="ghost"
          aria-label={t("editor.searchCurrentMemo")}
          onClick={onSearch}
        >
          <Search className="h-5 w-5" strokeWidth={2.25} />
        </Button>
      </IconTooltip>
      {textNoteActions}
      <GitHubRepositoryLink className="hidden h-8 w-8 justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 min-[1600px]:inline-flex" iconClassName="h-5 w-5" />
      <IconTooltip label={t("systemInfo.title")}>
        <Button
          className="relative hidden h-8 w-8 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-emerald-500/70 min-[1600px]:inline-flex"
          size="icon"
          variant="ghost"
          aria-label={t("systemInfo.title")}
          onClick={() => handleSystemInfoOpenChange(true)}
        >
          <Info className="h-5 w-5" strokeWidth={2.25} />
          {deployedUpdateUnseen ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
        </Button>
      </IconTooltip>
      {companionDiscoveryHub}
      <ExecutionCenterButton className="h-8 w-8" onClick={onOpenExecutionCenter} />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={moreButtonClassName}
            size="icon"
            variant="ghost"
            title={t("editor.more")}
            aria-label={t("editor.moreAria")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn("border border-slate-200 bg-white py-1 shadow-md", moreMenuClassName)}
        >
          {textNoteMenuItems}
          <DropdownMenuItem
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none"
            onClick={onSearch}
          >
            <Search className="h-4 w-4 text-slate-500" />
            {t("editor.searchCurrentMemo")}
          </DropdownMenuItem>
          {moreMenuItems}
          <DropdownMenuItem
            className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 cursor-pointer outline-none min-[1600px]:hidden"
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
