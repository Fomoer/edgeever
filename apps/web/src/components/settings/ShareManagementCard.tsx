import { useInfiniteQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, LoaderCircle, LockKeyhole, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ManagedMemoShare } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicShareUrl, ShareMemoDialog } from "@/components/dialogs/ShareMemoDialog";
import { api, getConfiguredDesktopApiBaseUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  SETTINGS_CARD_DESCRIPTION_CLASSNAME,
  SETTINGS_CARD_HEADER_CLASSNAME,
  SETTINGS_CARD_ICON_CLASSNAME,
  SETTINGS_CARD_TITLE_CLASSNAME,
} from "./settings-ui";

type Props = {
  userId: string | null;
  onOpenMemo: (memoId: string, notebookId: string) => void;
};

export const ShareManagementCard = ({ userId, onOpenMemo }: Props) => {
  const { t, i18n } = useTranslation();
  const [managedMemoId, setManagedMemoId] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<{ memoId: string; success: boolean } | null>(null);
  const origin = getConfiguredDesktopApiBaseUrl() || window.location.origin;
  const sharesQuery = useInfiniteQuery({
    queryKey: ["memo-shares", origin, userId],
    queryFn: ({ pageParam }) => api.listMemoShares(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
    refetchOnMount: "always",
  });
  const shares = sharesQuery.data?.pages.flatMap((page) => page.shares) ?? [];
  const locale = i18n.resolvedLanguage || i18n.language;
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const copyLink = async (share: ManagedMemoShare) => {
    setCopyResult({ memoId: share.memoId, success: await copyTextToClipboard(getPublicShareUrl(share.token)) });
  };

  return (
    <Card className="w-full min-w-0 overflow-hidden shadow-none">
      <CardHeader className={SETTINGS_CARD_HEADER_CLASSNAME}>
        <CardTitle className={SETTINGS_CARD_TITLE_CLASSNAME}>
          <Link2 className={SETTINGS_CARD_ICON_CLASSNAME} />
          {t("sharing.managementTitle")}
        </CardTitle>
        <CardDescription className={SETTINGS_CARD_DESCRIPTION_CLASSNAME}>
          {t("sharing.managementDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {sharesQuery.isPending || (sharesQuery.isFetching && !sharesQuery.isFetchingNextPage) ? (
          <div className="flex min-h-32 items-center justify-center text-slate-500" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span className="sr-only">{t("sharing.managementLoading")}</span>
          </div>
        ) : sharesQuery.isError ? (
          <div className="space-y-3 border-t border-slate-100 p-4">
            <p className="text-xs leading-5 text-rose-600" role="alert">{t("sharing.managementLoadFailed")}</p>
            <Button size="sm" variant="outline" onClick={() => void sharesQuery.refetch()}>{t("sharing.retry")}</Button>
          </div>
        ) : shares.length === 0 ? (
          <p className="border-t border-slate-100 p-4 text-xs leading-5 text-slate-500">{t("sharing.managementEmpty")}</p>
        ) : (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {shares.map((share) => (
              <div key={share.memoId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-xs font-medium text-slate-900 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    onClick={() => onOpenMemo(share.memoId, share.notebookId)}
                  >
                    {share.memoTitle?.trim() || t("common.untitledMemo")}
                  </button>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{share.notebookName || t("sharing.unknownNotebook")}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t("sharing.sharedOn", { date: formatDate(share.createdAt) })}</span>
                    {share.passwordProtected ? (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <LockKeyhole className="h-3 w-3" />{t("sharing.passwordProtected")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyLink(share)}>
                    <Copy className="h-3.5 w-3.5" />
                    {copyResult?.memoId === share.memoId ? t(copyResult.success ? "sharing.copied" : "sharing.copyFailed") : t("sharing.copy")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(getPublicShareUrl(share.token), "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="h-3.5 w-3.5" />{t("sharing.open")}
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => setManagedMemoId(share.memoId)}>
                    <Settings2 className="h-3.5 w-3.5" />{t("sharing.manage")}
                  </Button>
                </div>
              </div>
            ))}
            {sharesQuery.hasNextPage ? (
              <div className="flex justify-center p-4">
                <Button size="sm" variant="outline" disabled={sharesQuery.isFetchingNextPage} onClick={() => void sharesQuery.fetchNextPage()}>
                  {sharesQuery.isFetchingNextPage ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("sharing.loadMore")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
      {managedMemoId ? (
        <ShareMemoDialog memoId={managedMemoId} open onOpenChange={(open) => { if (!open) setManagedMemoId(null); }} />
      ) : null}
    </Card>
  );
};
