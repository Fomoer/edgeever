import { useEffect, useState } from "react";
import type { PluginPanelChrome, PluginPanelCloseDecision, PluginPanelOpenOptions } from "@edgeever/plugin-api";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components/dialogs/ConfirmDialogs";
import { PluginPanelEmpty, PluginPanelHeaderActions, PluginPanelToolbar } from "@/components/plugins/PluginPanelChrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EdgeEverPluginHost, RegisteredPluginPanel } from "@/lib/plugins/plugin-host";
import { cn } from "@/lib/utils";

export const PluginPanelDialog = ({ host, panel, options, onClose }: {
  host: EdgeEverPluginHost;
  panel: RegisteredPluginPanel | null;
  options?: PluginPanelOpenOptions;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [chrome, setChrome] = useState<PluginPanelChrome>({});
  const [chromeEnabled, setChromeEnabled] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [closeConfirmation, setCloseConfirmation] = useState<Exclude<PluginPanelCloseDecision, boolean> | null>(null);
  const [checkingClose, setCheckingClose] = useState(false);
  const panelPluginId = panel?.pluginId ?? null;
  const panelId = panel?.id ?? null;

  useEffect(() => {
    setChrome({});
    setChromeEnabled(false);
  }, [panelPluginId, panelId]);

  useEffect(() => {
    // Container is reactive so delayed portal attachment mounts the plugin.
    if (!container || !panelPluginId || !panelId) return;
    let disposed = false;
    let disposePanel: (() => void) | null = null;
    setMountError(null);
    container.replaceChildren();
    void host.mountPanel(panelPluginId, panelId, container, options, requestClose, {
      set(next) {
        if (disposed) return;
        setChromeEnabled(true);
        setChrome(next);
      },
    }).then((dispose) => {
      if (disposed) dispose();
      else disposePanel = dispose;
    }).catch((error: unknown) => {
      if (!disposed) setMountError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      disposed = true;
      disposePanel?.();
      container.replaceChildren();
    };
  }, [container, host, options, panelId, panelPluginId]);

  const requestClose = async () => {
    if (!panelPluginId || !panelId || checkingClose) return;
    setCheckingClose(true);
    try {
      const decision = await host.getPanelCloseDecision(panelPluginId, panelId);
      if (decision === true) onClose();
      else if (decision && typeof decision === "object") setCloseConfirmation(decision);
    } catch (error) {
      setMountError(error instanceof Error ? error.message : String(error));
    } finally {
      setCheckingClose(false);
    }
  };

  const title = chrome.header?.title || panel?.title || t("plugins.panel");
  const hideDescription = chromeEnabled && chrome.header?.description === null;
  const description = chrome.header?.description || t("plugins.panelDescription");

  return (
    <>
      <Dialog open={Boolean(panel)} onOpenChange={(open) => { if (!open) void requestClose(); }}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            panel?.presentation === "fullscreen"
              ? "flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden p-5"
              : "max-h-[85vh] max-w-3xl overflow-y-auto",
          )}
        >
          <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5 text-left">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className={hideDescription ? "sr-only" : undefined}>{description}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {chromeEnabled ? <PluginPanelHeaderActions chrome={chrome} /> : null}
              <DialogClose asChild>
                <Button type="button" size="icon" variant="ghost" aria-label={t("common.close")}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>
          {chromeEnabled ? <PluginPanelToolbar chrome={chrome} /> : null}
          {mountError ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{mountError}</div> : null}
          {chrome.empty ? <PluginPanelEmpty chrome={chrome} /> : null}
          <div ref={setContainer} hidden={Boolean(chrome.empty)} className={cn(
            chromeEnabled
              ? "min-h-40 text-sm text-slate-700"
              : "min-h-40 rounded-lg border border-slate-200 bg-card p-4 text-sm text-slate-700",
            panel?.presentation === "fullscreen" && "min-h-0 flex-1 overflow-auto",
          )} />
        </DialogContent>
      </Dialog>
      {closeConfirmation ? (
        <AppConfirmDialog
          title={closeConfirmation.title}
          description={closeConfirmation.message}
          confirmLabel={closeConfirmation.confirmLabel ?? t("common.close")}
          tone="neutral"
          onCancel={() => setCloseConfirmation(null)}
          onConfirm={() => {
            setCloseConfirmation(null);
            onClose();
          }}
        />
      ) : null}
    </>
  );
};
