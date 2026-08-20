import { useEffect, useState } from "react";
import { ArrowUpCircle, Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchLatestRelease, isVersionOutdated, type LatestRelease } from "@/lib/version-check";
import { dismissRelease, getDismissedRelease } from "@/lib/release-notice";
import { UpdateAvailableDescription } from "./UpdateAvailableDescription";

const AUTO_DISMISS_MS = 3_000;

export const ReleaseUpdateNotice = () => {
  const { t } = useTranslation();
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [nativeUpdateState, setNativeUpdateState] = useState<"idle" | "available" | "downloading" | "downloaded" | "error">("idle");
  const desktopBridge = window.edgeeverDesktop;

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal)
      .then((latest) => {
        if (isVersionOutdated(__EDGEEVER_APP_VERSION__, latest.version)) setRelease(latest);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!desktopBridge?.isAvailable) return;
    let active = true;
    const readStatus = async () => {
      try {
        const { state } = await desktopBridge.updateStatus();
        if (active && (state === "available" || state === "downloaded")) setNativeUpdateState(state);
      } catch {
        // The release link remains available when the native updater is unavailable.
      }
    };
    void readStatus();
    const timer = window.setInterval(() => void readStatus(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [desktopBridge]);

  useEffect(() => {
    if (!release || nativeUpdateState !== "idle") return;

    const timer = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [nativeUpdateState, release?.tagName]);

  if ((!release && nativeUpdateState === "idle") || dismissed || (release && getDismissedRelease() === release.tagName)) return null;

  const handleNativeUpdate = async () => {
    if (!desktopBridge?.isAvailable) return;
    try {
      if (nativeUpdateState === "available") {
        setNativeUpdateState("downloading");
        await desktopBridge.downloadUpdate();
      } else if (nativeUpdateState === "downloaded") {
        await desktopBridge.installUpdate();
      }
    } catch {
      setNativeUpdateState("error");
    }
  };

  const isNativeUpdate = nativeUpdateState !== "idle";

  return (
    <aside
      className="fixed right-5 top-5 z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-emerald-200 bg-white/95 p-3 text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden="true">
          <ArrowUpCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{t("systemInfo.updateAvailableTitle")}</div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500">
            {nativeUpdateState === "downloading"
              ? t("systemInfo.desktopUpdateDownloading")
              : nativeUpdateState === "downloaded"
                ? t("systemInfo.desktopUpdateReady")
                : nativeUpdateState === "error"
                  ? t("systemInfo.desktopUpdateFailed")
                  : <UpdateAvailableDescription version={release?.version ?? ""} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {isNativeUpdate && nativeUpdateState !== "downloading" && nativeUpdateState !== "error" && (
              <button className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900" type="button" onClick={() => void handleNativeUpdate()}>
                {nativeUpdateState === "downloaded" ? <RefreshCw className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                {nativeUpdateState === "downloaded" ? t("systemInfo.desktopUpdateRestart") : t("systemInfo.desktopUpdateDownload")}
              </button>
            )}
            {release && <a className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900" href={release.url} target="_blank" rel="noreferrer">
              {t("systemInfo.viewRelease")}
              <ExternalLink className="h-3 w-3" />
            </a>}
          </div>
        </div>
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          type="button"
          aria-label={t("systemInfo.closeUpdateNotice")}
          onClick={() => {
            if (release) dismissRelease(release.tagName);
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
};
