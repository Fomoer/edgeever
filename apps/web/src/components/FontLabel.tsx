import { useEffect, useRef, useState } from "react";
import { FontLoadIcon } from "./FontLoadFeedback";
import type { FontLoadStatus } from "@/lib/font-load-state";
import { useTranslation } from "react-i18next";
import { FONT_CATALOG, isRemoteNoteImageFont, shouldLoadFontPreview } from "@edgeever/shared/font-catalog";
import { LEGACY_BODY_FONTS } from "@edgeever/shared/font-resources";
import { loadCatalogFont, loadBodyFont, type BodyFontId } from "@edgeever/shared/font-loader";

/** Radix mounts hidden items too; previews only request fonts for visible menu rows. */
export const FontLabel = ({ label, fontId, fontFamily, registrationFamily, enabled, visibleOnly = false, loadFont, status, onStatusChange, retryKey = 0 }: {
  onStatusChange?: (status: FontLoadStatus) => void;
  status?: FontLoadStatus;
  retryKey?: number;
  label: string;
  fontId?: BodyFontId;
  fontFamily?: string;
  registrationFamily?: string;
  enabled: boolean;
  visibleOnly?: boolean;
  loadFont?: (text: string) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<{ key: string; status: FontLoadStatus }>({ key: "", status: "idle" });
  const ref = useRef<HTMLSpanElement>(null);
  const [readyKey, setReadyKey] = useState("");
  const family = fontFamily ?? (fontId ? `"${registrationFamily ?? (isRemoteNoteImageFont(fontId) ? FONT_CATALOG[fontId].family : LEGACY_BODY_FONTS[fontId].family)}", "EdgeEver Offline Sans", sans-serif` : undefined);
  const key = `${fontId ?? ""}:${family ?? ""}:${label}:${retryKey}`;
  const canLoad = enabled && shouldLoadFontPreview(fontId, !visibleOnly);
  useEffect(() => {
    if (!canLoad) return;
    let active = true;
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      setProgress({ key, status: "loading" });
      const pending = fontId ? registrationFamily && isRemoteNoteImageFont(fontId) ? loadCatalogFont(fontId, label, { family: registrationFamily }) : loadBodyFont(fontId, label) : loadFont?.(label) ?? Promise.resolve();
      void pending.then(() => { if (active) { setReadyKey(key); setProgress({ key, status: "ready" }); } }).catch(() => { if (active) setProgress({ key, status: "error" }); });
    };
    let observer: IntersectionObserver | undefined;
    if (visibleOnly && ref.current) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
      });
      observer.observe(ref.current);
    } else load();
    return () => { active = false; observer?.disconnect(); };
  }, [canLoad, visibleOnly, fontId, registrationFamily, label, key, loadFont]);
  const ownStatus = progress.key === key ? progress.status : "idle";
  useEffect(() => { if (canLoad) onStatusChange?.(ownStatus === "idle" ? "loading" : ownStatus); }, [canLoad, onStatusChange, ownStatus]);
  const displayStatus = status === "error" || ownStatus === "error" ? "error"
    : status === "loading" || ownStatus === "loading" ? "loading" : status ?? ownStatus;
  return <span ref={ref} className="inline-flex items-center gap-1.5 text-sm leading-6" aria-busy={displayStatus === "loading"}>
    <span style={readyKey === key ? { fontFamily: family } : undefined}>{label}</span>
    <FontLoadIcon status={displayStatus} />
    {displayStatus === "loading" || displayStatus === "error" ? <span className="sr-only">{t(`fontLoad.${displayStatus}`)}</span> : null}
  </span>;
};
