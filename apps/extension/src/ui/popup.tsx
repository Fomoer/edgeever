import { useEffect, useState } from "react";
import { Check, LockKeyhole, MousePointer2, Save, Settings } from "lucide-react";
import { getSettings, type ExtensionSettings } from "../extension";
import { captureCurrentPage, startRegionClip } from "../popup";
import { t } from "../i18n";
import { Button, Status, type Feedback } from "./primitives";

type CaptureMode = { kind?: string; platform?: string; access?: "login-required" | "content-restricted" };
export function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ message: "" });
  useEffect(() => {
    let active = true;
    void getSettings().then(value => { if (active) setSettings(value); }).catch(error => { if (active) setFeedback({ message: error instanceof Error ? error.message : t("saveFailed"), kind: "error" }); });
    void chrome.runtime.sendMessage({ type: "getCurrentPageCaptureMode" }).then((value: CaptureMode | undefined) => { if (active) setMode(value ?? { kind: "unknown" }); }).catch(() => { if (active) setMode({ kind: "unknown" }); });
    return () => { active = false; };
  }, []);
  const access = mode && !["unknown", "unavailable"].includes(mode.kind || "") ? mode.access : undefined;
  const adapted = !!mode?.platform && !["unknown", "unavailable"].includes(mode.kind || "");
  const label = !mode ? t("checkingPageCapture") : mode.kind === "unknown" ? t("pageCaptureUnknown")
    : mode.kind === "unavailable" ? t("pageCaptureUnavailable")
    : access === "login-required" ? t("pageCaptureLoginRequired") : access === "content-restricted" ? t("pageCaptureRestricted")
    : mode.kind === "social-feed" ? t("pageCaptureSelectPost")
    : mode.platform ? t("pageCaptureAdapted", mode.platform) : t("pageCaptureGeneric");
  const hint = access === "login-required" ? t("pageCaptureLoginHint") : access === "content-restricted" ? t("pageCaptureRestrictedHint") : "";
  async function save() {
    if (!settings || busy || mode?.kind === "unavailable") return;
    setBusy(true);
    setFeedback({ message: t("readingAndSaving") });
    try { setFeedback({ message: await captureCurrentPage(settings), kind: "success" }); }
    catch (error) { setFeedback({ message: error instanceof Error ? error.message : t("saveFailed"), kind: "error" }); }
    finally { setBusy(false); }
  }
  async function selectRegion() {
    if (!settings || busy || mode?.kind === "unavailable") return;
    setBusy(true); setFeedback({ message: "" });
    try { await startRegionClip(settings); window.close(); }
    catch (error) { setFeedback({ message: error instanceof Error ? error.message : t("saveFailed"), kind: "error" }); }
    finally { setBusy(false); }
  }
  return <main className="w-80 p-5">
    <header className="flex items-center gap-2.5">
      <img src="/icons/icon-32.png" width={32} height={32} alt="" className="rounded-lg" />
      <div><h1 className="text-lg font-semibold leading-tight">EdgeEver</h1><p className="text-xs text-muted-foreground">{t("webClipper")}</p></div>
      <div id="capture-context" data-kind={access || (adapted ? "adapted" : "generic")} aria-live="polite" aria-label={mode?.platform ? `${mode.platform} · ${label}` : undefined} className="ms-auto flex max-w-28 items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">
        {access ? <LockKeyhole aria-hidden="true" className="size-3 shrink-0 text-amber-600" /> : adapted && <Check aria-hidden="true" className="size-3 shrink-0" />}<span id="capture-mode">{label}</span>
      </div>
    </header>
    <Button id="save" className="mt-6 h-11 w-full gap-2 rounded-lg" disabled={!settings || !mode || busy || mode.kind === "unavailable"} onClick={() => void save()}><Save aria-hidden="true" className="size-4" />{t("saveCurrentPage")}</Button>
    <Button id="select-region" variant="outline" className="mt-2 h-10 w-full gap-2 rounded-lg" disabled={!settings || !mode || busy || mode.kind === "unavailable"} onClick={() => void selectRegion()}><MousePointer2 aria-hidden="true" className="size-4" />{t("regionSelect")}</Button>
    <Status {...feedback} message={feedback.message || hint} busy={busy} />
    <Button id="settings" variant="ghost" className="mt-3 w-full gap-2 text-xs" onClick={() => void chrome.runtime.openOptionsPage()}><Settings aria-hidden="true" className="size-4" />{t("pluginSettings")}</Button>
  </main>;
}
