import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const DesktopUpdateNotice = () => {
  const { t } = useTranslation();
  const bridge = window.edgeeverDesktop;

  const statusQuery = useQuery({
    queryKey: ["desktop-update-status"],
    queryFn: () => bridge!.updateStatus(),
    enabled: bridge?.isAvailable === true,
    refetchInterval: (query) => query.state.data?.state === "downloaded" ? false : 5_000,
    retry: 1,
  });
  const installMutation = useMutation({
    mutationFn: () => bridge!.installUpdate(),
  });

  const downloaded = bridge?.isAvailable === true && statusQuery.data?.state === "downloaded";
  if (!downloaded) return null;

  const label = installMutation.isError
    ? t("systemInfo.desktopUpdateFailed")
    : t("systemInfo.desktopUpdateRestart");

  return (
    <div className="fixed right-5 top-5 z-[90] animate-in slide-in-from-top-3 fade-in duration-300" role="status" aria-live="polite">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="relative h-10 w-10 rounded-full shadow-[0_12px_32px_rgba(15,23,42,0.2)]"
              size="icon"
              variant="solid"
              aria-label={label}
              disabled={installMutation.isPending}
              onClick={() => installMutation.mutate()}
            >
              {installMutation.isPending
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <RotateCcw className="h-4 w-4" />}
              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
