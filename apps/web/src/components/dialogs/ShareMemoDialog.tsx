import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, LoaderCircle, RefreshCw, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, getConfiguredDesktopApiBaseUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";

export const getPublicShareUrl = (token: string) => {
  const baseUrl = getConfiguredDesktopApiBaseUrl() || window.location.origin;
  return `${baseUrl.replace(/\/$/, "")}/share/${encodeURIComponent(token)}`;
};

const sharePasswordStorageKey = (memoId: string) => `edgeever.sharePassword.${memoId}`;

const readStoredSharePassword = (memoId: string, token: string) => {
  try {
    const raw = window.sessionStorage.getItem(sharePasswordStorageKey(memoId));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string; password?: string };
    return parsed.token === token && typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    return "";
  }
};

const writeStoredSharePassword = (memoId: string, token: string, password: string) => {
  try {
    window.sessionStorage.setItem(sharePasswordStorageKey(memoId), JSON.stringify({ token, password }));
  } catch {
    // sessionStorage may be unavailable; the generated password is still shown in this dialog session.
  }
};

const clearStoredSharePassword = (memoId: string) => {
  try {
    window.sessionStorage.removeItem(sharePasswordStorageKey(memoId));
  } catch {
    // Ignore restricted storage contexts.
  }
};

export const memoShareQueryKey = (memoId: string) => ["memo-share", memoId] as const;

export const ShareMemoDialog = ({
  memoId,
  open,
  onOpenChange,
}: {
  memoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [copyTarget, setCopyTarget] = useState<"link" | "password" | "both">("link");
  const [revealedPassword, setRevealedPassword] = useState("");
  const copyResetTimerRef = useRef<number | null>(null);
  const queryKey = memoShareQueryKey(memoId);
  const shareQuery = useQuery({
    queryKey,
    queryFn: () => api.getMemoShare(memoId),
    enabled: open,
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () => api.createMemoShare(memoId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
    },
  });
  const passwordMutation = useMutation({
    mutationFn: (passwordProtected: boolean) => api.updateMemoShare(memoId, { passwordProtected }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, { share: { ...data.share, password: undefined } });
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
      if (data.share.password) {
        writeStoredSharePassword(memoId, data.share.token, data.share.password);
        setRevealedPassword(data.share.password);
      } else {
        clearStoredSharePassword(memoId);
        setRevealedPassword("");
      }
    },
  });
  const revokeMutation = useMutation({
    mutationFn: () => api.revokeMemoShare(memoId),
    onSuccess: () => {
      clearStoredSharePassword(memoId);
      setRevealedPassword("");
      queryClient.setQueryData(queryKey, { share: null });
      void queryClient.invalidateQueries({ queryKey: ["memo-shares"] });
    },
  });
  useEffect(() => {
    createMutation.reset();
    passwordMutation.reset();
    revokeMutation.reset();
    setCopyState("idle");
    setCopyTarget("link");
    setRevealedPassword("");
  }, [memoId]);
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  const share = shareQuery.data?.share ?? null;
  useEffect(() => {
    if (!share?.passwordProtected) {
      setRevealedPassword("");
      return;
    }
    setRevealedPassword(readStoredSharePassword(memoId, share.token));
  }, [memoId, share?.passwordProtected, share?.token]);

  const shareUrl = share ? getPublicShareUrl(share.token) : "";
  const isWorking = shareQuery.isLoading || createMutation.isPending || passwordMutation.isPending || revokeMutation.isPending;
  const error = shareQuery.error || createMutation.error || passwordMutation.error || revokeMutation.error;

  const markCopied = (target: "link" | "password" | "both", copied: boolean) => {
    setCopyTarget(target);
    setCopyState(copied ? "copied" : "error");
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 3000);
  };

  const copyValue = async (target: "link" | "password" | "both", value: string) => {
    markCopied(target, await copyTextToClipboard(value));
  };

  const copiedLabel = (target: "link" | "password" | "both", idleKey: string) =>
    copyState === "copied" && copyTarget === target
      ? "sharing.copied"
      : copyState === "error" && copyTarget === target
        ? "sharing.copyFailed"
        : idleKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm leading-6">
            <Share2 className="h-5 w-5 text-slate-700" />
            {t("sharing.title")}
          </DialogTitle>
          <DialogDescription className="pt-1 leading-5">
            {t(share?.passwordProtected ? "sharing.descriptionProtected" : "sharing.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          {shareQuery.isLoading ? (
            <div className="flex min-h-20 items-center justify-center text-slate-500" role="status">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : share ? (
            <>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly aria-label={t("sharing.linkLabel")} className="min-w-0 font-mono text-xs" />
                <Button
                  variant={copyState === "copied" && copyTarget === "link" ? "solid" : copyState === "error" && copyTarget === "link" ? "danger" : "outline"}
                  className="min-w-28"
                  aria-live="polite"
                  onClick={() => void copyValue("link", shareUrl)}
                >
                  {copyState === "copied" && copyTarget === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {t(copiedLabel("link", "sharing.copy"))}
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-normal leading-5 text-slate-900">{t("sharing.passwordToggle")}</div>
                  <Switch
                    checked={share.passwordProtected}
                    disabled={isWorking}
                    onCheckedChange={(enabled) => passwordMutation.mutate(enabled)}
                    aria-label={t("sharing.passwordToggle")}
                  />
                </div>
                {share.passwordProtected ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={revealedPassword}
                        readOnly
                        placeholder={t("sharing.passwordSet")}
                        aria-label={t("sharing.passwordLabel")}
                        className="min-w-0 font-mono text-xs tracking-wide"
                      />
                      <Button
                        variant={copyState === "copied" && copyTarget === "password" ? "solid" : copyState === "error" && copyTarget === "password" ? "danger" : "outline"}
                        className="min-w-28"
                        disabled={!revealedPassword}
                        aria-live="polite"
                        onClick={() => void copyValue("password", revealedPassword)}
                      >
                        {copyState === "copied" && copyTarget === "password" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {t(copiedLabel("password", "sharing.passwordCopy"))}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isWorking}
                        title={t("sharing.regeneratePassword")}
                        aria-label={t("sharing.regeneratePassword")}
                        onClick={() => passwordMutation.mutate(true)}
                      >
                        {passwordMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                    {revealedPassword ? (
                      <Button
                        variant="ghost"
                        className="h-8 px-0 text-xs text-slate-600 hover:bg-transparent hover:text-slate-900"
                        onClick={() => void copyValue("both", `${shareUrl}\n${t("sharing.passwordPrefix")}${revealedPassword}`)}
                      >
                        {copyState === "copied" && copyTarget === "both" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {t(copiedLabel("both", "sharing.copyLinkAndPassword"))}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="text-xs leading-5 text-slate-500">{t("sharing.liveContentHint")}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="danger" disabled={isWorking} onClick={() => revokeMutation.mutate()}>
                  <Trash2 className="h-4 w-4" />
                  {t("sharing.revoke")}
                </Button>
                <Button variant="solid" onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4" />
                  {t("sharing.open")}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs leading-6 text-slate-600">{t("sharing.inactiveHint")}</p>
              <Button className="w-full" variant="solid" disabled={isWorking} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {t("sharing.create")}
              </Button>
            </div>
          )}
          {error ? <p className="text-xs leading-5 text-rose-600" role="alert">{t("sharing.error")}</p> : null}
        </div>
        {location.pathname !== "/settings" ? (
          <div className="border-t border-slate-200 px-5 py-3 text-center">
            <Link
              to="/settings?tab=sharing"
              className="inline-flex items-center rounded-sm py-2 text-sm font-medium text-emerald-600 underline underline-offset-4 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              {t("sharing.viewAll")}
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
